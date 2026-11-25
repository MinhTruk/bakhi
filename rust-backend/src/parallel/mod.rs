// ===========================================================================
// Bá Khí — Rust backend · parallel/mod.rs  (8.8.0)
//
// Parallel Execution Engine: chạy các tác vụ CPU-bound độc lập trên blocking
// pool của Tokio với BA lớp giới hạn tường minh:
//
//   * hàng đợi có hạn (`RUST_TASK_QUEUE_CAPACITY`) — chống nhận việc vô hạn,
//   * worker pool có hạn (`RUST_CPU_WORKERS`, 0 = số CPU khả dụng),
//   * hạn thời gian chờ + hạn thời gian chạy (`RUST_TASK_WAIT_MS`,
//     `RUST_TASK_TIMEOUT_MS`).
//
// Nguyên tắc:
//   * KHÔNG dùng engine này cho I/O-bound (HTTP, Supabase, provider AI): những
//     việc đó đã là async và không được chiếm worker CPU.
//   * Không tạo thread mới: `tokio::task::spawn_blocking` dùng blocking pool
//     của runtime hiện có, còn trần đồng thời do semaphore quyết định.
//   * Hàng đợi đầy ⇒ trả `QueueFull` (route đổi thành 429), không âm thầm bỏ
//     việc và không treo request.
//   * Một tác vụ CPU đã bắt đầu KHÔNG thể bị ngắt giữa chừng (std không có
//     cách huỷ an toàn). Vì vậy permit CPU được giữ tới khi closure thật sự
//     trả về; timeout chỉ ngừng CHỜ và trả lỗi, không giải phóng chỗ sớm để
//     tránh vượt trần worker.
//   * Panic được bắt bằng `catch_unwind` → đếm `failed`, không làm sập tiến
//     trình và không giữ permit.
// ===========================================================================

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::observability::metrics::Metrics;

/// Lỗi của tác vụ song song. Không chứa thông điệp thô của closure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskError {
    /// Hàng đợi đã đầy (hoặc hết thời gian chờ lấy chỗ).
    QueueFull,
    /// Hết `RUST_TASK_TIMEOUT_MS` trước khi tác vụ trả kết quả.
    Timeout,
    /// Closure panic.
    Panic,
}

impl TaskError {
    pub fn code(self) -> &'static str {
        match self {
            Self::QueueFull => "BUSY",
            Self::Timeout => "TASK_TIMEOUT",
            Self::Panic => "TASK_FAILED",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Self::QueueFull => "Máy chủ đang xử lý nhiều việc. Bạn thử lại sau vài giây nhé.",
            Self::Timeout => "Tác vụ xử lý quá lâu. Bạn thử lại với dữ liệu nhỏ hơn nhé.",
            Self::Panic => "Không xử lý được dữ liệu này. Bạn thử lại nhé.",
        }
    }

    pub fn status(self) -> u16 {
        match self {
            Self::QueueFull => 429,
            Self::Timeout => 504,
            Self::Panic => 500,
        }
    }
}

/// Giữ gauge `active` đúng trong suốt vòng đời closure, kể cả khi caller đã
/// hết thời gian chờ và trả lỗi trước.
struct ActiveGuard {
    metrics: Arc<Metrics>,
}

impl ActiveGuard {
    fn new(metrics: Arc<Metrics>) -> Self {
        metrics.record_parallel_active(1);
        Self { metrics }
    }
}

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        self.metrics.record_parallel_active(-1);
    }
}

/// Giữ chỗ trong hàng đợi; nhả khi tác vụ bắt đầu chạy.
struct PendingGuard {
    metrics: Arc<Metrics>,
}

impl PendingGuard {
    fn new(metrics: Arc<Metrics>) -> Self {
        metrics.record_parallel_pending(1);
        Self { metrics }
    }
}

impl Drop for PendingGuard {
    fn drop(&mut self) {
        self.metrics.record_parallel_pending(-1);
    }
}

pub struct ParallelEngine {
    /// Trần số tác vụ đang chạy đồng thời.
    cpu: Arc<Semaphore>,
    /// Trần số tác vụ đang chờ trong hàng đợi.
    queue: Arc<Semaphore>,
    wait: Duration,
    timeout: Duration,
    metrics: Arc<Metrics>,
    workers: usize,
    capacity: usize,
}

impl ParallelEngine {
    pub fn new(
        workers: usize,
        capacity: usize,
        wait: Duration,
        timeout: Duration,
        metrics: Arc<Metrics>,
    ) -> Self {
        let detected = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(2);
        let workers = if workers == 0 { detected } else { workers }.max(1);
        let capacity = capacity.max(1);
        Self {
            cpu: Arc::new(Semaphore::new(workers)),
            queue: Arc::new(Semaphore::new(capacity)),
            wait,
            timeout,
            metrics,
            workers,
            capacity,
        }
    }

    /// Số worker CPU thực tế đang dùng (sau khi áp dụng 0 = tự dò).
    pub fn workers(&self) -> usize {
        self.workers
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Số tác vụ đang chạy (dùng cho test/chẩn đoán).
    pub fn available_workers(&self) -> usize {
        self.cpu.available_permits()
    }

    pub fn available_queue(&self) -> usize {
        self.queue.available_permits()
    }

    /// Chạy một tác vụ CPU-bound có giới hạn tài nguyên và thời gian.
    ///
    /// `f` phải độc lập (không phụ thuộc kết quả của tác vụ khác) và không
    /// giữ lock bắc cầu sang async path.
    pub async fn run_cpu<F, T>(&self, f: F) -> Result<T, TaskError>
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
        self.metrics.record_parallel_task("created");

        // 1) Chỗ trong hàng đợi có hạn — hết hạn là từ chối, không xếp vô hạn.
        let _queue_permit = self.acquire_queue().await?;
        let pending = PendingGuard::new(self.metrics.clone());
        let queued_at = Instant::now();

        // 2) Permit CPU: trần worker thật sự. Chờ có hạn bằng cùng `timeout`.
        let cpu_permit = self.acquire_cpu().await?;
        self.metrics
            .record_parallel_queue_wait(queued_at.elapsed().as_secs_f64());
        drop(pending);
        // Nhả chỗ hàng đợi ngay khi tác vụ bắt đầu chạy.
        drop(_queue_permit);

        let metrics = self.metrics.clone();
        let handle = tokio::task::spawn_blocking(move || {
            let _active = ActiveGuard::new(metrics.clone());
            let _cpu_permit = cpu_permit;
            let started = Instant::now();
            let outcome = catch_unwind(AssertUnwindSafe(f));
            metrics.record_parallel_execution(started.elapsed().as_secs_f64());
            match outcome {
                Ok(value) => {
                    metrics.record_parallel_task("completed");
                    Some(value)
                }
                Err(_) => {
                    metrics.record_parallel_task("failed");
                    None
                }
            }
        });

        match tokio::time::timeout(self.timeout, handle).await {
            Ok(Ok(Some(value))) => Ok(value),
            Ok(Ok(None)) => Err(TaskError::Panic),
            // JoinError không phải panic (ví dụ runtime đang tắt).
            Ok(Err(_)) => {
                self.metrics.record_parallel_task("cancelled");
                Err(TaskError::Panic)
            }
            Err(_) => {
                // Closure vẫn chạy và vẫn giữ permit CPU tới khi xong: trần
                // worker không bị vượt, chỉ có request này nhận lỗi.
                self.metrics.record_parallel_task("timeout");
                Err(TaskError::Timeout)
            }
        }
    }

    async fn acquire_queue(&self) -> Result<OwnedSemaphorePermit, TaskError> {
        match tokio::time::timeout(self.wait, self.queue.clone().acquire_owned()).await {
            Ok(Ok(permit)) => Ok(permit),
            Ok(Err(_)) => Err(TaskError::QueueFull),
            Err(_) => {
                self.metrics.record_parallel_task("rejected");
                Err(TaskError::QueueFull)
            }
        }
    }

    async fn acquire_cpu(&self) -> Result<OwnedSemaphorePermit, TaskError> {
        match tokio::time::timeout(self.timeout, self.cpu.clone().acquire_owned()).await {
            Ok(Ok(permit)) => Ok(permit),
            Ok(Err(_)) => Err(TaskError::QueueFull),
            Err(_) => {
                self.metrics.record_parallel_task("rejected");
                Err(TaskError::QueueFull)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine(workers: usize, capacity: usize) -> ParallelEngine {
        ParallelEngine::new(
            workers,
            capacity,
            Duration::from_millis(50),
            Duration::from_secs(2),
            Arc::new(Metrics::default()),
        )
    }

    #[tokio::test]
    async fn runs_cpu_task_and_returns_value() {
        let engine = engine(2, 4);
        let value = engine.run_cpu(|| 21 * 2).await.unwrap();
        assert_eq!(value, 42);
        assert_eq!(engine.available_workers(), 2);
    }

    #[tokio::test]
    async fn panic_is_reported_without_poisoning_the_pool() {
        let engine = engine(1, 2);
        let error = engine
            .run_cpu(|| -> i32 { panic!("boom") })
            .await
            .unwrap_err();
        assert_eq!(error, TaskError::Panic);
        // Pool vẫn dùng được sau panic.
        assert_eq!(engine.run_cpu(|| 7).await.unwrap(), 7);
    }

    #[tokio::test]
    async fn queue_full_is_rejected_instead_of_queueing_forever() {
        // 1 worker, 1 chỗ chờ; giữ worker bằng tác vụ dài.
        let engine = Arc::new(ParallelEngine::new(
            1,
            1,
            Duration::from_millis(10),
            Duration::from_secs(2),
            Arc::new(Metrics::default()),
        ));
        let busy = {
            let engine = engine.clone();
            tokio::spawn(async move {
                engine
                    .run_cpu(|| std::thread::sleep(Duration::from_millis(300)))
                    .await
            })
        };
        tokio::time::sleep(Duration::from_millis(40)).await;
        // Tác vụ thứ hai chiếm chỗ chờ, tác vụ thứ ba bị từ chối.
        let queued = {
            let engine = engine.clone();
            tokio::spawn(async move { engine.run_cpu(|| 1).await })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;
        let rejected = engine.run_cpu(|| 2).await;
        assert_eq!(rejected.unwrap_err(), TaskError::QueueFull);
        assert!(busy.await.unwrap().is_ok());
        assert_eq!(queued.await.unwrap().unwrap(), 1);
    }

    #[tokio::test]
    async fn timeout_returns_error_but_keeps_worker_bounded() {
        let engine = Arc::new(ParallelEngine::new(
            1,
            2,
            Duration::from_millis(10),
            Duration::from_millis(50),
            Arc::new(Metrics::default()),
        ));
        let error = engine
            .run_cpu(|| std::thread::sleep(Duration::from_millis(200)))
            .await
            .unwrap_err();
        assert_eq!(error, TaskError::Timeout);
        // Worker vẫn bị giữ bởi closure đang chạy — không thể vượt trần.
        assert_eq!(engine.available_workers(), 0);
        tokio::time::sleep(Duration::from_millis(300)).await;
        // Sau khi closure xong, permit được trả lại.
        assert_eq!(engine.available_workers(), 1);
    }

    #[test]
    fn zero_workers_falls_back_to_detected_cpu_count() {
        let engine = engine(0, 2);
        assert!(engine.workers() >= 1);
    }
}

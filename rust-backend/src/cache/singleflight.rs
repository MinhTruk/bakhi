// ===========================================================================
// Bá Khí — Rust backend · cache/singleflight.rs  (8.7.3)
//
// Request coalescing (singleflight): nhiều request đồng thời cần CÙNG một dữ
// liệu thì chỉ MỘT request đi tới nguồn; các request còn lại chờ và nhận chung
// kết quả (hoặc chung lỗi).
//
// An toàn:
//   * Chỉ dùng cho dữ liệu dùng chung, không phụ thuộc người dùng. Khoá do nơi
//     gọi quyết định và KHÔNG chứa token/dữ liệu cá nhân.
//   * Chỉ dedup thao tác ĐỌC. Không dùng cho ghi.
//   * Lỗi được truyền nguyên vẹn tới mọi request đang chờ; entry in-flight bị
//     xoá ngay sau khi xong, nên request sau thất bại có thể thử lại.
//   * Nếu request dẫn đầu bị huỷ (client ngắt kết nối), cờ `completed = false`
//     báo cho các request đang chờ biết để tự truy vấn lại thay vì treo.
//   * Không giữ mutex qua `.await`: chỉ giữ khi tra/đăng ký chuyến bay.
// ===========================================================================

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tokio::sync::broadcast;

use crate::errors::ApiError;

use super::CacheCounters;

type Outcome = Result<Arc<Value>, ApiError>;

struct Flight {
    tx: broadcast::Sender<Outcome>,
}

pub struct SingleFlight {
    enabled: bool,
    counters: Arc<CacheCounters>,
    flights: Arc<Mutex<HashMap<String, Arc<Flight>>>>,
}

impl SingleFlight {
    pub fn new(enabled: bool, counters: Arc<CacheCounters>) -> Self {
        Self {
            enabled,
            counters,
            flights: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn in_flight(&self) -> usize {
        self.flights.lock().map(|map| map.len()).unwrap_or(0)
    }

    /// Chạy `load` hoặc chờ chuyến bay đang chạy cùng `key`.
    pub async fn run<F, Fut>(&self, key: String, load: F) -> Outcome
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Outcome>,
    {
        if !self.enabled {
            self.counters.bypasses.fetch_add(1, Ordering::Relaxed);
            return load().await;
        }

        // Đăng ký/nghe trong CÙNG một lần giữ khoá để không lỡ kết quả.
        let existing = {
            let mut flights = match self.flights.lock() {
                Ok(map) => map,
                Err(poisoned) => poisoned.into_inner(),
            };
            if let Some(flight) = flights.get(&key) {
                Some(flight.tx.subscribe())
            } else {
                let (tx, _rx) = broadcast::channel(4);
                flights.insert(key.clone(), Arc::new(Flight { tx: tx.clone() }));
                None
            }
        };

        if let Some(mut receiver) = existing {
            self.counters.dedup_joined.fetch_add(1, Ordering::Relaxed);
            return match receiver.recv().await {
                Ok(outcome) => outcome,
                // Kênh đóng mà chưa có kết quả: chuyến bay bị huỷ.
                Err(_) => {
                    self.counters.dedup_errors.fetch_add(1, Ordering::Relaxed);
                    Err(ApiError::service_unavailable(
                        "CACHE_FLIGHT_CANCELLED",
                        "Yêu cầu trước bị huỷ. Bạn thử lại nhé.",
                    ))
                }
            };
        }

        self.counters.dedup_leader.fetch_add(1, Ordering::Relaxed);
        let flight = {
            let guard = match self.flights.lock() {
                Ok(map) => map,
                Err(poisoned) => poisoned.into_inner(),
            };
            guard.get(&key).cloned()
        };
        let Some(flight) = flight else {
            // Bị xoá ngay sau khi đăng ký (không xảy ra trong luồng bình thường).
            return load().await;
        };

        let mut guard = FlightGuard {
            flights: self.flights.clone(),
            counters: self.counters.clone(),
            key,
            flight: flight.clone(),
            completed: false,
        };

        let outcome = load().await;
        let _ = flight.tx.send(outcome.clone());
        guard.completed = true;
        drop(guard);
        outcome
    }
}

struct FlightGuard {
    flights: Arc<Mutex<HashMap<String, Arc<Flight>>>>,
    counters: Arc<CacheCounters>,
    key: String,
    flight: Arc<Flight>,
    completed: bool,
}

impl Drop for FlightGuard {
    fn drop(&mut self) {
        {
            let mut flights = match self.flights.lock() {
                Ok(map) => map,
                Err(poisoned) => poisoned.into_inner(),
            };
            // Chỉ xoá chuyến bay của chính mình, không xoá chuyến mới hơn.
            let mine = flights
                .get(&self.key)
                .map(|flight| Arc::ptr_eq(flight, &self.flight))
                .unwrap_or(false);
            if mine {
                flights.remove(&self.key);
            }
        }
        if !self.completed {
            self.counters.dedup_errors.fetch_add(1, Ordering::Relaxed);
            let _ = self.flight.tx.send(Err(ApiError::service_unavailable(
                "CACHE_FLIGHT_CANCELLED",
                "Yêu cầu trước bị huỷ. Bạn thử lại nhé.",
            )));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;
    use std::time::Duration;

    fn flight() -> SingleFlight {
        SingleFlight::new(true, Arc::new(CacheCounters::default()))
    }

    #[tokio::test]
    async fn concurrent_callers_share_one_source_request() {
        let flight = flight();
        let calls = Arc::new(AtomicU32::new(0));

        let first = {
            let calls = calls.clone();
            flight.run("ai:config".to_string(), move || async move {
                calls.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(50)).await;
                Ok(Arc::new(serde_json::json!({ "model": "x" })))
            })
        };
        let second = {
            let calls = calls.clone();
            flight.run("ai:config".to_string(), move || async move {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(Arc::new(serde_json::json!({ "model": "y" })))
            })
        };

        let (a, b) = tokio::join!(first, second);
        assert_eq!(calls.load(Ordering::SeqCst), 1, "chỉ một request nguồn");
        assert_eq!(a.unwrap()["model"], "x");
        assert_eq!(b.unwrap()["model"], "x");
        assert_eq!(flight.in_flight(), 0, "in-flight phải được dọn");
    }

    #[tokio::test]
    async fn different_keys_are_not_merged() {
        let flight = flight();
        let one = flight.run("ai:a".to_string(), || async {
            Ok(Arc::new(serde_json::json!(1)))
        });
        let two = flight.run("ai:b".to_string(), || async {
            Ok(Arc::new(serde_json::json!(2)))
        });
        let (a, b) = tokio::join!(one, two);
        assert_eq!(*a.unwrap(), serde_json::json!(1));
        assert_eq!(*b.unwrap(), serde_json::json!(2));
    }

    #[tokio::test]
    async fn failure_is_shared_and_retry_runs_again() {
        let flight = flight();
        let error = flight
            .run("ai:config".to_string(), || async {
                Err(ApiError::service_unavailable("UPSTREAM", "lỗi nguồn"))
            })
            .await;
        assert!(error.is_err());

        // Sau thất bại, chuyến bay đã được xoá ⇒ lần sau thực sự chạy lại.
        let ok = flight
            .run("ai:config".to_string(), || async {
                Ok(Arc::new(serde_json::json!("recovered")))
            })
            .await;
        assert_eq!(ok.unwrap().as_str(), Some("recovered"));
        assert_eq!(flight.in_flight(), 0);
    }

    #[tokio::test]
    async fn disabled_dedup_bypasses() {
        let flight = SingleFlight::new(false, Arc::new(CacheCounters::default()));
        let calls = Arc::new(AtomicU32::new(0));
        let run = |calls: Arc<AtomicU32>| {
            flight.run("ai:config".to_string(), move || async move {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(Arc::new(serde_json::json!(1)))
            })
        };
        let (a, b) = tokio::join!(run(calls.clone()), run(calls.clone()));
        assert!(a.is_ok() && b.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}

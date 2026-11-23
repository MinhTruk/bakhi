// ===========================================================================
// Bá Khí — Rust backend · observability/metrics.rs
//
// Bộ đếm nội bộ (không phụ thuộc Prometheus client). Xuất định dạng văn bản
// Prometheus ở `GET /api/v1/metrics`. Không có nhãn nào chứa dữ liệu người dùng.
// ===========================================================================

use std::sync::atomic::{AtomicU64, Ordering};

use crate::providers::circuit::CircuitState;
use crate::providers::Provider;

#[derive(Default)]
pub struct Metrics {
    pub total_requests: AtomicU64,
    pub successful_requests: AtomicU64,
    pub failed_requests: AtomicU64,
    pub active_requests: AtomicU64,
    pub ai_requests: AtomicU64,
    pub ai_success: AtomicU64,
    pub ai_failed: AtomicU64,
    pub ai_fallbacks: AtomicU64,
    pub ai_retries: AtomicU64,
    pub provider_latency_sum_ms: AtomicU64,
    pub provider_latency_count: AtomicU64,
    pub ai_latency_sum_ms: AtomicU64,
    pub ai_latency_count: AtomicU64,
}

#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub active_requests: u64,
    pub ai_requests: u64,
    pub ai_success: u64,
    pub ai_failed: u64,
    pub ai_fallbacks: u64,
    pub ai_retries: u64,
    pub provider_latency_ms_avg: f64,
    pub ai_latency_ms_avg: f64,
}

impl Metrics {
    pub fn enter(&self) {
        self.active_requests.fetch_add(1, Ordering::Relaxed);
        self.total_requests.fetch_add(1, Ordering::Relaxed);
    }

    /// Ghi nhận kết quả cuối của một request (theo mã HTTP).
    pub fn leave(&self, status: u16) {
        self.active_requests.fetch_sub(1, Ordering::Relaxed);
        if (200..=399).contains(&status) {
            self.successful_requests.fetch_add(1, Ordering::Relaxed);
        } else {
            self.failed_requests.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn record_ai(&self, ok: bool, latency_ms: u64, fell_back: bool) {
        self.ai_requests.fetch_add(1, Ordering::Relaxed);
        if ok {
            self.ai_success.fetch_add(1, Ordering::Relaxed);
        } else {
            self.ai_failed.fetch_add(1, Ordering::Relaxed);
        }
        if fell_back {
            self.ai_fallbacks.fetch_add(1, Ordering::Relaxed);
        }
        self.ai_latency_sum_ms
            .fetch_add(latency_ms, Ordering::Relaxed);
        self.ai_latency_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_retry(&self) {
        self.ai_retries.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_provider_attempt(&self, latency_ms: u64) {
        self.provider_latency_sum_ms
            .fetch_add(latency_ms, Ordering::Relaxed);
        self.provider_latency_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> Snapshot {
        let provider_count = self.provider_latency_count.load(Ordering::Relaxed);
        let ai_count = self.ai_latency_count.load(Ordering::Relaxed);
        Snapshot {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            successful_requests: self.successful_requests.load(Ordering::Relaxed),
            failed_requests: self.failed_requests.load(Ordering::Relaxed),
            active_requests: self.active_requests.load(Ordering::Relaxed),
            ai_requests: self.ai_requests.load(Ordering::Relaxed),
            ai_success: self.ai_success.load(Ordering::Relaxed),
            ai_failed: self.ai_failed.load(Ordering::Relaxed),
            ai_fallbacks: self.ai_fallbacks.load(Ordering::Relaxed),
            ai_retries: self.ai_retries.load(Ordering::Relaxed),
            provider_latency_ms_avg: if provider_count == 0 {
                0.0
            } else {
                self.provider_latency_sum_ms.load(Ordering::Relaxed) as f64 / provider_count as f64
            },
            ai_latency_ms_avg: if ai_count == 0 {
                0.0
            } else {
                self.ai_latency_sum_ms.load(Ordering::Relaxed) as f64 / ai_count as f64
            },
        }
    }

    /// Định dạng Prometheus text exposition (không cần thư viện ngoài).
    pub fn prometheus(&self, circuits: &[(Provider, CircuitState, u32)]) -> String {
        let s = self.snapshot();
        let mut out = String::new();
        let mut counter = |name: &str, help: &str, value: u64| {
            out.push_str(&format!(
                "# HELP {name} {help}\n# TYPE {name} counter\n{name} {value}\n"
            ));
        };
        counter(
            "bakhi_requests_total",
            "Tổng số request API đã nhận.",
            s.total_requests,
        );
        counter(
            "bakhi_requests_success_total",
            "Số request trả mã 2xx/3xx.",
            s.successful_requests,
        );
        counter(
            "bakhi_requests_failed_total",
            "Số request trả mã 4xx/5xx.",
            s.failed_requests,
        );
        counter("bakhi_ai_requests_total", "Số lượt chat AI.", s.ai_requests);
        counter(
            "bakhi_ai_success_total",
            "Số lượt chat AI thành công.",
            s.ai_success,
        );
        counter(
            "bakhi_ai_failed_total",
            "Số lượt chat AI thất bại.",
            s.ai_failed,
        );
        counter(
            "bakhi_ai_fallbacks_total",
            "Số lượt chat phải dùng provider dự phòng.",
            s.ai_fallbacks,
        );
        counter(
            "bakhi_ai_retries_total",
            "Số lần thử lại provider.",
            s.ai_retries,
        );
        out.push_str(&format!(
            "# HELP bakhi_active_requests Số request đang xử lý.\n# TYPE bakhi_active_requests gauge\nbakhi_active_requests {}\n",
            s.active_requests
        ));
        out.push_str(&format!(
            "# HELP bakhi_ai_latency_ms_avg Thời gian trung bình một lượt chat (ms).\n# TYPE bakhi_ai_latency_ms_avg gauge\nbakhi_ai_latency_ms_avg {:.2}\n",
            s.ai_latency_ms_avg
        ));
        out.push_str(&format!(
            "# HELP bakhi_provider_latency_ms_avg Thời gian trung bình một attempt provider (ms).\n# TYPE bakhi_provider_latency_ms_avg gauge\nbakhi_provider_latency_ms_avg {:.2}\n",
            s.provider_latency_ms_avg
        ));
        out.push_str(
            "# HELP bakhi_circuit_state Trạng thái circuit breaker (0=closed, 1=half_open, 2=open).\n# TYPE bakhi_circuit_state gauge\n",
        );
        for (provider, state, _failures) in circuits {
            let value = match state {
                CircuitState::Closed => 0,
                CircuitState::HalfOpen => 1,
                CircuitState::Open => 2,
            };
            out.push_str(&format!(
                "bakhi_circuit_state{{provider=\"{}\"}} {}\n",
                provider.as_str(),
                value
            ));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_requests_and_ai_outcomes() {
        let metrics = Metrics::default();
        metrics.enter();
        metrics.leave(200);
        metrics.enter();
        metrics.leave(502);
        metrics.record_ai(true, 40, false);
        metrics.record_ai(false, 60, true);
        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.total_requests, 2);
        assert_eq!(snapshot.successful_requests, 1);
        assert_eq!(snapshot.failed_requests, 1);
        assert_eq!(snapshot.active_requests, 0);
        assert_eq!(snapshot.ai_success, 1);
        assert_eq!(snapshot.ai_failed, 1);
        assert_eq!(snapshot.ai_fallbacks, 1);
        assert!((snapshot.ai_latency_ms_avg - 50.0).abs() < f64::EPSILON);
    }

    #[test]
    fn prometheus_output_has_no_user_data_and_valid_lines() {
        let metrics = Metrics::default();
        metrics.enter();
        metrics.leave(200);
        let text = metrics.prometheus(&[]);
        assert!(text.contains("bakhi_requests_total 1"));
        assert!(text.contains("# TYPE bakhi_active_requests gauge"));
        assert!(!text.contains("Authorization"));
        for line in text.lines().filter(|l| !l.starts_with('#')) {
            assert_eq!(line.split_whitespace().count(), 2, "dòng lỗi: {line}");
        }
    }
}

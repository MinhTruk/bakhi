// ===========================================================================
// Bá Khí — Rust backend · providers/circuit.rs
//
// Circuit breaker theo TỪNG provider (không theo người dùng):
//
//   CLOSED    → gọi bình thường. Đủ số lỗi liên tiếp ⇒ OPEN.
//   OPEN      → bỏ qua provider tới khi hết cooldown ⇒ HALF_OPEN.
//   HALF_OPEN → chỉ cho tối đa `half_open_limit` request thử; thành công ⇒ CLOSED,
//               thất bại ⇒ OPEN lại.
//
// Bộ nhớ có giới hạn tự nhiên: khoá là enum `Provider` (8 giá trị), không có
// trạng thái riêng cho từng người dùng. Provider bị OPEN không ảnh hưởng provider
// khác và không thay đổi thứ tự Primary → Fallback đã cấu hình.
// ===========================================================================

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::Provider;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

impl CircuitState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Closed => "closed",
            Self::Open => "open",
            Self::HalfOpen => "half_open",
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Entry {
    failures: u32,
    opened_at: Option<Instant>,
    half_open: bool,
    half_open_in_flight: u32,
}

pub struct CircuitBreaker {
    threshold: u32,
    cooldown: Duration,
    half_open_limit: u32,
    entries: Mutex<HashMap<Provider, Entry>>,
}

impl CircuitBreaker {
    pub fn new(threshold: u32, cooldown: Duration, half_open_limit: u32) -> Self {
        Self {
            threshold: threshold.max(1),
            cooldown,
            half_open_limit: half_open_limit.max(1),
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Trạng thái hiện tại, đã tính cả việc cooldown đã hết (OPEN → HALF_OPEN).
    pub fn state(&self, provider: Provider) -> CircuitState {
        let mut entries = match self.entries.lock() {
            Ok(guard) => guard,
            // Mutex poisoned: coi như CLOSED để dịch vụ tiếp tục phục vụ.
            Err(_) => return CircuitState::Closed,
        };
        let entry = entries.entry(provider).or_default();
        if let Some(opened_at) = entry.opened_at {
            if opened_at.elapsed() >= self.cooldown {
                // Hết cooldown: chuyển HALF_OPEN, xoá bộ đếm cũ để lần thử mới
                // bắt đầu từ trạng thái sạch.
                entry.opened_at = None;
                entry.half_open = true;
                entry.failures = 0;
                entry.half_open_in_flight = 0;
                return CircuitState::HalfOpen;
            }
            return CircuitState::Open;
        }
        if entry.half_open {
            return CircuitState::HalfOpen;
        }
        if entry.failures >= self.threshold {
            // Phòng thủ: ngưỡng đã đạt nhưng chưa đánh dấu OPEN.
            entry.opened_at = Some(Instant::now());
            return CircuitState::Open;
        }
        CircuitState::Closed
    }

    /// Xin phép gọi provider. `false` ⇒ phải bỏ qua provider này.
    pub fn allow(&self, provider: Provider) -> bool {
        match self.state(provider) {
            CircuitState::Closed => true,
            CircuitState::Open => false,
            CircuitState::HalfOpen => {
                let mut entries = match self.entries.lock() {
                    Ok(guard) => guard,
                    Err(_) => return true,
                };
                let entry = entries.entry(provider).or_default();
                if entry.half_open_in_flight >= self.half_open_limit {
                    return false;
                }
                entry.half_open_in_flight += 1;
                true
            }
        }
    }

    pub fn record_success(&self, provider: Provider) {
        if let Ok(mut entries) = self.entries.lock() {
            let entry = entries.entry(provider).or_default();
            entry.failures = 0;
            entry.opened_at = None;
            entry.half_open = false;
            entry.half_open_in_flight = entry.half_open_in_flight.saturating_sub(1);
        }
    }

    pub fn record_failure(&self, provider: Provider) {
        if let Ok(mut entries) = self.entries.lock() {
            let entry = entries.entry(provider).or_default();
            entry.half_open_in_flight = entry.half_open_in_flight.saturating_sub(1);
            if entry.half_open {
                // Thử ở HALF_OPEN mà vẫn lỗi ⇒ mở lại ngay, không cần đủ ngưỡng.
                entry.half_open = false;
                entry.failures = self.threshold;
                entry.opened_at = Some(Instant::now());
                return;
            }
            entry.failures = entry.failures.saturating_add(1);
            if entry.failures >= self.threshold {
                entry.opened_at = Some(Instant::now());
            }
        }
    }

    /// Ảnh chụp trạng thái cho metrics/kiểm thử (không chứa dữ liệu người dùng).
    pub fn snapshot(&self) -> Vec<(Provider, CircuitState, u32)> {
        let providers = [
            Provider::Groq,
            Provider::Google,
            Provider::OpenAi,
            Provider::Cerebras,
            Provider::OpenRouter,
            Provider::Mistral,
            Provider::DeepSeek,
            Provider::Custom,
        ];
        providers
            .iter()
            .map(|provider| {
                let failures = self
                    .entries
                    .lock()
                    .ok()
                    .and_then(|entries| entries.get(provider).map(|e| e.failures))
                    .unwrap_or(0);
                (*provider, self.state(*provider), failures)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn breaker() -> CircuitBreaker {
        CircuitBreaker::new(2, Duration::from_millis(60), 1)
    }

    #[test]
    fn opens_after_threshold_and_cools_down_to_half_open() {
        let breaker = breaker();
        assert!(breaker.allow(Provider::Groq));
        breaker.record_failure(Provider::Groq);
        assert_eq!(breaker.state(Provider::Groq), CircuitState::Closed);
        assert!(breaker.allow(Provider::Groq));
        breaker.record_failure(Provider::Groq);
        assert_eq!(breaker.state(Provider::Groq), CircuitState::Open);
        assert!(!breaker.allow(Provider::Groq));

        std::thread::sleep(Duration::from_millis(80));
        assert_eq!(breaker.state(Provider::Groq), CircuitState::HalfOpen);
        assert!(breaker.allow(Provider::Groq));
    }

    #[test]
    fn half_open_allows_limited_probes_and_closes_on_success() {
        let breaker = breaker();
        breaker.record_failure(Provider::Google);
        breaker.record_failure(Provider::Google);
        assert!(!breaker.allow(Provider::Google));
        std::thread::sleep(Duration::from_millis(80));

        assert!(breaker.allow(Provider::Google));
        // Chỉ một request thử được phép ở HALF_OPEN.
        assert!(!breaker.allow(Provider::Google));
        breaker.record_success(Provider::Google);
        assert_eq!(breaker.state(Provider::Google), CircuitState::Closed);
        assert!(breaker.allow(Provider::Google));
    }

    #[test]
    fn failure_in_half_open_reopens_circuit() {
        let breaker = breaker();
        breaker.record_failure(Provider::Mistral);
        breaker.record_failure(Provider::Mistral);
        std::thread::sleep(Duration::from_millis(80));
        assert!(breaker.allow(Provider::Mistral));
        breaker.record_failure(Provider::Mistral);
        assert_eq!(breaker.state(Provider::Mistral), CircuitState::Open);
        assert!(!breaker.allow(Provider::Mistral));
    }

    #[test]
    fn one_provider_open_does_not_affect_another() {
        let breaker = breaker();
        breaker.record_failure(Provider::Groq);
        breaker.record_failure(Provider::Groq);
        assert_eq!(breaker.state(Provider::Groq), CircuitState::Open);
        assert_eq!(breaker.state(Provider::Google), CircuitState::Closed);
        assert!(breaker.allow(Provider::Google));
    }

    #[test]
    fn snapshot_covers_every_provider() {
        let breaker = breaker();
        assert_eq!(breaker.snapshot().len(), 8);
    }
}

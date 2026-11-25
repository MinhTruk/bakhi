// ===========================================================================
// Bá Khí — Rust backend · services/retry.rs  (8.7.4)
//
// Backoff luỹ thừa có jitter cho Controlled Retry Engine.
//
//   * `attempt` 0 (lần thử lại đầu) nghỉ trong [base/2, base].
//   * Mỗi lần sau gấp đôi, luôn ≤ `max`.
//   * Jitter "full" (nửa khoảng) để nhiều người dùng không thử lại đồng loạt
//     sau khi provider vừa hồi phục — tránh dồn tải và tránh đốt chi phí AI.
//
// Không thêm crate: nguồn ngẫu nhiên là xorshift lấy hạt giống từ đồng hồ hệ
// thống, chỉ dùng cho jitter (không phải mật mã).
// ===========================================================================

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Bộ sinh jitter nhẹ, thread-safe. Một instance cho mỗi tiến trình.
#[derive(Debug, Default)]
pub struct Jitter {
    state: AtomicU64,
}

impl Jitter {
    pub fn new() -> Self {
        Self {
            state: AtomicU64::new(seed()),
        }
    }

    /// Số nguyên 64-bit kế tiếp (xorshift64*).
    pub fn next(&self) -> u64 {
        let mut current = self.state.load(Ordering::Relaxed);
        if current == 0 {
            current = seed();
        }
        // xorshift64*
        current ^= current >> 12;
        current ^= current << 25;
        current ^= current >> 27;
        self.state.store(current, Ordering::Relaxed);
        current.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
}

fn seed() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E37_79B9_7F4A_7C15);
    // Không bao giờ để trạng thái 0 (xorshift kẹt ở 0).
    nanos | 1
}

/// Trần luỹ thừa: 2^10 đủ lớn cho mọi cấu hình (base nhỏ nhất 1 ms ⇒ 1,024 s).
const MAX_EXPONENT: u32 = 10;

/// Thời gian chờ trước lần thử lại thứ `attempt` (0-based), có jitter.
pub fn backoff_with_jitter(base: Duration, max: Duration, attempt: u8, entropy: u64) -> Duration {
    let max = max.max(base);
    let exponent = u32::from(attempt).min(MAX_EXPONENT);
    let raw = base.saturating_mul(1u32 << exponent);
    let capped = raw.min(max);
    let capped_ms = capped.as_millis() as u64;
    // Full jitter một nửa: [capped/2, capped].
    let floor = capped_ms / 2;
    let span = capped_ms.saturating_sub(floor);
    let offset = if span == 0 { 0 } else { entropy % (span + 1) };
    Duration::from_millis(floor + offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_and_stays_within_half_to_full() {
        let base = Duration::from_millis(500);
        let max = Duration::from_secs(8);
        for attempt in 0..5u8 {
            for entropy in [0u64, 1, 7, 999, u64::MAX] {
                let wait = backoff_with_jitter(base, max, attempt, entropy);
                let expected = (base.as_millis() as u64) << attempt;
                assert!(wait.as_millis() as u64 <= max.as_millis() as u64);
                assert!(wait.as_millis() as u64 >= expected / 2);
                assert!(wait.as_millis() as u64 <= expected);
            }
        }
    }

    #[test]
    fn backoff_never_exceeds_configured_max() {
        let wait = backoff_with_jitter(Duration::from_secs(1), Duration::from_secs(3), 9, u64::MAX);
        assert!(wait <= Duration::from_secs(3));
    }

    #[test]
    fn jitter_sequence_is_not_constant() {
        let jitter = Jitter::new();
        let first = jitter.next();
        let second = jitter.next();
        assert_ne!(first, second);
    }
}

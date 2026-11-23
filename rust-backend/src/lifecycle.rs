// ===========================================================================
// Bá Khí — Rust backend · lifecycle.rs
//
// Vòng đời tiến trình tối giản, không phụ thuộc thư viện ngoài:
//   * `shutting_down` bật NGAY khi nhận SIGTERM/SIGINT → `/ready` trả 503 để
//     load balancer ngừng gửi request mới.
//   * `active` đếm request đang xử lý để log lúc dừng và để kiểm thử.
// ===========================================================================

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Instant;

pub struct Lifecycle {
    started: Instant,
    shutting_down: AtomicBool,
    active: AtomicUsize,
}

impl Lifecycle {
    pub fn new() -> Self {
        Self {
            started: Instant::now(),
            shutting_down: AtomicBool::new(false),
            active: AtomicUsize::new(0),
        }
    }

    pub fn begin_shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }

    pub fn enter(&self) {
        self.active.fetch_add(1, Ordering::Relaxed);
    }

    pub fn leave(&self) {
        self.active.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn active(&self) -> usize {
        self.active.load(Ordering::Relaxed)
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started.elapsed().as_secs()
    }
}

impl Default for Lifecycle {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shutdown_flag_is_independent_from_active_requests() {
        let lifecycle = Lifecycle::new();
        lifecycle.enter();
        lifecycle.enter();
        assert_eq!(lifecycle.active(), 2);
        assert!(!lifecycle.is_shutting_down());
        lifecycle.begin_shutdown();
        assert!(lifecycle.is_shutting_down());
        lifecycle.leave();
        lifecycle.leave();
        assert_eq!(lifecycle.active(), 0);
        assert!(lifecycle.is_shutting_down());
    }
}

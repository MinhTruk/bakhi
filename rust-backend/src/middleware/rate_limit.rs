// ===========================================================================
// Bá Khí — Rust backend · middleware/rate_limit.rs
//
// Giới hạn tần suất theo cửa sổ cố định (fixed window). Không phụ thuộc dịch vụ
// ngoài, đủ cho quy mô hiện tại của Bá Khí và không cần Redis.
//
// Lưu ý kiến trúc: trạng thái nằm trong bộ nhớ tiến trình. Khi chạy nhiều
// instance, mỗi instance giới hạn riêng — chấp nhận được cho mục tiêu chống
// lạm dụng cơ bản; hạn mức theo người dùng thật vẫn nằm trong database
// (ai_settings.daily_requests / daily_tokens).
// ===========================================================================

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;

use crate::errors::ApiError;
use crate::middleware::request_id::RequestId;
use crate::AppState;

const MAX_TRACKED_KEYS: usize = 10_000;

struct Window {
    started: Instant,
    count: u32,
}

pub struct RateLimiter {
    window: Duration,
    entries: Mutex<HashMap<String, Window>>,
}

impl RateLimiter {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Trả `true` khi request được phép. Tự dọn cửa sổ hết hạn.
    pub fn check(&self, key: &str, limit: u32) -> bool {
        if limit == 0 {
            return true;
        }
        let now = Instant::now();
        let mut entries = match self.entries.lock() {
            Ok(guard) => guard,
            // Poisoned mutex: từ chối thay vì panic để service tiếp tục sống.
            Err(_) => return false,
        };

        if entries.len() > MAX_TRACKED_KEYS {
            let window = self.window;
            entries.retain(|_, entry| now.duration_since(entry.started) < window);
        }

        let entry = entries.entry(key.to_string()).or_insert(Window {
            started: now,
            count: 0,
        });
        if now.duration_since(entry.started) >= self.window {
            entry.started = now;
            entry.count = 0;
        }
        entry.count += 1;
        entry.count <= limit
    }

    pub fn hits(&self, key: &str) -> u32 {
        match self.entries.lock() {
            Ok(entries) => entries.get(key).map(|e| e.count).unwrap_or(0),
            Err(_) => 0,
        }
    }
}

/// Địa chỉ dùng làm khoá giới hạn tần suất.
///
/// Chỉ tin `X-Forwarded-For` khi `TRUST_PROXY` bật (sau proxy/reverse proxy có
/// kiểm soát). Nếu không, dùng địa chỉ kết nối thật.
pub fn client_key(
    trust_proxy: bool,
    forwarded_for: Option<&str>,
    peer: Option<SocketAddr>,
) -> String {
    if trust_proxy {
        if let Some(raw) = forwarded_for {
            if let Some(first) = raw.split(',').next() {
                let candidate = first.trim();
                if !candidate.is_empty() && candidate.len() <= 45 {
                    return candidate.to_string();
                }
            }
        }
    }
    match peer {
        Some(addr) => addr.ip().to_string(),
        None => "unknown".to_string(),
    }
}

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let forwarded = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);

    let key = client_key(state.settings.trust_proxy, forwarded.as_deref(), peer);
    if !state.limiter.check(&key, state.settings.rate_limit_per_min) {
        let request_id = request
            .extensions()
            .get::<RequestId>()
            .map(|id| id.0.clone())
            .unwrap_or_else(|| "-".to_string());
        tracing::warn!(target: "bakhi::ratelimit", key = %key, "vượt giới hạn tần suất theo IP");
        let mut response =
            ApiError::rate_limited("Bạn đang gửi quá nhiều yêu cầu. Chờ một phút rồi thử lại nhé.")
                .into_response_with(&request_id);
        *response.status_mut() = StatusCode::TOO_MANY_REQUESTS;
        return response;
    }

    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_limit_then_blocks() {
        let limiter = RateLimiter::new(Duration::from_secs(60));
        assert!(limiter.check("a", 2));
        assert!(limiter.check("a", 2));
        assert!(!limiter.check("a", 2));
        assert!(limiter.check("b", 2));
    }

    #[test]
    fn zero_limit_means_unlimited() {
        let limiter = RateLimiter::new(Duration::from_secs(60));
        assert!(limiter.check("a", 0));
    }

    #[test]
    fn forwarded_for_only_used_when_trusted() {
        let peer: SocketAddr = "203.0.113.9:5555".parse().unwrap();
        assert_eq!(
            client_key(false, Some("1.2.3.4"), Some(peer)),
            "203.0.113.9"
        );
        assert_eq!(
            client_key(true, Some("1.2.3.4, 10.0.0.1"), Some(peer)),
            "1.2.3.4"
        );
        assert_eq!(client_key(true, None, Some(peer)), "203.0.113.9");
    }
}

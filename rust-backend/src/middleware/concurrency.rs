// ===========================================================================
// Bá Khí — Rust backend · middleware/concurrency.rs
//
// Giới hạn request đồng thời ở ba lớp:
//   * toàn dịch vụ (middleware, `MAX_CONCURRENCY`),
//   * lượt gọi AI (`AI_MAX_CONCURRENCY`),
//   * mỗi người dùng (`AI_USER_MAX_CONCURRENCY`, mặc định 1 — giống khoá
//     `inFlight` của Edge Function nên hai tab không gọi AI chồng nhau).
//
// Mọi lần chờ đều có hạn (`CONCURRENCY_WAIT_MS`); hết hạn trả 429 `BUSY`,
// không bao giờ chờ vô hạn. Bộ đếm theo người dùng được dọn khi về 0 và có
// trần kích thước để không phình bộ nhớ.
// ===========================================================================

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::errors::ApiError;
use crate::middleware::request_id::RequestId;
use crate::AppState;

const MAX_TRACKED_USERS: usize = 10_000;

pub struct Concurrency {
    global: Arc<Semaphore>,
    ai: Arc<Semaphore>,
    wait: Duration,
    max_per_user: usize,
    users: Arc<Mutex<HashMap<String, usize>>>,
}

/// Permit cho một lượt gọi AI: giữ cả semaphore AI và bộ đếm theo người dùng.
pub struct AiPermit {
    _global_ai: OwnedSemaphorePermit,
    user: String,
    users: Arc<Mutex<HashMap<String, usize>>>,
}

impl Drop for AiPermit {
    fn drop(&mut self) {
        if let Ok(mut users) = self.users.lock() {
            if let Some(count) = users.get_mut(&self.user) {
                *count = count.saturating_sub(1);
                if *count == 0 {
                    users.remove(&self.user);
                }
            }
        }
    }
}

impl Concurrency {
    pub fn new(max_global: usize, max_ai: usize, max_per_user: usize, wait: Duration) -> Self {
        Self {
            global: Arc::new(Semaphore::new(max_global.max(1))),
            ai: Arc::new(Semaphore::new(max_ai.max(1))),
            wait,
            max_per_user: max_per_user.max(1),
            users: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Lấy permit toàn dịch vụ; `None` khi hết thời gian chờ.
    pub async fn acquire_global(&self) -> Option<OwnedSemaphorePermit> {
        match tokio::time::timeout(self.wait, self.global.clone().acquire_owned()).await {
            Ok(Ok(permit)) => Some(permit),
            _ => None,
        }
    }

    /// Lấy permit cho lượt gọi AI của một người dùng.
    pub async fn acquire_ai(&self, user_id: &str) -> Option<AiPermit> {
        // Giới hạn theo người dùng kiểm tra trước: nếu đã chạm trần, không cần
        // chờ semaphore AI toàn cục.
        {
            let mut users = self.users.lock().ok()?;
            let entry = users.entry(user_id.to_string()).or_insert(0);
            if *entry >= self.max_per_user {
                return None;
            }
            *entry += 1;
            if users.len() > MAX_TRACKED_USERS {
                users.retain(|_, count| *count > 0);
            }
        }

        match tokio::time::timeout(self.wait, self.ai.clone().acquire_owned()).await {
            Ok(Ok(permit)) => Some(AiPermit {
                _global_ai: permit,
                user: user_id.to_string(),
                users: self.users.clone(),
            }),
            _ => {
                // Nhả chỗ đã đếm nếu không lấy được semaphore.
                if let Ok(mut users) = self.users.lock() {
                    if let Some(count) = users.get_mut(user_id) {
                        *count = count.saturating_sub(1);
                    }
                }
                None
            }
        }
    }

    /// Số lượt AI đang chạy của một người dùng (dùng cho kiểm thử).
    pub fn user_active(&self, user_id: &str) -> usize {
        self.users
            .lock()
            .ok()
            .and_then(|users| users.get(user_id).copied())
            .unwrap_or(0)
    }
}

pub async fn concurrency_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    // Đếm cả request bị từ chối vì quá tải: metrics phải phản ánh sự thật.
    state.metrics.enter();

    // Probe sức khoẻ KHÔNG được xếp hàng sau giới hạn đồng thời: nếu bị 429 khi
    // tải cao, orchestrator sẽ tưởng instance chết và restart vòng lặp.
    let is_probe = matches!(request.uri().path(), "/api/v1/health" | "/api/v1/ready");
    if is_probe {
        state.lifecycle.enter();
        let response = next.run(request).await;
        state.metrics.leave(response.status().as_u16());
        state.lifecycle.leave();
        return response;
    }

    let permit = match state.concurrency.acquire_global().await {
        Some(permit) => permit,
        None => {
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .map(|id| id.0.clone())
                .unwrap_or_else(|| "-".to_string());
            tracing::warn!(target: "bakhi::concurrency", "quá nhiều request đồng thời");
            let mut response = ApiError::rate_limited(
                "Máy chủ đang xử lý nhiều yêu cầu. Bạn thử lại sau vài giây nhé.",
            )
            .into_response_with(&request_id);
            *response.status_mut() = StatusCode::TOO_MANY_REQUESTS;
            state.metrics.leave(response.status().as_u16());
            return response;
        }
    };

    state.lifecycle.enter();
    let response = next.run(request).await;
    state.metrics.leave(response.status().as_u16());
    state.lifecycle.leave();
    drop(permit);
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn per_user_limit_is_one_by_default() {
        let concurrency = Concurrency::new(8, 4, 1, Duration::from_millis(50));
        let first = concurrency.acquire_ai("user-a").await;
        assert!(first.is_some());
        assert!(concurrency.acquire_ai("user-a").await.is_none());
        assert!(concurrency.acquire_ai("user-b").await.is_some());
        drop(first);
        assert_eq!(concurrency.user_active("user-a"), 0);
        assert!(concurrency.acquire_ai("user-a").await.is_some());
    }

    #[tokio::test]
    async fn ai_semaphore_returns_none_instead_of_queueing_forever() {
        let concurrency = Concurrency::new(8, 1, 8, Duration::from_millis(30));
        let held = concurrency.acquire_ai("a").await;
        assert!(held.is_some());
        let started = std::time::Instant::now();
        assert!(concurrency.acquire_ai("b").await.is_none());
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}

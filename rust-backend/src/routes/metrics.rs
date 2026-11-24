// ===========================================================================
// Bá Khí — Rust backend · routes/metrics.rs
//
// GET /api/v1/metrics — định dạng Prometheus text exposition.
//
// Mặc định TẮT. Chỉ bật khi METRICS_ENABLED=1 VÀ METRICS_TOKEN được đặt; khi đó
// request phải gửi `Authorization: Bearer <METRICS_TOKEN>`. Không có token ⇒
// endpoint trả 404 như chưa tồn tại (không tiết lộ cấu hình nội bộ).
// ===========================================================================

use axum::extract::{Extension, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::errors::ApiError;
use crate::middleware::RequestId;
use crate::AppState;

pub async fn metrics(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    headers: HeaderMap,
) -> Response {
    let enabled = state.settings.metrics_enabled;
    let expected = state
        .settings
        .metrics_token
        .as_deref()
        .filter(|token| !token.trim().is_empty());

    let (Some(expected), true) = (expected, enabled) else {
        return ApiError::not_found().into_response();
    };

    let provided = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|raw| raw.trim().strip_prefix("Bearer "))
        .map(|token| token.trim())
        .unwrap_or("");

    if !constant_time_eq(provided.as_bytes(), expected.trim().as_bytes()) {
        return ApiError::unauthorized().into_response_with(&request_id.0);
    }

    let circuits = state.circuits.snapshot();
    // Render Prometheus đọc `/proc/self/statm` và dựng chuỗi lớn: chạy trên
    // blocking pool để không chặn worker thread của runtime.
    let metrics = state.metrics.clone();
    let body = match tokio::task::spawn_blocking(move || metrics.prometheus(&circuits)).await {
        Ok(body) => body,
        Err(_) => return ApiError::internal().into_response_with(&request_id.0),
    };
    let mut response = (StatusCode::OK, body).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response
}

/// So sánh không rò rỉ thời gian (độ dài token là công khai, nội dung thì không).
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::constant_time_eq;

    #[test]
    fn compares_tokens_without_early_exit() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"ab", b"abc"));
        assert!(constant_time_eq(b"", b""));
    }
}

// ===========================================================================
// Bá Khí — Rust backend · observability/mod.rs
//
// 8.6.1: metrics nội bộ + access log có cấu trúc.
//
//   * Metrics là bộ đếm nguyên tử trong tiến trình, không phụ thuộc dịch vụ
//     ngoài và không chứa dữ liệu cá nhân. `GET /api/v1/metrics` xuất định dạng
//     Prometheus khi METRICS_ENABLED=1 và METRICS_TOKEN được đặt.
//   * Access log ghi request id, method, route, status, thời gian và nhóm lỗi.
//     Không bao giờ ghi Authorization, apikey hay nội dung request.
// ===========================================================================

pub mod metrics;

use std::time::Instant;

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::middleware::RequestId;

/// Nhóm lỗi dùng cho metrics/access log — không lộ chi tiết kỹ thuật.
fn category(status: u16) -> &'static str {
    match status {
        200..=299 => "ok",
        400..=499 => "client_error",
        500..=599 => "server_error",
        _ => "other",
    }
}

pub async fn access_log(request: Request, next: Next) -> Response {
    let started = Instant::now();
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .map(|id| id.0.clone())
        .unwrap_or_else(|| "-".to_string());

    let response = next.run(request).await;
    let status = response.status().as_u16();
    let latency_ms = started.elapsed().as_millis() as u64;

    tracing::info!(
        target: "bakhi::request",
        request_id = %request_id,
        method = %method,
        route = %path,
        status = status,
        duration_ms = latency_ms,
        category = category(status),
        "request"
    );

    response
}

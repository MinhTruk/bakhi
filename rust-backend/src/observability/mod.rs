// ===========================================================================
// Bá Khí — Rust backend · observability/mod.rs
//
// 8.6.2: HTTP instrumentation thật (counter + histogram) và access log có
// tương quan request id. Chỉ số được ghi MỘT LẦN cho mỗi request, sau khi
// response hoàn tất — không đo trùng giữa middleware.
//
// `/metrics` không được tính là request nghiệp vụ: scrape của Prometheus không
// làm thay đổi latency/error rate của API.
// ===========================================================================

pub mod metrics;
pub mod pricing;

use std::time::Instant;

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::middleware::RequestId;
use crate::AppState;

/// Route chuẩn hoá: gộp tham số động để không sinh vô hạn time series.
///
///   `/api/v1/students/123`   → `/api/v1/students/:id`
///   `/api/v1/students/<uuid>` → `/api/v1/students/:id`
///
/// Route lạ (không khớp bảng) trả `/other`, nhờ vậy bot quét path lạ không
/// làm phình registry.
pub fn normalize_route(path: &str) -> String {
    const KNOWN: [&str; 7] = [
        "/health",
        "/api/v1/health",
        "/ready",
        "/api/v1/ready",
        "/metrics",
        "/api/v1/metrics",
        "/api/v1/me",
    ];
    if let Some(found) = KNOWN.iter().find(|known| **known == path) {
        // /api/v1/health và /health là cùng một endpoint nghiệp vụ.
        return match *found {
            "/api/v1/health" => "/health".to_string(),
            "/api/v1/ready" => "/ready".to_string(),
            "/api/v1/metrics" => "/metrics".to_string(),
            other => other.to_string(),
        };
    }
    let route = if path.starts_with("/api/v1/ai/chat") {
        "/api/v1/ai/chat"
    } else if path.starts_with("/api/v1/data/learning-stats") {
        "/api/v1/data/learning-stats"
    } else if path.starts_with("/api/v1/observability/summary") {
        "/api/v1/observability/summary"
    } else {
        "/other"
    };
    if route == "/other" {
        return route.to_string();
    }
    let suffix = path.trim_start_matches(route).trim_end_matches('/');
    if suffix.is_empty() {
        route.to_string()
    } else {
        format!("{route}/:sub")
    }
}

/// Nhóm lỗi hữu hạn cho metrics/log — không chứa thông điệp thô.
fn category(status: u16) -> &'static str {
    match status {
        200..=399 => "ok",
        400..=499 => "client_error",
        502 | 503 => "upstream_error",
        504 => "timeout",
        500..=599 => "server_error",
        _ => "other",
    }
}

pub async fn access_log(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let started = Instant::now();
    let method = request.method().as_str().to_string();
    let path = request.uri().path().to_string();
    let route = normalize_route(&path);
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .map(|id| id.0.clone())
        .unwrap_or_else(|| "-".to_string());

    let response = next.run(request).await;
    let status = response.status().as_u16();
    let seconds = started.elapsed().as_secs_f64();
    let category = category(status);

    // Scrape metrics không phải lưu lượng nghiệp vụ.
    let is_metrics = route == "/metrics";
    if !is_metrics {
        state
            .metrics
            .record_http(&method, &route, status, seconds, category);

        let error_code = response
            .headers()
            .get("x-error-code")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        if status >= 500 {
            tracing::warn!(
                target: "bakhi::request",
                request_id = %request_id,
                method = %method,
                route = %route,
                status = status,
                duration_ms = (seconds * 1000.0).round() as u64,
                category,
                error_code,
                "request"
            );
        } else {
            tracing::info!(
                target: "bakhi::request",
                request_id = %request_id,
                method = %method,
                route = %route,
                status = status,
                duration_ms = (seconds * 1000.0).round() as u64,
                category,
                error_code,
                "request"
            );
        }
    }

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_known_routes_and_folds_unknown_ones() {
        assert_eq!(normalize_route("/health"), "/health");
        assert_eq!(normalize_route("/api/v1/health"), "/health");
        assert_eq!(normalize_route("/api/v1/ready"), "/ready");
        assert_eq!(normalize_route("/api/v1/me"), "/api/v1/me");
        assert_eq!(normalize_route("/api/v1/ai/chat"), "/api/v1/ai/chat");
        assert_eq!(
            normalize_route("/api/v1/data/learning-stats"),
            "/api/v1/data/learning-stats"
        );
        // Mọi path lạ (kể cả chứa id) gộp một nhãn: cardinality hữu hạn.
        assert_eq!(normalize_route("/api/v1/students/123"), "/other");
        assert_eq!(normalize_route("/wp-login.php"), "/other");
        assert_eq!(normalize_route("/"), "/other");
    }

    #[test]
    fn categories_are_bounded_and_distinguish_upstream_failures() {
        assert_eq!(category(204), "ok");
        assert_eq!(category(400), "client_error");
        assert_eq!(category(502), "upstream_error");
        assert_eq!(category(503), "upstream_error");
        assert_eq!(category(504), "timeout");
        assert_eq!(category(500), "server_error");
    }
}

// ===========================================================================
// Bá Khí — Rust backend · routes/health.rs
//
// /health : tiến trình còn sống không. KHÔNG chạm database, KHÔNG gọi AI,
//           KHÔNG phụ thuộc provider. Luôn 200 khi tiến trình phục vụ được HTTP.
// /ready  : có phục vụ request mới không. Kiểm tra cấu hình bắt buộc và khả năng
//           truy cập Supabase Auth (dependency bắt buộc), với timeout ngắn.
//           Trả 503 khi đang shutdown, thiếu cấu hình hoặc Supabase không trả lời.
//
// Không trả API key, JWT, connection string hay chi tiết nội bộ.
// ===========================================================================

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::errors::ApiError;
use crate::AppState;

pub async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "data": {
            "status": "ok",
            "service": "bakhi-backend",
            "version": env!("CARGO_PKG_VERSION"),
            "uptimeSeconds": state.lifecycle.uptime_seconds(),
            "activeRequests": state.lifecycle.active(),
            "draining": state.lifecycle.is_shutting_down()
        }
    }))
}

pub async fn ready(State(state): State<AppState>) -> Response {
    // Trong lúc shutdown: ngừng nhận request mới ngay cả khi Supabase vẫn khoẻ.
    if state.lifecycle.is_shutting_down() {
        return not_ready("draining", None);
    }

    // Cấu hình là dependency bắt buộc: báo lỗi cấu hình tách khỏi lỗi kết nối.
    if state.settings.persist_conversations && !state.supabase.has_service_key() {
        tracing::error!(
            target: "bakhi::ready",
            "thiếu SUPABASE_SERVICE_ROLE_KEY trong khi AI_PERSIST_CONVERSATIONS=true"
        );
        return not_ready("config_error", Some("cấu hình"));
    }

    if !state.supabase.ping().await {
        return not_ready("dependency_down", Some("supabase"));
    }

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "data": {
                "status": "ready",
                "version": env!("CARGO_PKG_VERSION"),
                "checks": { "supabase": "up", "config": "ok" }
            }
        })),
    )
        .into_response()
}

fn not_ready(reason: &str, dependency: Option<&str>) -> Response {
    if let Some(dependency) = dependency {
        // Chỉ ghi tên dependency vào log nội bộ, không đưa vào body.
        tracing::warn!(target: "bakhi::ready", dependency, reason, "chưa sẵn sàng");
    }
    let error = ApiError::service_unavailable(
        "NOT_READY",
        "Máy chủ chưa sẵn sàng phục vụ. Bạn thử lại sau ít phút.",
    );
    let mut response = error.into_response();
    // Ghi lý do vào header nội bộ để vận hành phân biệt cấu hình vs kết nối;
    // không đưa thông tin này vào body dành cho người dùng.
    if let Ok(value) = axum::http::HeaderValue::from_str(reason) {
        response.headers_mut().insert("x-ready-reason", value);
    }
    response
}

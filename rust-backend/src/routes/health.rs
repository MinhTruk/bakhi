// ===========================================================================
// Bá Khí — Rust backend · routes/health.rs
//
// /health : service còn sống không. Không chạm database, không lộ thông tin nội bộ.
// /ready  : có phục vụ được request không (kiểm tra Supabase Auth trả lời).
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
            "uptimeSeconds": state.started.elapsed().as_secs()
        }
    }))
}

pub async fn ready(State(state): State<AppState>) -> Response {
    let database_ok = state.supabase.ping().await;
    let body = json!({
        "ok": database_ok,
        "data": {
            "status": if database_ok { "ready" } else { "degraded" },
            "checks": {
                "supabase": if database_ok { "up" } else { "down" }
            }
        }
    });
    if database_ok {
        (StatusCode::OK, Json(body)).into_response()
    } else {
        let error = ApiError::service_unavailable(
            "NOT_READY",
            "Máy chủ chưa sẵn sàng phục vụ. Bạn thử lại sau ít phút.",
        );
        let mut response = error.into_response();
        *response.status_mut() = StatusCode::SERVICE_UNAVAILABLE;
        response
    }
}

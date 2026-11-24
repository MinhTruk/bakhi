// ===========================================================================
// Bá Khí — Rust backend · routes/mod.rs
// ===========================================================================

pub mod ai;
pub mod data;
pub mod health;
pub mod me;
pub mod metrics;
pub mod observability;

use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

use crate::errors::{ApiError, REQUEST_ID_HEADER};
use crate::middleware::RequestId;

/// Bọc kết quả xử lý thành phản hồi JSON thống nhất.
///
///   thành công: { "ok": true,  "data": … }
///   lỗi:        { "ok": false, "error": { code, message, retryable }, "request_id": … }
pub fn respond(result: Result<Value, ApiError>, request_id: &RequestId) -> Response {
    match result {
        Ok(value) => {
            let mut response =
                (StatusCode::OK, Json(json!({ "ok": true, "data": value }))).into_response();
            if let Ok(id) = HeaderValue::from_str(&request_id.0) {
                response.headers_mut().insert(REQUEST_ID_HEADER, id);
            }
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            response
        }
        Err(error) => error.into_response_with(&request_id.0),
    }
}

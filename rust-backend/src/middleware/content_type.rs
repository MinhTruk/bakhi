// ===========================================================================
// Bá Khí — Rust backend · middleware/content_type.rs
//
// Các endpoint POST chỉ nhận JSON. Từ chối sớm bằng 415 với error envelope
// thống nhất thay vì để body parser trả lỗi khó hiểu. Không ảnh hưởng GET.
// ===========================================================================

use axum::extract::Request;
use axum::http::{header::CONTENT_TYPE, Method};
use axum::middleware::Next;
use axum::response::Response;

use crate::errors::ApiError;
use crate::middleware::request_id::RequestId;

pub async fn require_json(request: Request, next: Next) -> Response {
    if request.method() == Method::POST {
        let content_type = request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !content_type.starts_with("application/json") {
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .map(|id| id.0.clone())
                .unwrap_or_else(|| "-".to_string());
            tracing::warn!(target: "bakhi::request", "Content-Type không phải JSON");
            return ApiError::new(
                axum::http::StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_MEDIA_TYPE",
                "Dữ liệu gửi lên phải ở định dạng JSON.",
            )
            .into_response_with(&request_id);
        }
    }
    next.run(request).await
}

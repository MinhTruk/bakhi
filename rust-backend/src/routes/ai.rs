// ===========================================================================
// Bá Khí — Rust backend · routes/ai.rs
//
// POST /api/v1/ai/chat
// Nhận cùng trường với action `chat` của Edge Function `ai-tutor-api` và trả
// cùng hình dạng `data` để frontend không phải sửa khi chuyển backend.
// ===========================================================================

use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::response::Response;

use crate::errors::ApiError;
use crate::middleware::{AuthUser, RequestId};
use crate::routes::respond;
use crate::services::ai_service::{AiService, ChatRequest};
use crate::AppState;

pub async fn chat(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    user: AuthUser,
    body: Bytes,
) -> Response {
    let request = if body.is_empty() {
        serde_json::from_str::<ChatRequest>("{}")
    } else {
        serde_json::from_slice::<ChatRequest>(&body)
    };

    let request = match request {
        Ok(request) => request,
        Err(_) => {
            return respond(
                Err(ApiError::bad_request(
                    "BAD_REQUEST",
                    "Dữ liệu gửi lên không đọc được.",
                )),
                &request_id,
            )
        }
    };

    let service = AiService::new(state);
    respond(service.chat(&user, request).await, &request_id)
}

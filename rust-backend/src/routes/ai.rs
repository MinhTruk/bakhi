// ===========================================================================
// Bá Khí — Rust backend · routes/ai.rs
//
// POST /api/v1/ai/chat          — JSON trọn gói (tương thích Edge Function).
// POST /api/v1/ai/chat/stream   — 8.7.4, SSE: `delta` → `done` | `error`.
//
// Endpoint streaming dùng CÙNG xác thực, middleware, hạn mức, pipeline và dữ
// liệu lưu trữ với endpoint thường. Chỉ khác cách chuyển nội dung về trình
// duyệt: không chờ toàn bộ câu trả lời.
//
// Định dạng sự kiện (dòng JSON trong `data:`):
//   event: delta  { "text": "…" }                 (nhiều lần, đúng thứ tự)
//   event: done   { "ok": true, "data": {…}, "request_id": "…" }
//   event: error  { "ok": false, "error": {…}, "request_id": "…" }
// `done.data` giống hệt body của endpoint thường, nên client có thể thay thế
// từng phần bằng bản đầy đủ khi stream kết thúc (hội thoại, meta, token).
// ===========================================================================

use std::convert::Infallible;
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::http::{header, HeaderValue};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::errors::{ApiError, REQUEST_ID_HEADER};
use crate::middleware::{AuthUser, RequestId};
use crate::routes::respond;
use crate::services::ai_service::{AiService, ChatRequest, StreamContext};
use crate::AppState;

/// Số frame SSE có thể chờ trong bộ nhớ. Có hạn để một client chậm không làm
/// phình RAM; đầy thì provider bị chặn (backpressure thật, không mất chunk).
const STREAM_BUFFER: usize = 64;

fn parse_request(body: &Bytes) -> Result<ChatRequest, ApiError> {
    let parsed = if body.is_empty() {
        serde_json::from_str::<ChatRequest>("{}")
    } else {
        serde_json::from_slice::<ChatRequest>(body)
    };
    parsed.map_err(|_| ApiError::bad_request("BAD_REQUEST", "Dữ liệu gửi lên không đọc được."))
}

pub async fn chat(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    user: AuthUser,
    body: Bytes,
) -> Response {
    let request = match parse_request(&body) {
        Ok(request) => request,
        Err(error) => return respond(Err(error), &request_id),
    };

    let service = AiService::new(state);
    respond(service.chat(&user, request).await, &request_id)
}

/// Tắt endpoint streaming thì trả 404 như chưa tồn tại (không lộ cấu hình).
fn disabled() -> Response {
    ApiError::not_found().into_response()
}

pub async fn chat_stream(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    user: AuthUser,
    body: Bytes,
) -> Response {
    if !state.settings.ai_stream_enabled {
        return disabled();
    }
    let request = match parse_request(&body) {
        Ok(request) => request,
        Err(error) => return respond(Err(error), &request_id),
    };

    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(STREAM_BUFFER);
    let context = StreamContext::new(tx);
    let service = AiService::new(state);
    let request_id_value = request_id.0.clone();

    // Công việc chạy ở task riêng để frame đầu tiên có thể đi ngay khi provider
    // trả chunk đầu; task tự kết thúc khi stream xong hoặc client đóng kết nối.
    tokio::spawn(async move {
        match service.chat_stream(&user, request, context.clone()).await {
            Ok(data) => {
                let envelope = json!({
                    "ok": true,
                    "data": data,
                    "request_id": request_id_value
                });
                context.send("done", &envelope).await;
            }
            Err(error) => {
                // Header HTTP đã gửi từ trước khi có lỗi: lỗi đi bằng sự kiện
                // `error` với đúng hình dạng envelope của endpoint thường.
                let envelope = error_envelope(&error, &request_id_value);
                context.send("error", &envelope).await;
            }
        }
    });

    let mut response = Sse::new(ReceiverStream::new(rx))
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keep-alive"),
        )
        .into_response();

    if let Ok(value) = HeaderValue::from_str(&request_id.0) {
        response.headers_mut().insert(REQUEST_ID_HEADER, value);
    }
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    // Tránh proxy đệm SSE (nginx mặc định đệm response).
    response
        .headers_mut()
        .insert("x-accel-buffering", HeaderValue::from_static("no"));
    response
}

fn error_envelope(error: &ApiError, request_id: &str) -> Value {
    json!({
        "ok": false,
        "error": {
            "code": error.code,
            "message": error.message,
            "retryable": error.retryable
        },
        "request_id": request_id
    })
}

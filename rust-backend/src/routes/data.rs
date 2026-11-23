// ===========================================================================
// Bá Khí — Rust backend · routes/data.rs
//
// POST /api/v1/data/learning-stats
// Tổng hợp dữ liệu học tập do client gửi (đã đăng nhập). Hàm thuần, không I/O,
// nên trả lời trong vài mili giây kể cả với vài nghìn dòng.
//
// Giới hạn: body do DefaultBodyLimit chặn; số dòng do service chặn.
// ===========================================================================

use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::response::Response;

use crate::errors::ApiError;
use crate::middleware::{AuthUser, RequestId};
use crate::routes::respond;
use crate::services::data_service::{learning_stats, LearningStatsRequest};
use crate::AppState;

pub async fn learning_stats_route(
    State(_state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    _user: AuthUser,
    body: Bytes,
) -> Response {
    let request = if body.is_empty() {
        Ok(LearningStatsRequest::default())
    } else {
        serde_json::from_slice::<LearningStatsRequest>(&body)
    };

    match request {
        Ok(request) => respond(Ok(learning_stats(request)), &request_id),
        Err(_) => respond(
            Err(ApiError::bad_request(
                "BAD_REQUEST",
                "Dữ liệu học tập gửi lên không đọc được.",
            )),
            &request_id,
        ),
    }
}

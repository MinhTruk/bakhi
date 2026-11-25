// ===========================================================================
// Bá Khí — Rust backend · routes/data.rs
//
// POST /api/v1/data/learning-stats
// Tổng hợp dữ liệu học tập do client gửi (đã đăng nhập). Hàm thuần, KHÔNG I/O
// nhưng là CPU-bound với vài nghìn dòng — từ 8.8.0 chạy trên Parallel Engine
// (worker pool có hạn) thay vì chiếm trực tiếp worker thread của Tokio.
//
// Giới hạn: body do DefaultBodyLimit chặn; số dòng do service chặn; hàng đợi
// song song đầy thì trả 429 thay vì nhận việc vô hạn.
// ===========================================================================

use axum::body::Bytes;
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::Response;

use crate::errors::ApiError;
use crate::middleware::{AuthUser, RequestId};
use crate::routes::respond;
use crate::services::data_service::{learning_stats, LearningStatsRequest};
use crate::AppState;

/// Lô nhỏ đi thẳng đường inline (không tốn ~28 µs cố định của worker pool đã
/// đo trong `examples/pipeline_bench.rs`). Lô lớn mới chuyển sang engine để
/// không chặn worker thread của Tokio.
const PARALLEL_MIN_ROWS: usize = 500;

pub async fn learning_stats_route(
    State(state): State<AppState>,
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
        Ok(request) => {
            if request.row_count() < PARALLEL_MIN_ROWS {
                return respond(Ok(learning_stats(request)), &request_id);
            }
            match state
                .parallel
                .run_cpu(move || learning_stats(request))
                .await
            {
                Ok(value) => respond(Ok(value), &request_id),
                Err(error) => {
                    let status = StatusCode::from_u16(error.status())
                        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
                    respond(
                        Err(ApiError::new(status, error.code(), error.message())),
                        &request_id,
                    )
                }
            }
        }
        Err(_) => respond(
            Err(ApiError::bad_request(
                "BAD_REQUEST",
                "Dữ liệu học tập gửi lên không đọc được.",
            )),
            &request_id,
        ),
    }
}

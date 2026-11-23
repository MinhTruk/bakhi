// ===========================================================================
// Bá Khí — Rust backend · routes/me.rs
//
// /api/v1/me — trả danh tính do Supabase xác nhận và hồ sơ học sinh ứng với
// tài khoản đó. Liên kết lấy từ `student_devices` của CHÍNH người dùng (RLS),
// không phải từ bất kỳ id nào client gửi lên.
//
// Tài khoản chưa gắn hồ sơ: 200 với `student: null` để công cụ vận hành phân
// biệt "chưa gắn" với "lỗi"; đường chat vẫn trả 409 NOT_BOUND như Edge Function.
// ===========================================================================

use axum::extract::{Extension, State};
use axum::response::Response;
use serde_json::json;

use crate::middleware::{AuthUser, RequestId};
use crate::routes::respond;
use crate::AppState;

pub async fn me(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    user: AuthUser,
) -> Response {
    let result = async {
        let student = state.supabase.student_record(&user).await?;
        Ok(json!({
            "user": { "id": user.id, "email": user.email },
            "student": student.map(|record| record.to_value())
        }))
    }
    .await;
    respond(result, &request_id)
}

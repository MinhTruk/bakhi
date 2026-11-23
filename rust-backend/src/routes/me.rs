// ===========================================================================
// Bá Khí — Rust backend · routes/me.rs
//
// /api/v1/me — trả danh tính do Supabase xác nhận và hồ sơ học sinh ứng với
// tài khoản đó. Truy vấn hồ sơ dùng JWT của chính người dùng ⇒ RLS quyết định.
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
        let student = state.supabase.student_of(&user).await?;
        Ok(json!({
            "user": { "id": user.id, "email": user.email },
            "student": student
        }))
    }
    .await;
    respond(result, &request_id)
}

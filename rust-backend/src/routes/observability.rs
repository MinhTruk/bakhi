// ===========================================================================
// Bá Khí — Rust backend · routes/observability.rs
//
// POST /api/v1/observability/summary — dữ liệu tổng hợp cho Founder Dashboard.
//
// Xác thực bằng CHÍNH hệ thống phiên quản trị hiện có: header `x-admin-token`,
// backend băm SHA-256 rồi tra `admin_sessions` (service role) và yêu cầu
// `scope = 'founder'` còn hạn. Không có cơ chế xác thực thứ hai, không có token
// metrics nào bị đưa xuống trình duyệt.
//
// Chỉ đọc metrics trong bộ nhớ — không truy vấn database cho từng chỉ số.
// ===========================================================================

use axum::extract::{Extension, State};
use axum::http::HeaderMap;
use axum::response::Response;

use crate::errors::ApiError;
use crate::middleware::RequestId;
use crate::routes::respond;
use crate::AppState;

const ADMIN_TOKEN_HEADER: &str = "x-admin-token";

pub async fn summary(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    headers: HeaderMap,
) -> Response {
    let token = headers
        .get(ADMIN_TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .unwrap_or("");

    if token.len() < 20 {
        return respond(Err(ApiError::unauthorized()), &request_id);
    }

    match state.supabase.admin_session_scope(token).await {
        Ok(Some(scope)) if scope == "founder" => {
            let circuits = state.circuits.snapshot();
            let mut summary = state
                .metrics
                .summary(&circuits, state.settings.metrics_enabled);
            if let Some(object) = summary.as_object_mut() {
                if let Some(runtime) = object.get_mut("runtime").and_then(|v| v.as_object_mut()) {
                    runtime.insert(
                        "draining".to_string(),
                        serde_json::json!(state.lifecycle.is_shutting_down()),
                    );
                }
                // 8.7.3 — số liệu Cache Engine. Chỉ là số đếm/dung lượng, không
                // có khoá cache hay payload nào đi xuống trình duyệt.
                let cache =
                    serde_json::to_value(state.cache.stats()).unwrap_or(serde_json::Value::Null);
                object.insert("cache".to_string(), cache);
            }
            respond(Ok(summary), &request_id)
        }
        // Phiên hợp lệ nhưng không phải Founder: không trả dữ liệu vận hành.
        Ok(Some(_)) => respond(Err(ApiError::forbidden()), &request_id),
        Ok(None) => respond(Err(ApiError::unauthorized()), &request_id),
        Err(error) => error.into_response_with(&request_id.0),
    }
}

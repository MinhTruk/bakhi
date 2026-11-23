// ===========================================================================
// Bá Khí — Rust backend · errors/api_error.rs
//
// Một kiểu lỗi duy nhất cho toàn API. Mọi phản hồi lỗi có cùng hình dạng:
//
//   { "ok": false,
//     "error": { "code": "RATE_LIMIT", "message": "…", "retryable": true },
//     "request_id": "…" }
//
// Không bao giờ trả stack trace, SQL, tên bảng hay nội dung thô của provider.
// Mã lỗi và HTTP status của các trường hợp nghiệp vụ giữ khớp Edge Function
// `ai-tutor-api` để frontend không phải sửa (xem docs/RUST_CONTRACT_TESTING_V861.md).
// ===========================================================================

use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;

pub const REQUEST_ID_HEADER: &str = "x-request-id";

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn retryable(mut self, retryable: bool) -> Self {
        self.retryable = retryable;
        self
    }

    pub fn unauthorized() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        )
    }

    pub fn forbidden() -> Self {
        Self::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Bạn không có quyền thực hiện thao tác này.",
        )
    }

    /// Hồ sơ học sinh không còn hoạt động — giống Edge Function (403 INACTIVE).
    pub fn inactive() -> Self {
        Self::new(
            StatusCode::FORBIDDEN,
            "INACTIVE",
            "Hồ sơ học sinh không còn hoạt động.",
        )
    }

    /// Thiết bị chưa gắn hồ sơ học sinh — giống Edge Function (409 NOT_BOUND).
    pub fn not_bound() -> Self {
        Self::new(
            StatusCode::CONFLICT,
            "NOT_BOUND",
            "Thiết bị chưa được gắn với học sinh nào. Hãy chọn họ tên ở trang chủ rồi mở lại Trợ lý AI.",
        )
    }

    /// Dịch vụ dữ liệu lỗi — Edge Function trả 500 DB_ERROR cho lỗi ghi/đọc.
    pub fn db_error() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Máy chủ dữ liệu không xử lý được yêu cầu.",
        )
        .retryable(true)
    }

    /// Chưa cấu hình khoá dịch vụ máy chủ (lỗi vận hành, không phải lỗi người dùng).
    pub fn not_configured() -> Self {
        Self::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "NOT_CONFIGURED",
            "Máy chủ chưa được cấu hình khoá dịch vụ.",
        )
    }

    pub fn not_found() -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "Không tìm thấy dữ liệu.",
        )
    }

    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }

    pub fn payload_too_large() -> Self {
        Self::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "PAYLOAD_TOO_LARGE",
            "Dữ liệu gửi lên quá lớn.",
        )
    }

    pub fn rate_limited(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMIT", message).retryable(true)
    }

    /// Trợ lý AI còn đang trả lời lượt trước — giống Edge Function (429 BUSY).
    pub fn busy(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "BUSY", message).retryable(true)
    }

    pub fn service_unavailable(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::SERVICE_UNAVAILABLE, code, message)
    }

    pub fn bad_gateway(code: &'static str, message: impl Into<String>, retryable: bool) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, code, message).retryable(retryable)
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "SERVER_ERROR",
            "Máy chủ không xử lý được yêu cầu.",
        )
    }

    pub fn into_response_with(self, request_id: &str) -> Response {
        let body = json!({
            "ok": false,
            "error": {
                "code": self.code,
                "message": self.message,
                "retryable": self.retryable
            },
            "request_id": request_id
        });
        let mut response = (self.status, axum::Json(body)).into_response();
        if let Ok(value) = HeaderValue::from_str(request_id) {
            response.headers_mut().insert(REQUEST_ID_HEADER, value);
        }
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        response
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.code, self.status.as_u16())
    }
}

impl std::error::Error for ApiError {}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        self.into_response_with("-")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_envelope_has_stable_shape() {
        let error = ApiError::bad_request("EMPTY_MESSAGE", "Bạn chưa nhập câu hỏi.");
        let response = error.into_response_with("req-1");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(response.headers().get(REQUEST_ID_HEADER).unwrap(), "req-1");
    }

    #[test]
    fn business_codes_match_edge_function_statuses() {
        assert_eq!(ApiError::inactive().status, StatusCode::FORBIDDEN);
        assert_eq!(ApiError::not_bound().status, StatusCode::CONFLICT);
        assert_eq!(
            ApiError::db_error().status,
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(ApiError::busy("x").status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(ApiError::db_error().code, "DB_ERROR");
        assert!(ApiError::busy("x").retryable);
    }
}

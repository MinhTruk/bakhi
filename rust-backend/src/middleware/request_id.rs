// ===========================================================================
// Bá Khí — Rust backend · middleware/request_id.rs
//
// Mỗi request có một mã định danh để đối chiếu log với phản hồi lỗi.
// Nhận `x-request-id` từ client nếu hợp lệ (ngắn, chỉ ASCII an toàn), nếu không
// thì tự sinh UUID v4. Luôn trả lại trong header.
// ===========================================================================

use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::errors::REQUEST_ID_HEADER;

#[derive(Debug, Clone)]
pub struct RequestId(pub String);

/// Chỉ chấp nhận mã do hệ thống khác sinh: 8–64 ký tự an toàn.
fn sanitize(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() < 8 || trimmed.len() > 64 {
        return None;
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(trimmed.to_string())
}

pub async fn request_id_middleware(mut request: Request, next: Next) -> Response {
    let incoming = request
        .headers()
        .get(REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(sanitize);
    let id = incoming.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    request.extensions_mut().insert(RequestId(id.clone()));

    let mut response = next.run(request).await;

    match HeaderValue::from_str(&id) {
        Ok(value) => {
            response.headers_mut().insert(REQUEST_ID_HEADER, value);
        }
        Err(_) => {
            // Không thể xảy ra với mã đã lọc; phòng thủ để không panic.
            response =
                (StatusCode::INTERNAL_SERVER_ERROR, "request id không hợp lệ").into_response();
        }
    }
    response
}

#[cfg(test)]
mod tests {
    use super::sanitize;

    #[test]
    fn accepts_safe_ids_and_rejects_junk() {
        assert_eq!(sanitize("abc-123_XYZ").as_deref(), Some("abc-123_XYZ"));
        assert_eq!(sanitize("short"), None);
        assert_eq!(sanitize("has space in it"), None);
        assert_eq!(sanitize("có-dấu-tiếng-việt"), None);
        assert_eq!(sanitize(&"a".repeat(65)), None);
    }
}

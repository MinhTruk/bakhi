// ===========================================================================
// Bá Khí — Rust backend · middleware/auth.rs
//
// Xác thực người dùng bằng chính Supabase Auth (không tự phát minh cơ chế
// đăng nhập). Token của người học được đối chiếu với /auth/v1/user; kết quả là
// `sub` + email do Supabase xác nhận — không tin bất cứ id nào client gửi lên.
//
// Token KHÔNG được ghi log và không được trả lại cho client.
// ===========================================================================

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use std::fmt;

use crate::errors::ApiError;
use crate::AppState;

#[derive(Clone)]
pub struct AuthUser {
    /// `auth.users.id` do Supabase xác nhận.
    pub id: String,
    pub email: Option<String>,
    /// Token của chính người dùng, dùng cho truy vấn PostgREST để RLS áp dụng.
    pub access_token: String,
}

impl fmt::Debug for AuthUser {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Không in token, kể cả khi có ai log {:?}.
        f.debug_struct("AuthUser")
            .field("id", &self.id)
            .field("email", &self.email)
            .field("access_token", &"<đã che>")
            .finish()
    }
}

pub fn bearer_token(parts: &Parts) -> Option<String> {
    let raw = parts.headers.get(AUTHORIZATION)?.to_str().ok()?.trim();
    let (scheme, token) = raw.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let token = token.trim();
    if token.len() < 20 || token.len() > 4096 || token.contains(char::is_whitespace) {
        return None;
    }
    Some(token.to_string())
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        // Tính trước khi mượn async để không giữ tham chiếu qua await.
        let token = bearer_token(parts);
        let supabase = state.supabase.clone();
        async move {
            let token = token.ok_or_else(ApiError::unauthorized)?;
            supabase.user_from_token(&token).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::bearer_token;
    use axum::http::{header::AUTHORIZATION, HeaderValue, Request};

    fn parts_with(value: &str) -> axum::http::request::Parts {
        let request = Request::builder()
            .header(AUTHORIZATION, HeaderValue::from_str(value).unwrap())
            .body(())
            .unwrap();
        let (parts, ()) = request.into_parts();
        parts
    }

    #[test]
    fn accepts_bearer_token() {
        let parts = parts_with("Bearer abcdefghijklmnopqrstuvwxyz");
        assert_eq!(
            bearer_token(&parts).as_deref(),
            Some("abcdefghijklmnopqrstuvwxyz")
        );
    }

    #[test]
    fn rejects_other_schemes_and_short_tokens() {
        assert!(bearer_token(&parts_with("Basic abcdefghijklmnopqrstuvwxyz")).is_none());
        assert!(bearer_token(&parts_with("Bearer short")).is_none());
    }
}

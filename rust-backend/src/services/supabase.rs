// ===========================================================================
// Bá Khí — Rust backend · services/supabase.rs
//
// Giao tiếp Supabase qua REST (PostgREST) và Auth. KHÔNG kết nối thẳng
// PostgreSQL: RLS, quyền và trigger vẫn do Supabase thi hành.
//
// Hai chế độ xác thực, tách bạch rõ ràng:
//   * RestAuth::User  → apikey công khai + JWT của người dùng ⇒ RLS áp dụng.
//                       Dùng cho liên kết thiết bị của chính người học.
//   * RestAuth::Service → service_role, CHỈ cho cấu hình máy chủ
//                       (ai_settings, ai_model_routes), ánh xạ danh tính
//                       (students bị thu hồi quyền với authenticated), hội thoại
//                       AI và nhật ký sử dụng.
//
// 8.6.1: sửa lỗi tương thích — `students` KHÔNG có cột `auth_user_id`; quan hệ
// thật là auth.users → student_devices (auth_user_id, student_id) → students.
// Service role key chỉ tồn tại ở tiến trình máy chủ; không xuất hiện trong
// phản hồi, log hay mã nguồn.
// ===========================================================================

use std::time::Duration;

use serde_json::{json, Value};

use crate::config::Settings;
use crate::errors::ApiError;
use crate::middleware::AuthUser;

#[derive(Clone)]
pub struct SupabaseClient {
    http: reqwest::Client,
    base: String,
    anon_key: String,
    service_key: Option<String>,
    timeout: Duration,
}

#[derive(Clone, Copy)]
pub enum RestAuth<'a> {
    Service,
    User(&'a str),
}

/// Hồ sơ học sinh ứng với một tài khoản đã xác thực.
#[derive(Debug, Clone)]
pub struct StudentRecord {
    pub id: String,
    pub display_name: Option<String>,
    pub student_code: Option<String>,
    pub is_active: bool,
}

impl StudentRecord {
    pub fn to_value(&self) -> Value {
        json!({
            "id": self.id,
            "display_name": self.display_name,
            "student_code": self.student_code,
            "is_active": self.is_active
        })
    }
}

/// Một dòng nhật ký sử dụng AI. Dùng struct thay vì 12 tham số.
pub struct UsageLog<'a> {
    pub student_id: Option<&'a str>,
    pub action: &'a str,
    pub provider: &'a str,
    pub model: &'a str,
    pub mode: &'a str,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub latency_ms: u64,
    pub ok: bool,
    pub error_code: &'a str,
    pub fell_back: bool,
    pub estimated: bool,
}

impl Default for UsageLog<'_> {
    fn default() -> Self {
        Self {
            student_id: None,
            action: "chat",
            provider: "",
            model: "",
            mode: "",
            tokens_in: 0,
            tokens_out: 0,
            latency_ms: 0,
            ok: true,
            error_code: "",
            fell_back: false,
            estimated: false,
        }
    }
}

impl SupabaseClient {
    pub fn new(http: reqwest::Client, settings: &Settings) -> Self {
        Self {
            http,
            base: settings.supabase_url.clone(),
            anon_key: settings.supabase_anon_key.clone(),
            service_key: settings.supabase_service_key.clone(),
            timeout: settings.supabase_timeout,
        }
    }

    pub fn has_service_key(&self) -> bool {
        self.service_key
            .as_deref()
            .map(|k| !k.trim().is_empty())
            .unwrap_or(false)
    }

    /// Xác thực token người dùng với Supabase Auth.
    ///
    /// Chữ ký, issuer và thời hạn của JWT do Supabase Auth kiểm tra — backend
    /// không tự decode rồi tin nội dung token, và không tin bất kỳ id nào client
    /// gửi kèm.
    pub async fn user_from_token(&self, token: &str) -> Result<AuthUser, ApiError> {
        let url = format!("{}/auth/v1/user", self.base);
        let response = self
            .http
            .get(url)
            .header("apikey", &self.anon_key)
            .header("Authorization", format!("Bearer {token}"))
            .timeout(self.timeout.min(Duration::from_secs(8)))
            .send()
            .await;

        let response = match response {
            Ok(r) => r,
            Err(err) => {
                tracing::warn!(target: "bakhi::auth", error = %err, "không gọi được Supabase Auth");
                return Err(ApiError::service_unavailable(
                    "AUTH_UNAVAILABLE",
                    "Không kiểm tra được phiên đăng nhập. Bạn thử lại sau ít phút.",
                ));
            }
        };

        if response.status() == reqwest::StatusCode::UNAUTHORIZED
            || response.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err(ApiError::unauthorized());
        }
        if !response.status().is_success() {
            tracing::warn!(
                target: "bakhi::auth",
                status = response.status().as_u16(),
                "Supabase Auth trả lỗi"
            );
            return Err(ApiError::service_unavailable(
                "AUTH_UNAVAILABLE",
                "Không kiểm tra được phiên đăng nhập. Bạn thử lại sau ít phút.",
            ));
        }

        let body: Value = response
            .json()
            .await
            .map_err(|_| ApiError::unauthorized())?;
        let id = body
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .ok_or_else(ApiError::unauthorized)?;

        Ok(AuthUser {
            id: id.to_string(),
            email: body
                .get("email")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            access_token: token.to_string(),
        })
    }

    fn rest_headers(
        &self,
        auth: RestAuth<'_>,
        builder: reqwest::RequestBuilder,
    ) -> Result<reqwest::RequestBuilder, ApiError> {
        match auth {
            RestAuth::Service => {
                let key = self.service_key.as_deref().filter(|k| !k.trim().is_empty());
                match key {
                    Some(key) => Ok(builder
                        .header("apikey", key)
                        .header("Authorization", format!("Bearer {key}"))),
                    None => Err(ApiError::not_configured()),
                }
            }
            RestAuth::User(token) => Ok(builder
                .header("apikey", &self.anon_key)
                .header("Authorization", format!("Bearer {token}"))),
        }
    }

    async fn send_json(
        &self,
        response: reqwest::Response,
        context: &'static str,
    ) -> Result<Value, ApiError> {
        if !response.status().is_success() {
            tracing::warn!(
                target: "bakhi::db",
                context,
                status = response.status().as_u16(),
                "PostgREST trả lỗi"
            );
            return Err(ApiError::db_error());
        }
        if response.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(Value::Null);
        }
        response.json::<Value>().await.map_err(|_| {
            tracing::warn!(target: "bakhi::db", context, "phản hồi không phải JSON");
            ApiError::db_error()
        })
    }

    /// GET một bảng/bảng-có-bộ-lọc PostgREST, vd "ai_settings?id=eq.1&select=*".
    pub async fn select(&self, path: &str, auth: RestAuth<'_>) -> Result<Value, ApiError> {
        let url = format!("{}/rest/v1/{}", self.base, path);
        let builder = self.http.get(url).timeout(self.timeout);
        let builder = self.rest_headers(auth, builder)?;
        let response = builder.send().await.map_err(|err| {
            tracing::warn!(target: "bakhi::db", error = %err, "không kết nối được PostgREST");
            ApiError::db_error()
        })?;
        self.send_json(response, "select").await
    }

    /// INSERT một dòng và trả về dòng vừa tạo.
    pub async fn insert(
        &self,
        table: &str,
        body: &Value,
        auth: RestAuth<'_>,
    ) -> Result<Value, ApiError> {
        let url = format!("{}/rest/v1/{}", self.base, table);
        let builder = self
            .http
            .post(url)
            .header("Prefer", "return=representation")
            .json(body)
            .timeout(self.timeout);
        let builder = self.rest_headers(auth, builder)?;
        let response = builder.send().await.map_err(|err| {
            tracing::warn!(target: "bakhi::db", error = %err, "không gửi được INSERT");
            ApiError::db_error()
        })?;
        let value = self.send_json(response, "insert").await?;
        Ok(value
            .as_array()
            .and_then(|rows| rows.first().cloned())
            .unwrap_or(Value::Null))
    }

    /// PATCH theo bộ lọc PostgREST, vd "ai_conversations?id=eq.<uuid>".
    pub async fn update(
        &self,
        path: &str,
        body: &Value,
        auth: RestAuth<'_>,
    ) -> Result<(), ApiError> {
        let url = format!("{}/rest/v1/{}", self.base, path);
        let builder = self
            .http
            .patch(url)
            .header("Prefer", "return=minimal")
            .json(body)
            .timeout(self.timeout);
        let builder = self.rest_headers(auth, builder)?;
        let response = builder.send().await.map_err(|err| {
            tracing::warn!(target: "bakhi::db", error = %err, "không gửi được PATCH");
            ApiError::db_error()
        })?;
        if !response.status().is_success() {
            tracing::warn!(
                target: "bakhi::db",
                status = response.status().as_u16(),
                "PATCH thất bại"
            );
            return Err(ApiError::db_error());
        }
        Ok(())
    }

    /// Kiểm tra phụ thuộc cho `/ready`: Auth phải trả lời.
    pub async fn ping(&self) -> bool {
        let url = format!("{}/auth/v1/health", self.base);
        match self
            .http
            .get(url)
            .header("apikey", &self.anon_key)
            .timeout(Duration::from_secs(3).min(self.timeout))
            .send()
            .await
        {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }

    /// Liên kết auth user → học sinh qua `student_devices` (RLS: chính mình),
    /// sau đó đọc hồ sơ bằng service role vì `students` bị thu hồi với
    /// `authenticated`. Không dùng service role để đọc dữ liệu học tập.
    pub async fn student_record(&self, user: &AuthUser) -> Result<Option<StudentRecord>, ApiError> {
        let path = format!(
            "student_devices?auth_user_id=eq.{}&select=student_id&limit=1",
            urlencode(&user.id)
        );
        let rows = self
            .select(&path, RestAuth::User(&user.access_token))
            .await?;
        let student_id = rows
            .as_array()
            .and_then(|list| list.first())
            .and_then(|row| row.get("student_id"))
            .and_then(|id| id.as_str())
            .map(|id| id.to_string());
        let Some(student_id) = student_id else {
            return Ok(None);
        };

        let path = format!(
            "students?id=eq.{}&select=id,display_name,student_code,is_active&limit=1",
            urlencode(&student_id)
        );
        let rows = self.select(&path, RestAuth::Service).await?;
        let row = rows.as_array().and_then(|list| list.first());
        Ok(row.map(|row| StudentRecord {
            id: row
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(&student_id)
                .to_string(),
            display_name: row
                .get("display_name")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string()),
            student_code: row
                .get("student_code")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string()),
            is_active: row
                .get("is_active")
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        }))
    }

    /// Nhật ký sử dụng AI — chỉ ghi bằng service role, không đọc lại từ client.
    /// Lỗi ghi log không bao giờ làm hỏng câu trả lời đã thành công.
    pub async fn log_ai_usage(&self, entry: UsageLog<'_>) {
        if !self.has_service_key() {
            return;
        }
        let body = json!({
            "student_id": entry.student_id,
            "action": entry.action,
            "provider": entry.provider,
            "model": entry.model,
            "mode": entry.mode,
            "tokens_in": entry.tokens_in,
            "tokens_out": entry.tokens_out,
            "latency_ms": entry.latency_ms.min(u32::MAX as u64),
            "ok": entry.ok,
            "error_code": entry.error_code,
            "fell_back": entry.fell_back,
            "tokens_estimated": entry.estimated
        });
        if let Err(err) = self.insert("ai_usage_logs", &body, RestAuth::Service).await {
            tracing::warn!(target: "bakhi::ai", error = %err, "không ghi được ai_usage_logs");
        }
    }
}

/// Mã hoá tối thiểu cho tham số PostgREST (UUID, chuỗi đơn giản).
pub fn urlencode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::urlencode;

    #[test]
    fn encodes_untrusted_values_for_postgrest() {
        assert_eq!(urlencode("abc-123"), "abc-123");
        assert_eq!(urlencode("a&b=c"), "a%26b%3Dc");
        assert_eq!(urlencode("x y"), "x%20y");
    }
}

// ===========================================================================
// Bá Khí — Rust backend · config/settings.rs
//
// Toàn bộ cấu hình đọc từ biến môi trường. KHÔNG có giá trị bí mật mặc định,
// KHÔNG ghi giá trị bí mật vào log (Debug được cài đặt thủ công để che).
// ===========================================================================

use std::collections::HashMap;
use std::env;
use std::fmt;
use std::time::Duration;

/// Thời gian chờ và giới hạn mặc định — dùng chung cho mọi môi trường.
const DEFAULT_PORT: u16 = 8080;
const DEFAULT_AI_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 45_000;
const DEFAULT_MAX_BODY_BYTES: usize = 256 * 1024;
const DEFAULT_RATE_PER_MIN: u32 = 240;
const DEFAULT_AI_RATE_PER_MIN: u32 = 30;
const DEFAULT_MAX_RETRIES: u8 = 1;

/// Origin mặc định của website (GitHub Pages). Chỉ dùng khi CORS_ORIGINS trống.
const DEFAULT_CORS_ORIGIN: &str = "https://minhtruk.github.io";

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("thiếu biến môi trường bắt buộc: {0}")]
    Missing(&'static str),
    #[error("giá trị không hợp lệ cho biến môi trường: {0}")]
    Invalid(&'static str),
}

#[derive(Clone)]
pub struct Settings {
    pub host: String,
    pub port: u16,
    /// Danh sách origin được phép gọi API. Rỗng = chỉ origin mặc định.
    pub cors_origins: Vec<String>,

    pub supabase_url: String,
    pub supabase_anon_key: String,
    /// Chỉ dùng cho tác vụ đọc cấu hình máy chủ (ai_settings, ai_model_routes)
    /// và ghi nhật ký sử dụng. Không dùng thay quyền người dùng.
    pub supabase_service_key: Option<String>,

    pub ai_primary_key: Option<String>,
    pub ai_fallback_key: Option<String>,
    /// Khoá bổ sung theo `key_ref` (AI_TUTOR_KEY_3 … AI_TUTOR_KEY_6).
    pub ai_extra_keys: HashMap<String, String>,
    /// Ghi đè base URL cho provider OpenAI-compatible (dùng cho `custom`
    /// và cho kiểm thử offline).
    pub ai_base_url: Option<String>,
    pub ai_mock: bool,
    pub ai_max_retries: u8,
    pub ai_timeout: Duration,

    pub request_timeout: Duration,
    pub max_body_bytes: usize,
    pub rate_limit_per_min: u32,
    pub ai_rate_per_min: u32,

    /// Ghi hội thoại AI vào Supabase như Edge Function hiện tại.
    pub persist_conversations: bool,
    /// Tin header X-Forwarded-For của proxy phía trước.
    pub trust_proxy: bool,
}

impl fmt::Debug for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Không bao giờ in khoá ra log, kể cả khi ai đó gọi {:?} trên Settings.
        f.debug_struct("Settings")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("cors_origins", &self.cors_origins)
            .field("supabase_url", &self.supabase_url)
            .field("supabase_anon_key", &redact(&self.supabase_anon_key))
            .field(
                "supabase_service_key",
                &self.supabase_service_key.as_deref().map(redact),
            )
            .field(
                "ai_primary_key",
                &self.ai_primary_key.as_deref().map(redact),
            )
            .field(
                "ai_fallback_key",
                &self.ai_fallback_key.as_deref().map(redact),
            )
            .field(
                "ai_extra_keys",
                &self.ai_extra_keys.keys().collect::<Vec<_>>(),
            )
            .field("ai_base_url", &self.ai_base_url)
            .field("ai_mock", &self.ai_mock)
            .field("ai_max_retries", &self.ai_max_retries)
            .field("ai_timeout", &self.ai_timeout)
            .field("request_timeout", &self.request_timeout)
            .field("max_body_bytes", &self.max_body_bytes)
            .field("rate_limit_per_min", &self.rate_limit_per_min)
            .field("ai_rate_per_min", &self.ai_rate_per_min)
            .field("persist_conversations", &self.persist_conversations)
            .field("trust_proxy", &self.trust_proxy)
            .finish()
    }
}

fn redact(value: &str) -> String {
    if value.is_empty() {
        "<rỗng>".to_string()
    } else {
        format!("<đã đặt: {} ký tự>", value.len())
    }
}

fn var(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn parse_bool(raw: &str, fallback: bool) -> bool {
    match raw.trim().to_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => fallback,
    }
}

fn parse_num<T: std::str::FromStr>(name: &'static str) -> Result<Option<T>, ConfigError> {
    match var(name) {
        None => Ok(None),
        Some(raw) => raw
            .parse::<T>()
            .map(Some)
            .map_err(|_| ConfigError::Invalid(name)),
    }
}

/// Supabase phải dùng https, trừ khi chạy Supabase cục bộ trên loopback
/// (`supabase start` phục vụ http://127.0.0.1:54321) — chỉ cho phép loopback.
pub fn valid_supabase_url(raw: &str) -> bool {
    let url = raw.trim();
    url.starts_with("https://")
        || url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost")
        || url.starts_with("http://[::1]")
}

impl Settings {
    pub fn from_env() -> Result<Self, ConfigError> {
        let supabase_url = var("SUPABASE_URL").ok_or(ConfigError::Missing("SUPABASE_URL"))?;
        if !valid_supabase_url(&supabase_url) {
            return Err(ConfigError::Invalid("SUPABASE_URL"));
        }
        let supabase_anon_key = var("SUPABASE_PUBLISHABLE_KEY")
            .ok_or(ConfigError::Missing("SUPABASE_PUBLISHABLE_KEY"))?;

        let mut cors_origins: Vec<String> = var("CORS_ORIGINS")
            .map(|raw| {
                raw.split(',')
                    .map(|o| o.trim().trim_end_matches('/').to_string())
                    .filter(|o| !o.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        if cors_origins.is_empty() {
            cors_origins.push(DEFAULT_CORS_ORIGIN.to_string());
        }
        for origin in &cors_origins {
            if origin == "*" || !origin.starts_with("http") {
                return Err(ConfigError::Invalid("CORS_ORIGINS"));
            }
        }

        let mut ai_extra_keys = HashMap::new();
        for i in 3..=6 {
            let name = format!("AI_TUTOR_KEY_{i}");
            if let Some(value) = var(&name) {
                ai_extra_keys.insert(name, value);
            }
        }

        Ok(Self {
            host: var("HOST").unwrap_or_else(|| "0.0.0.0".to_string()),
            port: parse_num::<u16>("PORT")?.unwrap_or(DEFAULT_PORT),
            cors_origins,
            supabase_url: supabase_url.trim_end_matches('/').to_string(),
            supabase_anon_key,
            supabase_service_key: var("SUPABASE_SERVICE_ROLE_KEY"),
            ai_primary_key: var("AI_TUTOR_API_KEY"),
            ai_fallback_key: var("AI_TUTOR_FALLBACK_API_KEY"),
            ai_extra_keys,
            ai_base_url: var("AI_TUTOR_BASE_URL").map(|u| u.trim_end_matches('/').to_string()),
            ai_mock: var("AI_TUTOR_MOCK")
                .map(|v| parse_bool(&v, false))
                .unwrap_or(false),
            ai_max_retries: parse_num::<u8>("AI_TUTOR_MAX_RETRIES")?
                .unwrap_or(DEFAULT_MAX_RETRIES)
                .min(2),
            ai_timeout: Duration::from_millis(
                parse_num::<u64>("AI_TUTOR_TIMEOUT")?.unwrap_or(DEFAULT_AI_TIMEOUT_MS),
            ),
            request_timeout: Duration::from_millis(
                parse_num::<u64>("REQUEST_TIMEOUT_MS")?.unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS),
            ),
            max_body_bytes: parse_num::<usize>("MAX_BODY_BYTES")?.unwrap_or(DEFAULT_MAX_BODY_BYTES),
            rate_limit_per_min: parse_num::<u32>("RATE_LIMIT_PER_MIN")?
                .unwrap_or(DEFAULT_RATE_PER_MIN),
            ai_rate_per_min: parse_num::<u32>("AI_RATE_LIMIT_PER_MIN")?
                .unwrap_or(DEFAULT_AI_RATE_PER_MIN),
            persist_conversations: var("AI_PERSIST_CONVERSATIONS")
                .map(|v| parse_bool(&v, true))
                .unwrap_or(true),
            trust_proxy: var("TRUST_PROXY")
                .map(|v| parse_bool(&v, false))
                .unwrap_or(false),
        })
    }

    /// Cấu hình tối thiểu cho kiểm thử offline: không đọc env, không khoá thật.
    pub fn for_tests() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 0,
            cors_origins: vec!["https://minhtruk.github.io".to_string()],
            supabase_url: "https://example.supabase.co".to_string(),
            supabase_anon_key: "test-anon-key".to_string(),
            supabase_service_key: Some("test-service-key".to_string()),
            ai_primary_key: Some("test-provider-key".to_string()),
            ai_fallback_key: None,
            ai_extra_keys: HashMap::new(),
            ai_base_url: None,
            ai_mock: false,
            ai_max_retries: 0,
            ai_timeout: Duration::from_millis(2_000),
            request_timeout: Duration::from_millis(5_000),
            max_body_bytes: DEFAULT_MAX_BODY_BYTES,
            rate_limit_per_min: 10_000,
            ai_rate_per_min: 10_000,
            persist_conversations: false,
            trust_proxy: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supabase_url_requires_https_or_loopback() {
        assert!(valid_supabase_url(
            "https://wzvslyabhizsiggurwdq.supabase.co"
        ));
        assert!(valid_supabase_url("http://127.0.0.1:54321"));
        assert!(valid_supabase_url("http://localhost:54321"));
        assert!(!valid_supabase_url("http://example.com"));
        assert!(!valid_supabase_url("ftp://example.com"));
        assert!(!valid_supabase_url(""));
    }

    #[test]
    fn debug_never_leaks_secret_values() {
        let settings = Settings::for_tests();
        let text = format!("{settings:?}");
        assert!(
            !text.contains("test-anon-key"),
            "anon key bị lộ trong Debug"
        );
        assert!(
            !text.contains("test-service-key"),
            "service key bị lộ trong Debug"
        );
        assert!(
            !text.contains("test-provider-key"),
            "khoá AI bị lộ trong Debug"
        );
        assert!(text.contains("đã đặt"));
    }
}

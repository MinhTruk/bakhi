// ===========================================================================
// Bá Khí — Rust backend · providers/mod.rs
//
// Một interface provider duy nhất cho AI Tutor. Đổi nhà cung cấp không phải
// sửa dịch vụ AI, route hay frontend.
//
// Bảo mật:
//   * Khoá API chỉ đọc từ biến môi trường máy chủ (cùng tên với Edge Function).
//   * Phản hồi lỗi chỉ chứa MÃ LỖI + thông điệp tiếng Việt; chi tiết thô của
//     provider được lọc khoá và chỉ dùng cho log chẩn đoán nội bộ.
// ===========================================================================

pub mod gemini;
pub mod openai;

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::config::Settings;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Provider {
    Groq,
    Google,
    OpenAi,
    Cerebras,
    OpenRouter,
    Mistral,
    DeepSeek,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocol {
    /// `/chat/completions` tương thích OpenAI.
    OpenAi,
    /// `generateContent` của Google Generative Language.
    Google,
}

impl Provider {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_lowercase().as_str() {
            "groq" => Some(Self::Groq),
            "google" => Some(Self::Google),
            "openai" => Some(Self::OpenAi),
            "cerebras" => Some(Self::Cerebras),
            "openrouter" => Some(Self::OpenRouter),
            "mistral" => Some(Self::Mistral),
            "deepseek" => Some(Self::DeepSeek),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Groq => "groq",
            Self::Google => "google",
            Self::OpenAi => "openai",
            Self::Cerebras => "cerebras",
            Self::OpenRouter => "openrouter",
            Self::Mistral => "mistral",
            Self::DeepSeek => "deepseek",
            Self::Custom => "custom",
        }
    }

    pub fn protocol(self) -> Protocol {
        match self {
            Self::Google => Protocol::Google,
            _ => Protocol::OpenAi,
        }
    }

    pub fn base_url(self) -> &'static str {
        match self {
            Self::Groq => "https://api.groq.com/openai/v1",
            Self::Google => "https://generativelanguage.googleapis.com",
            Self::OpenAi => "https://api.openai.com/v1",
            Self::Cerebras => "https://api.cerebras.ai/v1",
            Self::OpenRouter => "https://openrouter.ai/api/v1",
            Self::Mistral => "https://api.mistral.ai/v1",
            Self::DeepSeek => "https://api.deepseek.com/v1",
            Self::Custom => "",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Clone)]
pub struct ProviderRequest {
    pub provider: Provider,
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatTurn>,
    pub max_tokens: u32,
    pub temperature: f32,
    pub api_key: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Usage {
    pub input: u32,
    pub output: u32,
    pub total: u32,
    pub estimated: bool,
}

#[derive(Debug, Clone)]
pub struct ProviderResult {
    pub text: String,
    pub provider: Provider,
    pub model: String,
    pub usage: Usage,
    pub finish_reason: String,
    /// true khi chạy provider giả lập (chỉ kiểm thử).
    pub mock: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiErrorCode {
    AiDisabled,
    NoKey,
    Auth,
    ModelNotFound,
    RateLimit,
    Quota,
    Timeout,
    ProviderDown,
    EmptyResponse,
    BadConfig,
    Unknown,
}

impl AiErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AiDisabled => "AI_DISABLED",
            Self::NoKey => "NO_KEY",
            Self::Auth => "AUTH",
            Self::ModelNotFound => "MODEL_NOT_FOUND",
            Self::RateLimit => "RATE_LIMIT",
            Self::Quota => "QUOTA",
            Self::Timeout => "TIMEOUT",
            Self::ProviderDown => "PROVIDER_DOWN",
            Self::EmptyResponse => "EMPTY_RESPONSE",
            Self::BadConfig => "BAD_CONFIG",
            Self::Unknown => "UNKNOWN",
        }
    }

    /// Thông điệp cho học sinh — giống hệt Edge Function để giao diện không đổi.
    pub fn message(self) -> &'static str {
        match self {
            Self::AiDisabled => "Trợ lý AI đang tạm tắt. Bạn vẫn học bình thường được ở các trang bài học.",
            Self::NoKey => "Trợ lý AI chưa được cấu hình khoá API. Ban quản trị cần thêm khoá trong Supabase Secrets.",
            Self::Auth => "Khoá API của trợ lý AI không hợp lệ hoặc đã bị thu hồi.",
            Self::ModelNotFound => "Mô hình AI đang cấu hình không còn khả dụng. Ban quản trị cần chọn mô hình khác.",
            Self::RateLimit => "Trợ lý AI đang nhận quá nhiều yêu cầu. Bạn thử lại sau ít phút nhé.",
            Self::Quota => "Trợ lý AI đã hết hạn mức sử dụng của nhà cung cấp. Bạn thử lại sau nhé.",
            Self::Timeout => "Trợ lý AI phản hồi quá lâu. Bạn thử lại giúp mình nhé.",
            Self::ProviderDown => "Dịch vụ AI tạm thời không phản hồi. Bạn vẫn học bình thường được ở các trang bài học.",
            Self::EmptyResponse => "Trợ lý AI không trả về nội dung. Bạn thử diễn đạt lại câu hỏi nhé.",
            Self::BadConfig => "Cấu hình trợ lý AI chưa đúng. Ban quản trị kiểm tra lại nhà cung cấp và mô hình.",
            Self::Unknown => "Trợ lý AI trả về lỗi không xác định.",
        }
    }

    /// Chỉ lỗi tạm thời mới đáng thử lại / chuyển dự phòng.
    pub fn retryable(self) -> bool {
        matches!(
            self,
            Self::Timeout | Self::ProviderDown | Self::RateLimit | Self::EmptyResponse
        )
    }
}

#[derive(Debug, Clone)]
pub struct ProviderError {
    pub code: AiErrorCode,
    /// Mã HTTP của provider (nếu có) — cho nhật ký nội bộ.
    pub status: Option<u16>,
    pub provider: Provider,
    /// Đã lọc khoá, tối đa 400 ký tự — KHÔNG trả về client.
    pub detail: String,
}

impl ProviderError {
    pub fn new(code: AiErrorCode, provider: Provider) -> Self {
        Self {
            code,
            status: None,
            provider,
            detail: String::new(),
        }
    }

    pub fn with_status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }

    pub fn with_detail(mut self, raw: &str) -> Self {
        self.detail = sanitize_detail(raw);
        self
    }

    pub fn retryable(&self) -> bool {
        self.code.retryable()
    }
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.code.as_str(), self.provider.as_str())
    }
}

impl std::error::Error for ProviderError {}

const SECRET_PREFIXES: [&str; 6] = ["AIza", "gsk_", "csk-", "sk-", "AQ.", "eyJ"];

/// Lọc chuỗi chẩn đoán: che mọi chuỗi giống khoá, gộp khoảng trắng, cắt 400 ký tự.
pub fn sanitize_detail(raw: &str) -> String {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = String::with_capacity(collapsed.len());
    let mut index = 0usize;
    while index < collapsed.len() {
        let rest = &collapsed[index..];
        match SECRET_PREFIXES.iter().find(|p| rest.starts_with(**p)) {
            Some(prefix) => {
                let mut end = index + prefix.len();
                while end < collapsed.len() {
                    let ch = collapsed[end..].chars().next().unwrap_or(' ');
                    if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' {
                        end += ch.len_utf8();
                    } else {
                        break;
                    }
                }
                out.push_str("***");
                index = end;
            }
            None => {
                let ch = rest.chars().next().unwrap_or(' ');
                out.push(ch);
                index += ch.len_utf8();
            }
        }
    }
    out.chars().take(400).collect()
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn generate(&self, request: ProviderRequest) -> Result<ProviderResult, ProviderError>;
}

/// Bộ provider dùng chung một HTTP client (tái sử dụng kết nối).
pub struct ProviderRegistry {
    providers: HashMap<Provider, Arc<dyn AiProvider>>,
}

impl ProviderRegistry {
    pub fn build(http: &reqwest::Client, settings: &Settings) -> Self {
        let timeout = settings.ai_timeout;
        let mut providers: HashMap<Provider, Arc<dyn AiProvider>> = HashMap::new();

        for provider in [
            Provider::Groq,
            Provider::OpenAi,
            Provider::Cerebras,
            Provider::OpenRouter,
            Provider::Mistral,
            Provider::DeepSeek,
            Provider::Custom,
        ] {
            let mut base = provider.base_url().to_string();
            if let Some(over) = &settings.ai_base_url {
                base = over.clone();
            }
            providers.insert(
                provider,
                Arc::new(openai::OpenAiCompatible::new(
                    http.clone(),
                    provider,
                    base,
                    timeout,
                )),
            );
        }

        let google_base = settings
            .ai_base_url
            .clone()
            .unwrap_or_else(|| Provider::Google.base_url().to_string());
        providers.insert(
            Provider::Google,
            Arc::new(gemini::Gemini::new(http.clone(), google_base, timeout)),
        );

        Self { providers }
    }

    pub fn get(&self, provider: Provider) -> Option<Arc<dyn AiProvider>> {
        self.providers.get(&provider).cloned()
    }
}

/// Ước lượng token khi provider không trả usage (~4 ký tự/token).
pub fn estimate_tokens(text: &str) -> u32 {
    ((text.chars().count() as f32 / 4.0).ceil() as u32).max(1)
}

/// Kiểm tra tên model theo đúng ràng buộc của database.
pub fn model_is_valid(model: &str) -> bool {
    !model.is_empty()
        && model.len() <= 80
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '/' | '-'))
}

/// Đọc usage chung, ước lượng khi thiếu.
pub(crate) fn usage_from(
    reported_in: Option<u64>,
    reported_out: Option<u64>,
    fallback_in: &str,
    text: &str,
) -> Usage {
    let input = reported_in
        .map(|v| v as u32)
        .filter(|v| *v > 0)
        .unwrap_or_else(|| estimate_tokens(fallback_in));
    let output = reported_out
        .map(|v| v as u32)
        .filter(|v| *v > 0)
        .unwrap_or_else(|| estimate_tokens(text));
    Usage {
        input,
        output,
        total: input.saturating_add(output),
        estimated: reported_in.is_none() || reported_out.is_none(),
    }
}

/// Provider giả lập cho kiểm thử — chỉ bật bằng `AI_TUTOR_MOCK=1`.
pub struct MockProvider;

#[async_trait]
impl AiProvider for MockProvider {
    async fn generate(&self, request: ProviderRequest) -> Result<ProviderResult, ProviderError> {
        let last = request
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();
        let text = format!(
            "[MOCK] Trợ lý AI giả lập đang bật. Nội dung nhận được: \"{}\".",
            last.chars().take(200).collect::<String>()
        );
        Ok(ProviderResult {
            text,
            provider: Provider::Custom,
            model: "mock".to_string(),
            usage: Usage {
                input: estimate_tokens(&request.system),
                output: estimate_tokens(&last),
                total: 0,
                estimated: true,
            },
            finish_reason: "mock".to_string(),
            mock: true,
        })
    }
}

/// Phân loại lỗi HTTP của provider — không lộ body thô.
pub(crate) fn classify_http(status: u16, body: &str, provider: Provider) -> ProviderError {
    let lower = body.to_lowercase();
    let code = if status == 401 || status == 403 {
        AiErrorCode::Auth
    } else if status == 404 {
        AiErrorCode::ModelNotFound
    } else if status == 429 {
        if lower.contains("quota") || lower.contains("billing") || lower.contains("insufficient") {
            AiErrorCode::Quota
        } else {
            AiErrorCode::RateLimit
        }
    } else if status >= 500 {
        AiErrorCode::ProviderDown
    } else {
        AiErrorCode::Unknown
    };
    ProviderError::new(code, provider)
        .with_status(status)
        .with_detail(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_common_key_shapes() {
        let raw = "error: invalid api key gsk_abcdefghijklmnop12345 for model";
        let cleaned = sanitize_detail(raw);
        assert!(!cleaned.contains("gsk_abcdefghijklmnop12345"));
        assert!(cleaned.contains("***"));

        let jwt = "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature rejected";
        assert!(!sanitize_detail(jwt).contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    }

    #[test]
    fn detail_is_truncated_and_whitespace_collapsed() {
        let long = "x ".repeat(500);
        let cleaned = sanitize_detail(&long);
        assert!(cleaned.chars().count() <= 400);
        assert!(!cleaned.contains("  "));
    }

    #[test]
    fn retryable_codes_match_edge_function_rules() {
        assert!(AiErrorCode::Timeout.retryable());
        assert!(AiErrorCode::ProviderDown.retryable());
        assert!(AiErrorCode::RateLimit.retryable());
        assert!(!AiErrorCode::Auth.retryable());
        assert!(!AiErrorCode::ModelNotFound.retryable());
        assert!(!AiErrorCode::BadConfig.retryable());
    }

    #[test]
    fn model_names_follow_database_constraint() {
        assert!(model_is_valid("openai/gpt-oss-20b"));
        assert!(model_is_valid("gemini-3.8-flash"));
        assert!(!model_is_valid(""));
        assert!(!model_is_valid("bad model name"));
        assert!(!model_is_valid("x".repeat(81).as_str()));
    }

    #[test]
    fn classify_maps_http_status_to_codes() {
        assert_eq!(
            classify_http(401, "", Provider::Groq).code,
            AiErrorCode::Auth
        );
        assert_eq!(
            classify_http(404, "", Provider::Groq).code,
            AiErrorCode::ModelNotFound
        );
        assert_eq!(
            classify_http(429, "", Provider::Groq).code,
            AiErrorCode::RateLimit
        );
        assert_eq!(
            classify_http(429, "quota exceeded", Provider::Groq).code,
            AiErrorCode::Quota
        );
        assert_eq!(
            classify_http(503, "", Provider::Groq).code,
            AiErrorCode::ProviderDown
        );
    }
}

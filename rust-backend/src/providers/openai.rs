// ===========================================================================
// Bá Khí — Rust backend · providers/openai.rs
//
// Một adapter dùng chung cho mọi provider theo giao thức OpenAI
// (/chat/completions): Groq, OpenAI, Cerebras, OpenRouter, Mistral, DeepSeek
// và provider "custom".
// ===========================================================================

use std::time::Duration;

use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;

use super::{
    classify_http, model_is_valid, parse_retry_after, usage_from_parts, AiErrorCode, AiProvider,
    Provider, ProviderError, ProviderRequest, ProviderResult,
};

pub struct OpenAiCompatible {
    http: reqwest::Client,
    provider: Provider,
    base_url: String,
    timeout: Duration,
}

impl OpenAiCompatible {
    pub fn new(
        http: reqwest::Client,
        provider: Provider,
        base_url: String,
        timeout: Duration,
    ) -> Self {
        Self {
            http,
            provider,
            base_url: base_url.trim_end_matches('/').to_string(),
            timeout,
        }
    }
}

/// Nội dung trả về của provider dạng văn bản hoặc mảng part. Ghép trong MỘT
/// buffer có sẵn (không tạo Vec<&str> + join + trim trung gian).
fn text_of(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Array(parts)) => {
            let mut out = String::new();
            for part in parts {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    out.push_str(text);
                }
            }
            let trimmed_len = out.trim().len();
            if trimmed_len == out.len() {
                out
            } else {
                out.trim().to_string()
            }
        }
        _ => String::new(),
    }
}

/// Body gửi `/chat/completions`. Serialize trực tiếp từ struct mượn dữ liệu —
/// không dựng cây `serde_json::Value` cho từng lượt hội thoại.
#[derive(Serialize)]
struct WireMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    messages: Vec<WireMessage<'a>>,
    max_tokens: u32,
    temperature: f32,
    stream: bool,
}

#[async_trait]
impl AiProvider for OpenAiCompatible {
    async fn generate(
        &self,
        request: ProviderRequest<'_>,
    ) -> Result<ProviderResult, ProviderError> {
        if self.base_url.is_empty() {
            return Err(ProviderError::new(AiErrorCode::BadConfig, self.provider));
        }
        if !model_is_valid(request.model) {
            return Err(ProviderError::new(AiErrorCode::BadConfig, self.provider));
        }
        if request.api_key.trim().is_empty() {
            return Err(ProviderError::new(AiErrorCode::NoKey, self.provider));
        }

        let url = format!("{}/chat/completions", self.base_url);
        // Cấp phát một lần đúng kích thước: system + toàn bộ lượt hội thoại.
        // Các chuỗi được mượn từ request, không sao chép nội dung.
        let mut messages: Vec<WireMessage<'_>> = Vec::with_capacity(request.messages.len() + 1);
        messages.push(WireMessage {
            role: "system",
            content: request.system,
        });
        messages.extend(request.messages.iter().map(|turn| WireMessage {
            role: &turn.role,
            content: &turn.content,
        }));
        let body = WireRequest {
            model: request.model,
            messages,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
            stream: false,
        };

        let response = self
            .http
            .post(&url)
            .bearer_auth(request.api_key.trim())
            .json(&body)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|err| {
                let code = if err.is_timeout() {
                    AiErrorCode::Timeout
                } else {
                    AiErrorCode::ProviderDown
                };
                ProviderError::new(code, self.provider)
            })?;

        let status = response.status();
        if !status.is_success() {
            // Đọc Retry-After TRƯỚC khi tiêu thụ body.
            let retry_after = parse_retry_after(
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok()),
            );
            let text = response.text().await.unwrap_or_default();
            return Err(
                classify_http(status.as_u16(), &text, self.provider).with_retry_after(retry_after)
            );
        }

        let raw: Value = response
            .json()
            .await
            .map_err(|_| ProviderError::new(AiErrorCode::EmptyResponse, self.provider))?;

        // Mượn trực tiếp từ `raw`: không clone toàn bộ choice/usage.
        let choice = raw.get("choices").and_then(|c| c.get(0));
        let text = choice
            .and_then(|c| c.get("message"))
            .map(text_of)
            .unwrap_or_default();

        if text.is_empty() {
            return Err(ProviderError::new(
                AiErrorCode::EmptyResponse,
                self.provider,
            ));
        }

        let usage = raw.get("usage");
        let prompt_tokens = usage
            .and_then(|u| u.get("prompt_tokens"))
            .and_then(Value::as_u64);
        let completion_tokens = usage
            .and_then(|u| u.get("completion_tokens"))
            .and_then(Value::as_u64);
        let reported_model = raw
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(request.model)
            .to_string();

        let result_usage = usage_from_parts(
            prompt_tokens,
            completion_tokens,
            &[request.system, request.model],
            &text,
        );

        Ok(ProviderResult {
            text,
            provider: self.provider,
            model: reported_model,
            usage: result_usage,
            finish_reason: choice
                .and_then(|c| c.get("finish_reason"))
                .and_then(Value::as_str)
                .unwrap_or("stop")
                .to_string(),
            mock: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request<'a>(model: &'a str, key: &'a str) -> ProviderRequest<'a> {
        ProviderRequest {
            provider: Provider::Groq,
            model,
            system: "system",
            messages: &[],
            max_tokens: 128,
            temperature: 0.4,
            api_key: key,
        }
    }

    #[tokio::test]
    async fn rejects_missing_key_before_calling_network() {
        let adapter = OpenAiCompatible::new(
            reqwest::Client::new(),
            Provider::Groq,
            "http://127.0.0.1:1".to_string(),
            Duration::from_millis(500),
        );
        let error = adapter
            .generate(request("openai/gpt-oss-20b", ""))
            .await
            .unwrap_err();
        assert_eq!(error.code, AiErrorCode::NoKey);
    }

    #[tokio::test]
    async fn rejects_invalid_model_before_calling_network() {
        let adapter = OpenAiCompatible::new(
            reqwest::Client::new(),
            Provider::Groq,
            "http://127.0.0.1:1".to_string(),
            Duration::from_millis(500),
        );
        let error = adapter
            .generate(request("bad model!", "key-1234567890"))
            .await
            .unwrap_err();
        assert_eq!(error.code, AiErrorCode::BadConfig);
    }

    #[test]
    fn parses_string_and_array_content() {
        let string = json!({ "content": "  xin chào  " });
        assert_eq!(text_of(&string), "xin chào");
        let parts = json!({ "content": [{ "text": "a" }, { "text": "b" }] });
        assert_eq!(text_of(&parts), "ab");
    }
}

// ===========================================================================
// Bá Khí — Rust backend · providers/openai.rs
//
// Một adapter dùng chung cho mọi provider theo giao thức OpenAI
// (/chat/completions): Groq, OpenAI, Cerebras, OpenRouter, Mistral, DeepSeek
// và provider "custom".
// ===========================================================================

use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use super::{
    classify_http, model_is_valid, parse_retry_after, usage_from, AiErrorCode, AiProvider,
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

fn text_of(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join("")
            .trim()
            .to_string(),
        _ => String::new(),
    }
}

#[async_trait]
impl AiProvider for OpenAiCompatible {
    async fn generate(&self, request: ProviderRequest) -> Result<ProviderResult, ProviderError> {
        if self.base_url.is_empty() {
            return Err(ProviderError::new(AiErrorCode::BadConfig, self.provider));
        }
        if !model_is_valid(&request.model) {
            return Err(ProviderError::new(AiErrorCode::BadConfig, self.provider));
        }
        if request.api_key.trim().is_empty() {
            return Err(ProviderError::new(AiErrorCode::NoKey, self.provider));
        }

        let url = format!("{}/chat/completions", self.base_url);
        // Cấp phát một lần đúng kích thước: system + toàn bộ lượt hội thoại.
        let mut messages: Vec<Value> = Vec::with_capacity(request.messages.len() + 1);
        messages.push(json!({ "role": "system", "content": request.system }));
        for turn in &request.messages {
            messages.push(json!({ "role": turn.role, "content": turn.content }));
        }
        let body = json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": false
        });

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

        let choice = raw
            .get("choices")
            .and_then(|c| c.get(0))
            .cloned()
            .unwrap_or(Value::Null);
        let text = choice.get("message").map(text_of).unwrap_or_default();

        if text.is_empty() {
            return Err(ProviderError::new(
                AiErrorCode::EmptyResponse,
                self.provider,
            ));
        }

        let usage = raw.get("usage").cloned().unwrap_or(Value::Null);
        let prompt_tokens = usage.get("prompt_tokens").and_then(|v| v.as_u64());
        let completion_tokens = usage.get("completion_tokens").and_then(|v| v.as_u64());
        let reported_model = raw
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or(&request.model)
            .to_string();

        let result_usage = usage_from(
            prompt_tokens,
            completion_tokens,
            &format!("{}{}", request.system, request.model),
            &text,
        );

        Ok(ProviderResult {
            text,
            provider: self.provider,
            model: reported_model,
            usage: result_usage,
            finish_reason: choice
                .get("finish_reason")
                .and_then(|v| v.as_str())
                .unwrap_or("stop")
                .to_string(),
            mock: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ChatTurn;

    fn request(model: &str, key: &str) -> ProviderRequest {
        ProviderRequest {
            provider: Provider::Groq,
            model: model.to_string(),
            system: "system".to_string(),
            messages: vec![ChatTurn {
                role: "user".into(),
                content: "xin chào".into(),
            }],
            max_tokens: 128,
            temperature: 0.4,
            api_key: key.to_string(),
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

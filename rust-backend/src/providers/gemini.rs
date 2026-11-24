// ===========================================================================
// Bá Khí — Rust backend · providers/gemini.rs
//
// Adapter cho Google Generative Language (Gemini). Khác OpenAI ở hình dạng
// request/response, nhưng đầu ra vẫn quy về ProviderResult.
// ===========================================================================

use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use super::{
    classify_http, model_is_valid, parse_retry_after, usage_from, AiErrorCode, AiProvider,
    Provider, ProviderError, ProviderRequest, ProviderResult,
};

pub struct Gemini {
    http: reqwest::Client,
    base_url: String,
    timeout: Duration,
}

impl Gemini {
    pub fn new(http: reqwest::Client, base_url: String, timeout: Duration) -> Self {
        let trimmed = base_url.trim_end_matches('/').to_string();
        let base = trimmed
            .strip_suffix("/v1beta")
            .unwrap_or(&trimmed)
            .to_string();
        Self {
            http,
            base_url: base,
            timeout,
        }
    }

    fn endpoint(&self, model: &str) -> Result<String, ProviderError> {
        if self.base_url.is_empty() {
            return Err(ProviderError::new(AiErrorCode::BadConfig, Provider::Google));
        }
        Ok(format!(
            "{}/v1beta/models/{}:generateContent",
            self.base_url,
            urlencode_segment(model)
        ))
    }
}

/// Mã hoá tên model cho segment URL (giữ `.` `-` `_` `/` khi an toàn).
fn urlencode_segment(raw: &str) -> String {
    raw.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ':') {
                ch.to_string()
            } else {
                format!("%{:02X}", ch as u32)
            }
        })
        .collect()
}

#[async_trait]
impl AiProvider for Gemini {
    async fn generate(&self, request: ProviderRequest) -> Result<ProviderResult, ProviderError> {
        if !model_is_valid(&request.model) {
            return Err(ProviderError::new(AiErrorCode::BadConfig, Provider::Google));
        }
        if request.api_key.trim().is_empty() {
            return Err(ProviderError::new(AiErrorCode::NoKey, Provider::Google));
        }
        let url = self.endpoint(&request.model)?;

        let mut contents: Vec<Value> = Vec::with_capacity(request.messages.len());
        contents.extend(request.messages.iter().map(|turn| {
            json!({
                "role": if turn.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": turn.content }]
            })
        }));

        let body = json!({
            "systemInstruction": { "parts": [{ "text": request.system }] },
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens
            },
            // AI Tutor chỉ trả lời văn bản: không cho model tự gọi công cụ.
            "toolConfig": { "functionCallingConfig": { "mode": "NONE" } }
        });

        let response = self
            .http
            .post(&url)
            .header("x-goog-api-key", request.api_key.trim())
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
                ProviderError::new(code, Provider::Google)
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
            return Err(classify_http(status.as_u16(), &text, Provider::Google)
                .with_retry_after(retry_after));
        }

        let raw: Value = response
            .json()
            .await
            .map_err(|_| ProviderError::new(AiErrorCode::EmptyResponse, Provider::Google))?;

        let candidate = raw
            .get("candidates")
            .and_then(|c| c.get(0))
            .cloned()
            .unwrap_or(Value::Null);
        let text = candidate
            .get("content")
            .and_then(|c| c.get("parts"))
            .and_then(|p| p.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(|v| v.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
                    .trim()
                    .to_string()
            })
            .unwrap_or_default();

        if text.is_empty() {
            return Err(ProviderError::new(
                AiErrorCode::EmptyResponse,
                Provider::Google,
            ));
        }

        let meta = raw.get("usageMetadata").cloned().unwrap_or(Value::Null);
        let usage = usage_from(
            meta.get("promptTokenCount").and_then(|v| v.as_u64()),
            meta.get("candidatesTokenCount").and_then(|v| v.as_u64()),
            &format!("{}{}", request.system, request.model),
            &text,
        );

        Ok(ProviderResult {
            text,
            provider: Provider::Google,
            model: request.model,
            usage,
            finish_reason: candidate
                .get("finishReason")
                .and_then(|v| v.as_str())
                .unwrap_or("STOP")
                .to_string(),
            mock: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_v1beta_suffix_once() {
        let gemini = Gemini::new(
            reqwest::Client::new(),
            "https://generativelanguage.googleapis.com/v1beta".to_string(),
            Duration::from_secs(1),
        );
        assert_eq!(gemini.base_url, "https://generativelanguage.googleapis.com");
    }

    #[test]
    fn builds_model_endpoint() {
        let gemini = Gemini::new(
            reqwest::Client::new(),
            "https://example.test".to_string(),
            Duration::from_secs(1),
        );
        assert_eq!(
            gemini.endpoint("gemini-3.8-flash").unwrap(),
            "https://example.test/v1beta/models/gemini-3.8-flash:generateContent"
        );
    }
}

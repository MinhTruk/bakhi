// ===========================================================================
// Bá Khí — Rust backend · providers/gemini.rs
//
// Adapter cho Google Generative Language (Gemini). Khác OpenAI ở hình dạng
// request/response, nhưng đầu ra vẫn quy về ProviderResult.
// ===========================================================================

use std::time::Duration;

use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;

use super::{
    classify_http, model_is_valid, parse_retry_after, usage_from_parts, AiErrorCode, AiProvider,
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

/// Body `generateContent`. Serialize trực tiếp từ struct mượn dữ liệu — không
/// dựng cây `Value` với một map cho mỗi lượt hội thoại.
#[derive(Serialize)]
struct Part<'a> {
    text: &'a str,
}

#[derive(Serialize)]
struct Content<'a> {
    role: &'a str,
    parts: [Part<'a>; 1],
}

#[derive(Serialize)]
struct SystemInstruction<'a> {
    parts: [Part<'a>; 1],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    temperature: f32,
    max_output_tokens: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FunctionCallingConfig {
    mode: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolConfig {
    function_calling_config: FunctionCallingConfig,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WireRequest<'a> {
    system_instruction: SystemInstruction<'a>,
    contents: Vec<Content<'a>>,
    generation_config: GenerationConfig,
    tool_config: ToolConfig,
}

#[async_trait]
impl AiProvider for Gemini {
    async fn generate(
        &self,
        request: ProviderRequest<'_>,
    ) -> Result<ProviderResult, ProviderError> {
        if !model_is_valid(request.model) {
            return Err(ProviderError::new(AiErrorCode::BadConfig, Provider::Google));
        }
        if request.api_key.trim().is_empty() {
            return Err(ProviderError::new(AiErrorCode::NoKey, Provider::Google));
        }
        let url = self.endpoint(request.model)?;

        let contents: Vec<Content<'_>> = request
            .messages
            .iter()
            .map(|turn| Content {
                role: if turn.role == "assistant" {
                    "model"
                } else {
                    "user"
                },
                parts: [Part {
                    text: &turn.content,
                }],
            })
            .collect();

        let body = WireRequest {
            system_instruction: SystemInstruction {
                parts: [Part {
                    text: request.system,
                }],
            },
            contents,
            generation_config: GenerationConfig {
                temperature: request.temperature,
                max_output_tokens: request.max_tokens,
            },
            // AI Tutor chỉ trả lời văn bản: không cho model tự gọi công cụ.
            tool_config: ToolConfig {
                function_calling_config: FunctionCallingConfig { mode: "NONE" },
            },
        };

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

        // Mượn trực tiếp từ `raw`: không clone toàn bộ candidate.
        let candidate = raw.get("candidates").and_then(|c| c.get(0));
        let text = candidate
            .and_then(|c| c.get("content"))
            .and_then(|c| c.get("parts"))
            .and_then(Value::as_array)
            .map(|parts| {
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
            })
            .unwrap_or_default();

        if text.is_empty() {
            return Err(ProviderError::new(
                AiErrorCode::EmptyResponse,
                Provider::Google,
            ));
        }

        let meta = raw.get("usageMetadata");
        let usage = usage_from_parts(
            meta.and_then(|m| m.get("promptTokenCount"))
                .and_then(Value::as_u64),
            meta.and_then(|m| m.get("candidatesTokenCount"))
                .and_then(Value::as_u64),
            &[request.system, request.model],
            &text,
        );

        Ok(ProviderResult {
            text,
            provider: Provider::Google,
            model: request.model.to_string(),
            usage,
            finish_reason: candidate
                .and_then(|c| c.get("finishReason"))
                .and_then(Value::as_str)
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

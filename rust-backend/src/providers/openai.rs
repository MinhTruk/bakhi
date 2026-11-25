// ===========================================================================
// Bá Khí — Rust backend · providers/openai.rs
//
// Một adapter dùng chung cho mọi provider theo giao thức OpenAI
// (/chat/completions): Groq, OpenAI, Cerebras, OpenRouter, Mistral, DeepSeek
// và provider "custom".
// ===========================================================================

use std::time::{Duration, Instant};

use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::mpsc;

use super::sse::{data_of, SseLines};
use super::{
    classify_http, model_is_valid, parse_retry_after, usage_from_parts, AiErrorCode, AiProvider,
    Provider, ProviderError, ProviderRequest, ProviderResult, StreamEvent,
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
    fn supports_stream(&self) -> bool {
        true
    }

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
            // Response trọn gói: không có mốc token đầu tiên để báo TTFT.
            ttft: None,
        })
    }

    /// 8.7.4 — streaming SSE của giao thức OpenAI (`stream: true`).
    async fn generate_stream(
        &self,
        request: ProviderRequest<'_>,
        tx: mpsc::Sender<StreamEvent>,
    ) -> Result<(), ProviderError> {
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
            stream: true,
        };

        let request_start = Instant::now();
        let mut response = self
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

        let mut sse = SseLines::new();
        let mut text = String::new();
        let mut finish_reason = "stop".to_string();
        let mut ttft: Option<Duration> = None;
        let mut reported_in: Option<u64> = None;
        let mut reported_out: Option<u64> = None;
        let mut saw_done = false;

        while !saw_done {
            // Chờ chunk đầu khác chờ chunk tiếp theo: TTFT timeout bảo vệ
            // người học khỏi provider "im lặng", idle timeout bắt stream chết.
            let wait = if ttft.is_none() {
                request.ttft_timeout
            } else {
                request.idle_timeout
            };
            let next = tokio::select! {
                // Client đã đóng kết nối ⇒ dừng đọc, không giữ tài nguyên.
                _ = tx.closed() => {
                    return Err(ProviderError::new(AiErrorCode::Cancelled, self.provider))
                }
                result = tokio::time::timeout(wait, response.chunk()) => result,
            };
            let bytes = match next {
                Err(_) => return Err(ProviderError::new(AiErrorCode::Timeout, self.provider)),
                Ok(Err(_)) => {
                    return Err(ProviderError::new(AiErrorCode::ProviderDown, self.provider))
                }
                Ok(Ok(None)) => break,
                Ok(Ok(Some(bytes))) => bytes,
            };

            for line in sse.push(&bytes) {
                let Some(data) = data_of(&line) else { continue };
                let data = data.trim();
                if data.is_empty() {
                    continue;
                }
                if data == "[DONE]" {
                    saw_done = true;
                    break;
                }
                let Ok(value) = serde_json::from_str::<Value>(data) else {
                    continue;
                };
                if let Some(usage) = value.get("usage") {
                    reported_in = usage
                        .get("prompt_tokens")
                        .and_then(Value::as_u64)
                        .or(reported_in);
                    reported_out = usage
                        .get("completion_tokens")
                        .and_then(Value::as_u64)
                        .or(reported_out);
                }
                let Some(choice) = value.get("choices").and_then(|c| c.get(0)) else {
                    continue;
                };
                if let Some(reason) = choice.get("finish_reason").and_then(Value::as_str) {
                    if !reason.is_empty() {
                        finish_reason = reason.to_string();
                    }
                }
                let delta = choice
                    .get("delta")
                    .and_then(|d| d.get("content"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if delta.is_empty() {
                    continue;
                }
                if ttft.is_none() {
                    // Chunk nội dung đầu tiên đã tới. Đây là TTFT thật của
                    // provider (không phải thời điểm model tạo token đầu —
                    // provider không cung cấp mốc đó).
                    ttft = Some(request_start.elapsed());
                }
                text.push_str(delta);
                if tx
                    .send(StreamEvent::Delta(delta.to_string()))
                    .await
                    .is_err()
                {
                    return Err(ProviderError::new(AiErrorCode::Cancelled, self.provider));
                }
            }

            if sse.overflow() {
                return Err(ProviderError::new(
                    AiErrorCode::EmptyResponse,
                    self.provider,
                ));
            }
        }

        if text.trim().is_empty() {
            return Err(ProviderError::new(
                AiErrorCode::EmptyResponse,
                self.provider,
            ));
        }

        let usage = usage_from_parts(
            reported_in,
            reported_out,
            &[request.system, request.model],
            &text,
        );
        let result = ProviderResult {
            text,
            provider: self.provider,
            model: request.model.to_string(),
            usage,
            finish_reason,
            mock: false,
            ttft,
        };
        if tx.send(StreamEvent::Done(result)).await.is_err() {
            return Err(ProviderError::new(AiErrorCode::Cancelled, self.provider));
        }
        Ok(())
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
            ttft_timeout: Duration::from_secs(1),
            idle_timeout: Duration::from_secs(1),
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

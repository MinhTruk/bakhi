// ===========================================================================
// Bá Khí — Rust backend · services/ai_service.rs
//
// AI Gateway: tiếp nhận câu hỏi của học sinh, xác thực, áp hạn mức, dựng
// prompt, chạy chuỗi provider (Primary → Fallback), chuẩn hoá phản hồi và ghi
// nhật ký sử dụng.
//
// Nguyên tắc giữ nguyên từ Edge Function 8.5.x:
//   * Không gửi khoá API về client, không log khoá.
//   * Không tin `student_id` từ client — luôn suy ra từ tài khoản đã xác thực.
//   * Lỗi provider chỉ trả mã + thông điệp tiếng Việt.
//   * Thử lại chỉ với lỗi tạm thời; không nhân đôi tin nhắn trong hội thoại.
// ===========================================================================

use std::sync::Arc;
use std::time::Instant;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::config::Settings;
use crate::errors::ApiError;
use crate::middleware::AuthUser;
use crate::providers::{
    AiErrorCode, ChatTurn, MockProvider, Provider, ProviderError, ProviderRequest, ProviderResult,
};
use crate::services::prompts::{
    self, build_system_prompt, output_tokens_for_mode, pick_model, sanitize_context, trim_history,
    trim_history_by_budget, SafeContext, TutorMode,
};
use crate::services::supabase::{urlencode, RestAuth, SupabaseClient};
use crate::AppState;

pub const MAX_USER_MESSAGE: usize = 4000;
const DEDUPE_WINDOW_MS: i64 = 12_000;
const DEFAULT_MAX_INPUT_TOKENS: u32 = 3000;

#[derive(Debug, Clone, Deserialize)]
pub struct ChatRequest {
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub conversation_mode: Option<String>,
    #[serde(default)]
    pub context: Option<Value>,
    #[serde(default)]
    pub retry: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub fallback_provider: String,
    #[serde(default)]
    pub fallback_model: String,
    #[serde(default = "default_true")]
    pub routing_enabled: bool,
    #[serde(default)]
    pub model_simple: String,
    #[serde(default)]
    pub model_complex: String,
    #[serde(default)]
    pub model_practice: String,
    #[serde(default = "default_context_messages")]
    pub max_context_messages: u32,
    #[serde(default = "default_output_tokens")]
    pub max_output_tokens: u32,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub daily_requests: u32,
    #[serde(default)]
    pub daily_tokens: u32,
    #[serde(default = "default_true")]
    pub save_history: bool,
    #[serde(default = "default_true")]
    pub use_lesson_context: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub allowed_modes: Vec<String>,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_max_input_tokens")]
    pub max_input_tokens: u32,
}

fn default_true() -> bool {
    true
}
fn default_context_messages() -> u32 {
    12
}
fn default_output_tokens() -> u32 {
    2048
}
fn default_timeout() -> u64 {
    30_000
}
fn default_language() -> String {
    "vi".to_string()
}
fn default_max_input_tokens() -> u32 {
    DEFAULT_MAX_INPUT_TOKENS
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            provider: "groq".to_string(),
            model: "openai/gpt-oss-20b".to_string(),
            fallback_provider: "google".to_string(),
            fallback_model: "gemini-3.8-flash".to_string(),
            routing_enabled: true,
            model_simple: String::new(),
            model_complex: String::new(),
            model_practice: String::new(),
            max_context_messages: default_context_messages(),
            max_output_tokens: default_output_tokens(),
            timeout_ms: default_timeout(),
            daily_requests: 0,
            daily_tokens: 0,
            save_history: true,
            use_lesson_context: true,
            language: default_language(),
            allowed_modes: prompts::MODE_IDS
                .iter()
                .map(|m| m.as_str().to_string())
                .collect(),
            system_prompt: String::new(),
            max_input_tokens: default_max_input_tokens(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelRoute {
    #[serde(default)]
    pub position: u32,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub key_ref: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone)]
struct Candidate {
    provider: Provider,
    model: String,
    api_key: String,
    label: String,
}

#[derive(Debug, Clone)]
pub struct Attempt {
    pub provider: Provider,
    pub model: String,
    pub ok: bool,
    pub code: Option<AiErrorCode>,
    pub latency_ms: u64,
}

pub struct GatewayOutcome {
    pub result: ProviderResult,
    pub route_label: String,
    pub fell_back: bool,
    pub attempts: Vec<Attempt>,
    pub latency_ms: u64,
    pub max_tokens: u32,
    pub target_tokens: u32,
    pub deep: bool,
}

#[derive(Clone)]
pub struct AiService {
    pub settings: Arc<Settings>,
    pub supabase: Arc<SupabaseClient>,
    pub state: AppState,
}

impl AiService {
    pub fn new(state: AppState) -> Self {
        Self {
            settings: state.settings.clone(),
            supabase: state.supabase.clone(),
            state,
        }
    }

    async fn load_settings(&self) -> Result<AiSettings, ApiError> {
        let rows = self
            .supabase
            .select("ai_settings?id=eq.1&select=*&limit=1", RestAuth::Service)
            .await?;
        let row = rows
            .as_array()
            .and_then(|list| list.first())
            .cloned()
            .unwrap_or(Value::Null);
        if row.is_null() {
            // Bảng cấu hình chưa có dòng 1 ⇒ dùng mặc định an toàn.
            return Ok(AiSettings::default());
        }
        serde_json::from_value(row).map_err(|_| {
            ApiError::service_unavailable("BAD_CONFIG", "Cấu hình trợ lý AI không đọc được.")
        })
    }

    async fn load_routes(&self) -> Vec<ModelRoute> {
        let rows = self
            .supabase
            .select(
                "ai_model_routes?enabled=eq.true&order=position.asc&select=*&limit=20",
                RestAuth::Service,
            )
            .await;
        match rows {
            Ok(Value::Array(list)) => list
                .into_iter()
                .filter_map(|row| serde_json::from_value::<ModelRoute>(row).ok())
                .filter(|route| route.enabled && !route.model.trim().is_empty())
                .collect(),
            _ => Vec::new(),
        }
    }

    fn key_for(&self, role_primary: bool, route: &ModelRoute) -> String {
        if !route.api_key.trim().is_empty() {
            return route.api_key.trim().to_string();
        }
        let key_ref = route.key_ref.trim();
        if !key_ref.is_empty() {
            if let Some(value) = self.settings.ai_extra_keys.get(key_ref) {
                return value.trim().to_string();
            }
        }
        let key = if role_primary {
            self.settings.ai_primary_key.clone()
        } else {
            self.settings.ai_fallback_key.clone()
        };
        key.unwrap_or_default().trim().to_string()
    }

    fn candidates(&self, settings: &AiSettings, routes: &[ModelRoute]) -> Vec<Candidate> {
        if !routes.is_empty() {
            return routes
                .iter()
                .take(6)
                .map(|route| Candidate {
                    provider: Provider::parse(&route.provider).unwrap_or(Provider::Groq),
                    model: route.model.trim().to_string(),
                    api_key: self.key_for(route.position == 0, route),
                    label: if route.label.trim().is_empty() {
                        format!("{} #{}", route.provider, route.position + 1)
                    } else {
                        route.label.clone()
                    },
                })
                .collect();
        }

        let mut list = vec![Candidate {
            provider: Provider::parse(&settings.provider).unwrap_or(Provider::Groq),
            model: settings.model.trim().to_string(),
            api_key: self.key_for(
                true,
                &ModelRoute {
                    position: 0,
                    label: String::new(),
                    provider: settings.provider.clone(),
                    model: settings.model.clone(),
                    key_ref: String::new(),
                    api_key: String::new(),
                    enabled: true,
                },
            ),
            label: "Primary".to_string(),
        }];
        if !settings.fallback_model.trim().is_empty() {
            list.push(Candidate {
                provider: Provider::parse(&settings.fallback_provider).unwrap_or(Provider::Google),
                model: settings.fallback_model.trim().to_string(),
                api_key: self.key_for(
                    false,
                    &ModelRoute {
                        position: 1,
                        label: String::new(),
                        provider: settings.fallback_provider.clone(),
                        model: settings.fallback_model.clone(),
                        key_ref: String::new(),
                        api_key: String::new(),
                        enabled: true,
                    },
                ),
                label: "Fallback".to_string(),
            });
        }
        list
    }

    /// Chạy chuỗi provider: thử lại lỗi tạm thời rồi chuyển provider kế tiếp.
    pub async fn run_chain(
        &self,
        settings: &AiSettings,
        routes: &[ModelRoute],
        system: &str,
        turns: &[ChatTurn],
        mode: TutorMode,
        message: &str,
    ) -> Result<GatewayOutcome, (ProviderError, Vec<Attempt>)> {
        let started = Instant::now();
        let (max_tokens, target_tokens, deep) =
            output_tokens_for_mode(mode, message, settings.max_output_tokens.max(128));
        let candidates = self.candidates(settings, routes);
        let timeout = std::time::Duration::from_millis(settings.timeout_ms.clamp(5_000, 120_000));

        let mut attempts: Vec<Attempt> = Vec::new();
        let mut last_error: Option<ProviderError> = None;

        for (index, candidate) in candidates.iter().enumerate() {
            let provider_impl = if self.settings.ai_mock {
                Some(Arc::new(MockProvider) as Arc<dyn crate::providers::AiProvider>)
            } else {
                self.state.providers.get(candidate.provider)
            };
            let Some(provider_impl) = provider_impl else {
                last_error = Some(ProviderError::new(
                    AiErrorCode::BadConfig,
                    candidate.provider,
                ));
                continue;
            };

            for _attempt in 0..=self.settings.ai_max_retries {
                let attempt_start = Instant::now();
                let request = ProviderRequest {
                    provider: candidate.provider,
                    model: candidate.model.clone(),
                    system: system.to_string(),
                    messages: turns.to_vec(),
                    max_tokens,
                    temperature: 0.4,
                    api_key: candidate.api_key.clone(),
                };
                let outcome = tokio::time::timeout(timeout, provider_impl.generate(request)).await;

                match outcome {
                    Err(_) => {
                        let error = ProviderError::new(AiErrorCode::Timeout, candidate.provider);
                        attempts.push(Attempt {
                            provider: candidate.provider,
                            model: candidate.model.clone(),
                            ok: false,
                            code: Some(error.code),
                            latency_ms: attempt_start.elapsed().as_millis() as u64,
                        });
                        last_error = Some(error);
                        // Timeout là lỗi tạm thời: thử lại theo cấu hình.
                    }
                    Ok(Ok(result)) => {
                        attempts.push(Attempt {
                            provider: candidate.provider,
                            model: candidate.model.clone(),
                            ok: true,
                            code: None,
                            latency_ms: attempt_start.elapsed().as_millis() as u64,
                        });
                        return Ok(GatewayOutcome {
                            result,
                            route_label: candidate.label.clone(),
                            fell_back: index > 0,
                            attempts,
                            latency_ms: started.elapsed().as_millis() as u64,
                            max_tokens,
                            target_tokens,
                            deep,
                        });
                    }
                    Ok(Err(error)) => {
                        attempts.push(Attempt {
                            provider: candidate.provider,
                            model: candidate.model.clone(),
                            ok: false,
                            code: Some(error.code),
                            latency_ms: attempt_start.elapsed().as_millis() as u64,
                        });
                        let retryable = error.retryable();
                        if !retryable || self.settings.ai_max_retries == 0 {
                            last_error = Some(error);
                            break;
                        }
                        last_error = Some(error);
                    }
                }
            }
        }

        Err((
            last_error
                .unwrap_or_else(|| ProviderError::new(AiErrorCode::BadConfig, Provider::Custom)),
            attempts,
        ))
    }

    /// Xử lý action `chat` — tương thích với Edge Function `ai-tutor-api`.
    pub async fn chat(&self, user: &AuthUser, request: ChatRequest) -> Result<Value, ApiError> {
        let settings = self.load_settings().await?;
        if !settings.enabled {
            return Err(ApiError::service_unavailable(
                AiErrorCode::AiDisabled.as_str(),
                AiErrorCode::AiDisabled.message(),
            ));
        }

        let mode = request
            .mode
            .as_deref()
            .or(request.conversation_mode.as_deref())
            .and_then(TutorMode::parse)
            .unwrap_or(TutorMode::Explain);
        let allowed = if settings.allowed_modes.is_empty() {
            prompts::MODE_IDS.to_vec()
        } else {
            prompts::MODE_IDS
                .iter()
                .copied()
                .filter(|m| settings.allowed_modes.iter().any(|a| a == m.as_str()))
                .collect()
        };
        if !allowed.contains(&mode) {
            return Err(ApiError::bad_request(
                "MODE_DISABLED",
                "Chế độ học tập này đang tắt.",
            ));
        }

        // Hạn mức tần suất theo người dùng (giới hạn theo IP nằm ở middleware).
        if !self.state.limiter.check(
            &format!("ai:user:{}", user.id),
            self.settings.ai_rate_per_min,
        ) {
            return Err(ApiError::rate_limited(
                "Bạn đang gửi quá nhanh. Chờ khoảng một phút rồi thử lại nhé.",
            ));
        }

        let is_retry = request.retry == Some(true);
        let raw_message = request.message.clone().unwrap_or_default();
        if raw_message.chars().count() > MAX_USER_MESSAGE {
            return Err(ApiError::bad_request(
                "MESSAGE_TOO_LONG",
                format!("Câu hỏi quá dài (tối đa {MAX_USER_MESSAGE} ký tự)."),
            ));
        }
        let mut message = clean_message(&raw_message);
        if message.is_empty() && !is_retry {
            return Err(ApiError::bad_request(
                "EMPTY_MESSAGE",
                "Bạn chưa nhập câu hỏi.",
            ));
        }

        let context = sanitize_context(request.context.as_ref());

        // Hồ sơ học sinh — suy ra từ tài khoản đã xác thực bằng service role
        // (đọc một dòng id, không đọc dữ liệu học tập của người khác).
        let student_row = self.student_id(user).await?;
        let student_id = student_row.as_deref();

        if settings.daily_requests > 0 || settings.daily_tokens > 0 {
            if let Some(sid) = student_id {
                let (requests, tokens) = self.usage_today(sid).await;
                if settings.daily_requests > 0 && requests >= settings.daily_requests as i64 {
                    return Err(ApiError::rate_limited(format!(
                        "Bạn đã dùng hết {} câu hỏi AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.",
                        settings.daily_requests
                    )));
                }
                if settings.daily_tokens > 0 && tokens >= settings.daily_tokens as i64 {
                    return Err(ApiError::rate_limited(
                        "Bạn đã chạm hạn mức dung lượng AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.",
                    ));
                }
            }
        }

        if !self.settings.persist_conversations || student_id.is_none() {
            // Chế độ không lưu: một lượt hỏi–đáp, không ghi database.
            return self
                .ephemeral_chat(&settings, mode, message, context, student_id)
                .await;
        }

        let student_id = student_id.unwrap_or_default().to_string();
        let conversation = self
            .resolve_conversation(&settings, &student_id, &request, mode, &context, &message)
            .await?;

        // Chống gửi trùng và lấy câu hỏi đã lưu khi thử lại.
        let last_user = self.last_user_message(&conversation.id).await;
        if is_retry {
            match &last_user {
                Some((_id, content, _created)) if !content.trim().is_empty() => {
                    message = clean_message(content);
                }
                _ => {
                    return Err(ApiError::bad_request(
                        "NOTHING_TO_RETRY",
                        "Chưa có câu hỏi nào để thử lại.",
                    ))
                }
            }
        } else if let Some((_id, content, created_ms)) = &last_user {
            if *content == message && (now_ms() - created_ms) < DEDUPE_WINDOW_MS {
                return Err(ApiError::new(
                    axum::http::StatusCode::CONFLICT,
                    "DUPLICATE",
                    "Câu hỏi này vừa được gửi. Bạn chờ câu trả lời nhé.",
                ));
            }
        }

        let history = self
            .conversation_history(&conversation.id, settings.max_context_messages)
            .await;

        let system = build_system_prompt(
            mode,
            &settings.system_prompt,
            &settings.language,
            &context,
            settings.use_lesson_context,
        );
        let with_new = {
            let mut turns = history;
            turns.push(ChatTurn {
                role: "user".to_string(),
                content: message.clone(),
            });
            turns
        };
        let reserved = prompts::estimate_prompt_tokens(&system)
            .saturating_add(prompts::estimate_prompt_tokens(&message));
        let budgeted = trim_history_by_budget(&with_new, settings.max_input_tokens, reserved);

        let choice = pick_model(
            &settings.model,
            settings.routing_enabled,
            &settings.model_simple,
            &settings.model_complex,
            &settings.model_practice,
            mode,
            &message,
        );

        // Lưu câu hỏi TRƯỚC khi gọi AI: lỗi mạng không làm mất nội dung.
        let user_row = if is_retry {
            json!({ "id": last_user.as_ref().map(|(id, _, _)| id.clone()).unwrap_or_default(),
                    "role": "user", "content": message, "mode": mode.as_str() })
        } else {
            self.insert_message(
                &conversation.id,
                &student_id,
                "user",
                &message,
                mode,
                "",
                "",
                0,
                0,
                &context.to_value(),
            )
            .await?
        };

        let routes = self.load_routes().await;
        let mut chain_settings = settings.clone();
        if settings.routing_enabled {
            // Định tuyến chỉ đổi model của provider chính khi route rỗng.
            if routes.is_empty() && !choice.model.is_empty() && choice.reason != "routing-off" {
                chain_settings.model = choice.model.clone();
            }
        }

        let outcome = self
            .run_chain(&chain_settings, &routes, &system, &budgeted, mode, &message)
            .await;

        match outcome {
            Err((error, _attempts)) => {
                self.supabase
                    .log_ai_usage(
                        Some(&student_id),
                        "chat",
                        error.provider.as_str(),
                        &choice.model,
                        mode.as_str(),
                        0,
                        0,
                        0,
                        false,
                        error.code.as_str(),
                    )
                    .await;
                let retryable = error.code.retryable();
                Err(ApiError::bad_gateway(
                    error.code.as_str(),
                    error.code.message(),
                    retryable,
                ))
            }
            Ok(outcome) => {
                let assistant_row = if settings.save_history {
                    self.insert_message(
                        &conversation.id,
                        &student_id,
                        "assistant",
                        &outcome.result.text,
                        mode,
                        outcome.result.provider.as_str(),
                        &outcome.result.model,
                        outcome.result.usage.input,
                        outcome.result.usage.output,
                        &json!({}),
                    )
                    .await
                    .ok()
                } else {
                    None
                };

                let new_count = if settings.save_history {
                    if is_retry {
                        1
                    } else {
                        2
                    }
                } else if is_retry {
                    0
                } else {
                    1
                };
                self.touch_conversation(
                    &conversation.id,
                    &student_id,
                    mode,
                    &outcome.result,
                    conversation.message_count,
                    new_count,
                    &conversation.title,
                    &message,
                )
                .await;

                self.supabase
                    .log_ai_usage(
                        Some(&student_id),
                        "chat",
                        outcome.result.provider.as_str(),
                        &outcome.result.model,
                        mode.as_str(),
                        outcome.result.usage.input,
                        outcome.result.usage.output,
                        outcome.latency_ms,
                        true,
                        "",
                    )
                    .await;

                let (after_requests, after_tokens) = self.usage_today(&student_id).await;
                let assistant = assistant_row.unwrap_or_else(|| {
                    json!({
                        "id": format!("ephemeral-{}", now_ms()),
                        "role": "assistant",
                        "content": outcome.result.text,
                        "mode": mode.as_str(),
                        "provider": outcome.result.provider.as_str(),
                        "model": outcome.result.model,
                        "context_ref": {},
                        "error_code": "",
                        "created_at": iso_now()
                    })
                });

                Ok(json!({
                    "conversation": {
                        "id": conversation.id,
                        "title": conversation.title,
                        "mode": mode.as_str(),
                        "message_count": conversation.message_count + new_count,
                        "last_provider": outcome.result.provider.as_str(),
                        "last_model": outcome.result.model
                    },
                    "user_message": user_row,
                    "message": assistant,
                    "meta": {
                        "provider": outcome.result.provider.as_str(),
                        "providerLabel": provider_label(outcome.result.provider),
                        "model": outcome.result.model,
                        "mode": mode.as_str(),
                        "routing": choice.reason,
                        "routeLabel": outcome.route_label,
                        "attempts": outcome.attempts.iter().map(|a| json!({
                            "provider": provider_label(a.provider),
                            "model": a.model,
                            "ok": a.ok,
                            "code": a.code.map(|c| c.as_str()).unwrap_or(""),
                            "latencyMs": a.latency_ms
                        })).collect::<Vec<_>>(),
                        "fellBack": outcome.fell_back,
                        "mock": outcome.result.mock,
                        "tokens": outcome.result.usage,
                        "outputBudget": {
                            "maxTokens": outcome.max_tokens,
                            "target": outcome.target_tokens,
                            "deep": outcome.deep
                        },
                        "latencyMs": outcome.latency_ms,
                        "usage": { "requests": after_requests, "tokens": after_tokens },
                        "limits": { "dailyRequests": settings.daily_requests, "dailyTokens": settings.daily_tokens }
                    }
                }))
            }
        }
    }

    /// Một lượt hỏi–đáp không ghi database (AI_PERSIST_CONVERSATIONS=false).
    async fn ephemeral_chat(
        &self,
        settings: &AiSettings,
        mode: TutorMode,
        message: String,
        context: SafeContext,
        student_id: Option<&str>,
    ) -> Result<Value, ApiError> {
        if message.trim().is_empty() {
            return Err(ApiError::bad_request(
                "EMPTY_MESSAGE",
                "Bạn chưa nhập câu hỏi.",
            ));
        }
        let system = build_system_prompt(
            mode,
            &settings.system_prompt,
            &settings.language,
            &context,
            settings.use_lesson_context,
        );
        let turns = vec![ChatTurn {
            role: "user".to_string(),
            content: message.clone(),
        }];
        let routes = self.load_routes().await;
        match self
            .run_chain(settings, &routes, &system, &turns, mode, &message)
            .await
        {
            Ok(outcome) => {
                self.supabase
                    .log_ai_usage(
                        student_id,
                        "chat",
                        outcome.result.provider.as_str(),
                        &outcome.result.model,
                        mode.as_str(),
                        outcome.result.usage.input,
                        outcome.result.usage.output,
                        outcome.latency_ms,
                        true,
                        "",
                    )
                    .await;
                Ok(json!({
                    "conversation": Value::Null,
                    "user_message": {
                        "role": "user",
                        "content": message,
                        "mode": mode.as_str(),
                        "created_at": iso_now()
                    },
                    "message": {
                        "id": format!("ephemeral-{}", now_ms()),
                        "role": "assistant",
                        "content": outcome.result.text,
                        "mode": mode.as_str(),
                        "provider": outcome.result.provider.as_str(),
                        "model": outcome.result.model,
                        "created_at": iso_now()
                    },
                    "meta": {
                        "provider": outcome.result.provider.as_str(),
                        "model": outcome.result.model,
                        "mode": mode.as_str(),
                        "fellBack": outcome.fell_back,
                        "mock": outcome.result.mock,
                        "tokens": outcome.result.usage,
                        "latencyMs": outcome.latency_ms,
                        "persisted": false
                    }
                }))
            }
            Err((error, _)) => Err(ApiError::bad_gateway(
                error.code.as_str(),
                error.code.message(),
                error.code.retryable(),
            )),
        }
    }

    async fn student_id(&self, user: &AuthUser) -> Result<Option<String>, ApiError> {
        let path = format!(
            "students?auth_user_id=eq.{}&select=id&limit=1",
            urlencode(&user.id)
        );
        let rows = self.supabase.select(&path, RestAuth::Service).await?;
        Ok(rows
            .as_array()
            .and_then(|list| list.first())
            .and_then(|row| row.get("id"))
            .and_then(|id| id.as_str())
            .map(|id| id.to_string()))
    }

    async fn usage_today(&self, student_id: &str) -> (i64, i64) {
        let since = iso_hours_ago(24);
        let path = format!(
            "ai_usage_logs?student_id=eq.{}&created_at=gte.{}&select=tokens_in,tokens_out",
            urlencode(student_id),
            urlencode(&since)
        );
        match self.supabase.select(&path, RestAuth::Service).await {
            Ok(Value::Array(rows)) => {
                let mut tokens: i64 = 0;
                for row in &rows {
                    let input = row.get("tokens_in").and_then(|v| v.as_i64()).unwrap_or(0);
                    let output = row.get("tokens_out").and_then(|v| v.as_i64()).unwrap_or(0);
                    tokens += input + output;
                }
                (rows.len() as i64, tokens)
            }
            _ => (0, 0),
        }
    }

    async fn resolve_conversation(
        &self,
        settings: &AiSettings,
        student_id: &str,
        request: &ChatRequest,
        mode: TutorMode,
        context: &SafeContext,
        message: &str,
    ) -> Result<ConversationRef, ApiError> {
        if let Some(raw_id) = request.conversation_id.as_deref() {
            if is_uuid(raw_id) {
                let path = format!(
                    "ai_conversations?id=eq.{}&student_id=eq.{}&select=id,title,message_count&limit=1",
                    urlencode(raw_id),
                    urlencode(student_id)
                );
                let rows = self.supabase.select(&path, RestAuth::Service).await?;
                if let Some(row) = rows.as_array().and_then(|list| list.first()) {
                    return Ok(ConversationRef {
                        id: row
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or(raw_id)
                            .to_string(),
                        title: row
                            .get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Hội thoại mới")
                            .to_string(),
                        message_count: row
                            .get("message_count")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0),
                    });
                }
            }
        }

        let title = auto_title(message, mode);
        let body = json!({
            "student_id": student_id,
            "title": title,
            "mode": mode.as_str(),
            "subject": context.subject(),
            "topic": context.topic(),
        });
        let row = self
            .supabase
            .insert("ai_conversations", &body, RestAuth::Service)
            .await?;
        let id = row
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ApiError::service_unavailable("DB_ERROR", "Không tạo được hội thoại."))?
            .to_string();

        let _ = settings;
        Ok(ConversationRef {
            id,
            title,
            message_count: 0,
        })
    }

    async fn last_user_message(&self, conversation_id: &str) -> Option<(String, String, i64)> {
        let path = format!(
            "ai_messages?conversation_id=eq.{}&role=eq.user&select=id,content,created_at&order=created_at.desc&limit=1",
            urlencode(conversation_id)
        );
        let rows = self.supabase.select(&path, RestAuth::Service).await.ok()?;
        let row = rows.as_array()?.first()?.clone();
        let id = row.get("id")?.as_str()?.to_string();
        let content = row.get("content")?.as_str()?.to_string();
        let created = row.get("created_at")?.as_str()?;
        Some((id, content, parse_iso_ms(created)))
    }

    async fn conversation_history(
        &self,
        conversation_id: &str,
        max_messages: u32,
    ) -> Vec<ChatTurn> {
        let limit = (max_messages.clamp(2, 40) * 2).to_string();
        let path = format!(
            "ai_messages?conversation_id=eq.{}&select=role,content&order=created_at.desc&limit={}",
            urlencode(conversation_id),
            limit
        );
        let rows = self.supabase.select(&path, RestAuth::Service).await;
        let mut turns: Vec<ChatTurn> = match rows {
            Ok(Value::Array(list)) => list
                .into_iter()
                .rev()
                .filter_map(|row| {
                    let role = row.get("role")?.as_str()?.to_string();
                    let content = row.get("content")?.as_str()?.to_string();
                    if content.trim().is_empty() {
                        return None;
                    }
                    Some(ChatTurn { role, content })
                })
                .collect(),
            _ => Vec::new(),
        };
        turns = trim_history(turns, max_messages);
        turns
    }

    #[allow(clippy::too_many_arguments)]
    async fn insert_message(
        &self,
        conversation_id: &str,
        student_id: &str,
        role: &str,
        content: &str,
        mode: TutorMode,
        provider: &str,
        model: &str,
        tokens_in: u32,
        tokens_out: u32,
        context_ref: &Value,
    ) -> Result<Value, ApiError> {
        let body = json!({
            "conversation_id": conversation_id,
            "student_id": student_id,
            "role": role,
            "content": content.chars().take(24_000).collect::<String>(),
            "mode": mode.as_str(),
            "provider": provider,
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "context_ref": context_ref
        });
        let row = self
            .supabase
            .insert("ai_messages", &body, RestAuth::Service)
            .await?;
        if row.is_null() {
            return Err(ApiError::service_unavailable(
                "DB_ERROR",
                "Không lưu được tin nhắn.",
            ));
        }
        Ok(row)
    }

    #[allow(clippy::too_many_arguments)]
    async fn touch_conversation(
        &self,
        conversation_id: &str,
        student_id: &str,
        mode: TutorMode,
        result: &ProviderResult,
        base_count: i64,
        new_count: i64,
        current_title: &str,
        message: &str,
    ) {
        let title = if current_title.trim().is_empty() || current_title == "Hội thoại mới" {
            auto_title(message, mode)
        } else {
            current_title.to_string()
        };
        let body = json!({
            "message_count": base_count.saturating_add(new_count).max(0),
            "last_message_at": iso_now(),
            "last_provider": result.provider.as_str(),
            "last_model": result.model,
            "mode": mode.as_str(),
            "title": title
        });
        let path = format!(
            "ai_conversations?id=eq.{}&student_id=eq.{}",
            urlencode(conversation_id),
            urlencode(student_id)
        );
        if let Err(error) = self.supabase.update(&path, &body, RestAuth::Service).await {
            tracing::warn!(target: "bakhi::ai", error = %error, "không cập nhật được hội thoại");
        }
    }
}

#[derive(Debug, Clone)]
struct ConversationRef {
    id: String,
    title: String,
    message_count: i64,
}

pub fn clean_message(raw: &str) -> String {
    raw.chars()
        .filter(|ch| !ch.is_control() || *ch == '\n' || *ch == '\t')
        .collect::<String>()
        .trim()
        .chars()
        .take(MAX_USER_MESSAGE)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn auto_title(message: &str, mode: TutorMode) -> String {
    let compact = message.split_whitespace().collect::<Vec<_>>().join(" ");
    let title: String = compact.chars().take(70).collect();
    if title.trim().is_empty() {
        format!("Hội thoại {}", mode.as_str())
    } else {
        title
    }
}

fn provider_label(provider: Provider) -> &'static str {
    match provider {
        Provider::Groq => "Groq",
        Provider::Google => "Google AI Studio (Gemini)",
        Provider::OpenAi => "OpenAI",
        Provider::Cerebras => "Cerebras",
        Provider::OpenRouter => "OpenRouter",
        Provider::Mistral => "Mistral",
        Provider::DeepSeek => "DeepSeek",
        Provider::Custom => "Tự cấu hình",
    }
}

pub fn is_uuid(raw: &str) -> bool {
    if raw.len() != 36 {
        return false;
    }
    raw.chars().enumerate().all(|(index, ch)| {
        if matches!(index, 8 | 13 | 18 | 23) {
            ch == '-'
        } else {
            ch.is_ascii_hexdigit()
        }
    })
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn iso_hours_ago(hours: i64) -> String {
    let ms = now_ms() - hours * 3_600_000;
    iso_from_ms(ms)
}

pub fn iso_now() -> String {
    iso_from_ms(now_ms())
}

/// Định dạng RFC3339 UTC không cần thư viện thời gian.
pub fn iso_from_ms(ms: i64) -> String {
    let total_seconds = ms.div_euclid(1000);
    let days = total_seconds.div_euclid(86_400);
    let seconds_of_day = total_seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3600;
    let minute = (seconds_of_day % 3600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    // Thuật toán Howard Hinnant: đổi số ngày kể từ 1970-01-01 sang Y/M/D.
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { y + 1 } else { y }, month, day)
}

fn parse_iso_ms(raw: &str) -> i64 {
    // Đủ dùng cho timestamp của PostgREST: "2026-11-23T12:34:56.789+00:00".
    let bytes = raw.as_bytes();
    if bytes.len() < 19 {
        return 0;
    }
    let num = |start: usize, len: usize| -> i64 {
        raw.get(start..start + len)
            .and_then(|slice| slice.parse::<i64>().ok())
            .unwrap_or(0)
    };
    let year = num(0, 4);
    let month = num(5, 2);
    let day = num(8, 2);
    let hour = num(11, 2);
    let minute = num(14, 2);
    let second = num(17, 2);
    let millis = if bytes.len() > 20 && bytes[19] == b'.' {
        num(20, 3)
    } else {
        0
    };
    let days = days_from_civil(year, month as u32, day as u32);
    (days * 86_400 + hour * 3600 + minute * 60 + second) * 1000 + millis
}

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if month > 2 { month - 3 } else { month + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + day as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::estimate_tokens;

    #[test]
    fn clean_message_strips_control_chars_and_limits_length() {
        let raw = "\u{0}  xin\u{7} chào  \u{1}";
        assert_eq!(clean_message(raw), "xin chào");
        assert_eq!(
            clean_message(&"a".repeat(5000)).chars().count(),
            MAX_USER_MESSAGE
        );
    }

    #[test]
    fn uuid_validation_is_strict() {
        assert!(is_uuid("5f0d7c1e-1f1e-4a3c-9c1a-1f2b3c4d5e6f"));
        assert!(!is_uuid("5f0d7c1e1f1e4a3c9c1a1f2b3c4d5e6f"));
        assert!(!is_uuid("../../etc/passwd"));
        assert!(!is_uuid(""));
    }

    #[test]
    fn iso_formatting_round_trips() {
        let text = iso_from_ms(1_700_000_000_000);
        assert_eq!(text, "2023-11-14T22:13:20Z");
        let parsed = parse_iso_ms("2023-11-14T22:13:20.000+00:00");
        assert_eq!(parsed, 1_700_000_000_000);
    }

    #[test]
    fn auto_title_uses_message_prefix() {
        assert_eq!(
            auto_title("  Giải   thích định lý Pi-ta-go  ", TutorMode::Explain),
            "Giải thích định lý Pi-ta-go"
        );
        assert_eq!(auto_title("   ", TutorMode::Hint), "Hội thoại hint");
    }

    #[test]
    fn settings_defaults_match_documented_values() {
        let settings = AiSettings::default();
        assert_eq!(settings.provider, "groq");
        assert_eq!(settings.model, "openai/gpt-oss-20b");
        assert_eq!(settings.fallback_provider, "google");
        assert_eq!(settings.max_output_tokens, 2048);
        assert_eq!(settings.allowed_modes.len(), 8);
    }

    #[test]
    fn estimate_tokens_matches_edge_heuristic() {
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("a".repeat(400).as_str()), 100);
    }
}

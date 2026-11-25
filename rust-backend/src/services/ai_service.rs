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

use std::convert::Infallible;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::response::sse::Event;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::config::Settings;
use crate::errors::ApiError;
use crate::middleware::AuthUser;
use crate::observability::metrics::Metrics;
use crate::providers::{
    AiErrorCode, AiProvider, ChatTurn, MockProvider, Provider, ProviderError, ProviderRequest,
    ProviderResult, StreamEvent,
};
use crate::services::prompts::{
    self, build_system_prompt, output_tokens_for_mode, pick_model, sanitize_context, trim_history,
    trim_history_by_budget, SafeContext, TutorMode,
};
use crate::services::retry::{backoff_with_jitter, Jitter};
use crate::services::supabase::{urlencode, RestAuth, SupabaseClient, UsageLog};
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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

/// Chuỗi provider thất bại hoàn toàn. `fell_back` cho biết lượt này đã chạm
/// nhánh dự phòng (kể cả khi provider dự phòng bị circuit breaker bỏ qua) — nhờ
/// vậy metrics và `ai_usage_logs` không đếm thiếu lượt fallback thất bại.
pub struct ChainFailure {
    pub error: ProviderError,
    pub attempts: Vec<Attempt>,
    pub fell_back: bool,
}

/// Đích của một lượt streaming: SSE frame đi thẳng về trình duyệt.
///
/// `delta_sent` là ranh giới an toàn của fallback: đã gửi chữ cho người học
/// thì KHÔNG chuyển provider nữa (hai câu trả lời nối vào nhau là lỗi nội dung).
#[derive(Clone)]
pub struct StreamContext {
    tx: mpsc::Sender<Result<Event, Infallible>>,
    delta_sent: Arc<AtomicBool>,
}

impl StreamContext {
    pub fn new(tx: mpsc::Sender<Result<Event, Infallible>>) -> Self {
        Self {
            tx,
            delta_sent: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn delta_sent(&self) -> bool {
        self.delta_sent.load(Ordering::Relaxed)
    }

    fn mark_delta(&self) {
        self.delta_sent.store(true, Ordering::Relaxed);
    }

    /// Gửi một phần nội dung. `false` = trình duyệt đã đóng kết nối.
    ///
    /// Gửi thành công thì đánh dấu `delta_sent`: từ đây chuỗi provider không
    /// được retry/fallback nữa (nối hai câu trả lời là lỗi nội dung).
    async fn delta(&self, text: &str) -> bool {
        self.mark_delta();
        let payload = json!({ "text": text }).to_string();
        self.tx
            .send(Ok(Event::default().event("delta").data(payload)))
            .await
            .is_ok()
    }

    /// Gửi sự kiện cuối (`done` hoặc `error`). Bỏ qua nếu client đã rời.
    pub async fn send(&self, event: &'static str, data: &Value) -> bool {
        self.tx
            .send(Ok(Event::default().event(event).data(data.to_string())))
            .await
            .is_ok()
    }
}

/// Đếm lượt bị huỷ thật: future bị drop trước khi xử lý xong (trình duyệt đóng
/// tab, người học bấm Dừng, hoặc timeout của tầng ngoài). Chỉ ghi khi chưa
/// `disarm()`. Không chứa dữ liệu người dùng.
struct CancelGuard {
    metrics: Arc<Metrics>,
    armed: bool,
}

impl CancelGuard {
    fn new(metrics: Arc<Metrics>) -> Self {
        Self {
            metrics,
            armed: true,
        }
    }

    fn disarm(mut self) {
        self.armed = false;
    }
}

impl Drop for CancelGuard {
    fn drop(&mut self) {
        if self.armed {
            self.metrics.record_ai_cancelled("request");
        }
    }
}

/// Gọi MỘT provider cho một attempt.
///
/// * Không stream: `generate()` như trước 8.7.4.
/// * Stream: chuyển từng delta ra `sink` ngay khi provider trả về. Nếu stream
///   lỗi TRƯỚC delta đầu tiên, lỗi được trả như attempt thường (retry/fallback
///   còn an toàn). Sau delta đầu tiên, caller không fallback nữa.
///
/// Mọi nhánh đều có hạn tuyệt đối (`budget`), nên không attempt nào treo.
async fn call_provider(
    provider_impl: Arc<dyn AiProvider>,
    request: ProviderRequest<'_>,
    budget: Duration,
    provider: Provider,
    sink: Option<&StreamContext>,
    metrics: &Metrics,
) -> Result<ProviderResult, ProviderError> {
    // Provider chưa hỗ trợ streaming: phục vụ một response trọn gói. Endpoint
    // streaming vẫn hoạt động, chỉ là không có delta nào (và không có TTFT).
    if sink.is_none() || !provider_impl.supports_stream() {
        return match tokio::time::timeout(budget, provider_impl.generate(request)).await {
            Ok(result) => result,
            Err(_) => Err(ProviderError::new(AiErrorCode::Timeout, provider)),
        };
    }
    let sink = sink.expect("đã kiểm tra sink ở trên");

    // Kênh nội bộ nhỏ, có giới hạn: provider không thể đẩy vô hạn vào bộ nhớ.
    let (raw_tx, mut raw_rx) = mpsc::channel::<StreamEvent>(64);
    let mut future = Box::pin(provider_impl.generate_stream(request, raw_tx));
    let deadline = tokio::time::Instant::now() + budget;
    let mut result: Option<ProviderResult> = None;
    let mut finished: Option<Result<(), ProviderError>> = None;
    let mut started = false;

    loop {
        if let Some(done) = finished.take() {
            // Provider có thể đã đẩy TOÀN BỘ sự kiện vào kênh rồi mới trả về
            // (một poll duy nhất khi dữ liệu đã nằm trong buffer TCP). Phải xả
            // hết trước khi kết luận: bỏ qua bước này sẽ báo EMPTY_RESPONSE
            // dù nội dung đã có.
            while let Some(event) = raw_rx.recv().await {
                if !forward_event(event, sink, metrics, &mut result, &mut started).await {
                    return Err(ProviderError::new(AiErrorCode::Cancelled, provider));
                }
            }
            return match done {
                Ok(()) => {
                    result.ok_or_else(|| ProviderError::new(AiErrorCode::EmptyResponse, provider))
                }
                Err(error) => Err(error),
            };
        }

        tokio::select! {
            // Kênh trước future: delta đã có sẵn phải tới trình duyệt ngay.
            event = raw_rx.recv() => {
                match event {
                    // Kênh đóng mà future chưa xong: chờ future để lấy lỗi/kết quả.
                    None => {
                        finished = Some((&mut future).await);
                    }
                    Some(event) => {
                        if !forward_event(event, sink, metrics, &mut result, &mut started).await {
                            return Err(ProviderError::new(AiErrorCode::Cancelled, provider));
                        }
                    }
                }
            }
            done = &mut future => finished = Some(done),
            _ = tokio::time::sleep_until(deadline) => {
                return Err(ProviderError::new(AiErrorCode::Timeout, provider));
            }
            // Client đóng kết nối: huỷ ngay, không chờ provider trả thêm.
            _ = sink.tx.closed() => {
                return Err(ProviderError::new(AiErrorCode::Cancelled, provider));
            }
        }
    }
}

/// Chuyển một sự kiện provider tới trình duyệt. `false` = client đã rời.
async fn forward_event(
    event: StreamEvent,
    sink: &StreamContext,
    metrics: &Metrics,
    result: &mut Option<ProviderResult>,
    started: &mut bool,
) -> bool {
    match event {
        StreamEvent::Delta(text) => {
            if !*started {
                *started = true;
                metrics.record_ai_stream_event("started");
            }
            sink.delta(&text).await
        }
        StreamEvent::Done(value) => {
            *result = Some(value);
            true
        }
    }
}

/// Dựng danh sách route từ giá trị JSON đã cache (dùng cho cả lần đọc đầu và
/// cache hit). Route bị tắt hoặc thiếu model bị loại như trước 8.7.3.
fn routes_from_value(value: Value) -> Vec<ModelRoute> {
    match value {
        Value::Array(list) => list
            .into_iter()
            .filter_map(|row| serde_json::from_value::<ModelRoute>(row).ok())
            .filter(|route| route.enabled && !route.model.trim().is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

#[derive(Clone)]
pub struct AiService {
    pub settings: Arc<Settings>,
    pub supabase: Arc<SupabaseClient>,
    pub state: AppState,
    /// Nguồn jitter dùng chung: nhiều lượt chat không thử lại cùng một nhịp.
    jitter: Arc<Jitter>,
}

impl AiService {
    pub fn new(state: AppState) -> Self {
        Self {
            settings: state.settings.clone(),
            supabase: state.supabase.clone(),
            state,
            jitter: Arc::new(Jitter::new()),
        }
    }

    /// 8.7.3 — đọc cấu hình hệ thống qua L1 cache + singleflight.
    ///
    /// `ai_settings` và `ai_model_routes` là dữ liệu DÙNG CHUNG cấp hệ thống
    /// (không phụ thuộc người dùng). Trước 8.7.3 mỗi lượt chat đọc lại cả hai
    /// bảng từ Supabase; nay chỉ đọc lại sau `CACHE_TTL_AI_CONFIG` giây, và
    /// nhiều lượt chat đồng thời chỉ tạo MỘT truy vấn.
    ///
    /// Không cache khoá API vào log/metrics; chỉ giá trị cấu hình nằm trong RAM
    /// của tiến trình như trước đây.
    async fn config_value(
        &self,
        key: &'static str,
        path: &'static str,
    ) -> Result<Arc<Value>, ApiError> {
        if let Some(cached) = self.state.cache.get(key) {
            return Ok(cached);
        }

        let cache_key = key.to_string();
        let cache = self.state.cache.clone();
        let supabase = self.supabase.clone();
        let ttl = self.settings.cache_config_ttl;
        let flight = self
            .state
            .flights
            .run(cache_key, move || async move {
                let rows = supabase.select(path, RestAuth::Service).await;
                // Giữ NGUYÊN hình dạng trả về: ai_settings là một dòng, còn
                // ai_model_routes là cả mảng. Việc lấy dòng đầu do nơi gọi làm.
                let value = match rows {
                    Ok(value) => value,
                    Err(error) => return Err(error),
                };
                if !ttl.is_zero() {
                    cache.insert(key, value.clone(), Some(ttl), &["ai-config"]);
                }
                Ok(Arc::new(value))
            })
            .await;

        match flight {
            Ok(value) => Ok(value),
            // Nguồn dữ liệu lỗi: dùng bản cũ trong hạn stale thay vì làm hỏng
            // lượt chat. Ngoài hạn stale thì trả đúng lỗi gốc.
            Err(error) => match self.state.cache.get_stale(key) {
                Some(stale) => {
                    tracing::warn!(
                        target: "bakhi::cache",
                        key,
                        "nguồn dữ liệu lỗi — dùng cấu hình AI đã cache"
                    );
                    Ok(stale)
                }
                None => Err(error),
            },
        }
    }

    async fn load_settings(&self) -> Result<AiSettings, ApiError> {
        let value = self
            .config_value("ai:settings:v1", "ai_settings?id=eq.1&select=*&limit=1")
            .await?;
        // PostgREST trả mảng; cấu hình là dòng đầu tiên (nếu có).
        let row = match &*value {
            Value::Array(list) => list.first().cloned().unwrap_or(Value::Null),
            value => value.clone(),
        };
        if row.is_null() {
            // Bảng cấu hình chưa có dòng 1 ⇒ dùng mặc định an toàn.
            return Ok(AiSettings::default());
        }
        serde_json::from_value::<AiSettings>(row).map_err(|_| {
            ApiError::service_unavailable("BAD_CONFIG", "Cấu hình trợ lý AI không đọc được.")
        })
    }

    async fn load_routes(&self) -> Vec<ModelRoute> {
        match self
            .config_value(
                "ai:routes:v1",
                "ai_model_routes?enabled=eq.true&order=position.asc&select=*&limit=20",
            )
            .await
        {
            Ok(value) => routes_from_value((*value).clone()),
            Err(_) => Vec::new(),
        }
    }

    /// Khoá cho một route. Nhận trực tiếp chuỗi khoá/`key_ref` để không phải
    /// dựng `ModelRoute` tạm (và clone nhiều chuỗi) cho cấu hình mặc định.
    fn key_for(&self, role_primary: bool, direct_key: &str, key_ref: &str) -> String {
        if !direct_key.trim().is_empty() {
            return direct_key.trim().to_string();
        }
        let key_ref = key_ref.trim();
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

    fn candidates(
        &self,
        settings: &AiSettings,
        routes: &[ModelRoute],
        model_override: Option<&str>,
    ) -> Vec<Candidate> {
        if !routes.is_empty() {
            return routes
                .iter()
                .take(6)
                .map(|route| Candidate {
                    provider: Provider::parse(&route.provider).unwrap_or(Provider::Groq),
                    model: route.model.trim().to_string(),
                    api_key: self.key_for(route.position == 0, &route.api_key, &route.key_ref),
                    label: if route.label.trim().is_empty() {
                        format!("{} #{}", route.provider, route.position + 1)
                    } else {
                        route.label.clone()
                    },
                })
                .collect();
        }

        let primary_model = model_override
            .map(str::trim)
            .filter(|model| !model.is_empty())
            .unwrap_or_else(|| settings.model.trim());
        let mut list = vec![Candidate {
            provider: Provider::parse(&settings.provider).unwrap_or(Provider::Groq),
            model: primary_model.to_string(),
            api_key: self.key_for(true, "", ""),
            label: "Primary".to_string(),
        }];
        if !settings.fallback_model.trim().is_empty() {
            list.push(Candidate {
                provider: Provider::parse(&settings.fallback_provider).unwrap_or(Provider::Google),
                model: settings.fallback_model.trim().to_string(),
                api_key: self.key_for(false, "", ""),
                label: "Fallback".to_string(),
            });
        }
        list
    }

    /// Chạy chuỗi provider: thử lại lỗi tạm thời (tôn trọng Retry-After) rồi
    /// chuyển provider kế tiếp. Tổng thời gian không vượt quá gateway timeout.
    ///
    /// Circuit breaker chỉ *bỏ qua* provider đang OPEN; thứ tự Primary → Fallback
    /// không đổi và provider khác vẫn chạy bình thường.
    #[allow(clippy::too_many_arguments)]
    pub async fn run_chain(
        &self,
        settings: &AiSettings,
        routes: &[ModelRoute],
        system: &str,
        turns: &[ChatTurn],
        mode: TutorMode,
        message: &str,
        model_override: Option<&str>,
    ) -> Result<GatewayOutcome, ChainFailure> {
        self.run_chain_inner(
            settings,
            routes,
            system,
            turns,
            mode,
            message,
            model_override,
            None,
        )
        .await
    }

    /// 8.7.4 — cùng chuỗi provider nhưng chuyển nội dung về trình duyệt theo
    /// từng phần. Dùng chung mọi chính sách retry/circuit/deadline của
    /// `run_chain`; chỉ khác cách nhận kết quả từ provider.
    #[allow(clippy::too_many_arguments)]
    pub async fn run_chain_stream(
        &self,
        settings: &AiSettings,
        routes: &[ModelRoute],
        system: &str,
        turns: &[ChatTurn],
        mode: TutorMode,
        message: &str,
        model_override: Option<&str>,
        stream: &StreamContext,
    ) -> Result<GatewayOutcome, ChainFailure> {
        self.run_chain_inner(
            settings,
            routes,
            system,
            turns,
            mode,
            message,
            model_override,
            Some(stream),
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_chain_inner(
        &self,
        settings: &AiSettings,
        routes: &[ModelRoute],
        system: &str,
        turns: &[ChatTurn],
        mode: TutorMode,
        message: &str,
        model_override: Option<&str>,
        stream: Option<&StreamContext>,
    ) -> Result<GatewayOutcome, ChainFailure> {
        let started = Instant::now();
        let deadline = started + self.settings.ai_gateway_timeout;
        let (max_tokens, target_tokens, deep) =
            output_tokens_for_mode(mode, message, settings.max_output_tokens.max(128));
        let candidates = self.candidates(settings, routes, model_override);
        let per_attempt = Duration::from_millis(settings.timeout_ms.clamp(1_000, 120_000));

        // Trần số attempt: mỗi provider thử tối đa `ai_max_retries + 1` lần.
        let mut attempts: Vec<Attempt> =
            Vec::with_capacity(candidates.len() * (self.settings.ai_max_retries as usize + 1));
        let mut last_error: Option<ProviderError> = None;

        let mut fallback_attempted = false;
        // Đã chạm nhánh dự phòng (kể cả bị circuit breaker bỏ qua). Dùng cho
        // bộ đếm lượt người dùng, KHÔNG dùng cho `bakhi_ai_fallback_total`.
        let mut fallback_reached = false;

        'providers: for (index, candidate) in candidates.iter().enumerate() {
            // Vai trò trong chuỗi: 0 = Primary, 1+ = Fallback N.
            let role = if index == 0 { "primary" } else { "fallback" };
            if Instant::now() >= deadline {
                // Hết giờ trước khi kịp chạm provider kế tiếp: chưa "chuyển dự phòng".
                last_error = Some(ProviderError::new(AiErrorCode::Timeout, candidate.provider));
                break;
            }
            if index > 0 {
                // Đã tới lượt provider dự phòng (kể cả khi bị circuit OPEN bỏ qua).
                fallback_reached = true;
            }

            if !self.state.circuits.allow(candidate.provider) {
                attempts.push(Attempt {
                    provider: candidate.provider,
                    model: candidate.model.clone(),
                    ok: false,
                    code: Some(AiErrorCode::CircuitOpen),
                    latency_ms: 0,
                });
                if index > 0 {
                    self.state.metrics.record_fallback("skipped");
                }
                tracing::warn!(
                    target: "bakhi::circuit",
                    provider = candidate.provider.as_str(),
                    model = %candidate.model,
                    role,
                    "bỏ qua provider đang OPEN"
                );
                last_error = Some(ProviderError::new(
                    AiErrorCode::CircuitOpen,
                    candidate.provider,
                ));
                continue;
            }

            let provider_impl = if self.settings.ai_mock {
                Some(Arc::new(MockProvider) as Arc<dyn crate::providers::AiProvider>)
            } else {
                self.state.providers.get(candidate.provider)
            };
            let Some(provider_impl) = provider_impl else {
                self.state.circuits.record_failure(candidate.provider);
                last_error = Some(ProviderError::new(
                    AiErrorCode::BadConfig,
                    candidate.provider,
                ));
                continue;
            };

            for retry in 0..=self.settings.ai_max_retries {
                if retry == 0 && index > 0 {
                    fallback_attempted = true;
                    self.state.metrics.record_fallback("attempted");
                }
                if retry > 0 {
                    self.state
                        .metrics
                        .record_retry(candidate.provider.as_str(), &candidate.model);
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining < Duration::from_millis(50) {
                    last_error = Some(ProviderError::new(AiErrorCode::Timeout, candidate.provider));
                    break 'providers;
                }

                // Giới hạn đồng thời theo TỪNG provider: provider chậm/đang bão
                // hoà không chiếm hết chỗ của provider khác. Hết thời gian chờ
                // thì bỏ provider này, không xếp hàng vô hạn.
                let provider_permit = self
                    .state
                    .concurrency
                    .acquire_provider(candidate.provider.as_str())
                    .await;
                let Some(provider_permit) = provider_permit else {
                    self.state.metrics.record_ai_attempt(
                        role,
                        candidate.provider.as_str(),
                        &candidate.model,
                        false,
                        0.0,
                        Some(AiErrorCode::ProviderDown.as_str()),
                    );
                    attempts.push(Attempt {
                        provider: candidate.provider,
                        model: candidate.model.clone(),
                        ok: false,
                        code: Some(AiErrorCode::ProviderDown),
                        latency_ms: 0,
                    });
                    tracing::warn!(
                        target: "bakhi::concurrency",
                        provider = candidate.provider.as_str(),
                        model = %candidate.model,
                        role,
                        "provider đạt giới hạn đồng thời — chuyển provider kế tiếp"
                    );
                    last_error = Some(ProviderError::new(
                        AiErrorCode::ProviderDown,
                        candidate.provider,
                    ));
                    break;
                };

                let attempt_start = Instant::now();
                // Mượn system + lịch sử của lượt chat: không sao chép toàn bộ
                // prompt/lịch sử cho mỗi provider, retry hay fallback.
                let request = ProviderRequest {
                    provider: candidate.provider,
                    model: &candidate.model,
                    system,
                    messages: turns,
                    max_tokens,
                    temperature: 0.4,
                    api_key: &candidate.api_key,
                    // 8.7.4 — hạn riêng cho token đầu và cho khoảng lặng.
                    ttft_timeout: self.settings.ai_ttft_timeout,
                    idle_timeout: self.settings.ai_stream_idle_timeout,
                };
                // Không để một attempt vượt quá hạn của cả chuỗi.
                let budget = per_attempt.min(remaining);
                let outcome = call_provider(
                    provider_impl.clone(),
                    request,
                    budget,
                    candidate.provider,
                    stream,
                    &self.state.metrics,
                )
                .await;
                // Chỉ giữ chỗ trong lúc chờ HTTP, không giữ qua backoff/retry.
                drop(provider_permit);

                // `call_provider` đã quy mọi timeout về `AiErrorCode::Timeout`,
                // nên một nhánh lỗi duy nhất xử lý timeout/kết nối/HTTP.
                match outcome {
                    Ok(result) => {
                        let latency_ms = attempt_start.elapsed().as_millis() as u64;
                        self.state.circuits.record_success(candidate.provider);
                        self.state.metrics.record_ai_attempt(
                            role,
                            result.provider.as_str(),
                            &result.model,
                            true,
                            latency_ms as f64 / 1000.0,
                            None,
                        );
                        self.state.metrics.record_ai_tokens(
                            role,
                            result.provider.as_str(),
                            &result.model,
                            &result.usage,
                        );
                        // TTFT chỉ có khi thực sự stream (provider trả chunk đầu).
                        if let Some(ttft) = result.ttft {
                            self.state.metrics.record_ai_ttft(
                                role,
                                result.provider.as_str(),
                                &result.model,
                                ttft.as_secs_f64(),
                            );
                        }
                        if stream.map(|sink| sink.delta_sent()) == Some(true) {
                            self.state.metrics.record_ai_stream_event("done");
                        }
                        if index > 0 {
                            self.state.metrics.record_fallback("success");
                        }
                        attempts.push(Attempt {
                            provider: candidate.provider,
                            model: candidate.model.clone(),
                            ok: true,
                            code: None,
                            latency_ms,
                        });
                        // Một lượt người dùng, dù đã qua bao nhiêu attempt.
                        self.state.metrics.record_ai_request(index > 0, true);
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
                    Err(error) => {
                        let latency_ms = attempt_start.elapsed().as_millis() as u64;
                        self.state.metrics.record_ai_attempt(
                            role,
                            candidate.provider.as_str(),
                            &candidate.model,
                            false,
                            latency_ms as f64 / 1000.0,
                            Some(error.code.as_str()),
                        );
                        tracing::warn!(
                            target: "bakhi::ai",
                            provider = candidate.provider.as_str(),
                            model = %candidate.model,
                            role,
                            retry,
                            code = error.code.as_str(),
                            "provider thất bại"
                        );
                        attempts.push(Attempt {
                            provider: candidate.provider,
                            model: candidate.model.clone(),
                            ok: false,
                            code: Some(error.code),
                            latency_ms,
                        });

                        if stream.map(|sink| sink.delta_sent()) == Some(true) {
                            // Nội dung đã tới trình duyệt: kết thúc chuỗi, chỉ báo lỗi.
                            self.state.metrics.record_ai_stream_event(
                                if error.code == AiErrorCode::Cancelled {
                                    "cancelled"
                                } else {
                                    "error"
                                },
                            );
                            last_error = Some(error);
                            break 'providers;
                        }

                        if !error.retryable() {
                            // AUTH / MODEL_NOT_FOUND / BAD_CONFIG / request sai:
                            // không thử lại và không chuyển dự phòng. QUOTA thì
                            // không thử lại nhưng vẫn thử provider kế tiếp.
                            // CANCELLED: người học đã dừng — dừng cả chuỗi.
                            let stops_chain = matches!(
                                error.code,
                                AiErrorCode::Auth
                                    | AiErrorCode::ModelNotFound
                                    | AiErrorCode::BadConfig
                                    | AiErrorCode::Cancelled
                                    | AiErrorCode::Unknown
                            );
                            last_error = Some(error);
                            if stops_chain {
                                break 'providers;
                            }
                            break;
                        }

                        self.state.circuits.record_failure(candidate.provider);
                        let wait = error.retry_after.unwrap_or_else(|| {
                            // Backoff luỹ thừa có jitter: tránh mọi người dùng
                            // thử lại cùng lúc sau khi provider vừa hồi phục.
                            backoff_with_jitter(
                                self.settings.retry_backoff,
                                self.settings.retry_backoff_max,
                                retry,
                                self.jitter.next(),
                            )
                        });
                        last_error = Some(error);
                        if retry == self.settings.ai_max_retries {
                            break;
                        }
                        let remaining = deadline.saturating_duration_since(Instant::now());
                        if wait >= remaining {
                            break 'providers;
                        }
                        tokio::time::sleep(wait).await;
                    }
                }
            }
        }

        if fallback_attempted {
            self.state.metrics.record_fallback("failure");
        }
        // Lượt thất bại vẫn được đếm là một lượt AI của người dùng; nếu chuỗi đã
        // chạm nhánh dự phòng thì đây là lượt fallback, không phải "chỉ primary".
        self.state
            .metrics
            .record_ai_request(fallback_reached, false);

        let error = match last_error {
            // Mọi provider đều OPEN: giữ mã cũ để frontend không phải biết
            // khái niệm circuit breaker.
            Some(error) if error.code == AiErrorCode::CircuitOpen => {
                ProviderError::new(AiErrorCode::ProviderDown, error.provider)
            }
            Some(error) => error,
            None => ProviderError::new(AiErrorCode::BadConfig, Provider::Custom),
        };
        Err(ChainFailure {
            error,
            attempts,
            fell_back: fallback_reached,
        })
    }

    /// Xử lý action `chat` — tương thích với Edge Function `ai-tutor-api`.
    pub async fn chat(&self, user: &AuthUser, request: ChatRequest) -> Result<Value, ApiError> {
        self.chat_guarded(user, request, None).await
    }

    /// 8.7.4 — endpoint streaming: cùng pipeline, cùng chính sách; chỉ khác
    /// là nội dung được gửi về theo từng phần trong lúc provider sinh ra.
    pub async fn chat_stream(
        &self,
        user: &AuthUser,
        request: ChatRequest,
        stream: StreamContext,
    ) -> Result<Value, ApiError> {
        self.chat_guarded(user, request, Some(stream)).await
    }

    async fn chat_guarded(
        &self,
        user: &AuthUser,
        request: ChatRequest,
        stream: Option<StreamContext>,
    ) -> Result<Value, ApiError> {
        // Nếu future bị drop (tab đóng, bấm Dừng, timeout tầng ngoài) thì đó là
        // một lượt bị huỷ thật — đếm một lần, không đếm khi trả lỗi bình thường.
        let guard = CancelGuard::new(self.state.metrics.clone());

        // Giới hạn đồng thời theo người dùng (mặc định 1): giống khoá `inFlight`
        // của Edge Function, hai tab không gọi AI chồng nhau. Có hạn chờ.
        let _permit = match self.state.concurrency.acquire_ai(&user.id).await {
            Some(permit) => permit,
            None => {
                guard.disarm();
                return Err(ApiError::busy(
                    "Trợ lý AI đang trả lời câu trước. Bạn chờ một chút nhé.",
                ));
            }
        };

        // `run_chain()` ghi metrics lượt người dùng một lần duy nhất (kể cả khi
        // thất bại), nên ở đây không đếm lại: lỗi xác thực/hạn mức không phải
        // một lượt gọi provider và không được làm sai availability.
        let result = self.chat_inner(user, request, stream).await;
        guard.disarm();
        result
    }

    async fn chat_inner(
        &self,
        user: &AuthUser,
        request: ChatRequest,
        stream: Option<StreamContext>,
    ) -> Result<Value, ApiError> {
        // 8.8.0 — ba lượt đọc ĐỘC LẬP chạy song song thay vì tuần tự:
        // cấu hình AI, route model và hồ sơ học sinh. Chúng không phụ thuộc
        // nhau nên đây là chỗ giảm thời gian chuẩn bị thật của mỗi lượt chat.
        let prep_started = Instant::now();
        let (settings_result, routes, student_result) = tokio::join!(
            self.load_settings(),
            self.load_routes(),
            self.student_record(user)
        );
        let settings = settings_result?;
        let student = student_result?;
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
        let raw_message = request.message.as_deref().unwrap_or("");
        if raw_message.chars().count() > MAX_USER_MESSAGE {
            return Err(ApiError::bad_request(
                "MESSAGE_TOO_LONG",
                format!("Câu hỏi quá dài (tối đa {MAX_USER_MESSAGE} ký tự)."),
            ));
        }
        let mut message = clean_message(raw_message);
        if message.is_empty() && !is_retry {
            return Err(ApiError::bad_request(
                "EMPTY_MESSAGE",
                "Bạn chưa nhập câu hỏi.",
            ));
        }

        let context = sanitize_context(request.context.as_ref());

        // Hồ sơ học sinh — auth user → student_devices → students. Không tin id
        // do client gửi. Hồ sơ ngừng hoạt động bị chặn như Edge Function.
        if let Some(record) = &student {
            if !record.is_active {
                return Err(ApiError::inactive());
            }
        }
        let student_id = student.as_ref().map(|record| record.id.as_str());

        if settings.daily_requests > 0 || settings.daily_tokens > 0 {
            if let Some(sid) = student_id {
                let (requests, tokens) = self.usage_today(sid).await;
                if settings.daily_requests > 0 && requests >= settings.daily_requests as i64 {
                    return Err(ApiError::new(
                        axum::http::StatusCode::TOO_MANY_REQUESTS,
                        "DAILY_LIMIT",
                        format!(
                            "Bạn đã dùng hết {} câu hỏi AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.",
                            settings.daily_requests
                        ),
                    )
                    .retryable(true));
                }
                if settings.daily_tokens > 0 && tokens >= settings.daily_tokens as i64 {
                    return Err(ApiError::new(
                        axum::http::StatusCode::TOO_MANY_REQUESTS,
                        "DAILY_TOKEN_LIMIT",
                        "Bạn đã chạm hạn mức dung lượng AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.",
                    )
                    .retryable(true));
                }
            }
        }

        if self.settings.persist_conversations && student_id.is_none() {
            // Giống Edge Function: tài khoản chưa gắn hồ sơ học sinh.
            return Err(ApiError::not_bound());
        }
        if !self.settings.persist_conversations {
            // Chế độ không lưu: một lượt hỏi–đáp, không ghi database.
            return self
                .ephemeral_chat(
                    &settings, &routes, mode, message, context, student_id, stream,
                )
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

        // Định tuyến chỉ đổi model của provider chính khi route rỗng. Truyền
        // model đã chọn xuống chuỗi provider thay vì clone toàn bộ AiSettings
        // (system prompt, danh sách chế độ, khoá…) mỗi lượt.
        let model_override = if settings.routing_enabled
            && routes.is_empty()
            && !choice.model.is_empty()
            && choice.reason != "routing-off"
        {
            Some(choice.model.as_str())
        } else {
            None
        };

        // Thời gian chuẩn bị nội bộ (đọc cấu hình, lịch sử, dựng prompt, cắt
        // token) — tách khỏi độ trễ provider để đọc metrics đúng bản chất.
        self.state
            .metrics
            .record_ai_preparation(prep_started.elapsed().as_secs_f64());

        let outcome = match &stream {
            Some(context) => {
                self.run_chain_stream(
                    &settings,
                    &routes,
                    &system,
                    &budgeted,
                    mode,
                    &message,
                    model_override,
                    context,
                )
                .await
            }
            None => {
                self.run_chain(
                    &settings,
                    &routes,
                    &system,
                    &budgeted,
                    mode,
                    &message,
                    model_override,
                )
                .await
            }
        };

        match outcome {
            Err(failure) => {
                let fell_back = failure.fell_back;
                let error = failure.error;
                self.supabase
                    .log_ai_usage(UsageLog {
                        student_id: Some(&student_id),
                        action: "chat",
                        provider: error.provider.as_str(),
                        model: &choice.model,
                        mode: mode.as_str(),
                        error_code: error.code.as_str(),
                        ok: false,
                        fell_back,
                        ..UsageLog::default()
                    })
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
                    .log_ai_usage(UsageLog {
                        student_id: Some(&student_id),
                        action: "chat",
                        provider: outcome.result.provider.as_str(),
                        model: &outcome.result.model,
                        mode: mode.as_str(),
                        tokens_in: outcome.result.usage.input,
                        tokens_out: outcome.result.usage.output,
                        latency_ms: outcome.latency_ms,
                        ok: true,
                        fell_back: outcome.fell_back,
                        estimated: outcome.result.usage.estimated,
                        ..UsageLog::default()
                    })
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
    #[allow(clippy::too_many_arguments)]
    async fn ephemeral_chat(
        &self,
        settings: &AiSettings,
        routes: &[ModelRoute],
        mode: TutorMode,
        message: String,
        context: SafeContext,
        student_id: Option<&str>,
        stream: Option<StreamContext>,
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
        let outcome = match &stream {
            Some(context) => {
                self.run_chain_stream(
                    settings, routes, &system, &turns, mode, &message, None, context,
                )
                .await
            }
            None => {
                self.run_chain(settings, routes, &system, &turns, mode, &message, None)
                    .await
            }
        };
        match outcome {
            Ok(outcome) => {
                self.supabase
                    .log_ai_usage(UsageLog {
                        student_id,
                        action: "chat",
                        provider: outcome.result.provider.as_str(),
                        model: &outcome.result.model,
                        mode: mode.as_str(),
                        tokens_in: outcome.result.usage.input,
                        tokens_out: outcome.result.usage.output,
                        latency_ms: outcome.latency_ms,
                        ok: true,
                        fell_back: outcome.fell_back,
                        estimated: outcome.result.usage.estimated,
                        ..UsageLog::default()
                    })
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
            Err(failure) => Err(ApiError::bad_gateway(
                failure.error.code.as_str(),
                failure.error.code.message(),
                failure.error.code.retryable(),
            )),
        }
    }

    async fn student_record(
        &self,
        user: &AuthUser,
    ) -> Result<Option<crate::services::supabase::StudentRecord>, ApiError> {
        self.supabase.student_record(user).await
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
        let row = rows.as_array()?.first()?;
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

    /// Cắt chuỗi theo số KÝ TỰ (không cắt giữa ký tự UTF-8). Trả về mượn khi
    /// chuỗi đã trong giới hạn, tránh cấp phát bản sao cho mọi tin nhắn.
    fn truncate_chars(raw: &str, max_chars: usize) -> &str {
        match raw.char_indices().nth(max_chars) {
            Some((index, _)) => &raw[..index],
            None => raw,
        }
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
            "content": Self::truncate_chars(content, 24_000),
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
    let filtered: String = raw
        .chars()
        .filter(|ch| !ch.is_control() || *ch == '\n' || *ch == '\t')
        .collect();
    let trimmed = filtered.trim();
    // Hành vi giống bản cũ: cắt theo số ký tự rồi trim lần nữa. Chỉ cấp phát
    // thêm khi thật sự vượt giới hạn.
    if trimmed.chars().count() > MAX_USER_MESSAGE {
        let mut out: String = trimmed.chars().take(MAX_USER_MESSAGE).collect();
        let end = out.trim_end().len();
        out.truncate(end);
        out.trim_start().to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn auto_title(message: &str, mode: TutorMode) -> String {
    let compact = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return format!("Hội thoại {}", mode.as_str());
    }
    // Giống Edge Function: 64 ký tự, cắt bằng dấu ba chấm.
    if compact.chars().count() > 64 {
        let mut title: String = compact.chars().take(61).collect();
        title = title.trim_end().to_string();
        title.push('…');
        title
    } else {
        compact
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
    fn auto_title_truncates_like_edge_function() {
        let long = "a".repeat(120);
        let title = auto_title(&long, TutorMode::Explain);
        assert!(title.ends_with('…'));
        assert_eq!(title.chars().count(), 62);
        assert!(title.chars().count() <= 64);
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

#[cfg(test)]
mod stream_tests {
    use super::*;

    #[tokio::test]
    async fn stream_context_reports_closed_receiver() {
        let (tx, rx) = mpsc::channel(4);
        let context = StreamContext::new(tx);
        assert!(!context.delta_sent());
        // Trình duyệt đóng kết nối: mọi lần gửi sau đó phải trả false để tầng
        // provider dừng đọc thay vì chạy tiếp vô ích.
        drop(rx);
        assert!(!context.delta("x").await);
        assert!(!context.send("done", &json!({})).await);
    }

    #[tokio::test]
    async fn stream_context_marks_delta_after_sending_content() {
        let (tx, mut rx) = mpsc::channel(4);
        let context = StreamContext::new(tx);
        assert!(context.delta("xin chào").await);
        assert!(context.delta_sent());
        assert!(rx.recv().await.is_some());
    }
}

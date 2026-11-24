// ===========================================================================
// Bá Khí — Rust backend · config/settings.rs
//
// Toàn bộ cấu hình đọc từ biến môi trường. KHÔNG có giá trị bí mật mặc định,
// KHÔNG ghi giá trị bí mật vào log (Debug được cài đặt thủ công để che).
//
// 8.6.1: thêm timeout theo từng lớp (kết nối → provider → gateway → request),
// giới hạn đồng thời, circuit breaker và thời gian chờ khi shutdown. Mọi ràng
// buộc được kiểm tra NGAY khi khởi động — cấu hình sai làm tiến trình dừng với
// thông điệp rõ ràng, không để lỗi xuất hiện lúc đang phục vụ học sinh.
// ===========================================================================

use std::collections::HashMap;
use std::env;
use std::fmt;
use std::time::Duration;

use crate::observability::pricing::Pricing;

/// Thời gian chờ và giới hạn mặc định — dùng chung cho mọi môi trường.
const DEFAULT_PORT: u16 = 8080;
const DEFAULT_CONNECT_TIMEOUT_MS: u64 = 5_000;
const DEFAULT_PROVIDER_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_GATEWAY_TIMEOUT_MS: u64 = 40_000;
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 45_000;
const DEFAULT_SUPABASE_TIMEOUT_MS: u64 = 10_000;
const DEFAULT_SHUTDOWN_GRACE_MS: u64 = 20_000;
const DEFAULT_RETRY_BACKOFF_MS: u64 = 500;
const DEFAULT_CONCURRENCY_WAIT_MS: u64 = 750;
const DEFAULT_MAX_BODY_BYTES: usize = 256 * 1024;
const DEFAULT_RATE_PER_MIN: u32 = 240;
const DEFAULT_AI_RATE_PER_MIN: u32 = 30;
const DEFAULT_MAX_RETRIES: u8 = 1;
const DEFAULT_MAX_CONCURRENCY: usize = 512;
const DEFAULT_AI_CONCURRENCY: usize = 32;
const DEFAULT_USER_CONCURRENCY: usize = 1;
const DEFAULT_PROVIDER_CONCURRENCY: usize = 10;
const DEFAULT_POOL_MAX_IDLE_PER_HOST: usize = 32;
const DEFAULT_IDLE_CONNECTION_TIMEOUT_MS: u64 = 90_000;
const DEFAULT_CIRCUIT_THRESHOLD: u32 = 5;
const DEFAULT_CIRCUIT_COOLDOWN_MS: u64 = 30_000;
const DEFAULT_CIRCUIT_HALF_OPEN: u32 = 1;

const MIN_BODY_BYTES: usize = 1_024;
const MAX_BODY_BYTES_LIMIT: usize = 16 * 1024 * 1024;
const MAX_CONCURRENCY_LIMIT: usize = 65_535;
/// Trần worker thread của Tokio: nhiều hơn nữa chỉ tăng chi phí chuyển ngữ cảnh.
const MAX_WORKER_THREADS: usize = 256;
const MAX_POOL_IDLE_PER_HOST: usize = 1_024;

/// Origin mặc định của website (GitHub Pages). Chỉ dùng khi CORS_ORIGINS trống.
const DEFAULT_CORS_ORIGIN: &str = "https://minhtruk.github.io";

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("thiếu biến môi trường bắt buộc: {0}")]
    Missing(&'static str),
    #[error("giá trị không hợp lệ cho biến môi trường: {0}")]
    Invalid(&'static str),
    /// Cấu hình đọc được nhưng các giá trị mâu thuẫn nhau (ví dụ gateway timeout
    /// lớn hơn request timeout). Thông điệp nêu tên biến, không nêu giá trị bí mật.
    #[error("cấu hình không nhất quán: {0}")]
    UnsafeCombination(&'static str),
}

#[derive(Clone)]
pub struct Settings {
    pub host: String,
    pub port: u16,
    /// Danh sách origin được phép gọi API. Rỗng = chỉ origin mặc định.
    pub cors_origins: Vec<String>,

    pub supabase_url: String,
    pub supabase_anon_key: String,
    /// Chỉ dùng cho tác vụ đọc cấu hình máy chủ (ai_settings, ai_model_routes),
    /// ánh xạ danh tính (student_devices → students) và ghi nhật ký sử dụng.
    /// Không dùng thay quyền người dùng để đọc dữ liệu học tập.
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
    /// Timeout một lần gọi provider (một attempt).
    pub ai_timeout: Duration,
    /// Trần thời gian cho toàn bộ chuỗi Primary → Fallback (mọi attempt).
    pub ai_gateway_timeout: Duration,

    /// Timeout kết nối TCP tới Supabase / provider.
    pub connect_timeout: Duration,
    /// Timeout một request HTTP tới Supabase (PostgREST/Auth).
    pub supabase_timeout: Duration,
    /// Timeout tổng cho một request HTTP của Axum.
    pub request_timeout: Duration,
    /// Thời gian tối đa chờ request đang chạy khi nhận SIGTERM/SIGINT.
    pub shutdown_grace: Duration,
    /// Chờ tối thiểu trước khi thử lại (có thể tăng theo Retry-After).
    pub retry_backoff: Duration,

    pub max_body_bytes: usize,
    pub rate_limit_per_min: u32,
    pub ai_rate_per_min: u32,

    /// Số request đồng thời toàn dịch vụ.
    pub max_concurrency: usize,
    /// Số lượt gọi AI đồng thời.
    pub max_ai_concurrency: usize,
    /// Số lượt gọi AI đồng thời cho mỗi người dùng.
    pub max_user_concurrency: usize,
    /// Số request đồng thời tới MỘT provider AI (mỗi provider một semaphore).
    pub max_provider_concurrency: usize,
    /// Thời gian chờ lấy semaphore trước khi trả 429.
    pub concurrency_wait: Duration,

    /// Số worker thread của Tokio runtime. `None` = để Tokio chọn theo số CPU.
    /// Đọc một lần khi khởi động; không tạo runtime mới cho từng request.
    pub worker_threads: Option<usize>,
    /// Số kết nối idle tối đa giữ lại cho mỗi host trong pool reqwest.
    pub pool_max_idle_per_host: usize,
    /// Thời gian giữ kết nối idle trước khi đóng.
    pub idle_connection_timeout: Duration,

    /// Số lỗi liên tiếp để mở circuit của một provider.
    pub circuit_threshold: u32,
    /// Thời gian provider nghỉ trước khi thử HALF_OPEN.
    pub circuit_cooldown: Duration,
    /// Số request thử nghiệm tối đa khi HALF_OPEN.
    pub circuit_half_open_limit: u32,

    /// Ghi hội thoại AI vào Supabase như Edge Function hiện tại.
    pub persist_conversations: bool,
    /// Tin header X-Forwarded-For của proxy phía trước.
    pub trust_proxy: bool,

    /// `GET /api/v1/metrics` (định dạng Prometheus) — mặc định tắt.
    pub metrics_enabled: bool,
    /// Token bắt buộc khi bật metrics. Rỗng ⇒ endpoint trả 404 dù đã bật.
    pub metrics_token: Option<String>,

    /// Bảng giá AI nạp từ `AI_PRICING_JSON` hoặc `AI_PRICING_FILE`.
    /// Rỗng ⇒ chi phí là "chưa xác định", không bao giờ là 0 USD.
    pub ai_pricing: Pricing,
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
            .field("ai_gateway_timeout", &self.ai_gateway_timeout)
            .field("connect_timeout", &self.connect_timeout)
            .field("supabase_timeout", &self.supabase_timeout)
            .field("request_timeout", &self.request_timeout)
            .field("shutdown_grace", &self.shutdown_grace)
            .field("retry_backoff", &self.retry_backoff)
            .field("max_body_bytes", &self.max_body_bytes)
            .field("rate_limit_per_min", &self.rate_limit_per_min)
            .field("ai_rate_per_min", &self.ai_rate_per_min)
            .field("max_concurrency", &self.max_concurrency)
            .field("max_ai_concurrency", &self.max_ai_concurrency)
            .field("max_user_concurrency", &self.max_user_concurrency)
            .field("max_provider_concurrency", &self.max_provider_concurrency)
            .field("concurrency_wait", &self.concurrency_wait)
            .field("worker_threads", &self.worker_threads)
            .field("pool_max_idle_per_host", &self.pool_max_idle_per_host)
            .field("idle_connection_timeout", &self.idle_connection_timeout)
            .field("circuit_threshold", &self.circuit_threshold)
            .field("circuit_cooldown", &self.circuit_cooldown)
            .field("circuit_half_open_limit", &self.circuit_half_open_limit)
            .field("persist_conversations", &self.persist_conversations)
            .field("trust_proxy", &self.trust_proxy)
            .field("metrics_enabled", &self.metrics_enabled)
            .field("metrics_token", &self.metrics_token.as_deref().map(redact))
            .field("ai_pricing_version", &self.ai_pricing.version)
            .field("ai_pricing_models", &self.ai_pricing.model_count())
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

/// Đọc biến đầu tiên có mặt trong danh sách ưu tiên.
///
/// 8.7.1: tên `RUST_*` (chuẩn hoá) được ưu tiên; tên cũ vẫn đọc được để bản
/// triển khai hiện có không phải đổi cấu hình.
fn var_any(names: &[&'static str]) -> Option<String> {
    names.iter().find_map(|name| var(name))
}

/// Như `parse_num` nhưng nhận nhiều tên, lỗi nêu tên ĐẦU TIÊN (tên chuẩn).
fn parse_num_any<T: std::str::FromStr>(names: &[&'static str]) -> Result<Option<T>, ConfigError> {
    match var_any(names) {
        None => Ok(None),
        Some(raw) => raw
            .parse::<T>()
            .map(Some)
            .map_err(|_| ConfigError::Invalid(names[0])),
    }
}

/// Đọc giá trị giây (số nguyên dương) thành Duration.
fn parse_secs(raw: &str, name: &'static str) -> Result<Duration, ConfigError> {
    match raw.trim().parse::<u64>() {
        Ok(seconds) if (1..=86_400).contains(&seconds) => Ok(Duration::from_secs(seconds)),
        _ => Err(ConfigError::Invalid(name)),
    }
}

fn parse_secs_any(names: &[&'static str]) -> Result<Option<Duration>, ConfigError> {
    match var_any(names) {
        None => Ok(None),
        Some(raw) => parse_secs(&raw, names[0]).map(Some),
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

        let settings = Self {
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
                parse_num::<u64>("AI_TUTOR_TIMEOUT")?.unwrap_or(DEFAULT_PROVIDER_TIMEOUT_MS),
            ),
            ai_gateway_timeout: Duration::from_millis(
                parse_num::<u64>("AI_GATEWAY_TIMEOUT_MS")?.unwrap_or(DEFAULT_GATEWAY_TIMEOUT_MS),
            ),
            // RUST_*_SECS (nếu có) thắng tên mili-giây cũ.
            connect_timeout: match parse_secs_any(&["RUST_CONNECT_TIMEOUT_SECS"])? {
                Some(explicit) => explicit,
                None => Duration::from_millis(
                    parse_num::<u64>("CONNECT_TIMEOUT_MS")?.unwrap_or(DEFAULT_CONNECT_TIMEOUT_MS),
                ),
            },
            supabase_timeout: Duration::from_millis(
                parse_num::<u64>("SUPABASE_TIMEOUT_MS")?.unwrap_or(DEFAULT_SUPABASE_TIMEOUT_MS),
            ),
            request_timeout: match parse_secs_any(&["RUST_REQUEST_TIMEOUT_SECS"])? {
                Some(explicit) => explicit,
                None => Duration::from_millis(
                    parse_num::<u64>("REQUEST_TIMEOUT_MS")?.unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS),
                ),
            },
            shutdown_grace: Duration::from_millis(
                parse_num::<u64>("SHUTDOWN_GRACE_MS")?.unwrap_or(DEFAULT_SHUTDOWN_GRACE_MS),
            ),
            retry_backoff: Duration::from_millis(
                parse_num::<u64>("AI_RETRY_BACKOFF_MS")?.unwrap_or(DEFAULT_RETRY_BACKOFF_MS),
            ),
            max_body_bytes: parse_num::<usize>("MAX_BODY_BYTES")?.unwrap_or(DEFAULT_MAX_BODY_BYTES),
            rate_limit_per_min: parse_num::<u32>("RATE_LIMIT_PER_MIN")?
                .unwrap_or(DEFAULT_RATE_PER_MIN),
            ai_rate_per_min: parse_num::<u32>("AI_RATE_LIMIT_PER_MIN")?
                .unwrap_or(DEFAULT_AI_RATE_PER_MIN),
            max_concurrency: parse_num_any::<usize>(&[
                "RUST_MAX_CONCURRENT_REQUESTS",
                "MAX_CONCURRENCY",
            ])?
            .unwrap_or(DEFAULT_MAX_CONCURRENCY),
            max_ai_concurrency: parse_num_any::<usize>(&[
                "RUST_MAX_CONCURRENT_AI_REQUESTS",
                "AI_MAX_CONCURRENCY",
            ])?
            .unwrap_or(DEFAULT_AI_CONCURRENCY),
            max_user_concurrency: parse_num::<usize>("AI_USER_MAX_CONCURRENCY")?
                .unwrap_or(DEFAULT_USER_CONCURRENCY),
            max_provider_concurrency: parse_num_any::<usize>(&[
                "RUST_MAX_CONCURRENT_PROVIDER_REQUESTS",
                "AI_PROVIDER_MAX_CONCURRENCY",
            ])?
            .unwrap_or(DEFAULT_PROVIDER_CONCURRENCY),
            concurrency_wait: Duration::from_millis(
                parse_num::<u64>("CONCURRENCY_WAIT_MS")?.unwrap_or(DEFAULT_CONCURRENCY_WAIT_MS),
            ),
            // 0 = tự chọn theo CPU (mặc định của Tokio).
            worker_threads: parse_num_any::<usize>(&["RUST_WORKER_THREADS"])?.filter(|n| *n > 0),
            pool_max_idle_per_host: parse_num_any::<usize>(&["RUST_POOL_MAX_IDLE_PER_HOST"])?
                .unwrap_or(DEFAULT_POOL_MAX_IDLE_PER_HOST),
            idle_connection_timeout: parse_secs_any(&["RUST_IDLE_CONNECTION_TIMEOUT_SECS"])?
                .unwrap_or(Duration::from_millis(DEFAULT_IDLE_CONNECTION_TIMEOUT_MS)),
            circuit_threshold: parse_num::<u32>("AI_CIRCUIT_THRESHOLD")?
                .unwrap_or(DEFAULT_CIRCUIT_THRESHOLD)
                .max(1),
            circuit_cooldown: Duration::from_millis(
                parse_num::<u64>("AI_CIRCUIT_COOLDOWN_MS")?.unwrap_or(DEFAULT_CIRCUIT_COOLDOWN_MS),
            ),
            circuit_half_open_limit: parse_num::<u32>("AI_CIRCUIT_HALF_OPEN")?
                .unwrap_or(DEFAULT_CIRCUIT_HALF_OPEN)
                .max(1),
            persist_conversations: var("AI_PERSIST_CONVERSATIONS")
                .map(|v| parse_bool(&v, true))
                .unwrap_or(true),
            trust_proxy: var("TRUST_PROXY")
                .map(|v| parse_bool(&v, false))
                .unwrap_or(false),
            metrics_enabled: var("METRICS_ENABLED")
                .map(|v| parse_bool(&v, false))
                .unwrap_or(false),
            metrics_token: var("METRICS_TOKEN"),
            ai_pricing: Pricing::from_env(),
        };
        settings.validate()?;
        Ok(settings)
    }

    /// Ràng buộc giữa các timeout và giới hạn. Trả lỗi nêu TÊN biến, không nêu giá trị.
    pub fn validate(&self) -> Result<(), ConfigError> {
        let millis = |d: Duration| d.as_millis() as u64;
        if millis(self.connect_timeout) < 100 {
            return Err(ConfigError::Invalid("CONNECT_TIMEOUT_MS"));
        }
        if millis(self.ai_timeout) < 1_000 {
            return Err(ConfigError::Invalid("AI_TUTOR_TIMEOUT"));
        }
        if millis(self.supabase_timeout) < 100 {
            return Err(ConfigError::Invalid("SUPABASE_TIMEOUT_MS"));
        }
        if millis(self.request_timeout) < 1_000 {
            return Err(ConfigError::Invalid("REQUEST_TIMEOUT_MS"));
        }
        if self.connect_timeout > self.ai_timeout {
            return Err(ConfigError::UnsafeCombination(
                "CONNECT_TIMEOUT_MS phải nhỏ hơn hoặc bằng AI_TUTOR_TIMEOUT",
            ));
        }
        if self.ai_timeout > self.ai_gateway_timeout {
            return Err(ConfigError::UnsafeCombination(
                "AI_TUTOR_TIMEOUT phải nhỏ hơn hoặc bằng AI_GATEWAY_TIMEOUT_MS",
            ));
        }
        if self.ai_gateway_timeout > self.request_timeout {
            return Err(ConfigError::UnsafeCombination(
                "AI_GATEWAY_TIMEOUT_MS phải nhỏ hơn hoặc bằng REQUEST_TIMEOUT_MS",
            ));
        }
        if self.supabase_timeout > self.request_timeout {
            return Err(ConfigError::UnsafeCombination(
                "SUPABASE_TIMEOUT_MS phải nhỏ hơn hoặc bằng REQUEST_TIMEOUT_MS",
            ));
        }
        if millis(self.shutdown_grace) < 1_000 {
            return Err(ConfigError::Invalid("SHUTDOWN_GRACE_MS"));
        }
        if millis(self.retry_backoff) > 10_000 {
            return Err(ConfigError::Invalid("AI_RETRY_BACKOFF_MS"));
        }
        if !(MIN_BODY_BYTES..=MAX_BODY_BYTES_LIMIT).contains(&self.max_body_bytes) {
            return Err(ConfigError::Invalid("MAX_BODY_BYTES"));
        }
        for (value, name) in [
            (self.max_concurrency, "MAX_CONCURRENCY"),
            (self.max_ai_concurrency, "AI_MAX_CONCURRENCY"),
            (self.max_user_concurrency, "AI_USER_MAX_CONCURRENCY"),
            (
                self.max_provider_concurrency,
                "RUST_MAX_CONCURRENT_PROVIDER_REQUESTS",
            ),
        ] {
            if value == 0 || value > MAX_CONCURRENCY_LIMIT {
                return Err(ConfigError::Invalid(match name {
                    "MAX_CONCURRENCY" => "MAX_CONCURRENCY",
                    "AI_MAX_CONCURRENCY" => "AI_MAX_CONCURRENCY",
                    "AI_USER_MAX_CONCURRENCY" => "AI_USER_MAX_CONCURRENCY",
                    _ => "RUST_MAX_CONCURRENT_PROVIDER_REQUESTS",
                }));
            }
        }
        if let Some(workers) = self.worker_threads {
            if workers == 0 || workers > MAX_WORKER_THREADS {
                return Err(ConfigError::Invalid("RUST_WORKER_THREADS"));
            }
        }
        if self.pool_max_idle_per_host == 0 || self.pool_max_idle_per_host > MAX_POOL_IDLE_PER_HOST
        {
            return Err(ConfigError::Invalid("RUST_POOL_MAX_IDLE_PER_HOST"));
        }
        if self.idle_connection_timeout < Duration::from_secs(1) {
            return Err(ConfigError::Invalid("RUST_IDLE_CONNECTION_TIMEOUT_SECS"));
        }
        if self.max_ai_concurrency > self.max_concurrency {
            return Err(ConfigError::UnsafeCombination(
                "AI_MAX_CONCURRENCY phải nhỏ hơn hoặc bằng MAX_CONCURRENCY",
            ));
        }
        if self.circuit_cooldown < Duration::from_secs(1) {
            return Err(ConfigError::Invalid("AI_CIRCUIT_COOLDOWN_MS"));
        }
        Ok(())
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
            ai_fallback_key: Some("test-fallback-key".to_string()),
            ai_extra_keys: HashMap::new(),
            ai_base_url: None,
            ai_mock: false,
            ai_max_retries: 0,
            ai_timeout: Duration::from_millis(2_000),
            ai_gateway_timeout: Duration::from_millis(4_000),
            connect_timeout: Duration::from_millis(500),
            supabase_timeout: Duration::from_millis(3_000),
            request_timeout: Duration::from_millis(5_000),
            shutdown_grace: Duration::from_millis(2_000),
            retry_backoff: Duration::from_millis(10),
            max_body_bytes: DEFAULT_MAX_BODY_BYTES,
            rate_limit_per_min: 10_000,
            ai_rate_per_min: 10_000,
            max_concurrency: 256,
            max_ai_concurrency: 32,
            max_user_concurrency: 1,
            max_provider_concurrency: 4,
            concurrency_wait: Duration::from_millis(250),
            worker_threads: None,
            pool_max_idle_per_host: DEFAULT_POOL_MAX_IDLE_PER_HOST,
            idle_connection_timeout: Duration::from_millis(DEFAULT_IDLE_CONNECTION_TIMEOUT_MS),
            circuit_threshold: 5,
            circuit_cooldown: Duration::from_secs(30),
            circuit_half_open_limit: 1,
            persist_conversations: false,
            trust_proxy: false,
            metrics_enabled: false,
            metrics_token: None,
            ai_pricing: Pricing::default(),
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

    #[test]
    fn test_settings_are_valid() {
        assert!(Settings::for_tests().validate().is_ok());
    }

    #[test]
    fn gateway_timeout_must_fit_request_deadline() {
        let mut settings = Settings::for_tests();
        settings.ai_gateway_timeout = settings.request_timeout + Duration::from_secs(1);
        // ai_timeout cũng phải <= gateway, giữ nguyên nên lỗi nêu tên gateway.
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::UnsafeCombination(_))
        ));
    }

    #[test]
    fn provider_timeout_larger_than_gateway_is_rejected() {
        let mut settings = Settings::for_tests();
        settings.ai_timeout = settings.ai_gateway_timeout + Duration::from_secs(1);
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::UnsafeCombination(_))
        ));
    }

    #[test]
    fn invalid_body_and_concurrency_limits_are_rejected() {
        let mut settings = Settings::for_tests();
        settings.max_body_bytes = 10;
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::Invalid("MAX_BODY_BYTES"))
        ));

        let mut settings = Settings::for_tests();
        settings.max_ai_concurrency = 0;
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::Invalid("AI_MAX_CONCURRENCY"))
        ));

        let mut settings = Settings::for_tests();
        settings.max_ai_concurrency = settings.max_concurrency + 1;
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::UnsafeCombination(_))
        ));
    }

    #[test]
    fn seconds_values_are_positive_and_bounded() {
        assert_eq!(
            parse_secs("30", "RUST_REQUEST_TIMEOUT_SECS").unwrap(),
            Duration::from_secs(30)
        );
        assert!(parse_secs("0", "RUST_REQUEST_TIMEOUT_SECS").is_err());
        assert!(parse_secs("-1", "RUST_REQUEST_TIMEOUT_SECS").is_err());
        assert!(parse_secs("90000", "RUST_REQUEST_TIMEOUT_SECS").is_err());
        assert!(parse_secs("abc", "RUST_REQUEST_TIMEOUT_SECS").is_err());
    }

    #[test]
    fn worker_and_pool_limits_are_validated() {
        let mut settings = Settings::for_tests();
        settings.worker_threads = Some(MAX_WORKER_THREADS + 1);
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::Invalid("RUST_WORKER_THREADS"))
        ));
        settings.worker_threads = Some(4);
        assert!(settings.validate().is_ok());

        let mut settings = Settings::for_tests();
        settings.pool_max_idle_per_host = 0;
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::Invalid("RUST_POOL_MAX_IDLE_PER_HOST"))
        ));

        let mut settings = Settings::for_tests();
        settings.max_provider_concurrency = 0;
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::Invalid(
                "RUST_MAX_CONCURRENT_PROVIDER_REQUESTS"
            ))
        ));
    }

    #[test]
    fn circuit_cooldown_has_a_floor() {
        let mut settings = Settings::for_tests();
        settings.circuit_cooldown = Duration::from_millis(10);
        assert!(matches!(
            settings.validate(),
            Err(ConfigError::Invalid("AI_CIRCUIT_COOLDOWN_MS"))
        ));
    }
}

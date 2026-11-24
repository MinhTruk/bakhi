// ===========================================================================
// Bá Khí — Rust backend (v8.7.2)
//
// Modular monolith: Axum + Tokio + Serde. Mọi phụ thuộc dùng chung (HTTP client,
// Supabase client, provider registry, bộ giới hạn tần suất, circuit breaker,
// semaphore đồng thời) được dựng MỘT LẦN trong AppState và tái sử dụng.
//
// Thứ tự lớp middleware (ngoài → trong):
//   timeout → CORS → trace → request_id → access_log → concurrency →
//   content-type → rate limit → handler
// Nhờ vậy mọi phản hồi lỗi đều có request id, log có thời gian và mã trạng thái,
// và request bị từ chối vì quá tải không bao giờ chờ vô hạn.
// ===========================================================================

pub mod config;
pub mod errors;
pub mod lifecycle;
pub mod middleware;
pub mod observability;
pub mod providers;
pub mod routes;
pub mod services;

use std::sync::Arc;
use std::time::Duration;

use axum::extract::DefaultBodyLimit;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderName, HeaderValue, Method};
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::config::Settings;
use crate::errors::REQUEST_ID_HEADER;
use crate::lifecycle::Lifecycle;
use crate::middleware::{
    concurrency::concurrency_middleware, rate_limit_middleware, request_id_middleware, Concurrency,
};
use crate::observability::metrics::Metrics;
use crate::providers::circuit::CircuitBreaker;
use crate::providers::ProviderRegistry;
use crate::services::supabase::SupabaseClient;

#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Settings>,
    pub http: reqwest::Client,
    pub supabase: Arc<SupabaseClient>,
    pub limiter: Arc<middleware::rate_limit::RateLimiter>,
    pub providers: Arc<ProviderRegistry>,
    pub circuits: Arc<CircuitBreaker>,
    pub concurrency: Arc<Concurrency>,
    pub metrics: Arc<Metrics>,
    pub lifecycle: Arc<Lifecycle>,
}

impl AppState {
    pub fn new(settings: Settings) -> Result<Self, reqwest::Error> {
        let http = build_http_client(&settings);
        let supabase = Arc::new(SupabaseClient::new(http.clone(), &settings));
        let providers = Arc::new(ProviderRegistry::build(&http, &settings));
        Ok(Self {
            limiter: Arc::new(middleware::rate_limit::RateLimiter::new(
                Duration::from_secs(60),
            )),
            circuits: Arc::new(CircuitBreaker::new(
                settings.circuit_threshold,
                settings.circuit_cooldown,
                settings.circuit_half_open_limit,
            )),
            concurrency: Arc::new(Concurrency::new(
                settings.max_concurrency,
                settings.max_ai_concurrency,
                settings.max_user_concurrency,
                settings.max_provider_concurrency,
                settings.concurrency_wait,
            )),
            metrics: Arc::new(Metrics::new(settings.ai_pricing.clone())),
            lifecycle: Arc::new(Lifecycle::new()),
            supabase,
            providers,
            http,
            settings: Arc::new(settings),
        })
    }
}

/// HTTP client dùng chung: giữ kết nối (keep-alive), pool cấu hình được.
///
/// Dựng MỘT LẦN trong `AppState`; mọi request Supabase/provider dùng lại client
/// này nên connection pool và TLS session được tái sử dụng. Không tạo client
/// trong vòng lặp xử lý request.
pub fn build_http_client(settings: &Settings) -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(format!("BakhiBackend/{}", env!("CARGO_PKG_VERSION")))
        .pool_max_idle_per_host(settings.pool_max_idle_per_host)
        .pool_idle_timeout(settings.idle_connection_timeout)
        .tcp_nodelay(true)
        // Giữ kết nối sống qua khoảng lặng ngắn của client mà không phụ thuộc
        // mặc định của hệ điều hành.
        .tcp_keepalive(Duration::from_secs(60))
        .connect_timeout(settings.connect_timeout)
        .timeout(settings.request_timeout)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn cors_layer(settings: &Settings) -> CorsLayer {
    let origins: Vec<HeaderValue> = settings
        .cors_origins
        .iter()
        .filter(|origin| origin.as_str() != "*")
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            HeaderName::from_static("apikey"),
            HeaderName::from_static("accept"),
            HeaderName::from_static(REQUEST_ID_HEADER),
        ])
        .expose_headers([HeaderName::from_static(REQUEST_ID_HEADER)])
        .max_age(Duration::from_secs(3600))
}

pub fn build_router(state: AppState) -> Router {
    let api: Router<AppState> = Router::new()
        .route("/health", get(routes::health::health))
        .route("/ready", get(routes::health::ready))
        .route("/metrics", get(routes::metrics::metrics))
        .route(
            "/observability/summary",
            post(routes::observability::summary),
        )
        .route("/me", get(routes::me::me))
        .route("/ai/chat", post(routes::ai::chat))
        .route(
            "/data/learning-stats",
            post(routes::data::learning_stats_route),
        )
        // Trong cùng: content-type kiểm tra trước, rồi tới hạn mức tần suất.
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ))
        .layer(axum::middleware::from_fn(
            middleware::content_type::require_json,
        ));

    let cors = cors_layer(&state.settings);
    let max_body = state.settings.max_body_bytes;
    let timeout = state.settings.request_timeout;

    Router::new()
        // Prometheus scrape ở gốc `/metrics`; giữ `/api/v1/metrics` cho tương thích 8.6.1.
        .route("/metrics", get(routes::metrics::metrics))
        .nest("/api/v1", api)
        // Thêm từ trong ra ngoài: request_id phải có TRƯỚC access_log để log/metrics
        // có mã, và access_log nằm ngoài concurrency để mọi phản hồi 429 đều được đếm.
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            concurrency_middleware,
        ))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            observability::access_log,
        ))
        .layer(axum::middleware::from_fn(request_id_middleware))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(DefaultBodyLimit::max(max_body))
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::GATEWAY_TIMEOUT,
            timeout,
        ))
        .with_state(state)
}

/// Phiên bản dịch vụ, dùng cho log khởi động và kiểm tra.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

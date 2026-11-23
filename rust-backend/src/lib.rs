// ===========================================================================
// Bá Khí — Rust backend (v8.6.0)
//
// Modular monolith: Axum + Tokio + Serde. Mọi phụ thuộc dùng chung (HTTP client,
// Supabase client, provider registry, bộ giới hạn tần suất) được dựng MỘT LẦN
// trong AppState và tái sử dụng cho mọi request.
// ===========================================================================

pub mod config;
pub mod errors;
pub mod middleware;
pub mod providers;
pub mod routes;
pub mod services;

use std::sync::Arc;
use std::time::{Duration, Instant};

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
use crate::middleware::{rate_limit_middleware, request_id_middleware, RateLimiter};
use crate::providers::ProviderRegistry;
use crate::services::supabase::SupabaseClient;

#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Settings>,
    pub http: reqwest::Client,
    pub supabase: Arc<SupabaseClient>,
    pub limiter: Arc<RateLimiter>,
    pub providers: Arc<ProviderRegistry>,
    pub started: Instant,
}

impl AppState {
    pub fn new(settings: Settings) -> Result<Self, reqwest::Error> {
        let http = build_http_client(&settings);
        let supabase = Arc::new(SupabaseClient::new(http.clone(), &settings));
        let providers = Arc::new(ProviderRegistry::build(&http, &settings));
        Ok(Self {
            settings: Arc::new(settings),
            http,
            supabase,
            // Cửa sổ 60 giây cho giới hạn tần suất theo IP.
            limiter: Arc::new(RateLimiter::new(Duration::from_secs(60))),
            providers,
            started: Instant::now(),
        })
    }
}

/// HTTP client dùng chung: giữ kết nối (keep-alive), pool hợp lý, nén.
pub fn build_http_client(settings: &Settings) -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(format!("BakhiBackend/{}", env!("CARGO_PKG_VERSION")))
        .pool_max_idle_per_host(32)
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_nodelay(true)
        .connect_timeout(Duration::from_secs(5))
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
        .route("/me", get(routes::me::me))
        .route("/ai/chat", post(routes::ai::chat))
        .route(
            "/data/learning-stats",
            post(routes::data::learning_stats_route),
        )
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ));

    let cors = cors_layer(&state.settings);
    let max_body = state.settings.max_body_bytes;
    let timeout = state.settings.request_timeout;

    Router::new()
        .nest("/api/v1", api)
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

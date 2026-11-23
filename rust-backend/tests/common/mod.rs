// ===========================================================================
// Bá Khí — Rust backend · tests/common/mod.rs
//
// Harness dùng chung cho MỌI integration/contract test:
//   * Supabase giả lập qua HTTP thật trên 127.0.0.1 (Auth, PostgREST),
//   * AI provider giả lập cùng một cổng,
//   * Router thật của backend (không mock tầng Axum).
//
// Không cần khoá thật, không gọi mạng ngoài, không ghi vào production.
// ===========================================================================

#![allow(dead_code)]

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Method, Request, StatusCode};
use axum::response::Response;
use axum::Router;
use bakhi_backend::config::Settings;
use bakhi_backend::{build_router, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
pub use tower::ServiceExt;

pub const VALID_TOKEN: &str = "valid-token-for-integration-tests";
pub const AUTH_USER_ID: &str = "11111111-2222-3333-4444-555555555555";
pub const STUDENT_ID: &str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
pub const CONVERSATION_ID: &str = "99999999-8888-7777-6666-555555555555";

#[derive(Clone)]
pub struct MockState {
    pub calls: Arc<Mutex<Vec<String>>>,
    pub provider_mode: Arc<Mutex<String>>,
    pub provider_delay_ms: Arc<Mutex<u64>>,
    pub routes: Arc<Mutex<Vec<Value>>>,
    pub device_bound: Arc<Mutex<bool>>,
    pub student_active: Arc<Mutex<bool>>,
    pub auth_health: Arc<Mutex<bool>>,
    pub provider_calls: Arc<AtomicUsize>,
    pub provider_sequence: Arc<Mutex<VecDeque<u16>>>,
    pub last_message_body: Arc<Mutex<Value>>,
    pub db_fail: Arc<Mutex<bool>>,
}

impl Default for MockState {
    fn default() -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
            provider_mode: Arc::new(Mutex::new("ok".to_string())),
            provider_delay_ms: Arc::new(Mutex::new(0)),
            routes: Arc::new(Mutex::new(vec![json!({
                "position": 0,
                "label": "Primary",
                "provider": "groq",
                "model": "test-model",
                "key_ref": "",
                "enabled": true
            })])),
            device_bound: Arc::new(Mutex::new(true)),
            student_active: Arc::new(Mutex::new(true)),
            auth_health: Arc::new(Mutex::new(true)),
            provider_calls: Arc::new(AtomicUsize::new(0)),
            provider_sequence: Arc::new(Mutex::new(VecDeque::new())),
            last_message_body: Arc::new(Mutex::new(Value::Null)),
            db_fail: Arc::new(Mutex::new(false)),
        }
    }
}

impl MockState {
    pub fn record(&self, entry: impl Into<String>) {
        self.calls.lock().unwrap().push(entry.into());
    }

    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }

    pub fn set_provider_mode(&self, mode: &str) {
        *self.provider_mode.lock().unwrap() = mode.to_string();
    }

    pub fn set_provider_delay_ms(&self, delay: u64) {
        *self.provider_delay_ms.lock().unwrap() = delay;
    }

    pub fn set_routes(&self, routes: Vec<Value>) {
        *self.routes.lock().unwrap() = routes;
    }

    /// Chuỗi mã HTTP trả về cho các lần gọi provider liên tiếp (dùng hết thì 200).
    pub fn set_provider_sequence(&self, statuses: Vec<u16>) {
        *self.provider_sequence.lock().unwrap() = statuses.into();
    }

    pub fn provider_calls(&self) -> usize {
        self.provider_calls.load(Ordering::SeqCst)
    }

    pub fn set_device_bound(&self, bound: bool) {
        *self.device_bound.lock().unwrap() = bound;
    }

    pub fn set_student_active(&self, active: bool) {
        *self.student_active.lock().unwrap() = active;
    }

    pub fn set_auth_health(&self, healthy: bool) {
        *self.auth_health.lock().unwrap() = healthy;
    }

    pub fn set_db_fail(&self, fail: bool) {
        *self.db_fail.lock().unwrap() = fail;
    }

    pub fn has_call(&self, prefix: &str) -> bool {
        self.calls().iter().any(|call| call.starts_with(prefix))
    }

    pub fn last_message_body(&self) -> Value {
        self.last_message_body.lock().unwrap().clone()
    }
}

pub fn fallback_routes() -> Vec<Value> {
    vec![
        json!({
            "position": 0, "label": "Primary", "provider": "groq",
            "model": "primary-model", "key_ref": "", "enabled": true
        }),
        json!({
            "position": 1, "label": "Fallback", "provider": "google",
            "model": "fallback-model", "key_ref": "", "enabled": true
        }),
    ]
}

pub fn json_response(status: StatusCode, body: Value) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub fn text_response(
    status: StatusCode,
    body: &'static str,
    headers: Vec<(&'static str, &'static str)>,
) -> Response {
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain");
    for (name, value) in headers {
        builder = builder.header(name, value);
    }
    builder.body(Body::from(body)).unwrap()
}

async fn mock_handler(State(state): State<MockState>, request: Request<Body>) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let query = request.uri().query().unwrap_or("").to_string();
    let authorization = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body_bytes = axum::body::to_bytes(request.into_body(), 2_000_000)
        .await
        .unwrap_or_default();
    state.record(format!("{method} {path}?{query}"));

    if path.starts_with("/rest/v1/") && *state.db_fail.lock().unwrap() {
        return json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "message": "database unavailable" }),
        );
    }

    match (method, path.as_str()) {
        (Method::GET, "/auth/v1/user") => {
            if authorization == format!("Bearer {VALID_TOKEN}") {
                json_response(
                    StatusCode::OK,
                    json!({ "id": AUTH_USER_ID, "email": "hocsinh@example.com" }),
                )
            } else {
                json_response(StatusCode::UNAUTHORIZED, json!({ "msg": "invalid token" }))
            }
        }
        (Method::GET, "/auth/v1/health") => {
            if *state.auth_health.lock().unwrap() {
                json_response(StatusCode::OK, json!({}))
            } else {
                json_response(StatusCode::SERVICE_UNAVAILABLE, json!({ "msg": "down" }))
            }
        }
        (Method::GET, "/rest/v1/student_devices") => {
            if *state.device_bound.lock().unwrap() {
                json_response(StatusCode::OK, json!([{ "student_id": STUDENT_ID }]))
            } else {
                json_response(StatusCode::OK, json!([]))
            }
        }
        (Method::GET, "/rest/v1/students") => {
            if *state.device_bound.lock().unwrap() {
                json_response(
                    StatusCode::OK,
                    json!([{
                        "id": STUDENT_ID,
                        "display_name": "An",
                        "student_code": "BK-0001",
                        "is_active": *state.student_active.lock().unwrap()
                    }]),
                )
            } else {
                json_response(StatusCode::OK, json!([]))
            }
        }
        (Method::GET, "/rest/v1/ai_settings") => json_response(
            StatusCode::OK,
            json!([{
                "enabled": true,
                "provider": "groq",
                "model": "test-model",
                "fallback_provider": "",
                "fallback_model": "",
                "routing_enabled": false,
                "max_context_messages": 10,
                "max_output_tokens": 512,
                "timeout_ms": 5000,
                "daily_requests": 0,
                "daily_tokens": 0,
                "save_history": true,
                "use_lesson_context": true,
                "language": "vi",
                "allowed_modes": ["explain","steps","hint","check","practice","mistakes","summary","socratic"],
                "system_prompt": "",
                "max_input_tokens": 3000
            }]),
        ),
        (Method::GET, "/rest/v1/ai_model_routes") => json_response(
            StatusCode::OK,
            Value::Array(state.routes.lock().unwrap().clone()),
        ),
        (Method::GET, "/rest/v1/ai_usage_logs") => json_response(StatusCode::OK, json!([])),
        (Method::GET, "/rest/v1/ai_messages") => json_response(StatusCode::OK, json!([])),
        (Method::GET, "/rest/v1/ai_conversations") => json_response(
            StatusCode::OK,
            json!([{
                "id": CONVERSATION_ID,
                "title": "Hội thoại mới",
                "message_count": 0
            }]),
        ),
        (Method::POST, "/rest/v1/ai_conversations") => json_response(
            StatusCode::CREATED,
            json!([{
                "id": CONVERSATION_ID,
                "title": "Hội thoại mới",
                "message_count": 0,
                "subject": "",
                "topic": "",
                "last_provider": "",
                "last_model": "",
                "last_message_at": "2026-11-23T10:00:00Z",
                "created_at": "2026-11-23T10:00:00Z"
            }]),
        ),
        (Method::POST, "/rest/v1/ai_messages") => {
            let parsed: Value = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
            *state.last_message_body.lock().unwrap() = parsed.clone();
            json_response(
                StatusCode::CREATED,
                json!([{
                    "id": format!("msg-{}", state.calls().len()),
                    "role": parsed.get("role").cloned().unwrap_or(json!("user")),
                    "content": parsed.get("content").cloned().unwrap_or(json!("")),
                    "mode": parsed.get("mode").cloned().unwrap_or(json!("explain")),
                    "provider": parsed.get("provider").cloned().unwrap_or(json!("")),
                    "model": parsed.get("model").cloned().unwrap_or(json!("")),
                    "context_ref": parsed.get("context_ref").cloned().unwrap_or(json!({})),
                    "error_code": "",
                    "created_at": "2026-11-23T10:00:00Z"
                }]),
            )
        }
        (Method::POST, "/rest/v1/ai_usage_logs") => json_response(StatusCode::CREATED, json!([{}])),
        (Method::PATCH, _) => Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap(),
        (Method::POST, path) if path.contains(":generateContent") => {
            // Adapter Gemini: hình dạng request/response khác OpenAI.
            state.provider_calls.fetch_add(1, Ordering::SeqCst);
            let delay = *state.provider_delay_ms.lock().unwrap();
            if delay > 0 {
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
            let mode = state.provider_mode.lock().unwrap().clone();
            match mode.as_str() {
                "quota" => json_response(
                    StatusCode::TOO_MANY_REQUESTS,
                    json!({ "error": { "message": "quota exceeded" } }),
                ),
                "auth_error" => json_response(
                    StatusCode::UNAUTHORIZED,
                    json!({ "error": { "message": "invalid api key" } }),
                ),
                // `primary_down` chỉ ảnh hưởng model primary; Gemini là dự phòng.
                "server_error" => json_response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    json!({ "error": { "message": "provider down" } }),
                ),
                _ => json_response(
                    StatusCode::OK,
                    json!(
                        {
                            "candidates": [{
                                "content": { "parts": [{ "text": "Chào bạn, cùng học nhé!" }] },
                                "finishReason": "STOP"
                            }],
                            "usageMetadata": { "promptTokenCount": 40, "candidatesTokenCount": 6 }
                        }
                    ),
                ),
            }
        }
        (Method::POST, path) if path.starts_with("/v1/chat/completions") => {
            state.provider_calls.fetch_add(1, Ordering::SeqCst);
            let delay = *state.provider_delay_ms.lock().unwrap();
            if delay > 0 {
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
            let mode = state.provider_mode.lock().unwrap().clone();
            let parsed: Value = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
            let model = parsed
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("test-model")
                .to_string();

            // Chuỗi mã HTTP ưu tiên (dùng cho test retry/fallback).
            if let Some(status) = state.provider_sequence.lock().unwrap().pop_front() {
                if status != 200 {
                    return json_response(
                        StatusCode::from_u16(status).unwrap(),
                        json!({ "error": { "message": "temporary" } }),
                    );
                }
            }

            match mode.as_str() {
                "auth_error" => json_response(
                    StatusCode::UNAUTHORIZED,
                    json!({ "error": { "message": format!("Incorrect API key provided: {authorization}") } }),
                ),
                "bad_request" => json_response(
                    StatusCode::BAD_REQUEST,
                    json!({ "error": { "message": "invalid request" } }),
                ),
                "server_error" => json_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    json!({ "error": "boom" }),
                ),
                "rate_limit" => text_response(
                    StatusCode::TOO_MANY_REQUESTS,
                    r#"{"error":{"message":"slow down"}}"#,
                    vec![("retry-after", "0")],
                ),
                "quota" => json_response(
                    StatusCode::TOO_MANY_REQUESTS,
                    json!({ "error": { "message": "quota exceeded" } }),
                ),
                "primary_down" if model.starts_with("primary") => json_response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    json!({ "error": { "message": "primary down" } }),
                ),
                _ => json_response(
                    StatusCode::OK,
                    json!({
                        "model": model,
                        "choices": [{
                            "message": { "role": "assistant", "content": "Chào bạn, cùng học nhé!" },
                            "finish_reason": "stop"
                        }],
                        "usage": { "prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49 }
                    }),
                ),
            }
        }
        _ => json_response(StatusCode::NOT_FOUND, json!({ "error": "unmocked" })),
    }
}

pub struct Harness {
    pub app: Router,
    pub mock: MockState,
    pub state: AppState,
}

pub async fn harness(tweak: impl FnOnce(&mut Settings)) -> Harness {
    let mock = MockState::default();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = Router::new()
        .fallback(mock_handler)
        .with_state(mock.clone());
    tokio::spawn(async move {
        axum::serve(listener, server).await.ok();
    });

    let mut settings = Settings::for_tests();
    settings.supabase_url = format!("http://{addr}");
    settings.ai_base_url = Some(format!("http://{addr}/v1"));
    settings.persist_conversations = true;
    tweak(&mut settings);

    let state = AppState::new(settings).unwrap();
    Harness {
        app: build_router(state.clone()),
        mock,
        state,
    }
}

pub fn post_json(uri: &str, body: Value, token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

pub fn get(uri: &str, token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder().method(Method::GET).uri(uri);
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    builder.body(Body::empty()).unwrap()
}

pub async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
}

pub async fn body_text(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8_lossy(&bytes).to_string()
}

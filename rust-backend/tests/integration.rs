// ===========================================================================
// Bá Khí — Rust backend · tests/integration.rs
//
// Kiểm thử end-to-end qua Router thật, với Supabase và provider giả lập chạy
// trên 127.0.0.1. Không gọi mạng ngoài, không cần khoá thật.
// ===========================================================================

use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Method, Request, StatusCode};
use axum::response::Response;
use axum::Router;
use bakhi_backend::config::Settings;
use bakhi_backend::{build_router, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

const VALID_TOKEN: &str = "valid-token-for-integration-tests";

#[derive(Clone, Default)]
struct MockState {
    calls: Arc<Mutex<Vec<String>>>,
    provider_mode: Arc<Mutex<String>>,
}

impl MockState {
    fn record(&self, entry: impl Into<String>) {
        self.calls.lock().unwrap().push(entry.into());
    }
    fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
    fn set_provider_mode(&self, mode: &str) {
        *self.provider_mode.lock().unwrap() = mode.to_string();
    }
}

fn json_response(status: StatusCode, body: Value) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
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
    let body_bytes = axum::body::to_bytes(request.into_body(), 1_000_000)
        .await
        .unwrap_or_default();
    state.record(format!("{method} {path}?{query}"));

    match (method, path.as_str()) {
        (Method::GET, "/auth/v1/user") => {
            if authorization == format!("Bearer {VALID_TOKEN}") {
                json_response(
                    StatusCode::OK,
                    json!({ "id": "11111111-2222-3333-4444-555555555555", "email": "hocsinh@example.com" }),
                )
            } else {
                json_response(StatusCode::UNAUTHORIZED, json!({ "msg": "invalid token" }))
            }
        }
        (Method::GET, "/auth/v1/health") => json_response(StatusCode::OK, json!({})),
        (Method::GET, "/rest/v1/students") => json_response(
            StatusCode::OK,
            json!([{ "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "display_name": "An", "student_code": "BK-0001" }]),
        ),
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
            json!([{ "position": 0, "label": "Primary", "provider": "groq", "model": "test-model", "key_ref": "", "enabled": true }]),
        ),
        (Method::GET, "/rest/v1/ai_usage_logs") => json_response(StatusCode::OK, json!([])),
        // Không có lịch sử: hội thoại mới bắt đầu từ câu hỏi hiện tại.
        (Method::GET, "/rest/v1/ai_messages") => json_response(StatusCode::OK, json!([])),
        (Method::POST, "/rest/v1/ai_conversations") => json_response(
            StatusCode::CREATED,
            json!([{ "id": "99999999-8888-7777-6666-555555555555", "title": "Hội thoại mới", "message_count": 0 }]),
        ),
        (Method::POST, "/rest/v1/ai_messages") => {
            let parsed: Value = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
            json_response(
                StatusCode::CREATED,
                json!([{
                    "id": format!("msg-{}", state.calls().len()),
                    "role": parsed.get("role").cloned().unwrap_or(json!("user")),
                    "content": parsed.get("content").cloned().unwrap_or(json!("")),
                    "created_at": "2026-11-23T10:00:00Z"
                }]),
            )
        }
        (Method::PATCH, _) => {
            state.record("PATCH appplied");
            Response::builder()
                .status(StatusCode::NO_CONTENT)
                .body(Body::empty())
                .unwrap()
        }
        (Method::POST, path) if path.starts_with("/v1/chat/completions") => {
            let mode = state.provider_mode.lock().unwrap().clone();
            let parsed: Value = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
            let sent_key = authorization;
            if mode == "auth_error" {
                return json_response(
                    StatusCode::UNAUTHORIZED,
                    json!({ "error": { "message": format!("Incorrect API key provided: {sent_key}") } }),
                );
            }
            if mode == "server_error" {
                return json_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    json!({ "error": "boom" }),
                );
            }
            let model = parsed
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("test-model");
            json_response(
                StatusCode::OK,
                json!({
                    "model": model,
                    "choices": [{
                        "message": { "role": "assistant", "content": "Chào bạn, cùng học nhé!" },
                        "finish_reason": "stop"
                    }],
                    "usage": { "prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49 }
                }),
            )
        }
        _ => json_response(StatusCode::NOT_FOUND, json!({ "error": "unmocked" })),
    }
}

struct Harness {
    app: Router,
    mock: MockState,
}

async fn harness(tweak: impl FnOnce(&mut Settings)) -> Harness {
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
        app: build_router(state),
        mock,
    }
}

fn post_json(uri: &str, body: Value, token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

fn get(uri: &str, token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder().method(Method::GET).uri(uri);
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    builder.body(Body::empty()).unwrap()
}

async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
}

#[tokio::test]
async fn health_is_public_and_reports_version() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key("x-request-id"));
    let body = body_json(response).await;
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["status"], "ok");
    assert!(body["data"]["version"].as_str().unwrap().starts_with("8.6"));
}

#[tokio::test]
async fn protected_route_without_token_returns_unauthorized_envelope() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let body = body_json(response).await;
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
    assert!(body["request_id"].is_string());
    // Không rò rỉ chi tiết nội bộ.
    let text = body.to_string();
    assert!(!text.contains("panic"), "lộ stack trace");
    assert!(!text.contains("test-anon-key"), "lộ khoá");
}

#[tokio::test]
async fn me_returns_authenticated_identity_and_student() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some(VALID_TOKEN)))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(
        body["data"]["user"]["id"],
        "11111111-2222-3333-4444-555555555555"
    );
    assert_eq!(body["data"]["student"]["student_code"], "BK-0001");
}

#[tokio::test]
async fn me_rejects_a_token_supabase_does_not_accept() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some("forged-token-that-is-long-enough")))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn chat_returns_normalized_response_and_persists_messages() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "Giải thích định lý Pi-ta-go", "mode": "explain" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["ok"], true);
    assert_eq!(
        body["data"]["message"]["content"],
        "Chào bạn, cùng học nhé!"
    );
    assert_eq!(body["data"]["meta"]["provider"], "groq");
    assert_eq!(body["data"]["meta"]["tokens"]["input"], 42);
    assert_eq!(body["data"]["meta"]["tokens"]["output"], 7);
    assert_eq!(body["data"]["meta"]["fellBack"], false);

    let calls = harness.mock.calls();
    assert!(calls
        .iter()
        .any(|c| c.starts_with("POST /rest/v1/ai_conversations")));
    assert!(calls
        .iter()
        .any(|c| c.starts_with("POST /rest/v1/ai_messages")));
    assert!(calls
        .iter()
        .any(|c| c.starts_with("POST /rest/v1/ai_usage_logs")));
    assert!(calls.iter().any(|c| c.contains("/v1/chat/completions")));
}

#[tokio::test]
async fn chat_rejects_empty_message_with_client_error() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "   ", "mode": "explain" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "EMPTY_MESSAGE");
}

#[tokio::test]
async fn chat_rejects_malformed_json() {
    let harness = harness(|_| {}).await;
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/chat")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {VALID_TOKEN}"))
        .body(Body::from("{not json"))
        .unwrap();
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(response).await["error"]["code"], "BAD_REQUEST");
}

#[tokio::test]
async fn chat_rejects_disabled_mode() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "chào", "mode": "khong-ton-tai" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    // Chế độ lạ rơi về explain (giống Edge Function), nên vẫn thành công.
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn provider_auth_error_becomes_502_without_leaking_key() {
    let harness = harness(|_| {}).await;
    harness.mock.set_provider_mode("auth_error");
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "chào", "mode": "explain" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "AUTH");
    let text = body.to_string();
    assert!(
        !text.contains("test-provider-key"),
        "lộ khoá provider trong lỗi"
    );
    assert!(
        !text.contains("Incorrect API key"),
        "lộ chi tiết thô của provider"
    );
}

#[tokio::test]
async fn provider_server_error_is_retryable_bad_gateway() {
    let harness = harness(|_| {}).await;
    harness.mock.set_provider_mode("server_error");
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "chào", "mode": "explain" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "PROVIDER_DOWN");
    assert_eq!(body["error"]["retryable"], true);
}

#[tokio::test]
async fn ai_rate_limit_is_per_user_and_returns_429() {
    let harness = harness(|settings| settings.ai_rate_per_min = 1).await;
    let first = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu 1" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);

    let second = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu 2" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(body_json(second).await["error"]["code"], "RATE_LIMIT");
}

#[tokio::test]
async fn learning_stats_requires_auth_and_aggregates() {
    let harness = harness(|_| {}).await;
    let payload = json!({
        "progress": [
            { "subject": "toan", "topic": "dao-ham", "correct": 8, "total": 10 },
            { "subject": "ly", "topic": "dien", "correct": 4, "total": 5 }
        ],
        "review": [{ "subject": "toan", "topic": "dao-ham", "wrong": 2 }],
        "sessions": [{ "started_at": "2026-11-20T09:00:00Z", "minutes": 25, "questions": 15, "correct": 12 }]
    });

    let unauthorized = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            payload.clone(),
            None,
        ))
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let authorized = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            payload,
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(authorized.status(), StatusCode::OK);
    let body = body_json(authorized).await;
    assert_eq!(body["data"]["totals"]["questions"], 15);
    assert_eq!(body["data"]["totals"]["accuracy"], 80.0);
    assert_eq!(body["data"]["sessions"]["minutes"], 25);
    assert_eq!(body["data"]["review"]["total"], 2);
}

#[tokio::test]
async fn cors_only_allows_configured_origin() {
    let harness = harness(|_| {}).await;
    let request = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/v1/health")
        .header(header::ORIGIN, "https://evil.example")
        .header("access-control-request-method", "GET")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert!(
        response
            .headers()
            .get("access-control-allow-origin")
            .is_none(),
        "origin lạ không được cấp CORS"
    );

    let allowed = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/v1/health")
        .header(header::ORIGIN, "https://minhtruk.github.io")
        .header("access-control-request-method", "GET")
        .body(Body::empty())
        .unwrap();
    let response = harness.app.clone().oneshot(allowed).await.unwrap();
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("https://minhtruk.github.io")
    );
}

#[tokio::test]
async fn request_id_from_client_is_echoed_back() {
    let harness = harness(|_| {}).await;
    let mut request = get("/api/v1/health", None);
    request
        .headers_mut()
        .insert("x-request-id", "abc12345-xyz".parse().unwrap());
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(
        response
            .headers()
            .get("x-request-id")
            .and_then(|v| v.to_str().ok()),
        Some("abc12345-xyz")
    );
}

#[tokio::test]
async fn oversized_body_is_rejected() {
    let harness = harness(|settings| settings.max_body_bytes = 512).await;
    let big = json!({ "message": "x".repeat(2000) });
    let response = harness
        .app
        .clone()
        .oneshot(post_json("/api/v1/ai/chat", big, Some(VALID_TOKEN)))
        .await
        .unwrap();
    assert!(
        response.status() == StatusCode::PAYLOAD_TOO_LARGE
            || response.status() == StatusCode::BAD_REQUEST,
        "body quá lớn phải bị chặn, nhận {}",
        response.status()
    );
}

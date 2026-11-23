// ===========================================================================
// Bá Khí — Rust backend · tests/integration.rs
//
// End-to-end cũ (8.6.0) giữ nguyên hành vi, chuyển sang harness dùng chung.
// Các nhóm test mới nằm ở health_tests / auth_tests / api_contract_tests /
// ai_gateway_tests / fallback_tests / circuit_breaker_tests /
// learning_stats_tests / error_handling_tests / concurrency_tests.
// ===========================================================================

mod common;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use common::*;
use serde_json::json;

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
    assert_eq!(body["data"]["user"]["id"], AUTH_USER_ID);
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
async fn chat_rejects_unknown_mode_by_falling_back_to_explain() {
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

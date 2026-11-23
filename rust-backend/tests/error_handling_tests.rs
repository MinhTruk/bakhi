// ===========================================================================
// Bá Khí — Rust backend · tests/error_handling_tests.rs
//
// Mọi lỗi dùng cùng envelope; không rò rỉ stack trace, đường dẫn nội bộ, khoá,
// header Authorization, SQL hay chi tiết thô của provider.
// ===========================================================================

mod common;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use common::*;
use serde_json::json;

const FORBIDDEN_FRAGMENTS: [&str; 8] = [
    "test-anon-key",
    "test-service-key",
    "test-provider-key",
    "Incorrect API key",
    "panicked",
    "src/",
    "/rest/v1/",
    "SELECT ",
];

fn assert_clean(text: &str) {
    for fragment in FORBIDDEN_FRAGMENTS {
        assert!(
            !text.contains(fragment),
            "phản hồi lỗi chứa `{fragment}`: {text}"
        );
    }
}

#[tokio::test]
async fn malformed_json_returns_stable_envelope() {
    let harness = harness(|_| {}).await;
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/chat")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {VALID_TOKEN}"))
        .body(Body::from("{\"message\":"))
        .unwrap();
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response
            .headers()
            .get(header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok()),
        Some("no-store")
    );
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "BAD_REQUEST");
    assert_clean(&body.to_string());
}

#[tokio::test]
async fn oversized_payload_is_rejected_cleanly() {
    let harness = harness(|settings| settings.max_body_bytes = 1_024).await;
    let payload = json!({ "message": "x".repeat(4_000) });
    let response = harness
        .app
        .clone()
        .oneshot(post_json("/api/v1/ai/chat", payload, Some(VALID_TOKEN)))
        .await
        .unwrap();
    assert!(
        response.status() == StatusCode::PAYLOAD_TOO_LARGE
            || response.status() == StatusCode::BAD_REQUEST,
        "nhận {}",
        response.status()
    );
}

#[tokio::test]
async fn provider_error_body_is_never_forwarded() {
    let harness = harness(|_| {}).await;
    harness.mock.set_provider_mode("auth_error");
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "chào" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    let text = body_text(response).await;
    assert_clean(&text);
    assert!(text.contains("AUTH"));
}

#[tokio::test]
async fn database_failure_returns_db_error_without_sql() {
    let harness = harness(|_| {}).await;
    harness.mock.set_db_fail(true);
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some(VALID_TOKEN)))
        .await
        .unwrap();
    // Khớp Edge Function: 500 DB_ERROR cho lỗi dữ liệu.
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "DB_ERROR");
    assert_clean(&body.to_string());
    assert!(!body.to_string().contains("database unavailable"));
}

#[tokio::test]
async fn auth_outage_returns_503_but_not_internal_details() {
    let harness = harness(|_| {}).await;
    harness.mock.set_auth_health(false);
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/ready", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "NOT_READY");
    assert_clean(&body.to_string());
}

#[tokio::test]
async fn every_error_carries_a_request_id_header() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    let header_id = response
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .unwrap()
        .to_string();
    let body = body_json(response).await;
    assert_eq!(body["request_id"], header_id);
}

#[tokio::test]
async fn request_id_header_is_not_trusted_verbatim() {
    let harness = harness(|_| {}).await;
    let mut request = get("/api/v1/health", None);
    request
        .headers_mut()
        .insert("x-request-id", "<script>alert(1)</script>".parse().unwrap());
    let response = harness.app.clone().oneshot(request).await.unwrap();
    let id = response
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .unwrap();
    assert!(!id.contains('<'));
    assert!(id.len() >= 8);
}

#[tokio::test]
async fn unauthorized_response_never_echoes_the_authorization_header() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some("forged-token-long-enough")))
        .await
        .unwrap();
    let text = body_text(response).await;
    assert!(!text.contains("forged-token-long-enough"));
    assert_clean(&text);
}

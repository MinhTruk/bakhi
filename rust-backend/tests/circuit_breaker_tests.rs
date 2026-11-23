// ===========================================================================
// Bá Khí — Rust backend · tests/circuit_breaker_tests.rs
//
// Circuit breaker mở khi một provider lỗi liên tiếp; request sau BỎ QUA provider
// đó nhưng vẫn dùng được provider khác. Trạng thái không phụ thuộc người dùng.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use bakhi_backend::providers::circuit::{CircuitBreaker, CircuitState};
use bakhi_backend::providers::Provider;
use common::*;
use serde_json::json;
use std::time::Duration;

#[test]
fn breaker_transitions_are_configurable_and_per_provider() {
    let breaker = CircuitBreaker::new(2, Duration::from_millis(80), 1);
    assert_eq!(breaker.state(Provider::Groq), CircuitState::Closed);
    breaker.record_failure(Provider::Groq);
    breaker.record_failure(Provider::Groq);
    assert_eq!(breaker.state(Provider::Groq), CircuitState::Open);
    assert_eq!(
        breaker.state(Provider::Google),
        CircuitState::Closed,
        "provider khác phải tiếp tục hoạt động"
    );
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(breaker.state(Provider::Groq), CircuitState::HalfOpen);
    assert!(breaker.allow(Provider::Groq));
    breaker.record_success(Provider::Groq);
    assert_eq!(breaker.state(Provider::Groq), CircuitState::Closed);
}

#[tokio::test]
async fn open_circuit_skips_primary_and_uses_fallback() {
    let harness = harness(|settings| {
        settings.ai_max_retries = 0;
        settings.circuit_threshold = 1;
        settings.circuit_cooldown = Duration::from_secs(60);
    })
    .await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("primary_down");

    // Lượt 1: primary lỗi 503 ⇒ circuit mở, fallback trả lời.
    let first = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu một" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);

    // Lượt 2: primary bị bỏ qua vì circuit OPEN, không gọi provider nữa.
    let second = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu hai" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::OK);
    let body = body_json(second).await;
    let attempts = body["data"]["meta"]["attempts"].as_array().unwrap();
    assert_eq!(attempts[0]["code"], "CIRCUIT_OPEN");
    assert_eq!(attempts[0]["ok"], false);
    assert_eq!(body["data"]["meta"]["provider"], "google");
    assert_eq!(
        harness.mock.provider_calls(),
        3,
        "1 lần primary lỗi + 2 lần fallback; primary bị bỏ qua ở lượt hai"
    );
}

#[tokio::test]
async fn all_circuits_open_returns_provider_down_without_new_calls() {
    let harness = harness(|settings| {
        settings.ai_max_retries = 0;
        settings.circuit_threshold = 1;
        settings.circuit_cooldown = Duration::from_secs(60);
    })
    .await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("server_error");

    for message in ["câu một", "câu hai", "câu ba"] {
        let _ = harness
            .app
            .clone()
            .oneshot(post_json(
                "/api/v1/ai/chat",
                json!({ "message": message }),
                Some(VALID_TOKEN),
            ))
            .await
            .unwrap();
    }

    let calls_after_warmup = harness.mock.provider_calls();
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu bốn" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    // Mã trả cho học sinh vẫn là PROVIDER_DOWN (không lộ khái niệm circuit).
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(body_json(response).await["error"]["code"], "PROVIDER_DOWN");
    assert_eq!(
        harness.mock.provider_calls(),
        calls_after_warmup,
        "không được gọi provider khi mọi circuit đều OPEN"
    );
}

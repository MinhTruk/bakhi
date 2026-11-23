// ===========================================================================
// Bá Khí — Rust backend · tests/health_tests.rs
//
// /health là liveness (không phụ thuộc Supabase/provider).
// /ready là readiness (phụ thuộc cấu hình + Supabase, timeout ngắn).
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;

#[tokio::test]
async fn health_is_liveness_only_and_never_calls_supabase() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["data"]["service"], "bakhi-backend");
    assert_eq!(body["data"]["draining"], false);
    assert_eq!(
        body["data"]["version"],
        env!("CARGO_PKG_VERSION"),
        "version lệch Cargo.toml"
    );
    assert!(
        harness.mock.calls().is_empty(),
        "health không được chạm Supabase: {:?}",
        harness.mock.calls()
    );
}

#[tokio::test]
async fn ready_reports_ready_when_supabase_answers() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/ready", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["status"], "ready");
    assert_eq!(body["data"]["checks"]["supabase"], "up");
    assert_eq!(body["data"]["checks"]["config"], "ok");
    // Chỉ kiểm tra Auth health, không gọi AI provider.
    assert!(harness
        .mock
        .calls()
        .iter()
        .all(|call| !call.contains("chat/completions")));
}

#[tokio::test]
async fn ready_returns_503_when_supabase_is_down() {
    let harness = harness(|_| {}).await;
    harness.mock.set_auth_health(false);
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/ready", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response
            .headers()
            .get("x-ready-reason")
            .and_then(|v| v.to_str().ok()),
        Some("dependency_down")
    );
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "NOT_READY");
    // Không lộ URL Supabase hay chi tiết kết nối.
    assert!(!body.to_string().contains("example.supabase.co"));
}

#[tokio::test]
async fn ready_returns_503_during_shutdown() {
    let harness = harness(|_| {}).await;
    harness.state.lifecycle.begin_shutdown();
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/ready", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response
            .headers()
            .get("x-ready-reason")
            .and_then(|v| v.to_str().ok()),
        Some("draining")
    );
    // Health vẫn 200 nhưng báo draining để vận hành thấy.
    let health = harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);
    assert_eq!(body_json(health).await["data"]["draining"], true);
}

#[tokio::test]
async fn ready_distinguishes_missing_config_from_connection_error() {
    let harness = harness(|settings| {
        settings.persist_conversations = true;
        settings.supabase_service_key = None;
    })
    .await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/ready", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response
            .headers()
            .get("x-ready-reason")
            .and_then(|v| v.to_str().ok()),
        Some("config_error")
    );
}

#[tokio::test]
async fn metrics_endpoint_is_hidden_by_default() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/metrics", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn metrics_requires_the_configured_token() {
    let harness = harness(|settings| {
        settings.metrics_enabled = true;
        settings.metrics_token = Some("metrics-secret-token".to_string());
    })
    .await;

    let unauthorized = harness
        .app
        .clone()
        .oneshot(get("/api/v1/metrics", None))
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let mut request = get("/api/v1/metrics", None);
    request.headers_mut().insert(
        "authorization",
        "Bearer metrics-secret-token".parse().unwrap(),
    );
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let text = body_text(response).await;
    assert!(text.contains("bakhi_requests_total"));
    assert!(text.contains("bakhi_circuit_state"));
    assert!(!text.contains("metrics-secret-token"));
}

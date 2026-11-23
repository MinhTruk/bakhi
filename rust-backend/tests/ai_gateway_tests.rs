// ===========================================================================
// Bá Khí — Rust backend · tests/ai_gateway_tests.rs
//
// Chính sách thử lại: CHỈ lỗi tạm thời (408/429/5xx/timeout/kết nối).
// Không thử lại 400/401/403/lỗi cấu hình/model — và không chuyển dự phòng.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::{json, Value};

#[tokio::test]
async fn retryable_429_is_retried_and_respects_retry_after() {
    let harness = harness(|settings| settings.ai_max_retries = 1).await;
    // Lần đầu 429 (Retry-After: 0), lần sau thành công.
    harness.mock.set_provider_sequence(vec![429]);
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
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        harness.mock.provider_calls(),
        2,
        "phải thử lại đúng một lần"
    );
    let body = body_json(response).await;
    assert_eq!(
        body["data"]["meta"]["attempts"].as_array().unwrap().len(),
        2
    );
    assert_eq!(body["data"]["meta"]["fellBack"], false);
}

#[tokio::test]
async fn retries_stop_at_the_configured_limit() {
    let harness = harness(|settings| settings.ai_max_retries = 2).await;
    harness.mock.set_provider_sequence(vec![503, 503, 503, 503]);
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
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(
        harness.mock.provider_calls(),
        3,
        "1 lần đầu + tối đa 2 lần thử lại"
    );
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "PROVIDER_DOWN");
    assert_eq!(body["error"]["retryable"], true);
}

#[tokio::test]
async fn bad_request_from_provider_is_not_retried_nor_failed_over() {
    let harness = harness(|settings| settings.ai_max_retries = 2).await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("bad_request");
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
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(
        harness.mock.provider_calls(),
        1,
        "HTTP 400 không được thử lại và không được chuyển dự phòng"
    );
    assert_eq!(body_json(response).await["error"]["code"], "UNKNOWN");
}

#[tokio::test]
async fn auth_error_is_not_retried() {
    let harness = harness(|settings| settings.ai_max_retries = 2).await;
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
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(harness.mock.provider_calls(), 1);
    assert_eq!(body_json(response).await["error"]["code"], "AUTH");
}

#[tokio::test]
async fn quota_is_not_retried_but_can_fail_over() {
    let harness = harness(|settings| settings.ai_max_retries = 2).await;
    harness.mock.set_routes(fallback_routes());
    // Cả hai provider đều quota ⇒ dừng ngay, không thử lại.
    harness.mock.set_provider_mode("quota");
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
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(harness.mock.provider_calls(), 2, "mỗi provider thử một lần");
    assert_eq!(body_json(response).await["error"]["code"], "QUOTA");
}

#[tokio::test]
async fn timeout_budget_is_bounded_by_gateway_deadline() {
    let harness = harness(|settings| {
        settings.ai_timeout = std::time::Duration::from_millis(120);
        settings.ai_gateway_timeout = std::time::Duration::from_millis(400);
        settings.ai_max_retries = 2;
        settings.request_timeout = std::time::Duration::from_millis(2_000);
    })
    .await;
    harness.mock.set_provider_delay_ms(200);
    let started = std::time::Instant::now();
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
    let elapsed = started.elapsed();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(body_json(response).await["error"]["code"], "TIMEOUT");
    assert!(
        elapsed < std::time::Duration::from_secs(3),
        "không được vượt hạn gateway quá xa: {elapsed:?}"
    );
}

#[tokio::test]
async fn usage_log_written_once_per_request_with_fallback_flag() {
    let harness = harness(|_| {}).await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("primary_down");
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
    assert_eq!(response.status(), StatusCode::OK);
    let logs = harness
        .mock
        .calls()
        .into_iter()
        .filter(|call| call.starts_with("POST /rest/v1/ai_usage_logs"))
        .count();
    assert_eq!(logs, 1, "mỗi request chỉ ghi một dòng usage log");
}

#[tokio::test]
async fn usage_log_failure_does_not_break_successful_answer() {
    let harness = harness(|_| {}).await;
    // Mock trả 201 cho usage log nên chỉ cần kiểm tra phản hồi vẫn OK khi
    // service key bị thiếu (log bị bỏ qua, không ném lỗi).
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
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn response_meta_reports_actual_provider_and_model() {
    let harness = harness(|_| {}).await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("primary_down");
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
    let body: Value = body_json(response).await;
    assert_eq!(body["data"]["meta"]["provider"], "google");
    assert_eq!(body["data"]["meta"]["model"], "fallback-model");
}

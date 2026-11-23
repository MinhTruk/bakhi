// ===========================================================================
// Bá Khí — Rust backend · tests/fallback_tests.rs
//
// Primary → Fallback giữ nguyên thứ tự cấu hình. Chỉ lỗi tạm thời mới chuyển
// dự phòng; lỗi xác thực/model/cấu hình thì dừng để không che giấu sự cố.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::json;

#[tokio::test]
async fn transient_primary_failure_falls_back_in_order() {
    let harness = harness(|settings| settings.ai_max_retries = 0).await;
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
    let body = body_json(response).await;
    assert_eq!(body["data"]["meta"]["fellBack"], true);
    assert_eq!(body["data"]["meta"]["routeLabel"], "Fallback");
    assert_eq!(body["data"]["meta"]["provider"], "google");
    let attempts = body["data"]["meta"]["attempts"].as_array().unwrap();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0]["ok"], false);
    assert_eq!(attempts[0]["code"], "PROVIDER_DOWN");
    assert_eq!(attempts[1]["ok"], true);
}

#[tokio::test]
async fn primary_success_never_touches_fallback() {
    let harness = harness(|_| {}).await;
    harness.mock.set_routes(fallback_routes());
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
    let body = body_json(response).await;
    assert_eq!(body["data"]["meta"]["fellBack"], false);
    assert_eq!(body["data"]["meta"]["provider"], "groq");
    assert_eq!(harness.mock.provider_calls(), 1);
}

#[tokio::test]
async fn auth_error_stops_the_chain_instead_of_masking_it() {
    let harness = harness(|_| {}).await;
    harness.mock.set_routes(fallback_routes());
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
    assert_eq!(body_json(response).await["error"]["code"], "AUTH");
    assert_eq!(harness.mock.provider_calls(), 1, "không chuyển dự phòng");
}

#[tokio::test]
async fn route_labels_are_reported_truthfully() {
    let harness = harness(|settings| settings.ai_max_retries = 0).await;
    harness.mock.set_routes(vec![
        json!({
            "position": 0, "label": "Groq chính", "provider": "groq",
            "model": "primary-model", "key_ref": "", "enabled": true
        }),
        json!({
            "position": 1, "label": "Gemini dự phòng", "provider": "google",
            "model": "fallback-model", "key_ref": "", "enabled": true
        }),
    ]);
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
    let body = body_json(response).await;
    assert_eq!(body["data"]["meta"]["routeLabel"], "Gemini dự phòng");
}

#[tokio::test]
async fn empty_route_list_uses_settings_configuration() {
    let harness = harness(|_| {}).await;
    harness.mock.set_routes(Vec::new());
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
    let body = body_json(response).await;
    assert_eq!(body["data"]["meta"]["provider"], "groq");
}

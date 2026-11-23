// ===========================================================================
// Bá Khí — Rust backend · tests/learning_stats_tests.rs
//
// Endpoint tổng hợp dữ liệu học tập là hàm thuần: không I/O, không database.
// Chỉ yêu cầu phiên đăng nhập hợp lệ.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::json;

#[tokio::test]
async fn empty_payload_returns_zeroed_report() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            json!({}),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["data"]["totals"]["questions"], 0);
    assert_eq!(body["data"]["totals"]["accuracy"], 0.0);
    assert_eq!(body["data"]["review"]["total"], 0);
    assert!(body["data"]["subjects"].as_array().unwrap().is_empty());
    assert_eq!(body["data"]["sessions"]["count"], 0);
}

#[tokio::test]
async fn no_body_is_treated_as_empty_payload() {
    let harness = harness(|_| {}).await;
    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/api/v1/data/learning-stats")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {VALID_TOKEN}"))
        .body(axum::body::Body::empty())
        .unwrap();
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_json(response).await["data"]["totals"]["questions"], 0);
}

#[tokio::test]
async fn weakest_topics_need_a_minimum_sample() {
    let harness = harness(|_| {}).await;
    let payload = json!({
        "progress": [
            { "subject": "toan", "topic": "nhỏ", "correct": 0, "total": 1 },
            { "subject": "toan", "topic": "đủ mẫu", "correct": 2, "total": 4 }
        ]
    });
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            payload,
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    let body = body_json(response).await;
    let topics = body["data"]["weakest_topics"].as_array().unwrap();
    assert_eq!(topics.len(), 1);
    assert_eq!(topics[0]["topic"], "đủ mẫu");
}

#[tokio::test]
async fn invalid_payload_is_a_client_error_without_internals() {
    let harness = harness(|_| {}).await;
    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/api/v1/data/learning-stats")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {VALID_TOKEN}"))
        .body(axum::body::Body::from("[1,2,3]"))
        .unwrap();
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "BAD_REQUEST");
    assert!(!body.to_string().contains("serde"));
}

#[tokio::test]
async fn endpoint_never_touches_supabase_or_ai() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            json!({ "progress": [{ "subject": "toan", "correct": 1, "total": 2 }] }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let calls = harness.mock.calls();
    assert!(
        calls
            .iter()
            .all(|call| call.starts_with("GET /auth/v1/user")),
        "chỉ được xác thực, không đọc/ghi dữ liệu: {calls:?}"
    );
}

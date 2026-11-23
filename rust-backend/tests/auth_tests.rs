// ===========================================================================
// Bá Khí — Rust backend · tests/auth_tests.rs
//
// Xác thực do Supabase Auth quyết định; backend không decode JWT rồi tin nội dung,
// không tin student_id client gửi, và ánh xạ auth user → student qua
// student_devices (không phải cột students.auth_user_id — cột này không tồn tại).
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::json;

#[tokio::test]
async fn missing_and_forged_tokens_are_rejected() {
    let harness = harness(|_| {}).await;

    let missing = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", None))
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);

    let forged = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some("forged-token-long-enough")))
        .await
        .unwrap();
    assert_eq!(forged.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(body_json(forged).await["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn token_short_circuits_before_any_database_query() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "chào" }),
            None,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(harness.mock.provider_calls(), 0);
    assert!(
        harness
            .mock
            .calls()
            .iter()
            .all(|call| !call.contains("/rest/v1/")),
        "không được truy vấn dữ liệu khi chưa xác thực"
    );
}

#[tokio::test]
async fn me_returns_null_student_when_device_is_not_bound() {
    let harness = harness(|_| {}).await;
    harness.mock.set_device_bound(false);
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some(VALID_TOKEN)))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["data"]["user"]["id"], AUTH_USER_ID);
    assert!(body["data"]["student"].is_null());
    // Đọc liên kết của chính mình bằng JWT người dùng (RLS), không bằng service role.
    let calls = harness.mock.calls();
    let device_call = calls
        .iter()
        .find(|call| call.starts_with("GET /rest/v1/student_devices"))
        .expect("phải đọc student_devices");
    assert!(device_call.contains(&format!("auth_user_id=eq.{AUTH_USER_ID}")));
}

#[tokio::test]
async fn chat_returns_not_bound_like_edge_function() {
    let harness = harness(|_| {}).await;
    harness.mock.set_device_bound(false);
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
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(body_json(response).await["error"]["code"], "NOT_BOUND");
    assert_eq!(harness.mock.provider_calls(), 0);
}

#[tokio::test]
async fn inactive_student_is_forbidden() {
    let harness = harness(|_| {}).await;
    harness.mock.set_student_active(false);
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
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(body_json(response).await["error"]["code"], "INACTIVE");
    assert_eq!(harness.mock.provider_calls(), 0);
}

#[tokio::test]
async fn client_supplied_student_id_is_ignored() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({
                "message": "chào",
                "student_id": "00000000-0000-0000-0000-000000000000",
                "auth_user_id": "99999999-9999-9999-9999-999999999999"
            }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let inserted = harness.mock.last_message_body();
    assert_eq!(inserted["student_id"], STUDENT_ID);
    assert_ne!(
        inserted["student_id"],
        "00000000-0000-0000-0000-000000000000"
    );
}

#[tokio::test]
async fn bearer_header_with_other_scheme_is_rejected() {
    let harness = harness(|_| {}).await;
    let mut request = get("/api/v1/me", None);
    request.headers_mut().insert(
        "authorization",
        format!("Basic {VALID_TOKEN}").parse().unwrap(),
    );
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

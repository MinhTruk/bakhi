// ===========================================================================
// Bá Khí — Rust backend · tests/concurrency_tests.rs
//
// Giới hạn đồng thời phải trả 429 có hạn chờ, không treo request.
// ===========================================================================

mod common;

use std::time::Duration;

use axum::http::StatusCode;
use common::*;
use serde_json::json;

#[tokio::test]
async fn per_user_concurrency_returns_busy_like_edge() {
    let harness = harness(|settings| {
        settings.max_user_concurrency = 1;
        settings.concurrency_wait = Duration::from_millis(50);
    })
    .await;
    harness.mock.set_provider_delay_ms(400);

    let app = harness.app.clone();
    let first = tokio::spawn(async move {
        app.oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu chậm" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap()
    });

    tokio::time::sleep(Duration::from_millis(80)).await;

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
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    let body = body_json(second).await;
    assert_eq!(body["error"]["code"], "BUSY");
    assert_eq!(body["error"]["retryable"], true);

    assert_eq!(first.await.unwrap().status(), StatusCode::OK);
}

#[tokio::test]
async fn global_concurrency_limit_rejects_instead_of_queueing() {
    let harness = harness(|settings| {
        settings.max_concurrency = 1;
        settings.max_user_concurrency = 8;
        settings.concurrency_wait = Duration::from_millis(100);
    })
    .await;
    harness.mock.set_provider_delay_ms(600);

    let app = harness.app.clone();
    let first = tokio::spawn(async move {
        app.oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu chậm" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap()
    });

    tokio::time::sleep(Duration::from_millis(80)).await;
    let started = std::time::Instant::now();
    // `/me` đi qua giới hạn đồng thời (probe sức khoẻ được miễn).
    let second = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some(VALID_TOKEN)))
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(
        started.elapsed() < Duration::from_secs(2),
        "không được chờ vô hạn"
    );
    assert_eq!(body_json(second).await["error"]["code"], "RATE_LIMIT");

    assert_eq!(first.await.unwrap().status(), StatusCode::OK);
}

#[tokio::test]
async fn health_and_readiness_bypass_the_global_limit() {
    let harness = harness(|settings| {
        settings.max_concurrency = 1;
        settings.max_user_concurrency = 8;
        settings.concurrency_wait = Duration::from_millis(50);
    })
    .await;
    harness.mock.set_provider_delay_ms(600);

    let app = harness.app.clone();
    let first = tokio::spawn(async move {
        app.oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "câu chậm" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap()
    });
    tokio::time::sleep(Duration::from_millis(80)).await;

    let health = harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);

    let ready = harness
        .app
        .clone()
        .oneshot(get("/api/v1/ready", None))
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);

    assert_eq!(first.await.unwrap().status(), StatusCode::OK);
}

#[tokio::test]
async fn permits_are_released_after_each_request() {
    let harness = harness(|settings| settings.max_user_concurrency = 1).await;
    for message in ["một", "hai", "ba"] {
        let response = harness
            .app
            .clone()
            .oneshot(post_json(
                "/api/v1/ai/chat",
                json!({ "message": message }),
                Some(VALID_TOKEN),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    assert_eq!(harness.state.concurrency.user_active(AUTH_USER_ID), 0);
}

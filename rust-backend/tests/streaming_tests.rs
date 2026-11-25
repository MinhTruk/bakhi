// ===========================================================================
// Bá Khí — Rust backend · tests/streaming_tests.rs  (8.7.4)
//
// Endpoint SSE chạy qua router thật + Supabase/provider giả lập HTTP thật trên
// 127.0.0.1. Không cần khoá, không gọi mạng ngoài.
//
// Kiểm tra:
//   * delta tới đúng thứ tự và không mất chunk,
//   * kết thúc bằng MỘT sự kiện `done` mang envelope giống endpoint thường,
//   * lỗi TRƯỚC delta đầu tiên được báo bằng `error` (không có `delta`),
//   * fallback chỉ xảy ra trước delta đầu tiên,
//   * TTFT chỉ được ghi khi thực sự có stream,
//   * tắt bằng cấu hình thì endpoint trả 404.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::json;

async fn stream(harness: &Harness, payload: serde_json::Value) -> (StatusCode, String) {
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat/stream",
            payload,
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    let status = response.status();
    (status, body_text(response).await)
}

#[tokio::test]
async fn forwards_deltas_in_order_and_finishes_with_done() {
    let harness = harness(|_| {}).await;
    let (status, body) = stream(&harness, json!({ "message": "chào" })).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("event: delta"), "thiếu delta: {body}");
    assert!(body.contains("event: done"), "thiếu done: {body}");

    let first = body.find("Chào ").expect("thiếu phần đầu");
    let second = body.find("bạn!").expect("thiếu phần sau");
    assert!(first < second, "delta bị đảo thứ tự");

    // Envelope cuối giống endpoint thường để frontend thay thế bản đầy đủ.
    let done_at = body.find("event: done").unwrap();
    let tail = &body[done_at..];
    assert!(tail.contains("\"ok\":true"));
    assert!(tail.contains("\"conversation\""));
    assert!(tail.contains("\"meta\""));

    // TTFT chỉ có vì stream thật sự trả chunk đầu.
    let text = harness.state.metrics.prometheus(&[]);
    assert!(
        text.contains("bakhi_ai_time_to_first_token_seconds_count"),
        "thiếu TTFT: {text}"
    );
    assert!(text.contains("bakhi_ai_stream_events_total{event=\"done\"}"));
}

#[tokio::test]
async fn stream_can_be_disabled_from_configuration() {
    let harness = harness(|settings| settings.ai_stream_enabled = false).await;
    let (status, _) = stream(&harness, json!({ "message": "chào" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn provider_error_before_first_delta_is_an_error_event() {
    let harness = harness(|_| {}).await;
    harness.mock.set_provider_mode("auth_error");
    let (status, body) = stream(&harness, json!({ "message": "chào" })).await;
    // Header SSE đã gửi trước khi biết lỗi provider ⇒ HTTP 200, lỗi ở event.
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("event: error"));
    assert!(body.contains("AUTH"));
    assert!(
        !body.contains("event: delta"),
        "không được gửi nội dung rỗng: {body}"
    );
}

#[tokio::test]
async fn empty_stream_is_reported_as_error_not_as_empty_answer() {
    let harness = harness(|_| {}).await;
    harness.mock.set_provider_mode("empty_stream");
    let (_, body) = stream(&harness, json!({ "message": "chào" })).await;
    assert!(body.contains("event: error"), "{body}");
    assert!(body.contains("EMPTY_RESPONSE"), "{body}");
}

#[tokio::test]
async fn fallback_happens_only_before_the_first_delta() {
    let harness = harness(|settings| settings.ai_max_retries = 0).await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("primary_down");
    let (status, body) = stream(&harness, json!({ "message": "chào" })).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("event: delta"), "{body}");
    assert!(body.contains("event: done"), "{body}");
    let done_at = body.find("event: done").unwrap();
    assert!(
        body[done_at..].contains("\"fellBack\":true"),
        "lượt này phải do provider dự phòng trả lời: {}",
        &body[done_at..]
    );
    assert_eq!(harness.mock.provider_calls(), 2, "primary lỗi + fallback");
}

#[tokio::test]
async fn non_stream_endpoint_unchanged_and_records_no_ttft() {
    let harness = harness(|_| {}).await;
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
    assert_eq!(
        body["data"]["message"]["content"],
        "Chào bạn, cùng học nhé!"
    );
    let text = harness.state.metrics.prometheus(&[]);
    assert!(
        !text.contains("bakhi_ai_time_to_first_token_seconds_count"),
        "response trọn gói không được báo TTFT giả"
    );
}

// ===========================================================================
// Bá Khí — Rust backend · tests/api_contract_tests.rs
//
// Contract testing giữa Rust và Edge Function `ai-tutor-api` (đọc từ mã nguồn
// thật trong repository, không chép lại tài liệu):
//
//   * Cùng đường dẫn, method, yêu cầu xác thực.
//   * Cùng hình dạng `data` khi thành công (golden fixtures).
//   * Cùng error envelope `{ ok:false, error:{ code, message, retryable } }`
//     (Rust thêm `request_id` — chỉ bổ sung, không đổi field cũ).
//   * Cùng HTTP status cho các lỗi nghiệp vụ chính.
//
// Fixture KHÔNG chứa JWT thật, khoá API hay dữ liệu cá nhân thật.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::{json, Value};

fn fixture(name: &str) -> Value {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    let raw = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("thiếu fixture {path}"));
    serde_json::from_str(&raw).unwrap_or_else(|_| panic!("fixture {name} không phải JSON"))
}

/// Mọi field trong `expected` phải tồn tại trong `actual` với cùng kiểu.
/// `null` nghĩa là "phải tồn tại, kiểu bất kỳ" (field tuỳ chọn).
fn assert_shape(actual: &Value, expected: &Value, path: &str) {
    match expected {
        Value::Object(map) => {
            let object = actual
                .as_object()
                .unwrap_or_else(|| panic!("{path}: phải là object, nhận {actual}"));
            for (key, value) in map {
                let got = object
                    .get(key)
                    .unwrap_or_else(|| panic!("{path}: thiếu field `{key}` (nhận {actual})"));
                assert_shape(got, value, &format!("{path}.{key}"));
            }
        }
        Value::Array(items) => {
            let array = actual
                .as_array()
                .unwrap_or_else(|| panic!("{path}: phải là array, nhận {actual}"));
            if let Some(first) = items.first() {
                assert!(
                    !array.is_empty(),
                    "{path}: fixture kỳ vọng có phần tử (nhận {actual})"
                );
                assert_shape(&array[0], first, &format!("{path}[0]"));
            }
        }
        Value::String(_) => assert!(actual.is_string(), "{path}: phải là string"),
        Value::Bool(_) => assert!(actual.is_boolean(), "{path}: phải là bool"),
        Value::Number(_) => assert!(actual.is_number(), "{path}: phải là number"),
        Value::Null => {}
    }
}

fn assert_error_envelope(body: &Value) {
    assert_shape(body, &fixture("error_envelope.json"), "error");
    let keys: Vec<&String> = body.as_object().unwrap().keys().collect();
    assert_eq!(
        keys.len(),
        3,
        "error envelope không được thêm field lạ: {keys:?}"
    );
}

#[tokio::test]
async fn health_contract_matches_fixture() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        None,
        "health là liveness, không cần no-store (và không được lộ header lạ)"
    );
    let body = body_json(response).await;
    assert_shape(&body, &fixture("health_response.json"), "health");
    assert_eq!(body["data"]["version"], env!("CARGO_PKG_VERSION"));
}

#[tokio::test]
async fn me_contract_matches_fixture() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some(VALID_TOKEN)))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_shape(&body, &fixture("me_response.json"), "me");
}

#[tokio::test]
async fn chat_success_contract_matches_fixture() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            fixture("chat_request_valid.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_shape(&body, &fixture("chat_success_response.json"), "chat");
    // Field bắt buộc của Edge Function phải có mặt với đúng giá trị kiểu.
    assert!(body["data"]["meta"]["attempts"].is_array());
    assert!(body["data"]["meta"]["outputBudget"]["maxTokens"].is_number());
    assert!(body["data"]["meta"]["tokens"]["estimated"].is_boolean());
}

#[tokio::test]
async fn empty_message_contract_is_400_empty_message() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            fixture("chat_request_empty.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = body_json(response).await;
    assert_error_envelope(&body);
    assert_eq!(body["error"]["code"], "EMPTY_MESSAGE");
    assert_eq!(body["error"]["message"], "Bạn chưa nhập câu hỏi.");
}

#[tokio::test]
async fn unsupported_mode_falls_back_to_explain_like_edge() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            fixture("chat_request_disabled_mode.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    // Edge: `isMode(body.mode) ? … : 'explain'` ⇒ chế độ lạ không bị từ chối.
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["data"]["meta"]["mode"], "explain");
}

#[tokio::test]
async fn unauthenticated_contract_matches_error_envelope() {
    let harness = harness(|_| {}).await;
    for uri in [
        "/api/v1/me",
        "/api/v1/ai/chat",
        "/api/v1/data/learning-stats",
    ] {
        let mut request = get(uri, None);
        if uri != "/api/v1/me" {
            request = post_json(uri, json!({}), None);
        }
        let response = harness.app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{uri}");
        let body = body_json(response).await;
        assert_error_envelope(&body);
        assert_eq!(body["error"]["code"], "UNAUTHORIZED");
    }
}

#[tokio::test]
async fn provider_failure_contract_is_502_with_retryable_flag() {
    let harness = harness(|_| {}).await;
    harness.mock.set_provider_mode("server_error");
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            fixture("chat_request_valid.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    let body = body_json(response).await;
    assert_error_envelope(&body);
    assert_eq!(body["error"]["code"], "PROVIDER_DOWN");
    assert_eq!(body["error"]["retryable"], true);
}

#[tokio::test]
async fn not_bound_and_inactive_contract_matches_edge() {
    let harness = harness(|_| {}).await;
    harness.mock.set_device_bound(false);
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            fixture("chat_request_valid.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = body_json(response).await;
    assert_error_envelope(&body);
    assert_eq!(body["error"]["code"], "NOT_BOUND");

    harness.mock.set_device_bound(true);
    harness.mock.set_student_active(false);
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            fixture("chat_request_valid.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let body = body_json(response).await;
    assert_error_envelope(&body);
    assert_eq!(body["error"]["code"], "INACTIVE");
}

#[tokio::test]
async fn learning_stats_contract_matches_fixture() {
    let harness = harness(|_| {}).await;
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            fixture("learning_stats_request.json"),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_shape(&body, &fixture("learning_stats_response.json"), "stats");
}

#[tokio::test]
async fn json_endpoints_require_json_content_type() {
    let harness = harness(|_| {}).await;
    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/api/v1/ai/chat")
        .header("content-type", "text/plain")
        .header("authorization", format!("Bearer {VALID_TOKEN}"))
        .body(axum::body::Body::from("{\"message\":\"x\"}"))
        .unwrap();
    let response = harness.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    let body = body_json(response).await;
    assert_error_envelope(&body);
    assert_eq!(body["error"]["code"], "UNSUPPORTED_MEDIA_TYPE");
}

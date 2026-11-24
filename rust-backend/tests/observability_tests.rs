// ===========================================================================
// Bá Khí — Rust backend · tests/observability_tests.rs
//
// Kiểm thử instrumentation THẬT (8.6.2): counter/histogram HTTP, phân loại lỗi,
// AI Primary/Fallback, token, chi phí ước tính, bảo vệ `/metrics` và endpoint
// tổng hợp Founder. Không chỉ kiểm tra "mở endpoint thấy 200".
// ===========================================================================

mod common;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use bakhi_backend::config::Settings;
use bakhi_backend::observability::pricing::Pricing;
use common::*;
use serde_json::{json, Value};

const METRICS_TOKEN: &str = "metrics-secret-token";

fn enable_metrics(settings: &mut Settings) {
    settings.metrics_enabled = true;
    settings.metrics_token = Some(METRICS_TOKEN.to_string());
}

fn metrics_request(uri: &str, token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder().method(Method::GET).uri(uri);
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    builder.body(Body::empty()).unwrap()
}

fn summary_request(token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/observability/summary")
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        builder = builder.header("x-admin-token", token);
    }
    builder.body(Body::from("{}")).unwrap()
}

#[tokio::test]
async fn metrics_is_hidden_until_enabled_and_token_is_provided() {
    let hidden = harness(|_| {}).await;
    for uri in ["/metrics", "/api/v1/metrics"] {
        let response = hidden
            .app
            .clone()
            .oneshot(metrics_request(uri, Some(METRICS_TOKEN)))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "uri={uri}");
    }

    // Bật nhưng thiếu token ⇒ vẫn 404 (không tiết lộ endpoint nội bộ).
    let harness = harness(|settings| settings.metrics_enabled = true).await;
    let response = harness
        .app
        .clone()
        .oneshot(metrics_request("/metrics", None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn metrics_requires_the_configured_bearer_token() {
    let harness = harness(enable_metrics).await;

    let wrong = harness
        .app
        .clone()
        .oneshot(metrics_request("/metrics", Some("wrong-token")))
        .await
        .unwrap();
    assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);

    let missing = harness
        .app
        .clone()
        .oneshot(metrics_request("/metrics", None))
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);

    let ok = harness
        .app
        .clone()
        .oneshot(metrics_request("/metrics", Some(METRICS_TOKEN)))
        .await
        .unwrap();
    assert_eq!(ok.status(), StatusCode::OK);
    assert_eq!(
        ok.headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()),
        Some("text/plain; version=0.0.4; charset=utf-8")
    );
    let body = body_text(ok).await;
    assert!(body.contains("# TYPE bakhi_http_requests_total counter"));
    assert!(body.contains("# TYPE bakhi_http_request_duration_seconds histogram"));
    assert!(body.contains("bakhi_ai_requests_total"));
    assert!(body.contains("bakhi_process_uptime_seconds"));
    assert!(!body.contains("Authorization"));
}

#[tokio::test]
async fn http_metrics_track_route_method_status_and_exclude_scrapes() {
    let harness = harness(enable_metrics).await;
    harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();

    let response = harness
        .app
        .clone()
        .oneshot(metrics_request("/metrics", Some(METRICS_TOKEN)))
        .await
        .unwrap();
    let first = body_text(response).await;
    assert!(
        first.contains(
            "bakhi_http_requests_total{method=\"GET\",route=\"/health\",status=\"200\"} 1"
        ),
        "thiếu counter health: {first}"
    );
    assert!(first.contains("le=\"+Inf\""));
    // Gauge đang đo chính request scrape này, nên chỉ cần tồn tại và >= 1.
    assert!(first.contains("bakhi_http_in_flight_requests 1"));

    // Scrape lần hai không được tự cộng vào thống kê nghiệp vụ.
    let response = harness
        .app
        .clone()
        .oneshot(metrics_request("/metrics", Some(METRICS_TOKEN)))
        .await
        .unwrap();
    let second = body_text(response).await;
    assert!(
        !second.contains("route=\"/metrics\""),
        "scrape /metrics không được thành chuỗi thời gian: {second}"
    );
    assert!(second
        .contains("bakhi_http_requests_total{method=\"GET\",route=\"/health\",status=\"200\"} 1"));
}

#[tokio::test]
async fn client_errors_are_classified_separately_from_server_errors() {
    let harness = harness(enable_metrics).await;
    let response = harness
        .app
        .clone()
        .oneshot(get("/api/v1/me", Some("bad-token")))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let body = harness.state.metrics.prometheus(&[]);
    assert!(body.contains(
        "bakhi_http_requests_total{method=\"GET\",route=\"/api/v1/me\",status=\"401\"} 1"
    ));
    assert!(body.contains(
        "bakhi_http_errors_total{method=\"GET\",route=\"/api/v1/me\",category=\"client_error\"} 1"
    ));
    // 401 không được tính là lỗi máy chủ.
    assert!(!body.contains("category=\"server_error\""));
}

#[tokio::test]
async fn ai_success_records_tokens_cost_and_provider_latency() {
    let harness = harness(|settings| {
        enable_metrics(settings);
        settings.ai_pricing = Pricing::parse(
            r#"[{"provider":"groq","model":"test-model","input_per_million":1.0,"output_per_million":2.0}]"#,
            "test",
        );
    })
    .await;

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

    let text = harness.state.metrics.prometheus(&[]);
    assert!(text.contains(
        "bakhi_ai_requests_total{role=\"primary\",provider=\"groq\",model=\"test-model\",status=\"success\"} 1"
    ));
    // Mock trả usage thật 42/7 ⇒ không phải estimated.
    assert!(text.contains(
        "bakhi_ai_tokens_total{role=\"primary\",provider=\"groq\",model=\"test-model\",type=\"input\",estimated=\"false\"} 42"
    ));
    assert!(text.contains(
        "bakhi_ai_tokens_total{role=\"primary\",provider=\"groq\",model=\"test-model\",type=\"output\",estimated=\"false\"} 7"
    ));
    // 42 input × 1 USD/1M + 7 output × 2 USD/1M.
    let expected = 42.0 / 1_000_000.0 + 14.0 / 1_000_000.0;
    assert!(
        text.contains(&format!(
            "bakhi_ai_estimated_cost_usd_total{{role=\"primary\",provider=\"groq\",model=\"test-model\",currency=\"USD\"}} {expected:.6}"
        )),
        "thiếu chi phí chính xác: {text}"
    );
    assert!(text.contains("bakhi_ai_unpriced_requests_total 0"));
    assert!(text.contains("bakhi_ai_request_duration_seconds_bucket{role=\"primary\""));
}

#[tokio::test]
async fn unpriced_model_is_not_reported_as_zero_cost() {
    let harness = harness(enable_metrics).await;
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

    let text = harness.state.metrics.prometheus(&[]);
    assert!(!text.contains("bakhi_ai_estimated_cost_usd_total{"));
    assert!(text.contains("bakhi_ai_unpriced_requests_total 1"));
}

#[tokio::test]
async fn fallback_success_is_counted_once_per_user_request() {
    let harness = harness(enable_metrics).await;
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

    let text = harness.state.metrics.prometheus(&[]);
    assert!(text.contains("bakhi_ai_fallback_total{outcome=\"attempted\"} 1"));
    assert!(text.contains("bakhi_ai_fallback_total{outcome=\"success\"} 1"));
    assert!(text.contains("bakhi_ai_user_requests_total 1"));
    assert!(text.contains("bakhi_ai_user_fallback_total 1"));
    assert!(text.contains(
        "bakhi_ai_requests_total{role=\"fallback\",provider=\"google\",model=\"fallback-model\",status=\"success\"} 1"
    ));
    // Một lượt người dùng, không phải hai.
    let summary = harness.state.metrics.summary(&[], true);
    assert_eq!(summary["ai"]["requests"], 1);
    assert_eq!(summary["ai"]["fallbackRequests"], 1);
    assert_eq!(summary["ai"]["availability"], 100.0);
}

#[tokio::test]
async fn total_ai_failure_is_counted_separately_from_partial_fallback() {
    let harness = harness(enable_metrics).await;
    harness.mock.set_routes(fallback_routes());
    harness.mock.set_provider_mode("server_error");

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

    let text = harness.state.metrics.prometheus(&[]);
    assert!(text.contains("bakhi_ai_fallback_total{outcome=\"attempted\"} 1"));
    assert!(text.contains("bakhi_ai_fallback_total{outcome=\"failure\"} 1"));
    assert!(!text.contains("bakhi_ai_fallback_total{outcome=\"success\"}"));
    assert!(text.contains("bakhi_ai_user_failed_total 1"));
    assert!(text.contains(
        "bakhi_ai_provider_errors_total{provider=\"groq\",model=\"primary-model\",code=\"PROVIDER_DOWN\"}"
    ));
    // Lượt thất bại SAU KHI đã chuyển dự phòng vẫn phải tính là lượt fallback.
    assert!(text.contains("bakhi_ai_user_requests_total 1"));
    assert!(text.contains("bakhi_ai_user_fallback_total 1"));
    let summary = harness.state.metrics.summary(&[], true);
    assert_eq!(summary["ai"]["requests"], 1);
    assert_eq!(summary["ai"]["fallbackRequests"], 1);
    assert_eq!(summary["ai"]["primaryOnly"], 0);
    assert_eq!(summary["ai"]["failed"], 1);
    assert_eq!(summary["ai"]["availability"], 0.0);
    assert_eq!(summary["ai"]["fallbackRate"], 100.0);
}

#[tokio::test]
async fn primary_only_failure_is_not_counted_as_fallback() {
    let harness = harness(enable_metrics).await;
    harness.mock.set_provider_mode("server_error");

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

    let text = harness.state.metrics.prometheus(&[]);
    // Chỉ có provider chính ⇒ không có lượt nào đi qua dự phòng.
    assert!(!text.contains("bakhi_ai_fallback_total{outcome=\"attempted\"}"));
    assert!(!text.contains("bakhi_ai_fallback_total{outcome=\"failure\"}"));
    assert!(text.contains("bakhi_ai_user_requests_total 1"));
    assert!(text.contains("bakhi_ai_user_fallback_total 0"));
    assert!(text.contains("bakhi_ai_user_failed_total 1"));
    let summary = harness.state.metrics.summary(&[], true);
    assert_eq!(summary["ai"]["fallbackRequests"], 0);
    assert_eq!(summary["ai"]["primaryOnly"], 1);
}

#[tokio::test]
async fn rejected_requests_do_not_pollute_ai_availability() {
    let harness = harness(enable_metrics).await;

    // Câu hỏi rỗng bị chặn trước khi gọi provider: không phải lượt AI thất bại.
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "   " }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let text = harness.state.metrics.prometheus(&[]);
    assert!(text.contains("bakhi_ai_user_requests_total 0"));
    assert!(text.contains("bakhi_ai_user_failed_total 0"));
    assert!(!text.contains("bakhi_ai_requests_total{"));
}

#[tokio::test]
async fn founder_summary_requires_a_live_founder_session() {
    let harness = harness(enable_metrics).await;

    let anonymous = harness
        .app
        .clone()
        .oneshot(summary_request(None))
        .await
        .unwrap();
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);

    harness.mock.set_admin_scope("none");
    let unknown = harness
        .app
        .clone()
        .oneshot(summary_request(Some(FOUNDER_TOKEN)))
        .await
        .unwrap();
    assert_eq!(unknown.status(), StatusCode::UNAUTHORIZED);

    // Administrator thường không được xem dữ liệu vận hành.
    harness.mock.set_admin_scope("admin");
    let admin = harness
        .app
        .clone()
        .oneshot(summary_request(Some(FOUNDER_TOKEN)))
        .await
        .unwrap();
    assert_eq!(admin.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn founder_summary_returns_real_runtime_aggregates_without_user_data() {
    let harness = harness(enable_metrics).await;
    harness
        .app
        .clone()
        .oneshot(get("/api/v1/health", None))
        .await
        .unwrap();
    harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/ai/chat",
            json!({ "message": "chào" }),
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();

    let response = harness
        .app
        .clone()
        .oneshot(summary_request(Some(FOUNDER_TOKEN)))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert_eq!(body["ok"], true);
    assert_eq!(
        body["data"]["runtime"]["version"],
        env!("CARGO_PKG_VERSION")
    );
    assert_eq!(body["data"]["metrics"]["enabled"], true);
    assert!(body["data"]["http"]["totalRequests"].as_u64().unwrap() >= 2);
    let endpoints = body["data"]["http"]["endpoints"].as_array().unwrap();
    assert!(endpoints.iter().any(|row| row["route"] == "/health"));
    assert_eq!(body["data"]["ai"]["requests"], 1);
    assert_eq!(body["data"]["ai"]["providers"][0]["provider"], "groq");
    assert!(body["data"]["ai"]["providers"][0]["p95Ms"].is_number());
    assert!(body["data"]["ai"]["cost"]["pricingVersion"].is_string());
    assert_eq!(body["data"]["ai"]["cost"]["unpricedRequests"], 1);

    let text = body.to_string();
    for forbidden in ["student", "email", "token_hash", "Authorization"] {
        assert!(
            !text.to_lowercase().contains(&forbidden.to_lowercase()),
            "summary lộ dữ liệu cấm: {forbidden}"
        );
    }
}

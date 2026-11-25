// ===========================================================================
// Bá Khí — Rust backend · tests/parallel_tests.rs  (8.8.0)
//
// Xác nhận route CPU-bound thật sự đi qua Parallel Execution Engine khi lô đủ
// lớn, và vẫn đi đường inline cho lô nhỏ (vì engine có ~28 µs cố định — đã đo
// trong `examples/pipeline_bench.rs`, nên dùng cho lô vài dòng là chậm đi).
// Số liệu vòng đời tác vụ đi vào registry metrics hiện có: không endpoint mới,
// không nhãn người dùng.
// ===========================================================================

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::{json, Value};

fn payload(rows: usize) -> Value {
    let progress: Vec<Value> = (0..rows)
        .map(|index| {
            json!({
                "subject": if index % 2 == 0 { "Toán" } else { "Lý" },
                "topic": format!("chủ đề {}", index % 20),
                "correct": index % 5,
                "total": 5,
                "last_at": "2026-11-20T10:00:00Z"
            })
        })
        .collect();
    json!({
        "progress": progress,
        "review": [{ "subject": "Toán", "topic": "Hàm số", "wrong": 1,
                     "last_at": "2026-11-20T10:00:00Z" }],
        "sessions": [{ "started_at": "2026-11-20T09:00:00Z", "minutes": 30,
                       "questions": 6, "correct": 4 }]
    })
}

async fn post_stats(harness: &Harness, body: Value) -> (StatusCode, Value) {
    let response = harness
        .app
        .clone()
        .oneshot(post_json(
            "/api/v1/data/learning-stats",
            body,
            Some(VALID_TOKEN),
        ))
        .await
        .unwrap();
    let status = response.status();
    (status, body_json(response).await)
}

#[tokio::test]
async fn large_batches_run_on_the_parallel_engine() {
    let harness = harness(|settings| {
        settings.parallel_cpu_workers = 1;
        settings.parallel_queue_capacity = 4;
    })
    .await;

    let (status, body) = post_stats(&harness, payload(600)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], true);

    let text = harness.state.metrics.prometheus(&[]);
    assert!(
        text.contains("bakhi_parallel_tasks_total{state=\"completed\"} 1"),
        "tác vụ phải hoàn tất trên engine: {text}"
    );
    assert!(text.contains("bakhi_parallel_queue_wait_seconds_count 1"));
    assert!(text.contains("bakhi_parallel_task_duration_seconds_count 1"));
    assert!(text.contains("bakhi_parallel_tasks_active 0"));
    assert!(text.contains("bakhi_parallel_tasks_pending 0"));
}

#[tokio::test]
async fn small_batches_stay_on_the_inline_fast_path() {
    let harness = harness(|_| {}).await;
    let (status, body) = post_stats(&harness, payload(3)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], true);
    let text = harness.state.metrics.prometheus(&[]);
    // HELP/TYPE luôn có; điều cần kiểm tra là KHÔNG có sample nào.
    assert!(
        !text.contains("bakhi_parallel_tasks_total{"),
        "lô nhỏ không được trả giá spawn của worker pool: {text}"
    );
}

#[tokio::test]
async fn parallel_engine_limits_come_from_configuration() {
    let harness = harness(|settings| {
        settings.parallel_cpu_workers = 3;
        settings.parallel_queue_capacity = 7;
    })
    .await;
    assert_eq!(harness.state.parallel.workers(), 3);
    assert_eq!(harness.state.parallel.capacity(), 7);
    assert_eq!(harness.state.parallel.available_workers(), 3);
}

#[tokio::test]
async fn summary_exposes_parallel_and_streaming_sections() {
    let harness = harness(|_| {}).await;
    let summary = harness.state.metrics.summary(&[], false);
    assert!(summary["parallel"].is_object());
    assert!(summary["streaming"].is_object());
    assert!(summary["preparation"].is_object());
    // Không có dữ liệu ⇒ sample = 0, không bịa số.
    assert_eq!(summary["streaming"]["ttftSamples"], 0);
}

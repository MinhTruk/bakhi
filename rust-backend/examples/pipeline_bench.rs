// ===========================================================================
// Bá Khí — Rust backend · examples/pipeline_bench.rs
//
// Microbenchmark cho Data Pipeline 8.7.2 (không gọi mạng, không cần Supabase):
//   * chi phí clone system prompt + lịch sử cho mỗi attempt (bản cũ)
//     so với mượn dữ liệu (bản 8.7.2);
//   * dựng body provider bằng cây `serde_json::Value` (bản cũ)
//     so với struct `Serialize` mượn dữ liệu (bản 8.7.2);
//   * parse một chat request đã serialize;
//   * (8.7.3) chi phí đọc cache L1 so với clone cấu hình mỗi lượt chat.
//
// Chạy: cargo run --release --locked --example pipeline_bench
//
// Đây là microbenchmark của ĐÚNG các thao tác đã đổi, không phải benchmark
// end-to-end (không đo độ trễ provider/HTTP). Số liệu chỉ có ý nghĩa so sánh
// tương đối giữa hai cách làm trong cùng một lần chạy.
// ===========================================================================

use std::hint::black_box;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bakhi_backend::cache::{Cache, CacheConfig, CacheCounters};
use bakhi_backend::providers::ChatTurn;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize)]
struct WireMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    messages: Vec<WireMessage<'a>>,
    max_tokens: u32,
    temperature: f32,
    stream: bool,
}

fn make_turns(count: usize, chars: usize) -> Vec<ChatTurn> {
    (0..count)
        .map(|index| ChatTurn {
            role: if index % 2 == 0 {
                "user".to_string()
            } else {
                "assistant".to_string()
            },
            content: "x".repeat(chars),
        })
        .collect()
}

fn bench<F: FnMut()>(name: &str, iters: u32, mut run: F) {
    for _ in 0..(iters / 10).max(1) {
        run();
    }
    let started = Instant::now();
    for _ in 0..iters {
        run();
    }
    let per_op_ns = started.elapsed().as_secs_f64() * 1e9 / f64::from(iters);
    println!("{name:<46} {per_op_ns:>12.0} ns/op");
}

fn scenario(label: &str, turn_count: usize, chars: usize) {
    let turns = make_turns(turn_count, chars);
    let system = "s".repeat(8_000);
    let model = "openai/gpt-oss-20b";
    let iters = 2_000;

    println!("\n[{label}] {turn_count} lượt × {chars} ký tự · system 8.000 ký tự");

    bench("legacy: clone system + turns / attempt", iters, || {
        let owned_system = system.clone();
        let owned_turns = turns.clone();
        black_box((owned_system, owned_turns));
    });

    bench("v8.7.2: mượn system + turns / attempt", iters, || {
        black_box((system.as_str(), turns.as_slice()));
    });

    bench("legacy: Value tree + to_vec", iters, || {
        let mut messages: Vec<Value> = Vec::with_capacity(turns.len() + 1);
        messages.push(json!({ "role": "system", "content": system }));
        for turn in &turns {
            messages.push(json!({ "role": turn.role.as_str(), "content": turn.content.as_str() }));
        }
        let body = json!({
            "model": model,
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 0.4,
            "stream": false
        });
        black_box(serde_json::to_vec(&body).unwrap());
    });

    let payload = {
        let mut messages: Vec<WireMessage<'_>> = Vec::with_capacity(turns.len() + 1);
        messages.push(WireMessage {
            role: "system",
            content: &system,
        });
        messages.extend(turns.iter().map(|turn| WireMessage {
            role: &turn.role,
            content: &turn.content,
        }));
        let body = WireRequest {
            model,
            messages,
            max_tokens: 1024,
            temperature: 0.4,
            stream: false,
        };
        serde_json::to_vec(&body).unwrap()
    };

    bench("v8.7.2: typed borrow + to_vec", iters, || {
        let mut messages: Vec<WireMessage<'_>> = Vec::with_capacity(turns.len() + 1);
        messages.push(WireMessage {
            role: "system",
            content: &system,
        });
        messages.extend(turns.iter().map(|turn| WireMessage {
            role: &turn.role,
            content: &turn.content,
        }));
        let body = WireRequest {
            model,
            messages,
            max_tokens: 1024,
            temperature: 0.4,
            stream: false,
        };
        black_box(serde_json::to_vec(&body).unwrap());
    });

    bench("parse chat body (from_slice)", iters, || {
        black_box(serde_json::from_slice::<Value>(&payload).unwrap());
    });
}

/// 8.7.3 — chi phí đọc cache L1 so với clone cấu hình mỗi lượt chat.
///
/// `cache.get()` ở đây bao gồm cả khoá mutex, cập nhật LRU và bộ đếm metrics
/// (đúng như trong production), nên đây là chi phí thật của một lần hit.
fn cache_scenario() {
    println!("\n[cache] cấu hình AI ~40 route (dữ liệu dùng chung)");
    let config = serde_json::json!({
        "enabled": true,
        "provider": "groq",
        "model": "openai/gpt-oss-20b",
        "routes": (0..40)
            .map(|index| serde_json::json!({
                "position": index,
                "label": format!("route {index}"),
                "provider": "groq",
                "model": "openai/gpt-oss-20b",
                "key_ref": "AI_TUTOR_KEY_3",
                "enabled": true
            }))
            .collect::<Vec<_>>()
    });

    let cache = Cache::new(CacheConfig::default(), Arc::new(CacheCounters::default()));
    let inserted = cache.insert(
        "ai:settings:v1",
        config.clone(),
        Some(Duration::from_secs(30)),
        &["ai-config"],
    );
    assert!(inserted, "cache phải lưu được cấu hình mẫu");

    bench("v8.7.3: cache L1 hit (Arc, không clone payload)", 200_000, || {
        black_box(cache.get("ai:settings:v1"));
    });

    bench("v8.7.3: cache miss (khoá không tồn tại)", 200_000, || {
        black_box(cache.get("ai:routes:absent"));
    });

    bench("v8.7.2: clone cấu hình mỗi lượt chat", 200_000, || {
        black_box(config.clone());
    });
}

fn main() {
    println!("Bá Khí 8.7.3 — pipeline + cache microbenchmark");
    scenario("small", 2, 200);
    scenario("medium", 12, 400);
    scenario("large", 40, 1_500);
    cache_scenario();
}

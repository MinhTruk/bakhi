#!/usr/bin/env node
'use strict';
/**
 * Bá Khí 8.8.0 — QA tĩnh cho AI Pipeline Performance (8.7.4) + Parallel Engine (8.8.0).
 *
 *   node tools/qa/v874-pipeline.js
 *
 * Không cần mạng, không cần jsdom, không gọi provider. Kiểm tra các BẤT BIẾN
 * dễ bị phá khi refactor — không phải kiểm thử hành vi (việc đó ở `cargo test`).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
function ok(name, cond, detail) {
  if (cond) console.log('  PASS ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const SETTINGS = read('rust-backend/src/config/settings.rs');
const AI = read('rust-backend/src/services/ai_service.rs');
const LIB = read('rust-backend/src/lib.rs');
const PAR = read('rust-backend/src/parallel/mod.rs');
const SSE = read('rust-backend/src/providers/sse.rs');
const OPENAI = read('rust-backend/src/providers/openai.rs');
const GEMINI = read('rust-backend/src/providers/gemini.rs');
const DATA_ROUTE = read('rust-backend/src/routes/data.rs');
const METRICS = read('rust-backend/src/observability/metrics.rs');
const ENV = read('rust-backend/.env.example');
const TUTOR = read('assets/bakhi/bk-ai-tutor.js');

console.log('\n== 1. Cấu hình có tên biến và mặc định an toàn ==');
[
  'AI_STREAM_ENABLED',
  'AI_TTFT_TIMEOUT_MS',
  'AI_STREAM_IDLE_TIMEOUT_MS',
  'AI_RETRY_BACKOFF_MAX_MS',
  'RUST_CPU_WORKERS',
  'RUST_TASK_QUEUE_CAPACITY',
  'RUST_TASK_WAIT_MS',
  'RUST_TASK_TIMEOUT_MS'
].forEach(function (name) {
  ok('settings.rs đọc ' + name, SETTINGS.indexOf(name) >= 0);
  ok('.env.example ghi ' + name, ENV.indexOf(name) >= 0);
});
ok(
  'streaming mặc định bật nhưng tắt được',
  SETTINGS.indexOf('AI_STREAM_ENABLED') >= 0 && /parse_bool\(&v, true\)/.test(SETTINGS)
);
ok(
  'TTFT timeout không vượt timeout provider',
  /ai_ttft_timeout > self\.ai_timeout/.test(SETTINGS)
);

console.log('\n== 2. Endpoint streaming là bổ sung, không thay contract cũ ==');
ok('route /ai/chat/stream được đăng ký', /\/ai\/chat\/stream/.test(LIB));
ok('route /ai/chat cũ vẫn còn', /route\(\"\/ai\/chat\", post/.test(LIB));
ok('tắt bằng cấu hình thì 404', /ai_stream_enabled/.test(read('rust-backend/src/routes/ai.rs')));
ok('SSE có keep-alive và chống đệm proxy', /KeepAlive/.test(read('rust-backend/src/routes/ai.rs')) && /x-accel-buffering/.test(read('rust-backend/src/routes/ai.rs')));

console.log('\n== 3. Bất biến fallback/retry/huỷ ==');
ok(
  'delta() tự đánh dấu đã gửi nội dung',
  /async fn delta\(&self, text: &str\) -> bool \{\s*self\.mark_delta\(\)/.test(AI)
);
ok(
  'không retry/fallback sau delta',
  /delta_sent\(\)\) == Some\(true\)/.test(AI) && /break 'providers;/.test(AI)
);
ok('CANCELLED dừng cả chuỗi', /AiErrorCode::Cancelled/.test(AI));
ok('có CancelGuard + metrics huỷ', /struct CancelGuard/.test(AI) && /record_ai_cancelled/.test(AI));
ok('huỷ theo dõi kênh SSE đóng', /sink\.tx\.closed\(\)/.test(AI));
ok('backoff luỹ thừa có jitter', /backoff_with_jitter/.test(AI) && exists('rust-backend/src/services/retry.rs'));
ok('TTFT chỉ từ kết quả provider', /if let Some\(ttft\) = result\.ttft/.test(AI));
ok('response trọn gói khai báo ttft: None', /ttft: None/.test(OPENAI) && /ttft: None/.test(GEMINI));
ok('chuẩn bị request chạy song song', /tokio::join!/.test(AI));

console.log('\n== 4. Streaming an toàn UTF-8 và có backpressure ==');
ok('SseLines giữ byte tới khi có dòng', /Vec<u8>/.test(SSE) && /position\(\|byte\| \*byte == b'\\n'\)/.test(SSE));
ok('có trần dòng để không phình RAM', /MAX_LINE_BYTES/.test(SSE) && /overflow/.test(SSE));
ok('kênh SSE có giới hạn', /STREAM_BUFFER/.test(read('rust-backend/src/routes/ai.rs')) && /mpsc::channel/.test(read('rust-backend/src/routes/ai.rs')));
ok('provider đọc chunk bằng select với closed()', /response\.chunk\(\)/.test(OPENAI) && /response\.chunk\(\)/.test(GEMINI));

console.log('\n== 5. Parallel Engine có giới hạn và không orphan ==');
ok('engine là module riêng', exists('rust-backend/src/parallel/mod.rs'));
ok('AppState sở hữu engine', /pub parallel: Arc<ParallelEngine>/.test(LIB));
ok('có semaphore hàng đợi + worker', /queue: Arc<Semaphore>/.test(PAR) && /cpu: Arc<Semaphore>/.test(PAR));
ok('hàng đợi đầy trả lỗi, không chờ vô hạn', /TaskError::QueueFull/.test(PAR) && /tokio::time::timeout/.test(PAR));
ok('bắt panic', /catch_unwind/.test(PAR));
ok('không tự tạo thread', !/std::thread::spawn|thread::Builder/.test(PAR));
ok('gauge active do RAII giữ', /struct ActiveGuard/.test(PAR) && /impl Drop for ActiveGuard/.test(PAR));
ok('timeout giữ permit tới khi closure xong', /_cpu_permit = cpu_permit/.test(PAR));
ok(
  'lô nhỏ không đi qua engine',
  /PARALLEL_MIN_ROWS/.test(DATA_ROUTE) && /row_count\(\) < PARALLEL_MIN_ROWS/.test(DATA_ROUTE)
);

console.log('\n== 6. Metrics dùng registry hiện có ==');
ok('không mở endpoint metrics thứ hai', !/route\(\"\/metrics2/.test(LIB));
ok('có metrics stream + parallel', /bakhi_ai_stream_events_total/.test(METRICS) && /bakhi_parallel_tasks_total/.test(METRICS));
ok('TTFT chỉ có nhãn hữu hạn', /record_ai_ttft\(\s*&self,\s*role: &str,\s*provider: &str,\s*model: &str/.test(METRICS));
ok('summary có khối streaming/preparation/parallel', /\"streaming\":/.test(METRICS) && /\"parallel\":/.test(METRICS));
ok('histogram không nhãn in {le=…}', /fn render_histogram/.test(METRICS) && /labels\.is_empty\(\)/.test(METRICS));

console.log('\n== 7. Frontend streaming là tuỳ chọn ==');
ok('có nhánh streaming chỉ khi bật cờ', /cfg\.streaming === true/.test(TUTOR));
ok('gọi đúng endpoint', /\/api\/v1\/ai\/chat\/stream/.test(TUTOR));
ok('nhận text/event-stream', /text\/event-stream/.test(TUTOR));
ok('không thay đường post() cũ', /function post\(body, signal\)/.test(TUTOR));
ok('có nút dừng dùng AbortController', /S\.controller = global\.AbortController/.test(TUTOR));

console.log('\n== 8. Tài liệu và phát hành ==');
ok('docs/AI_PIPELINE_V874.md', exists('docs/AI_PIPELINE_V874.md'));
ok('docs/PARALLEL_ENGINE_V880.md', exists('docs/PARALLEL_ENGINE_V880.md'));
ok('CHANGELOG có 8.8.0', /^## \[8\.8\.0\]/m.test(read('CHANGELOG.md')));
ok('Cargo.toml là 8.8.0', /^version = \"8\.8\.0\"/m.test(read('rust-backend/Cargo.toml')));
ok('không có khoá API trong mã frontend', !/gsk_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}/.test(TUTOR));

console.log('');
if (failures) {
  console.log('=== ' + failures + ' CHECK(S) FAILED ===');
  process.exit(1);
}
console.log('=== ALL CHECKS PASSED ===');

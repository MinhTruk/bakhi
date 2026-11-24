#!/usr/bin/env node
/**
 * Bá Khí 8.7.1 — QA tĩnh cho Runtime Engine.
 *
 * Kiểm tra phần NỐI DÂY và bất biến cấu hình (không thay thế cargo test):
 *   1. Một Tokio runtime tường minh, worker thread cấu hình được.
 *   2. Giới hạn đồng thời theo provider có thật trong mã.
 *   3. Tên cấu hình RUST_* và tên cũ cùng tồn tại (backward compatibility).
 *   4. HTTP pool dùng chung, tham số không hardcode trong lib.rs.
 *   5. Không file I/O blocking trong handler /metrics.
 *   6. Phiên bản, CHANGELOG, tài liệu và brain page đồng bộ.
 *
 * Chạy: node tools/qa/v871-runtime.js   (không cần jsdom, không gọi mạng)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const MAIN = read('rust-backend/src/main.rs');
const SETTINGS = read('rust-backend/src/config/settings.rs');
const CONCURRENCY = read('rust-backend/src/middleware/concurrency.rs');
const AI = read('rust-backend/src/services/ai_service.rs');
const LIB = read('rust-backend/src/lib.rs');
const METRICS_ROUTE = read('rust-backend/src/routes/metrics.rs');
const PROVIDERS = read('rust-backend/src/providers/mod.rs');
const CARGO = read('rust-backend/Cargo.toml');
const LOCK = read('rust-backend/Cargo.lock');
const ENV = read('rust-backend/.env.example');
const CHANGELOG = read('CHANGELOG.md');

console.log('== 1. Tokio runtime ==');
ok('không còn #[tokio::main]', !/#\[tokio::main\]/.test(MAIN));
ok('dựng multi-thread runtime tường minh', /new_multi_thread\(\)/.test(MAIN));
ok('bật IO + timer bằng enable_all', /\.enable_all\(\)/.test(MAIN));
ok('đọc RUST_WORKER_THREADS', /settings\.worker_threads/.test(MAIN));
ok('log số worker thực tế', /workers = workers/.test(MAIN));
ok('không tạo runtime trong handler', !/Runtime::new|Builder::new_multi_thread/.test(
  read('rust-backend/src/services/ai_service.rs') + METRICS_ROUTE));
ok('không block_on lồng nhau', (MAIN.match(/block_on/g) || []).length === 1);

console.log('== 2. Đồng thời theo provider ==');
ok('Provider::ALL tồn tại', /pub const ALL: \[Provider; 8\]/.test(PROVIDERS));
ok('Concurrency có semaphore theo provider', /providers: HashMap<&'static str, Arc<Semaphore>>/.test(CONCURRENCY));
ok('acquire_provider có hạn chờ', /pub async fn acquire_provider/.test(CONCURRENCY)
  && /tokio::time::timeout\(self\.wait/.test(CONCURRENCY));
ok('run_chain lấy permit provider', /acquire_provider\(candidate\.provider\.as_str\(\)\)/.test(AI));
ok('nhả permit trước backoff', /drop\(provider_permit\)/.test(AI));
ok('provider bão hoà chuyển provider kế tiếp', /đạt giới hạn đồng thời/.test(AI));

console.log('== 3. Cấu hình RUST_* + tương thích ==');
[
  'RUST_WORKER_THREADS',
  'RUST_MAX_CONCURRENT_REQUESTS',
  'RUST_MAX_CONCURRENT_AI_REQUESTS',
  'RUST_MAX_CONCURRENT_PROVIDER_REQUESTS',
  'RUST_REQUEST_TIMEOUT_SECS',
  'RUST_CONNECT_TIMEOUT_SECS',
  'RUST_IDLE_CONNECTION_TIMEOUT_SECS',
  'RUST_POOL_MAX_IDLE_PER_HOST'
].forEach(function (name) {
  ok('settings đọc ' + name, SETTINGS.includes('"' + name + '"'));
});
ok('vẫn đọc tên cũ MAX_CONCURRENCY', /"MAX_CONCURRENCY"/.test(SETTINGS));
ok('vẫn đọc tên cũ AI_MAX_CONCURRENCY', /"AI_MAX_CONCURRENCY"/.test(SETTINGS));
ok('vẫn đọc tên cũ REQUEST_TIMEOUT_MS', /"REQUEST_TIMEOUT_MS"/.test(SETTINGS));
ok('validate giới hạn provider', /RUST_MAX_CONCURRENT_PROVIDER_REQUESTS/.test(SETTINGS));
ok('.env.example có AI_PROVIDER_MAX_CONCURRENCY', /AI_PROVIDER_MAX_CONCURRENCY=/.test(ENV));
ok('.env.example có RUST_POOL_MAX_IDLE_PER_HOST', /RUST_POOL_MAX_IDLE_PER_HOST=/.test(ENV));
ok('.env.example có RUST_IDLE_CONNECTION_TIMEOUT_SECS', /RUST_IDLE_CONNECTION_TIMEOUT_SECS=/.test(ENV));

console.log('== 4. HTTP client / pool ==');
ok('pool idle theo host lấy từ settings', /pool_max_idle_per_host\(settings\.pool_max_idle_per_host\)/.test(LIB));
ok('idle timeout lấy từ settings', /pool_idle_timeout\(settings\.idle_connection_timeout\)/.test(LIB));
ok('không hardcode pool_max_idle_per_host(32)', !/pool_max_idle_per_host\(32\)/.test(LIB));
ok('không hardcode pool_idle_timeout(Duration::from_secs(90))',
  !/pool_idle_timeout\(Duration::from_secs\(90\)\)/.test(LIB));
ok('giữ TCP keep-alive + nodelay', /tcp_keepalive/.test(LIB) && /tcp_nodelay\(true\)/.test(LIB));
ok('Concurrency::new nhận giới hạn provider',
  /settings\.max_provider_concurrency/.test(LIB));

console.log('== 5. Async path không blocking ==');
ok('/metrics render trong spawn_blocking', /tokio::task::spawn_blocking/.test(METRICS_ROUTE));
ok('handler /metrics không tự đọc /proc', !/std::fs::read_to_string/.test(METRICS_ROUTE));
ok('backoff trong async dùng tokio::time::sleep', /tokio::time::sleep\(wait\)/.test(AI));
ok('không std::thread::sleep trong module production', !/std::thread::sleep/.test(
  ['services/ai_service.rs', 'routes/metrics.rs', 'middleware/concurrency.rs', 'lib.rs', 'main.rs']
    .map(function (f) { return read(path.join('rust-backend/src', f)); })
    .join('\n')));
ok('không unsafe trong src', !/\bunsafe\b/.test(
  fs.readdirSync(path.join(ROOT, 'rust-backend/src'), { recursive: true })
    .filter(function (f) { return String(f).endsWith('.rs'); })
    .map(function (f) { return read(path.join('rust-backend/src', String(f))); })
    .join('\n')));
ok('cấp phát trước danh sách attempt', /Vec::with_capacity\(candidates\.len\(\)/.test(AI));

console.log('== 6. Phiên bản & tài liệu ==');
const APP = (read('assets/bakhi/bk-version.js').match(/app:\s*'([^']+)'/) || [])[1];
ok('bk-version.js là 8.7.1', APP === '8.7.1', APP);
ok('Cargo.toml là 8.7.1', /^version = "8\.7\.1"$/m.test(CARGO));
ok('Cargo.lock khớp 8.7.1', /name = "bakhi-backend"\r?\nversion = "8\.7\.1"/.test(LOCK));
ok('CHANGELOG có [8.7.1]', /^## \[8\.7\.1\]/m.test(CHANGELOG));
ok('CHANGELOG nêu Runtime Engine', /Runtime Engine/.test(CHANGELOG));
ok('CHANGELOG không bịa số benchmark', /Chưa có số đo benchmark/.test(CHANGELOG));
ok('README nêu 8.7.1', /8\.7\.1/.test(read('rust-backend/README.md')));
ok('ARCHITECTURE có mục Runtime Engine', /Runtime Engine \(8\.7\.1\)/.test(read('docs/ARCHITECTURE.md')));
ok('tài liệu deploy có RUST_MAX_CONCURRENT_PROVIDER_REQUESTS',
  /RUST_MAX_CONCURRENT_PROVIDER_REQUESTS/.test(read('docs/RUST_DEPLOYMENT_V860.md')));
ok('brain page v871 tồn tại', exists('brain/pages/v871-runtime-engine.md'));
ok('brain index có v871', /v871-runtime-engine/.test(read('brain/index.md')));

if (failures) {
  console.log('\n' + failures + ' check thất bại.');
  process.exit(1);
}
console.log('\n=== ALL CHECKS PASSED ===');

#!/usr/bin/env node
/**
 * Bá Khí 8.6.2 — QA tĩnh cho Observability.
 *
 * Kiểm tra phần NỐI DÂY (không thay thế cargo test):
 *   1. Tab Vận hành có trong dashboard và nạp đúng mô-đun.
 *   2. Dashboard gọi endpoint tổng hợp bằng phiên Founder, KHÔNG mang token metrics.
 *   3. /metrics mặc định tắt và yêu cầu Bearer token ở phía Rust.
 *   4. Có histogram + quantile (p50/p95/p99), không dùng trung bình của trung bình.
 *   5. Tài liệu và cấu hình Prometheus tồn tại.
 *
 * Chạy: node tools/qa/v862-observability.js   (không cần jsdom, không gọi mạng)
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

console.log('== 1. Founder Dashboard ==');
const DEVBOARD = read('assets/bakhi/bk-devboard.js');
ok('có tab Vận hành', /\['observability', 'Vận hành'/.test(DEVBOARD));
ok('tab có mô tả', /observability: '[^']*metrics/i.test(DEVBOARD));
ok('tab trỏ tới renderObservability', /observability: renderObservability/.test(DEVBOARD));
ok('renderObservability gắn BKObservability', /BKObservability\.render/.test(DEVBOARD));
ok('Administrator thường không thấy tab Vận hành', /t\[0\] !== 'observability'/.test(DEVBOARD));

const FOUNDER_HTML = read('founder/index.html');
ok('trang Founder nạp bk-observability.js', /bk-observability\.js\?v=\d/.test(FOUNDER_HTML));
ok('trang Founder nạp bk-observability.css', /bk-observability\.css\?v=\d/.test(FOUNDER_HTML));

console.log('\n== 2. Không lộ token metrics ra trình duyệt ==');
const OBS_JS = read('assets/bakhi/bk-observability.js');
const OBS_CSS = read('assets/bakhi/bk-observability.css');
ok('không nhắc METRICS_TOKEN', !/METRICS_TOKEN/.test(OBS_JS));
ok('gọi endpoint tổng hợp có xác thực', /\/api\/v1\/observability\/summary/.test(OBS_JS));
ok('dùng header x-admin-token (phiên Founder)', /x-admin-token/.test(OBS_JS));
ok('không gọi thẳng /metrics', !/['"`]\/metrics/.test(OBS_JS));
ok('có trạng thái rỗng/lỗi', /is-error/.test(OBS_JS) && /NOT_CONFIGURED/.test(OBS_JS));
ok('CSS dùng token --bk-*', /--bk-surface/.test(OBS_CSS));
ok('CSS có nhánh prefers-reduced-motion', /prefers-reduced-motion/.test(OBS_CSS));

console.log('\n== 3. Backend: /metrics tắt mặc định + Bearer ==');
const METRICS_ROUTE = read('rust-backend/src/routes/metrics.rs');
ok('metrics tắt mặc định trừ khi bật', /metrics_enabled/.test(METRICS_ROUTE));
ok('yêu cầu Bearer token', /strip_prefix\("Bearer "/.test(METRICS_ROUTE));
ok('so sánh token constant-time', /diff \|= x \^ y/.test(METRICS_ROUTE));
const LIB = read('rust-backend/src/lib.rs');
ok('có route gốc /metrics', /\.route\("\/metrics"/.test(LIB));
const SETTINGS = read('rust-backend/src/config/settings.rs');
ok('Metrics mặc định tắt', /metrics_enabled: false/.test(read('rust-backend/src/config/settings.rs')));

console.log('\n== 4. Histogram và quantile ==');
const METRICS = read('rust-backend/src/observability/metrics.rs');
ok('có histogram nhiều bucket', /HTTP_BUCKETS/.test(METRICS) && /AI_BUCKETS/.test(METRICS));
ok('có hàm quantile', /fn quantile\(/.test(METRICS));
ok('có bucket +Inf', /le=\\"\+Inf\\"/.test(METRICS));
ok('có token thật/ước tính tách nhãn', /estimated/.test(METRICS));
ok('có chi phí ước tính', /estimated_cost_usd_total/.test(METRICS));
/* 8.7.4 — TTFT có thật từ streaming. Điều phải giữ: chỉ ghi khi provider trả
   chunk nội dung đầu tiên, không suy diễn cho response trọn gói. */
ok(
  'có TTFT thật (histogram + ghi từ kết quả provider)',
  /time_to_first_token/.test(METRICS) && /record_ai_ttft\(/.test(METRICS)
);
ok(
  'không bịa TTFT cho response trọn gói',
  /ttft: None/.test(read('rust-backend/src/providers/openai.rs')) &&
    /ttft: None/.test(read('rust-backend/src/providers/gemini.rs'))
);
ok(
  'có metrics song song + streaming trong registry',
  /bakhi_parallel_tasks_total/.test(METRICS) && /bakhi_ai_stream_events_total/.test(METRICS)
);

const AI = read('rust-backend/src/services/ai_service.rs');
ok(
  'TTFT chỉ lấy từ kết quả provider (Some)',
  /if let Some\(ttft\) = result\.ttft/.test(AI)
);
ok(
  'không retry/fallback sau khi đã gửi delta',
  /delta_sent\(\)\) == Some\(true\)/.test(AI)
);
ok('AI ghi attempt theo role', /record_ai_attempt\(/.test(AI) && /"primary"/.test(AI));
ok('AI ghi token + fallback', /record_ai_tokens\(/.test(AI) && /record_fallback\("failure"\)/.test(AI));
ok(
  'lượt thất bại sau fallback vẫn tính là fallback',
  /record_ai_request\(fallback_reached, false\)/.test(AI)
);
ok('metrics lượt người dùng ghi trong run_chain', /record_ai_request\(index > 0, true\)/.test(AI));

console.log('\n== 5. Tài liệu & cấu hình ==');
ok('docs/OBSERVABILITY.md tồn tại', exists('docs/OBSERVABILITY.md'));
ok('docs/prometheus.yml tồn tại', exists('docs/prometheus.yml'));
ok('prometheus.yml có job bakhi', /job_name: "bakhi"/.test(read('docs/prometheus.yml')));
ok('có tệp giá mẫu', exists('rust-backend/pricing.example.json'));
ok('CHANGELOG có mục 8.6.2', /## \[8\.6\.2\]/.test(read('CHANGELOG.md')));

console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
process.exit(failures ? 1 : 0);

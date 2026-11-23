#!/usr/bin/env node
'use strict';
/**
 * Bá Khí — Cổng kiểm tra sức khoẻ tiến trình (8.4.4).
 *
 *   node tools/qa/gamification-health.js
 *
 * Phần TĨNH (luôn chạy, không cần mạng):
 *   · Mọi đường ghi `user_progression` phải đi qua hàm có gọi bk_gam_evaluate,
 *     nếu không thành tựu mốc cấp sẽ lệch âm thầm.
 *   · Hàm `bk_gam_health_drift()` tồn tại và bị thu hồi khỏi anon/authenticated.
 *   · Không còn bộ đếm lượt dùng ẩn danh (đã loại bỏ khỏi 8.4.4).
 *
 * Phần TRỰC TIẾP (tuỳ chọn, cần quyền project — KHÔNG đặt token trong repo):
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=wzvs... \
 *     node tools/qa/gamification-health.js
 *   → in số hồ sơ lệch XP/cấp từ `bk_gam_health_drift()`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
let failures = 0;
function ok(name, cond, detail) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const MIG_DIR = path.join(ROOT, 'supabase/migrations');
const migrations = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const allSql = migrations.map((f) => fs.readFileSync(path.join(MIG_DIR, f), 'utf8')).join('\n');
const latest = fs.readFileSync(path.join(MIG_DIR, migrations[migrations.length - 1]), 'utf8');

/* 1. Đường ghi user_progression phải đánh giá lại thành tựu trong cùng hàm. */
/* Hàm bị định nghĩa lại qua nhiều migration: chỉ xét bản CUỐI CÙNG của mỗi tên. */
const lastDef = new Map();
const fnRe = /create or replace function public\.(bk_gam_[a-z_]+)\([\s\S]*?\n\$\$;/g;
let m;
while ((m = fnRe.exec(allSql))) {
  lastDef.set(m[1], m[0]);
}
const writeBlocks = [];
lastDef.forEach((body, name) => {
  if (/update\s+public\.user_progression|insert\s+into\s+public\.user_progression/i.test(body)) {
    writeBlocks.push({ name, body });
  }
});
ok('tìm thấy đường ghi user_progression', writeBlocks.length > 0, String(writeBlocks.length));
/* bk_gam_award không tự gọi bk_gam_evaluate: gamification-api gọi ngay sau khi
   trao XP (rpc bk_gam_award → rpc bk_gam_evaluate). Chấp nhận nếu đường API đó
   thực sự đánh giá lại; nếu không, đây là lỗi thật. */
const apiSrc = fs.readFileSync(path.join(ROOT, 'supabase/functions/gamification-api/index.ts'), 'utf8');
function evaluatedByApi(name) {
  const at = apiSrc.indexOf("rpc('" + name + "'");
  if (at < 0) return false;
  const ev = apiSrc.indexOf("rpc('bk_gam_evaluate'", at);
  return ev > at && ev - at < 2500;
}
const missingEval = writeBlocks
  .filter((b) => !/bk_gam_evaluate/.test(b.body) && !evaluatedByApi(b.name))
  .map((b) => b.name);
ok('mọi đường ghi user_progression đều đánh giá lại thành tựu (trong hàm hoặc ở API)',
  missingEval.length === 0, missingEval.join(', '));

/* 2. Hàm kiểm tra lệch dữ liệu */
/* Hàm có thể được định nghĩa lại qua nhiều migration: xét bản CUỐI CÙNG của
   chính hàm đó, không phải "tệp migration mới nhất". Thêm một migration khác
   (như 8.5.5) không được làm cổng này báo sai. */
const healthFn = lastDef.get('bk_gam_health_drift') || '';
ok('có bk_gam_health_drift()', !!healthFn);
ok('bk_gam_health_drift đối chiếu sổ XP với user_progression',
  /xp_transactions/.test(healthFn) && /total_xp/.test(healthFn));
ok('bk_gam_health_drift chỉ service_role gọi được',
  /revoke all on function public\.bk_gam_health_drift\(\) from public, anon, authenticated;/.test(allSql));
ok('bk_gam_health_drift dùng đúng công thức cấp',
  /public\.bk_gam_level\(p\.total_xp\)/.test(healthFn));

/* 3. Bộ đếm lượt dùng ẩn danh đã được loại bỏ khỏi 8.4.4 */
const clientDir = path.join(ROOT, 'assets/bakhi');
const clientRefs = fs.readdirSync(clientDir)
  .filter((f) => /\.(js|css|html)$/.test(f))
  .filter((f) => /bk-usage|BKUsage|bk_usage_ping|usage_counters|bakhiUsage/.test(
    fs.readFileSync(path.join(clientDir, f), 'utf8')));
ok('không còn tham chiếu bộ đếm lượt dùng trong client', clientRefs.length === 0, clientRefs.join(', '));
ok('không còn tệp assets/bakhi/bk-usage.js', !fs.existsSync(path.join(clientDir, 'bk-usage.js')));
ok('migration không tạo usage_counters / bk_usage_ping',
  !/create table[^;]*public\.usage_counters/i.test(allSql) &&
  !/function public\.bk_usage_ping/i.test(allSql));

/* 4. Tuỳ chọn: kiểm tra trực tiếp trên project */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;
if (!token || !projectId) {
  console.log('  SKIP kiểm tra trực tiếp (thiếu SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID)');
} else {
  const body = JSON.stringify({ query: 'select * from public.bk_gam_health_drift() limit 50' });
  fetch('https://api.supabase.com/v1/projects/' + projectId + '/database/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body
  }).then(async (res) => {
    const text = await res.text();
    if (!res.ok) {
      failures++;
      console.log('  FAIL truy vấn trực tiếp — HTTP ' + res.status + ' ' + text.slice(0, 160));
      return;
    }
    let rows = [];
    try { rows = JSON.parse(text); } catch (e) { }
    ok('không có hồ sơ lệch XP/cấp trên project', Array.isArray(rows) && rows.length === 0,
      JSON.stringify(rows && rows.slice ? rows.slice(0, 3) : rows));
  }).catch((err) => {
    failures++;
    console.log('  FAIL truy vấn trực tiếp — ' + (err && err.message));
  }).finally(() => finish());
}

function finish() {
  console.log('');
  if (failures) {
    console.log('THẤT BẠI: ' + failures + ' kiểm tra không đạt.');
    process.exitCode = 1;
    return;
  }
  console.log('OK — sức khoẻ tiến trình và bộ đếm ẩn danh đạt yêu cầu.');
}

if (!token || !projectId) finish();

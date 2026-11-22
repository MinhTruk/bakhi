'use strict';
/**
 * Kiểm thử THẬT mã Edge Function `ai-tutor-api` ở nhánh admin.test, offline:
 *   - gọi lại provider chính đúng số lần AI_TUTOR_MAX_RETRIES
 *   - chuyển sang provider dự phòng khi lỗi tạm thời
 *   - không gọi lại provider đang cooldown
 *   - trả lỗi khi cả hai provider hỏng
 *   - trần token gửi cho provider theo chế độ (hint = 256)
 *
 * Chạy: node artifacts/fallback-test.js
 * Không gọi mạng ngoài, không cần Supabase, không dùng khoá thật.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
let ts;
try { ts = require('typescript'); } catch (e) {
  console.log('  SKIP cần typescript — npm install typescript@5.6.3 --prefix /tmp/bktest --no-save');
  process.exit(0);
}
const ENV = {};
const STATE = {
  settings: {
    enabled: true, provider: 'groq', model: 'openai/gpt-oss-20b',
    fallback_provider: 'cerebras', fallback_model: 'llama-3.3-70b',
    fallback_enabled: true, routing_enabled: false,
    model_simple: '', model_complex: '', model_practice: '',
    max_context_messages: 10, max_output_tokens: 2048, timeout_ms: 3000,
    daily_requests: 120, daily_tokens: 120000, save_history: true,
    use_lesson_context: true, language: 'vi', allowed_modes: [],
    system_prompt: 'Bạn là trợ lý kiểm thử.', system_prompt_version: 1
  },
  inserts: [], updates: []
};

/* ---------------------------------------------------------- môi trường giả */
globalThis.Deno = {
  env: { get: (k) => ENV[k] },
  serve: (handler) => { globalThis.__HANDLER = handler; }
};

/* ------------------------------------------------- nạp module TS như Node */
Module._extensions['.ts'] = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  module._compile(out, filename);
};

const FAKE = path.join(__dirname, 'fixtures', 'fake-supabase.cjs');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (String(request).indexOf('@supabase/supabase-js') !== -1) return FAKE;
  return origResolve.call(this, request, ...rest);
};
require(FAKE).setState(STATE);

require(path.join(ROOT, 'supabase/functions/ai-tutor-api/index.ts'));
const handler = globalThis.__HANDLER;

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

/* ---------------------------------------------------- provider giả lập HTTP */
const HITS = { primary: [], fallback: [] };
const server = http.createServer((req, res) => {
  const url = req.url || '';
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const side = url.indexOf('/fallback') === 0 ? 'fallback' : 'primary';
    let body = {};
    try { body = JSON.parse(raw); } catch (e) { }
    HITS[side].push(body);

    const respond = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (side === 'primary' && ENV.__PRIMARY_MODE === '429') {
      return respond(429, { error: { message: 'rate limit' } });
    }
    if (side === 'primary' && ENV.__PRIMARY_MODE === '503') {
      return respond(503, { error: { message: 'unavailable' } });
    }
    if (side === 'fallback' && ENV.__FALLBACK_MODE === '503') {
      return respond(503, { error: { message: 'unavailable' } });
    }
    respond(200, {
      model: body.model || 'm',
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 }
    });
  });
});

function callTest(extra) {
  ENV.SUPABASE_URL = 'http://127.0.0.1:1';
  ENV.SUPABASE_SERVICE_ROLE_KEY = 'gia_lap_service_role';
  ENV.AI_TUTOR_API_KEY = ENV.__NO_KEY ? '' : 'gsk_gia_lap';
  ENV.AI_TUTOR_BASE_URL = 'http://127.0.0.1:' + PORT + '/primary';
  ENV.AI_TUTOR_FALLBACK_API_KEY = 'gia_lap_fb';
  ENV.AI_TUTOR_FALLBACK_BASE_URL = 'http://127.0.0.1:' + PORT + '/fallback';
  ENV.AI_TUTOR_MAX_RETRIES = '1';
  Object.assign(STATE.settings, extra || {});
  return handler(new Request('http://local.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'a'.repeat(32) },
    body: JSON.stringify({ action: 'admin.test' })
  })).then((r) => r.json().then((data) => ({ status: r.status, data })));
}

let PORT = 0;
server.listen(0, '127.0.0.1', async () => {
  PORT = server.address().port;

  console.log('== Provider chính thành công ==');
  ENV.__PRIMARY_MODE = 'ok';
  let r = await callTest();
  ok('trả ok:true', r.data.ok === true, JSON.stringify(r.data));
  ok('gọi provider chính đúng 1 lần', HITS.primary.length === 1, String(HITS.primary.length));
  ok('không dùng dự phòng', r.data.data.fellBack === false);
  ok('trần token chế độ hint = 256', HITS.primary[0].max_tokens === 256, String(HITS.primary[0].max_tokens));
  ok('token thật được ghi nhận', r.data.data.estimated === false);

  console.log('== 429 → thử lại rồi chuyển dự phòng ==');
  HITS.primary.length = 0; HITS.fallback.length = 0;
  ENV.__PRIMARY_MODE = '429';
  r = await callTest();
  ok('vẫn trả lời được', r.data.ok === true, JSON.stringify(r.data.error || {}));
  ok('provider chính thử 2 lần (1 + retry)', HITS.primary.length === 2, String(HITS.primary.length));
  ok('dự phòng được gọi đúng 1 lần', HITS.fallback.length === 1, String(HITS.fallback.length));
  ok('báo đã dùng dự phòng', r.data.data.fellBack === true);
  ok('dùng model dự phòng', r.data.data.model === 'llama-3.3-70b', r.data.data.model);
  ok('ngữ cảnh không bị nhân đôi request', HITS.fallback[0].messages.length === 2);

  console.log('== Cooldown 60 giây ==');
  HITS.primary.length = 0; HITS.fallback.length = 0;
  r = await callTest();
  ok('bỏ qua provider đang cooldown', HITS.primary.length === 0, String(HITS.primary.length));
  ok('đi thẳng dự phòng', HITS.fallback.length === 1 && r.data.data.fellBack === true);

  console.log('== Cả hai provider đều lỗi ==');
  HITS.primary.length = 0; HITS.fallback.length = 0;
  ENV.__PRIMARY_MODE = '503'; ENV.__FALLBACK_MODE = '503';
  r = await callTest();
  ok('trả lỗi 502', r.status === 502, String(r.status));
  ok('mã lỗi là PROVIDER_DOWN', r.data.error && r.data.error.code === 'PROVIDER_DOWN',
    r.data.error && r.data.error.code);
  ok('không lộ chi tiết provider', JSON.stringify(r.data).indexOf('unavailable') === -1);

  console.log('== Tắt dự phòng ==');
  HITS.primary.length = 0; HITS.fallback.length = 0;
  ENV.__PRIMARY_MODE = '503'; ENV.__FALLBACK_MODE = 'ok';
  r = await callTest({ fallback_enabled: false });
  ok('tắt công tắc thì không gọi dự phòng', HITS.fallback.length === 0, String(HITS.fallback.length));
  ok('trả lỗi cho người học', r.status === 502);

  console.log('== Lỗi cấu hình không kích hoạt dự phòng ==');
  HITS.primary.length = 0; HITS.fallback.length = 0;
  ENV.__PRIMARY_MODE = 'ok';
  ENV.__NO_KEY = true;
  /* Đổi provider để không dính cooldown 60 giây của lượt lỗi trước. */
  r = await callTest({ provider: 'mistral' });
  ENV.__NO_KEY = false;
  ok('thiếu khoá chính → NO_KEY', r.data.error && r.data.error.code === 'NO_KEY',
    r.data.error && r.data.error.code);
  ok('không gọi dự phòng khi thiếu khoá', HITS.fallback.length === 0);

  console.log('== Trần token theo chế độ khác ==');
  HITS.primary.length = 0;
  ENV.AI_TUTOR_API_KEY = 'gsk_gia_lap';
  ENV.__PRIMARY_MODE = 'ok';
  const budget = require(path.join(ROOT, 'supabase/functions/_shared/ai-prompts.ts'));
  ok('steps = 1024', budget.outputTokensForMode('steps', 'giải bài', 2048).maxTokens === 1024);
  ok('explain = 512', budget.outputTokensForMode('explain', 'giải thích', 2048).maxTokens === 512);

  console.log('');
  console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
  server.close();
  process.exitCode = failures ? 1 : 0;
});

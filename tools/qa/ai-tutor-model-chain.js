'use strict';
/**
 * Kiểm thử THẬT chuỗi nhiều model của `ai-tutor-api` (8.5.4), offline:
 *   - đi lần lượt Primary → Fallback 1 → Fallback 2
 *   - thử lại lỗi tạm thời đúng số lần cấu hình
 *   - ghi nhật ký ai_model_attempts cho từng lần thử
 *   - trả về model đã xử lý thành công
 *   - migration không có cột chứa khoá API
 *
 * Chạy: NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-model-chain.js
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
    fallback_provider: '', fallback_model: '', fallback_enabled: false,
    routing_enabled: false, model_simple: '', model_complex: '', model_practice: '',
    max_context_messages: 10, max_input_tokens: 3000, max_output_tokens: 2048,
    max_retries: 1, timeout_ms: 3000, daily_requests: 120, daily_tokens: 120000,
    save_history: true, use_lesson_context: true, language: 'vi', allowed_modes: [],
    system_prompt: 'Bạn là trợ lý kiểm thử.', system_prompt_version: 1
  },
  routes: [],
  inserts: [], updates: []
};

globalThis.Deno = {
  env: { get: (k) => ENV[k] },
  serve: (handler) => { globalThis.__HANDLER = handler; }
};

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

/* --------------------------------------------- provider giả lập theo model */
const HITS = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw); } catch (e) { }
    HITS.push(body.model);
    const bad = (ENV.__BAD_MODELS || '').split(',').filter(Boolean);
    if (bad.indexOf(body.model) !== -1) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'unavailable' } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      model: body.model,
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 }
    }));
  });
});

let PORT = 0;
function callTest() {
  ENV.SUPABASE_URL = 'http://127.0.0.1:1';
  ENV.SUPABASE_SERVICE_ROLE_KEY = 'gia_lap_service_role';
  ENV.AI_TUTOR_API_KEY = 'gsk_gia_lap';
  ENV.AI_TUTOR_BASE_URL = 'http://127.0.0.1:' + PORT + '/primary';
  ENV.AI_TUTOR_FALLBACK_API_KEY = 'gia_lap_fb';
  ENV.AI_TUTOR_FALLBACK_BASE_URL = 'http://127.0.0.1:' + PORT + '/fallback';
  ENV.AI_TUTOR_MAX_RETRIES = '1';
  return handler(new Request('http://local.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'a'.repeat(32) },
    body: JSON.stringify({ action: 'admin.test' })
  })).then((r) => r.json().then((data) => ({ status: r.status, data })));
}

function route(position, model) {
  return {
    id: '00000000-0000-4000-8000-00000000000' + position,
    position, label: position === 0 ? 'Primary' : 'Fallback ' + position,
    provider: 'groq', model, key_ref: '', enabled: true
  };
}

server.listen(0, '127.0.0.1', async () => {
  PORT = server.address().port;

  console.log('== Chuỗi 3 model: Primary lỗi, Fallback 1 lỗi, Fallback 2 OK ==');
  STATE.routes = [route(0, 'model-a'), route(1, 'model-b'), route(2, 'model-c')];
  ENV.__BAD_MODELS = 'model-a,model-b';
  STATE.inserts.length = 0;
  let r = await callTest();
  ok('trả lời được nhờ model thứ ba', r.data.ok === true, JSON.stringify(r.data.error || {}));
  ok('dùng đúng model thành công', r.data.data.model === 'model-c', r.data.data.model);
  ok('báo đã dùng dự phòng', r.data.data.fellBack === true);
  ok('thứ tự gọi đúng chuỗi và có thử lại',
    HITS.join(',') === 'model-a,model-a,model-b,model-b,model-c', HITS.join(','));

  const attempts = STATE.inserts.filter((i) => i.table === 'ai_model_attempts');
  ok('ghi nhật ký từng lần thử model', attempts.length === 1 &&
    Array.isArray(attempts[0].row) && attempts[0].row.length === 5,
    String(attempts[0] && attempts[0].row && attempts[0].row.length));
  ok('nhật ký ghi đúng model cuối cùng thành công',
    attempts.length === 1 && attempts[0].row[4].model === 'model-c');

  console.log('== Model bị tắt không được gọi ==');
  /* Dùng tên model mới để không dính cooldown 60 giây của lượt trước. */
  STATE.routes = [route(0, 'model-x'), Object.assign(route(1, 'model-y'), { enabled: false })];
  ENV.__BAD_MODELS = '';
  HITS.length = 0;
  STATE.inserts.length = 0;
  r = await callTest();
  ok('chỉ gọi model đang bật', r.data.ok === true && HITS.join(',') === 'model-x', HITS.join(','));

  console.log('== Migration: không có cột chứa khoá, có RLS ==');
  const sql = fs.readFileSync(path.join(ROOT,
    'supabase/migrations/20261220000000_bakhi_v854_ai_model_routes.sql'), 'utf8');
  ok('có bảng ai_model_routes', /create table if not exists public\.ai_model_routes/.test(sql));
  ok('có bảng ai_model_attempts', /create table if not exists public\.ai_model_attempts/.test(sql));
  ok('không có cột khoá API',
    !/(api_key|apikey|secret|token)\s+(text|uuid)/i.test(sql));
  ok('chỉ lưu TÊN secret', /key_ref\s+text/.test(sql));
  ok('bật RLS cho cả hai bảng',
    (sql.match(/enable row level security/g) || []).length === 2);
  ok('không tạo policy nào cho bảng mới', !/create policy/i.test(sql));
  ok('thu hồi quyền anon/authenticated',
    (sql.match(/revoke all on public\.ai_model_routes from anon, authenticated/g) || []).length === 1);

  console.log('== Provider adapter nhận keyRef (không nhận khoá từ client) ==');
  const providers = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/ai-providers.ts'), 'utf8');
  ok('adapter hỗ trợ keyRef', /keyRef/.test(providers) && /Deno\.env\.get\(ref\)/.test(providers));
  const api = fs.readFileSync(path.join(ROOT, 'supabase/functions/ai-tutor-api/index.ts'), 'utf8');
  ok('máy chủ không nhận apiKey từ client', !/body\.apiKey/.test(api));
  ok('lỗi trả học sinh đi qua safeErrorDetail', /safeErrorDetail/.test(api));

  console.log('');
  console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
  server.close();
  process.exitCode = failures ? 1 : 0;
});

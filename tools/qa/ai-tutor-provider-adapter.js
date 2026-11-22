'use strict';
/**
 * Kiểm thử lớp adapter AI bằng máy chủ giả lập cục bộ (không gọi mạng ngoài).
 *
 *   node artifacts/provider-adapter-test.js
 *
 * Phủ: khoá sai (401) · model không tồn tại (404) · 429 · 5xx · timeout ·
 *       phản hồi rỗng · usage thật vs ước lượng · không lộ khoá trong lỗi.
 * KHÔNG phủ: kết nối Groq/Google thật (cần khoá trong Supabase Secrets).
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
globalThis.Deno = { env: { get: (k) => ENV[k] } };

function loadTs(rel) {
  const file = path.join(ROOT, rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(out, file);
  return m.exports;
}

const V = loadTs('supabase/functions/_shared/ai-providers.ts');
const KEY = 'gsk_GIA_LAP_KHONG_PHAI_KHOA_THAT_000000';

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const server = http.createServer((req, res) => {
  const url = req.url || '';
  const auth = req.headers.authorization || '';
  const send = (status, body, delay) => {
    const go = () => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    delay ? setTimeout(go, delay) : go();
  };

  if (req.method === 'GET' && url.endsWith('/models')) {
    return send(200, { data: [{ id: 'openai/gpt-oss-20b' }, { id: 'llama-3.1-8b-instant' }] });
  }
  if (url.indexOf('/bad-key') !== -1) return send(401, { error: { message: 'Invalid API Key: ' + auth } });
  if (url.indexOf('/missing-model') !== -1) return send(404, { error: { message: 'model not found' } });
  if (url.indexOf('/rate') !== -1) return send(429, { error: { message: 'Rate limit reached' } });
  if (url.indexOf('/down') !== -1) return send(503, { error: { message: 'service unavailable' } });
  if (url.indexOf('/slow') !== -1) return; // không bao giờ trả lời → timeout
  if (url.indexOf('/empty') !== -1) return send(200, { choices: [{ message: { content: '' } }] });
  if (url.indexOf('/nousage') !== -1) {
    return send(200, { model: 'm1', choices: [{ message: { content: 'Chào bạn' }, finish_reason: 'stop' }] });
  }
  return send(200, {
    model: 'm1',
    choices: [{ message: { content: 'Chào bạn, cùng học nhé.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
  });
});

function call(base, opts) {
  ENV.AI_TUTOR_API_KEY = KEY;
  ENV.AI_TUTOR_BASE_URL = base;
  return V.callProvider({
    provider: 'custom',
    model: 'openai/gpt-oss-20b',
    role: 'primary',
    system: 'system',
    messages: [{ role: 'user', content: 'xin chào' }],
    maxTokens: 64,
    timeoutMs: (opts && opts.timeoutMs) || 3000
  });
}

function expectCode(name, base, code, opts) {
  return call(base, opts).then(
    (r) => ok(name, false, 'không ném lỗi, trả: ' + r.text),
    (e) => {
      ok(name + ' → ' + code, e instanceof V.ProviderError && e.code === code, e.code + ' / ' + e.message);
      ok(name + ': không lộ khoá trong lỗi',
        String(e.message || '').indexOf(KEY) === -1 && String(e.detail || '').indexOf(KEY) === -1);
    }
  );
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const base = (p) => 'http://127.0.0.1:' + port + p;

  console.log('== Lỗi nhà cung cấp (máy chủ giả lập) ==');
  await expectCode('khoá không hợp lệ (401)', base('/bad-key'), 'AUTH');
  await expectCode('model không tồn tại (404)', base('/missing-model'), 'MODEL_NOT_FOUND');
  await expectCode('giới hạn tần suất (429)', base('/rate'), 'RATE_LIMIT');
  await expectCode('nhà cung cấp lỗi (503)', base('/down'), 'PROVIDER_DOWN');
  await expectCode('phản hồi rỗng', base('/empty'), 'EMPTY_RESPONSE');
  await expectCode('quá thời gian chờ', base('/slow'), 'TIMEOUT', { timeoutMs: 700 });

  console.log('== Phân loại lỗi có thể thử lại ==');
  ok('429 được coi là tạm thời', new V.ProviderError('RATE_LIMIT', 'x').retryable === true);
  ok('503 được coi là tạm thời', new V.ProviderError('PROVIDER_DOWN', 'x').retryable === true);
  ok('timeout được coi là tạm thời', new V.ProviderError('TIMEOUT', 'x').retryable === true);
  ok('401 KHÔNG thử lại và không đổi provider', new V.ProviderError('AUTH', 'x').retryable === false);
  ok('404 KHÔNG thử lại', new V.ProviderError('MODEL_NOT_FOUND', 'x').retryable === false);
  ok('BAD_CONFIG KHÔNG thử lại', new V.ProviderError('BAD_CONFIG', 'x').retryable === false);

  console.log('== Token usage ==');
  try {
    const r = await call(base('/ok'));
    ok('đọc đúng nội dung', r.text.indexOf('cùng học') !== -1, r.text);
    ok('provider/model trả về', r.provider === 'custom' && r.model === 'm1');
    ok('token thật từ usage', r.usage.input === 7 && r.usage.output === 5 && r.usage.total === 12,
      JSON.stringify(r.usage));
    ok('đánh dấu token KHÔNG ước lượng', r.usage.estimated === false);
    ok('không phải mock', r.mock === false);
  } catch (e) {
    ok('lượt gọi thành công', false, e.code || e.message);
  }

  try {
    const r = await call(base('/nousage'));
    ok('không có usage → ước lượng', r.usage.estimated === true);
    ok('ước lượng vẫn dương', r.usage.input > 0 && r.usage.output > 0);
  } catch (e) {
    ok('lượt gọi không usage', false, e.code || e.message);
  }

  console.log('== Danh sách model ==');
  ENV.AI_TUTOR_API_KEY = KEY;
  const custom = await V.listProviderModels({ provider: 'custom', role: 'primary' });
  ok('custom không hỗ trợ liệt kê → null', custom === null);
  ENV.AI_TUTOR_BASE_URL = base('');
  ENV.AI_TUTOR_PROVIDER = 'groq';
  const groqLike = await V.listProviderModels({ provider: 'groq', role: 'primary' });
  ok('đọc được danh sách model qua /models', groqLike && groqLike.models.indexOf('openai/gpt-oss-20b') !== -1,
    groqLike && groqLike.models.join(','));

  console.log('== Không có khoá ==');
  ENV.AI_TUTOR_API_KEY = '';
  ENV.AI_TUTOR_BASE_URL = base('/ok');
  try {
    await V.callProvider({
      provider: 'custom', model: 'm1', role: 'primary', system: 's',
      messages: [{ role: 'user', content: 'x' }], maxTokens: 8, timeoutMs: 1000
    });
    ok('thiếu khoá phải báo NO_KEY', false);
  } catch (e) {
    ok('thiếu khoá → NO_KEY', e.code === 'NO_KEY', e.code);
  }

  console.log('');
  console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
  server.close();
  process.exitCode = failures ? 1 : 0;
});

#!/usr/bin/env node
/* ===========================================================================
   Bá Khí — rust-backend/bench/run.mjs

   Benchmark tái lập được cho backend Rust. Không gọi mạng ngoài, không cần
   khoá thật: một máy chủ giả lập đóng vai Supabase + AI provider.

   Cách chạy (từ thư mục gốc repo):
     cargo build --release --manifest-path rust-backend/Cargo.toml
     node rust-backend/bench/run.mjs

   Kết quả: in bảng p50/p95/p99 + throughput, ghi rust-backend/bench/results.json.
   =========================================================================== */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BIN = path.join(ROOT, 'target', 'release', 'bakhi-backend');
const TOKEN = 'bench-token-abcdefghijklmnop';
const PORT = 8099;

if (!existsSync(BIN)) {
  console.error('Chưa có binary release. Chạy: cargo build --release');
  process.exit(1);
}

/* ---------------------------------------------------------------- mock ---- */
const STATS = { requests: 0, chatCalls: 0 };

const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    STATS.requests += 1;
    const send = (status, payload) => {
      const text = JSON.stringify(payload);
      res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };
    const url = req.url || '';

    if (url.startsWith('/auth/v1/user')) {
      if (req.headers.authorization === 'Bearer ' + TOKEN) return send(200, { id: '11111111-2222-3333-4444-555555555555', email: 'bench@example.com' });
      return send(401, { msg: 'invalid' });
    }
    if (url.startsWith('/auth/v1/health')) return send(200, {});
    if (url.startsWith('/rest/v1/students')) return send(200, [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }]);
    if (url.startsWith('/rest/v1/ai_settings')) {
      return send(200, [{
        enabled: true, provider: 'groq', model: 'bench-model',
        fallback_provider: '', fallback_model: '', routing_enabled: false,
        max_context_messages: 10, max_output_tokens: 512, timeout_ms: 5000,
        daily_requests: 0, daily_tokens: 0, save_history: true,
        use_lesson_context: true, language: 'vi',
        allowed_modes: ['explain', 'steps', 'hint', 'check', 'practice', 'mistakes', 'summary', 'socratic'],
        system_prompt: '', max_input_tokens: 3000
      }]);
    }
    if (url.startsWith('/rest/v1/ai_model_routes')) {
      return send(200, [{ position: 0, label: 'Primary', provider: 'groq', model: 'bench-model', key_ref: '', enabled: true }]);
    }
    if (url.startsWith('/rest/v1/ai_usage_logs')) return send(200, []);
    if (url.startsWith('/rest/v1/ai_messages') && req.method === 'POST') {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
      return send(201, [{
        id: 'msg-' + STATS.requests,
        role: parsed.role || 'user',
        content: parsed.content || '',
        created_at: '2026-11-23T10:00:00Z'
      }]);
    }
    if (url.startsWith('/rest/v1/ai_messages')) return send(200, []);
    if (url.startsWith('/rest/v1/ai_conversations') && req.method === 'POST') {
      return send(201, [{ id: '99999999-8888-7777-6666-555555555555', title: 'Bench', message_count: 0 }]);
    }
    if (url.startsWith('/rest/v1/ai_conversations') && req.method === 'PATCH') { res.writeHead(204); return res.end(); }
    if (url.startsWith('/v1/chat/completions')) {
      STATS.chatCalls += 1;
      return send(200, {
        model: 'bench-model',
        choices: [{ message: { role: 'assistant', content: 'Câu trả lời benchmark.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
      });
    }
    send(404, { error: 'unmocked: ' + url });
  });
});

/* ------------------------------------------------------------- harness ---- */
const payload = buildPayload();

function buildPayload() {
  const subjects = ['toan', 'ly', 'hoa', 'sinh', 'van', 'su', 'dia', 'anh'];
  const progress = [];
  for (let i = 0; i < 400; i++) {
    progress.push({
      subject: subjects[i % subjects.length],
      topic: 'chu-de-' + (i % 40),
      correct: 3 + (i % 8),
      total: 10,
      last_at: '2026-11-20T09:00:00Z'
    });
  }
  const review = [];
  for (let i = 0; i < 150; i++) {
    review.push({ subject: subjects[i % subjects.length], topic: 'chu-de-' + (i % 40), wrong: 1 + (i % 3), last_at: '2026-11-19T09:00:00Z' });
  }
  const sessions = [];
  for (let i = 0; i < 120; i++) {
    const day = new Date(Date.UTC(2026, 7, 1) + i * 86400000).toISOString().slice(0, 10);
    sessions.push({ started_at: day + 'T09:00:00Z', minutes: 20 + (i % 40), questions: 10 + (i % 20), correct: 6 + (i % 12) });
  }
  return JSON.stringify({ progress, review, sessions });
}

/* Không dùng keep-alive ở client đo: một kết nối mới cho mỗi request, và thử
   lại một lần nếu socket bị đóng giữa chừng. Nhờ vậy số đo không phụ thuộc
   vào việc tái dùng kết nối của Node. */
const agent = new http.Agent({ keepAlive: false });

function requestOnce(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(body) : null;
    const headers = { accept: 'application/json' };
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = data.length; }
    if (token) headers.authorization = 'Bearer ' + token;
    const started = process.hrtime.bigint();
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers, agent }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({ status: res.statusCode, ms, text });
      });
    });
    req.setTimeout(30000, () => { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function request(port, method, urlPath, body, token) {
  try {
    return await requestOnce(port, method, urlPath, body, token);
  } catch (error) {
    if (error && (error.code === 'EPIPE' || error.code === 'ECONNRESET')) {
      return requestOnce(port, method, urlPath, body, token);
    }
    return { status: 599, ms: 0, text: String(error && error.message) };
  }
}

async function waitReady(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await request(port, 'GET', '/api/v1/health');
      if (res.status === 200) return true;
    } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function scenario(port, { name, method, path: urlPath, body = null, token = null, total, concurrency }) {
  const latencies = [];
  let failures = 0;
  let issued = 0;
  const started = process.hrtime.bigint();

  async function worker() {
    while (issued < total) {
      issued += 1;
      const res = await request(port, method, urlPath, body, token);
      if (res.status >= 400) failures += 1;
      latencies.push(res.ms);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  latencies.sort((a, b) => a - b);

  const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];
  return {
    name,
    requests: total,
    concurrency,
    failures,
    throughput_rps: Math.round(total / seconds),
    p50_ms: round(at(0.5)),
    p95_ms: round(at(0.95)),
    p99_ms: round(at(0.99)),
    mean_ms: round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function readProc(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const rss = /VmRSS:\s+(\d+) kB/.exec(status);
    const ticks = stat.split(') ')[1].split(' ');
    const utime = Number(ticks[11]);
    const stime = Number(ticks[12]);
    return { rssKb: rss ? Number(rss[1]) : 0, cpuTicks: utime + stime };
  } catch {
    return { rssKb: 0, cpuTicks: 0 };
  }
}

/* JS baseline cho cùng phép tổng hợp (không HTTP, là cận dưới của JS). */
function jsBaseline(iterations) {
  const data = JSON.parse(payload);
  const started = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < iterations; i++) {
    const bySubject = new Map();
    let questions = 0;
    let correct = 0;
    for (const row of data.progress) {
      questions += row.total;
      correct += Math.min(row.correct, row.total);
      const entry = bySubject.get(row.subject) || { q: 0, c: 0 };
      entry.q += row.total;
      entry.c += Math.min(row.correct, row.total);
      bySubject.set(row.subject, entry);
    }
    const weeks = new Map();
    for (const session of data.sessions) {
      const day = new Date(session.started_at);
      const thursday = new Date(day.getTime());
      const weekday = (day.getUTCDay() + 6) % 7;
      thursday.setUTCDate(day.getUTCDate() - weekday + 3);
      const key = thursday.toISOString().slice(0, 10);
      const entry = weeks.get(key) || { q: 0, c: 0 };
      entry.q += session.questions;
      entry.c += Math.min(session.correct, session.questions);
      weeks.set(key, entry);
    }
    sink += questions + correct + bySubject.size + weeks.size;
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { iterations, totalMs: round(ms), perCallMs: round(ms / iterations), sink };
}

/* ------------------------------------------------------------------ main -- */
/* Cổng phải trống: nếu một tiến trình cũ còn giữ 8099, số đo sẽ sai. */
const portFree = await new Promise((resolve) => {
  const probe = http.get({ host: '127.0.0.1', port: PORT, path: '/api/v1/health', agent: false }, (res) => {
    res.resume();
    resolve(false);
  });
  probe.on('error', () => resolve(true));
  probe.setTimeout(1000, () => { probe.destroy(); resolve(true); });
});
if (!portFree) {
  console.error(`Cổng ${PORT} đang bận. Dừng tiến trình cũ (ss -ltnp | grep ${PORT}) rồi chạy lại.`);
  process.exit(1);
}

await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const mockPort = mock.address().port;

const child = spawn(BIN, {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(PORT),
    SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
    SUPABASE_PUBLISHABLE_KEY: 'bench-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'bench-service',
    AI_TUTOR_API_KEY: 'bench-provider-key',
    AI_TUTOR_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
    AI_PERSIST_CONVERSATIONS: 'true',
    /* Đo hiệu năng đường nóng, không đo bộ giới hạn tần suất: đặt trần rất cao.
       Thử nghiệm riêng cho rate limit nằm trong tests/integration.rs. */
    RATE_LIMIT_PER_MIN: '1000000',
    AI_RATE_LIMIT_PER_MIN: '1000000',
    RUST_LOG: 'error'
  },
  stdio: ['ignore', 'inherit', 'inherit']
});

let childExited = false;
child.on('exit', (code) => { childExited = true; console.error(`backend thoát sớm (code=${code})`); });

const ready = await waitReady(PORT);
if (childExited) { mock.close(); process.exit(1); }
if (!ready) {
  console.error('Backend không khởi động được.');
  child.kill('SIGTERM');
  mock.close();
  process.exit(1);
}

const before = readProc(child.pid);

console.log('scenario: health');
const health = await scenario(PORT, { name: 'GET /api/v1/health', method: 'GET', path: '/api/v1/health', total: 4000, concurrency: 32 });
console.log('scenario: learning-stats');
const stats = await scenario(PORT, { name: 'POST /api/v1/data/learning-stats', method: 'POST', path: '/api/v1/data/learning-stats', body: payload, token: TOKEN, total: 2000, concurrency: 16 });
console.log('scenario: me');
const me = await scenario(PORT, { name: 'GET /api/v1/me', method: 'GET', path: '/api/v1/me', token: TOKEN, total: 1500, concurrency: 16 });
console.log('scenario: ai/chat');
const chat = await scenario(PORT, { name: 'POST /api/v1/ai/chat', method: 'POST', path: '/api/v1/ai/chat', body: JSON.stringify({ message: 'Giải thích định lý Pi-ta-go', mode: 'explain' }), token: TOKEN, total: 600, concurrency: 8 });

const after = readProc(child.pid);
const cpuSeconds = ((after.cpuTicks - before.cpuTicks) / 100) ;
const baseline = jsBaseline(500);

const results = {
  generatedAt: new Date().toISOString(),
  environment: {
    runtime: process.version,
    platform: process.platform,
    cpuCount: (await import('node:os')).cpus().length,
    backendVersion: '8.6.0',
    mode: 'release build, local, mock Supabase + mock AI provider'
  },
  scenarios: [health, stats, me, chat],
  resources: {
    rssKb: after.rssKb,
    cpuSecondsDuringScenarios: round(cpuSeconds)
  },
  jsBaselineAggregation: baseline,
  notes: [
    'Máy chủ Supabase và AI provider đều là giả lập cục bộ: số đo phản ánh chi phí của backend Rust, không phải độ trễ thật của Supabase/provider.',
    'jsBaselineAggregation chạy trong cùng tiến trình Node, không qua HTTP — là cận dưới của JavaScript.',
    'Chat đo toàn bộ đường đi: xác thực, đọc cấu hình, ghi hội thoại/tin nhắn/usage qua REST giả lập, gọi provider giả lập.'
  ]
};

writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 2) + '\n');

console.log('\n=== KẾT QUẢ BENCHMARK (mock dependencies) ===');
for (const row of results.scenarios) {
  console.log(`${row.name}\n  requests=${row.requests} concurrency=${row.concurrency} failures=${row.failures}  rps=${row.throughput_rps}  p50=${row.p50_ms}ms p95=${row.p95_ms}ms p99=${row.p99_ms}ms mean=${row.mean_ms}ms`);
}
console.log(`\nRSS: ${Math.round(after.rssKb / 1024)} MiB · CPU: ${results.resources.cpuSecondsDuringScenarios}s cho toàn bộ scenario`);
console.log(`JS baseline (tổng hợp ${baseline.iterations} lần): ${baseline.perCallMs} ms/lần (không HTTP)`);
console.log('\nĐã ghi rust-backend/bench/results.json');

child.kill('SIGTERM');
mock.close();
setTimeout(() => process.exit(0), 200);

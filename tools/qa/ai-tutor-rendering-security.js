'use strict';
/**
 * Bá Khí — QA an toàn hiển thị của AI Tutor (8.5.0).
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-rendering-security.js
 *
 * Câu trả lời của AI là dữ liệu KHÔNG ĐÁNG TIN. Kiểm tra:
 *   - thẻ <script>/<iframe>/<img onerror> trong câu trả lời không tạo phần tử thật
 *   - liên kết javascript: bị loại bỏ
 *   - code block chỉ hiển thị dạng văn bản
 *   - công thức $...$ đi qua KaTeX với trust:false (hoặc fallback văn bản)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function until(fn, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await wait(20);
  }
  return null;
}

const PAYLOAD = [
  '<script>window.__pwned = 1;<\/script>',
  '',
  '<img src=x onerror="window.__pwned = 2">',
  '',
  '[bấm vào đây](javascript:window.__pwned=3)',
  '',
  '<iframe src="javascript:window.__pwned=4"></iframe>',
  '',
  'Đoạn mã trong khối:',
  '',
  '```html',
  '<b>đậm</b>',
  '```',
  '',
  'Công thức giữa dòng $x^2 + 1$ và khối:',
  '',
  '$$',
  'E = mc^2',
  '$$'
].join('\n');

function boot() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/assets/bakhi/bk-core.css"></head>' +
    '<body><div id="bkai"></div></body></html>',
    { url: 'https://minhtruk.github.io/bakhi/ai-tutor/', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  w.BK_SUPABASE = { url: 'https://demo.supabase.co', key: 'sb_publishable_test', functions: { aiTutor: 'ai-tutor-api' } };
  w.BK = { ui: { toast: () => { }, confirm: () => Promise.resolve(true) } };
  w.BKCloud = {
    configured: () => true,
    chatClient: () => Promise.resolve({
      auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) }
    })
  };
  w.fetch = function (url, opts) {
    const body = JSON.parse((opts && opts.body) || '{}');
    let data = {};
    if (body.action === 'bootstrap') {
      data = {
        config: {
          enabled: true, connected: true, mock: false,
          modes: [{ id: 'explain', label: 'Giải thích', hint: 'h' }],
          limits: { dailyRequests: 0, dailyTokens: 0 }, usage: { requests: 0, tokens: 0 }
        },
        conversations: []
      };
    } else if (body.action === 'chat') {
      data = {
        conversation: { id: 'c1', title: 'XSS', mode: 'explain', message_count: 2 },
        user_message: { id: 'u1', role: 'user', content: body.message },
        message: { id: 'a1', role: 'assistant', content: PAYLOAD, model: 'test' },
        meta: { provider: 'google', model: 'test', usage: { requests: 1 }, limits: { dailyRequests: 0 } }
      };
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data }) });
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-ai-tutor.js'), 'utf8'));
  return { dom, w };
}

async function run() {
  const { dom, w } = boot();
  const doc = w.document;
  w.BKAITutor.mount(doc.getElementById('bkai'), {});
  await until(() => doc.getElementById('bkaiInput'));

  const input = doc.getElementById('bkaiInput');
  input.value = 'Thử nội dung nguy hiểm';
  doc.getElementById('bkaiComposer').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  const body = await until(() => doc.querySelector('.bkai-msg.is-assistant .bkai-msg-body'));
  ok('câu trả lời được render', !!body);

  const thread = doc.getElementById('bkaiThread');
  ok('không tạo phần tử <script> từ câu trả lời', thread.querySelectorAll('script').length === 0);
  ok('không tạo <iframe>', thread.querySelectorAll('iframe').length === 0);
  ok('không tạo <img> từ thẻ lạ', thread.querySelectorAll('img').length === 0);
  ok('không chạy mã trong câu trả lời', w.__pwned === undefined, String(w.__pwned));

  const badLinks = Array.from(thread.querySelectorAll('a')).filter((a) =>
    /^javascript:/i.test(String(a.getAttribute('href') || '')));
  ok('loại bỏ liên kết javascript:', badLinks.length === 0, String(badLinks.length));
  ok('văn bản thẻ được hiển thị nguyên dạng, không thực thi',
    thread.textContent.indexOf('<script>') !== -1);
  ok('không còn sự kiện onerror trên phần tử nào',
    Array.from(thread.querySelectorAll('*')).every((n) => !n.getAttribute('onerror')));

  ok('công thức giữa dòng được tách thành .bkai-math',
    thread.querySelectorAll('.bkai-math').length >= 1);
  ok('công thức khối dùng khối riêng', !!thread.querySelector('.bkai-math-block'));
  ok('không nạp KaTeX thì công thức vẫn đọc được dạng văn bản',
    /x\^2/.test(thread.textContent) || !!thread.querySelector('.katex'));

  ok('khối code không tạo phần tử <b>', thread.querySelectorAll('.bkai-code b').length === 0);
  ok('khối code giữ nguyên nội dung dạng văn bản',
    !!thread.querySelector('.bkai-code pre') &&
    /<b>đậm<\/b>/.test(thread.querySelector('.bkai-code pre').textContent));

  dom.window.close();
  console.log('');
  console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
  process.exitCode = failures ? 1 : 0;
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

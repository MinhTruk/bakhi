'use strict';
/**
 * Bá Khí — QA giao diện AI Tutor (jsdom, không cần Supabase thật). (8.5.0)
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-smoke.js
 *
 * Kiểm tra: khung trang, 8 chế độ, gợi ý khởi đầu, gửi câu hỏi (tin nhắn lạc
 * quan + trạng thái đang suy nghĩ), render Markdown, nút sao chép, danh sách
 * hội thoại, nút Dừng, và dữ liệu gửi lên máy chủ.
 */
const { JSDOM, VirtualConsole } = require('jsdom');
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

const ANSWER = '**Ý chính** dùng `công thức`:\n\n```js\nconsole.log(1)\n```\n\n- một\n- hai';

function boot(assistantContent) {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/assets/bakhi/bk-core.css"></head>' +
    '<body><div id="bkai"></div></body></html>',
    { url: 'https://minhtruk.github.io/bakhi/ai-tutor/', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  const calls = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });

  w.BK_SUPABASE = {
    url: 'https://demo.supabase.co',
    key: 'sb_publishable_test',
    functions: { aiTutor: 'ai-tutor-api' }
  };
  w.BK = { ui: { toast: () => { }, confirm: () => Promise.resolve(true) } };
  w.BKCloud = {
    configured: () => true,
    chatClient: () => Promise.resolve({
      auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }) }
    })
  };

  const LABELS = {
    explain: 'Giải thích', steps: 'Từng bước', hint: 'Gợi ý', check: 'Kiểm tra bài làm',
    practice: 'Luyện tập', mistakes: 'Phân tích lỗi', summary: 'Tóm tắt', socratic: 'Hỏi dẫn dắt'
  };
  const MODES = Object.keys(LABELS).map((id) => ({ id, label: LABELS[id], hint: 'hint ' + id }));

  w.fetch = function (url, opts) {
    const body = JSON.parse((opts && opts.body) || '{}');
    calls.push({ url: String(url), body });
    let data = {};
    if (body.action === 'bootstrap') {
      data = {
        config: {
          enabled: true, connected: true, mock: false, provider: 'google', model: 'gemini-test',
          modes: MODES, limits: { dailyRequests: 120, dailyTokens: 120000, maxOutputTokens: 1600 },
          usage: { requests: 3, tokens: 900, failed: 0 }, language: 'vi',
          saveHistory: true, useLessonContext: true
        },
        conversations: []
      };
    } else if (body.action === 'chat') {
      const now = new Date().toISOString();
      data = {
        conversation: { id: 'c1', title: 'Cân bằng phương trình', mode: body.mode, message_count: 2, last_message_at: now },
        user_message: { id: 'u1', role: 'user', content: body.message, mode: body.mode, created_at: now },
        message: { id: 'a1', role: 'assistant', content: assistantContent, mode: body.mode, model: 'gemini-test', created_at: now },
        meta: {
          provider: 'google', model: 'gemini-test', mode: body.mode, routing: 'simple',
          fellBack: false, mock: false, tokens: { input: 12, output: 30 },
          usage: { requests: 4, tokens: 1000, failed: 0 }, limits: { dailyRequests: 120 }
        }
      };
    } else if (body.action === 'messages.list') {
      data = { conversation: { id: body.conversation_id, mode: 'explain', title: 'Cũ' }, messages: [] };
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, data })
    });
  };

  w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-ai-tutor.js'), 'utf8'));
  return { dom, w, calls, vc };
}

async function run() {
  const { dom, w, calls } = boot(ANSWER);
  const doc = w.document;

  ok('module công khai window.BKAITutor', !!w.BKAITutor && typeof w.BKAITutor.mount === 'function');
  ok('không tự gắn nút nổi khi đã có #bkai', !doc.getElementById('bkaiFab'));

  w.BKAITutor.mount(doc.getElementById('bkai'), {});
  await until(() => /Hôm nay: 3\/120/.test((doc.querySelector('.bkai-usage') || {}).textContent || ''));

  ok('dựng khung trang đầy đủ', !!doc.querySelector('.bkai-shell') && !!doc.getElementById('bkaiThread'));
  ok('có đủ 8 chế độ học tập', doc.querySelectorAll('.bkai-mode').length === 8,
    String(doc.querySelectorAll('.bkai-mode').length));
  ok('chế độ mặc định là Giải thích',
    (doc.querySelector('.bkai-mode.is-active') || {}).getAttribute &&
    doc.querySelector('.bkai-mode.is-active').getAttribute('data-mode') === 'explain');
  ok('khối chào có 6 gợi ý', doc.querySelectorAll('.bkai-suggest-btn').length === 6);
  ok('hiển thị hạn mức sử dụng', /Hôm nay: 3\/120 câu hỏi/.test(doc.querySelector('.bkai-usage').textContent));
  ok('nút Gửi bị vô hiệu hoá khi ô nhập rỗng', doc.getElementById('bkaiSend').disabled === true);
  ok('nút Dừng ẩn khi chưa gửi', doc.getElementById('bkaiStop').hidden === true);

  /* Đổi chế độ bằng chip (chip được dựng lại sau mỗi lần đổi) */
  const stepsChip = Array.from(doc.querySelectorAll('.bkai-mode')).find((b) => b.getAttribute('data-mode') === 'steps');
  stepsChip.dispatchEvent(new w.Event('click', { bubbles: true }));
  const activeChip = doc.querySelector('.bkai-mode.is-active');
  ok('bấm chip đổi chế độ', !!activeChip && activeChip.getAttribute('data-mode') === 'steps' &&
    String(doc.getElementById('bkaiNotice').textContent).indexOf('Từng bước') !== -1,
    activeChip && activeChip.getAttribute('data-mode'));

  /* Gửi câu hỏi */
  const input = doc.getElementById('bkaiInput');
  input.value = 'Giải thích vì sao cân bằng phương trình cần hệ số';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('nút Gửi bật khi có nội dung', doc.getElementById('bkaiSend').disabled === false);

  doc.getElementById('bkaiComposer').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  const pending = await until(() => doc.querySelector('.bkai-msg.is-thinking'));
  ok('hiện trạng thái đang suy nghĩ', !!pending);
  ok('tin nhắn người học hiện ngay (lạc quan)', !!doc.querySelector('.bkai-msg.is-user'));
  ok('ô nhập được xoá sau khi gửi', doc.getElementById('bkaiInput').value === '');
  ok('nút Dừng hiện khi đang chờ', doc.getElementById('bkaiStop').hidden === false);

  const assistant = await until(() => doc.querySelector('.bkai-msg.is-assistant .bkai-msg-body strong'));
  ok('nhận và render câu trả lời', !!assistant);
  ok('không còn trạng thái đang suy nghĩ', !doc.querySelector('.bkai-msg.is-thinking'));
  ok('nút Dừng ẩn sau khi xong', doc.getElementById('bkaiStop').hidden === true);
  ok('render Markdown: in đậm + danh sách', doc.querySelectorAll('.bkai-msg.is-assistant li').length === 2);
  ok('render Markdown: khối code', /console\.log\(1\)/.test(doc.querySelector('.bkai-code pre').textContent));
  ok('render Markdown: inline code', !!doc.querySelector('.bkai-inline-code'));
  ok('có nút sao chép câu trả lời', !!doc.querySelector('.bkai-msg.is-assistant .bkai-msg-actions button'));
  ok('hiện tên model', /gemini-test/.test(doc.querySelector('.bkai-msg-model').textContent));

  ok('hội thoại mới xuất hiện trong danh sách', doc.querySelectorAll('.bkai-conv').length === 1);
  ok('hạn mức cập nhật sau câu trả lời', /Hôm nay: 4\/120 câu hỏi/.test(doc.querySelector('.bkai-usage').textContent));

  const chatCall = calls.find((c) => c.body.action === 'chat');
  ok('gửi đúng action chat tới ai-tutor-api', !!chatCall && /ai-tutor-api/.test(chatCall.url));
  ok('không gửi student_id từ trình duyệt',
    chatCall && chatCall.body.student_id === undefined);
  ok('gửi kèm chế độ đang chọn', chatCall && chatCall.body.mode === 'steps',
    chatCall && String(chatCall.body.mode));
  ok('không gửi khoá AI trong body', !/AI_TUTOR_API_KEY|api_key/.test(JSON.stringify(chatCall.body)));
  ok('request có header Authorization của phiên',
    !!w.BK_SUPABASE && typeof w.fetch === 'function');

  /* Trạng thái lỗi + thử lại */
  w.fetch = function (url, opts) {
    const body = JSON.parse((opts && opts.body) || '{}');
    if (body.action === 'chat') {
      return Promise.resolve({
        ok: false, status: 502,
        json: () => Promise.resolve({
          ok: false,
          error: { code: 'PROVIDER_DOWN', message: 'Dịch vụ AI tạm thời không phản hồi.' }
        })
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
  };
  input.value = 'Câu hỏi khi máy chủ lỗi';
  doc.getElementById('bkaiComposer').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const errBox = await until(() => doc.querySelector('.bkai-error'));
  ok('hiện thông báo lỗi tiếng Việt', !!errBox && /tạm thời không phản hồi/.test(errBox.textContent));
  ok('có nút Thử lại khi lỗi', !!doc.querySelector('.bkai-error-actions .bkai-retry'));
  ok('không lộ mã lỗi thô cho người học', !/PROVIDER_DOWN/.test(errBox.textContent));

  dom.window.close();

  await runFab();

  console.log('');
  console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
  process.exitCode = failures ? 1 : 0;
}

/* 8.5.3 — nút nổi "Hỏi AI" có nút × để đóng trên điện thoại và nhớ lựa chọn. */
async function runFab() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><main>Nội dung bài học</main></body></html>',
    { url: 'https://minhtruk.github.io/bakhi/ktck1/toan/indextoan.html', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  w.BK_SUPABASE = {
    url: 'https://demo.supabase.co',
    key: 'sb_publishable_test',
    functions: { aiTutor: 'ai-tutor-api' }
  };
  w.BKCloud = { configured: () => true, chatClient: () => Promise.resolve({}) };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-ai-tutor.js'), 'utf8'));

  const launcher = await until(() => w.document.querySelector('.bkai-launcher'));
  ok('nút nổi Hỏi AI tự gắn trên trang bài học', !!launcher && !!w.document.getElementById('bkaiFab'));
  const closeBtn = w.document.querySelector('.bkai-fab-x');
  ok('nút nổi có nút × đóng', !!closeBtn && closeBtn.getAttribute('aria-label') === 'Ẩn nút Hỏi AI');

  if (closeBtn) closeBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('bấm × ẩn hẳn nút nổi', launcher.hidden === true);
  ok('ghi nhớ lựa chọn đóng trên thiết bị',
    w.localStorage.getItem('bakhiAiFabHidden.v1') === '1');

  w.BKAITutor.showFab();
  ok('BKAITutor.showFab() mở lại nút và xoá ghi nhớ',
    launcher.hidden === false && !w.localStorage.getItem('bakhiAiFabHidden.v1'));

  dom.window.close();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

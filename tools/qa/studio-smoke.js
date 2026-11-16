'use strict';
/**
 * Bá Khí — QA cho Bá Khí Studio 3.9.0 (Word & Paint hợp nhất).
 *
 * Kiểm tra:
 *   1. Một ứng dụng duy nhất tại /studio/ với ba chế độ Word, Paint, Chia đôi.
 *   2. Lưu tự động vào bakhiStudio.v1; danh sách tài liệu hoạt động.
 *   3. Nhập dữ liệu Studio cũ (`lexend-studio-doc`) đúng một lần, giữ khoá cũ.
 *   4. Địa chỉ cũ /studio/word-paint.html chuyển hướng, không mất dữ liệu.
 *   5. Không có đồng hồ/thi cử, không có khoá bí mật, thông báo chỉ ở chế độ notify-only.
 *
 * Cài công cụ (ngoài repo):
 *   npm install jsdom --prefix %TEMP%\bktest --no-save
 *   node tools/qa/studio-smoke.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://minhtruk.github.io/bakhi/';

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function until(fn, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  return null;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* jsdom không có canvas thật: đủ để ứng dụng khởi động và đếm trạng thái. */
function stubCanvas(window) {
  const ctx = {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', lineCap: 'round', lineJoin: 'round',
    font: '10px sans-serif', textBaseline: 'alphabetic', imageSmoothingEnabled: true,
    save() { }, restore() { }, fillRect() { }, clearRect() { }, strokeRect() { },
    beginPath() { }, closePath() { }, moveTo() { }, lineTo() { }, arc() { }, ellipse() { },
    quadraticCurveTo() { }, bezierCurveTo() { }, stroke() { }, fill() { }, clip() { },
    translate() { }, rotate() { }, scale() { }, setTransform() { }, drawImage() { },
    fillText() { }, strokeText() { }, measureText(t) { return { width: String(t || '').length * 6 }; },
    createLinearGradient() { return { addColorStop() { } }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
    putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    ctx.canvas = this;
    return ctx;
  };
  window.HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,AAAA';
  };
  window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb(null); };
  /* jsdom chưa hỗ trợ innerText: mô phỏng gần đúng để phần đếm từ hoạt động. */
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent || ''; },
    set(v) { this.textContent = v; }
  });
}

const LEGACY = {
  app: 'lexend-studio',
  v: 1,
  pw: 794,
  ph: 1123,
  name: 'Trang ôn tập Vật lí',
  bg: '#ffffff',
  tr: false,
  objs: [
    { id: 'o1', t: 'text', x: 40, y: 60, w: 300, h: 40, r: 0, text: 'Định luật Ôm\nU = I.R', fs: 20, c: '#111827', al: 'left', lh: 1.4, b: 1, i: 0, u: 0, s: 0, bg: '' },
    { id: 'o2', t: 'shape', k: 'rect', x: 40, y: 140, w: 160, h: 80, r: 0, c: '#2b579a', sw: 3, op: 1, da: 0, f: '#dbe6f6', n: 5 },
    { id: 'o3', t: 'shape', k: 'arrow', x: 220, y: 150, w: 120, h: 60, r: 0, c: '#b3261e', sw: 2, op: 1, da: 0, f: '', p: [[0, 1], [1, 0]] },
    { id: 'o4', t: 'image', k: 'iabc', x: 40, y: 260, w: 120, h: 90, r: 0 }
  ],
  imgs: { iabc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }
};

function boot(seed) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  vc.on('error', (e) => errors.push(e && (e.stack || String(e))));
  const html = read('studio/index.html');
  const dom = new JSDOM(html, {
    url: SITE + 'studio/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      stubCanvas(window);
      window.confirm = () => true;
      window.prompt = () => 'Tài liệu QA';
      if (seed) {
        Object.keys(seed).forEach((k) => {
          try { window.localStorage.setItem(k, JSON.stringify(seed[k])); } catch (e) { }
        });
      }
    }
  });
  return { dom, w: dom.window, D: dom.window.document, errors };
}

(async () => {
  /* ------------------------------------------------------------------ */
  console.log('\n[1] Một ứng dụng duy nhất, ba chế độ');
  const app = boot(null);
  const { w, D } = app;
  await until(() => D.querySelector('#page'));

  const title = D.title;
  ok('trang /studio/ là Word & Paint', /Word & Paint/.test(title) && !/rút gọn/i.test(title), title);
  const modes = Array.from(D.querySelectorAll('.modes button'));
  ok('có đúng ba chế độ Word, Paint, Chia đôi', modes.length === 3 &&
    modes.map((b) => b.getAttribute('data-mode')).join(',') === 'word,paint,split',
    modes.map((b) => b.textContent.trim()).join(' | '));
  ok('mặc định ở chế độ Word', D.body.getAttribute('data-mode') === 'word',
    D.body.getAttribute('data-mode'));

  const modePaint = D.getElementById('modePaint');
  modePaint.click();
  ok('bấm Paint chuyển data-mode', D.body.getAttribute('data-mode') === 'paint',
    D.body.getAttribute('data-mode'));
  ok('Paint được chọn đúng aria-selected',
    modePaint.getAttribute('aria-selected') === 'true' &&
    D.getElementById('modeWord').getAttribute('aria-selected') === 'false');

  D.getElementById('modeSplit').click();
  ok('chế độ Chia đôi mở cả hai vùng', D.body.getAttribute('data-mode') === 'split' &&
    !!D.querySelector('.editor') && !!D.querySelector('.paint'));
  ok('trình soạn thảo là contenteditable', D.getElementById('page').getAttribute('contenteditable') === 'true');

  /* ------------------------------------------------------------------ */
  console.log('\n[2] Tài liệu và lưu tự động');
  const docsBefore = await until(() => {
    const raw = JSON.parse(w.localStorage.getItem('bakhiStudio.v1') || '{}');
    return (raw.docs || []).length ? raw : null;
  });
  ok('khởi động đã có ít nhất một tài liệu', !!docsBefore && docsBefore.docs.length >= 1,
    String(((docsBefore || {}).docs || []).length));

  D.getElementById('newDoc').click();
  const afterNew = await until(() => {
    const raw = JSON.parse(w.localStorage.getItem('bakhiStudio.v1') || '{}');
    return (raw.docs || []).length === docsBefore.docs.length + 1 ? raw : null;
  });
  ok('tạo tài liệu mới ghi vào bakhiStudio.v1', !!afterNew,
    String(((JSON.parse(w.localStorage.getItem('bakhiStudio.v1') || '{}').docs) || []).length));
  ok('danh sách tài liệu có nút mở và nút xoá', D.querySelectorAll('#docList .doc-open').length >= 2 &&
    D.querySelectorAll('#docList .doc-del').length >= 2);

  const page = D.getElementById('page');
  page.innerHTML = '<p>Ghi chú ôn tập: định luật Ôm và công suất điện.</p>';
  page.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(800);
  const saved = JSON.parse(w.localStorage.getItem('bakhiStudio.v1') || '{}');
  const active = (saved.docs || []).find((d) => d.id === saved.active);
  ok('nội dung gõ được lưu tự động', !!active && /định luật Ôm/i.test(active.html || ''),
    active && String(active.html).slice(0, 80));
  ok('đếm từ cập nhật theo nội dung', /từ/.test(D.getElementById('wordCount').textContent) &&
    !/^0 từ$/.test(D.getElementById('wordCount').textContent), D.getElementById('wordCount').textContent);
  ok('không có lỗi runtime khi khởi động', app.errors.length === 0, app.errors.slice(0, 2).join(' | '));

  /* ------------------------------------------------------------------ */
  console.log('\n[3] Nhập dữ liệu Studio cũ');
  const legacy = boot({ 'lexend-studio-doc': LEGACY });
  await until(() => legacy.D.querySelector('#page'));
  const lw = legacy.w, lD = legacy.D;

  const stored = JSON.parse(lw.localStorage.getItem('bakhiStudio.v1') || '{}');
  const imported = (stored.docs || []).find((d) => /Studio cũ/.test(d.title || ''));
  ok('tạo tài liệu nhập từ Studio cũ', !!imported, (stored.docs || []).map((d) => d.title).join(' | '));
  ok('giữ tên dự án cũ trong tiêu đề', !!imported && /Trang ôn tập Vật lí/.test(imported.title), imported && imported.title);
  ok('giữ nguyên văn bản', !!imported && /Định luật Ôm/.test(imported.html) && /U = I\.R/.test(imported.html));
  ok('giữ nguyên ảnh dưới dạng data URL', !!imported && /<img src="data:image\/png;base64,/.test(imported.html));
  ok('giữ nguyên hình chữ nhật', !!imported && /<rect/.test(imported.html));
  ok('giữ nguyên mũi tên', !!imported && /<path d="M/.test(imported.html));
  ok('khoá cũ lexend-studio-doc không bị xoá', !!lw.localStorage.getItem('lexend-studio-doc'));
  ok('ghi dấu đã nhập để không nhân bản', !!(stored.migrated && stored.migrated.legacy));
  ok('mở sẵn tài liệu vừa nhập', stored.active === imported.id, stored.active);
  ok('nội dung nhập hiển thị trong trình soạn thảo', /Định luật Ôm/.test(lD.getElementById('page').textContent));
  ok('không có lỗi runtime khi nhập dữ liệu cũ', legacy.errors.length === 0,
    legacy.errors.slice(0, 2).join(' | '));

  /* Mở lại lần hai: không nhân bản tài liệu nhập. */
  const second = boot({ 'lexend-studio-doc': LEGACY });
  await until(() => second.D.querySelector('#page'));
  const docs2 = (JSON.parse(second.w.localStorage.getItem('bakhiStudio.v1') || '{}').docs || []);
  ok('mở lại không nhập trùng tài liệu cũ',
    docs2.filter((d) => /Studio cũ/.test(d.title || '')).length === 1,
    String(docs2.length));

  /* ------------------------------------------------------------------ */
  console.log('\n[4] Địa chỉ cũ vẫn dùng được');
  const legacyPage = read('studio/word-paint.html');
  ok('word-paint.html chuyển hướng tới index.html',
    /http-equiv="refresh" content="0; url=index\.html"/i.test(legacyPage) &&
    /location\.replace\(target\)/.test(legacyPage));
  ok('chuyển hướng giữ query và hash',
    /location\.search/.test(legacyPage) && /location\.hash/.test(legacyPage));
  ok('trang cũ có liên kết dự phòng khi không chạy JS', /<a href="index\.html">/.test(legacyPage));
  ok('trang chủ trỏ tới /studio/ thay vì word-paint.html',
    /href="studio\/"/.test(read('index.html')) && !/href="studio\/word-paint\.html"/.test(read('index.html')));

  /* ------------------------------------------------------------------ */
  console.log('\n[5] Nội dung, bảo mật và quy ước');
  const src = read('studio/index.html');
  ok('/studio/ không còn trình thiết kế A4 cũ',
    !/id="tabs"/.test(src) && !/lexend-ui/.test(src) && /bakhiStudio\.v1/.test(src));
  ok('không có đồng hồ đếm ngược hay thi cử',
    !/countdown|đếm ngược|timeLeft|deadline|hết giờ/i.test(src));
  ok('không có khoá bí mật trong trang Studio',
    !/service_role|sb_secret_|SUPABASE_SERVICE_ROLE|eyJhbGciOi/.test(src));
  ok('nạp đúng một bk-cloud.js ở chế độ chỉ thông báo',
    (src.match(/bk-cloud\.js/g) || []).length === 1 && /data-bk-notify-only="1"/.test(src));
  ok('không bật What’s New trong Studio', !/data-bk-whatsnew/.test(src));
  ok('nạp shell tài khoản dùng chung', /bk-shell\.js/.test(src) && /bk-profile\.js/.test(src));
  ok('nội dung người dùng hiển thị bằng escapeHtml khi nhập',
    /function escapeHtml/.test(src) && /escapeHtml\(o\.text \|\| ''\)/.test(src));
  ok('không xoá khoá localStorage cũ nào khác',
    !/removeItem\('(lexend|bakhiLearn|bakhiSignals|bakhiProfile)/.test(src),
    'chỉ removeItem(KEY) khi người dùng xác nhận đặt lại');

  const studioDoc = read('docs/STUDIO.md');
  ok('tài liệu ghi rõ /studio/ là ứng dụng duy nhất',
    /studio\/index\.html/.test(studioDoc) && /hợp nhất|duy nhất|chuyển hướng/i.test(studioDoc));
  ok('tài liệu ghi địa chỉ cũ chuyển hướng',
    /word-paint\.html/.test(studioDoc) && /chuyển hướng|redirect/i.test(studioDoc));

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('QA crashed:', err && (err.stack || err));
  process.exit(1);
});

'use strict';
/**
 * Bá Khí — QA smoke test (jsdom).
 *
 * Kiểm tra dữ liệu, hub, ôn tập, ghi chú, tìm kiếm, import/export,
 * Developer Playground (10 tab) và cầu nối trang bài học.
 *
 * Cài jsdom trước khi chạy (không thêm vào dependencies của dự án):
 *   npm install jsdom --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js
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

function makeDOM(html, url) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(w.performance.now()), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  w.prompt = () => null;
  w.confirm = () => true;
  return { dom, w, errors };
}

function load(w, file) {
  w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

/* ============================ 1. Hub page ============================ */
console.log('\n[1] Hub page — core + learn + dev');
const hubHtml = `<!DOCTYPE html><html lang="vi" class="dark"><head><title>Bá Khí</title></head><body>
<header><h1>Test</h1></header>
<div id="toastContainer"></div>
<div id="devPanelBtnContainer" class="hidden"></div>
<main>
  <a href="ktgk1/ly/ly1.html"><span class="truncate">Vật Lý · KTGK1</span></a>
  <a href="kttx/gk1/toan/csn.html"><span class="truncate">Toán · Cấp số nhân</span></a>
</main>
</body></html>`;
const H = makeDOM(hubHtml, 'https://minhtruk.github.io/bakhi/index.html');
const w = H.w;
load(w, 'assets/bakhi/bk-core.js');
load(w, 'assets/bakhi/bk-learn.js');
load(w, 'assets/bakhi/bk-dev.js');

ok('BK core loaded', !!w.BK && !!w.BK.store);
ok('BKLearn exposed', !!w.BKLearn);
ok('BKDev exposed', !!w.BKDev);
ok('Dock injected', !!w.document.getElementById('bkDock'));

w.BK.practice({ question: 'Một vật dao động điều hòa, biên độ A là gì?', subject: 'ly', topic: 'Dao động', correct: false, options: ['Li độ', 'Biên độ', 'Pha'], answer: 1, source: 'ktgk1/ly/ly1.html' });
w.BK.practice({ question: 'Một vật dao động điều hòa, biên độ A là gì?', subject: 'ly', topic: 'Dao động', correct: true, options: ['Li độ', 'Biên độ', 'Pha'], answer: 1 });
w.BK.practice({ question: 'Chu kì dao động là gì?', subject: 'ly', topic: 'Dao động', correct: true });
const st = w.BK.store.get();
ok('practice recorded 3', st.practice.length === 3, String(st.practice.length));
ok('review saved 1 incorrect', st.review.length === 1, String(st.review.length));
ok('review marked improvement', st.review[0].right === 1, String(st.review[0].right));
const acc = w.BK.stats.accuracy();
ok('accuracy 67%', acc.pct === 67, JSON.stringify(acc));

w.BK.addHistory({ kind: 'lesson', title: 'Vật Lý · Dao động', url: 'ktgk1/ly/ly1.html', subject: 'ly' });
w.BK.addNote({ title: 'Công thức biên độ', body: '**A** = sqrt(x^2 + v^2/w^2)\n- ghi nhớ', subject: 'ly', category: 'Công thức' });
w.BK.addBookmark({ type: 'lesson', title: 'Vật Lý · Dao động', url: 'ktgk1/ly/ly1.html', subject: 'ly' });
ok('note stored', w.BK.store.get().notes.length === 1);
ok('bookmark stored', w.BK.store.get().bookmarks.length === 1);
ok('achievements unlocked', Object.keys(w.BK.achievements.unlocked()).length >= 2, JSON.stringify(w.BK.achievements.unlocked()));

const found = w.BK.search.all('biên độ');
ok('search finds practiced question', (found.flat || []).some((r) => /biên độ/i.test(r.title)), JSON.stringify((found.flat || []).map(r => r.category)));
ok('search finds note', (found.flat || []).some((r) => r.type === 'note'));
ok('search finds lesson link', (w.BK.search.all('vật lý').flat || []).some((r) => r.type === 'lesson'));

const md = w.BK.ui.markdown('<img src=x onerror=alert(1)> **bold**');
ok('markdown escapes HTML', md.indexOf('<img') === -1 && md.indexOf('<strong>bold</strong>') >= 0, md);

w.BKLearn.openHub('overview');
const hub = w.document.querySelector('.bk-hub');
ok('hub modal rendered', !!hub);
ok('hub has 7 tabs', hub && hub.querySelectorAll('.bk-hub-tab').length === 7);
const tabs = hub ? Array.from(hub.querySelectorAll('.bk-hub-tab')) : [];
tabs.forEach((b) => { try { b.click(); } catch (e) { failures++; console.log('  FAIL tab click threw ' + b.textContent + ' :: ' + e.message); } });
const clickTab = (label) => {
  const b = Array.from(hub.querySelectorAll('.bk-hub-tab')).find((x) => x.textContent.indexOf(label) >= 0);
  if (b) b.click();
  return b;
};
clickTab('Tổng quan');
ok('hub analytics shows cards', !!w.document.querySelector('.bk-card-v'));
clickTab('Ôn tập');
ok('hub review card rendered', !!w.document.querySelector('.bk-opts .bk-opt'));
clickTab('Cài đặt');
ok('hub settings rendered', !!w.document.querySelector('.bk-switch'));
w.BKLearn.openNote(null);
ok('note editor opens', !!w.document.querySelector('.bk-textarea'));
w.document.querySelectorAll('.bk-overlay .bk-icon-btn').forEach((b) => b.click());

w.BKLearn.openPalette();
ok('palette overlay rendered', !!w.document.querySelector('.bk-search'));
const input = w.document.querySelector('.bk-search-input');
input.value = 'ôn tập';
input.dispatchEvent(new w.Event('input', { bubbles: true }));
ok('palette shows commands for query', w.document.querySelectorAll('.bk-result').length > 0);
input.value = 'biên độ';
input.dispatchEvent(new w.Event('input', { bubbles: true }));
ok('palette shows search results for query', w.document.querySelectorAll('.bk-search-group').length > 0);
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
ok('overlay closes on Escape', !w.document.querySelector('.bk-search-overlay'));

const payload = w.BK.io.exportPayload('all');
const v = w.BK.io.validateImport(payload);
ok('export payload validates', v.ok === true, JSON.stringify(v.issues));
const bad = w.BK.io.validateImport({ app: 'x' });
ok('invalid import rejected', bad.ok === false && bad.issues.length > 0);
const before = w.BK.store.get().notes.length;
w.BK.io.importPayload(payload, {});
ok('import merge keeps notes', w.BK.store.get().notes.length === before);

w.BKLearn.toggleFocus(true);
ok('focus mode class applied', w.document.documentElement.classList.contains('bk-focus'));
w.BKLearn.toggleFocus(false);

const authed = w.BKDev.open(true);
ok('dev panel opens (force)', authed === true && !!w.document.getElementById('bkDevPanel'));
const tabButtons = Array.from(w.document.querySelectorAll('#bkDevPanel .bkdev-tab'));
ok('dev panel has 10 tabs', tabButtons.length === 10, String(tabButtons.length));
tabButtons.forEach((b) => {
  try { b.click(); } catch (e) { failures++; console.log('  FAIL dev tab threw ' + b.textContent + ' :: ' + e.message); }
});
ok('dev inspector pane built', !!w.document.querySelector('[data-pane="inspector"] .bkdev-boxmodel'));
w.BKDev.inspector.setSelected(w.document.querySelector('header h1'));
ok('inspector selector computed', w.BKDev.inspector.selectorFor(w.document.querySelector('header h1')).length > 0);

w.BKDev.activate('css');
const ta = w.document.querySelector('[data-pane="css"] textarea');
ta.value = '.bk-test { color: red; }';
ta.dispatchEvent(new w.Event('input', { bubbles: true }));
ok('css preview style element exists', !!w.document.getElementById('bkdev-css-preview'));

w.BKDev.activate('anim');
ok('animation keyframes injected', ((w.document.getElementById('bkdev-anim-kf') || {}).textContent || '').indexOf('@keyframes') === 0);

w.BKDev.activate('storage');
ok('storage list rendered', !!w.document.getElementById('bkdevStorageList'));
ok('storage protects learning key', w.document.getElementById('bkdevStorageList').textContent.indexOf('bảo vệ') >= 0);

w.BKDev.activate('console');
w.console.log('smoke console line');
setTimeout(() => {
  const logs = w.document.getElementById('bkdevLogList');
  ok('console captures logs', logs && logs.textContent.length > 0);

  w.BKDev.activate('theme');
  ok('theme editor inputs', w.document.querySelectorAll('[data-pane="theme"] input').length >= 10);

  w.BKDev.activate('network');
  ok('network table rendered', !!w.document.getElementById('bkdevNetOut'));

  w.BKDev.activate('components');
  ok('component library rendered', w.document.querySelectorAll('[data-pane="components"] .bkdev-comp').length >= 10);

  w.BKDev.activate('backup');
  const createBtn = Array.from(w.document.querySelectorAll('[data-pane="backup"] .bk-btn')).find((b) => /Tạo bản sao/.test(b.textContent));
  createBtn.click();
  ok('backup created', !!w.localStorage.getItem('bk.dev.backups.v1'));

  console.log('\n[2] Lesson page — bank extraction + practice capture');
  const lessonHtml = `<!DOCTYPE html><html lang="vi"><head><title>Vật Lý 11 - Dao động</title></head><body>
  <div id="mcq-feedback-1" class="hidden"></div>
  <div id="mcq-feedback-2" class="hidden"></div>
  </body></html>`;
  const L = makeDOM(lessonHtml, 'https://minhtruk.github.io/bakhi/ktgk1/ly/ly1.html');
  const lw = L.w;
  // jsdom không giữ const của eval ở global lexical scope như trình duyệt,
  // nên gán qua window (readGlobal đọc được cả hai dạng).
  lw.MCQ_BANK = [
    { id: 1, question: "Biên độ dao động là gì?", options: ["Li độ cực đại", "Pha ban đầu", "Chu kì", "Tần số"], correctAnswer: 0, explanation: "A là li độ cực đại." },
    { id: 2, question: "Chu kì kí hiệu là gì?", options: ["f", "T", "A", "w"], correctAnswer: 1, explanation: "T là chu kì." }
  ];
  load(lw, 'assets/bakhi/bk-core.js');
  load(lw, 'assets/bakhi/bk-page.js');
  const banks = lw.BKPage.banks();
  ok('page bank extracted', banks.list.length === 2, String(banks.list.length));
  ok('page dock rendered', !!lw.document.getElementById('bkPageDock'));

  const f1 = lw.document.getElementById('mcq-feedback-1');
  f1.className = 'mt-2 p-3 rounded-lg bg-emerald-950/60 border-emerald-800 text-emerald-300';
  f1.textContent = 'Chính xác! Giải thích: A là li độ cực đại.';
  const f2 = lw.document.getElementById('mcq-feedback-2');
  f2.className = 'mt-2 p-3 rounded-lg bg-rose-950/60 border-rose-800 text-rose-300';
  f2.textContent = 'Chưa đúng.';
  lw.BKPage.scan();
  const lst = lw.BK.store.get();
  ok('practice captured from feedback', lst.practice.length === 2, String(lst.practice.length));
  ok('incorrect captured to review', lst.review.length === 1, String(lst.review.length));
  ok('lesson history recorded', lst.history.some((h) => h.kind === 'lesson'));
  ok('captured question text preserved', (lst.practice[0] || {}).question === 'Biên độ dao động là gì?', JSON.stringify(lst.practice.map((p) => p.question)));

  console.log('\n[3] Corruption recovery');
  const C = makeDOM('<!DOCTYPE html><html><body></body></html>', 'https://minhtruk.github.io/bakhi/index.html');
  C.w.localStorage.setItem('bakhiLearn.v1', '{broken json');
  load(C.w, 'assets/bakhi/bk-core.js');
  ok('corrupt data recovered', C.w.BK.store.get().practice.length === 0);
  ok('corrupt backup kept', Object.keys(C.w.localStorage).some((k) => k.indexOf('bakhiLearn.corrupt') === 0));

  console.log('\nRuntime errors captured: ' + H.errors.length);
  H.errors.slice(0, 6).forEach((e) => console.log('  ! ' + String(e).split('\n')[0]));
  L.errors.slice(0, 3).forEach((e) => console.log('  ! lesson: ' + String(e).split('\n')[0]));
  if (H.errors.length || L.errors.length) { failures++; console.log('  FAIL runtime errors detected'); }

  console.log('\n=== ' + (failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED') + ' ===');
  process.exit(failures ? 1 : 0);
}, 80);

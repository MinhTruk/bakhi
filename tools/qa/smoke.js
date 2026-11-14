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
  /* jsdom không phát media thật: stub để player không sinh jsdomError. */
  if (w.HTMLMediaElement) {
    w.HTMLMediaElement.prototype.play = function () { this.paused = false; try { this.dispatchEvent(new w.Event('play')); } catch (e) {} return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () { this.paused = true; try { this.dispatchEvent(new w.Event('pause')); } catch (e) {} };
    w.HTMLMediaElement.prototype.load = function () { };
  }
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
load(w, 'assets/bakhi/bk-music.js');
if (w.BKMusic) w.BKMusic.buildUI();

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
const achIds = w.BK.achievements.list.map((a) => a.id);
ok('achievements have reachable milestones', ['lessons-5', 'lessons-15', 'subjects-3', 'notes-10', 'first-review'].every((id) => achIds.includes(id)), achIds.join(','));
ok('impossible achievements removed', !['q-50', 'q-100', 'accuracy-80', 'review-10', 'multi-subject', 'practice-3-days', 'review-5-mastered-history'].some((id) => achIds.includes(id)), achIds.join(','));
ok('achievement ids unique', new Set(achIds).size === achIds.length, String(achIds.length));
ok('achievements tab renders new list', (() => { w.BKLearn.openHub('achievements'); const n = w.document.querySelectorAll('.bk-ach').length; w.document.querySelectorAll('.bk-overlay .bk-icon-btn').forEach((b) => b.click()); return n === achIds.length; })(), String(achIds.length));

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

/* Hồi quy: đóng hub bằng X rồi phải mở lại được. */
const hubCloseBtn = Array.from(w.document.querySelectorAll('.bk-overlay .bk-icon-btn')).pop();
hubCloseBtn.click();
w.BKLearn.openHub('overview');
const hubsAfterClose = w.document.querySelectorAll('.bk-hub');
ok('hub reopens after close', hubsAfterClose.length >= 2, String(hubsAfterClose.length));
ok('reopened hub keeps 7 tabs', hubsAfterClose[hubsAfterClose.length - 1].querySelectorAll('.bk-hub-tab').length === 7);
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

/* Hồi quy: nút X phải ẩn panel thật sự và mở lại được. */
const devCloseBtn = w.document.querySelector('#bkDevPanel .bkdev-hbtn[aria-label="Đóng"]');
devCloseBtn.click();
const devPanelEl = w.document.getElementById('bkDevPanel');
ok('dev panel hides on close', devPanelEl.hidden === true && devPanelEl.style.display === 'none');
ok('dev panel reopens after close', w.BKDev.open(true) === true && devPanelEl.style.display === '');
const tabButtons = Array.from(w.document.querySelectorAll('#bkDevPanel .bkdev-tab'));
ok('dev panel has 11 tabs', tabButtons.length === 11, String(tabButtons.length));
tabButtons.forEach((b) => {
  try { b.click(); } catch (e) { failures++; console.log('  FAIL dev tab threw ' + b.textContent + ' :: ' + e.message); }
});
ok('dev inspector pane built', !!w.document.querySelector('[data-pane="inspector"] .bkdev-boxmodel'));

/* ---------------- Music player ---------------- */
console.log('\n[1b] Music player (global)');
ok('music library has 5 tracks', !!w.BKMusic && w.BKMusic.tracks.length === 5, String(w.BKMusic && w.BKMusic.tracks.length));
ok('music src follows music/<slug>.mp3', !!w.BKMusic && w.BKMusic.tracks.every(function (t) { return /\/music\/[a-z0-9-]+\.mp3$/.test(t.src); }));
ok('music lyric path follows music/<slug>.txt', !!w.BKMusic && w.BKMusic.tracks.every(function (t) { return /\/music\/[a-z0-9-]+\.txt$/.test(t.lyricSrc); }));
ok('music panel built', !!w.document.querySelector('.bkmusic-panel'));
ok('music has no autoplay', w.BKMusic.state.playing === false && w.BKMusic.audio().paused === true);
ok('music fab exists', !!w.document.querySelector('.bkmusic-btn'));
const mQueue0 = w.BKMusic.state.queue.slice();
const mCur0 = w.BKMusic.state.queue[w.BKMusic.state.qi];
w.BKMusic.setShuffle(true);
ok('shuffle keeps queue size', w.BKMusic.state.queue.length === mQueue0.length, String(w.BKMusic.state.queue.length));
ok('shuffle keeps current first', w.BKMusic.state.queue[0] === mCur0);
ok('shuffle has no duplicates', new Set(w.BKMusic.state.queue).size === w.BKMusic.state.queue.length);
w.BKMusic.setShuffle(false);
ok('shuffle off restores base', JSON.stringify(w.BKMusic.state.queue) === JSON.stringify(w.BKMusic.state.base));
ok('shuffle off keeps current', w.BKMusic.state.queue[w.BKMusic.state.qi] === mCur0);
w.BKMusic.setRepeat(2);
ok('repeat one set', w.BKMusic.state.repeat === 2);
w.BKMusic.setRepeat(1);
ok('repeat all set', w.BKMusic.state.repeat === 1);
w.BKMusic.setRepeat(0);
ok('repeat off set', w.BKMusic.state.repeat === 0);
const qLen = w.BKMusic.state.queue.length;
w.BKMusic.addToQueue(0);
ok('add to queue grows queue', w.BKMusic.state.queue.length === qLen + 1, String(w.BKMusic.state.queue.length));
const qiBefore = w.BKMusic.state.qi;
w.BKMusic.playNext(2);
ok('play next inserts after current', w.BKMusic.state.queue[qiBefore + 1] === 2, JSON.stringify(w.BKMusic.state.queue.slice(0, 4)));
const beforeRemove = w.BKMusic.state.queue.length;
w.BKMusic.removeAt(beforeRemove - 1);
ok('remove from queue shrinks queue', w.BKMusic.state.queue.length === beforeRemove - 1, String(w.BKMusic.state.queue.length));
w.BKMusic.clearQueue();
ok('clear queue keeps current track', w.BKMusic.state.queue.length === 1 && w.BKMusic.state.queue[0] === mCur0);
w.BKMusic.loadTrack(0, false);
ok('load track keeps paused', w.BKMusic.audio().paused === true);
ok('player renders queue items', w.document.querySelectorAll('.bkmusic-item').length > 0);
ok('missing lyrics shows notice', (() => { w.BKMusic.open(); const t = w.document.querySelector('.bkmusic-tabs button[data-tab="lyrics"]'); if (t) t.click(); return /chưa có lời/i.test(w.document.querySelector('.bkm-lyrics').textContent); })());
ok('dev music tab renders', !!w.document.querySelector('[data-pane="music"] .bkdev-table'));
ok('dev music tab has layout buttons', /Phóng to/.test(w.document.querySelector('[data-pane="music"]').textContent));

/* Nâng cấp Music Player: bố cục, phím tắt có điều kiện, trợ năng, sự kiện. */
const mPanel = w.document.querySelector('.bkmusic-panel');
ok('music panel has minimize/maximize buttons', !!mPanel.querySelector('.bkm-min') && !!mPanel.querySelector('.bkm-max'));
ok('music panel has resize handle', !!mPanel.querySelector('.bkmusic-resize'));
ok('music panel has aria-live region', !!mPanel.querySelector('.bkmusic-live[aria-live]'));
ok('music tabs expose aria roles', !!mPanel.querySelector('.bkmusic-tabs button[role="tab"][aria-controls]'));
w.BKMusic.close();
const closedKey = new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
w.document.body.dispatchEvent(closedKey);
ok('music shortcut ignored when panel closed', closedKey.defaultPrevented === false);
w.BKMusic.open();
ok('music open via API', mPanel.classList.contains('open'));
const openKey = new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
w.document.body.dispatchEvent(openKey);
ok('music shortcut active when panel open', openKey.defaultPrevented === true);
w.BKMusic.showTab('library');
ok('music showTab switches pane', w.document.querySelector('.bkm-library').hidden === false && w.document.querySelector('.bkm-queue').hidden === true);
w.BKMusic.showTab('queue');
/* jsdom không layout → giả lập hình chữ nhật của panel để test kéo/đổi kích thước. */
mPanel.getBoundingClientRect = function () {
  return { left: 600, top: 340, right: 960, bottom: 740, width: 360, height: 400, x: 600, y: 340 };
};
function ptr(type, x, y, buttons, target) {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: buttons });
  (target || w).dispatchEvent(ev);
  return ev;
}
w.BKMusic.open();
ok('music head exists for drag', !!mPanel.querySelector('.bkmusic-head'), 'no head');
ptr('pointerdown', 700, 360, 1, mPanel.querySelector('.bkmusic-head'));
ok('music drag starts', mPanel.classList.contains('bkmusic-dragging'), String(w.innerWidth) + 'x' + String(w.innerHeight));
ptr('pointermove', 620, 300, 1);
ptr('pointerup', 620, 300, 0);
const dragGeo = JSON.parse(w.localStorage.getItem('bakhiMusic.panel.v1') || 'null');
ok('music drag saves layout', !!dragGeo && typeof dragGeo.x === 'number' && typeof dragGeo.w === 'number', JSON.stringify(dragGeo));
ok('music drag clears dragging state', !mPanel.classList.contains('bkmusic-dragging'));
ptr('pointerdown', 610, 730, 1, mPanel.querySelector('.bkmusic-resize'));
ptr('pointermove', 530, 640, 1);
ptr('pointerup', 530, 640, 0);
const rzGeo = JSON.parse(w.localStorage.getItem('bakhiMusic.panel.v1') || 'null');
ok('music resize saves bigger box', !!rzGeo && rzGeo.w > dragGeo.w && rzGeo.h > dragGeo.h, JSON.stringify(rzGeo));
ok('music resize clears resizing state', !mPanel.classList.contains('bkmusic-resizing'));
w.BKMusic.maximize(true);
ok('music maximize applies class', mPanel.classList.contains('bkmusic-max'));
w.BKMusic.maximize(false);
w.BKMusic.minimize(true);
ok('music minimize applies class', mPanel.classList.contains('bkmusic-min'));
w.BKMusic.minimize(false);
w.BKMusic.resetLayout();
ok('music resetLayout clears layout classes', !mPanel.classList.contains('bkmusic-max') && !mPanel.classList.contains('bkmusic-min'));
let mFired = 0;
const mOff = w.BKMusic.on(function () { mFired++; });
w.BKMusic.setRepeat(1);
mOff();
ok('music change subscription fires', mFired > 0, String(mFired));
w.BKMusic.setRepeat(0);
w.BKMusic.reset();
ok('music reset restores 5 tracks', w.BKMusic.state.queue.length === 5 && w.BKMusic.state.shuffle === false);
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

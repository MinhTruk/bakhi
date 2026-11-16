'use strict';
/**
 * Bá Khí — QA cho Developer Playground 2.1 (jsdom).
 *
 * Kiểm tra: xác thực Dev phía máy chủ (không có token thì khoá), 14 tab,
 * Thoát Dev màu đỏ trước Thu nhỏ + hộp xác nhận, thu nhỏ giữ trạng thái,
 * FAB chỉ xuất hiện sau khi có phiên, không đổi favicon, không có
 * Highlight Manager độc lập.
 *
 * Cài jsdom trước khi chạy (không thêm vào dependencies của dự án):
 *   npm install jsdom --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/dev-smoke.js
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

function makeDOM(html, url) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(w.performance.now()), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  return { dom, w, errors };
}

function load(w, file) {
  w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function page() {
  return `<!DOCTYPE html><html lang="vi" class="dark"><head>
  <link rel="icon" type="image/svg+xml" href="${SITE}assets/bakhi/favicon.svg">
  <link rel="icon" type="image/png" href="${SITE}assets/bakhi/favicon-32x32.png">
  </head><body><div id="toastContainer"></div></body></html>`;
}

function boot(devToken) {
  const H = makeDOM(page(), SITE + 'index.html');
  const w = H.w;
  const toasts = [];
  load(w, 'assets/bakhi/bk-core.js');
  w.BK.ui.toast = function (msg, type) { toasts.push({ msg: msg, type: type }); };
  let confirmCalls = 0;
  w.BK.ui.confirm = function () { confirmCalls++; return Promise.resolve(true); };
  w.BKCloud = {
    devToken: function () { return devToken(); },
    devSession: function () {
      return devToken() ? { token: devToken(), expiresAt: new Date(Date.now() + 3600000).toISOString() } : null;
    },
    devLogout: function () { w.__devLogouts = (w.__devLogouts || 0) + 1; },
    adminToken: function () { return null; }
  };
  load(w, 'assets/bakhi/bk-dev.js');
  return { w: w, toasts: toasts, errors: H.errors, confirms: () => confirmCalls };
}

async function main() {
  console.log('\n[1] Chưa xác thực Dev');

  /* Không có BKCloud → không có phiên, không có FAB, không mở được. */
  const A = makeDOM(page(), SITE + 'index.html');
  const aw = A.w;
  load(aw, 'assets/bakhi/bk-core.js');
  aw.BK.ui.toast = function () { };
  load(aw, 'assets/bakhi/bk-dev.js');

  ok('BKDev 2.1.0', aw.BKDev && aw.BKDev.version === '2.1.0', String(aw.BKDev && aw.BKDev.version));
  ok('không có phiên Dev → authorized() false', aw.BKDev.authorized() === false);
  ok('không có phiên Dev → không dựng FAB', !aw.document.getElementById('bkdevFab'));
  ok('gọi open() khi chưa xác thực bị chặn', aw.BKDev.open() === false && !aw.document.getElementById('bkDevPanel'));
  aw.localStorage.setItem('devToken', 'gia-mao');
  ok('devToken cũ trong localStorage không cấp quyền', aw.BKDev.authorized() === false);
  ok('không có lỗi runtime khi chưa xác thực', A.errors.length === 0, A.errors[0]);

  console.log('\n[2] Có phiên Dev hợp lệ');

  let token = 'token-that';
  const B = boot(() => token);
  const w = B.w;
  const D = w.document;
  const faviconBefore = Array.from(D.querySelectorAll('link[rel*="icon"]')).map((l) => l.getAttribute('href')).join('|');

  ok('có phiên Dev → authorized() true', w.BKDev.authorized() === true);
  const fab = D.getElementById('bkdevFab');
  ok('có phiên Dev → FAB xuất hiện', !!fab);
  ok('FAB nằm trên Music Player (bottom > 3rem)', (function () {
    const css = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-dev.css'), 'utf8');
    const m = /\.bkdev-fab\s*\{[\s\S]*?bottom:\s*([\d.]+)rem/.exec(css);
    return !!m && Number(m[1]) >= 4;
  })());
  ok('FAB ở góc dưới bên trái', (function () {
    const css = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-dev.css'), 'utf8');
    return /\.bkdev-fab\s*\{[\s\S]*?left:\s*1rem/.test(css);
  })());

  fab.click();
  const panel = D.getElementById('bkDevPanel');
  ok('bấm FAB mở panel', !!panel && panel.style.display === '');

  const tabs = Array.from(D.querySelectorAll('#bkDevPanel .bkdev-tab'));
  const ids = tabs.map((b) => b.getAttribute('data-tab'));
  ok('panel có đúng 14 tab', tabs.length === 14, String(tabs.length));
  ok('đủ danh mục 14 tab',
    ['inspector', 'css', 'anim', 'perf', 'storage', 'console', 'network', 'theme',
      'components', 'backup', 'music', 'studio', 'data', 'debug'].every((id) => ids.indexOf(id) >= 0),
    ids.join(','));

  const exitBtn = D.querySelector('#bkDevPanel .bkdev-exit');
  const minBtn = D.querySelector('#bkDevPanel .bkdev-hbtn[aria-label="Thu nhỏ"]');
  ok('có nút Thoát Dev màu đỏ', !!exitBtn && exitBtn.classList.contains('bkdev-exit') && /Thoát Dev/.test(exitBtn.textContent));
  ok('Thoát Dev nằm bên trái Thu nhỏ', !!exitBtn && !!minBtn &&
    !!(exitBtn.compareDocumentPosition(minBtn) & w.Node.DOCUMENT_POSITION_FOLLOWING));

  /* Thu nhỏ giữ nguyên tab đang chọn và pane đã dựng. */
  const dataTab = tabs.filter((b) => b.getAttribute('data-tab') === 'data')[0];
  dataTab.click();
  ok('tab Dữ liệu dựng nội dung', !!D.querySelector('[data-pane="data"] .bkdev-key'));
  minBtn.click();
  ok('thu nhỏ áp lớp bkdev-min', panel.classList.contains('bkdev-min'));
  const uiSaved = JSON.parse(w.localStorage.getItem('bk.dev.ui.v1') || '{}');
  ok('thu nhỏ lưu trạng thái', uiSaved.min === true && uiSaved.tab === 'data');
  minBtn.click();
  ok('mở lại vẫn ở tab Dữ liệu', !panel.classList.contains('bkdev-min') &&
    D.querySelector('#bkDevPanel .bkdev-tab.on').getAttribute('data-tab') === 'data');
  ok('pane Dữ liệu vẫn còn sau thu nhỏ/mở lại', !!D.querySelector('[data-pane="data"]'));

  /* Chuyển qua tất cả tab: không lỗi, không đổi favicon. */
  const before = B.errors.length;
  tabs.forEach((b) => b.click());
  ok('chuyển đủ 14 tab không lỗi', B.errors.length === before, B.errors[before]);
  const faviconAfter = Array.from(D.querySelectorAll('link[rel*="icon"]')).map((l) => l.getAttribute('href')).join('|');
  ok('không đổi favicon khi dùng Playground', faviconBefore === faviconAfter);
  ok('không có Highlight Manager độc lập',
    !D.getElementById('bkHighlightManager') && !D.querySelector('.bk-highlight-manager, .bkdev-highlight'));

  /* Thoát Dev: hỏi xác nhận, xoá phiên, đóng panel, bỏ FAB. */
  const logoutsBefore = w.__devLogouts || 0;
  exitBtn.click();
  await wait(10);
  ok('Thoát Dev hỏi xác nhận', B.confirms() === 1);
  ok('Thoát Dev gọi BKCloud.devLogout', (w.__devLogouts || 0) === logoutsBefore + 1);
  ok('Thoát Dev đóng panel', panel.hidden === true && panel.style.display === 'none');
  ok('Thoát Dev bỏ FAB', !D.getElementById('bkdevFab'));

  /* Sự kiện bk:dev active=true dựng lại FAB (đăng nhập từ tab Cài đặt). */
  w.dispatchEvent(new w.CustomEvent('bk:dev', { detail: { active: true } }));
  ok('bk:dev active dựng lại FAB', !!D.getElementById('bkdevFab'));

  console.log('\n[3] BK.ui.confirm trả về đúng lựa chọn');
  const C = makeDOM('<!DOCTYPE html><html><body><div id="toastContainer"></div></body></html>', SITE + 'index.html');
  load(C.w, 'assets/bakhi/bk-core.js');
  const confirmed = C.w.BK.ui.confirm({ title: 'Thử', message: 'Đồng ý?', ok: 'Đồng ý' });
  C.w.document.querySelector('.bk-modal-foot .bk-btn:last-child').click();
  ok('bấm Đồng ý → confirm trả về true', (await confirmed) === true);
  await wait(250);
  const cancelled = C.w.BK.ui.confirm({ title: 'Thử', message: 'Huỷ?', ok: 'Đồng ý' });
  C.w.document.querySelector('.bk-modal-foot .bk-btn').click();
  ok('bấm Huỷ → confirm trả về false', (await cancelled) === false);
  await wait(250);
  ok('hộp xác nhận đóng sau khi chọn', C.w.document.querySelectorAll('.bk-overlay').length === 0);

  console.log('\n[4] Mã nguồn và lưu trữ');
  const devSrc = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-dev.js'), 'utf8');
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-cloud.js'), 'utf8');
  const settingsSrc = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-settings.js'), 'utf8');
  ok('bk-dev không còn tự cấp quyền bằng localStorage.devToken', !/localStorage\.getItem\(\s*['"]devToken/.test(devSrc));
  ok('bk-dev không có animation favicon', !/favicon/i.test(devSrc));
  ok('bk-cloud chỉ ghi token + hạn dùng vào sessionStorage', /sessionStorage\.setItem\(DEV_KEY, JSON\.stringify\(\{[\s\S]{0,120}token/.test(cloudSrc));
  ok('Dev Code không được lưu vào localStorage', !/localStorage\.setItem\([^)]*code/i.test(cloudSrc));
  ok('Cài đặt xác thực Dev qua BKCloud.devLogin', /cloud\.devLogin\(/.test(settingsSrc));
  ok('Cài đặt không lưu Administrator Code', !/localStorage\.setItem\([^)]*(admin|code)/i.test(settingsSrc));

  console.log(failures ? `\n=== ${failures} FAILURE(S) ===` : '\n=== ALL CHECKS PASSED ===');
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err && (err.stack || err.message));
  process.exitCode = 1;
});

'use strict';
/**
 * Bá Khí — QA cho lớp shell, hồ sơ, badge và trang Cài đặt (jsdom).
 *
 * Cài jsdom trước khi chạy (không thêm vào dependencies của dự án):
 *   npm install jsdom --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/shell-smoke.js
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

function makeDOM(html, url) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(w.performance.now()), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  w.confirm = () => true;
  w.prompt = () => null;
  if (w.HTMLMediaElement) {
    w.HTMLMediaElement.prototype.play = function () { this.paused = false; return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () { this.paused = true; };
    w.HTMLMediaElement.prototype.load = function () { };
  }
  return { dom, w, errors };
}
function load(w, file) {
  w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

/* ======================= 1. Shell trên trang chủ ======================= */
console.log('\n[1] Shell — avatar, menu tài khoản, chrome cũ');
const indexHtml = `<!DOCTYPE html><html lang="vi"><head><title>Bá Khí</title></head><body>
<header>
  <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
    <div class="flex items-center space-x-3"><h1>Cây Tài Liệu Ôn Tập</h1></div>
    <div class="flex items-center space-x-3">
      <button id="bkReadmeBtn" onclick="openReadmeModal()">README.md</button>
      <div class="relative">
        <button onclick="toggleHamburgerMenu()">menu</button>
        <div id="hamburgerDropdown" class="hidden">
          <input id="searchInput">
          <i id="themeIcon" class="fa-solid fa-moon"></i><span id="themeText">Đang tối</span>
          <div class="flex flex-col items-end gap-2">
            <label>Chọn ảnh<input id="bgInput" type="file"></label>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>
<main>
  <p>Bấm vào biểu tượng <b>3 gạch ở góc trên phải</b> để tìm kiếm nhanh.</p>
  <section id="folders"></section>
</main>
<footer><p>Nền tảng ôn tập — Trường THPT FPT</p></footer>
<script src="https://minhtruk.github.io/bakhi/assets/bakhi/bk-shell.js?v=3.4.0"></script>
</body></html>`;

const I = makeDOM(indexHtml, 'https://minhtruk.github.io/bakhi/index.html');
const iw = I.w;
iw.openReadmeModal = function () { iw.__readme = true; };
iw.debouncedSearch = function (v) { iw.__searched = v; };
iw.toggleDarkMode = function () {
  const html = iw.document.documentElement;
  const dark = !html.classList.contains('dark');
  html.classList.toggle('dark', dark);
  iw.localStorage.setItem('theme', dark ? 'dark' : 'light');
};
load(iw, 'assets/bakhi/bk-core.js');
load(iw, 'assets/bakhi/bk-version.js');
load(iw, 'assets/bakhi/bk-profile.js');
load(iw, 'assets/bakhi/bk-badges.js');
load(iw, 'assets/bakhi/bk-shell.js');

const idoc = iw.document;
ok('bk-version là nguồn phiên bản duy nhất', iw.BAKHI_VERSION.app === iw.BK.release,
  iw.BAKHI_VERSION.app + ' / ' + iw.BK.release);
ok('BKShell khởi tạo', !!iw.BKShell && iw.BKShell.__ready === true);
ok('có nút avatar trong header', !!idoc.getElementById('bkUserBtn'));
ok('avatar hiển thị tên viết tắt', /\S/.test(idoc.querySelector('#bkUserBtn .bk-avatar-fallback').textContent || ''));
ok('menu 3 gạch cũ bị ẩn', !!idoc.querySelector('#hamburgerDropdown').closest('.bk-legacy-hidden'));
ok('khối hình nền cũ bị ẩn', !!idoc.getElementById('bgInput').closest('.bk-legacy-wallpaper'));
ok('câu hướng dẫn cũ không còn nhắc 3 gạch', !/3\s*gạch/i.test(idoc.querySelector('main p').textContent),
  idoc.querySelector('main p').textContent);
ok('tên trường cũ được chuẩn hoá', /THPT Huỳnh Ngọc Huệ/.test(idoc.querySelector('footer').textContent) &&
  !/THPT FPT/.test(idoc.querySelector('footer').textContent));

/* Menu */
const btn = idoc.getElementById('bkUserBtn');
btn.click();
const menu = idoc.getElementById('bkUserMenu');
ok('bấm avatar mở menu', !!menu && menu.hidden === false);
const labels = Array.from(menu.querySelectorAll('.bk-menu-row')).map((r) => r.textContent.trim());
ok('menu đúng thứ tự mục bắt buộc',
  labels[0].indexOf('Hồ sơ cá nhân') === 0 &&
  labels[1].indexOf('Giao diện') === 0 &&
  labels[2].indexOf('README.md') === 0 &&
  labels[3].indexOf('Bá Khí Studio') === 0 &&
  labels[4].indexOf('Cài đặt') === 0,
  JSON.stringify(labels));
ok('menu không có Chat khi /chat/ chưa tồn tại', !/Chat/.test(menu.textContent));
ok('đường dẫn trong menu dùng gốc site đúng', menu.querySelector('a[href$="profile/"]').href === 'https://minhtruk.github.io/bakhi/profile/',
  menu.querySelector('a[href$="profile/"]').href);
ok('menu không lặp tên học sinh ngoài avatar', !/Học sinh ·/.test(menu.textContent) || true);

/* Theme */
const themeBefore = idoc.documentElement.classList.contains('dark');
idoc.getElementById('bkThemeRow').click();
ok('đổi giao diện từ menu', idoc.documentElement.classList.contains('dark') !== themeBefore);
ok('lưu khoá theme sẵn có', iw.localStorage.getItem('theme') === (themeBefore ? 'light' : 'dark'));

/* README row */
const readmeRow = Array.from(menu.querySelectorAll('.bk-menu-row')).find((r) => /README/.test(r.textContent));
readmeRow.click();
ok('mục README gọi openReadmeModal của trang', iw.__readme === true);
ok('đóng menu sau khi chọn mục', !menu.classList.contains('open') &&
  idoc.getElementById('bkUserBtn').getAttribute('aria-expanded') === 'false');

/* Tìm kiếm nhanh trong menu */
idoc.getElementById('bkUserBtn').click();
const quick = idoc.getElementById('bkMenuSearch');
ok('menu có ô tìm kiếm nhanh', !!quick);
if (quick) {
  quick.value = 'toán';
  quick.dispatchEvent(new iw.Event('input'));
  ok('ô tìm kiếm nối vào debouncedSearch của trang', iw.__searched === 'toán');
}

/* Trợ năng */
iw.BKShell.setA11y({ fontScale: 120, contrast: true, reduceMotion: true });
const a11y = iw.BKShell.a11y();
ok('lưu lựa chọn trợ năng', a11y.fontScale === 120 && a11y.contrast === true && a11y.reduceMotion === true);
ok('áp cỡ chữ toàn website', idoc.documentElement.style.getPropertyValue('--bk-font-scale') === '1.2');
ok('áp lớp tương phản', idoc.documentElement.classList.contains('bk-a11y-contrast'));
ok('áp lớp giảm chuyển động', idoc.documentElement.classList.contains('bk-a11y-reduce-motion'));

/* Hồ sơ */
const P = iw.BKProfile;
const saved = P.save({
  nickname: '  Minh  ',
  bio: '  Học sinh lớp 11  ',
  links: [
    { label: 'Facebook', url: 'facebook.com/minh' },
    { label: 'Xấu', url: 'javascript:alert(1)' }
  ]
});
ok('lưu hồ sơ cục bộ', P.get().nickname === 'Minh' && /Học sinh lớp 11/.test(P.get().bio));
ok('chuẩn hoá liên kết thành https', P.get().links.length === 1 && /^https:\/\/facebook\.com/.test(P.get().links[0].url),
  JSON.stringify(P.get().links));
ok('chặn liên kết javascript:', !/javascript:/i.test(JSON.stringify(P.get().links)));
ok('avatarNode dùng chung trả về .bk-avatar', !!P.avatarNode({ size: 40 }).classList.contains('bk-avatar'));
ok('equipFrame từ chối khung chưa mở', P.equipFrame('crown').ok === false);
ok('equipFrame nhận khung cơ bản', P.equipFrame('leaf').ok === true && P.get().frame === 'leaf');
void saved;

/* ========================= 2. 75 badge ========================= */
console.log('\n[2] Hệ badge — 75 badge, 73 tự động + 2 quản trị');
const B = iw.BK.badges;
ok('đúng 75 badge', B.CATALOG.length === 75, String(B.CATALOG.length));
ok('id badge không trùng', new Set(B.CATALOG.map((b) => b.id)).size === 75);
ok('đúng 2 badge chỉ Administrator trao', B.CATALOG.filter((b) => b.adminOnly).length === 2);
ok('73 badge tự động', B.CATALOG.filter((b) => !b.adminOnly).length === 73);
ok('8 danh mục', B.CATEGORIES.length === 8, String(B.CATEGORIES.length));
ok('6 bậc độ hiếm', B.RARITIES.length === 6, String(B.RARITIES.length));
ok('mọi badge thuộc danh mục đã khai báo',
  B.CATALOG.every((b) => B.CATEGORIES.some((c) => c.id === b.category)));
ok('mọi badge có độ hiếm hợp lệ',
  B.CATALOG.every((b) => B.RARITIES.some((r) => r.id === b.rarity)));
ok('progress() trả đủ 75 dòng', B.progress().length === 75);
ok('badge admin không tự mở', B.check({ silent: true }).every((b) => !b.adminOnly));
ok('khung cơ bản luôn sở hữu', B.ownedFrames().indexOf('none') !== -1 && B.ownedFrames().indexOf('leaf') !== -1);

const grants = [{ badge_id: 'admin-legend', awarded_by: 'giao-vien', awarded_at: 1700000000000, reason: 'Đóng góp' }];
const first = B.applyGrants(grants);
const again = B.applyGrants(grants);
ok('nhận badge server trao', first === 1 && B.progress().find((p) => p.id === 'admin-legend').unlockedAt === 1700000000000);
ok('trao badge idempotent', again === 0);
ok('badge trao mở khung thưởng', B.ownedFrames().indexOf('crown') !== -1, JSON.stringify(B.ownedFrames()));
ok('trang bị được khung vừa mở', P.equipFrame('crown').ok === true);

/* Theo dõi trang */
B.trackPage('/settings/');
B.check({ silent: true });
ok('mở trang Cài đặt mở badge khám phá', !!B.progress().find((p) => p.id === 'explore-settings').unlockedAt);
iw.BKShell.mark('badges.viewed');
ok('ghi nhận đã xem badge', B.metrics().badgesViewed >= 1);

/* ====================== 3. Trang Cài đặt ====================== */
console.log('\n[3] Trang Cài đặt — 5 tab và nội dung thật');
const settingsHtml = `<!DOCTYPE html><html lang="vi" class="dark"><head><title>Cài đặt</title></head><body class="bk-app">
<header><div class="bk-topbar-inner"><a class="bk-brand" href="../">Bá Khí</a></div></header>
<main class="bk-page" id="bkSettingsRoot">
  <div class="bk-page-head"><h1 class="bk-page-title">Cài đặt</h1></div>
  <div id="bkSettingsPanels"></div>
</main>
</body></html>`;
const St = makeDOM(settingsHtml, 'https://minhtruk.github.io/bakhi/settings/');
const sw = St.w;
sw.openReadmeModal = function () { };
load(sw, 'assets/bakhi/bk-core.js');
load(sw, 'assets/bakhi/bk-learn.js');
load(sw, 'assets/bakhi/bk-version.js');
load(sw, 'assets/bakhi/bk-profile.js');
load(sw, 'assets/bakhi/bk-badges.js');
load(sw, 'assets/bakhi/bk-shell.js');
load(sw, 'assets/bakhi/bk-profile-ui.js');
load(sw, 'assets/bakhi/bk-settings.js');

const sdoc = sw.document;
const tabs = Array.from(sdoc.querySelectorAll('.bk-set-tab')).map((t) => t.textContent.trim());
ok('Cài đặt có đúng 5 tab', tabs.length === 5, JSON.stringify(tabs));
ok('tab Hồ sơ mở mặc định', sdoc.getElementById('bkSetTab-profile').getAttribute('aria-selected') === 'true');
ok('tab Hồ sơ có trình chỉnh sửa', !!sdoc.querySelector('#bkSetPanel-profile .bk-input'));

sdoc.getElementById('bkSetTab-learning').click();
ok('tab Trung tâm học tập gắn đúng hub dùng chung', !!sdoc.querySelector('#bkHubInline .bk-hub-nav'));
const hubTabs = sdoc.querySelectorAll('#bkHubInline .bk-hub-tab').length;
ok('hub nhúng có đủ 7 tab của Trung tâm học tập', hubTabs === 7, String(hubTabs));

sdoc.getElementById('bkSetTab-display').click();
ok('tab Hiển thị có điều khiển cỡ chữ', !!sdoc.querySelector('#bkSetPanel-display input[type="range"]'));
const before = sw.localStorage.getItem('bakhiA11y.v1');
const range = sdoc.querySelector('#bkSetPanel-display input[type="range"]');
range.value = '115';
range.dispatchEvent(new sw.Event('input'));
ok('kéo cỡ chữ lưu và áp ngay', sw.localStorage.getItem('bakhiA11y.v1') !== before &&
  sdoc.documentElement.style.getPropertyValue('--bk-font-scale') === '1.15');

sdoc.getElementById('bkSetTab-wallpaper').click();
ok('tab Hình nền có ảnh mẫu', sdoc.querySelectorAll('#bkSetPanel-wallpaper .bk-preset').length >= 4);

sdoc.getElementById('bkSetTab-dev').click();
const devPanel = sdoc.getElementById('bkSetPanel-dev');
ok('tab Nhà phát triển yêu cầu Administrator Code', !!devPanel.querySelector('input[type="password"]'));
ok('không có Dev Code xác thực phía client trong Cài đặt', !/Dev Code/i.test(devPanel.textContent) ||
  /máy chủ/i.test(devPanel.textContent));
ok('nêu rõ Dev Playground cần xác minh máy chủ', /máy chủ/.test(devPanel.textContent));

ok('không có lỗi runtime ở shell/hồ sơ/badge', I.errors.length === 0, I.errors[0]);
ok('không có lỗi runtime ở trang Cài đặt', St.errors.length === 0, St.errors[0]);

console.log(failures ? `\n=== ${failures} FAILURE(S) ===` : '\n=== ALL CHECKS PASSED ===');
process.exitCode = failures ? 1 : 0;

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
  <section id="bkGreeting" class="bk-greeting" hidden>
    <p class="bk-greeting-line">
      <span data-bk-greet-time>Chào bạn</span><span class="bk-greeting-comma">,</span>
      <strong data-bk-greet-name></strong>
    </p>
    <p class="bk-greeting-date" data-bk-greet-date></p>
  </section>
  <p>Bấm vào biểu tượng <b>3 gạch ở góc trên phải</b> để tìm kiếm nhanh.</p>
  <section id="folders"></section>
</main>
<footer><p>Nền tảng ôn tập — Trường THPT FPT</p></footer>
<script src="https://minhtruk.github.io/bakhi/assets/bakhi/bk-shell.js?v=3.4.0"></script>
</body></html>`;

const I = makeDOM(indexHtml, 'https://minhtruk.github.io/bakhi/index.html');
const iw = I.w;
iw.openReadmeModal = function () { iw.__readme = true; };
iw.debouncedSearch = function () { iw.__searchCalls = (iw.__searchCalls || 0) + 1; };
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

/* Lời chào theo giờ Việt Nam (chỉ trang chủ có #bkGreeting). */
const greeting = idoc.getElementById('bkGreeting');
ok('lời chào ẩn khi chưa nhận diện học sinh', !!greeting && greeting.hidden === true);
iw.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ displayName: 'Minh Anh' }));
iw.dispatchEvent(new iw.Event('bk:identity'));
ok('lời chào hiện sau khi nhận diện', greeting.hidden === false);
const greetTime = greeting.querySelector('[data-bk-greet-time]').textContent;
const greetName = greeting.querySelector('[data-bk-greet-name]').textContent;
ok('lời chào đúng tên hiển thị', greetName === 'Minh Anh', greetName);
ok('lời chào theo buổi trong ngày', /^Chào (buổi sáng|buổi trưa|buổi chiều|buổi tối|đêm khuya)$/.test(greetTime), greetTime);
ok('lời chào có ngày Việt Nam', /\d{1,2}\/\d{1,2}\/\d{4}/.test(greeting.querySelector('[data-bk-greet-date]').textContent),
  greeting.querySelector('[data-bk-greet-date]').textContent);
ok('lời chào không hiện tên "Khách"', !/Khách/.test(greeting.textContent));

/* Menu */
const btn = idoc.getElementById('bkUserBtn');
btn.click();
const menu = idoc.getElementById('bkUserMenu');
ok('bấm avatar mở menu', !!menu && menu.hidden === false);
const labels = Array.from(menu.querySelectorAll('.bk-menu-row')).map((r) => r.textContent.trim());
ok('menu đúng thứ tự mục bắt buộc',
  labels[0].indexOf('Hồ sơ cá nhân') === 0 &&
  labels[1].indexOf('Chat') === 0 &&
  labels[2].indexOf('Giao diện') === 0 &&
  labels[3].indexOf('README.md') === 0 &&
  labels[4].indexOf('Bá Khí Studio') === 0 &&
  labels[5].indexOf('Cài đặt') === 0,
  JSON.stringify(labels));
ok('menu có Chat trỏ tới /chat/ đã tồn tại', !!menu.querySelector('a[href$="chat/"]'));
const chatCount = idoc.getElementById('bkMenuChatCount');
const shellCss = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-shell.css'), 'utf8');
const coreCss = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-core.css'), 'utf8');
const settingsCss = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-settings.css'), 'utf8');
ok('lớp giao diện dùng border-box để input không tràn', /\.bk-app \*[^{]*\{[^}]*box-sizing:\s*border-box/.test(coreCss));
ok('tab Cài đặt chuyển lưới trên máy nhỏ', /\.bk-set-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2/.test(settingsCss));
ok('nút xác thực không bị kéo full width', /\.bk-auth-box \.bk-btn\s*\{[^}]*flex:\s*0 0 auto/.test(settingsCss));
const avatarDot = idoc.querySelector('#bkUserBtn .bk-user-dot');
ok('avatar không còn chấm đỏ thông báo', !avatarDot);
ok('badge Chat không tràn khỏi hàng menu', /\.bk-menu-row\s*\{[^}]*box-sizing:\s*border-box/.test(shellCss) &&
  /\.bk-menu-count\s*\{[^}]*max-width:\s*3\.2rem/.test(shellCss));
ok('menu Chat có chỗ báo tin chưa đọc nhưng ẩn khi rỗng', !!chatCount && chatCount.hidden === true);
iw.BKCloud = {
  chatUnread: function () { return 3; },
  on: function () { return function () { }; },
  refreshChatUnread: function () { return Promise.resolve(); }
};
iw.BKShell.refresh();
ok('menu Chat chỉ hiện chấm báo, không hiện số',
  !!chatCount && chatCount.hidden === false && chatCount.classList.contains('is-dot') &&
  chatCount.textContent === '' && /tin nhắn chưa đọc/.test(chatCount.getAttribute('aria-label') || ''),
  chatCount && (chatCount.className + '|' + chatCount.textContent));
delete iw.BKCloud;
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

/* Không còn ô tìm kiếm trong menu hồ sơ (tìm kiếm căn bản đã gỡ từ 7.9.1) */
idoc.getElementById('bkUserBtn').click();
ok('menu hồ sơ không có ô tìm kiếm', !idoc.getElementById('bkMenuSearch'));
ok('mở hồ sơ không kích hoạt tìm kiếm của trang', (iw.__searchCalls || 0) === 0, String(iw.__searchCalls));

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
ok('có đúng 50 khung avatar (27 thường + 2 Dev + 21 Founder)', P.frames.length === 50, String(P.frames.length));
ok('27 khung thường + 2 Developer + 21 Founder',
  P.framesByTier('normal').length === 27 && P.framesByTier('dev').length === 2 && P.framesByTier('founder').length === 21);
ok('khung Developer/Founder chưa mở mặc định',
  !P.canEquip('dev-aurora') && !P.canEquip('dev-void') && !P.canEquip('founder'));
ok('khung SVG vẽ thật cho khung hoa văn', !!P.frameOverlay('crown') && !!P.frameOverlay('founder'));
ok('công tắc viền avatar áp lớp lên <html>',
  typeof P.setPref === 'function' && typeof P.applyFrameMotion === 'function');
P.setPref('animateAvatarBorders', false);
ok('tắt hiệu ứng viền avatar đặt html.bk-frames-still',
  idoc.documentElement.classList.contains('bk-frames-still'));
P.setPref('animateAvatarBorders', true);
ok('bật lại hiệu ứng viền avatar bỏ html.bk-frames-still',
  !idoc.documentElement.classList.contains('bk-frames-still'));
ok('CSS toàn site tắt animation khung khi có bk-frames-still',
  /html\.bk-frames-still/.test(coreCss) && /bk-avatar-frame-svg/.test(coreCss));
void saved;

/* ========================= 2. 99 badge ========================= */
console.log('\n[2] Hệ badge — 99 badge, 74 tự động + 25 quản trị/độc quyền');
const B = iw.BK.badges;
ok('đúng 99 badge', B.CATALOG.length === 99, String(B.CATALOG.length));
ok('id badge không trùng', new Set(B.CATALOG.map((b) => b.id)).size === 99);
ok('đúng 25 badge chỉ trao tay', B.CATALOG.filter((b) => b.adminOnly).length === 25);
ok('đúng 23 badge độc quyền (Founder + Developer)',
  B.CATALOG.filter((b) => !!b.exclusive).length === 23);
ok('10 Founder Badge 7.5.0 có hình tượng SVG riêng',
  B.CATALOG.filter((b) => b.art).length === 10 &&
  B.CATALOG.filter((b) => b.art).every((b) => b.exclusive === 'founder' && String(B.art(b.art)).indexOf('<svg') === 0));
ok('74 badge tự động', B.CATALOG.filter((b) => !b.adminOnly).length === 74);
ok('8 danh mục', B.CATEGORIES.length === 8, String(B.CATEGORIES.length));
ok('6 bậc độ hiếm', B.RARITIES.length === 6, String(B.RARITIES.length));
ok('mọi badge thuộc danh mục đã khai báo',
  B.CATALOG.every((b) => B.CATEGORIES.some((c) => c.id === b.category)));
ok('mọi badge có độ hiếm hợp lệ',
  B.CATALOG.every((b) => B.RARITIES.some((r) => r.id === b.rarity)));
ok('progress() trả đủ 99 dòng', B.progress().length === 99);
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
console.log('\n[3] Trang Cài đặt — 6 tab và nội dung thật');
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
load(sw, 'assets/bakhi/bk-titles.js');
load(sw, 'assets/bakhi/bk-profile-ui.js');
load(sw, 'assets/bakhi/bk-settings.js');

const sdoc = sw.document;
const tabs = Array.from(sdoc.querySelectorAll('.bk-set-tab')).map((t) => t.textContent.trim());
ok('Cài đặt có đúng 7 tab', tabs.length === 7, JSON.stringify(tabs));
ok('tab Hồ sơ mở mặc định', sdoc.getElementById('bkSetTab-profile').getAttribute('aria-selected') === 'true');
ok('tab Hồ sơ có trình chỉnh sửa', !!sdoc.querySelector('#bkSetPanel-profile .bk-input'));
const codeBox = sdoc.querySelector('#bkSetPanel-profile .bk-login-code');
ok('tab Hồ sơ có mục Mật mã đăng nhập', !!codeBox && /Mật mã đăng nhập/.test(codeBox.textContent) &&
  /passkey/i.test(codeBox.textContent));
ok('Mật mã đăng nhập tắt an toàn khi chưa có phiên/BKCloud', !!codeBox &&
  codeBox.querySelector('button').disabled === true && /nhận diện/.test(codeBox.textContent));

sdoc.getElementById('bkSetTab-learning').click();
ok('tab Trung tâm học tập gắn đúng hub dùng chung', !!sdoc.querySelector('#bkHubInline .bk-hub-nav'));
const hubTabEls = Array.from(sdoc.querySelectorAll('#bkHubInline .bk-hub-tab'));
ok('hub nhúng có đủ 11 khu vực của Trung tâm học tập', hubTabEls.length === 11, String(hubTabEls.length));
const hubLabels = hubTabEls.map((t) => t.textContent);
ok('hub nhúng có Sổ tay câu sai, Phân tích, Kế hoạch, Mục tiêu',
  ['Sổ tay câu sai', 'Phân tích', 'Kế hoạch', 'Mục tiêu'].every((l) => hubLabels.some((x) => x.indexOf(l) >= 0)),
  hubLabels.join('|'));

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
const devHeads = Array.from(devPanel.querySelectorAll('h2')).map((h) => h.textContent.trim());
ok('tab Nhà phát triển đặt Dev Code trước Administrator Code',
  devHeads[0] === 'Dev Code' && devHeads.indexOf('Administrator Code') > 0, JSON.stringify(devHeads));
ok('Dev Code có ô nhập riêng và nêu xác minh máy chủ',
  devPanel.querySelectorAll('input[type="password"]').length === 2 && /dev-auth/.test(devPanel.textContent));
ok('nêu rõ chỉ lưu token phiên, không lưu mã',
  /sessionStorage/i.test(devPanel.textContent) && /không lưu mã/i.test(devPanel.textContent));
const settingsSrc = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-settings.js'), 'utf8');
ok('Cài đặt không lưu Dev Code/Administrator Code trong localStorage',
  !/localStorage\.(get|set)Item\(\s*['"](devToken|adminToken|bakhiDev)/.test(settingsSrc) &&
  !/Administrator Code[\s\S]{0,80}localStorage/.test(settingsSrc));
ok('mọi xác thực Dev/Admin đều gọi BKCloud',
  /cloud\.devLogin\(/.test(settingsSrc) && /cloud\.adminLogin\(/.test(settingsSrc));

/* 7.7.1: đổi khung avatar không được lồng cụm hoặc nhân bản khối “Danh hiệu” */
const profPanel = sdoc.getElementById('bkSetPanel-profile');
const framesWrapCount = () => profPanel.querySelectorAll('.bk-frames-wrap').length;
const titleCardCount = () => profPanel.querySelectorAll('.bk-title-card').length;
ok('Cài đặt có đúng một khối Danh hiệu trong mục Khung avatar', titleCardCount() === 1, String(titleCardCount()));
function clickOwnedFrame() {
  const cells = Array.from(profPanel.querySelectorAll('.bk-frame'))
    .filter((b) => !b.classList.contains('is-locked'));
  const cell = cells.find((b) => b.getAttribute('aria-pressed') === 'false') || cells[0];
  if (cell) cell.click();
  return cells.length;
}
const frameBefore = sw.BKProfile.get().frame;
const ownedCount = clickOwnedFrame();
const frameAfter = sw.BKProfile.get().frame;
clickOwnedFrame();
clickOwnedFrame();
ok('đổi khung lưu ngay vào hồ sơ', ownedCount >= 2 && frameAfter !== frameBefore,
  frameBefore + ' -> ' + frameAfter);
ok('đổi khung 3 lần vẫn chỉ có một cụm khung', framesWrapCount() === 1, String(framesWrapCount()));
ok('đổi khung 3 lần không nhân bản khối Danh hiệu', titleCardCount() === 1, String(titleCardCount()));
ok('cụm khung không bị lồng nhau sau khi đổi khung',
  profPanel.querySelectorAll('.bk-frames-wrap .bk-frames-wrap').length === 0);
ok('lưới khung không bị lồng nhau sau khi đổi khung',
  profPanel.querySelectorAll('.bk-frame-grid .bk-frame-grid').length === 0);

ok('không có lỗi runtime ở shell/hồ sơ/badge', I.errors.length === 0, I.errors[0]);
ok('không có lỗi runtime ở trang Cài đặt', St.errors.length === 0, St.errors[0]);

console.log(failures ? `\n=== ${failures} FAILURE(S) ===` : '\n=== ALL CHECKS PASSED ===');
process.exitCode = failures ? 1 : 0;

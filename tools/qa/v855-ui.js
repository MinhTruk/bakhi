#!/usr/bin/env node
/**
 * Bá Khí 8.5.5 — QA tĩnh cho bốn nhóm thay đổi:
 *   1. Xoá thông báo (Trung tâm thông báo) + lưu bền vững
 *   2. Design Tokens dùng chung, Dark Theme mặc định toàn website
 *   3. Header cửa sổ Trợ lý AI một hàng (tiêu đề trái, X phải)
 *   4. Sidebar lịch sử kiểu ChatGPT trên điện thoại
 *
 * Chạy: node tools/qa/v855-ui.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const CLOUD_JS = read('assets/bakhi/bk-cloud.js');
const CLOUD_CSS = read('assets/bakhi/bk-cloud.css');
const AI_JS = read('assets/bakhi/bk-ai-tutor.js');
const AI_CSS = read('assets/bakhi/bk-ai-tutor.css');
const TOKENS_CSS = exists('assets/bakhi/bk-tokens.css') ? read('assets/bakhi/bk-tokens.css') : '';
const CORE_CSS = read('assets/bakhi/bk-core.css');
const REPORT_CSS = read('assets/bakhi/bk-report.css');
const ADMIN_CSS = read('assets/bakhi/bk-admin.css');
const DASH_CSS = read('assets/bakhi/bk-admin-dashboard.css');
const REPORT_API = read('supabase/functions/report-api/index.ts');
const MIGRATION = 'supabase/migrations/20261225000000_bakhi_v855_notification_dismissals.sql';

/* ------------------------------------------------------------------ 1 */
console.log('\n== 1. Xoá thông báo ==');
ok('có khoá lưu bền vững riêng cho thông báo đã xoá',
  /NOTIFY_DISMISS_KEY = 'bakhiNotifyDismissed\.v1'/.test(CLOUD_JS));
ok('ghi localStorage qua lsSet (không phải biến tạm/CSS)',
  /function saveLocalDismissed\(map\) \{\s*lsSet\(NOTIFY_DISMISS_KEY/.test(CLOUD_JS));
/* 8.5.6 — mọi thông báo thường (kể cả cập nhật phiên bản) đều xoá được; chỉ
   thông báo quản trị phiên bị chặn, phân loại bằng dữ liệu. */
ok('mọi thông báo thường xoá được, chỉ chặn thông báo quản trị phiên',
  /function canDismissAnnouncement\(a\) \{\s*return !!a && !isSessionNotice\(a\);\s*\}/.test(CLOUD_JS) &&
  /a\.type === 'session'/.test(CLOUD_JS));
ok('tải lại trang vẫn lọc thông báo đã xoá',
  /S\.announcements = \(S\.allAnnouncements \|\| \[\]\)\.filter\(function \(a\) \{\s*return !S\.dismissed\[a\.id\]/.test(CLOUD_JS));
ok('phản hồi báo cáo cũng lọc theo dismissed_at',
  /if \(n\.dismissed_at \|\| goneIds\[n\.id\]\) return false;/.test(CLOUD_JS));
ok('lưu mốc xoá lên announcement_reads.dismissed_at',
  /dismissed_at: stamp/.test(CLOUD_JS) &&
  /from\('announcement_reads'\)\.upsert\(/.test(CLOUD_JS));
ok('xoá hàng loạt chỉ xử lý nhóm được phép',
  /var anns = S\.announcements\.filter\(canDismissAnnouncement\)/.test(CLOUD_JS) &&
  /S\.announcements = S\.announcements\.filter\(function \(a\) \{ return !canDismissAnnouncement\(a\); \}\)/.test(CLOUD_JS));
ok('không bao giờ xoá dữ liệu gốc (không delete bảng nguồn)',
  !/from\('announcements'\)\.delete|from\('changelog'\)\.delete|from\('report_notifications'\)\.delete/.test(CLOUD_JS));
ok('xoá hàng loạt có hộp xác nhận',
  /function confirmDismissAll\(/.test(CLOUD_JS) && /Xoá tất cả thông báo\?/.test(CLOUD_JS));
ok('mục cập nhật phiên bản cũng có nút xoá (8.5.6)',
  /S\.list\.appendChild\(itemRow\(item, function \(\) \{ dismissChangelog\(entry\); \}/.test(CLOUD_JS));
ok('CSS: nút xoá có hiệu ứng chuyển trạng thái',
  /\.bkc-item-row\.is-removing \{[^}]*opacity: 0/.test(CLOUD_CSS));
ok('CSS: vùng chạm ≥ 40px trên thiết bị cảm ứng',
  /@media \(hover: none\), \(pointer: coarse\) \{[\s\S]*?\.bkc-item-del \{[^}]*width: 2\.5rem/.test(CLOUD_CSS));
ok('Edge Function có action notifications.dismiss giới hạn theo học sinh',
  /case 'notifications\.dismiss'/.test(REPORT_API) &&
  /\.update\(\{ dismissed_at: new Date\(\)\.toISOString\(\) \}\)[\s\S]{0,180}\.eq\('student_id', ctx\.studentId\)/.test(REPORT_API));
ok('migration thêm cột dismissed_at cho hai bảng trạng thái',
  exists(MIGRATION) &&
  /alter table public\.announcement_reads[\s\S]*?dismissed_at timestamptz/.test(read(MIGRATION)) &&
  /alter table public\.report_notifications[\s\S]*?dismissed_at timestamptz/.test(read(MIGRATION)));
ok('migration không tạo bảng mới',
  !/create table/i.test(read(MIGRATION)));

/* ------------------------------------------------------------------ 2 */
console.log('\n== 2. Dark Theme & Design Tokens ==');
ok('có tệp token dùng chung', /--bk-bg:\s*#0b0f14/.test(TOKENS_CSS));
[['#0b0f14', 'nền chính'], ['#111821', 'nền phụ'], ['#161f2b', 'card/panel'],
 ['#202c3a', 'hover'], ['#293646', 'viền'], ['#e8edf5', 'chữ chính'],
 ['#9aa8b8', 'chữ phụ'], ['#718096', 'chữ mờ']].forEach(([hex, label]) => {
  ok('bảng màu có ' + label + ' (' + hex + ')', new RegExp(hex, 'i').test(TOKENS_CSS));
});
ok('token cũ --bkl-* ánh xạ sang --bk-*',
  /--bkl-surface: var\(--bk-surface\)/.test(TOKENS_CSS) &&
  /--bkl-text: var\(--bk-text\)/.test(TOKENS_CSS));
ok('bk-core.css không còn mặc định nền sáng',
  !/--bkl-surface: #ffffff/.test(CORE_CSS) && !/--bkl-surface-2: #f8fafc/.test(CORE_CSS));
ok('bk-core.css không còn khối html.dark ghi đè token',
  !/^html\.dark \{$/m.test(CORE_CSS));
ok('báo cáo dùng token chung', /--bkrep-bg: var\(--bk-bg/.test(REPORT_CSS));
ok('không còn nhánh sáng tự bật bằng html:not(.dark) cho báo cáo',
  !/html:not\(\.dark\) #bkReportWin/.test(REPORT_CSS) && /html\.light #bkReportWin/.test(REPORT_CSS));
ok('trang đăng nhập /admin tối là mặc định',
  /^body\.bkadm,$/m.test(ADMIN_CSS) && !/html:not\(\.dark\) body\.bkadm/.test(ADMIN_CSS));
ok('dashboard Founder/Admin tối là mặc định',
  /\.bkc-dash \{[\s\S]{0,220}--bkc-bg: #060a14/.test(DASH_CSS));
ok('dashboard dùng html.light cho chế độ sáng',
  /html\.light \.bkc-dash \{/.test(DASH_CSS) && /html\.light \.bkc-modal \{/.test(DASH_CSS));
ok('trung tâm thông báo lấy màu từ token',
  /--bkc-n-surface: var\(--bk-surface/.test(CLOUD_CSS) &&
  /--bkc-n-text: var\(--bk-text/.test(CLOUD_CSS));
ok('bảng nổi .bkc-dark theo giao diện hiện tại (8.5.6)',
  /\.bkc-dark \{[\s\S]{0,400}--bkc-n-surface: var\(--bk-surface/.test(CLOUD_CSS) &&
  /html\.light \.bkc-dark \{/.test(CLOUD_CSS));
ok('Trợ lý AI lấy màu từ token', /--bkai-panel: var\(--bk-surface/.test(AI_CSS));
ok('trình phát nhạc lấy màu từ token', /var\(--bk-text,#e8edf5\)/.test(read('assets/bakhi/bk-music.css')));
ok('mọi trang HTML đều nạp bk-tokens.css', (function () {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'assets') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.html$/i.test(e.name)) files.push(full);
    }
  })(ROOT);
  const missing = files.filter((f) => {
    const html = fs.readFileSync(f, 'utf8');
    /* tệp rỗng có sẵn của dự án không phải trang thật */
    return html.trim() && !html.includes('assets/bakhi/bk-tokens.css');
  });
  if (missing.length) console.log('    thiếu: ' + missing.map((f) => path.relative(ROOT, f)).join(', '));
  return missing.length === 0;
})());

/* ------------------------------------------------------------------ 3 */
console.log('\n== 3. Header cửa sổ Trợ lý AI ==');
ok('header xếp hàng bằng order: tiêu đề 1, cụm nút 3', (function () {
  const title = /\.bkai-head-title \{[\s\S]{0,200}?order: 1;/.test(AI_CSS);
  const actions = /\.bkai-head-actions \{[\s\S]{0,200}?order: 3;/.test(AI_CSS);
  return title && actions;
})());
ok('cụm nút dạt phải và căn giữa dọc',
  /\.bkai-head-actions \{[\s\S]{0,220}?margin-left: auto;/.test(AI_CSS) &&
  /\.bkai-head \{[\s\S]{0,220}?align-items: center;/.test(AI_CSS));
ok('dòng phụ luôn xuống dưới, không đẩy nút X',
  /\.bkai-head-sub \{[\s\S]{0,200}?flex: 1 1 100%;/.test(AI_CSS));
ok('nút đóng chỉ có trong bảng nổi và giữ vùng chạm 44px', (function () {
  const onlyDock = /if \(S\.layout === 'dock'\) \{[\s\S]{0,320}?bkai-close/.test(AI_JS);
  const size = /\.bkai-close \{\s*width: 44px;\s*height: 44px;/.test(AI_CSS);
  return onlyDock && size;
})());
ok('đóng cửa sổ không xoá hội thoại', (function () {
  const m = AI_JS.match(/function close\(\) \{[\s\S]*?\n    \}/);
  /* close() chỉ ẩn cửa sổ: không được rỗng S.messages/S.active. */
  return !!m && !/S\.messages\s*=\s*\[\]/.test(m[0]) && !/S\.active\s*=\s*null/.test(m[0]);
})());
ok('không còn nút × cạnh nút Hỏi AI', !/bkai-launcher[\s\S]{0,400}bkai-close/.test(AI_JS));

/* ------------------------------------------------------------------ 4 */
console.log('\n== 4. Sidebar lịch sử trên điện thoại ==');
ok('có nút mở sidebar trong header (trang đầy đủ)',
  /bkai-icon-btn bkai-menu-btn/.test(AI_JS) && /menu\.id = 'bkaiMenuBtn'/.test(AI_JS));
ok('nút chỉ gắn ở layout page', /if \(S\.layout === 'page'\) \{\s*var menu = btn\('', 'bkai-icon-btn bkai-menu-btn'/.test(AI_JS));
ok('nút có aria-controls + aria-expanded',
  /aria-controls', 'bkaiSide'/.test(AI_JS) && /aria-expanded', S\.sideOpen/.test(AI_JS));
ok('CSS: sidebar off-canvas dưới 860px', (function () {
  const m = AI_CSS.match(/@media \(max-width: 860px\) \{[\s\S]*?\n\}/);
  const block = m ? m[0] : '';
  return /\.bkai-page \.bkai-side \{[\s\S]*?position: fixed;/.test(block) &&
    /transform: translateX\(-102%\)/.test(block) &&
    /\.bkai-page\.is-side-open \.bkai-side \{[\s\S]*?transform: none;/.test(block);
})());
ok('CSS: có lớp phủ và tôn trọng safe-area', (function () {
  const m = AI_CSS.match(/@media \(max-width: 860px\) \{[\s\S]*?\n\}/);
  const block = m ? m[0] : '';
  return /\.bkai-page \.bkai-side-scrim \{/.test(block) &&
    /env\(safe-area-inset-top/.test(block) && /env\(safe-area-inset-bottom/.test(block);
})());
ok('CSS: nút mở chỉ hiện trên điện thoại', /\.bkai-menu-btn \{[^}]*display: none;/.test(AI_CSS) &&
  /\.bkai-page \.bkai-menu-btn \{ display: inline-flex; \}/.test(AI_CSS));
ok('JS: mở/đóng sidebar bằng class + khoá cuộn nền',
  /S\.root\.classList\.toggle\('is-side-open', S\.sideOpen\)/.test(AI_JS) &&
  /classList\.toggle\('bkai-side-lock', S\.sideOpen\)/.test(AI_JS));
ok('JS: bấm lớp phủ đóng sidebar', /on\(scrim, 'click', function \(\) \{ setSidebar\(false\); \}\)/.test(AI_JS));
ok('JS: phím Esc đóng sidebar', /e\.key === 'Escape' && S\.sideOpen/.test(AI_JS));
ok('JS: chọn/tạo hội thoại đóng sidebar', (function () {
  const pick = /function openConversation\(id\) \{[\s\S]{0,200}?setSidebar\(false\)/.test(AI_JS);
  const create = /function startNew\(\) \{[\s\S]{0,200}?setSidebar\(false\)/.test(AI_JS);
  return pick && create;
})());
ok('desktop giữ nguyên bố cục hai cột', /\.bkai-page \.bkai-shell \{\s*display: grid;\s*grid-template-columns: 280px minmax\(0, 1fr\);/.test(AI_CSS));
ok('không tạo hệ lịch sử thứ hai (dùng S.conversations)', /S\.conversations/.test(AI_JS) &&
  !/fetch\(.*conversations/.test(AI_JS));

/* ------------------------------------------------------------------ 5 */
console.log('\n== 5. Phiên bản ==');
const VERSION = read('assets/bakhi/bk-version.js');
ok('phiên bản phát hành là 8.5.6', /app: '8\.5\.6'/.test(VERSION));
ok('Trợ lý AI báo đúng phiên bản', /version: '8\.5\.6'/.test(AI_JS));

console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
/**
 * Bá Khí 8.5.6 — QA tĩnh cho bốn nhóm thay đổi:
 *   1. Trung tâm thông báo: xoá đúng loại, ghi máy chủ trước, đồng bộ nhiều tab
 *   2. Founder Dashboard: chọn nhiều thông báo + xoá hàng loạt
 *   3. Founder Dashboard: xoá báo cáo đã hoàn thành + khu vực báo cáo mới
 *   4. Giao diện: một nguồn trạng thái theme cho mọi trang, Light Theme đầy đủ
 *
 * Chạy: node tools/qa/v856-ui.js   (không cần jsdom, không gọi mạng)
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
const DEVBOARD = read('assets/bakhi/bk-devboard.js');
const DASH_CSS = read('assets/bakhi/bk-admin-dashboard.css');
const SHELL_JS = read('assets/bakhi/bk-shell.js');
const SHELL_CSS = read('assets/bakhi/bk-shell.css');
const ADMIN_THEME = read('assets/bakhi/bk-admin-theme.js');
const TOKENS = read('assets/bakhi/bk-tokens.css');
const CORE_CSS = read('assets/bakhi/bk-core.css');
const SERVER = read('supabase/functions/admin-actions/index.ts');
const INTEGRATE = read('tools/integrate-pages.js');
const INDEX_HTML = read('index.html');
const BOOT = exists('assets/bakhi/bk-theme-boot.js') ? read('assets/bakhi/bk-theme-boot.js') : '';

/* ------------------------------------------------------------------ 1 */
console.log('\n== 1. Trung tâm thông báo (8.5.6) ==');
ok('phân loại thông báo bằng dữ liệu, không so sánh văn bản',
  /function isSessionNotice\(a\) \{[\s\S]{0,220}a\.type === 'session'/.test(CLOUD_JS) &&
  /a\.notice_kind === 'admin_session'/.test(CLOUD_JS));
ok('mọi thông báo thường (kể cả cập nhật phiên bản) xoá được',
  /function canDismissAnnouncement\(a\) \{\s*return !!a && !isSessionNotice\(a\);\s*\}/.test(CLOUD_JS));
ok('không còn chặn theo changelog_version',
  !/canDismissAnnouncement[\s\S]{0,80}changelog_version/.test(CLOUD_JS));
ok('mục cập nhật phiên bản có nút xoá riêng',
  /S\.list\.appendChild\(itemRow\(item, function \(\) \{ dismissChangelog\(entry\); \}/.test(CLOUD_JS));
ok('mốc xoá mục phiên bản lưu theo khoá riêng',
  /function changelogKey\(id\) \{ return 'changelog:' \+ id; \}/.test(CLOUD_JS));
ok('phản hồi báo cáo không có nút xoá thông thường',
  /phản hồi báo cáo KHÔNG có nút xoá thông thường/.test(CLOUD_JS) &&
  !/itemRow\(item, function \(\) \{ dismissReportNote/.test(CLOUD_JS));
ok('xoá hàng loạt không đụng phản hồi báo cáo',
  !/function dismissibleCount[\s\S]{0,200}S\.reportNotes/.test(CLOUD_JS) &&
  /var anns = S\.announcements\.filter\(canDismissAnnouncement\);/.test(CLOUD_JS) &&
  /var entries = S\.changelog\.filter\(canDismissChangelog\);/.test(CLOUD_JS));
ok('ghi máy chủ TRƯỚC rồi mới bỏ khỏi giao diện',
  (function () {
    const fn = CLOUD_JS.match(/function dismissAnnouncement\(a\) \{[\s\S]*?\n    \}/);
    if (!fn) return false;
    const body = fn[0];
    const write = body.indexOf(".from('announcement_reads').upsert(");
    /* Nhánh có hồ sơ học sinh: ghi máy chủ xong mới đánh dấu đã xoá. */
    const afterWrite = body.indexOf('rememberDismissed(a.id)', write);
    return write > -1 && afterWrite > write;
  })());
ok('xoá lỗi thì giữ thông báo và cho thử lại',
  /Không xoá được thông báo\. Hãy kiểm tra kết nối và thử lại\./.test(CLOUD_JS) &&
  /if \(S\.list\) renderPanel\(\);[\s\S]{0,120}Không xoá được thông báo/.test(CLOUD_JS));
ok('đồng bộ xoá giữa nhiều tab (storage event)',
  /addEventListener\('storage', function \(e\) \{\s*if \(!e \|\| e\.key !== NOTIFY_DISMISS_KEY\) return;/.test(CLOUD_JS));
ok('chỉ xoá bản hiển thị, không xoá dữ liệu gốc',
  !/from\('announcements'\)\.delete|from\('changelog'\)\.delete|from\('report_notifications'\)\.delete/.test(CLOUD_JS));
ok('CSS: hàng thông báo thu gọn khi xoá',
  /\.bkc-item-row\.is-removing \{[\s\S]{0,160}grid-template-rows: 0fr/.test(CLOUD_CSS));
ok('CSS: tôn trọng prefers-reduced-motion khi xoá',
  /@media \(prefers-reduced-motion: reduce\) \{\s*\.bkc-item-row \{ transition: none; \}/.test(CLOUD_CSS));
ok('CSS: nút xoá đủ lớn trên thiết bị cảm ứng',
  /@media \(hover: none\), \(pointer: coarse\) \{[\s\S]{0,160}\.bkc-item-del \{[^}]*width: 2\.5rem/.test(CLOUD_CSS));

/* ------------------------------------------------------------------ 2 */
console.log('\n== 2. Founder: chọn nhiều + xoá hàng loạt ==');
ok('có trạng thái lựa chọn thông báo',
  /selected: \{\}, busy: false/.test(DEVBOARD));
ok('mỗi dòng có checkbox chọn',
  /pick\.type = 'checkbox'/.test(DEVBOARD) && /tr\.setAttribute\('data-notif-id', a\.id\)/.test(DEVBOARD));
ok('có Chọn tất cả và Bỏ chọn',
  /btn\('Chọn tất cả'/.test(DEVBOARD) && /btn\('Bỏ chọn'/.test(DEVBOARD));
ok('hiển thị số lượng đang chọn',
  /'Đã chọn ' \+ ids\.length \+ ' thông báo'/.test(DEVBOARD));
ok('nút xoá chỉ bật khi có lựa chọn',
  /bulkDel\.disabled = ids\.length === 0 \|\| S\.notif\.busy;/.test(DEVBOARD));
ok('lựa chọn được làm mới khi danh sách đổi',
  /function loadNotifList\(\) \{[\s\S]{0,120}S\.notif\.selected = \{\};/.test(DEVBOARD));
ok('hộp xác nhận nêu rõ số lượng',
  /'Đã chọn ' \+ ids\.length \+ ' thông báo\. Bạn có chắc chắn muốn xoá ' \+/.test(DEVBOARD));
ok('báo kết quả từng phần, không báo thành công khống',
  /Đã xoá ' \+ deleted \+ '\/' \+ ids\.length \+ ' thông báo/.test(DEVBOARD));
ok('gọi action máy chủ announcements.bulkDelete',
  /api\('announcements\.bulkDelete', \{ ids: ids \}\)/.test(DEVBOARD) &&
  /case 'announcements\.bulkDelete': \{/.test(SERVER));
ok('máy chủ chỉ xoá id tồn tại và trả danh sách thất bại',
  /\.select\('id, title'\)\.in\('id', ids\)/.test(SERVER) &&
  /return json\(\{ ok: true, deleted: foundIds\.length, deletedIds: foundIds, failed: missing \}\)/.test(SERVER));
ok('máy chủ ghi nhật ký xoá hàng loạt',
  /logAction\(client, 'announcements\.bulkDelete'/.test(SERVER));

/* ------------------------------------------------------------------ 3 */
console.log('\n== 3. Founder: báo cáo cần xử lý & xoá báo cáo hoàn thành ==');
ok('khu vực thông báo báo cáo mới ở đầu tab Report',
  /function paintReportSpotlight\(host\)/.test(DEVBOARD) &&
  /spotlightHost = h\('div'\);\s*pane\.appendChild\(spotlightHost\);/.test(DEVBOARD));
ok('câu thông báo đúng khi có / không có báo cáo',
  /'Bạn có ' \+ active \+ ' báo cáo cần kiểm tra\.'/.test(DEVBOARD) &&
  /'Hiện không có báo cáo mới\.'/.test(DEVBOARD));
ok('số lượng chỉ đếm báo cáo chưa hoàn thành',
  /function reportActiveCount\(s\) \{[\s\S]{0,220}waiting_student/.test(DEVBOARD) &&
  !/reportActiveCount[\s\S]{0,220}resolved/.test(DEVBOARD));
ok('bấm khu vực thông báo lọc nhóm Cần xử lý',
  /S\.reports\.status = 'active';/.test(DEVBOARD) &&
  /\['active', 'Cần xử lý'\]/.test(DEVBOARD));
ok('máy chủ lọc active = mọi trạng thái chưa hoàn thành',
  /const REPORT_ACTIVE_STATUSES = \['new', 'pending', 'in_progress', 'waiting_student'\];/.test(SERVER) &&
  /query = query\.in\('status', REPORT_ACTIVE_STATUSES\);/.test(SERVER));
ok('chỉ báo cáo đã hoàn thành mới có nút xoá',
  /var REPORT_DELETABLE_STATUSES = \['resolved', 'closed'\];/.test(DEVBOARD) &&
  /REPORT_DELETABLE_STATUSES\.indexOf\(String\(row\.status\)\) >= 0/.test(DEVBOARD) &&
  /REPORT_DELETABLE_STATUSES\.indexOf\(String\(r\.status\)\) >= 0/.test(DEVBOARD));
ok('có hộp xác nhận xoá báo cáo',
  /function confirmDeleteReport\(id, code, title, onDone\)/.test(DEVBOARD) &&
  /Bạn có chắc chắn muốn xoá báo cáo đã hoàn thành này không\?/.test(DEVBOARD));
ok('máy chủ từ chối xoá báo cáo chưa hoàn thành',
  /case 'reports\.delete': \{/.test(SERVER) &&
  /if \(!REPORT_DELETABLE_STATUSES\.includes\(String\(row\.status\)\)\) \{/.test(SERVER) &&
  /NOT_COMPLETED/.test(SERVER));
ok('xoá báo cáo ghi nhật ký trước khi xoá',
  (function () {
    const m = SERVER.match(/case 'reports\.delete': \{[\s\S]*?return json\(\{ ok: true, deleted: 1/);
    if (!m) return false;
    return m[0].indexOf("logAction(client, 'reports.delete'") < m[0].indexOf(".from('reports').delete()");
  })());
ok('CSS: khu vực thông báo + thanh chọn nhiều có mặt',
  /\.bkc-spotlight \{/.test(DASH_CSS) && /\.bkc-bulkbar \{/.test(DASH_CSS) &&
  /\.bkc-check \{/.test(DASH_CSS));
ok('CSS: ô chọn lớn hơn trên thiết bị cảm ứng',
  /@media \(pointer: coarse\) \{[\s\S]{0,120}\.bkc-check \{ width: 1\.35rem/.test(DASH_CSS));

/* ------------------------------------------------------------------ 4 */
console.log('\n== 4. Giao diện: một nguồn theme, Light Theme đầy đủ ==');
ok('có script khởi tạo giao diện dùng chung', !!BOOT && /global\.BKThemeBoot = \{/.test(BOOT));
ok('khởi tạo đặt cả .dark/.light lẫn data-bk-theme',
  /classList\.toggle\('dark', next === 'dark'\)/.test(BOOT) &&
  /classList\.toggle\('light', next === 'light'\)/.test(BOOT) &&
  /setAttribute\('data-bk-theme', next\)/.test(BOOT));
ok('chỉ một khoá trạng thái theme = theme, đọc khoá cũ một lần',
  /var KEY = 'theme';/.test(BOOT) && /LEGACY_ADMIN_KEY = 'bkAdminTheme'/.test(BOOT));
ok('script tự đồng bộ khi tab khác đổi theme',
  /addEventListener\('storage', function \(e\) \{[\s\S]{0,120}e\.key !== KEY/.test(BOOT));
ok('integrate-pages chèn script khởi tạo cho mọi trang',
  /function ensureThemeBoot\(file, html\)/.test(INTEGRATE) &&
  /bk-theme-boot\.js/.test(INTEGRATE));
ok('mọi trang HTML nạp đúng một lần script khởi tạo giao diện', (function () {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'assets') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.html$/i.test(e.name)) files.push(full);
    }
  })(ROOT);
  const bad = files.filter((f) => {
    const html = fs.readFileSync(f, 'utf8');
    if (!html.trim()) return false;              /* tệp rỗng có sẵn của dự án */
    const n = (html.match(/bk-theme-boot\.js/g) || []).length;
    return n !== 1;
  });
  if (bad.length) console.log('    sai: ' + bad.map((f) => path.relative(ROOT, f)).join(', '));
  return bad.length === 0;
})());
ok('bk-shell áp dụng theme trên mọi trang (bỏ chặn themeCapable)',
  (function () {
    const m = SHELL_JS.match(/function applyTheme\(theme\) \{[\s\S]*?\n    \}/);
    if (!m) return false;
    return /BKThemeBoot\.apply/.test(m[0]) && !/themeCapable\(\)/.test(m[0]);
  })());
ok('bk-shell khôi phục theme lúc khởi động, không chỉ trang có #themeIcon',
  /var bootTheme = currentTheme\(\);/.test(SHELL_JS));
ok('/admin dùng chung khoá theme',
  /var KEY = 'theme';/.test(ADMIN_THEME) && /LEGACY_KEY = 'bkAdminTheme'/.test(ADMIN_THEME));
ok('trang chủ đặt cả hai lớp khi đổi giao diện',
  /function initTheme\(\) \{[\s\S]{0,600}BKThemeBoot\.apply/.test(INDEX_HTML) &&
  /window\.BKThemeBoot\.apply\(toDark \? 'dark' : 'light', true\)/.test(INDEX_HTML));
ok('token có bộ glow riêng cho hai giao diện',
  /--bk-glow:/.test(TOKENS) && /html\.light \{[\s\S]{0,900}--bk-glow:/.test(TOKENS));
ok('chuyển giao diện có transition nhưng tôn trọng reduced motion',
  /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]{0,160}html \{ transition/.test(TOKENS));
ok('bảng thông báo theo giao diện sáng',
  /html\.light \.bkc-dark \{/.test(CLOUD_CSS) && /html\.light \.bkc-gate \{/.test(CLOUD_CSS));
ok('toast hệ thống lấy màu từ token',
  /background: var\(--bk-surface-3/.test(CORE_CSS));
/* Màn hình bảo trì cố ý giữ nền đen tuyền ở cả hai giao diện (trạng thái chặn
   toàn site, không phải thành phần nằm trong trang) — maintenance-smoke giữ luật này. */
ok('màn hình bảo trì vẫn là nền đen tuyền có chủ đích',
  /\.bk-maint \{[^}]*background: #000;/.test(SHELL_CSS));

/* ------------------------------------------------------------------ 5 */
console.log('\n== 5. Phiên bản ==');
const VERSION = read('assets/bakhi/bk-version.js');
ok('phiên bản phát hành là 8.6.1', /app: '8\.6\.1'/.test(VERSION));
ok('dashboard quản trị báo đúng phiên bản', /APP_VERSION = '8\.6\.1'/.test(DEVBOARD));
ok('máy chủ báo đúng phiên bản', /SERVER_VERSION = '8\.6\.1'/.test(SERVER));

console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
process.exit(failures ? 1 : 0);

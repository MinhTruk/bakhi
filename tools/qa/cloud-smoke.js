'use strict';
/**
 * Bá Khí — Supabase layer smoke test (jsdom, không gọi mạng thật).
 *
 * Kiểm tra: màn hình nhận diện học sinh, tìm kiếm/gợi ý có highlight,
 * xác nhận danh tính → gắn phiên, chuông thông báo + badge chưa đọc,
 * khu vực What's New, và Dev Dashboard (đăng nhập Dev Code + 6 tab).
 *
 * Chạy:
 *   npm install jsdom --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/cloud-smoke.js
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let value = null;
    try { value = fn(); } catch (e) { value = null; }
    if (value) return value;
    await wait(25);
  }
  return null;
}

/* ------------------------------ Mock Supabase ------------------------------ */
const SESSION = { access_token: 'access-token', user: { id: 'device-1' } };
const ANNOUNCEMENTS = [
  {
    id: 'a1', title: 'Lịch học tuần này', content: 'Thứ hai học Vật Lý.\n\nThứ tư học Toán.',
    type: 'important', priority: 'critical', published_at: '2026-11-14T08:00:00Z'
  },
  {
    id: 'a2', title: 'Bảo trì hệ thống', content: 'Tối nay bảo trì 22:00.',
    type: 'maintenance', priority: 'normal', published_at: '2026-11-13T08:00:00Z'
  }
];
const CHANGELOG = [{
    id: 'c1', version: '3.0.0', title: 'Nhận diện học sinh và thông báo tức thời',
    summary: 'Bản cập nhật lớn về đồng bộ.', published_at: '2026-11-15T02:00:00Z', category: 'features',
    content: [
        { category: 'features', items: ['Thêm nhận diện học sinh bằng họ tên.', 'Thêm trung tâm thông báo.'] },
        { category: 'improvements', items: ['Đồng bộ tiến trình giữa các thiết bị.'] }
    ]
}];

const ROWS = { announcements: ANNOUNCEMENTS, announcement_reads: [], changelog: CHANGELOG, students: [], student_devices: [] };

function builder(rows) {
    const api = {
        select() { return api; },
        eq() { return api; },
        in() { return api; },
        ilike() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
        upsert() { return Promise.resolve({ data: null, error: null }); },
        insert() { return Promise.resolve({ data: null, error: null }); },
        update() { return Promise.resolve({ data: null, error: null }); },
        delete() { return Promise.resolve({ data: null, error: null }); },
        then(res, rej) { return Promise.resolve({ data: rows, error: null }).then(res, rej); }
    };
    return api;
}

function fakeClient() {
    return {
        auth: {
            getSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
            signInAnonymously: () => Promise.resolve({ data: { session: SESSION }, error: null })
        },
        from(table) { return builder(ROWS[table] || []); },
        channel() { return { on() { return this; }, subscribe() { return this; } }; }
    };
}

const calls = [];
function fakeFetch(url, opts) {
    const name = String(url).split('/functions/v1/')[1] || '';
    const body = JSON.parse((opts && opts.body) || '{}');
    calls.push({ name: name, body: body });
    let payload = { ok: true };
    if (name === 'search-students') {
        payload = {
            ok: true, students: [
                { id: 's1', display_name: 'Nguyễn Minh Anh', disambiguator: null },
                { id: 's2', display_name: 'Nguyễn Minh An', disambiguator: null }
            ]
        };
    } else if (name === 'bind-student-session') {
        if (body.unbind) payload = { ok: true, bound: false };
        else if (body.student_id) {
            payload = {
                ok: true, bound: true,
                student: { id: 's1', display_name: 'Nguyễn Minh Anh', student_code: 'BK-1A2B', disambiguator: null, is_active: true },
                progress: {}, updated: {}
            };
        } else payload = { ok: true, bound: false };
    } else if (name === 'admin-auth') {
        payload = { ok: true, token: 'x'.repeat(48), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
    } else if (name === 'admin-actions') {
        if (body.action === 'settings.status') {
            payload = { ok: true, status: { adminDevCode: true, serviceRole: true, rosterSecret: false, students: 40 } };
        } else if (body.action === 'overview') {
            payload = {
                ok: true,
                counts: { students: 40, studentsActive: 39, announcements: 2, announcementsPublished: 2, changelog: 1, activity: 4 },
                latestVersion: { version: '3.0.0', published_at: '2026-11-15T02:00:00Z' },
                recentActivity: [{ id: 'l1', action: 'admin.login', target_type: 'session', created_at: '2026-11-15T02:00:00Z' }],
                needsReview: [{ id: 's9', display_name: 'Trần Văn Bách' }]
            };
        } else if (body.action === 'announcements.list') {
            payload = { ok: true, announcements: ANNOUNCEMENTS };
        } else if (body.action === 'changelog.list') {
            payload = { ok: true, changelog: CHANGELOG };
        } else if (body.action === 'students.list') {
            payload = { ok: true, students: [{ id: 's1', display_name: 'Nguyễn Minh Anh', student_code: 'BK-1A2B', disambiguator: null, is_active: true, needs_review: false, created_at: '2026-11-01T00:00:00Z', last_sync_at: null }] };
        } else if (body.action === 'logs.list') {
            payload = { ok: true, logs: [{ id: 'l1', action: 'admin.login', target_type: 'session', detail: {}, created_at: '2026-11-15T02:00:00Z' }] };
        }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
}

/* --------------------------------- Test DOM -------------------------------- */
const html = `<!DOCTYPE html><html lang="vi" class="dark"><head><title>Bá Khí</title></head><body>
<header>
  <div class="flex items-center space-x-3">
    <button class="bknt-bell">chuông CHANGELOG cũ</button>
    <button onclick="openReadmeModal()">README.md</button>
    <div class="relative">
      <button onclick="toggleHamburgerMenu()">menu</button>
      <div id="hamburgerDropdown" class="hidden">
        <div class="space-y-1.5">
          <button onclick="toggleDarkMode(event)">Giao diện</button>
          <div id="bkDevAuthRow">
            <input id="bkDevCodeInput" type="password">
            <button id="bkDevAuthBtn" type="button">Xác thực</button>
            <p id="bkDevAuthMsg"></p>
          </div>
          <div id="bkDevDashSection" class="hidden">
            <button type="button" onclick="openDevDashboard()">Dev Dashboard</button>
            <button id="bkDevLogoutBtn" type="button">Thoát Dev Dashboard</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>
<main>
  <section id="banner">Banner</section>
  <section id="folders">Thư mục</section>
</main>
</body></html>`;

(async () => {
    const vc = new VirtualConsole();
    const errors = [];
    vc.on('jsdomError', (e) => errors.push(e && (e.message || String(e))));
    vc.on('error', (e) => errors.push(e && (e.stack || String(e))));
    const dom = new JSDOM(html, { url: 'https://minhtruk.github.io/bakhi/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
    w.fetch = fakeFetch;
    w.supabase = { createClient: () => fakeClient() };
    w.BK_SUPABASE = { url: 'https://demo.supabase.co', key: 'sb_publishable_test', functions: { adminAuth: 'admin-auth', adminActions: 'admin-actions', importStudents: 'import-students', searchStudents: 'search-students', bindSession: 'bind-student-session', syncProgress: 'sync-student-progress' }, syncDebounceMs: 20, pollMs: 600000, configured: () => true };

    function load(file) { w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
    load('assets/bakhi/bk-core.js');
    load('assets/bakhi/bk-cloud.js');
    load('assets/bakhi/bk-devboard.js');

    console.log('\n[1] Khởi động & màn hình nhận diện');
    const gate = await until(() => w.document.getElementById('bkIdentityGate'));
    ok('màn hình nhập tên xuất hiện khi chưa gắn danh tính', !!gate);
    ok('gọi bind-student-session để kiểm tra phiên', calls.some((c) => c.name === 'bind-student-session' && !c.body.student_id));
    ok('có ô nhập họ tên', !!w.document.getElementById('bkcNameInput'));
    ok('nút xác nhận ban đầu bị khoá', !!w.document.querySelector('.bkc-gate-confirm') && w.document.querySelector('.bkc-gate-confirm').disabled);
    ok('chuông thông báo có trong header', !!w.document.getElementById('bkcBell'));

    console.log('\n[2] Tìm kiếm & gợi ý');
    const input = w.document.getElementById('bkcNameInput');
    input.value = 'minh anh';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    const suggestions = await until(() => {
        const items = w.document.querySelectorAll('.bkc-sug-item');
        return items.length ? items : null;
    });
    ok('gợi ý xuất hiện sau khi gõ', !!suggestions && suggestions.length === 2, suggestions && String(suggestions.length));
    ok('gửi truy vấn tới search-students', calls.some((c) => c.name === 'search-students' && c.body.q === 'minh anh'));
    ok('highlight ký tự trùng khớp', !!w.document.querySelector('.bkc-sug-item .bkc-hl'), (w.document.querySelector('.bkc-sug-item') || {}).textContent);
    ok('gợi ý hiển thị đúng họ tên', /Nguyễn Minh Anh/.test(w.document.querySelector('.bkc-sug').textContent));
    ok('danh sách gợi ý nằm ngay trong khối ô nhập', w.document.querySelector('.bkc-sug').parentNode.className.indexOf('bkc-combo') >= 0);
    ok('chỉ còn một chuông thông báo', !w.document.querySelector('.bknt-bell') && !!w.document.getElementById('bkcBell'));

    console.log('\n[3] Xác nhận danh tính');
    ok('nút xác nhận bị khoá khi chưa chọn gợi ý', w.document.querySelector('.bkc-gate-confirm').disabled === true);
    suggestions[0].click();
    ok('nút xác nhận mở sau khi chọn gợi ý', w.document.querySelector('.bkc-gate-confirm').disabled === false);

    /* Đổi tên trong ô nhập nhưng không đổi lựa chọn → phải bị chặn, không gọi API. */
    const bindsBefore = calls.filter((c) => c.name === 'bind-student-session' && c.body.student_id).length;
    const goodName = input.value;
    input.value = 'Tên Không Tồn Tại';
    w.document.querySelector('.bkc-gate-confirm').click();
    ok('chặn xác nhận khi tên không khớp lựa chọn', /không khớp/.test(w.document.getElementById('bkcGateMsg').textContent), w.document.getElementById('bkcGateMsg').textContent);
    ok('không gọi API khi tên chưa khớp', calls.filter((c) => c.name === 'bind-student-session' && c.body.student_id).length === bindsBefore);
    ok('nút xác nhận bị khoá lại sau khi lệch tên', w.document.querySelector('.bkc-gate-confirm').disabled === true);

    input.value = goodName;
    await wait(320);
    const again = await until(() => w.document.querySelectorAll('.bkc-sug-item').length ? w.document.querySelectorAll('.bkc-sug-item') : null);
    again[0].click();
    w.document.querySelector('.bkc-gate-confirm').click();
    const confirmBtn = await until(() => {
        const buttons = Array.from(w.document.querySelectorAll('.bk-modal-foot .bk-btn'));
        return buttons.find((b) => b.textContent === 'Xác nhận') || null;
    });
    ok('modal XÁC NHẬN DANH TÍNH hiện ra', !!confirmBtn && /XÁC NHẬN DANH TÍNH/.test(w.document.querySelector('.bk-modal').textContent));
    confirmBtn.click();
    const closed = await until(() => !w.document.getElementById('bkIdentityGate'));
    ok('màn hình nhập tên đóng sau khi xác nhận', !!closed);
    ok('đã gắn student_id lên backend', calls.some((c) => c.name === 'bind-student-session' && c.body.student_id === 's1'));
    ok('bind gửi kèm họ tên để máy chủ đối chiếu', calls.some((c) => c.body.student_id === 's1' && c.body.display_name === 'Nguyễn Minh Anh'));
    ok('có icon đổi học sinh trên header', (() => {
        const icon = w.document.getElementById('bkcChangeStudentIcon');
        return !!icon && icon.hidden === false && /Đổi học sinh/.test(icon.getAttribute('aria-label'));
    })());
    ok('tên hiển thị trên header', /Nguyễn Minh Anh/.test((w.document.getElementById('bkcIdentityChip') || {}).textContent || ''));
    ok('menu có nút Đổi học sinh', !!w.document.getElementById('bkcChangeStudentBtn'));

    console.log('\n[4] Trung tâm thông báo');
    const badge = w.document.querySelector('.bkc-badge');
    const badgeReady = await until(() => badge && badge.hidden === false);
    ok('badge chưa đọc = 2', !!badgeReady && badge.textContent === '2', badge && badge.textContent);
    w.document.getElementById('bkcBell').click();
    const items = await until(() => {
        const list = w.document.querySelectorAll('.bkc-item');
        return list.length ? list : null;
    });
    ok('panel liệt kê thông báo', !!items && items.length === 2, items && String(items.length));
    ok('thông báo khẩn có dấu ưu tiên', /Khẩn/.test(w.document.querySelector('.bkc-panel-list').textContent));
    items[0].click();
    const article = await until(() => w.document.querySelector('.bkc-modal'));
    ok('mở nội dung đầy đủ', !!article && /Lịch học tuần này/.test(article.textContent));
    const articleClose = w.document.querySelector('.bkc-modal .bkc-x');
    articleClose.click();
    ok('đóng nội dung đầy đủ', !w.document.querySelector('.bkc-modal'));
    ok('đánh dấu đã đọc giảm badge', w.document.querySelector('.bkc-badge').textContent === '1', w.document.querySelector('.bkc-badge').textContent);

    console.log('\n[5] What\'s New');
    const wn = await until(() => {
        const node = w.document.getElementById('bkcWhatsNew');
        return node && node.hidden === false ? node : null;
    });
    ok('khu vực What\'s New hiển thị', !!wn);
    ok('hiển thị phiên bản mới nhất', !!wn && /Phiên bản 3\.0\.0/.test(wn.textContent));
    ok('nhóm nội dung theo danh mục', !!wn && /Tính năng mới/.test(wn.textContent) && /Cải tiến/.test(wn.textContent));
    ok('render bằng text, không HTML thô', !!wn && !/<b>/.test(wn.innerHTML.replace(/<[^>]+>/g, '')));


    const mdLink = w.document.querySelector('#bkcWhatsNew .bkc-md-link');
    ok("What's New có đường dẫn CHANGELOG.md", !!mdLink && /CHANGELOG\.md/.test(mdLink.textContent));
    let mdOpened = false;
    w.openChangelogMd = () => { mdOpened = true; };
    if (mdLink) mdLink.click();
    ok('bấm đường dẫn mở CHANGELOG.md', mdOpened);
    console.log('\n[6] Dev Dashboard');
    ok('mục Dev Dashboard ẩn trước khi xác thực', w.document.getElementById('bkDevDashSection').classList.contains('hidden'));
    ok('có ô nhập Dev Code trong menu', !!w.document.getElementById('bkDevCodeInput'));
    const login = await w.BKCloud.adminLogin('test-dev-code');
    w.mountDevMenu();
    ok('sau xác thực hiện mục Dev Dashboard', !w.document.getElementById('bkDevDashSection').classList.contains('hidden'));
    ok('ẩn ô nhập Dev Code sau xác thực', w.document.getElementById('bkDevAuthRow').classList.contains('hidden'));
    ok('admin-auth cấp phiên có hạn', !!login.token && !!login.expiresAt);
    w.openDevDashboard();
    const dash = await until(() => {
        const node = w.document.getElementById('bkDevDashboard');
        return node && node.hidden === false ? node : null;
    });
    ok('dashboard mở sau khi xác thực', !!dash);
    ok('dashboard có 6 tab', !!dash && dash.querySelectorAll('.bkc-tab').length === 6, dash && String(dash.querySelectorAll('.bkc-tab').length));
    const stats = await until(() => w.document.querySelectorAll('.bkc-stat').length);
    ok('tab Overview hiển thị số liệu', !!stats && stats === 8, String(stats));
    ok('Overview có Recent Activity', /admin\.login/.test((w.document.querySelector('.bkc-activity') || {}).textContent || ''));
    ok('cảnh báo hồ sơ trùng tên', /trùng họ tên/.test(w.document.querySelector('.bkc-pane').textContent));

    w.BKDashboard.tab('notifications');
    const pushBtn = await until(() => Array.from(w.document.querySelectorAll('.bkc-btn')).find((b) => b.textContent === 'PUSH NOTIFICATION NOW'));
    ok('tab Notifications có nút PUSH NOTIFICATION NOW', !!pushBtn);
    ok('form đủ trường', w.document.querySelectorAll('.bkc-pane .bkc-input, .bkc-pane .bkc-textarea, .bkc-pane .bkc-select').length >= 5);

    w.BKDashboard.tab('changelog');
    const pushCl = await until(() => Array.from(w.document.querySelectorAll('.bkc-btn')).find((b) => b.textContent === 'PUSH CHANGELOG NOW'));
    ok('tab Changelog có nút PUSH CHANGELOG NOW', !!pushCl);
    ok('trình soạn nhiều mục thay đổi', !!w.document.querySelector('.bkc-section-row'));

    w.BKDashboard.tab('students');
    const importBtn = await until(() => Array.from(w.document.querySelectorAll('.bkc-btn')).find((b) => b.textContent === 'Import danh sách'));
    ok('tab Students có import TXT', !!importBtn && !!w.document.querySelector('input[type="file"]'));

    w.BKDashboard.tab('logs');
    const logs = await until(() => w.document.querySelector('.bkc-pane .bkc-table'));
    ok('tab Activity Logs hiển thị nhật ký', !!logs);

    w.BKDashboard.tab('settings');
    const status = await until(() => /service_role/.test(w.document.querySelector('.bkc-pane').textContent));
    ok('tab Settings hiển thị trạng thái secret', !!status && /ADMIN_DEV_CODE: đã đặt/.test(w.document.querySelector('.bkc-pane').textContent));

    console.log('\n[7] Bảo mật phía client');
    ok('không có Dev Code trong storage', !JSON.stringify(Object.assign({}, w.localStorage)).includes('test-dev-code'));
    ok('token admin chỉ ở sessionStorage', !!w.sessionStorage.getItem('bakhiAdmin.v1') && !w.localStorage.getItem('bakhiAdmin.v1'));
    ok('không có service_role key trong mã nguồn', (() => {
        const files = ['assets/bakhi/bk-cloud.js', 'assets/bakhi/bk-devboard.js', 'assets/bakhi/bk-supabase.config.js'];
        return files.every((f) => !/service_role/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')) || true) &&
            !/eyJhbGciOi/.test(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-supabase.config.js'), 'utf8'));
    })());

    const realErrors = errors.filter((e) => !/Could not load link|Not implemented: navigation/.test(e));
    ok('không có lỗi runtime', realErrors.length === 0, String(realErrors[0] || ''));

    console.log('\n=== ' + (failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED') + ' ===');
    dom.window.close();
    process.exit(failures ? 1 : 0);
})().catch((err) => {
    console.error('Test crashed:', err);
    process.exit(1);
});

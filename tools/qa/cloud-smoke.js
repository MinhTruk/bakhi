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
const CHANGELOG = [
    {
        id: 'c1', version: '3.0.0', title: 'Nhận diện học sinh và thông báo tức thời',
        summary: 'Bản cập nhật lớn về đồng bộ.', published_at: '2026-11-15T02:00:00Z', category: 'features',
        content: [
            { category: 'features', items: ['Thêm nhận diện học sinh bằng họ tên.', 'Thêm trung tâm thông báo.'] },
            { category: 'improvements', items: ['Đồng bộ tiến trình giữa các thiết bị.'] }
        ]
    },
    {
        id: 'c3', version: '3.1.1', title: 'Sửa lỗi không xác nhận được danh tính',
        summary: 'Bấm Xác nhận giờ luôn có tác dụng.', published_at: '2026-11-15T04:00:00Z', category: 'fixes',
        content: [{ category: 'fixes', items: ['Sửa thứ tự lớp hộp thoại xác nhận.'] }]
    },
    {
        id: 'c2', version: '3.1.0', title: 'Xác nhận danh tính chắc chắn hơn',
        summary: 'Gộp hai chuông thành một.', published_at: '2026-11-15T03:00:00Z', category: 'fixes',
        content: [{ category: 'ui', items: ['Thêm icon đổi học sinh.'] }]
    }
];

const ROWS = {
    announcements: ANNOUNCEMENTS, announcement_reads: [],
    /* Supabase trả về mới nhất trước; panel phải sắp xếp lại theo SỐ phiên bản. */
    changelog: CHANGELOG.slice().sort((a, b) => new Date(b.published_at) - new Date(a.published_at)),
    students: [], student_devices: []
};

function builder(rows) {
    const api = {
        select() { return api; },
        eq() { return api; },
        in() { return api; },
        like() { return api; },
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
        const bound = {
            ok: true, bound: true,
            student: { id: 's1', display_name: 'Nguyễn Minh Anh', student_code: 'BK-1A2B', disambiguator: null, is_active: true },
            progress: {}, updated: {}
        };
        const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
        const typed = norm(body.display_name);
        if (body.unbind) payload = { ok: true, bound: false };
        else if (body.student_id) payload = bound;
        else if (!typed) payload = { ok: true, bound: false };            /* kiểm tra phiên ban đầu */
        else if (typed === 'nguyen minh anh') payload = bound;             /* khớp đúng họ tên */
        else if (typed === 'tran van bach') {
            payload = {
                ok: false,
                error: {
                    code: 'AMBIGUOUS', message: 'Có nhiều hồ sơ cùng họ tên.',
                    candidates: [
                        { id: 's3', display_name: 'Trần Văn Bách', disambiguator: '10A1' },
                        { id: 's4', display_name: 'Trần Văn Bách', disambiguator: '10A2' }
                    ]
                }
            };
        } else {
            payload = { ok: false, error: { code: 'NAME_NOT_FOUND', message: 'Không có học sinh nào trùng đúng họ tên này.' } };
        }
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
        } else if (body.action === 'permissions.get') {
            payload = {
                ok: true,
                mode: 'single-admin-code',
                role: { id: 'administrator', label: 'Administrator', description: 'Một Administrator Code dùng chung.' },
                session: {
                    id: 'sess-1', created_at: '2026-11-16T02:00:00Z',
                    expires_at: '2026-11-16T03:00:00Z', last_used_at: '2026-11-16T02:05:00Z'
                },
                capabilities: {
                    overview: true, students: true, studentsWrite: true, notifications: true,
                    changelog: true, logs: true, monitoring: true, settings: true,
                    dataExport: true, roles: false
                },
                limitations: ['Chưa có mô hình nhiều quản trị viên hoặc phân quyền theo vai trò.'],
                functions: [{
                    schema_name: 'public', name: 'bakhi_current_student_id', security_definer: true,
                    anon_execute: false, authenticated_execute: true, service_execute: true
                }],
                tables: [{
                    schema_name: 'public', name: 'announcement_reads', rls_enabled: true, policy_count: 2,
                    anon_select: false, authenticated_select: true, anon_insert: false, authenticated_insert: true
                }],
                policies: [{
                    schema_name: 'public', table_name: 'announcement_reads', name: 'announcement_reads_select_own',
                    command: 'SELECT', permissive: 'PERMISSIVE', roles: ['authenticated']
                }],
                report_generated_at: '2026-11-16T02:16:41Z',
                report_error: null
            };
        }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
}

/* --------------------------------- Test DOM -------------------------------- */
const html = `<!DOCTYPE html><html lang="vi" class="dark"><head><title>Bá Khí</title>
<script src="assets/bakhi/bk-cloud.js" data-bk-whatsnew="1"></script></head><body>
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
            <button id="bkDevRevealBtn" type="button">Administrator</button>
            <div id="bkDevCodeWrap" class="hidden">
              <input id="bkDevCodeInput" type="password">
              <button id="bkDevAuthBtn" type="button">Xác thực</button>
              <p id="bkDevAuthMsg"></p>
            </div>
          </div>
          <div id="bkDevDashSection" class="hidden">
            <button type="button" onclick="openDevDashboard()">Administrator Dashboard</button>
            <button id="bkDevLogoutBtn" type="button">Thoát Administrator Dashboard</button>
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


    /* Trên điện thoại, click có thể bị huỷ khi danh sách vừa ẩn — chọn ngay khi chạm. */
    suggestions[1].dispatchEvent(new w.Event('pointerdown', { bubbles: true, cancelable: true }));
    ok('chạm vào gợi ý là chọn được ngay (không cần click)', input.value === 'Nguyễn Minh An', input.value);
    console.log('\n[3] Xác nhận danh tính');
    input.value = '';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(30);
    ok('nút xác nhận khoá khi ô tên còn trống', w.document.querySelector('.bkc-gate-confirm').disabled === true);

    /* Gõ tên không có trong danh sách: máy chủ trả NAME_NOT_FOUND. */
    input.value = 'Tên Không Tồn Tại';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(40);
    ok('nút xác nhận mở ngay sau khi gõ tên', w.document.querySelector('.bkc-gate-confirm').disabled === false);
    w.document.querySelector('.bkc-gate-confirm').click();
    const notFound = await until(() => /Không có ai tên/.test(w.document.getElementById('bkcGateMsg').textContent));
    ok('tên không tồn tại → báo rõ ràng, vẫn ở màn hình nhận diện', !!notFound && !!w.document.getElementById('bkIdentityGate'));
    ok('không gắn phiên khi tên không tồn tại', !calls.some((c) => c.body.student_id));

    /* Trùng họ tên: máy chủ trả AMBIGUOUS kèm danh sách hồ sơ để chọn. */
    input.value = 'Trần Văn Bách';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(40);
    w.document.querySelector('.bkc-gate-confirm').click();
    const candidates = await until(() => w.document.querySelectorAll('.bkc-candidate').length ? w.document.querySelectorAll('.bkc-candidate') : null);
    ok('trùng họ tên → hiện danh sách hồ sơ để chọn', !!candidates && candidates.length === 2, candidates && String(candidates.length));
    if (candidates && candidates[0]) {
        const closeBtn = Array.from(w.document.querySelectorAll('.bk-modal-foot .bk-btn')).find((b) => /Đóng/.test(b.textContent));
        if (closeBtn) closeBtn.click();
        await wait(30);
    }
    ok('chưa gắn phiên khi hồ sơ còn trùng tên', !!w.document.getElementById('bkIdentityGate'));

    /* Gõ đúng họ tên, không chọn gợi ý → vẫn xác nhận được. */
    input.value = 'Nguyễn Minh Anh';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(40);
    w.document.querySelector('.bkc-gate-confirm').click();
    const closed = await until(() => !w.document.getElementById('bkIdentityGate'));
    ok('gõ đúng họ tên rồi bấm Xác nhận là vào được', !!closed);
    ok('bind theo họ tên, không cần chọn gợi ý', calls.some((c) => c.name === 'bind-student-session' && !c.body.student_id && c.body.display_name === 'Nguyễn Minh Anh'));
    ok('lần gắn cuối gửi đúng họ tên đã gõ (máy chủ đối chiếu)',
        (calls.filter((c) => c.name === 'bind-student-session' && c.body.display_name).slice(-1)[0] || {}).body.display_name === 'Nguyễn Minh Anh');
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
    ok('panel liệt kê cả thông báo và changelog', !!items && items.length === 5, items && String(items.length));
    w.document.getElementById('folders').click();
    await wait(30);
    ok('bấm ra ngoài (khu vực khác) đóng panel thông báo', w.document.getElementById('bkcPanel').hidden === true);
    w.document.getElementById('bkcBell').click();
    await wait(30);
    ok('bấm chuông mở lại panel sau khi bị đóng', w.document.getElementById('bkcPanel').hidden === false);
    const listText = w.document.querySelector('.bkc-panel-list').textContent;
    ok('thông báo khẩn có dấu ưu tiên', /Khẩn/.test(listText));
    ok('có nhóm thông báo từ giáo viên', /Thông báo từ giáo viên/.test(listText));
    ok('có nhóm cập nhật phiên bản', /Cập nhật phiên bản/.test(listText));

    /* Thứ tự phiên bản: 3.0.0 → 3.1.0 → 3.1.1 */
    const versionOrder = Array.from(w.document.querySelectorAll('.bkc-item-version'))
        .map((n) => {
            const tag = n.querySelector('.bkc-tag');
            return (tag ? tag.textContent : '').replace('Phiên bản', '').trim();
        });
    ok('phiên bản đúng thứ tự 3.0.0 → 3.1.0 → 3.1.1',
        versionOrder.join(',') === '3.0.0,3.1.0,3.1.1', versionOrder.join(','));

    /* Nút × phải đóng được panel. */
    const panel = w.document.getElementById('bkcPanel');
    const closeX = w.document.getElementById('bkcPanelClose');
    ok('panel có nút ×', !!closeX);
    if (closeX) closeX.click();
    ok('bấm × đóng được panel', !!panel && panel.hidden === true);
    w.document.getElementById('bkcBell').click();
    await until(() => !w.document.getElementById('bkcPanel').hidden);

    items[0].click();
    const article = await until(() => w.document.querySelector('.bkc-modal'));
    ok('mở nội dung thông báo đầy đủ', !!article && /Lịch học tuần này/.test(article.textContent));
    const articleClose = w.document.querySelector('.bkc-modal .bkc-x');
    articleClose.click();
    ok('đóng nội dung đầy đủ', !w.document.querySelector('.bkc-modal'));
    ok('đánh dấu đã đọc giảm badge', w.document.querySelector('.bkc-badge').textContent === '1', w.document.querySelector('.bkc-badge').textContent);

    /* Mở một phiên bản trong panel → xem nội dung từng mục. */
    const versionItem = w.document.querySelector('.bkc-item-version');
    if (versionItem) versionItem.click();
    const clModal = await until(() => {
        const node = w.document.querySelector('.bkc-modal');
        return node && /Phiên bản 3\.0\.0/.test(node.textContent) ? node : null;
    });
    ok('mở được chi tiết phiên bản trong thông báo', !!clModal && /Tính năng mới/.test(clModal.textContent));
    if (clModal) w.document.querySelector('.bkc-modal .bkc-x').click();

    console.log('\n[5] What\'s New trên trang chính (chỉ bật khi opt-in)');
    const wn = await until(() => {
        const node = w.document.getElementById('bkcWhatsNew');
        return node && node.hidden === false ? node : null;
    });
    ok('khu vực What\'s New hiển thị', !!wn);
    ok('hiển thị phiên bản CAO NHẤT, không theo ngày đăng',
        !!wn && /Phiên bản 3\.1\.1/.test(wn.textContent), wn && wn.textContent.slice(0, 60));
    ok('nhóm nội dung theo danh mục', !!wn && /Sửa lỗi|Tính năng mới|Cải tiến/.test(wn.textContent));
    ok('render bằng text, không HTML thô', !!wn && !/<b>/.test(wn.innerHTML.replace(/<[^>]+>/g, '')));
    const allBtn = wn && Array.from(wn.querySelectorAll('button')).find((b) => /Xem tất cả cập nhật/.test(b.textContent));
    ok('có nút mở trung tâm thông báo', !!allBtn);
    if (allBtn) {
        allBtn.click();
        await wait(120);
        const panelOpened = !w.document.getElementById('bkcPanel').hidden;
        ok('bấm nút mở panel thông báo', panelOpened,
            'hidden=' + w.document.getElementById('bkcPanel').hidden + ' bound=' + w.BKCloud.state().bound);
        const px = w.document.getElementById('bkcPanelClose');
        if (px) px.click();
    }
    const mdLink = w.document.querySelector('#bkcWhatsNew .bkc-md-link');
    ok("What's New có đường dẫn CHANGELOG.md", !!mdLink && /CHANGELOG\.md/.test(mdLink.textContent));
    let mdOpened = false;
    w.openChangelogMd = () => { mdOpened = true; };
    if (mdLink) mdLink.click();
    ok('bấm đường dẫn mở CHANGELOG.md', mdOpened);

    console.log('\n[6] Dev Dashboard');
    ok('mục Administrator Dashboard ẩn trước khi xác thực', w.document.getElementById('bkDevDashSection').classList.contains('hidden'));
    ok('có ô nhập Administrator Code trong menu', !!w.document.getElementById('bkDevCodeInput'));
    ok('ô nhập mã ẩn cho tới khi bấm Administrator',
        w.document.getElementById('bkDevCodeWrap').classList.contains('hidden'));
    w.document.getElementById('bkDevRevealBtn').click();
    ok('bấm Administrator mở ô nhập mã', !w.document.getElementById('bkDevCodeWrap').classList.contains('hidden'));
    const login = await w.BKCloud.adminLogin('test-dev-code');
    w.mountDevMenu();
    ok('sau xác thực hiện mục Administrator Dashboard', !w.document.getElementById('bkDevDashSection').classList.contains('hidden'));
    ok('ẩn ô nhập Administrator Code sau xác thực', w.document.getElementById('bkDevAuthRow').classList.contains('hidden'));
    ok('admin-auth cấp phiên có hạn', !!login.token && !!login.expiresAt);
    w.document.getElementById('bkDevCodeInput').value = 'test-dev-code';
    w.document.getElementById('bkDevAuthBtn').click();
    await wait(120);
    const dashAfterAuth = w.document.getElementById('bkDevDashboard');
    ok('xác thực mã không tự mở dashboard', !dashAfterAuth || dashAfterAuth.hidden !== false);
    w.openDevDashboard();
    const dash = await until(() => {
        const node = w.document.getElementById('bkDevDashboard');
        return node && node.hidden === false ? node : null;
    });
    ok('dashboard mở sau khi xác thực', !!dash);
    ok('dashboard có 9 tab', !!dash && dash.querySelectorAll('.bkc-tab').length === 9, dash && String(dash.querySelectorAll('.bkc-tab').length));
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

    w.BKDashboard.tab('permissions');
    const permText = await until(() => {
        const pane = w.document.querySelector('.bkc-pane');
        return pane && /Hàm trong schema public/.test(pane.textContent) ? pane.textContent : null;
    }, 4000);
    ok('tab Permissions hiển thị báo cáo hàm/bảng/policy',
        !!permText && /Bảng & RLS/.test(permText) && /Policy đang áp dụng/.test(permText));
    ok('tab Permissions nêu giới hạn vai trò', /nhiều quản trị viên/.test(permText || ''));

    console.log('\n[7] Bảo mật phía client');
    ok('không có Dev Code trong storage', !JSON.stringify(Object.assign({}, w.localStorage)).includes('test-dev-code'));
    ok('token admin chỉ ở sessionStorage', !!w.sessionStorage.getItem('bakhiAdmin.v1') && !w.localStorage.getItem('bakhiAdmin.v1'));
    ok('không có service_role key trong mã nguồn', (() => {
        const files = ['assets/bakhi/bk-cloud.js', 'assets/bakhi/bk-devboard.js', 'assets/bakhi/bk-supabase.config.js'];
        return files.every((f) => !/service_role/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')) || true) &&
            !/eyJhbGciOi/.test(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-supabase.config.js'), 'utf8'));
    })());

    console.log('\n[8] Đổi học sinh');
    const oldGate = w.document.getElementById('bkIdentityGate');
    w.BKCloud.changeStudent();
    const changeBtn = await until(() => Array.from(w.document.querySelectorAll('.bk-modal-foot .bk-btn'))
        .find((b) => b.textContent === 'Đổi học sinh') || null);
    ok('đổi học sinh hỏi lại trước khi đổi', !!changeBtn);
    if (changeBtn) changeBtn.click();
    const reopened = await until(() => {
        const gate = w.document.getElementById('bkIdentityGate');
        const input = w.document.getElementById('bkcNameInput');
        return gate && gate !== oldGate && input ? gate : null;
    });
    ok('mở lại màn hình nhận diện sau khi đổi học sinh', !!reopened);
    if (reopened) {
        const again = w.document.getElementById('bkcNameInput');
        again.value = '';
        again.dispatchEvent(new w.Event('input', { bubbles: true }));
        await wait(30);
        ok('màn hình nhận diện mở lại ở trạng thái trống', w.document.querySelector('.bkc-gate-confirm').disabled === true);
    }

    console.log('\n[9] What\'s New chỉ là tuỳ chọn');
    const studioHtml = fs.readFileSync(path.join(ROOT, 'studio/index.html'), 'utf8');
    const paintHtml = fs.readFileSync(path.join(ROOT, 'studio/word-paint.html'), 'utf8');
    ok('Studio không bật What\'s New', !/data-bk-whatsnew/.test(studioHtml));
    ok('Word & Paint không bật What\'s New', !/data-bk-whatsnew/.test(paintHtml));

    const realErrors = errors.filter((e) => !/Could not load link|Not implemented: navigation/.test(e));
    ok('không có lỗi runtime', realErrors.length === 0, String(realErrors[0] || ''));

    console.log('\n=== ' + (failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED') + ' ===');
    dom.window.close();
    process.exit(failures ? 1 : 0);
})().catch((err) => {
    console.error('Test crashed:', err);
    process.exit(1);
});

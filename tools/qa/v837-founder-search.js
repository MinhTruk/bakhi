#!/usr/bin/env node
/**
 * v837-founder-search.js — QA cho bản 8.3.7.
 *
 * Nguyên nhân gốc đã sửa:
 *   · Tab Gamification gọi `students.search` trên gamification-api. Action này
 *     không có trong nhánh quản trị nên rơi vào nhánh học sinh và trả
 *     `UNKNOWN_ACTION` — người dùng thấy “Hành động không hợp lệ.”.
 *     Nay gamification-api có `admin.students.search` (tìm không dấu theo
 *     `normalized_name` + `display_name`).
 *   · “Một học sinh” nhưng chưa chọn ai vẫn gọi `admin.audience.preview` →
 *     máy chủ trả `BAD_AUDIENCE`; nay chặn tại chỗ với câu tiếng Việt rõ ràng.
 *   · Nhật ký `level_set` đọc `from_level`/`to_level` không tồn tại nên hiện
 *     “undefined”; nay đọc đúng `level`, `updated`, `reason`.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/v837-founder-search.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ 1. Máy chủ */
const edge = read('supabase/functions/gamification-api/index.ts');
assert(/case 'admin\.students\.search'/.test(edge),
    'gamification-api có action admin.students.search');
assert(/function normalizeName/.test(edge),
    'máy chủ bỏ dấu tiếng Việt khi tìm học sinh');
assert(/normalized_name\.ilike\.%' \+ q \+ '%/.test(edge),
    'tìm theo tên đã chuẩn hoá (cùng cách với admin-actions)');
assert(/display_name\.ilike\.%' \+ q \+ '%/.test(edge),
    'tìm cả theo tên hiển thị');
assert(/eq\('is_active', true\)/.test(edge.split("case 'admin.students.search'")[1].split("case 'admin.students.list'")[0]),
    'chỉ trả học sinh đang hoạt động');
assert(/SEARCH_ERROR/.test(edge), 'lỗi tìm kiếm trả thông báo tiếng Việt, không lộ SQL');
assert(/audit\(client, 'level_set', \{\s*level, reason, updated/.test(edge),
    'nhật ký level_set lưu level + reason (không còn from_level/to_level)');

/* ------------------------------------------------------------ 2. Máy khách */
const mod = read('assets/bakhi/bk-founder-gamification.js');
assert(/api\('admin\.students\.search'/.test(mod),
    'mô-đun gọi admin.students.search');
assert(!/api\('students\.search'/.test(mod) && !/api\('students\.list'/.test(mod),
    'không còn gọi students.search/students.list (nhánh học sinh)');
assert(/api\('admin\.students\.list'/.test(mod),
    'chỉ lùi về admin.students.list khi máy chủ còn bản cũ');
assert(/function audienceProblem/.test(mod) && /Hãy tìm và chọn một học sinh/.test(mod),
    'chặn xem trước khi chưa chọn học sinh bằng câu tiếng Việt');
assert(/detail\.level/.test(mod) && !/detail\.from_level/.test(mod),
    'nhật ký hiển thị đúng cấp độ đã đặt');

/* --------------------------------------------------------- 3. Phiên bản */
const app = (read('assets/bakhi/bk-version.js').match(/app:\s*'([^']+)'/) || [])[1];
/* Phiên bản không ghim cứng: so với nguồn duy nhất bk-version.js. */
assert(/^\d+\.\d+\.\d+$/.test(app), 'bk-version.js khai báo phiên bản hợp lệ', String(app));
assert(new RegExp("APP_VERSION = '" + app.replace(/\./g, '\\.') + "'").test(read('assets/bakhi/bk-devboard.js')),
    'bk-devboard.js cùng phiên bản', app);
assert(new RegExp("SERVER_VERSION = '" + app.replace(/\./g, '\\.') + "'").test(read('supabase/functions/admin-actions/index.ts')),
    'admin-actions cùng phiên bản', app);
assert(new RegExp("version: '" + app.replace(/\./g, '\\.') + "'").test(read('assets/bakhi/bk-founder.js')),
    'BKFounder báo phiên bản mới', app);
assert(new RegExp("version: '" + app.replace(/\./g, '\\.') + "'").test(mod),
    'BKFounderGamification báo phiên bản mới', app);

/* --------------------------------------------------- 4. Chạy giao diện thật */
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/founder/',
    runScripts: 'outside-only'
});
const w = dom.window;
w.eval(mod);
assert(w.BKFounderGamification && typeof w.BKFounderGamification.render === 'function',
    'bk-founder-gamification.js nạp được');

const STUDENT = { id: '11111111-2222-3333-4444-555555555555', display_name: 'Minh An', student_code: 'HS01', disambiguator: '', level: 4 };
const calls = [];
const api = (action, payload) => {
    calls.push({ action, payload });
    switch (action) {
        case 'admin.students.search':
            return Promise.resolve({ ok: true, count: 1, students: [STUDENT] });
        case 'admin.students.list':
            return Promise.resolve({ ok: true, students: [STUDENT] });
        case 'admin.audience.preview':
            return Promise.resolve({ ok: true, count: 1, sample: [{ id: STUDENT.id, name: STUDENT.display_name, level: 4 }] });
        case 'admin.xp.buff.list':
            return Promise.resolve({ ok: true, buffs: [] });
        case 'admin.logs':
            return Promise.resolve({
                ok: true,
                logs: [{
                    action: 'level_set',
                    created_at: '2026-11-21T08:00:00Z',
                    detail: { level: 12, updated: 1, reason: 'Thưởng tiến độ học kỳ' }
                }]
            });
        default:
            return Promise.resolve({ ok: true });
    }
};

function makeKit(window) {
    const doc = window.document;
    const h = (tag, cls, text) => {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = String(text);
        return n;
    };
    const icon = (name) => h('i', 'fa-solid ' + name);
    const btn = (label, cls, fn, ic) => {
        const b = h('button', cls || 'bkc-btn');
        b.type = 'button';
        if (ic) b.appendChild(icon(ic));
        b.appendChild(h('span', null, label));
        b.addEventListener('click', fn);
        return b;
    };
    const input = (type, placeholder) => {
        const i = h('input', 'bkc-input');
        i.type = type;
        if (placeholder) i.placeholder = placeholder;
        return i;
    };
    const card = (title, actions, desc) => {
        const root = h('section', 'bkc-card');
        root.appendChild(h('h3', null, title));
        if (desc) root.appendChild(h('p', 'bkc-hint', desc));
        (actions || []).forEach((a) => root.appendChild(a));
        const body = h('div', 'bkc-card-body');
        root.appendChild(body);
        return { root, body };
    };
    const table = (headers) => {
        const wrap = h('div', 'bkc-table-wrap');
        const t = doc.createElement('table');
        const thead = doc.createElement('thead');
        const tr = doc.createElement('tr');
        headers.forEach((x) => tr.appendChild(h('th', null, x)));
        thead.appendChild(tr);
        t.appendChild(thead);
        const tbody = doc.createElement('tbody');
        t.appendChild(tbody);
        wrap.appendChild(t);
        return { wrap, tbody };
    };
    return {
        h, icon, btn, input, card, table,
        alertBox: (msg, tone) => h('div', 'bkc-alert ' + (tone || ''), msg),
        emptyState: (host, ic, title, sub) => {
            host.textContent = '';
            host.appendChild(h('div', 'bkc-empty', title + (sub ? ' — ' + sub : '')));
        },
        loading: (host, msg) => { host.textContent = ''; host.appendChild(h('div', 'bkc-loading', msg)); },
        toast: (msg, type) => calls.push({ action: 'toast', payload: { msg, type } }),
        api
    };
}

(async function main() {
    const pane = w.document.getElementById('host');
    w.BKFounderGamification.render(pane, makeKit(w));
    await sleep(30);

    const byText = (re) => Array.from(pane.querySelectorAll('button'))
        .filter((b) => re.test(b.textContent || ''))[0];

    /* 4.1. Chưa chọn học sinh → không gọi máy chủ */
    byText(/^Một học sinh$/).click();
    const levelInput = pane.querySelector('input[type="number"][max="100"]');
    levelInput.value = '12';
    const reason = Array.from(pane.querySelectorAll('input[type="text"]'))
        .filter((i) => /Lý do|thưởng/i.test(i.placeholder || ''))[0];
    reason.value = 'Thưởng tiến độ học kỳ';
    calls.length = 0;
    byText(/^Xem trước$/).click();
    await sleep(30);
    assert(/Hãy tìm và chọn một học sinh/.test(pane.textContent),
        'chưa chọn học sinh thì báo ngay trong thẻ, không gọi máy chủ');
    assert(!calls.some((c) => c.action === 'admin.audience.preview'),
        'không gửi admin.audience.preview khi đối tượng còn thiếu');

    /* 4.2. Tìm học sinh → chọn → xem trước */
    const searchInput = pane.querySelector('input[type="search"]');
    searchInput.value = 'minh';
    searchInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    calls.length = 0;
    byText(/^Tìm$/).click();
    await sleep(30);
    const searchCall = calls.filter((c) => /students\.(search|list)$/.test(c.action))[0];
    assert(!!searchCall && searchCall.action === 'admin.students.search',
        'nút Tìm gọi admin.students.search', searchCall && searchCall.action);
    assert(!calls.some((c) => c.action === 'students.search' || c.action === 'students.list'),
        'không gọi action thuộc nhánh học sinh');
    assert(searchCall && searchCall.payload.q === 'minh' && searchCall.payload.limit === 8,
        'gửi đúng từ khoá và giới hạn kết quả');
    assert(/Minh An/.test(pane.textContent), 'hiện kết quả tìm được');

    const result = pane.querySelector('.bkf-result');
    assert(!!result, 'kết quả là nút chọn được');
    result.click();
    await sleep(10);
    assert(/Đã chọn: Minh An/.test(pane.textContent), 'chọn học sinh cập nhật trạng thái');

    calls.length = 0;
    byText(/^Xem trước$/).click();
    await sleep(30);
    const preview = calls.filter((c) => c.action === 'admin.audience.preview')[0];
    assert(!!preview, 'sau khi chọn mới gọi admin.audience.preview');
    assert(preview && preview.payload.audience.kind === 'student' &&
        preview.payload.audience.student_id === STUDENT.id,
        'gửi đúng id học sinh đã chọn');
    assert(/Sẽ đặt cấp 12 cho 1 học sinh/.test(pane.textContent),
        'xem trước hiện số người bị ảnh hưởng');

    /* 4.3. Nhật ký level_set không còn “undefined” */
    assert(/cấp 12 · 1 học sinh · Thưởng tiến độ học kỳ/.test(pane.textContent),
        'nhật ký hiện cấp, số học sinh và lý do');
    assert(!/undefined/.test(pane.textContent), 'không còn chữ undefined trong tab');

    /* 4.4. Đổi từ khoá sau khi chọn → bỏ lựa chọn cũ */
    searchInput.value = 'an';
    searchInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    await sleep(10);
    assert(/Đang chọn: Một học sinh: —/.test(pane.textContent),
        'gõ tên khác thì bỏ lựa chọn cũ để không gửi nhầm người');

    console.log('\n' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exitCode = 1;
})().catch((err) => {
    console.error('QA lỗi không mong đợi:', err && err.message);
    process.exitCode = 1;
});

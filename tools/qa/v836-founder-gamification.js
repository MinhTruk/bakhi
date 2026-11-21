#!/usr/bin/env node
/**
 * v836-founder-gamification.js — QA cho bản 8.3.6.
 *
 * Nguyên nhân gốc đã sửa:
 *   · Migration 8.3.5 thay bakhi_owned_frames bằng danh sách 21 khung viết cứng
 *     → khung Founder đang trang bị bị coi là "chưa mở" và hồ sơ bị từ chối
 *     ("Khung avatar chưa mở nên chưa đồng bộ được").
 *   · Trang /gamification/ không nạp bk-profile.js nên hero không có avatar/khung.
 *   · Founder Dashboard chưa có tab Gamification (đặt cấp độ, buff XP).
 *
 * Kiểm tra ở đây (không cần máy chủ):
 *  1. Trang Tiến trình nạp bk-profile.js + bk-badges.js trước bk-gamification.js.
 *  2. Migration 8.3.6 đọc bảng ánh xạ khung, có buff XP và bk_gam_set_level.
 *  3. bk-cloud áp danh sách khung máy chủ trả về và chỉ báo lỗi khung một lần.
 *  4. setOwnedFrames hợp nhất hai nguồn khung (máy chủ + kho vật phẩm).
 *  5. Founder Dashboard có tab Gamification và mô-đun render được:
 *     chọn đối tượng → xem trước → xác nhận đặt cấp độ / tạo buff.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/v836-founder-gamification.js
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

/* ------------------------------------------------------------------ 1. HTML */
const gamHtml = read('gamification/index.html');
const iProfile = gamHtml.indexOf('bk-profile.js');
const iBadges = gamHtml.indexOf('bk-badges.js');
const iGam = gamHtml.indexOf('bk-gamification.js');
const iCloud = gamHtml.indexOf('bk-cloud.js');
assert(iProfile > 0 && iBadges > 0, 'trang Tiến trình nạp bk-profile.js và bk-badges.js');
assert(iProfile < iGam && iBadges < iGam, 'các mô-đun hồ sơ nạp trước bk-gamification.js');
assert(iCloud > 0, 'trang Tiến trình nạp bk-cloud (đồng bộ hồ sơ)');

for (const page of ['founder/index.html', 'admin/index.html']) {
    const html = read(page);
    assert(html.indexOf('bk-founder-gamification.js') > html.indexOf('bk-founder.js'),
        page + ' nạp mô-đun tab Gamification sau bk-founder.js');
}

/* ------------------------------------------------------------- 2. Migration */
const mig = read('supabase/migrations/20261211000000_bakhi_v836_gamification_founder_admin.sql');
assert(/join public\.bakhi_badge_frames m on m\.badge_id = sb\.badge_id/.test(mig),
    'bakhi_owned_frames đọc lại bảng ánh xạ bakhi_badge_frames');
assert(/from public\.student_profiles sp/.test(mig), 'khung đang trang bị được giữ nguyên khi nâng cấp');
assert(/create table if not exists public\.gamification_xp_buffs/.test(mig), 'có bảng buff XP theo đối tượng');
assert(/create or replace function public\.bk_gam_set_level/.test(mig), 'có hàm đặt cấp độ');
assert(/v_buff := public\.bk_gam_active_buff\(p_student\)/.test(mig), 'bk_gam_award áp hệ số buff');

/* --------------------------------------------------------------- 3. bk-cloud */
const cloud = read('assets/bakhi/bk-cloud.js');
assert(/BKProfile\.setOwnedFrames\(data\.frames\)/.test(cloud), 'bk-cloud áp danh sách khung máy chủ trả về');
assert(/S\.frameRejectedNotified/.test(cloud), 'lỗi khung chỉ thông báo một lần thay vì mỗi lần đồng bộ');

/* ------------------------------------------------------------- 4. bk-profile */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/settings/',
    runScripts: 'outside-only'
});
const w = dom.window;
w.BK = { badges: { ownedFrames: () => ['none', 'leaf', 'wreath'] } };
w.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ studentId: 'st-1', displayName: 'An' }));
w.eval(read('assets/bakhi/bk-profile.js'));
assert(typeof w.BKProfile === 'object', 'bk-profile khởi tạo được');
w.BKProfile.setOwnedFrames(['founder-genesis']);
w.BKProfile.setOwnedFrames(['celestial']);
const owned = w.BKProfile.ownedFrames();
assert(owned.indexOf('founder-genesis') !== -1 && owned.indexOf('celestial') !== -1,
    'setOwnedFrames hợp nhất nhiều nguồn, không ghi đè nguồn trước');
assert(owned.indexOf('wreath') !== -1, 'khung từ badge vẫn còn sau khi hợp nhất');

/* -------------------------------------------- 5. Founder Gamification module */
const found = read('assets/bakhi/bk-founder.js');
assert(/\[\s*'gamification',\s*'Gamification'/.test(found), 'Founder Dashboard có tab Gamification');
assert(/else if \(name === 'gamification'\) tabGamification/.test(found), 'tab Gamification có tuyến render riêng');
assert(/version: '8\.3\.6'/.test(found), 'BKFounder báo phiên bản 8.3.6');
const devboard = read('assets/bakhi/bk-devboard.js');
assert(/gamificationApi: gamificationAdminApi/.test(devboard),
    'dashboard truyền gamification-api cho tab Gamification (không dùng admin-actions)');
assert(/kit\.gamificationApi \|\| kit\.api/.test(read('assets/bakhi/bk-founder-gamification.js')),
    'mô-đun ưu tiên gamificationApi');

const dom2 = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/founder/',
    runScripts: 'outside-only'
});
const w2 = dom2.window;
w2.eval(read('assets/bakhi/bk-founder-gamification.js'));
assert(w2.BKFounderGamification && typeof w2.BKFounderGamification.render === 'function',
    'mô-đun BKFounderGamification export render()');

const calls = [];
const api = (action, payload) => {
    calls.push({ action, payload });
    if (action === 'admin.audience.preview') {
        return Promise.resolve({ ok: true, count: 3, sample: [{ id: 'a', name: 'An', level: 2 }] });
    }
    if (action === 'admin.level.set') return Promise.resolve({ ok: true, level: 12, updated: 3, failed: [] });
    if (action === 'admin.xp.buff') return Promise.resolve({ ok: true, ends_at: '2026-11-23T00:00:00Z' });
    if (action === 'admin.xp.buff.list') return Promise.resolve({ ok: true, buffs: [] });
    if (action === 'admin.logs') return Promise.resolve({ ok: true, logs: [] });
    return Promise.resolve({ ok: true });
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
    const pane = w2.document.getElementById('host');
    w2.BKFounderGamification.render(pane, makeKit(w2));
    await sleep(30);
    const text = pane.textContent;
    assert(/Đối tượng nhận/.test(text), 'có thẻ chọn đối tượng');
    assert(/Đặt cấp độ/.test(text), 'có thẻ đặt cấp độ');
    assert(/Buff XP/.test(text), 'có thẻ buff XP');
    assert(/Buff đã tạo/.test(text), 'có danh sách buff đã tạo');
    assert(/Toàn bộ học sinh đang hoạt động/.test(text), 'mặc định chọn toàn bộ học sinh');

    const byText = (re) => Array.from(pane.querySelectorAll('button'))
        .filter((b) => re.test(b.textContent || ''))[0];

    const oneStudent = byText(/^Một học sinh$/);
    assert(!!oneStudent, 'có nút chọn một học sinh');
    oneStudent.click();
    const searchInput = pane.querySelector('input[type="search"]');
    assert(searchInput && searchInput.closest('.bkf-aud-sub').hidden === false,
        'chọn “Một học sinh” mở ô tìm kiếm');

    const levelInput = pane.querySelector('input[type="number"][max="100"]');
    levelInput.value = '12';
    const reason = Array.from(pane.querySelectorAll('input[type="text"]'))
        .filter((i) => /Lý do|thưởng/i.test(i.placeholder || ''))[0];
    reason.value = 'Thưởng tiến độ học kỳ';
    byText(/Xem trước$/).click();
    await sleep(30);

    const previewCall = calls.filter((c) => c.action === 'admin.audience.preview')[0];
    assert(!!previewCall, 'bấm Xem trước gọi admin.audience.preview');
    assert(previewCall.payload.audience.kind === 'student', 'đối tượng gửi lên đúng kiểu đã chọn');
    assert(/Sẽ đặt cấp 12 cho 3 học sinh/.test(pane.textContent), 'xem trước hiện số người bị ảnh hưởng');

    const confirm = byText(/Xác nhận đặt cấp 12/);
    assert(!!confirm, 'chỉ sau khi xem trước mới có nút xác nhận');
    confirm.click();
    await sleep(30);
    const setCall = calls.filter((c) => c.action === 'admin.level.set')[0];
    assert(!!setCall && setCall.payload.level === 12, 'xác nhận gọi admin.level.set với cấp đã chọn');
    assert(/Đã đặt cấp 12 cho 3 học sinh/.test(pane.textContent), 'báo kết quả đặt cấp độ');

    byText(/Xem trước buff/).click();
    await sleep(30);
    const buffPreview = byText(/Xác nhận tạo buff/);
    assert(!!buffPreview, 'buff XP cũng có bước xem trước + xác nhận');
    buffPreview.click();
    await sleep(30);
    const buffCall = calls.filter((c) => c.action === 'admin.xp.buff')[0];
    assert(!!buffCall, 'xác nhận gọi admin.xp.buff');
    assert(buffCall.payload.multiplier >= 1.1 && buffCall.payload.hours >= 1,
        'buff gửi hệ số và thời hạn hợp lệ');
    assert(buffCall.payload.audience && buffCall.payload.audience.kind, 'buff gửi kèm đối tượng');

    console.log('\n' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exitCode = 1;
})().catch((err) => {
    console.error('QA lỗi không mong đợi:', err && err.message);
    process.exitCode = 1;
});

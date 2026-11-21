#!/usr/bin/env node
/**
 * v838-gamification.js — QA cho bản 8.3.8.
 *
 * Kiểm tra bốn nhóm việc thật:
 *   1. Database: điều kiện cây kỹ năng mới, số lượng vật phẩm, hàm trao tặng
 *      và việc bk_gam_set_level / bk_gam_adjust gọi bk_gam_evaluate.
 *   2. Edge Function: các action Founder mới, kiểm tra scope phía máy chủ,
 *      xác nhận trước khi cấp trọn cây, chặn vòng lặp node.
 *   3. Trang /skills/ và giao diện: nạp đúng mô-đun, có zoom/kéo/tìm kiếm,
 *      chi tiết thành tựu có tiến độ và điều kiện còn thiếu.
 *   4. Chạy thật trong jsdom: BKFounderGrants gọi đúng action và bk-skills
 *      dựng sơ đồ từ dữ liệu máy chủ (không tự tính trạng thái).
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/v838-gamification.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ 1. Database */
const mig = read('supabase/migrations/20261212000000_bakhi_v838_gamification_overhaul.sql');
assert(/create table if not exists public\.skill_branches/.test(mig),
    'migration tạo bảng nhánh kỹ năng (không hardcode 5 nhánh ở client)');
assert(/add column if not exists min_level/.test(mig) &&
    /add column if not exists required_missions/.test(mig) &&
    /add column if not exists required_achievements/.test(mig),
    'node kỹ năng có điều kiện cấp độ / nhiệm vụ / thành tựu');
assert(/add column if not exists pos_x/.test(mig) && /add column if not exists pos_y/.test(mig),
    'node có toạ độ hiển thị cho sơ đồ cây');
assert(/add column if not exists quantity integer not null default 1/.test(mig),
    'kho vật phẩm có số lượng sở hữu');
assert(/create or replace function public\.bk_gam_node_blockers/.test(mig),
    'máy chủ trả danh sách điều kiện còn thiếu của node');
assert(/v_eval := public\.bk_gam_evaluate\(p_student, 0\);/.test(
    mig.split('create or replace function public.bk_gam_set_level')[1].split('create or replace function public.bk_gam_adjust')[0]),
    'đặt cấp độ gọi bk_gam_evaluate trong cùng transaction (sửa lỗi thành tựu)');
assert(/v_eval := public\.bk_gam_evaluate\(p_student, 0\);/.test(
    mig.split('create or replace function public.bk_gam_adjust')[1].split('create or replace function public.bk_gam_grant_items')[0]),
    'buff/trừ XP cũng đánh giá lại thành tựu mốc cấp');
assert(/create or replace function public\.bk_gam_grant_skill_tree/.test(mig),
    'có hàm cấp trọn cây kỹ năng, không xoá tiến trình cũ');
assert(/create or replace function public\.bk_gam_grant_items/.test(mig),
    'có hàm trao vật phẩm có số lượng và giới hạn');
assert(/create or replace function public\.bk_gam_grant_achievements/.test(mig),
    'có hàm trao thành tựu, bỏ qua thành tựu đã sở hữu');
assert(/missions_completed/.test(mig), 'chỉ số nhiệm vụ hoàn thành dùng được trong điều kiện');
assert(/'mission', 'activity', 'discovery', 'gamification'/.test(mig),
    'mở rộng nhóm thành tựu theo yêu cầu 8.3.8');
assert(/create or replace function public\.bk_gam_tree_issues/.test(mig),
    'có hàm kiểm tra cấu trúc cây (vòng lặp, tham chiếu thiếu)');
assert(/ach-skill-all/.test(mig) && /ach-mission-50/.test(mig) && /title-master/.test(mig),
    'seed thêm thành tựu và vật phẩm thật (không tạo rỗng)');

/* -------------------------------------------------------- 2. Edge Function */
const edge = read('supabase/functions/gamification-api/index.ts');
['admin.students.detail', 'admin.items.catalog', 'admin.items.preview', 'admin.items.grant',
 'admin.achievements.catalog', 'admin.achievements.preview', 'admin.achievements.grant',
 'admin.skilltree.preview', 'admin.skilltree.grant', 'admin.grants.history',
 'admin.node.delete', 'admin.branch.save', 'admin.branch.delete', 'admin.skilltree.validate'
].forEach(function (action) {
    assert(new RegExp("case '" + action.replace(/\./g, '\\.') + "'").test(edge), 'gamification-api có ' + action);
});
assert(/admin\.items\.grant', 'admin\.achievements\.grant',\s*'admin\.skilltree\.grant', 'admin\.grants\.history'/.test(edge),
    'các action trao tặng nằm trong danh sách chỉ Founder');
assert(/if \(scope !== 'founder'\) return fail\(403, 'FOUNDER_ONLY'/.test(edge),
    'máy chủ kiểm tra scope Founder (không chỉ ẩn nút)');
assert(/body\.confirm !== true/.test(edge),
    'cấp trọn cây kỹ năng bắt buộc xác nhận phía máy chủ');
assert(/function hasCycle/.test(edge) && /'CYCLE'/.test(edge),
    'máy chủ chặn cấu hình node tạo vòng lặp');
assert(/bk_gam_details/.test(edge), 'API ghép chi tiết điều kiện vào trạng thái');

/* ------------------------------------------------------------- 3. Giao diện */
const gam = read('assets/bakhi/bk-gamification.js');
assert(/condition_detail/.test(gam) && /Còn thiếu:/.test(gam),
    'chi tiết thành tựu hiện tiến độ và điều kiện còn thiếu');
assert(/item\.how/.test(gam) && /item\.use/.test(gam),
    'chi tiết vật phẩm có cách nhận và công dụng');
assert(/branch_defs/.test(gam) && /blockers/.test(gam),
    'cây kỹ năng đọc nhánh và điều kiện còn thiếu từ máy chủ');
assert(/bkg-tree-canvas/.test(gam) && /bkg-tree-line/.test(gam),
    'trang Tiến trình có sơ đồ cây trực quan');

assert(exists('skills/index.html'), 'có trang /skills/ riêng');
const skillsHtml = read('skills/index.html');
assert(/bk-skills\.js/.test(skillsHtml) && /bk-skills\.css/.test(skillsHtml),
    'trang /skills/ nạp đúng mô-đun và CSS');
const skillsJs = read('assets/bakhi/bk-skills.js');
['pointerdown', 'wheel', 'resetView', 'zoomBy', 'search', 'data-node-id'].forEach(function (token) {
    assert(skillsJs.indexOf(token) >= 0, 'trang cây kỹ năng có ' + token);
});
assert(/STATUS_LABELS\[n\.status\]/.test(skillsJs) && /n\.blockers/.test(skillsJs),
    'trạng thái node lấy từ máy chủ, không tự suy ra');
assert(/bkSkillsRoot/.test(read('skills/index.html')), 'trang có vùng gắn ứng dụng');

const founderGrant = read('assets/bakhi/bk-founder-grants.js');
assert(/admin\.skilltree\.grant/.test(founderGrant) && /admin\.items\.grant/.test(founderGrant) &&
    /admin\.achievements\.grant/.test(founderGrant),
    'mô-đun Founder gọi đúng ba action trao tặng');
assert(/admin\.node\.save/.test(founderGrant) && /admin\.branch\.save/.test(founderGrant) &&
    /admin\.skilltree\.validate/.test(founderGrant),
    'Founder cấu hình node/nhánh và kiểm tra cấu trúc cây');
assert(/bk-founder-grants\.js/.test(read('founder/index.html')),
    'trang Founder nạp mô-đun trao tặng');
assert(/sectionGamificationBadges/.test(read('assets/bakhi/bk-founder.js')),
    'tab Thành tích có khu trao badge Gamification');
assert(/'skills\/'/.test(read('assets/bakhi/bk-shell.js')),
    'menu tài khoản có lối vào Cây kỹ năng');

/* ------------------------------------ 4. Chạy thật trong jsdom: Founder */
function makeKit(window, api) {
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
        tbody = doc.createElement('tbody');
        t.appendChild(tbody);
        wrap.appendChild(t);
        return { wrap, tbody };
    };
    let tbody = null;
    return {
        h, icon, btn, input, card, table,
        alertBox: (msg, tone) => h('div', 'bkc-alert ' + (tone || ''), msg),
        emptyState: (host, ic, title, sub) => {
            host.textContent = '';
            host.appendChild(h('div', 'bkc-empty', title + (sub ? ' — ' + sub : '')));
        },
        loading: (host, msg) => { host.textContent = ''; host.appendChild(h('div', 'bkc-loading', msg)); },
        toast: () => {},
        api: api,
        gamificationApi: api
    };
}

(async function main() {
    const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/founder/',
        runScripts: 'outside-only'
    });
    const w = dom.window;
    w.eval(founderGrant);
    assert(w.BKFounderGrants && typeof w.BKFounderGrants.render === 'function',
        'bk-founder-grants.js nạp được trong trình duyệt giả lập');

    const STUDENT = {
        id: '11111111-2222-3333-4444-555555555555',
        display_name: 'Minh An', level: 6
    };
    const calls = [];
    const api = (action, payload) => {
        calls.push({ action, payload });
        switch (action) {
            case 'admin.items.catalog':
                return Promise.resolve({ ok: true, items: [
                    { id: 'theme-dawn', kind: 'theme', name: 'Giao diện Bình Minh', description: 'Tông sáng', icon: 'fa-sun', rarity: 'uncommon', owned: 1, max_quantity: 1 },
                    { id: 'theme-christmas', kind: 'theme', name: 'Giao diện Giáng Sinh', description: 'Tuyết rơi', icon: 'fa-tree', rarity: 'legendary', owned: 0, max_quantity: 1 },
                    { id: 'deco-lantern', kind: 'decoration', name: 'Đèn Lồng', description: 'Trang trí', icon: 'fa-lightbulb', rarity: 'rare', owned: 0, max_quantity: 3 }
                ] });
            case 'admin.items.preview':
                return Promise.resolve({ ok: true, student: STUDENT, items: [
                    { item_id: 'deco-lantern', name: 'Đèn Lồng', quantity: 2, before: 0, after: 2, max_quantity: 3 }
                ] });
            case 'admin.items.grant':
                return Promise.resolve({ ok: true, student: STUDENT, result: { granted: [{ item_id: 'deco-lantern', quantity: 2 }], skipped: [] } });
            case 'admin.achievements.catalog':
                return Promise.resolve({ ok: true, achievements: [
                    { id: 'ach-level-5', name: 'Cấp 5', description: 'Đạt cấp 5', category: 'milestone', rarity: 'uncommon', icon: 'fa-arrow-up', stages: 1, owned_stages: 0 },
                    { id: 'ach-boss-1', name: 'Người vượt ải', description: 'Vượt Boss', category: 'boss', rarity: 'rare', icon: 'fa-dragon', stages: 1, owned_stages: 1 }
                ] });
            case 'admin.achievements.preview':
                return Promise.resolve({ ok: true, student: STUDENT, achievements: [{ id: 'ach-level-5', name: 'Cấp 5', stages: 1, owned_stages: 0 }] });
            case 'admin.achievements.grant':
                return Promise.resolve({ ok: true, student: STUDENT, result: { granted: [{ id: 'ach-level-5', stage: 1 }], skipped: [] } });
            case 'admin.skilltree.preview':
                return Promise.resolve({ ok: true, student: STUDENT, total: 4, completed: 1, remaining: 3, nodes: [
                    { id: 'knowledge-1', name: 'Nền tảng', status: 'completed' },
                    { id: 'knowledge-2', name: 'Ôn luyện', status: 'locked' }
                ] });
            case 'admin.skilltree.grant':
                return Promise.resolve({ ok: true, student: STUDENT, result: { granted: 3, already_completed: 1, evaluation: { achievements: [{ id: 'ach-level-5' }] } } });
            case 'admin.grants.history':
                return Promise.resolve({ ok: true, rows: [], total: 0 });
            case 'admin.defs.list':
                return Promise.resolve({ ok: true, nodes: [], branches: [], achievements: [], missions: [], rewards: [], challenges: [] });
            default:
                return Promise.resolve({ ok: true });
        }
    };

    const pane = w.document.getElementById('host');
    w.BKFounderGrants.render(pane, makeKit(w, api), {
        getStudent: () => STUDENT.id,
        getStudentName: () => STUDENT.display_name,
        onChanged: () => {}
    });
    await sleep(40);

    const byText = (re) => Array.from(pane.querySelectorAll('button'))
        .filter((b) => re.test(b.textContent || ''))[0];

    /* 4.1 Cấp trọn cây kỹ năng: xem trước → xác nhận */
    calls.length = 0;
    byText(/Xem trước cây kỹ năng/).click();
    await sleep(40);
    assert(calls.some((c) => c.action === 'admin.skilltree.preview' && c.payload.student_id === STUDENT.id),
        'xem trước cây gửi đúng học sinh');
    const confirmNode = byText(/Xác nhận cấp 3 node/);
    assert(!!confirmNode, 'chỉ hiện nút xác nhận số node còn thiếu');
    if (confirmNode) {
        confirmNode.click();
        await sleep(40);
        const grant = calls.filter((c) => c.action === 'admin.skilltree.grant').pop();
        assert(grant && grant.payload.confirm === true && grant.payload.student_id === STUDENT.id,
            'cấp trọn cây gửi confirm=true và đúng học sinh');
        assert(/Đã cấp 3 node/.test(pane.textContent), 'báo lại số node đã cấp thật');
    }

    /* 4.2 Trao vật phẩm: chọn → xem trước → xác nhận */
    const itemTile = Array.from(pane.querySelectorAll('.bkf-item'))
        .filter((b) => /Đèn Lồng/.test(b.textContent))[0];
    assert(!!itemTile, 'kho vật phẩm hiện trong thẻ Founder');
    if (itemTile) {
        itemTile.click();
        await sleep(20);
        calls.length = 0;
        byText(/Xem trước trao vật phẩm/).click();
        await sleep(40);
        assert(calls.some((c) => c.action === 'admin.items.preview'), 'xem trước vật phẩm gọi máy chủ');
        const confirmItem = byText(/Xác nhận trao 1 vật phẩm/);
        assert(!!confirmItem, 'có bước xác nhận trước khi trao vật phẩm');
        if (confirmItem) {
            confirmItem.click();
            await sleep(40);
            const granted = calls.filter((c) => c.action === 'admin.items.grant').pop();
            assert(granted && granted.payload.items[0].item_id === 'deco-lantern' &&
                granted.payload.items[0].quantity === 1,
                'trao vật phẩm gửi đúng mã và số lượng');
        }
    }

    /* 4.3 Trao thành tựu */
    const achTile = Array.from(pane.querySelectorAll('.bkf-item'))
        .filter((b) => /^Cấp 5/.test(b.textContent || ''))[0];
    assert(!!achTile, 'bộ sưu tập thành tựu hiện trong thẻ Founder');
    if (achTile) {
        achTile.click();
        await sleep(20);
        calls.length = 0;
        byText(/Xem trước trao thành tựu/).click();
        await sleep(40);
        const confirmAch = byText(/Xác nhận trao 1 thành tựu/);
        assert(!!confirmAch, 'có bước xác nhận trước khi trao thành tựu');
        if (confirmAch) {
            confirmAch.click();
            await sleep(40);
            const granted = calls.filter((c) => c.action === 'admin.achievements.grant').pop();
            assert(granted && granted.payload.ids[0] === 'ach-level-5', 'trao thành tựu gửi đúng mã');
        }
    }

    /* 4.4 Give Themes: chọn → xem trước → xác nhận */
    const themeCard = Array.from(pane.querySelectorAll('section.bkc-card'))
        .filter((s) => /Give Themes/.test(s.textContent || ''))[0];
    const themeTile = themeCard && Array.from(themeCard.querySelectorAll('.bkf-item'))
        .filter((b) => /Giáng Sinh/.test(b.textContent || ''))[0];
    assert(!!themeTile, 'thẻ Give Themes hiện giao diện chưa sở hữu');
    if (themeTile) {
        themeTile.click();
        await sleep(20);
        calls.length = 0;
        byText(/Xem trước trao giao diện/).click();
        await sleep(40);
        assert(calls.some((c) => c.action === 'admin.items.preview' &&
            (c.payload.items || []).some((i) => i.item_id === 'theme-christmas')),
            'xem trước giao diện gửi đúng mã');
        const confirmTheme = byText(/Xác nhận trao 1 giao diện/);
        assert(!!confirmTheme, 'có bước xác nhận trước khi trao giao diện');
        if (confirmTheme) {
            confirmTheme.click();
            await sleep(40);
            const granted = calls.filter((c) => c.action === 'admin.items.grant').pop();
            assert(granted && granted.payload.items[0].item_id === 'theme-christmas' &&
                granted.payload.items[0].quantity === 1,
                'trao giao diện gửi đúng mã và số lượng');
        }
    }

    /* -------------------------------------- 5. Chạy thật trong jsdom: /skills/ */
    const dom2 = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/skills/',
        runScripts: 'outside-only'
    });
    const w2 = dom2.window;
    w2.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ id: STUDENT.id }));
    const nodes = [
        { id: 'knowledge-1', branch: 'knowledge', name: 'Nền tảng', description: 'Bắt đầu', icon: 'fa-book', metric: 'lesson_study', target: 3, metric_value: 3, progress: 100, status: 'completed', pos_x: 0, pos_y: 0, requires: [], blockers: [], min_level: 1, sort_order: 10 },
        { id: 'knowledge-2', branch: 'knowledge', name: 'Ôn luyện', description: 'Tiếp theo', icon: 'fa-brain', metric: 'quiz_completed', target: 5, metric_value: 2, progress: 40, status: 'available', pos_x: 0, pos_y: 140, requires: ['knowledge-1'], blockers: [], min_level: 1, sort_order: 20 },
        { id: 'knowledge-3', branch: 'knowledge', name: 'Vững kiến thức', description: 'Khó', icon: 'fa-gem', metric: 'quiz_completed', target: 15, metric_value: 2, progress: 13, status: 'locked', pos_x: 0, pos_y: 280, requires: ['knowledge-2'], blockers: [{ kind: 'node', id: 'knowledge-2', label: 'Chưa mở kỹ năng: Ôn luyện' }], min_level: 3, sort_order: 30 }
    ];
    let stateCalls = 0;
    w2.BKCloud = {
        gamificationApi: function () {
            stateCalls++;
            return Promise.resolve({
                ok: true,
                state: {
                    nodes: nodes,
                    branch_defs: [{ id: 'knowledge', name: 'Kiến thức', icon: 'fa-book-open' }],
                    catalog: []
                }
            });
        }
    };
    w2.eval(skillsJs);
    assert(w2.BKSkills && typeof w2.BKSkills.mount === 'function', 'bk-skills.js nạp được');
    w2.BKSkills.mount('root');
    await sleep(60);
    const host = w2.document.getElementById('root');
    assert(stateCalls === 1, 'trang cây kỹ năng gọi đúng một lần state');
    assert(host.querySelectorAll('.bks-node').length === 3, 'dựng đủ 3 node từ dữ liệu máy chủ');
    assert(host.querySelectorAll('.bks-line').length === 2, 'vẽ đường nối giữa các node tiên quyết');
    assert(host.querySelectorAll('.bks-node.is-locked').length === 1, 'giữ nguyên trạng thái khoá do máy chủ trả');
    const nodeBtn = host.querySelector('.bks-node.is-available');
    if (nodeBtn) nodeBtn.click();
    await sleep(20);
    assert(/Ôn luyện/.test(host.textContent) && /Điều kiện chỉ số/.test(host.textContent),
        'bấm node mở bảng chi tiết với điều kiện');
    const zoomIn = Array.from(host.querySelectorAll('button'))
        .filter((b) => /Phóng to/.test(b.getAttribute('aria-label') || ''))[0];
    const before = host.querySelector('#bksCanvas').style.transform;
    if (zoomIn) zoomIn.click();
    assert(host.querySelector('#bksCanvas').style.transform !== before,
        'nút phóng to thay đổi tỉ lệ sơ đồ');

    /* Không nhận diện: không gọi máy chủ */
    const dom3 = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/skills/',
        runScripts: 'outside-only'
    });
    let calls3 = 0;
    dom3.window.BKCloud = { gamificationApi: function () { calls3++; return Promise.resolve({ ok: true }); } };
    dom3.window.eval(skillsJs);
    dom3.window.BKSkills.mount('root');
    await sleep(20);
    assert(calls3 === 0, 'chưa nhận diện thì không gọi gamification-api');
    assert(/Chưa nhận diện học sinh/.test(dom3.window.document.getElementById('root').textContent),
        'hướng dẫn nhận diện bằng tiếng Việt');

    console.log('\n' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exitCode = 1;
})();

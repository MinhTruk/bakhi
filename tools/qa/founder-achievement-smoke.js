#!/usr/bin/env node
/**
 * founder-achievement-smoke.js — tab Thành tích / Boss dành cho người không
 * biết lập trình (8.3.5).
 *
 * Kiểm tra:
 *  1. Mở form tạo thành tựu không cần JSON, có nhóm bước rõ ràng.
 *  2. Gõ tên → mã tự sinh (Ma Vương → ma_vuong) trong “Cài đặt nâng cao”.
 *  3. Mã trùng → cảnh báo + đề xuất ma_vuong_2 + nút dùng ngay.
 *  4. Xem trước cập nhật theo tên/điều kiện.
 *  5. Lưu gửi expect_new đúng (máy chủ chặn ghi đè).
 *  6. Boss: gõ tên → mã Boss tự sinh; lưu gửi expect_new.
 *  7. Có nút Tạm ngừng / Xóa và lỗi tiếng Việt.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/founder-achievement-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-devboard-gamification.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const DEFS = {
    achievements: [{
        id: 'ma_vuong', name: 'Ma Vương', description: 'Vượt 1000 XP',
        icon: 'fa-crown', rarity: 'legendary', category: 'mastery',
        conditions: [{ metric: 'xp_total', target: 1000 }], stages: 1,
        reward: { items: ['frame-laurel'] }, is_active: true, is_hidden: false, sort_order: 0
    }],
    missions: [], nodes: [], rewards: [], challenges: []
};

function makeKit(w) {
    const doc = w.document;
    const apiCalls = [];
    function h(tag, cls, text) {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = String(text);
        return n;
    }
    const kit = {
        h,
        apiCalls,
        icon(name) { const i = h('i', 'fa-solid ' + name); return i; },
        btn(label, cls, onClick, iconName) {
            const b = h('button', 'bkc-btn ' + (cls || ''));
            b.type = 'button';
            if (iconName) b.appendChild(kit.icon(iconName));
            b.appendChild(h('span', null, label));
            b.addEventListener('click', onClick);
            return b;
        },
        card(title, actions, subtitle) {
            const root = h('div', 'bkc-card');
            root.setAttribute('data-title', title);
            const head = h('div', 'bkc-card-head');
            head.appendChild(h('h3', null, title));
            (actions || []).forEach((a) => head.appendChild(a));
            root.appendChild(head);
            if (subtitle) root.appendChild(h('p', 'bkc-hint', subtitle));
            const body = h('div');
            root.appendChild(body);
            return { root, body };
        },
        table(headers) {
            const wrap = h('div');
            const table = h('table');
            const thead = h('thead');
            const tr = h('tr');
            headers.forEach((x) => tr.appendChild(h('th', null, x)));
            thead.appendChild(tr);
            table.appendChild(thead);
            const tbody = h('tbody');
            table.appendChild(tbody);
            wrap.appendChild(table);
            return { wrap, tbody };
        },
        emptyRow(tbody, cols, text) {
            const tr = h('tr');
            const td = h('td', null, text);
            td.setAttribute('colspan', String(cols));
            tr.appendChild(td);
            tbody.appendChild(tr);
        },
        fieldRow(label, control, hint) {
            const row = h('div', 'bkc-field');
            row.appendChild(h('label', null, label));
            row.appendChild(control);
            if (hint) row.appendChild(h('p', 'bkc-hint', hint));
            return row;
        },
        input(type, ph, value) {
            const i = h('input');
            i.type = type || 'text';
            i.placeholder = ph || '';
            i.value = value == null ? '' : value;
            return i;
        },
        textarea(ph, value, rows) {
            const t = h('textarea');
            t.placeholder = ph || '';
            t.value = value || '';
            t.rows = rows || 4;
            return t;
        },
        checkbox(label, checked, onChange) {
            const root = h('label', 'bkc-check');
            const input = h('input');
            input.type = 'checkbox';
            input.checked = !!checked;
            if (onChange) input.addEventListener('change', () => onChange(input.checked));
            root.appendChild(input);
            root.appendChild(h('span', null, label));
            return { root, input };
        },
        alertBox(text, kind) { return h('div', 'bkc-alert is-' + (kind || 'info'), text); },
        pill(text, cls) { return h('span', 'bkc-pill ' + (cls || ''), text); },
        statCard() { },
        toast(text, kind) { apiCalls.push({ toast: text, kind }); },
        api(action, payload) {
            apiCalls.push({ action, payload });
            if (action === 'admin.overview') {
                return Promise.resolve({ ok: true, counts: {}, config: { xp_rules: {}, feature_flags: {} }, top: [] });
            }
            if (action === 'admin.defs.list') return Promise.resolve(DEFS);
            return Promise.resolve({ ok: true });
        }
    };
    return kit;
}

function typeInto(w, el, value) {
    el.value = value;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
}

async function main() {
    console.log('Bá Khí 8.3.5 — Founder Dashboard: Thành tích & Boss\n');

    const dom = new JSDOM('<!doctype html><html><body><div id="pane"></div></body></html>', { url: 'https://minhtruk.github.io/bakhi/founder/', runScripts: 'outside-only' });
    const w = dom.window;
    w.eval(SRC);
    const kit = makeKit(w);
    const pane = w.document.getElementById('pane');
    w.BKGamificationAdmin.render(pane, Object.assign({}, kit, { isFounder: () => true }));
    await sleep(40);

    const achCard = pane.querySelector('[data-title="Thành tựu"]');
    assert(!!achCard, 'có khu vực Thành tựu');
    assert(/Tạo mới/.test(achCard.textContent), 'có nút “Tạo mới” rõ ràng');
    assert(/mã được tạo tự động/i.test(achCard.textContent), 'hướng dẫn nói rõ mã tự tạo');

    /* Mở form tạo mới */
    const newBtn = Array.from(achCard.querySelectorAll('button')).find((b) => /Tạo mới/.test(b.textContent));
    newBtn.click();
    const nameInput = achCard.querySelector('input[placeholder="Ví dụ: Ma Vương"]');
    assert(!!nameInput, 'form tạo thành tựu có ô Tên dễ hiểu');

    /* Mã tự sinh */
    typeInto(w, nameInput, 'Ma Vương');
    const advanced = achCard.querySelector('details.bkc-advanced');
    assert(!!advanced, 'trường kỹ thuật nằm trong “Cài đặt nâng cao”');
    const codeInput = advanced && advanced.querySelector('input');
    assert(codeInput && codeInput.value === 'ma_vuong', 'gõ tên → mã ma_vuong', codeInput && codeInput.value);

    /* Mã trùng + đề xuất */
    const hint = advanced.querySelector('.bkc-field-error');
    assert(!!hint && /ma_vuong_2/.test(hint.textContent), 'mã trùng được cảnh báo và đề xuất ma_vuong_2',
        hint && hint.textContent);
    const useSuggested = hint && Array.from(hint.querySelectorAll('button')).find((b) => /Dùng mã đề xuất/.test(b.textContent));
    assert(!!useSuggested, 'có nút dùng mã đề xuất (người quản trị xác nhận)');
    if (useSuggested) {
        useSuggested.click();
        assert(codeInput.value === 'ma_vuong_2', 'dùng mã đề xuất điền ma_vuong_2');
    }

    /* Xem trước */
    const preview = achCard.querySelector('.bkc-preview-body');
    assert(preview && /Ma Vương/.test(preview.textContent), 'xem trước hiển thị tên vừa nhập');
    assert(preview && /Tổng XP|Điều kiện/.test(preview.textContent), 'xem trước hiển thị điều kiện');

    /* Lưu với expect_new */
    const saveBtn = Array.from(achCard.querySelectorAll('button')).find((b) => /Lưu thay đổi/.test(b.textContent));
    saveBtn.click();
    await sleep(20);
    const saveCall = kit.apiCalls.filter((c) => c.action === 'admin.achievement.save').pop();
    assert(!!saveCall, 'bấm Lưu gọi admin.achievement.save');
    assert(saveCall && saveCall.payload.achievement.id === 'ma_vuong_2', 'lưu mã đã xác nhận');
    assert(saveCall && saveCall.payload.expect_new === true, 'lưu mới gửi expect_new để máy chủ chặn ghi đè');
    assert(saveCall && saveCall.payload.achievement.conditions[0].metric === 'quiz_completed',
        'điều kiện mặc định hợp lệ, không cần JSON');

    /* Chỉnh sửa không bắt nhập lại */
    const editBtn = Array.from(achCard.querySelectorAll('button')).find((b) => /^Sửa$/.test(b.textContent.trim()));
    assert(!!editBtn, 'danh sách có nút Sửa');
    if (editBtn) {
        editBtn.click();
        const editName = achCard.querySelector('input[placeholder="Ví dụ: Ma Vương"]');
        assert(editName && editName.value === 'Ma Vương', 'mở chỉnh sửa điền sẵn dữ liệu cũ');
        const editAdvanced = achCard.querySelector('details.bkc-advanced input');
        assert(editAdvanced && editAdvanced.value === 'ma_vuong', 'mã cũ được giữ khi chỉnh sửa');
    }
    assert(/Tạm ngừng/.test(achCard.textContent), 'có hành động Tạm ngừng (không buộc xoá)');
    assert(/Xóa/.test(achCard.textContent), 'có hành động Xóa có kiểm soát');

    /* Boss */
    const bossCard = pane.querySelector('[data-title="Thử thách Boss"]');
    assert(!!bossCard, 'có khu vực Thử thách Boss');
    const bossNew = Array.from(bossCard.querySelectorAll('button')).find((b) => /Soạn Boss mới/.test(b.textContent));
    assert(!!bossNew, 'có nút “Soạn Boss mới”');
    bossNew.click();
    const bossName = bossCard.querySelector('input[placeholder="Ví dụ: Ma Vương"]');
    assert(!!bossName, 'form Boss có ô Tên Boss');
    typeInto(w, bossName, 'Long Thần Hủy Diệt');
    const bossCode = bossCard.querySelector('details.bkc-advanced input');
    assert(bossCode && bossCode.value === 'long_than_huy_diet', 'tên Boss → mã long_than_huy_diet',
        bossCode && bossCode.value);
    const bossPreview = bossCard.querySelector('.bkc-preview-body');
    assert(bossPreview && /long_than_huy_diet/.test(bossPreview.textContent),
        'xem trước Boss hiện mã tự tạo');

    /* Lỗi tiếng Việt khi thiếu câu hỏi */
    const bossSave = Array.from(bossCard.querySelectorAll('button')).find((b) => /Lưu Boss/.test(b.textContent));
    bossSave.click();
    assert(/câu hỏi/i.test(bossCard.textContent) && !/SQL|stack|PGRST/i.test(bossCard.textContent),
        'lỗi thiếu câu hỏi giải thích bằng tiếng Việt, không lộ lỗi kỹ thuật');

    console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
    process.exit(fail ? 1 : 0);
}

main().catch((err) => {
    console.error('Lỗi kiểm thử:', err && err.stack);
    process.exit(1);
});

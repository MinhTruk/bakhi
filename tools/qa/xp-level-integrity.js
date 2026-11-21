#!/usr/bin/env node
/**
 * xp-level-integrity.js — đối chiếu công thức cấp độ và cấu hình XP (8.3.0).
 *
 *  1. Công thức trong JS (hiển thị) và trong Postgres (nguồn sự thật) phải khớp.
 *  2. Cấp độ không bao giờ giảm khi XP tăng.
 *  3. Mọi loại hoạt động trong cấu hình đều có giới hạn theo ngày.
 *  4. Nếu có SUPABASE_ACCESS_TOKEN: gọi trực tiếp public.bk_gam_level để so.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/xp-level-integrity.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-gamification.js'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261209000000_bakhi_v830_gamification.sql'), 'utf8');
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT = process.env.SUPABASE_PROJECT_REF || 'wzvslyabhizsiggurwdq';

let pass = 0;
let fail = 0;
function ok(n, d) { pass++; console.log('  ✓ ' + n + (d ? ' — ' + d : '')); }
function bad(n, d) { fail++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')); }
function assert(c, n, d) { c ? ok(n, d) : bad(n, d); }

function loadFormula() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/',
        runScripts: 'outside-only'
    });
    dom.window.BK = { cloud: {} };
    dom.window.eval(SRC);
    return dom.window.BK.gamification;
}

async function query(sql) {
    const res = await fetch('https://api.supabase.com/v1/projects/' + PROJECT + '/database/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
    });
    const text = await res.text();
    return { ok: res.status >= 200 && res.status < 300, data: (() => { try { return JSON.parse(text); } catch (e) { return text; } })() };
}

async function main() {
    console.log('XP & Level — kiểm tra toàn vẹn\n');
    const g = loadFormula();

    /* 1. Công thức tập trung ở đúng một nơi */
    assert(/create or replace function public\.bk_gam_level_floor/.test(SQL), 'SQL có bk_gam_level_floor');
    assert(/create or replace function public\.bk_gam_level\(/.test(SQL), 'SQL có bk_gam_level');
    const formula = /100 \+ 60 \* \(l - 1\) \+ 20 \* \(l - 1\) \* \(l - 1\)/.test(SQL);
    assert(formula, 'hệ số công thức khớp bản JS (base 100, linear 60, quadratic 20)');

    /* 2. Mốc cấp độ */
    const thresholds = [[0, 1], [99, 1], [100, 2], [279, 2], [280, 3], [579, 3], [580, 4], [1039, 4], [1040, 5], [2000, 6]];
    let thOk = true;
    thresholds.forEach(([xp, lv]) => { if (g.levelFromXp(xp) !== lv) { thOk = false; bad('mốc ' + xp + ' XP', 'nhận ' + g.levelFromXp(xp) + ', cần ' + lv); } });
    if (thOk) ok('các mốc cấp độ đúng như thiết kế');

    /* 3. Đơn điệu, không giảm cấp */
    let mono = true;
    let prev = g.levelFromXp(0);
    for (let xp = 0; xp <= 20000; xp += 7) {
        const lv = g.levelFromXp(xp);
        if (lv < prev) { mono = false; bad('cấp độ giảm tại ' + xp + ' XP'); break; }
        prev = lv;
    }
    if (mono) ok('cấp độ không giảm trên 0…20.000 XP');

    /* 4. Tiến trình trong một cấp luôn 0…100 */
    let pctOk = true;
    for (let xp = 0; xp <= 12000; xp += 31) {
        const p = g.progressOf(xp);
        if (p.pct < 0 || p.pct > 100 || p.remain < 0 && false) { pctOk = false; bad('phần trăm sai tại ' + xp); break; }
        if (p.remaining < 0) { pctOk = false; bad('XP còn lại âm tại ' + xp); break; }
    }
    if (pctOk) ok('phần trăm tiến trình luôn trong 0…100');

    /* 5. Không hardcode XP ở nơi khác */
    const clients = ['bk-gamification.js', 'bk-devboard-gamification.js'];
    let hardcoded = false;
    clients.forEach((f) => {
        const src = fs.readFileSync(path.join(ROOT, 'assets/bakhi/' + f), 'utf8');
        /* Client chỉ được có nhãn hoạt động, không được cộng XP trực tiếp. */
        if (/total_xp\s*\+=|total_xp\s*=\s*[^;]*\+\s*amount/.test(src)) { hardcoded = true; bad('client tự cộng XP trong ' + f); }
    });
    if (!hardcoded) ok('client không tự cộng XP');

    /* 6. Cấu hình XP có giới hạn ngày cho mọi hoạt động */
    const ruleBlock = /xp_rules = '([\s\S]*?)'::jsonb/.exec(SQL);
    let capsOk = false;
    if (ruleBlock) {
        const text = ruleBlock[1];
        const entries = text.match(/"[a-z_]+":\s*\{[^}]+\}/g) || [];
        capsOk = entries.length >= 8 && entries.every((e) => /"daily_cap":\s*\d+/.test(e) && /"xp":\s*\d+/.test(e));
    }
    assert(capsOk, 'mọi loại hoạt động đều có XP và giới hạn/ngày');

    /* 7. Ràng buộc dữ liệu trong schema */
    assert(/unique \(student_id, idempotency_key\)/.test(SQL), 'sổ XP có ràng buộc idempotency');
    assert(/amount\s+integer not null check \(amount <> 0/.test(SQL), 'giao dịch XP không cho amount = 0');
    assert(/total_xp\s+bigint not null default 0 check \(total_xp >= 0\)/.test(SQL), 'tổng XP không âm');

    /* 8. Đối chiếu trực tiếp với Postgres (khi có token) */
    if (TOKEN) {
        const values = [0, 55, 100, 240, 499, 1000, 2600, 7300, 15000];
        const sql = 'select x, public.bk_gam_level(x) as lv from unnest(array[' + values.join(',') + ']) as x';
        const res = await query(sql);
        if (!res.ok) {
            bad('đối chiếu Postgres', String(res.data).slice(0, 200));
        } else {
            const rows = res.data || [];
            let same = true;
            rows.forEach((r) => {
                const js = g.levelFromXp(Number(r.x));
                if (js !== Number(r.lv)) { same = false; bad('lệch JS/Postgres tại ' + r.x, 'js=' + js + ' sql=' + r.lv); }
            });
            if (same) ok('JS và Postgres cho cùng kết quả trên ' + rows.length + ' mốc');
        }
    } else {
        console.log('  · bỏ qua đối chiếu Postgres (không có SUPABASE_ACCESS_TOKEN)');
    }

    console.log('\nKết quả: ' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exit(1);
}

main().catch((e) => {
    console.error('Lỗi không xử lý được:', e && e.message ? e.message : e);
    process.exit(1);
});

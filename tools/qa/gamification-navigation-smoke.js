#!/usr/bin/env node
/**
 * gamification-navigation-smoke.js — kiểm tra lối vào Tiến trình (8.3.1).
 *
 * Không chỉ kiểm tra chữ trong HTML: mở menu tài khoản thật trong jsdom,
 * kiểm tra href tuyệt đối đúng route, aria-current theo trang, và route
 * gamification/ tồn tại trong repo + nạp đúng mô-đun.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-navigation-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function boot(url) {
    const vc = new VirtualConsole();
    const errors = [];
    vc.on('jsdomError', (e) => errors.push(String(e && (e.message || e))));
    const dom = new JSDOM(`<!DOCTYPE html><html lang="vi"><head><title>Bá Khí</title></head>
<body><header><div><h1>Cây Tài Liệu Ôn Tập</h1></div></header><main></main><footer></footer></body></html>`,
        { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
    w.requestAnimationFrame = (cb) => setTimeout(() => cb(w.performance.now()), 0);
    w.cancelAnimationFrame = (id) => clearTimeout(id);
    const load = (f) => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    load('assets/bakhi/bk-core.js');
    load('assets/bakhi/bk-version.js');
    load('assets/bakhi/bk-profile.js');
    load('assets/bakhi/bk-badges.js');
    load('assets/bakhi/bk-shell.js');
    return { w, errors, dom };
}

async function main() {
    console.log('Gamification 8.3.1 — điều hướng\n');

    /* 1. Route thật tồn tại và nạp đúng mô-đun */
    const pagePath = path.join(ROOT, 'gamification/index.html');
    assert(fs.existsSync(pagePath), 'route gamification/index.html tồn tại');
    const page = fs.readFileSync(pagePath, 'utf8');
    assert(/bk-gamification\.js/.test(page), 'trang Tiến trình nạp bk-gamification.js');
    assert(/bk-shell\.js/.test(page), 'trang Tiến trình nạp shell (menu dùng chung)');
    assert(/id="bkGamificationRoot"/.test(page), 'trang Tiến trình có host dashboard');

    /* 2. Menu tài khoản trên trang chủ có lối vào */
    {
        const { w, errors } = boot('https://minhtruk.github.io/bakhi/index.html');
        await wait(40);
        const btn = w.document.getElementById('bkUserBtn');
        assert(!!btn, 'header có nút tài khoản');
        if (btn) btn.click();
        await wait(60);
        const link = w.document.querySelector('[data-bk-progress-link]');
        assert(!!link, 'menu có lối vào Tiến trình');
        if (link) {
            assert(link.tagName === 'A', 'lối vào là thẻ liên kết (không phải nút trang trí)');
            assert(link.getAttribute('role') === 'menuitem', 'có role menuitem');
            assert(/\/gamification\/$/.test(link.getAttribute('href') || ''),
                'href trỏ đúng /gamification/', link.getAttribute('href'));
            assert(/Tiến trình/.test(link.textContent), 'nhãn dễ hiểu', link.textContent.trim());
            assert(!link.hasAttribute('aria-current'), 'không đánh dấu active khi đang ở trang khác');
            assert(!link.disabled && !link.hasAttribute('aria-disabled'), 'không bị vô hiệu hoá');
        }
        assert(errors.length === 0, 'không có lỗi runtime khi dựng menu', errors.join('; '));
    }

    /* 3. Đang ở trang Tiến trình → aria-current="page" */
    {
        const { w } = boot('https://minhtruk.github.io/bakhi/gamification/');
        await wait(40);
        const btn = w.document.getElementById('bkUserBtn');
        if (btn) btn.click();
        await wait(60);
        const link = w.document.querySelector('[data-bk-progress-link]');
        assert(!!link, 'menu trang Tiến trình vẫn có lối vào');
        assert(link && link.getAttribute('aria-current') === 'page',
            'đánh dấu aria-current khi đang ở /gamification/', link && link.getAttribute('aria-current'));
    }

    /* 4. Liên kết không phụ thuộc trạng thái tiến trình */
    {
        const shell = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-shell.js'), 'utf8');
        const block = (shell.match(/data-bk-progress-link[\s\S]{0,400}/) || [''])[0];
        assert(!/BKCloud|gamificationApi|state\(\)/.test(block),
            'việc dựng lối vào không phụ thuộc tải tiến trình');
    }

    /* 5. Mọi trang nạp shell đều có menu này (một nguồn duy nhất) */
    {
        const shell = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-shell.js'), 'utf8');
        const count = (shell.match(/data-bk-progress-link/g) || []).length;
        assert(count === 1, 'chỉ một định nghĩa lối vào trong shell', String(count));
    }

    console.log('\nKết quả: ' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

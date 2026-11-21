#!/usr/bin/env node
'use strict';
/**
 * Bá Khí 8.4.0 — smoke test cho hệ giao diện + biểu tượng trang trí.
 *
 * Kiểm tra:
 *   · BKThemes khởi động, áp dụng giao diện theo đúng phạm vi trang (page/head/accent)
 *   · Chỉ áp dụng giao diện đã sở hữu (cache do máy chủ trả về)
 *   · Theme Halloween có bí ngô khắc mặt; Christmas có tuyết rơi
 *   · Giảm chuyển động thì không tạo tuyết / không tạo dơi
 *   · BKUserName gắn biểu tượng cạnh tên, mini profile, refresh()
 *
 * Chạy: NODE_PATH=/tmp/bktest/node_modules node tools/qa/themes-smoke.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-themes.js'), 'utf8');

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log('  ok   ' + name);
        return;
    }
    failures += 1;
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
}

function makeDom(url, bodyScope) {
    const dom = new JSDOM(
        '<!doctype html><html><head></head><body' +
        (bodyScope ? ' data-bk-theme-scope="' + bodyScope + '"' : '') +
        '><header class="bk-topbar"><span id="h"></span></header><main></main></body></html>',
        { url: url, runScripts: 'outside-only', pretendToBeVisual: true }
    );
    const w = dom.window;
    w.matchMedia = function () {
        return { matches: false, addEventListener() { }, removeEventListener() { } };
    };
    w.eval(SRC);
    return w;
}

(async function main() {
    /* ---------------------------------------------- 1. Trang chủ: phủ toàn màn hình */
    console.log('Trang chủ (scope=page)');
    let w = makeDom('https://minhtruk.github.io/bakhi/');
    let T = w.BKThemes;
    check('BKThemes được định nghĩa', !!T);
    check('nhận diện phạm vi page', T.scope() === 'page', T.scope());

    w.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-halloween',
        owned: ['theme-halloween', 'theme-christmas'],
        deco: null
    }));
    T.refresh();
    const html = w.document.documentElement;
    check('gán data-bk-theme', html.getAttribute('data-bk-theme') === 'theme-halloween',
        html.getAttribute('data-bk-theme'));
    check('gán data-bk-theme-scope', html.getAttribute('data-bk-theme-scope') === 'page');
    const layer = w.document.getElementById('bkThemeLayer');
    check('có lớp nền #bkThemeLayer', !!layer);
    check('Halloween có 3 bí ngô khắc mặt',
        layer && layer.querySelectorAll('.bkth-pumpkin').length === 3);
    check('Halloween có lớp phủ giữ tương phản',
        layer && !!layer.querySelector('.bkth-veil'));

    /* --------------------------------------------------- 2. Christmas: tuyết rơi */
    console.log('Christmas (tuyết rơi)');
    await T.setTheme('theme-christmas');
    const xmas = w.document.getElementById('bkThemeLayer');
    check('đổi sang Christmas', html.getAttribute('data-bk-theme') === 'theme-christmas',
        html.getAttribute('data-bk-theme'));
    check('có tuyết rơi', xmas && xmas.querySelectorAll('.bkth-flake').length > 10);
    check('có cây thông', xmas && !!xmas.querySelector('.bkth-tree'));
    check('không còn bí ngô của theme trước',
        xmas && xmas.querySelectorAll('.bkth-pumpkin').length === 0);

    /* ------------------------------------------- 3. Chưa sở hữu thì không áp dụng */
    console.log('Quyền sở hữu');
    w.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: ['theme-dawn'], deco: null
    }));
    const denied = await T.setTheme('theme-royal');
    check('từ chối giao diện chưa sở hữu', denied.ok === false && /chưa sở hữu/i.test(denied.error || ''),
        JSON.stringify(denied));
    const allowed = await T.setTheme('theme-dawn');
    check('cho phép giao diện đã sở hữu', allowed.ok === true, JSON.stringify(allowed));
    check('áp dụng theme-dawn', html.getAttribute('data-bk-theme') === 'theme-dawn');

    /* -------------------------------------- 4. Trang môn học: chỉ đánh dấu header */
    console.log('Trang môn học (scope=head)');
    const w2 = makeDom('https://minhtruk.github.io/bakhi/ktgk1/toan/indextoan.html');
    check('nhận diện phạm vi head', w2.BKThemes.scope() === 'head', w2.BKThemes.scope());
    w2.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-christmas', owned: ['theme-christmas'], deco: null
    }));
    w2.BKThemes.refresh();
    check('không dựng lớp nền toàn màn hình ở trang môn',
        !w2.document.getElementById('bkThemeLayer'));
    check('đánh dấu header bằng bk-theme-head',
        !!w2.document.querySelector('.bk-theme-head'));

    /* ------------------------------------------------ 5. Hồ sơ: chỉ điểm nhấn */
    console.log('Hồ sơ (scope=accent)');
    const w3 = makeDom('https://minhtruk.github.io/bakhi/profile/');
    check('nhận diện phạm vi accent', w3.BKThemes.scope() === 'accent', w3.BKThemes.scope());
    w3.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-sakura', owned: ['theme-sakura'], deco: null
    }));
    w3.BKThemes.refresh();
    check('không phủ nền toàn màn hình ở hồ sơ',
        !w3.document.getElementById('bkThemeLayer'));

    /* ------------------------------------------------------ 6. Giảm chuyển động */
    console.log('Giảm chuyển động');
    const w4 = makeDom('https://minhtruk.github.io/bakhi/');
    w4.matchMedia = function () {
        return { matches: true, addEventListener() { }, removeEventListener() { } };
    };
    w4.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-christmas', owned: ['theme-christmas'], deco: null
    }));
    w4.BKThemes.refresh();
    const calm = w4.document.getElementById('bkThemeLayer');
    check('prefers-reduced-motion: không tạo tuyết',
        calm && calm.querySelectorAll('.bkth-flake').length === 0);

    /* ------------------------------------------------ 7. Tên có biểu tượng */
    console.log('BKUserName');
    const w5 = makeDom('https://minhtruk.github.io/bakhi/');
    w5.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: [], deco: { icon: 'fa-feather', name: 'Ngòi Bút Tri Thức' }
    }));
    const node = w5.BKUserName.node('Nguyễn An', { size: 'large' });
    check('có nhãn tên', /Nguyễn An/.test(node.textContent || ''));
    check('có biểu tượng trang trí', !!node.querySelector('.bk-user-deco.fa-feather'));
    const mini = w5.BKUserName.mini({ name: 'Nguyễn An', sub: 'Cấp 12', avatar: 'N' });
    check('mini profile có tên + biểu tượng + dòng phụ',
        !!mini.querySelector('.bk-user-deco') && !!mini.querySelector('.bk-mini-profile-sub'));

    w5.document.body.appendChild(node);
    w5.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: [], deco: { icon: 'fa-star', name: 'Ngôi Sao' }
    }));
    w5.BKUserName.refresh();
    check('refresh() đổi biểu tượng đã hiển thị',
        !!node.querySelector('.bk-user-deco.fa-star') && !node.querySelector('.bk-user-deco.fa-feather'));

    console.log('');
    if (failures) {
        console.log('THẤT BẠI: ' + failures + ' kiểm tra không đạt.');
        process.exit(1);
    }
    console.log('OK — tất cả kiểm tra giao diện/nhận diện đều đạt.');
})().catch(function (err) {
    console.error('Lỗi chạy smoke test:', err && err.message);
    process.exit(1);
});

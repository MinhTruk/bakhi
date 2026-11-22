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
    const fx = w.document.getElementById('bkThemeFx');
    check('có lớp nền #bkThemeLayer', !!layer);
    check('có lớp hiệu ứng #bkThemeFx trên nội dung', !!fx);
    check('Halloween có 3 bí ngô khắc mặt',
        fx && fx.querySelectorAll('.bkth-pumpkin').length === 3);
    check('Halloween có lớp phủ giữ tương phản',
        layer && !!layer.querySelector('.bkth-veil'));

    /* --------------------------------------------------- 2. Christmas: tuyết rơi */
    console.log('Christmas (tuyết rơi)');
    await T.setTheme('theme-christmas');
    const xmas = w.document.getElementById('bkThemeLayer');
    const xmasFx = w.document.getElementById('bkThemeFx');
    check('đổi sang Christmas', html.getAttribute('data-bk-theme') === 'theme-christmas',
        html.getAttribute('data-bk-theme'));
    check('có tuyết rơi toàn trang', xmasFx && xmasFx.querySelectorAll('.bkth-flake').length > 10);
    check('có cây thông', xmas && !!xmas.querySelector('.bkth-tree'));
    check('không còn bí ngô của theme trước',
        w.document.querySelectorAll('.bkth-pumpkin').length === 0);

    /* 8.4.3 — bí ngô rơi khắp trang thay vì neo ở đáy trang. */
    const CSS_SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-themes.css'), 'utf8');
    const pumpkinRule = (CSS_SRC.match(/\n#bkThemeFx \.bkth-pumpkin \{([^}]*)\}/) || [])[1] || '';
    check('bí ngô rơi từ đỉnh trang', /top:\s*-22vh/.test(pumpkinRule), pumpkinRule);
    check('bí ngô không còn neo ở đáy trang', !/bottom:\s*-?\d/.test(pumpkinRule), pumpkinRule);
    check('có keyframe rơi bí ngô', /@keyframes bkthPumpkinFall/.test(CSS_SRC));
    check('lớp hiệu ứng nằm trên nội dung, không chặn chuột',
        /#bkThemeFx\s*\{[^}]*z-index:\s*2[^}]*\}/.test(CSS_SRC) &&
        /#bkThemeFx,[\s\S]*?pointer-events:\s*none/.test(CSS_SRC));

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

    /* 8.4.3 — Halloween & Giáng Sinh miễn phí cho toàn bộ học sinh. */
    console.log('Giao diện miễn phí (8.4.3)');
    check('FREE_THEMES gồm bốn giao diện theo mùa',
        Array.isArray(T.FREE_THEMES) && T.FREE_THEMES.length === 4 &&
        T.isFree('theme-halloween') && T.isFree('theme-christmas') &&
        T.isFree('theme-tet') && T.isFree('theme-midautumn') &&
        !T.isFree('theme-royal'));
    w.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: ['theme-dawn'], deco: null
    }));
    const freeHalloween = await T.setTheme('theme-halloween');
    check('chọn được Halloween khi kho chưa có', freeHalloween.ok === true,
        JSON.stringify(freeHalloween));
    check('đã áp dụng Halloween miễn phí', html.getAttribute('data-bk-theme') === 'theme-halloween',
        html.getAttribute('data-bk-theme'));
    w.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: ['theme-dawn'], deco: null
    }));
    const freeXmas = await T.setTheme('theme-christmas');
    check('chọn được Giáng Sinh khi kho chưa có', freeXmas.ok === true,
        JSON.stringify(freeXmas));

    const pickerHost = w.document.createElement('div');
    w.document.body.appendChild(pickerHost);
    T.renderPicker(pickerHost, {});
    const halloweenCard = pickerHost.querySelector('.bkth-card[data-theme-id="theme-halloween"]');
    const royalCard = pickerHost.querySelector('.bkth-card[data-theme-id="theme-royal"]');
    check('Cài đặt: Halloween không bị khoá',
        !!halloweenCard && !halloweenCard.disabled &&
        !halloweenCard.classList.contains('is-locked'));
    check('Cài đặt: Halloween có nhãn Miễn phí',
        !!(halloweenCard && halloweenCard.querySelector('.bkth-badge.is-free')));
    check('Cài đặt: giao diện khác vẫn khoá khi chưa sở hữu',
        !!royalCard && royalCard.disabled === true);

    const synced = T.syncFromState({
        inventory: [{ item_id: 'theme-midnight', kind: 'theme', is_equipped: false }]
    });
    check('syncFromState luôn giữ hai giao diện miễn phí',
        synced.owned.indexOf('theme-halloween') >= 0 &&
        synced.owned.indexOf('theme-christmas') >= 0, JSON.stringify(synced.owned));

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
    const headSnow = w2.document.querySelector('.bk-theme-head .bkth-head-snow');
    check('tuyết rơi trong khung header trang môn', !!headSnow,
        'không thấy .bkth-head-snow');
    check('header có hạt tuyết', headSnow && headSnow.querySelectorAll('.bkth-flake').length > 5);

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

    /* 8.4.3 — Giáng Sinh thả tuyết toàn website, kể cả trang chỉ điểm nhấn. */
    w3.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-christmas', owned: ['theme-christmas'], deco: null
    }));
    w3.BKThemes.refresh();
    const overlay = w3.document.getElementById('bkThemeOverlay');
    check('hồ sơ có tuyết rơi toàn trang', !!overlay && overlay.querySelectorAll('.bkth-flake').length > 10);
    check('lớp tuyết ở hồ sơ không vẽ lại nền',
        !overlay || !overlay.querySelector('.bkth-christmas'));

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
    const calm = w4.document.getElementById('bkThemeFx');
    check('prefers-reduced-motion: không tạo tuyết',
        calm && calm.querySelectorAll('.bkth-flake').length === 0);
    const w6 = makeDom('https://minhtruk.github.io/bakhi/profile/');
    w6.matchMedia = function () {
        return { matches: true, addEventListener() { }, removeEventListener() { } };
    };
    w6.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-christmas', owned: ['theme-christmas'], deco: null
    }));
    w6.BKThemes.refresh();
    check('prefers-reduced-motion: lớp phủ hồ sơ không tạo hạt tuyết',
        w6.document.querySelectorAll('#bkThemeOverlay .bkth-flake').length === 0);

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

    /* ------------------------------------- 8. Tết & Trung Thu (8.4.4) */
    console.log('Giao diện Tết và Trung Thu (8.4.4)');
    const wTet = makeDom('https://minhtruk.github.io/bakhi/');
    wTet.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: [], deco: null
    }));
    const tetRes = await wTet.BKThemes.setTheme('theme-tet');
    check('chọn được Tết khi kho chưa có', tetRes.ok === true, JSON.stringify(tetRes));
    const tetFx = wTet.document.getElementById('bkThemeFx');
    check('Tết có mai vàng rơi', !!tetFx && tetFx.querySelectorAll('.bkth-mai .bkth-flake').length > 5);
    check('Tết có đèn lồng', !!tetFx && tetFx.querySelectorAll('.bkth-lantern').length === 2);
    check('Tết có nền riêng',
        !!wTet.document.querySelector('#bkThemeLayer .bkth-tet'));

    const wMid = makeDom('https://minhtruk.github.io/bakhi/');
    wMid.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: [], deco: null
    }));
    const midRes = await wMid.BKThemes.setTheme('theme-midautumn');
    check('chọn được Trung Thu khi kho chưa có', midRes.ok === true, JSON.stringify(midRes));
    check('Trung Thu có trăng rằm',
        !!wMid.document.querySelector('#bkThemeLayer .bkth-moon'));
    const midFx = wMid.document.getElementById('bkThemeFx');
    check('Trung Thu có đèn ông sao',
        !!midFx && midFx.querySelectorAll('.bkth-lantern-star').length === 2);
    check('Trung Thu có ánh sao rơi',
        !!midFx && midFx.querySelectorAll('.bkth-sao .bkth-flake').length > 5);

    const wHeadTet = makeDom('https://minhtruk.github.io/bakhi/ktgk1/van/indexvan.html');
    wHeadTet.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-tet', owned: ['theme-tet'], deco: null
    }));
    wHeadTet.BKThemes.refresh();
    check('trang môn học: mai rơi trong header, không phủ nền',
        !!wHeadTet.document.querySelector('.bk-theme-head .bkth-head-snow .bkth-mai .bkth-flake') &&
        !wHeadTet.document.getElementById('bkThemeLayer'));

    /* -------------------------------------- 9. Tự bật theo mùa (8.4.4) */
    console.log('Tự bật giao diện theo mùa (8.4.4)');
    check('nhận diện mùa Tết', (T.activeSeason(new Date('2026-02-01T10:00:00')) || {}).id === 'theme-tet',
        JSON.stringify(T.activeSeason(new Date('2026-02-01T10:00:00'))));
    check('nhận diện mùa Giáng Sinh vắt qua năm mới',
        (T.activeSeason(new Date('2026-12-24T10:00:00')) || {}).id === 'theme-christmas' &&
        (T.activeSeason(new Date('2026-01-03T10:00:00')) || {}).id === 'theme-christmas');
    check('ngoài mùa thì không tự bật', T.activeSeason(new Date('2026-06-15T10:00:00')) === null);

    const wAuto = makeDom('https://minhtruk.github.io/bakhi/');
    const RealDate = wAuto.Date;
    wAuto.Date = function () { return new RealDate('2026-02-01T10:00:00'); };
    wAuto.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: [], deco: null, auto: true
    }));
    wAuto.BKThemes.refresh();
    const autoHtml = wAuto.document.documentElement;
    check('chưa chọn gì + đang mùa Tết → tự bật',
        autoHtml.getAttribute('data-bk-theme') === 'theme-tet' &&
        autoHtml.getAttribute('data-bk-theme-auto') === '1',
        autoHtml.getAttribute('data-bk-theme') + ' / ' + autoHtml.getAttribute('data-bk-theme-auto'));
    await wAuto.BKThemes.setTheme('theme-royal').catch(function () { });
    const afterPick = JSON.parse(wAuto.localStorage.getItem('bakhiTheme.v1') || '{}');
    check('chọn tay một giao diện thì tắt tự bật mùa', afterPick.auto === false,
        JSON.stringify(afterPick));
    check('đã chọn tay thì season() trả null', wAuto.BKThemes.season() === null);

    /* Cài đặt → Hình nền phải hiện thanh gợi ý và nút tắt tự bật. */
    const wSeasonPick = makeDom('https://minhtruk.github.io/bakhi/settings/');
    const RealDate2 = wSeasonPick.Date;
    wSeasonPick.Date = function () { return new RealDate2('2026-02-01T10:00:00'); };
    wSeasonPick.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: null, owned: [], deco: null, auto: true
    }));
    const seasonHost = wSeasonPick.document.createElement('div');
    wSeasonPick.document.body.appendChild(seasonHost);
    wSeasonPick.BKThemes.renderPicker(seasonHost, {});
    const chip = seasonHost.querySelector('.bkth-season');
    check('Cài đặt có thanh gợi ý giao diện mùa', !!chip, 'không thấy .bkth-season');
    const offBtn = chip && Array.prototype.slice.call(chip.querySelectorAll('button'))
        .filter(function (b) { return /Tắt tự bật/.test(b.textContent || ''); })[0];
    check('thanh gợi ý có nút tắt tự bật', !!offBtn);
    if (offBtn) offBtn.click();
    const afterOff = JSON.parse(wSeasonPick.localStorage.getItem('bakhiTheme.v1') || '{}');
    check('nút tắt tự bật ghi auto:false và bỏ thanh gợi ý',
        afterOff.auto === false && !seasonHost.querySelector('.bkth-season'),
        JSON.stringify(afterOff));
    check('tắt tự bật thì không còn giao diện mùa',
        !wSeasonPick.document.documentElement.getAttribute('data-bk-theme'),
        String(wSeasonPick.document.documentElement.getAttribute('data-bk-theme')));
    wSeasonPick.Date = RealDate2;
    wAuto.Date = RealDate;

    /* ----------------------------------- 10. Giới hạn hiệu ứng (8.4.4) */
    console.log('Giới hạn hiệu ứng trên máy yếu (8.4.4)');
    const wSmall = makeDom('https://minhtruk.github.io/bakhi/');
    wSmall.matchMedia = function (q) {
        return { matches: /max-width/.test(String(q)), addEventListener() { }, removeEventListener() { } };
    };
    wSmall.localStorage.setItem('bakhiTheme.v1', JSON.stringify({
        id: 'theme-christmas', owned: ['theme-christmas'], deco: null
    }));
    wSmall.BKThemes.refresh();
    const smallFlakes = wSmall.document.querySelectorAll('#bkThemeFx .bkth-flake').length;
    check('màn hình nhỏ/máy yếu: số hạt giảm nhưng vẫn có hiệu ứng',
        smallFlakes > 5 && smallFlakes < 24, String(smallFlakes));
    check('CSS tạm dừng animation khi tab ẩn', /\.is-paused \*/.test(CSS_SRC) &&
        /animation-play-state:\s*paused/.test(CSS_SRC));

    /* ------------------------- 6. Hồi quy 8.4.2: không phá phần tử position: fixed */
    console.log('Xếp lớp trang chủ (hồi quy 8.4.2)');
    const CSS = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-themes.css'), 'utf8');
    /* Lỗi 8.4.0–8.4.1: quy tắc này ép `position: relative` lên MỌI con của body,
       làm header/chuông/nút Báo cáo/trình nhạc mất position: fixed và giãn hết
       chiều ngang ngay khi bật giao diện trang chủ. */
    check('không ép position lên mọi con của body',
        !/data-bk-theme-scope="page"\]\s*body\s*>\s*\*\s*\{/.test(CSS));
    check('lớp nền trang chủ nằm dưới nội dung bằng z-index âm',
        /data-bk-theme-scope="page"\]\s*#bkThemeLayer\s*\{\s*z-index:\s*-1/.test(CSS));
    check('không đặt position cho body ở phạm vi trang',
        !/data-bk-theme-scope="page"\]\s*body\s*\{[^}]*position:/.test(CSS));
    check('#bkThemeLayer vẫn phủ toàn màn hình và không chặn chuột',
        /#bkThemeLayer\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/.test(CSS));

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

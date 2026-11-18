#!/usr/bin/env node
/* Chèn bk-titles.css + bk-titles.js vào các trang có hiển thị Danh hiệu.
   Idempotent: chạy lại không tạo thẻ trùng. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PAGES = [
    { file: 'chat/index.html', cssAfter: 'bk-chat.css', jsAfter: 'bk-version.js' },
    { file: 'profile/index.html', cssAfter: 'bk-profile.css', jsAfter: 'bk-version.js' },
    { file: 'settings/index.html', cssAfter: 'bk-profile.css', jsAfter: 'bk-version.js' },
    { file: 'founder/index.html', cssAfter: 'bk-core.css', jsAfter: 'bk-badges.js' },
    { file: 'admin/index.html', cssAfter: 'bk-core.css', jsAfter: 'bk-badges.js' }
];

function versionTag() {
    const src = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-version.js'), 'utf8');
    const m = src.match(/app\s*:\s*['"]([\d.]+)['"]/);
    return m ? m[1] : '7.7.0';
}

const V = versionTag();
let changed = 0;

for (const page of PAGES) {
    const full = path.join(ROOT, page.file);
    if (!fs.existsSync(full)) {
        console.log('bỏ qua (không có tệp):', page.file);
        continue;
    }
    let html = fs.readFileSync(full, 'utf8');
    const before = html;

    if (!/bk-titles\.css/.test(html)) {
        const re = new RegExp('(<link[^>]*' + page.cssAfter.replace(/\./g, '\\.') + '[^>]*>)');
        html = html.replace(re, (m) => `${m}\n    <link rel="stylesheet" href="../assets/bakhi/bk-titles.css?v=${V}">`);
    }
    if (!/bk-titles\.js/.test(html)) {
        const re = new RegExp('(<script[^>]*' + page.jsAfter.replace(/\./g, '\\.') + '[^>]*><\\/script>)');
        html = html.replace(re, (m) => `${m}\n    <script src="../assets/bakhi/bk-titles.js?v=${V}" defer></script>`);
    }
    if (html !== before) {
        fs.writeFileSync(full, html);
        changed++;
        console.log('đã chèn bk-titles vào', page.file);
    } else {
        console.log('đã có sẵn:', page.file);
    }
}
console.log(`xong: ${changed} tệp thay đổi (phiên bản ${V})`);

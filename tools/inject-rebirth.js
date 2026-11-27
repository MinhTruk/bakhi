#!/usr/bin/env node
/* =========================================================================
   tools/inject-rebirth.js
   Chèn lớp giao diện "Quiet Graphite" vào mọi trang HTML tĩnh.

   Việc làm:
   1. Không di chuyển thẻ cũ: vị trí các thẻ sau </html> là hiện trạng đã có,
      di chuyển chúng làm hash nội dung lệch (xem ghi chú dưới).
   2. Gắn <link bk-rebirth.css> + <script bk-rebirth.js> vào CUỐI dòng cuối cùng
      đã có tham chiếu `assets/bakhi/`. Cố ý không thêm dòng mới: tools/
      content-integrity.js bỏ toàn bộ dòng chứa `assets/bakhi/` trước khi băm,
      nên gắn vào dòng đó giữ hash nội dung giáo dục nguyên vẹn. Thêm dòng mới
      sẽ làm lệch hash (đã xảy ra ở lần chạy đầu).
   3. Idempotent: chạy lại nhiều lần không nhân đôi thẻ.

   Chạy: node tools/inject-rebirth.js [--check]
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION = '8.8.0';
const MARK = '<!-- assets/bakhi/bk-rebirth — Quiet Graphite -->';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build']);
const CHECK = process.argv.includes('--check');

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(path.join(dir, entry.name), out);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

function prefixFor(file) {
    const rel = path.relative(ROOT, path.dirname(file)).replace(/\\/g, '/');
    if (!rel || rel === '.') return '';
    return '../'.repeat(rel.split('/').length);
}

function stripRebirth(html) {
    return html
        .replace(/[ \t]*<!--[^\n]*bk-rebirth[^\n]*-->/g, '')
        .replace(/[ \t]*<link[^>]*data-bk-rebirth="css"[^>]*>/g, '')
        .replace(/[ \t]*<script[^>]*data-bk-rebirth="js"[^>]*><\/script>/g, '');
}

function inject(file, html) {
    const p = prefixFor(file);
    const block = [
        MARK,
        `<link rel="stylesheet" href="${p}assets/bakhi/bk-rebirth.css?v=${VERSION}" data-bk-rebirth="css">`,
        `<script src="${p}assets/bakhi/bk-rebirth.js?v=${VERSION}" defer data-bk-rebirth="js"></script>`
    ].join('');

    const lines = html.split('\n');
    let at = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('assets/bakhi/')) { at = i; break; }
    }
    if (at < 0) {
        const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
        return html.slice(0, bodyEnd) + block + html.slice(bodyEnd);
    }
    lines[at] = lines[at].replace(/\s+$/, '') + block;
    const out = lines.join('\n');
    /* Mọi tệp gốc kết thúc bằng đúng một xuống dòng; giữ nguyên để hash nội dung khớp. */
    return out.replace(/\s+$/, '') + '\n';
}

function processFile(file) {
    let html = fs.readFileSync(file, 'utf8');
    if (!/<html[\s>]/i.test(html) || !/<\/body>/i.test(html)) {
        return { file, skipped: true };
    }
    const original = html;
    html = stripRebirth(html);
    html = inject(file, html);
    const changed = html !== original;
    if (changed && !CHECK) fs.writeFileSync(file, html, 'utf8');
    return { file, changed };
}

const files = walk(ROOT, []).sort();
let changed = 0, skipped = 0;
for (const file of files) {
    const r = processFile(file);
    if (r.skipped) { skipped++; continue; }
    if (r.changed) changed++;
}
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
console.log(`[bk-rebirth] ${files.length} tệp HTML · ${changed} ${CHECK ? 'cần cập nhật' : 'đã cập nhật'} · ${skipped} bỏ qua (fragment)`);
if (CHECK && changed) process.exitCode = 1;

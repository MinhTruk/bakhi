#!/usr/bin/env node
/**
 * Chèn lớp theo dõi tiến trình 8.3.0 (bk-gamification.js) vào mọi trang đã có
 * bk-cloud.js — chỉ thêm thẻ script, KHÔNG sửa nội dung giáo dục.
 *
 * - Idempotent: chạy lại không chèn trùng.
 * - Bỏ qua trang quản trị (admin/, founder/) và Studio.
 * - Chèn NGAY SAU thẻ bk-cloud.js để BK.cloud sẵn sàng khi mô-đun khởi động.
 *
 * Dùng: node tools/inject-gamification.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['studio', 'admin', 'founder', 'tools', 'docs', 'assets', 'images', 'music', '.git', '.github']);

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (dir === ROOT && SKIP_DIRS.has(entry.name)) continue;
            walk(full, out);
        } else if (entry.isFile() && /\.html$/i.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function inject(file) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    let html = fs.readFileSync(file, 'utf8');
    if (html.includes('assets/bakhi/bk-gamification.js')) return 'already';
    if (!html.includes('assets/bakhi/bk-cloud.js')) return 'skip';

    const depth = rel.split('/').length - 1;
    const prefix = depth === 0 ? '' : '../'.repeat(depth);

    const lines = html.split('\n');
    let at = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('assets/bakhi/bk-cloud.js')) at = i;
    }
    if (at < 0) return 'error';

    lines.splice(at + 1, 0, `<script src="${prefix}assets/bakhi/bk-gamification.js?v=8.3.0" defer></script>`);
    fs.writeFileSync(file, lines.join('\n'));
    return 'injected';
}

const files = walk(ROOT).sort();
const stats = { injected: 0, already: 0, skip: 0, error: 0 };
for (const file of files) {
    const r = inject(file);
    stats[r] = (stats[r] || 0) + 1;
    if (r === 'injected') console.log('  + ' + path.relative(ROOT, file));
}
console.log(`\nTổng ${files.length} tệp HTML:`, stats);

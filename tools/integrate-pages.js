#!/usr/bin/env node
/**
 * Chèn thẻ script của lớp nâng cấp vào các trang HTML.
 *
 * - Chỉ thêm <script> ngay trước </body>; KHÔNG sửa bất kỳ dòng nội dung nào.
 * - Idempotent: chạy lại không chèn trùng.
 * - Bỏ qua trang công cụ (studio/) — đây là ứng dụng thiết kế riêng.
 *
 * Dùng: node tools/integrate-pages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['studio/index.html']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'assets' || entry.name === 'docs' || entry.name === 'tools') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.html$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function inject(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (SKIP.has(rel)) return 'skip';
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('assets/bakhi/bk-core.js')) return 'already';

  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const isHome = depth === 0 && /^index\.html$/i.test(path.basename(rel));

  // Trang "Coming soon" chỉ cần lớp core (âm nhạc + hiệu ứng), không cần dock học tập.
  const isComingSoon = /Coming soon/i.test(html);
  const scripts = isHome
    ? [
        `${prefix}assets/bakhi/bk-core.js`,
        `${prefix}assets/bakhi/bk-learn.js`,
        `${prefix}assets/bakhi/bk-dev.js`
      ]
    : isComingSoon
      ? [`${prefix}assets/bakhi/bk-core.js`]
      : [
          `${prefix}assets/bakhi/bk-core.js`,
          `${prefix}assets/bakhi/bk-page.js`
        ];

  const block = '\n<!-- Bá Khí Learning Platform (chỉ thêm thẻ script, không sửa nội dung) -->\n' +
    scripts.map((src) => `<script src="${src}" defer></script>`).join('\n') + '\n';

  // Chèn bk-bkt.js vào <head> (chặn, không defer) để animation chuyển trang
  // hiện ngay khi trang mở, tránh chớp nội dung trước.
  if (!html.includes('data-bkt-head')) {
    const hpos = html.indexOf('</head>');
    if (hpos >= 0) {
      const lineStart = html.lastIndexOf('\n', hpos) + 1;
      const headTag = `<script src="${prefix}assets/bakhi/bk-bkt.js" data-bkt-head="1"></script>`;
      html = html.slice(0, lineStart) + headTag + '\n' + html.slice(lineStart);
    }
  }

  const idx = html.lastIndexOf('</body>');
  if (idx < 0) {
    console.warn(`! Không thấy </body>: ${rel}`);
    return 'error';
  }
  html = html.slice(0, idx) + block + html.slice(idx);
  fs.writeFileSync(file, html);
  return 'injected';
}

const files = walk(ROOT).sort();
const stats = { injected: 0, already: 0, skip: 0, error: 0 };
for (const file of files) {
  const r = inject(file);
  stats[r] = (stats[r] || 0) + 1;
  if (r === 'injected') console.log('  + ' + path.relative(ROOT, file));
}
console.log(`\nTổng ${files.length} file HTML:`, stats);

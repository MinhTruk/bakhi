#!/usr/bin/env node
/**
 * Chèn favicon tĩnh dùng chung vào mọi trang HTML.
 *
 * - Thêm <link> ngay trước </head>; KHÔNG sửa nội dung giáo dục.
 * - Đường dẫn tương đối đúng với độ sâu của từng trang (kể cả Studio, admin).
 * - Idempotent: mọi dòng chèn đều chứa `assets/bakhi/` nên content-integrity
 *   bỏ qua, và chạy lại không chèn trùng.
 *
 * Dùng: node tools/inject-favicon.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'assets', 'docs', 'tools']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (entry.isFile() && /\.html$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function inject(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('data-bk-favicon="1"')) return 'already';

  const hpos = html.search(/<head\b[^>]*>/i);
  if (hpos < 0) return 'no-head';
  const headEnd = hpos + html.slice(hpos).match(/^<head\b[^>]*>/i)[0].length;

  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const lines = [
    '<!-- Bá Khí static favicon — assets/bakhi/favicon.svg -->',
    `<link rel="icon" type="image/svg+xml" href="${prefix}assets/bakhi/favicon.svg" sizes="any" data-bk-favicon="1">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/bakhi/favicon-32x32.png" data-bk-favicon="1">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${prefix}assets/bakhi/favicon-192x192.png" data-bk-favicon="1">`,
    `<link rel="icon" href="${prefix}assets/bakhi/favicon.ico" sizes="16x16 32x32 48x48" data-bk-favicon="1">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${prefix}assets/bakhi/apple-touch-icon.png" data-bk-favicon="1">`
  ];
  /* Chèn ngay sau <head> để không bao giờ rơi vào trong <style>/<script>. */
  html = html.slice(0, headEnd) + '\n' + lines.join('\n') + html.slice(headEnd);
  fs.writeFileSync(file, html);
  return 'injected';
}

const files = walk(ROOT).sort();
const stats = { injected: 0, already: 0, 'no-head': 0 };
for (const file of files) {
  const r = inject(file);
  stats[r] = (stats[r] || 0) + 1;
  if (r === 'injected') console.log('  + ' + path.relative(ROOT, file));
  else if (r === 'no-head') console.log('  ! không có </head>: ' + path.relative(ROOT, file));
}
console.log(`\nTổng ${files.length} file HTML:`, stats);

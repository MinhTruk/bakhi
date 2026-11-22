#!/usr/bin/env node
/**
 * Chèn manifest PWA + theme-color vào mọi trang HTML.
 *
 *   node tools/inject-pwa.js
 *
 * - Idempotent: dấu `data-bk-pwa="1"` chặn chèn trùng.
 * - Đường dẫn tương đối đúng với độ sâu từng trang.
 * - Dòng chèn chứa `assets/bakhi/` nên content-integrity bỏ qua (không tính là
 *   thay đổi nội dung giáo dục).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'assets', 'docs', 'tools', 'artifacts']);

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
  if (html.includes('data-bk-pwa="1"')) return 'already';
  if (!/<html\b/i.test(html)) return 'no-html';

  const hpos = html.search(/<head\b[^>]*>/i);
  if (hpos < 0) return 'no-head';
  const headEnd = hpos + html.slice(hpos).match(/^<head\b[^>]*>/i)[0].length;

  /* Đường dẫn tương đối theo độ sâu từng trang (giống favicon) để chạy đúng cả
     khi site nằm dưới /bakhi/ của GitHub Pages lẫn khi chạy máy chủ tĩnh ở gốc. */
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const line = '<link rel="manifest" href="' + prefix + 'assets/bakhi/manifest.webmanifest" data-bk-pwa="1">' +
    '<meta name="theme-color" content="#0f172a" data-bk-pwa="1">';
  /* Chỉ chèn khi <head> đã kết thúc dòng. Nếu <head> nằm giữa dòng (ví dụ
     `<!DOCTYPE html><html><head><meta charset…>`), mọi cách chèn đều làm dòng
     đó đổi cấu trúc → content-integrity báo sai là sửa nội dung giáo dục.
     Hai trang rơi vào trường hợp này được bỏ qua (PWA vẫn hoạt động vì
     service worker đăng ký từ các trang khác trong cùng phạm vi site). */
  const tail = html.slice(headEnd);
  if (!/^\r?\n/.test(tail)) return 'head-inline';
  html = html.slice(0, headEnd) + '\n' + line + tail;
  fs.writeFileSync(file, html);
  return 'injected';
}

const files = walk(ROOT).sort();
const stats = { injected: 0, already: 0, 'no-head': 0, 'no-html': 0, 'head-inline': 0 };
for (const file of files) {
  const r = inject(file);
  stats[r] = (stats[r] || 0) + 1;
  if (r === 'injected') console.log('  + ' + path.relative(ROOT, file));
  else if (r !== 'already' && r !== 'head-inline') console.log('  ! ' + r + ': ' + path.relative(ROOT, file));
  else if (r === 'head-inline') console.log('  - bỏ qua (head cùng dòng): ' + path.relative(ROOT, file));
}
console.log(`\nTổng ${files.length} file HTML:`, stats);

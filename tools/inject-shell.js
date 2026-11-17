#!/usr/bin/env node
/**
 * Chèn lớp shell dùng chung (avatar + menu tài khoản, hồ sơ, badge) vào mọi trang.
 *
 * - Chỉ thêm thẻ <script> ngay trước </body>; KHÔNG sửa nội dung.
 * - Mọi dòng chèn đều chứa "assets/bakhi/" nên được tools/content-integrity.js
 *   bỏ qua khi băm nội dung giáo dục.
 * - Idempotent: chạy lại không chèn trùng.
 *
 * Dùng: node tools/inject-shell.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TAG = '7.0.0';
const MARKER = 'assets/bakhi/shell';
/* Trang quản trị có hệ giao diện riêng (bkAdminTheme) — không chèn shell. */
const SKIP = new Set(['admin/index.html', 'images/anh/1.html']);
/* Trang đã tự khai báo lớp shell trong HTML. */
const OWNS = new Set(['settings/index.html', 'profile/index.html']);

const FILES = [
  'bk-version.js',
  'bk-profile.js',
  'bk-badges.js',
  'bk-roles.js',
  'bk-shell.js'
];

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
  if (SKIP.has(rel) || OWNS.has(rel)) return 'skip';
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('bk-shell.js')) {
    /* Trang đã có shell từ bản cũ: chỉ bổ sung bk-roles.js nếu thiếu. */
    if (html.includes('bk-roles.js')) return 'already';
    const m = html.match(/^[ \t]*<script src="([^"]*bk-shell\.js[^"]*)"[^>]*><\/script>[ \t]*$/m);
    if (!m) return 'already';
    const rolesSrc = m[1].replace('bk-shell.js', 'bk-roles.js').replace(/\?v=[^"&]*/, '?v=' + TAG);
    html = html.replace(m[0], '    <script src="' + rolesSrc + '" defer></script>\n' + m[0]);
    fs.writeFileSync(file, html);
    return 'injected';
  }

  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);

  const block = '\n<!-- ' + MARKER + ' — avatar tài khoản dùng chung -->\n' +
    FILES.map((f) => `<script src="${prefix}assets/bakhi/${f}?v=${TAG}" defer></script>`).join('\n') + '\n';

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

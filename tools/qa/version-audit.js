'use strict';
/**
 * Bá Khí — Kiểm tra “nâng cấp toàn bộ” (không cần mạng, không cần jsdom).
 *
 *   node tools/qa/version-audit.js
 *
 * 1. Mọi tài nguyên nội bộ mà trang HTML tham chiếu đều tồn tại (không 404).
 * 2. Mọi `?v=` của tài nguyên nội bộ trùng đúng APP_VERSION hiện tại.
 * 3. Không còn chuỗi phiên bản cũ trong HTML/JS của website.
 * 4. Mọi trang nạp đúng một bản mỗi mô-đun dùng chung (không nạp trùng).
 * 5. Trang nào cần khối Danh hiệu thì nạp `bk-titles.js` + `bk-titles.css` đúng một lần.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
function ok(name, cond, detail) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const versionSrc = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-version.js'), 'utf8');
const APP = (versionSrc.match(/app:\s*'([^']+)'/) || [])[1];
ok('bk-version.js khai báo APP_VERSION', !!APP, String(APP));

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    if (d.name === '.git' || d.name === 'node_modules' || d.name === 'docs') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}
const files = walk(ROOT, []);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js') && !f.includes(path.sep + 'tools' + path.sep) &&
  !f.includes(path.sep + 'supabase' + path.sep));

/* 1 + 2 + 4: quét tham chiếu tài nguyên */
let refs = 0;
const missing = [];
const stale = [];
const dupes = [];
htmlFiles.forEach((file) => {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const assetRefs = html.match(/(?:src|href)="([^"']*assets\/[^"']+)"/g) || [];
  const seen = Object.create(null);
  assetRefs.forEach((raw) => {
    const url = raw.replace(/^(?:src|href)="/, '').replace(/"$/, '');
    if (/^https?:/.test(url)) return;
    refs++;
    const [p, q] = url.split('?');
    const clean = p.replace(/^\//, '');
    const abs = p.startsWith('/') ? path.join(ROOT, clean) : path.resolve(path.dirname(file), p);
    if (!fs.existsSync(abs)) missing.push(rel + ' → ' + url);
    const v = q && q.match(/(?:^|&)v=([^&]+)/);
    if (v && v[1] !== APP && !/^[23]\./.test(v[1])) stale.push(rel + ' → ' + url);
    const key = path.relative(ROOT, abs);
    /* bk-bkt.js tự bảo vệ bằng `if (window.__bkt) return;` và được chèn cả ở
       <head> lẫn cuối trang từ trước — nạp hai lần không gây tác dụng phụ. */
    if (seen[key] && !/bk-bkt\.js$/.test(key)) dupes.push(rel + ' → ' + key);
    seen[key] = true;
  });
});
ok('mọi tài nguyên nội bộ đều tồn tại (' + refs + ' tham chiếu)', missing.length === 0,
  missing.slice(0, 4).join(' | '));
ok('mọi ?v= của tài nguyên nội bộ đều là ' + APP, stale.length === 0, stale.slice(0, 4).join(' | '));
ok('không trang nào nạp trùng một tài nguyên', dupes.length === 0, dupes.slice(0, 4).join(' | '));

/* 3: không còn phiên bản cũ trong HTML/JS của website */
const leftovers = [];
htmlFiles.concat(jsFiles).forEach((file) => {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const m = src.match(/\?v=(7\.7\.0)\b/g);
  if (m) leftovers.push(rel + ' (' + m.length + ')');
});
ok('không còn ?v=7.7.0 trong HTML/JS', leftovers.length === 0, leftovers.slice(0, 4).join(' | '));

/* 5: trang có khối Danh hiệu phải nạp mô-đun dùng chung đúng một lần */
const titlePages = ['founder/index.html', 'chat/index.html', 'profile/index.html', 'settings/index.html', 'admin/index.html'];
let badTitles = [];
titlePages.forEach((rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { badTitles.push(rel + ' không tồn tại'); return; }
  const html = fs.readFileSync(p, 'utf8');
  const js = (html.match(/bk-titles\.js/g) || []).length;
  const css = (html.match(/bk-titles\.css/g) || []).length;
  if (js !== 1 || css !== 1) badTitles.push(rel + ' js=' + js + ' css=' + css);
});
ok('5 trang dùng Danh hiệu nạp bk-titles.js/css đúng một lần', badTitles.length === 0, badTitles.join(' | '));

/* APP_VERSION trong devboard và SERVER_VERSION của máy chủ phải khớp */
const devboard = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-devboard.js'), 'utf8');
const devVer = (devboard.match(/APP_VERSION = '([^']+)'/) || [])[1];
ok('bk-devboard.js cùng phiên bản ' + APP, devVer === APP, String(devVer));
const server = fs.readFileSync(path.join(ROOT, 'supabase/functions/admin-actions/index.ts'), 'utf8');
const srvVer = (server.match(/SERVER_VERSION = '([^']+)'/) || [])[1];
ok('admin-actions SERVER_VERSION cùng phiên bản ' + APP, srvVer === APP, String(srvVer));

console.log('Đã quét ' + htmlFiles.length + ' trang HTML, ' + jsFiles.length + ' tệp JS.');
console.log(failures ? '\n=== ' + failures + ' FAILURE(S) ===' : '\n=== ALL CHECKS PASSED ===');
process.exitCode = failures ? 1 : 0;

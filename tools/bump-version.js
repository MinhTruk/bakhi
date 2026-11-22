#!/usr/bin/env node
/**
 * Bá Khí — Bump phiên bản phát hành bằng MỘT lệnh.
 *
 *   node tools/bump-version.js 8.4.4          # đổi phiên bản + mọi ?v= + APP_VERSION/SERVER_VERSION
 *   node tools/bump-version.js 8.4.4 --date 2026-11-23
 *   node tools/bump-version.js --check        # chỉ báo lệch, không ghi
 *
 * Vì sao có công cụ này: trước 8.4.4, mỗi bản phát hành phải sửa tay hơn 1.250 chuỗi
 * `?v=` trên 124 tệp HTML, cộng `bk-version.js`, `bk-devboard.js` và `admin-actions`.
 * Sửa tay là nguồn lỗi lặp lại (sót tệp → trình duyệt giữ JS cũ → lỗi "ma").
 *
 * Nguyên tắc:
 * - Chỉ đụng chuỗi phiên bản và `?v=` của tài nguyên nội bộ `assets/bakhi/`.
 *   Không sửa nội dung giáo dục, không đổi cấu trúc thẻ.
 * - Yêu cầu CHANGELOG.md đã có mục `## [<phiên bản>]` trước khi đổi (tránh bump rỗng).
 * - Idempotent: chạy lại cùng phiên bản không thay đổi tệp nào.
 * - Không tự chạy `version-audit`; in gợi ý ở cuối.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'assets/bakhi/bk-version.js');
const DEVBOARD_FILE = path.join(ROOT, 'assets/bakhi/bk-devboard.js');
const SERVER_FILE = path.join(ROOT, 'supabase/functions/admin-actions/index.ts');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'tools', 'artifacts']);

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const dateIdx = args.indexOf('--date');
const dateArg = dateIdx >= 0 ? args[dateIdx + 1] : null;
const target = args.find((a, i) => !a.startsWith('--') && (dateIdx < 0 || i !== dateIdx + 1));

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

function readApp() {
  const src = fs.readFileSync(VERSION_FILE, 'utf8');
  return (src.match(/app:\s*'([^']+)'/) || [])[1] || '';
}

function changelogHas(version) {
  const src = fs.readFileSync(CHANGELOG, 'utf8');
  return new RegExp('^## \\[' + version.replace(/\./g, '\\.') + '\\]', 'm').test(src);
}

/** Số lượng `?v=` lệch phiên bản trong một tệp HTML. */
function counts(html, app) {
  const out = { stale: 0, current: 0 };
  const re = /(assets\/bakhi\/[^"'\s?]+)\?v=([^"&\s]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2] === app) out.current += 1;
    else out.stale += 1;
  }
  return out;
}

function rewriteHtml(html, from, to) {
  return html.replace(/(assets\/bakhi\/[^"'\s?]+)\?v=([^"&\s]+)/g, function (all, asset, ver) {
    if (ver === to) return all;
    /* Chỉ đổi chuỗi trùng phiên bản cũ đang phát hành; giữ nguyên các tài nguyên
       cố tình ghim phiên bản khác (ví dụ bk-bkt.js ở <head>). */
    if (from && ver !== from) return all;
    return asset + '?v=' + to;
  });
}

const htmlFiles = walk(ROOT).sort();
const currentApp = readApp();
const version = target || currentApp;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Phiên bản không hợp lệ: ' + version + ' (cần dạng x.y.z)');
  process.exit(2);
}

let staleFiles = 0;
let staleRefs = 0;
for (const file of htmlFiles) {
  const c = counts(fs.readFileSync(file, 'utf8'), version);
  if (c.stale) {
    staleFiles += 1;
    staleRefs += c.stale;
  }
}

const devSrc = fs.readFileSync(DEVBOARD_FILE, 'utf8');
const devVer = (devSrc.match(/APP_VERSION = '([^']+)'/) || [])[1] || '';
const srvSrc = fs.readFileSync(SERVER_FILE, 'utf8');
const srvVer = (srvSrc.match(/SERVER_VERSION = '([^']+)'/) || [])[1] || '';

console.log('Phiên bản đang phát hành: ' + currentApp);
console.log('Phiên bản đích:           ' + version);
console.log('HTML lệch ?v=:            ' + staleFiles + ' tệp / ' + staleRefs + ' tham chiếu');
console.log('bk-devboard APP_VERSION:  ' + devVer);
console.log('admin-actions VERSION:    ' + srvVer);

if (checkOnly) {
  const bad = staleFiles || devVer !== version || srvVer !== version || currentApp !== version;
  console.log(bad ? '\nLỆCH PHIÊN BẢN — chạy: node tools/bump-version.js ' + version : '\nĐã đồng bộ.');
  process.exitCode = bad ? 1 : 0;
  return;
}

if (version !== currentApp) {
  if (!changelogHas(version)) {
    console.error('\nTỪ CHỐI: CHANGELOG.md chưa có mục "## [' + version + ']". ' +
      'Viết mục phát hành trước rồi bump.');
    process.exit(1);
  }
  const today = dateArg || new Date().toISOString().slice(0, 10);
  const next = fs.readFileSync(VERSION_FILE, 'utf8')
    .replace(/app:\s*'[^']+'/, "app: '" + version + "'")
    .replace(/releasedAt:\s*'[^']+'/, "releasedAt: '" + today + "'");
  fs.writeFileSync(VERSION_FILE, next);
  console.log('  ~ assets/bakhi/bk-version.js');
}

let touched = 0;
for (const file of htmlFiles) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rewriteHtml(before, currentApp, version);
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched += 1;
  }
}
console.log('  ~ ' + touched + ' tệp HTML');

const devNext = devSrc.replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '" + version + "'");
if (devNext !== devSrc) {
  fs.writeFileSync(DEVBOARD_FILE, devNext);
  console.log('  ~ assets/bakhi/bk-devboard.js');
}
const srvNext = srvSrc.replace(/SERVER_VERSION = '[^']+'/, "SERVER_VERSION = '" + version + "'");
if (srvNext !== srvSrc) {
  fs.writeFileSync(SERVER_FILE, srvNext);
  console.log('  ~ supabase/functions/admin-actions/index.ts');
}

console.log('\nXong. Kiểm tra: node tools/qa/version-audit.js');

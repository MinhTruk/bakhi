'use strict';
/**
 * Bá Khí 8.4.4 — smoke test chỉ mục bài học toàn site.
 *
 * Kiểm tra:
 *   · search-index.js đã sinh, có đủ các trang môn học, không lẫn trang giao diện
 *   · BK.search.lessons() gộp chỉ mục toàn site vào kết quả của trang đang mở
 *   · Tìm không dấu vẫn ra bài ở môn khác
 *
 * Chạy: NODE_PATH=/tmp/bktest/node_modules node tools/qa/search-index-smoke.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const dom = new JSDOM(
  '<!DOCTYPE html><html lang="vi"><head><title>Bài học</title></head><body><main></main></body></html>',
  { url: 'https://minhtruk.github.io/bakhi/ktgk1/toan/indextoan.html', runScripts: 'outside-only', pretendToBeVisual: true }
);
const w = dom.window;
w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } });

w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-core.js'), 'utf8'));
ok('BK core đã nạp', !!(w.BK && w.BK.search));

w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/search-index.js'), 'utf8'));
const index = w.BK_LESSON_INDEX || [];
ok('chỉ mục có dữ liệu', index.length > 80, String(index.length));
ok('chỉ mục chỉ gồm trang môn học',
  index.every((r) => !!r.s), index.filter((r) => !r.s).slice(0, 3).map((r) => r.u).join(', '));
ok('không lẫn trang giao diện',
  !index.some((r) => /^(chat|settings|profile|gamification|skills|studio|admin|founder)\//.test(r.u)));
ok('không có đường dẫn trùng',
  new Set(index.map((r) => r.u)).size === index.length);

const lessons = w.BK.search.lessons();
ok('gộp chỉ mục toàn site vào trang đang mở', lessons.length > 80, String(lessons.length));
/* jsdom không có document.currentScript nên basePath() trả './'; trong trình
   duyệt thật basePath() là gốc site. Chỉ cần kiểm tra đúng đường dẫn tương đối. */
ok('đường dẫn trỏ đúng trang bài học',
  lessons.some((l) => /(^|\/)ktgk1\/van\/indexvan\.html$/.test(l.url)),
  lessons.slice(0, 3).map((l) => l.url).join(' | '));
ok('không lặp lại trang đang mở',
  !lessons.some((l) => /\/bakhi\/ktgk1\/toan\/indextoan\.html$/.test(l.url)));

const hits = w.BK.search.all('ngu van 11').flat || [];
ok('tìm không dấu ra bài môn khác', hits.some((r) => r.category === 'Bài học' && /van\//.test(r.url)),
  hits.slice(0, 3).map((r) => r.url).join(' | '));

console.log('');
if (failures) {
  console.log('THẤT BẠI: ' + failures + ' kiểm tra không đạt.');
  process.exit(1);
}
console.log('OK — chỉ mục bài học và tìm kiếm toàn site hoạt động.');

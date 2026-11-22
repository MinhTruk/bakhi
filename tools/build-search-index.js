#!/usr/bin/env node
/**
 * Bá Khí — Sinh chỉ mục bài học toàn site cho tìm kiếm từ mọi trang.
 *
 *   node tools/build-search-index.js           # ghi assets/bakhi/search-index.js
 *   node tools/build-search-index.js --check   # chỉ kiểm tra chỉ mục còn khớp nguồn
 *
 * Đầu ra là một tệp JS tĩnh (không phải JSON tải bằng fetch) để:
 * - chạy được cả khi mở trang bằng file:// hoặc mạng chậm,
 * - dùng đúng cơ chế cache `?v=` sẵn có của site.
 *
 * Chỉ đọc thẻ <title>, <h1> và tên tệp — KHÔNG đọc/sửa nội dung câu hỏi, đáp án.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/bakhi/search-index.js');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'assets', 'docs', 'tools', 'artifacts',
  'admin', 'founder', 'supabase']);
const EXAMS = {
  ktgk1: 'KTGK · Giữa kỳ 1', ktgk2: 'KTGK · Giữa kỳ 2',
  ktck1: 'KTCK · Cuối kỳ 1', ktck2: 'KTCK · Cuối kỳ 2'
};
const SUBJECTS = {
  toan: 'Toán', van: 'Ngữ Văn', ly: 'Vật Lý', hoa: 'Hoá Học', sinh: 'Sinh Học',
  su: 'Lịch Sử', tin: 'Tin Học', anh: 'Tiếng Anh', gddp: 'GDĐP', gdqp: 'GDQP'
};

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

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function textOf(html, tag) {
  const m = html.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? decode(m[1].replace(/<[^>]+>/g, ' ')) : '';
}

/** Bỏ hậu tố thương hiệu khỏi tiêu đề để tìm kiếm dễ hơn. */
function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*[-–|·]\s*BAKHI\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function examOf(rel) {
  const parts = rel.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    const two = parts.slice(i, i + 2).join('/');
    if (/^kttx\/(gk|ck)[12]$/.test(two)) return two.replace('/', ' · ').toUpperCase();
    if (EXAMS[parts[i]]) return EXAMS[parts[i]];
  }
  return '';
}

function subjectOf(rel) {
  const parts = rel.split('/');
  for (const p of parts) if (SUBJECTS[p]) return p;
  return '';
}

function build() {
  const rows = [];
  for (const file of walk(ROOT).sort()) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const title = cleanTitle(textOf(html, 'title'));
    const h1 = textOf(html, 'h1');
    const name = h1 && h1.length >= 4 && h1 !== title ? h1 : '';
    const label = title || name || path.basename(rel, '.html');
    const subject = subjectOf(rel);
    /* Chỉ mục phục vụ tìm BÀI HỌC: bỏ trang giao diện (hồ sơ, cài đặt, chat,
       tiến trình, Studio) và trang chủ để kết quả tìm kiếm không nhiễu. */
    if (!subject) continue;
    const keywords = [subject, SUBJECTS[subject] || '', examOf(rel), path.basename(rel, '.html')]
      .filter(Boolean).join(' ');
    rows.push({
      u: rel,
      t: label.slice(0, 160),
      n: name && name !== label ? name.slice(0, 120) : '',
      s: subject,
      e: examOf(rel),
      k: keywords
    });
  }
  return rows;
}

function render(rows) {
  const header = [
    '/* =========================================================================',
    '   Bá Khí — search-index.js (TỆP TỰ SINH, đừng sửa tay)',
    '   Chỉ mục tiêu đề bài học cho tìm kiếm xuyên trang.',
    '   Sinh lại: node tools/build-search-index.js',
    '   Không chứa câu hỏi, đáp án hay giải thích — chỉ tiêu đề + đường dẫn.',
    '   ========================================================================= */'
  ].join('\n');
  const body = rows.map((r) => JSON.stringify(r)).join(',\n        ');
  return header + '\n(function (global) {\n    global.BK_LESSON_INDEX = [\n        ' + body + '\n    ];\n})(typeof window !== \'undefined\' ? window : this);\n';
}

const rows = build();
const text = render(rows);
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (prev === text) { console.log('Chỉ mục bài học đã khớp (' + rows.length + ' trang).'); return; }
  console.error('Chỉ mục bài học ĐÃ LỆCH. Chạy: node tools/build-search-index.js');
  process.exitCode = 1;
  return;
}

fs.writeFileSync(OUT, text);
console.log('Đã ghi ' + path.relative(ROOT, OUT) + ': ' + rows.length + ' trang, ' +
  Math.round(Buffer.byteLength(text) / 1024) + ' KB.');

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

/**
 * Report Issue dùng chung cho mọi trang có bk-cloud.js (8.0.0).
 * Chỉ thêm một thẻ script; idempotent; không sửa nội dung.
 */
function ensureReport(file, html) {
  if (html.includes('assets/bakhi/bk-report.js')) return html;
  if (!html.includes('assets/bakhi/bk-cloud.js')) return html;
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  /* Dashboard quản trị KHÔNG nạp nút báo cáo của học sinh (AGENTS §4.2). */
  if (/^(admin|founder)\//.test(rel)) return html;
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const idx = html.lastIndexOf('</body>');
  if (idx < 0) return html;
  const tag = `<script src="${prefix}assets/bakhi/bk-report.js" defer></script>\n`;
  return html.slice(0, idx) + tag + html.slice(idx);
}


/**
 * Hệ thống giao diện + biểu tượng trang trí (8.4.0).
 * Chỉ thêm một thẻ CSS và một thẻ script; idempotent; không sửa nội dung.
 * Bỏ qua trang quản trị (admin/, founder/) và trang không có bk-core.js.
 */
function ensureThemes(file, html) {
  if (html.includes('assets/bakhi/bk-themes.js')) return html;
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (/^(admin|founder)\//.test(rel)) return html;
  if (!html.includes('assets/bakhi/bk-core.js')) return html;
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  /* Nối vào CUỐI tệp, mỗi thẻ một dòng riêng và không thêm dòng trống cuối.
     content-integrity bỏ toàn bộ dòng chứa assets/bakhi; cách nối này giữ
     nguyên cấu trúc dòng còn lại nên hash nội dung giáo dục không đổi.
     Trình duyệt tự đưa phần tử nối sau </html> vào body. */
  const sep = html.endsWith('\n') ? '' : '\n';
  return html + sep +
    `    <link rel="stylesheet" href="${prefix}assets/bakhi/bk-themes.css?v=8.4.0">\n` +
    `<script src="${prefix}assets/bakhi/bk-themes.js?v=8.4.0" defer></script>\n`;
}

/**
 * Trợ lý AI (8.5.0): nút "Hỏi AI" dùng chung trên mọi trang học tập.
 * Chỉ thêm CSS + một thẻ script; idempotent; không sửa nội dung.
 * Bỏ qua trang quản trị, trang AI Tutor đầy đủ và trang không có bk-cloud.js.
 */
function ensureAiTutor(file, html) {
  if (html.includes('assets/bakhi/bk-ai-tutor.js')) return html;
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (/^(admin|founder|ai-tutor)\//.test(rel)) return html;
  if (!html.includes('assets/bakhi/bk-cloud.js')) return html;
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  /* Nối vào CUỐI tệp giống ensureThemes: một số trang cũ có thẻ <script> mở
     không đóng trên cùng dòng, chèn trước </body> sẽ lọt vào bên trong thẻ đó.
     content-integrity bỏ toàn bộ dòng chứa assets/bakhi/ nên hash nội dung
     giáo dục không đổi. */
  const sep = html.endsWith('\n') ? '' : '\n';
  return html + sep +
    `    <link rel="stylesheet" href="${prefix}assets/bakhi/bk-ai-tutor.css">\n` +
    `<script src="${prefix}assets/bakhi/bk-ai-tutor.js" defer></script>\n`;
}

function inject(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  let html = fs.readFileSync(file, 'utf8');
  /* Report Issue cũng có mặt ở Studio (trang tĩnh độc lập). */
  const withReport = ensureReport(file, html);
  if (withReport !== html) {
    fs.writeFileSync(file, withReport);
    html = withReport;
  }
  if (!SKIP.has(rel)) {
    const withThemes = ensureThemes(file, html);
    if (withThemes !== html) {
      fs.writeFileSync(file, withThemes);
      html = withThemes;
    }
  }
  /* Trợ lý AI chạy SAU themes để hai khối cùng nối ở cuối tệp, đúng thứ tự.
     8.5.3: "Hỏi AI" có mặt ở MỌI trang học sinh, kể cả studio/ (ứng dụng tĩnh
     riêng đã có bk-cloud.js); trang quản trị vẫn bỏ qua, hàm tự kiểm tra. */
  const withAi = ensureAiTutor(file, html);
  if (withAi !== html) {
    fs.writeFileSync(file, withAi);
    html = withAi;
  }
  if (SKIP.has(rel)) return 'skip';
  if (html.includes('assets/bakhi/bk-core.js')) return 'already';

  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const isHome = depth === 0 && /^index\.html$/i.test(path.basename(rel));

  // Trang "Coming soon" chỉ cần lớp core (âm nhạc + hiệu ứng), không cần dock học tập.
  const isComingSoon = /Coming soon/i.test(html);
  const scripts = isHome
    ? [
        `${prefix}assets/bakhi/bk-core.js`,
        `${prefix}assets/bakhi/bk-learning.js`,
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

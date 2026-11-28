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
  const bust = appVersion() ? '?v=' + appVersion() : '';
  if (html.includes('assets/bakhi/bk-themes.js')) {
    return html
      .replace(/(assets\/bakhi\/bk-themes\.css)(\?v=[^"']*)?/g, '$1' + bust)
      .replace(/(assets\/bakhi\/bk-themes\.js)(\?v=[^"']*)?/g, '$1' + bust);
  }
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
    `    <link rel="stylesheet" href="${prefix}assets/bakhi/bk-themes.css${bust}">\n` +
    `<script src="${prefix}assets/bakhi/bk-themes.js${bust}" defer></script>\n`;
}

/**
 * Trợ lý AI (8.5.0): nút "Hỏi AI" dùng chung trên mọi trang học tập.
 * Chỉ thêm CSS + một thẻ script; idempotent; không sửa nội dung.
 * Bỏ qua trang quản trị, trang AI Tutor đầy đủ và trang không có bk-cloud.js.
 */
/** Phiên bản hiện tại từ bk-version.js — dùng cho cache busting của thẻ chèn. */
function appVersion() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-version.js'), 'utf8');
    const m = src.match(/app:\s*'([0-9.]+)'/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function ensureAiTutor(file, html) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (/^(admin|founder|ai-tutor)\//.test(rel)) return html;
  if (!html.includes('assets/bakhi/bk-cloud.js')) return html;
  const version = appVersion();
  const bust = version ? '?v=' + version : '';
  /* Thẻ đã có: chỉ bổ sung / cập nhật ?v= để trình duyệt không dùng JS/CSS cũ
     (nút × của 8.5.3 không hiện nếu tải bản cache 8.5.2). */
  if (html.includes('assets/bakhi/bk-ai-tutor.js')) {
    return html
      .replace(/(assets\/bakhi\/bk-ai-tutor\.css)(\?v=[^"']*)?/g, '$1' + bust)
      .replace(/(assets\/bakhi\/bk-ai-tutor\.js)(\?v=[^"']*)?/g, '$1' + bust);
  }
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  /* Nối vào CUỐI tệp giống ensureThemes: một số trang cũ có thẻ <script> mở
     không đóng trên cùng dòng, chèn trước </body> sẽ lọt vào bên trong thẻ đó.
     content-integrity bỏ toàn bộ dòng chứa assets/bakhi/ nên hash nội dung
     giáo dục không đổi. */
  const sep = html.endsWith('\n') ? '' : '\n';
  return html + sep +
    `    <link rel="stylesheet" href="${prefix}assets/bakhi/bk-ai-tutor.css${bust}">\n` +
    `<script src="${prefix}assets/bakhi/bk-ai-tutor.js${bust}" defer></script>\n`;
}

/**
 * Design Tokens dùng chung (8.5.5).
 * Nạp cho MỌI trang HTML — kể cả studio/, admin/ và founder/ — vì cả nền tảng
 * dùng cùng một bảng màu tối. Thẻ nối ở CUỐI tệp nên bk-tokens.css áp sau các
 * CSS cũ, đúng ý đồ ghi đè token; content-integrity bỏ dòng chứa assets/bakhi/
 * nên hash nội dung giáo dục không đổi.
 */
function ensureTokens(file, html) {
  const version = appVersion();
  const bust = version ? '?v=' + version : '';
  if (html.includes('assets/bakhi/bk-tokens.css')) {
    return html.replace(/(assets\/bakhi\/bk-tokens\.css)(\?v=[^"']*)?/g, '$1' + bust);
  }
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const sep = html.endsWith('\n') ? '' : '\n';
  return html + sep +
    `    <link rel="stylesheet" href="${prefix}assets/bakhi/bk-tokens.css${bust}">\n`;
}

/**
 * Màn hình mở đầu thương hiệu — CHỈ trang chủ (index.html).
 * CSS đặt trong <head> để áp trước khung hình đầu tiên (tránh nháy chữ trần),
 * JS nối ở cuối tệp như các mô-đun khác. Cả hai thẻ nằm trên dòng riêng có
 * `assets/bakhi/` nên content-integrity bỏ qua: hash nội dung giáo dục giữ nguyên.
 */
function ensureIntro(file, html) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (rel !== 'index.html') return html;
  const version = appVersion();
  const bust = version ? '?v=' + version : '';
  if (html.includes('assets/bakhi/bk-intro.js')) {
    return html
      .replace(/(assets\/bakhi\/bk-intro\.css)(\?v=[^"']*)?/g, '$1' + bust)
      .replace(/(assets\/bakhi\/bk-intro\.js)(\?v=[^"']*)?/g, '$1' + bust);
  }
  const link = `    <link rel="stylesheet" href="assets/bakhi/bk-intro.css${bust}">`;
  const script = `<script src="assets/bakhi/bk-intro.js${bust}" defer></script>`;
  let out = html;
  const hpos = out.indexOf('</head>');
  if (hpos >= 0) {
    const lineStart = out.lastIndexOf('\n', hpos) + 1;
    out = out.slice(0, lineStart) + link + '\n' + out.slice(lineStart);
  } else {
    out += (out.endsWith('\n') ? '' : '\n') + link + '\n';
  }
  /* Script đặt ngay TRƯỚC dòng cuối cùng có `assets/bakhi/`: lớp đã chèn sau
     (khối bk-rebirth) vẫn nằm cuối tệp, đúng thứ tự mà tools/inject-rebirth.js
     --check mong đợi. Chưa có dòng nào thì nối vào cuối tệp như các mô-đun khác. */
  const lines = out.split('\n');
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('assets/bakhi/')) { at = i; break; }
  }
  if (at < 0) return out + (out.endsWith('\n') ? '' : '\n') + script + '\n';
  lines.splice(at, 0, script);
  return lines.join('\n');
}

/* Chuyển trang void: script đồng bộ trong <head> để overlay kịp dựng khi trang
   mới tải. Idempotent; chèn sau dòng <head> như ensureThemeBoot. */
function ensureTransitionHead(file, html) {
  const version = appVersion();
  const bust = version ? '?v=' + version : '';
  if (html.includes('data-bkt-head')) {
    /* Bỏ thẻ trùng không có data-bkt-head (bản chèn cũ), rồi cập nhật ?v=. */
    return html
      .replace(/[ \t]*<script [^>]*bk-bkt\.js[^>]*><\/script>\r?\n/g, function (m) {
        return m.includes('data-bkt-head') ? m : '';
      })
      .replace(/(assets\/bakhi\/bk-bkt\.js)(\?v=[^"']*)?/g, '$1' + bust);
  }
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const tag = `<script src="${prefix}assets/bakhi/bk-bkt.js${bust}" data-bkt-head="1"></script>`;
  const headMatch = /<head(\s[^>]*)?>/i.exec(html);
  if (!headMatch) return html;
  const nl = html.indexOf('\n', headMatch.index + headMatch[0].length);
  if (nl < 0) return html;
  return html.slice(0, nl + 1) + tag + '\n' + html.slice(nl + 1);
}

/* 8.5.6 — khởi tạo giao diện SỚM: chèn script đồng bộ ngay TRƯỚC <head> để
   html.light/.dark có mặt trước khi trình duyệt vẽ khung đầu tiên (chống FOUC).
   Thẻ nằm trên dòng riêng và chứa `assets/bakhi/` nên content-integrity bỏ
   qua dòng này, hash nội dung giáo dục không đổi. Idempotent, có ?v=. */
function ensureThemeBoot(file, html) {
  const version = appVersion();
  const bust = version ? '?v=' + version : '';
  if (/assets\/bakhi\/bk-theme-boot\.js/.test(html)) {
    return html.replace(/(assets\/bakhi\/bk-theme-boot\.js)(\?v=[^"']*)?/g, '$1' + bust);
  }
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const tag = `<script src="${prefix}assets/bakhi/bk-theme-boot.js${bust}"></script>`;
  /* Chèn vào ĐẦU MỘT DÒNG MỚI ngay sau dòng chứa <head>…>: không sửa byte nào
     của dòng cũ nên hash nội dung giáo dục giữ nguyên (content-integrity bỏ
     toàn bộ dòng có assets/bakhi/). Không chèn trước <!DOCTYPE> vì sẽ làm
     trình duyệt bỏ doctype và rơi vào quirks mode. */
  const insertAfterLine = (anchorIndex) => {
    if (anchorIndex < 0) return null;
    const nl = html.indexOf('\n', anchorIndex);
    if (nl < 0) return null;
    return html.slice(0, nl + 1) + tag + '\n' + html.slice(nl + 1);
  };
  const headMatch = /<head(\s[^>]*)?>/i.exec(html);
  let out = insertAfterLine(headMatch ? headMatch.index + headMatch[0].length : -1);
  if (out) return out;
  const bodyMatch = /<body(\s[^>]*)?>/i.exec(html);
  out = insertAfterLine(bodyMatch ? bodyMatch.index + bodyMatch[0].length : -1);
  if (out) return out;
  const sep = html.endsWith('\n') ? '' : '\n';
  return html + sep + tag + '\n';
}

function inject(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  let html = fs.readFileSync(file, 'utf8');
  const withBoot = ensureThemeBoot(file, html);
  if (withBoot !== html) {
    fs.writeFileSync(file, withBoot);
    html = withBoot;
  }
  const withVt = ensureTransitionHead(file, html);
  if (withVt !== html) {
    fs.writeFileSync(file, withVt);
    html = withVt;
  }
  const withTokens = ensureTokens(file, html);
  if (withTokens !== html) {
    fs.writeFileSync(file, withTokens);
    html = withTokens;
  }
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
  /* Màn hình mở đầu: chỉ trang chủ (hàm tự kiểm tra tên tệp). */
  const withIntro = ensureIntro(file, html);
  if (withIntro !== html) {
    fs.writeFileSync(file, withIntro);
    html = withIntro;
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

#!/usr/bin/env node
/**
 * Bá Khí — Content integrity guard.
 *
 * Mục đích: chứng minh nội dung giáo dục (câu hỏi, đáp án, giải thích, công thức)
 * KHÔNG bị thay đổi khi nâng cấp giao diện / thêm tính năng.
 *
 * Cách làm: băm (sha256) từng file HTML sau khi loại bỏ các dòng <script>/<link>
 * do lớp nâng cấp thêm vào (đường dẫn chứa `assets/bakhi/`). Nếu phần nội dung
 * còn lại thay đổi, hash sẽ khác và script thoát với mã lỗi.
 *
 * Cách dùng:
 *   node tools/content-integrity.js baseline   # ghi docs/content-baseline.json (chạy TRƯỚC khi sửa)
 *   node tools/content-integrity.js verify     # so sánh với baseline
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(ROOT, 'docs', 'content-baseline.json');
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

/**
 * Bỏ đúng khối do lớp nâng cấp chèn vào (bình luận đánh dấu + các thẻ script).
 * Sau đó bỏ nốt mọi dòng còn sót tham chiếu assets/bakhi để chắc chắn.
 */
function stripInjected(source) {
  return source
    .replace(/\r?\n<!-- Bá Khí Learning Platform[\s\S]*?-->\s*(?:<script src="[^"]*assets\/bakhi\/[^"]*" defer><\/script>\s*)*/g, '')
    .split(/\r?\n/)
    .filter((line) => !/assets\/bakhi\//.test(line))
    .join('\n');
}

function sha(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Thống kê nội dung giáo dục (chỉ đếm, không sửa). */
function stats(source) {
  const count = (re) => (source.match(re) || []).length;
  return {
    correctAnswer: count(/correctAnswer\s*:/g),
    correctField: count(/\bcorrect\s*:/g),
    explanation: count(/\b(explanation|exp|solution|key)\s*:/g),
    questionField: count(/\b(question|problem|q|title)\s*:/g),
    optionsArray: count(/\boptions\s*:/g),
    essayBank: count(/ESSAY_BANK/g),
    mcqBank: count(/MCQ_BANK/g),
    tfBank: count(/TF_BANK/g)
  };
}

function snapshot() {
  const files = walk(ROOT).sort();
  const data = { generatedAt: new Date().toISOString(), algorithm: 'sha256(strip(assets/bakhi lines))', files: {} };
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const raw = fs.readFileSync(file, 'utf8');
    data.files[rel] = {
      hash: sha(stripInjected(raw)),
      bytes: Buffer.byteLength(raw),
      stats: stats(raw)
    };
  }
  return data;
}

function main() {
  const mode = (process.argv[2] || 'verify').toLowerCase();
  const current = snapshot();

  if (mode === 'baseline') {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
    console.log(`Baseline: ${Object.keys(current.files).length} file HTML → ${path.relative(ROOT, BASELINE)}`);
    return;
  }

  if (!fs.existsSync(BASELINE)) {
    console.error('Chưa có baseline. Chạy: node tools/content-integrity.js baseline');
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const problems = [];
  const missing = [];
  for (const [rel, meta] of Object.entries(base.files)) {
    const now = current.files[rel];
    if (!now) { missing.push(rel); continue; }
    if (now.hash !== meta.hash) problems.push(rel);
  }
  const added = Object.keys(current.files).filter((rel) => !base.files[rel]);

  console.log(`Đã kiểm tra ${Object.keys(base.files).length} file nội dung gốc.`);
  if (added.length) console.log(`File HTML mới (không nằm trong baseline): ${added.join(', ')}`);
  if (missing.length) console.log(`File bị thiếu: ${missing.join(', ')}`);
  if (problems.length) {
    console.error('NỘI DUNG ĐÃ THAY ĐỔI (regression):');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(1);
  }
  console.log('OK — không có nội dung giáo dục nào bị thay đổi.');
}

main();

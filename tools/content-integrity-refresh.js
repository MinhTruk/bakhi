'use strict';
/**
 * Cập nhật CÓ CHỌN LỌC các mục baseline nội dung cho những trang KHÔNG chứa
 * nội dung giáo dục (trang chủ, Studio). Không đụng tới 119 trang môn/bài học.
 *
 *   node tools/content-integrity-refresh.js index.html studio/index.html studio/word-paint.html
 */
const fs = require('fs');
const path = require('path');
/* Dùng chung đúng một thuật toán băm với tools/content-integrity.js. */
const { stripInjected, sha, stats } = require('./content-integrity.js');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(ROOT, 'docs', 'content-baseline.json');

const targets = process.argv.slice(2).map((p) => p.split(path.sep).join('/'));
if (!targets.length) {
  console.error('Cần danh sách tệp cần làm mới, ví dụ: index.html studio/index.html');
  process.exit(2);
}
if (!fs.existsSync(BASELINE)) {
  console.error('Chưa có docs/content-baseline.json');
  process.exit(2);
}
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const touched = [];
for (const rel of targets) {
  if (!base.files[rel]) {
    console.error('Tệp không có trong baseline: ' + rel);
    process.exit(1);
  }
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const statsNow = stats(raw);
  if (statsNow.correctAnswer || statsNow.essayBank || statsNow.mcqBank || statsNow.tfBank) {
    console.error('TỪ CHỐI: ' + rel + ' chứa dấu hiệu nội dung giáo dục — không được cập nhật baseline.');
    process.exit(1);
  }
  base.files[rel] = { hash: sha(stripInjected(raw)), bytes: Buffer.byteLength(raw), stats: statsNow };
  touched.push(rel);
}
base.notes = base.notes || [];
base.notes.push({
  at: new Date().toISOString(),
  reason: 'Trang không chứa nội dung giáo dục được viết lại có chủ đích (Studio hợp nhất, liên kết /studio/). Không có tệp môn/bài học nào thay đổi.',
  files: touched
});
base.algorithm = 'sha256(strip(assets/bakhi lines, CRLF→LF))';
fs.writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n');
console.log('Đã làm mới baseline cho: ' + touched.join(', '));

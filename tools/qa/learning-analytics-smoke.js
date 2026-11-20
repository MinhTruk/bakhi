'use strict';
/**
 * Bá Khí 8.2.0 — Personal Learning Analytics smoke test.
 * Kiểm tra chỉ số, biểu đồ, chống nhiễu (spam câu hỏi) và Learning Score.
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/learning-analytics-smoke.js
 */
const { make, ok, done } = require('./learning-harness');

const H = make();
const w = H.w;
const BK = w.BK;

function answer(id, correct, extra) {
  BK.practice(Object.assign({
    question: 'Câu ' + id + ' — nội dung kiểm tra',
    questionId: id, subject: 'toan', topic: 'Hàm số',
    correct: correct, silent: true
  }, extra || {}));
}

console.log('\n[1] Chưa có dữ liệu');
let sum = BK.analytics.summary(30);
ok('tổng = 0', sum.total === 0, String(sum.total));
ok('độ chính xác = 0 khi chưa có dữ liệu', sum.accuracy === 0);
let score = BK.analytics.learningScore();
ok('Learning Score chưa đủ dữ liệu', score.sufficient === false && score.score === null,
  JSON.stringify(score.score));

console.log('\n[2] Chỉ số cơ bản từ dữ liệu thật');
answer('a1', true);
answer('a2', false);
answer('a3', true);
answer('a4', true);
sum = BK.analytics.summary(30);
ok('đếm câu đã luyện', sum.total === 4, String(sum.total));
ok('đếm câu đúng', sum.correct === 3, String(sum.correct));
ok('độ chính xác 75%', sum.accuracy === 75, String(sum.accuracy));
ok('ngày hoạt động = 1', sum.activeDays === 1, String(sum.activeDays));
ok('số câu sai trong sổ tay', sum.mistakes === 1, String(sum.mistakes));

console.log('\n[3] Chống nhiễu: lặp cùng câu trong ngày');
for (let i = 0; i < 20; i++) answer('a2', true);
sum = BK.analytics.summary(30);
ok('không đếm lặp cùng câu trong ngày', sum.total === 4, String(sum.total));
ok('độ chính xác không bị thổi lên', sum.accuracy === 75, String(sum.accuracy));
ok('vẫn ghi nhận đủ lượt thật', sum.rawAttempts === 24, String(sum.rawAttempts));

console.log('\n[4] Chuỗi dữ liệu & môn học');
const series = BK.analytics.series(7);
ok('chuỗi 7 ngày', series.length === 7, String(series.length));
ok('ngày cuối là hôm nay', series[6].total === 4, String(series[6].total));
ok('độ chính xác theo ngày', series[6].accuracy === 75, String(series[6].accuracy));
const perf = BK.analytics.subjects(30);
ok('hiệu suất theo môn', perf.length === 1 && perf[0].id === 'toan' && perf[0].accuracy === 75,
  JSON.stringify(perf));
ok('môn đếm số câu sai', perf[0].mistakes === 1, String(perf[0].mistakes));

console.log('\n[5] Chủ đề yếu cần đủ dữ liệu');
ok('chưa kết luận khi < 4 câu', BK.analytics.weakTopics().length === 0,
  JSON.stringify(BK.analytics.weakTopics()));
for (let i = 0; i < 4; i++) answer('w' + i, false, { topic: 'Tích phân' });
const weak = BK.analytics.weakTopics();
ok('kết luận khi đủ dữ liệu', weak.length === 1 && weak[0].topic === 'Tích phân', JSON.stringify(weak));
ok('chủ đề yếu có độ chính xác thấp', weak[0].accuracy === 0, String(weak[0].accuracy));

console.log('\n[6] Phân bố lỗi');
BK.mistakes.update(H.store().review[0].id, { errorType: 'memory' });
const dist = BK.analytics.distribution(30);
ok('phân bố theo loại lỗi', dist.memory >= 1, JSON.stringify(dist));
ok('có đủ khoá loại lỗi', Object.keys(dist).length === 6, String(Object.keys(dist).length));

console.log('\n[7] Learning Score có giới hạn');
for (let i = 0; i < 12; i++) answer('s' + i, i % 2 === 0);
score = BK.analytics.learningScore();
ok('đủ dữ liệu thì có điểm', score.sufficient === true && typeof score.score === 'number',
  JSON.stringify(score.score));
ok('điểm trong khoảng 0–100', score.score >= 0 && score.score <= 100, String(score.score));
ok('có đủ thành phần trọng số', ['accuracy', 'consistency', 'progress', 'revision']
  .every((k) => score.parts.some((p) => p.key === k)), JSON.stringify(score.parts.map((p) => p.key)));
ok('tổng trọng số có giới hạn', score.parts.reduce((a, p) => a + p.weight, 0) <= 100,
  String(score.parts.reduce((a, p) => a + p.weight, 0)));
ok('điểm không phải hằng số', typeof score.score === 'number' && score.sample > 10, String(score.sample));

console.log('\n[8] Điểm không tăng nhờ spam');
const beforeSpam = score.score;
for (let i = 0; i < 40; i++) answer('s0', true); /* câu đúng ngay lần đầu, lặp 40 lần */
const afterSpam = BK.analytics.learningScore();
ok('spam cùng một câu không đổi điểm', afterSpam.score === beforeSpam,
  beforeSpam + '→' + afterSpam.score);

console.log('\n[9] Không có lỗi runtime');
ok('không có jsdomError', H.errors.length === 0, H.errors.join(' | '));

done('learning-analytics-smoke');

'use strict';
/**
 * Bá Khí 8.2.0 — Revision Engine smoke test.
 * Kiểm tra lịch ôn spaced repetition, hàng đợi, phiên ôn và việc KHÔNG sửa
 * kết quả luyện tập gốc.
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/revision-engine-smoke.js
 */
const { make, ok, done } = require('./learning-harness');

const H = make();
const w = H.w;
const BK = w.BK;
const DAY = 86400000;

function seed(id, extra) {
  BK.practice(Object.assign({
    question: 'Câu ' + id + ' cần ôn', questionId: id, subject: 'ly', topic: 'Sóng',
    correct: false, options: ['A', 'B'], answer: 0, silent: true
  }, extra || {}));
  const list = H.store().review;
  return list[list.length - 1];
}

function setTimes(id, patch) {
  BK.store.update((s) => {
    const r = s.review.find((x) => x.questionId === id);
    if (r) Object.assign(r, patch);
    return s;
  });
  return H.store().review.find((x) => x.questionId === id);
}

console.log('\n[1] Câu mới vào lịch ôn ngày mai');
const m1 = seed('r1');
ok('câu sai có lịch ôn tương lai', m1.nextReview > Date.now(), String(m1.nextReview - Date.now()));
ok('khoảng cách ban đầu = again (1 ngày)', m1.intervalDays === 1, String(m1.intervalDays));

console.log('\n[2] Hàng đợi theo phạm vi');
setTimes('r1', { nextReview: Date.now() - 3 * DAY });
const due = BK.revision.queue('due');
const overdue = BK.revision.queue('overdue');
const upcoming = BK.revision.queue('upcoming');
ok('quá hạn nằm trong due', due.length === 1, String(due.length));
ok('quá hạn nằm trong overdue', overdue.length === 1, String(overdue.length));
ok('sắp tới chưa đến hạn', upcoming.length === 0, String(upcoming.length));
setTimes('r1', { nextReview: Date.now() + 5 * DAY });
ok('đến hạn trống sau khi dời lịch', BK.revision.queue('due').length === 0);
ok('sắp tới có câu', BK.revision.queue('upcoming').length === 1);

console.log('\n[3] Một câu đúng chưa đủ thành thạo');
setTimes('r1', { nextReview: Date.now() - DAY });
BK.practice({
  question: 'Câu r1 cần ôn', questionId: 'r1', subject: 'ly', topic: 'Sóng',
  correct: true, silent: true
});
let item = H.store().review.find((x) => x.questionId === 'r1');
ok('streak = 1', item.streak === 1, String(item.streak));
ok('chưa thành thạo', item.status !== 'mastered', item.status);
ok('khoảng cách tăng', item.intervalDays > 1, String(item.intervalDays));

console.log('\n[4] Thành thạo khi chuỗi đúng và khoảng cách đủ dài');
setTimes('r1', { intervalDays: 10, nextReview: Date.now() - DAY });
BK.practice({ question: 'Câu r1 cần ôn', questionId: 'r1', subject: 'ly', topic: 'Sóng', correct: true, silent: true });
item = H.store().review.find((x) => x.questionId === 'r1');
ok('streak >= 2 và khoảng cách >= 21', item.streak >= 2 && item.intervalDays >= 21,
  item.streak + '/' + item.intervalDays);
ok('đánh dấu thành thạo', item.status === 'mastered', item.status);
ok('câu thành thạo không còn trong hàng đợi đến hạn', BK.revision.queue('due').length === 0);

console.log('\n[5] Trả lời sai lại đưa về ôn sớm');
BK.store.update((s) => {
  const r = s.review.find((x) => x.questionId === 'r1');
  r.nextReview = Date.now() - DAY;
  return s;
});
BK.practice({ question: 'Câu r1 cần ôn', questionId: 'r1', subject: 'ly', topic: 'Sóng', correct: false, silent: true });
item = H.store().review.find((x) => x.questionId === 'r1');
ok('mất trạng thái thành thạo', item.status !== 'mastered' && item.mastered === false, item.status);
ok('khoảng cách về mức ngắn nhất', item.intervalDays === 1, String(item.intervalDays));
ok('streak reset', item.streak === 0, String(item.streak));

console.log('\n[6] Phiên ôn không sửa kết quả gốc');
const m2 = seed('r2');
setTimes('r2', { nextReview: Date.now() - DAY });
const practiceBefore = H.store().practice.length;
const session = BK.revision.start('due');
ok('tạo được phiên ôn', !!session && session.items.length >= 1, JSON.stringify(session && session.items));
ok('phiên lưu vào s.revisionSessions', H.store().revisionSessions.length === 1);
const target = session.items[0].key;
const keyOfR1 = H.store().review.find((x) => x.questionId === 'r1').key;
const keyOfR2 = H.store().review.find((x) => x.questionId === 'r2').key;
const activeKey = target === keyOfR1 ? keyOfR1 : keyOfR2;
BK.revision.answer(session.id, activeKey, true);
let sess = H.store().revisionSessions[0];
ok('ghi nhận câu đúng trong phiên', sess.items.find((i) => i.key === activeKey).correct === true);
ok('lịch sử luyện tập không đổi trong phiên', H.store().practice.length === practiceBefore,
  practiceBefore + '→' + H.store().practice.length);
const answered = H.store().review.find((x) => x.key === activeKey);
ok('lịch ôn của câu được cập nhật', answered.streak >= 1, String(answered.streak));
ok('lịch sử câu có sessionId', answered.history.some((h) => h.sessionId === session.id));

const ended = BK.revision.end(session.id);
ok('kết thúc phiên trả về tổng kết', ended && ended.total === sess.items.length, JSON.stringify(ended && ended.total));
ok('phiên có mốc kết thúc', !!H.store().revisionSessions[0].endedAt);
ok('phiên ghi vào nhật ký hoạt động',
  H.store().history.some((h) => h.kind === 'review' && /Phiên ôn tập/.test(h.title)));

console.log('\n[7] Lưu trữ không vào hàng đợi');
BK.mistakes.update(H.store().review.find((x) => x.questionId === 'r2').id, { status: 'archived' });
BK.store.update((s) => {
  const r = s.review.find((x) => x.questionId === 'r2');
  r.nextReview = Date.now() - DAY;
  return s;
});
ok('câu lưu trữ bị loại khỏi hàng đợi',
  BK.revision.queue('due').every((r) => r.questionId !== 'r2'));

console.log('\n[8] Giới hạn phiên và không có lỗi runtime');
ok('kích thước hàng đợi bị giới hạn 40', (() => {
  for (let i = 0; i < 50; i++) seed('bulk' + i);
  BK.store.update((s) => { s.review.forEach((r) => { r.nextReview = Date.now() - DAY; }); return s; });
  const s2 = BK.revision.start('due');
  return !s2 || s2.items.length <= 40;
})(), 'quá 40');
ok('không có jsdomError', H.errors.length === 0, H.errors.join(' | '));

done('revision-engine-smoke');

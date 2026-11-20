'use strict';
/**
 * Bá Khí 8.2.0 — Learning data integrity.
 * Kiểm tra migration store v1 → v2, chuẩn hoá dữ liệu hỏng, giới hạn kích thước
 * và xuất/nhập dữ liệu không nhân bản.
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/learning-data-integrity.js
 */
const { make, ok, done } = require('./learning-harness');

const NOW = Date.now();

/* Dữ liệu đúng định dạng 8.1.x: review KHÔNG có status/errorType/plans. */
const legacy = {
  v: 1,
  createdAt: NOW - 30 * 86400000,
  updatedAt: NOW - 86400000,
  practice: [
    { id: 'pr1', ts: NOW - 5000, subject: 'ly', questionId: 'q1', question: 'Câu cũ 1', topic: 'Sóng', correct: false, source: '/a' },
    { id: 'pr2', ts: NOW - 4000, subject: 'ly', questionId: 'q1', question: 'Câu cũ 1', topic: 'Sóng', correct: true, source: '/a' }
  ],
  review: [
    {
      id: 'rv1', key: 'qabc', subject: 'ly', question: 'Câu cũ 1', options: ['A', 'B'],
      answer: 0, explanation: 'Vì ...', topic: 'Sóng', wrong: 2, right: 1, mastered: false,
      createdAt: NOW - 4000, lastSeen: NOW - 4000, nextReview: NOW + 86400000,
      history: [{ ts: NOW - 4000, correct: true }, { ts: NOW - 5000, correct: false }]
    }
  ],
  notes: [{ id: 'nt1', title: 'Ghi chú cũ', body: 'nội dung', subject: 'ly', category: 'Chung', pinned: false, createdAt: NOW, updatedAt: NOW }],
  bookmarks: [],
  history: [{ id: 'hs1', ts: NOW - 9000, kind: 'lesson', title: 'Bài cũ', url: '/b', subject: 'ly', meta: '' }],
  achievements: { unlocked: { 'first-lesson': NOW - 9000 }, counters: { practiced: 2, correct: 1 } },
  prefs: { focus: false, fontSize: 100, ambient: false, spaced: { again: 1, hard: 3, good: 7, easy: 14, max: 90 }, ai: { endpoint: '', model: '' }, cloud: { url: '', anonKey: '' } }
};

console.log('\n[1] Migration v1 → v2');
const H = make({ seed: legacy });
const BK = H.w.BK;
BK.store.save(); /* bất kỳ thao tác ghi nào cũng phải chạy migration */
let st = H.store();
ok('phiên bản lưu là 2', st.v === 2, String(st.v));
ok('không mất lượt luyện tập', st.practice.length === 2, String(st.practice.length));
ok('không mất câu sai', st.review.length === 1, String(st.review.length));
ok('không mất ghi chú/đánh dấu/lịch sử',
  st.notes.length === 1 && st.history.length === 1 && st.bookmarks.length === 0);
ok('giữ nguyên thành tích đã mở', !!st.achievements.unlocked['first-lesson']);
ok('thêm trường status cho câu sai cũ', st.review[0].status === 'reviewing', st.review[0].status);
ok('thêm loại lỗi mặc định', st.review[0].errorType === 'unclassified', st.review[0].errorType);
ok('giữ đáp án và lời giải cũ', st.review[0].answer === 0 && /Vì/.test(st.review[0].explanation));
ok('giữ lịch sử cũ', st.review[0].history.length === 2, String(st.review[0].history.length));
ok('khởi tạo mảng kế hoạch', Array.isArray(st.plans) && st.plans.length === 0);
ok('khởi tạo mảng mục tiêu', Array.isArray(st.goals) && st.goals.length === 0);
ok('khởi tạo phiên ôn', Array.isArray(st.revisionSessions));
ok('ghi lại nguồn migration', st.meta && st.meta.migratedFrom === 1, JSON.stringify(st.meta));

console.log('\n[2] Sanitize chạy lại vẫn ổn định (không nhân bản)');
const first = JSON.stringify(H.store().review);
H.reload();
ok('nạp lại không nhân bản câu sai', H.store().review.length === 1, String(H.store().review.length));
ok('nạp lại giữ nguyên dữ liệu', JSON.stringify(H.store().review) === first);

console.log('\n[3] Dữ liệu hỏng được chuẩn hoá');
const BK2 = H.w.BK;
BK2.store.update((s) => {
  s.review.push({ id: 'bad1', question: 'x', status: 'khong_hop_le', errorType: 'xyz', wrong: 'abc', nextReview: 'nope' });
  s.plans.push({ id: 'badp', title: 'T', date: '2026-13-99', status: 'x', durationMin: 9999 });
  s.goals.push({ id: 'badg', title: 'G', metric: 'x', target: -5 });
  return s;
});
st = H.store();
const bad = st.review.find((r) => r.id === 'bad1');
ok('trạng thái lạ bị thay bằng giá trị hợp lệ', ['new', 'reviewing', 'needs_attention', 'mastered', 'archived'].indexOf(bad.status) >= 0, bad.status);
ok('loại lỗi lạ về unclassified', bad.errorType === 'unclassified', bad.errorType);
ok('số lần sai không phải số → 0 hoặc giá trị số', typeof bad.wrong === 'number', String(bad.wrong));
ok('ngày sai định dạng → hôm nay', /^\d{4}-\d{2}-\d{2}$/.test(st.plans[0].date), st.plans[0].date);
ok('thời lượng bị kẹp trong khoảng', st.plans[0].durationMin <= 240, String(st.plans[0].durationMin));
ok('metric lạ về mặc định', st.goals[0].metric === 'questions', st.goals[0].metric);
ok('target âm bị kẹp', st.goals[0].target >= 1, String(st.goals[0].target));

console.log('\n[4] Giới hạn kích thước mảng');
BK2.store.update((s) => {
  for (let i = 0; i < 1200; i++) {
    s.review.push({ id: 'cap' + i, key: 'k' + i, question: 'q' + i, wrong: 1 });
  }
  return s;
});
st = H.store();
ok('sổ tay bị giới hạn 1000', st.review.length <= 1000, String(st.review.length));
ok('giữ bản ghi mới nhất', st.review[st.review.length - 1].id === 'cap1199');

console.log('\n[5] Xuất / nhập dữ liệu');
const H2 = make();
const A = H2.w.BK;
A.practice({ question: 'Câu A', questionId: 'qa', subject: 'toan', correct: false, silent: true });
A.planner.add({ title: 'Việc A', subject: 'toan', date: A.util.dayKey(), durationMin: 20 });
A.goals.add({ title: 'Mục tiêu A', metric: 'questions', target: 5 });
const session = A.revision.start('due');
if (session) A.revision.end(session.id);
const payload = A.io.exportPayload('all');
ok('bản xuất có kế hoạch', Array.isArray(payload.data.plans) && payload.data.plans.length === 1);
ok('bản xuất có mục tiêu', Array.isArray(payload.data.goals) && payload.data.goals.length === 1);
ok('bản xuất có phiên ôn', Array.isArray(payload.data.revisionSessions));
ok('bản xuất hợp lệ', A.io.validateImport(payload).ok === true,
  JSON.stringify(A.io.validateImport(payload).issues));

const H3 = make();
const B = H3.w.BK;
B.io.importPayload(payload);
ok('nhập kế hoạch', H3.store().plans.length === 1);
ok('nhập mục tiêu', H3.store().goals.length === 1);
ok('nhập câu sai', H3.store().review.length === 1);
B.io.importPayload(payload);
ok('nhập lại không nhân bản kế hoạch', H3.store().plans.length === 1, String(H3.store().plans.length));
ok('nhập lại không nhân bản mục tiêu', H3.store().goals.length === 1);
ok('nhập lại không nhân bản câu sai', H3.store().review.length === 1);

console.log('\n[6] Từ chối tệp lạ');
const bad2 = B.io.validateImport({ app: 'other', kind: 'x', version: 99, data: {} });
ok('từ chối tệp không phải Bá Khí', bad2.ok === false && bad2.issues.length >= 2,
  JSON.stringify(bad2.issues));
const res = B.io.importPayload({ app: 'other', kind: 'x', version: 99, data: {} });
ok('nhập tệp lạ thất bại', res.ok === false);

console.log('\n[7] Không có lỗi runtime');
ok('không có jsdomError', H.errors.length === 0, H.errors.join(' | '));

done('learning-data-integrity');

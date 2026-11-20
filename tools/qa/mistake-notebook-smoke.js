'use strict';
/**
 * Bá Khí 8.2.0 — Mistake Notebook smoke test.
 * Kiểm tra ghi nhận câu sai tự động, chống trùng, trạng thái, phân loại lỗi,
 * ghi chú, lưu trữ và bộ lọc.
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/mistake-notebook-smoke.js
 */
const { make, ok, done } = require('./learning-harness');

const H = make();
const w = H.w;
const BK = w.BK;

function wrong(id, extra) {
  return {
    question: 'Câu hỏi ' + id + ' về dao động điều hoà',
    questionId: id,
    subject: 'ly',
    topic: 'Dao động cơ',
    difficulty: 'vừa',
    correct: false,
    chosen: 2,
    options: ['A', 'B', 'C', 'D'],
    answer: 1,
    explanation: 'Biên độ không đổi khi không có ma sát.',
    source: '/ktgk1/ly/ly1.html',
    silent: true
  };
}

console.log('\n[1] Ghi nhận câu sai');
BK.practice(wrong('q1'));
let st = H.store();
ok('câu sai vào sổ tay', st.review.length === 1, String(st.review.length));
const m1 = st.review[0];
ok('lưu đáp án đã chọn', m1.chosen === 2, String(m1.chosen));
ok('lưu đáp án đúng', m1.answer === 1, String(m1.answer));
ok('lưu lời giải', /Biên độ/.test(m1.explanation || ''));
ok('lưu môn + chương', m1.subject === 'ly' && m1.topic === 'Dao động cơ');
ok('trạng thái mặc định sau khi sai = reviewing', m1.status === 'reviewing', m1.status);
ok('loại lỗi mặc định chưa phân loại', m1.errorType === 'unclassified', m1.errorType);
ok('lịch sử sai ghi nhận', m1.history.length === 1 && m1.history[0].correct === false);
ok('streak = 0', m1.streak === 0, String(m1.streak));

console.log('\n[2] Chống ghi trùng');
BK.practice(wrong('q1'));
st = H.store();
ok('không tạo bản ghi trùng', st.review.length === 1, String(st.review.length));
ok('tăng số lần sai', st.review[0].wrong === 2, String(st.review[0].wrong));

console.log('\n[3] Tải lại trang không nhân bản');
H.reload();
const BK2 = w.BK;
ok('sổ tay còn sau reload', BK2.mistakes.list({ status: 'all' }).length === 1);
BK2.practice(wrong('q1'));
ok('sai lại sau reload vẫn không trùng', H.store().review.length === 1, String(H.store().review.length));

console.log('\n[4] Trả lời đúng');
const key = H.store().review[0].key;
BK2.practice(Object.assign(wrong('q1'), { correct: true, chosen: 1 }));
st = H.store();
ok('đúng lần 1 chưa thành thạo', st.review[0].status !== 'mastered', st.review[0].status);
ok('tăng số lần đúng', st.review[0].right === 1, String(st.review[0].right));
ok('streak = 1', st.review[0].streak === 1, String(st.review[0].streak));
ok('lịch sử có cả đúng và sai', st.review[0].history.some((h) => h.correct) && st.review[0].history.some((h) => !h.correct));

console.log('\n[5] Đủ chuỗi mới thành thạo');
for (let i = 0; i < 4; i++) {
  /* Đẩy khoảng cách lên như khi ôn đúng nhiều lần để kiểm tra ngưỡng 21 ngày. */
  BK2.store.update((s) => {
    const it = s.review.find((r) => r.key === key);
    if (it) { it.intervalDays = Math.max(it.intervalDays, 9); it.status = 'reviewing'; it.mastered = false; }
    return s;
  });
  BK2.practice(Object.assign(wrong('q1'), { correct: true, chosen: 1 }));
}
st = H.store();
const master = st.review[0];
ok('thành thạo sau chuỗi đúng + khoảng cách đủ dài',
  master.status === 'mastered' && master.mastered === true, master.status + '/' + master.intervalDays);
ok('khoảng cách ôn không vượt trần', master.intervalDays <= 90, String(master.intervalDays));

console.log('\n[6] Phân loại lỗi & ghi chú');
const id = master.id;
BK2.mistakes.update(id, { errorType: 'calculation', note: 'Nhầm công thức chu kỳ.', status: 'needs_attention' });
st = H.store();
ok('lưu loại lỗi', st.review[0].errorType === 'calculation', st.review[0].errorType);
ok('lưu ghi chú', /chu kỳ/.test(st.review[0].note));
ok('đổi trạng thái cần chú ý', st.review[0].status === 'needs_attention', st.review[0].status);
BK2.mistakes.update(id, { errorType: 'khong_ton_tai' });
ok('loại lỗi lạ bị từ chối', H.store().review[0].errorType === 'unclassified', H.store().review[0].errorType);

console.log('\n[7] Lưu trữ và khôi phục');
BK2.mistakes.update(id, { status: 'archived' });
ok('lưu trữ ẩn khỏi danh sách đang theo dõi', BK2.mistakes.list({ status: 'active' }).length === 0);
ok('lưu trữ vẫn còn trong dữ liệu', H.store().review.length === 1);
BK2.mistakes.update(id, { status: 'reviewing' });
ok('bỏ lưu trữ quay lại danh sách', BK2.mistakes.list({ status: 'active' }).length === 1);

console.log('\n[8] Thống kê & bộ lọc');
BK2.practice(Object.assign(wrong('q2'), { topic: 'Sóng cơ', subject: 'ly' }));
BK2.practice(Object.assign(wrong('q3'), { topic: 'Điện xoay chiều', subject: 'ly' }));
BK2.mistakes.update(H.store().review[H.store().review.length - 1].id, { errorType: 'careless' });
const stats = BK2.mistakes.stats();
ok('tổng số câu sai', stats.total === 3, String(stats.total));
ok('đếm theo loại lỗi', stats.byErrorType.careless === 1 && stats.byErrorType.unclassified === 2,
  JSON.stringify(stats.byErrorType));
ok('lọc theo chương', BK2.mistakes.list({ topic: 'Sóng cơ' }).length === 1);
ok('lọc theo loại lỗi', BK2.mistakes.list({ errorType: 'careless' }).length === 1);
ok('tìm kiếm theo nội dung', BK2.mistakes.list({ query: 'Điện xoay chiều' }).length === 1);
ok('sắp xếp ưu tiên đưa câu sai nhiều lên đầu',
  BK2.mistakes.list({ sort: 'priority' })[0].wrong >= 1);

console.log('\n[9] Xoá khỏi sổ tay không xoá lịch sử luyện tập');
const before = H.store().practice.length;
BK2.mistakes.remove(H.store().review[0].id);
ok('xoá đúng một câu', H.store().review.length === 2, String(H.store().review.length));
ok('lịch sử luyện tập giữ nguyên', H.store().practice.length === before,
  before + '→' + H.store().practice.length);

console.log('\n[10] Không có lỗi runtime');
ok('không có jsdomError', H.errors.length === 0, H.errors.join(' | '));

done('mistake-notebook-smoke');

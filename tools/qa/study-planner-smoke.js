'use strict';
/**
 * Bá Khí 8.2.0 — Smart Study Planner + Learning Goals smoke test.
 * Kiểm tra tạo/sửa/hoàn thành/hoãn nhiệm vụ, nhóm lịch, gợi ý không tự ghi,
 * và tiến độ mục tiêu tính từ hoạt động thật.
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/study-planner-smoke.js
 */
const { make, ok, done } = require('./learning-harness');

const H = make();
const w = H.w;
const BK = w.BK;

/* Khoá ngày theo giờ Hà Nội — cùng nguồn với ứng dụng. */
function dayKey(shift) { return BK.util.dayKeyOf(shift); }

console.log('\n[1] Tạo nhiệm vụ');
const p1 = BK.planner.add({ title: 'Ôn chương 1 Vật lý', subject: 'ly', date: dayKey(0), durationMin: 30 });
ok('nhiệm vụ được lưu', H.store().plans.length === 1);
ok('trạng thái ban đầu = planned', p1.status === 'planned', p1.status);
ok('ngày mặc định hôm nay', p1.date === dayKey(0), p1.date);
ok('thời lượng nằm trong giới hạn', p1.durationMin >= 5 && p1.durationMin <= 240, String(p1.durationMin));
const p2 = BK.planner.add({ title: 'Luyện tích phân', subject: 'toan', date: dayKey(-2), durationMin: 20 });
const p3 = BK.planner.add({ title: 'Đọc trước bài mới', subject: 'hoa', date: dayKey(3), durationMin: 15 });
ok('tạo đủ 3 nhiệm vụ', H.store().plans.length === 3);

console.log('\n[2] Nhóm lịch');
let groups = BK.planner.list({ groups: true });
ok('nhóm hôm nay', groups.today.length === 1, String(groups.today.length));
ok('nhóm quá hạn', groups.overdue.length === 1, String(groups.overdue.length));
ok('nhóm sắp tới', groups.upcoming.length === 1, String(groups.upcoming.length));
ok('nhóm đã xong rỗng', groups.done.length === 0);

console.log('\n[3] Hoàn thành / hoãn / sửa');
BK.planner.update(p1.id, { status: 'done' });
groups = BK.planner.list({ groups: true });
ok('hoàn thành chuyển nhóm', groups.done.length === 1 && groups.today.length === 0);
ok('ghi mốc hoàn thành', !!H.store().plans.find((p) => p.id === p1.id).completedAt);
BK.planner.update(p2.id, { date: dayKey(1), status: 'planned' });
groups = BK.planner.list({ groups: true });
ok('hoãn sang ngày mai', groups.overdue.length === 0 && groups.upcoming.length === 2,
  groups.overdue.length + '/' + groups.upcoming.length);
BK.planner.update(p3.id, { title: 'Đọc trước bài Hoá', durationMin: 25 });
const edited = H.store().plans.find((p) => p.id === p3.id);
ok('sửa tiêu đề', edited.title === 'Đọc trước bài Hóa' || edited.title === 'Đọc trước bài Hoá', edited.title);
ok('sửa thời lượng', edited.durationMin === 25, String(edited.durationMin));
ok('trạng thái tạm hoãn hợp lệ', (BK.planner.update(p3.id, { status: 'postponed' }), true));

console.log('\n[4] Không nhận trạng thái lạ');
BK.planner.update(p3.id, { status: 'dang_lam' });
ok('trạng thái lạ bị từ chối', H.store().plans.find((p) => p.id === p3.id).status === 'postponed',
  H.store().plans.find((p) => p.id === p3.id).status);

console.log('\n[5] Xoá nhiệm vụ');
BK.planner.remove(p3.id);
ok('xoá đúng nhiệm vụ', H.store().plans.length === 2, String(H.store().plans.length));

console.log('\n[6] Gợi ý không tự ghi vào lịch');
BK.practice({
  question: 'Câu sai để sinh gợi ý ôn tập', questionId: 'g1', subject: 'ly',
  topic: 'Dao động', correct: false, silent: true
});
BK.store.update((s) => {
  s.review.forEach((r) => { r.nextReview = Date.now() - 86400000; r.status = 'reviewing'; });
  return s;
});
const plansBefore = H.store().plans.length;
const sugg = BK.planner.suggestions(4);
ok('có gợi ý ôn câu đến hạn', sugg.some((s) => s.kind === 'revision'), JSON.stringify(sugg.map((s) => s.kind)));
ok('gợi ý chỉ là đề xuất, không tự tạo nhiệm vụ', H.store().plans.length === plansBefore,
  plansBefore + '→' + H.store().plans.length);
const accepted = BK.planner.add(Object.assign({
  title: sugg[0].title, subject: sugg[0].subject, date: sugg[0].date,
  durationMin: sugg[0].durationMin, source: 'suggestion'
}));
ok('nhận gợi ý tạo nhiệm vụ có nguồn suggestion', accepted.source === 'suggestion');
BK.store.update((s) => { s.prefs.planner.suggestions = false; return s.prefs; });
ok('tắt gợi ý thì không còn đề xuất', BK.planner.suggestions().length === 0);
BK.store.update((s) => { s.prefs.planner.suggestions = true; return s.prefs; });

console.log('\n[7] Mục tiêu học tập');
const goal = BK.goals.add({ title: 'Luyện 10 câu Toán', subject: 'toan', metric: 'questions', target: 10 });
ok('tạo mục tiêu', H.store().goals.length === 1);
let items = BK.goals.items();
ok('tiến độ ban đầu = 0', items[0].current === 0 && items[0].pct === 0, JSON.stringify(items[0]));
for (let i = 0; i < 4; i++) {
  BK.practice({ question: 'Câu toán ' + i, questionId: 't' + i, subject: 'toan', correct: true, silent: true });
}
items = BK.goals.items();
ok('tiến độ tăng theo hoạt động thật', items[0].current === 4, String(items[0].current));
ok('phần trăm tiến độ', items[0].pct === 40, String(items[0].pct));
const otherSubject = BK.goals.add({ title: 'Mở 2 bài Hoá', subject: 'hoa', metric: 'lessons', target: 2 });
BK.addHistory({ kind: 'lesson', title: 'Hoá 1', url: '/kttx/hoa/a.html', subject: 'hoa' });
BK.addHistory({ kind: 'lesson', title: 'Hoá 2', url: '/kttx/hoa/b.html', subject: 'hoa' });
const hoa = BK.goals.items().find((x) => x.goal.id === otherSubject.id);
ok('đếm bài học khác nhau', hoa.current === 2, String(hoa.current));
ok('mục tiêu đạt được', hoa.reached === true);
BK.goals.update(goal.id, { status: 'done' });
ok('đánh dấu đạt', H.store().goals.find((g) => g.id === goal.id).status === 'done');
BK.goals.remove(goal.id);
ok('xoá mục tiêu', H.store().goals.length === 1, String(H.store().goals.length));

console.log('\n[8] Dữ liệu vào đúng khoá, không nhân bản');
const st = H.store();
ok('kế hoạch nằm trong s.plans', Array.isArray(st.plans));
ok('mục tiêu nằm trong s.goals', Array.isArray(st.goals));
ok('không có mảng kế hoạch thứ hai', st.studyPlans === undefined && st.tasks === undefined);
ok('không có lỗi runtime', H.errors.length === 0, H.errors.join(' | '));

done('study-planner-smoke');

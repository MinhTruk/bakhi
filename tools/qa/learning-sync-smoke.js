'use strict';
/**
 * Bá Khí 8.2.0 — Learning sync smoke test.
 * Kiểm tra hợp nhất dữ liệu nhiều thiết bị: giữ bản mới hơn, không nhân bản,
 * không mất mảng mới (plans/goals/revisionSessions) khi máy chủ chưa có.
 *
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/learning-sync-smoke.js
 */
const { make, ok, done } = require('./learning-harness');

const H = make();
const w = H.w;
const BK = w.BK;

/* Thiết bị A: có dữ liệu học tập. */
console.log('\n[1] Thiết bị A tạo dữ liệu');
BK.practice({
  question: 'Câu đồng bộ', questionId: 'sync1', subject: 'ly',
  topic: 'Sóng', correct: false, silent: true
});
BK.planner.add({ title: 'Việc của A', subject: 'ly', date: BK.util.dayKey(), durationMin: 25 });
BK.goals.add({ title: 'Mục tiêu A', metric: 'questions', target: 10 });
BK.store.update((s) => {
  s.review.forEach((r) => { r.nextReview = Date.now() - 86400000; });
  return s;
});
const s1 = BK.revision.start('due');
if (s1) BK.revision.end(s1.id);
const snapshotA = JSON.parse(JSON.stringify(BK.store.get()));
ok('A có 1 câu sai', snapshotA.review.length === 1);
ok('A có 1 kế hoạch', snapshotA.plans.length === 1);
ok('A có 1 mục tiêu', snapshotA.goals.length === 1);
ok('A có 1 phiên ôn', snapshotA.revisionSessions.length === 1);

/* Thiết bị B: trống. */
console.log('\n[2] Thiết bị B kéo dữ liệu của A');
const HB = make();
const BB = HB.w.BK;
BB.cloud.merge({
  practice: snapshotA.practice, review: snapshotA.review,
  plans: snapshotA.plans, goals: snapshotA.goals,
  revisionSessions: snapshotA.revisionSessions,
  notes: [], bookmarks: [], history: []
});
const stB = HB.store();
ok('B nhận câu sai', stB.review.length === 1, String(stB.review.length));
ok('B nhận kế hoạch', stB.plans.length === 1, String(stB.plans.length));
ok('B nhận mục tiêu', stB.goals.length === 1, String(stB.goals.length));
ok('B nhận phiên ôn', stB.revisionSessions.length === 1, String(stB.revisionSessions.length));

console.log('\n[3] Hợp nhất lặp lại không nhân bản');
BB.cloud.merge({
  practice: snapshotA.practice, review: snapshotA.review,
  plans: snapshotA.plans, goals: snapshotA.goals,
  revisionSessions: snapshotA.revisionSessions
});
ok('không nhân bản kế hoạch', HB.store().plans.length === 1, String(HB.store().plans.length));
ok('không nhân bản mục tiêu', HB.store().goals.length === 1);
ok('không nhân bản câu sai', HB.store().review.length === 1);

console.log('\n[4] Bản mới hơn thắng');
const planId = HB.store().plans[0].id;
BB.planner.update(planId, { title: 'Việc sửa trên B' });
const fromB = JSON.parse(JSON.stringify(HB.store().plans[0]));
/* Máy chủ trả về bản cũ hơn của A → phải giữ bản B. */
BB.cloud.merge({ plans: snapshotA.plans });
ok('giữ bản cập nhật mới hơn', HB.store().plans[0].title === 'Việc sửa trên B',
  HB.store().plans[0].title);
/* Máy chủ trả về bản mới hơn → phải nhận. */
const newer = Object.assign({}, fromB, { title: 'Việc sửa trên máy chủ', updatedAt: fromB.updatedAt + 60000 });
BB.cloud.merge({ plans: [newer] });
ok('nhận bản máy chủ mới hơn', HB.store().plans[0].title === 'Việc sửa trên máy chủ',
  HB.store().plans[0].title);
ok('không tạo bản ghi phụ khi hợp nhất', HB.store().plans.length === 1);

console.log('\n[5] Máy chủ chưa có khoá mới không làm mất dữ liệu local');
BB.cloud.merge({ practice: [], review: [], notes: [], bookmarks: [], history: [] });
ok('plans còn nguyên', HB.store().plans.length === 1, String(HB.store().plans.length));
ok('goals còn nguyên', HB.store().goals.length === 1);
ok('revisionSessions còn nguyên', HB.store().revisionSessions.length === 1);

console.log('\n[6] Không ghi đè cấu hình cloud bằng dữ liệu máy chủ');
BB.cloud.configure({ url: 'https://example.supabase.co', anonKey: 'anon-key' });
BB.cloud.merge({ prefs: { cloud: { url: 'https://ke-xau.example', anonKey: 'bi-mat' } } });
const cfg = HB.store().prefs.cloud;
ok('URL cấu hình không bị ghi đè', cfg.url === 'https://example.supabase.co', cfg.url);
ok('khoá cấu hình không bị ghi đè', cfg.anonKey === 'anon-key');

console.log('\n[7] Đồng bộ không tạo bản ghi trùng khi hai lần ghi cùng lúc');
const before = HB.store().practice.length;
const payload = { practice: snapshotA.practice, plans: snapshotA.plans };
BB.cloud.merge(payload);
BB.cloud.merge(payload);
ok('practice không nhân bản', HB.store().practice.length === before + 0 || HB.store().practice.length === before,
  String(HB.store().practice.length));
ok('plans không nhân bản', HB.store().plans.length === 1, String(HB.store().plans.length));

console.log('\n[8] Không có lỗi runtime');
ok('không có jsdomError', H.errors.length === 0 && HB.errors.length === 0,
  H.errors.concat(HB.errors).join(' | '));

done('learning-sync-smoke');

'use strict';
/**
 * Bá Khí — QA Report Issue + Q&A (v8.0.0, jsdom).
 *
 *   npm install jsdom --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/report-smoke.js
 *
 * Kiểm tra:
 *   1. Component dùng chung tạo nút nổi và cửa sổ kéo được.
 *   2. Form có đủ trường bắt buộc; validation chặn gửi rỗng.
 *   3. Payload gửi máy chủ KHÔNG chứa student_id (máy chủ tự xác định).
 *   4. Gửi thành công → mở chi tiết báo cáo vừa tạo.
 *   5. Danh sách báo cáo hiển thị mã, trạng thái, phản hồi mới.
 *   6. Q&A hiển thị tin nhắn của học sinh và ban quản trị, gửi trả lời được.
 *   7. Esc đóng cửa sổ; nhúng trong Cài đặt hoạt động.
 *   8. Hợp đồng máy chủ: report-api + admin-actions có đủ action quyền hạn.
 *   9. Bảo mật: RLS, bucket riêng tư, không có service-role key ở frontend.
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function settle(n) { for (let i = 0; i < (n || 6); i++) await wait(6); }

const REPORT_JS = read('assets/bakhi/bk-report.js');
const REPORT_API = read('supabase/functions/report-api/index.ts');
const ADMIN_ACTIONS = read('supabase/functions/admin-actions/index.ts');
const MIGRATION = read('supabase/migrations/20261206000000_bakhi_v800_reports.sql');
const CLOUD = read('assets/bakhi/bk-cloud.js');

const student = { id: '11111111-1111-4111-8111-111111111111', display_name: 'Nguyễn An' };
const created = {
  id: '22222222-2222-4222-8222-222222222222', code: 'BK-01001',
  title: 'Đáp án câu 5 sai', description: 'Câu 5 phần ôn tập có đáp án sai ạ.',
  category: 'answer', issue_type: 'content_error', priority: 'normal', status: 'new',
  page_url: 'https://x/kttx/gk1/van/bai_1.html', page_title: 'Bài 1',
  route: '/kttx/gk1/van/bai_1.html', subject: 'Kiểm tra thường xuyên',
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  student_unread: 1, staff_unread: 1, attachment_count: 0
};
const staffMessage = {
  id: '33333333-3333-4333-8333-333333333333', report_id: created.id,
  sender_kind: 'staff', sender_label: 'Administrator',
  body: 'Mình đã kiểm tra và sửa lại đáp án.', is_private: false,
  created_at: new Date().toISOString(), attachment_urls: []
};

function boot() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
  const dom = new JSDOM('<!DOCTYPE html><html lang="vi"><body><main>Nội dung</main></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/kttx/gk1/van/bai_1.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  const calls = [];
  const toasts = [];
  w.BAKHI_VERSION = { app: '8.0.0' };
  w.BK = {
    ui: { toast: (m, t) => toasts.push({ m, t }) },
    util: { fmtTime: (iso) => 'T ' + String(iso || '').slice(11, 16) }
  };
  w.BKShell = { basePath: () => '/bakhi/' };
  w.BKCloud = {
    configured: () => true,
    reportApi: function (body) {
      calls.push(body);
      const act = body.action;
      if (act === 'bootstrap') {
        return Promise.resolve({ ok: true, student, counts: { total: 1, open: 1, unread: 1, resolved: 0, waiting_student: 0 } });
      }
      if (act === 'create') {
        return Promise.resolve({ ok: true, report: created, duplicate: null });
      }
      if (act === 'list') {
        return Promise.resolve({ ok: true, total: 1, reports: [Object.assign({}, created, { student_unread: 1 })] });
      }
      if (act === 'detail') {
        return Promise.resolve({
          ok: true, report: Object.assign({}, created, { student_unread: 0 }),
          attachments: [], messages: [staffMessage]
        });
      }
      if (act === 'message.send') {
        return Promise.resolve({
          ok: true, status: 'in_progress',
          message: { id: '44444444-4444-4444-8444-444444444444', sender_kind: 'student', sender_label: 'Nguyễn An', body: body.body, created_at: new Date().toISOString(), attachment_urls: [] }
        });
      }
      return Promise.resolve({ ok: true });
    },
    reportUpload: () => Promise.resolve(student.id + '/tep.png')
  };
  w.eval(REPORT_JS);
  return { dom, w, calls, toasts, errors };
}

(async () => {
  console.log('\n== 1. Nút nổi & cửa sổ ==');
  const A = boot();
  await settle();
  const fab = A.w.document.getElementById('bkReportFab');
  ok('có nút nổi Report Issue', !!fab);
  ok('có nhãn truy cập cho nút nổi', !!fab && fab.getAttribute('aria-label') === 'Báo cáo vấn đề');
  ok('đã gọi bootstrap để lấy số chưa đọc', A.calls.some((c) => c.action === 'bootstrap'));
  fab.click();
  await settle();
  const win = A.w.document.getElementById('bkReportWin');
  ok('mở cửa sổ báo cáo', !!win && !win.hidden);
  ok('cửa sổ có hai tab Gửi báo cáo / Báo cáo của tôi', win.querySelectorAll('.bkrep-tab').length === 2);
  ok('có ô tiêu đề, mô tả và 3 ô chọn', !!win.querySelector('input[type="text"]') &&
    !!win.querySelector('textarea') && win.querySelectorAll('select').length === 3);
  ok('có nút chọn tệp đính kèm', !!win.querySelector('input[type="file"]'));
  ok('hiển thị ngữ cảnh tự thu thập', /Thông tin ngữ cảnh/.test(win.textContent));

  console.log('\n== 2. Validation ==');
  const before = A.calls.filter((c) => c.action === 'create').length;
  const form = win.querySelector('form.bkrep-form');
  form.dispatchEvent(new A.w.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  ok('chặn gửi khi tiêu đề rỗng', A.calls.filter((c) => c.action === 'create').length === before);
  ok('hiện lỗi validation', !/^\s*$/.test(win.querySelector('.bkrep-form-msg').textContent));

  console.log('\n== 3. Gửi báo cáo ==');
  win.querySelector('input[type="text"]').value = 'Đáp án câu 5 sai';
  win.querySelector('textarea').value = 'Câu 5 phần ôn tập có đáp án sai ạ.';
  form.dispatchEvent(new A.w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(10);
  const createCall = A.calls.filter((c) => c.action === 'create').pop();
  ok('gửi create lên máy chủ', !!createCall);
  ok('payload KHÔNG chứa student_id', !!createCall && !('student_id' in createCall));
  ok('payload có tiêu đề, mô tả, ngữ cảnh, trang', !!createCall &&
    createCall.title === 'Đáp án câu 5 sai' && !!createCall.context && !!createCall.page_url);
  ok('chuyển sang chi tiết báo cáo vừa tạo', /BK-01001/.test(win.textContent));
  ok('hiển thị kết quả xử lý/không có lỗi', A.errors.length === 0, A.errors.join(' | '));

  console.log('\n== 4. Danh sách ==');
  const listTab = Array.prototype.filter.call(win.querySelectorAll('.bkrep-tab'), (b) => b.getAttribute('data-tab') === 'list')[0];
  listTab.click();
  await settle(10);
  ok('gọi list', A.calls.some((c) => c.action === 'list'));
  ok('hiện mã báo cáo và trạng thái', /BK-01001/.test(win.textContent) && /Mới/.test(win.textContent));
  ok('hiện nhãn phản hồi mới', /Phản hồi mới/.test(win.textContent));

  console.log('\n== 5. Q&A ==');
  win.querySelector('.bkrep-item').click();
  await settle(10);
  ok('mở chi tiết từ danh sách', A.calls.some((c) => c.action === 'detail'));
  ok('hiện tin nhắn của ban quản trị', /Mình đã kiểm tra/.test(win.textContent));
  const reply = win.querySelector('textarea.bkrep-textarea');
  reply.value = 'Cảm ơn bạn, mình đã thấy đáp án mới.';
  win.querySelector('form.bkrep-reply').dispatchEvent(new A.w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(10);
  const sendCall = A.calls.filter((c) => c.action === 'message.send').pop();
  ok('gửi trả lời qua report-api', !!sendCall && !!sendCall.report_id);
  ok('tin nhắn mới xuất hiện trong hội thoại', /Cảm ơn bạn/.test(win.textContent));

  console.log('\n== 6. Đóng bằng Esc & nhúng Cài đặt ==');
  win.hidden = false;
  A.w.document.dispatchEvent(new A.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  ok('Esc đóng cửa sổ', win.hidden === true);

  const B = boot();
  await settle();
  const host = B.w.document.createElement('div');
  B.w.document.body.appendChild(host);
  const inline = B.w.BKReport.mount(host, { tab: 'compose' });
  await settle(10);
  ok('nhúng được vào panel Cài đặt', !!inline && !!host.querySelector('form.bkrep-form'));
  ok('chế độ nhúng không tạo thêm nút nổi thứ hai', B.w.document.querySelectorAll('#bkReportFab').length === 1);

  console.log('\n== 7. Hợp đồng máy chủ ==');
  ['bootstrap', 'list', 'detail', 'create', 'message.send', 'read.mark', 'notifications', 'notifications.read']
    .forEach((act) => ok('report-api có action ' + act, REPORT_API.includes("'" + act + "'")));
  ok('report-api xác minh thiết bị đã gắn học sinh', /student_devices/.test(REPORT_API) && /NOT_BOUND/.test(REPORT_API));
  ok('report-api giới hạn tần suất', /bakhi_rate_limit/.test(REPORT_API));
  ok('report-api không tin student_id từ client', !/body\.student_id/.test(REPORT_API));
  ['reports.stats', 'reports.list', 'reports.detail', 'reports.reply', 'reports.privateMessage',
    'reports.status', 'reports.complete', 'reports.reopen', 'reports.assign']
    .forEach((act) => ok('admin-actions có ' + act, ADMIN_ACTIONS.includes("'" + act + "'")));
  ok('Complete Report bắt buộc ghi chú kết quả', /BAD_NOTE/.test(ADMIN_ACTIONS));
  ok('thông báo riêng gắn đúng report + student', /report_notifications/.test(ADMIN_ACTIONS) &&
    /student_id: report\.student_id/.test(ADMIN_ACTIONS));
  ok('mọi thay đổi trạng thái ghi nhật ký', /report_activity_logs/.test(ADMIN_ACTIONS));

  console.log('\n== 8. Bảo mật & dữ liệu ==');
  ok('RLS bật cho cả bốn bảng', /alter table public\.reports enable row level security/.test(MIGRATION) &&
    /alter table public\.report_messages enable row level security/.test(MIGRATION) &&
    /alter table public\.report_notifications enable row level security/.test(MIGRATION) &&
    /alter table public\.report_activity_logs enable row level security/.test(MIGRATION));
  ok('chỉ mở quyền đọc cho chủ sở hữu', /reports_select_own/.test(MIGRATION) &&
    /bakhi_current_student_id\(\)/.test(MIGRATION));
  ok('không có policy insert/update cho client', !/create policy[^;]*for (insert|update|delete) to authenticated[^;]*on public\.reports/s.test(MIGRATION));
  ok('bucket đính kèm là riêng tư', /'report-attachments', 'report-attachments', false/.test(MIGRATION));
  ok('bucket giới hạn dung lượng và loại tệp', /file_size_limit/.test(MIGRATION) && /allowed_mime_types/.test(MIGRATION));
  ok('không có service-role key trong frontend', !/service_role/i.test(REPORT_JS) && !/service_role/i.test(CLOUD));
  ok('cloud có kênh báo cáo riêng', /reportApi:/.test(CLOUD) && /reportUpload:/.test(CLOUD));
  ok('chuông dùng chung hiển thị phản hồi báo cáo', /Phản hồi báo cáo của bạn/.test(CLOUD));
  ok('chuông nghe realtime report_notifications', /table: 'report_notifications'/.test(CLOUD));
  ok('Cài đặt có tab Report Issue', /id: 'report', label: 'Report Issue'/.test(read('assets/bakhi/bk-settings.js')));
  ok('Dashboard có tab Report', /\['reports', 'Report', 'fa-flag'\]/.test(read('assets/bakhi/bk-devboard.js')));

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('QA crashed:', err);
  process.exit(1);
});

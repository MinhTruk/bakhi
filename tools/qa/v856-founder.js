#!/usr/bin/env node
/**
 * Bá Khí 8.5.6 — QA hành vi (jsdom) cho Founder Dashboard:
 *   1. Tab Report: khu vực nhận diện báo cáo mới + lọc "Cần xử lý"
 *   2. Chỉ báo cáo đã hoàn thành mới có nút xoá; xoá hỏi xác nhận
 *   3. Tab Thông báo: chọn nhiều, Chọn tất cả, đếm lựa chọn, xoá hàng loạt
 *   4. Xoá hàng loạt báo kết quả từng phần và tải lại danh sách
 *
 *   npm install jsdom@31.0.1 typescript@5.6.3 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/v856-founder.js
 */
'use strict';

const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://minhtruk.github.io/bakhi/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function until(fn, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  return null;
}
function btnByText(host, text) {
  return Array.from(host.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === text) || null;
}

const REPORTS = [
  { id: 'r1', code: 'BK-1001', title: 'Lỗi đáp án câu 5', status: 'resolved', category: 'answer', priority: 'normal', student_name: 'An', updated_at: new Date().toISOString(), staff_unread: 0 },
  { id: 'r2', code: 'BK-1002', title: 'Trang bị lệch', status: 'new', category: 'ui', priority: 'high', student_name: 'Bình', updated_at: new Date().toISOString(), staff_unread: 1 }
];
const ANNOUNCEMENTS = [
  { id: 'n1', title: 'Bảo trì tối nay', content: 'Bảo trì 22:00', type: 'maintenance', priority: 'high', is_published: true, published_at: new Date().toISOString(), changelog_version: null },
  { id: 'n2', title: 'Cập nhật tính năng', content: 'Thêm sổ tay', type: 'update', priority: 'normal', is_published: true, published_at: new Date().toISOString(), changelog_version: null },
  { id: 'n3', title: 'Bản 8.5.6', content: 'Chi tiết', type: 'update', priority: 'normal', is_published: true, published_at: new Date().toISOString(), changelog_version: '8.5.6' }
];

(async () => {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM('<!DOCTYPE html><html lang="vi"><body><main><div id="bkRoot"></div></main></body></html>', {
    url: SITE + 'founder/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  const D = w.document;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
  w.BK_ADMIN_ONLY = true;
  w.BK_DASH_SCOPE = 'admin';

  const calls = [];
  const toasts = [];
  function adminAction(action, payload) {
    calls.push({ action: action, payload: payload || {} });
    if (action === 'reports.stats') {
      return Promise.resolve({
        ok: true,
        stats: {
          total: 5, new: 2, pending: 0, in_progress: 1, waiting_student: 0,
          resolved: 1, closed: 1, unread: 1, attention: 1
        }
      });
    }
    if (action === 'reports.list') {
      return Promise.resolve({ ok: true, total: REPORTS.length, page: 1, pageSize: 20, reports: REPORTS });
    }
    if (action === 'reports.detail') {
      return Promise.resolve({
        ok: true,
        report: Object.assign({}, REPORTS[1], { description: 'Mô tả', created_at: new Date().toISOString(), issue_type: 'bug' }),
        messages: [], activity: [], attachments: []
      });
    }
    if (action === 'reports.delete') return Promise.resolve({ ok: true, deleted: 1, code: 'BK-1001' });
    if (action === 'announcements.stats') {
      return Promise.resolve({
        ok: true,
        stats: { total: 3, published: 3, draft: 0, reads: 4, linkedToChangelog: 1, byType: { maintenance: 1, update: 2 } }
      });
    }
    if (action === 'announcements.list') {
      return Promise.resolve({ ok: true, total: 3, announcements: ANNOUNCEMENTS });
    }
    if (action === 'announcements.bulkDelete') {
      return Promise.resolve({ ok: true, deleted: 2, deletedIds: ['n1', 'n2'], failed: ['n3'] });
    }
    return Promise.resolve({
      ok: true, total: 0, students: [], logs: [], announcements: [], changelog: [],
      settings: [], roles: [], rooms: []
    });
  }
  w.BKCloud = {
    configured: () => true,
    adminToken: () => 'admin-session',
    founderToken: () => '',
    adminScope: () => 'admin',
    adminLogout: () => { },
    adminAction: adminAction,
    storagePublicUrl: (b, p) => 'https://demo.supabase.co/storage/v1/object/public/' + b + '/' + p
  };

  function load(file) { w.eval(read(file)); }
  load('assets/bakhi/bk-core.js');
  load('assets/bakhi/bk-profile.js');
  load('assets/bakhi/bk-badges.js');
  load('assets/bakhi/bk-devboard.js');
  if (w.BK && w.BK.ui) w.BK.ui.toast = (m) => toasts.push(String(m));

  /* Hộp thoại đang mở (bỏ qua hộp đang mờ dần chuẩn bị gỡ khỏi DOM). */
  function openModals() {
    return Array.from(D.querySelectorAll('.bk-modal'))
      .filter((m) => !(m.closest('.bk-overlay') || m).classList.contains('bk-overlay-out'));
  }
  function modalByText(text) {
    return openModals().find((m) => new RegExp(text).test(m.textContent)) || null;
  }
  async function waitNoModal() {
    await until(() => openModals().length === 0);
  }

  w.openDevDashboard();
  await until(() => D.querySelector('.bkc-dash'));

  /* ---------------------------------------------------------------- [1] */
  console.log('\n[1] Tab Report — khu vực báo cáo mới');
  w.BKDashboard.tab('reports');
  const spotlight = await until(() => D.querySelector('.bkc-spotlight.is-new, .bkc-spotlight.is-busy'));
  ok('khu vực nhận diện hiển thị ở đầu tab Report', !!spotlight);
  ok('đếm đúng số báo cáo cần xử lý (mới + đang xử lý)',
    !!spotlight && /3 báo cáo cần kiểm tra/.test(spotlight.textContent),
    spotlight && spotlight.textContent);
  ok('tách số đã hoàn thành khỏi số cần xử lý',
    !!spotlight && /Đã hoàn thành 2/.test(spotlight.textContent));
  const filterBtn = spotlight && btnByText(spotlight, 'Xem báo cáo cần xử lý');
  ok('có nút lọc nhanh nhóm cần xử lý', !!filterBtn);
  if (filterBtn) {
    filterBtn.click();
    const activeCall = await until(() =>
      calls.filter((c) => c.action === 'reports.list' && c.payload.status === 'active')[0]);
    ok('bấm khu vực thông báo → lọc status=active', !!activeCall);
  }

  /* ---------------------------------------------------------------- [2] */
  console.log('\n[2] Xoá báo cáo đã hoàn thành');
  await until(() => D.querySelectorAll('.bkc-table tbody tr').length >= 2);
  const rows = Array.from(D.querySelectorAll('.bkc-table tbody tr'));
  const resolvedRow = rows.find((r) => /BK-1001/.test(r.textContent));
  const openRow = rows.find((r) => /BK-1002/.test(r.textContent));
  ok('báo cáo đã hoàn thành có nút xoá',
    !!resolvedRow && !!resolvedRow.querySelector('.bkc-row-actions .is-danger'));
  ok('báo cáo chưa hoàn thành KHÔNG có nút xoá',
    !!openRow && !openRow.querySelector('.bkc-row-actions .is-danger'));

  const delBtn = resolvedRow && resolvedRow.querySelector('.bkc-row-actions .is-danger');
  if (delBtn) {
    delBtn.click();
    const modal = await until(() => modalByText('muốn xoá báo cáo đã hoàn thành này'));
    ok('mở hộp xác nhận xoá báo cáo', !!modal);
    const yes = modal && btnByText(modal, 'Xoá báo cáo');
    ok('nút xác nhận đúng nhãn', !!yes);
    if (yes) {
      yes.click();
      const delCall = await until(() => calls.find((c) => c.action === 'reports.delete'));
      ok('gọi reports.delete đúng báo cáo', !!delCall && delCall.payload.report_id === 'r1',
        delCall && JSON.stringify(delCall.payload));
      ok('xoá xong tải lại danh sách', !!(await until(() =>
        calls.filter((c) => c.action === 'reports.list').length >= 2)));
      await waitNoModal();
    }
  }

  /* ---------------------------------------------------------------- [3] */
  console.log('\n[3] Tab Thông báo — chọn nhiều');
  w.BKDashboard.tab('notifications');
  const bulkbar = await until(() => D.querySelector('.bkc-bulkbar'));
  ok('có thanh chọn nhiều', !!bulkbar);
  await until(() => D.querySelectorAll('tbody tr[data-notif-id]').length === 3);
  ok('mỗi thông báo có checkbox',
    D.querySelectorAll('tbody tr[data-notif-id] .bkc-check').length === 3,
    String(D.querySelectorAll('tbody tr[data-notif-id] .bkc-check').length));
  const countEl = D.querySelector('.bkc-bulkbar-count');
  const deleteBtn = bulkbar && btnByText(bulkbar, 'Xoá đã chọn');
  ok('ban đầu chưa chọn gì', !!countEl && countEl.textContent === 'Đã chọn 0 thông báo');
  ok('nút xoá bị vô hiệu khi chưa chọn', !!deleteBtn && deleteBtn.disabled === true);

  const headerBox = D.getElementById('bkcNotifSelectAll');
  ok('có ô Chọn tất cả ở hàng tiêu đề', !!headerBox);
  const selectAll = bulkbar && btnByText(bulkbar, 'Chọn tất cả');
  ok('có nút Chọn tất cả', !!selectAll);
  if (selectAll) {
    selectAll.click();
    ok('Chọn tất cả chọn đủ 3 thông báo',
      !!countEl && countEl.textContent === 'Đã chọn 3 thông báo', countEl && countEl.textContent);
    ok('nút xoá được bật khi có lựa chọn', !!deleteBtn && deleteBtn.disabled === false);
    const none = btnByText(bulkbar, 'Bỏ chọn');
    ok('có nút Bỏ chọn', !!none);
    if (none) {
      none.click();
      ok('Bỏ chọn đưa số lượng về 0',
        !!countEl && countEl.textContent === 'Đã chọn 0 thông báo' && !!deleteBtn && deleteBtn.disabled === true);
    }
  }
  const manual = Array.from(D.querySelectorAll('tbody tr[data-notif-id] .bkc-check')).slice(0, 2);
  manual.forEach((box) => { box.checked = true; box.dispatchEvent(new w.Event('change')); });
  ok('chọn thủ công cập nhật số lượng',
    !!countEl && countEl.textContent === 'Đã chọn 2 thông báo', countEl && countEl.textContent);

  /* ---------------------------------------------------------------- [4] */
  console.log('\n[4] Xoá hàng loạt + báo kết quả từng phần');
  await waitNoModal();
  if (deleteBtn) {
    deleteBtn.click();
    const modal = await until(() => modalByText('Bạn có chắc chắn muốn xoá 2 thông báo này'));
    ok('hỏi xác nhận trước khi xoá hàng loạt', !!modal,
      openModals().map((m) => m.textContent.slice(0, 60)).join(' | '));
    const yes = modal && btnByText(modal, 'Xoá 2 thông báo');
    ok('nút xác nhận nêu đúng số lượng', !!yes);
    if (yes) {
      yes.click();
      const call = await until(() => calls.find((c) => c.action === 'announcements.bulkDelete'));
      ok('gọi announcements.bulkDelete đúng id đã chọn',
        !!call && call.payload.ids.length === 2 && call.payload.ids[0] === 'n1',
        call && JSON.stringify(call.payload));
      const partial = await until(() => toasts.find((m) => /không xoá được/.test(m)));
      ok('báo kết quả từng phần khi có thông báo không xoá được', !!partial, toasts.join(' | '));
      ok('tải lại danh sách sau khi xoá', !!(await until(() =>
        calls.filter((c) => c.action === 'announcements.list').length >= 2)));
    }
  }

  ok('không có lỗi JavaScript trong quá trình chạy', errors.length === 0, errors[0]);

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

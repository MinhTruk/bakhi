'use strict';
/**
 * Bá Khí — QA cho Administrator Dashboard 4.2 (13 mô-đun).
 *
 * Kiểm tra:
 *   1. 13 tab đúng thứ tự, gồm Hồ sơ, Thành tích, Chat, What's New.
 *   2. Hồ sơ: danh sách, chi tiết, badge đã xác minh.
 *   3. Thành tích: chỉ hai badge Administrator được trao, có thu hồi.
 *   4. Chat: phòng chung không xoá được; nhóm có tạm khoá, gỡ thành viên,
 *      xoá tin và xoá phòng; mọi thao tác đi qua admin-actions.
 *   5. What's New: công tắc public.whatsnew + xem trước changelog.
 *   6. Bảo mật: không ghi trực tiếp bảng nhạy cảm, không có secret.
 *
 * Cài công cụ (ngoài repo):
 *   npm install jsdom typescript@5.6.3 --prefix %TEMP%\bktest --no-save
 *   node tools/qa/admin-smoke.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://minhtruk.github.io/bakhi/';

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function until(fn, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  return null;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function buttonByText(root, matcher) {
  return Array.from(root.querySelectorAll('button')).find((b) => matcher.test(b.textContent || ''));
}

const STUDENTS = [
  { id: '11111111-1111-4111-8111-111111111111', display_name: 'Nguyễn Minh Anh', disambiguator: '', is_active: true, needs_review: false, profile: { nickname: 'Minh Anh', avatar_url: '', frame: 'leaf', updated_at: new Date().toISOString() }, badges: 3 },
  { id: '22222222-2222-4222-8222-222222222222', display_name: 'Trần Văn Bách', disambiguator: 'Lớp 11A1', is_active: true, needs_review: false, profile: null, badges: 0 }
];
const ADMIN_BADGE = { badge_id: 'admin-chosen', kind: 'admin', awarded_at: new Date().toISOString(), awarded_by: 'sess-1', reason: 'Giúp bạn học tập' };
const AUTO_BADGE = { badge_id: 'streak-7', kind: 'auto', awarded_at: new Date().toISOString(), awarded_by: null, reason: '' };
const ROOMS = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'global', title: 'Phòng chung', dm_key: null, created_by: null, created_at: new Date().toISOString(), last_message_at: new Date().toISOString(), member_count: 2, message_count: 1, last_message: { body: 'Chào cả trường', image_path: null, created_at: new Date().toISOString(), deleted_at: null } },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'group', title: 'Nhóm Vật lí', dm_key: null, created_by: STUDENTS[0].id, created_at: new Date().toISOString(), last_message_at: new Date().toISOString(), member_count: 2, message_count: 1, last_message: { body: 'Làm bài 3 chưa?', image_path: null, created_at: new Date().toISOString(), deleted_at: null } }
];
const CHANGELOG = [{
  id: 'cl-1', version: '3.8.0', title: 'Mười ba mô-đun quản trị', summary: 'Bổ sung hồ sơ, thành tích, chat và What\'s New.',
  content: [{ category: 'features', items: ['Quản lý hồ sơ và badge', 'Kiểm duyệt chat'] }],
  category: 'features', is_published: true, source: 'admin', published_at: new Date().toISOString(), created_at: new Date().toISOString()
}];

(async () => {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM('<!DOCTYPE html><html lang="vi"><body><main><div id="bkRoot"></div></main></body></html>', {
    url: SITE + 'admin/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  const D = w.document;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
  w.BK_ADMIN_ONLY = true;

  const calls = [];
  const state = { badges: [ADMIN_BADGE, AUTO_BADGE] };

  function adminAction(action, payload = {}) {
    calls.push({ action, payload });
    switch (action) {
      case 'overview':
        return Promise.resolve({
          ok: true,
          counts: { students: 42, studentsActive: 40, announcements: 5, announcementsPublished: 3, changelog: 9 },
          needsReview: [], recentActivity: [], latestVersion: { version: '3.8.0' }
        });
      case 'profiles.list':
        return Promise.resolve({ ok: true, total: STUDENTS.length, profiles: STUDENTS });
      case 'profiles.detail':
        return Promise.resolve({ ok: true, student: STUDENTS[0], profile: STUDENTS[0].profile, badges: state.badges });
      case 'badges.list':
        return Promise.resolve({ ok: true, badges: state.badges });
      case 'badges.grant': {
        const meta = { badge_id: payload.badge_id, kind: 'admin', awarded_at: new Date().toISOString(), awarded_by: 'sess-1', reason: payload.reason || '' };
        if (!state.badges.some((b) => b.badge_id === payload.badge_id)) state.badges.push(meta);
        return Promise.resolve({ ok: true, badges: state.badges });
      }
      case 'badges.revoke':
        state.badges = state.badges.filter((b) => !(b.badge_id === payload.badge_id && b.kind === 'admin'));
        return Promise.resolve({ ok: true });
      case 'chat.rooms':
        return Promise.resolve({ ok: true, rooms: ROOMS });
      case 'chat.messages':
        return Promise.resolve({
          ok: true,
          room: ROOMS.find((r) => r.id === payload.room_id),
          members: [
            { student_id: STUDENTS[0].id, display_name: STUDENTS[0].display_name, role: 'owner', muted: false, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
            { student_id: STUDENTS[1].id, display_name: STUDENTS[1].display_name, role: 'member', muted: false, joined_at: new Date().toISOString(), last_read_at: null }
          ],
          messages: [{
            id: 'msg-1', room_id: payload.room_id, student_id: STUDENTS[1].id,
            body: 'Làm bài 3 chưa?', image_path: null, created_at: new Date().toISOString(),
            deleted_at: null, sender_name: STUDENTS[1].display_name
          }]
        });
      case 'chat.mute':
      case 'chat.member.remove':
      case 'chat.delete':
      case 'chat.room.delete':
        return Promise.resolve({ ok: true });
      case 'settings.get':
        return Promise.resolve({ ok: true, settings: [{ key: 'public.whatsnew', value: { enabled: true }, description: 'Khối cập nhật gần đây' }] });
      case 'settings.set':
        return Promise.resolve({ ok: true });
      case 'changelog.list':
        return Promise.resolve({ ok: true, total: CHANGELOG.length, changelog: CHANGELOG });
      case 'settings.status':
        return Promise.resolve({ ok: true, status: { adminDevCode: true, serviceRole: true, rosterSecret: true, students: 42 } });
      default:
        return Promise.resolve({ ok: true, total: 0, students: [], logs: [], announcements: [], changelog: [] });
    }
  }

  /* Stub lớp cloud: QA chỉ kiểm tra giao diện và payload gửi đi. */
  w.BKCloud = {
    configured: () => true,
    adminToken: () => 'session-token',
    adminLogin: () => Promise.resolve(),
    adminLogout: () => { },
    adminAction,
    storagePublicUrl: (bucket, p) => 'https://demo.supabase.co/storage/v1/object/public/' + bucket + '/' + p
  };

  function load(file) { w.eval(read(file)); }
  load('assets/bakhi/bk-core.js');
  load('assets/bakhi/bk-profile.js');
  load('assets/bakhi/bk-badges.js');
  load('assets/bakhi/bk-devboard.js');

  /* ------------------------------------------------------------------ */
  console.log('\n[1] Mở dashboard và 13 mô-đun');
  w.openDevDashboard();
  const dash = await until(() => D.querySelector('.bkc-dash'));
  ok('dashboard mở được khi có phiên quản trị', !!dash);
  const tabs = Array.from(D.querySelectorAll('.bkc-nav .bkc-tab'));
  ok('sidebar có đúng 13 tab', tabs.length === 13, String(tabs.length));
  const tabIds = tabs.map((b) => b.getAttribute('data-tab'));
  ok('thứ tự tab đúng', tabIds.join(',') === 'overview,students,profiles,badges,chat,notifications,whatsnew,changelog,logs,monitoring,permissions,settings,data', tabIds.join(','));
  ok('tab mới có nhãn tiếng Việt', /Hồ sơ/.test(tabs[2].textContent) && /Thành tích/.test(tabs[3].textContent) &&
    /Chat/.test(tabs[4].textContent) && /What's New/.test(tabs[6].textContent), tabs.map((b) => b.textContent.trim()).join(' | '));
  ok('Alt+1…9 chuyển tab được khai báo', /altKey && \/\^\[1-9\]\$\/\.test/.test(read('assets/bakhi/bk-devboard.js')));
  ok('dashboard không nạp tệp badge vào localStorage khi mở admin', /if \(global\.BK_ADMIN_ONLY\) return;/.test(read('assets/bakhi/bk-badges.js')));

  function openTab(id) {
    const b = D.querySelector('.bkc-nav .bkc-tab[data-tab="' + id + '"]');
    if (b) b.click();
    return b;
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[2] Hồ sơ học sinh');
  openTab('profiles');
  const profileTable = await until(() => D.querySelector('.bkc-pane .bkc-table'));
  ok('gọi profiles.list khi mở tab', calls.some((c) => c.action === 'profiles.list'));
  ok('bảng hồ sơ có 2 học sinh', !!profileTable && profileTable.querySelectorAll('tbody tr').length === 2,
    profileTable && String(profileTable.querySelectorAll('tbody tr').length));
  ok('hiển thị biệt danh và khung avatar', /Minh Anh/.test(profileTable.textContent) && /Vòng lá|M\u1eb7c \u0111\u1ecbnh|leaf/i.test(profileTable.textContent + ' ' + profileTable.innerHTML), profileTable.textContent.slice(0, 180));

  const detailBtn = buttonByText(D.querySelector('.bkc-pane'), /^Chi tiết$/);
  ok('có nút xem chi tiết hồ sơ', !!detailBtn);
  if (detailBtn) {
    detailBtn.click();
    const sheet = await until(() => {
      const s = D.querySelector('.bkc-sheet');
      return s && /Thành tích đã xác minh/.test(s.textContent) ? s : null;
    });
    ok('mở sheet chi tiết hồ sơ', !!sheet);
    const sheetText = sheet ? sheet.textContent : '';
    ok('gọi profiles.detail', calls.some((c) => c.action === 'profiles.detail' && c.payload.id === STUDENTS[0].id));
    ok('hiển thị thành tích đã xác minh', /Thành tích đã xác minh/.test(sheetText) && /Giúp bạn học tập/.test(sheetText), sheetText.slice(0, 200));
    ok('hiển thị student_id nhưng không lộ mã bí mật', /student_id: 11111111/.test(sheetText) && !/service_role:\s*eyJ|sb_secret_/i.test(sheetText));
    const x = D.querySelector('.bkc-sheet .bkc-x');
    if (x) x.click();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[3] Trao và thu hồi badge Administrator');
  openTab('badges');
  const pickerTable = await until(() => D.querySelectorAll('.bkc-pane .bkc-table').length ? D.querySelectorAll('.bkc-pane .bkc-table')[0] : null);
  ok('tab Thành tích tải danh sách học sinh', !!pickerTable && /Nguyễn Minh Anh/.test(pickerTable.textContent));
  const chooseBtn = buttonByText(D.querySelector('.bkc-pane'), /^Chọn$/);
  ok('có nút chọn học sinh', !!chooseBtn);
  if (chooseBtn) {
    chooseBtn.click();
    const grantBox = await until(() => D.querySelector('.bkc-grant-box'));
    ok('hiện khối trao badge sau khi chọn', !!grantBox);
    const select = grantBox && grantBox.querySelector('select');
    const values = select ? Array.from(select.options).map((o) => o.value) : [];
    ok('chỉ có hai badge Administrator trong ô chọn', values.join(',') === 'admin-chosen,admin-legend', values.join(','));
    ok('nêu rõ chỉ Administrator trao tay được', /NOT_ADMIN_BADGE/.test(D.querySelector('.bkc-pane').textContent));

    const grantBtn = buttonByText(grantBox, /^Trao badge$/);
    ok('có nút trao badge', !!grantBtn);
    if (grantBtn) {
      grantBtn.click();
      const granted = await until(() => calls.find((c) => c.action === 'badges.grant'));
      ok('gửi badges.grant đúng payload', !!granted && granted.payload.id === STUDENTS[0].id && granted.payload.badge_id === 'admin-chosen',
        granted && JSON.stringify(granted.payload));
      const tiles = await until(() => D.querySelectorAll('.bkc-badge-tile').length ? D.querySelectorAll('.bkc-badge-tile') : null);
      ok('hiển thị badge vừa trao', !!tiles && /Được chọn/.test(D.querySelector('.bkc-pane').textContent));
      const adminTile = Array.from(D.querySelectorAll('.bkc-badge-tile')).find((t) => /Được chọn/.test(t.textContent));
      ok('badge Administrator có nút thu hồi', !!adminTile && !!buttonByText(adminTile, /Thu hồi/));
      const autoTile = Array.from(D.querySelectorAll('.bkc-badge-tile')).find((t) => /streak-7|Chuỗi 7 ngày/i.test(t.textContent));
      ok('badge tự động không có nút thu hồi', !autoTile || !buttonByText(autoTile, /Thu hồi/));
    }
  }
  ok('client không ghi trực tiếp student_badges', !/\.from\('student_badges'\)/.test(read('assets/bakhi/bk-devboard.js')));

  /* ------------------------------------------------------------------ */
  console.log('\n[4] Kiểm duyệt Chat');
  openTab('chat');
  const roomsTable = await until(() => D.querySelectorAll('.bkc-pane .bkc-table').length ? D.querySelectorAll('.bkc-pane .bkc-table')[0] : null);
  ok('gọi chat.rooms', calls.some((c) => c.action === 'chat.rooms'));
  ok('bảng phòng có 2 phòng', !!roomsTable && roomsTable.querySelectorAll('tbody tr').length === 2,
    roomsTable && String(roomsTable.querySelectorAll('tbody tr').length));
  ok('phân loại phòng chung và nhóm', /Phòng chung/.test(roomsTable.textContent) && /Nhóm nhỏ/.test(roomsTable.textContent));

  const globalRow = Array.from(roomsTable.querySelectorAll('tbody tr')).find((tr) => /Phòng chung/.test(tr.textContent));
  const groupRow = Array.from(roomsTable.querySelectorAll('tbody tr')).find((tr) => /Nhóm Vật lí/.test(tr.textContent));
  ok('có dòng phòng chung và dòng nhóm', !!globalRow && !!groupRow);

  if (globalRow) {
    buttonByText(globalRow, /^Mở$/).click();
    const sheet = await until(() => {
      const s = D.querySelector('.bkc-sheet');
      return s && /Thành viên/.test(s.textContent) ? s : null;
    });
    const text = sheet ? sheet.textContent : '';
    ok('gọi chat.messages cho phòng chung', calls.some((c) => c.action === 'chat.messages' && c.payload.room_id === ROOMS[0].id));
    ok('phòng chung không có nút xoá phòng', !/Xoá toàn bộ phòng/.test(text));
    ok('phòng chung không có nút gỡ thành viên', !buttonByText(sheet, /^Gỡ$/));
    const x = D.querySelector('.bkc-sheet .bkc-x');
    if (x) x.click();
    await wait(30);
  }

  if (groupRow) {
    buttonByText(groupRow, /^Mở$/).click();
    const sheet = await until(() => {
      const s = D.querySelector('.bkc-sheet');
      return s && /Thành viên \(2\)/.test(s.textContent) ? s : null;
    });
    const text = sheet ? sheet.textContent : '';
    ok('mở được nhóm nhỏ', /Nhóm Vật lí/.test(text), text.slice(0, 160));
    ok('nhóm có nút tạm khoá và gỡ thành viên', !!buttonByText(sheet, /^Tạm khoá$/) && !!buttonByText(sheet, /^Gỡ$/));
    ok('nhóm có nút xoá phòng', !!buttonByText(sheet, /^Xoá toàn bộ phòng$/));
    ok('tin nhắn có nút xoá', !!buttonByText(sheet, /^Xoá tin$/));

    const muteBtn = buttonByText(sheet, /^Tạm khoá$/);
    if (muteBtn) {
      muteBtn.click();
      const muted = await until(() => calls.find((c) => c.action === 'chat.mute'));
      ok('gửi chat.mute đúng payload', !!muted && muted.payload.room_id === ROOMS[1].id &&
        muted.payload.student_id === STUDENTS[0].id && muted.payload.muted === true, muted && JSON.stringify(muted.payload));
    }

    const reopened = await until(() => {
      const s = D.querySelector('.bkc-sheet');
      return s && /Thành viên \(2\)/.test(s.textContent) ? s : null;
    });
    const delMsg = buttonByText(reopened || sheet, /^Xoá tin$/);
    if (delMsg) {
      delMsg.click();
      const confirm = await until(() => D.querySelector('.bk-overlay .bk-modal'));
      const yes = confirm && buttonByText(confirm, /^Xoá$/);
      ok('xoá tin có hộp xác nhận', !!yes);
      if (yes) {
        yes.click();
        ok('gửi chat.delete đúng message_id',
          await until(() => calls.find((c) => c.action === 'chat.delete' && c.payload.message_id === 'msg-1')) !== null);
      }
    }
    await wait(220);
    D.querySelectorAll('.bkc-modal, .bk-overlay').forEach((m) => m.remove());
  }
  ok('client không ghi trực tiếp bảng chat_*', !/\.from\('chat_(rooms|members|messages|reactions)'\)/.test(read('assets/bakhi/bk-devboard.js')));

  /* ------------------------------------------------------------------ */
  console.log("\n[5] What's New");
  openTab('whatsnew');
  const flagBox = await until(() => D.querySelector('.bkc-pane .bkc-form input[type="checkbox"]'));
  ok('tải feature flag public.whatsnew', calls.some((c) => c.action === 'settings.get'));
  ok('công tắc đang bật theo giá trị máy chủ', !!flagBox && flagBox.checked === true);
  ok('hiển thị trạng thái đang hiển thị', /Đang hiển thị/.test(D.querySelector('.bkc-pane').textContent));

  const saveFlag = buttonByText(D.querySelector('.bkc-pane'), /^Lưu trạng thái$/);
  ok('có nút lưu trạng thái', !!saveFlag);
  if (saveFlag) {
    saveFlag.click();
    const saved = await until(() => calls.find((c) => c.action === 'settings.set'));
    ok('gửi settings.set đúng khoá', !!saved && saved.payload.key === 'public.whatsnew' && saved.payload.enabled === true,
      saved && JSON.stringify(saved.payload));
  }

  const previewTable = await until(() => {
    const tables = D.querySelectorAll('.bkc-pane .bkc-table');
    return tables.length ? tables[tables.length - 1] : null;
  });
  ok('tải changelog đã xuất bản để xem trước', calls.some((c) => c.action === 'changelog.list' && c.payload.status === 'published'));
  ok('bảng xem trước có phiên bản 3.8.0', !!previewTable && /3\.8\.0/.test(previewTable.textContent));
  const previewBtn = previewTable && buttonByText(previewTable, /^Xem$/);
  ok('có nút xem trước changelog', !!previewBtn);
  if (previewBtn) {
    previewBtn.click();
    const sheet = await until(() => {
      const s = D.querySelector('.bkc-sheet');
      return s && /Mười ba mô-đun quản trị/.test(s.textContent) ? s : null;
    });
    ok('xem trước hiển thị tiêu đề và mục thay đổi', !!sheet &&
      /Quản lý hồ sơ và badge/.test(sheet.textContent), sheet && sheet.textContent.slice(0, 300));
    const x = D.querySelector('.bkc-sheet .bkc-x');
    if (x) x.click();
  }
  ok('không tạo hay sửa changelog khi chỉ xem trước',
    !calls.some((c) => c.action === 'changelog.save' || c.action === 'changelog.publish'));

  /* ------------------------------------------------------------------ */
  console.log('\n[6] Backend & bảo mật');
  const adminActions = read('supabase/functions/admin-actions/index.ts');
  const chatApi = read('supabase/functions/chat-api/index.ts');
  const migration = read('supabase/migrations/20261120000000_bakhi_chat.sql');
  const adminPage = read('admin/index.html');

  ok('admin-actions có đủ hành động hồ sơ/badge', ['profiles.list', 'profiles.detail', 'badges.list', 'badges.grant', 'badges.revoke']
    .every((a) => adminActions.includes("case '" + a + "'")));
  ok('admin-actions có đủ hành động kiểm duyệt chat', ['chat.rooms', 'chat.messages', 'chat.delete', 'chat.room.delete', 'chat.member.remove', 'chat.mute']
    .every((a) => adminActions.includes("case '" + a + "'")));
  ok('chỉ hai badge Administrator được trao/thu hồi', /ADMIN_BADGE_IDS\s*=\s*\['admin-chosen',\s*'admin-legend'\]/.test(adminActions) &&
    !/ADMIN_BADGE_IDS\s*=\s*\[[^\]]*streak/.test(adminActions));
  const loggedDeletes = ['chat.delete', 'chat.room.delete', 'chat.member.remove']
    .every((a) => adminActions.includes("logAction(client, '" + a + "'"));
  const muteLogged = /logAction\(client, muted \? 'chat\.mute' : 'chat\.unmute'/.test(adminActions);
  ok('mọi hành động kiểm duyệt chat đều ghi nhật ký', loggedDeletes && muteLogged,
    'deletes=' + loggedDeletes + ' mute=' + muteLogged);
  ok('không xoá được phòng chung', /PROTECTED_ROOM/.test(adminActions));
  ok('chat-api chặn thành viên bị tạm khoá', /membership\.muted/.test(chatApi) && /'MUTED'/.test(chatApi));
  ok('migration chat bật RLS và thu hồi quyền ghi', /enable row level security/i.test(migration) &&
    /revoke insert, update, delete/i.test(migration));
  ok('bucket chat chỉ nhận ảnh ≤ 3 MB', /chat-images/.test(migration) && /3145728/.test(migration) &&
    /image\/png/.test(migration) && /image\/jpeg/.test(migration) && /image\/webp/.test(migration) && /image\/gif/.test(migration));

  ok('trang admin nạp bk-badges để hiển thị tên badge', /bk-badges\.js\?v=3\.8\.0/.test(adminPage));
  ok('trang admin dùng dashboard 4.2.0', /bk-admin-dashboard\.css\?v=4\.2\.0/.test(adminPage) &&
    /bk-devboard\.js\?v=4\.2\.0/.test(adminPage));

  const clients = ['assets/bakhi/bk-devboard.js', 'admin/index.html'];
  const leaks = [];
  const patterns = [/sb_secret_/, /SUPABASE_SERVICE_ROLE/, /eyJhbGciOi/];
  clients.forEach((file) => {
    const src = read(file);
    patterns.forEach((re) => { if (re.test(src)) leaks.push(file + ' :: ' + re); });
  });
  ok('không có service-role key hay token JWT trong client', leaks.length === 0, leaks.join(' | '));
  ok('không lưu Administrator Code vào localStorage', !/localStorage\.setItem\([^)]*adminCode/i.test(read('assets/bakhi/bk-devboard.js')));
  ok('không có lỗi runtime jsdom', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('QA crashed:', err && (err.stack || err));
  process.exit(1);
});

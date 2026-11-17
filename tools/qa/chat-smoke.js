'use strict';
/**
 * Bá Khí — QA cho Chat (jsdom, không cần Supabase thật).
 *
 * Kiểm tra:
 *   1. Giao diện: danh sách phòng, bộ đếm chưa đọc, mở phòng, tin nhắn,
 *      cảm xúc, gửi văn bản, Profile Card, xoá tin của mình.
 *   2. Luồng nhắn riêng và tạo nhóm gọi đúng hành động chat-api.
 *   3. Bảo mật: client không ghi trực tiếp bảng chat_*, không dùng innerHTML,
 *      không có service-role key.
 *   4. Migration: RLS bật, không policy ghi, giới hạn nhóm 10, Storage chỉ ảnh.
 *   5. Shell có lối vào Chat; trang /chat/ nạp đúng tệp.
 *
 * Cài công cụ (ngoài repo):
 *   npm install jsdom typescript@5.6.3 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/chat-smoke.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://minhtruk.github.io/bakhi/';

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function until(fn, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  return null;
}

const ME = {
  student_id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Nguyễn Minh Anh', nickname: 'Minh Anh',
  avatar_url: '', frame: 'leaf', badge_count: 12, bio: 'Học sinh 11A1'
};
const OTHER = {
  student_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Trần Bảo Long', nickname: 'Bảo Long',
  avatar_url: '', frame: 'sakura', badge_count: 30, bio: 'Thích Vật lí'
};
const THIRD = {
  student_id: '33333333-3333-4333-8333-333333333333',
  display_name: 'Lê Thu Hà', nickname: '',
  avatar_url: '', frame: 'none', badge_count: 3, bio: ''
};

const GLOBAL = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'global', title: 'Phòng chung',
  dm_key: null, created_by: null, last_message_at: new Date().toISOString(),
  member_count: 2, members: [ME, OTHER], unread: 0,
  last_message: { id: 'm1', student_id: OTHER.student_id, body: 'Chào cả trường', image_path: null, created_at: new Date().toISOString(), deleted: false, sender_name: 'Bảo Long' }
};
const DM = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'dm', title: '',
  dm_key: [ME.student_id, OTHER.student_id].sort().join(':'), created_by: ME.student_id,
  last_message_at: new Date().toISOString(), member_count: 2, members: [ME, OTHER], unread: 2,
  last_message: { id: 'm2', student_id: OTHER.student_id, body: 'Cậu làm bài chưa?', image_path: null, created_at: new Date().toISOString(), deleted: false, sender_name: 'Bảo Long' }
};
const GROUP = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'group', title: 'Nhóm Vật lí',
  dm_key: null, created_by: ME.student_id, last_message_at: new Date().toISOString(),
  member_count: 3, members: [ME, OTHER, THIRD], unread: 0,
  last_message: null
};

function messagesPayload() {
  const now = Date.now();
  return {
    ok: true,
    room: { id: GLOBAL.id, kind: 'global', title: 'Phòng chung', created_by: null },
    members: [
      { student_id: ME.student_id, role: 'member', last_read_at: new Date(now).toISOString() },
      { student_id: OTHER.student_id, role: 'member', last_read_at: new Date(now).toISOString() }
    ],
    messages: [
      {
        id: 'm1', room_id: GLOBAL.id, student_id: OTHER.student_id,
        body: 'Chào cả trường', image_path: null, reply_to: null,
        created_at: new Date(now - 60000).toISOString(), deleted: false, sender: OTHER
      },
      {
        id: 'm2', room_id: GLOBAL.id, student_id: ME.student_id,
        body: 'Chào Long!', image_path: null, reply_to: null,
        created_at: new Date(now - 30000).toISOString(), deleted: false, sender: ME
      },
      {
        id: 'm3', room_id: GLOBAL.id, student_id: OTHER.student_id,
        body: '', image_path: OTHER.student_id + '/abc.png', reply_to: null,
        created_at: new Date(now - 2000).toISOString(), deleted: false, sender: OTHER
      }
    ],
    reactions: [
      { message_id: 'm1', student_id: ME.student_id, emoji: '👍', created_at: new Date(now).toISOString() },
      { message_id: 'm1', student_id: OTHER.student_id, emoji: '👍', created_at: new Date(now).toISOString() }
    ]
  };
}

function makeHarness() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM('<!DOCTYPE html><html lang="vi" class="dark"><body><main><div id="bkChat"></div></main></body></html>', {
    url: SITE + 'chat/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  let vvResize = null;
  w.visualViewport = {
    height: 700, offsetTop: 0,
    addEventListener(type, fn) { if (type === 'resize') vvResize = fn; },
    removeEventListener() { }
  };
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
  const calls = [];
  let uploadCount = 0;

  const channel = {
    on() { return this; },
    subscribe() { return this; },
    unsubscribe() { }
  };
  const fakeClient = {
    channel() { return channel; },
    storage: {
      from() {
        return {
          upload(path) { uploadCount++; return Promise.resolve({ data: { path }, error: null }); }
        };
      }
    }
  };

  w.BKCloud = {
    configured: () => true,
    identity: () => ME,
    chatClient: () => Promise.resolve(fakeClient),
    storagePublicUrl: (bucket, p) => 'https://demo.supabase.co/storage/v1/object/public/' + bucket + '/' + p,
    chatApi(body) {
      calls.push({ action: body.action, body });
      const now = Date.now();
      switch (body.action) {
        case 'bootstrap':
          return Promise.resolve({
            ok: true, me: ME, rooms: [GLOBAL, DM, GROUP],
            totalUnread: 2, maxGroup: 10
          });
        case 'messages.list':
          return Promise.resolve(messagesPayload());
        case 'messages.send':
          return Promise.resolve({
            ok: true,
            message: {
              id: 'm-new', room_id: body.room_id, student_id: ME.student_id,
              body: body.content, image_path: body.image_path || null, reply_to: null,
              created_at: new Date(now).toISOString(), deleted: false, sender: ME
            }
          });
        case 'read.mark':
          return Promise.resolve({ ok: true, last_read_at: body.through });
        case 'presence.ping':
          return Promise.resolve({
            ok: true,
            online: [OTHER, THIRD].map((p, i) => ({
              student_id: p.student_id, online: true, last_seen_at: new Date(now - i * 1000).toISOString()
            }))
          });
        case 'reactions.toggle':
          return Promise.resolve({
            ok: true,
            reactions: [{ message_id: body.message_id, student_id: ME.student_id, emoji: body.emoji, created_at: new Date(now).toISOString() }]
          });
        case 'messages.delete':
          return Promise.resolve({ ok: true });
        case 'students.search':
          return Promise.resolve({ ok: true, students: [OTHER, THIRD] });
        case 'dm.open':
          return Promise.resolve({ ok: true, room_id: DM.id });
        case 'group.create':
          return Promise.resolve({ ok: true, room_id: GROUP.id });
        case 'profiles.cards':
          return Promise.resolve({
            ok: true,
            profiles: [OTHER, THIRD].filter((p) => body.ids.indexOf(p.student_id) !== -1)
          });
        default:
          return Promise.resolve({ ok: false, error: { message: 'unknown' } });
      }
    }
  };

  w.BK = {
    ui: { toast() { }, confirm: () => Promise.resolve(true) },
    badges: { ownedFrames: () => ['none', 'leaf', 'sakura'] }
  };
  w.BKProfile = {
    frameById: (id) => ({ id: id || 'none', name: id === 'sakura' ? 'Hoa sakura' : 'Mặc định', glyph: id === 'none' ? '' : '🌸', ring: '#f9a8d4' })
  };

  w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-chat.js'), 'utf8'));
  return {
    w, calls, errors, uploadCount: () => uploadCount,
    resizeViewport: (height) => { w.visualViewport.height = height; if (vvResize) vvResize(); }
  };
}

async function main() {
  const H = makeHarness();
  const w = H.w;
  const doc = w.document;
  const root = doc.getElementById('bkChat');
  const list = w.BKChat.mount(root);

  console.log('\n[1] Dựng giao diện & tải phòng');
  ok('dựng được khung chat', !!root.querySelector('.bkchat-shell'));
  ok('có danh sách phòng', !!doc.getElementById('bkChatRooms'));
  const vhBefore = parseInt(doc.documentElement.style.getPropertyValue('--bkchat-vh'), 10);
  ok('chat đặt chiều cao theo visualViewport', Number.isFinite(vhBefore), String(vhBefore));
  H.resizeViewport(420);
  await wait(40);
  const vhAfter = parseInt(doc.documentElement.style.getPropertyValue('--bkchat-vh'), 10);
  ok('bàn phím mở làm khung chat co lại', Number.isFinite(vhAfter) && vhAfter < vhBefore, vhBefore + ' → ' + vhAfter);
  ok('có ô soạn tin', !!doc.getElementById('bkChatInput'));
  const rooms = await until(() => doc.querySelectorAll('#bkChatRooms [data-room]').length === 3 ? doc.querySelectorAll('#bkChatRooms [data-room]') : null);
  ok('tải đủ 3 phòng (chung, riêng, nhóm)', !!rooms, String(doc.querySelectorAll('#bkChatRooms [data-room]').length));
  const dmRow = doc.querySelector('#bkChatRooms [data-room="' + DM.id + '"]');
  ok('phòng nhắn riêng hiện tên đối phương', !!dmRow && /Bảo Long/.test(dmRow.textContent), dmRow && dmRow.textContent);
  ok('phòng có tin chưa đọc hiện bộ đếm', !!dmRow && !!dmRow.querySelector('.bkchat-unread'), dmRow && dmRow.textContent);
  ok('bộ đếm tổng nằm ở tiêu đề trang', /^\(2\)/.test(w.document.title), w.document.title);

  console.log('\n[2] Mở phòng chung & hiển thị tin nhắn');
  const globalRow = doc.querySelector('#bkChatRooms [data-room="' + GLOBAL.id + '"]');
  globalRow.click();
  await wait(30);
  ok('mở đoạn chat không tự bật bàn phím', doc.activeElement !== doc.getElementById('bkChatInput'));
  const msgNodes = await until(() => doc.querySelectorAll('#bkChatMessages .bkchat-msg').length === 3 ? doc.querySelectorAll('#bkChatMessages .bkchat-msg') : null);
  ok('tải 3 tin nhắn', !!msgNodes, String(doc.querySelectorAll('#bkChatMessages .bkchat-msg').length));
  const own = doc.querySelector('#bkChatMessages .bkchat-msg.is-own');
  ok('tin của mình căn phải', !!own && /Chào Long/.test(own.textContent));
  const image = doc.querySelector('#bkChatMessages .bkchat-image-link img');
  ok('ảnh dùng URL Storage công khai', !!image && image.src.indexOf('/storage/v1/object/public/chat-images/') !== -1, image && image.src);
  const chips = doc.querySelectorAll('#bkChatMessages .bkchat-reaction');
  ok('hiện cảm xúc kèm số người', chips.length === 1 && /2/.test(chips[0].textContent), chips.length && chips[0].textContent);
  ok('cảm xúc của mình được đánh dấu', !!doc.querySelector('#bkChatMessages .bkchat-reaction.is-mine'));
  await wait(1050);
  ok('gọi read.mark khi mở phòng', H.calls.some((c) => c.action === 'read.mark'));
  const readCall = H.calls.filter((c) => c.action === 'read.mark').pop();
  ok('read.mark gửi mốc tin cuối đã tải', !!readCall && /^\d{4}-\d{2}-\d{2}T/.test(readCall.body.through || ''),
    readCall && readCall.body.through);
  ok('chat gửi nhịp hoạt động', H.calls.some((c) => c.action === 'presence.ping'));
  const liveDot = await until(() => dmRow && dmRow.querySelector('.bkchat-presence'));
  ok('avatar phòng nhắn riêng có chấm đang hoạt động', !!liveDot);
  const sideToggle = doc.querySelector('.bkchat-back');
  sideToggle.click();
  ok('icon sidebar thu gọn được danh sách', doc.querySelector('.bkchat-shell').classList.contains('is-side-collapsed'));
  sideToggle.click();
  ok('icon sidebar mở lại được danh sách', !doc.querySelector('.bkchat-shell').classList.contains('is-side-collapsed'));

  console.log('\n[3] Gửi tin nhắn văn bản (không ảnh/emoji soạn tin)');
  const input = doc.getElementById('bkChatInput');
  input.value = 'Tin mới từ kiểm thử 😀';
  doc.getElementById('bkChatComposer').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const sent = await until(() => H.calls.filter((c) => c.action === 'messages.send').pop());
  ok('gửi qua chat-api với nội dung đúng', !!sent && sent.body.content === 'Tin mới từ kiểm thử 😀');
  const appended = await until(() => /Tin mới từ kiểm thử 😀/.test(doc.getElementById('bkChatMessages').textContent));
  ok('tin vừa gửi xuất hiện trong khung', !!appended);
  ok('ô soạn tin được xoá sau khi gửi', input.value === '');

  ok('đã bỏ nút gửi ảnh khỏi ô soạn tin', !doc.getElementById('bkChatAttach') && !doc.getElementById('bkChatFile'));
  ok('đã bỏ bảng emoji soạn tin', !doc.getElementById('bkChatEmoji') && !doc.getElementById('bkChatEmojiTray'));
  const composerRow = doc.querySelector('.bkchat-composer-row');
  ok('thanh soạn tin chỉ có ô chữ và nút gửi, không icon emoji',
    !!composerRow && composerRow.children.length === 2 && !composerRow.querySelector('.fa-face-smile'));
  const reactAction = doc.querySelector('#bkChatMessages [data-react]');
  ok('nút thả cảm xúc không còn icon mặt cười', !!reactAction && !reactAction.querySelector('i') &&
    /Thả cảm xúc/.test(reactAction.textContent));

  console.log('\n[4] Thả cảm xúc & xoá tin của mình');
  const reactionChip = doc.querySelector('#bkChatMessages .bkchat-reaction');
  const chipEmoji = reactionChip && reactionChip.getAttribute('data-emoji');
  reactionChip.click();
  const reactionCard = await until(() => doc.querySelector('.bkchat-reaction-pop'));
  ok('bấm cảm xúc mở danh sách người đã thả', !!reactionCard && reactionCard.textContent.indexOf('người đã thả') >= 0,
    reactionCard && reactionCard.textContent.slice(0, 80));
  const reactToggle = reactionCard && reactionCard.querySelector('.bkchat-reaction-toggle');
  if (reactToggle) reactToggle.click();
  const toggled = await until(() => H.calls.filter((c) => c.action === 'reactions.toggle').pop());
  ok('nút trong danh sách gọi reactions.toggle', !!toggled && toggled.body.emoji === chipEmoji);

  const delBtn = doc.querySelector('#bkChatMessages .bkchat-msg.is-own [data-delete]');
  ok('tin của mình có nút xoá', !!delBtn);
  if (delBtn) {
    delBtn.click();
    await wait(60);
    const deleted = await until(() => H.calls.filter((c) => c.action === 'messages.delete').pop());
    ok('xoá mềm qua chat-api', !!deleted);
    const shown = await until(() => /Tin nhắn đã được xoá/.test(doc.getElementById('bkChatMessages').textContent));
    ok('giao diện hiện trạng thái đã xoá', !!shown);
  }

  console.log('\n[5] Profile Card');
  const nameBtn = doc.querySelector('#bkChatMessages [data-profile="' + OTHER.student_id + '"]');
  ok('có nút mở hồ sơ người gửi', !!nameBtn);
  if (nameBtn) {
    nameBtn.click();
    const card = await until(() => doc.getElementById('bkChatCard').hidden === false ? doc.getElementById('bkChatCard') : null);
    ok('mở Profile Card', !!card && /Bảo Long/.test(card.textContent), card && card.textContent.slice(0, 60));
    ok('hiện số thành tích', !!card && /30 thành tích/.test(card.textContent));
    ok('có nút nhắn riêng', !!card && !!card.querySelector('[data-dm]'));
    card.querySelector('[data-close-card]').click();
    ok('đóng được Profile Card', doc.getElementById('bkChatCard').hidden === true);
  }

  console.log('\n[6] Nhắn riêng & tạo nhóm');
  doc.getElementById('bkChatNewDm').click();
  ok('mở hộp thoại nhắn riêng', !!doc.getElementById('bkChatDialog'));
  const dmInput = doc.querySelector('#bkChatDialog input[type="search"]');
  dmInput.value = 'Bảo';
  dmInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  const picked = await until(() => doc.querySelector('#bkChatDialog .bkchat-pick'));
  ok('tìm và hiện học sinh', !!picked && /Bảo Long/.test(picked.textContent));
  if (picked) {
    picked.click();
    const opened = await until(() => H.calls.filter((c) => c.action === 'dm.open').pop());
    ok('mở DM qua chat-api', !!opened && opened.body.student_id === OTHER.student_id);
    await until(() => !doc.getElementById('bkChatDialog'));
    ok('đóng hộp thoại sau khi chọn', !doc.getElementById('bkChatDialog'));
  }

  doc.getElementById('bkChatNewGroup').click();
  const dialog = await until(() => doc.getElementById('bkChatDialog'));
  ok('mở hộp thoại tạo nhóm', !!dialog);
  if (dialog) {
    const text = dialog.querySelector('input[type="text"]');
    text.value = 'Nhóm kiểm thử';
    const search = dialog.querySelector('input[type="search"]');
    search.value = '';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    const picks = await until(() => dialog.querySelectorAll('.bkchat-pick').length === 2 ? dialog.querySelectorAll('.bkchat-pick') : null);
    ok('liệt kê học sinh để chọn', !!picks);
    if (picks) {
      picks[0].click();
      const create = Array.from(dialog.querySelectorAll('button')).find((b) => /Tạo nhóm/.test(b.textContent));
      create.click();
      const created = await until(() => H.calls.filter((c) => c.action === 'group.create').pop());
      ok('tạo nhóm với thành viên đã chọn', !!created && created.body.member_ids.length === 1, created && JSON.stringify(created.body));
      ok('đặt tên nhóm đúng', !!created && created.body.title === 'Nhóm kiểm thử');
    }
  }

  console.log('\n[7] Bảo mật phía client');
  const src = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-chat.js'), 'utf8');
  ok('không dùng innerHTML', !/\.innerHTML\s*=/.test(src));
  ok('không ghi trực tiếp bảng chat_*', !/\.from\(\s*['"]chat_/.test(src));
  ok('không chứa khoá bí mật', !/service_role|SERVICE_ROLE|eyJhbGciOi/.test(src));
  ok('không có bộ đếm thời gian tự động', !/setInterval\s*\(/.test(src));
  ok('client đã bỏ tải ảnh lên', !/storage\.from\(['"]chat-images['"]\)/.test(src) && !/image\/png/.test(src));
  ok('không có lỗi runtime jsdom', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));

  console.log('\n[8] Migration: RLS, giới hạn và Storage');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261120000000_bakhi_chat.sql'), 'utf8');
  ok('bật RLS cho cả bốn bảng',
    ['chat_rooms', 'chat_members', 'chat_messages', 'chat_reactions'].every((t) =>
      new RegExp('alter table public\\.' + t + ' enable row level security', 'i').test(sql)));
  ok('chỉ có policy đọc, không policy ghi',
    !/create policy[^;]*on public\.chat_(rooms|members|messages|reactions)\s+for\s+(insert|update|delete)/i.test(sql));
  ok('thu hồi quyền ghi khỏi anon/authenticated',
    /revoke insert, update, delete on public\.chat_rooms, public\.chat_members, public\.chat_messages, public\.chat_reactions\s+from anon, authenticated/i.test(sql));
  ok('giới hạn nhóm tối đa 10', /v_kind = 'group' and v_count >= 10/i.test(sql));
  ok('DM đúng 2 người', /v_kind = 'dm' and v_count >= 2/i.test(sql));
  ok('mỗi cặp chỉ một phòng DM', /dm_key text unique/i.test(sql));
  ok('tin nhắn phải có nội dung hoặc ảnh',
    /char_length\(body\) > 0 or image_path is not null/i.test(sql));
  ok('bucket ảnh chỉ nhận image/*', /allowed_mime_types/.test(sql) && /image\/png/.test(sql) && /3145728/.test(sql));
  ok('ảnh phải nằm trong thư mục của chính mình', /storage\.foldername\(name\)\)\[1\] = public\.bakhi_current_student_id\(\)/i.test(sql));
  ok('đưa bảng vào realtime', /supabase_realtime/.test(sql) && /chat_messages/.test(sql));

  console.log('\n[9] Edge Function chat-api');
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/chat-api/index.ts'), 'utf8');
  const tsOut = ts.transpileModule(fn, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true, fileName: 'chat-api.ts'
  });
  ok('chat-api hợp lệ cú pháp', (tsOut.diagnostics || []).filter((x) => x.category === 1).length === 0);
  ok('xác thực thiết bị đã gắn học sinh', /student_devices/.test(fn) && /callerUserId/.test(fn));
  ok('không tin student_id từ client', !/body\.student_id\s*\|\|\s*ctx\.studentId|const studentId = str\(body\.student_id/.test(fn));
  ok('có đủ thao tác chính',
    ['bootstrap', 'messages.list', 'messages.send', 'reactions.toggle', 'read.mark', 'dm.open', 'group.create', 'group.add', 'group.leave']
      .every((a) => fn.indexOf("'" + a + "'") !== -1));
  ok('giới hạn tần suất gửi tin', /chat-send:/.test(fn) && /20, 60/.test(fn));
  ok('server chặn gửi ảnh mới', /IMAGES_DISABLED/.test(fn));

  console.log('\n[10] Lối vào & trang Chat');
  const shell = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-shell.js'), 'utf8');
  ok('menu tài khoản có mục Chat', /'chat\/'/.test(shell) && /fa-comments/.test(shell));
  const page = fs.readFileSync(path.join(ROOT, 'chat/index.html'), 'utf8');
  ok('trang chat nạp bk-chat.js và css', /bk-chat\.js/.test(page) && /bk-chat\.css/.test(page));
  ok('trang chat không ở chế độ chỉ thông báo', !/data-bk-notify-only/.test(page));
  ok('trang chat nạp bk-cloud đầy đủ', /bk-cloud\.js/.test(page));

  w.close();
  console.log(failures ? `\n=== ${failures} FAILURE(S) ===` : '\n=== ALL CHECKS PASSED ===');
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

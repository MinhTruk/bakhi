'use strict';
/**
 * Bá Khí — QA Founder Dashboard 7.7.0 (jsdom).
 *
 * Kiểm tra:
 *   1. Trang Founder nạp đúng mô-đun, không lộ Founder Code.
 *   2. Migration 7.5.0/7.6.0/7.7.0: RPC cấp badge nguyên tử, chống trùng theo
 *      request_id, bảng danh hiệu + quyền sử dụng danh hiệu.
 *   3. Dashboard Founder có 3 tab (Thành tích / Danh hiệu / Founder).
 *   4. Trao một và nhiều vật phẩm qua founder.grantItem kèm request_id.
 *   5. Hợp đồng phản hồi trao tặng thống nhất: đủ granted/already/failed thì
 *      báo đúng; phản hồi không rõ kết quả thì chuyển sang "cần đối soát"
 *      (không bao giờ in "undefined").
 *   6. Khu Danh hiệu: tải danh mục, lưu (kèm style/font/palette/effect),
 *      bổ sung danh hiệu mặc định, trao và xem người giữ.
 *
 *   npm install jsdom typescript@5.6.3 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/founder-smoke.js
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
async function until(fn, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  return null;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

(async () => {
  console.log('\n[1] Trang Founder, mô-đun và mã bí mật');
  const page = read('founder/index.html');
  ok('trang founder dùng dashboard + mô-đun 7.7.0',
    /bk-devboard\.js\?v=[0-9.]+/.test(page) && /bk-founder\.js\?v=[0-9.]+/.test(page) &&
    /bk-titles\.js\?v=[0-9.]+/.test(page) &&
    /BK_DASH_SCOPE\s*=\s*["']founder/.test(page));
  ok('trang Founder gọi founderLogin/founderToken',
    /founderLogin/.test(page) && /founderToken/.test(page));
  ok('không lưu Founder Code dạng plaintext trong client',
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(page) &&
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(read('assets/bakhi/bk-settings.js')) &&
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(read('assets/bakhi/bk-cloud.js')));

  const sql = read('supabase/migrations/20261130000000_bakhi_v750_founder_rework.sql');
  const backend = read('supabase/functions/admin-actions/index.ts');
  const founderSrc = read('assets/bakhi/bk-founder.js');
  ok('migration 7.5.0 có RPC cấp badge nguyên tử',
    /create or replace function public\.bakhi_grant_badges/.test(sql) &&
    /on conflict \(student_id, badge_id\) do nothing/.test(sql));
  ok('migration chống trùng theo request_id',
    /create unique index if not exists admin_grant_history_request_unique/.test(sql) &&
    /request_id, target_student, item_id/.test(sql));

  /* --- 7.6.0 / 7.7.0: Danh hiệu (Title) --- */
  const titlesSql = read('supabase/migrations/20261202000000_bakhi_v760_titles.sql');
  const titleRework = read('supabase/migrations/20261203000000_bakhi_v770_titles_rework.sql');
  ok('migration 7.6.0 có bảng danh hiệu, RLS chỉ đọc và realtime',
    /create table if not exists public\.bakhi_titles/.test(titlesSql) &&
    /create table if not exists public\.student_titles/.test(titlesSql) &&
    /enable row level security/.test(titlesSql) && /supabase_realtime/.test(titlesSql));
  ok('migration 7.7.0 thêm cột kiểu hiển thị an toàn (add column if not exists)',
    /add column if not exists badge_id/.test(titleRework) &&
    /add column if not exists style/.test(titleRework) &&
    /add column if not exists font/.test(titleRework) &&
    /add column if not exists palette/.test(titleRework) &&
    /add column if not exists effect/.test(titleRework));
  ok('migration 7.7.0 không xoá dữ liệu danh hiệu cũ',
    !/delete from public\.bakhi_titles/i.test(titleRework) &&
    /on conflict \(id\) do nothing/.test(titleRework));
  ok('migration 7.7.0 tạo bảng trao danh hiệu tự tạo + hàm quyền sử dụng',
    /create table if not exists public\.bakhi_title_grants/.test(titleRework) &&
    /function public\.bakhi_title_eligible\(p_student uuid\)/.test(titleRework));
  ok('migration 7.7.0 seed đúng 35 danh hiệu ánh xạ badge',
    (titleRework.match(/^    \('[a-z0-9-]+',/gm) || []).length === 35,
    String((titleRework.match(/^    \('[a-z0-9-]+',/gm) || []).length));
  ok('admin-actions có đủ action titles.* và chỉ Founder',
    ['titles.list', 'titles.holders', 'titles.save', 'titles.seed',
      'titles.grant', 'titles.revoke', 'titles.delete']
      .every((a) => backend.indexOf("'" + a + "'") !== -1) &&
    /founderOnly = new Set\(\[[\s\S]*?'titles\.grant'/.test(backend));
  ok('Founder Dashboard có khu Danh hiệu (trao, gỡ, lưu, seed)',
    /function tabTitles/.test(founderSrc) &&
    /titles\.grant/.test(founderSrc) && /titles\.revoke/.test(founderSrc) &&
    /titles\.save/.test(founderSrc) && /titles\.seed/.test(founderSrc));
  ok('titles.save lưu cả style/font/palette/effect và badge nguồn',
    /style,\s*\n?\s*font,\s*\n?\s*palette,\s*\n?\s*effect/.test(backend) &&
    /badge_id: badgeId \|\| null/.test(backend));
  ok('migration đóng quyền đọc lịch sử cấp cho client',
    /revoke select on public\.admin_grant_history from anon, authenticated/.test(sql) &&
    /drop policy if exists admin_grant_history_select_all/.test(sql));
  ok('migration có bảng lô cấp + ánh xạ khung dữ liệu',
    /create table if not exists public\.admin_grant_batches/.test(sql) &&
    /create table if not exists public\.bakhi_badge_frames/.test(sql));
  ok('migration cấp 99 badge cho hồ sơ Founder',
    (sql.match(/^        \('[a-z0-9-]+'\)/gm) || []).length === 99);
  ok('server chặn Administrator thường khỏi quyền Founder',
    /FOUNDER_ONLY/.test(backend) && /scope !== 'founder'/.test(backend));
  ok('mọi action trao vật phẩm nằm trong nhóm Founder-only',
    /'students\.inventory', 'admin\.items\.list'/.test(backend) &&
    /'founder\.grantItem'/.test(backend));
  ok('chỉ Thiên Khải Sáng Thế (badge founder) mới đòi hồ sơ is_founder',
    /FOUNDER_PROFILE_REQUIRED/.test(backend) &&
    /badgeId === FOUNDER_BADGE_ID && target\.is_founder !== true/.test(backend));
  ok('badge/khung Founder khác không còn chặn hồ sơ thường (7.9.0)',
    !/def\.exclusive === 'founder' && target\.is_founder/.test(backend));
  ok('danh hiệu Founder khác chỉ giới hạn ở “Nhà Sáng Lập”',
    /titleId === FOUNDER_BADGE_ID && student\.is_founder !== true/.test(backend) &&
    !/title\.founder_only === true && student\.is_founder/.test(backend));
  ok('không nhận mã vật phẩm ngoài danh mục',
    /UNKNOWN_ITEM/.test(backend) && /BADGE_BY_ID\.get\(badgeId\)/.test(backend));
  ok('server xem trước tách khỏi thao tác cấp badge',
    /case 'badges\.grantAllPreview'/.test(backend) && /dryRun: true/.test(backend));

  /* --- 7.7.0: hợp đồng phản hồi trao tặng thống nhất --- */
  ok('có hàm grantReport dùng chung cho mọi action trao tặng',
    /function grantReport\(/.test(backend) &&
    /requested_count:/.test(backend) && /granted_count:/.test(backend) &&
    /already_owned_count:/.test(backend) && /failed_count:/.test(backend) &&
    /granted_badges:/.test(backend) && /errors,/.test(backend));
  ok('badges.grantAll và founder.grantAll dùng grantReport',
    (backend.match(/const report = grantReport\(\{/g) || []).length >= 3 &&
    (backend.match(/\.\.\.report/g) || []).length >= 3);
  ok('chống trao lặp theo request_id trước khi cấp',
    /function replayGrant\(/.test(backend) &&
    /const replay = await replayGrant\(client, requestId/.test(backend));
  ok('badge.autoGrant loại badge độc quyền khỏi xét tự động',
    /filter\(\(b\) => !b\.admin_only\)/.test(backend));
  ok('giao diện không in "undefined" và có trạng thái đối soát',
    /function paintGrantReport/.test(founderSrc) &&
    /Cần đối soát giao dịch/.test(founderSrc) &&
    !/\+\s*data\.added\s*\+/.test(founderSrc));
  ok('số khung lấy từ danh mục badge khi thiếu BKProfile',
    /function frameCatalogSize/.test(founderSrc) && /frameCatalogSize\(B, P\)/.test(founderSrc));
  ok('trao khung đi qua badge sở hữu khung, không ghi đè khung đang dùng',
    /function badgeForFrame/.test(backend) &&
    !/student_profiles'\)\.upsert\(\{\s*student_id: targetId,\s*frame: itemId/.test(backend));

  console.log('\n[2] Danh mục 10 Founder Badge và 10 khung Founder');
  const dom0 = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: SITE, runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w0 = dom0.window;
  w0.matchMedia = w0.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
  w0.BK = { ui: { toast() { } }, signals: { bump() { }, get() { return {}; } }, store: { get() { return { practice: [], review: [], notes: [], bookmarks: [], history: [], achievements: { counters: {} }, prefs: {} }; } } };
  w0.eval(read('assets/bakhi/bk-badges.js'));
  const B0 = w0.BK.badges;
  const artRows = B0.CATALOG.filter((b) => b.art);
  ok('có đúng 10 Founder Badge mới kèm hình tượng', artRows.length === 10, String(artRows.length));
  const arts = artRows.map((b) => B0.art(b.art));
  ok('mỗi badge có SVG riêng, không trùng template',
    arts.every((a) => a.indexOf('<svg') === 0) && new Set(arts).size === 10);
  ok('badge Founder mới không nằm trong danh mục tự động',
    artRows.every((b) => b.adminOnly === true && b.exclusive === 'founder' && !b.key));

  w0.eval(read('assets/bakhi/bk-profile.js'));
  const P0 = w0.BKProfile;
  const concepts = ['yin-yang', 'cyberpunk', 'ancient-empire', 'samurai', 'astral-observatory',
    'abyssal', 'phoenix-rebirth', 'crystal-sovereign', 'chrono-mechanical', 'frost-emperor'];
  const founderFrames = P0.frames.filter((f) => f.tier === 'founder');
  ok('có đủ 10 concept khung Founder 7.5.0',
    concepts.every((c) => founderFrames.some((f) => f.art === c)), String(founderFrames.length));
  ok('khung Founder thế hệ cũ vẫn giữ để không mất quyền sở hữu',
    founderFrames.filter((f) => f.legacy).length === 6);
  ok('mỗi concept khung vẽ được SVG riêng',
    concepts.every((c) => {
      const f = founderFrames.find((x) => x.art === c);
      const svg = P0.frameOverlay(f.id);
      return !!svg && svg.getAttribute('data-frame') === f.id &&
        svg.querySelector('g.bk-frame-art').childNodes.length > 0;
    }));
  ok('10 khung concept có mô tả riêng (không chỉ đổi tên)',
    concepts.every((c) => {
      const f = founderFrames.find((x) => x.art === c);
      return typeof f.desc === 'string' && f.desc.length > 30;
    }));

  console.log('\n[3] Dashboard Founder trong jsdom — 3 tab');
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
  w.BK_DASH_SCOPE = 'founder';

  const calls = [];
  const catalogItems = [
    { id: 'learn-first-lesson', type: 'badge', name: 'Tri Thức Nhập Môn', category: 'learning', rarity: 'common', frame: 'leaf', exclusive: false, founderOnly: false, devOnly: false, adminOnly: false, grantable: true, owned: false },
    { id: 'learn-lessons-5', type: 'badge', name: 'Ngũ Đường Khai Giác', category: 'learning', rarity: 'common', frame: null, exclusive: false, founderOnly: false, devOnly: false, adminOnly: false, grantable: true, owned: false },
    { id: 'founder-genesis', type: 'badge', name: 'Genesis', category: 'secret', rarity: 'secret', frame: null, exclusive: true, founderOnly: true, devOnly: false, adminOnly: true, grantable: true, owned: false }
  ];
  let grantAllReply = {
    ok: true, studentName: 'Hứa Viết Minh Trúc', status: 'granted', success: true,
    requested_count: 76, granted_count: 3, already_owned_count: 73, failed_count: 0,
    granted_badges: [{ id: 'learn-first-lesson', name: 'Tri Thức Nhập Môn' }],
    errors: [], message: 'Đã cấp 3 vật phẩm mới.'
  };
  const titlesFixture = [
    { id: 'founder', name: 'Nhà Sáng Lập', short: 'SÁNG LẬP', color: '#f5c451', icon: 'fa-crown', description: '', sortOrder: 10, founderOnly: true, active: true, badgeId: 'founder', style: 'special', font: 'display', palette: '#f5c451,#b45309,#facc15', effect: 'flow', source: 'badge', holders: 1 },
    { id: 'learn-first-lesson', name: 'Tri Thức Nhập Môn', short: 'NHẬP MÔN', color: '#60a5fa', icon: 'fa-book-open', description: '', sortOrder: 10, founderOnly: false, active: true, badgeId: 'learn-first-lesson', style: 'plain', font: '', palette: '', effect: 'none', source: 'badge', holders: 0 }
  ];

  function adminAction(action, payload = {}) {
    calls.push({ action, payload });
    if (action === 'version') {
      return Promise.resolve({ ok: true, serverVersion: '7.7.0', scope: 'founder', titles: { total: 35 }, defaultTitles: 35 });
    }
    if (action === 'overview') {
      return Promise.resolve({
        ok: true, counts: { students: 40, studentsActive: 40, announcements: 0, announcementsPublished: 0, changelog: 0 },
        needsReview: [], recentActivity: [], latestVersion: null
      });
    }
    if (action === 'students.search') {
      return Promise.resolve({
        ok: true, count: 1,
        students: [{ id: 'stu-1', display_name: 'Hứa Viết Minh Trúc', disambiguator: 'A', student_code: 'HS001', avatar_url: '', is_founder: true }]
      });
    }
    if (action === 'admin.items.list') return Promise.resolve({ ok: true, items: catalogItems, total: 3 });
    if (action === 'students.inventory') {
      return Promise.resolve({ ok: true, studentId: 'stu-1', studentName: 'Hứa Viết Minh Trúc', badges: [], frames: ['none', 'leaf'], equippedFrame: 'none', catalogTotal: 99, isFounder: true, isActive: true });
    }
    if (action === 'badges.grantAllPreview') {
      return Promise.resolve({
        ok: true, dryRun: true, studentName: 'Hứa Viết Minh Trúc', totalGrantable: 76,
        toGrant: [{ id: 'learn-first-lesson', name: 'Tri Thức Nhập Môn' }], toAddCount: 1,
        alreadyOwned: [], alreadyOwnedCount: 0, excluded: ['founder', 'dev-exclusive-void'], excludedCount: 2
      });
    }
    if (action === 'founder.grantItem') {
      return Promise.resolve({
        ok: true, status: 'granted', success: true, granted_count: 1, already_owned_count: 0,
        failed_count: 0, granted_badges: [{ id: payload.item_id, name: 'Tri Thức Nhập Môn' }], errors: [],
        item_name: 'Tri Thức Nhập Môn', studentName: 'Hứa Viết Minh Trúc',
        item_type: payload.item_type, item_id: payload.item_id
      });
    }
    if (action === 'founder.grantAll') {
      return Promise.resolve({
        ok: true, studentName: 'Hứa Viết Minh Trúc', badgeTotal: 99, status: 'granted',
        requested_count: 99, granted_count: 0, already_owned_count: 99, failed_count: 0,
        granted_badges: [], errors: [],
        frames: ['none', 'leaf', 'founder'], frameCount: 3, equippedFrame: 'founder'
      });
    }
    if (action === 'badges.grantAll') return Promise.resolve({ ok: true, ...grantAllReply });
    if (action === 'titles.list') {
      return Promise.resolve({ ok: true, serverVersion: '7.7.0', total: titlesFixture.length, activeTotal: 2, defaultTotal: 35, specialTotal: 1, plainTotal: 1, titles: titlesFixture });
    }
    if (action === 'titles.save') {
      return Promise.resolve({ ok: true, serverVersion: '7.7.0', id: payload.title_id || 'title-moi', created: !payload.title_id, message: 'Đã lưu danh hiệu “' + payload.name + '”.' });
    }
    if (action === 'titles.seed') {
      return Promise.resolve({ ok: true, serverVersion: '7.7.0', added: 2, total: 35, message: 'Đã bổ sung 2 danh hiệu mặc định còn thiếu.' });
    }
    if (action === 'titles.grant') {
      return Promise.resolve({ ok: true, status: 'granted', studentName: 'Hứa Viết Minh Trúc', titleId: payload.title_id, titleName: 'Nhà Sáng Lập' });
    }
    if (action === 'titles.revoke') return Promise.resolve({ ok: true, removed: true });
    if (action === 'titles.holders') {
      return Promise.resolve({ ok: true, holders: [{ studentId: 'stu-1', name: 'Hứa Viết Minh Trúc', code: 'HS001', assignedAt: new Date().toISOString() }] });
    }
    if (action === 'admin.grantHistory') return Promise.resolve({ ok: true, history: [] });
    if (action === 'settings.get') {
      return Promise.resolve({ ok: true, settings: [{ key: 'public.branding', value: { adminDashboardName: 'Administrator Dashboard' } }] });
    }
    return Promise.resolve({ ok: true, total: 0, students: [], logs: [], announcements: [], changelog: [], settings: [], roles: [], rooms: [] });
  }
  w.BKCloud = {
    configured: () => true,
    adminToken: () => 'founder-session',
    founderToken: () => 'founder-session',
    adminScope: () => 'founder',
    adminLogout: () => { },
    founderLogout: () => { },
    adminAction,
    storagePublicUrl: (b, p) => 'https://demo.supabase.co/storage/v1/object/public/' + b + '/' + p
  };

  function load(file) { w.eval(read(file)); }
  load('assets/bakhi/bk-core.js');
  load('assets/bakhi/bk-profile.js');
  load('assets/bakhi/bk-badges.js');
  load('assets/bakhi/bk-titles.js');
  load('assets/bakhi/bk-founder.js');
  load('assets/bakhi/bk-devboard.js');

  w.openDevDashboard();
  const dash = await until(() => D.querySelector('.bkc-dash'));
  ok('mở được Founder Dashboard', !!dash);
  const tabs = Array.from(D.querySelectorAll('.bkc-nav .bkc-tab'));
  ok('Founder có đủ 16 tab', tabs.length === 16, String(tabs.length));

  await until(() => calls.find((c) => c.action === 'settings.get'));
  await wait(60);
  w.BKDashboard.tab('founder');
  const pane = await until(() => D.querySelector('.bkc-pane'));

  const innerTabs = Array.from(D.querySelectorAll('.bkc-pane .bkf-tabbtn'));
  ok('khu Founder chia 3 tab: Thành tích / Danh hiệu / Founder',
    innerTabs.length === 3 &&
    /Thành tích/.test(innerTabs[0].textContent) &&
    /Danh hiệu/.test(innerTabs[1].textContent) &&
    /Founder/.test(innerTabs[2].textContent), String(innerTabs.length));
  ok('tab mặc định là Thành tích với 5 khu vực',
    D.querySelectorAll('.bkc-pane .bkf-section').length === 5,
    String(D.querySelectorAll('.bkc-pane .bkf-section').length));
  ok('dashboard đọc phiên bản máy chủ thật',
    !!calls.find((c) => c.action === 'version'));

  function cardByTitle(title) {
    return Array.from(D.querySelectorAll('.bkc-pane .bkc-card')).find((c) => {
      const h = c.querySelector('.bkc-sec-title');
      return h && h.textContent.indexOf(title) !== -1;
    });
  }

  const grantCard = cardByTitle('Trao badge và khung avatar');
  ok('có khu vực trao badge/khung', !!grantCard);

  /* --- debounce tìm người nhận --- */
  const searchInput = grantCard.querySelector('input[type="search"]');
  searchInput.value = 'min';
  searchInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(80);
  ok('chưa gọi máy chủ ngay khi đang gõ', !calls.find((c) => c.action === 'students.search'));
  const searchCall = await until(() => calls.find((c) => c.action === 'students.search'), 2000);
  ok('debounce gọi students.search sau khi ngừng gõ', !!searchCall &&
    searchCall.payload.q === 'min' && searchCall.payload.limit === 8);
  const resultRow = await until(() => grantCard.querySelector('.bkf-result'));
  ok('hiển thị gợi ý tài khoản', !!resultRow);

  resultRow.click();
  const inventoryCall = await until(() => calls.find((c) => c.action === 'students.inventory'));
  ok('chọn người nhận thì tải tồn kho vật phẩm', !!inventoryCall && inventoryCall.payload.id === 'stu-1');
  const itemTiles = await until(() => grantCard.querySelectorAll('.bkf-item').length);
  ok('hiển thị lưới vật phẩm kèm trạng thái sở hữu', itemTiles >= 2, String(itemTiles));

  /* --- trao NHIỀU vật phẩm trong một lần --- */
  const tiles = Array.from(grantCard.querySelectorAll('.bkf-item'));
  tiles[0].click();
  tiles[1].click();
  const multiBtn = Array.from(grantCard.querySelectorAll('button'))
    .find((b) => /Trao 2 vật phẩm đã chọn/.test(b.textContent || ''));
  ok('chọn nhiều vật phẩm thì nút xác nhận hiện số lượng', !!multiBtn && multiBtn.disabled === false);
  multiBtn.click();
  const modal = await until(() => Array.from(D.querySelectorAll('.bk-overlay'))
    .filter((m) => /Xác nhận trao vật phẩm/.test(m.textContent || '')).pop() || null);
  ok('hộp xác nhận nêu người nhận + số vật phẩm', !!modal &&
    /Hứa Viết Minh Trúc/.test(modal.textContent) && /Số vật phẩm/.test(modal.textContent));
  const goBtn = Array.from(modal.querySelectorAll('button')).find((b) => /^Trao 2 vật phẩm$/.test((b.textContent || '').trim()));
  goBtn.click();
  const grantCalls = await until(() => {
    const list = calls.filter((c) => c.action === 'founder.grantItem');
    return list.length >= 2 ? list : null;
  });
  ok('trao nhiều vật phẩm gọi founder.grantItem cho từng món kèm request_id',
    !!grantCalls && grantCalls.every((c) => /^[A-Za-z0-9_-]{8,64}$/.test(String(c.payload.request_id))));
  const done = await until(() => /Đã cấp 2 vật phẩm mới/.test(grantCard.textContent));
  ok('báo kết quả trao nhiều vật phẩm theo hợp đồng mới', !!done && !/undefined/.test(grantCard.textContent));

  /* --- xem trước toàn bộ badge không được cấp thật --- */
  const bulkCard = cardByTitle('Trao tặng toàn bộ badge');
  ok('có khu vực trao toàn bộ badge', !!bulkCard);
  const bulkSearch = bulkCard.querySelector('input[type="search"]');
  bulkSearch.value = 'truc';
  bulkSearch.dispatchEvent(new w.Event('input', { bubbles: true }));
  const bulkResult = await until(() => bulkCard.querySelector('.bkf-result'), 2500);
  ok('hiển thị gợi ý cho khu vực trao toàn bộ', !!bulkResult);
  bulkResult.click();
  const previewCall = await until(() => calls.find((c) => c.action === 'badges.grantAllPreview'), 2500);
  ok('xem trước dùng badges.grantAllPreview', !!previewCall);
  ok('mở xem trước KHÔNG cấp badge thật', !calls.find((c) => c.action === 'badges.grantAll'));
  const previewText = await until(() => /Dự kiến cấp/.test(bulkCard.textContent));
  ok('hiện số badge dự kiến cấp + badge bị loại trừ', !!previewText);

  const bulkGo = Array.from(bulkCard.querySelectorAll('button'))
    .find((b) => /Cấp toàn bộ badge đủ điều kiện/.test(b.textContent || ''));
  bulkGo.click();
  const bulkModal = await until(() => Array.from(D.querySelectorAll('.bk-overlay'))
    .filter((m) => /Xác nhận cấp toàn bộ badge/.test(m.textContent || '')).pop() || null);
  const bulkConfirm = bulkModal && Array.from(bulkModal.querySelectorAll('button'))
    .find((b) => /^Cấp \d+ badge$/.test((b.textContent || '').trim()));
  ok('hộp xác nhận cấp hàng loạt hiện số badge cụ thể',
    !!bulkConfirm && !/undefined/.test(bulkModal.textContent));
  bulkConfirm.click();
  const bulkReport = await until(() => /Cấp mới: 3/.test(bulkCard.textContent), 2500);
  ok('báo cáo cấp hàng loạt hiện đủ requested/granted/already/failed',
    !!bulkReport && /Yêu cầu: 76/.test(bulkCard.textContent) &&
    /Đã sở hữu: 73/.test(bulkCard.textContent) && !/undefined/.test(bulkCard.textContent));

  /* --- phản hồi KHÔNG rõ kết quả → cần đối soát, không trao lại --- */
  grantAllReply = { ok: true, count: 76 };
  const before = calls.filter((c) => c.action === 'badges.grantAll').length;
  const bulkAgain = Array.from(bulkCard.querySelectorAll('button'))
    .find((b) => /Cấp toàn bộ badge đủ điều kiện/.test(b.textContent || ''));
  bulkAgain.click();
  const bulkModal2 = await until(() => Array.from(D.querySelectorAll('.bk-overlay'))
    .filter((m) => /Xác nhận cấp toàn bộ badge/.test(m.textContent || '')).pop() || null);
  Array.from(bulkModal2.querySelectorAll('button'))
    .find((b) => /^Cấp \d+ badge$/.test((b.textContent || '').trim())).click();
  const reconcile = await until(() => /Cần đối soát giao dịch/.test(bulkCard.textContent), 2500);
  ok('phản hồi máy chủ cũ không rõ kết quả → chuyển sang cần đối soát',
    !!reconcile && !/undefined/.test(bulkCard.textContent));
  ok('không tự gửi lại giao dịch khi kết quả chưa xác định',
    calls.filter((c) => c.action === 'badges.grantAll').length === before + 1);

  /* --- cấp trọn bộ --- */
  const fullCard = cardByTitle('Cấp trọn bộ cho hồ sơ Founder');
  ok('có khu vực cấp trọn bộ trong tab Thành tích', !!fullCard);
  const fullBtn = Array.from(fullCard.querySelectorAll('button'))
    .find((b) => /Cấp toàn bộ badge và khung/.test(b.textContent || ''));
  ok('nút cấp trọn bộ tồn tại', !!fullBtn);
  fullBtn.click();
  const fullModal = await until(() => Array.from(D.querySelectorAll('.bk-overlay'))
    .filter((m) => /Cấp trọn bộ danh mục/.test(m.textContent || '')).pop() || null);
  ok('cấp trọn bộ cũng yêu cầu xác nhận và nêu 99 badge', !!fullModal && /99/.test(fullModal.textContent));
  const fullGo = Array.from(fullModal.querySelectorAll('button')).find((b) => /Cấp trọn bộ/.test(b.textContent || ''));
  fullGo.click();
  const fullCall = await until(() => calls.find((c) => c.action === 'founder.grantAll'));
  ok('gọi founder.grantAll kèm request_id', !!fullCall &&
    /^[A-Za-z0-9_-]{8,64}$/.test(String(fullCall.payload.request_id)));
  const fullReport = await until(() => /Cấp mới: 0/.test(fullCard.textContent), 2500);
  ok('báo cáo cấp trọn bộ hiện số theo hợp đồng mới, không undefined',
    !!fullReport && !/undefined/.test(fullCard.textContent));

  /* --- TAB DANH HIỆU --- */
  console.log('\n[4] Tab Danh hiệu (Title)');
  D.querySelector('.bkf-tabbtn[data-tab="titles"]').click();
  const titlesCall = await until(() => calls.find((c) => c.action === 'titles.list'));
  ok('mở tab Danh hiệu thì tải titles.list', !!titlesCall);
  const titleRows = await until(() => D.querySelectorAll('.bkf-titles tbody tr').length);
  ok('hiện danh sách danh hiệu', titleRows >= 2, String(titleRows));
  const statsText = D.querySelector('.bkf-tabpanel').textContent;
  ok('thống kê danh mục có số đặc biệt / bình thường',
    /Đặc biệt: 1/.test(statsText) && /Bình thường: 1/.test(statsText));

  const titleHost = D.querySelector('.bkf-tabpanel');
  const editBtn = Array.from(titleHost.querySelectorAll('button')).find((b) => /^Sửa$/.test((b.textContent || '').trim()));
  ok('có nút sửa danh hiệu', !!editBtn);
  editBtn.click();
  const nameInput = Array.from(titleHost.querySelectorAll('input')).find((i) => /Tên hiển thị/.test(i.placeholder || ''));
  ok('form sửa danh hiệu có trường tên', !!nameInput && nameInput.value === 'Nhà Sáng Lập');
  const styleSelect = Array.from(titleHost.querySelectorAll('select')).find((s) =>
    /Bình thường/.test(s.textContent || '') && /Đặc biệt/.test(s.textContent || '') && /font/.test(s.textContent || ''));
  ok('form có chọn kiểu hiển thị (bình thường / đặc biệt)', !!styleSelect && styleSelect.value === 'special');
  const previewHost = titleHost.querySelector('.bkf-title-preview-host');
  ok('có khung xem trước danh hiệu', !!previewHost && /bk-title/.test(previewHost.innerHTML));

  nameInput.value = 'Nhà Sáng Lập Bá Khí';
  nameInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  const saveBtn = Array.from(titleHost.querySelectorAll('button')).find((b) => /Lưu danh hiệu/.test(b.textContent || ''));
  saveBtn.click();
  const saveCall = await until(() => calls.find((c) => c.action === 'titles.save'));
  ok('lưu danh hiệu gọi titles.save kèm style/font/palette/effect',
    !!saveCall && saveCall.payload.style === 'special' &&
    saveCall.payload.font === 'display' &&
    saveCall.payload.palette === '#f5c451,#b45309,#facc15' &&
    saveCall.payload.effect === 'flow' &&
    saveCall.payload.badge_id === 'founder');

  const seedBtn = Array.from(D.querySelectorAll('.bkf-tabpanel button')).find((b) => /Bổ sung danh hiệu mặc định/.test(b.textContent || ''));
  ok('có nút bổ sung danh hiệu mặc định', !!seedBtn);
  seedBtn.click();
  ok('bổ sung danh hiệu mặc định gọi titles.seed', !!await until(() => calls.find((c) => c.action === 'titles.seed')));

  const titleSearch = titleHost.querySelector('input[type="search"]');
  titleSearch.value = 'min';
  titleSearch.dispatchEvent(new w.Event('input', { bubbles: true }));
  const titleResult = await until(() => titleHost.querySelector('.bkf-result'), 2500);
  ok('tìm người nhận danh hiệu dùng students.search', !!titleResult);
  titleResult.click();
  const grantTitleBtn = Array.from(titleHost.querySelectorAll('button')).find((b) => /Trao danh hiệu/.test(b.textContent || ''));
  ok('nút trao danh hiệu bật sau khi chọn người nhận', !!grantTitleBtn && grantTitleBtn.disabled === false);
  grantTitleBtn.click();
  const titleGrantModal = await until(() => Array.from(D.querySelectorAll('.bk-overlay'))
    .filter((m) => /Trao danh hiệu/.test(m.textContent || '')).pop() || null);
  ok('trao danh hiệu có hộp xác nhận kèm điều kiện badge',
    !!titleGrantModal && /badge/.test(titleGrantModal.textContent));
  Array.from(titleGrantModal.querySelectorAll('button')).find((b) => /Trao ngay/.test(b.textContent || '')).click();
  const grantTitleCall = await until(() => calls.find((c) => c.action === 'titles.grant'));
  ok('trao danh hiệu gọi titles.grant', !!grantTitleCall && grantTitleCall.payload.title_id === 'founder');

  const holdersBtn = Array.from(D.querySelectorAll('.bkf-titles button')).find((b) => /Người giữ/.test(b.textContent || ''));
  ok('có nút xem người giữ danh hiệu', !!holdersBtn);
  holdersBtn.click();
  ok('xem người giữ gọi titles.holders', !!await until(() => calls.find((c) => c.action === 'titles.holders')));

  /* --- TAB FOUNDER --- */
  console.log('\n[5] Tab Founder (không trao vật phẩm)');
  D.querySelector('.bkf-tabbtn[data-tab="founder"]').click();
  const founderPanel = await until(() => {
    const p = Array.from(D.querySelectorAll('.bkf-tabpanel')).pop();
    return p && /Hồ sơ Người sáng lập/.test(p.textContent) ? p : null;
  });
  ok('tab Founder chỉ giữ chức năng Founder', !!founderPanel &&
    !/Trao badge và khung avatar/.test(founderPanel.textContent));
  const checkBtn = Array.from(founderPanel.querySelectorAll('button')).find((b) => /Kiểm tra hồ sơ Founder/.test(b.textContent || ''));
  ok('tab Founder có kiểm tra hồ sơ Founder', !!checkBtn);
  ok('tab Founder chỉ rõ đã chuyển trao vật phẩm sang tab Thành tích',
    /tab Thành tích/.test(founderPanel.textContent));

  /* --- Mô-đun danh hiệu dùng chung + khối “Danh hiệu của tôi” --- */
  console.log('\n[6] bk-titles.js dùng chung cho Chat / Hồ sơ / Cài đặt');
  ['chat/index.html', 'profile/index.html', 'settings/index.html', 'admin/index.html'].forEach((f) => {
    const html = read(f);
    ok(f + ' nạp bk-titles.css + bk-titles.js đúng 1 lần',
      /bk-titles\.css\?v=[0-9.]+/.test(html) && /bk-titles\.js\?v=[0-9.]+/.test(html) &&
      (html.match(/bk-titles\.js/g) || []).length === 1);
  });

  const special = w.BK.titles.chip({ id: 'founder', name: 'Nhà Sáng Lập', short: 'Sáng lập', color: '#f5c451', style: 'special', font: 'display', palette: '#f5c451,#b45309,#facc15', effect: 'flow' });
  ok('chip danh hiệu đặc biệt có class + biến màu gradient',
    !!special && special.classList.contains('is-special') &&
    special.classList.contains('bk-title-font-display') &&
    special.classList.contains('bk-title-fx-flow') &&
    /#f5c451/ .test(special.getAttribute('style') || ''));
  const plainChip = w.BK.titles.chip({ id: 'x', name: 'Học Giả', short: 'học giả', color: '#93c5fd', style: 'plain' });
  ok('chip danh hiệu bình thường dùng màu tĩnh, không hiệu ứng',
    !!plainChip && plainChip.classList.contains('is-plain') &&
    plainChip.classList.contains('bk-title-fx-none') &&
    !plainChip.classList.contains('is-special'));

  /* Khối chọn danh hiệu của học sinh: chỉ hiện danh hiệu đã sở hữu. */
  const pickerCalls = [];
  w.BKCloud.studentProfile = (body) => {
    pickerCalls.push(body);
    if (body.action === 'titles') {
      return Promise.resolve({
        ok: true, currentTitleId: '',
        titles: [
          { id: 'learn-first-lesson', name: 'Tri Thức Nhập Môn', short: 'NHẬP MÔN', color: '#60a5fa', style: 'plain', eligible: true, current: false },
          { id: 'founder', name: 'Nhà Sáng Lập', short: 'SÁNG LẬP', color: '#f5c451', style: 'special', eligible: false, current: false }
        ]
      });
    }
    return Promise.resolve({ ok: true, currentTitleId: body.title_id || '', message: 'Đã trang bị danh hiệu.' });
  };
  const card = w.BK.titles.card();
  D.body.appendChild(card);
  const titleTile = await until(() => card.querySelectorAll('.bk-title-tile').length);
  ok('khối Danh hiệu chỉ hiện danh hiệu học sinh sở hữu', titleTile === 1, String(titleTile));
  const equipBtn = card.querySelector('.bk-title-tile');
  equipBtn.click();
  const equipCall = await until(() => pickerCalls.find((c) => c.action === 'title'));
  ok('trang bị danh hiệu gọi student-profile action=title',
    !!equipCall && equipCall.title_id === 'learn-first-lesson');
  const clearBtn = card.querySelector('.bk-title-clear');
  ok('khối Danh hiệu có nút gỡ', !!clearBtn);

  ok('không có lỗi runtime jsdom', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exitCode = failures ? 1 : 0;
})();

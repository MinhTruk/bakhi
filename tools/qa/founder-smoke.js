'use strict';
/**
 * Bá Khí — QA Founder Dashboard 7.5.0 (jsdom).
 *
 * Kiểm tra:
 *   1. Trang Founder nạp đúng mô-đun bk-founder.js, không lộ Founder Code.
 *   2. Migration 7.5.0: RPC cấp badge nguyên tử, request_id chống trùng,
 *      đóng quyền đọc lịch sử cấp cho anon/authenticated.
 *   3. Tìm người nhận có debounce và gọi students.search (không tải cả bảng).
 *   4. Trao một vật phẩm: chọn người nhận → chọn badge → hộp xác nhận →
 *      founder.grantItem kèm request_id.
 *   5. Trao toàn bộ badge dùng badges.grantAllPreview (chỉ đọc) trước khi cấp.
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
  ok('trang founder dùng dashboard + mô-đun 7.5.0',
    /bk-devboard\.js\?v=7\.5\.0/.test(page) && /bk-founder\.js\?v=7\.5\.0/.test(page) &&
    /BK_DASH_SCOPE\s*=\s*["']founder/.test(page));
  ok('trang Founder gọi founderLogin/founderToken',
    /founderLogin/.test(page) && /founderToken/.test(page));
  ok('không lưu Founder Code dạng plaintext trong client',
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(page) &&
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(read('assets/bakhi/bk-settings.js')) &&
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(read('assets/bakhi/bk-cloud.js')));

  const sql = read('supabase/migrations/20261130000000_bakhi_v750_founder_rework.sql');
  const backend = read('supabase/functions/admin-actions/index.ts');
  ok('migration 7.5.0 có RPC cấp badge nguyên tử',
    /create or replace function public\.bakhi_grant_badges/.test(sql) &&
    /on conflict \(student_id, badge_id\) do nothing/.test(sql));
  ok('migration chống trùng theo request_id',
    /create unique index if not exists admin_grant_history_request_unique/.test(sql) &&
    /request_id, target_student, item_id/.test(sql));
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
  ok('RPC cấp badge không cấp quyền execute cho client',
    /revoke execute on function public\.bakhi_grant_badges\([^)]*\) from anon, authenticated/.test(sql) ||
    /revoke execute on function public\.bakhi_grant_badges[\s\S]{0,200}from anon, authenticated/.test(sql));
  ok('mọi action trao vật phẩm nằm trong nhóm Founder-only',
    /'students\.inventory', 'admin\.items\.list'/.test(backend) &&
    /'founder\.grantItem'/.test(backend));
  ok('badge Founder chỉ cấp cho hồ sơ is_founder',
    /FOUNDER_PROFILE_REQUIRED/.test(backend) && /target\.is_founder !== true/.test(backend));
  ok('không nhận mã vật phẩm ngoài danh mục',
    /UNKNOWN_ITEM/.test(backend) && /BADGE_BY_ID\.get\(badgeId\)/.test(backend));
  ok('server xem trước tách khỏi thao tác cấp badge',
    /case 'badges\.grantAllPreview'/.test(backend) &&
    /dryRun: true/.test(backend));
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

  console.log('\n[3] Dashboard Founder trong jsdom');
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
  const now = new Date().toISOString();
  const catalogItems = [
    { id: 'learn-first-lesson', type: 'badge', name: 'Tri Thức Nhập Môn', category: 'learning', rarity: 'common', frame: 'leaf', exclusive: false, founderOnly: false, devOnly: false, adminOnly: false, grantable: true, owned: false },
    { id: 'founder-genesis', type: 'badge', name: 'Genesis', category: 'secret', rarity: 'secret', frame: null, exclusive: true, founderOnly: true, devOnly: false, adminOnly: true, grantable: true, owned: false }
  ];
  function adminAction(action, payload = {}) {
    calls.push({ action, payload });
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
    if (action === 'admin.items.list') return Promise.resolve({ ok: true, items: catalogItems, total: 2 });
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
        ok: true, status: 'granted', item_name: 'Tri Thức Nhập Môn', studentName: 'Hứa Viết Minh Trúc',
        item_type: payload.item_type, item_id: payload.item_id, added: [payload.item_id], alreadyOwned: []
      });
    }
    if (action === 'founder.grantAll') {
      return Promise.resolve({
        ok: true, studentName: 'Hứa Viết Minh Trúc', badgeTotal: 99, added: 0, alreadyOwned: 99,
        frames: ['none', 'leaf', 'founder'], frameCount: 3, equippedFrame: 'founder', failed: []
      });
    }
    if (action === 'admin.grantHistory') {
      return Promise.resolve({ ok: true, history: [] });
    }
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
  load('assets/bakhi/bk-founder.js');
  load('assets/bakhi/bk-devboard.js');

  w.openDevDashboard();
  const dash = await until(() => D.querySelector('.bkc-dash'));
  ok('mở được Founder Dashboard', !!dash);
  const tabs = Array.from(D.querySelectorAll('.bkc-nav .bkc-tab'));
  ok('Founder có đủ 15 tab', tabs.length === 15, String(tabs.length));

  await until(() => calls.find((c) => c.action === 'settings.get'));
  await wait(60);
  w.BKDashboard.tab('founder');
  const pane = await until(() => D.querySelector('.bkc-pane'));
  ok('tab Founder dựng 5 khu vực làm việc', !!pane &&
    D.querySelectorAll('.bkc-pane .bkf-section').length === 5,
    String(D.querySelectorAll('.bkc-pane .bkf-section').length));
  ok('không còn khối tìm kiếm trùng lặp trong dashboard',
    D.querySelectorAll('.bkc-pane .bkc-search-results').length === 0);

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
  const itemTile = await until(() => grantCard.querySelector('.bkf-item'));
  ok('hiển thị lưới vật phẩm kèm trạng thái sở hữu', !!itemTile);

  itemTile.click();
  const confirmBtn = Array.from(grantCard.querySelectorAll('button'))
    .find((b) => /Xác nhận trao tặng/.test(b.textContent || ''));
  ok('nút xác nhận bật sau khi chọn vật phẩm', !!confirmBtn && confirmBtn.disabled === false);
  confirmBtn.click();
  const modal = await until(() => D.querySelector('.bk-overlay'));
  ok('mở hộp xác nhận trước khi trao', !!modal &&
    /Hứa Viết Minh Trúc/.test(modal.textContent) && /Tri Thức Nhập Môn/.test(modal.textContent));
  const goBtn = Array.from(modal.querySelectorAll('button'))
    .find((b) => /Trao ngay/.test(b.textContent || ''));
  goBtn.click();
  const grantCall = await until(() => calls.find((c) => c.action === 'founder.grantItem'));
  ok('trao vật phẩm gọi founder.grantItem kèm request_id',
    !!grantCall && grantCall.payload.item_type === 'badge' &&
    grantCall.payload.item_id === 'learn-first-lesson' &&
    /^[A-Za-z0-9_-]{8,64}$/.test(String(grantCall.payload.request_id)));
  const done = await until(() => /Đã trao/.test(grantCard.textContent));
  ok('báo kết quả trao vật phẩm', !!done);

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

  /* --- cấp trọn bộ --- */
  const fullCard = cardByTitle('Cấp trọn bộ cho hồ sơ Founder');
  ok('có khu vực cấp trọn bộ', !!fullCard);
  const fullBtn = Array.from(fullCard.querySelectorAll('button'))
    .find((b) => /Cấp toàn bộ badge và khung/.test(b.textContent || ''));
  ok('nút cấp trọn bộ tồn tại', !!fullBtn);
  fullBtn.click();
  const fullModal = await until(() => D.querySelector('.bk-overlay'));
  ok('cấp trọn bộ cũng yêu cầu xác nhận', !!fullModal && /99/.test(fullModal.textContent));
  const fullGo = Array.from(fullModal.querySelectorAll('button')).find((b) => /Cấp trọn bộ/.test(b.textContent || ''));
  fullGo.click();
  const fullCall = await until(() => calls.find((c) => c.action === 'founder.grantAll'));
  ok('gọi founder.grantAll kèm request_id', !!fullCall &&
    /^[A-Za-z0-9_-]{8,64}$/.test(String(fullCall.payload.request_id)));

  ok('không có lỗi runtime jsdom', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exitCode = failures ? 1 : 0;
})();

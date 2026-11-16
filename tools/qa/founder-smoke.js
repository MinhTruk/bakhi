'use strict';
/**
 * Bá Khí — QA cho Founder Dashboard 6.0.0 (jsdom).
 *
 * Kiểm tra:
 *   1. Trang founder/ tải đúng dashboard, không lộ Founder Code.
 *   2. Phiên Founder thấy đủ 15 tab (14 mô-đun + Founder), gồm Bảo trì/Dữ liệu.
 *   3. Nút "Cấp toàn bộ badge & khung" gọi founder.grantAll và áp dụng badge.
 *   4. Migration có founder_config dạng băm và scope phiên.
 *
 * Cài công cụ (ngoài repo):
 *   npm install jsdom --prefix /tmp/bktest --no-save
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
  console.log('\n[1] Trang Founder và mã bí mật');
  const page = read('founder/index.html');
  ok('có trang founder/ dùng dashboard 6.1.4',
    /bk-devboard\.js\?v=6\.1\.4/.test(page) && /BK_DASH_SCOPE\s*=\s*["']founder/.test(page));
  ok('trang Founder gọi founderLogin/founderToken',
    /founderLogin/.test(page) && /founderToken/.test(page));
  ok('không lưu Founder Code dạng plaintext trong client',
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(page) &&
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(read('assets/bakhi/bk-settings.js')) &&
    !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(read('assets/bakhi/bk-cloud.js')));
  const sql = read('supabase/migrations/20261122000000_bakhi_founder_6.sql');
  ok('migration tạo founder_config dạng băm, không plaintext',
    /founder_config/.test(sql) && /code_hash/.test(sql) &&
    /101c0e6c1631390981e9697e2d4c8ef5fbbade6e086646aae6cfcbb8c03b7e85/.test(sql) &&
    !/code_hash\s*=\s*'[^']{6,}'/.test(sql));
  ok('migration thêm scope và cấp đủ 78 badge',
    /add column if not exists scope/.test(sql) &&
    (sql.match(/^        \('/gm) || []).length === 78);
  ok('server chặn Administrator thường khỏi quyền Founder',
    /FOUNDER_ONLY/.test(read('supabase/functions/admin-actions/index.ts')) &&
    /scope !== 'founder'/.test(read('supabase/functions/admin-actions/index.ts')));

  console.log('\n[2] Dashboard Founder trong jsdom');
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
  function adminAction(action, payload = {}) {
    calls.push({ action, payload });
    if (action === 'overview') {
      return Promise.resolve({
        ok: true, counts: { students: 40, studentsActive: 40, announcements: 0, announcementsPublished: 0, changelog: 0 },
        needsReview: [], recentActivity: [], latestVersion: null
      });
    }
    if (action === 'founder.grantAll') {
      return Promise.resolve({
        ok: true, count: 78,
        badges: [{ badge_id: 'founder', kind: 'admin', awarded_at: now, awarded_by: 'sess-f', reason: 'Founder: cấp toàn bộ' }]
      });
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
  load('assets/bakhi/bk-devboard.js');

  w.openDevDashboard();
  const dash = await until(() => D.querySelector('.bkc-dash'));
  ok('mở được Founder Dashboard', !!dash);
  const tabs = Array.from(D.querySelectorAll('.bkc-nav .bkc-tab'));
  const ids = tabs.map((b) => b.getAttribute('data-tab'));
  ok('Founder có đủ 15 tab', tabs.length === 15, String(tabs.length) + ' :: ' + ids.join(','));
  ok('có Bảo trì, Dữ liệu và tab Founder',
    ['maintenance', 'data', 'founder'].every((id) => ids.includes(id)));

  w.BKDashboard.tab('founder');
  const grant = await until(() => Array.from(D.querySelectorAll('.bkc-pane button'))
    .find((b) => /Cấp toàn bộ badge/.test(b.textContent || '')));
  ok('tab Founder có nút cấp trọn bộ', !!grant);
  if (grant) {
    grant.click();
    const call = await until(() => calls.find((c) => c.action === 'founder.grantAll'));
    ok('bấm nút gọi founder.grantAll', !!call);
    const done = await until(() => /Đã cấp 78 badge/.test(D.querySelector('.bkc-pane').textContent));
    ok('hiển thị kết quả cấp 78 badge', !!done);
  }

  ok('không có lỗi runtime jsdom', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n' + (failures ? '=== ' + failures + ' CHECK(S) FAILED ===' : '=== ALL CHECKS PASSED ==='));
  process.exitCode = failures ? 1 : 0;
})();

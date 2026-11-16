'use strict';
/**
 * Bá Khí — QA cho hồ sơ + thành tích xác minh phía máy chủ (jsdom + TypeScript).
 *
 * Kiểm tra:
 *   1. Danh mục 78 badge phía máy chủ khớp nguồn duy nhất bk-badges.js.
 *   2. Máy chủ tính lại chỉ số và badge y như client (không tin client).
 *   3. applyServer chỉ nhận id hợp lệ, chỉ nhận badge admin khi kind='admin',
 *      không xoá badge cục bộ.
 *   4. Hồ sơ: applyRemote chỉ ghi bản mới hơn, khung chưa mở bị hạ về 'none'.
 *   5. Migration: RLS bật, trình duyệt không ghi được student_badges, khung
 *      avatar trong SQL khớp danh mục.
 *
 * Cài công cụ (ngoài repo):
 *   npm install jsdom typescript@5.6.3 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/badges-smoke.js
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

function makeDOM(html, url) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  return { w, errors };
}

function loadJs(w, file) {
  w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

/** Nạp module TypeScript phía máy chủ vào Node (chỉ để kiểm thử). */
function loadTs(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', out)(mod.exports, mod, require);
  return mod.exports;
}

function consoleSeed() {
  const now = Date.now();
  const day = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);
  return {
    v: 5,
    practice: [
      { id: 'p1', path: '/ktgk1/ly/ly1.html', correct: true, at: now - 1000 },
      { id: 'p2', path: '/ktgk1/ly/ly1.html', correct: false, at: now - 900 },
      { id: 'p3', path: '/ktgk1/toan/toan1.html', correct: true, at: now - 800 }
    ],
    review: [
      { id: 'r1', url: '/ktgk1/ly/ly1.html', subject: 'ly', wrong: 2, interval: 30, mastered: true },
      { id: 'r2', url: '/ktgk1/toan/toan1.html', subject: 'toan', wrong: 1, interval: 3 }
    ],
    notes: [{ id: 'n1', text: 'ghi chú', url: '/ktgk1/ly/ly1.html' }],
    bookmarks: [{ id: 'b1', url: '/ktgk1/ly/ly1.html', title: 'Vật lí' }],
    history: [
      { url: '/ktgk1/ly/ly1.html', subject: 'ly', at: now - 5000 },
      { url: '/ktgk1/toan/toan1.html', subject: 'toan', at: now - 4000 },
      { url: '/ktgk1/hoa/hoa1.html', subject: 'hoa', at: now - 3000 },
      { url: '/studio/word-paint.html', subject: 'studio', at: now - 2000 },
      { url: '/settings/', subject: 'settings', at: now - 1000 }
    ],
    achievements: { v: 1, counters: { correct: 42 } },
    prefs: {}
  };
}

function bootClient(seedSignals, seedProfile) {
  const H = makeDOM('<!DOCTYPE html><html class="dark"><body><div id="toastContainer"></div></body></html>', SITE + 'index.html');
  const w = H.w;
  w.BK = {
    ui: { toast() {} },
    signals: {
      get() { return JSON.parse(w.localStorage.getItem('bakhiSignals.v1') || '{}'); }
    },
    store: { get() { return JSON.parse(w.localStorage.getItem('bakhiLearn.v1') || '{}'); } }
  };
  w.BKProfile = {
    get() { return JSON.parse(w.localStorage.getItem('bakhiProfile.v1') || '{}').profiles?.local || {}; }
  };
  w.localStorage.setItem('bakhiLearn.v1', JSON.stringify(consoleSeed()));
  w.localStorage.setItem('bakhiSignals.v1', JSON.stringify(seedSignals));
  w.localStorage.setItem('bakhiProfile.v1', JSON.stringify({ v: 1, profiles: { local: seedProfile } }));
  loadJs(w, 'assets/bakhi/bk-badges.js');
  return { w, errors: H.errors };
}

const SIGNALS = {
  v: 1, updatedAt: Date.now(),
  studio: { docs: 2, drawings: 1, exports: 1, inserts: 1, words: 520 },
  music: { plays: 10, shuffle: 1, repeat: 1, queue: 1, opened: 1 },
  ui: { palette: 2, searches: 1 },
  backup: { exports: 1 },
  interaction: { meteors: 12 },
  time: { night: 1, early: 1 }
};

const PROFILE = {
  nickname: 'Minh', bio: 'Học sinh', avatar: 'data:image/png;base64,AAA',
  banner: '', frame: 'leaf', links: [{ label: 'GitHub', url: 'https://github.com/x' }],
  updatedAt: Date.now()
};

function main() {
  console.log('\n[1] Danh mục badge khớp nguồn duy nhất');
  const client = bootClient(SIGNALS, PROFILE);
  const w = client.w;
  const clientCatalog = w.BK.badges.CATALOG;
  const server = loadTs('supabase/functions/_shared/badge-catalog.ts');
  ok('client có 78 badge', clientCatalog.length === 78, String(clientCatalog.length));
  ok('máy chủ có 78 badge', server.BADGE_CATALOG.length === 78, String(server.BADGE_CATALOG.length));
  const clientIds = clientCatalog.map((b) => b.id).join(',');
  const serverIds = server.BADGE_CATALOG.map((b) => b.id).join(',');
  ok('id và thứ tự khớp nhau', clientIds === serverIds);
  ok('máy chủ có đúng 73 badge tự động', server.AUTO_BADGES.length === 73, String(server.AUTO_BADGES.length));
  ok('máy chủ có đúng 5 badge admin/độc quyền', server.ADMIN_BADGES.length === 5 &&
    server.ADMIN_BADGES.every((b) => b.admin_only) &&
    ['founder', 'dev-exclusive-aurora', 'dev-exclusive-void'].every((id) => !!server.BADGE_BY_ID[id]));
  const mismatched = clientCatalog.filter((c) => {
    const s = server.BADGE_BY_ID[c.id];
    return !s || s.goal !== c.goal || (s.metric || null) !== (c.key || null) ||
      (s.frame || null) !== (c.frame || null) || s.admin_only !== !!c.adminOnly;
  });
  ok('mục tiêu / chỉ số / khung khớp nhau', mismatched.length === 0,
    mismatched.map((b) => b.id).join(','));

  console.log('\n[2] Máy chủ tính lại đúng như client');

  /* Tạo dữ liệu hoạt động giống người dùng thật. */
  ['/ktgk1/ly/ly1.html', '/ktgk1/toan/toan1.html', '/ktgk1/hoa/hoa1.html', '/settings/', '/profile/', '/studio/word-paint.html']
    .forEach((p) => w.BK.badges.trackPage(p));
  ['theme.toggles', 'search.used', 'focus.used', 'badges.viewed'].forEach((k) => w.BK.badges.bumpCounter(k, 2));
  w.BK.badges.trackListen('bai-1');
  w.BK.badges.trackListen('bai-2');
  const fresh = w.BK.badges.check({ silent: true });
  ok('client mở badge từ dữ liệu mẫu', fresh.length > 0, String(fresh.length));

  const rules = loadTs('supabase/functions/_shared/badge-rules.ts');
  const snapshot = {
    practice: JSON.parse(w.localStorage.getItem('bakhiLearn.v1')).practice,
    review: JSON.parse(w.localStorage.getItem('bakhiLearn.v1')).review,
    notes: JSON.parse(w.localStorage.getItem('bakhiLearn.v1')).notes,
    bookmarks: JSON.parse(w.localStorage.getItem('bakhiLearn.v1')).bookmarks,
    history: JSON.parse(w.localStorage.getItem('bakhiLearn.v1')).history,
    achievements: JSON.parse(w.localStorage.getItem('bakhiLearn.v1')).achievements,
    signals: JSON.parse(w.localStorage.getItem('bakhiSignals.v1')),
    badges: w.BK.badges.snapshot(),
    profile: PROFILE
  };
  const serverMetrics = rules.computeMetrics(snapshot);
  const clientMetrics = w.BK.badges.metrics();
  const metricDiffs = Object.keys(clientMetrics).filter((k) =>
    k !== 'unlockedCount' && Number(clientMetrics[k]) !== Number(serverMetrics[k]));
  ok('chỉ số máy chủ khớp chỉ số client', metricDiffs.length === 0,
    metricDiffs.map((k) => k + ': ' + clientMetrics[k] + '≠' + serverMetrics[k]).join(', '));

  const earned = rules.badgesEarned(server.BADGE_CATALOG, serverMetrics, new Set()).map((b) => b.id);
  const clientUnlocked = w.BK.badges.progress().filter((p) => p.unlockedAt && !p.adminOnly).map((p) => p.id);
  const missing = clientUnlocked.filter((id) => earned.indexOf(id) === -1);
  ok('máy chủ tính ra đủ badge client đã mở', missing.length === 0, missing.join(','));
  ok('máy chủ không tự trao badge admin', earned.every((id) => !server.BADGE_BY_ID[id].admin_only));

  /* Không có dữ liệu → không có badge. */
  const empty = rules.badgesEarned(server.BADGE_CATALOG, rules.computeMetrics({}), new Set());
  ok('máy chủ không trao badge khi không có dữ liệu', empty.length === 0, String(empty.length));

  /* Dữ liệu rác không làm sập hoặc thổi phồng chỉ số. */
  const junk = rules.computeMetrics({
    practice: 'x', history: [null, 1, 'a'], review: [{ interval: 'NaN' }],
    signals: { music: 'no' }, badges: { pages: { a: 1 }, days: null }
  });
  ok('máy chủ chịu được dữ liệu rác', Number.isFinite(junk.practice) && junk.practice === 0 && junk.days === 0,
    JSON.stringify(junk).slice(0, 120));

  console.log('\n[3] applyServer không cho tự trao badge');

  const before = w.BK.badges.progress().filter((p) => p.unlockedAt).length;
  const added = w.BK.badges.applyServer([
    { badge_id: 'badge-khong-ton-tai', kind: 'auto', awarded_at: new Date().toISOString() },
    { badge_id: 'admin-legend', kind: 'auto', awarded_at: new Date().toISOString() },
    { badge_id: 'admin-legend', kind: 'admin', awarded_at: new Date().toISOString(), awarded_by: 'session-1', reason: 'Đóng góp' },
    { badge_id: 'admin-legend', kind: 'admin', awarded_at: new Date().toISOString() }
  ]);
  const after = w.BK.badges.progress().filter((p) => p.unlockedAt).length;
  const legend = w.BK.badges.progress().find((p) => p.id === 'admin-legend');
  ok('bỏ qua badge không có trong danh mục', !w.BK.badges.byId('badge-khong-ton-tai'));
  ok('chỉ thêm badge hợp lệ một lần', added === 1 && after === before + 1, added + '/' + (after - before));
  ok('badge admin chỉ nhận khi kind=admin', legend.unlockedAt && legend.server && legend.server.by === 'session-1');

  const localCount = w.BK.badges.progress().filter((p) => p.unlockedAt).length;
  w.BK.badges.applyServer([]);
  ok('applyServer không xoá badge cục bộ',
    w.BK.badges.progress().filter((p) => p.unlockedAt).length === localCount);

  const own = w.BK.badges.ownedFrames();
  ok('khung admin-legend mở khung crown', own.indexOf('crown') !== -1, own.join(','));

  console.log('\n[4] Hồ sơ: applyRemote');

  const P = makeDOM('<!DOCTYPE html><html class="dark"><body></body></html>', SITE + 'profile/');
  const pw = P.w;
  pw.BK = { badges: { ownedFrames: () => ['none', 'leaf', 'sakura'] } };
  pw.localStorage.setItem('bakhiProfile.v1', JSON.stringify({
    v: 1,
    profiles: { local: { nickname: 'Cũ', bio: '', avatar: '', banner: '', frame: 'leaf', links: [], updatedAt: 1000 } }
  }));
  loadJs(pw, 'assets/bakhi/bk-profile.js');
  const newer = pw.BKProfile.applyRemote({
    nickname: 'Mới', bio: 'Từ máy khác', avatar: '', banner: '',
    frame: 'sakura', links: [], updatedAt: 2000
  });
  ok('áp hồ sơ máy chủ mới hơn', newer === true && pw.BKProfile.get().nickname === 'Mới');
  const older = pw.BKProfile.applyRemote({
    nickname: 'Cũ hơn', bio: '', avatar: '', banner: '', frame: 'none', links: [], updatedAt: 1500
  });
  ok('bỏ qua hồ sơ cũ hơn', older === false && pw.BKProfile.get().nickname === 'Mới');
  pw.BKProfile.applyRemote({
    nickname: 'Mới', bio: '', avatar: '', banner: '', frame: 'crown', links: [], updatedAt: 3000
  });
  ok('khung chưa mở bị hạ về none', pw.BKProfile.get().frame === 'none', pw.BKProfile.get().frame);
  const url = pw.BKProfile.safeUrl('javascript:alert(1)');
  ok('liên kết javascript: bị chặn', url === '', url);

  console.log('\n[5] Migration và bảo mật cơ sở dữ liệu');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261119000000_bakhi_profile_badges.sql'), 'utf8');
  /* Bản 5.0 định nghĩa lại bakhi_owned_frames với đủ 30 khung; đây là bản có hiệu lực. */
  const frameSql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261121000000_bakhi_platform_5.sql'), 'utf8');
  ok('bật RLS cho hồ sơ và thành tích',
    /alter table public\.student_profiles enable row level security/i.test(sql) &&
    /alter table public\.student_badges enable row level security/i.test(sql));
  ok('thành tích chỉ đọc được của chính mình',
    /create policy student_badges_select_own[\s\S]{0,120}bakhi_current_student_id\(\)/i.test(sql));
  ok('không có policy ghi cho student_badges',
    !/create policy[^;]*on public\.student_badges\s+for\s+(insert|update|delete)/i.test(sql));
  ok('thu hồi quyền ghi student_badges khỏi anon/authenticated',
    /revoke insert, update, delete on public\.student_badges from anon, authenticated/i.test(sql));
  ok('trigger chặn khung chưa sở hữu',
    /bakhi_profile_frame_guard/i.test(sql) && /FRAME_NOT_OWNED/.test(sql));

  /* Khung trong SQL phải khớp danh mục và danh sách khung của hồ sơ. */
  const sqlFrames = {};
  const re = /when '([a-z0-9-]+)' then '([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(frameSql))) sqlFrames[m[1]] = m[2];
  const catalogFrames = clientCatalog.filter((b) => b.frame);
  const frameDiffs = catalogFrames.filter((b) => sqlFrames[b.id] !== b.frame);
  ok('khung trong SQL khớp danh mục badge', frameDiffs.length === 0,
    frameDiffs.map((b) => b.id + ':' + b.frame + '≠' + sqlFrames[b.id]).join(', '));
  const profileFrames = pw.BKProfile.frames.map((f) => f.id);
  const unknownFrames = [...new Set(Object.values(sqlFrames))].filter((f) => profileFrames.indexOf(f) === -1);
  ok('mọi khung trong SQL đều có trong hồ sơ', unknownFrames.length === 0, unknownFrames.join(','));

  /* Client không được ghi badge trực tiếp lên Supabase. */
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-cloud.js'), 'utf8');
  ok('client không gọi bảng student_badges trực tiếp', !/from\(\s*['"]student_badges/.test(cloudSrc));
  ok('client chỉ gửi ảnh chụp, không gửi danh sách badge đã mở',
    /BK\.badges\.snapshot/.test(cloudSrc) && !/unlocked\s*:/.test(cloudSrc));

  console.log(failures ? `\n=== ${failures} FAILURE(S) ===` : '\n=== ALL CHECKS PASSED ===');
  process.exitCode = failures ? 1 : 0;
}

main();

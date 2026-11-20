'use strict';
/**
 * Bá Khí — QA Founder Login trên màn hình bảo trì (7.9.2, jsdom).
 *
 * Kiểm tra đúng các hành vi bắt buộc của v7.9.2:
 *   1. Màn hình bảo trì có đúng thông tin (Bảo trì / lý do / giờ bắt đầu từ
 *      máy chủ / vòng xoay / nút Đăng nhập Founder) và KHÔNG còn lối mở khoá
 *      bằng Administrator Code.
 *   2. Nút mở giao diện nhập mã Founder dùng chung; ô mã che nội dung, có
 *      nút hiện/ẩn, có nút quay lại.
 *   3. Mã sai bị từ chối, vẫn giữ màn hình bảo trì, không chuyển trang.
 *   4. Quá nhiều lần thử hiển thị thông báo thử lại sau.
 *   5. Phiên Administrator hợp lệ KHÔNG vượt được bảo trì.
 *   6. Tự khai scope founder trong sessionStorage vẫn bị máy chủ từ chối.
 *   7. Phiên Founder được máy chủ xác nhận thì màn hình bảo trì được gỡ.
 *   8. Không có mã Founder nào trong gói frontend; bk-core không còn khoá bảo
 *      trì cũ (chỉ một màn hình bảo trì duy nhất toàn website).
 *
 *   npm install jsdom typescript@5 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/maintenance-smoke.js
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

const SHELL = read('assets/bakhi/bk-shell.js');
const AUTH = read('assets/bakhi/bk-founder-auth.js');
const CORE = read('assets/bakhi/bk-core.js');
const CLOUD = read('assets/bakhi/bk-cloud.js');

const MAINT = {
  enabled: true,
  title: 'Bá Khí đang bảo trì',
  message: 'Website tạm đóng để nâng cấp.',
  reason: 'Nâng cấp cơ sở dữ liệu',
  maintenance_started_at: '2026-11-20T02:30:00.000Z',
  maintenance_started_by: 'Founder',
  maintenance_updated_at: '2026-11-20T02:30:00.000Z'
};

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
  const dom = new JSDOM('<!DOCTYPE html><html lang="vi"><body><header>Header cũ</header><main>Nội dung học tập</main></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/kttx/gk1/van/bai_119.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { } }));
  w.BAKHI_VERSION = { app: '7.9.2' };
  w.BK_SUPABASE = {
    url: 'https://demo.supabase.co',
    key: 'publishable-key',
    configured: () => true,
    functions: { adminAuth: 'admin-auth', adminActions: 'admin-actions' }
  };
  if (opts.session) {
    try { w.sessionStorage.setItem('bakhiAdmin.v1', JSON.stringify(opts.session)); } catch (e) { }
  }
  const calls = [];
  w.fetch = function (url, init) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ url: String(url), body, headers: (init && init.headers) || {} });
    const reply = (status, payload) => Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload))
    });
    if (String(url).indexOf('app_settings') !== -1) {
      return reply(200, [{ value: opts.maintenance || MAINT }]);
    }
    if (String(url).indexOf('admin-auth') !== -1) {
      return opts.onAuth ? opts.onAuth(body, reply) : reply(401, { ok: false, error: { code: 'BAD_FOUNDER_CODE', message: 'Mã Founder không hợp lệ.' } });
    }
    if (String(url).indexOf('admin-actions') !== -1) {
      return opts.onCheck ? opts.onCheck(body, reply) : reply(401, { ok: false, error: { code: 'BAD_DEV_SESSION', message: 'Phiên quản trị không hợp lệ.' } });
    }
    return reply(404, { ok: false });
  };
  w.eval(AUTH);
  w.eval(SHELL);
  if (w.document.readyState === 'loading') {
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  }
  return { w, dom, D: w.document, calls, errors };
}

function labels(root) {
  return Array.from(root.querySelectorAll('h1, h2, p, button, label')).map((n) => (n.textContent || '').trim());
}

(async () => {
  console.log('\n[1] Màn hình bảo trì — thông tin và nút Đăng nhập Founder');
  {
    const { w, D } = boot({});
    await wait(30);
    const host = D.getElementById('bkMaintenance');
    ok('dựng màn hình bảo trì khi public.maintenance đang bật', !!host);
    const text = host ? host.textContent : '';
    ok('tiêu đề là “Bảo trì”', !!host && /^Bảo trì/.test(text), text.slice(0, 40));
    ok('hiện lý do bảo trì (không hardcode)', text.indexOf('Nâng cấp cơ sở dữ liệu') !== -1);
    ok('hiện thời gian bắt đầu lấy từ máy chủ', /Thời gian bắt đầu:/.test(text) && text.indexOf('2026') !== -1, text);
    ok('có icon loading dạng vòng tròn xoay', !!D.querySelector('#bkMaintenance .bk-maint-spinner'));
    ok('có nút Đăng nhập Founder', !!D.getElementById('bkMaintFounderLogin') &&
      D.getElementById('bkMaintFounderLogin').textContent.trim() === 'Đăng nhập Founder');
    ok('KHÔNG còn ô Administrator Code trên màn hình bảo trì',
      !/Administrator Code/i.test(text) && D.querySelectorAll('#bkMaintenance input').length === 0);
    ok('KHÔNG còn nút Thử lại / mở khoá admin', !/Thử lại/.test(text) && !/Mở khoá/.test(text));
    ok('không hiển thị navbar/nội dung phía dưới (body có lớp khoá)',
      D.body.classList.contains('bk-maintenance-on') && D.documentElement.classList.contains('bk-maint-lock'));
    ok('nền màn hình bảo trì là đen tuyền trong CSS', /\.bk-maint \{[^}]*background: #000;/.test(read('assets/bakhi/bk-shell.css')));
    w.close();
  }

  console.log('\n[2] Giao diện nhập mã Founder');
  {
    const { w, D } = boot({});
    await wait(30);
    D.getElementById('bkMaintFounderLogin').click();
    await wait(20);
    const layer = D.getElementById('bkFounderAuthLayer');
    ok('bấm nút mở giao diện xác thực', !!layer);
    ok('có nhãn FOUNDER AUTHENTICATION', /FOUNDER AUTHENTICATION/.test(layer ? layer.textContent : ''));
    ok('tiêu đề “Đăng nhập Founder”', !!D.getElementById('bkFounderAuthTitle') &&
      D.getElementById('bkFounderAuthTitle').textContent.trim() === 'Đăng nhập Founder');
    ok('mô tả đúng mục đích', /Nhập mã Founder để truy cập hệ thống quản trị/.test(layer.textContent));
    const input = D.getElementById('bkFounderAuthCode');
    ok('ô nhập mã mặc định bị che', !!input && input.type === 'password');
    ok('không tự động điền mã', !!input && /new-password/.test(input.getAttribute('autocomplete') || ''));
    ok('có nút quay lại', !!Array.from(layer.querySelectorAll('button')).find((b) => /Quay lại/.test(b.textContent)));
    const reveal = layer.querySelector('.bkfa-reveal');
    reveal.click();
    ok('nút hiện/ẩn mã hoạt động', input.type === 'text');
    reveal.click();
    ok('ẩn lại được', input.type === 'password');
    w.close();
  }

  console.log('\n[3] Mã sai — không cấp quyền, giữ nguyên bảo trì');
  {
    const { w, D, calls } = boot({});
    await wait(30);
    D.getElementById('bkMaintFounderLogin').click();
    await wait(20);
    const input = D.getElementById('bkFounderAuthCode');
    input.value = 'sai-ma';
    D.getElementById('bkFounderAuthLayer').querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await wait(60);
    const error = D.getElementById('bkFounderAuthError');
    ok('gửi mã tới admin-auth với scope founder',
      calls.some((c) => /admin-auth/.test(c.url) && c.body.scope === 'founder' && c.body.code === 'sai-ma'));
    ok('hiện “Mã Founder không hợp lệ.”', !!error && error.textContent.trim() === 'Mã Founder không hợp lệ.', error && error.textContent);
    ok('vẫn còn màn hình bảo trì', !!D.getElementById('bkMaintenance'));
    ok('không lưu token khi thất bại', !w.sessionStorage.getItem('bakhiAdmin.v1'));
    w.close();
  }

  console.log('\n[4] Giới hạn số lần thử');
  {
    const { w, D } = boot({
      onAuth: (body, reply) => reply(429, {
        ok: false,
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.', retryAfter: 600 }
      })
    });
    await wait(30);
    D.getElementById('bkMaintFounderLogin').click();
    await wait(20);
    D.getElementById('bkFounderAuthCode').value = 'thu-nhieu-lan';
    D.getElementById('bkFounderAuthLayer').querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await wait(60);
    const error = D.getElementById('bkFounderAuthError');
    ok('thông báo khoá tạm thời khi bị giới hạn', !!error && /thử lại sau/i.test(error.textContent), error && error.textContent);
    ok('không cấp phiên', !w.sessionStorage.getItem('bakhiAdmin.v1'));
    w.close();
  }

  console.log('\n[5] Administrator không thể vượt bảo trì');
  {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const { w, D } = boot({
      session: { token: 'admin-token-1234567890', expiresAt: future, scope: 'admin' }
    });
    await wait(40);
    ok('phiên Administrator vẫn bị khoá', !!D.getElementById('bkMaintenance'));
    ok('không có nút nào cho Administrator trên màn hình', !/Administrator Code/i.test(D.body.textContent));
    w.close();
  }

  console.log('\n[6] Giả mạo scope founder ở client bị máy chủ từ chối');
  {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const { w, D, calls } = boot({
      session: { token: 'forged-token-1234567890', expiresAt: future, scope: 'founder' },
      onCheck: (body, reply) => reply(401, { ok: false, error: { code: 'BAD_DEV_SESSION', message: 'Phiên quản trị không hợp lệ.' } })
    });
    await wait(60);
    ok('đã hỏi máy chủ để xác minh phiên', calls.some((c) => /admin-actions/.test(c.url) && c.body.action === 'session.check'));
    ok('máy chủ từ chối → vẫn khoá website', !!D.getElementById('bkMaintenance'));
    ok('xoá phiên giả trong sessionStorage', !w.sessionStorage.getItem('bakhiAdmin.v1'));
    w.close();
  }

  console.log('\n[7] Phiên Founder hợp lệ được máy chủ xác nhận');
  {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const { w, D } = boot({
      session: { token: 'founder-token-1234567890', expiresAt: future, scope: 'founder' },
      onCheck: (body, reply) => reply(200, { ok: true, scope: 'founder', expiresAt: future, serverVersion: '7.9.2', maintenance: MAINT })
    });
    await wait(80);
    ok('màn hình bảo trì được gỡ cho Founder', !D.getElementById('bkMaintenance'));
    ok('lớp khoá trang được bỏ', !D.body.classList.contains('bk-maintenance-on'));

    /* Cùng phiên đó, khi bảo trì tắt hẳn website vẫn bình thường. */
    w.close();
  }

  console.log('\n[8] An toàn mã Founder và tính duy nhất của màn hình bảo trì');
  {
    const bundle = [AUTH, SHELL, CLOUD, read('assets/bakhi/bk-devboard.js'), read('founder/index.html')].join('\n');
    ok('không có mã Founder dạng plaintext/khai báo trong frontend',
      !/FOUNDER_CODE\s*=\s*['"][^'"]{3,}/i.test(bundle) &&
      !/founderCode\s*[:=]\s*['"][^'"]{3,}/i.test(bundle) &&
      !/code_hash\s*[:=]\s*['"][a-f0-9]{8,}/i.test(bundle));
    ok('mã chỉ được kiểm tra ở Edge Function admin-auth',
      /founder_config/.test(read('supabase/functions/admin-auth/index.ts')) &&
      /sha256Hex/.test(read('supabase/functions/admin-auth/index.ts')));
    ok('không lưu mã vào localStorage/URL',
      !/localStorage[^\n]{0,40}code/i.test(AUTH) && !/location\.(href|search)[^\n]{0,40}code/i.test(AUTH));
    ok('bk-core không còn khoá bảo trì cũ (một màn hình duy nhất)',
      !/bk-maintenance-lock/.test(CORE) && !/bk-maintenance-admin/.test(CORE));
    ok('bk-cloud không tự vẽ thông báo bảo trì thứ hai',
      !/bkc-maint-text/.test(CLOUD) && /bk:maintenance/.test(CLOUD));
    ok('mọi website dùng chung màn hình bảo trì của bk-shell',
      /id = 'bkMaintenance'/.test(SHELL) && /bkMaintFounderLogin/.test(SHELL));
  }

  console.log('\n[9] Máy chủ — quyền và ghi nhận');
  {
    const backend = read('supabase/functions/admin-actions/index.ts');
    const auth = read('supabase/functions/admin-auth/index.ts');
    ok('có action session.check để xác minh phiên ở máy chủ',
      /case 'session\.check'/.test(backend) && /expiresAt: auth\.expiresAt/.test(backend));
    ok('badges.grant chặn badge Founder khi hồ sơ không phải Founder',
      /badgeId === FOUNDER_BADGE_ID && student\.is_founder !== true/.test(backend) &&
      /FOUNDER_PROFILE_REQUIRED/.test(backend));
    ok('không còn tự đánh dấu Founder theo tên hiển thị',
      !/findFounderStudent/.test(backend) && !/Minh Trúc/.test(backend));
    ok('badges.revoke chặn Administrator thu hồi badge độc quyền',
      /exclusiveBadge && scope !== 'founder'/.test(backend));
    ok('trao/thu hồi badge Founder đều ghi audit log',
      /logAction\(client, 'badges\.grant'/.test(backend) &&
      /logAction\(client, 'badges\.revoke'/.test(backend) &&
      /exclusive: exclusiveBadge/.test(backend));
    ok('bảo trì chỉ Founder đổi được (server-side)',
      /founderSetting && scope !== 'founder'/.test(backend));
    ok('lưu đủ 5 trường bảo trì chuẩn',
      /maintenance_enabled:/.test(backend) && /maintenance_reason:/.test(backend) &&
      /maintenance_started_at:/.test(backend) && /maintenance_started_by:/.test(backend) &&
      /maintenance_updated_at:/.test(backend));
    ok('thời gian bắt đầu lấy từ cột started_at của database',
      /value\.maintenance_started_at = active\.started_at/.test(backend));
    ok('mã Founder sai trả cùng một thông báo, không lộ chi tiết',
      /Mã Founder không hợp lệ\./.test(auth) && !/Founder Code không đúng/.test(auth));
    ok('Founder bị giới hạn 5 lần / 10 phút và có retryAfter',
      /wanted === 'founder' \? 5 : 8/.test(auth) && /retryAfter: windowSeconds/.test(auth));
  }

  console.log('\n[10] Founder Dashboard — tab Bảo trì');
  {
    const board = read('assets/bakhi/bk-devboard.js');
    ok('có khu Founder Access trong tab Bảo trì', /Founder Access/.test(board) && /session\.check/.test(board));
    ok('hiển thị thời gian bắt đầu do máy chủ ghi', /Thời gian bắt đầu \(máy chủ\)/.test(board));
    ok('xác nhận trước khi tắt bảo trì', /function confirmStop\(\)/.test(board) && /Tắt bảo trì toàn website\?/.test(board));
    ok('Administrator không thấy công tắc bảo trì trong feature flag',
      /isFounder\(\) \|\| row\.key !== 'public\.maintenance'/.test(board));
    ok('có điều hướng sang trang bảo trì và Founder Dashboard',
      /Mở trang bảo trì toàn cục/.test(board) && /Mở Founder Dashboard/.test(board));
  }

  console.log(failures ? `\n=== ${failures} FAILURE(S) ===` : '\n=== ALL CHECKS PASSED ===');
  process.exitCode = failures ? 1 : 0;
})();

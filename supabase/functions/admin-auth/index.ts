// admin-auth — xác thực Administrator Code và cấp phiên quản trị có thời hạn.
//
// Secret cần thiết (Supabase → Edge Functions → Secrets):
//   ADMIN_DEV_CODE      Administrator Code do bạn tự tạo.
//   ADMIN_SESSION_HOURS (tuỳ chọn) thời hạn phiên, mặc định 8.
//
// Administrator Code không bao giờ được trả về, không lưu ở client, không nằm trong repo.
import { json, fail, preflight, readJson, clientIp, safeEqual, sha256Hex } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

function randomToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const { code, scope } = await readJson<{ code?: string; scope?: string }>(req);
    const wanted = scope === 'founder' ? 'founder' : 'admin';
    const client = adminClient();

    // Giới hạn tốc độ theo IP: Founder 5 lần / 10 phút, Administrator 8 lần / 10 phút.
    // Sai quá số lần → khoá tạm thời theo cửa sổ 10 phút (kể cả khi đoán đúng mã trong lúc khoá).
    const attempts = wanted === 'founder' ? 5 : 8;
    const windowSeconds = 600;
    const { data: allowed, error: rlError } = await client.rpc('bakhi_rate_limit', {
        p_key: wanted + '-auth:' + clientIp(req),
        p_limit: attempts,
        p_window_seconds: windowSeconds
    });
    if (rlError) return fail(500, 'RATE_LIMIT_ERROR', 'Không kiểm tra được giới hạn truy cập.');
    if (!allowed) {
        return fail(429, 'TOO_MANY_ATTEMPTS',
            wanted === 'founder'
                ? 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.'
                : 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút.',
            { retryAfter: windowSeconds });
    }

    const submitted = String(code ?? '');
    if (!submitted) {
        return fail(401, wanted === 'founder' ? 'BAD_FOUNDER_CODE' : 'BAD_DEV_CODE',
            wanted === 'founder' ? 'Mã Founder không hợp lệ.' : 'Administrator Code không đúng.');
    }

    if (wanted === 'founder') {
        /* Founder Code chỉ tồn tại dưới dạng băm SHA-256 trong founder_config.
           Không đọc/ghi mã gốc, không đưa mã vào biến môi trường hay repo. */
        const { data: cfg, error: cfgError } = await client
            .from('founder_config')
            .select('code_hash')
            .eq('id', 1)
            .maybeSingle();
        if (cfgError) return fail(500, 'DB_ERROR', 'Không đọc được cấu hình Founder.');
        if (!cfg || !cfg.code_hash) {
            return fail(500, 'NO_FOUNDER_CODE', 'Chưa cấu hình mã Founder trong bảng founder_config.');
        }
        const submittedHash = await sha256Hex(submitted);
        if (!safeEqual(submittedHash, String(cfg.code_hash))) {
            /* Không tiết lộ chi tiết: mọi trường hợp sai đều cùng một thông báo. */
            return fail(401, 'BAD_FOUNDER_CODE', 'Mã Founder không hợp lệ.');
        }
    } else {
        const devCode = Deno.env.get('ADMIN_DEV_CODE') ?? '';
        if (!devCode) {
            return fail(500, 'NO_DEV_CODE', 'Chưa cấu hình ADMIN_DEV_CODE trong Edge Function Secrets.');
        }
        if (!safeEqual(submitted, devCode)) {
            return fail(401, 'BAD_DEV_CODE', 'Administrator Code không đúng.');
        }
    }

    const hours = wanted === 'founder'
        ? Math.min(24, Math.max(1, Number(Deno.env.get('FOUNDER_SESSION_HOURS') ?? 12) || 12))
        : Math.min(24, Math.max(1, Number(Deno.env.get('ADMIN_SESSION_HOURS') ?? 8) || 8));
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    const { error } = await client.from('admin_sessions').insert({
        token_hash: tokenHash,
        scope: wanted,
        expires_at: expiresAt
    });
    if (error) return fail(500, 'SESSION_ERROR', 'Không tạo được phiên quản trị.');

    await client.from('admin_activity_logs').insert({
        action: wanted === 'founder' ? 'founder.login' : 'admin.login',
        target_type: 'session',
        target_id: null,
        detail: { ip: clientIp(req), scope: wanted }
    });

    return json({ ok: true, token, expiresAt, hours, scope: wanted });
});

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

    const { code } = await readJson<{ code?: string }>(req);
    const devCode = Deno.env.get('ADMIN_DEV_CODE') ?? '';

    if (!devCode) {
        return fail(500, 'NO_DEV_CODE', 'Chưa cấu hình ADMIN_DEV_CODE trong Edge Function Secrets.');
    }

    const client = adminClient();

    // Giới hạn tốc độ theo IP: 8 lần / 10 phút.
    const { data: allowed, error: rlError } = await client.rpc('bakhi_rate_limit', {
        p_key: 'admin-auth:' + clientIp(req),
        p_limit: 8,
        p_window_seconds: 600
    });
    if (rlError) return fail(500, 'RATE_LIMIT_ERROR', 'Không kiểm tra được giới hạn truy cập.');
    if (!allowed) return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút.');

    const submitted = String(code ?? '');
    if (!submitted || !safeEqual(submitted, devCode)) {
        return fail(401, 'BAD_DEV_CODE', 'Administrator Code không đúng.');
    }

    const hours = Math.min(24, Math.max(1, Number(Deno.env.get('ADMIN_SESSION_HOURS') ?? 8) || 8));
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    const { error } = await client.from('admin_sessions').insert({
        token_hash: tokenHash,
        expires_at: expiresAt
    });
    if (error) return fail(500, 'SESSION_ERROR', 'Không tạo được phiên quản trị.');

    await client.from('admin_activity_logs').insert({
        action: 'admin.login',
        target_type: 'session',
        target_id: null,
        detail: { ip: clientIp(req) }
    });

    return json({ ok: true, token, expiresAt, hours });
});

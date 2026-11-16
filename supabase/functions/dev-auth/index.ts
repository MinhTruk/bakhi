// dev-auth — xác thực Dev Code và cấp phiên Developer Playground có thời hạn.
//
// Secret cần thiết (Supabase → Edge Functions → Secrets):
//   DEV_PLAYGROUND_CODE  Dev Code riêng cho Developer Playground.
//   DEV_SESSION_HOURS    (tuỳ chọn) thời hạn phiên, mặc định 4, tối đa 12.
//
// Khác với Administrator Code:
//   * Dev Code KHÔNG cấp quyền gọi admin-actions (phiên scope = 'dev').
//   * Mã không bao giờ trả về client; client chỉ nhận token và hạn dùng.
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
    const devCode = Deno.env.get('DEV_PLAYGROUND_CODE') ?? '';

    if (!devCode) {
        return fail(503, 'NO_DEV_PLAYGROUND_CODE',
            'Máy chủ chưa cấu hình DEV_PLAYGROUND_CODE. Dev Playground đang tắt.');
    }

    const client = adminClient();

    // Giới hạn tốc độ theo IP: 10 lần / 10 phút.
    const { data: allowed, error: rlError } = await client.rpc('bakhi_rate_limit', {
        p_key: 'dev-auth:' + clientIp(req),
        p_limit: 10,
        p_window_seconds: 600
    });
    if (rlError) return fail(500, 'RATE_LIMIT_ERROR', 'Không kiểm tra được giới hạn truy cập.');
    if (!allowed) return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút.');

    const submitted = String(code ?? '');
    if (!submitted || !safeEqual(submitted, devCode)) {
        return fail(401, 'BAD_DEV_CODE', 'Dev Code không đúng.');
    }

    const hours = Math.min(12, Math.max(1, Number(Deno.env.get('DEV_SESSION_HOURS') ?? 4) || 4));
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    const { error } = await client.from('dev_sessions').insert({
        token_hash: tokenHash,
        expires_at: expiresAt
    });
    if (error) return fail(500, 'SESSION_ERROR', 'Không tạo được phiên Developer.');

    await client.from('admin_activity_logs').insert({
        action: 'dev.login',
        target_type: 'session',
        target_id: null,
        detail: { ip: clientIp(req) }
    });

    return json({ ok: true, token, expiresAt, hours, scope: 'dev' });
});

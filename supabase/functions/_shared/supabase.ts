// Kết nối Supabase phía server. service_role key chỉ tồn tại trong
// Edge Function Secrets, không bao giờ trả về trình duyệt.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { fail, sha256Hex } from './http.ts';

export function adminClient(): SupabaseClient {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Secrets.');
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

/**
 * Xác thực phiên thiết bị (Anonymous Auth) từ header Authorization.
 * Trả về auth user id hoặc Response lỗi 401.
 */
export async function callerUserId(req: Request): Promise<{ userId: string } | Response> {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) return fail(401, 'NO_SESSION', 'Thiếu phiên đăng nhập ẩn danh.');
    const client = adminClient();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return fail(401, 'BAD_SESSION', 'Phiên không hợp lệ hoặc đã hết hạn.');
    return { userId: data.user.id };
}

/** Xác thực Dev session token (do admin-auth phát hành). */
export async function requireAdmin(req: Request, client: SupabaseClient) {
    const token = (req.headers.get('x-admin-token') ?? '').trim();
    if (!token || token.length < 20) return { error: fail(401, 'NO_DEV_SESSION', 'Thiếu phiên quản trị.') };
    const hash = await sha256Hex(token);
    const { data, error } = await client
        .from('admin_sessions')
        .select('id, expires_at')
        .eq('token_hash', hash)
        .maybeSingle();
    if (error) return { error: fail(500, 'DB_ERROR', 'Không kiểm tra được phiên quản trị.') };
    if (!data) return { error: fail(401, 'BAD_DEV_SESSION', 'Phiên quản trị không hợp lệ.') };
    if (new Date(data.expires_at).getTime() < Date.now()) {
        return { error: fail(401, 'EXPIRED_DEV_SESSION', 'Phiên quản trị đã hết hạn. Vui lòng nhập lại Dev Code.') };
    }
    await client.from('admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return { sessionId: data.id as string };
}

export async function logAction(
    client: SupabaseClient,
    action: string,
    targetType: string | null,
    targetId: string | null,
    detail: Record<string, unknown> = {}
): Promise<void> {
    await client.from('admin_activity_logs').insert({
        action,
        target_type: targetType,
        target_id: targetId,
        detail
    });
}

// Tiện ích HTTP dùng chung cho các Edge Function của Bá Khí.

export const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
    return json({ ok: false, error: { code, message, ...extra } }, status);
}

export function preflight(req: Request): Response | null {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Chỉ chấp nhận POST.');
    return null;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
    try {
        const data = await req.json();
        return (data && typeof data === 'object' ? data : {}) as T;
    } catch {
        return {} as T;
    }
}

export function clientIp(req: Request): string {
    const fwd = req.headers.get('x-forwarded-for') || '';
    return (fwd.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

export async function sha256Hex(value: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** So sánh chuỗi theo thời gian hằng để hạn chế timing attack. */
export function safeEqual(a: string, b: string): boolean {
    const x = new TextEncoder().encode(String(a ?? ''));
    const y = new TextEncoder().encode(String(b ?? ''));
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}

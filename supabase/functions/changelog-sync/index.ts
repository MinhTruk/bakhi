// ============================================================================
// changelog-sync — nhận payload từ GitHub Actions và phát hành changelog.
//
// Bảo mật:
//   - Bắt buộc header `x-changelog-token` khớp secret CHANGELOG_SYNC_TOKEN.
//   - Không nhận service_role key từ client; function tự dùng secret của
//     Supabase (SUPABASE_SERVICE_ROLE_KEY) và gọi RPC
//     `bakhi_publish_changelog` — cùng logic với Admin Dashboard.
//   - verify_jwt = false vì GitHub Actions không có JWT Supabase; token riêng
//     thay thế và được so sánh theo thời gian hằng.
//
// Idempotency:
//   - RPC dùng advisory lock + unique index announcements.changelog_version.
//   - Chạy lại cùng payload chỉ cập nhật bản ghi, không tạo thông báo trùng.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-changelog-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const CATEGORIES = [
    'features', 'improvements', 'fixes', 'ui',
    'performance', 'security', 'notice', 'other'
];

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function fail(status: number, code: string, message: string): Response {
    return json({ ok: false, error: { code, message } }, status);
}

function safeEqual(a: string, b: string): boolean {
    const x = new TextEncoder().encode(String(a ?? ''));
    const y = new TextEncoder().encode(String(b ?? ''));
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}

function str(value: unknown, max: number): string {
    return String(value ?? '').trim().slice(0, max);
}

function versionCmp(a: string, b: string): number {
    const pa = String(a || '').split(/[.+-]/);
    const pb = String(b || '').split(/[.+-]/);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] ?? '0';
        const y = pb[i] ?? '0';
        const nx = /^\d+$/.test(x) ? Number(x) : null;
        const ny = /^\d+$/.test(y) ? Number(y) : null;
        if (nx !== null && ny !== null) {
            if (nx !== ny) return nx > ny ? 1 : -1;
        } else if (x !== y) {
            return x > y ? 1 : -1;
        }
    }
    return 0;
}

async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Section {
    category: string;
    items: string[];
}

interface Entry {
    version: string;
    date: string;
    published_at: string;
    title: string;
    summary: string;
    category: string;
    sections: Section[];
    content_hash: string;
}

function normalizeSections(raw: unknown): Section[] {
    const list = Array.isArray(raw) ? raw.slice(0, 20) : [];
    return list.map((section) => {
        const s = (section ?? {}) as Record<string, unknown>;
        const items = Array.isArray(s.items) ? s.items.slice(0, 60) : [];
        return {
            category: CATEGORIES.includes(String(s.category)) ? String(s.category) : 'other',
            items: items.map((i) => str(i, 1200)).filter(Boolean)
        };
    }).filter((s) => s.items.length > 0);
}

function validateEntry(raw: unknown, index: number): { entry?: Entry; error?: string } {
    const e = (raw ?? {}) as Record<string, unknown>;
    const version = str(e.version, 32);
    if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(version)) {
        return { error: `entries[${index}]: version không hợp lệ` };
    }
    const date = str(e.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00+07:00').getTime())) {
        return { error: `entries[${index}]: ngày không hợp lệ (${date})` };
    }
    const title = str(e.title, 160);
    if (!title) return { error: `entries[${index}]: thiếu title` };

    const sections = normalizeSections(e.sections);
    if (!sections.length) return { error: `entries[${index}]: không có nội dung thay đổi` };

    const category = CATEGORIES.includes(String(e.category)) ? String(e.category) : 'other';
    const summary = str(e.summary, 400);
    const published_at = `${date}T00:00:00.000+07:00`;
    const content_hash = /^[a-f0-9]{64}$/i.test(String(e.content_hash || ''))
        ? String(e.content_hash).toLowerCase()
        : '';

    return {
        entry: { version, date, published_at, title, summary, category, sections, content_hash }
    };
}

/* 7.0.1 — Chuẩn hoá mốc ngày cũ về nửa đêm giờ Việt Nam.
 *
 * Trước 7.0.1, changelog lưu published_at = YYYY-MM-DDT00:00:00Z. Khi hiển thị
 * theo Asia/Ho_Chi_Minh, mốc đó thành 07:00 cùng ngày. RPC chỉ gán published_at
 * lúc tạo mới nên các bản ghi đã có không tự sửa. Đồng bộ lại CHANGELOG.md sẽ
 * dịch đúng những dòng còn ở mốc 00:00Z sang 00:00+07:00 — không đụng mốc đăng
 * tay có giờ cụ thể.
 */
async function normalizeLegacyDate(
    client: ReturnType<typeof createClient>,
    entry: Entry
): Promise<boolean> {
    const legacy = `${entry.date}T00:00:00+00:00`;
    const fixed = `${entry.date}T00:00:00.000+07:00`;
    let changed = false;

    const changelog = await client
        .from('changelog')
        .update({ published_at: fixed })
        .eq('version', entry.version)
        .eq('published_at', legacy)
        .select('id');
    if (!changelog.error && Array.isArray(changelog.data) && changelog.data.length) changed = true;

    const announcements = await client
        .from('announcements')
        .update({ published_at: fixed })
        .eq('changelog_version', entry.version)
        .eq('published_at', legacy)
        .select('id');
    if (!announcements.error && Array.isArray(announcements.data) && announcements.data.length) {
        changed = true;
    }

    return changed;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Chỉ chấp nhận POST.');

    const expected = (Deno.env.get('CHANGELOG_SYNC_TOKEN') ?? '').trim();
    if (!expected) {
        return fail(500, 'SYNC_NOT_CONFIGURED',
            'CHANGELOG_SYNC_TOKEN chưa được đặt trong Supabase Edge Function Secrets.');
    }
    const provided = (req.headers.get('x-changelog-token') ?? '').trim();
    if (!provided || !safeEqual(provided, expected)) {
        return fail(401, 'BAD_SYNC_TOKEN', 'Token đồng bộ không hợp lệ.');
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return fail(400, 'BAD_JSON', 'Body phải là JSON hợp lệ.');
    }

    const rawEntries = Array.isArray(body.entries) ? body.entries.slice(0, 100) : [];
    if (!rawEntries.length) return fail(400, 'NO_ENTRIES', 'Payload không có phiên bản nào.');
    if (rawEntries.length > 100) return fail(400, 'TOO_MANY_ENTRIES', 'Tối đa 100 phiên bản mỗi lần.');

    const parsed: Entry[] = [];
    const errors: Array<{ version: string; message: string }> = [];
    rawEntries.forEach((raw, index) => {
        const result = validateEntry(raw, index);
        if (result.error) errors.push({ version: str((raw as Record<string, unknown>)?.version, 32), message: result.error });
        else parsed.push(result.entry as Entry);
    });

    if (errors.length) {
        return json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Payload không hợp lệ.' }, errors }, 400);
    }

    /* Sắp xếp mới nhất trước để chỉ phiên bản cao nhất mới phát thông báo. */
    parsed.sort((a, b) => versionCmp(b.version, a.version));

    if (body.dry_run === true) {
        return json({
            ok: true,
            dryRun: true,
            received: parsed.length,
            entries: parsed.map((e) => ({
                version: e.version, title: e.title,
                sections: e.sections.length,
                items: e.sections.reduce((n, s) => n + s.items.length, 0),
                content_hash: e.content_hash || null
            }))
        });
    }

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !key) {
        return fail(500, 'SERVER_NOT_CONFIGURED',
            'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Edge Function Secrets.');
    }
    const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const results: Array<Record<string, unknown>> = [];
    let announcements = 0;
    let created = 0;

    for (const entry of parsed) {
        const hash = entry.content_hash ||
            await sha256Hex(JSON.stringify({ version: entry.version, date: entry.date, sections: entry.sections }));

        const { data, error } = await client.rpc('bakhi_publish_changelog', {
            p_version: entry.version,
            p_title: entry.title,
            p_summary: entry.summary || null,
            p_content: entry.sections,
            p_category: entry.category,
            p_source: 'github',
            p_content_hash: hash,
            p_published_at: entry.published_at
        });

        if (error) {
            errors.push({ version: entry.version, message: error.message });
            await client.rpc('bakhi_mark_changelog_sync_failed', {
                p_version: entry.version,
                p_error: error.message
            }).catch(() => undefined);
            continue;
        }

        const result = (data ?? {}) as Record<string, unknown>;
        if (result.created) created += 1;
        if (result.announcement_created) announcements += 1;
        const normalized = await normalizeLegacyDate(client, entry);
        results.push({
            version: entry.version,
            created: !!result.created,
            updated: !!result.updated,
            announcement_created: !!result.announcement_created,
            announcement_id: result.announcement_id ?? null,
            published_at: result.published_at ?? null,
            normalized_date: normalized
        });
    }

    const ok = errors.length === 0;
    return json({
        ok,
        source: 'github',
        commit: str(body.commit, 80) || null,
        received: parsed.length,
        published: results.length,
        created,
        announcements,
        results,
        errors
    }, ok ? 200 : 207);
});

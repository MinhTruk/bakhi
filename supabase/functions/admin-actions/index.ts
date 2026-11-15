// admin-actions — mọi thao tác quản trị (đọc/ghi/xoá/xuất bản).
//
// Bắt buộc header: x-admin-token (lấy từ admin-auth).
// Không có thao tác nào tin dữ liệu phân quyền do client gửi.
//
// Tệp này tự chứa (self-contained) để Management API chỉ cần upload một tệp
// index.ts. Các hàm dưới đây giữ nguyên hành vi của supabase/functions/_shared.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
    return json({ ok: false, error: { code, message, ...extra } }, status);
}

function preflight(req: Request): Response | null {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Chỉ chấp nhận POST.');
    return null;
}

async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
    try {
        const data = await req.json();
        return (data && typeof data === 'object' ? data : {}) as T;
    } catch {
        return {} as T;
    }
}

async function sha256Hex(value: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* So sánh phiên bản theo từng đoạn số, giống RPC bakhi_version_cmp.
   Dùng để "phiên bản mới nhất" không phụ thuộc giờ published_at. */
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

function latestByVersion<T extends { version: string }>(rows: T[] | null | undefined): T | null {
    if (!rows || !rows.length) return null;
    return rows.slice().sort((a, b) => versionCmp(b.version, a.version))[0];
}

function adminClient(): SupabaseClient {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Secrets.');
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

async function requireAdmin(req: Request, client: SupabaseClient) {
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
        return { error: fail(401, 'EXPIRED_DEV_SESSION', 'Phiên quản trị đã hết hạn. Vui lòng nhập lại Administrator Code.') };
    }
    await client.from('admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return { sessionId: data.id as string };
}

async function logAction(
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

function normalizeName(input: unknown): string {
    return String(input ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanDisplayName(input: unknown): string {
    return String(input ?? '').replace(/\s+/g, ' ').trim();
}

const ANNOUNCEMENT_TYPES = ['general', 'announcement', 'update', 'important', 'maintenance'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const CATEGORIES = ['features', 'improvements', 'fixes', 'ui', 'performance', 'security', 'notice', 'other'];

function str(v: unknown, max: number): string {
    return String(v ?? '').trim().slice(0, max);
}
function oneOf(v: unknown, allowed: string[], fallback: string): string {
    const s = String(v ?? '').trim();
    return allowed.includes(s) ? s : fallback;
}

/** Chuẩn hoá nội dung changelog: [{ category, items: [...] }] */
function parseSections(raw: unknown) {
    const list = Array.isArray(raw) ? raw : [];
    return list.slice(0, 20).map((section) => {
        const s = (section ?? {}) as Record<string, unknown>;
        const items = Array.isArray(s.items) ? s.items : [];
        return {
            category: oneOf(s.category, CATEGORIES, 'other'),
            items: items.map((i) => str(i, 400)).filter(Boolean).slice(0, 60)
        };
    }).filter((s) => s.items.length > 0);
}

function csvCell(value: unknown): string {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRows(rows: unknown[][]): string {
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function validIsoDate(value: unknown): string | null {
    const s = str(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const client = adminClient();
    const auth = await requireAdmin(req, client);
    if ('error' in auth) return auth.error;

    const body = await readJson<Record<string, unknown>>(req);
    const action = str(body.action, 60);

    try {
        switch (action) {
            /* ------------------------------ Tổng quan ------------------------------ */
            case 'overview': {
                const [stu, active, ann, annPub, cl, logs] = await Promise.all([
                    client.from('students').select('*', { count: 'exact', head: true }),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
                    client.from('announcements').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
                    client.from('changelog').select('*', { count: 'exact', head: true }),
                    client.from('admin_activity_logs').select('*', { count: 'exact', head: true })
                ]);
                const { data: latestRows } = await client
                    .from('changelog')
                    .select('version, title, published_at, created_at')
                    .limit(500);
                const latest = latestByVersion(latestRows);
                const { data: recent } = await client
                    .from('admin_activity_logs')
                    .select('id, action, target_type, target_id, created_at')
                    .order('created_at', { ascending: false })
                    .limit(10);
                const { data: review } = await client
                    .from('students')
                    .select('id, display_name, disambiguator')
                    .eq('needs_review', true)
                    .limit(20);
                return json({
                    ok: true,
                    counts: {
                        students: stu.count ?? 0,
                        studentsActive: active.count ?? 0,
                        announcements: ann.count ?? 0,
                        announcementsPublished: annPub.count ?? 0,
                        changelog: cl.count ?? 0,
                        activity: logs.count ?? 0
                    },
                    latestVersion: latest ?? null,
                    recentActivity: recent ?? [],
                    needsReview: review ?? []
                });
            }

            /* ------------------------------- Học sinh ------------------------------ */
            case 'students.list': {
                const q = normalizeName(body.q);
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const offset = Math.max(0, Number(body.offset) || 0);
                let query = client.from('students')
                    .select('id, display_name, student_code, disambiguator, is_active, needs_review, created_at, updated_at',
                        { count: 'exact' })
                    .order('display_name', { ascending: true })
                    .range(offset, offset + limit - 1);
                if (q) query = query.ilike('normalized_name', `%${q}%`);
                if (body.status === 'active') query = query.eq('is_active', true);
                if (body.status === 'inactive') query = query.eq('is_active', false);
                if (body.review_only === true) query = query.eq('needs_review', true);
                const { data, error, count } = await query;
                if (error) throw error;
                const ids = (data ?? []).map((s) => s.id);
                const sync: Record<string, string> = {};
                if (ids.length) {
                    const { data: progress } = await client
                        .from('student_progress')
                        .select('student_id, updated_at')
                        .in('student_id', ids);
                    for (const row of progress ?? []) {
                        const prev = sync[row.student_id];
                        if (!prev || row.updated_at > prev) sync[row.student_id] = row.updated_at;
                    }
                }
                return json({
                    ok: true,
                    total: count ?? (data ?? []).length,
                    offset,
                    students: (data ?? []).map((s) => ({ ...s, last_sync_at: sync[s.id] ?? null }))
                });
            }

            case 'students.detail': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: student, error } = await client.from('students')
                    .select('id, display_name, normalized_name, student_code, disambiguator, is_active, needs_review, created_at, updated_at')
                    .eq('id', id).maybeSingle();
                if (error) throw error;
                if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                const [devices, progress, reads] = await Promise.all([
                    client.from('student_devices')
                        .select('id, created_at, last_seen_at')
                        .eq('student_id', id)
                        .order('last_seen_at', { ascending: false })
                        .limit(20),
                    client.from('student_progress')
                        .select('progress_key, progress_data, updated_at')
                        .eq('student_id', id)
                        .order('updated_at', { ascending: false }),
                    client.from('announcement_reads')
                        .select('id, announcement_id, read_at')
                        .eq('student_id', id)
                        .order('read_at', { ascending: false })
                        .limit(100)
                ]);
                const progressRows = (progress.data ?? []).map((row) => ({
                    progress_key: row.progress_key,
                    updated_at: row.updated_at,
                    bytes: (() => {
                        try { return new TextEncoder().encode(JSON.stringify(row.progress_data ?? {})).length; }
                        catch { return 0; }
                    })()
                }));
                return json({
                    ok: true,
                    student,
                    devices: devices.data ?? [],
                    progress: progressRows,
                    reads: reads.data ?? [],
                    totals: {
                        devices: (devices.data ?? []).length,
                        progressKeys: progressRows.length,
                        progressBytes: progressRows.reduce((n, p) => n + p.bytes, 0),
                        reads: (reads.data ?? []).length
                    }
                });
            }

            case 'students.export': {
                const pageSize = 1000;
                const rows: unknown[][] = [['Mã học sinh', 'Họ tên', 'Phân biệt', 'Hoạt động', 'Cần xem lại', 'Ngày tạo', 'Cập nhật cuối']];
                let from = 0;
                let total = 0;
                for (let page = 0; page < 5; page++) {
                    const { data, error } = await client.from('students')
                        .select('student_code, display_name, disambiguator, is_active, needs_review, created_at, updated_at')
                        .order('display_name', { ascending: true })
                        .range(from, from + pageSize - 1);
                    if (error) throw error;
                    const list = data ?? [];
                    total += list.length;
                    for (const s of list) {
                        rows.push([
                            s.student_code, s.display_name, s.disambiguator ?? '',
                            s.is_active ? 'Có' : 'Không', s.needs_review ? 'Có' : 'Không',
                            s.created_at, s.updated_at
                        ]);
                    }
                    if (list.length < pageSize) break;
                    from += pageSize;
                }
                await logAction(client, 'students.export', 'student', null, { rows: total });
                return json({
                    ok: true,
                    filename: 'bakhi-students-' + new Date().toISOString().slice(0, 10) + '.csv',
                    rows: total,
                    csv: csvRows(rows)
                });
            }

            case 'students.update': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const patch: Record<string, unknown> = {};
                if (body.display_name !== undefined) {
                    const display = cleanDisplayName(body.display_name).slice(0, 120);
                    if (!display) return fail(400, 'BAD_NAME', 'Họ tên không hợp lệ.');
                    patch.display_name = display;
                    patch.normalized_name = normalizeName(display);
                }
                if (body.disambiguator !== undefined) {
                    const d = cleanDisplayName(body.disambiguator).slice(0, 60);
                    patch.disambiguator = d || null;
                    if (d) patch.needs_review = false;
                }
                if (body.is_active !== undefined) patch.is_active = !!body.is_active;
                if (!Object.keys(patch).length) return fail(400, 'NOTHING_TO_UPDATE', 'Không có thay đổi.');
                const { data, error } = await client.from('students').update(patch).eq('id', id).select().maybeSingle();
                if (error) {
                    if ((error as { code?: string }).code === '23505') {
                        return fail(409, 'DUPLICATE_NAME', 'Đã có học sinh khác trùng họ tên. Hãy nhập thông tin phân biệt.');
                    }
                    throw error;
                }
                await logAction(client, 'students.update', 'student', id, patch);
                return json({ ok: true, student: data });
            }

            /* ------------------------------ Thông báo ------------------------------ */
            case 'announcements.list': {
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const offset = Math.max(0, Number(body.offset) || 0);
                let query = client.from('announcements').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                if (body.q) query = query.ilike('title', `%${str(body.q, 120)}%`);
                if (ANNOUNCEMENT_TYPES.includes(String(body.type))) query = query.eq('type', String(body.type));
                if (body.status === 'published') query = query.eq('is_published', true);
                if (body.status === 'draft') query = query.eq('is_published', false);
                const { data, error, count } = await query;
                if (error) throw error;
                return json({ ok: true, total: count ?? (data ?? []).length, offset, announcements: data ?? [] });
            }

            case 'announcements.stats': {
                const [all, published, draft, reads, linked, recent] = await Promise.all([
                    client.from('announcements').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', false),
                    client.from('announcement_reads').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).not('changelog_version', 'is', null),
                    client.from('announcements').select('id, title, type, priority, is_published, published_at, changelog_version')
                        .order('published_at', { ascending: false, nullsFirst: false }).limit(5)
                ]);
                const byType: Record<string, number> = {};
                const { data: typeRows } = await client.from('announcements').select('type').limit(1000);
                for (const row of typeRows ?? []) byType[row.type] = (byType[row.type] ?? 0) + 1;
                return json({
                    ok: true,
                    stats: {
                        total: all.count ?? 0,
                        published: published.count ?? 0,
                        draft: draft.count ?? 0,
                        reads: reads.count ?? 0,
                        linkedToChangelog: linked.count ?? 0,
                        byType
                    },
                    recent: recent.data ?? []
                });
            }

            case 'announcements.save': {
                const id = str(body.id, 40);
                const title = str(body.title, 160);
                const content = str(body.content, 20000);
                if (!title) return fail(400, 'MISSING_TITLE', 'Cần nhập tiêu đề.');
                if (!content) return fail(400, 'MISSING_CONTENT', 'Cần nhập nội dung.');
                const row = {
                    title,
                    content,
                    type: oneOf(body.type, ANNOUNCEMENT_TYPES, 'general'),
                    priority: oneOf(body.priority, PRIORITIES, 'normal'),
                    is_published: !!body.is_published
                };
                if (row.is_published) (row as Record<string, unknown>).published_at = new Date().toISOString();
                let result;
                if (id) {
                    result = await client.from('announcements').update(row).eq('id', id).select().maybeSingle();
                } else {
                    result = await client.from('announcements').insert(row).select().maybeSingle();
                }
                if (result.error) throw result.error;
                await logAction(client, row.is_published ? 'announcements.publish' : 'announcements.save',
                    'announcement', result.data?.id ?? null, { title: row.title, priority: row.priority });
                return json({ ok: true, announcement: result.data });
            }

            case 'announcements.publish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id thông báo.');
                const { data, error } = await client.from('announcements')
                    .update({ is_published: true, published_at: new Date().toISOString() })
                    .eq('id', id).select().maybeSingle();
                if (error) throw error;
                if (!data) return fail(404, 'NOT_FOUND', 'Không tìm thấy thông báo.');
                await logAction(client, 'announcements.publish', 'announcement', id, { title: data.title });
                return json({ ok: true, announcement: data });
            }

            case 'announcements.unpublish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id thông báo.');
                const { data, error } = await client.from('announcements')
                    .update({ is_published: false }).eq('id', id).select().maybeSingle();
                if (error) throw error;
                await logAction(client, 'announcements.unpublish', 'announcement', id, {});
                return json({ ok: true, announcement: data });
            }

            case 'announcements.delete': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id thông báo.');
                const { error } = await client.from('announcements').delete().eq('id', id);
                if (error) throw error;
                await logAction(client, 'announcements.delete', 'announcement', id, {});
                return json({ ok: true });
            }

            /* ------------------------------- Changelog ----------------------------- */
            case 'changelog.list': {
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const offset = Math.max(0, Number(body.offset) || 0);
                let query = client.from('changelog').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                const q = str(body.q, 60).replace(/[%,()"'\\]/g, '');
                if (q) query = query.or(`version.ilike.%${q}%,title.ilike.%${q}%`);
                if (CATEGORIES.includes(String(body.category))) query = query.eq('category', String(body.category));
                if (body.status === 'published') query = query.eq('is_published', true);
                if (body.status === 'draft') query = query.eq('is_published', false);
                if (body.source === 'admin' || body.source === 'github') query = query.eq('source', String(body.source));
                if (['draft', 'published', 'failed'].includes(String(body.sync_state))) {
                    query = query.eq('sync_state', String(body.sync_state));
                }
                const { data, error, count } = await query;
                if (error) throw error;
                return json({ ok: true, total: count ?? (data ?? []).length, offset, changelog: data ?? [] });
            }

            case 'changelog.save': {
                const id = str(body.id, 40);
                const version = str(body.version, 32);
                const title = str(body.title, 160);
                if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(version)) {
                    return fail(400, 'BAD_VERSION', 'Phiên bản chỉ gồm chữ, số và . + _ - (tối đa 32 ký tự).');
                }
                if (!title) return fail(400, 'MISSING_TITLE', 'Cần nhập tiêu đề.');
                const sections = parseSections(body.content);
                if (!sections.length) return fail(400, 'EMPTY_CONTENT', 'Cần ít nhất một mục thay đổi.');
                const summary = str(body.summary, 400) || null;
                const category = oneOf(body.category, CATEGORIES, 'other');
                const isPublished = !!body.is_published;

                const { data: existing } = await client.from('changelog')
                    .select('id').eq('version', version).maybeSingle();
                if (existing && existing.id !== id) {
                    return fail(409, 'DUPLICATE_VERSION', `Phiên bản ${version} đã tồn tại.`);
                }

                if (!isPublished) {
                    const row = {
                        version, title, summary, content: sections, category,
                        is_published: false, sync_state: 'draft', sync_error: null
                    };
                    const result = id
                        ? await client.from('changelog').update(row).eq('id', id).select().maybeSingle()
                        : await client.from('changelog').insert(row).select().maybeSingle();
                    if (result.error) throw result.error;
                    await logAction(client, 'changelog.save', 'changelog', result.data?.id ?? null, { version });
                    return json({ ok: true, entry: result.data, announcement_created: false });
                }

                /* Xuất bản qua RPC dùng chung với GitHub Actions: chỉ phiên bản
                   mới nhất mới sinh thông báo, chỉnh sửa không gửi lại. */
                const { data: published, error: publishError } = await client.rpc('bakhi_publish_changelog', {
                    p_version: version,
                    p_title: title,
                    p_summary: summary,
                    p_content: sections,
                    p_category: category,
                    p_source: 'admin',
                    p_content_hash: null,
                    p_published_at: new Date().toISOString()
                });
                if (publishError) {
                    if ((publishError as { code?: string }).code === '23505') {
                        return fail(409, 'DUPLICATE_VERSION', `Phiên bản ${version} đã tồn tại.`);
                    }
                    throw publishError;
                }
                const { data: entry } = await client.from('changelog')
                    .select('*').eq('version', version).maybeSingle();
                await logAction(client, 'changelog.publish', 'changelog', entry?.id ?? null, {
                    version, announcement_created: !!published?.announcement_created
                });
                return json({ ok: true, entry, publish: published });
            }

            case 'changelog.publish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { data: entry, error: findError } = await client.from('changelog')
                    .select('id, version, title, summary, content, category')
                    .eq('id', id).maybeSingle();
                if (findError) throw findError;
                if (!entry) return fail(404, 'NOT_FOUND', 'Không tìm thấy changelog.');
                const { data: published, error } = await client.rpc('bakhi_publish_changelog', {
                    p_version: entry.version,
                    p_title: entry.title,
                    p_summary: entry.summary,
                    p_content: entry.content,
                    p_category: entry.category,
                    p_source: 'admin',
                    p_content_hash: null,
                    p_published_at: new Date().toISOString()
                });
                if (error) throw error;
                const { data: fresh } = await client.from('changelog').select('*').eq('id', id).maybeSingle();
                await logAction(client, 'changelog.publish', 'changelog', id, {
                    version: entry.version, announcement_created: !!published?.announcement_created
                });
                return json({ ok: true, entry: fresh, publish: published });
            }

            case 'changelog.unpublish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { data, error } = await client.from('changelog')
                    .update({ is_published: false, sync_state: 'draft' })
                    .eq('id', id).select().maybeSingle();
                if (error) throw error;
                await logAction(client, 'changelog.unpublish', 'changelog', id, {});
                return json({ ok: true, entry: data });
            }

            case 'changelog.delete': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { error } = await client.from('changelog').delete().eq('id', id);
                if (error) throw error;
                await logAction(client, 'changelog.delete', 'changelog', id, {});
                return json({ ok: true });
            }

            /* ------------------------------ Nhật ký -------------------------------- */
            case 'logs.list': {
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 60));
                const offset = Math.max(0, Number(body.offset) || 0);
                const q = str(body.q, 120).replace(/[%,()"'\\]/g, '');
                const target = str(body.target, 40);
                const from = validIsoDate(body.from);
                const to = validIsoDate(body.to);
                let query = client.from('admin_activity_logs')
                    .select('id, action, target_type, target_id, detail, created_at', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                if (q) query = query.or(`action.ilike.%${q}%,target_type.ilike.%${q}%,target_id.ilike.%${q}%`);
                if (target) query = query.eq('target_type', target);
                if (from) query = query.gte('created_at', from + 'T00:00:00.000Z');
                if (to) query = query.lte('created_at', to + 'T23:59:59.999Z');
                const { data, error, count } = await query;
                if (error) throw error;
                return json({ ok: true, total: count ?? (data ?? []).length, offset, logs: data ?? [] });
            }

            case 'logs.export': {
                const q = str(body.q, 120).replace(/[%,()"'\\]/g, '');
                const target = str(body.target, 40);
                const from = validIsoDate(body.from);
                const to = validIsoDate(body.to);
                const rows: unknown[][] = [['Thời gian', 'Hành động', 'Đối tượng', 'ID đối tượng', 'Chi tiết']];
                const pageSize = 1000;
                let offset = 0;
                let total = 0;
                for (let page = 0; page < 5; page++) {
                    let query = client.from('admin_activity_logs')
                        .select('action, target_type, target_id, detail, created_at')
                        .order('created_at', { ascending: false })
                        .range(offset, offset + pageSize - 1);
                    if (q) query = query.or(`action.ilike.%${q}%,target_type.ilike.%${q}%,target_id.ilike.%${q}%`);
                    if (target) query = query.eq('target_type', target);
                    if (from) query = query.gte('created_at', from + 'T00:00:00.000Z');
                    if (to) query = query.lte('created_at', to + 'T23:59:59.999Z');
                    const { data, error } = await query;
                    if (error) throw error;
                    const list = data ?? [];
                    total += list.length;
                    for (const row of list) {
                        rows.push([row.created_at, row.action, row.target_type ?? '', row.target_id ?? '',
                            JSON.stringify(row.detail ?? {})]);
                    }
                    if (list.length < pageSize) break;
                    offset += pageSize;
                }
                await logAction(client, 'logs.export', 'session', null, { rows: total });
                return json({
                    ok: true,
                    filename: 'bakhi-activity-' + new Date().toISOString().slice(0, 10) + '.csv',
                    rows: total,
                    csv: csvRows(rows)
                });
            }

            /* ------------------------------- Cài đặt ------------------------------- */
            case 'settings.status': {
                const { count } = await client.from('students').select('*', { count: 'exact', head: true });
                return json({
                    ok: true,
                    status: {
                        adminDevCode: !!Deno.env.get('ADMIN_DEV_CODE'),
                        serviceRole: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
                        rosterSecret: !!Deno.env.get('STUDENT_ROSTER_SECRET'),
                        students: count ?? 0
                    }
                });
            }

            case 'settings.get': {
                const { data, error } = await client.from('app_settings')
                    .select('key, value, description, updated_at')
                    .order('key', { ascending: true });
                if (error) throw error;
                return json({ ok: true, settings: data ?? [] });
            }

            case 'settings.set': {
                const key = str(body.key, 80);
                const allowed = ['public.whatsnew', 'public.maintenance'];
                if (!allowed.includes(key)) {
                    return fail(400, 'BAD_SETTING_KEY', 'Chỉ được đổi các khoá: ' + allowed.join(', '));
                }
                let value: Record<string, unknown>;
                let description: string;
                if (key === 'public.whatsnew') {
                    value = { enabled: body.enabled !== false };
                    description = 'Hiển thị khối "Cập nhật gần đây" trên trang chủ';
                } else {
                    value = {
                        enabled: body.enabled === true,
                        message: str(body.message, 240)
                    };
                    description = 'Thông báo bảo trì toàn website (hiển thị cho mọi trang)';
                }
                const { data, error } = await client.from('app_settings')
                    .upsert({ key, value, description, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                    .select().maybeSingle();
                if (error) throw error;
                await logAction(client, 'settings.set', 'setting', key, { value });
                return json({ ok: true, setting: data });
            }

            /* ------------------------------ Giám sát ------------------------------- */
            case 'system.health': {
                const started = Date.now();
                const [
                    stu, stuActive, devices, progress, ann, annPub, reads, cl, logs, sessions, settings
                ] = await Promise.all([
                    client.from('students').select('*', { count: 'exact', head: true }),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
                    client.from('student_devices').select('*', { count: 'exact', head: true }),
                    client.from('student_progress').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
                    client.from('announcement_reads').select('*', { count: 'exact', head: true }),
                    client.from('changelog').select('*', { count: 'exact', head: true }),
                    client.from('admin_activity_logs').select('*', { count: 'exact', head: true }),
                    client.from('admin_sessions').select('*', { count: 'exact', head: true })
                        .gt('expires_at', new Date().toISOString()),
                    client.from('app_settings').select('key, value, updated_at').order('key', { ascending: true })
                ]);
                const latencyMs = Date.now() - started;
                const { data: latestRows } = await client.from('changelog')
                    .select('version, title, published_at, sync_state, synced_at, source')
                    .limit(500);
                const latest = latestByVersion(latestRows);
                const { data: failures } = await client.from('changelog')
                    .select('version, title, sync_error, synced_at, source')
                    .eq('sync_state', 'failed')
                    .order('synced_at', { ascending: false })
                    .limit(10);
                const { data: recentLogs } = await client.from('admin_activity_logs')
                    .select('id, action, target_type, target_id, created_at')
                    .order('created_at', { ascending: false }).limit(8);
                const errors = [stu, stuActive, devices, progress, ann, annPub, reads, cl, logs, sessions, settings]
                    .map((r) => r.error).filter(Boolean);
                return json({
                    ok: true,
                    checkedAt: new Date().toISOString(),
                    latencyMs,
                    dbOk: errors.length === 0,
                    counts: {
                        students: stu.count ?? 0,
                        studentsActive: stuActive.count ?? 0,
                        devices: devices.count ?? 0,
                        progressRows: progress.count ?? 0,
                        announcements: ann.count ?? 0,
                        announcementsPublished: annPub.count ?? 0,
                        reads: reads.count ?? 0,
                        changelog: cl.count ?? 0,
                        activity: logs.count ?? 0,
                        adminSessions: sessions.count ?? 0
                    },
                    latestVersion: latest ?? null,
                    syncFailures: failures ?? [],
                    recentActivity: recentLogs ?? [],
                    settings: settings.data ?? [],
                    secrets: {
                        adminDevCode: !!Deno.env.get('ADMIN_DEV_CODE'),
                        serviceRole: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
                        rosterSecret: !!Deno.env.get('STUDENT_ROSTER_SECRET')
                    }
                });
            }

            /* ------------------------------ Quyền hạn ------------------------------- */
            case 'permissions.get': {
                const { data: session } = await client.from('admin_sessions')
                    .select('id, created_at, expires_at, last_used_at')
                    .eq('id', auth.sessionId).maybeSingle();
                return json({
                    ok: true,
                    mode: 'single-admin-code',
                    role: {
                        id: 'administrator',
                        label: 'Administrator',
                        description: 'Một Administrator Code dùng chung; mọi phiên quản trị có cùng quyền.'
                    },
                    session: session ?? null,
                    capabilities: {
                        overview: true,
                        students: true,
                        studentsWrite: true,
                        notifications: true,
                        changelog: true,
                        logs: true,
                        monitoring: true,
                        settings: true,
                        dataExport: true,
                        roles: false
                    },
                    limitations: [
                        'Chưa có mô hình nhiều quản trị viên hoặc phân quyền theo vai trò.',
                        'Không thể cấp/thu quyền riêng cho từng tài khoản khi chưa có danh tính quản trị.'
                    ]
                });
            }

            /* --------------------------- Toàn vẹn dữ liệu -------------------------- */
            case 'data.integrity': {
                const [
                    stu, stuActive, stuReview, inactive, inactiveCount, annMissing, clMissing,
                    annVersionOnly, annEntryOnly, syncFailed, sessionsExpired, settings
                ] = await Promise.all([
                    client.from('students').select('*', { count: 'exact', head: true }),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('needs_review', true),
                    client.from('students').select('id').eq('is_active', false).limit(200),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', false),
                    client.from('announcements').select('*', { count: 'exact', head: true })
                        .eq('is_published', true).is('published_at', null),
                    client.from('changelog').select('*', { count: 'exact', head: true })
                        .eq('is_published', true).is('published_at', null),
                    client.from('announcements').select('*', { count: 'exact', head: true })
                        .not('changelog_version', 'is', null).is('changelog_entry_id', null),
                    client.from('announcements').select('*', { count: 'exact', head: true })
                        .not('changelog_entry_id', 'is', null).is('changelog_version', null),
                    client.from('changelog').select('version, sync_error, synced_at')
                        .eq('sync_state', 'failed').order('synced_at', { ascending: false }).limit(20),
                    client.from('admin_sessions').select('*', { count: 'exact', head: true })
                        .lt('expires_at', new Date().toISOString()),
                    client.from('app_settings').select('key, value, updated_at').order('key', { ascending: true })
                ]);
                const inactiveIds = (inactive.data ?? []).map((s) => s.id);
                let inactiveProgress = 0;
                if (inactiveIds.length) {
                    const { count } = await client.from('student_progress')
                        .select('*', { count: 'exact', head: true }).in('student_id', inactiveIds);
                    inactiveProgress = count ?? 0;
                }
                const checks = [
                    {
                        id: 'students', label: 'Hồ sơ học sinh',
                        status: (stu.count ?? 0) > 0 ? 'ok' : 'warn',
                        count: stu.count ?? 0,
                        detail: `${stuActive.count ?? 0} đang hoạt động · ${stuReview.count ?? 0} cần phân biệt`
                    },
                    {
                        id: 'announcements_published_at', label: 'Thông báo đã đăng thiếu thời điểm',
                        status: (annMissing.count ?? 0) ? 'error' : 'ok', count: annMissing.count ?? 0,
                        detail: 'Mọi thông báo published phải có published_at.'
                    },
                    {
                        id: 'changelog_published_at', label: 'Changelog đã đăng thiếu thời điểm',
                        status: (clMissing.count ?? 0) ? 'error' : 'ok', count: clMissing.count ?? 0,
                        detail: 'Mọi phiên bản published phải có published_at.'
                    },
                    {
                        id: 'announcement_link_version', label: 'Thông báo có version nhưng thiếu liên kết',
                        status: (annVersionOnly.count ?? 0) ? 'warn' : 'ok', count: annVersionOnly.count ?? 0,
                        detail: 'Liên kết changelog_entry_id nên được đặt cùng changelog_version.'
                    },
                    {
                        id: 'announcement_link_entry', label: 'Thông báo có liên kết nhưng thiếu version',
                        status: (annEntryOnly.count ?? 0) ? 'warn' : 'ok', count: annEntryOnly.count ?? 0,
                        detail: 'Liên kết changelog_version nên được đặt cùng changelog_entry_id.'
                    },
                    {
                        id: 'changelog_sync', label: 'Lỗi đồng bộ changelog từ GitHub',
                        status: (syncFailed.data ?? []).length ? 'error' : 'ok',
                        count: (syncFailed.data ?? []).length,
                        detail: (syncFailed.data ?? []).map((r) => r.version + ': ' + (r.sync_error || 'không rõ')).join(' · ') || 'Không có lỗi.'
                    },
                    {
                        id: 'inactive_progress', label: 'Tiến trình của hồ sơ đã ngưng',
                        status: inactiveProgress ? 'warn' : 'ok', count: inactiveProgress,
                        detail: 'Dữ liệu vẫn được giữ; chỉ nên xem lại khi hồ sơ bị ngưng nhầm.'
                    },
                    {
                        id: 'expired_sessions', label: 'Phiên quản trị đã hết hạn',
                        status: (sessionsExpired.count ?? 0) ? 'warn' : 'ok', count: sessionsExpired.count ?? 0,
                        detail: 'Có thể dọn định kỳ; dashboard không tự xoá dữ liệu.'
                    }
                ];
                return json({
                    ok: true,
                    checkedAt: new Date().toISOString(),
                    totals: {
                        students: stu.count ?? 0,
                        inactiveStudents: inactiveCount.count ?? 0,
                        settings: (settings.data ?? []).length
                    },
                    settings: settings.data ?? [],
                    checks,
                    issues: checks.filter((c) => c.status !== 'ok').length
                });
            }

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Hành động không hợp lệ: ' + action);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return fail(500, 'SERVER_ERROR', 'Lỗi máy chủ: ' + message);
    }
});

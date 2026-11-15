// admin-actions — mọi thao tác quản trị (đọc/ghi/xoá/xuất bản).
//
// Bắt buộc header: x-admin-token (lấy từ admin-auth).
// Không có thao tác nào tin dữ liệu phân quyền do client gửi.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, requireAdmin, logAction } from '../_shared/supabase.ts';
import { cleanDisplayName, normalizeName } from '../_shared/names.ts';

const ANNOUNCEMENT_TYPES = ['general', 'announcement', 'update', 'important', 'maintenance'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const CATEGORIES = ['features', 'improvements', 'fixes', 'ui', 'performance', 'other'];

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
                const { data: latest } = await client
                    .from('changelog')
                    .select('version, title, published_at, created_at')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
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
                let query = client.from('students')
                    .select('id, display_name, student_code, disambiguator, is_active, needs_review, created_at, updated_at')
                    .order('display_name', { ascending: true })
                    .limit(limit);
                if (q) query = query.ilike('normalized_name', `%${q}%`);
                if (body.status === 'active') query = query.eq('is_active', true);
                if (body.status === 'inactive') query = query.eq('is_active', false);
                const { data, error } = await query;
                if (error) throw error;
                const ids = (data ?? []).map((s) => s.id);
                let sync: Record<string, string> = {};
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
                    students: (data ?? []).map((s) => ({ ...s, last_sync_at: sync[s.id] ?? null }))
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
                let query = client.from('announcements').select('*')
                    .order('created_at', { ascending: false }).limit(limit);
                if (body.q) query = query.ilike('title', `%${str(body.q, 120)}%`);
                if (ANNOUNCEMENT_TYPES.includes(String(body.type))) query = query.eq('type', String(body.type));
                if (body.status === 'published') query = query.eq('is_published', true);
                if (body.status === 'draft') query = query.eq('is_published', false);
                const { data, error } = await query;
                if (error) throw error;
                return json({ ok: true, announcements: data ?? [] });
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
                let query = client.from('changelog').select('*')
                    .order('created_at', { ascending: false }).limit(limit);
                if (body.q) query = query.ilike('version', `%${str(body.q, 60)}%`);
                if (CATEGORIES.includes(String(body.category))) query = query.eq('category', String(body.category));
                if (body.status === 'published') query = query.eq('is_published', true);
                if (body.status === 'draft') query = query.eq('is_published', false);
                const { data, error } = await query;
                if (error) throw error;
                return json({ ok: true, changelog: data ?? [] });
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
                const row = {
                    version,
                    title,
                    summary: str(body.summary, 400) || null,
                    content: sections,
                    category: oneOf(body.category, CATEGORIES, 'other'),
                    is_published: !!body.is_published
                };
                if (row.is_published) (row as Record<string, unknown>).published_at = new Date().toISOString();
                let result;
                if (id) {
                    result = await client.from('changelog').update(row).eq('id', id).select().maybeSingle();
                } else {
                    result = await client.from('changelog').insert(row).select().maybeSingle();
                }
                if (result.error) {
                    if ((result.error as { code?: string }).code === '23505') {
                        return fail(409, 'DUPLICATE_VERSION', `Phiên bản ${version} đã tồn tại.`);
                    }
                    throw result.error;
                }
                await logAction(client, row.is_published ? 'changelog.publish' : 'changelog.save',
                    'changelog', result.data?.id ?? null, { version });
                return json({ ok: true, entry: result.data });
            }

            case 'changelog.publish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { data, error } = await client.from('changelog')
                    .update({ is_published: true, published_at: new Date().toISOString() })
                    .eq('id', id).select().maybeSingle();
                if (error) throw error;
                if (!data) return fail(404, 'NOT_FOUND', 'Không tìm thấy changelog.');
                await logAction(client, 'changelog.publish', 'changelog', id, { version: data.version });
                return json({ ok: true, entry: data });
            }

            case 'changelog.unpublish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { data, error } = await client.from('changelog')
                    .update({ is_published: false }).eq('id', id).select().maybeSingle();
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
                const { data, error } = await client.from('admin_activity_logs')
                    .select('id, action, target_type, target_id, detail, created_at')
                    .order('created_at', { ascending: false }).limit(limit);
                if (error) throw error;
                return json({ ok: true, logs: data ?? [] });
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

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Hành động không hợp lệ: ' + action);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return fail(500, 'SERVER_ERROR', 'Lỗi máy chủ: ' + message);
    }
});

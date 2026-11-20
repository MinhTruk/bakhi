// report-api — mọi thao tác của HỌC SINH với hệ thống Report Issue.
//
// Trình duyệt chỉ đọc dữ liệu qua RLS; các thao tác dưới đây chạy bằng service
// role sau khi máy chủ xác minh thiết bị đã gắn với một học sinh đang hoạt động.
//
// Không bao giờ tin `student_id` do client gửi lên: danh tính lấy từ
// student_devices theo phiên Anonymous Auth của thiết bị.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';

const MAX_TITLE = 160;
const MAX_DESC = 5000;
const MAX_MESSAGE = 4000;
const MAX_ATTACHMENTS = 4;
const BUCKET = 'report-attachments';
const PAGE = 20;

const CATEGORIES = ['bug', 'ui', 'content', 'answer', 'account', 'performance', 'feature', 'data', 'other'];
const ISSUE_TYPES = ['bug', 'question', 'suggestion', 'content_error'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const OPEN_STATUSES = ['new', 'pending', 'in_progress', 'waiting_student'];

interface Ctx {
    client: ReturnType<typeof adminClient>;
    studentId: string;
    studentName: string;
    authUserId: string;
}

function str(v: unknown, max: number): string {
    return String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function uuid(v: unknown): string {
    const s = str(v, 40);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : '';
}

function cleanText(raw: unknown, max: number): string {
    return String(raw ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim()
        .slice(0, max);
}

/** Chỉ nhận đường dẫn trong thư mục của chính học sinh. */
function attachments(raw: unknown, studentId: string): string[] {
    const list = Array.isArray(raw) ? raw : [];
    return list
        .map((p) => str(p, 300))
        .filter((p) => p && p.startsWith(studentId + '/') && !/\.\./.test(p))
        .slice(0, MAX_ATTACHMENTS);
}

async function limited(ctx: Ctx, key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { data, error } = await ctx.client.rpc('bakhi_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds
    });
    if (error) throw new Error('RATE_LIMIT_ERROR');
    return !!data;
}

async function signedPaths(ctx: Ctx, paths: unknown): Promise<Array<Record<string, unknown>>> {
    const list = (Array.isArray(paths) ? paths : []).map((p) => String(p)).filter(Boolean).slice(0, MAX_ATTACHMENTS);
    if (!list.length) return [];
    const out: Array<Record<string, unknown>> = [];
    for (const path of list) {
        const { data } = await ctx.client.storage.from(BUCKET).createSignedUrl(path, 3600);
        out.push({ path, name: path.split('/').pop() || 'tệp', url: data?.signedUrl || '' });
    }
    return out;
}

async function ownReport(ctx: Ctx, reportId: string) {
    const id = uuid(reportId);
    if (!id) return null;
    const { data } = await ctx.client
        .from('reports')
        .select('*')
        .eq('id', id)
        .eq('student_id', ctx.studentId)
        .maybeSingle();
    return data || null;
}

async function logReport(
    ctx: Ctx,
    reportId: string,
    action: string,
    oldValue: string | null,
    newValue: string | null,
    metadata: Record<string, unknown> = {}
): Promise<void> {
    await ctx.client.from('report_activity_logs').insert({
        report_id: reportId,
        actor_kind: 'student',
        actor_label: ctx.studentName,
        action,
        old_value: oldValue,
        new_value: newValue,
        metadata
    });
}

async function notifyStudent(
    ctx: Ctx,
    reportId: string,
    kind: string,
    title: string,
    body: string
): Promise<void> {
    await ctx.client.from('report_notifications').insert({
        student_id: ctx.studentId,
        report_id: reportId,
        kind,
        title: str(title, 160),
        body: str(body, 600)
    });
}

function reportRow(row: Record<string, unknown>) {
    return {
        id: row.id,
        code: row.code,
        title: row.title,
        description: row.description,
        category: row.category,
        issue_type: row.issue_type,
        priority: row.priority,
        status: row.status,
        page_url: row.page_url || '',
        page_title: row.page_title || '',
        route: row.route || '',
        subject: row.subject || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        resolved_at: row.resolved_at || null,
        closed_at: row.closed_at || null,
        resolution_note: row.resolution_note || '',
        last_message_at: row.last_message_at || null,
        last_message_by: row.last_message_by || null,
        student_unread: Number(row.student_unread || 0),
        staff_unread: Number(row.staff_unread || 0),
        attachment_count: Array.isArray(row.attachment_paths) ? (row.attachment_paths as string[]).length : 0
    };
}

function messageRow(row: Record<string, unknown>) {
    return {
        id: row.id,
        report_id: row.report_id,
        sender_kind: row.sender_kind,
        sender_label: row.sender_label || (row.sender_kind === 'staff' ? 'Ban quản trị' : 'Học sinh'),
        body: row.body,
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        is_private: !!row.is_private,
        created_at: row.created_at
    };
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const client = adminClient();

    const { data: device } = await client
        .from('student_devices')
        .select('student_id')
        .eq('auth_user_id', caller.userId)
        .maybeSingle();
    if (!device) {
        return fail(409, 'NOT_BOUND',
            'Thiết bị chưa được gắn với học sinh nào. Hãy chọn họ tên ở trang chủ rồi gửi báo cáo.');
    }

    const { data: student } = await client
        .from('students')
        .select('id, display_name, is_active')
        .eq('id', device.student_id)
        .maybeSingle();
    if (!student || !student.is_active) {
        return fail(403, 'INACTIVE', 'Hồ sơ học sinh không còn hoạt động.');
    }

    const ctx: Ctx = {
        client,
        studentId: String(student.id),
        studentName: String(student.display_name || 'Học sinh'),
        authUserId: caller.userId
    };
    const body = await readJson<Record<string, unknown>>(req);
    const action = str(body.action, 40);

    await client.from('student_devices')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('auth_user_id', ctx.authUserId);

    try {
        switch (action) {
            /* ------------------------------ Tổng quan ------------------------------ */
            case 'bootstrap': {
                const { data: rows } = await client
                    .from('reports')
                    .select('status, student_unread')
                    .eq('student_id', ctx.studentId)
                    .limit(500);
                const counts: Record<string, number> = {
                    total: 0, open: 0, resolved: 0, unread: 0, waiting_student: 0
                };
                for (const row of rows ?? []) {
                    counts.total++;
                    if (OPEN_STATUSES.includes(String(row.status))) counts.open++;
                    if (row.status === 'resolved' || row.status === 'closed') counts.resolved++;
                    if (row.status === 'waiting_student') counts.waiting_student++;
                    counts.unread += Number(row.student_unread || 0) > 0 ? 1 : 0;
                }
                const { data: notes } = await client
                    .from('report_notifications')
                    .select('id')
                    .eq('student_id', ctx.studentId)
                    .is('read_at', null);
                return json({
                    ok: true,
                    student: { id: ctx.studentId, display_name: ctx.studentName },
                    counts,
                    notifications_unread: (notes ?? []).length
                });
            }

            /* -------------------------------- Danh sách ---------------------------- */
            case 'list': {
                const limit = Math.min(Math.max(Number(body.limit) || PAGE, 1), 50);
                const offset = Math.max(Number(body.offset) || 0, 0);
                let query = client
                    .from('reports')
                    .select('*', { count: 'exact' })
                    .eq('student_id', ctx.studentId)
                    .order('updated_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                if (body.status && str(body.status, 20) !== 'all') {
                    query = query.eq('status', str(body.status, 20));
                }
                const { data, count, error } = await query;
                if (error) return fail(500, 'DB_ERROR', 'Không tải được danh sách báo cáo.');
                return json({
                    ok: true,
                    total: count || 0,
                    reports: (data ?? []).map(reportRow)
                });
            }

            /* --------------------------------- Chi tiết ---------------------------- */
            case 'detail': {
                const row = await ownReport(ctx, body.report_id);
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                const { data: messages } = await client
                    .from('report_messages')
                    .select('*')
                    .eq('report_id', row.id)
                    .order('created_at', { ascending: true })
                    .limit(200);

                /* Học sinh mở báo cáo = đã đọc phản hồi của mình. */
                if (Number(row.student_unread || 0) > 0) {
                    await client.from('reports').update({ student_unread: 0 }).eq('id', row.id);
                    await client.from('report_messages')
                        .update({ read_by_student_at: new Date().toISOString() })
                        .eq('report_id', row.id)
                        .eq('sender_kind', 'staff')
                        .is('read_by_student_at', null);
                }
                const report = reportRow(row);
                report.student_unread = 0;
                return json({
                    ok: true,
                    report,
                    attachments: await signedPaths(ctx, row.attachment_paths),
                    messages: await Promise.all((messages ?? []).map(async (m) => {
                        const out = messageRow(m);
                        (out as Record<string, unknown>).attachment_urls =
                            await signedPaths(ctx, m.attachments);
                        return out;
                    }))
                });
            }

            /* --------------------------------- Tạo mới ------------------------------ */
            case 'create': {
                const title = cleanText(body.title, MAX_TITLE);
                const description = cleanText(body.description, MAX_DESC);
                const category = CATEGORIES.includes(str(body.category, 20)) ? str(body.category, 20) : 'bug';
                const issueType = ISSUE_TYPES.includes(str(body.issue_type, 20))
                    ? str(body.issue_type, 20) : 'bug';
                const priority = PRIORITIES.includes(str(body.priority, 20))
                    ? str(body.priority, 20) : 'normal';
                if (title.length < 4) return fail(400, 'BAD_TITLE', 'Tiêu đề cần ít nhất 4 ký tự.');
                if (description.length < 10) {
                    return fail(400, 'BAD_DESCRIPTION', 'Mô tả cần ít nhất 10 ký tự.');
                }
                if (!(await limited(ctx, 'report-create:' + ctx.studentId, 6, 3600))) {
                    return fail(429, 'TOO_MANY_REPORTS',
                        'Bạn đã gửi khá nhiều báo cáo trong một giờ. Vui lòng thử lại sau.');
                }

                const context = (body.context && typeof body.context === 'object')
                    ? body.context as Record<string, unknown> : {};
                const safeContext: Record<string, unknown> = {
                    user_agent: str(context.user_agent, 300),
                    platform: str(context.platform, 120),
                    language: str(context.language, 20),
                    screen: str(context.screen, 40),
                    viewport: str(context.viewport, 40),
                    timezone: str(context.timezone, 60),
                    captured_at: str(context.captured_at, 40) || new Date().toISOString()
                };

                /* Cảnh báo trùng lặp — không tự từ chối báo cáo hợp lệ. */
                const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
                const { data: similar } = await client
                    .from('reports')
                    .select('id, code, title')
                    .eq('student_id', ctx.studentId)
                    .gte('created_at', since)
                    .eq('category', category)
                    .limit(20);
                const needle = title.toLowerCase();
                const duplicate = (similar ?? []).find((r) =>
                    String(r.title || '').toLowerCase() === needle) || null;

                const { data: inserted, error } = await client
                    .from('reports')
                    .insert({
                        student_id: ctx.studentId,
                        title,
                        description,
                        category,
                        issue_type: issueType,
                        priority,
                        status: 'new',
                        page_url: str(body.page_url, 500),
                        page_title: str(body.page_title, 200),
                        route: str(body.route, 200),
                        subject: str(body.subject, 120),
                        context_data: safeContext,
                        attachment_paths: attachments(body.attachments, ctx.studentId),
                        last_message_by: 'student',
                        last_message_at: new Date().toISOString(),
                        staff_unread: 1
                    })
                    .select('*')
                    .maybeSingle();
                if (error || !inserted) return fail(500, 'CREATE_FAILED', 'Không gửi được báo cáo.');

                await logReport(ctx, String(inserted.id), 'report.created', null, 'new', {
                    category, priority, issue_type: issueType, url: str(body.page_url, 500)
                });
                return json({
                    ok: true,
                    report: reportRow(inserted),
                    duplicate: duplicate ? { id: duplicate.id, code: duplicate.code, title: duplicate.title } : null
                });
            }

            /* ------------------------------ Gửi tin nhắn --------------------------- */
            case 'message.send': {
                const row = await ownReport(ctx, body.report_id);
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                if (row.status === 'closed') {
                    return fail(409, 'REPORT_CLOSED', 'Báo cáo đã đóng. Hãy tạo báo cáo mới nếu vấn đề còn tiếp diễn.');
                }
                const text = cleanText(body.body, MAX_MESSAGE);
                if (!text) return fail(400, 'EMPTY', 'Nội dung trả lời đang trống.');
                if (!(await limited(ctx, 'report-msg:' + ctx.studentId, 30, 600))) {
                    return fail(429, 'TOO_MANY_MESSAGES', 'Bạn gửi hơi nhanh. Chờ một chút nhé.');
                }
                const files = attachments(body.attachments, ctx.studentId);
                const { data: msg, error } = await client
                    .from('report_messages')
                    .insert({
                        report_id: row.id,
                        sender_kind: 'student',
                        sender_student_id: ctx.studentId,
                        sender_label: ctx.studentName,
                        body: text,
                        attachments: files
                    })
                    .select('*')
                    .maybeSingle();
                if (error || !msg) return fail(500, 'SEND_FAILED', 'Không gửi được tin nhắn.');

                const reopen = row.status === 'resolved';
                const patch: Record<string, unknown> = {
                    last_message_at: new Date().toISOString(),
                    last_message_by: 'student',
                    staff_unread: Number(row.staff_unread || 0) + 1
                };
                if (reopen) {
                    patch.status = 'pending';
                    patch.resolved_at = null;
                    patch.resolution_note = null;
                }
                await client.from('reports').update(patch).eq('id', row.id);
                await logReport(ctx, String(row.id), reopen ? 'report.reopened' : 'message.student',
                    row.status, reopen ? 'pending' : String(row.status), { length: text.length });

                return json({
                    ok: true,
                    message: Object.assign(messageRow(msg), { attachment_urls: await signedPaths(ctx, files) }),
                    status: reopen ? 'pending' : row.status
                });
            }

            /* ---------------------------- Đánh dấu đã đọc -------------------------- */
            case 'read.mark': {
                const reportId = uuid(body.report_id);
                if (!reportId) return fail(400, 'BAD_REPORT', 'Thiếu báo cáo.');
                const row = await ownReport(ctx, reportId);
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                const nowIso = new Date().toISOString();
                await client.from('reports').update({ student_unread: 0 }).eq('id', reportId);
                await client.from('report_messages')
                    .update({ read_by_student_at: nowIso })
                    .eq('report_id', reportId)
                    .eq('sender_kind', 'staff')
                    .is('read_by_student_at', null);
                return json({ ok: true });
            }

            /* ----------------------------- Thông báo riêng ------------------------- */
            case 'notifications': {
                const { data, error } = await client
                    .from('report_notifications')
                    .select('id, report_id, kind, title, body, read_at, created_at')
                    .eq('student_id', ctx.studentId)
                    .order('created_at', { ascending: false })
                    .limit(40);
                if (error) return fail(500, 'DB_ERROR', 'Không tải được thông báo báo cáo.');
                return json({ ok: true, notifications: data ?? [] });
            }

            case 'notifications.read': {
                const id = uuid(body.notification_id);
                const nowIso = new Date().toISOString();
                let query = client.from('report_notifications')
                    .update({ read_at: nowIso })
                    .eq('student_id', ctx.studentId)
                    .is('read_at', null);
                if (id) query = query.eq('id', id);
                const { error } = await query;
                if (error) return fail(500, 'DB_ERROR', 'Không lưu được trạng thái đã đọc.');
                return json({ ok: true });
            }

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Thao tác không hợp lệ.');
        }
    } catch (err) {
        console.error('[report-api]', action, err);
        return fail(500, 'SERVER_ERROR', 'Máy chủ gặp lỗi khi xử lý báo cáo.');
    }
});

// sync-student-progress — đồng bộ tiến trình học tập theo student_id.
//
// Body: { payload: { practice?, review?, notes?, bookmarks?, history?,
//                   achievements?, prefs?, signals?, badges? }, updated_at?: ISO }
//
// `signals` (bộ đếm thành tích) và `badges` (trang đã ghé, chuỗi ngày, lượt
// nghe) do máy khách gửi lên chỉ để Edge Function student-profile tính lại
// thành tích; bản thân chúng không cấp quyền gì.
//
// Quy tắc xung đột: chỉ ghi khi mốc thời gian gửi lên mới hơn hoặc bằng bản
// đang lưu. Sau đó trả về toàn bộ dữ liệu máy chủ để client hợp nhất — không
// bao giờ trả về dữ liệu của học sinh khác.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';

const KEYS = ['practice', 'review', 'notes', 'bookmarks', 'history', 'achievements', 'prefs', 'signals', 'badges'];
const MAX_BYTES = 1_500_000;

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
    if (!device) return fail(409, 'NOT_BOUND', 'Thiết bị chưa được gắn với học sinh nào.');

    const { data: student } = await client
        .from('students').select('id, is_active').eq('id', device.student_id).maybeSingle();
    if (!student || !student.is_active) return fail(403, 'INACTIVE', 'Hồ sơ học sinh không còn hoạt động.');

    const body = await readJson<{ payload?: Record<string, unknown>; updated_at?: string }>(req);
    const payload = body.payload ?? {};
    const incomingAt = body.updated_at && !isNaN(new Date(body.updated_at).getTime())
        ? new Date(body.updated_at)
        : new Date();

    const { data: existing } = await client
        .from('student_progress')
        .select('progress_key, updated_at')
        .eq('student_id', student.id);
    const currentAt = new Map<string, string>();
    for (const row of existing ?? []) currentAt.set(row.progress_key, row.updated_at);

    const rows: Record<string, unknown>[] = [];
    for (const key of KEYS) {
        if (!(key in payload)) continue;
        const value = payload[key];
        if (value === undefined) continue;
        const prev = currentAt.get(key);
        if (prev && new Date(prev).getTime() > incomingAt.getTime()) continue; // giữ bản mới hơn
        rows.push({
            student_id: student.id,
            progress_key: key,
            progress_data: value,
            updated_at: incomingAt.toISOString()
        });
    }

    let written = 0;
    if (rows.length) {
        const size = new TextEncoder().encode(JSON.stringify(rows)).length;
        if (size > MAX_BYTES) return fail(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu đồng bộ quá lớn.');
        const { error } = await client
            .from('student_progress')
            .upsert(rows, { onConflict: 'student_id,progress_key' });
        if (error) return fail(500, 'SYNC_ERROR', 'Không lưu được tiến trình học tập.');
        written = rows.length;
    }

    const { data: all } = await client
        .from('student_progress')
        .select('progress_key, progress_data, updated_at')
        .eq('student_id', student.id);

    const progress: Record<string, unknown> = {};
    const updated: Record<string, string> = {};
    for (const row of all ?? []) {
        progress[row.progress_key] = row.progress_data;
        updated[row.progress_key] = row.updated_at;
    }

    return json({ ok: true, written, progress, updated, serverTime: new Date().toISOString() });
});

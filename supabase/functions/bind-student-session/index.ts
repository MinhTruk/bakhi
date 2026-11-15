// bind-student-session — gắn danh tính học sinh vào phiên thiết bị.
//
// POST {}               → trả về liên kết hiện tại (nếu có) + tiến trình.
// POST { student_id }   → gắn (hoặc đổi) học sinh cho auth.uid() hiện tại.
// POST { unbind: true } → xoá liên kết, yêu cầu chọn lại danh tính.
//
// student_id luôn được xác minh phía server; không tin bất kỳ thông tin
// phân quyền nào khác từ client.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';
import { normalizeName } from '../_shared/names.ts';

async function progressFor(client: ReturnType<typeof adminClient>, studentId: string) {
    const { data } = await client
        .from('student_progress')
        .select('progress_key, progress_data, updated_at')
        .eq('student_id', studentId);
    const progress: Record<string, unknown> = {};
    const updated: Record<string, string> = {};
    for (const row of data ?? []) {
        progress[row.progress_key] = row.progress_data;
        updated[row.progress_key] = row.updated_at;
    }
    return { progress, updated };
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const client = adminClient();
    const body = await readJson<{ student_id?: string; display_name?: string; unbind?: boolean }>(req);

    /* ---------------------------- Ngắt liên kết ---------------------------- */
    if (body.unbind) {
        await client.from('student_devices').delete().eq('auth_user_id', caller.userId);
        return json({ ok: true, bound: false });
    }

    /* --------------------------- Xem liên kết ------------------------------ */
    if (!body.student_id) {
        const { data, error } = await client
            .from('student_devices')
            .select('student_id, created_at, last_seen_at')
            .eq('auth_user_id', caller.userId)
            .maybeSingle();
        if (error) return fail(500, 'DB_ERROR', 'Không đọc được liên kết thiết bị.');
        if (!data) return json({ ok: true, bound: false });

        const { data: student } = await client
            .from('students')
            .select('id, display_name, student_code, disambiguator, is_active')
            .eq('id', data.student_id)
            .maybeSingle();
        if (!student || !student.is_active) {
            return json({ ok: true, bound: false, reason: 'inactive' });
        }
        const { progress, updated } = await progressFor(client, student.id);
        return json({ ok: true, bound: true, student, progress, updated });
    }

    /* ----------------------------- Gắn danh tính --------------------------- */
    const studentId = String(body.student_id);
    const { data: student, error } = await client
        .from('students')
        .select('id, display_name, student_code, disambiguator, is_active, needs_review')
        .eq('id', studentId)
        .maybeSingle();
    if (error) return fail(500, 'DB_ERROR', 'Không kiểm tra được hồ sơ học sinh.');
    if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh này.');
    if (!student.is_active) return fail(403, 'INACTIVE', 'Hồ sơ học sinh đã bị vô hiệu hoá.');
    /* Đối chiếu tên người dùng gửi lên với hồ sơ — chặn trường hợp client
       gửi student_id không tương ứng với tên đã xác nhận trên giao diện. */
    if (body.display_name) {
        const typed = normalizeName(String(body.display_name));
        const actual = normalizeName(student.display_name);
        if (!typed || typed !== actual) {
            return fail(409, 'NAME_MISMATCH', 'Tên xác nhận không khớp với hồ sơ học sinh.');
        }
    }

    if (student.needs_review) {
        return fail(409, 'NEEDS_REVIEW',
            'Hồ sơ này đang chờ Admin phân biệt (trùng họ tên). Vui lòng liên hệ giáo viên.');
    }

    // Giới hạn: 10 lần gắn danh tính / 10 phút cho mỗi thiết bị.
    const { data: allowed } = await client.rpc('bakhi_rate_limit', {
        p_key: 'bind:' + caller.userId,
        p_limit: 10,
        p_window_seconds: 600
    });
    if (allowed === false) return fail(429, 'TOO_MANY_BINDS', 'Bạn đổi học sinh quá nhiều lần. Vui lòng thử lại sau.');

    const { error: upsertError } = await client.from('student_devices').upsert({
        auth_user_id: caller.userId,
        student_id: student.id,
        last_seen_at: new Date().toISOString()
    }, { onConflict: 'auth_user_id' });
    if (upsertError) return fail(500, 'BIND_ERROR', 'Không lưu được liên kết học sinh.');

    const { progress, updated } = await progressFor(client, student.id);
    return json({ ok: true, bound: true, student, progress, updated });
});

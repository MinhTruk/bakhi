// bind-student-session — gắn danh tính học sinh vào phiên thiết bị.
//
// POST {}               → trả về liên kết hiện tại (nếu có) + tiến trình.
// POST { student_id }   → gắn (hoặc đổi) học sinh cho auth.uid() hiện tại.
// POST { unbind: true } → xoá liên kết, yêu cầu chọn lại danh tính.
//
// 7.8.0: hồ sơ có mật mã đăng nhập thì lần gắn đầu tiên trả `code_required`
// (chưa gắn thiết bị). Client hỏi mật mã rồi gọi lại kèm `code`; chỉ khi mật
// mã đúng mới gắn thiết bị. Mật mã băm PBKDF2 phía máy chủ, sai 5 lần khoá 10 phút.
//
// student_id luôn được xác minh phía server; không tin bất kỳ thông tin
// phân quyền nào khác từ client.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';
import { normalizeName } from '../_shared/names.ts';
import {
    cleanCode,
    loadLoginCode,
    lockMinutesLeft,
    registerFailure,
    registerSuccess,
    verifyLoginCode
} from '../_shared/login-code.ts';

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
    const body = await readJson<{
        student_id?: string;
        display_name?: string;
        code?: string;
        unbind?: boolean;
    }>(req);

    /* ---------------------------- Ngắt liên kết ---------------------------- */
    if (body.unbind) {
        await client.from('student_devices').delete().eq('auth_user_id', caller.userId);
        return json({ ok: true, bound: false });
    }

    /* --------------------------- Xem liên kết ------------------------------ */
    /* Chỉ coi là "xem liên kết" khi KHÔNG có cả student_id và họ tên; nếu có họ
       tên thì đó là yêu cầu xác nhận danh tính (xử lý ở dưới). */
    if (!body.student_id && !String(body.display_name ?? '').trim()) {
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
    const typedName = body.display_name ? normalizeName(String(body.display_name)).slice(0, 120) : '';
    const hasId = !!body.student_id;
    let studentId = hasId ? String(body.student_id) : '';

    /* Không có student_id: máy chủ tự tra đúng họ tên người dùng đã nhập.
       Đây là đường xác nhận chính — không phụ thuộc việc client chọn gợi ý. */
    if (!studentId) {
        if (!typedName) return fail(400, 'MISSING_TARGET', 'Cần họ tên hoặc mã học sinh để xác nhận.');
        const { data: rows, error: findError } = await client
            .from('students')
            .select('id, display_name, disambiguator, is_active, needs_review')
            .eq('normalized_name', typedName)
            .order('display_name', { ascending: true })
            .limit(6);
        if (findError) return fail(500, 'DB_ERROR', 'Không tra được hồ sơ học sinh.');
        const active = (rows ?? []).filter((row) => row.is_active);
        if (!active.length) {
            return fail(404, 'NAME_NOT_FOUND',
                'Không có học sinh nào trùng đúng họ tên này. Hãy kiểm tra lại họ tên.');
        }
        if (active.length > 1) {
            return fail(409, 'AMBIGUOUS', 'Có nhiều hồ sơ cùng họ tên. Hãy chọn đúng hồ sơ của bạn.', {
                candidates: active.map((row) => ({
                    id: row.id,
                    display_name: row.display_name,
                    disambiguator: row.disambiguator ?? null
                }))
            });
        }
        studentId = active[0].id;
    }

    const { data: student, error } = await client
        .from('students')
        .select('id, display_name, student_code, disambiguator, is_active, needs_review')
        .eq('id', studentId)
        .maybeSingle();
    if (error) return fail(500, 'DB_ERROR', 'Không kiểm tra được hồ sơ học sinh.');
    if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh này.');
    if (!student.is_active) return fail(403, 'INACTIVE', 'Hồ sơ học sinh đã bị vô hiệu hoá.');

    /* Chỉ khi client gửi kèm id mới cần đối chiếu tên — chặn trường hợp gửi
       student_id không tương ứng với tên đã xác nhận trên giao diện. */
    if (hasId && typedName) {
        const actual = normalizeName(student.display_name);
        if (typedName !== actual) {
            return fail(409, 'NAME_MISMATCH', 'Tên xác nhận không khớp với hồ sơ học sinh.');
        }
    }

    if (student.needs_review) {
        return fail(409, 'NEEDS_REVIEW',
            'Hồ sơ này đang chờ Admin phân biệt (trùng họ tên). Vui lòng liên hệ quản trị viên.');
    }

    /* --------------------------- Mật mã đăng nhập ------------------------- */
    /* Hồ sơ đã đặt mật mã: lần gắn này chỉ trả `code_required`, KHÔNG gắn
       thiết bị. Client hiện thêm ô nhập mật mã rồi gọi lại kèm `code`. */
    const codeRow = await loadLoginCode(client, student.id);
    if (codeRow) {
        const wait = lockMinutesLeft(codeRow);
        if (wait) {
            return fail(429, 'CODE_LOCKED',
                `Bạn nhập sai mật mã quá nhiều lần. Thử lại sau ${wait} phút.`, { retry_minutes: wait });
        }
        const typedCode = cleanCode(body.code);
        if (!typedCode) {
            return json({
                ok: true,
                bound: false,
                code_required: true,
                student: {
                    id: student.id,
                    display_name: student.display_name,
                    disambiguator: student.disambiguator ?? null,
                    student_code: student.student_code ?? null
                }
            });
        }

        /* Chống dò mật mã: 30 lượt / 10 phút cho mỗi thiết bị. */
        const { data: codeAllowed } = await client.rpc('bakhi_rate_limit', {
            p_key: 'code:' + caller.userId,
            p_limit: 30,
            p_window_seconds: 600
        });
        if (codeAllowed === false) {
            return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn thử mật mã quá nhiều lần. Vui lòng đợi vài phút.');
        }

        if (!(await verifyLoginCode(typedCode, codeRow))) {
            const left = await registerFailure(client, codeRow);
            return fail(401, 'WRONG_CODE', left
                ? `Mật mã không đúng. Còn ${left} lần thử.`
                : `Mật mã không đúng. Hãy thử lại sau 10 phút.`, { attempts_left: left });
        }
        await registerSuccess(client, student.id);
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

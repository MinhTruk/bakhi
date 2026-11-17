// passkey-api — đăng ký, đăng nhập và quản lý passkey WebAuthn.
//
// Trình duyệt không bao giờ gửi private key. Server lưu public key + counter,
// xác minh chữ ký bằng @simplewebauthn/server trước khi gắn thiết bị.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';
import {
    authenticationOptions,
    loadChallenge,
    passkeyCount,
    registrationOptions,
    useChallenge,
    verifyAuthentication,
    verifyRegistration
} from '../_shared/passkeys.ts';

type Client = ReturnType<typeof adminClient>;

function str(v: unknown, max: number): string {
    return String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function uuid(v: unknown): string {
    const s = str(v, 40);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : '';
}

async function bodyJson<T>(req: Request): Promise<T> {
    return readJson<T>(req);
}

async function progressFor(client: Client, studentId: string) {
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

async function boundStudent(client: Client, authUserId: string) {
    const { data: device } = await client
        .from('student_devices')
        .select('student_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
    if (!device) return null;
    const { data: student } = await client
        .from('students')
        .select('id, display_name, disambiguator, student_code, is_active')
        .eq('id', device.student_id)
        .maybeSingle();
    if (!student || !student.is_active) return null;
    return student;
}

async function listPasskeys(client: Client, studentId: string) {
    const { data } = await client
        .from('student_passkeys')
        .select('id, label, device_type, backed_up, created_at, last_used_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true });
    return data ?? [];
}

async function rateLimit(client: Client, key: string, limit: number, seconds: number): Promise<boolean> {
    const { data } = await client.rpc('bakhi_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: seconds
    });
    return !!data;
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const client = adminClient();
    const body = await bodyJson<Record<string, unknown>>(req);
    const action = str(body.action, 40);

    try {
        if (action === 'auth.verify') {
            if (!(await rateLimit(client, 'passkey-login:' + caller.userId, 20, 600))) {
                return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn thử passkey quá nhiều lần. Vui lòng đợi vài phút.');
            }
            const challengeId = uuid(body.challenge_id);
            if (!challengeId) return fail(400, 'BAD_CHALLENGE', 'Thiếu challenge passkey.');
            const challenge = await loadChallenge(client, challengeId, caller.userId, 'login');
            if (!challenge) return fail(400, 'EXPIRED_CHALLENGE', 'Yêu cầu passkey đã hết hạn. Hãy bấm Xác nhận lại.');
            const { data: student } = await client
                .from('students')
                .select('id, display_name, disambiguator, student_code, is_active')
                .eq('id', challenge.student_id)
                .maybeSingle();
            if (!student || !student.is_active) return fail(403, 'INACTIVE', 'Hồ sơ học sinh không còn hoạt động.');
            await verifyAuthentication(client, challenge.student_id, body.response, challenge.challenge);
            await useChallenge(client, challengeId);
            const { error: bindError } = await client.from('student_devices').upsert({
                auth_user_id: caller.userId,
                student_id: student.id,
                last_seen_at: new Date().toISOString()
            }, { onConflict: 'auth_user_id' });
            if (bindError) return fail(500, 'BIND_ERROR', 'Đã xác minh passkey nhưng chưa lưu được thiết bị.');
            const { progress, updated } = await progressFor(client, student.id);
            return json({ ok: true, bound: true, student, progress, updated });
        }

        /* Các thao tác còn lại yêu cầu thiết bị đã gắn học sinh. */
        const student = await boundStudent(client, caller.userId);
        if (!student) return fail(409, 'NOT_BOUND', 'Thiết bị chưa được gắn với học sinh nào.');

        if (action === 'list') {
            return json({ ok: true, passkeys: await listPasskeys(client, student.id) });
        }

        if (action === 'register.options') {
            if (!(await rateLimit(client, 'passkey-register:' + caller.userId, 10, 600))) {
                return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn thao tác quá nhiều lần. Vui lòng đợi vài phút.');
            }
            const passkey = await registrationOptions(client, caller.userId, student);
            return json({ ok: true, passkey });
        }

        if (action === 'register.verify') {
            const challengeId = uuid(body.challenge_id);
            if (!challengeId) return fail(400, 'BAD_CHALLENGE', 'Thiếu challenge passkey.');
            const challenge = await loadChallenge(client, challengeId, caller.userId, 'register');
            if (!challenge || challenge.student_id !== student.id) {
                return fail(400, 'EXPIRED_CHALLENGE', 'Yêu cầu đăng ký passkey đã hết hạn. Hãy thử lại.');
            }
            const row = await verifyRegistration(client, student.id, body.response, challenge.challenge);
            const label = str(body.label, 80) || 'Passkey';
            await client.from('student_passkeys')
                .update({ label })
                .eq('id', row.id)
                .eq('student_id', student.id);
            await useChallenge(client, challengeId);
            return json({ ok: true, passkeys: await listPasskeys(client, student.id) });
        }

        if (action === 'remove') {
            const id = uuid(body.id);
            if (!id) return fail(400, 'BAD_PASSKEY', 'Thiếu passkey cần xoá.');
            await client.from('student_passkeys').delete()
                .eq('id', id)
                .eq('student_id', student.id);
            return json({ ok: true, passkeys: await listPasskeys(client, student.id) });
        }

        if (action === 'status') {
            return json({
                ok: true,
                count: await passkeyCount(client, student.id),
                passkeys: await listPasskeys(client, student.id)
            });
        }

        return fail(400, 'BAD_ACTION', 'Thao tác passkey không hợp lệ.');
    } catch (err) {
        const code = String((err && (err as Error).message) || 'PASSKEY_FAILED');
        if (code === 'TOO_MANY_PASSKEYS') return fail(409, code, 'Mỗi hồ sơ chỉ có tối đa 5 passkey.');
        if (code === 'PASSKEY_EXISTS') return fail(409, code, 'Passkey này đã được đăng ký.');
        if (code === 'PASSKEY_NOT_FOUND') return fail(404, code, 'Không tìm thấy passkey trên máy chủ.');
        if (code === 'BAD_PASSKEY') return fail(401, code, 'Passkey không hợp lệ hoặc chữ ký không khớp.');
        if (code === 'NO_PASSKEY') return fail(404, code, 'Hồ sơ chưa có passkey.');
        console.error('[passkey-api]', err);
        return fail(500, 'PASSKEY_FAILED', 'Không xử lý được passkey. Vui lòng thử lại.');
    }
});

// Mật mã đăng nhập (7.8.0) — băm PBKDF2-SHA256 phía máy chủ.
//
// Không bao giờ lưu mật mã thô. Mỗi hồ sơ có salt ngẫu nhiên 16 byte riêng.
// Mọi so sánh dùng safeEqual (thời gian hằng) để hạn chế timing attack.
import { safeEqual } from './http.ts';

export const CODE_MIN = 4;
export const CODE_MAX = 32;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 10;

const DEFAULT_ITERATIONS = 120000;

export interface LoginCodeRow {
    student_id: string;
    code_hash: string;
    code_salt: string;
    iterations: number;
    failed_count: number;
    locked_until: string | null;
    last_used_at: string | null;
    updated_at: string | null;
}

export type Client = {
    from: (table: string) => {
        select: (columns: string) => {
            eq: (column: string, value: string) => {
                maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
            };
        };
        upsert: (row: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error: unknown }>;
        update: (patch: Record<string, unknown>) => {
            eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
        delete: () => {
            eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
    };
};

/** Bỏ ký tự điều khiển, gộp khoảng trắng, giới hạn độ dài. */
export function cleanCode(value: unknown): string {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, CODE_MAX);
}

/** Trả câu lỗi nếu mật mã không hợp lệ, ngược lại chuỗi rỗng. */
export function codeProblem(code: string, confirm?: unknown): string {
    if (code.length < CODE_MIN) return `Mật mã cần tối thiểu ${CODE_MIN} ký tự.`;
    if (code.length > CODE_MAX) return `Mật mã tối đa ${CODE_MAX} ký tự.`;
    if (/\s/.test(code)) return 'Mật mã không được chứa khoảng trắng.';
    if (confirm !== undefined && cleanCode(confirm) !== code) return 'Hai lần nhập mật mã chưa khớp nhau.';
    return '';
}

function toHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
    const out = new Uint8Array(Math.floor(hex.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
    return out;
}

async function derive(code: string, saltHex: string, iterations: number): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(code),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' },
        key,
        256
    );
    return toHex(bits);
}

/** Băm mật mã mới với salt ngẫu nhiên. */
export async function hashLoginCode(code: string): Promise<{
    code_hash: string;
    code_salt: string;
    iterations: number;
}> {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
    const iterations = DEFAULT_ITERATIONS;
    return { code_hash: await derive(code, saltHex, iterations), code_salt: saltHex, iterations };
}

export async function loadLoginCode(client: Client, studentId: string): Promise<LoginCodeRow | null> {
    const { data } = await client
        .from('student_login_codes')
        .select('student_id, code_hash, code_salt, iterations, failed_count, locked_until, last_used_at, updated_at')
        .eq('student_id', studentId)
        .maybeSingle();
    if (!data) return null;
    return {
        student_id: String(data.student_id || studentId),
        code_hash: String(data.code_hash || ''),
        code_salt: String(data.code_salt || ''),
        iterations: Number(data.iterations || DEFAULT_ITERATIONS),
        failed_count: Number(data.failed_count || 0),
        locked_until: data.locked_until ? String(data.locked_until) : null,
        last_used_at: data.last_used_at ? String(data.last_used_at) : null,
        updated_at: data.updated_at ? String(data.updated_at) : null
    };
}

export async function verifyLoginCode(code: string, row: LoginCodeRow): Promise<boolean> {
    if (!code || !row.code_hash || !row.code_salt) return false;
    try {
        const candidate = await derive(code, row.code_salt, row.iterations);
        return safeEqual(candidate, row.code_hash);
    } catch {
        return false;
    }
}

/** Số phút còn bị khoá; 0 nghĩa là không khoá. */
export function lockMinutesLeft(row: LoginCodeRow | null): number {
    if (!row || !row.locked_until) return 0;
    const until = new Date(row.locked_until).getTime();
    if (!Number.isFinite(until)) return 0;
    const left = until - Date.now();
    return left > 0 ? Math.max(1, Math.ceil(left / 60000)) : 0;
}

/** Ghi nhận một lần nhập sai; trả số lần còn được thử (0 = vừa bị khoá). */
export async function registerFailure(client: Client, row: LoginCodeRow): Promise<number> {
    const failures = Math.max(0, row.failed_count) + 1;
    const locked = failures >= MAX_FAILURES;
    await client.from('student_login_codes').update({
        failed_count: failures,
        locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
        updated_at: new Date().toISOString()
    }).eq('student_id', row.student_id);
    return locked ? 0 : Math.max(0, MAX_FAILURES - failures);
}

/** Đăng nhập thành công: xoá bộ đếm sai và ghi mốc dùng gần nhất. */
export async function registerSuccess(client: Client, studentId: string): Promise<void> {
    const stamp = new Date().toISOString();
    await client.from('student_login_codes').update({
        failed_count: 0,
        locked_until: null,
        last_used_at: stamp,
        updated_at: stamp
    }).eq('student_id', studentId);
}

/** Lưu mật mã mới (đã kiểm tra hợp lệ và quyền thay đổi ở nơi gọi). */
export async function saveLoginCode(client: Client, studentId: string, code: string): Promise<boolean> {
    const hashed = await hashLoginCode(code);
    const stamp = new Date().toISOString();
    const { error } = await client.from('student_login_codes').upsert({
        student_id: studentId,
        code_hash: hashed.code_hash,
        code_salt: hashed.code_salt,
        iterations: hashed.iterations,
        failed_count: 0,
        locked_until: null,
        updated_at: stamp
    }, { onConflict: 'student_id' });
    return !error;
}

export async function removeLoginCode(client: Client, studentId: string): Promise<boolean> {
    const { error } = await client.from('student_login_codes').delete().eq('student_id', studentId);
    return !error;
}

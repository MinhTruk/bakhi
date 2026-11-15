// import-students — nhập danh sách học sinh từ nội dung students.txt.
//
// Header: x-admin-token. Nội dung TXT được gửi trong body (không cần Storage
// bucket công khai), nên danh sách thật không bao giờ nằm trong repository.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, requireAdmin, logAction } from '../_shared/supabase.ts';
import { parseRoster } from '../_shared/names.ts';

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const client = adminClient();
    const auth = await requireAdmin(req, client);
    if ('error' in auth) return auth.error;

    const body = await readJson<{ text?: string; mode?: string }>(req);
    const text = String(body.text ?? '');
    if (!text.trim()) return fail(400, 'EMPTY_FILE', 'Tệp TXT rỗng.');
    if (text.length > 500000) return fail(413, 'FILE_TOO_LARGE', 'Tệp quá lớn (tối đa 500KB).');

    const parsed = parseRoster(text);
    if (!parsed.entries.length) return fail(400, 'NO_NAMES', 'Không đọc được họ tên hợp lệ nào trong tệp.');

    const { data: existing, error: readError } = await client
        .from('students')
        .select('id, display_name, normalized_name, disambiguator, is_active');
    if (readError) throw readError;

    const byName = new Map<string, { id: string; display_name: string }[]>();
    for (const row of existing ?? []) {
        const list = byName.get(row.normalized_name) ?? [];
        list.push(row);
        byName.set(row.normalized_name, list);
    }

    const toInsert: { display_name: string; normalized_name: string; needs_review: boolean }[] = [];
    const updates: { id: string; display_name: string }[] = [];
    const duplicates: { name: string; reason: string; student_code?: string }[] = [];
    const needsReview: string[] = [];
    let unchanged = 0;

    for (const entry of parsed.entries) {
        const found = byName.get(entry.normalized_name) ?? [];
        if (!found.length) {
            toInsert.push({ ...entry, needs_review: false });
            continue;
        }
        if (found.length > 1) {
            duplicates.push({
                name: entry.display_name,
                reason: 'Có nhiều hồ sơ cùng họ tên — cần Admin phân biệt thủ công.'
            });
            continue;
        }
        const current = found[0];
        if (current.display_name === entry.display_name) { unchanged++; continue; }
        updates.push({ id: current.id, display_name: entry.display_name });
    }

    for (const dup of parsed.duplicates) {
        duplicates.push({ name: dup, reason: 'Họ tên xuất hiện nhiều lần trong tệp TXT.' });
    }

    if (toInsert.length) {
        const { error } = await client.from('students').insert(toInsert);
        if (error) {
            // Trùng họ tên với hồ sơ không có thông tin phân biệt.
            if ((error as { code?: string }).code === '23505') {
                return fail(409, 'DUPLICATE_NAME', 'Một số họ tên đã tồn tại. Hãy xử lý hồ sơ trùng trong tab Students trước.');
            }
            throw error;
        }
    }
    for (const row of updates) {
        const { error } = await client.from('students')
            .update({ display_name: row.display_name })
            .eq('id', row.id);
        if (error) throw error;
    }

    // Đánh dấu các hồ sơ có normalized_name trùng nhau để Admin xem lại.
    const { data: all } = await client.from('students').select('id, normalized_name, disambiguator');
    const groups = new Map<string, string[]>();
    for (const row of all ?? []) {
        const list = groups.get(row.normalized_name) ?? [];
        list.push(row.id);
        groups.set(row.normalized_name, list);
    }
    const reviewIds: string[] = [];
    for (const [, ids] of groups) if (ids.length > 1) reviewIds.push(...ids);
    if (reviewIds.length) {
        await client.from('students').update({ needs_review: true }).in('id', reviewIds);
        for (const row of all ?? []) {
            if (reviewIds.includes(row.id) && !row.disambiguator) needsReview.push(row.normalized_name);
        }
    }

    const summary = {
        totalLines: parsed.entries.length + parsed.duplicates.length + parsed.skipped + parsed.tooLong,
        added: toInsert.length,
        updated: updates.length,
        unchanged,
        duplicated: parsed.duplicates.length,
        skipped: parsed.skipped,
        tooLong: parsed.tooLong
    };

    await logAction(client, 'students.import', 'students', null, summary);
    return json({ ok: true, summary, duplicates, needsReview: [...new Set(needsReview)] });
});

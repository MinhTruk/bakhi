// search-students — tìm học sinh theo họ tên cho autocomplete.
//
// Yêu cầu: phiên Anonymous Auth hợp lệ (header Authorization).
// Danh sách đầy đủ không bao giờ được trả về: tối đa 8 kết quả mỗi lần,
// giới hạn 40 lượt / phút cho mỗi phiên thiết bị.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';
import { normalizeName, matchScore, tokensOf } from '../_shared/names.ts';

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const client = adminClient();

    const { data: allowed } = await client.rpc('bakhi_rate_limit', {
        p_key: 'search:' + caller.userId,
        p_limit: 40,
        p_window_seconds: 60
    });
    if (allowed === false) return fail(429, 'TOO_MANY_SEARCHES', 'Bạn tìm quá nhanh. Vui lòng thử lại sau ít giây.');

    const { q } = await readJson<{ q?: string }>(req);
    const query = normalizeName(q).slice(0, 80);
    if (query.length < 2) return json({ ok: true, students: [] });

    const qTokens = tokensOf(query);
    let dbQuery = client.from('students')
        .select('id, display_name, disambiguator, student_code')
        .eq('is_active', true)
        .limit(60);
    for (const token of qTokens.slice(0, 5)) {
        dbQuery = dbQuery.like('normalized_name', `%${token}%`);
    }

    const { data, error } = await dbQuery;
    if (error) return fail(500, 'DB_ERROR', 'Không tìm được danh sách học sinh.');

    const ranked = (data ?? [])
        .map((row) => ({ row, score: matchScore(query, normalizeName(row.display_name)) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.row.display_name.length - b.row.display_name.length)
        .slice(0, 8)
        .map((x) => ({
            id: x.row.id,
            display_name: x.row.display_name,
            disambiguator: x.row.disambiguator ?? null
        }));

    return json({ ok: true, students: ranked });
});

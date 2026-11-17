// student-profile — hồ sơ + thành tích xác minh phía máy chủ.
//
// Body:
//   { action?: 'sync' | 'get' | 'update', profile?: {...} }
//
// * sync   (mặc định): máy chủ đọc dữ liệu học tập đã đồng bộ, TỰ TÍNH lại các
//   chỉ số, ghi những badge tự động đủ điều kiện, rồi trả hồ sơ + toàn bộ badge
//   đã xác minh. Client không thể gửi danh sách badge để tự mở.
// * update: ghi hồ sơ sau khi kiểm tra độ dài, liên kết http/https và quyền sở
//   hữu khung avatar (trigger `bakhi_profile_frame_guard` kiểm tra lần nữa).
// * get: chỉ đọc.
//
// Badge Administrator (2 badge) KHÔNG bao giờ được ghi ở đây — chỉ admin-actions
// với phiên Administrator mới trao được.
import { json, fail, preflight, readJson, sha256Hex, safeEqual } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';
import { BADGE_CATALOG, BADGE_BY_ID } from '../_shared/badge-catalog.ts';
import { badgesEarned, computeMetrics, framesFromBadges, type StudentSnapshot } from '../_shared/badge-rules.ts';

interface ProfileInput {
    nickname?: unknown;
    bio?: unknown;
    avatar?: unknown;
    banner?: unknown;
    frame?: unknown;
    links?: unknown;
    prefs?: unknown;
    updatedAt?: unknown;
}

const LIMITS = {
    nickname: 32,
    bio: 320,
    links: 6,
    linkLabel: 24,
    linkUrl: 300,
    avatar: 800000,
    banner: 900000
};

function clampStr(v: unknown, max: number): string {
    return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function clampText(v: unknown, max: number): string {
    return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}
function safeUrl(v: unknown): string {
    let u = String(v ?? '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    try {
        const parsed = new URL(u);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return parsed.href.slice(0, LIMITS.linkUrl);
    } catch {
        return '';
    }
}
function cleanImage(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(v)) return '';
    return v.length <= max ? v : '';
}
function cleanLinks(v: unknown) {
    const out: Array<{ label: string; url: string; visible: boolean }> = [];
    for (const raw of Array.isArray(v) ? v.slice(0, LIMITS.links) : []) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const url = safeUrl(item.url);
        if (!url) continue;
        out.push({
            label: clampStr(item.label, LIMITS.linkLabel) || 'Liên kết',
            url,
            visible: item.visible !== false
        });
    }
    return out;
}

/** Chỉ nhận các cờ giao diện đã biết; không lưu dữ liệu tuỳ ý. */
function cleanPrefs(v: unknown): Record<string, unknown> {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (typeof src.animateAvatarBorders === 'boolean') {
        out.animateAvatarBorders = src.animateAvatarBorders;
    }
    return out;
}

function uuid(v: unknown): string {
    const s = clampStr(v, 40);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : '';
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const client = adminClient();

    const body = await readJson<{ action?: string; profile?: ProfileInput; student_id?: string }>(req);

    /*
     * Đường nội bộ: admin-actions gọi lại bằng service_role key để tự tính
     * badge đủ điều kiện cho một học sinh. Không dùng được với update/get và
     * không áp dụng giới hạn tần suất của học sinh.
     */
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const internal = !!serviceKey && safeEqual(bearer, serviceKey);

    let studentId = '';
    let action: 'sync' | 'get' | 'update' = 'sync';

    if (internal) {
        studentId = uuid(body.student_id);
        if (!studentId) return fail(400, 'BAD_STUDENT', 'Thiếu học sinh.');
        if (body.action && body.action !== 'sync') {
            return fail(403, 'INTERNAL_ACTION', 'Đường nội bộ chỉ đồng bộ thành tích.');
        }
        action = 'sync';
    } else {
        const caller = await callerUserId(req);
        if (caller instanceof Response) return caller;

        const { data: device } = await client
            .from('student_devices')
            .select('student_id')
            .eq('auth_user_id', caller.userId)
            .maybeSingle();
        if (!device) return fail(409, 'NOT_BOUND', 'Thiết bị chưa được gắn với học sinh nào.');
        studentId = String(device.student_id);
        action = body.action === 'update' || body.action === 'get' ? body.action : 'sync';

        // Giới hạn tần suất: 90 lần / giờ / học sinh.
        const { data: allowed, error: rlError } = await client.rpc('bakhi_rate_limit', {
            p_key: 'student-profile:' + studentId,
            p_limit: 90,
            p_window_seconds: 3600
        });
        if (rlError) return fail(500, 'RATE_LIMIT_ERROR', 'Không kiểm tra được giới hạn truy cập.');
        if (!allowed) return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn thao tác quá nhanh. Vui lòng đợi vài phút.');
    }

    const { data: student } = await client
        .from('students')
        .select('id, is_active')
        .eq('id', studentId)
        .maybeSingle();
    if (!student || !student.is_active) return fail(403, 'INACTIVE', 'Hồ sơ học sinh không còn hoạt động.');

    // ---- Hồ sơ hiện có --------------------------------------------------
    let { data: profileRow } = await client
        .from('student_profiles')
        .select('student_id, nickname, bio, avatar_url, banner_url, links, frame, prefs, updated_at')
        .eq('student_id', student.id)
        .maybeSingle();

    if (!profileRow) {
        const { data: created, error: createError } = await client
            .from('student_profiles')
            .insert({ student_id: student.id })
            .select('student_id, nickname, bio, avatar_url, banner_url, links, frame, prefs, updated_at')
            .maybeSingle();
        if (createError) return fail(500, 'PROFILE_CREATE_FAILED', 'Không tạo được hồ sơ.');
        profileRow = created;
    }
    if (!profileRow) return fail(500, 'PROFILE_MISSING', 'Không đọc được hồ sơ.');

    // ---- Ghi hồ sơ (chỉ khi client gửi) --------------------------------
    let frameRejected = false;
    if (action === 'update' && body.profile) {
        const input = body.profile;
        const patch: Record<string, unknown> = {
            nickname: clampStr(input.nickname, LIMITS.nickname),
            bio: clampText(input.bio, LIMITS.bio),
            links: cleanLinks(input.links)
        };
        if (input.prefs && typeof input.prefs === 'object') {
            const current = (profileRow.prefs && typeof profileRow.prefs === 'object')
                ? profileRow.prefs as Record<string, unknown>
                : {};
            patch.prefs = { ...current, ...cleanPrefs(input.prefs) };
        }
        const avatar = cleanImage(input.avatar, LIMITS.avatar);
        const banner = cleanImage(input.banner, LIMITS.banner);
        if (avatar) patch.avatar_url = avatar;
        else if (input.avatar === '') patch.avatar_url = '';
        if (banner) patch.banner_url = banner;
        else if (input.banner === '') patch.banner_url = '';

        const { data: owned } = await client.rpc('bakhi_owned_frames', { p_student: student.id });
        const frames: string[] = Array.isArray(owned) ? owned : ['none', 'leaf'];
        const wanted = clampStr(input.frame, 40) || 'none';
        if (frames.includes(wanted)) patch.frame = wanted;
        else frameRejected = true;

        const { data: updated, error: updateError } = await client
            .from('student_profiles')
            .update(patch)
            .eq('student_id', student.id)
            .select('student_id, nickname, bio, avatar_url, banner_url, links, frame, prefs, updated_at')
            .maybeSingle();
        if (updateError) {
            if (String(updateError.message || '').includes('FRAME_NOT_OWNED')) {
                return fail(400, 'FRAME_NOT_OWNED', 'Khung avatar này chưa được mở bằng thành tích.');
            }
            return fail(500, 'PROFILE_UPDATE_FAILED', 'Không lưu được hồ sơ.');
        }
        if (updated) profileRow = updated;
    }

    // ---- Tính lại thành tích tự động từ dữ liệu đã đồng bộ -------------
    let earned: string[] = [];
    if (action !== 'get') {
        const { data: progressRows } = await client
            .from('student_progress')
            .select('progress_key, progress_data')
            .eq('student_id', student.id);
        const snapshot: Record<string, unknown> = {};
        for (const row of progressRows ?? []) snapshot[row.progress_key] = row.progress_data;
        snapshot.profile = {
            nickname: profileRow.nickname,
            bio: profileRow.bio,
            avatar: profileRow.avatar_url,
            banner: profileRow.banner_url,
            links: profileRow.links,
            frame: profileRow.frame
        };

        const { data: existing } = await client
            .from('student_badges')
            .select('badge_id, kind, auto_earned, manual_granted')
            .eq('student_id', student.id);
        /* Chỉ badge đã đạt TỰ ĐỘNG mới chặn việc tính lại. Badge trao tay
           (manual_granted) không thay thế kết quả tự động. */
        const already = new Set<string>((existing ?? [])
            .filter((r) => r.auto_earned || r.kind === 'auto')
            .map((r) => r.badge_id));
        const existingIds = new Set<string>((existing ?? []).map((r) => r.badge_id));

        const metrics = computeMetrics(snapshot as StudentSnapshot);
        const fresh = badgesEarned(BADGE_CATALOG, metrics, already);
        if (fresh.length) {
            const stamp = new Date().toISOString();
            const rows = fresh.map((b) => ({
                student_id: student.id,
                badge_id: b.id,
                kind: 'auto',
                auto_earned: true,
                manual_granted: false,
                awarded_at: stamp,
                awarded_by: null,
                reason: '',
                evidence: { metric: b.metric, goal: b.goal, value: metrics[b.metric || ''] ?? 0 }
            }));
            /* Dòng đã tồn tại do Administrator trao tay: chỉ bật auto_earned,
               giữ nguyên người trao, lý do và manual_granted. */
            const promote = fresh.filter((b) => existingIds.has(b.id)).map((b) => b.id);
            const insertRows = rows.filter((r) => !existingIds.has(r.badge_id));
            if (insertRows.length) {
                const { error: insertError } = await client
                    .from('student_badges')
                    .upsert(insertRows, { onConflict: 'student_id,badge_id', ignoreDuplicates: true });
                if (insertError) return fail(500, 'BADGE_WRITE_FAILED', 'Không lưu được thành tích.');
            }
            if (promote.length) {
                const { error: promoteError } = await client
                    .from('student_badges')
                    .update({ auto_earned: true })
                    .eq('student_id', student.id)
                    .in('badge_id', promote);
                if (promoteError) return fail(500, 'BADGE_WRITE_FAILED', 'Không lưu được thành tích.');
            }
            earned = fresh.map((b) => b.id);
        }
    }

    // ---- Trạng thái cuối cùng ------------------------------------------
    const { data: badges } = await client
        .from('student_badges')
        .select('badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason')
        .eq('student_id', student.id)
        .order('awarded_at', { ascending: true });

    const rows = (badges ?? []).filter((b) => BADGE_BY_ID[b.badge_id] && (b.auto_earned || b.manual_granted || b.kind));
    const catalogHash = (await sha256Hex(BADGE_CATALOG.map((b) => b.id).join(','))).slice(0, 12);

    return json({
        ok: true,
        catalogVersion: '3.6.0-' + catalogHash,
        profile: {
            nickname: profileRow.nickname || '',
            bio: profileRow.bio || '',
            avatar: profileRow.avatar_url || '',
            banner: profileRow.banner_url || '',
            frame: profileRow.frame || 'none',
            links: Array.isArray(profileRow.links) ? profileRow.links : [],
            prefs: (profileRow.prefs && typeof profileRow.prefs === 'object') ? profileRow.prefs : {},
            updatedAt: new Date(profileRow.updated_at).getTime()
        },
        frameRejected,
        frames: framesFromBadges(rows.filter((b) => b.auto_earned || b.manual_granted), BADGE_CATALOG),
        badges: rows,
        earned,
        serverTime: new Date().toISOString()
    });
});

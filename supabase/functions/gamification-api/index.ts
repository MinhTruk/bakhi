// gamification-api — cổng duy nhất giữa trình duyệt và hệ thống tiến trình 8.3.0.
//
// Trình duyệt KHÔNG BAO GIỜ ghi thẳng bảng gamification: mọi bảng người dùng
// chỉ có policy SELECT. Hàm này xác minh phiên thiết bị → student_id rồi gọi
// các hàm bk_gam_* (chạy trong một transaction ở Postgres) bằng service_role.
//
// Vì vậy XP, cấp độ, thành tựu, nhiệm vụ và vật phẩm luôn nhất quán: nếu một
// bước lỗi, cả giao dịch bị huỷ; client không thể tự quyết định phần thưởng.
//
// Hai nhóm hành động:
//   · Học sinh (Authorization: phiên Anonymous Auth của thiết bị)
//   · Quản trị (x-admin-token từ admin-auth; scope admin/founder kiểm tra lại)
import { json, fail, preflight, readJson, sha256Hex } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';

const ACTIVITIES = [
    'quiz_completed', 'lesson_study', 'listening_completed', 'revision_session',
    'mistake_mastered', 'goal_completed'
];

const MAX_TEXT = 400;
const MAX_ANSWERS = 50;

interface Student {
    id: string;
    display_name: string;
}

function str(v: unknown, max: number): string {
    return String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

/** Mã do con người đọc: chữ thường, số, '_' hoặc '-'. Tự tạo từ tên ở dashboard. */
function codeOf(v: unknown): string {
    return str(v, 64)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '')
        .slice(0, 64);
}

/** Bỏ dấu tiếng Việt để Founder tìm học sinh không cần gõ đúng dấu. */
function normalizeName(v: unknown): string {
    return str(v, 80)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function uuidish(v: unknown): string {
    const s = str(v, 60);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : '';
}

/** Khoá idempotency do máy khách tạo; chỉ cho ký tự an toàn để chống bơm dữ liệu. */
function idemKey(v: unknown, fallbackPrefix: string): string {
    const s = str(v, 120).replace(/[^A-Za-z0-9:._-]/g, '');
    return s.length >= 8 ? s : '';
}

async function resolveStudent(client: ReturnType<typeof adminClient>, authUserId: string): Promise<Student | null> {
    const { data: device } = await client
        .from('student_devices')
        .select('student_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
    if (!device) return null;
    const { data: student } = await client
        .from('students')
        .select('id, display_name, is_active')
        .eq('id', device.student_id)
        .maybeSingle();
    if (!student || !student.is_active) return null;
    return { id: student.id as string, display_name: student.display_name as string };
}

async function state(client: ReturnType<typeof adminClient>, studentId: string) {
    const { data, error } = await client.rpc('bk_gam_state', { p_student: studentId });
    if (error) throw new Error('STATE_ERROR');
    const out = (data ?? {}) as Record<string, unknown>;
    /* 8.3.6: buff XP đang hiệu lực để trang Tiến trình hiển thị và client biết
       vì sao XP nhận được cao hơn cấu hình. Máy chủ vẫn là nơi áp dụng. */
    try {
        const { data: buffs } = await client.rpc('bk_gam_active_buffs', { p_student: studentId });
        const list = Array.isArray(buffs) ? buffs : [];
        out.buffs = list;
        out.xp_buff = list.reduce(function (max: number, b: { multiplier?: number }) {
            return Math.max(max, Number(b && b.multiplier) || 1);
        }, 1);
    } catch (_e) {
        out.buffs = [];
        out.xp_buff = 1;
    }

    /* 8.3.8: chi tiết điều kiện (cấp độ, nhiệm vụ, thành tựu, node trước),
       toạ độ cây và số lượng vật phẩm. Không thay đổi bk_gam_state cũ nên
       trang Tiến trình vẫn chạy nếu hàm chi tiết chưa được deploy. */
    try {
        const { data: details } = await client.rpc('bk_gam_details', { p_student: studentId });
        const d = (details && typeof details === 'object') ? details as Record<string, unknown> : {};
        out.branch_defs = d.branch_defs ?? [];
        out.skill_summary = d.skill_summary ?? {};

        const nodeMap: Record<string, Record<string, unknown>> = {};
        (Array.isArray(d.node_details) ? d.node_details : []).forEach(function (row) {
            const item = row as Record<string, unknown>;
            if (item && item.id) nodeMap[String(item.id)] = item;
        });
        (Array.isArray(out.nodes) ? out.nodes as Array<Record<string, unknown>> : []).forEach(function (n) {
            const extra = nodeMap[String(n.id)];
            if (extra) Object.assign(n, extra);
        });

        const achMap: Record<string, Record<string, unknown>> = {};
        (Array.isArray(d.achievement_details) ? d.achievement_details : []).forEach(function (row) {
            const item = row as Record<string, unknown>;
            if (item && item.id) achMap[String(item.id)] = item;
        });
        (Array.isArray(out.achievements) ? out.achievements as Array<Record<string, unknown>> : []).forEach(function (a) {
            const extra = achMap[String(a.id)];
            if (extra) Object.assign(a, extra);
        });

        const qty: Record<string, number> = {};
        (Array.isArray(d.items) ? d.items : []).forEach(function (row) {
            const item = row as Record<string, unknown>;
            if (item && item.item_id) qty[String(item.item_id)] = Number(item.quantity) || 1;
        });
        (Array.isArray(out.inventory) ? out.inventory as Array<Record<string, unknown>> : []).forEach(function (i) {
            i.quantity = qty[String(i.item_id)] || 1;
        });
        (Array.isArray(out.catalog) ? out.catalog as Array<Record<string, unknown>> : []).forEach(function (c) {
            const meta = (c.metadata && typeof c.metadata === 'object') ? c.metadata as Record<string, unknown> : {};
            c.quantity = qty[String(c.item_id)] || 0;
            c.max_quantity = Number(meta.max_quantity) || 0;
            c.how = String(meta.how || '');
            c.use = String(meta.use || '');
        });
    } catch (_e) {
        out.branch_defs = out.branch_defs || [];
        out.skill_summary = out.skill_summary || {};
    }

    return out;
}

/* ---------------------- Đối tượng nhận buff / đặt cấp ---------------------- */
type Audience =
    | { kind: 'all' }
    | { kind: 'student'; student_id: string }
    | { kind: 'level'; min: number; max: number };

function cleanAudience(v: unknown): Audience | null {
    const a = (v && typeof v === 'object') ? v as Record<string, unknown> : null;
    if (!a) return null;
    const kind = str(a.kind, 12);
    if (kind === 'all') return { kind: 'all' };
    if (kind === 'student') {
        const id = uuidish(a.student_id);
        return id ? { kind: 'student', student_id: id } : null;
    }
    if (kind === 'level') {
        const min = Math.max(1, Math.min(1000, Number(a.min) || 1));
        const max = Math.max(min, Math.min(1000, Number(a.max) || 1000));
        return { kind: 'level', min, max };
    }
    return null;
}

interface AudienceRow {
    id: string;
    display_name: string;
    level: number;
}

async function audienceStudents(
    client: ReturnType<typeof adminClient>,
    audience: Audience
): Promise<AudienceRow[]> {
    const select = 'id, display_name, user_progression(level)';
    if (audience.kind === 'student') {
        const { data } = await client.from('students').select(select)
            .eq('is_active', true).eq('id', audience.student_id);
        const row = (data ?? [])[0] as Record<string, unknown> | undefined;
        return row ? [toAudienceRow(row)] : [];
    }
    const { data } = await client.from('students').select(select)
        .eq('is_active', true).order('display_name').limit(2000);
    const rows = (data ?? []).map(function (r: Record<string, unknown>) { return toAudienceRow(r); });
    if (audience.kind === 'all') return rows;
    return rows.filter(function (r: AudienceRow) { return r.level >= audience.min && r.level <= audience.max; });
}

function toAudienceRow(raw: Record<string, unknown>): AudienceRow {
    const prog = raw.user_progression;
    const first = Array.isArray(prog) ? prog[0] : prog;
    const level = Number((first && (first as Record<string, unknown>).level) || 1);
    return {
        id: String(raw.id || ''),
        display_name: String(raw.display_name || ''),
        level: Number.isFinite(level) ? level : 1
    };
}

async function configOf(client: ReturnType<typeof adminClient>) {
    const { data } = await client
        .from('gamification_config')
        .select('xp_rules, level_curve, feature_flags, season, updated_at')
        .eq('id', true)
        .maybeSingle();
    return data ?? {};
}

async function limited(client: ReturnType<typeof adminClient>, key: string, limit: number, windowSeconds: number) {
    const { data, error } = await client.rpc('bakhi_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds
    });
    if (error) throw new Error('RATE_LIMIT_ERROR');
    return !!data;
}

/** Phiên quản trị + scope. Không tin scope do trình duyệt gửi. */
async function adminScope(client: ReturnType<typeof adminClient>, req: Request) {
    const token = (req.headers.get('x-admin-token') ?? '').trim();
    if (!token || token.length < 20) return null;
    const hash = await sha256Hex(token);
    const { data } = await client
        .from('admin_sessions')
        .select('id, expires_at, scope')
        .eq('token_hash', hash)
        .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    await client.from('admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return { id: data.id as string, scope: data.scope === 'founder' ? 'founder' : 'admin' };
}

async function audit(
    client: ReturnType<typeof adminClient>,
    action: string,
    detail: Record<string, unknown>,
    actor = 'admin',
    actorKind = 'admin',
    studentId: string | null = null
) {
    await client.from('gamification_activity_logs').insert({
        student_id: studentId,
        actor_kind: actorKind,
        actor_label: actor.slice(0, 120),
        action,
        detail
    });
    await client.from('admin_activity_logs').insert({
        action: 'gamification.' + action,
        target_type: studentId ? 'student' : 'gamification',
        target_id: studentId,
        detail
    });
}

/** Hồ sơ ngắn của một học sinh — dùng cho các thẻ Founder. */
async function studentBrief(client: ReturnType<typeof adminClient>, id: string) {
    const { data } = await client
        .from('students')
        .select('id, display_name, student_code, is_founder, user_progression(total_xp, level)')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const prog = row.user_progression;
    const first = Array.isArray(prog) ? prog[0] : prog;
    return {
        id: String(row.id),
        display_name: String(row.display_name || ''),
        student_code: String(row.student_code || ''),
        is_founder: !!row.is_founder,
        level: Number((first && (first as Record<string, unknown>).level) || 1),
        total_xp: Number((first && (first as Record<string, unknown>).total_xp) || 0)
    };
}

/** Chu trình trong quan hệ node tiên quyết — chặn cấu hình làm hỏng cây. */
function hasCycle(nodes: Array<{ id: string; requires: string[] }>): string {
    const map: Record<string, string[]> = {};
    nodes.forEach(function (n) { map[n.id] = n.requires || []; });
    const state: Record<string, number> = {};  // 1 = đang đi, 2 = xong
    let found = '';
    function walk(id: string): boolean {
        if (state[id] === 1) { found = id; return true; }
        if (state[id] === 2) return false;
        state[id] = 1;
        const next = map[id] || [];
        for (const req of next) {
            if (!map[req]) continue;
            if (walk(req)) return true;
        }
        state[id] = 2;
        return false;
    }
    for (const id of Object.keys(map)) {
        if (walk(id)) return found || id;
    }
    return '';
}

function cleanIdList(v: unknown, max: number): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const raw of v.slice(0, max)) {
        const id = codeOf(raw);
        if (id && out.indexOf(id) < 0) out.push(id);
    }
    return out;
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const client = adminClient();
    const body = await readJson<Record<string, unknown>>(req);
    const action = str(body.action, 60);
    if (!action) return fail(400, 'NO_ACTION', 'Thiếu hành động.');

    /* ----------------------------- Học sinh ----------------------------- */
    if (!action.startsWith('admin.')) {
        const caller = await callerUserId(req);
        if (caller instanceof Response) return caller;

        const student = await resolveStudent(client, caller.userId);
        if (!student) return fail(409, 'NOT_BOUND', 'Thiết bị chưa được gắn với học sinh nào.');

        try {
            const allowed = await limited(client, 'gamification:' + student.id, 240, 60);
            if (!allowed) return fail(429, 'RATE_LIMITED', 'Bạn thao tác hơi nhanh, thử lại sau một phút.');
        } catch {
            return fail(500, 'RATE_LIMIT_ERROR', 'Không kiểm tra được giới hạn tốc độ.');
        }

        switch (action) {
            case 'state': {
                await client.rpc('bk_gam_sync_missions', { p_student: student.id });
                return json({ ok: true, state: await state(client, student.id), config: await configOf(client), serverTime: new Date().toISOString() });
            }

            case 'event': {
                const activity = str(body.activity, 48);
                if (ACTIVITIES.indexOf(activity) < 0) {
                    return fail(400, 'BAD_ACTIVITY', 'Loại hoạt động không được thưởng XP.');
                }
                const source = str(body.source_id, 200);
                const key = idemKey(body.idempotency_key, activity);
                if (!key) return fail(400, 'NO_IDEMPOTENCY', 'Thiếu khoá chống trùng.');

                const { data: award, error } = await client.rpc('bk_gam_award', {
                    p_student: student.id,
                    p_activity: activity,
                    p_source: source,
                    p_key: key,
                    p_depth: 0
                });
                if (error) return fail(500, 'AWARD_ERROR', 'Không ghi được giao dịch XP.');

                const { data: evaluation } = await client.rpc('bk_gam_evaluate', {
                    p_student: student.id,
                    p_depth: 0
                });

                return json({
                    ok: true,
                    award,
                    evaluation: evaluation ?? {},
                    state: await state(client, student.id)
                });
            }

            case 'mission.claim': {
                const id = uuidish(body.user_mission_id);
                if (!id) return fail(400, 'BAD_ID', 'Mã nhiệm vụ không hợp lệ.');
                const { data, error } = await client.rpc('bk_gam_claim', {
                    p_student: student.id,
                    p_user_mission: id
                });
                if (error) return fail(500, 'CLAIM_ERROR', 'Không nhận được thưởng nhiệm vụ.');
                if (data && data.ok === false) {
                    const code = String(data.code || 'CLAIM_FAILED');
                    const messages: Record<string, string> = {
                        NOT_FOUND: 'Không tìm thấy nhiệm vụ của bạn.',
                        ALREADY_CLAIMED: 'Nhiệm vụ này đã được nhận thưởng.',
                        NOT_COMPLETED: 'Nhiệm vụ chưa hoàn thành.'
                    };
                    return fail(409, code, messages[code] || 'Không nhận được thưởng.');
                }
                return json({ ok: true, claim: data, state: await state(client, student.id) });
            }

            case 'boss.start': {
                const slug = str(body.slug, 64);
                if (!slug) return fail(400, 'BAD_SLUG', 'Thiếu mã thử thách.');
                const { data, error } = await client.rpc('bk_gam_boss_start', {
                    p_student: student.id,
                    p_slug: slug
                });
                if (error) return fail(500, 'BOSS_ERROR', 'Không mở được thử thách.');
                if (data && data.ok === false) {
                    const messages: Record<string, string> = {
                        NOT_FOUND: 'Thử thách không tồn tại hoặc đã đóng.',
                        CLOSED: 'Thử thách đã đóng.',
                        NO_ATTEMPTS_LEFT: 'Bạn đã dùng hết số lần thử.',
                        NO_QUESTIONS: 'Thử thách chưa có câu hỏi.'
                    };
                    return fail(409, String(data.code), messages[String(data.code)] || 'Không mở được thử thách.');
                }
                return json({ ok: true, challenge: data.challenge, questions: data.questions });
            }

            case 'boss.submit': {
                const slug = str(body.slug, 64);
                const key = idemKey(body.idempotency_key, 'boss');
                if (!slug || !key) return fail(400, 'BAD_REQUEST', 'Thiếu mã thử thách hoặc khoá chống trùng.');
                const answers = Array.isArray(body.answers) ? body.answers.slice(0, MAX_ANSWERS) : [];
                const clean = answers
                    .map((a) => ({
                        question_id: uuidish((a as Record<string, unknown>)?.question_id),
                        choice: Number((a as Record<string, unknown>)?.choice)
                    }))
                    .filter((a) => a.question_id && Number.isInteger(a.choice) && a.choice >= 0 && a.choice <= 9);

                const { data, error } = await client.rpc('bk_gam_boss_submit', {
                    p_student: student.id,
                    p_slug: slug,
                    p_answers: clean,
                    p_key: 'boss:' + key
                });
                if (error) return fail(500, 'BOSS_ERROR', 'Không chấm được thử thách.');
                if (data && data.ok === false) {
                    return fail(409, String(data.code || 'BOSS_FAILED'), 'Không nộp được thử thách.');
                }
                return json({ ok: true, result: data, state: await state(client, student.id) });
            }

            case 'equip': {
                const item = str(body.item_id, 64);
                if (!item) return fail(400, 'BAD_ITEM', 'Thiếu vật phẩm.');
                const { data, error } = await client.rpc('bk_gam_equip', {
                    p_student: student.id,
                    p_item: item,
                    p_equip: body.equipped !== false
                });
                if (error) return fail(500, 'EQUIP_ERROR', 'Không đổi được vật phẩm.');
                if (data && data.ok === false) return fail(403, 'NOT_OWNED', 'Bạn chưa sở hữu vật phẩm này.');
                /* 8.3.5: khung avatar ghi luôn student_profiles.frame trong cùng
                   transaction; trả về giá trị máy chủ để client cập nhật cache. */
                return json({
                    ok: true,
                    kind: (data && data.kind) || null,
                    frame: (data && data.frame) || null,
                    state: await state(client, student.id)
                });
            }

            case 'history': {
                const limit = Math.min(50, Math.max(1, Number(body.limit) || 20));
                const offset = Math.max(0, Number(body.offset) || 0);
                const { data, count } = await client
                    .from('xp_transactions')
                    .select('id, activity_type, source_id, amount, status, created_at', { count: 'exact' })
                    .eq('student_id', student.id)
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                return json({ ok: true, rows: data ?? [], total: count ?? 0, limit, offset });
            }

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Hành động không hợp lệ.');
        }
    }

    /* ----------------------------- Quản trị ----------------------------- */
    const admin = await adminScope(client, req);
    if (!admin) return fail(401, 'NO_ADMIN_SESSION', 'Phiên quản trị không hợp lệ hoặc đã hết hạn.');

    const scope = admin.scope;
    /* Chỉ Founder được điều chỉnh XP, trao phần thưởng và xem toàn bộ nhật ký. */
    const founderOnly = new Set([
        'admin.xp.adjust', 'admin.logs', 'admin.students.list',
        'admin.items.grant', 'admin.achievements.grant',
        'admin.skilltree.grant', 'admin.grants.history'
    ]);

    switch (action) {
        case 'admin.overview': {
            const [{ count: xpRows }, { count: achRows }, { count: missionRows }, { count: bossRows }, { count: itemRows }] =
                await Promise.all([
                    client.from('xp_transactions').select('id', { count: 'exact', head: true }),
                    client.from('user_achievements').select('student_id', { count: 'exact', head: true }).not('unlocked_at', 'is', null),
                    client.from('user_missions').select('id', { count: 'exact', head: true }).eq('status', 'claimed'),
                    client.from('boss_attempts').select('id', { count: 'exact', head: true }),
                    client.from('user_inventory').select('id', { count: 'exact', head: true })
                ]);
            const { data: top } = await client
                .from('user_progression')
                .select('student_id, total_xp, level, students(display_name)')
                .order('total_xp', { ascending: false })
                .limit(10);
            const { data: recent } = await client
                .from('gamification_activity_logs')
                .select('id, student_id, actor_kind, actor_label, action, detail, created_at')
                .order('created_at', { ascending: false })
                .limit(20);
            const cfg = await configOf(client);
            return json({
                ok: true,
                scope,
                counts: { xp: xpRows ?? 0, achievements: achRows ?? 0, missions: missionRows ?? 0, boss: bossRows ?? 0, items: itemRows ?? 0 },
                top: top ?? [],
                recent: recent ?? [],
                config: cfg
            });
        }

        case 'admin.config.get': {
            const cfg = await configOf(client);
            return json({ ok: true, config: cfg });
        }

        case 'admin.config.set': {
            const patch: Record<string, unknown> = {};
            if (body.xp_rules && typeof body.xp_rules === 'object') patch.xp_rules = body.xp_rules;
            if (body.feature_flags && typeof body.feature_flags === 'object') patch.feature_flags = body.feature_flags;
            if (body.season && typeof body.season === 'object') patch.season = body.season;
            if (!Object.keys(patch).length) return fail(400, 'NOTHING_TO_SAVE', 'Không có thay đổi.');
            patch.updated_at = new Date().toISOString();
            const { error } = await client.from('gamification_config').update(patch).eq('id', true);
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được cấu hình.');
            await audit(client, 'config_set', { keys: Object.keys(patch) }, 'admin:' + scope);
            return json({ ok: true, config: await configOf(client) });
        }

        case 'admin.defs.list': {
            const [nodes, achievements, missions, rewards, challenges, branches] = await Promise.all([
                client.from('skill_tree_nodes').select('*').order('sort_order'),
                client.from('achievement_defs').select('*').order('sort_order'),
                client.from('mission_defs').select('*').order('cadence').order('sort_order'),
                client.from('reward_catalog').select('*').order('sort_order'),
                client.from('boss_challenges').select('*, boss_questions(count)').order('created_at', { ascending: false }),
                client.from('skill_branches').select('*').order('sort_order')
            ]);
            return json({
                ok: true,
                nodes: nodes.data ?? [],
                achievements: achievements.data ?? [],
                missions: missions.data ?? [],
                rewards: rewards.data ?? [],
                challenges: challenges.data ?? [],
                branches: branches.data ?? []
            });
        }

        case 'admin.node.save': {
            const node = body.node as Record<string, unknown> | undefined;
            if (!node) return fail(400, 'BAD_NODE', 'Thiếu dữ liệu node.');
            const id = codeOf(node.id);
            if (!id) return fail(400, 'BAD_ID', 'Mã node không hợp lệ.');
            const branch = codeOf(node.branch);
            if (!branch) return fail(400, 'BAD_BRANCH', 'Thiếu nhánh kỹ năng. Hãy tạo nhánh trước khi thêm node.');
            const { data: branchRow } = await client.from('skill_branches')
                .select('id').eq('id', branch).maybeSingle();
            if (!branchRow) {
                return fail(400, 'BAD_BRANCH',
                    'Nhánh “' + branch + '” chưa tồn tại. Hãy tạo nhánh trong thẻ “Nhánh kỹ năng” trước.');
            }
            const requires = cleanIdList(node.requires, 12);
            if (requires.indexOf(id) >= 0) {
                return fail(400, 'SELF_REQUIRE', 'Node không thể yêu cầu chính nó.');
            }
            const row = {
                id,
                branch,
                name: str(node.name, 120),
                description: str(node.description, 600),
                icon: str(node.icon, 60) || 'fa-circle-nodes',
                metric: str(node.metric, 48),
                target: Math.max(1, Math.min(100000, Number(node.target) || 1)),
                requires,
                required_missions: cleanIdList(node.required_missions, 8),
                required_achievements: cleanIdList(node.required_achievements, 8),
                min_level: Math.max(1, Math.min(1000, Number(node.min_level) || 1)),
                pos_x: Math.max(-4000, Math.min(4000, Math.round(Number(node.pos_x) || 0))),
                pos_y: Math.max(-4000, Math.min(4000, Math.round(Number(node.pos_y) || 0))),
                reward: (node.reward && typeof node.reward === 'object') ? node.reward : {},
                sort_order: Number(node.sort_order) || 0,
                is_active: node.is_active !== false
            };
            if (!row.name || !row.metric) return fail(400, 'INCOMPLETE', 'Node cần tên và chỉ số.');

            /* Chặn vòng lặp điều kiện trước khi ghi: cây hỏng sẽ khoá toàn bộ
               node phía sau và không có cách nào tự sửa từ giao diện học sinh. */
            const { data: allNodes } = await client.from('skill_tree_nodes')
                .select('id, requires, is_active').eq('is_active', true);
            const graph = (allNodes ?? []).map(function (n: Record<string, unknown>) {
                return {
                    id: String(n.id),
                    requires: Array.isArray(n.requires) ? (n.requires as string[]).map(String) : []
                };
            }).filter(function (n) { return n.id !== id; });
            graph.push({ id, requires });
            const cycle = hasCycle(graph);
            if (cycle) {
                return fail(400, 'CYCLE',
                    'Điều kiện tạo vòng lặp quanh node “' + cycle +
                    '”. Hãy bỏ một node tiên quyết để cây vẫn mở được.');
            }

            if (body.expect_new) {
                const { data: existing } = await client.from('skill_tree_nodes')
                    .select('id').eq('id', id).maybeSingle();
                if (existing) {
                    return fail(409, 'CODE_TAKEN',
                        'Mã “' + id + '” đã được dùng cho một node khác. Hãy chọn mã khác.');
                }
            }

            const { error } = await client.from('skill_tree_nodes').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được node: ' + error.message);
            await audit(client, 'node_save', { id, branch, min_level: row.min_level }, 'admin:' + scope);
            return json({ ok: true, id });
        }

        case 'admin.node.delete': {
            const id = codeOf(body.id);
            if (!id) return fail(400, 'BAD_ID', 'Thiếu mã node.');
            const { count: usedCount } = await client.from('user_skill_progress')
                .select('student_id', { count: 'exact', head: true })
                .eq('node_id', id).eq('status', 'completed');
            if ((usedCount ?? 0) > 0) {
                const { error } = await client.from('skill_tree_nodes')
                    .update({ is_active: false }).eq('id', id);
                if (error) return fail(500, 'DELETE_ERROR', 'Không lưu trữ được node.');
                await audit(client, 'node_archived', { id }, 'admin:' + scope);
                return json({ ok: true, archived: true });
            }
            const { error } = await client.from('skill_tree_nodes').delete().eq('id', id);
            if (error) return fail(500, 'DELETE_ERROR', 'Không xoá được node.');
            await audit(client, 'node_delete', { id }, 'admin:' + scope);
            return json({ ok: true, archived: false });
        }

        case 'admin.branch.save': {
            const b = body.branch as Record<string, unknown> | undefined;
            if (!b) return fail(400, 'BAD_BRANCH', 'Thiếu dữ liệu nhánh.');
            const id = codeOf(b.id || b.name);
            if (!id) return fail(400, 'BAD_ID', 'Mã nhánh không hợp lệ.');
            const row = {
                id,
                name: str(b.name, 80),
                description: str(b.description, 300),
                icon: str(b.icon, 60) || 'fa-circle-nodes',
                sort_order: Number(b.sort_order) || 0,
                is_active: b.is_active !== false
            };
            if (!row.name) return fail(400, 'INCOMPLETE', 'Nhánh cần tên.');
            const { error } = await client.from('skill_branches').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được nhánh: ' + error.message);
            await audit(client, 'branch_save', { id }, 'admin:' + scope);
            return json({ ok: true, id });
        }

        case 'admin.branch.delete': {
            const id = codeOf(body.id);
            if (!id) return fail(400, 'BAD_ID', 'Thiếu mã nhánh.');
            const { data: nodes } = await client.from('skill_tree_nodes')
                .select('id').eq('branch', id).eq('is_active', true).limit(1);
            if ((nodes ?? []).length) {
                return fail(409, 'BRANCH_IN_USE',
                    'Nhánh còn node đang bật. Hãy chuyển hoặc tắt các node trước khi xoá nhánh.');
            }
            const { error } = await client.from('skill_branches')
                .update({ is_active: false }).eq('id', id);
            if (error) return fail(500, 'DELETE_ERROR', 'Không lưu trữ được nhánh.');
            await audit(client, 'branch_archived', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.skilltree.validate': {
            const { data, error } = await client.rpc('bk_gam_tree_issues', {});
            if (error) return fail(500, 'VALIDATE_ERROR', 'Không kiểm tra được cấu trúc cây.');
            const issues = Array.isArray(data) ? data : [];
            return json({
                ok: true,
                issues,
                errors: issues.filter(function (i: Record<string, unknown>) { return i.severity === 'error'; }).length,
                warnings: issues.filter(function (i: Record<string, unknown>) { return i.severity === 'warning'; }).length
            });
        }

        case 'admin.achievement.save': {
            const a = body.achievement as Record<string, unknown> | undefined;
            if (!a) return fail(400, 'BAD_ACHIEVEMENT', 'Thiếu dữ liệu thành tựu.');
            const id = codeOf(a.id);
            if (!id) return fail(400, 'BAD_ID', 'Mã thành tựu không hợp lệ.');
            const row = {
                id,
                name: str(a.name, 120),
                description: str(a.description, 600),
                icon: str(a.icon, 60) || 'fa-medal',
                rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(str(a.rarity, 20)) >= 0 ? str(a.rarity, 20) : 'common',
                category: str(a.category, 20),
                conditions: Array.isArray(a.conditions) ? a.conditions.slice(0, 5).map((c) => ({
                    metric: str((c as Record<string, unknown>).metric, 48),
                    target: Math.max(1, Math.min(100000, Number((c as Record<string, unknown>).target) || 1))
                })) : [],
                stages: Math.max(1, Math.min(10, Number(a.stages) || 1)),
                reward: (a.reward && typeof a.reward === 'object') ? a.reward : {},
                is_hidden: !!a.is_hidden,
                is_repeatable: !!a.is_repeatable,
                is_active: a.is_active !== false,
                sort_order: Number(a.sort_order) || 0
            };
            if (!row.name || !row.conditions.length) return fail(400, 'INCOMPLETE', 'Thành tựu cần tên và điều kiện.');
            if (body.expect_new) {
                const { data: existing } = await client.from('achievement_defs')
                    .select('id').eq('id', id).maybeSingle();
                if (existing) {
                    return fail(409, 'CODE_TAKEN',
                        'Mã “' + id + '” đã được dùng cho một thành tựu khác. Hãy chọn mã khác.');
                }
            }
            const { error } = await client.from('achievement_defs').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được thành tựu: ' + error.message);
            await audit(client, 'achievement_save', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.achievement.delete': {
            /* Xoá cứng chỉ khi chưa ai nhận. Nếu đã có lịch sử, hướng dẫn
               quản trị viên chuyển sang Lưu trữ (is_active = false). */
            const id = codeOf(body.id);
            if (!id) return fail(400, 'BAD_ID', 'Thiếu mã thành tựu.');
            const { count } = await client.from('user_achievements')
                .select('student_id', { count: 'exact', head: true })
                .eq('achievement_id', id).not('unlocked_at', 'is', null);
            if ((count ?? 0) > 0) {
                return fail(409, 'IN_USE',
                    'Đã có ' + count + ' học sinh nhận thành tựu này nên không thể xoá. ' +
                    'Hãy dùng “Lưu trữ” để ẩn khỏi người học mà vẫn giữ lịch sử.');
            }
            const { error } = await client.from('achievement_defs').delete().eq('id', id);
            if (error) return fail(500, 'DELETE_ERROR', 'Không xoá được thành tựu.');
            await audit(client, 'achievement_delete', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.mission.save': {
            const m = body.mission as Record<string, unknown> | undefined;
            if (!m) return fail(400, 'BAD_MISSION', 'Thiếu dữ liệu nhiệm vụ.');
            const id = codeOf(m.id);
            if (!id) return fail(400, 'BAD_ID', 'Mã nhiệm vụ không hợp lệ.');
            const row = {
                id,
                name: str(m.name, 120),
                description: str(m.description, 600),
                category: str(m.category, 20) || 'learning',
                difficulty: ['easy', 'normal', 'hard'].indexOf(str(m.difficulty, 10)) >= 0 ? str(m.difficulty, 10) : 'normal',
                metric: str(m.metric, 48),
                target: Math.max(1, Math.min(100000, Number(m.target) || 1)),
                cadence: str(m.cadence, 10) === 'weekly' ? 'weekly' : 'daily',
                reward: (m.reward && typeof m.reward === 'object') ? m.reward : {},
                min_level: Math.max(1, Math.min(1000, Number(m.min_level) || 1)),
                is_active: m.is_active !== false,
                sort_order: Number(m.sort_order) || 0
            };
            if (!row.name || !row.metric) return fail(400, 'INCOMPLETE', 'Nhiệm vụ cần tên và chỉ số.');
            const { error } = await client.from('mission_defs').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được nhiệm vụ: ' + error.message);
            await audit(client, 'mission_save', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.reward.save': {
            const r = body.reward as Record<string, unknown> | undefined;
            if (!r) return fail(400, 'BAD_REWARD', 'Thiếu dữ liệu phần thưởng.');
            const id = codeOf(r.id);
            if (!id) return fail(400, 'BAD_ID', 'Mã phần thưởng không hợp lệ.');
            const kinds = ['badge', 'title', 'frame', 'theme', 'background', 'decoration', 'xp_bonus'];
            const kind = str(r.kind, 20);
            if (kinds.indexOf(kind) < 0) return fail(400, 'BAD_KIND', 'Loại phần thưởng không hợp lệ.');
            const row = {
                id, kind,
                name: str(r.name, 120),
                description: str(r.description, 600),
                icon: str(r.icon, 60) || 'fa-gift',
                rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(str(r.rarity, 20)) >= 0 ? str(r.rarity, 20) : 'common',
                metadata: (r.metadata && typeof r.metadata === 'object') ? r.metadata : {},

                is_active: r.is_active !== false,
                sort_order: Number(r.sort_order) || 0
            };
            if (!row.name) return fail(400, 'INCOMPLETE', 'Phần thưởng cần tên.');
            const { error } = await client.from('reward_catalog').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được phần thưởng: ' + error.message);
            await audit(client, 'reward_save', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.challenge.save': {
            const c = body.challenge as Record<string, unknown> | undefined;
            if (!c) return fail(400, 'BAD_CHALLENGE', 'Thiếu dữ liệu thử thách.');
            const slug = codeOf(c.slug);
            if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(slug)) {
                return fail(400, 'BAD_SLUG',
                    'Mã thử thách phải từ 3 ký tự, bắt đầu bằng chữ/số, chỉ gồm chữ thường, số, _ hoặc -.');
            }
            if (body.expect_new) {
                const { data: existing } = await client.from('boss_challenges')
                    .select('slug').eq('slug', slug).maybeSingle();
                if (existing) {
                    return fail(409, 'CODE_TAKEN',
                        'Mã “' + slug + '” đã được dùng cho một thử thách khác. Hãy chọn mã khác.');
                }
            }
            const questions = Array.isArray(c.questions) ? c.questions.slice(0, 40) : [];
            if (!questions.length) return fail(400, 'NO_QUESTIONS', 'Thử thách cần ít nhất một câu hỏi.');
            const cleanQuestions = questions.map((q, i) => {
                const item = q as Record<string, unknown>;
                const options = Array.isArray(item.options) ? item.options.map((o) => str(o, 400)).filter(Boolean) : [];
                return {
                    prompt: str(item.prompt, 2000),
                    options,
                    correct_index: Number(item.correct_index),
                    explanation: str(item.explanation, 2000),
                    sort_order: i
                };
            });
            for (const q of cleanQuestions) {
                if (!q.prompt || q.options.length < 2 || q.options.length > 6) {
                    return fail(400, 'BAD_QUESTION', 'Mỗi câu hỏi cần nội dung và 2–6 phương án.');
                }
                if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index >= q.options.length) {
                    return fail(400, 'BAD_ANSWER', 'Đáp án đúng phải nằm trong danh sách phương án.');
                }
            }

            const row = {
                slug,
                name: str(c.name, 120),
                description: str(c.description, 2000),
                kind: ['subject', 'chapter', 'knowledge', 'revision', 'weekly'].indexOf(str(c.kind, 20)) >= 0 ? str(c.kind, 20) : 'subject',
                subject: str(c.subject, 40),
                chapter: str(c.chapter, 120),
                difficulty: ['easy', 'normal', 'hard'].indexOf(str(c.difficulty, 10)) >= 0 ? str(c.difficulty, 10) : 'normal',
                pass_score: Math.max(1, Math.min(100, Number(c.pass_score) || 70)),
                max_attempts: Math.max(1, Math.min(50, Number(c.max_attempts) || 3)),
                reward: (c.reward && typeof c.reward === 'object') ? c.reward : {},
                opens_at: c.opens_at ? String(c.opens_at) : new Date().toISOString(),
                closes_at: c.closes_at ? String(c.closes_at) : null,
                is_active: c.is_active !== false,
                created_by: 'admin:' + scope
            };
            if (!row.name) return fail(400, 'INCOMPLETE', 'Thử thách cần tên.');

            const { data: saved, error } = await client
                .from('boss_challenges')
                .upsert(row, { onConflict: 'slug' })
                .select('id')
                .maybeSingle();
            if (error || !saved) return fail(500, 'SAVE_ERROR', 'Không lưu được thử thách.');

            /* Thay bộ câu hỏi trong cùng một lượt: không để lại câu hỏi mồ côi. */
            await client.from('boss_questions').delete().eq('challenge_id', saved.id);
            const { error: qErr } = await client.from('boss_questions').insert(
                cleanQuestions.map((q) => ({ ...q, challenge_id: saved.id }))
            );
            if (qErr) return fail(500, 'SAVE_ERROR', 'Không lưu được câu hỏi: ' + qErr.message);

            await audit(client, 'challenge_save', { slug, questions: cleanQuestions.length }, 'admin:' + scope);
            return json({ ok: true, id: saved.id, questions: cleanQuestions.length });
        }

        case 'admin.challenge.delete': {
            const slug = str(body.slug, 64);
            if (!slug) return fail(400, 'BAD_SLUG', 'Thiếu mã thử thách.');
            const { error } = await client.from('boss_challenges').update({ is_active: false }).eq('slug', slug);
            if (error) return fail(500, 'DELETE_ERROR', 'Không đóng được thử thách.');
            await audit(client, 'challenge_close', { slug }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.metrics': {
            /* Kiểm tra toàn vẹn: không tính lại XP từ client, chỉ đối chiếu sổ. */
            const { data: drift } = await client.rpc('bk_gam_admin_drift', {});
            return json({ ok: true, drift: drift ?? [] });
        }

        /* 8.3.7: tìm học sinh cho tab Gamification. Trước đây mô-đun gọi
           `students.search` — không có nhánh quản trị nên rơi vào nhánh học sinh
           và trả UNKNOWN_ACTION ("Hành động không hợp lệ."). Đây là action đọc
           duy nhất phục vụ ô “Tìm học sinh” của tab. */
        case 'admin.students.search': {
            const q = normalizeName(body.q)
                .replace(/[^a-z0-9 ]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const limit = Math.min(20, Math.max(1, Number(body.limit) || 8));
            let query = client
                .from('students')
                .select('id, display_name, disambiguator, student_code, is_founder, user_progression(level)')
                .eq('is_active', true)
                .order('display_name')
                .limit(limit);
            if (q) {
                query = query.or('normalized_name.ilike.%' + q + '%,display_name.ilike.%' + q + '%');
            }
            const { data, error } = await query;
            if (error) return fail(500, 'SEARCH_ERROR', 'Không tìm được học sinh. Thử lại sau.');
            return json({
                ok: true,
                query: q,
                count: (data ?? []).length,
                students: (data ?? []).map(function (raw: Record<string, unknown>) {
                    const prog = raw.user_progression;
                    const first = Array.isArray(prog) ? prog[0] : prog;
                    return {
                        id: raw.id,
                        display_name: raw.display_name,
                        disambiguator: raw.disambiguator || '',
                        student_code: raw.student_code || '',
                        is_founder: !!raw.is_founder,
                        level: Number((first && (first as Record<string, unknown>).level) || 1)
                    };
                })
            });
        }

        /* ------------------- 8.3.8: Founder trao phần thưởng ------------------- */
        case 'admin.students.detail': {
            const id = uuidish(body.student_id);
            if (!id) return fail(400, 'BAD_STUDENT', 'Thiếu học sinh.');
            const brief = await studentBrief(client, id);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh đang hoạt động.');
            const [{ count: achCount }, { count: skillCount }, { count: itemCount }] = await Promise.all([
                client.from('user_achievements').select('achievement_id', { count: 'exact', head: true })
                    .eq('student_id', id).not('unlocked_at', 'is', null),
                client.from('user_skill_progress').select('node_id', { count: 'exact', head: true })
                    .eq('student_id', id).eq('status', 'completed'),
                client.from('user_inventory').select('item_id', { count: 'exact', head: true })
                    .eq('student_id', id)
            ]);
            return json({
                ok: true,
                student: Object.assign({}, brief, {
                    achievements: achCount ?? 0,
                    skills: skillCount ?? 0,
                    items: itemCount ?? 0
                })
            });
        }

        case 'admin.items.catalog': {
            const studentId = uuidish(body.student_id);
            const { data: catalog } = await client.from('reward_catalog')
                .select('id, kind, name, description, icon, rarity, metadata, sort_order')
                .eq('is_active', true).order('sort_order').limit(500);
            let owned: Record<string, number> = {};
            if (studentId) {
                const { data } = await client.from('user_inventory')
                    .select('item_id, quantity').eq('student_id', studentId);
                (data ?? []).forEach(function (row: Record<string, unknown>) {
                    owned[String(row.item_id)] = Number(row.quantity) || 1;
                });
            }
            return json({
                ok: true,
                items: (catalog ?? []).map(function (raw: Record<string, unknown>) {
                    const meta = (raw.metadata && typeof raw.metadata === 'object')
                        ? raw.metadata as Record<string, unknown> : {};
                    return Object.assign({}, raw, {
                        how: String(meta.how || ''),
                        use: String(meta.use || ''),
                        max_quantity: Number(meta.max_quantity) || 0,
                        owned: owned[String(raw.id)] || 0
                    });
                })
            });
        }

        case 'admin.items.preview': {
            const studentId = uuidish(body.student_id);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Hãy chọn một học sinh trước khi xem trước.');
            const brief = await studentBrief(client, studentId);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
            const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
            const ids = items.map(function (row) { return codeOf((row as Record<string, unknown>).item_id); })
                .filter(Boolean);
            const { data: catalog } = await client.from('reward_catalog')
                .select('id, name, kind, metadata').in('id', ids.length ? ids : ['__none__']);
            const { data: inv } = await client.from('user_inventory')
                .select('item_id, quantity').eq('student_id', studentId);
            const owned: Record<string, number> = {};
            (inv ?? []).forEach(function (r: Record<string, unknown>) {
                owned[String(r.item_id)] = Number(r.quantity) || 1;
            });
            const rows = (catalog ?? []).map(function (raw: Record<string, unknown>) {
                const meta = (raw.metadata && typeof raw.metadata === 'object')
                    ? raw.metadata as Record<string, unknown> : {};
                const requested = items.find(function (row) {
                    return codeOf((row as Record<string, unknown>).item_id) === String(raw.id);
                }) as Record<string, unknown> | undefined;
                const qty = Math.max(1, Math.min(999, Number(requested && requested.quantity) || 1));
                const max = Number(meta.max_quantity) || 9999;
                const before = owned[String(raw.id)] || 0;
                return {
                    item_id: raw.id, name: raw.name, kind: raw.kind,
                    quantity: qty, before, after: Math.min(max, before + qty), max_quantity: max
                };
            });
            return json({ ok: true, student: brief, items: rows });
        }

        case 'admin.items.grant': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được trao vật phẩm.');
            const studentId = uuidish(body.student_id);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Hãy chọn một học sinh.');
            const brief = await studentBrief(client, studentId);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh đang hoạt động.');
            const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
            const clean = items.map(function (row) {
                const item = row as Record<string, unknown>;
                return {
                    item_id: codeOf(item.item_id),
                    quantity: Math.max(1, Math.min(999, Number(item.quantity) || 1))
                };
            }).filter(function (row) { return !!row.item_id; });
            if (!clean.length) return fail(400, 'NO_ITEMS', 'Hãy chọn ít nhất một vật phẩm.');
            const reason = str(body.reason, 500);
            const { data, error } = await client.rpc('bk_gam_grant_items', {
                p_student: studentId,
                p_items: clean,
                p_actor: 'founder:' + admin.id,
                p_reason: reason
            });
            if (error) return fail(500, 'GRANT_ERROR', 'Không trao được vật phẩm.');
            await audit(client, 'items_grant_request', {
                student_id: studentId, student: brief.display_name,
                items: clean, reason, granted: (data && data.granted) || []
            }, 'founder:' + admin.id, 'founder', studentId);
            return json({ ok: true, student: brief, result: data });
        }

        case 'admin.achievements.catalog': {
            const studentId = uuidish(body.student_id);
            const { data: defs } = await client.from('achievement_defs')
                .select('id, name, description, icon, rarity, category, conditions, stages, reward, is_hidden, sort_order')
                .eq('is_active', true).order('sort_order').limit(500);
            const owned: Record<string, number> = {};
            if (studentId) {
                const { data } = await client.from('user_achievements')
                    .select('achievement_id, stage')
                    .eq('student_id', studentId).not('unlocked_at', 'is', null);
                (data ?? []).forEach(function (row: Record<string, unknown>) {
                    owned[String(row.achievement_id)] = (owned[String(row.achievement_id)] || 0) + 1;
                });
            }
            return json({
                ok: true,
                achievements: (defs ?? []).map(function (raw: Record<string, unknown>) {
                    return Object.assign({}, raw, { owned_stages: owned[String(raw.id)] || 0 });
                })
            });
        }

        case 'admin.achievements.preview': {
            const studentId = uuidish(body.student_id);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Hãy chọn một học sinh trước khi xem trước.');
            const brief = await studentBrief(client, studentId);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
            const ids = cleanIdList(body.ids, 30);
            const { data: defs } = await client.from('achievement_defs')
                .select('id, name, rarity, stages').in('id', ids.length ? ids : ['__none__']);
            const { data: owned } = await client.from('user_achievements')
                .select('achievement_id, stage, unlocked_at').eq('student_id', studentId);
            const ownedMap: Record<string, number> = {};
            (owned ?? []).forEach(function (r: Record<string, unknown>) {
                if (r.unlocked_at) {
                    ownedMap[String(r.achievement_id)] = (ownedMap[String(r.achievement_id)] || 0) + 1;
                }
            });
            return json({
                ok: true, student: brief,
                achievements: (defs ?? []).map(function (raw: Record<string, unknown>) {
                    return Object.assign({}, raw, { owned_stages: ownedMap[String(raw.id)] || 0 });
                })
            });
        }

        case 'admin.achievements.grant': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được trao thành tựu.');
            const studentId = uuidish(body.student_id);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Hãy chọn một học sinh.');
            const brief = await studentBrief(client, studentId);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh đang hoạt động.');
            const ids = cleanIdList(body.ids, 30);
            if (!ids.length) return fail(400, 'NO_ACHIEVEMENTS', 'Hãy chọn ít nhất một thành tựu.');
            const reason = str(body.reason, 500);
            const { data, error } = await client.rpc('bk_gam_grant_achievements', {
                p_student: studentId,
                p_ids: ids,
                p_actor: 'founder:' + admin.id,
                p_reason: reason
            });
            if (error) return fail(500, 'GRANT_ERROR', 'Không trao được thành tựu.');
            await audit(client, 'achievements_grant_request', {
                student_id: studentId, student: brief.display_name,
                ids, reason, granted: (data && data.granted) || []
            }, 'founder:' + admin.id, 'founder', studentId);
            return json({ ok: true, student: brief, result: data });
        }

        case 'admin.skilltree.preview': {
            const studentId = uuidish(body.student_id);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Hãy chọn một học sinh trước khi xem trước.');
            const brief = await studentBrief(client, studentId);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
            const { data: nodes } = await client.from('skill_tree_nodes')
                .select('id, name, branch, requires, min_level, required_missions, required_achievements, sort_order')
                .eq('is_active', true).order('sort_order');
            const { data: progress } = await client.from('user_skill_progress')
                .select('node_id, status, granted, progress').eq('student_id', studentId);
            const map: Record<string, Record<string, unknown>> = {};
            (progress ?? []).forEach(function (row: Record<string, unknown>) {
                map[String(row.node_id)] = row;
            });
            const list = (nodes ?? []).map(function (raw: Record<string, unknown>) {
                const row = map[String(raw.id)] || {};
                return {
                    id: raw.id, name: raw.name, branch: raw.branch,
                    status: row.status || 'locked', progress: Number(row.progress) || 0,
                    granted: !!row.granted
                };
            });
            const completed = list.filter(function (n) { return n.status === 'completed'; }).length;
            return json({
                ok: true, student: brief,
                total: list.length, completed,
                remaining: list.length - completed,
                nodes: list
            });
        }

        case 'admin.skilltree.grant': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được cấp toàn bộ cây kỹ năng.');
            const studentId = uuidish(body.student_id);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Hãy chọn một học sinh.');
            if (body.confirm !== true) {
                return fail(400, 'NO_CONFIRM', 'Cần xác nhận trước khi cấp toàn bộ cây kỹ năng.');
            }
            const brief = await studentBrief(client, studentId);
            if (!brief) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh đang hoạt động.');
            const reason = str(body.reason, 500);
            const { data, error } = await client.rpc('bk_gam_grant_skill_tree', {
                p_student: studentId,
                p_actor: 'founder:' + admin.id,
                p_reason: reason
            });
            if (error) return fail(500, 'GRANT_ERROR', 'Không cấp được cây kỹ năng.');
            await audit(client, 'skilltree_grant_request', {
                student_id: studentId, student: brief.display_name,
                granted: (data && data.granted) || 0, reason
            }, 'founder:' + admin.id, 'founder', studentId);
            return json({ ok: true, student: brief, result: data });
        }

        case 'admin.grants.history': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder xem lịch sử trao tặng.');
            const limit = Math.min(100, Math.max(1, Number(body.limit) || 30));
            const offset = Math.max(0, Number(body.offset) || 0);
            const studentId = uuidish(body.student_id);
            const kind = str(body.kind, 24);
            const actions: Record<string, string[]> = {
                items: ['items_granted'],
                achievements: ['achievement_granted', 'achievement_unlocked'],
                skills: ['skill_tree_granted', 'skill_node_granted', 'skill_node_completed'],
                level: ['level_set'],
                buffs: ['xp_buff_created', 'xp_buff_ended'],
                all: ['items_granted', 'achievement_granted', 'skill_tree_granted',
                      'skill_node_granted', 'level_set', 'xp_buff_created', 'xp_buff_ended']
            };
            const filter = actions[kind] || actions.all;
            let query = client.from('gamification_activity_logs')
                .select('id, student_id, actor_kind, actor_label, action, detail, created_at, students(display_name)',
                    { count: 'exact' })
                .in('action', filter)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (studentId) query = query.eq('student_id', studentId);
            const { data, count, error } = await query;
            if (error) return fail(500, 'HISTORY_ERROR', 'Không đọc được lịch sử trao tặng.');
            return json({
                ok: true,
                rows: (data ?? []).map(function (raw: Record<string, unknown>) {
                    const st = raw.students;
                    const first = Array.isArray(st) ? st[0] : st;
                    return Object.assign({}, raw, {
                        student_name: (first && (first as Record<string, unknown>).display_name) || ''
                    });
                }),
                total: count ?? 0, limit, offset
            });
        }

        case 'admin.students.list': {
            if (!founderOnly.has(action) || scope !== 'founder') {
                return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder xem được danh sách tiến trình toàn bộ.');
            }
            const q = str(body.q, 80);
            let query = client
                .from('students')
                .select('id, display_name, student_code, user_progression(total_xp, level)')
                .eq('is_active', true)
                .order('display_name')
                .limit(50);
            if (q) query = query.ilike('display_name', '%' + q + '%');
            const { data } = await query;
            return json({ ok: true, students: data ?? [] });
        }

        case 'admin.xp.adjust': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được điều chỉnh XP.');
            const studentId = uuidish(body.student_id);
            const amount = Number(body.amount);
            const reason = str(body.reason, 500);
            if (!studentId) return fail(400, 'BAD_STUDENT', 'Thiếu học sinh.');
            if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) {
                return fail(400, 'BAD_AMOUNT', 'Số XP phải là số nguyên khác 0.');
            }
            if (reason.length < 3) return fail(400, 'NO_REASON', 'Cần lý do điều chỉnh.');
            const { data, error } = await client.rpc('bk_gam_adjust', {
                p_student: studentId,
                p_amount: amount,
                p_reason: reason,
                p_actor: 'founder:' + admin.id,
                p_meta: { scope }
            });
            if (error) return fail(500, 'ADJUST_ERROR', 'Không điều chỉnh được XP.');
            const evalObj = (data && data.evaluation) || {};
            return json({
                ok: true,
                result: data,
                achievements: Array.isArray(evalObj.achievements) ? evalObj.achievements.length : 0
            });
        }

        case 'admin.audience.preview': {
            const audience = cleanAudience(body.audience);
            if (!audience) return fail(400, 'BAD_AUDIENCE', 'Đối tượng nhận không hợp lệ.');
            const list = await audienceStudents(client, audience);
            return json({
                ok: true,
                count: list.length,
                audience: audience,
                sample: list.slice(0, 8).map(function (s) {
                    return { id: s.id, name: s.display_name, level: s.level };
                })
            });
        }

        case 'admin.level.set': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được đặt cấp độ.');
            const audience = cleanAudience(body.audience);
            if (!audience) return fail(400, 'BAD_AUDIENCE', 'Đối tượng nhận không hợp lệ.');
            const level = Math.round(Number(body.level));
            if (!Number.isInteger(level) || level < 1 || level > 100) {
                return fail(400, 'BAD_LEVEL', 'Cấp độ phải là số nguyên từ 1 đến 100.');
            }
            const reason = str(body.reason, 300);
            if (reason.length < 3) {
                return fail(400, 'NO_REASON', 'Cần lý do đặt cấp độ (ít nhất 3 ký tự).');
            }
            const list = await audienceStudents(client, audience);
            if (!list.length) return fail(400, 'NO_TARGET', 'Không có học sinh nào trong đối tượng đã chọn.');
            if (list.length > 300) {
                return fail(400, 'TOO_MANY', 'Một lần chỉ đặt cấp độ cho tối đa 300 học sinh. Hãy thu hẹp đối tượng.');
            }
            const failed: Array<{ id: string; name: string; message: string }> = [];
            let updated = 0;
            let achievements = 0;
            for (const s of list) {
                const { data, error } = await client.rpc('bk_gam_set_level', {
                    p_student: s.id,
                    p_level: level,
                    p_actor: 'founder:' + admin.id,
                    p_reason: reason
                });
                if (error) {
                    failed.push({ id: s.id, name: s.display_name, message: 'Không đặt được cấp độ.' });
                } else {
                    updated += 1;
                    /* 8.3.8: bk_gam_set_level tự đánh giá thành tựu trong cùng
                       transaction; đây chỉ là tổng hợp để báo cáo lại. */
                    const evalObj = (data && data.evaluation) || {};
                    achievements += Array.isArray(evalObj.achievements) ? evalObj.achievements.length : 0;
                }
            }
            await audit(client, 'level_set', {
                level, reason, updated, failed: failed.length, achievements, audience
            }, 'admin:' + scope);
            return json({
                ok: true, level: level, total: list.length,
                updated: updated, achievements: achievements, failed: failed
            });
        }

        case 'admin.xp.buff.list': {
            const { data } = await client
                .from('gamification_xp_buffs')
                .select('id, label, multiplier, audience, starts_at, ends_at, is_active, created_by, created_at')
                .order('created_at', { ascending: false })
                .limit(50);
            const nowMs = Date.now();
            const rows = (data ?? []).map(function (r: Record<string, unknown>) {
                const row = r;
                return Object.assign({}, row, {
                    is_live: row.is_active !== false &&
                        new Date(String(row.starts_at)).getTime() <= nowMs &&
                        new Date(String(row.ends_at)).getTime() > nowMs
                });
            });
            return json({ ok: true, buffs: rows });
        }

        case 'admin.xp.buff': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được tạo buff XP.');
            const audience = cleanAudience(body.audience);
            if (!audience) return fail(400, 'BAD_AUDIENCE', 'Đối tượng nhận không hợp lệ.');
            const multiplier = Number(body.multiplier);
            if (!Number.isFinite(multiplier) || multiplier < 1.1 || multiplier > 10) {
                return fail(400, 'BAD_MULTIPLIER', 'Hệ số buff phải từ 1,1 đến 10.');
            }
            const hours = Math.round(Number(body.hours) || 0);
            if (hours < 1 || hours > 720) {
                return fail(400, 'BAD_DURATION', 'Thời hạn buff phải từ 1 đến 720 giờ.');
            }
            const label = str(body.label, 120) || ('Buff x' + multiplier);
            const startsAt = new Date();
            const endsAt = new Date(startsAt.getTime() + hours * 3600 * 1000);
            const { data, error } = await client.from('gamification_xp_buffs').insert({
                label,
                multiplier: Math.round(multiplier * 100) / 100,
                audience,
                starts_at: startsAt.toISOString(),
                ends_at: endsAt.toISOString(),
                is_active: true,
                created_by: 'founder:' + admin.id
            }).select('id').maybeSingle();
            if (error) return fail(500, 'BUFF_ERROR', 'Không tạo được buff XP.');
            await audit(client, 'xp_buff_created', { label, multiplier, hours, audience }, 'admin:' + scope);
            return json({ ok: true, id: (data && data.id) || null, ends_at: endsAt.toISOString() });
        }

        case 'admin.xp.buff.end': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder được kết thúc buff XP.');
            const id = uuidish(body.id);
            if (!id) return fail(400, 'BAD_ID', 'Thiếu mã buff.');
            /* Chỉ tắt cờ: giữ nguyên khung thời gian đã tạo để lịch sử đúng và
               không vi phạm ràng buộc ends_at > starts_at khi kết thúc ngay. */
            const { error } = await client.from('gamification_xp_buffs')
                .update({ is_active: false })
                .eq('id', id);
            if (error) return fail(500, 'BUFF_ERROR', 'Không kết thúc được buff.');
            await audit(client, 'xp_buff_ended', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.logs': {
            if (scope !== 'founder') return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder xem nhật ký gamification.');
            const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
            const { data } = await client
                .from('gamification_activity_logs')
                .select('id, student_id, actor_kind, actor_label, action, detail, created_at')
                .order('created_at', { ascending: false })
                .limit(limit);
            return json({ ok: true, logs: data ?? [] });
        }

        default:
            return fail(400, 'UNKNOWN_ACTION', 'Hành động quản trị không hợp lệ.');
    }
});

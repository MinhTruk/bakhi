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
    return data ?? {};
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
                return json({ ok: true, state: await state(client, student.id) });
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
    /* Chỉ Founder được điều chỉnh XP và xem toàn bộ nhật ký gamification. */
    const founderOnly = new Set(['admin.xp.adjust', 'admin.logs', 'admin.students.list']);

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
            const [nodes, achievements, missions, rewards, challenges] = await Promise.all([
                client.from('skill_tree_nodes').select('*').order('sort_order'),
                client.from('achievement_defs').select('*').order('sort_order'),
                client.from('mission_defs').select('*').order('cadence').order('sort_order'),
                client.from('reward_catalog').select('*').order('sort_order'),
                client.from('boss_challenges').select('*, boss_questions(count)').order('created_at', { ascending: false })
            ]);
            return json({
                ok: true,
                nodes: nodes.data ?? [],
                achievements: achievements.data ?? [],
                missions: missions.data ?? [],
                rewards: rewards.data ?? [],
                challenges: challenges.data ?? []
            });
        }

        case 'admin.node.save': {
            const node = body.node as Record<string, unknown> | undefined;
            if (!node) return fail(400, 'BAD_NODE', 'Thiếu dữ liệu node.');
            const id = str(node.id, 64).toLowerCase().replace(/[^a-z0-9-]/g, '-');
            if (!id) return fail(400, 'BAD_ID', 'Mã node không hợp lệ.');
            const row = {
                id,
                branch: str(node.branch, 24),
                name: str(node.name, 120),
                description: str(node.description, 600),
                icon: str(node.icon, 60) || 'fa-circle-nodes',
                metric: str(node.metric, 48),
                target: Math.max(1, Math.min(100000, Number(node.target) || 1)),
                requires: Array.isArray(node.requires) ? node.requires.map((r) => str(r, 64)) : [],
                reward: (node.reward && typeof node.reward === 'object') ? node.reward : {},
                sort_order: Number(node.sort_order) || 0,
                is_active: node.is_active !== false
            };
            if (!row.name || !row.metric) return fail(400, 'INCOMPLETE', 'Node cần tên và chỉ số.');
            const { error } = await client.from('skill_tree_nodes').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được node: ' + error.message);
            await audit(client, 'node_save', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.achievement.save': {
            const a = body.achievement as Record<string, unknown> | undefined;
            if (!a) return fail(400, 'BAD_ACHIEVEMENT', 'Thiếu dữ liệu thành tựu.');
            const id = str(a.id, 64).toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
            const { error } = await client.from('achievement_defs').upsert(row, { onConflict: 'id' });
            if (error) return fail(500, 'SAVE_ERROR', 'Không lưu được thành tựu: ' + error.message);
            await audit(client, 'achievement_save', { id }, 'admin:' + scope);
            return json({ ok: true });
        }

        case 'admin.mission.save': {
            const m = body.mission as Record<string, unknown> | undefined;
            if (!m) return fail(400, 'BAD_MISSION', 'Thiếu dữ liệu nhiệm vụ.');
            const id = str(m.id, 64).toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
            const id = str(r.id, 64).toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
            const slug = str(c.slug, 64).toLowerCase().replace(/[^a-z0-9-]/g, '-');
            if (slug.length < 3) return fail(400, 'BAD_SLUG', 'Mã thử thách phải từ 3 ký tự.');
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
            return json({ ok: true, result: data });
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

#!/usr/bin/env node
/**
 * gamification-db-check.js — QA tầng dữ liệu cho Gamification 2.0 (8.3.0).
 *
 * Chạy TRỰC TIẾP trên project Supabase đã liên kết, qua Management API.
 * Cần biến môi trường SUPABASE_ACCESS_TOKEN (Personal Access Token) — không
 * bao giờ ghi token vào tệp hay log.
 *
 * Nguyên tắc: mọi bài kiểm tra ghi dữ liệu đều nằm trong BEGIN…ROLLBACK, nên
 * không để lại học sinh giả, XP giả hay thử thách giả trên production.
 *
 * Dùng:
 *   SUPABASE_ACCESS_TOKEN=... node tools/qa/gamification-db-check.js
 */
'use strict';

const PROJECT = process.env.SUPABASE_PROJECT_REF || 'wzvslyabhizsiggurwdq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail) {
    pass++;
    console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
}
function bad(name, detail) {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
}

async function query(sql) {
    const res = await fetch('https://api.supabase.com/v1/projects/' + PROJECT + '/database/query', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + TOKEN,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, data, text };
}

const ENGINE_TEST = `
begin;
do $$
declare
    s uuid;
    r jsonb;
    st jsonb;
    v_user_mission uuid;
    v_slug text := 'qa-engine-' || substr(gen_random_uuid()::text, 1, 8);
    v_ch uuid;
    v_a jsonb;
    v_b jsonb;
    v_total bigint;
    v_level integer;
begin
    insert into public.students (display_name, normalized_name)
    values ('QA Engine ' || substr(gen_random_uuid()::text, 1, 6),
            'qa-engine-' || substr(gen_random_uuid()::text, 1, 8))
    returning id into s;

    -- 1. Cộng XP hợp lệ
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:1', 0);
    assert (r->>'awarded')::boolean, 'XA1 không cộng được XP hợp lệ';
    assert (r->>'amount')::int = 20, 'XA2 số XP sai';
    assert (r->>'level')::int = 1, 'XA3 cấp độ sai sau 20 XP';

    -- 2. Idempotency: cùng khoá không cộng lần hai
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:1', 0);
    assert not (r->>'awarded')::boolean, 'XA4 cộng trùng khi retry';
    assert (r->>'reason') = 'duplicate', 'XA5 lý do trùng sai';

    -- 3. Loại hoạt động không có trong cấu hình → không thưởng
    r := public.bk_gam_award(s, 'chat_message', 'qa', 'qa:chat:1', 0);
    assert not (r->>'awarded')::boolean, 'XA6 thưởng cho hoạt động không hợp lệ';

    -- 4. Đạt ngưỡng lên cấp 2 (100 XP)
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:2', 0);
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:3', 0);
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:4', 0);
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:5', 0);
    assert (r->>'level')::int = 2, 'XA7 không lên cấp đúng tại 100 XP';
    assert (r->>'leveled_up')::boolean, 'XA8 cờ lên cấp sai';

    -- 5. Giới hạn theo ngày (quiz_completed cap 6)
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:6', 0);
    r := public.bk_gam_award(s, 'quiz_completed', 'qa', 'qa:quiz:7', 0);
    assert not (r->>'awarded')::boolean, 'XA9 vượt giới hạn ngày vẫn được thưởng';
    assert (r->>'reason') = 'daily_cap', 'XA10 lý do giới hạn sai';

    -- 6. Tổng XP khớp sổ
    select total_xp, level into v_total, v_level from public.user_progression where student_id = s;
    assert v_total = 120, 'XA11 tổng XP sai: ' || v_total;
    assert v_level = 2, 'XA12 cấp độ lưu sai: ' || v_level;

    -- 7. Thành tựu tự mở khoá và có XP thưởng
    perform public.bk_gam_evaluate(s, 0);
    assert exists (select 1 from public.user_achievements
                   where student_id = s and achievement_id = 'ach-first-quiz' and unlocked_at is not null),
           'XA13 thành tựu đầu tiên không mở khoá';
    assert exists (select 1 from public.xp_transactions
                   where student_id = s and activity_type = 'achievement_reward'),
           'XA14 không cấp XP cho thành tựu';

    -- 8. Nhiệm vụ: tạo theo chu kỳ, tiến trình cập nhật, hoàn thành
    perform public.bk_gam_sync_missions(s);
    assert exists (select 1 from public.user_missions where student_id = s and mission_id = 'mission-daily-quiz-1'),
           'XA15 không tạo nhiệm vụ ngày';
    assert exists (select 1 from public.user_missions where student_id = s and mission_id = 'mission-weekly-quiz-5'),
           'XA16 không tạo nhiệm vụ tuần';
    assert exists (select 1 from public.user_missions where student_id = s and mission_id = 'mission-daily-quiz-1'
                   and status = 'completed'),
           'XA17 nhiệm vụ 1 bài quiz chưa hoàn thành dù đủ tiến trình';
    assert not exists (select 1 from public.user_missions where student_id = s and mission_id = 'mission-daily-quiz-3'),
           'XA17b nhiệm vụ yêu cầu cấp 3 bị giao khi mới cấp 2';
    -- Chạy lại không nhân bản
    perform public.bk_gam_sync_missions(s);
    assert (select count(*) from public.user_missions where student_id = s and mission_id = 'mission-daily-quiz-1') = 1,
           'XA18 tạo trùng nhiệm vụ khi đồng bộ lại';

    -- 9. Nhận thưởng nhiệm vụ, không nhận hai lần
    select id into v_user_mission from public.user_missions
     where student_id = s and mission_id = 'mission-daily-quiz-1' and status = 'completed' limit 1;
    assert v_user_mission is not null, 'XA19 không có nhiệm vụ hoàn thành để nhận';
    r := public.bk_gam_claim(s, v_user_mission);
    assert (r->>'ok')::boolean, 'XA20 không nhận được thưởng nhiệm vụ';
    r := public.bk_gam_claim(s, v_user_mission);
    assert (r->>'code') = 'ALREADY_CLAIMED', 'XA21 nhận thưởng hai lần';

    -- 10. Nhiệm vụ chưa xong không nhận được
    select id into v_user_mission from public.user_missions
     where student_id = s and mission_id = 'mission-weekly-rev-3' and status <> 'claimed' limit 1;
    if v_user_mission is not null then
        r := public.bk_gam_claim(s, v_user_mission);
        assert (r->>'code') = 'NOT_COMPLETED', 'XA22 nhận thưởng khi chưa hoàn thành';
    end if;

    -- 11. Boss: chấm tại máy chủ, idempotent, đáp án không lộ trước khi nộp
    insert into public.boss_challenges (slug, name, kind, pass_score, max_attempts, created_by)
    values (v_slug, 'QA Boss', 'knowledge', 50, 2, 'qa') returning id into v_ch;
    insert into public.boss_questions (challenge_id, prompt, options, correct_index, sort_order) values
        (v_ch, 'Câu 1', '["A","B"]'::jsonb, 0, 1),
        (v_ch, 'Câu 2', '["A","B"]'::jsonb, 1, 2);

    st := public.bk_gam_boss_start(s, v_slug);
    assert (st->>'ok')::boolean, 'XA23 không mở được thử thách';
    assert (st->'questions'->0) ? 'id' and not ((st->'questions'->0) ? 'correct_index'),
           'XA24 lộ đáp án trước khi nộp';
    assert (st->'questions'->0) ? 'prompt', 'XA25 thiếu nội dung câu hỏi';

    v_a := public.bk_gam_boss_submit(s, v_slug,
        jsonb_build_array(
            jsonb_build_object('question_id', st->'questions'->0->>'id', 'choice', 0),
            jsonb_build_object('question_id', st->'questions'->1->>'id', 'choice', 1)),
        'qa:boss:1');
    assert (v_a->>'ok')::boolean, 'XA26 không nộp được thử thách';
    assert (v_a->>'score')::int = 100, 'XA27 chấm điểm sai: ' || (v_a->>'score');
    assert (v_a->>'passed')::boolean, 'XA28 không đánh dấu vượt qua';

    v_b := public.bk_gam_boss_submit(s, v_slug,
        jsonb_build_array(
            jsonb_build_object('question_id', st->'questions'->0->>'id', 'choice', 0),
            jsonb_build_object('question_id', st->'questions'->1->>'id', 'choice', 1)),
        'qa:boss:1');
    assert (v_b->>'duplicate')::boolean, 'XA29 nộp lại vẫn được xử lý mới';
    assert (select count(*) from public.boss_attempts where student_id = s and challenge_id = v_ch) = 1,
           'XA30 ghi trùng lượt thử';

    -- 12. Sai đáp án không được cộng XP boss
    v_b := public.bk_gam_boss_submit(s, v_slug,
        jsonb_build_array(
            jsonb_build_object('question_id', st->'questions'->0->>'id', 'choice', 1),
            jsonb_build_object('question_id', st->'questions'->1->>'id', 'choice', 0)),
        'qa:boss:2');
    assert not (v_b->>'passed')::boolean, 'XA31 chấm sai vẫn báo vượt qua';
    assert (select count(*) from public.xp_transactions
            where student_id = s and activity_type = 'boss_passed') = 1,
           'XA32 cộng XP boss cho lượt không đạt';

    -- 13. Trang bị vật phẩm: chỉ khi sở hữu
    r := public.bk_gam_equip(s, 'frame-laurel', true);
    assert not (r->>'ok')::boolean, 'XA33 trang bị được vật phẩm chưa sở hữu';
    perform public.bk_gam_grant_item(s, 'frame-laurel', 'qa');
    r := public.bk_gam_equip(s, 'frame-laurel', true);
    assert (r->>'ok')::boolean, 'XA34 không trang bị được vật phẩm đã sở hữu';
    assert (select is_equipped from public.user_inventory where student_id = s and item_id = 'frame-laurel'),
           'XA35 trạng thái trang bị không lưu';

    -- 13b. 8.3.5 — khung trang bị phải đồng bộ student_profiles.frame (toàn website)
    assert (select frame from public.student_profiles where student_id = s) = 'wreath',
           'XA42 trang bị khung ở Gamification không cập nhật hồ sơ';
    assert 'wreath' = any (public.bakhi_owned_frames(s)),
           'XA43 khung thưởng Gamification không nằm trong danh sách sở hữu hồ sơ';
    r := public.bk_gam_equip(s, 'frame-laurel', false);
    assert (select frame from public.student_profiles where student_id = s) = 'none',
           'XA44 bỏ khung không đưa hồ sơ về Mặc định';
    assert exists (select 1 from public.user_inventory where student_id = s and item_id = 'frame-laurel'),
           'XA45 bỏ khung làm mất vật phẩm trong kho';

    -- 14. Không lệch sổ
    assert not exists (select 1 from public.bk_gam_admin_drift() d where d.student_id = s),
           'XA36 tổng XP lệch sổ giao dịch';

    -- 15. State tổng hợp đủ khoá cho dashboard
    st := public.bk_gam_state(s);
    assert (st->>'total_xp') is not null and (st->>'level') is not null, 'XA37 state thiếu XP/cấp';
    assert jsonb_array_length(st->'nodes') > 0, 'XA38 state thiếu cây kỹ năng';
    assert jsonb_array_length(st->'achievements') > 0, 'XA39 state thiếu thành tựu';
    assert jsonb_array_length(st->'catalog') > 0, 'XA40 state thiếu danh mục phần thưởng';
    assert (st->'inventory'->0->>'item_id') is not null, 'XA41 state thiếu kho vật phẩm';
end $$;
rollback;
`;

/* 8.3.6 — khung hồ sơ, đặt cấp độ và buff XP (rollback) */
const ADMIN_TEST = `
begin;
do $$
declare
    s uuid;
    s2 uuid;
    v_level integer;
    v_total bigint;
    v_mult numeric;
    v_award jsonb;
    v_frames text[];
    v_admin jsonb;
begin
    insert into public.students (display_name, normalized_name)
    values ('QA Admin ' || substr(gen_random_uuid()::text, 1, 6),
            'qa-admin-' || substr(gen_random_uuid()::text, 1, 8))
    returning id into s;
    insert into public.students (display_name, normalized_name)
    values ('QA Other ' || substr(gen_random_uuid()::text, 1, 6),
            'qa-other-' || substr(gen_random_uuid()::text, 1, 8))
    returning id into s2;

    -- 1. Khung Founder mở qua bảng ánh xạ badge (hồi quy 8.3.5)
    insert into public.student_profiles (student_id) values (s)
    on conflict (student_id) do nothing;
    insert into public.student_badges (student_id, badge_id, kind, auto_earned, manual_granted, awarded_at)
    values (s, 'founder-genesis', 'admin', false, true, now());
    v_frames := public.bakhi_owned_frames(s);
    assert 'founder-genesis' = any (v_frames),
           'XA46 khung Founder của badge không nằm trong danh sách sở hữu';
    update public.student_profiles set frame = 'founder-genesis' where student_id = s;
    assert (select frame from public.student_profiles where student_id = s) = 'founder-genesis',
           'XA46b không trang bị được khung Founder đã mở';

    -- 2. Badge trong bảng ánh xạ mở đúng khung
    insert into public.student_badges (student_id, badge_id, kind, auto_earned, manual_granted, awarded_at)
    values (s, 'learn-lessons-15', 'admin', false, true, now());
    v_frames := public.bakhi_owned_frames(s);
    assert 'celestial' = any (v_frames),
           'XA47 badge ánh xạ không mở khung tương ứng';

    -- 3. Đặt cấp độ chính xác
    v_admin := public.bk_gam_set_level(s, 9, 'qa:rollback', 'qa rollback');
    assert (v_admin->>'ok')::boolean, 'XA48 không đặt được cấp độ';
    select level, total_xp into v_level, v_total
      from public.user_progression where student_id = s;
    assert v_level = 9, 'XA49 cấp độ lưu sai: ' || v_level;
    /* 8.3.8: bk_gam_set_level gọi bk_gam_evaluate trong cùng transaction, nên
       thành tựu mốc cấp có thể cộng thêm XP ngay sau khi đặt cấp. Điều bất biến
       là: không thấp hơn mốc cấp 9 và tổng XP vẫn quy ra đúng cấp 9. */
    assert v_total >= public.bk_gam_level_floor(9),
           'XA50 tổng XP thấp hơn mốc cấp 9: ' || v_total;
    assert public.bk_gam_level(v_total) = 9,
           'XA50b tổng XP không quy ra cấp 9: ' || v_total;

    -- 4. Đặt cấp độ không làm lệch sổ
    assert not exists (select 1 from public.bk_gam_admin_drift() d where d.student_id = s),
           'XA51 đặt cấp độ làm lệch sổ XP';

    -- 5. Buff nhân XP cho đúng đối tượng
    insert into public.gamification_xp_buffs (label, multiplier, audience, ends_at)
    values ('QA buff', 2, jsonb_build_object('kind', 'student', 'student_id', s::text),
            now() + interval '1 hour');
    v_mult := public.bk_gam_active_buff(s);
    assert v_mult = 2, 'XA52 buff không áp cho đúng học sinh: ' || v_mult;
    assert public.bk_gam_active_buff(s2) = 1, 'XA53 buff áp nhầm sang học sinh khác';

    v_award := public.bk_gam_award(s, 'lesson_study', 'qa', 'qa:buff:' || gen_random_uuid()::text);
    assert (v_award->>'amount')::int = 20,
           'XA54 XP không được nhân bởi buff: ' || (v_award->>'amount');
    assert (v_award->>'buff')::numeric = 2, 'XA55 sổ XP không ghi hệ số buff';

    -- 6. Buff hết hạn không áp dụng
    insert into public.gamification_xp_buffs (label, multiplier, audience, starts_at, ends_at)
    values ('QA expired', 3, jsonb_build_object('kind', 'student', 'student_id', s::text),
            now() - interval '2 hours', now() - interval '1 hour');
    assert public.bk_gam_active_buff(s) = 2, 'XA56 buff hết hạn vẫn còn hiệu lực';

    -- 6b. Tắt buff đang chạy: không áp dụng nữa, vẫn giữ lịch sử
    update public.gamification_xp_buffs set is_active = false where label = 'QA buff';
    assert public.bk_gam_active_buff(s) = 1, 'XA56b buff đã tắt vẫn còn hiệu lực';

    -- 7. Bảng buff chỉ dành cho service_role
    assert not exists (
        select 1 from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'gamification_xp_buffs'
          and grantee in ('anon', 'authenticated')
    ), 'XA57 trình duyệt đọc được bảng buff XP';
end $$;
rollback;
`;

async function main() {
    if (!TOKEN) {
        console.error('Thiếu SUPABASE_ACCESS_TOKEN — bỏ qua kiểm tra tầng dữ liệu.');
        process.exit(2);
    }

    console.log('Gamification 2.0 — kiểm tra tầng dữ liệu (' + PROJECT + ')\n');

    /* 1. Định nghĩa đã seed */
    const seed = await query(`
        select (select count(*) from public.skill_tree_nodes) as nodes,
               (select count(*) from public.achievement_defs) as achievements,
               (select count(*) from public.mission_defs) as missions,
               (select count(*) from public.reward_catalog) as rewards,
               (select count(*) from public.gamification_config) as config_rows,
               (select xp_rules from public.gamification_config where id = true) as xp_rules
    `);
    if (!seed.ok) {
        bad('truy vấn định nghĩa', seed.text.slice(0, 300));
    } else {
        const row = seed.data[0] || {};
        Number(row.nodes) >= 15 ? ok('cây kỹ năng đã seed', row.nodes + ' node') : bad('thiếu node cây kỹ năng');
        Number(row.achievements) >= 17 ? ok('thành tựu đã seed', row.achievements + ' định nghĩa') : bad('thiếu thành tựu');
        Number(row.missions) >= 9 ? ok('nhiệm vụ đã seed', row.missions + ' định nghĩa') : bad('thiếu nhiệm vụ');
        Number(row.rewards) >= 6 ? ok('danh mục phần thưởng đã seed', row.rewards + ' vật phẩm') : bad('thiếu phần thưởng');
        Number(row.config_rows) === 1 ? ok('cấu hình một dòng duy nhất') : bad('cấu hình sai số dòng');
        row.xp_rules && Object.keys(row.xp_rules).length >= 8
            ? ok('bảng XP tập trung', Object.keys(row.xp_rules).length + ' loại hoạt động')
            : bad('cấu hình XP rỗng');
    }

    /* 2. Công thức cấp độ đơn điệu, khớp mốc */
    const lv = await query(`
        select public.bk_gam_level(0) as l0,
               public.bk_gam_level(99) as l99,
               public.bk_gam_level(100) as l100,
               public.bk_gam_level(280) as l280,
               public.bk_gam_level(580) as l580,
               public.bk_gam_level(1040) as l1040
    `);
    if (!lv.ok) {
        bad('công thức cấp độ', lv.text.slice(0, 200));
    } else {
        const r = lv.data[0];
        r.l0 === 1 && r.l99 === 1 && r.l100 === 2
            ? ok('mốc cấp 1→2 đúng (100 XP)')
            : bad('mốc cấp độ sai', JSON.stringify(r));
        r.l280 === 3 && r.l580 === 4 && r.l1040 === 5
            ? ok('các mốc tiếp theo đúng')
            : bad('mốc cấp độ tiếp theo sai', JSON.stringify(r));
    }

    /* 3. Bảo mật: không có policy ghi, đáp án không đọc được từ trình duyệt */
    const sec = await query(`
        select
          (select count(*) from pg_policies
            where schemaname = 'public'
              and tablename in ('xp_transactions','user_progression','user_skill_progress',
                                'user_achievements','user_missions','user_inventory','boss_attempts')
              and cmd in ('INSERT','UPDATE','DELETE')) as write_policies,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename = 'boss_questions') as boss_q_policies,
          (select count(*) from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'boss_questions'
              and grantee in ('anon','authenticated')) as boss_q_grants,
          (select count(*) from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name in ('xp_transactions','user_progression','user_inventory')
              and grantee = 'anon') as anon_grants,
          (select count(*) from pg_policies
            where schemaname = 'public' and tablename in ('xp_transactions','user_progression')
              and cmd = 'SELECT'
              and (qual is null or qual not like '%bakhi_current_student_id%')) as unsafe_select
    `);
    if (!sec.ok) {
        bad('truy vấn bảo mật', sec.text.slice(0, 200));
    } else {
        const r = sec.data[0];
        Number(r.write_policies) === 0
            ? ok('không có policy INSERT/UPDATE/DELETE cho học sinh')
            : bad('phát hiện policy ghi trên bảng tiến trình', String(r.write_policies));
        Number(r.boss_q_policies) === 0 && Number(r.boss_q_grants) === 0
            ? ok('boss_questions không đọc được từ trình duyệt')
            : bad('boss_questions bị lộ quyền đọc');
        Number(r.anon_grants) === 0
            ? ok('anon không có quyền trên bảng tiến trình')
            : bad('anon có quyền trên bảng tiến trình');
        Number(r.unsafe_select) === 0
            ? ok('policy SELECT đều giới hạn theo học sinh hiện tại')
            : bad('policy SELECT không giới hạn theo học sinh');
    }

    /* 4. Engine thật, trong transaction bị rollback */
    const engine = await query(ENGINE_TEST);
    if (engine.ok) {
        ok('engine XP/cấp/thành tựu/nhiệm vụ/boss/vật phẩm (15 nhóm kiểm tra, rollback)');
        ok('không để lại dữ liệu thử trên production');
    } else {
        bad('engine nghiệp vụ', engine.text.replace(/\s+/g, ' ').slice(0, 400));
    }

    /* 4b. 8.3.6 — khung hồ sơ, đặt cấp độ, buff XP (rollback) */
    const adminTest = await query(ADMIN_TEST);
    if (adminTest.ok) {
        ok('khung hồ sơ + đặt cấp độ + buff XP (12 nhóm kiểm tra, rollback)');
    } else {
        bad('quản trị gamification 8.3.6', adminTest.text.replace(/\s+/g, ' ').slice(0, 600));
    }

    /* 4c. Dữ liệu thật: không hồ sơ nào đang dùng khung ngoài danh sách sở hữu */
    const framesQ = await query(`
        select count(*) as n from public.student_profiles sp
        where sp.frame is not null and sp.frame <> 'none'
          and sp.frame <> all (public.bakhi_owned_frames(sp.student_id))
    `);
    if (!framesQ.ok) {
        bad('khung hồ sơ trên dữ liệu thật', framesQ.text.slice(0, 200));
    } else {
        Number(framesQ.data[0].n) === 0
            ? ok('mọi khung đang trang bị đều nằm trong danh sách sở hữu')
            : bad('có ' + framesQ.data[0].n + ' hồ sơ dùng khung chưa mở');
    }

    /* 5. Không lệch sổ trên dữ liệu thật */
    const drift = await query('select count(*) as n from public.bk_gam_admin_drift()');
    if (!drift.ok) {
        bad('đối chiếu sổ XP', drift.text.slice(0, 200));
    } else {
        Number(drift.data[0].n) === 0
            ? ok('không có lệch giữa sổ XP và bảng tiến trình')
            : bad('có ' + drift.data[0].n + ' học sinh lệch XP');
    }

    console.log('\nKết quả: ' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) {
        console.log('\nLỗi:');
        failures.forEach((f) => console.log('  - ' + f));
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('Lỗi không xử lý được:', e && e.message ? e.message : e);
    process.exit(1);
});

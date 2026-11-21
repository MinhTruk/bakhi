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

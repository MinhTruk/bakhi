-- ============================================================================
-- Bá Khí v8.3.8 — Gamification Overhaul, Skills Tree & Founder Control
--
-- Mục tiêu:
--   1. Sửa lỗi thành tựu không được trao khi cấp độ thay đổi do buff XP hoặc
--      do Founder đặt cấp trực tiếp: bk_gam_set_level / bk_gam_adjust gọi
--      bk_gam_evaluate trong CÙNG transaction.
--   2. Cây kỹ năng có điều kiện thật: cấp độ tối thiểu, nhiệm vụ bắt buộc,
--      thành tựu bắt buộc, node tiên quyết + toạ độ hiển thị và nhánh động.
--   3. Kho vật phẩm có SỐ LƯỢNG (user_inventory.quantity) để Founder trao
--      nhiều bản; Reward Engine vẫn idempotent (không nhân bản phần thưởng).
--   4. Founder: cấp trọn cây kỹ năng, trao vật phẩm, trao thành tựu — tất cả
--      kiểm tra quyền phía máy chủ và ghi gamification_activity_logs.
--   5. Mở rộng danh mục vật phẩm + bộ sưu tập thành tựu theo nhóm thật.
--
-- An toàn:
--   · Idempotent: chạy lại nhiều lần không lỗi, không nhân bản bản ghi.
--   · Không xoá dữ liệu người học; chỉ thêm cột có DEFAULT.
--   · Không đổi công thức cấp độ (bk_gam_level_floor giữ nguyên).
--
-- Rollback (chạy tay khi cần):
--   drop function if exists public.bk_gam_grant_skill_tree(uuid, text, text);
--   drop function if exists public.bk_gam_grant_achievements(uuid, jsonb, text, text);
--   drop function if exists public.bk_gam_grant_items(uuid, jsonb, text, text);
--   drop function if exists public.bk_gam_details(uuid);
--   drop function if exists public.bk_gam_tree_issues();
--   drop function if exists public.bk_gam_node_blockers(uuid, text);
--   alter table public.user_inventory drop column if exists quantity;
--   alter table public.user_skill_progress
--       drop column if exists granted, drop column if exists granted_by,
--       drop column if exists granted_at;
--   alter table public.skill_tree_nodes
--       drop column if exists min_level, drop column if exists required_missions,
--       drop column if exists required_achievements,
--       drop column if exists pos_x, drop column if exists pos_y;
--   drop table if exists public.skill_branches;
--   (rồi chạy lại mục 12–14 của 20261209000000_bakhi_v830_gamification.sql)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Nhánh kỹ năng do quản trị cấu hình (Founder thêm nhánh mới)
-- ---------------------------------------------------------------------------
create table if not exists public.skill_branches (
    id          text primary key check (char_length(id) between 1 and 40),
    name        text not null check (char_length(btrim(name)) between 1 and 80),
    description text not null default '' check (char_length(description) <= 300),
    icon        text not null default 'fa-circle-nodes' check (char_length(icon) <= 60),
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.skill_branches is
    'Nhánh của cây kỹ năng. Chỉ đọc qua RLS, ghi qua Edge Function gamification-api (service_role).';

insert into public.skill_branches (id, name, description, icon, sort_order) values
    ('knowledge',   'Kiến thức',  'Bài học, chủ đề và các cột mốc kiến thức.',        'fa-book-open',      10),
    ('practice',    'Luyện tập',  'Bài luyện, độ chính xác và số ngày hoạt động.',    'fa-dumbbell',       20),
    ('memory',      'Ghi nhớ',    'Phiên ôn tập và câu hỏi trong Sổ tay câu sai.',    'fa-brain',          30),
    ('consistency', 'Đều đặn',    'Chuỗi ngày học và nhịp học ổn định.',              'fa-calendar-check', 40),
    ('mastery',     'Tinh thông', 'Thử thách Boss và thành tựu đã đạt.',              'fa-dragon',         50)
on conflict (id) do nothing;

drop trigger if exists skill_branches_touch on public.skill_branches;
create trigger skill_branches_touch before update on public.skill_branches
    for each row execute function public.bakhi_touch_updated_at();

alter table public.skill_branches enable row level security;
revoke all on public.skill_branches from anon, authenticated;
grant select on public.skill_branches to authenticated;
grant select, insert, update, delete on public.skill_branches to service_role;

drop policy if exists gamification_branches_read on public.skill_branches;
create policy gamification_branches_read on public.skill_branches
    for select to authenticated using (is_active);

-- ---------------------------------------------------------------------------
-- 2. Node kỹ năng: điều kiện mở rộng + toạ độ cây
--    (branch không còn bị giới hạn 5 giá trị: Founder thêm nhánh được)
-- ---------------------------------------------------------------------------
alter table public.skill_tree_nodes drop constraint if exists skill_tree_nodes_branch_check;
alter table public.skill_tree_nodes
    add constraint skill_tree_nodes_branch_check
    check (char_length(branch) between 1 and 40);

alter table public.skill_tree_nodes
    add column if not exists min_level integer not null default 1,
    add column if not exists required_missions jsonb not null default '[]'::jsonb,
    add column if not exists required_achievements jsonb not null default '[]'::jsonb,
    add column if not exists pos_x integer not null default 0,
    add column if not exists pos_y integer not null default 0;

comment on column public.skill_tree_nodes.min_level is
    'Cấp độ tối thiểu để mở node (1 = không yêu cầu). Điều kiện chỉ số vẫn bắt buộc.';
comment on column public.skill_tree_nodes.required_missions is
    'Mảng mã mission_defs phải hoàn thành ít nhất một lần trước khi mở node.';
comment on column public.skill_tree_nodes.required_achievements is
    'Mảng mã achievement_defs phải sở hữu trước khi mở node.';
comment on column public.skill_tree_nodes.pos_x is
    'Toạ độ ngang trên sơ đồ cây (/skills/). Chỉ để hiển thị, không ảnh hưởng điều kiện.';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'skill_tree_nodes_min_level_check'
          and conrelid = 'public.skill_tree_nodes'::regclass
    ) then
        alter table public.skill_tree_nodes
            add constraint skill_tree_nodes_min_level_check
            check (min_level between 1 and 1000);
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tiến trình node: đánh dấu node được Founder cấp (khác mở theo điều kiện)
-- ---------------------------------------------------------------------------
alter table public.user_skill_progress
    add column if not exists granted boolean not null default false,
    add column if not exists granted_by text,
    add column if not exists granted_at timestamptz;

comment on column public.user_skill_progress.granted is
    'true = Founder cấp trực tiếp (bỏ qua điều kiện). Không xoá tiến trình đã có.';

-- ---------------------------------------------------------------------------
-- 4. Kho vật phẩm: số lượng sở hữu (Founder trao nhiều bản)
-- ---------------------------------------------------------------------------
alter table public.user_inventory
    add column if not exists quantity integer not null default 1
    check (quantity between 1 and 9999);

comment on column public.user_inventory.quantity is
    'Số lượng đang sở hữu. Reward Engine chỉ cấp 1 bản; Founder/Admin trao thêm qua bk_gam_grant_items.';

-- ---------------------------------------------------------------------------
-- 5. Danh mục thành tựu: mở rộng nhóm theo yêu cầu 8.3.8
-- ---------------------------------------------------------------------------
alter table public.achievement_defs drop constraint if exists achievement_defs_category_check;
alter table public.achievement_defs
    add constraint achievement_defs_category_check
    check (category in ('learning', 'quiz', 'reading', 'listening', 'revision',
                        'consistency', 'skill', 'boss', 'milestone', 'event',
                        'mission', 'activity', 'discovery', 'gamification',
                        'special', 'limited'));

-- ---------------------------------------------------------------------------
-- 6. Chỉ số: thêm missions_completed (nhiệm vụ đã hoàn thành ít nhất 1 lần)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_metric(p_student uuid, p_metric text)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v bigint := 0;
    v_days date[];
begin
    if p_metric = 'xp_total' then
        select coalesce(total_xp, 0) into v from public.user_progression where student_id = p_student;
        return coalesce(v, 0);
    elsif p_metric = 'level' then
        select coalesce(level, 1) into v from public.user_progression where student_id = p_student;
        return coalesce(v, 1);
    elsif p_metric = 'boss_passed' then
        select count(*) into v from public.boss_attempts where student_id = p_student and passed;
        return coalesce(v, 0);
    elsif p_metric = 'boss_attempts' then
        select count(*) into v from public.boss_attempts where student_id = p_student;
        return coalesce(v, 0);
    elsif p_metric = 'inventory_count' then
        select count(*) into v from public.user_inventory where student_id = p_student;
        return coalesce(v, 0);
    elsif p_metric = 'skill_nodes_completed' then
        select count(*) into v from public.user_skill_progress
        where student_id = p_student and status = 'completed';
        return coalesce(v, 0);
    elsif p_metric = 'achievements_unlocked' then
        select count(*) into v from public.user_achievements
        where student_id = p_student and unlocked_at is not null;
        return coalesce(v, 0);
    elsif p_metric = 'missions_completed' then
        select count(distinct um.mission_id) into v from public.user_missions um
        where um.student_id = p_student and um.status in ('completed', 'claimed');
        return coalesce(v, 0);
    elsif p_metric in ('distinct_active_days', 'streak_days') then
        select array_agg(d order by d) into v_days
        from (select distinct (created_at at time zone 'UTC')::date as d
              from public.xp_transactions
              where student_id = p_student and amount > 0) s;
        if v_days is null or cardinality(v_days) = 0 then return 0; end if;
        if p_metric = 'distinct_active_days' then return cardinality(v_days); end if;
        declare
            i integer := 1;
            run integer := 1;
            best integer := 1;
        begin
            while i < cardinality(v_days) loop
                if v_days[i + 1] - v_days[i] = 1 then
                    run := run + 1;
                    best := greatest(best, run);
                else
                    run := 1;
                end if;
                i := i + 1;
            end loop;
            /* Chuỗi còn "sống" chỉ khi ngày hoạt động cuối là hôm nay/UTC hôm qua. */
            if v_days[cardinality(v_days)] < ((now() at time zone 'UTC')::date - 1) then
                return 0;
            end if;
            return best;
        end;
    else
        select count(*) into v
        from public.xp_transactions t
        where t.student_id = p_student
          and t.activity_type = p_metric
          and t.amount > 0;
        return coalesce(v, 0);
    end if;
end;
$$;

revoke all on function public.bk_gam_metric(uuid, text) from public;
revoke all on function public.bk_gam_metric(uuid, text) from anon, authenticated;
grant execute on function public.bk_gam_metric(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Điều kiện còn thiếu của một node (dùng cho cả máy chủ và /skills/)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_node_blockers(p_student uuid, p_node text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    n        record;
    v_level  integer;
    v_req    text;
    v_list   jsonb := '[]'::jsonb;
begin
    select * into n from public.skill_tree_nodes where id = p_node;
    if not found then
        return '[]'::jsonb;
    end if;

    select coalesce(level, 1) into v_level
      from public.user_progression where student_id = p_student;
    v_level := coalesce(v_level, 1);

    if v_level < coalesce(n.min_level, 1) then
        v_list := v_list || jsonb_build_object(
            'kind', 'level', 'id', 'level',
            'label', 'Cần đạt cấp ' || coalesce(n.min_level, 1),
            'current', v_level, 'target', coalesce(n.min_level, 1), 'met', false);
    end if;

    if jsonb_typeof(n.requires) = 'array' then
        for v_req in select jsonb_array_elements_text(n.requires) loop
            if not exists (
                select 1 from public.user_skill_progress u
                where u.student_id = p_student and u.node_id = v_req and u.status = 'completed'
            ) then
                v_list := v_list || jsonb_build_object(
                    'kind', 'node', 'id', v_req,
                    'label', 'Chưa mở kỹ năng: ' ||
                        coalesce((select name from public.skill_tree_nodes where id = v_req), v_req),
                    'met', false);
            end if;
        end loop;
    end if;

    if jsonb_typeof(n.required_missions) = 'array' then
        for v_req in select jsonb_array_elements_text(n.required_missions) loop
            if not exists (
                select 1 from public.user_missions m
                where m.student_id = p_student and m.mission_id = v_req
                  and m.status in ('completed', 'claimed')
            ) then
                v_list := v_list || jsonb_build_object(
                    'kind', 'mission', 'id', v_req,
                    'label', 'Chưa hoàn thành nhiệm vụ: ' ||
                        coalesce((select name from public.mission_defs where id = v_req), v_req),
                    'met', false);
            end if;
        end loop;
    end if;

    if jsonb_typeof(n.required_achievements) = 'array' then
        for v_req in select jsonb_array_elements_text(n.required_achievements) loop
            if not exists (
                select 1 from public.user_achievements a
                where a.student_id = p_student and a.achievement_id = v_req
                  and a.unlocked_at is not null
            ) then
                v_list := v_list || jsonb_build_object(
                    'kind', 'achievement', 'id', v_req,
                    'label', 'Chưa nhận thành tựu: ' ||
                        coalesce((select name from public.achievement_defs where id = v_req), v_req),
                    'met', false);
            end if;
        end loop;
    end if;

    return v_list;
end;
$$;

revoke all on function public.bk_gam_node_blockers(uuid, text) from public;
revoke all on function public.bk_gam_node_blockers(uuid, text) from anon, authenticated;
grant execute on function public.bk_gam_node_blockers(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Reward Engine: thành tựu + cây kỹ năng theo điều kiện mới
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_evaluate(p_student uuid, p_depth integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_ach        record;
    v_cond       jsonb;
    v_pct        integer;
    v_min_pct    integer;
    v_stage      integer;
    v_unlocked   jsonb := '[]'::jsonb;
    v_new_items  jsonb := '[]'::jsonb;
    v_items      jsonb;
    v_item       text;
    v_nodes      jsonb := '[]'::jsonb;
    v_node       record;
    v_blockers   jsonb;
    v_available  boolean;
    v_status     text;
    v_prev       text;
    v_pct_node   integer;
    v_missions   jsonb := '[]'::jsonb;
begin
    -- Thành tựu: mỗi bậc một lần; tiến trình tính từ chỉ số thật.
    for v_ach in
        select * from public.achievement_defs where is_active order by sort_order, id
    loop
        for v_stage in 1..v_ach.stages loop
            continue when exists (
                select 1 from public.user_achievements ua
                where ua.student_id = p_student and ua.achievement_id = v_ach.id
                  and ua.stage = v_stage and ua.unlocked_at is not null
            );

            v_min_pct := 100;
            if jsonb_typeof(v_ach.conditions) <> 'array' or jsonb_array_length(v_ach.conditions) = 0 then
                v_min_pct := 0;
            else
                for v_cond in select * from jsonb_array_elements(v_ach.conditions) loop
                    v_pct := least(100, floor(
                        100.0 * public.bk_gam_metric(p_student, v_cond ->> 'metric') /
                        greatest(1, coalesce((v_cond ->> 'target')::numeric, 1) * v_stage)
                    )::integer);
                    v_min_pct := least(v_min_pct, v_pct);
                end loop;
            end if;

            insert into public.user_achievements (student_id, achievement_id, stage, progress, unlocked_at)
            values (p_student, v_ach.id, v_stage, v_min_pct,
                    case when v_min_pct >= 100 then now() else null end)
            on conflict (student_id, achievement_id, stage) do update
                set progress = greatest(public.user_achievements.progress, excluded.progress),
                    unlocked_at = coalesce(public.user_achievements.unlocked_at, excluded.unlocked_at),
                    updated_at = now();

            if v_min_pct >= 100 then
                v_unlocked := v_unlocked || jsonb_build_object(
                    'id', v_ach.id, 'name', v_ach.name, 'stage', v_stage,
                    'rarity', v_ach.rarity, 'category', v_ach.category, 'icon', v_ach.icon);
                insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
                values (p_student, 'system', 'achievement_unlocked',
                        jsonb_build_object('achievement', v_ach.id, 'stage', v_stage));
                if p_depth = 0 then
                    perform public.bk_gam_award(p_student, 'achievement_reward',
                        'achievement:' || v_ach.id || ':' || v_stage,
                        'ach:' || v_ach.id || ':' || v_stage, p_depth + 1);
                end if;
                v_items := v_ach.reward -> 'items';
                if jsonb_typeof(v_items) = 'array' then
                    for v_item in select jsonb_array_elements_text(v_items) loop
                        if public.bk_gam_grant_item(p_student, v_item, 'achievement:' || v_ach.id) then
                            v_new_items := v_new_items || to_jsonb(v_item);
                        end if;
                    end loop;
                end if;
            end if;
        end loop;
    end loop;

    -- Cây kỹ năng: xét đủ điều kiện (cấp độ, node trước, nhiệm vụ, thành tựu).
    for v_node in
        select * from public.skill_tree_nodes where is_active order by sort_order, id
    loop
        continue when exists (
            select 1 from public.user_skill_progress usp
            where usp.student_id = p_student and usp.node_id = v_node.id and usp.status = 'completed'
        );

        v_blockers := public.bk_gam_node_blockers(p_student, v_node.id);
        v_available := jsonb_array_length(v_blockers) = 0;
        v_pct_node := least(100, floor(
            100.0 * public.bk_gam_metric(p_student, v_node.metric) / greatest(1, v_node.target)
        )::integer);

        if v_pct_node >= 100 then
            v_status := case when v_available then 'completed' else 'in_progress' end;
        elsif not v_available then
            v_status := 'locked';
        elsif v_pct_node > 0 then
            v_status := 'in_progress';
        else
            v_status := 'available';
        end if;

        select status into v_prev from public.user_skill_progress
        where student_id = p_student and node_id = v_node.id;
        if v_prev = 'completed' then
            continue;  -- không bao giờ hạ trạng thái đã hoàn thành
        end if;

        insert into public.user_skill_progress (student_id, node_id, progress, status, completed_at)
        values (p_student, v_node.id, v_pct_node, v_status,
                case when v_status = 'completed' then now() else null end)
        on conflict (student_id, node_id) do update
            set progress = greatest(public.user_skill_progress.progress, excluded.progress),
                status = excluded.status,
                completed_at = coalesce(public.user_skill_progress.completed_at, excluded.completed_at),
                updated_at = now();

        if v_status = 'completed' then
            v_nodes := v_nodes || jsonb_build_object('id', v_node.id, 'name', v_node.name, 'branch', v_node.branch);
            insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
            values (p_student, 'system', 'skill_node_completed',
                    jsonb_build_object('node', v_node.id, 'branch', v_node.branch));
            if p_depth = 0 then
                perform public.bk_gam_award(p_student, 'skill_node', 'skill:' || v_node.id,
                                            'skill:' || v_node.id, p_depth + 1);
            end if;
            v_items := v_node.reward -> 'items';
            if jsonb_typeof(v_items) = 'array' then
                for v_item in select jsonb_array_elements_text(v_items) loop
                    if public.bk_gam_grant_item(p_student, v_item, 'skill:' || v_node.id) then
                        v_new_items := v_new_items || to_jsonb(v_item);
                    end if;
                end loop;
            end if;
        end if;
    end loop;

    -- Nhiệm vụ đang mở: cập nhật tiến trình, đánh dấu hoàn thành (chưa nhận thưởng).
    update public.user_missions um
       set progress = sub.metric_value,
           status = case when sub.metric_value >= um.target then 'completed' else 'in_progress' end,
           completed_at = case when sub.metric_value >= um.target
                               then coalesce(um.completed_at, now()) else um.completed_at end
      from (
            select um2.id,
                   least(public.bk_gam_metric(p_student, md.metric), um2.target) as metric_value
              from public.user_missions um2
              join public.mission_defs md on md.id = um2.mission_id
             where um2.student_id = p_student and um2.status in ('available', 'in_progress')
           ) sub
     where um.id = sub.id;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'mission_id', mission_id)),
                    '[]'::jsonb)
      into v_missions
      from public.user_missions
     where student_id = p_student and status = 'completed' and completed_at is not null
       and claimed_at is null;

    return jsonb_build_object(
        'achievements', v_unlocked,
        'nodes', v_nodes,
        'items', v_new_items,
        'missions_completed', v_missions
    );
end;
$$;

revoke all on function public.bk_gam_evaluate(uuid, integer) from public;
revoke all on function public.bk_gam_evaluate(uuid, integer) from anon, authenticated;
grant execute on function public.bk_gam_evaluate(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 9. bk_gam_set_level: đánh giá thành tựu ngay sau khi đổi cấp
--    (đây là lỗi 8.3.8: buff Level không mở thành tựu mốc cấp)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_set_level(
    p_student uuid,
    p_level   integer,
    p_actor   text,
    p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_target_level integer := greatest(1, least(100, coalesce(p_level, 1)));
    v_target_xp    bigint;
    v_before_xp    bigint;
    v_before_level integer;
    v_delta        bigint;
    v_chunk        integer;
    v_eval         jsonb := '{}'::jsonb;
begin
    if p_student is null then
        return jsonb_build_object('ok', false, 'code', 'BAD_STUDENT');
    end if;

    insert into public.user_progression (student_id, total_xp, level)
    values (p_student, 0, 1) on conflict (student_id) do nothing;

    select total_xp, level into v_before_xp, v_before_level
    from public.user_progression where student_id = p_student;

    v_target_xp := public.bk_gam_level_floor(v_target_level);
    v_delta := v_target_xp - v_before_xp;

    while v_delta <> 0 loop
        v_chunk := greatest(-100000, least(100000, v_delta))::integer;
        insert into public.xp_transactions
            (student_id, activity_type, source_id, amount, status, idempotency_key, metadata)
        values (p_student, 'admin_level', left(coalesce(p_actor, 'founder'), 200), v_chunk, 'adjusted',
                'level:' || gen_random_uuid()::text,
                jsonb_build_object(
                    'reason', left(coalesce(p_reason, ''), 500),
                    'target_level', v_target_level,
                    'from_level', v_before_level
                ));
        v_delta := v_delta - v_chunk;
    end loop;

    update public.user_progression
       set total_xp = v_target_xp, level = v_target_level, updated_at = now()
     where student_id = p_student;

    insert into public.gamification_activity_logs (student_id, actor_kind, actor_label, action, detail)
    values (p_student, 'admin', left(coalesce(p_actor, 'founder'), 120), 'level_set',
            jsonb_build_object(
                'from_level', v_before_level,
                'to_level', v_target_level,
                'from_xp', v_before_xp,
                'to_xp', v_target_xp,
                'reason', left(coalesce(p_reason, ''), 500)
            ));

    /* 8.3.8: mọi thành tựu có điều kiện cấp độ phải được xét trong cùng
       transaction — không chờ lần học sau mới cập nhật tiến trình. */
    v_eval := public.bk_gam_evaluate(p_student, 0);

    return jsonb_build_object(
        'ok', true,
        'level', v_target_level,
        'total_xp', v_target_xp,
        'previous_level', v_before_level,
        'previous_xp', v_before_xp,
        'delta', v_target_xp - v_before_xp,
        'evaluation', v_eval
    );
end;
$$;

revoke all on function public.bk_gam_set_level(uuid, integer, text, text) from public;
revoke all on function public.bk_gam_set_level(uuid, integer, text, text) from anon, authenticated;
grant execute on function public.bk_gam_set_level(uuid, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. bk_gam_adjust: buff/trừ XP cũng phải xét thành tựu mốc cấp
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_adjust(
    p_student uuid,
    p_amount  integer,
    p_reason  text,
    p_actor   text,
    p_meta    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_key   text;
    v_row   record;
    v_total bigint;
    v_level integer;
    v_eval  jsonb := '{}'::jsonb;
begin
    if p_amount = 0 then
        return jsonb_build_object('ok', false, 'code', 'ZERO_AMOUNT');
    end if;

    insert into public.user_progression (student_id, total_xp, level)
    values (p_student, 0, 1) on conflict (student_id) do nothing;

    select total_xp, level into v_row from public.user_progression where student_id = p_student;
    v_total := greatest(0, v_row.total_xp + p_amount);
    v_level := public.bk_gam_level(v_total);
    v_key := 'adjust:' || gen_random_uuid()::text;

    insert into public.xp_transactions
        (student_id, activity_type, source_id, amount, status, idempotency_key, metadata)
    values (p_student, 'admin_adjust', left(coalesce(p_actor, 'admin'), 200), p_amount, 'adjusted',
            v_key, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)) || coalesce(p_meta, '{}'::jsonb));

    update public.user_progression
       set total_xp = v_total, level = v_level, updated_at = now()
     where student_id = p_student;

    insert into public.gamification_activity_logs (student_id, actor_kind, actor_label, action, detail)
    values (p_student, 'admin', left(coalesce(p_actor, 'admin'), 120), 'xp_adjusted',
            jsonb_build_object('amount', p_amount, 'reason', left(coalesce(p_reason, ''), 500),
                               'total_xp', v_total, 'level', v_level));

    /* 8.3.8: tăng nhiều cấp trong một lần buff vẫn phải mở đủ thành tựu mốc. */
    v_eval := public.bk_gam_evaluate(p_student, 0);

    return jsonb_build_object('ok', true, 'total_xp', v_total, 'level', v_level,
                              'evaluation', v_eval);
end;
$$;

revoke all on function public.bk_gam_adjust(uuid, integer, text, text, jsonb) from public;
revoke all on function public.bk_gam_adjust(uuid, integer, text, text, jsonb) from anon, authenticated;
grant execute on function public.bk_gam_adjust(uuid, integer, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Founder trao vật phẩm (có số lượng, tôn trọng giới hạn metadata)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_grant_items(
    p_student uuid,
    p_items   jsonb,
    p_actor   text,
    p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_item    jsonb;
    v_id      text;
    v_qty     integer;
    v_max     integer;
    v_before  integer;
    v_after   integer;
    v_granted jsonb := '[]'::jsonb;
    v_skipped jsonb := '[]'::jsonb;
begin
    if p_student is null then
        return jsonb_build_object('ok', false, 'code', 'BAD_STUDENT');
    end if;
    if jsonb_typeof(p_items) <> 'array' then
        return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS');
    end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
        v_id := left(coalesce(v_item ->> 'item_id', ''), 64);
        v_qty := greatest(1, least(999, coalesce((v_item ->> 'quantity')::integer, 1)));

        if v_id = '' or not exists (
            select 1 from public.reward_catalog where id = v_id and is_active
        ) then
            v_skipped := v_skipped || jsonb_build_object('item_id', v_id, 'reason', 'unknown_item');
            continue;
        end if;

        select coalesce((metadata ->> 'max_quantity')::integer, 999) into v_max
        from public.reward_catalog where id = v_id;
        v_max := greatest(1, least(9999, coalesce(v_max, 9999)));

        select coalesce(quantity, 0) into v_before
        from public.user_inventory where student_id = p_student and item_id = v_id;
        v_before := coalesce(v_before, 0);
        v_after := least(v_max, v_before + v_qty);

        if v_after <= v_before then
            v_skipped := v_skipped || jsonb_build_object(
                'item_id', v_id, 'reason', 'limit_reached', 'quantity', v_before);
            continue;
        end if;

        insert into public.user_inventory (student_id, item_id, source, quantity)
        values (p_student, v_id, left(coalesce(p_actor, 'founder'), 80), v_after)
        on conflict (student_id, item_id) do update
            set quantity = excluded.quantity;

        v_granted := v_granted || jsonb_build_object(
            'item_id', v_id, 'quantity', v_after, 'added', v_after - v_before);
    end loop;

    insert into public.gamification_activity_logs (student_id, actor_kind, actor_label, action, detail)
    values (p_student, 'admin', left(coalesce(p_actor, 'founder'), 120), 'items_granted',
            jsonb_build_object(
                'items', v_granted,
                'skipped', v_skipped,
                'reason', left(coalesce(p_reason, ''), 500)
            ));

    return jsonb_build_object('ok', true, 'granted', v_granted, 'skipped', v_skipped);
end;
$$;

revoke all on function public.bk_gam_grant_items(uuid, jsonb, text, text) from public;
revoke all on function public.bk_gam_grant_items(uuid, jsonb, text, text) from anon, authenticated;
grant execute on function public.bk_gam_grant_items(uuid, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 12. Founder trao thành tựu (không trao trùng, không cộng XP lần hai)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_grant_achievements(
    p_student uuid,
    p_ids     jsonb,
    p_actor   text,
    p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id       text;
    v_def      record;
    v_stage    integer;
    v_prev     timestamptz;
    v_granted  jsonb := '[]'::jsonb;
    v_skipped  jsonb := '[]'::jsonb;
    v_item     text;
    v_items    jsonb := '[]'::jsonb;
begin
    if p_student is null then
        return jsonb_build_object('ok', false, 'code', 'BAD_STUDENT');
    end if;
    if jsonb_typeof(p_ids) <> 'array' then
        return jsonb_build_object('ok', false, 'code', 'BAD_ACHIEVEMENTS');
    end if;

    for v_id in select jsonb_array_elements_text(p_ids) loop
        select * into v_def from public.achievement_defs
        where id = left(v_id, 64) and is_active;
        if not found then
            v_skipped := v_skipped || jsonb_build_object('id', v_id, 'reason', 'unknown_achievement');
            continue;
        end if;

        for v_stage in 1..v_def.stages loop
            select unlocked_at into v_prev from public.user_achievements
            where student_id = p_student and achievement_id = v_def.id and stage = v_stage;

            if v_prev is not null then
                v_skipped := v_skipped || jsonb_build_object(
                    'id', v_def.id, 'stage', v_stage, 'reason', 'already_owned');
                continue;
            end if;

            insert into public.user_achievements (student_id, achievement_id, stage, progress, unlocked_at)
            values (p_student, v_def.id, v_stage, 100, now())
            on conflict (student_id, achievement_id, stage) do update
                set progress = 100,
                    unlocked_at = coalesce(public.user_achievements.unlocked_at, now()),
                    updated_at = now();

            v_granted := v_granted || jsonb_build_object(
                'id', v_def.id, 'name', v_def.name, 'stage', v_stage,
                'rarity', v_def.rarity, 'icon', v_def.icon);

            insert into public.gamification_activity_logs (student_id, actor_kind, actor_label, action, detail)
            values (p_student, 'admin', left(coalesce(p_actor, 'founder'), 120), 'achievement_granted',
                    jsonb_build_object('achievement', v_def.id, 'stage', v_stage,
                                       'reason', left(coalesce(p_reason, ''), 500)));

            if jsonb_typeof(v_def.reward -> 'items') = 'array' then
                for v_item in select jsonb_array_elements_text(v_def.reward -> 'items') loop
                    if public.bk_gam_grant_item(p_student, v_item, 'achievement:' || v_def.id) then
                        v_items := v_items || to_jsonb(v_item);
                    end if;
                end loop;
            end if;
        end loop;
    end loop;

    return jsonb_build_object('ok', true, 'granted', v_granted,
                              'skipped', v_skipped, 'items', v_items);
end;
$$;

revoke all on function public.bk_gam_grant_achievements(uuid, jsonb, text, text) from public;
revoke all on function public.bk_gam_grant_achievements(uuid, jsonb, text, text) from anon, authenticated;
grant execute on function public.bk_gam_grant_achievements(uuid, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 13. Founder cấp trọn cây kỹ năng (không xoá tiến trình, không trao trùng)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_grant_skill_tree(
    p_student uuid,
    p_actor   text,
    p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_node    record;
    v_prev    text;
    v_granted jsonb := '[]'::jsonb;
    v_items   jsonb := '[]'::jsonb;
    v_item    text;
    v_count   integer := 0;
    v_skipped integer := 0;
    v_eval    jsonb := '{}'::jsonb;
begin
    if p_student is null then
        return jsonb_build_object('ok', false, 'code', 'BAD_STUDENT');
    end if;

    insert into public.user_progression (student_id, total_xp, level)
    values (p_student, 0, 1) on conflict (student_id) do nothing;

    for v_node in
        select * from public.skill_tree_nodes where is_active order by sort_order, id
    loop
        select status into v_prev from public.user_skill_progress
        where student_id = p_student and node_id = v_node.id;

        if v_prev = 'completed' then
            v_skipped := v_skipped + 1;
            continue;
        end if;

        insert into public.user_skill_progress
            (student_id, node_id, progress, status, completed_at, granted, granted_by, granted_at)
        values (p_student, v_node.id, 100, 'completed', now(), true,
                left(coalesce(p_actor, 'founder'), 120), now())
        on conflict (student_id, node_id) do update
            set progress = 100,
                status = 'completed',
                completed_at = coalesce(public.user_skill_progress.completed_at, now()),
                granted = true,
                granted_by = left(coalesce(p_actor, 'founder'), 120),
                granted_at = now(),
                updated_at = now();

        v_count := v_count + 1;
        v_granted := v_granted || jsonb_build_object(
            'id', v_node.id, 'name', v_node.name, 'branch', v_node.branch);

        insert into public.gamification_activity_logs (student_id, actor_kind, actor_label, action, detail)
        values (p_student, 'admin', left(coalesce(p_actor, 'founder'), 120), 'skill_node_granted',
                jsonb_build_object('node', v_node.id, 'branch', v_node.branch,
                                   'reason', left(coalesce(p_reason, ''), 500)));

        if jsonb_typeof(v_node.reward -> 'items') = 'array' then
            for v_item in select jsonb_array_elements_text(v_node.reward -> 'items') loop
                if public.bk_gam_grant_item(p_student, v_item, 'skill:' || v_node.id) then
                    v_items := v_items || to_jsonb(v_item);
                end if;
            end loop;
        end if;
    end loop;

    insert into public.gamification_activity_logs (student_id, actor_kind, actor_label, action, detail)
    values (p_student, 'admin', left(coalesce(p_actor, 'founder'), 120), 'skill_tree_granted',
            jsonb_build_object(
                'granted', v_count,
                'already_completed', v_skipped,
                'reason', left(coalesce(p_reason, ''), 500)
            ));

    v_eval := public.bk_gam_evaluate(p_student, 0);

    return jsonb_build_object('ok', true, 'granted', v_count,
                              'already_completed', v_skipped,
                              'nodes', v_granted, 'items', v_items,
                              'evaluation', v_eval);
end;
$$;

revoke all on function public.bk_gam_grant_skill_tree(uuid, text, text) from public;
revoke all on function public.bk_gam_grant_skill_tree(uuid, text, text) from anon, authenticated;
grant execute on function public.bk_gam_grant_skill_tree(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 14. Chi tiết bổ sung cho dashboard (API ghép vào bk_gam_state)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_details(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'branch_defs', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', b.id, 'name', b.name, 'description', b.description,
                'icon', b.icon, 'sort_order', b.sort_order
            ) order by b.sort_order, b.id)
            from public.skill_branches b where b.is_active
        ), '[]'::jsonb),
        'node_details', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', n.id,
                'min_level', n.min_level,
                'required_missions', n.required_missions,
                'required_achievements', n.required_achievements,
                'pos_x', n.pos_x,
                'pos_y', n.pos_y,
                'blockers', public.bk_gam_node_blockers(p_student, n.id),
                'granted', coalesce(usp.granted, false),
                'granted_at', usp.granted_at
            ))
            from public.skill_tree_nodes n
            left join public.user_skill_progress usp
                   on usp.node_id = n.id and usp.student_id = p_student
            where n.is_active
        ), '[]'::jsonb),
        'achievement_details', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', a.id,
                'conditions', a.conditions,
                'condition_detail', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'metric', c ->> 'metric',
                        'target', coalesce((c ->> 'target')::integer, 1),
                        'current', public.bk_gam_metric(p_student, c ->> 'metric'),
                        'pct', least(100, floor(
                            100.0 * public.bk_gam_metric(p_student, c ->> 'metric') /
                            greatest(1, coalesce((c ->> 'target')::numeric, 1))
                        )::integer),
                        'met', public.bk_gam_metric(p_student, c ->> 'metric') >=
                               coalesce((c ->> 'target')::bigint, 1)
                    ))
                    from jsonb_array_elements(
                        case when jsonb_typeof(a.conditions) = 'array' then a.conditions else '[]'::jsonb end
                    ) c
                ), '[]'::jsonb),
                'stages_unlocked', (
                    select count(*) from public.user_achievements ua
                    where ua.student_id = p_student and ua.achievement_id = a.id
                      and ua.unlocked_at is not null
                )
            ))
            from public.achievement_defs a where a.is_active
        ), '[]'::jsonb),
        'items', coalesce((
            select jsonb_agg(jsonb_build_object(
                'item_id', ui.item_id, 'quantity', ui.quantity))
            from public.user_inventory ui where ui.student_id = p_student
        ), '[]'::jsonb),
        'skill_summary', jsonb_build_object(
            'total', (select count(*) from public.skill_tree_nodes where is_active),
            'completed', (select count(*) from public.user_skill_progress
                          where student_id = p_student and status = 'completed'),
            'granted', (select count(*) from public.user_skill_progress
                        where student_id = p_student and granted)
        )
    ) into v_result;

    return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.bk_gam_details(uuid) from public;
revoke all on function public.bk_gam_details(uuid) from anon, authenticated;
grant execute on function public.bk_gam_details(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 15. Kiểm tra cấu trúc cây (chu trình, tham chiếu thiếu, node cô lập)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_tree_issues()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_issues jsonb := '[]'::jsonb;
    v_row    record;
    v_cycle  record;
begin
    /* 15.1 Nhánh không tồn tại */
    for v_row in
        select n.id, n.branch from public.skill_tree_nodes n
        where n.is_active and not exists (
            select 1 from public.skill_branches b where b.id = n.branch and b.is_active
        )
    loop
        v_issues := v_issues || jsonb_build_object(
            'severity', 'error', 'node', v_row.id,
            'message', 'Nhánh “' || v_row.branch || '” không tồn tại hoặc đã tắt.');
    end loop;

    /* 15.2 Node tiên quyết không tồn tại / tự trỏ vào chính nó */
    for v_row in
        select n.id, r.value as req
        from public.skill_tree_nodes n,
             jsonb_array_elements_text(
                 case when jsonb_typeof(n.requires) = 'array' then n.requires else '[]'::jsonb end
             ) r
        where n.is_active
    loop
        if v_row.req = v_row.id then
            v_issues := v_issues || jsonb_build_object(
                'severity', 'error', 'node', v_row.id,
                'message', 'Node đang yêu cầu chính nó.');
        elsif not exists (
            select 1 from public.skill_tree_nodes x where x.id = v_row.req and x.is_active
        ) then
            v_issues := v_issues || jsonb_build_object(
                'severity', 'error', 'node', v_row.id,
                'message', 'Node tiên quyết “' || v_row.req || '” không tồn tại.');
        end if;
    end loop;

    /* 15.3 Nhiệm vụ / thành tựu / vật phẩm thưởng không tồn tại */
    for v_row in
        select n.id, r.value as req
        from public.skill_tree_nodes n,
             jsonb_array_elements_text(
                 case when jsonb_typeof(n.required_missions) = 'array'
                      then n.required_missions else '[]'::jsonb end
             ) r
        where n.is_active
    loop
        if not exists (select 1 from public.mission_defs m where m.id = v_row.req) then
            v_issues := v_issues || jsonb_build_object(
                'severity', 'error', 'node', v_row.id,
                'message', 'Nhiệm vụ bắt buộc “' || v_row.req || '” không tồn tại.');
        end if;
    end loop;

    for v_row in
        select n.id, r.value as req
        from public.skill_tree_nodes n,
             jsonb_array_elements_text(
                 case when jsonb_typeof(n.required_achievements) = 'array'
                      then n.required_achievements else '[]'::jsonb end
             ) r
        where n.is_active
    loop
        if not exists (select 1 from public.achievement_defs a where a.id = v_row.req) then
            v_issues := v_issues || jsonb_build_object(
                'severity', 'error', 'node', v_row.id,
                'message', 'Thành tựu bắt buộc “' || v_row.req || '” không tồn tại.');
        end if;
    end loop;

    /* 15.4 Chu trình điều kiện */
    for v_cycle in
        with recursive walk(start, node, depth) as (
            select n.id, n.id, 0
              from public.skill_tree_nodes n where n.is_active
            union all
            select w.start, r.value, w.depth + 1
              from walk w
              join public.skill_tree_nodes n on n.id = w.node and n.is_active,
                   jsonb_array_elements_text(
                       case when jsonb_typeof(n.requires) = 'array' then n.requires else '[]'::jsonb end
                   ) r
             where w.depth < 40
        )
        select distinct start from walk where depth > 0 and node = start
    loop
        v_issues := v_issues || jsonb_build_object(
            'severity', 'error', 'node', v_cycle.start,
            'message', 'Phát hiện vòng lặp điều kiện quanh node “' || v_cycle.start || '”.');
    end loop;

    /* 15.5 Node cô lập: không phải gốc và không được node nào khác yêu cầu */
    for v_row in
        select n.id
          from public.skill_tree_nodes n
         where n.is_active
           and jsonb_array_length(
                 case when jsonb_typeof(n.requires) = 'array' then n.requires else '[]'::jsonb end
               ) > 0
           and not exists (
                 select 1 from public.skill_tree_nodes other
                  where other.is_active
                    and other.requires ? n.id
               )
    loop
        v_issues := v_issues || jsonb_build_object(
            'severity', 'warning', 'node', v_row.id,
            'message', 'Node không được node nào khác kế tiếp — kiểm tra lại quan hệ nhánh.');
    end loop;

    return v_issues;
end;
$$;

revoke all on function public.bk_gam_tree_issues() from public;
revoke all on function public.bk_gam_tree_issues() from anon, authenticated;
grant execute on function public.bk_gam_tree_issues() to service_role;

-- ---------------------------------------------------------------------------
-- 16. Toạ độ + điều kiện cho các node hiện có (giữ nguyên điều kiện chỉ số)
-- ---------------------------------------------------------------------------
update public.skill_tree_nodes set pos_x = 0,   pos_y = 0   where id = 'knowledge-1';
update public.skill_tree_nodes set pos_x = 0,   pos_y = 140 where id = 'knowledge-2';
update public.skill_tree_nodes set pos_x = 0,   pos_y = 280 where id = 'knowledge-3';
update public.skill_tree_nodes set pos_x = 260, pos_y = 0   where id = 'practice-1';
update public.skill_tree_nodes set pos_x = 260, pos_y = 140 where id = 'practice-2';
update public.skill_tree_nodes set pos_x = 260, pos_y = 280 where id = 'practice-3';
update public.skill_tree_nodes set pos_x = 520, pos_y = 0   where id = 'memory-1';
update public.skill_tree_nodes set pos_x = 520, pos_y = 140 where id = 'memory-2';
update public.skill_tree_nodes set pos_x = 520, pos_y = 280 where id = 'memory-3';
update public.skill_tree_nodes set pos_x = 780, pos_y = 0   where id = 'consistency-1';
update public.skill_tree_nodes set pos_x = 780, pos_y = 140 where id = 'consistency-2';
update public.skill_tree_nodes set pos_x = 780, pos_y = 280 where id = 'consistency-3';
update public.skill_tree_nodes set pos_x = 1040, pos_y = 0   where id = 'mastery-1';
update public.skill_tree_nodes set pos_x = 1040, pos_y = 140 where id = 'mastery-2';
update public.skill_tree_nodes set pos_x = 1040, pos_y = 280 where id = 'mastery-3';

-- ---------------------------------------------------------------------------
-- 17. Node mới: rẽ nhánh, điều kiện cấp độ / nhiệm vụ / thành tựu
-- ---------------------------------------------------------------------------
insert into public.skill_tree_nodes
    (id, branch, name, description, icon, metric, target, requires, reward,
     sort_order, min_level, required_missions, required_achievements, pos_x, pos_y)
values
    ('knowledge-4', 'knowledge', 'Đọc mở rộng',
     'Học 15 lượt bài học và đạt cấp 3.', 'fa-book-bookmark',
     'lesson_study', 15, '["knowledge-2"]'::jsonb, '{}'::jsonb,
     25, 3, '[]'::jsonb, '[]'::jsonb, -140, 240),

    ('knowledge-5', 'knowledge', 'Tổng hợp kiến thức',
     'Hoàn thành 30 bài quiz, đạt cấp 8 và nhận thành tựu Cấp 5.',
     'fa-sitemap', 'quiz_completed', 30,
     '["knowledge-3","knowledge-4"]'::jsonb,
     '{"items":["theme-dawn"]}'::jsonb,
     35, 8, '["mission-daily-quiz-3"]'::jsonb, '["ach-level-5"]'::jsonb, 0, 420),

    ('practice-4', 'practice', 'Luyện chuyên sâu',
     'Hoàn thành 25 bài quiz và đạt cấp 5.', 'fa-bullseye',
     'quiz_completed', 25, '["practice-2"]'::jsonb, '{}'::jsonb,
     55, 5, '[]'::jsonb, '[]'::jsonb, 260, 240),

    ('practice-5', 'practice', 'Bền bỉ hai mươi ngày',
     'Có 20 ngày hoạt động học tập và hoàn thành nhiệm vụ tuần “Năm bài trong tuần”.',
     'fa-mountain-sun', 'distinct_active_days', 20,
     '["practice-3"]'::jsonb, '{}'::jsonb,
     65, 8, '["mission-weekly-quiz-5"]'::jsonb, '[]'::jsonb, 400, 420),

    ('memory-4', 'memory', 'Ôn đều',
     'Hoàn thành 12 phiên ôn tập và đạt cấp 6.', 'fa-arrows-rotate',
     'revision_session', 12, '["memory-2"]'::jsonb,
     '{"items":["theme-midnight"]}'::jsonb,
     85, 6, '[]'::jsonb, '[]'::jsonb, 520, 240),

    ('consistency-4', 'consistency', 'Chuỗi mười bốn ngày',
     'Giữ chuỗi 14 ngày học liên tiếp và đạt cấp 9.', 'fa-calendar-days',
     'streak_days', 14, '["consistency-3"]'::jsonb, '{}'::jsonb,
     125, 9, '[]'::jsonb, '[]'::jsonb, 780, 420),

    ('mastery-4', 'mastery', 'Nhà chinh phục',
     'Sở hữu 20 thành tựu và đạt cấp 7.', 'fa-trophy',
     'achievements_unlocked', 20, '["mastery-2"]'::jsonb, '{}'::jsonb,
     145, 7, '[]'::jsonb, '[]'::jsonb, 1040, 240),

    ('mastery-5', 'mastery', 'Huyền thoại Bá Khí',
     'Vượt 5 thử thách Boss, hoàn thành nhánh Tinh thông và nhận thành tựu Cấp 10.',
     'fa-crown', 'boss_passed', 5,
     '["mastery-3","mastery-4"]'::jsonb,
     '{"items":["title-scholar"]}'::jsonb,
     155, 12, '[]'::jsonb, '["ach-level-10"]'::jsonb, 1040, 420)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 18. Mở rộng kho vật phẩm (mỗi vật phẩm có cách nhận + công dụng rõ ràng)
-- ---------------------------------------------------------------------------
insert into public.reward_catalog
    (id, kind, name, description, icon, rarity, metadata, sort_order) values
    ('theme-sakura',   'theme', 'Giao diện Anh Đào', 'Tông hồng dịu cho trang Tiến trình.', 'fa-fan', 'rare',
     '{"how":"Mở khoá khi hoàn thành nhánh Kiến thức.","use":"Đổi tông màu trang Tiến trình.","max_quantity":1}', 70),
    ('theme-ocean',    'theme', 'Giao diện Đại Dương', 'Tông xanh biển sâu, dịu mắt khi học buổi tối.', 'fa-water', 'uncommon',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi tông màu trang Tiến trình.","max_quantity":1}', 80),
    ('theme-forest',   'theme', 'Giao diện Rừng Xanh', 'Tông xanh lá cho buổi học dài.', 'fa-tree', 'uncommon',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi tông màu trang Tiến trình.","max_quantity":1}', 90),
    ('theme-royal',    'theme', 'Giao diện Hoàng Gia', 'Tông tím và vàng đồng.', 'fa-chess-king', 'epic',
     '{"how":"Phần thưởng cấp cao hoặc Founder trao.","use":"Đổi tông màu trang Tiến trình.","max_quantity":1}', 100),
    ('theme-mint',     'theme', 'Giao diện Bạc Hà', 'Tông xanh ngọc nhẹ.', 'fa-leaf', 'common',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi tông màu trang Tiến trình.","max_quantity":1}', 110),
    ('theme-ember',    'theme', 'Giao diện Hồng Ngọc', 'Tông đỏ ấm cho ngày ôn thi.', 'fa-fire', 'rare',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi tông màu trang Tiến trình.","max_quantity":1}', 120),

    ('deco-lantern',   'decoration', 'Đèn Lồng Tri Thức', 'Biểu tượng đèn lồng cạnh tên trên trang Tiến trình.', 'fa-lightbulb', 'rare',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Trang trí hồ sơ tiến trình.","max_quantity":3}', 130),
    ('deco-compass',   'decoration', 'La Bàn Học Tập', 'Biểu tượng la bàn định hướng.', 'fa-compass', 'uncommon',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Trang trí hồ sơ tiến trình.","max_quantity":3}', 140),
    ('deco-star',      'decoration', 'Ngôi Sao Bền Bỉ', 'Biểu tượng ngôi sao cho chuỗi ngày học.', 'fa-star', 'epic',
     '{"how":"Phần thưởng chuỗi ngày học hoặc Founder trao.","use":"Trang trí hồ sơ tiến trình.","max_quantity":3}', 150),
    ('deco-scroll',    'decoration', 'Cuộn Giấy Cổ', 'Biểu tượng cuộn giấy ghi chú.', 'fa-scroll', 'common',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Trang trí hồ sơ tiến trình.","max_quantity":3}', 160),

    ('bg-mountain',    'background', 'Nền Núi Xa', 'Ảnh nền phong cảnh núi cho hồ sơ.', 'fa-mountain', 'rare',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi nền hồ sơ.","max_quantity":1}', 170),
    ('bg-library',     'background', 'Nền Thư Viện', 'Ảnh nền thư viện ấm.', 'fa-book', 'uncommon',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi nền hồ sơ.","max_quantity":1}', 180),
    ('bg-night',       'background', 'Nền Trời Đêm', 'Ảnh nền bầu trời đêm nhiều sao.', 'fa-moon', 'epic',
     '{"how":"Phần thưởng cấp cao hoặc Founder trao.","use":"Đổi nền hồ sơ.","max_quantity":1}', 190),
    ('bg-paper',       'background', 'Nền Giấy Cũ', 'Ảnh nền giấy ghi chú tối giản.', 'fa-file-lines', 'common',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Đổi nền hồ sơ.","max_quantity":1}', 200),

    ('title-warrior',  'title', 'Danh hiệu Chiến Binh Học Tập', 'Danh hiệu hiển thị trong trang Tiến trình.', 'fa-shield-halved', 'rare',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Hiển thị cạnh tên trong Tiến trình.","max_quantity":1}', 210),
    ('title-explorer', 'title', 'Danh hiệu Nhà Khám Phá', 'Danh hiệu dành cho người đi hết các nhánh.', 'fa-compass-drafting', 'epic',
     '{"how":"Nhận từ thành tựu hoặc Founder trao.","use":"Hiển thị cạnh tên trong Tiến trình.","max_quantity":1}', 220),
    ('title-master',   'title', 'Danh hiệu Bậc Thầy', 'Danh hiệu dành cho người hoàn thành cây kỹ năng.', 'fa-gem', 'legendary',
     '{"how":"Phần thưởng cuối cây kỹ năng hoặc Founder trao.","use":"Hiển thị cạnh tên trong Tiến trình.","max_quantity":1}', 230),
    ('title-pioneer',  'title', 'Danh hiệu Người Mở Đường', 'Danh hiệu cho người học sớm nhất mỗi mùa.', 'fa-flag', 'epic',
     '{"how":"Phần thưởng mùa hoặc Founder trao.","use":"Hiển thị cạnh tên trong Tiến trình.","max_quantity":1}', 240)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 19. Mở rộng bộ sưu tập thành tựu (điều kiện thật, không trùng mã cũ)
-- ---------------------------------------------------------------------------
insert into public.achievement_defs
    (id, name, description, icon, rarity, category, conditions, stages, reward, is_hidden, sort_order) values
    ('ach-level-20', 'Cấp 20', 'Đạt cấp độ 20.', 'fa-arrow-trend-up', 'epic', 'milestone',
     '[{"metric":"level","target":20}]'::jsonb, 1, '{"items":["theme-ocean"]}'::jsonb, false, 180),
    ('ach-level-30', 'Cấp 30', 'Đạt cấp độ 30.', 'fa-mountain', 'legendary', 'milestone',
     '[{"metric":"level","target":30}]'::jsonb, 1, '{"items":["theme-royal"]}'::jsonb, false, 190),
    ('ach-xp-1000', 'Một nghìn XP', 'Tích luỹ 1.000 XP.', 'fa-coins', 'rare', 'milestone',
     '[{"metric":"xp_total","target":1000}]'::jsonb, 1, '{}'::jsonb, false, 200),
    ('ach-xp-10000', 'Mười nghìn XP', 'Tích luỹ 10.000 XP.', 'fa-sack-dollar', 'epic', 'milestone',
     '[{"metric":"xp_total","target":10000}]'::jsonb, 1, '{"items":["deco-star"]}'::jsonb, false, 210),
    ('ach-quiz-100', 'Trăm bài luyện', 'Hoàn thành 100 bài quiz.', 'fa-medal', 'legendary', 'quiz',
     '[{"metric":"quiz_completed","target":100}]'::jsonb, 1, '{}'::jsonb, false, 40),
    ('ach-lesson-50', 'Năm mươi bài học', 'Học 50 lượt bài học.', 'fa-book-open-reader', 'epic', 'reading',
     '[{"metric":"lesson_study","target":50}]'::jsonb, 1, '{"items":["bg-library"]}'::jsonb, false, 220),
    ('ach-mission-10', 'Mười nhiệm vụ', 'Hoàn thành 10 nhiệm vụ khác nhau.', 'fa-list-check', 'uncommon', 'mission',
     '[{"metric":"missions_completed","target":10}]'::jsonb, 1, '{"items":["theme-forest"]}'::jsonb, false, 230),
    ('ach-mission-50', 'Bậc thầy nhiệm vụ', 'Hoàn thành 50 nhiệm vụ khác nhau.', 'fa-clipboard-check', 'legendary', 'mission',
     '[{"metric":"missions_completed","target":50}]'::jsonb, 1, '{}'::jsonb, false, 240),
    ('ach-skill-10', 'Mười kỹ năng', 'Hoàn thành 10 node kỹ năng.', 'fa-diagram-project', 'epic', 'skill',
     '[{"metric":"skill_nodes_completed","target":10}]'::jsonb, 1, '{"items":["deco-lantern"]}'::jsonb, false, 250),
    ('ach-skill-all', 'Trọn cây kỹ năng', 'Hoàn thành 20 node kỹ năng.', 'fa-sitemap', 'legendary', 'skill',
     '[{"metric":"skill_nodes_completed","target":20}]'::jsonb, 1, '{"items":["title-master"]}'::jsonb, false, 260),
    ('ach-collector-5', 'Người sưu tầm', 'Sở hữu 5 vật phẩm trong kho.', 'fa-box-open', 'uncommon', 'gamification',
     '[{"metric":"inventory_count","target":5}]'::jsonb, 1, '{"items":["deco-compass"]}'::jsonb, false, 270),
    ('ach-collector-15', 'Bộ sưu tập phong phú', 'Sở hữu 15 vật phẩm trong kho.', 'fa-boxes-stacked', 'epic', 'gamification',
     '[{"metric":"inventory_count","target":15}]'::jsonb, 1, '{"items":["bg-night"]}'::jsonb, false, 280),
    ('ach-achievements-25', 'Hai mươi lăm thành tựu', 'Mở khoá 25 thành tựu.', 'fa-award', 'legendary', 'gamification',
     '[{"metric":"achievements_unlocked","target":25}]'::jsonb, 1, '{}'::jsonb, false, 290),
    ('ach-active-30', 'Ba mươi ngày học', 'Có hoạt động học tập trong 30 ngày.', 'fa-calendar-days', 'epic', 'activity',
     '[{"metric":"distinct_active_days","target":30}]'::jsonb, 1, '{}'::jsonb, false, 300),
    ('ach-boss-10', 'Mười ải Boss', 'Vượt qua 10 thử thách Boss.', 'fa-dragon', 'legendary', 'boss',
     '[{"metric":"boss_passed","target":10}]'::jsonb, 1, '{}'::jsonb, false, 310),
    ('ach-discovery-5', 'Nhà thám hiểm', 'Thử sức 5 lượt thử thách Boss.', 'fa-map-location-dot', 'uncommon', 'discovery',
     '[{"metric":"boss_attempts","target":5}]'::jsonb, 1, '{"items":["bg-mountain"]}'::jsonb, false, 320),
    ('ach-season-1', 'Mùa Khởi Đầu', 'Có 20 ngày hoạt động trong mùa đầu tiên.', 'fa-sun', 'legendary', 'limited',
     '[{"metric":"distinct_active_days","target":20}]'::jsonb, 1, '{"items":["title-pioneer"]}'::jsonb, false, 330)
on conflict (id) do nothing;

commit;

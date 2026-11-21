-- ============================================================================
-- Bá Khí v8.3.0 — Gamification 2.0 (hệ thống tiến trình thống nhất)
--
-- Mục tiêu:
--   1. MỘT sổ giao dịch XP (xp_transactions) + MỘT bảng tiến trình
--      (user_progression). Không có engine XP thứ hai.
--   2. Cây kỹ năng, thành tựu, nhiệm vụ, thử thách và kho vật phẩm đều đọc
--      chỉ số từ chính sổ XP — không lưu điểm trùng ở nhiều nơi.
--   3. Reward Engine chạy TRONG Postgres (một transaction) để XP, cấp độ,
--      thành tựu, nhiệm vụ và vật phẩm không bao giờ lệch nhau.
--   4. Client KHÔNG ghi trực tiếp: mọi bảng người dùng chỉ có policy SELECT.
--      Ghi đi qua Edge Function gamification-api (service_role) sau khi xác
--      minh phiên thiết bị; các hàm bk_gam_* bị thu hồi khỏi anon/authenticated.
--   5. Không xoá, không đổi kiểu dữ liệu của bảng cũ. Badge/Title/RLS hiện có
--      giữ nguyên; gamification chỉ ĐỌC và tham chiếu.
--
-- An toàn:
--   · Idempotent: chạy lại nhiều lần không lỗi, không nhân bản bản ghi.
--   · Không seed dữ liệu người dùng giả. Chỉ seed ĐỊNH NGHĨA hệ thống.
--   · Không seed thử thách Boss (nội dung do quản trị viên tạo trong Admin).
--
-- Rollback (chạy thủ công khi cần):
--   drop function if exists public.bk_gam_adjust(text, integer, text, text, jsonb);
--   drop function if exists public.bk_gam_equip(uuid, text, boolean);
--   drop function if exists public.bk_gam_boss_submit(uuid, text, jsonb, text);
--   drop function if exists public.bk_gam_boss_start(uuid, text);
--   drop function if exists public.bk_gam_claim(uuid, uuid);
--   drop function if exists public.bk_gam_sync_missions(uuid);
--   drop function if exists public.bk_gam_state(uuid);
--   drop function if exists public.bk_gam_evaluate(uuid, integer);
--   drop function if exists public.bk_gam_award(uuid, text, text, text, integer);
--   drop function if exists public.bk_gam_metric(uuid, text);
--   drop function if exists public.bk_gam_level(bigint);
--   drop function if exists public.bk_gam_level_floor(integer);
--   drop table if exists public.gamification_activity_logs;
--   drop table if exists public.user_inventory;
--   drop table if exists public.reward_catalog;
--   drop table if exists public.boss_attempts;
--   drop table if exists public.boss_questions;
--   drop table if exists public.boss_challenges;
--   drop table if exists public.user_missions;
--   drop table if exists public.mission_defs;
--   drop table if exists public.user_achievements;
--   drop table if exists public.achievement_defs;
--   drop table if exists public.user_skill_progress;
--   drop table if exists public.skill_tree_nodes;
--   drop table if exists public.user_progression;
--   drop table if exists public.xp_transactions;
--   drop table if exists public.gamification_config;
--   (Dữ liệu XP đã phát sinh hợp lệ nằm trong xp_transactions: chỉ xoá sau khi
--    đã xuất bản sao lưu theo docs/GAMIFICATION_DATA_MIGRATION_V830.md.)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Cấu hình trung tâm (một dòng duy nhất)
-- ---------------------------------------------------------------------------
create table if not exists public.gamification_config (
    id            boolean primary key default true check (id),
    xp_rules      jsonb not null default '{}'::jsonb,
    level_curve   jsonb not null default '{"base":100,"linear":60,"quadratic":20}'::jsonb,
    feature_flags jsonb not null default '{}'::jsonb,
    season        jsonb not null default '{}'::jsonb,
    updated_at    timestamptz not null default now()
);

insert into public.gamification_config (id) values (true)
on conflict (id) do nothing;

-- Bảng cấu hình chỉ quản trị đọc/ghi qua Edge Function (service_role).
revoke all on public.gamification_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sổ giao dịch XP — nguồn sự thật duy nhất của điểm kinh nghiệm
-- ---------------------------------------------------------------------------
create table if not exists public.xp_transactions (
    id              uuid primary key default gen_random_uuid(),
    student_id      uuid not null references public.students (id) on delete cascade,
    activity_type   text not null check (char_length(activity_type) between 1 and 48),
    source_id       text not null default '' check (char_length(source_id) <= 200),
    amount          integer not null check (amount <> 0 and amount >= -100000 and amount <= 100000),
    status          text not null default 'awarded'
                    check (status in ('awarded', 'adjusted', 'reversed')),
    idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    unique (student_id, idempotency_key)
);

create index if not exists xp_transactions_student_time_idx
    on public.xp_transactions (student_id, created_at desc);
create index if not exists xp_transactions_activity_idx
    on public.xp_transactions (student_id, activity_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Tiến trình suy ra (tổng XP + cấp độ). Không phải nguồn sự thật thứ hai:
--    luôn tính lại từ xp_transactions bằng bk_gam_recompute().
-- ---------------------------------------------------------------------------
create table if not exists public.user_progression (
    student_id    uuid primary key references public.students (id) on delete cascade,
    total_xp      bigint not null default 0 check (total_xp >= 0),
    level         integer not null default 1 check (level between 1 and 1000),
    updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Cây kỹ năng
-- ---------------------------------------------------------------------------
create table if not exists public.skill_tree_nodes (
    id          text primary key check (char_length(id) between 1 and 64),
    branch      text not null check (branch in ('knowledge', 'practice', 'memory', 'consistency', 'mastery')),
    name        text not null check (char_length(btrim(name)) between 1 and 120),
    description text not null default '' check (char_length(description) <= 600),
    icon        text not null default 'fa-circle-nodes' check (char_length(icon) <= 60),
    metric      text not null check (char_length(metric) between 1 and 48),
    target      integer not null check (target between 1 and 100000),
    requires    jsonb not null default '[]'::jsonb,
    reward      jsonb not null default '{}'::jsonb,
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.user_skill_progress (
    student_id   uuid not null references public.students (id) on delete cascade,
    node_id      text not null references public.skill_tree_nodes (id) on delete cascade,
    progress     integer not null default 0 check (progress between 0 and 100),
    status       text not null default 'locked'
                 check (status in ('locked', 'available', 'in_progress', 'completed')),
    completed_at timestamptz,
    updated_at   timestamptz not null default now(),
    primary key (student_id, node_id)
);

-- ---------------------------------------------------------------------------
-- 5. Thành tựu
-- ---------------------------------------------------------------------------
create table if not exists public.achievement_defs (
    id          text primary key check (char_length(id) between 1 and 64),
    name        text not null check (char_length(btrim(name)) between 1 and 120),
    description text not null default '' check (char_length(description) <= 600),
    icon        text not null default 'fa-medal' check (char_length(icon) <= 60),
    rarity      text not null default 'common'
                check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
    category    text not null default 'learning'
                check (category in ('learning', 'quiz', 'reading', 'listening', 'revision',
                                    'consistency', 'skill', 'boss', 'milestone', 'event')),
    conditions  jsonb not null default '[]'::jsonb,
    stages      integer not null default 1 check (stages between 1 and 10),
    reward      jsonb not null default '{}'::jsonb,
    is_hidden   boolean not null default false,
    is_repeatable boolean not null default false,
    is_active   boolean not null default true,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.user_achievements (
    student_id     uuid not null references public.students (id) on delete cascade,
    achievement_id text not null references public.achievement_defs (id) on delete cascade,
    stage          integer not null default 1 check (stage between 1 and 10),
    progress       integer not null default 0 check (progress between 0 and 100),
    unlocked_at    timestamptz,
    updated_at     timestamptz not null default now(),
    primary key (student_id, achievement_id, stage)
);

-- ---------------------------------------------------------------------------
-- 6. Nhiệm vụ
-- ---------------------------------------------------------------------------
create table if not exists public.mission_defs (
    id          text primary key check (char_length(id) between 1 and 64),
    name        text not null check (char_length(btrim(name)) between 1 and 120),
    description text not null default '' check (char_length(description) <= 600),
    category    text not null default 'learning'
                check (category in ('learning', 'practice', 'revision', 'consistency', 'mastery')),
    difficulty  text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
    metric      text not null check (char_length(metric) between 1 and 48),
    target      integer not null check (target between 1 and 100000),
    cadence     text not null default 'daily' check (cadence in ('daily', 'weekly')),
    reward      jsonb not null default '{}'::jsonb,
    min_level   integer not null default 1 check (min_level between 1 and 1000),
    is_active   boolean not null default true,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.user_missions (
    id             uuid primary key default gen_random_uuid(),
    student_id     uuid not null references public.students (id) on delete cascade,
    mission_id     text not null references public.mission_defs (id) on delete cascade,
    period_key     text not null check (char_length(period_key) between 4 and 24),
    progress       integer not null default 0 check (progress >= 0),
    target         integer not null check (target between 1 and 100000),
    status         text not null default 'in_progress'
                   check (status in ('available', 'in_progress', 'completed', 'claimed', 'expired')),
    assigned_at    timestamptz not null default now(),
    expires_at     timestamptz not null,
    completed_at   timestamptz,
    claimed_at     timestamptz,
    reward         jsonb not null default '{}'::jsonb,
    unique (student_id, mission_id, period_key)
);

create index if not exists user_missions_student_idx
    on public.user_missions (student_id, period_key, status);

-- ---------------------------------------------------------------------------
-- 7. Boss Challenge
-- ---------------------------------------------------------------------------
create table if not exists public.boss_challenges (
    id           uuid primary key default gen_random_uuid(),
    slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
    name         text not null check (char_length(btrim(name)) between 1 and 120),
    description  text not null default '' check (char_length(description) <= 2000),
    kind         text not null default 'subject'
                 check (kind in ('subject', 'chapter', 'knowledge', 'revision', 'weekly')),
    subject      text not null default '' check (char_length(subject) <= 40),
    chapter      text not null default '' check (char_length(chapter) <= 120),
    difficulty   text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
    pass_score   integer not null default 70 check (pass_score between 1 and 100),
    max_attempts integer not null default 3 check (max_attempts between 1 and 50),
    reward       jsonb not null default '{}'::jsonb,
    opens_at     timestamptz not null default now(),
    closes_at    timestamptz,
    is_active    boolean not null default true,
    created_by   text not null default 'admin' check (char_length(created_by) <= 80),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists public.boss_questions (
    id            uuid primary key default gen_random_uuid(),
    challenge_id  uuid not null references public.boss_challenges (id) on delete cascade,
    prompt        text not null check (char_length(btrim(prompt)) between 1 and 2000),
    options       jsonb not null check (jsonb_typeof(options) = 'array'),
    correct_index integer not null check (correct_index between 0 and 9),
    explanation   text not null default '' check (char_length(explanation) <= 2000),
    sort_order    integer not null default 0,
    created_at    timestamptz not null default now()
);

create index if not exists boss_questions_challenge_idx
    on public.boss_questions (challenge_id, sort_order);

create table if not exists public.boss_attempts (
    id              uuid primary key default gen_random_uuid(),
    student_id      uuid not null references public.students (id) on delete cascade,
    challenge_id    uuid not null references public.boss_challenges (id) on delete cascade,
    idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
    correct_count   integer not null default 0 check (correct_count >= 0),
    total_count     integer not null default 0 check (total_count >= 0),
    score           integer not null default 0 check (score between 0 and 100),
    passed          boolean not null default false,
    answers         jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now(),
    unique (student_id, idempotency_key)
);

create index if not exists boss_attempts_student_idx
    on public.boss_attempts (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Danh mục phần thưởng + kho vật phẩm
-- ---------------------------------------------------------------------------
create table if not exists public.reward_catalog (
    id          text primary key check (char_length(id) between 1 and 64),
    kind        text not null
                check (kind in ('badge', 'title', 'frame', 'theme', 'background', 'decoration', 'xp_bonus')),
    name        text not null check (char_length(btrim(name)) between 1 and 120),
    description text not null default '' check (char_length(description) <= 600),
    icon        text not null default 'fa-gift' check (char_length(icon) <= 60),
    rarity      text not null default 'common'
                check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
    metadata    jsonb not null default '{}'::jsonb,
    is_active   boolean not null default true,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.user_inventory (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid not null references public.students (id) on delete cascade,
    item_id     text not null references public.reward_catalog (id) on delete cascade,
    source      text not null default 'achievement' check (char_length(source) <= 80),
    is_equipped boolean not null default false,
    metadata    jsonb not null default '{}'::jsonb,
    acquired_at timestamptz not null default now(),
    unique (student_id, item_id)
);

create index if not exists user_inventory_student_idx on public.user_inventory (student_id);

-- ---------------------------------------------------------------------------
-- 9. Nhật ký hoạt động gamification (audit)
-- ---------------------------------------------------------------------------
create table if not exists public.gamification_activity_logs (
    id          bigserial primary key,
    student_id  uuid references public.students (id) on delete cascade,
    actor_kind  text not null default 'system' check (actor_kind in ('system', 'student', 'admin', 'founder')),
    actor_label text not null default '' check (char_length(actor_label) <= 120),
    action      text not null check (char_length(action) between 1 and 80),
    detail      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists gamification_activity_logs_time_idx
    on public.gamification_activity_logs (created_at desc);
create index if not exists gamification_activity_logs_student_idx
    on public.gamification_activity_logs (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10. Trigger updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists skill_tree_nodes_touch on public.skill_tree_nodes;
create trigger skill_tree_nodes_touch before update on public.skill_tree_nodes
    for each row execute function public.bakhi_touch_updated_at();

drop trigger if exists achievement_defs_touch on public.achievement_defs;
create trigger achievement_defs_touch before update on public.achievement_defs
    for each row execute function public.bakhi_touch_updated_at();

drop trigger if exists mission_defs_touch on public.mission_defs;
create trigger mission_defs_touch before update on public.mission_defs
    for each row execute function public.bakhi_touch_updated_at();

drop trigger if exists boss_challenges_touch on public.boss_challenges;
create trigger boss_challenges_touch before update on public.boss_challenges
    for each row execute function public.bakhi_touch_updated_at();

drop trigger if exists reward_catalog_touch on public.reward_catalog;
create trigger reward_catalog_touch before update on public.reward_catalog
    for each row execute function public.bakhi_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Công thức cấp độ — MỘT nơi duy nhất (bản JS phải khớp: bk-gamification.js)
--     XP cần để đi từ cấp L sang L+1: base + linear*(L-1) + quadratic*(L-1)^2
--     base=100, linear=60, quadratic=20  →  100, 180, 300, 460, 660, ...
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_level_floor(p_level integer)
returns bigint
language sql
immutable
as $$
    /* Tổng XP tích luỹ để ĐẠT cấp p_level (cấp 1 = 0 XP). */
    select coalesce(sum(100 + 60 * (l - 1) + 20 * (l - 1) * (l - 1)), 0)::bigint
    from generate_series(1, greatest(1, p_level) - 1) as l;
$$;

create or replace function public.bk_gam_level(p_total bigint)
returns integer
language plpgsql
immutable
as $$
declare
    v_level integer := 1;
    v_total bigint := greatest(0, coalesce(p_total, 0));
begin
    while v_level < 1000 and v_total >= public.bk_gam_level_floor(v_level + 1) loop
        v_level := v_level + 1;
    end loop;
    return v_level;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Chỉ số — suy ra từ sổ XP, thử thách và kho vật phẩm (không lưu trùng)
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

-- ---------------------------------------------------------------------------
-- 13. Cộng XP — chỉ ghi khi hợp lệ, có idempotency và giới hạn theo ngày
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_award(
    p_student  uuid,
    p_activity text,
    p_source   text,
    p_key      text,
    p_depth    integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_cfg      jsonb;
    v_rules    jsonb;
    v_rule     jsonb;
    v_amount   integer;
    v_cap      integer;
    v_today    integer;
    v_inserted uuid;
    v_before   record;
    v_after_total bigint;
    v_after_level integer;
    v_leveled  boolean := false;
begin
    select xp_rules, feature_flags into v_rules, v_cfg
    from public.gamification_config where id = true;

    if coalesce((v_cfg ->> 'xp')::boolean, true) is false then
        return jsonb_build_object('awarded', false, 'reason', 'feature_disabled');
    end if;

    v_rule := v_rules -> p_activity;
    if v_rule is null then
        return jsonb_build_object('awarded', false, 'reason', 'unknown_activity');
    end if;

    v_amount := coalesce((v_rule ->> 'xp')::integer, 0);
    v_cap := coalesce((v_rule ->> 'daily_cap')::integer, 0);
    if v_amount <= 0 then
        return jsonb_build_object('awarded', false, 'reason', 'no_reward');
    end if;

    if v_cap > 0 then
        select count(*) into v_today
        from public.xp_transactions
        where student_id = p_student
          and activity_type = p_activity
          and amount > 0
          and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
        if v_today >= v_cap then
            return jsonb_build_object('awarded', false, 'reason', 'daily_cap');
        end if;
    end if;

    select total_xp, level into v_before
    from public.user_progression where student_id = p_student;
    if not found then
        insert into public.user_progression (student_id, total_xp, level)
        values (p_student, 0, 1)
        on conflict (student_id) do nothing;
        select total_xp, level into v_before
        from public.user_progression where student_id = p_student;
    end if;

    insert into public.xp_transactions
        (student_id, activity_type, source_id, amount, status, idempotency_key, metadata)
    values (p_student, p_activity, left(coalesce(p_source, ''), 200), v_amount, 'awarded',
            left(p_key, 200), jsonb_build_object('depth', p_depth))
    on conflict (student_id, idempotency_key) do nothing
    returning id into v_inserted;

    if v_inserted is null then
        return jsonb_build_object('awarded', false, 'reason', 'duplicate',
                                  'total_xp', v_before.total_xp, 'level', v_before.level);
    end if;

    v_after_total := v_before.total_xp + v_amount;
    v_after_level := public.bk_gam_level(v_after_total);

    update public.user_progression
       set total_xp = v_after_total, level = v_after_level, updated_at = now()
     where student_id = p_student;

    if v_after_level > v_before.level then
        v_leveled := true;
        insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
        values (p_student, 'system', 'level_up',
                jsonb_build_object('from', v_before.level, 'to', v_after_level, 'total_xp', v_after_total));
    end if;

    insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
    values (p_student, 'system', 'xp_awarded',
            jsonb_build_object('activity', p_activity, 'amount', v_amount,
                               'source', left(coalesce(p_source, ''), 200)));

    return jsonb_build_object(
        'awarded', true,
        'amount', v_amount,
        'activity', p_activity,
        'total_xp', v_after_total,
        'level', v_after_level,
        'previous_level', v_before.level,
        'leveled_up', v_leveled
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Kiểm tra thành tựu + cây kỹ năng + tiến trình nhiệm vụ (một transaction)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_grant_item(p_student uuid, p_item text, p_source text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    if p_item is null or p_item = '' then return false; end if;
    if not exists (select 1 from public.reward_catalog where id = p_item and is_active) then
        return false;
    end if;
    insert into public.user_inventory (student_id, item_id, source)
    values (p_student, p_item, left(coalesce(p_source, 'reward'), 80))
    on conflict (student_id, item_id) do nothing;
    get diagnostics v_count = row_count;
    return v_count > 0;
end;
$$;

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
    v_req        text;
    v_req_ok     boolean;
    v_available  boolean;
    v_status     text;
    v_prev       text;
    v_cnt        integer;
    v_missions   jsonb := '[]'::jsonb;
    v_mission    record;
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

    -- Cây kỹ năng: điều kiện mở khoá phải được xét trên trạng thái đã cập nhật.
    for v_node in
        select * from public.skill_tree_nodes where is_active order by sort_order, id
    loop
        continue when exists (
            select 1 from public.user_skill_progress usp
            where usp.student_id = p_student and usp.node_id = v_node.id and usp.status = 'completed'
        );

        v_req_ok := true;
        if jsonb_typeof(v_node.requires) = 'array' then
            for v_req in select jsonb_array_elements_text(v_node.requires) loop
                if not exists (
                    select 1 from public.user_skill_progress usp
                    where usp.student_id = p_student and usp.node_id = v_req and usp.status = 'completed'
                ) then
                    v_req_ok := false;
                end if;
            end loop;
        end if;

        v_available := v_req_ok and
            coalesce((select level from public.user_progression where student_id = p_student), 1) >= 1;
        v_pct := least(100, floor(
            100.0 * public.bk_gam_metric(p_student, v_node.metric) / greatest(1, v_node.target)
        )::integer);

        if v_pct >= 100 then
            if v_available then
                v_status := 'completed';
            else
                v_status := 'in_progress';  -- đủ chỉ số nhưng còn node trước chưa xong
            end if;
        elsif not v_available then
            v_status := 'locked';
        elsif v_pct > 0 then
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
        values (p_student, v_node.id, v_pct, v_status,
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
    for v_mission in
        select um.id, um.student_id, um.mission_id, md.metric, md.target as def_target, um.target
        from public.user_missions um
        join public.mission_defs md on md.id = um.mission_id
        where um.student_id = p_student and um.status in ('available', 'in_progress')
    loop
        update public.user_missions
           set progress = least(um_target_value.metric_value, v_mission.target),
               status = case when um_target_value.metric_value >= v_mission.target then 'completed' else 'in_progress' end,
               completed_at = case when um_target_value.metric_value >= v_mission.target
                                   then coalesce(completed_at, now()) else completed_at end
          from (select least(public.bk_gam_metric(p_student, v_mission.metric), v_mission.target) as metric_value) um_target_value
         where public.user_missions.id = v_mission.id;
    end loop;

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

-- ---------------------------------------------------------------------------
-- 15. Vòng đời nhiệm vụ: tạo theo chu kỳ UTC, nhận thưởng
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_sync_missions(p_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_level integer;
    v_daily text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
    v_weekly text := 'W' || to_char((now() at time zone 'UTC')::date, 'IYYY-IW');
    v_daily_end timestamptz := ((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC';
    v_weekly_end timestamptz := (date_trunc('week', (now() at time zone 'UTC')) + interval '7 days')
                                 at time zone 'UTC';
    v_def record;
    v_created integer := 0;
    v_cnt integer;
begin
    select coalesce(level, 1) into v_level
    from public.user_progression where student_id = p_student;
    v_level := coalesce(v_level, 1);

    -- Không xoá lịch sử: chỉ đánh dấu quá hạn.
    update public.user_missions
       set status = 'expired'
     where student_id = p_student and status in ('available', 'in_progress') and expires_at <= now();

    for v_def in
        select * from public.mission_defs
        where is_active and min_level <= v_level
        order by cadence, sort_order, id
    loop
        insert into public.user_missions
            (student_id, mission_id, period_key, progress, target, status, expires_at, reward)
        values (p_student, v_def.id,
                case when v_def.cadence = 'daily' then v_daily else v_weekly end,
                0, v_def.target, 'in_progress',
                case when v_def.cadence = 'daily' then v_daily_end else v_weekly_end end,
                v_def.reward)
        on conflict (student_id, mission_id, period_key) do nothing;
        get diagnostics v_cnt = row_count;
        v_created := v_created + v_cnt;
    end loop;

    update public.user_missions um
       set progress = least(public.bk_gam_metric(p_student, md.metric), um.target),
           status = case when public.bk_gam_metric(p_student, md.metric) >= um.target
                          and um.status in ('available', 'in_progress')
                         then 'completed' else um.status end,
           completed_at = case when public.bk_gam_metric(p_student, md.metric) >= um.target
                               then coalesce(um.completed_at, now()) else um.completed_at end
      from public.mission_defs md
     where md.id = um.mission_id and um.student_id = p_student
       and um.status in ('available', 'in_progress');

    return jsonb_build_object('ok', true, 'daily', v_daily, 'weekly', v_weekly, 'created', v_created);
end;
$$;

create or replace function public.bk_gam_claim(p_student uuid, p_user_mission uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row      record;
    v_award    jsonb := '{}'::jsonb;
    v_items    jsonb;
    v_item     text;
    v_granted  jsonb := '[]'::jsonb;
begin
    select um.*, md.name, md.reward as def_reward
      into v_row
      from public.user_missions um
      join public.mission_defs md on md.id = um.mission_id
     where um.id = p_user_mission and um.student_id = p_student;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    if v_row.status = 'claimed' then
        return jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED');
    end if;
    if v_row.status <> 'completed' then
        return jsonb_build_object('ok', false, 'code', 'NOT_COMPLETED');
    end if;

    update public.user_missions
       set status = 'claimed', claimed_at = now()
     where id = v_row.id;

    v_award := public.bk_gam_award(p_student, 'mission_reward', 'mission:' || v_row.mission_id,
                                   'mission:' || v_row.id::text, 0);

    v_items := coalesce(v_row.def_reward -> 'items', v_row.reward -> 'items');
    if jsonb_typeof(v_items) = 'array' then
        for v_item in select jsonb_array_elements_text(v_items) loop
            if public.bk_gam_grant_item(p_student, v_item, 'mission:' || v_row.mission_id) then
                v_granted := v_granted || to_jsonb(v_item);
            end if;
        end loop;
    end if;

    insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
    values (p_student, 'student', 'mission_claimed',
            jsonb_build_object('mission', v_row.mission_id, 'xp', v_award));

    return jsonb_build_object('ok', true, 'award', v_award, 'items', v_granted,
                              'evaluation', public.bk_gam_evaluate(p_student, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Boss Challenge — câu hỏi chỉ phục vụ qua máy chủ, chấm điểm tại máy chủ
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_boss_start(p_student uuid, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_ch        record;
    v_attempts  integer;
    v_questions jsonb;
begin
    select * into v_ch from public.boss_challenges
     where slug = p_slug and is_active;
    if not found then
        return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    if now() < v_ch.opens_at or (v_ch.closes_at is not null and now() > v_ch.closes_at) then
        return jsonb_build_object('ok', false, 'code', 'CLOSED');
    end if;

    select count(*) into v_attempts from public.boss_attempts
     where student_id = p_student and challenge_id = v_ch.id;
    if v_attempts >= v_ch.max_attempts then
        return jsonb_build_object('ok', false, 'code', 'NO_ATTEMPTS_LEFT');
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id, 'prompt', q.prompt, 'options', q.options
           ) order by q.sort_order, q.id), '[]'::jsonb)
      into v_questions
      from public.boss_questions q
     where q.challenge_id = v_ch.id;

    if jsonb_array_length(v_questions) = 0 then
        return jsonb_build_object('ok', false, 'code', 'NO_QUESTIONS');
    end if;

    return jsonb_build_object(
        'ok', true,
        'challenge', jsonb_build_object(
            'slug', v_ch.slug, 'name', v_ch.name, 'description', v_ch.description,
            'kind', v_ch.kind, 'subject', v_ch.subject, 'chapter', v_ch.chapter,
            'difficulty', v_ch.difficulty, 'pass_score', v_ch.pass_score,
            'max_attempts', v_ch.max_attempts, 'attempts_used', v_attempts,
            'closes_at', v_ch.closes_at, 'reward', v_ch.reward),
        'questions', v_questions,
        'started_at', now()
    );
end;
$$;

create or replace function public.bk_gam_boss_submit(
    p_student uuid,
    p_slug    text,
    p_answers jsonb,
    p_key     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_ch        record;
    v_attempt   record;
    v_total     integer;
    v_correct   integer := 0;
    v_score     integer := 0;
    v_passed    boolean := false;
    v_attempts  integer;
    v_detail    jsonb := '[]'::jsonb;
    v_item      jsonb;
    v_answer    jsonb;
    v_q         record;
    v_pick      integer;
    v_award     jsonb := '{}'::jsonb;
begin
    select * into v_ch from public.boss_challenges where slug = p_slug and is_active;
    if not found then
        return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;

    -- Idempotency: cùng khoá trả đúng kết quả đã lưu, không cộng XP lần hai.
    select * into v_attempt from public.boss_attempts
     where student_id = p_student and idempotency_key = p_key;
    if found then
        return jsonb_build_object('ok', true, 'duplicate', true,
            'score', v_attempt.score, 'correct', v_attempt.correct_count,
            'total', v_attempt.total_count, 'passed', v_attempt.passed,
            'attempt_id', v_attempt.id);
    end if;

    if now() < v_ch.opens_at or (v_ch.closes_at is not null and now() > v_ch.closes_at) then
        return jsonb_build_object('ok', false, 'code', 'CLOSED');
    end if;

    select count(*) into v_attempts from public.boss_attempts
     where student_id = p_student and challenge_id = v_ch.id;
    if v_attempts >= v_ch.max_attempts then
        return jsonb_build_object('ok', false, 'code', 'NO_ATTEMPTS_LEFT');
    end if;

    select count(*) into v_total from public.boss_questions where challenge_id = v_ch.id;
    if v_total = 0 then
        return jsonb_build_object('ok', false, 'code', 'NO_QUESTIONS');
    end if;

    for v_q in select * from public.boss_questions where challenge_id = v_ch.id order by sort_order, id loop
        v_pick := null;
        for v_answer in select * from jsonb_array_elements(
                case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) loop
            if (v_answer ->> 'question_id') = v_q.id::text then
                v_pick := nullif(v_answer ->> 'choice', '')::integer;
            end if;
        end loop;
        if v_pick is not null and v_pick = v_q.correct_index then
            v_correct := v_correct + 1;
        end if;
        v_detail := v_detail || jsonb_build_object(
            'question_id', v_q.id,
            'choice', v_pick,
            'correct_index', v_q.correct_index,
            'is_correct', (v_pick is not null and v_pick = v_q.correct_index),
            'explanation', v_q.explanation);
    end loop;

    v_score := round(100.0 * v_correct / greatest(1, v_total))::integer;
    v_passed := v_score >= v_ch.pass_score;

    insert into public.boss_attempts
        (student_id, challenge_id, idempotency_key, correct_count, total_count, score, passed, answers)
    values (p_student, v_ch.id, left(p_key, 200), v_correct, v_total, v_score, v_passed, v_detail)
    on conflict (student_id, idempotency_key) do nothing
    returning * into v_attempt;

    if v_attempt.id is null then
        select * into v_attempt from public.boss_attempts
         where student_id = p_student and idempotency_key = p_key;
        return jsonb_build_object('ok', true, 'duplicate', true, 'score', v_attempt.score,
            'correct', v_attempt.correct_count, 'total', v_attempt.total_count,
            'passed', v_attempt.passed, 'attempt_id', v_attempt.id);
    end if;

    if v_passed then
        v_award := public.bk_gam_award(p_student, 'boss_passed', 'boss:' || v_ch.slug,
                                       'boss:' || v_attempt.id::text, 0);
        if jsonb_typeof(v_ch.reward -> 'items') = 'array' then
            for v_item in select * from jsonb_array_elements(v_ch.reward -> 'items') loop
                perform public.bk_gam_grant_item(p_student, v_item #>> '{}', 'boss:' || v_ch.slug);
            end loop;
        end if;
    end if;

    insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
    values (p_student, 'student', 'boss_attempt',
            jsonb_build_object('challenge', v_ch.slug, 'score', v_score, 'passed', v_passed));

    return jsonb_build_object(
        'ok', true, 'duplicate', false, 'attempt_id', v_attempt.id,
        'score', v_score, 'correct', v_correct, 'total', v_total, 'passed', v_passed,
        'details', v_detail, 'award', v_award,
        'evaluation', public.bk_gam_evaluate(p_student, 0)
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. Trang bị vật phẩm + điều chỉnh XP cho quản trị
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_equip(p_student uuid, p_item text, p_equip boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_kind text;
begin
    if not exists (select 1 from public.user_inventory
                   where student_id = p_student and item_id = p_item) then
        return jsonb_build_object('ok', false, 'code', 'NOT_OWNED');
    end if;

    select kind into v_kind from public.reward_catalog where id = p_item;

    if p_equip then
        update public.user_inventory ui
           set is_equipped = false
          from public.reward_catalog rc
         where ui.item_id = rc.id and ui.student_id = p_student
           and rc.kind = v_kind and ui.is_equipped;
    end if;

    update public.user_inventory
       set is_equipped = coalesce(p_equip, false)
     where student_id = p_student and item_id = p_item;

    insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
    values (p_student, 'student', 'item_equip',
            jsonb_build_object('item', p_item, 'equipped', coalesce(p_equip, false)));

    return jsonb_build_object('ok', true);
end;
$$;

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

    return jsonb_build_object('ok', true, 'total_xp', v_total, 'level', v_level);
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. Trạng thái tổng hợp cho dashboard
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_state(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_total bigint;
    v_level integer;
    v_floor bigint;
    v_next bigint;
    v_result jsonb;
begin
    select coalesce(total_xp, 0), coalesce(level, 1) into v_total, v_level
      from public.user_progression where student_id = p_student;
    v_total := coalesce(v_total, 0);
    v_level := greatest(1, coalesce(v_level, 1));
    v_floor := public.bk_gam_level_floor(v_level);
    v_next := public.bk_gam_level_floor(v_level + 1);

    select jsonb_build_object(
        'total_xp', v_total,
        'level', v_level,
        'level_xp', v_total - v_floor,
        'level_span', greatest(1, v_next - v_floor),
        'next_level_xp', v_next,
        'xp_remaining', greatest(0, v_next - v_total),
        'progress_pct', least(100, floor(100.0 * (v_total - v_floor) / greatest(1, v_next - v_floor))::integer),
        'branches', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', b.branch,
                'nodes', b.cnt,
                'completed', b.done,
                'progress', case when b.cnt = 0 then 0 else floor(100.0 * b.done / b.cnt)::integer end
            ) order by b.branch)
            from (
                select n.branch,
                       count(*) as cnt,
                       count(*) filter (where coalesce(usp.status, 'locked') = 'completed') as done
                from public.skill_tree_nodes n
                left join public.user_skill_progress usp
                       on usp.node_id = n.id and usp.student_id = p_student
                where n.is_active
                group by n.branch
            ) b
        ), '[]'::jsonb),
        'nodes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', n.id, 'branch', n.branch, 'name', n.name, 'description', n.description,
                'icon', n.icon, 'metric', n.metric, 'target', n.target,
                'requires', n.requires, 'reward', n.reward, 'sort_order', n.sort_order,
                'progress', coalesce(usp.progress, 0),
                'status', coalesce(usp.status, 'locked'),
                'completed_at', usp.completed_at,
                'metric_value', public.bk_gam_metric(p_student, n.metric)
            ) order by n.sort_order, n.id)
            from public.skill_tree_nodes n
            left join public.user_skill_progress usp
                   on usp.node_id = n.id and usp.student_id = p_student
            where n.is_active
        ), '[]'::jsonb),
        'achievements', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', a.id, 'name', a.name, 'description', a.description, 'icon', a.icon,
                'rarity', a.rarity, 'category', a.category, 'reward', a.reward,
                'is_hidden', a.is_hidden, 'stages', a.stages, 'sort_order', a.sort_order,
                'progress', coalesce(ua.progress, 0),
                'stage', coalesce(ua.stage, 1),
                'unlocked_at', ua.unlocked_at,
                'visible', (not a.is_hidden) or ua.unlocked_at is not null
            ) order by a.sort_order, a.id)
            from public.achievement_defs a
            left join lateral (
                select * from public.user_achievements x
                where x.student_id = p_student and x.achievement_id = a.id
                order by (x.unlocked_at is not null) desc, x.stage asc
                limit 1
            ) ua on true
            where a.is_active
        ), '[]'::jsonb),
        'missions', coalesce((
            select jsonb_agg(jsonb_build_object(
                'user_mission_id', um.id, 'id', um.mission_id, 'name', md.name,
                'description', md.description, 'category', md.category, 'difficulty', md.difficulty,
                'cadence', md.cadence, 'metric', md.metric, 'target', um.target,
                'progress', um.progress, 'status', um.status, 'reward', md.reward,
                'expires_at', um.expires_at, 'completed_at', um.completed_at,
                'claimed_at', um.claimed_at, 'period_key', um.period_key
            ) order by (um.status = 'completed') desc, md.sort_order, md.id)
            from public.user_missions um
            join public.mission_defs md on md.id = um.mission_id
            where um.student_id = p_student
              and um.status in ('available', 'in_progress', 'completed')
        ), '[]'::jsonb),
        'mission_history', coalesce((
            select jsonb_agg(jsonb_build_object(
                'user_mission_id', um.id, 'id', um.mission_id, 'name', md.name,
                'status', um.status, 'period_key', um.period_key,
                'claimed_at', um.claimed_at, 'completed_at', um.completed_at, 'reward', md.reward
            ) order by coalesce(um.claimed_at, um.completed_at) desc nulls last)
            from (select * from public.user_missions
                  where student_id = p_student and status in ('claimed', 'expired')
                  order by coalesce(claimed_at, completed_at) desc nulls last limit 30) um
            join public.mission_defs md on md.id = um.mission_id
        ), '[]'::jsonb),
        'inventory', coalesce((
            select jsonb_agg(jsonb_build_object(
                'item_id', ui.item_id, 'acquired_at', ui.acquired_at, 'source', ui.source,
                'is_equipped', ui.is_equipped, 'kind', rc.kind, 'name', rc.name,
                'description', rc.description, 'icon', rc.icon, 'rarity', rc.rarity,
                'metadata', rc.metadata
            ) order by ui.acquired_at desc)
            from public.user_inventory ui
            join public.reward_catalog rc on rc.id = ui.item_id
            where ui.student_id = p_student
        ), '[]'::jsonb),
        'catalog', coalesce((
            select jsonb_agg(jsonb_build_object(
                'item_id', rc.id, 'kind', rc.kind, 'name', rc.name, 'description', rc.description,
                'icon', rc.icon, 'rarity', rc.rarity, 'metadata', rc.metadata,
                'owned', exists (select 1 from public.user_inventory ui
                                 where ui.student_id = p_student and ui.item_id = rc.id)
            ) order by rc.sort_order, rc.id)
            from public.reward_catalog rc where rc.is_active
        ), '[]'::jsonb),
        'transactions', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', t.id, 'activity', t.activity_type, 'source', t.source_id,
                'amount', t.amount, 'status', t.status, 'created_at', t.created_at
            ) order by t.created_at desc)
            from (select * from public.xp_transactions
                  where student_id = p_student order by created_at desc limit 25) t
        ), '[]'::jsonb),
        'activity', (
            select jsonb_object_agg(m.metric, public.bk_gam_metric(p_student, m.metric))
            from (values ('xp_total'), ('quiz_completed'), ('lesson_study'), ('listening_completed'),
                         ('revision_session'), ('mistake_mastered'), ('goal_completed'),
                         ('boss_passed'), ('distinct_active_days'), ('streak_days')) m(metric)
        ),
        'challenges', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description,
                'kind', c.kind, 'subject', c.subject, 'chapter', c.chapter,
                'difficulty', c.difficulty, 'pass_score', c.pass_score,
                'reward', c.reward, 'closes_at', c.closes_at,
                'question_count', (select count(*) from public.boss_questions q where q.challenge_id = c.id),
                'attempts_used', (select count(*) from public.boss_attempts a
                                  where a.challenge_id = c.id and a.student_id = p_student),
                'best_score', (select max(score) from public.boss_attempts a
                               where a.challenge_id = c.id and a.student_id = p_student),
                'passed', exists (select 1 from public.boss_attempts a
                                  where a.challenge_id = c.id and a.student_id = p_student and a.passed)
            ) order by c.created_at desc)
            from public.boss_challenges c
            where c.is_active and now() >= c.opens_at and (c.closes_at is null or now() <= c.closes_at)
        ), '[]'::jsonb),
        'attempts', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', a.id, 'challenge', c.slug, 'name', c.name, 'score', a.score,
                'correct', a.correct_count, 'total', a.total_count, 'passed', a.passed,
                'created_at', a.created_at
            ) order by a.created_at desc)
            from (select * from public.boss_attempts where student_id = p_student
                  order by created_at desc limit 10) a
            join public.boss_challenges c on c.id = a.challenge_id
        ), '[]'::jsonb),
        'level_logs', coalesce((
            select jsonb_agg(jsonb_build_object('detail', l.detail, 'created_at', l.created_at)
                             order by l.created_at desc)
            from (select * from public.gamification_activity_logs
                  where student_id = p_student and action = 'level_up'
                  order by created_at desc limit 10) l
        ), '[]'::jsonb),
        'updated_at', now()
    ) into v_result;

    return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Quyền: chỉ service_role (Edge Function) gọi được các hàm trên.
--     Học sinh đọc dữ liệu của mình qua RLS SELECT trực tiếp nếu cần.
-- ---------------------------------------------------------------------------
do $$
declare
    fn text;
begin
    foreach fn in array array[
        'public.bk_gam_level_floor(integer)',
        'public.bk_gam_level(bigint)',
        'public.bk_gam_metric(uuid, text)',
        'public.bk_gam_award(uuid, text, text, text, integer)',
        'public.bk_gam_evaluate(uuid, integer)',
        'public.bk_gam_grant_item(uuid, text, text)',
        'public.bk_gam_sync_missions(uuid)',
        'public.bk_gam_claim(uuid, uuid)',
        'public.bk_gam_boss_start(uuid, text)',
        'public.bk_gam_boss_submit(uuid, text, jsonb, text)',
        'public.bk_gam_equip(uuid, text, boolean)',
        'public.bk_gam_adjust(uuid, integer, text, text, jsonb)',
        'public.bk_gam_state(uuid)'
    ] loop
        execute format('revoke all on function %s from public', fn);
        execute format('revoke all on function %s from anon, authenticated', fn);
        execute format('grant execute on function %s to service_role', fn);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 20. RLS — học sinh chỉ ĐỌC dữ liệu của mình; không có policy ghi.
-- ---------------------------------------------------------------------------
alter table public.xp_transactions          enable row level security;
alter table public.user_progression         enable row level security;
alter table public.skill_tree_nodes         enable row level security;
alter table public.user_skill_progress      enable row level security;
alter table public.achievement_defs         enable row level security;
alter table public.user_achievements        enable row level security;
alter table public.mission_defs             enable row level security;
alter table public.user_missions            enable row level security;
alter table public.boss_challenges          enable row level security;
alter table public.boss_questions           enable row level security;
alter table public.boss_attempts            enable row level security;
alter table public.reward_catalog           enable row level security;
alter table public.user_inventory           enable row level security;
alter table public.gamification_activity_logs enable row level security;
alter table public.gamification_config enable row level security;

revoke all on public.xp_transactions from anon, authenticated;
revoke all on public.user_progression from anon, authenticated;
revoke all on public.user_skill_progress from anon, authenticated;
revoke all on public.user_achievements from anon, authenticated;
revoke all on public.user_missions from anon, authenticated;
revoke all on public.boss_questions from anon, authenticated;
revoke all on public.boss_attempts from anon, authenticated;
revoke all on public.user_inventory from anon, authenticated;
revoke all on public.gamification_activity_logs from anon, authenticated;
revoke all on public.skill_tree_nodes from anon;
revoke all on public.achievement_defs from anon;
revoke all on public.mission_defs from anon;
revoke all on public.boss_challenges from anon;
revoke all on public.reward_catalog from anon;

grant select on public.skill_tree_nodes to authenticated;
grant select on public.achievement_defs to authenticated;
grant select on public.mission_defs to authenticated;
grant select on public.boss_challenges to authenticated;
grant select on public.reward_catalog to authenticated;
grant select on public.xp_transactions to authenticated;
grant select on public.user_progression to authenticated;
grant select on public.user_skill_progress to authenticated;
grant select on public.user_achievements to authenticated;
grant select on public.user_missions to authenticated;
grant select on public.boss_attempts to authenticated;
grant select on public.user_inventory to authenticated;

drop policy if exists gamification_nodes_read on public.skill_tree_nodes;
create policy gamification_nodes_read on public.skill_tree_nodes
    for select to authenticated using (is_active);

drop policy if exists gamification_achievements_read on public.achievement_defs;
create policy gamification_achievements_read on public.achievement_defs
    for select to authenticated using (is_active);

drop policy if exists gamification_missions_read on public.mission_defs;
create policy gamification_missions_read on public.mission_defs
    for select to authenticated using (is_active);

drop policy if exists gamification_challenges_read on public.boss_challenges;
create policy gamification_challenges_read on public.boss_challenges
    for select to authenticated using (is_active);

drop policy if exists gamification_catalog_read on public.reward_catalog;
create policy gamification_catalog_read on public.reward_catalog
    for select to authenticated using (is_active);

drop policy if exists gamification_xp_own on public.xp_transactions;
create policy gamification_xp_own on public.xp_transactions
    for select to authenticated using (student_id = public.bakhi_current_student_id());

drop policy if exists gamification_progression_own on public.user_progression;
create policy gamification_progression_own on public.user_progression
    for select to authenticated using (student_id = public.bakhi_current_student_id());

drop policy if exists gamification_skill_own on public.user_skill_progress;
create policy gamification_skill_own on public.user_skill_progress
    for select to authenticated using (student_id = public.bakhi_current_student_id());

drop policy if exists gamification_user_achievements_own on public.user_achievements;
create policy gamification_user_achievements_own on public.user_achievements
    for select to authenticated using (student_id = public.bakhi_current_student_id());

drop policy if exists gamification_user_missions_own on public.user_missions;
create policy gamification_user_missions_own on public.user_missions
    for select to authenticated using (student_id = public.bakhi_current_student_id());

drop policy if exists gamification_attempts_own on public.boss_attempts;
create policy gamification_attempts_own on public.boss_attempts
    for select to authenticated using (student_id = public.bakhi_current_student_id());

drop policy if exists gamification_inventory_own on public.user_inventory;
create policy gamification_inventory_own on public.user_inventory
    for select to authenticated using (student_id = public.bakhi_current_student_id());

-- boss_questions: KHÔNG có policy → không trình duyệt nào đọc được đáp án.
-- gamification_activity_logs: không cấp quyền đọc cho authenticated.

-- ---------------------------------------------------------------------------
-- 21. Seed ĐỊNH NGHĨA (không phải dữ liệu người dùng). Không ghi đè bản đã sửa.
-- ---------------------------------------------------------------------------
update public.gamification_config
   set xp_rules = '{
        "quiz_completed":     {"xp": 20, "daily_cap": 6},
        "lesson_study":       {"xp": 10, "daily_cap": 6},
        "listening_completed":{"xp": 12, "daily_cap": 4},
        "revision_session":   {"xp": 18, "daily_cap": 4},
        "mistake_mastered":   {"xp": 8,  "daily_cap": 12},
        "goal_completed":     {"xp": 25, "daily_cap": 2},
        "boss_passed":        {"xp": 60, "daily_cap": 2},
        "skill_node":         {"xp": 30, "daily_cap": 4},
        "achievement_reward": {"xp": 20, "daily_cap": 10},
        "mission_reward":     {"xp": 40, "daily_cap": 6}
       }'::jsonb,
       feature_flags = '{"xp": true, "achievements": true, "missions": true,
                         "skill_tree": true, "boss": true, "inventory": true}'::jsonb,
       season = '{"id": "season-1", "name": "Khởi đầu", "started_at": "2026-11-20"} '::jsonb,
       updated_at = now()
 where id = true
   and xp_rules = '{}'::jsonb;

insert into public.reward_catalog (id, kind, name, description, icon, rarity, sort_order) values
    ('frame-laurel',   'frame',      'Khung Nguyệt Quế', 'Khung hồ sơ mở khoá khi hoàn thành nhánh Knowledge.', 'fa-crown', 'rare', 10),
    ('frame-ember',    'frame',      'Khung Hồng Ngọc',  'Khung hồ sơ mở khoá khi giữ chuỗi học tập.', 'fa-fire', 'rare', 20),
    ('theme-dawn',     'theme',      'Giao diện Bình Minh', 'Tông màu sáng cho trang tiến trình.', 'fa-sun', 'uncommon', 30),
    ('theme-midnight', 'theme',      'Giao diện Nửa Đêm', 'Tông màu tối cho trang tiến trình.', 'fa-moon', 'uncommon', 40),
    ('deco-quill',     'decoration', 'Ngòi Bút Tri Thức', 'Biểu tượng trang trí cạnh tên trên trang tiến trình.', 'fa-feather', 'epic', 50),
    ('title-scholar',  'title',      'Danh hiệu Học Giả', 'Danh hiệu hiển thị trong trang tiến trình.', 'fa-graduation-cap', 'epic', 60)
on conflict (id) do nothing;

insert into public.skill_tree_nodes
    (id, branch, name, description, icon, metric, target, requires, reward, sort_order) values
    ('knowledge-1', 'knowledge', 'Nền tảng',      'Hoàn thành 3 lượt học đầu tiên.',        'fa-book-open',    'lesson_study',    3,  '[]'::jsonb,        '{}'::jsonb, 10),
    ('knowledge-2', 'knowledge', 'Ôn luyện',      'Hoàn thành 5 bài quiz.',                  'fa-clipboard-check','quiz_completed',5, '["knowledge-1"]'::jsonb, '{}'::jsonb, 20),
    ('knowledge-3', 'knowledge', 'Vững kiến thức','Hoàn thành 15 bài quiz.',                 'fa-brain',        'quiz_completed',  15, '["knowledge-2"]'::jsonb, '{"items":["frame-laurel"]}'::jsonb, 30),
    ('practice-1',  'practice',  'Bắt nhịp',      'Hoàn thành 3 bài quiz.',                  'fa-dumbbell',     'quiz_completed',  3,  '[]'::jsonb,        '{}'::jsonb, 40),
    ('practice-2',  'practice',  'Đều tay',       'Hoàn thành 10 bài quiz.',                 'fa-repeat',       'quiz_completed',  10, '["practice-1"]'::jsonb, '{}'::jsonb, 50),
    ('practice-3',  'practice',  'Luyện tập bền', 'Có 10 ngày hoạt động học tập.',           'fa-medal',        'distinct_active_days', 10, '["practice-2"]'::jsonb, '{}'::jsonb, 60),
    ('memory-1',    'memory',    'Ghi nhớ',       'Ôn tập 1 phiên.',                         'fa-rotate',       'revision_session', 1, '[]'::jsonb,       '{}'::jsonb, 70),
    ('memory-2',    'memory',    'Nhớ sâu',       'Hoàn thành 5 phiên ôn tập.',              'fa-layer-group',  'revision_session', 5, '["memory-1"]'::jsonb, '{}'::jsonb, 80),
    ('memory-3',    'memory',    'Làm chủ câu sai','Xử lý 10 câu trong Sổ tay câu sai.',     'fa-check-double', 'mistake_mastered', 10, '["memory-2"]'::jsonb, '{}'::jsonb, 90),
    ('consistency-1','consistency','Thói quen',   'Có 3 ngày hoạt động học tập.',            'fa-calendar-check','distinct_active_days', 3, '[]'::jsonb,      '{}'::jsonb, 100),
    ('consistency-2','consistency','Bền bỉ',      'Giữ chuỗi 3 ngày học liên tiếp.',         'fa-fire',         'streak_days',     3,  '["consistency-1"]'::jsonb, '{"items":["frame-ember"]}'::jsonb, 110),
    ('consistency-3','consistency','Không gián đoạn','Giữ chuỗi 7 ngày học liên tiếp.',      'fa-fire-flame-curved','streak_days', 7,  '["consistency-2"]'::jsonb, '{"items":["theme-dawn"]}'::jsonb, 120),
    ('mastery-1',   'mastery',   'Chinh phục',   'Vượt qua 1 thử thách Boss.',              'fa-dragon',       'boss_passed',     1,  '[]'::jsonb,        '{}'::jsonb, 130),
    ('mastery-2',   'mastery',   'Kiên cường',   'Vượt qua 3 thử thách Boss.',              'fa-shield-halved','boss_passed',     3,  '["mastery-1"]'::jsonb, '{"items":["deco-quill"]}'::jsonb, 140),
    ('mastery-3',   'mastery',   'Tinh thông',   'Đạt 10 thành tựu.',                       'fa-star',         'achievements_unlocked', 10, '["mastery-2"]'::jsonb, '{"items":["title-scholar"]}'::jsonb, 150)
on conflict (id) do nothing;

insert into public.achievement_defs
    (id, name, description, icon, rarity, category, conditions, stages, reward, is_hidden, sort_order) values
    ('ach-first-quiz',    'Câu hỏi đầu tiên',  'Hoàn thành bài quiz đầu tiên.',              'fa-flag-checkered', 'common',   'quiz',      '[{"metric":"quiz_completed","target":1}]'::jsonb,   1, '{}'::jsonb, false, 10),
    ('ach-quiz-10',       'Mười lần luyện',    'Hoàn thành 10 bài quiz.',                    'fa-clipboard-list','uncommon', 'quiz',      '[{"metric":"quiz_completed","target":10}]'::jsonb,  1, '{}'::jsonb, false, 20),
    ('ach-quiz-50',       'Bền bỉ luyện tập',  'Hoàn thành 50 bài quiz.',                    'fa-trophy',        'epic',     'quiz',      '[{"metric":"quiz_completed","target":50}]'::jsonb,  1, '{}'::jsonb, false, 30),
    ('ach-reading-5',     'Người đọc chăm',    'Học 5 lượt bài học.',                        'fa-book',          'common',   'reading',   '[{"metric":"lesson_study","target":5}]'::jsonb,     1, '{}'::jsonb, false, 40),
    ('ach-reading-25',    'Thư viện sống',     'Học 25 lượt bài học.',                       'fa-books',         'rare',     'reading',   '[{"metric":"lesson_study","target":25}]'::jsonb,    1, '{}'::jsonb, false, 50),
    ('ach-listening-5',   'Tai nghe tinh tế',  'Hoàn thành 5 lượt luyện nghe.',              'fa-headphones',    'uncommon', 'listening', '[{"metric":"listening_completed","target":5}]'::jsonb, 1, '{}'::jsonb, false, 60),
    ('ach-revision-1',    'Ôn tập đầu tiên',   'Hoàn thành phiên ôn tập đầu tiên.',          'fa-rotate',        'common',   'revision',  '[{"metric":"revision_session","target":1}]'::jsonb, 1, '{}'::jsonb, false, 70),
    ('ach-revision-20',   'Bộ nhớ bền',        'Hoàn thành 20 phiên ôn tập.',                'fa-brain',         'rare',     'revision',  '[{"metric":"revision_session","target":20}]'::jsonb,1, '{}'::jsonb, false, 80),
    ('ach-mastery-50',    'Sổ tay sạch',       'Xử lý 50 câu trong Sổ tay câu sai.',         'fa-check-double',  'epic',     'revision',  '[{"metric":"mistake_mastered","target":50}]'::jsonb,1, '{}'::jsonb, false, 90),
    ('ach-streak-3',      'Ba ngày liền',      'Giữ chuỗi 3 ngày học.',                      'fa-fire',          'common',   'consistency','[{"metric":"streak_days","target":3}]'::jsonb,      1, '{}'::jsonb, false, 100),
    ('ach-streak-7',      'Một tuần đều đặn',  'Giữ chuỗi 7 ngày học.',                      'fa-fire-flame-curved','rare',   'consistency','[{"metric":"streak_days","target":7}]'::jsonb,      1, '{"items":["theme-midnight"]}'::jsonb, false, 110),
    ('ach-boss-1',        'Người vượt ải',     'Vượt qua thử thách Boss đầu tiên.',          'fa-dragon',        'rare',     'boss',      '[{"metric":"boss_passed","target":1}]'::jsonb,      1, '{}'::jsonb, false, 120),
    ('ach-boss-5',        'Bậc thầy thử thách','Vượt qua 5 thử thách Boss.',                 'fa-crown',         'legendary','boss',      '[{"metric":"boss_passed","target":5}]'::jsonb,      1, '{}'::jsonb, false, 130),
    ('ach-level-5',       'Cấp 5',             'Đạt cấp độ 5.',                              'fa-arrow-up',      'uncommon', 'milestone', '[{"metric":"level","target":5}]'::jsonb,            1, '{}'::jsonb, false, 140),
    ('ach-level-10',      'Cấp 10',            'Đạt cấp độ 10.',                             'fa-stairs',        'epic',     'milestone', '[{"metric":"level","target":10}]'::jsonb,           1, '{}'::jsonb, false, 150),
    ('ach-skill-knowledge','Nhánh tri thức',   'Hoàn thành nhánh Knowledge.',                'fa-book-open',     'rare',     'skill',     '[{"metric":"skill_nodes_completed","target":3}]'::jsonb, 1, '{}'::jsonb, false, 160),
    ('ach-hidden-early',  'Người mở đường',    'Hoạt động học tập trước 6 giờ sáng (giờ máy).','fa-moon',        'legendary','event',     '[{"metric":"distinct_active_days","target":10}]'::jsonb, 1, '{}'::jsonb, true, 170)
on conflict (id) do nothing;

insert into public.mission_defs
    (id, name, description, category, difficulty, metric, target, cadence, reward, min_level, sort_order) values
    ('mission-daily-quiz-1',   'Một bài quiz hôm nay', 'Hoàn thành 1 bài quiz.',                  'practice',    'easy',   'quiz_completed',      1, 'daily',  '{"xp": 40}'::jsonb, 1, 10),
    ('mission-daily-revision', 'Ôn lại một phiên',     'Hoàn thành 1 phiên ôn tập.',               'revision',    'easy',   'revision_session',    1, 'daily',  '{"xp": 40}'::jsonb, 1, 20),
    ('mission-daily-read',     'Học một bài',         'Học 1 lượt bài học mới.',                  'learning',    'easy',   'lesson_study',        1, 'daily',  '{"xp": 30}'::jsonb, 1, 30),
    ('mission-daily-mistake',  'Dọn sổ tay',          'Xử lý 2 câu trong Sổ tay câu sai.',        'revision',    'normal', 'mistake_mastered',    2, 'daily',  '{"xp": 50}'::jsonb, 2, 40),
    ('mission-daily-quiz-3',   'Ba bài luyện',        'Hoàn thành 3 bài quiz trong ngày.',        'practice',    'normal', 'quiz_completed',      3, 'daily',  '{"xp": 60}'::jsonb, 3, 50),
    ('mission-weekly-quiz-5',  'Năm bài trong tuần',  'Hoàn thành 5 bài quiz trong tuần.',        'practice',    'normal', 'quiz_completed',      5, 'weekly', '{"xp": 120}'::jsonb, 1, 60),
    ('mission-weekly-rev-3',   'Ba phiên ôn',         'Hoàn thành 3 phiên ôn tập trong tuần.',    'revision',    'normal', 'revision_session',    3, 'weekly', '{"xp": 120}'::jsonb, 1, 70),
    ('mission-weekly-read-3',  'Ba bài học',          'Học 3 lượt bài học trong tuần.',           'learning',    'normal', 'lesson_study',        3, 'weekly', '{"xp": 100}'::jsonb, 1, 80),
    ('mission-weekly-active-4','Bốn ngày hoạt động',  'Có 4 ngày hoạt động học tập trong tuần.',  'consistency', 'hard',   'distinct_active_days',4, 'weekly', '{"xp": 150}'::jsonb, 2, 90)
on conflict (id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 22. Đối chiếu toàn vẹn: tổng sổ XP so với bảng tiến trình.
--     Không sửa dữ liệu — chỉ báo lệch để quản trị xử lý có audit.
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_admin_drift()
returns table (
    student_id   uuid,
    stored_xp    bigint,
    ledger_xp    bigint,
    stored_level integer,
    ledger_level integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.student_id,
           p.total_xp as stored_xp,
           coalesce(l.ledger_xp, 0) as ledger_xp,
           p.level as stored_level,
           public.bk_gam_level(coalesce(l.ledger_xp, 0)) as ledger_level
    from public.user_progression p
    left join (
        select student_id, sum(amount)::bigint as ledger_xp
        from public.xp_transactions
        group by student_id
    ) l on l.student_id = p.student_id
    where p.total_xp <> coalesce(l.ledger_xp, 0)
       or p.level <> public.bk_gam_level(coalesce(l.ledger_xp, 0));
$$;

revoke all on function public.bk_gam_admin_drift() from public;
revoke all on function public.bk_gam_admin_drift() from anon, authenticated;
grant execute on function public.bk_gam_admin_drift() to service_role;

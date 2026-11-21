-- ============================================================================
-- Bá Khí — 8.3.6
--   1. Sửa hồi quy 8.3.5: bakhi_owned_frames quay lại đọc bảng ánh xạ
--      bakhi_badge_frames (58 khung, gồm toàn bộ khung Founder/Developer).
--      Bản 8.3.5 thay bằng danh sách 21 khung viết cứng nên khung Founder
--      đang trang bị bị coi là "chưa mở" → hồ sơ bị từ chối, hiện thông báo
--      "Khung avatar chưa mở nên chưa đồng bộ được".
--   2. Giữ nguyên khung đang trang bị trong hồ sơ (grandfather) để nâng cấp
--      không bao giờ làm mất khung hợp lệ đã có.
--   3. Buff XP theo đối tượng: bảng gamification_xp_buffs + hàm nhân XP.
--   4. Đặt cấp độ cho một đối tượng: bk_gam_set_level (ghi sổ XP từng phần,
--      mỗi giao dịch ≤ 100.000 XP để khớp ràng buộc của xp_transactions).
--
-- Rollback (khôi phục đúng trạng thái 8.3.5):
--   drop table if exists public.gamification_xp_buffs;
--   drop function if exists public.bk_gam_set_level(uuid, integer, text, text);
--   drop function if exists public.bk_gam_active_buffs(uuid);
--   drop function if exists public.bk_gam_active_buff(uuid);
--   -- rồi chạy lại mục 3 của 20261210000000_bakhi_v835_avatar_frame_sync.sql
--   -- và mục 13 của 20261209000000_bakhi_v830_gamification.sql (bk_gam_award).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Khung sở hữu = khung cơ bản + bảng ánh xạ badge + kho vật phẩm + khung
--    đang trang bị (không bao giờ làm mất khung hợp lệ đã có).
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_owned_frames(p_student uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
    select array(
        select distinct x.frame
        from (
            select unnest(array['none', 'leaf']) as frame
            union all
            /* Khung thưởng của badge (tự động hoặc Founder/Admin trao tay). */
            select m.frame_id as frame
            from public.student_badges sb
            join public.bakhi_badge_frames m on m.badge_id = sb.badge_id
            where sb.student_id = p_student
              and (sb.auto_earned or sb.manual_granted)
            union all
            /* Khung nhận qua Reward Engine của Gamification. */
            select nullif(rc.metadata ->> 'profile_frame', '') as frame
            from public.user_inventory ui
            join public.reward_catalog rc on rc.id = ui.item_id
            where ui.student_id = p_student and rc.kind = 'frame'
            union all
            /* Khung đang trang bị trong hồ sơ: giữ nguyên khi nâng cấp. */
            select sp.frame as frame
            from public.student_profiles sp
            where sp.student_id = p_student and sp.frame is not null and sp.frame <> ''
        ) x
        where x.frame is not null and x.frame <> ''
        order by x.frame
    );
$$;

comment on function public.bakhi_owned_frames(uuid) is
    'Khung avatar học sinh được dùng: 2 khung cơ bản + khung của badge đã nhận (bảng ánh xạ bakhi_badge_frames) + khung nhận qua kho vật phẩm Gamification + khung đang trang bị trong hồ sơ (8.3.6).';

revoke execute on function public.bakhi_owned_frames(uuid) from public;
grant execute on function public.bakhi_owned_frames(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Buff XP theo đối tượng (toàn trường / một học sinh / khoảng cấp độ)
-- ---------------------------------------------------------------------------
create table if not exists public.gamification_xp_buffs (
    id          uuid primary key default gen_random_uuid(),
    label       text not null default '' check (char_length(label) <= 120),
    multiplier  numeric(4, 2) not null check (multiplier >= 1 and multiplier <= 10),
    audience    jsonb not null default '{"kind":"all"}'::jsonb,
    starts_at   timestamptz not null default now(),
    ends_at     timestamptz not null,
    is_active   boolean not null default true,
    created_by  text,
    created_at  timestamptz not null default now(),
    check (ends_at > starts_at),
    check (audience ->> 'kind' in ('all', 'student', 'level'))
);

comment on table public.gamification_xp_buffs is
    'Buff XP có thời hạn theo đối tượng, do Founder tạo trong tab Gamification. Chỉ đọc/ghi qua Edge Function bằng service_role.';

alter table public.gamification_xp_buffs enable row level security;
revoke all on public.gamification_xp_buffs from public, anon, authenticated;
grant select, insert, update, delete on public.gamification_xp_buffs to service_role;

create index if not exists gamification_xp_buffs_active_idx
    on public.gamification_xp_buffs (is_active, ends_at);

create or replace function public.bk_gam_active_buff(p_student uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(max(b.multiplier), 1)::numeric
    from public.gamification_xp_buffs b
    where b.is_active
      and now() >= b.starts_at
      and now() < b.ends_at
      and (
            coalesce(b.audience ->> 'kind', 'all') = 'all'
            or (b.audience ->> 'kind' = 'student' and b.audience ->> 'student_id' = p_student::text)
            or (
                b.audience ->> 'kind' = 'level'
                and coalesce((select up.level from public.user_progression up where up.student_id = p_student), 1)
                    between coalesce((b.audience ->> 'min')::integer, 1)
                        and coalesce((b.audience ->> 'max')::integer, 1000)
            )
      );
$$;

comment on function public.bk_gam_active_buff(uuid) is
    'Hệ số nhân XP đang hiệu lực cho một học sinh (1 = không buff). Nhiều buff chồng nhau: lấy hệ số cao nhất.';

create or replace function public.bk_gam_active_buffs(p_student uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'label', b.label,
        'multiplier', b.multiplier,
        'ends_at', b.ends_at,
        'audience', b.audience
    ) order by b.ends_at), '[]'::jsonb)
    from public.gamification_xp_buffs b
    where b.is_active
      and now() >= b.starts_at
      and now() < b.ends_at
      and (
            coalesce(b.audience ->> 'kind', 'all') = 'all'
            or (b.audience ->> 'kind' = 'student' and b.audience ->> 'student_id' = p_student::text)
            or (
                b.audience ->> 'kind' = 'level'
                and coalesce((select up.level from public.user_progression up where up.student_id = p_student), 1)
                    between coalesce((b.audience ->> 'min')::integer, 1)
                        and coalesce((b.audience ->> 'max')::integer, 1000)
            )
      );
$$;

revoke all on function public.bk_gam_active_buff(uuid) from public;
revoke all on function public.bk_gam_active_buff(uuid) from anon, authenticated;
grant execute on function public.bk_gam_active_buff(uuid) to service_role;

revoke all on function public.bk_gam_active_buffs(uuid) from public;
revoke all on function public.bk_gam_active_buffs(uuid) from anon, authenticated;
grant execute on function public.bk_gam_active_buffs(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. bk_gam_award: áp hệ số buff XP đang hiệu lực (máy chủ quyết định)
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
    v_buff     numeric := 1;
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

    /* 8.3.6: hệ số buff do Founder đặt; giới hạn để không vượt ràng buộc sổ XP. */
    v_buff := public.bk_gam_active_buff(p_student);
    if v_buff > 1 then
        v_amount := least(100000, greatest(1, round(v_amount * v_buff)::integer));
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
            left(p_key, 200), jsonb_build_object('depth', p_depth, 'buff', v_buff))
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
                               'buff', v_buff,
                               'source', left(coalesce(p_source, ''), 200)));

    return jsonb_build_object(
        'awarded', true,
        'amount', v_amount,
        'activity', p_activity,
        'total_xp', v_after_total,
        'level', v_after_level,
        'previous_level', v_before.level,
        'leveled_up', v_leveled,
        'buff', v_buff
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Đặt cấp độ cho một học sinh — ghi sổ XP theo từng phần ≤ 100.000 XP
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

    return jsonb_build_object(
        'ok', true,
        'level', v_target_level,
        'total_xp', v_target_xp,
        'previous_level', v_before_level,
        'previous_xp', v_before_xp,
        'delta', v_target_xp - v_before_xp
    );
end;
$$;

revoke all on function public.bk_gam_set_level(uuid, integer, text, text) from public;
revoke all on function public.bk_gam_set_level(uuid, integer, text, text) from anon, authenticated;
grant execute on function public.bk_gam_set_level(uuid, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Kiểm tra sau migration (chạy tay, không tự động vì phụ thuộc dữ liệu thật)
-- ---------------------------------------------------------------------------
--   select student_id, frame from public.student_profiles
--    where frame <> 'none'
--      and frame <> all (public.bakhi_owned_frames(student_id));   -- phải 0 dòng
--   select * from public.bk_gam_admin_drift();                     -- phải 0 dòng

commit;

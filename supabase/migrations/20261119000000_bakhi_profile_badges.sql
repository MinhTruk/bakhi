-- ============================================================================
-- Bá Khí 3.6.0 — Hồ sơ học sinh và thành tích xác minh phía máy chủ
--
-- Mục tiêu:
--   * Hồ sơ (biệt danh, giới thiệu, liên kết, khung avatar) lưu theo học sinh,
--     đồng bộ giữa các thiết bị.
--   * Thành tích chỉ được ghi bởi Edge Function (service role). Trình duyệt chỉ
--     đọc được badge của chính mình → không thể tự trao badge Administrator.
--   * Khung avatar phải thuộc sở hữu (badge đã mở) — kiểm tra bằng trigger.
--
-- An toàn: bật RLS, không policy ghi cho anon/authenticated trên student_badges,
-- thu hồi quyền ghi trực tiếp; chỉ service role (Edge Function) ghi được.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Hồ sơ học sinh
-- ---------------------------------------------------------------------------
create table if not exists public.student_profiles (
    student_id uuid primary key references public.students(id) on delete cascade,
    nickname text not null default '' check (char_length(nickname) <= 40),
    bio text not null default '' check (char_length(bio) <= 320),
    avatar_url text not null default '' check (char_length(avatar_url) <= 800000),
    banner_url text not null default '' check (char_length(banner_url) <= 900000),
    links jsonb not null default '[]'::jsonb,
    frame text not null default 'none' check (char_length(frame) <= 40),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.student_profiles is
    'Hồ sơ học sinh Bá Khí: biệt danh, giới thiệu, liên kết, khung avatar. Một dòng / học sinh.';
comment on column public.student_profiles.links is
    'Tối đa 6 liên kết http/https; Edge Function kiểm tra lại trước khi ghi.';

-- ---------------------------------------------------------------------------
-- 2. Thành tích (chỉ Edge Function ghi)
-- ---------------------------------------------------------------------------
create table if not exists public.student_badges (
    student_id uuid not null references public.students(id) on delete cascade,
    badge_id text not null check (char_length(badge_id) between 1 and 64),
    kind text not null default 'auto' check (kind in ('auto', 'admin')),
    awarded_at timestamptz not null default now(),
    awarded_by text,
    reason text not null default '' check (char_length(reason) <= 200),
    evidence jsonb not null default '{}'::jsonb,
    primary key (student_id, badge_id)
);

comment on table public.student_badges is
    'Thành tích đã xác minh. kind=auto do student-profile tính lại từ dữ liệu học tập; kind=admin chỉ do admin-actions trao.';
comment on column public.student_badges.awarded_by is
    'Mã phiên Administrator đã trao (chỉ với kind=admin) hoặc NULL với badge tự động.';

create index if not exists student_badges_student_idx
    on public.student_badges (student_id, awarded_at desc);

-- ---------------------------------------------------------------------------
-- 3. Khung avatar được sở hữu
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_owned_frames(p_student uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
    select array(
        select distinct frame
        from (
            select unnest(array['none', 'leaf']) as frame
            union all
            select sb.frame
            from (
                select case badge_id
                    when 'learn-first-lesson' then 'leaf'
                    when 'learn-lessons-30' then 'wreath'
                    when 'explore-pages-50' then 'sakura'
                    when 'consist-days-30' then 'sunflower'
                    when 'consist-streak-30' then 'crown'
                    when 'music-200' then 'ear-cat'
                    when 'music-same-20' then 'ear-fox'
                    when 'inter-meteor-1000' then 'star'
                    when 'inter-meteor-10000' then 'horn-dragon'
                    when 'social-avatar' then 'leaf'
                    when 'social-frame' then 'ear-bunny'
                    when 'studio-exports-10' then 'antler'
                    when 'secret-night-owl' then 'star'
                    when 'secret-subjects-all' then 'sakura'
                    when 'secret-notes-100' then 'wreath'
                    when 'secret-mastered-50' then 'ear-wolf'
                    when 'secret-collector-40' then 'sunflower'
                    when 'secret-collector-60' then 'horn-dragon'
                    when 'secret-completionist' then 'crown'
                    when 'admin-chosen' then 'star'
                    when 'admin-legend' then 'crown'
                    else null
                end as frame
                from public.student_badges
                where student_id = p_student
            ) sb
            where sb.frame is not null
        ) all_frames
    );
$$;

comment on function public.bakhi_owned_frames(uuid) is
    'Danh sách khung avatar học sinh được dùng: 2 khung cơ bản + khung thưởng của badge đã xác minh.';

-- Không cho trang bị khung chưa sở hữu.
create or replace function public.bakhi_profile_frame_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.frame is distinct from 'none' then
        if not (new.frame = any (public.bakhi_owned_frames(new.student_id))) then
            raise exception 'FRAME_NOT_OWNED' using errcode = '22023',
                hint = 'Khung avatar này chưa được mở bằng thành tích.';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists student_profiles_frame_guard on public.student_profiles;
create trigger student_profiles_frame_guard
    before insert or update of frame on public.student_profiles
    for each row execute function public.bakhi_profile_frame_guard();

drop trigger if exists student_profiles_touch on public.student_profiles;
create trigger student_profiles_touch
    before update on public.student_profiles
    for each row execute function public.bakhi_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.student_profiles enable row level security;
alter table public.student_badges enable row level security;

drop policy if exists student_profiles_select_own on public.student_profiles;
create policy student_profiles_select_own on public.student_profiles
    for select using (student_id = public.bakhi_current_student_id());

drop policy if exists student_profiles_insert_own on public.student_profiles;
create policy student_profiles_insert_own on public.student_profiles
    for insert with check (student_id = public.bakhi_current_student_id());

drop policy if exists student_profiles_update_own on public.student_profiles;
create policy student_profiles_update_own on public.student_profiles
    for update using (student_id = public.bakhi_current_student_id())
    with check (student_id = public.bakhi_current_student_id());

drop policy if exists student_badges_select_own on public.student_badges;
create policy student_badges_select_own on public.student_badges
    for select using (student_id = public.bakhi_current_student_id());

-- Không có policy insert/update/delete: trình duyệt không ghi được badge.
revoke insert, update, delete on public.student_badges from anon, authenticated;
revoke all on public.student_badges from public;

grant select on public.student_badges to authenticated;
grant select, insert, update on public.student_profiles to authenticated;
revoke delete on public.student_profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Quyền cho báo cáo quản trị
-- ---------------------------------------------------------------------------
revoke execute on function public.bakhi_owned_frames(uuid) from public;
grant execute on function public.bakhi_owned_frames(uuid) to authenticated, service_role;

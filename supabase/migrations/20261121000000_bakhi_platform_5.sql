-- ============================================================================
-- Bá Khí 5.0.0 — nền tảng: danh vị học sinh, badge trao tay, 30 khung avatar,
-- bảo trì toàn website.
--
-- Nguyên tắc an toàn:
--   * Không xoá bảng/cột/dữ liệu; chỉ thêm cột, backfill, thay hàm.
--   * Không cấp quyền ghi trực tiếp cho trình duyệt trên các bảng quản trị.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--
-- Hoàn tác (nếu cần):
--   drop table if exists public.student_roles;
--   alter table public.students drop column if exists is_founder;
--   alter table public.student_badges drop column if exists auto_earned;
--   alter table public.student_badges drop column if exists manual_granted;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cờ Founder (canonical, xác minh phía máy chủ)
--    Chỉ đặt cho đúng một hồ sơ học sinh chính thức của Minh Trúc.
-- ---------------------------------------------------------------------------
alter table public.students add column if not exists is_founder boolean not null default false;

comment on column public.students.is_founder is
    'Chỉ true cho hồ sơ chính thức của người sáng lập (Minh Trúc). Dùng để chặn trao badge Founder cho người khác.';

-- Chỉ đặt cờ khi tên khớp DUY NHẤT một hồ sơ, tránh trao nhầm khi trùng tên.
do $$
declare
    v_count integer;
    v_id uuid;
begin
    select count(*) into v_count
      from public.students
     where lower(btrim(display_name)) = lower(btrim('Minh Trúc'));

    if v_count = 1 then
        select id into v_id
          from public.students
         where lower(btrim(display_name)) = lower(btrim('Minh Trúc'))
         limit 1;
        update public.students set is_founder = true where id = v_id;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Badge: tách "tự động đạt" và "Administrator trao tay"
--    Một dòng có thể vừa tự động đạt vừa được trao tay; thu hồi trao tay
--    không xoá kết quả tự động.
-- ---------------------------------------------------------------------------
alter table public.student_badges add column if not exists auto_earned boolean not null default false;
alter table public.student_badges add column if not exists manual_granted boolean not null default false;

comment on column public.student_badges.auto_earned is
    'True khi badge đủ điều kiện tự động theo dữ liệu học tập.';
comment on column public.student_badges.manual_granted is
    'True khi Administrator trao tay. Tách biệt hoàn toàn với auto_earned.';

-- Backfill dữ liệu cũ (một lần; chạy lại vẫn đúng).
update public.student_badges
   set auto_earned = (kind = 'auto'),
       manual_granted = (kind = 'admin')
 where auto_earned is distinct from (kind = 'auto')
    or manual_granted is distinct from (kind = 'admin');

create index if not exists student_badges_manual_idx
    on public.student_badges (student_id)
    where manual_granted;

-- ---------------------------------------------------------------------------
-- 3. Danh vị học sinh (role label hiển thị — KHÔNG cấp quyền quản trị)
-- ---------------------------------------------------------------------------
create table if not exists public.student_roles (
    student_id uuid primary key references public.students(id) on delete cascade,
    role_key   text not null default 'member' check (char_length(role_key) <= 40),
    role_label text not null default '' check (char_length(role_label) <= 80),
    updated_at timestamptz not null default now(),
    updated_by text
);

comment on table public.student_roles is
    'Danh vị hiển thị của học sinh (Lớp trưởng, Bí thư, Người sáng lập…). Chỉ là nhãn hiển thị, không cấp quyền Administrator/Dev.';

alter table public.student_roles enable row level security;

drop policy if exists student_roles_select_all on public.student_roles;
create policy student_roles_select_all on public.student_roles
    for select to anon, authenticated using (true);

-- Trình duyệt không ghi trực tiếp; chỉ Edge Function service_role ghi.
revoke insert, update, delete on public.student_roles from anon, authenticated;
revoke all on public.student_roles from public;
grant select on public.student_roles to anon, authenticated;

drop trigger if exists student_roles_touch on public.student_roles;
create trigger student_roles_touch
    before update on public.student_roles
    for each row execute function public.bakhi_touch_updated_at();

-- Seed danh vị theo đúng họ tên trong bảng students (canonical id, không theo
-- tên do client gửi). Chỉ thêm khi chưa có để không ghi đè chỉnh sửa sau này.
insert into public.student_roles (student_id, role_key, role_label)
select s.id, 'class-president', 'Lớp trưởng'
  from public.students s
 where lower(btrim(s.display_name)) = lower(btrim('Lê Nhật Toàn'))
on conflict (student_id) do nothing;

insert into public.student_roles (student_id, role_key, role_label)
select s.id, 'secretary', 'Bí thư'
  from public.students s
 where lower(btrim(s.display_name)) = lower(btrim('Đoàn Việt Kỳ Thư'))
on conflict (student_id) do nothing;

insert into public.student_roles (student_id, role_key, role_label)
select s.id, 'founder', 'Người sáng lập · Kẻ chủ mưu'
  from public.students s
 where lower(btrim(s.display_name)) = lower(btrim('Minh Trúc'))
on conflict (student_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Quyền sở hữu 30 khung avatar
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
                    when 'social-avatar' then 'leaf'
                    when 'learn-lessons-30' then 'wreath'
                    when 'secret-notes-100' then 'wreath'
                    when 'explore-pages-50' then 'sakura'
                    when 'secret-subjects-all' then 'sakura'
                    when 'consist-days-30' then 'sunflower'
                    when 'secret-collector-40' then 'sunflower'
                    when 'consist-streak-30' then 'crown'
                    when 'secret-completionist' then 'crown'
                    when 'admin-legend' then 'crown'
                    when 'music-200' then 'ear-cat'
                    when 'music-same-20' then 'ear-fox'
                    when 'inter-meteor-1000' then 'star'
                    when 'secret-night-owl' then 'star'
                    when 'admin-chosen' then 'star'
                    when 'inter-meteor-10000' then 'horn-dragon'
                    when 'secret-collector-60' then 'horn-dragon'
                    when 'social-frame' then 'ear-bunny'
                    when 'studio-exports-10' then 'antler'
                    when 'secret-mastered-50' then 'ear-wolf'
                    when 'learn-lessons-15' then 'celestial'
                    when 'learn-subjects-5' then 'divine'
                    when 'learn-practice-500' then 'royal'
                    when 'learn-correct-100' then 'infernal'
                    when 'learn-mastered-10' then 'legendary'
                    when 'consist-days-14' then 'eternal'
                    when 'music-shuffle' then 'neon'
                    when 'inter-focus' then 'cyber'
                    when 'explore-palette' then 'ancient'
                    when 'studio-export' then 'phoenix'
                    when 'studio-words-500' then 'crystal'
                    when 'secret-early-bird' then 'frost'
                    when 'secret-bookmarks-50' then 'gothic'
                    when 'secret-one-subject-10' then 'galactic'
                    when 'dev-exclusive-aurora' then 'dev-aurora'
                    when 'dev-exclusive-void' then 'dev-void'
                    when 'founder' then 'founder'
                    else null
                end as frame
                from public.student_badges
                where student_id = p_student
                  and (auto_earned or manual_granted)
            ) sb
            where sb.frame is not null
        ) all_frames
    );
$$;

comment on function public.bakhi_owned_frames(uuid) is
    'Khung avatar học sinh được dùng: 2 khung cơ bản + khung của badge tự động hoặc được Administrator trao.';

revoke execute on function public.bakhi_owned_frames(uuid) from public;
grant execute on function public.bakhi_owned_frames(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Cấu hình bảo trì có cấu trúc (giữ tương thích khoá cũ)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
    ('public.maintenance',
     '{"enabled": false, "title": "Bá Khí đang bảo trì", "message": "", "reason": "", "startAt": null, "endAt": null, "updatedAt": null}'::jsonb,
     'Bảo trì toàn website: bật/tắt, tiêu đề, nội dung, lý do và thời gian.')
on conflict (key) do nothing;

-- Cho phép trình duyệt CHƯA đăng nhập đọc khoá public.* (cần để hiển thị
-- trang bảo trì trước khi học sinh nhận diện). Không mở quyền ghi.
drop policy if exists app_settings_select_anon on public.app_settings;
create policy app_settings_select_anon on public.app_settings
    for select to anon using (key like 'public.%');

-- Bổ sung khoá còn thiếu cho bản ghi đã tồn tại (không ghi đè giá trị đang dùng).
update public.app_settings
   set value = jsonb_build_object(
        'enabled', coalesce(value->'enabled', 'false'::jsonb),
        'title', coalesce(value->'title', to_jsonb('Bá Khí đang bảo trì'::text)),
        'message', coalesce(value->'message', to_jsonb(''::text)),
        'reason', coalesce(value->'reason', to_jsonb(''::text)),
        'startAt', coalesce(value->'startAt', 'null'::jsonb),
        'endAt', coalesce(value->'endAt', 'null'::jsonb),
        'updatedAt', coalesce(value->'updatedAt', 'null'::jsonb)
   )
 where key = 'public.maintenance'
   and (value->'title' is null or value->'reason' is null or value->'startAt' is null
        or value->'endAt' is null or value->'updatedAt' is null);

-- Realtime cho danh vị và cấu hình (an toàn khi đã thêm trước đó).
do $$
begin
    begin
        alter publication supabase_realtime add table public.student_roles;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.app_settings;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.student_badges;
    exception when duplicate_object then null;
    end;
end $$;

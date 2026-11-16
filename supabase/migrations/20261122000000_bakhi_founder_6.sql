-- ============================================================================
-- Bá Khí 6.0.0 — Founder Dashboard, phiên Founder và cấp trọn bộ thành tích.
--
-- Nguyên tắc an toàn:
--   * Chỉ thêm bảng/cột, không xoá dữ liệu cũ.
--   * Founder Code chỉ lưu dạng băm SHA-256; trình duyệt không đọc được.
--   * Mọi thao tác Founder vẫn xác thực qua Edge Function + service_role.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--
-- Sau khi chạy migration: deploy lại Edge Functions `admin-auth` và
-- `admin-actions`, sau đó đăng nhập Founder trong Cài đặt → Founder.
-- ============================================================================

-- 1. Phiên quản trị có phạm vi (admin | founder) ------------------------------
alter table public.admin_sessions
    add column if not exists scope text not null default 'admin';

comment on column public.admin_sessions.scope is
    'Phạm vi phiên: admin (Administrator Code) hoặc founder (Founder Code). Server dùng cột này để chặn thao tác tối mật.';

create index if not exists admin_sessions_scope_idx
    on public.admin_sessions (scope, expires_at);

-- 2. Founder Code chỉ lưu dạng băm, không có policy đọc cho client -----------
create table if not exists public.founder_config (
    id integer primary key default 1 check (id = 1),
    code_hash text not null,
    updated_at timestamptz not null default now()
);

comment on table public.founder_config is
    'Cấu hình Founder Dashboard. code_hash là SHA-256 của Founder Code; chỉ service_role đọc được, không cấp quyền cho anon/authenticated.';

alter table public.founder_config enable row level security;
revoke all on public.founder_config from public, anon, authenticated;

insert into public.founder_config (id, code_hash)
values (1, '101c0e6c1631390981e9697e2d4c8ef5fbbade6e086646aae6cfcbb8c03b7e85')
on conflict (id) do nothing;

-- 3. Xác định hồ sơ Founder theo họ tên đầy đủ, chỉ khi khớp duy nhất --------
do $$
declare
    v_count integer;
    v_id uuid;
begin
    select count(*) into v_count
      from public.students
     where lower(btrim(display_name)) = lower(btrim('Hứa Viết Minh Trúc'));

    if v_count = 1 then
        select id into v_id
          from public.students
         where lower(btrim(display_name)) = lower(btrim('Hứa Viết Minh Trúc'))
         limit 1;
        update public.students set is_founder = true where id = v_id;
    end if;

    -- Tương thích dữ liệu cũ đã dùng tên ngắn "Minh Trúc".
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

-- 4. Cấp TOÀN BỘ badge cho hồ sơ Founder ------------------------------------
--    Tất cả 78 badge (73 tự động + 5 độc quyền). manual_granted tách biệt với
--    auto_earned nên không làm mất kết quả tự động. Mọi khung avatar đều có
--    ánh xạ badge trong bakhi_owned_frames(), vì vậy 30/30 khung được mở.
insert into public.student_badges
    (student_id, badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason)
select f.id, b.badge_id, 'admin', false, true, now(),
       'founder-seed', 'Founder: cấp toàn bộ badge và khung'
  from (select id from public.students where is_founder = true) f
  cross join (values
        ('learn-first-lesson'),
        ('learn-lessons-5'),
        ('learn-lessons-15'),
        ('learn-lessons-30'),
        ('learn-subjects-3'),
        ('learn-subjects-5'),
        ('learn-first-answer'),
        ('learn-practice-25'),
        ('learn-practice-100'),
        ('learn-practice-500'),
        ('learn-correct-15'),
        ('learn-correct-100'),
        ('learn-review-first'),
        ('learn-mastered-10'),
        ('explore-pages-5'),
        ('explore-pages-20'),
        ('explore-pages-50'),
        ('explore-studio'),
        ('explore-settings'),
        ('explore-profile'),
        ('explore-palette'),
        ('explore-search'),
        ('explore-theme'),
        ('explore-badges'),
        ('consist-days-2'),
        ('consist-days-3'),
        ('consist-days-7'),
        ('consist-days-14'),
        ('consist-days-30'),
        ('consist-streak-3'),
        ('consist-streak-7'),
        ('consist-streak-30'),
        ('music-first'),
        ('music-10'),
        ('music-50'),
        ('music-200'),
        ('music-tracks-5'),
        ('music-shuffle'),
        ('music-repeat'),
        ('music-queue'),
        ('music-same-20'),
        ('inter-first-effect'),
        ('inter-meteor-10'),
        ('inter-meteor-100'),
        ('inter-meteor-1000'),
        ('inter-meteor-10000'),
        ('inter-music-fab'),
        ('inter-focus'),
        ('inter-dark-mode'),
        ('social-nickname'),
        ('social-avatar'),
        ('social-banner'),
        ('social-bio'),
        ('social-links-2'),
        ('social-frame'),
        ('studio-doc'),
        ('studio-drawing'),
        ('studio-insert'),
        ('studio-export'),
        ('studio-words-500'),
        ('studio-docs-5'),
        ('studio-drawings-5'),
        ('studio-exports-10'),
        ('secret-night-owl'),
        ('secret-early-bird'),
        ('secret-subjects-all'),
        ('secret-notes-100'),
        ('secret-bookmarks-50'),
        ('secret-mastered-50'),
        ('secret-one-subject-10'),
        ('secret-collector-40'),
        ('secret-collector-60'),
        ('secret-completionist'),
        ('admin-chosen'),
        ('admin-legend'),
        ('dev-exclusive-aurora'),
        ('dev-exclusive-void'),
        ('founder')
  ) as b(badge_id)
on conflict (student_id, badge_id) do update
   set manual_granted = true,
       kind = 'admin',
       awarded_at = case
           when public.student_badges.manual_granted then public.student_badges.awarded_at
           else now()
       end,
       awarded_by = coalesce(public.student_badges.awarded_by, 'founder-seed'),
       reason = case
           when public.student_badges.manual_granted then public.student_badges.reason
           else 'Founder: cấp toàn bộ badge và khung'
       end;

-- 5. Danh vị Founder ---------------------------------------------------------
insert into public.student_roles (student_id, role_key, role_label)
select id, 'founder', 'Người sáng lập · Kẻ chủ mưu'
  from public.students
 where is_founder = true
on conflict (student_id) do update
   set role_key = 'founder',
       role_label = 'Người sáng lập · Kẻ chủ mưu',
       updated_at = now(),
       updated_by = 'founder-seed';

-- 6. Kiểm tra nhanh sau migration -------------------------------------------
-- select s.display_name, s.is_founder,
--        count(sb.badge_id) as badges,
--        cardinality(public.bakhi_owned_frames(s.id)) as frames
--   from public.students s
--   left join public.student_badges sb on sb.student_id = s.id
--  where s.is_founder
--  group by s.id, s.display_name, s.is_founder;

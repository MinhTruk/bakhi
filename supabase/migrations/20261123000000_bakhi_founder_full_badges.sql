-- ============================================================================
-- Bá Khí 6.0.1 — bảo đảm hồ sơ Hứa Viết Minh Trúc nhận đủ 78 badge + 30 khung.
--
-- Migration 6.0.0 chỉ đặt is_founder khi họ tên khớp tuyệt đối. Bản này bổ
-- sung đối chiếu mềm (một hồ sơ duy nhất chứa "Minh Trúc"), rồi cấp lại toàn
-- bộ badge theo cách idempotent. Không xoá dữ liệu, không đổi badge tự động.
-- ============================================================================

-- 1. Xác định Founder theo họ tên đầy đủ hoặc tên ngắn, chỉ khi duy nhất -----
do $$
declare
    v_count integer;
    v_id uuid;
begin
    update public.students
       set is_founder = true
     where lower(btrim(display_name)) = lower(btrim('Hứa Viết Minh Trúc'));

    update public.students
       set is_founder = true
     where lower(btrim(display_name)) = lower(btrim('Minh Trúc'));

    -- Trường hợp họ tên có hậu tố/ghi chú: chỉ nhận khi đúng một hồ sơ khớp.
    select count(*) into v_count
      from public.students
     where lower(display_name) like '%minh trúc%';
    if v_count = 1 then
        select id into v_id
          from public.students
         where lower(display_name) like '%minh trúc%'
         limit 1;
        update public.students set is_founder = true where id = v_id;
    end if;
end $$;

-- 2. Cấp lại TOÀN BỘ 78 badge cho mọi hồ sơ Founder -------------------------
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

-- 3. Danh vị Founder ---------------------------------------------------------
insert into public.student_roles (student_id, role_key, role_label)
select id, 'founder', 'Người sáng lập · Kẻ chủ mưu'
  from public.students
 where is_founder = true
on conflict (student_id) do update
   set role_key = 'founder',
       role_label = 'Người sáng lập · Kẻ chủ mưu',
       updated_at = now(),
       updated_by = 'founder-seed';

-- 4. Kiểm tra nhanh ----------------------------------------------------------
-- select s.display_name, s.is_founder,
--        count(sb.badge_id) as badges,
--        cardinality(public.bakhi_owned_frames(s.id)) as frames
--   from public.students s
--   left join public.student_badges sb on sb.student_id = s.id
--  where s.is_founder
--  group by s.id, s.display_name, s.is_founder;

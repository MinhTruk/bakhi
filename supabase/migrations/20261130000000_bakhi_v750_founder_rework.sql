-- ============================================================================
-- Bá Khí 7.5.0 — Rework Founder Dashboard, quyền sở hữu vật phẩm và audit.
--
-- Nguyên tắc an toàn:
--   * Chỉ thêm bảng/cột/hàm; không xoá dữ liệu và không đổi tên cột cũ.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--   * Trình duyệt không ghi trực tiếp: mọi thao tác đi qua Edge Function
--     service_role, các bảng audit không cấp quyền cho anon/authenticated.
--   * Ánh xạ badge → khung chuyển từ CASE viết cứng sang bảng dữ liệu, để
--     thêm badge/khung mới không phải sửa hàm SQL.
--
-- Sau khi chạy migration: deploy lại Edge Functions `admin-actions` và
-- `student-profile`, sau đó mở Founder Dashboard.
-- ============================================================================

-- 1. Lịch sử cấp vật phẩm: thêm request_id + badge_id, chống trùng ------------
alter table public.admin_grant_history
    add column if not exists request_id text,
    add column if not exists badge_id text;

comment on column public.admin_grant_history.request_id is
    'Mã yêu cầu do dashboard sinh ra. Cùng request_id + người nhận + vật phẩm chỉ ghi một dòng khi chạy lại.';
comment on column public.admin_grant_history.badge_id is
    'Badge thực sự được ghi vào student_badges (với item_type=frame là badge mở khoá khung).';

create unique index if not exists admin_grant_history_request_unique
    on public.admin_grant_history (request_id, target_student, item_id);

create index if not exists admin_grant_history_created_idx
    on public.admin_grant_history (created_at desc);

-- 1b. Bảo mật: 7.4.0 cấp SELECT cho anon/authenticated nên bất kỳ ai cũng đọc
--     được lịch sử cấp vật phẩm. Đóng lại; Edge Function dùng service_role.
drop policy if exists admin_grant_history_select_all on public.admin_grant_history;
revoke select on public.admin_grant_history from anon, authenticated;
revoke insert, update, delete on public.admin_grant_history from anon, authenticated;
revoke all on public.admin_grant_history from public;
grant all on public.admin_grant_history to service_role;

-- 2. Lô cấp vật phẩm (báo cáo thao tác hàng loạt) ----------------------------
create table if not exists public.admin_grant_batches (
    request_id      text primary key check (char_length(request_id) between 8 and 64),
    actor_scope     text not null check (actor_scope in ('admin', 'founder')),
    actor_id        uuid references public.admin_sessions(id) on delete set null,
    target_student  uuid not null references public.students(id) on delete cascade,
    item_type       text not null check (item_type in ('badge', 'frame')),
    requested       integer not null default 0 check (requested >= 0),
    added           integer not null default 0 check (added >= 0),
    already_owned   integer not null default 0 check (already_owned >= 0),
    failed          integer not null default 0 check (failed >= 0),
    created_at      timestamptz not null default now()
);

comment on table public.admin_grant_batches is
    'Một dòng cho mỗi yêu cầu cấp vật phẩm (đơn lẻ hoặc hàng loạt) để đối soát số lượng đã cấp.';

alter table public.admin_grant_batches enable row level security;
revoke all on public.admin_grant_batches from public, anon, authenticated;
grant all on public.admin_grant_batches to service_role;

create index if not exists admin_grant_batches_created_idx
    on public.admin_grant_batches (created_at desc);

-- 3. Ánh xạ badge → khung avatar (một nguồn dữ liệu, không còn CASE cứng) ----
create table if not exists public.bakhi_badge_frames (
    badge_id text primary key check (char_length(badge_id) between 1 and 64),
    frame_id text not null check (char_length(frame_id) between 1 and 64)
);

comment on table public.bakhi_badge_frames is
    'Badge nào mở khoá khung avatar nào. Đồng bộ với trường `frame` trong assets/bakhi/bk-badges.js.';

alter table public.bakhi_badge_frames enable row level security;
revoke all on public.bakhi_badge_frames from public, anon, authenticated;
grant select on public.bakhi_badge_frames to authenticated, service_role;

insert into public.bakhi_badge_frames (badge_id, frame_id) values
        ('learn-first-lesson', 'leaf'),
        ('learn-lessons-15', 'celestial'),
        ('learn-lessons-30', 'wreath'),
        ('learn-subjects-5', 'divine'),
        ('learn-practice-500', 'royal'),
        ('learn-correct-100', 'infernal'),
        ('learn-mastered-10', 'legendary'),
        ('explore-pages-50', 'sakura'),
        ('explore-palette', 'ancient'),
        ('consist-days-14', 'eternal'),
        ('consist-days-30', 'sunflower'),
        ('consist-streak-30', 'crown'),
        ('music-200', 'ear-cat'),
        ('music-shuffle', 'neon'),
        ('music-same-20', 'ear-fox'),
        ('inter-meteor-1000', 'star'),
        ('inter-meteor-10000', 'horn-dragon'),
        ('inter-focus', 'cyber'),
        ('social-avatar', 'leaf'),
        ('social-frame', 'ear-bunny'),
        ('studio-export', 'phoenix'),
        ('studio-words-500', 'crystal'),
        ('studio-exports-10', 'antler'),
        ('secret-night-owl', 'star'),
        ('secret-early-bird', 'frost'),
        ('secret-subjects-all', 'sakura'),
        ('secret-notes-100', 'wreath'),
        ('secret-bookmarks-50', 'gothic'),
        ('secret-mastered-50', 'ear-wolf'),
        ('secret-one-subject-10', 'galactic'),
        ('secret-collector-40', 'sunflower'),
        ('secret-collector-60', 'horn-dragon'),
        ('secret-completionist', 'crown'),
        ('admin-chosen', 'star'),
        ('admin-legend', 'crown'),
        ('dev-exclusive-aurora', 'dev-aurora'),
        ('dev-exclusive-void', 'dev-void'),
        ('founder', 'founder'),
        ('founder-yin-yang', 'founder-yin-yang'),
        ('founder-cyberpunk', 'founder-cyberpunk'),
        ('founder-ancient', 'founder-ancient'),
        ('founder-samurai', 'founder-samurai'),
        ('founder-void-emperor', 'founder-void-emperor'),
        ('founder-celestial-dragon', 'founder-celestial-dragon'),
        ('founder-golden-ratio', 'founder-golden-ratio'),
        ('founder-ember-core', 'founder-ember-core'),
        ('founder-crystal-mind', 'founder-crystal-mind'),
        ('founder-neon-lotus', 'founder-neon-lotus'),
        ('founder-architect', 'founder-frost-emperor'),
        ('founder-eternal-flame', 'founder-phoenix-rebirth'),
        ('founder-celestial', 'founder-astral-observatory'),
        ('founder-chronos', 'founder-chrono-mechanical'),
        ('founder-void-sentinel', 'founder-abyssal'),
        ('founder-ascendant', 'founder-crystal-sovereign')
on conflict (badge_id) do update set frame_id = excluded.frame_id;

-- 4. bakhi_owned_frames: đọc từ bảng ánh xạ ----------------------------------
create or replace function public.bakhi_owned_frames(p_student uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
    select array(
        select distinct f.frame_id
        from (
            select unnest(array['none', 'leaf']) as frame_id
            union all
            select m.frame_id
            from public.student_badges sb
            join public.bakhi_badge_frames m on m.badge_id = sb.badge_id
            where sb.student_id = p_student
              and (sb.auto_earned or sb.manual_granted)
        ) f
    );
$$;

comment on function public.bakhi_owned_frames(uuid) is
    'Khung avatar học sinh được dùng: 2 khung cơ bản + khung của badge tự động hoặc được Founder/Administrator trao.';

revoke execute on function public.bakhi_owned_frames(uuid) from public;
grant execute on function public.bakhi_owned_frames(uuid) to authenticated, service_role;

-- 5. Cấp badge nguyên tử (một câu lệnh, không ghi đè quyền sở hữu cũ) --------
create or replace function public.bakhi_grant_badges(
    p_student uuid,
    p_badges text[],
    p_reason text,
    p_actor text
)
returns table (badge_id text, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_active boolean;
begin
    select s.is_active into v_active from public.students s where s.id = p_student;
    if v_active is null then
        raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not v_active then
        raise exception 'STUDENT_INACTIVE' using errcode = 'P0001';
    end if;
    if p_badges is null or array_length(p_badges, 1) is null then
        return;
    end if;

    return query
    with input as (
        select distinct btrim(b) as b
        from unnest(p_badges) as b
        where b is not null
          and btrim(b) <> ''
          and char_length(btrim(b)) <= 64
    ),
    ins as (
        insert into public.student_badges
            (student_id, badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason)
        select p_student, i.b, 'admin', false, true, now(),
               left(coalesce(p_actor, 'founder-console'), 60),
               left(coalesce(p_reason, ''), 200)
        from input i
        on conflict (student_id, badge_id) do nothing
        returning student_badges.badge_id
    )
    select i.b, (i.b in (select ins.badge_id from ins)) as inserted
    from input i
    order by i.b;
end;
$$;

comment on function public.bakhi_grant_badges(uuid, text[], text, text) is
    'Cấp một lô badge trong một câu lệnh. on conflict do nothing nên không ghi đè awarded_at/awarded_by/reason của bản ghi đã có; trả về badge nào thực sự được thêm.';

revoke execute on function public.bakhi_grant_badges(uuid, text[], text, text) from public;
revoke execute on function public.bakhi_grant_badges(uuid, text[], text, text) from anon, authenticated;
grant execute on function public.bakhi_grant_badges(uuid, text[], text, text) to service_role;

-- 6. Chỉ mục phục vụ tìm kiếm người nhận -------------------------------------
create index if not exists students_active_normalized_idx
    on public.students (is_active, normalized_name);
create index if not exists student_badges_badge_idx
    on public.student_badges (badge_id);

-- 7. Đảm bảo cờ Founder (không hardcode UUID, chỉ khi khớp duy nhất) ----------
do $$
declare
    v_count integer;
    v_id uuid;
    v_name text;
begin
    foreach v_name in array array['Hứa Viết Minh Trúc', 'Minh Trúc'] loop
        select count(*) into v_count
          from public.students
         where lower(btrim(display_name)) = lower(btrim(v_name));

        if v_count = 1 then
            select id into v_id
              from public.students
             where lower(btrim(display_name)) = lower(btrim(v_name))
             limit 1;
            update public.students set is_founder = true where id = v_id;
        end if;
    end loop;
end $$;

-- 8. Cấp toàn bộ danh mục cho hồ sơ Founder (idempotent, không tạo trùng) ----
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
        ('ke-suu-tam'),
        ('admin-chosen'),
        ('admin-legend'),
        ('dev-exclusive-aurora'),
        ('dev-exclusive-void'),
        ('founder'),
        ('founder-yin-yang'),
        ('founder-cyberpunk'),
        ('founder-ancient'),
        ('founder-samurai'),
        ('founder-void-emperor'),
        ('founder-celestial-dragon'),
        ('founder-golden-ratio'),
        ('founder-ember-core'),
        ('founder-crystal-mind'),
        ('founder-neon-lotus'),
        ('founder-genesis'),
        ('founder-architect'),
        ('founder-eternal-flame'),
        ('founder-nexus'),
        ('founder-celestial'),
        ('founder-chronos'),
        ('founder-void-sentinel'),
        ('founder-prime-code'),
        ('founder-legacy'),
        ('founder-ascendant')
  ) as b(badge_id)
on conflict (student_id, badge_id) do nothing;

-- 9. Trang bị khung Founder nếu hồ sơ chưa chọn khung ------------------------
update public.student_profiles p
   set frame = 'founder'
 where p.frame = 'none'
   and p.student_id in (select id from public.students where is_founder = true)
   and 'founder' = any (public.bakhi_owned_frames(p.student_id));

-- Kết thúc migration 7.5.0

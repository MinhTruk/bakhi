-- ============================================================================
-- Bá Khí 7.4.0 — Founder Dashboard: trao badge, khung avatar, lịch sử cấp.
--
-- Nguyên tắc an toàn:
--   * Chỉ thêm bảng/cột, không xoá dữ liệu cũ.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--   * Mọi ghi dữ liệu đều qua Edge Function service_role, không cấp quyền trực
--     tiếp cho trình duyệt.
-- ============================================================================

-- 1. Bảng lịch sử cấp vật phẩm (founder/admin trao tay) -----------------------
create table if not exists public.admin_grant_history (
    id              uuid primary key default gen_random_uuid(),
    actor_id        uuid references public.admin_sessions(id) on delete set null,
    actor_scope     text not null check (actor_scope in ('admin', 'founder')),
    target_student  uuid references public.students(id) on delete cascade,
    item_type       text not null check (item_type in ('badge', 'frame')),
    item_id         text not null check (char_length(item_id) <= 64),
    item_name       text not null,
    reason          text,
    created_at      timestamptz not null default now()
);

comment on table public.admin_grant_history is
    'Lịch sử mọi thao tác cấp badge/khung avatar từ Founder/Administrator Dashboard. Dùng để kiểm tra và chống cấp trùng.';

alter table public.admin_grant_history enable row level security;

drop policy if exists admin_grant_history_select_all on public.admin_grant_history;
create policy admin_grant_history_select_all on public.admin_grant_history
    for select to anon, authenticated using (true);

-- Trình duyệt không ghi trực tiếp; chỉ Edge Function service_role ghi.
revoke insert, update, delete on public.admin_grant_history from anon, authenticated;
revoke all on public.admin_grant_history from public;
grant select on public.admin_grant_history to anon, authenticated;

create index if not exists admin_grant_history_target_idx
    on public.admin_grant_history (target_student, created_at);
create index if not exists admin_grant_history_item_idx
    on public.admin_grant_history (item_type, item_id);

-- 2. Cập nhật danh mục badge trong migration: thêm ke-suu-tam + 10 founder-*
--    (giúp các môi trường mới khởi tạo đã có dữ liệu đúng; môi trường cũ chạy
--    lại migration này không ảnh hưởng do on conflict do nothing).
--    Các badge này đã được seed trong founder_6 / founder_full_badges, bản v7.4.0
--    bổ sung để đảm bảo tính toàn vẹn khi triển khai lần đầu.
do $$
begin
    -- Không có bảng catalog cố định trong DB, dữ liệu badge nguồn sự thật ở
    -- assets/bakhi/bk-badges.js và badge-catalog.ts. Migration này chỉ ghi nhận
    -- cấu trúc hỗ trợ grant history; danh mục badge vẫn do Edge Function đọc
    -- từ file tĩnh kèm theo.
    null;
end $$;

-- 3. Đảm bảo cờ Founder cho hồ sơ Hứa Viết Minh Trúc (tương thích backward) --
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

-- 4. Cập nhật hàm bakhi_owned_frames: giữ nguyên 39 ánh xạ badge→frame cũ,
--    thêm các frame founder mới nếu chưa có (idempotent qua create or replace).
--    Các frame 'none' và 'leaf' luôn có sẵn.
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
                    when 'founder-yin-yang' then 'founder-yin-yang'
                    when 'founder-cyberpunk' then 'founder-cyberpunk'
                    when 'founder-ancient' then 'founder-ancient'
                    when 'founder-samurai' then 'founder-samurai'
                    when 'founder-void-emperor' then 'founder-void-emperor'
                    when 'founder-celestial-dragon' then 'founder-celestial-dragon'
                    when 'founder-golden-ratio' then 'founder-golden-ratio'
                    when 'founder-ember-core' then 'founder-ember-core'
                    when 'founder-crystal-mind' then 'founder-crystal-mind'
                    when 'founder-neon-lotus' then 'founder-neon-lotus'
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
    'Khung avatar học sinh được dùng: 2 khung cơ bản + khung của badge tự động hoặc được Administrator/Founder trao.';

revoke execute on function public.bakhi_owned_frames(uuid) from public;
grant execute on function public.bakhi_owned_frames(uuid) to authenticated, service_role;

-- 5. Khung avatar mặc định: đảm bảo student_profiles có cột frame --------------
alter table public.student_profiles add column if not exists frame text not null default 'none';
comment on column public.student_profiles.frame is
    'Mã khung avatar hiện đang装备. Chỉ Edge Function service_role hoặc Founder Dashboard được ghi.';

-- Kết thúc migration v7.4.0

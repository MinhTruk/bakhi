-- ============================================================================
-- Bá Khí v8.3.5 — Avatar & khung avatar: MỘT nguồn sự thật
--
-- Vấn đề (audit 8.3.5):
--   Khung avatar được lưu ở HAI nơi:
--     1. public.student_profiles.frame  → navbar, hồ sơ, chat, admin dùng.
--     2. public.user_inventory.is_equipped (kind='frame') → Gamification dùng.
--   Trang bị trong Gamification chỉ đổi (2) nên toàn website không đổi; còn
--   khung thưởng của Gamification (frame-laurel, frame-ember…) lại không nằm
--   trong danh sách khung hồ sơ (bakhi_owned_frames chỉ đọc student_badges).
--
-- Cách sửa (không tạo bảng mới, không xoá dữ liệu):
--   · student_profiles.frame là nguồn CHÍNH THỨC cho khung đang trang bị.
--   · reward_catalog.metadata.profile_frame ánh xạ vật phẩm khung → khung hồ sơ.
--   · bakhi_owned_frames bổ sung khung đã nhận từ kho vật phẩm Gamification,
--     nên picker hồ sơ và trigger bảo vệ chấp nhận đúng các khung đó.
--   · bk_gam_equip ghi luôn student_profiles.frame trong CÙNG transaction.
--
-- An toàn:
--   · Idempotent (chạy lại nhiều lần không đổi kết quả, không nhân bản).
--   · Không xoá avatar, khung, tồn kho hay thành tích nào.
--   · Boss slug chỉ NỚI thêm dấu gạch dưới; dữ liệu cũ hợp lệ giữ nguyên.
--
-- Rollback (thủ công, chỉ khi thật sự cần):
--   -- Khôi phục bk_gam_equip 8.3.0 (không đồng bộ student_profiles.frame)
--   -- Khôi phục bakhi_owned_frames 7.7.0 (chỉ đọc student_badges)
--   alter table public.boss_challenges drop constraint if exists boss_challenges_slug_check;
--   alter table public.boss_challenges add constraint boss_challenges_slug_check
--       check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$');
--   -- metadata.profile_frame có thể để nguyên (không ảnh hưởng dữ liệu cũ).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Ánh xạ vật phẩm khung → khung hồ sơ
--    Chỉ điền khi chưa có để không ghi đè lựa chọn của quản trị viên.
-- ---------------------------------------------------------------------------
update public.reward_catalog
   set metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('profile_frame', 'wreath')
 where kind = 'frame'
   and id = 'frame-laurel'
   and coalesce(metadata ->> 'profile_frame', '') = '';

update public.reward_catalog
   set metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('profile_frame', 'infernal')
 where kind = 'frame'
   and id = 'frame-ember'
   and coalesce(metadata ->> 'profile_frame', '') = '';

/* Vật phẩm khung có id trùng khung hồ sơ (leaf, crown, sakura…) thì dùng
   chính id làm khung hiển thị — không cần cấu hình thêm. */
update public.reward_catalog
   set metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('profile_frame', id)
 where kind = 'frame'
   and id in (
       'none', 'leaf', 'sakura', 'sunflower', 'wreath', 'ear-cat', 'ear-fox',
       'ear-bunny', 'ear-wolf', 'antler', 'horn-dragon', 'crown', 'star',
       'royal', 'celestial', 'cyber', 'gothic', 'crystal', 'infernal', 'divine',
       'galactic', 'ancient', 'legendary', 'neon', 'eternal', 'frost', 'phoenix'
   )
   and coalesce(metadata ->> 'profile_frame', '') = '';

-- ---------------------------------------------------------------------------
-- 2. Mã Boss cho phép dấu gạch dưới (ma_vuong) — yêu cầu v8.3.5
-- ---------------------------------------------------------------------------
alter table public.boss_challenges
    drop constraint if exists boss_challenges_slug_check;
alter table public.boss_challenges
    add constraint boss_challenges_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9_-]{2,63}$');

comment on constraint boss_challenges_slug_check on public.boss_challenges is
    'Mã Boss: chữ thường, số, dấu gạch dưới hoặc gạch nối; tự tạo từ tên Boss ở Founder/Admin Dashboard.';

-- ---------------------------------------------------------------------------
-- 3. Khung sở hữu = khung badge cũ + khung nhận qua kho vật phẩm Gamification
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
            union all
            /* 8.3.5: khung nhận qua Reward Engine của Gamification. */
            select nullif(rc.metadata ->> 'profile_frame', '') as frame
            from public.user_inventory ui
            join public.reward_catalog rc on rc.id = ui.item_id
            where ui.student_id = p_student and rc.kind = 'frame'
        ) x
        where frame is not null and frame <> ''
        order by frame
    );
$$;

comment on function public.bakhi_owned_frames(uuid) is
    'Khung avatar học sinh được dùng: 2 khung cơ bản + khung thưởng của badge đã xác minh + khung nhận qua kho vật phẩm Gamification (8.3.5).';

-- ---------------------------------------------------------------------------
-- 4. bk_gam_equip: trang bị khung cập nhật LUÔN hồ sơ trong cùng transaction
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_equip(p_student uuid, p_item text, p_equip boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_kind text;
    v_frame text;
    v_profile_frame text;
begin
    if not exists (select 1 from public.user_inventory
                   where student_id = p_student and item_id = p_item) then
        return jsonb_build_object('ok', false, 'code', 'NOT_OWNED');
    end if;

    select kind,
           coalesce(nullif(metadata ->> 'profile_frame', ''), '')
      into v_kind, v_frame
      from public.reward_catalog
     where id = p_item;

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

    /* 8.3.5 — khung avatar: student_profiles.frame là nguồn sự thật duy nhất
       cho toàn website (navbar, hồ sơ, chat, Gamification). */
    if v_kind = 'frame' then
        if coalesce(p_equip, false) and v_frame <> '' then
            insert into public.student_profiles (student_id, frame)
            values (p_student, v_frame)
            on conflict (student_id) do update set frame = excluded.frame;
        elsif not coalesce(p_equip, false) then
            update public.student_profiles
               set frame = 'none'
             where student_id = p_student
               and (v_frame = '' or frame = v_frame);
        end if;
    end if;

    select frame into v_profile_frame
      from public.student_profiles where student_id = p_student;

    insert into public.gamification_activity_logs (student_id, actor_kind, action, detail)
    values (p_student, 'student', 'item_equip',
            jsonb_build_object('item', p_item, 'equipped', coalesce(p_equip, false),
                               'profile_frame', v_profile_frame));

    return jsonb_build_object('ok', true, 'kind', v_kind, 'frame', v_profile_frame);
end;
$$;

revoke all on function public.bk_gam_equip(uuid, text, boolean) from public, anon, authenticated;

comment on function public.bk_gam_equip(uuid, text, boolean) is
    'Trang bị/bỏ vật phẩm. Với kind=frame, ghi luôn student_profiles.frame để khung đồng bộ toàn website (8.3.5).';

commit;

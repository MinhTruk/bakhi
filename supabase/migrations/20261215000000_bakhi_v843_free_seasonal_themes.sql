-- ============================================================================
-- Bá Khí 8.4.3 — Halloween & Giáng Sinh miễn phí cho toàn bộ học sinh
--
-- Bối cảnh: từ 8.4.0 hai giao diện theo mùa nằm trong reward_catalog và chỉ
-- học sinh được Founder/Admin trao mới dùng được. Nay chúng là giao diện mặc
-- định của mọi hồ sơ học sinh: chọn ngay trong Cài đặt → Hình nền.
--
-- PHẠM VI
--   1. Bảo đảm hai giao diện có trong reward_catalog (idempotent, dự phòng khi
--      8.4.0 chưa được áp dụng).
--   2. Cấp sẵn dòng user_inventory (source = 'seasonal_free') cho MỌI học sinh
--      hiện có.
--   3. Học sinh tạo sau này nhận sẵn khi INSERT vào students (trigger).
--   4. bk_gam_free_themes(): cấp bù khi cần; bk_gam_equip gọi hàm này cho hai
--      giao diện theo mùa nên trang bị không bao giờ trả NOT_OWNED.
--
-- AN TOÀN KHI CHẠY LẠI: chỉ INSERT ... ON CONFLICT DO NOTHING, CREATE OR
-- REPLACE FUNCTION và DROP TRIGGER IF EXISTS. Không xoá dòng, không đổi vật
-- phẩm đang trang bị, không cấp XP, không tạo bảng mới.
--
-- Chạy: supabase db push   (hoặc: supabase migration up)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Danh mục: hai giao diện theo mùa
-- ---------------------------------------------------------------------------
insert into public.reward_catalog (id, kind, name, description, icon, rarity, sort_order)
values
    ('theme-halloween', 'theme', 'Giao diện Halloween',
     'Đêm Halloween: bí ngô khắc mặt phát sáng, dơi bay và tông cam - tím.',
     'fa-ghost', 'epic', 300),
    ('theme-christmas', 'theme', 'Giao diện Giáng Sinh',
     'Mùa đông xanh đỏ: tuyết rơi liên tục và cây thông trang trí.',
     'fa-tree', 'legendary', 310)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Cấp bù cho một hồ sơ (dùng lại ở backfill, trigger và bk_gam_equip)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_free_themes(p_student uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    if p_student is null then
        return 0;
    end if;

    insert into public.user_inventory (student_id, item_id, source, metadata)
    select p_student,
           c.id,
           'seasonal_free',
           jsonb_build_object(
               'granted_by', 'seasonal-free',
               'reason', 'Giao diện theo mùa miễn phí cho toàn bộ học sinh (8.4.3)'
           )
      from public.reward_catalog c
     where c.kind = 'theme'
       and c.id in ('theme-halloween', 'theme-christmas')
    on conflict (student_id, item_id) do nothing;

    get diagnostics v_count = row_count;
    return coalesce(v_count, 0);
end;
$$;

revoke all on function public.bk_gam_free_themes(uuid) from public, anon, authenticated;

comment on function public.bk_gam_free_themes(uuid) is
    'Cấp sẵn giao diện Halloween + Giáng Sinh miễn phí cho một học sinh (8.4.3). Idempotent.';

-- ---------------------------------------------------------------------------
-- 3. Backfill: mọi học sinh hiện có
-- ---------------------------------------------------------------------------
select public.bk_gam_free_themes(s.id)
  from public.students s;

-- ---------------------------------------------------------------------------
-- 4. Học sinh mới: nhận sẵn ngay khi được tạo
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_seed_free_themes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.bk_gam_free_themes(new.id);
    return new;
end;
$$;

revoke all on function public.bk_gam_seed_free_themes() from public, anon, authenticated;

drop trigger if exists students_free_seasonal_themes on public.students;
create trigger students_free_seasonal_themes
    after insert on public.students
    for each row execute function public.bk_gam_seed_free_themes();

-- ---------------------------------------------------------------------------
-- 5. bk_gam_equip: bảo đảm hai giao diện theo mùa luôn sở hữu
--    (giữ nguyên toàn bộ hành vi 8.3.5, kể cả đồng bộ khung avatar)
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
    /* 8.4.3 — học sinh cũ chưa chạy backfill vẫn trang bị được ngay. */
    if p_item in ('theme-halloween', 'theme-christmas') then
        perform public.bk_gam_free_themes(p_student);
    end if;

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

-- ---------------------------------------------------------------------------
-- 6. Kiểm tra nhanh (chạy tay nếu cần)
-- ---------------------------------------------------------------------------
-- select count(*) filter (where c.kind = 'theme') as students_with_both
--   from (
--     select student_id from public.user_inventory
--      where item_id in ('theme-halloween', 'theme-christmas')
--      group by student_id having count(*) = 2
--   ) x;

commit;

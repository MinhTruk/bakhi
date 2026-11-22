-- ============================================================================
-- Bá Khí 8.4.4 — Bốn giao diện theo mùa miễn phí (thêm Tết Nguyên Đán & Trung Thu)
--
-- Bối cảnh: 8.4.3 đã cấp sẵn Halloween + Giáng Sinh cho mọi hồ sơ. Bản 8.4.4
-- thêm hai giao diện văn hoá Việt (Tết, Trung Thu) vào cùng cơ chế: miễn phí,
-- có sẵn trong kho, chọn được ngay trong Cài đặt → Hình nền.
--
-- PHẠM VI
--   1. Bảo đảm bốn giao diện có trong reward_catalog.
--   2. bk_gam_free_themes() cấp cả bốn (source = 'seasonal_free').
--   3. Backfill mọi học sinh hiện có; trigger bk_gam_seed_free_themes (đã tạo ở
--      8.4.3) gọi lại hàm này nên hồ sơ mới cũng có sẵn.
--   4. bk_gam_equip (8.4.3) đã gọi bk_gam_free_themes nên không cần sửa.
--
-- AN TOÀN KHI CHẠY LẠI: chỉ INSERT ... ON CONFLICT DO NOTHING và CREATE OR
-- REPLACE FUNCTION. Không xoá dòng, không đổi vật phẩm đang trang bị, không XP.
--
-- Chạy: supabase db push
-- ============================================================================

begin;

insert into public.reward_catalog (id, kind, name, description, icon, rarity, sort_order)
values
    ('theme-tet', 'theme', 'Giao diện Tết Nguyên Đán',
     'Mai vàng rơi và đèn lồng đỏ — không khí Tết trên khắp trang.',
     'fa-firecracker', 'epic', 320),
    ('theme-midautumn', 'theme', 'Giao diện Trung Thu',
     'Trăng rằm, đèn ông sao và ánh sao vàng lung linh.',
     'fa-moon', 'epic', 330)
on conflict (id) do nothing;

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
               'reason', 'Giao diện theo mùa miễn phí cho toàn bộ học sinh (8.4.4)'
           )
      from public.reward_catalog c
     where c.kind = 'theme'
       and c.id in ('theme-halloween', 'theme-christmas', 'theme-tet', 'theme-midautumn')
    on conflict (student_id, item_id) do nothing;

    get diagnostics v_count = row_count;
    return coalesce(v_count, 0);
end;
$$;

revoke all on function public.bk_gam_free_themes(uuid) from public, anon, authenticated;

comment on function public.bk_gam_free_themes(uuid) is
    'Cấp sẵn bốn giao diện theo mùa miễn phí (Halloween, Giáng Sinh, Tết, Trung Thu). Idempotent.';

-- Backfill: học sinh hiện có nhận hai giao diện mới ngay.
select public.bk_gam_free_themes(s.id) from public.students s;

commit;

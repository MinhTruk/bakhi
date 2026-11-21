-- ============================================================================
-- Bá Khí 8.4.1 — Hồ sơ Founder mặc định sở hữu đầy đủ vật phẩm (full item)
--
-- Bối cảnh: từ 8.4.1 Founder Dashboard có thẻ "Give Themes" để trao giao diện
-- cho bất kỳ học sinh nào. Hồ sơ Founder (Hứa Viết Minh Trúc) mặc định phải có
-- sẵn toàn bộ vật phẩm — giao diện, khung, danh hiệu, trang trí — kể cả vật
-- phẩm thêm sau này, để không phải trao tay cho chính mình.
--
-- AN TOÀN KHI CHẠY LẠI: chỉ INSERT, on conflict do nothing. Không xoá dòng nào,
-- không đổi vật phẩm đang trang bị, không cấp XP, không tạo bảng mới.
-- ============================================================================

begin;

-- 1. Bảo đảm cờ Founder cho hồ sơ chính thức (idempotent, không đụng hồ sơ khác)
update public.students
   set is_founder = true
 where lower(btrim(display_name)) in (lower(btrim('Hứa Viết Minh Trúc')),
                                      lower(btrim('Minh Trúc')));

-- 2. Cấp toàn bộ vật phẩm đang bật trong kho cho mọi hồ sơ Founder
insert into public.user_inventory (student_id, item_id, source, metadata)
select s.id,
       c.id,
       'founder',
       jsonb_build_object(
           'granted_by', 'founder-seed',
           'reason', 'Founder: toàn bộ vật phẩm từ 8.4.1'
       )
  from public.students s
  join public.reward_catalog c on c.is_active = true
 where s.is_founder = true
on conflict (student_id, item_id) do nothing;

-- 3. Kiểm tra nhanh (chạy tay nếu cần)
-- select s.display_name,
--        count(ui.item_id) as items,
--        count(ui.item_id) filter (where c.kind = 'theme') as themes
--   from public.students s
--   left join public.user_inventory ui on ui.student_id = s.id
--   left join public.reward_catalog c on c.id = ui.item_id
--  where s.is_founder
--  group by s.id, s.display_name;

commit;

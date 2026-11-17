-- ============================================================================
-- Bá Khí 7.3.0 — cập nhật danh vị học sinh theo yêu cầu Người sáng lập
-- Hoàn tác: các dòng insert/update này dùng on conflict do update, có thể chạy
-- lại nhiều lần mà không sao.
-- ============================================================================

-- Hứa Viết Minh Trúc: chỉ còn vai trò Người sáng lập
insert into public.student_roles (student_id, role_key, role_label)
select id, 'founder', 'Người sáng lập'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Hứa Viết Minh Trúc'))
on conflict (student_id) do update
   set role_key = 'founder',
       role_label = 'Người sáng lập',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Trần Văn Bách: Lớp Phó
insert into public.student_roles (student_id, role_key, role_label)
select id, 'class-vice', 'Lớp Phó'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Trần Văn Bách'))
on conflict (student_id) do update
   set role_key = 'class-vice',
       role_label = 'Lớp Phó',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Võ Mai Phương: Lớp Phó
insert into public.student_roles (student_id, role_key, role_label)
select id, 'class-vice', 'Lớp Phó'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Võ Mai Phương'))
on conflict (student_id) do update
   set role_key = 'class-vice',
       role_label = 'Lớp Phó',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Trương Lê Bảo Hân: Lớp Phó
insert into public.student_roles (student_id, role_key, role_label)
select id, 'class-vice', 'Lớp Phó'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Trương Lê Bảo Hân'))
on conflict (student_id) do update
   set role_key = 'class-vice',
       role_label = 'Lớp Phó',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Phấn: Tổ Trưởng
insert into public.student_roles (student_id, role_key, role_label)
select id, 'group-leader', 'Tổ Trưởng'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Phấn'))
on conflict (student_id) do update
   set role_key = 'group-leader',
       role_label = 'Tổ Trưởng',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Trâm: Tổ Trưởng
insert into public.student_roles (student_id, role_key, role_label)
select id, 'group-leader', 'Tổ Trưởng'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Trâm'))
on conflict (student_id) do update
   set role_key = 'group-leader',
       role_label = 'Tổ Trưởng',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Trần Lê Gia Huy: Tổ Trưởng
insert into public.student_roles (student_id, role_key, role_label)
select id, 'group-leader', 'Tổ Trưởng'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Trần Lê Gia Huy'))
on conflict (student_id) do update
   set role_key = 'group-leader',
       role_label = 'Tổ Trưởng',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- Khoa: Tổ Trưởng
insert into public.student_roles (student_id, role_key, role_label)
select id, 'group-leader', 'Tổ Trưởng'
  from public.students
 where lower(btrim(display_name)) = lower(btrim('Khoa'))
on conflict (student_id) do update
   set role_key = 'group-leader',
       role_label = 'Tổ Trưởng',
       updated_at = now(),
       updated_by = 'role-update-seed';

-- ============================================================================
-- Bá Khí — Gia cố bảo mật sau audit schema + RLS (15/11/2026).
--
-- Bối cảnh: Supabase đặt default privileges cho schema `public` nên mọi hàm
-- mới đều tự động có EXECUTE cho `anon`, `authenticated`, `service_role`.
-- Migration gốc chỉ `revoke ... from public` nên lệnh đó KHÔNG thu hồi được
-- quyền đã cấp trực tiếp cho `anon`/`authenticated`.
--
-- Migration này:
--   1. Khoá search_path cho hàm trigger.
--   2. Thu hồi EXECUTE của `anon`/`authenticated` trên các hàm chỉ dùng phía
--      server (bakhi_rate_limit, bakhi_current_student_id).
--   3. Bỏ quyền ghi trực tiếp vào student_progress — chỉ Edge Function
--      (service_role) được ghi, để mọi lượt ghi đi qua giới hạn 1,5 MB và
--      quy tắc "chỉ ghi khi mốc thời gian mới hơn".
--   4. Thêm index cho khoá ngoại announcement_reads(announcement_id).
--   5. Sửa RLS initplan cho policy của student_devices.
--
-- Không xoá bảng, không xoá dữ liệu, không đổi tên cột. Chạy lại nhiều lần
-- vẫn an toàn (idempotent).
--
-- Hoàn tác (nếu thật sự cần):
--   grant execute on function public.bakhi_rate_limit(text, integer, integer)
--       to anon, authenticated;
--   grant execute on function public.bakhi_current_student_id() to anon;
--   grant insert, update on public.student_progress to authenticated;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Hàm trigger: cố định search_path (Supabase lint: function_search_path_mutable)
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Hàm SECURITY DEFINER: chỉ cấp cho đúng vai trò cần dùng
-- ---------------------------------------------------------------------------

-- bakhi_rate_limit: chỉ Edge Function (service_role) gọi.
revoke all on function public.bakhi_rate_limit(text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.bakhi_rate_limit(text, integer, integer)
    to service_role;

-- bakhi_current_student_id: cần cho RLS của người dùng đã đăng nhập;
-- `anon` không có bảng nào nên không cần quyền này.
revoke all on function public.bakhi_current_student_id()
    from public, anon;
grant execute on function public.bakhi_current_student_id()
    to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. student_progress: chặn ghi trực tiếp từ trình duyệt
--    (RLS chỉ giới hạn theo hàng; không giới hạn kích thước payload.)
--    Trình duyệt chỉ đọc qua Edge Function nên vẫn giữ SELECT cho tương lai.
-- ---------------------------------------------------------------------------
revoke insert, update on public.student_progress from authenticated;
grant select on public.student_progress to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Index cho khoá ngoại bị thiếu (Supabase lint: unindexed_foreign_keys)
-- ---------------------------------------------------------------------------
create index if not exists announcement_reads_announcement_idx
    on public.announcement_reads (announcement_id);

-- ---------------------------------------------------------------------------
-- 5. RLS initplan: bọc auth.uid() trong subquery để Postgres tính một lần
--    cho cả câu lệnh thay vì mỗi hàng.
-- ---------------------------------------------------------------------------
drop policy if exists student_devices_select_own on public.student_devices;
create policy student_devices_select_own on public.student_devices
    for select to authenticated
    using (auth_user_id = (select auth.uid()));

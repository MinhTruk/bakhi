-- ============================================================================
-- Bá Khí 8.1.1 — Thu hồi quyền ghi trực tiếp trên bốn bảng của Report Issue.
--
-- Migration 8.0.0 chỉ tạo policy SELECT cho học sinh, nên RLS đã chặn ghi.
-- Nhưng GRANT mặc định của Supabase vẫn để `anon` và `authenticated` giữ
-- INSERT/UPDATE/DELETE trên cả bốn bảng. Nếu sau này một policy được thêm
-- nhầm, trình duyệt sẽ ghi được ngay. Bản này thu hồi quyền ghi ở tầng GRANT
-- để phòng thủ nhiều lớp — mọi thao tác ghi vẫn đi qua Edge Function
-- `report-api` / `admin-actions` bằng service_role (không bị ảnh hưởng).
--
-- Idempotent, không xoá dữ liệu, không đổi schema, không đổi policy.
-- ============================================================================

revoke insert, update, delete on public.reports from anon, authenticated;
revoke insert, update, delete on public.report_messages from anon, authenticated;
revoke insert, update, delete on public.report_notifications from anon, authenticated;
revoke insert, update, delete on public.report_activity_logs from anon, authenticated;

-- `report_activity_logs` không có policy SELECT: nhật ký xử lý chỉ đọc qua
-- service_role (dashboard quản trị), nên không cấp quyền đọc cho client.
revoke select on public.report_activity_logs from anon, authenticated;

-- Giữ nguyên quyền đọc của học sinh để các policy SELECT sẵn có tiếp tục chạy
-- qua RLS. `anon` không có policy nào trên ba bảng này nên không cần quyền.
grant select on public.reports to authenticated;
grant select on public.report_messages to authenticated;
grant select on public.report_notifications to authenticated;

-- Trigger touch không phụ thuộc search_path của người gọi.
alter function public.bakhi_v800_touch() set search_path = public;

-- Rollback (chạy tay khi cần):
--   grant insert, update, delete on public.reports to anon, authenticated;
--   grant insert, update, delete on public.report_messages to anon, authenticated;
--   grant insert, update, delete on public.report_notifications to anon, authenticated;
--   grant insert, update, delete on public.report_activity_logs to anon, authenticated;
--   grant select on public.report_activity_logs to anon, authenticated;
--   alter function public.bakhi_v800_touch() reset search_path;

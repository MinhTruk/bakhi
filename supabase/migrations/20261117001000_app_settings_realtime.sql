-- ============================================================================
-- Bá Khí — đưa app_settings vào realtime publication.
--
-- Feature flag public.whatsnew / public.maintenance được đọc bởi mọi trang.
-- Khi Administrator Dashboard đổi giá trị, trình duyệt học sinh cần nhận
-- thay đổi ngay mà không tải lại trang. Bảng app_settings đã có RLS chỉ cho
-- authenticated đọc khoá public.*; migration này chỉ bổ sung publication,
-- không thay đổi quyền hay dữ liệu.
--
-- Idempotent: kiểm tra pg_publication_tables trước khi thêm.
-- ============================================================================

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1
             from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'app_settings'
       )
    then
        execute 'alter publication supabase_realtime add table public.app_settings';
    end if;
end $$;

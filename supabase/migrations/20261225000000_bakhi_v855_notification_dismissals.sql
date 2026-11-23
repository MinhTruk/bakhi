-- =========================================================================
-- Bá Khí 8.5.5 — Xoá thông báo khỏi Trung tâm thông báo
--
-- Người học được xoá BẢN HIỂN THỊ của:
--   · phản hồi báo cáo          → report_notifications.dismissed_at
--   · thông báo cập nhật/bảo trì → announcement_reads.dismissed_at
-- Thông báo cập nhật PHIÊN BẢN (announcements.changelog_version khác null)
-- không hiện nút xoá ở giao diện và client không gửi yêu cầu xoá.
--
-- Dữ liệu gốc KHÔNG bị xoá: bảng announcements, changelog, reports,
-- report_messages giữ nguyên. Chỉ thêm một mốc thời gian đánh dấu đã xoá
-- trên bảng trạng thái riêng của từng học sinh (đã có từ trước), nên không
-- tạo bảng mới và không tạo API mới.
--
-- RLS không đổi:
--   · announcement_reads: policy sẵn có cho phép học sinh ghi dòng của mình.
--   · report_notifications: chỉ SELECT; việc ghi đi qua Edge Function
--     report-api (action notifications.dismiss), đúng kiến trúc 8.0.0.
-- =========================================================================

alter table public.announcement_reads
    add column if not exists dismissed_at timestamptz;

alter table public.report_notifications
    add column if not exists dismissed_at timestamptz;

comment on column public.announcement_reads.dismissed_at is
    'Học sinh đã xoá thông báo khỏi trung tâm thông báo (8.5.5). NULL = còn hiển thị.';
comment on column public.report_notifications.dismissed_at is
    'Học sinh đã xoá phản hồi báo cáo khỏi trung tâm thông báo (8.5.5). NULL = còn hiển thị.';

-- Truy vấn chuông chỉ đọc dòng của một học sinh; index bộ phận giữ chi phí nhỏ
-- khi bảng trạng thái đã đọc phình ra theo thời gian.
create index if not exists announcement_reads_dismissed_idx
    on public.announcement_reads (student_id, dismissed_at)
    where dismissed_at is not null;

create index if not exists report_notifications_dismissed_idx
    on public.report_notifications (student_id, dismissed_at)
    where dismissed_at is not null;

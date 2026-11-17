-- ============================================================================
-- Bá Khí 7.5.3 — đủ 21 khung avatar Founder cho 21 badge Founder.
--
-- Nguyên tắc an toàn:
--   * Chỉ thêm dòng ánh xạ badge → khung; không xoá, không đổi tên khung cũ.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent, on conflict do update).
--   * Quyền sở hữu khung vẫn suy ra từ badge (bakhi_owned_frames), không ghi
--     đè khung đang trang bị của học sinh.
--
-- Khung mới: Genesis, Liên Kết (Nexus), Mã Nguồn Gốc (Prime Code), Di Sản
-- (Legacy). Sáu khung thế hệ 7.3.0 và mười khung 7.5.0 giữ nguyên id nên
-- không ai mất quyền sở hữu đã có.
-- ============================================================================

insert into public.bakhi_badge_frames (badge_id, frame_id) values
    ('founder-genesis', 'founder-genesis'),
    ('founder-nexus', 'founder-nexus'),
    ('founder-prime-code', 'founder-prime-code'),
    ('founder-legacy', 'founder-legacy')
on conflict (badge_id) do update set frame_id = excluded.frame_id;

comment on table public.bakhi_badge_frames is
    'Badge nào mở khoá khung avatar nào. 7.5.3: 21 badge Founder ↔ 21 khung Founder, mỗi badge một khung độc quyền (founder-genesis … founder-ascendant).';

-- Kết thúc migration 7.5.3

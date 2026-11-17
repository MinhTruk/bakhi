-- 7.0.1 — Mốc thời gian changelog theo giờ Việt Nam (UTC+7).
--
-- Trước 7.0.1, tools/changelog/parse.js và Edge Function changelog-sync biến
-- ngày trong CHANGELOG.md thành 00:00:00Z. Khi hiển thị theo Asia/Ho_Chi_Minh,
-- mốc đó thành 07:00 cùng ngày — sai giờ nhưng vẫn đúng ngày.
--
-- Chỉ dịch những bản ghi đúng nửa đêm UTC (ngày thuần, không có giờ thật) để
-- không làm lệch các thông báo/changelog được đăng tay có giờ cụ thể.

update public.changelog
set published_at = published_at - interval '7 hours'
where published_at is not null
  and (published_at at time zone 'UTC')::time = time '00:00:00';

update public.announcements
set published_at = published_at - interval '7 hours'
where published_at is not null
  and type = 'update'
  and (published_at at time zone 'UTC')::time = time '00:00:00';

comment on column public.changelog.published_at is
    'Mốc công bố. Changelog từ CHANGELOG.md dùng nửa đêm giờ Việt Nam (00:00+07:00).';

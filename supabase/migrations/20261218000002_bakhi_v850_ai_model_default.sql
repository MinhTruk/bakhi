-- ===========================================================================
-- Bá Khí 8.5.0 — Model mặc định của AI Tutor
--
-- Ngày 2026-11-22, Google trả 404 cho `gemini-2.5-flash`:
--   "This model models/gemini-2.5-flash is no longer available to new users.
--    Please update your code to use models/gemini-3.8-flash."
-- Vì vậy bản cài mới và cấu hình đang chạy đều chuyển sang `gemini-3.8-flash`.
-- Chỉ đổi DỮ LIỆU mặc định; không xoá hội thoại, không đụng bảng khác.
-- ===========================================================================

alter table public.ai_settings
    alter column model set default 'gemini-3.8-flash';

update public.ai_settings
   set model = 'gemini-3.8-flash'
 where id = 1
   and model = 'gemini-2.5-flash';

do $$
begin
    if not exists (
        select 1 from public.ai_settings
        where id = 1 and model = 'gemini-3.8-flash'
    ) then
        raise exception 'ai_settings chưa chuyển sang gemini-3.8-flash';
    end if;
end;
$$;

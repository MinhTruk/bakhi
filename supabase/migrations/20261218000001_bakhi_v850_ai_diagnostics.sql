-- ===========================================================================
-- Bá Khí 8.5.0 — Nhật ký chẩn đoán nhà cung cấp AI
--
-- Vì sao có bảng này: khi khoá API hoặc tên model sai, provider trả 404/403 và
-- người học chỉ thấy một câu tiếng Việt chung. Ban quản trị cần biết *lý do
-- thật* để sửa cấu hình mà không phải đọc log của Edge Function.
--
-- Bảo mật:
--   * KHÔNG có policy nào → trình duyệt không đọc được, kể cả tài khoản học sinh
--     đang đăng nhập. Chỉ Edge Function (service_role) đọc/ghi.
--   * Nội dung lưu là thông điệp lỗi của provider sau khi đã lọc bỏ mọi chuỗi
--     giống khoá API; không lưu header, không lưu URL chứa khoá.
-- ===========================================================================

create table if not exists public.ai_provider_diagnostics (
    id          uuid primary key default gen_random_uuid(),
    provider    text not null default '' check (char_length(provider) <= 40),
    model       text not null default '' check (char_length(model) <= 80),
    role        text not null default 'primary' check (role in ('primary', 'fallback')),
    status      integer not null default 0 check (status >= 0),
    detail      text not null default '' check (char_length(detail) <= 400),
    created_at  timestamptz not null default now()
);

create index if not exists ai_provider_diagnostics_created_idx
    on public.ai_provider_diagnostics (created_at desc);

alter table public.ai_provider_diagnostics enable row level security;

/* Không policy nào: RLS + không policy = không ai ngoài service_role đọc/ghi được.
   Đồng thời thu hồi quyền bảng mặc định để phòng khi có policy thêm sai về sau. */
revoke all on table public.ai_provider_diagnostics from anon, authenticated;
grant all on table public.ai_provider_diagnostics to service_role;

do $$
begin
    if not exists (
        select 1 from pg_tables
        where schemaname = 'public' and tablename = 'ai_provider_diagnostics'
              and rowsecurity = true
    ) then
        raise exception 'ai_provider_diagnostics chưa bật RLS';
    end if;
    if exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'ai_provider_diagnostics'
    ) then
        raise exception 'ai_provider_diagnostics không được có policy';
    end if;
end;
$$;

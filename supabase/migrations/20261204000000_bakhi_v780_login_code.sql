-- Bá Khí 7.8.0 — mật mã đăng nhập thay cho passkey.
--
-- Passkey WebAuthn chỉ dùng được trên thiết bị/trình duyệt đã tạo credential
-- (máy tính có Touch ID/Windows Hello), nên học sinh dùng điện thoại hoặc máy
-- khác không đăng nhập được. Thay bằng mật mã riêng của từng hồ sơ:
--
--  * Mật mã KHÔNG lưu dạng thô. Máy chủ băm bằng PBKDF2-SHA256 (salt riêng cho
--    từng hồ sơ) và chỉ so sánh bản băm khi đăng nhập.
--  * Bảng chỉ service_role đọc/ghi; anon/authenticated không có quyền nào.
--  * Sai 5 lần liên tiếp → khoá 10 phút (failed_count / locked_until).
--
-- Migration chỉ bổ sung và idempotent: chạy lại nhiều lần vẫn an toàn.

create table if not exists public.student_login_codes (
    student_id   uuid primary key references public.students (id) on delete cascade,
    code_hash    text not null,
    code_salt    text not null,
    iterations   integer not null default 120000
                 check (iterations between 10000 and 600000),
    failed_count integer not null default 0 check (failed_count >= 0),
    locked_until timestamptz,
    last_used_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

alter table public.student_login_codes enable row level security;

revoke all on public.student_login_codes from public;
revoke all on public.student_login_codes from anon, authenticated;

comment on table public.student_login_codes is
    'Mật mã đăng nhập của học sinh (PBKDF2-SHA256 + salt riêng). Chỉ Edge Function service_role truy cập; không lưu mật mã thô.';

-- Gỡ hoàn toàn tính năng passkey: credential WebAuthn không còn dùng được và
-- website không còn gọi passkey-api.
drop table if exists public.passkey_challenges cascade;
drop function if exists public.bakhi_passkey_cleanup();
drop table if exists public.student_passkeys cascade;

-- Rollback (chạy tay khi cần quay lại 7.7.x):
--   drop table if exists public.student_login_codes;
--   và apply lại migration 20261125000000_bakhi_chat_presence_passkey.sql.

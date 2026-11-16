-- ============================================================================
-- Bá Khí — phiên Developer Playground (Dev Code) tách hoàn toàn khỏi phiên
-- Administrator.
--
-- Chỉ THÊM bảng mới, không xoá/đổi bảng cũ, không reset dữ liệu:
--   * dev_sessions chỉ được Edge Function dev-auth (service role) ghi/đọc.
--   * RLS bật, không policy, revoke anon/authenticated → trình duyệt không đọc được.
--   * admin_sessions giữ nguyên; Dev Code KHÔNG cấp quyền admin-actions.
-- ============================================================================

create table if not exists public.dev_sessions (
    id           uuid primary key default gen_random_uuid(),
    token_hash   text not null unique,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    last_used_at timestamptz
);

create index if not exists dev_sessions_expires_idx
    on public.dev_sessions (expires_at desc);

alter table public.dev_sessions enable row level security;

revoke all on public.dev_sessions from anon, authenticated;

comment on table public.dev_sessions is
    'Phiên Developer Playground (Dev Code). Chỉ service role trong Edge Function truy cập.';

-- Bá Khí 6.2.0 — đã đọc chính xác, trạng thái hoạt động và passkey.
--
-- 1. chat_profiles trả thêm last_seen_at để chat hiển thị trạng thái hoạt động.
-- 2. student_passkeys lưu credential WebAuthn (chỉ service_role đọc/ghi).
-- 3. passkey_challenges lưu challenge dùng một lần, có hạn 5 phút.
--
-- Không cấp quyền bảng passkey cho anon/authenticated: mọi thao tác đi qua
-- Edge Function passkey-api sau khi xác minh chữ ký WebAuthn.

create or replace view public.chat_profiles
with (security_invoker = false) as
select
    s.id as student_id,
    s.display_name,
    coalesce(p.nickname, '') as nickname,
    coalesce(p.bio, '') as bio,
    coalesce(p.avatar_url, '') as avatar_url,
    coalesce(p.frame, 'none') as frame,
    (select count(*)::int from public.student_badges b where b.student_id = s.id) as badge_count,
    (select max(d.last_seen_at) from public.student_devices d where d.student_id = s.id) as last_seen_at
from public.students s
left join public.student_profiles p on p.student_id = s.id
where s.is_active;

comment on view public.chat_profiles is
    'Hồ sơ công khai tối thiểu cho Profile Card trong chat: tên, biệt danh, giới thiệu, ảnh, khung, số thành tích, lần hoạt động gần nhất.';

grant select on public.chat_profiles to authenticated;

create table if not exists public.student_passkeys (
    id            uuid primary key default gen_random_uuid(),
    student_id    uuid not null references public.students (id) on delete cascade,
    credential_id text not null unique,
    public_key    text not null,
    counter       bigint not null default 0 check (counter >= 0),
    transports    text[] not null default '{}'::text[],
    device_type   text not null default 'singleDevice'
                  check (device_type in ('singleDevice', 'multiDevice')),
    backed_up     boolean not null default false,
    label         text not null default 'Passkey'
                  check (char_length(btrim(label)) between 1 and 80),
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz
);

create index if not exists student_passkeys_student_idx
    on public.student_passkeys (student_id, created_at desc);

create table if not exists public.passkey_challenges (
    id           uuid primary key default gen_random_uuid(),
    student_id   uuid not null references public.students (id) on delete cascade,
    auth_user_id uuid not null references auth.users (id) on delete cascade,
    kind         text not null check (kind in ('register', 'login')),
    challenge    text not null,
    expires_at   timestamptz not null,
    used_at      timestamptz,
    created_at   timestamptz not null default now()
);

create index if not exists passkey_challenges_lookup_idx
    on public.passkey_challenges (id, auth_user_id, expires_at desc);

alter table public.student_passkeys enable row level security;
alter table public.passkey_challenges enable row level security;

revoke all on public.student_passkeys, public.passkey_challenges from public;
revoke all on public.student_passkeys, public.passkey_challenges from anon, authenticated;

comment on table public.student_passkeys is
    'Credential WebAuthn của học sinh. public_key là khoá công khai; không lưu private key.';
comment on table public.passkey_challenges is
    'Challenge WebAuthn dùng một lần, hết hạn sau 5 phút; chỉ Edge Function service_role truy cập.';

-- Dọn challenge cũ khi có challenge mới cho cùng người dùng.
create or replace function public.bakhi_passkey_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.passkey_challenges
     where auth_user_id = new.auth_user_id
       and (used_at is not null or expires_at < now() - interval '1 day');
    return new;
end;
$$;

drop trigger if exists passkey_challenges_cleanup on public.passkey_challenges;
create trigger passkey_challenges_cleanup
    before insert on public.passkey_challenges
    for each row execute function public.bakhi_passkey_cleanup();

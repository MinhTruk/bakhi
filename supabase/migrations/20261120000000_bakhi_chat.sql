-- ============================================================================
-- Bá Khí 3.7.0 — Chat: phòng chung, tin nhắn riêng, nhóm nhỏ, ảnh, cảm xúc
--
-- Nguyên tắc bảo mật:
--   * Trình duyệt CHỈ đọc (RLS select) những phòng mình tham gia; mọi thao tác
--     ghi đi qua Edge Function `chat-api` bằng service role sau khi máy chủ kiểm
--     tra tư cách thành viên, độ dài nội dung và giới hạn tần suất.
--   * Thu hồi insert/update/delete khỏi `anon`/`authenticated` trên cả bốn bảng.
--   * Ảnh chỉ nhận qua Storage bucket `chat-images` (chỉ image/*, ≤ 3 MB), đường
--     dẫn bắt đầu bằng uuid học sinh để không ghi đè ảnh của người khác.
--
-- Idempotent: mọi đối tượng dùng `if not exists` / `drop ... if exists`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Phòng chat
-- ---------------------------------------------------------------------------
create table if not exists public.chat_rooms (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('global', 'dm', 'group')),
    title text not null default '' check (char_length(title) <= 80),
    dm_key text unique,
    created_by uuid references public.students(id) on delete set null,
    created_at timestamptz not null default now(),
    last_message_at timestamptz not null default now(),
    check (kind <> 'dm' or dm_key is not null)
);

comment on table public.chat_rooms is
    'Phòng chat Bá Khí. kind=global (một phòng chung), dm (đúng 2 người) hoặc group (≤ 10 người).';

create unique index if not exists chat_rooms_one_global
    on public.chat_rooms ((true)) where kind = 'global';

create index if not exists chat_rooms_recent_idx
    on public.chat_rooms (last_message_at desc);

-- ---------------------------------------------------------------------------
-- 2. Thành viên
-- ---------------------------------------------------------------------------
create table if not exists public.chat_members (
    room_id uuid not null references public.chat_rooms(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'admin', 'member')),
    joined_at timestamptz not null default now(),
    last_read_at timestamptz not null default now(),
    muted boolean not null default false,
    primary key (room_id, student_id)
);

comment on table public.chat_members is
    'Thành viên phòng chat. global không cần dòng thành viên; dm/group bắt buộc có.';

create index if not exists chat_members_student_idx
    on public.chat_members (student_id, last_read_at desc);

-- ---------------------------------------------------------------------------
-- 3. Tin nhắn
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.chat_rooms(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    body text not null default '' check (char_length(body) <= 2000),
    image_path text check (image_path is null or char_length(image_path) <= 300),
    reply_to uuid references public.chat_messages(id) on delete set null,
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    check (char_length(body) > 0 or image_path is not null)
);

comment on table public.chat_messages is
    'Tin nhắn chat. Chỉ nhận ảnh qua bucket chat-images; không nhận tệp tuỳ ý.';

create index if not exists chat_messages_room_idx
    on public.chat_messages (room_id, created_at desc);

create index if not exists chat_messages_sender_idx
    on public.chat_messages (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Cảm xúc (emoji)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_reactions (
    message_id uuid not null references public.chat_messages(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    emoji text not null check (char_length(emoji) between 1 and 8),
    created_at timestamptz not null default now(),
    primary key (message_id, student_id, emoji)
);

create index if not exists chat_reactions_message_idx
    on public.chat_reactions (message_id);

-- ---------------------------------------------------------------------------
-- 5. Hàm phụ trợ
-- ---------------------------------------------------------------------------
-- Học sinh có đọc được phòng này không (phòng chung thì ai đã gắn danh tính cũng đọc được).
create or replace function public.bakhi_chat_can_read(p_room uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.chat_rooms r
         where r.id = p_room
           and (
                r.kind = 'global'
                or exists (
                    select 1 from public.chat_members m
                     where m.room_id = r.id and m.student_id = p_student
                )
           )
    );
$$;

comment on function public.bakhi_chat_can_read(uuid, uuid) is
    'Quyền đọc phòng chat: phòng chung cho mọi học sinh đã gắn danh tính, còn lại phải là thành viên.';

-- Giới hạn thành viên: dm đúng 2, group tối đa 10.
create or replace function public.bakhi_chat_member_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_kind text;
    v_count integer;
begin
    select kind into v_kind from public.chat_rooms where id = new.room_id;
    if v_kind is null then
        raise exception 'ROOM_NOT_FOUND' using errcode = '23503';
    end if;

    select count(*) into v_count
      from public.chat_members
     where room_id = new.room_id;

    if v_kind = 'dm' and v_count >= 2 then
        raise exception 'DM_FULL' using errcode = '23514';
    end if;
    if v_kind = 'group' and v_count >= 10 then
        raise exception 'GROUP_FULL' using errcode = '23514';
    end if;
    return new;
end;
$$;

drop trigger if exists chat_members_guard on public.chat_members;
create trigger chat_members_guard
    before insert on public.chat_members
    for each row execute function public.bakhi_chat_member_guard();

-- Tin nhắn chỉ được gửi bởi thành viên (hoặc bất kỳ ai ở phòng chung).
create or replace function public.bakhi_chat_message_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.bakhi_chat_can_read(new.room_id, new.student_id) then
        raise exception 'NOT_MEMBER' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists chat_messages_guard on public.chat_messages;
create trigger chat_messages_guard
    before insert on public.chat_messages
    for each row execute function public.bakhi_chat_message_guard();

-- Cập nhật mốc hoạt động gần nhất của phòng.
create or replace function public.bakhi_chat_touch_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.chat_rooms
       set last_message_at = new.created_at
     where id = new.room_id;
    return new;
end;
$$;

drop trigger if exists chat_messages_touch on public.chat_messages;
create trigger chat_messages_touch
    after insert on public.chat_messages
    for each row execute function public.bakhi_chat_touch_room();

-- ---------------------------------------------------------------------------
-- 6. Hồ sơ rút gọn cho Profile Card (không lộ mã học sinh hay dữ liệu khác)
-- ---------------------------------------------------------------------------
create or replace view public.chat_profiles
with (security_invoker = false) as
select
    s.id as student_id,
    s.display_name,
    coalesce(p.nickname, '') as nickname,
    coalesce(p.bio, '') as bio,
    coalesce(p.avatar_url, '') as avatar_url,
    coalesce(p.frame, 'none') as frame,
    (select count(*)::int from public.student_badges b where b.student_id = s.id) as badge_count
from public.students s
left join public.student_profiles p on p.student_id = s.id
where s.is_active;

comment on view public.chat_profiles is
    'Hồ sơ công khai tối thiểu cho Profile Card trong chat: tên, biệt danh, giới thiệu, ảnh, khung, số thành tích.';

-- ---------------------------------------------------------------------------
-- 6b. Realtime cần đủ dữ liệu cũ khi xoá cảm xúc / tin nhắn
-- ---------------------------------------------------------------------------
alter table public.chat_messages replica identity full;
alter table public.chat_reactions replica identity full;

-- ---------------------------------------------------------------------------
-- 7. RLS: chỉ đọc; mọi thao tác ghi qua chat-api (service role)
-- ---------------------------------------------------------------------------
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;

drop policy if exists chat_rooms_select_member on public.chat_rooms;
create policy chat_rooms_select_member on public.chat_rooms
    for select using (
        kind = 'global'
        or exists (
            select 1 from public.chat_members m
             where m.room_id = id
               and m.student_id = public.bakhi_current_student_id()
        )
    );

drop policy if exists chat_members_select_in_room on public.chat_members;
create policy chat_members_select_in_room on public.chat_members
    for select using (
        student_id = public.bakhi_current_student_id()
        or public.bakhi_chat_can_read(room_id, public.bakhi_current_student_id())
    );

drop policy if exists chat_messages_select_in_room on public.chat_messages;
create policy chat_messages_select_in_room on public.chat_messages
    for select using (public.bakhi_chat_can_read(room_id, public.bakhi_current_student_id()));

drop policy if exists chat_reactions_select_in_room on public.chat_reactions;
create policy chat_reactions_select_in_room on public.chat_reactions
    for select using (
        exists (
            select 1 from public.chat_messages m
             where m.id = message_id
               and public.bakhi_chat_can_read(m.room_id, public.bakhi_current_student_id())
        )
    );

-- Không có policy ghi nào: trình duyệt không tự chèn/sửa/xoá được.
revoke all on public.chat_rooms, public.chat_members, public.chat_messages, public.chat_reactions
    from public;
revoke insert, update, delete on public.chat_rooms, public.chat_members, public.chat_messages, public.chat_reactions
    from anon, authenticated;
grant select on public.chat_rooms, public.chat_members, public.chat_messages, public.chat_reactions
    to authenticated;
grant select on public.chat_profiles to authenticated;

revoke execute on function public.bakhi_chat_can_read(uuid, uuid) from public;
grant execute on function public.bakhi_chat_can_read(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Phòng chung
-- ---------------------------------------------------------------------------
insert into public.chat_rooms (kind, title, created_by)
select 'global', 'Phòng chung', null
where not exists (select 1 from public.chat_rooms where kind = 'global');

-- ---------------------------------------------------------------------------
-- 9. Realtime
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        foreach t in array array['chat_rooms', 'chat_members', 'chat_messages', 'chat_reactions'] loop
            if not exists (
                select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime'
                   and schemaname = 'public'
                   and tablename = t
            ) then
                execute format('alter publication supabase_realtime add table public.%I', t);
            end if;
        end loop;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Storage: ảnh chat
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 3145728, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
    set public = true,
        file_size_limit = 3145728,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

drop policy if exists chat_images_read on storage.objects;
create policy chat_images_read on storage.objects
    for select using (bucket_id = 'chat-images');

drop policy if exists chat_images_upload_own on storage.objects;
create policy chat_images_upload_own on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'chat-images'
        and (storage.foldername(name))[1] = public.bakhi_current_student_id()::text
    );

drop policy if exists chat_images_delete_own on storage.objects;
create policy chat_images_delete_own on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'chat-images'
        and (storage.foldername(name))[1] = public.bakhi_current_student_id()::text
    );

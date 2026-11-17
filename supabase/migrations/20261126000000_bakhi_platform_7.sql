-- ============================================================================
-- Bá Khí 7.0.0 — nền tảng học tập: tuỳ chọn hội thoại, lịch sử bảo trì,
-- thư viện nhạc cá nhân và tuỳ chọn hồ sơ đồng bộ.
--
-- Nguyên tắc an toàn:
--   * CHỈ thêm bảng/cột/chỉ mục; không xoá bảng, cột hay dữ liệu hiện có.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--   * Mọi bảng chứa dữ liệu học sinh đều bật RLS. Trình duyệt chỉ đọc dữ
--     liệu của chính mình; thao tác đặc quyền đi qua Edge Function.
--   * Không cấp quyền ghi bảng bảo trì cho anon/authenticated.
--
-- Hoàn tác (chỉ khi thật cần, sẽ mất dữ liệu mới):
--   drop table if exists public.chat_conversation_prefs;
--   drop table if exists public.music_tracks;
--   drop table if exists public.maintenance_history;
--   alter table public.student_profiles drop column if exists prefs;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tuỳ chọn hội thoại theo từng người (ghim / lưu trữ)
--    Một dòng cho mỗi cặp (học sinh, phòng). Không ảnh hưởng người khác.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_conversation_prefs (
    student_id  uuid not null references public.students (id) on delete cascade,
    room_id     uuid not null references public.chat_rooms (id) on delete cascade,
    pinned      boolean not null default false,
    pinned_at   timestamptz,
    archived    boolean not null default false,
    archived_at timestamptz,
    updated_at  timestamptz not null default now(),
    primary key (student_id, room_id),
    constraint chat_conversation_prefs_pin_time check (
        (pinned = false) or (pinned_at is not null)
    ),
    constraint chat_conversation_prefs_archive_time check (
        (archived = false) or (archived_at is not null)
    )
);

comment on table public.chat_conversation_prefs is
    'Ghim và lưu trữ hội thoại theo từng học sinh. Chỉ ảnh hưởng người thực hiện; không xoá hội thoại của người khác.';

create index if not exists chat_conversation_prefs_pins_idx
    on public.chat_conversation_prefs (student_id, pinned_at desc)
    where pinned;

create index if not exists chat_conversation_prefs_archived_idx
    on public.chat_conversation_prefs (student_id, archived_at desc)
    where archived;

alter table public.chat_conversation_prefs enable row level security;

drop policy if exists chat_conversation_prefs_select_own on public.chat_conversation_prefs;
create policy chat_conversation_prefs_select_own on public.chat_conversation_prefs
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

-- Không có policy ghi: mọi thay đổi đi qua Edge Function chat-api.
revoke all on public.chat_conversation_prefs from public, anon, authenticated;
grant select on public.chat_conversation_prefs to authenticated;

drop trigger if exists chat_conversation_prefs_touch on public.chat_conversation_prefs;
create trigger chat_conversation_prefs_touch
    before update on public.chat_conversation_prefs
    for each row execute function public.bakhi_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Lịch sử bảo trì toàn website
--    Chỉ service_role đọc/ghi; dashboard nhận dữ liệu qua Edge Function
--    admin-actions sau khi xác thực phiên Founder.
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_history (
    id                         uuid primary key default gen_random_uuid(),
    started_at                 timestamptz not null default now(),
    ended_at                   timestamptz,
    started_by                 text,
    ended_by                   text,
    reason                     text not null default '' check (char_length(reason) <= 400),
    status                     text not null default 'active'
                               check (status in ('active', 'completed')),
    duration_seconds           integer check (duration_seconds is null or duration_seconds >= 0),
    completion_announcement_id uuid references public.announcements (id) on delete set null,
    notified_at                timestamptz,
    metadata                   jsonb not null default '{}'::jsonb,
    created_at                 timestamptz not null default now(),
    constraint maintenance_history_end_after_start check (
        ended_at is null or ended_at >= started_at
    )
);

comment on table public.maintenance_history is
    'Mỗi chu kỳ bật/tắt bảo trì. completion_announcement_id bảo đảm một chu kỳ chỉ thông báo hoàn tất một lần.';

create unique index if not exists maintenance_history_one_active
    on public.maintenance_history ((true))
    where status = 'active';

create index if not exists maintenance_history_started_idx
    on public.maintenance_history (started_at desc);

alter table public.maintenance_history enable row level security;
revoke all on public.maintenance_history from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tuỳ chọn hồ sơ đồng bộ (animation viền avatar, …)
--    jsonb nhỏ, chỉ chứa cờ giao diện; không chứa bí mật.
-- ---------------------------------------------------------------------------
alter table public.student_profiles
    add column if not exists prefs jsonb not null default '{}'::jsonb;

comment on column public.student_profiles.prefs is
    'Tuỳ chọn giao diện đồng bộ theo tài khoản: animateAvatarBorders, ... Chỉ cờ hiển thị, không cấp quyền.';

-- ---------------------------------------------------------------------------
-- 4. Cấu hình thương hiệu + mở rộng cấu hình bảo trì
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
    ('public.branding',
     '{"adminDashboardName": "Administrator Dashboard"}'::jsonb,
     'Tên hiển thị của Administrator Dashboard. Không đổi đường dẫn /admin/.'),
    ('public.maintenance',
     '{"enabled": false, "title": "Bá Khí đang bảo trì", "message": "", "reason": "", "startAt": null, "endAt": null, "updatedAt": null, "historyId": null, "cycleStartedAt": null}'::jsonb,
     'Bảo trì toàn website: bật/tắt, tiêu đề, nội dung, lý do, thời gian và chu kỳ bảo trì.')
on conflict (key) do nothing;

-- Bổ sung khoá mới cho bản ghi đã tồn tại, không ghi đè giá trị đang dùng.
update public.app_settings
   set value = value
       || jsonb_build_object(
            'historyId', coalesce(value->'historyId', 'null'::jsonb),
            'cycleStartedAt', coalesce(value->'cycleStartedAt', 'null'::jsonb)
          )
 where key = 'public.maintenance'
   and (value->'historyId' is null or value->'cycleStartedAt' is null);

update public.app_settings
   set value = jsonb_build_object(
        'adminDashboardName',
        coalesce(value->'adminDashboardName', to_jsonb('Administrator Dashboard'::text))
   )
 where key = 'public.branding'
   and value->'adminDashboardName' is null;

-- ---------------------------------------------------------------------------
-- 5. Thư viện nhạc cá nhân
--    Chỉ lưu liên kết, tên, tác giả, lời do người dùng nhập. Không lưu tệp
--    audio và không tải nội dung có bản quyền từ nền tảng khác.
-- ---------------------------------------------------------------------------
create table if not exists public.music_tracks (
    id           uuid primary key default gen_random_uuid(),
    student_id   uuid not null references public.students (id) on delete cascade,
    provider     text not null
                 check (provider in ('youtube', 'spotify', 'soundcloud', 'audio')),
    source_url   text not null
                 check (char_length(source_url) between 8 and 1000),
    source_key   text not null
                 check (char_length(source_key) between 1 and 200),
    title        text not null
                 check (char_length(btrim(title)) between 1 and 160),
    artist       text not null default ''
                 check (char_length(artist) <= 120),
    artwork_url  text not null default ''
                 check (artwork_url = '' or artwork_url ~* '^https?://'),
    lyrics       text not null default ''
                 check (char_length(lyrics) <= 20000),
    position     integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (student_id, source_key)
);

comment on table public.music_tracks is
    'Thư viện nhạc riêng của từng học sinh: liên kết nguồn, tên, tác giả, lời tự nhập. Không chứa tệp audio.';

create index if not exists music_tracks_owner_idx
    on public.music_tracks (student_id, position asc, created_at asc);

alter table public.music_tracks enable row level security;

drop policy if exists music_tracks_select_own on public.music_tracks;
create policy music_tracks_select_own on public.music_tracks
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

drop policy if exists music_tracks_insert_own on public.music_tracks;
create policy music_tracks_insert_own on public.music_tracks
    for insert to authenticated
    with check (student_id = public.bakhi_current_student_id());

drop policy if exists music_tracks_update_own on public.music_tracks;
create policy music_tracks_update_own on public.music_tracks
    for update to authenticated
    using (student_id = public.bakhi_current_student_id())
    with check (student_id = public.bakhi_current_student_id());

drop policy if exists music_tracks_delete_own on public.music_tracks;
create policy music_tracks_delete_own on public.music_tracks
    for delete to authenticated
    using (student_id = public.bakhi_current_student_id());

revoke all on public.music_tracks from public, anon;
grant select, insert, update, delete on public.music_tracks to authenticated;

drop trigger if exists music_tracks_touch on public.music_tracks;
create trigger music_tracks_touch
    before update on public.music_tracks
    for each row execute function public.bakhi_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        foreach t in array array['chat_conversation_prefs', 'music_tracks'] loop
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
-- 7. Kiểm tra nhanh sau migration
-- ---------------------------------------------------------------------------
-- select count(*) from public.chat_conversation_prefs;
-- select count(*) from public.music_tracks;
-- select key, value from public.app_settings where key like 'public.%';

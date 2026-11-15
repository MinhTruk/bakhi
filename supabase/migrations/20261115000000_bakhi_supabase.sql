-- ============================================================================
-- Bá Khí — Supabase schema, RLS và các hàm hỗ trợ.
--
-- Chạy trong Supabase Dashboard → SQL Editor (hoặc `supabase db push`).
-- Không chứa secret. Không chứa danh sách học sinh thật.
--
-- Nguyên tắc:
--   * Học sinh chỉ đọc/ghi dữ liệu của chính mình (qua auth.uid()).
--   * Danh sách học sinh KHÔNG đọc được từ trình duyệt — chỉ Edge Function
--     (service_role) mới truy cập, nên file TXT không bị công khai.
--   * Thông báo/changelog chỉ đọc được bản đã publish; mọi thao tác ghi đi
--     qua Edge Function có xác thực Dev session.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------------

create table if not exists public.students (
    id              uuid primary key default gen_random_uuid(),
    display_name    text not null check (char_length(btrim(display_name)) between 1 and 120),
    normalized_name text not null check (char_length(normalized_name) between 1 and 120),
    student_code    text not null unique
                    default ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
    -- Thông tin phân biệt do Admin đặt, bắt buộc khi có hai hồ sơ trùng họ tên.
    disambiguator   text check (disambiguator is null or char_length(btrim(disambiguator)) between 1 and 60),
    is_active       boolean not null default true,
    -- Hồ sơ bị đánh dấu cần Admin xem lại (thường là trùng tên chưa phân biệt).
    needs_review    boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists students_normalized_idx on public.students (normalized_name);
create index if not exists students_active_idx on public.students (is_active);

-- Không cho phép hai hồ sơ cùng họ tên mà không có thông tin phân biệt.
create unique index if not exists students_undisambiguated_unique
    on public.students (normalized_name) where disambiguator is null;

create table if not exists public.student_devices (
    id           uuid primary key default gen_random_uuid(),
    auth_user_id uuid not null unique references auth.users (id) on delete cascade,
    student_id   uuid not null references public.students (id) on delete cascade,
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index if not exists student_devices_student_idx on public.student_devices (student_id);

create table if not exists public.student_progress (
    id            uuid primary key default gen_random_uuid(),
    student_id    uuid not null references public.students (id) on delete cascade,
    progress_key  text not null check (progress_key in
                  ('practice', 'review', 'notes', 'bookmarks', 'history', 'achievements', 'prefs')),
    progress_data jsonb not null default '{}'::jsonb,
    updated_at    timestamptz not null default now(),
    unique (student_id, progress_key)
);

create table if not exists public.announcements (
    id           uuid primary key default gen_random_uuid(),
    title        text not null check (char_length(btrim(title)) between 1 and 160),
    content      text not null check (char_length(content) between 1 and 20000),
    type         text not null default 'general' check (type in
                 ('general', 'announcement', 'update', 'important', 'maintenance')),
    priority     text not null default 'normal' check (priority in
                 ('low', 'normal', 'high', 'critical')),
    is_published boolean not null default false,
    published_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists announcements_published_idx
    on public.announcements (is_published, published_at desc nulls last);

create table if not exists public.announcement_reads (
    id              uuid primary key default gen_random_uuid(),
    student_id      uuid not null references public.students (id) on delete cascade,
    announcement_id uuid not null references public.announcements (id) on delete cascade,
    read_at         timestamptz not null default now(),
    unique (student_id, announcement_id)
);

create index if not exists announcement_reads_student_idx on public.announcement_reads (student_id);

create table if not exists public.changelog (
    id           uuid primary key default gen_random_uuid(),
    version      text not null unique check (version ~ '^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$'),
    title        text not null check (char_length(btrim(title)) between 1 and 160),
    summary      text check (summary is null or char_length(summary) <= 400),
    content      jsonb not null default '[]'::jsonb,
    category     text not null default 'other' check (category in
                 ('features', 'improvements', 'fixes', 'ui', 'performance', 'other')),
    is_published boolean not null default false,
    published_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists changelog_published_idx
    on public.changelog (is_published, published_at desc nulls last);

create table if not exists public.admin_activity_logs (
    id          uuid primary key default gen_random_uuid(),
    action      text not null,
    target_type text,
    target_id   text,
    detail      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists admin_activity_logs_created_idx
    on public.admin_activity_logs (created_at desc);

create table if not exists public.admin_sessions (
    id           uuid primary key default gen_random_uuid(),
    token_hash   text not null unique,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    last_used_at timestamptz
);

create table if not exists public.rate_limits (
    key          text primary key,
    window_start timestamptz not null default now(),
    count        integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 2. Trigger updated_at
-- ---------------------------------------------------------------------------

create or replace function public.bakhi_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists students_touch on public.students;
create trigger students_touch before update on public.students
    for each row execute function public.bakhi_touch_updated_at();

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
    for each row execute function public.bakhi_touch_updated_at();

drop trigger if exists changelog_touch on public.changelog;
create trigger changelog_touch before update on public.changelog
    for each row execute function public.bakhi_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Hàm hỗ trợ
-- ---------------------------------------------------------------------------

-- student_id gắn với phiên thiết bị hiện tại. Chỉ trả về liên kết của chính
-- auth.uid() nên không thể dùng để đọc dữ liệu người khác.
create or replace function public.bakhi_current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select sd.student_id
    from public.student_devices sd
    where sd.auth_user_id = auth.uid()
    limit 1;
$$;

revoke all on function public.bakhi_current_student_id() from public;
grant execute on function public.bakhi_current_student_id() to authenticated;

-- Giới hạn tốc độ dùng chung (Edge Function gọi bằng service_role).
create or replace function public.bakhi_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    insert into public.rate_limits (key, window_start, count)
    values (p_key, now(), 1)
    on conflict (key) do update set
        count = case
                    when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                    then 1
                    else public.rate_limits.count + 1
                end,
        window_start = case
                    when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                    then now()
                    else public.rate_limits.window_start
                end
    returning count into v_count;
    return v_count <= p_limit;
end;
$$;

revoke all on function public.bakhi_rate_limit(text, integer, integer) from public;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.students           enable row level security;
alter table public.student_devices    enable row level security;
alter table public.student_progress   enable row level security;
alter table public.announcements      enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.changelog          enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.admin_sessions     enable row level security;
alter table public.rate_limits        enable row level security;

-- Danh sách học sinh: KHÔNG truy cập trực tiếp từ trình duyệt.
revoke all on public.students from anon, authenticated;

-- Chỉ đọc liên kết thiết bị của chính mình; ghi do Edge Function thực hiện.
revoke all on public.student_devices from anon, authenticated;
grant select on public.student_devices to authenticated;

drop policy if exists student_devices_select_own on public.student_devices;
create policy student_devices_select_own on public.student_devices
    for select to authenticated
    using (auth_user_id = auth.uid());

-- Tiến trình học tập: chỉ chủ sở hữu.
revoke all on public.student_progress from anon, authenticated;
grant select, insert, update on public.student_progress to authenticated;

drop policy if exists student_progress_select_own on public.student_progress;
create policy student_progress_select_own on public.student_progress
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

drop policy if exists student_progress_insert_own on public.student_progress;
create policy student_progress_insert_own on public.student_progress
    for insert to authenticated
    with check (student_id = public.bakhi_current_student_id());

drop policy if exists student_progress_update_own on public.student_progress;
create policy student_progress_update_own on public.student_progress
    for update to authenticated
    using (student_id = public.bakhi_current_student_id())
    with check (student_id = public.bakhi_current_student_id());

-- Thông báo: ai đã có phiên (kể cả anonymous) đọc được bản đã publish.
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;

drop policy if exists announcements_select_published on public.announcements;
create policy announcements_select_published on public.announcements
    for select to authenticated
    using (is_published);

-- Trạng thái đã đọc: riêng từng học sinh.
revoke all on public.announcement_reads from anon, authenticated;
grant select, insert, update, delete on public.announcement_reads to authenticated;

drop policy if exists announcement_reads_select_own on public.announcement_reads;
create policy announcement_reads_select_own on public.announcement_reads
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

drop policy if exists announcement_reads_insert_own on public.announcement_reads;
create policy announcement_reads_insert_own on public.announcement_reads
    for insert to authenticated
    with check (student_id = public.bakhi_current_student_id());

drop policy if exists announcement_reads_update_own on public.announcement_reads;
create policy announcement_reads_update_own on public.announcement_reads
    for update to authenticated
    using (student_id = public.bakhi_current_student_id())
    with check (student_id = public.bakhi_current_student_id());

drop policy if exists announcement_reads_delete_own on public.announcement_reads;
create policy announcement_reads_delete_own on public.announcement_reads
    for delete to authenticated
    using (student_id = public.bakhi_current_student_id());

-- Changelog: đọc bản đã publish.
revoke all on public.changelog from anon, authenticated;
grant select on public.changelog to authenticated;

drop policy if exists changelog_select_published on public.changelog;
create policy changelog_select_published on public.changelog
    for select to authenticated
    using (is_published);

-- Bảng quản trị: chỉ service_role (Edge Function).
revoke all on public.admin_activity_logs from anon, authenticated;
revoke all on public.admin_sessions from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------

do $$
begin
    begin
        alter publication supabase_realtime add table public.announcements;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.changelog;
    exception when duplicate_object then null;
    end;
end;
$$;

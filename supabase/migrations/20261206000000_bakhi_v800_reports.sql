-- ===========================================================================
--  Bá Khí v8.0.0 — Report Issue + Q&A
--
--  * Học sinh gửi báo cáo từ trang chủ (Cài đặt) và từ mọi trang môn học
--    (cửa sổ nổi dùng chung một component).
--  * Mỗi báo cáo có một cuộc hội thoại riêng (report_messages) giữa người
--    báo cáo và Administrator/Founder.
--  * Thông báo riêng cho đúng học sinh nằm ở report_notifications và được
--    hiển thị trong Trung tâm thông báo hiện có (không có hệ thống thứ hai).
--  * Mọi thao tác ghi đi qua Edge Function (service role) sau khi máy chủ xác
--    minh phiên thiết bị hoặc phiên quản trị. RLS chỉ mở quyền ĐỌC dữ liệu
--    thuộc chính học sinh đang gắn với thiết bị.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------------
create sequence if not exists public.report_code_seq start 1001;

create table if not exists public.reports (
    id               uuid primary key default gen_random_uuid(),
    code             text not null unique
                     default ('BK-' || lpad(nextval('public.report_code_seq')::text, 5, '0')),
    student_id       uuid not null references public.students (id) on delete cascade,
    title            text not null check (char_length(btrim(title)) between 4 and 160),
    description      text not null check (char_length(btrim(description)) between 10 and 5000),
    category         text not null default 'bug' check (category in
                     ('bug', 'ui', 'content', 'answer', 'account', 'performance',
                      'feature', 'data', 'other')),
    issue_type       text not null default 'bug' check (issue_type in
                     ('bug', 'question', 'suggestion', 'content_error')),
    priority         text not null default 'normal' check (priority in
                     ('low', 'normal', 'high', 'critical')),
    status           text not null default 'new' check (status in
                     ('new', 'pending', 'in_progress', 'waiting_student', 'resolved', 'closed')),
    page_url         text,
    page_title       text,
    route            text,
    subject          text,
    context_data     jsonb not null default '{}'::jsonb,
    attachment_paths text[] not null default '{}',
    assigned_to      text check (assigned_to is null or assigned_to in ('admin', 'founder')),
    resolved_by      text,
    resolution_note  text,
    last_message_at  timestamptz,
    last_message_by  text check (last_message_by is null or last_message_by in ('student', 'staff')),
    student_unread   integer not null default 0 check (student_unread >= 0),
    staff_unread     integer not null default 1 check (staff_unread >= 0),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    resolved_at      timestamptz,
    closed_at        timestamptz
);

create index if not exists reports_student_idx on public.reports (student_id, created_at desc);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_updated_idx on public.reports (updated_at desc);

create table if not exists public.report_messages (
    id                 uuid primary key default gen_random_uuid(),
    report_id          uuid not null references public.reports (id) on delete cascade,
    sender_kind        text not null check (sender_kind in ('student', 'staff')),
    sender_student_id  uuid references public.students (id) on delete set null,
    sender_label       text not null default '',
    body               text not null check (char_length(btrim(body)) between 1 and 4000),
    attachments        text[] not null default '{}',
    is_private         boolean not null default false,
    read_by_student_at timestamptz,
    read_by_staff_at   timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists report_messages_report_idx
    on public.report_messages (report_id, created_at);

create table if not exists public.report_activity_logs (
    id          uuid primary key default gen_random_uuid(),
    report_id   uuid not null references public.reports (id) on delete cascade,
    actor_kind  text not null default 'system'
                check (actor_kind in ('student', 'admin', 'founder', 'system')),
    actor_label text not null default '',
    action      text not null,
    old_value   text,
    new_value   text,
    metadata    jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists report_activity_report_idx
    on public.report_activity_logs (report_id, created_at);

create table if not exists public.report_notifications (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid not null references public.students (id) on delete cascade,
    report_id   uuid not null references public.reports (id) on delete cascade,
    kind        text not null default 'reply' check (kind in
                ('reply', 'status', 'resolved', 'notice')),
    title       text not null,
    body        text not null,
    read_at     timestamptz,
    created_at  timestamptz not null default now()
);

create index if not exists report_notifications_student_idx
    on public.report_notifications (student_id, created_at desc);
create unique index if not exists report_notifications_dedupe_idx
    on public.report_notifications (report_id, kind, md5(title), md5(body));

-- ---------------------------------------------------------------------------
-- 2. updated_at
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_v800_touch()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
    for each row execute function public.bakhi_v800_touch();

drop trigger if exists report_messages_touch on public.report_messages;
create trigger report_messages_touch before update on public.report_messages
    for each row execute function public.bakhi_v800_touch();

-- ---------------------------------------------------------------------------
-- 3. RLS — học sinh chỉ đọc dữ liệu của chính mình.
--    Không có policy INSERT/UPDATE cho client: mọi thao tác ghi đi qua Edge
--    Function dùng service role, nơi quyền được kiểm tra lại.
-- ---------------------------------------------------------------------------
alter table public.reports enable row level security;
alter table public.report_messages enable row level security;
alter table public.report_activity_logs enable row level security;
alter table public.report_notifications enable row level security;

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

drop policy if exists report_messages_select_own on public.report_messages;
create policy report_messages_select_own on public.report_messages
    for select to authenticated
    using (exists (
        select 1 from public.reports r
        where r.id = report_messages.report_id
          and r.student_id = public.bakhi_current_student_id()
    ));

drop policy if exists report_notifications_select_own on public.report_notifications;
create policy report_notifications_select_own on public.report_notifications
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

-- Nhật ký xử lý là dữ liệu quản trị; trình duyệt không đọc trực tiếp.
drop policy if exists report_activity_no_client on public.report_activity_logs;

grant select on public.reports to authenticated;
grant select on public.report_messages to authenticated;
grant select on public.report_notifications to authenticated;

-- Realtime cho thông báo báo cáo (chuông cập nhật ngay, không cần tải lại).
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table public.report_notifications;
        exception when duplicate_object then null;
        end;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Storage: tệp đính kèm báo cáo (riêng tư — chỉ chủ sở hữu ghi/đọc,
--    quản trị viên đọc qua signed URL do Edge Function sinh ra).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-attachments', 'report-attachments', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do update
    set public = false,
        file_size_limit = 5242880,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp',
                                   'image/gif', 'application/pdf'];

drop policy if exists report_files_read_own on storage.objects;
create policy report_files_read_own on storage.objects
    for select to authenticated
    using (
        bucket_id = 'report-attachments'
        and (storage.foldername(name))[1] = public.bakhi_current_student_id()::text
    );

drop policy if exists report_files_upload_own on storage.objects;
create policy report_files_upload_own on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'report-attachments'
        and (storage.foldername(name))[1] = public.bakhi_current_student_id()::text
    );

drop policy if exists report_files_delete_own on storage.objects;
create policy report_files_delete_own on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'report-attachments'
        and (storage.foldername(name))[1] = public.bakhi_current_student_id()::text
    );

-- ===========================================================================
-- Bá Khí 8.5.0 — AI Tutor (gia sư AI)
--
-- Nguyên tắc (xem AGENTS.md, docs/AI_TUTOR_ARCHITECTURE.md):
--   * Mọi bảng của học sinh CHỈ có policy SELECT (đọc dữ liệu của chính mình).
--   * Không có policy INSERT/UPDATE/DELETE: mọi thao tác ghi đi qua Edge
--     Function `ai-tutor-api` bằng service_role, sau khi máy chủ xác minh
--     thiết bị đã gắn với một học sinh đang hoạt động.
--   * Không bảng nào chứa API key. Khoá AI nằm trong Supabase Secrets.
--   * Không có bộ đếm thời gian, không bài thi, không xếp hạng.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Hội thoại
-- ---------------------------------------------------------------------------
create table if not exists public.ai_conversations (
    id              uuid primary key default gen_random_uuid(),
    student_id      uuid not null references public.students (id) on delete cascade,
    title           text not null default 'Hội thoại mới'
                    check (char_length(title) between 1 and 120),
    mode            text not null default 'explain'
                    check (mode in ('explain', 'steps', 'hint', 'check',
                                    'practice', 'mistakes', 'summary', 'socratic')),
    subject         text not null default '' check (char_length(subject) <= 80),
    topic           text not null default '' check (char_length(topic) <= 160),
    last_model      text not null default '' check (char_length(last_model) <= 80),
    last_provider   text not null default '' check (char_length(last_provider) <= 40),
    message_count   integer not null default 0 check (message_count >= 0),
    is_archived     boolean not null default false,
    deleted_at      timestamptz,
    last_message_at timestamptz not null default now(),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists ai_conversations_student_idx
    on public.ai_conversations (student_id, last_message_at desc)
    where deleted_at is null;

create index if not exists ai_conversations_archive_idx
    on public.ai_conversations (student_id, is_archived)
    where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Tin nhắn
-- ---------------------------------------------------------------------------
create table if not exists public.ai_messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
    student_id      uuid not null references public.students (id) on delete cascade,
    role            text not null check (role in ('user', 'assistant')),
    content         text not null check (char_length(content) between 1 and 24000),
    mode            text not null default 'explain' check (char_length(mode) <= 20),
    provider        text not null default '' check (char_length(provider) <= 40),
    model           text not null default '' check (char_length(model) <= 80),
    tokens_in       integer not null default 0 check (tokens_in >= 0),
    tokens_out      integer not null default 0 check (tokens_out >= 0),
    /* Ngữ cảnh học tập đã gửi kèm (chỉ trường cần thiết, đã lọc ở máy chủ). */
    context_ref     jsonb not null default '{}'::jsonb,
    /* Mã lỗi nếu lượt trả lời thất bại (nội dung khi đó là thông báo tiếng Việt). */
    error_code      text not null default '' check (char_length(error_code) <= 40),
    created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
    on public.ai_messages (conversation_id, created_at);

create index if not exists ai_messages_student_idx
    on public.ai_messages (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Nhật ký sử dụng (kiểm soát chi phí)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_logs (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid references public.students (id) on delete cascade,
    action      text not null default 'chat' check (char_length(action) <= 40),
    provider    text not null default '' check (char_length(provider) <= 40),
    model       text not null default '' check (char_length(model) <= 80),
    mode        text not null default '' check (char_length(mode) <= 20),
    tokens_in   integer not null default 0 check (tokens_in >= 0),
    tokens_out  integer not null default 0 check (tokens_out >= 0),
    latency_ms  integer not null default 0 check (latency_ms >= 0),
    ok          boolean not null default true,
    error_code  text not null default '' check (char_length(error_code) <= 40),
    created_at  timestamptz not null default now()
);

create index if not exists ai_usage_logs_student_idx
    on public.ai_usage_logs (student_id, created_at desc);

create index if not exists ai_usage_logs_created_idx
    on public.ai_usage_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Cấu hình AI Tutor (một dòng duy nhất)
--    Không chứa API key: chỉ chọn provider/model và các giới hạn.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_settings (
    id                    smallint primary key default 1 check (id = 1),
    enabled               boolean not null default true,
    provider              text not null default 'google'
                          check (provider in ('google', 'openai', 'groq', 'openrouter',
                                              'mistral', 'deepseek', 'custom')),
    model                 text not null default 'gemini-2.5-flash'
                          check (char_length(model) between 1 and 80),
    fallback_provider     text not null default ''
                          check (fallback_provider in ('', 'google', 'openai', 'groq',
                                                       'openrouter', 'mistral', 'deepseek', 'custom')),
    fallback_model        text not null default '' check (char_length(fallback_model) <= 80),
    routing_enabled       boolean not null default true,
    model_simple          text not null default '' check (char_length(model_simple) <= 80),
    model_complex         text not null default '' check (char_length(model_complex) <= 80),
    model_practice        text not null default '' check (char_length(model_practice) <= 80),
    max_context_messages  integer not null default 12 check (max_context_messages between 2 and 40),
    max_output_tokens     integer not null default 1600 check (max_output_tokens between 128 and 8192),
    timeout_ms            integer not null default 45000 check (timeout_ms between 5000 and 120000),
    daily_requests        integer not null default 120 check (daily_requests between 0 and 5000),
    daily_tokens          integer not null default 120000 check (daily_tokens between 0 and 5000000),
    save_history          boolean not null default true,
    use_lesson_context    boolean not null default true,
    language              text not null default 'vi' check (language in ('vi', 'en')),
    allowed_modes         jsonb not null default
                          '["explain","steps","hint","check","practice","mistakes","summary","socratic"]'::jsonb,
    system_prompt         text not null default '' check (char_length(system_prompt) <= 12000),
    system_prompt_version integer not null default 1,
    updated_at            timestamptz not null default now()
);

insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Lịch sử System Prompt (Founder chỉnh sửa, khôi phục phiên bản trước)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_prompt_versions (
    id          uuid primary key default gen_random_uuid(),
    version     integer not null,
    content     text not null check (char_length(content) between 1 and 12000),
    note        text not null default '' check (char_length(note) <= 200),
    saved_by    text not null default 'founder' check (char_length(saved_by) <= 40),
    created_at  timestamptz not null default now(),
    unique (version)
);

-- ---------------------------------------------------------------------------
-- 6. Cập nhật updated_at
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_ai_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

revoke all on function public.bakhi_ai_touch() from public;

drop trigger if exists ai_conversations_touch on public.ai_conversations;
create trigger ai_conversations_touch
    before update on public.ai_conversations
    for each row execute function public.bakhi_ai_touch();

drop trigger if exists ai_settings_touch on public.ai_settings;
create trigger ai_settings_touch
    before update on public.ai_settings
    for each row execute function public.bakhi_ai_touch();

-- ---------------------------------------------------------------------------
-- 7. Row Level Security — học sinh chỉ ĐỌC dữ liệu của chính mình
-- ---------------------------------------------------------------------------
alter table public.ai_conversations  enable row level security;
alter table public.ai_messages       enable row level security;
alter table public.ai_usage_logs     enable row level security;
alter table public.ai_settings       enable row level security;
alter table public.ai_prompt_versions enable row level security;

drop policy if exists ai_conversations_own_read on public.ai_conversations;
create policy ai_conversations_own_read on public.ai_conversations
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

drop policy if exists ai_messages_own_read on public.ai_messages;
create policy ai_messages_own_read on public.ai_messages
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

drop policy if exists ai_usage_logs_own_read on public.ai_usage_logs;
create policy ai_usage_logs_own_read on public.ai_usage_logs
    for select to authenticated
    using (student_id = public.bakhi_current_student_id());

-- Cấu hình và system prompt: KHÔNG mở cho học sinh. Chỉ service_role đọc,
-- và Edge Function chỉ trả về tập trường công khai (không có khoá, không có
-- system prompt đầy đủ). Không có policy nào = không ai đọc qua RLS.

-- ---------------------------------------------------------------------------
-- 8. Hàm đọc giới hạn sử dụng trong 24 giờ (Edge Function gọi bằng service_role)
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_ai_usage(p_student uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select jsonb_build_object(
        'requests', coalesce(count(*), 0),
        'tokens', coalesce(sum(tokens_in + tokens_out), 0),
        'failed', coalesce(count(*) filter (where not ok), 0)
    )
    from public.ai_usage_logs
    where student_id = p_student
      and created_at > now() - interval '24 hours';
$$;

revoke all on function public.bakhi_ai_usage(uuid) from public;

-- ---------------------------------------------------------------------------
-- 9. Kiểm soát toàn vẹn sau migration
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from public.ai_settings where id = 1) then
        raise exception 'ai_settings thiếu dòng cấu hình id = 1';
    end if;
    if to_regclass('public.ai_conversations') is null
       or to_regclass('public.ai_messages') is null
       or to_regclass('public.ai_usage_logs') is null then
        raise exception 'thiếu bảng AI Tutor sau migration';
    end if;
end;
$$;

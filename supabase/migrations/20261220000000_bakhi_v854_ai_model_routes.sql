-- =============================================================================
-- Bá Khí 8.5.4 — Danh sách model AI có thứ tự ưu tiên (Primary + Fallback N)
--
-- Vì sao có bảng này: 8.5.2 chỉ cho phép MỘT provider chính + MỘT provider dự
-- phòng, khai báo bằng hai nhóm cột trong ai_settings. Founder Dashboard 8.5.4
-- cần thêm nhiều model và đổi thứ tự, nên danh sách nằm ở bảng riêng:
--   position 0  → Primary
--   position 1+ → Fallback 1, Fallback 2, ...
--
-- Bảo mật:
--   * Bảng bật RLS và KHÔNG có policy nào → anon/authenticated không đọc/ghi được.
--   * Chỉ service_role (Edge Function) đọc/ghi; API key không bao giờ trả về client.
--   * KHÔNG có cột chứa khoá: mỗi dòng chỉ ghi TÊN secret (`key_ref`, vd
--     AI_TUTOR_KEY_3). Khoá thật nằm trong Supabase Edge Function Secrets và chỉ
--     được đọc bằng Deno.env. Để trống thì máy chủ dùng AI_TUTOR_API_KEY cho
--     Primary và AI_TUTOR_FALLBACK_API_KEY cho các dòng fallback.
--
-- Tương thích ngược: bảng rỗng → máy chủ dùng cấu hình cũ trong ai_settings
-- (provider/model + fallback_provider/fallback_model). Không xoá dữ liệu nào.
-- =============================================================================

begin;

create table if not exists public.ai_model_routes (
    id uuid primary key default gen_random_uuid(),
    position integer not null default 0,
    label text not null default '',
    provider text not null,
    model text not null,
    key_ref text not null default '',
    enabled boolean not null default true,
    last_status text not null default '',
    last_error_code text not null default '',
    last_latency_ms integer not null default 0,
    last_checked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ai_model_routes_provider_check check (
        provider in ('groq','google','openai','cerebras','openrouter','mistral','deepseek','custom')
    ),
    constraint ai_model_routes_model_check check (model ~ '^[A-Za-z0-9._:/-]{1,80}$'),
    constraint ai_model_routes_position_check check (position >= 0)
);

create index if not exists ai_model_routes_position_idx
    on public.ai_model_routes (position, created_at);

create or replace function public.bk_ai_routes_touch()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists ai_model_routes_touch on public.ai_model_routes;
create trigger ai_model_routes_touch
    before update on public.ai_model_routes
    for each row execute function public.bk_ai_routes_touch();

alter table public.ai_model_routes enable row level security;
revoke all on public.ai_model_routes from anon, authenticated;
grant select, insert, update, delete on public.ai_model_routes to service_role;

-- Nhật ký từng lần thử model trong một câu hỏi (lịch sử fallback của tab Logs).
create table if not exists public.ai_model_attempts (
    id uuid primary key default gen_random_uuid(),
    route_id uuid,
    student_id uuid,
    action text not null default 'chat',
    provider text not null default '',
    model text not null default '',
    role text not null default 'primary',
    position integer not null default 0,
    ok boolean not null default false,
    status integer not null default 0,
    error_code text not null default '',
    latency_ms integer not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists ai_model_attempts_created_idx
    on public.ai_model_attempts (created_at desc);
create index if not exists ai_model_attempts_student_idx
    on public.ai_model_attempts (student_id, created_at desc);

alter table public.ai_model_attempts enable row level security;
revoke all on public.ai_model_attempts from anon, authenticated;
grant select, insert, update, delete on public.ai_model_attempts to service_role;

-- Giới hạn token vào/ra tách riêng + số lần thử lại cấu hình được (8.5.4).
alter table public.ai_settings
    add column if not exists max_input_tokens integer not null default 3000;
alter table public.ai_settings
    add column if not exists max_retries integer not null default 1;
-- Dự phòng cho tương lai: máy chủ hiện trả toàn bộ câu trả lời một lần,
-- nên streaming mặc định tắt và giao diện ghi rõ "chưa hỗ trợ".
alter table public.ai_settings
    add column if not exists streaming_enabled boolean not null default false;

alter table public.ai_settings drop constraint if exists ai_settings_input_tokens_check;
alter table public.ai_settings add constraint ai_settings_input_tokens_check
    check (max_input_tokens between 256 and 200000);
alter table public.ai_settings drop constraint if exists ai_settings_retries_check;
alter table public.ai_settings add constraint ai_settings_retries_check
    check (max_retries between 0 and 3);

-- Chuyển cấu hình đang chạy thành các dòng model — CHỈ khi bảng còn rỗng.
insert into public.ai_model_routes (position, label, provider, model)
select 0, coalesce(nullif(provider, ''), 'groq'), coalesce(nullif(provider, ''), 'groq'),
       coalesce(nullif(model, ''), 'openai/gpt-oss-20b')
from public.ai_settings
where id = 1
  and not exists (select 1 from public.ai_model_routes);

insert into public.ai_model_routes (position, label, provider, model)
select 1, coalesce(nullif(fallback_provider, ''), 'google'), coalesce(nullif(fallback_provider, ''), 'google'),
       fallback_model
from public.ai_settings
where id = 1
  and coalesce(fallback_provider, '') <> ''
  and coalesce(fallback_model, '') <> ''
  and fallback_enabled is not false
  and (select count(*) from public.ai_model_routes) = 1;

-- Cổng kiểm tra sau migration.
do $$
begin
    if not exists (select 1 from public.ai_model_routes) then
        raise exception 'ai_model_routes chưa có dòng Primary nào';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_settings'
          and column_name = 'max_input_tokens'
    ) then
        raise exception 'thiếu cột ai_settings.max_input_tokens';
    end if;
end $$;

commit;

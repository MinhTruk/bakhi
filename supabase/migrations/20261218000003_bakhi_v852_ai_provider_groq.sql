-- ===========================================================================
-- Bá Khí 8.5.2 — AI Tutor: cấu hình provider Groq + thống kê token
--
-- Thay đổi (không xoá dữ liệu, không tạo bảng trùng):
--   1. Cho phép provider `cerebras` (OpenAI-compatible) trong cấu hình.
--   2. Thêm `ai_settings.fallback_enabled` — Founder bật/tắt dự phòng từ UI.
--   3. Thêm `ai_usage_logs.fell_back` và `.tokens_estimated` để phân biệt
--      lượt chạy qua provider dự phòng và token ước lượng với token thật.
--   4. Đổi mặc định sang Groq + `openai/gpt-oss-20b`, dự phòng Google.
--   5. Hàm tổng hợp thống kê token theo ngày/tuần/tháng, lọc provider/model.
--
-- KHÔNG chứa API key. Khoá vẫn chỉ nằm trong Supabase Edge Function Secrets
-- (`AI_TUTOR_API_KEY`, `AI_TUTOR_FALLBACK_API_KEY`).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Provider `cerebras`
-- ---------------------------------------------------------------------------
alter table public.ai_settings drop constraint if exists ai_settings_provider_check;
alter table public.ai_settings add constraint ai_settings_provider_check
    check (provider in ('groq', 'google', 'openai', 'cerebras',
                        'openrouter', 'mistral', 'deepseek', 'custom'));

alter table public.ai_settings drop constraint if exists ai_settings_fallback_provider_check;
alter table public.ai_settings add constraint ai_settings_fallback_provider_check
    check (fallback_provider in ('', 'groq', 'google', 'openai', 'cerebras',
                                 'openrouter', 'mistral', 'deepseek', 'custom'));

-- ---------------------------------------------------------------------------
-- 2. Bật/tắt dự phòng (máy chủ vẫn yêu cầu có khoá dự phòng mới chạy)
-- ---------------------------------------------------------------------------
alter table public.ai_settings
    add column if not exists fallback_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 3. Cột thống kê trung thực
-- ---------------------------------------------------------------------------
alter table public.ai_usage_logs
    add column if not exists fell_back boolean not null default false;
alter table public.ai_usage_logs
    add column if not exists tokens_estimated boolean not null default false;

create index if not exists ai_usage_logs_provider_idx
    on public.ai_usage_logs (provider, created_at desc);

create index if not exists ai_usage_logs_model_idx
    on public.ai_usage_logs (model, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Mặc định mới: Groq là provider chính, Google là dự phòng
--    (chỉ đổi giá trị mặc định của cột; dòng cấu hình hiện có cập nhật ở mục 5)
-- ---------------------------------------------------------------------------
alter table public.ai_settings alter column provider set default 'groq';
alter table public.ai_settings alter column model set default 'openai/gpt-oss-20b';
alter table public.ai_settings alter column fallback_provider set default 'google';
alter table public.ai_settings alter column fallback_model set default 'gemini-3.8-flash';
alter table public.ai_settings alter column max_context_messages set default 10;
alter table public.ai_settings alter column max_output_tokens set default 2048;
alter table public.ai_settings alter column timeout_ms set default 30000;

-- ---------------------------------------------------------------------------
-- 5. Áp cấu hình cho dòng id = 1
--    Không đụng daily_requests / daily_tokens / system_prompt / allowed_modes:
--    đó là quyết định của Founder, không phải một phần của bản nâng cấp này.
-- ---------------------------------------------------------------------------
update public.ai_settings
set provider             = 'groq',
    model                = 'openai/gpt-oss-20b',
    fallback_provider    = 'google',
    fallback_model       = 'gemini-3.8-flash',
    fallback_enabled     = true,
    max_context_messages = least(max_context_messages, 10),
    max_output_tokens    = 2048,
    timeout_ms           = 30000
where id = 1;

-- ---------------------------------------------------------------------------
-- 6. Thống kê sử dụng (Edge Function gọi bằng service_role)
--    Tổng hợp phía SQL để không phụ thuộc giới hạn 1000 dòng của PostgREST.
--    Không chứa nội dung hội thoại — chỉ số đếm và token.
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_ai_usage_stats(
    p_since timestamptz,
    p_provider text,
    p_model text
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    with base as (
        select *
        from public.ai_usage_logs
        where created_at >= coalesce(p_since, now() - interval '7 days')
          and (coalesce(nullif(p_provider, ''), '') = '' or provider = p_provider)
          and (coalesce(nullif(p_model, ''), '') = '' or model = p_model)
    ), totals as (
        select count(*)                                        as requests,
               count(*) filter (where ok)                      as succeeded,
               count(*) filter (where not ok)                  as failed,
               coalesce(sum(tokens_in), 0)                     as tokens_in,
               coalesce(sum(tokens_out), 0)                    as tokens_out,
               count(*) filter (where fell_back)               as fallbacks,
               count(*) filter (where tokens_estimated)        as estimated_requests,
               coalesce(round(avg(latency_ms) filter (where ok))::int, 0) as avg_latency_ms
        from base
    ), by_provider as (
        select provider,
               count(*)                                        as requests,
               count(*) filter (where not ok)                  as failed,
               coalesce(sum(tokens_in + tokens_out), 0)        as tokens
        from base
        group by provider
        order by requests desc
    ), by_model as (
        select provider, model,
               count(*)                                        as requests,
               count(*) filter (where not ok)                  as failed,
               coalesce(sum(tokens_in + tokens_out), 0)        as tokens,
               coalesce(round(avg(latency_ms) filter (where ok))::int, 0) as avg_latency_ms
        from base
        group by provider, model
        order by requests desc
    ), by_mode as (
        select mode,
               count(*)                                        as requests,
               coalesce(sum(tokens_in + tokens_out), 0)        as tokens
        from base
        where mode <> ''
        group by mode
        order by requests desc
    ), by_day as (
        select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
               count(*)                                        as requests,
               coalesce(sum(tokens_in + tokens_out), 0)        as tokens,
               count(*) filter (where not ok)                  as failed
        from base
        group by 1
        order by 1 desc
    )
    select jsonb_build_object(
        'totals',     (select to_jsonb(t) from totals t),
        'byProvider', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from by_provider p),
        'byModel',    (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from by_model m),
        'byMode',     (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from by_mode x),
        'byDay',      (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from by_day d)
    );
$$;

revoke all on function public.bakhi_ai_usage_stats(timestamptz, text, text) from public;

-- ---------------------------------------------------------------------------
-- 7. Kiểm tra toàn vẹn sau migration
-- ---------------------------------------------------------------------------
do $$
declare
    v_provider text;
    v_model    text;
begin
    select provider, model into v_provider, v_model from public.ai_settings where id = 1;
    if v_provider is null then
        raise exception 'ai_settings thiếu dòng cấu hình id = 1';
    end if;
    if v_provider <> 'groq' or v_model <> 'openai/gpt-oss-20b' then
        raise exception 'cấu hình AI Tutor chưa chuyển sang Groq (đang: % / %)', v_provider, v_model;
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_settings'
          and column_name = 'fallback_enabled'
    ) then
        raise exception 'thiếu cột ai_settings.fallback_enabled';
    end if;
end;
$$;

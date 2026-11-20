-- ============================================================================
-- Bá Khí v8.2.0 — Learning Intelligence
--
-- Mục tiêu:
--   1. Cho phép student_progress lưu thêm 5 khoá học tập mới
--      (signals, badges, plans, goals, revisionSessions) — cùng MỘT bảng,
--      không mở bảng thứ hai cho dữ liệu đã có nguồn sự thật.
--   2. Bảo vệ bảng trước payload quá lớn (đồng bộ từ thiết bị).
--   3. Cung cấp view CHỈ ĐỌC suy ra từ JSONB cho truy vấn SQL/quản trị:
--      không lưu trùng dữ liệu, không tạo bảng analytics.
--
-- An toàn:
--   · Idempotent: chạy lại nhiều lần không lỗi, không nhân bản bản ghi.
--   · Không xoá bảng/cột/dòng nào; không đổi kiểu dữ liệu hiện có.
--   · Chỉ mở rộng ràng buộc progress_key (dữ liệu cũ vẫn hợp lệ).
--
-- Rollback (chạy thủ công khi cần):
--   drop view if exists public.learning_plans_v;
--   drop view if exists public.learning_mistakes_v;
--   drop trigger if exists student_progress_guard on public.student_progress;
--   drop function if exists public.bakhi_progress_guard();
--   drop index if exists public.student_progress_key_idx;
--   -- Ràng buộc: chỉ thu hẹp lại sau khi đã xoá các dòng dùng khoá mới.
--   alter table public.student_progress drop constraint if exists student_progress_progress_key_check;
--   alter table public.student_progress add constraint student_progress_progress_key_check
--       check (progress_key in ('practice','review','notes','bookmarks','history','achievements','prefs'));
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Mở rộng danh sách progress_key
--    `review` GIỮ NGUYÊN là khoá của Sổ tay câu sai (schema được mở rộng
--    tại chỗ bởi bk-core.js sanitize), nên KHÔNG có bước chuyển dữ liệu nào.
-- ---------------------------------------------------------------------------
alter table public.student_progress
    drop constraint if exists student_progress_progress_key_check;

alter table public.student_progress
    add constraint student_progress_progress_key_check
    check (progress_key in (
        'practice', 'review', 'notes', 'bookmarks', 'history',
        'achievements', 'prefs', 'signals', 'badges',
        'plans', 'goals', 'revisionSessions'
    ));

create index if not exists student_progress_key_idx
    on public.student_progress (progress_key, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. Chặn payload quá lớn (1 MB JSONB / khoá) — Edge Function đã giới hạn
--    1.5 MB cho cả request, đây là lớp bảo vệ thứ hai ở tầng dữ liệu.
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_progress_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if pg_column_size(new.progress_data) > 1048576 then
        raise exception 'PROGRESS_PAYLOAD_TOO_LARGE'
            using hint = 'Mỗi khoá tiến trình tối đa 1 MB.';
    end if;
    return new;
end;
$$;

drop trigger if exists student_progress_guard on public.student_progress;
create trigger student_progress_guard
    before insert or update on public.student_progress
    for each row execute function public.bakhi_progress_guard();

-- ---------------------------------------------------------------------------
-- 3. View chỉ đọc — dữ liệu DẪN XUẤT, không lưu trùng.
--    security_invoker: RLS của student_progress vẫn áp dụng cho người gọi.
-- ---------------------------------------------------------------------------
create or replace view public.learning_mistakes_v
with (security_invoker = true) as
select
    p.student_id,
    m ->> 'id'                                   as mistake_id,
    m ->> 'key'                                  as question_key,
    nullif(m ->> 'questionId', '')               as question_id,
    nullif(m ->> 'subject', '')                  as subject,
    nullif(m ->> 'topic', '')                    as topic,
    coalesce(nullif(m ->> 'status', ''), 'new')  as status,
    coalesce(nullif(m ->> 'errorType', ''), 'unclassified') as error_type,
    coalesce((m ->> 'wrong')::int, 0)            as wrong_count,
    coalesce((m ->> 'right')::int, 0)            as right_count,
    coalesce((m ->> 'streak')::int, 0)           as streak,
    coalesce((m ->> 'pinned')::boolean, false)   as pinned,
    case when nullif(m ->> 'nextReview', '') is null then null
         else to_timestamp((m ->> 'nextReview')::bigint / 1000.0) end as next_review_at,
    case when nullif(m ->> 'createdAt', '') is null then null
         else to_timestamp((m ->> 'createdAt')::bigint / 1000.0) end as created_at,
    case when nullif(m ->> 'updatedAt', '') is null then null
         else to_timestamp((m ->> 'updatedAt')::bigint / 1000.0) end as updated_at,
    p.updated_at                                 as synced_at
from public.student_progress p
cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.progress_data) = 'array' then p.progress_data else '[]'::jsonb end
) as m
where p.progress_key = 'review';

create or replace view public.learning_plans_v
with (security_invoker = true) as
select
    p.student_id,
    t ->> 'id'                                   as plan_id,
    nullif(t ->> 'title', '')                    as title,
    nullif(t ->> 'subject', '')                  as subject,
    nullif(t ->> 'date', '')                     as plan_date,
    coalesce(nullif(t ->> 'status', ''), 'planned') as status,
    coalesce((t ->> 'durationMin')::int, 0)      as duration_min,
    nullif(t ->> 'goalId', '')                   as goal_id,
    p.updated_at                                 as synced_at
from public.student_progress p
cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.progress_data) = 'array' then p.progress_data else '[]'::jsonb end
) as t
where p.progress_key = 'plans';

revoke all on public.learning_mistakes_v from anon, authenticated;
revoke all on public.learning_plans_v from anon, authenticated;
grant select on public.learning_mistakes_v to authenticated;
grant select on public.learning_plans_v to authenticated;

comment on view public.learning_mistakes_v is
    'Bá Khí 8.2.0 — view dẫn xuất từ student_progress(review). Không phải nguồn sự thật.';
comment on view public.learning_plans_v is
    'Bá Khí 8.2.0 — view dẫn xuất từ student_progress(plans). Không phải nguồn sự thật.';

commit;

-- ============================================================================
-- Bá Khí 8.4.4 — Đếm lượt dùng ẩn danh + kiểm tra sức khoẻ tiến trình
--
-- 1. usage_counters: số đếm tổng hợp theo NGÀY và TÍNH NĂNG.
--    Không có student_id, không IP, không user-agent, không lịch sử cá nhân —
--    chỉ để biết "tuần này học sinh dùng giao diện nào / tìm kiếm bao nhiêu lần".
--    Ghi qua RPC bk_usage_ping(feature); bảng không có policy ghi nào.
--
-- 2. bk_gam_health_drift(): đối chiếu sổ XP (xp_transactions) với bảng suy ra
--    (user_progression) và kiểm tra cấp có khớp công thức bk_gam_level().
--    Chỉ service_role được gọi (dashboard quản trị / kiểm tra định kỳ).
--
-- AN TOÀN KHI CHẠY LẠI: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- Không sửa dữ liệu tiến trình, không cấp XP.
--
-- Chạy: supabase db push
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Bộ đếm lượt dùng ẩn danh
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
    day      date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    feature  text not null check (feature ~ '^[a-z0-9_.:-]{2,40}$'),
    hits     bigint not null default 0 check (hits >= 0),
    primary key (day, feature)
);

alter table public.usage_counters enable row level security;

-- Không policy nào: trình duyệt không đọc/ghi trực tiếp được, chỉ qua RPC dưới.
revoke all on table public.usage_counters from public, anon, authenticated;

create or replace function public.bk_usage_ping(p_feature text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_feature text := lower(coalesce(p_feature, ''));
begin
    /* Whitelist hình dạng tên tính năng: chặn chuỗi rác và dữ liệu cá nhân. */
    if v_feature !~ '^[a-z0-9_.:-]{2,40}$' then
        return;
    end if;

    insert into public.usage_counters (day, feature, hits)
    values ((now() at time zone 'Asia/Ho_Chi_Minh')::date, v_feature, 1)
    on conflict (day, feature) do update
        set hits = public.usage_counters.hits + 1;
end;
$$;

revoke all on function public.bk_usage_ping(text) from public;
grant execute on function public.bk_usage_ping(text) to anon, authenticated;

comment on function public.bk_usage_ping(text) is
    'Tăng bộ đếm ẩn danh cho một tính năng (8.4.4). Không lưu danh tính người học.';

-- ---------------------------------------------------------------------------
-- 2. Sức khoẻ dữ liệu tiến trình: sổ XP ↔ user_progression ↔ cấp
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_health_drift()
returns table (
    student_id     uuid,
    ledger_xp      bigint,
    stored_xp      bigint,
    xp_delta       bigint,
    stored_level   integer,
    expected_level integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
    with ledger as (
        select t.student_id, coalesce(sum(t.amount), 0)::bigint as total
          from public.xp_transactions t
         where t.status <> 'reversed'
         group by t.student_id
    )
    select p.student_id,
           coalesce(l.total, 0) as ledger_xp,
           p.total_xp          as stored_xp,
           coalesce(l.total, 0) - p.total_xp as xp_delta,
           p.level             as stored_level,
           public.bk_gam_level(p.total_xp) as expected_level
      from public.user_progression p
      left join ledger l on l.student_id = p.student_id
     where coalesce(l.total, 0) <> p.total_xp
        or p.level <> public.bk_gam_level(p.total_xp)
     order by abs(coalesce(l.total, 0) - p.total_xp) desc;
$$;

revoke all on function public.bk_gam_health_drift() from public, anon, authenticated;

comment on function public.bk_gam_health_drift() is
    'Trả về các hồ sơ có XP/cấp lệch so với sổ XP (8.4.4). Chỉ service_role gọi.';

commit;

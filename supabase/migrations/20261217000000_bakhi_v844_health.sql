-- ============================================================================
-- Bá Khí 8.4.4 — Kiểm tra sức khoẻ dữ liệu tiến trình
--
-- bk_gam_health_drift(): đối chiếu sổ XP (xp_transactions) với bảng suy ra
-- (user_progression) và kiểm tra cấp có khớp công thức bk_gam_level().
-- Chỉ service_role được gọi (dashboard quản trị / kiểm tra định kỳ).
--
-- Bộ đếm lượt dùng ẩn danh (usage_counters) đã được loại bỏ khỏi 8.4.4 nên
-- migration này KHÔNG tạo bảng hay RPC đếm lượt dùng nào.
--
-- AN TOÀN KHI CHẠY LẠI: CREATE OR REPLACE FUNCTION.
-- Không sửa dữ liệu tiến trình, không cấp XP.
--
-- Chạy: supabase db push
-- ============================================================================

begin;

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

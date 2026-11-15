-- ============================================================================
-- Bá Khí — Báo cáo quyền thật (chỉ đọc) cho Administrator Dashboard.
--
-- Mục tiêu:
--   1. Mô-đun Quyền hiển thị dữ liệu thật từ catalog: hàm trong schema public,
--      bảng + RLS + số policy, và từng policy đang áp dụng.
--   2. Không tạo vai trò giả, không cấp thêm quyền: mọi thứ chỉ đọc.
--   3. Chỉ service_role (Edge Function admin-actions) gọi được; anon và
--      authenticated bị thu hồi quyền thực thi.
--
-- Hàm chỉ đọc catalog, không đụng dữ liệu người dùng. Chạy lại nhiều lần vẫn
-- an toàn (create or replace).
--
-- Hoàn tác (nếu thật sự cần):
--   drop function if exists public.bakhi_permissions_report();
-- ============================================================================

create or replace function public.bakhi_permissions_report()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    with fn as (
        select
            n.nspname as schema_name,
            p.proname as name,
            p.prosecdef as security_definer,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
            has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        order by p.proname
    ),
    tbl as (
        select
            n.nspname as schema_name,
            c.relname as name,
            c.relrowsecurity as rls_enabled,
            (
                select count(*)
                from pg_policies pol
                where pol.schemaname = n.nspname and pol.tablename = c.relname
            ) as policy_count,
            has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
            has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
            has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
            has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname
    ),
    pol as (
        select
            schemaname as schema_name,
            tablename as table_name,
            policyname as name,
            cmd as command,
            permissive,
            roles::text[] as roles
        from pg_policies
        where schemaname = 'public'
        order by tablename, policyname
    )
    select jsonb_build_object(
        'generated_at', now(),
        'functions', coalesce((select jsonb_agg(to_jsonb(fn)) from fn), '[]'::jsonb),
        'tables', coalesce((select jsonb_agg(to_jsonb(tbl)) from tbl), '[]'::jsonb),
        'policies', coalesce((select jsonb_agg(to_jsonb(pol)) from pol), '[]'::jsonb)
    );
$$;

revoke all on function public.bakhi_permissions_report() from public;
revoke all on function public.bakhi_permissions_report() from anon, authenticated;
grant execute on function public.bakhi_permissions_report() to service_role;

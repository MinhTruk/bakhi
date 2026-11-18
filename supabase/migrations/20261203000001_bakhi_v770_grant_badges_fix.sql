-- ============================================================================
-- Bá Khí 7.7.0 — Sửa RPC bakhi_grant_badges.
--
-- Lỗi: hàm khai báo OUT parameter tên `badge_id` (RETURNS TABLE(badge_id, ...))
-- nên `on conflict (student_id, badge_id)` bị Postgres coi là tham chiếu mơ hồ
-- giữa biến PL/pgSQL và cột bảng:
--     42702 column reference "badge_id" is ambiguous
-- Hậu quả: badges.grantAll / founder.grantAll trả 500 và không cấp được badge,
-- dù giao diện vẫn gửi yêu cầu.
--
-- Cách sửa: giữ nguyên chữ ký và kiểu trả về (tương thích client), thêm
-- `#variable_conflict use_column` để ON CONFLICT phân giải theo cột bảng.
-- An toàn: create or replace, không sửa dữ liệu, không đổi tên tham số.
-- ============================================================================

create or replace function public.bakhi_grant_badges(
    p_student uuid,
    p_badges text[],
    p_reason text,
    p_actor text
)
returns table (badge_id text, inserted boolean)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
    v_active boolean;
begin
    select s.is_active into v_active from public.students s where s.id = p_student;
    if v_active is null then
        raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not v_active then
        raise exception 'STUDENT_INACTIVE' using errcode = 'P0001';
    end if;
    if p_badges is null or array_length(p_badges, 1) is null then
        return;
    end if;

    return query
    with input as (
        select distinct btrim(b) as b
        from unnest(p_badges) as b
        where b is not null
          and btrim(b) <> ''
          and char_length(btrim(b)) <= 64
    ),
    ins as (
        insert into public.student_badges
            (student_id, badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason)
        select p_student, i.b, 'admin', false, true, now(),
               left(coalesce(p_actor, 'founder-console'), 60),
               left(coalesce(p_reason, ''), 200)
        from input i
        on conflict (student_id, badge_id) do nothing
        returning student_badges.badge_id
    )
    select i.b, (i.b in (select ins.badge_id from ins)) as inserted
    from input i
    order by i.b;
end;
$function$;

revoke all on function public.bakhi_grant_badges(uuid, text[], text, text) from anon, authenticated;

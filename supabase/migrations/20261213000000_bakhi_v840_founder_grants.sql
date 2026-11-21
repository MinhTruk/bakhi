-- ============================================================================
-- Bá Khí 8.4.0 — Giao diện theo mùa + dấu vết cấp cây kỹ năng của Founder
--
-- AN TOÀN KHI CHẠY LẠI: mọi câu lệnh đều idempotent (if not exists /
-- on conflict do nothing). Không xoá bảng, không xoá cột, không đổi kiểu dữ
-- liệu đang dùng. Không tạo hệ thống thứ hai cho cùng một chức năng.
--
-- PHẠM VI
--   1. Thêm 2 giao diện theo mùa vào reward_catalog (kind = 'theme').
--   2. Đánh dấu node kỹ năng nào do Founder cấp (founder_granted) để sau này
--      phân biệt với node học sinh tự mở, phục vụ yêu cầu thu hồi.
--   3. Bảng founder_skill_grants ghi ai cấp, khi nào, bao nhiêu node.
--
-- GHI CHÚ TRIỂN KHAI
--   Migration này CHƯA được áp dụng lên Supabase trong phiên làm việc 8.4.0
--   (không có quyền truy cập project trong môi trường chạy). Chạy bằng:
--     supabase db push            # hoặc: supabase migration up
--   Sau khi áp dụng: giao diện Halloween/Giáng Sinh xuất hiện trong Kho vật
--   phẩm và có thể trao bằng tab Gamification → Trao vật phẩm.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Giao diện theo mùa
-- ---------------------------------------------------------------------------
insert into public.reward_catalog (id, kind, name, description, icon, rarity, sort_order)
values
    ('theme-halloween', 'theme', 'Giao diện Halloween',
     'Đêm Halloween: bí ngô khắc mặt phát sáng, dơi bay và tông cam - tím.',
     'fa-ghost', 'epic', 300),
    ('theme-christmas', 'theme', 'Giao diện Giáng Sinh',
     'Mùa đông xanh đỏ: tuyết rơi liên tục và cây thông trang trí.',
     'fa-tree', 'legendary', 310)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Dấu vết cấp cây kỹ năng của Founder
-- ---------------------------------------------------------------------------
alter table public.user_skill_progress
    add column if not exists founder_granted boolean not null default false;

comment on column public.user_skill_progress.founder_granted is
    'true = node được Founder cấp (bỏ qua điều kiện thường). Node học sinh tự mở giữ false.';

create table if not exists public.founder_skill_grants (
    student_id     uuid primary key references public.students (id) on delete cascade,
    granted_by     text not null default 'founder' check (char_length(granted_by) <= 80),
    granted_at     timestamptz not null default now(),
    revoked_at     timestamptz,
    nodes_granted  integer not null default 0 check (nodes_granted >= 0),
    detail         jsonb not null default '{}'::jsonb
);

comment on table public.founder_skill_grants is
    'Lần cấp trọn cây kỹ năng gần nhất của Founder cho một học sinh (8.4.0). '
    'Không chứa dữ liệu học tập; thu hồi chỉ đụng tới node có founder_granted = true.';

create index if not exists founder_skill_grants_granted_idx
    on public.founder_skill_grants (granted_at desc);

alter table public.founder_skill_grants enable row level security;

/* Chỉ máy chủ (service_role) đọc/ghi; trình duyệt không truy cập trực tiếp.
   Mọi thao tác đi qua gamification-api sau khi kiểm tra scope founder. */
drop policy if exists founder_skill_grants_service on public.founder_skill_grants;
revoke all on table public.founder_skill_grants from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Đọc trạng thái cấp cây (chỉ đọc, dùng cho Founder Dashboard)
-- ---------------------------------------------------------------------------
create or replace function public.bk_gam_founder_tree_status(p_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_total     integer;
    v_completed integer;
    v_founder   integer;
    v_row       record;
begin
    select count(*) into v_total
      from public.skill_tree_nodes where is_active is not false;

    select count(*) filter (where status = 'completed'),
           count(*) filter (where status = 'completed' and founder_granted)
      into v_completed, v_founder
      from public.user_skill_progress
     where student_id = p_student;

    select granted_at, revoked_at, nodes_granted into v_row
      from public.founder_skill_grants where student_id = p_student;

    return jsonb_build_object(
        'student_id', p_student,
        'total_nodes', coalesce(v_total, 0),
        'completed_nodes', coalesce(v_completed, 0),
        'founder_nodes', coalesce(v_founder, 0),
        'organic_nodes', greatest(0, coalesce(v_completed, 0) - coalesce(v_founder, 0)),
        'granted_at', v_row.granted_at,
        'revoked_at', v_row.revoked_at,
        'nodes_granted', coalesce(v_row.nodes_granted, 0)
    );
end;
$$;

revoke all on function public.bk_gam_founder_tree_status(uuid) from public, anon, authenticated;

comment on function public.bk_gam_founder_tree_status(uuid) is
    'Trạng thái cây kỹ năng của một học sinh: tổng node, đã xong, do Founder cấp, tự mở (8.4.0).';

commit;

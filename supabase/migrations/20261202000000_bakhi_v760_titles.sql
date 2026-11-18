-- ============================================================================
-- Bá Khí 7.6.0 — Hệ thống Danh hiệu (Title), tách biệt hoàn toàn với badge,
-- khung avatar và thành tích.
--
-- Nguyên tắc an toàn:
--   * Chỉ thêm bảng mới, không sửa/xoá dữ liệu cũ.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--   * Trình duyệt chỉ được ĐỌC danh hiệu (chat cần hiển thị danh hiệu của
--     người khác); mọi thao tác ghi đi qua Edge Function service_role.
-- ============================================================================

-- 1. Danh mục danh hiệu -------------------------------------------------------
create table if not exists public.bakhi_titles (
    id              text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
    name            text not null check (char_length(btrim(name)) between 1 and 60),
    -- Nhãn ngắn hiển thị trước tên trong chat (viết hoa, tối đa 24 ký tự).
    short           text not null default '' check (char_length(short) <= 24),
    color           text not null default '' check (char_length(color) <= 24),
    icon            text not null default '' check (char_length(icon) <= 40),
    description     text not null default '' check (char_length(description) <= 240),
    sort_order      integer not null default 100,
    founder_only    boolean not null default false,
    active          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.bakhi_titles is
    'Danh mục danh hiệu hiển thị trước tên học sinh trong chat. Độc lập với badge, khung avatar và thành tích.';

-- 2. Danh hiệu đang gắn cho từng học sinh (mỗi học sinh một danh hiệu) --------
create table if not exists public.student_titles (
    student_id      uuid primary key references public.students(id) on delete cascade,
    title_id        text not null references public.bakhi_titles(id) on delete restrict,
    assigned_by     text not null default '',
    assigned_at     timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.student_titles is
    'Danh hiệu hiện tại của mỗi học sinh, do Founder Dashboard trao tay. Một học sinh giữ tối đa một danh hiệu.';

create index if not exists student_titles_title_idx on public.student_titles (title_id);

-- 3. Cập nhật updated_at ------------------------------------------------------
create or replace function public.bakhi_title_touch() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists bakhi_titles_touch on public.bakhi_titles;
create trigger bakhi_titles_touch before update on public.bakhi_titles
    for each row execute function public.bakhi_title_touch();

drop trigger if exists student_titles_touch on public.student_titles;
create trigger student_titles_touch before update on public.student_titles
    for each row execute function public.bakhi_title_touch();

-- 4. RLS: chỉ đọc từ trình duyệt, ghi bằng service_role -----------------------
alter table public.bakhi_titles enable row level security;
alter table public.student_titles enable row level security;

drop policy if exists bakhi_titles_read on public.bakhi_titles;
create policy bakhi_titles_read on public.bakhi_titles
    for select to anon, authenticated using (true);

drop policy if exists student_titles_read on public.student_titles;
create policy student_titles_read on public.student_titles
    for select to anon, authenticated using (true);

revoke insert, update, delete on public.bakhi_titles from anon, authenticated;
revoke insert, update, delete on public.student_titles from anon, authenticated;
grant select on public.bakhi_titles, public.student_titles to anon, authenticated;

-- 5. Realtime: danh hiệu đổi thì chat cập nhật ngay ---------------------------
do $$
declare t text;
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        foreach t in array array['bakhi_titles', 'student_titles'] loop
            if not exists (
                select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
            ) then
                execute format('alter publication supabase_realtime add table public.%I', t);
            end if;
        end loop;
    end if;
end $$;

-- 6. Danh mục khởi đầu (không ghi đè tên/ màu Founder đã sửa) -----------------
insert into public.bakhi_titles (id, name, short, color, icon, description, sort_order, founder_only) values
    ('founder',    'Nhà Sáng Lập',      'SÁNG LẬP',    '#f5c451', 'fa-crown',              'Người tạo nên Bá Khí và giữ ngọn lửa của cả cộng đồng.', 10,  true),
    ('admin',      'Quản Trị Viên',     'QUẢN TRỊ',    '#7dd3fc', 'fa-shield-halved',      'Điều hành hệ thống và giữ cho mọi thứ vận hành trơn tru.', 20, true),
    ('developer',  'Kỹ Sư Hệ Thống',    'HỆ THỐNG',    '#a5b4fc', 'fa-code',               'Xây dựng và bảo trì nền tảng Bá Khí.', 30, true),
    ('scholar',    'Học Giả',           'HỌC GIẢ',     '#93c5fd', 'fa-book-open',          'Học đều, hiểu sâu, ghi chú đầy đủ.', 40, false),
    ('explorer',   'Nhà Thám Hiểm',     'THÁM HIỂM',   '#6ee7b7', 'fa-compass',            'Đi hết các môn, mở hết các chương còn bỏ ngỏ.', 50, false),
    ('pioneer',    'Tiên Phong',        'TIÊN PHONG',  '#fdba74', 'fa-flag',               'Người mở đường cho những tính năng mới.', 60, false),
    ('strategist', 'Chiến Lược Gia',    'CHIẾN LƯỢC',  '#fca5a5', 'fa-chess-knight',       'Lên kế hoạch ôn tập và theo đúng lịch của mình.', 70, false),
    ('artisan',    'Nghệ Nhân',         'NGHỆ NHÂN',   '#f0abfc', 'fa-palette',            'Chăm chút ghi chú, sơ đồ tư duy và Studio.', 80, false),
    ('mentor',     'Người Dẫn Đường',   'DẪN ĐƯỜNG',   '#fcd34d', 'fa-hand-holding-heart','Giúp bạn học khác tiến bộ trong chat và nhóm học.', 90, false),
    ('guardian',   'Người Giữ Lửa',     'GIỮ LỬA',     '#fb923c', 'fa-fire',               'Giữ nhịp học tập bền bỉ, không bỏ dở.', 100, false),
    ('sprout',     'Mầm Xanh',          'MẦM XANH',    '#86efac', 'fa-seedling',           'Thành tích đầu tiên trên hành trình Bá Khí.', 110, false),
    ('star',       'Ngôi Sao Bá Khí',   'NGÔI SAO',    '#e9d5ff', 'fa-star',               'Danh hiệu vinh danh học sinh nổi bật của tháng.', 120, false)
on conflict (id) do nothing;

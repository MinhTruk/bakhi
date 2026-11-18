-- ============================================================================
-- Bá Khí 7.7.0 — Hoàn thiện Danh hiệu (Title): ánh xạ badge nguồn, hai kiểu
-- hiển thị (bình thường / đặc biệt), quyền sử dụng do học sinh tự chọn trong
-- số danh hiệu mình thực sự sở hữu.
--
-- Nguyên tắc an toàn:
--   * CHỈ THÊM. Không xoá, không ghi đè tên/màu Founder đã sửa, không đổi id cũ.
--   * Chạy lại nhiều lần vẫn an toàn (idempotent).
--   * Trình duyệt chỉ ĐỌC (chat và hồ sơ cần hiển thị danh hiệu của người khác);
--     mọi thao tác ghi đi qua Edge Function với service_role.
-- ============================================================================

-- 1. Cột mở rộng cho danh mục danh hiệu --------------------------------------
alter table public.bakhi_titles add column if not exists badge_id   text;
alter table public.bakhi_titles add column if not exists style      text not null default 'plain';
alter table public.bakhi_titles add column if not exists font       text not null default '';
alter table public.bakhi_titles add column if not exists palette    text not null default '';
alter table public.bakhi_titles add column if not exists effect     text not null default 'none';
alter table public.bakhi_titles add column if not exists created_by text not null default '';
alter table public.bakhi_titles add column if not exists updated_by text not null default '';

comment on column public.bakhi_titles.badge_id is
    'Badge nguồn của danh hiệu mặc định. NULL = danh hiệu tự tạo, chỉ dùng khi được trao tay.';
comment on column public.bakhi_titles.style is
    'plain = font thường, màu tĩnh; special = font đặc biệt, gradient/chuyển động.';
comment on column public.bakhi_titles.palette is
    'Bảng màu gradient dạng #a,#b,#c (tối đa 4 màu). Rỗng thì dùng color.';
comment on column public.bakhi_titles.effect is
    'none | flow | shimmer | pulse | aurora — hiệu ứng chuyển động cho kiểu special.';
comment on column public.bakhi_titles.font is
    'sans | serif | display | mono | elegant | rounded (rỗng = theo kiểu hiển thị).';

-- 2. Ràng buộc giá trị (đặt tên cố định để chạy lại không sinh ràng buộc trùng)
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'bakhi_titles_style_chk') then
        alter table public.bakhi_titles
            add constraint bakhi_titles_style_chk check (style in ('plain', 'special'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'bakhi_titles_effect_chk') then
        alter table public.bakhi_titles
            add constraint bakhi_titles_effect_chk
            check (effect in ('none', 'flow', 'shimmer', 'pulse', 'aurora'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'bakhi_titles_font_chk') then
        alter table public.bakhi_titles
            add constraint bakhi_titles_font_chk
            check (font in ('', 'sans', 'serif', 'display', 'mono', 'elegant', 'rounded'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'bakhi_titles_palette_chk') then
        alter table public.bakhi_titles
            add constraint bakhi_titles_palette_chk check (char_length(palette) <= 96);
    end if;
end $$;

create index if not exists bakhi_titles_badge_idx on public.bakhi_titles (badge_id);
create index if not exists bakhi_titles_active_idx on public.bakhi_titles (active, sort_order);

-- 3. Danh hiệu tự tạo được trao tay (danh hiệu ánh xạ badge không cần bảng này)
create table if not exists public.bakhi_title_grants (
    student_id  uuid not null references public.students(id) on delete cascade,
    title_id    text not null references public.bakhi_titles(id) on delete cascade,
    granted_by  text not null default '',
    granted_at  timestamptz not null default now(),
    primary key (student_id, title_id)
);

comment on table public.bakhi_title_grants is
    'Danh hiệu tự tạo (badge_id IS NULL) đã trao tay. Danh hiệu ánh xạ badge dùng quyền sở hữu badge, không cần bản ghi ở đây.';

alter table public.bakhi_title_grants enable row level security;
drop policy if exists bakhi_title_grants_read on public.bakhi_title_grants;
create policy bakhi_title_grants_read on public.bakhi_title_grants
    for select to anon, authenticated using (true);
revoke insert, update, delete on public.bakhi_title_grants from anon, authenticated;
grant select on public.bakhi_title_grants to anon, authenticated;

-- 4. Quyền sử dụng danh hiệu của một học sinh --------------------------------
--    Điều kiện: danh hiệu đang dùng + (sở hữu badge nguồn HOẶC đã được trao tay).
create or replace function public.bakhi_title_eligible(p_student uuid)
returns table (title_id text)
language sql
stable
security definer
set search_path = public
as $$
    select t.id
    from public.bakhi_titles t
    where t.active
      and (
            (t.badge_id is not null and exists (
                select 1 from public.student_badges sb
                where sb.student_id = p_student and sb.badge_id = t.badge_id
            ))
            or (t.badge_id is null and exists (
                select 1 from public.bakhi_title_grants g
                where g.student_id = p_student and g.title_id = t.id
            ))
      );
$$;

revoke all on function public.bakhi_title_eligible(uuid) from anon, authenticated;

-- 5. Danh mục danh hiệu mặc định ánh xạ từ badge -----------------------------
--    35 danh hiệu = 10 badge tự động tiêu biểu + 21 Founder + 2 Developer + 2 Administrator.
--    `on conflict do nothing` để không ghi đè tên/màu Founder đã chỉnh.
insert into public.bakhi_titles
    (id, name, short, color, icon, description, sort_order, founder_only, badge_id, style, font, palette, effect, active)
values
    ('founder',                 'Nhà Sáng Lập',          'SÁNG LẬP',   '#f5c451', 'fa-crown',               'Người tạo nên Bá Khí và giữ ngọn lửa của cả cộng đồng.',      10, true,  'founder',                 'special', 'display', '#f5c451,#b45309,#facc15', 'flow',    true),
    ('learn-first-lesson',      'Tri Thức Nhập Môn',     'NHẬP MÔN',   '#60a5fa', 'fa-book-open',           'Mở bài học đầu tiên.',                                        10, false, 'learn-first-lesson',      'plain',   '',        '',                        'none',    true),
    ('learn-lessons-30',        'Tam Thập Thông Tuệ',    'THÔNG TUỆ',  '#6366f1', 'fa-graduation-cap',      'Mở 30 bài học khác nhau.',                                    11, false, 'learn-lessons-30',        'plain',   '',        '',                        'none',    true),
    ('learn-practice-500',      'Ngũ Bách Tinh Anh',     'TINH ANH',   '#818cf8', 'fa-bolt',                'Hoàn thành 500 lượt luyện tập.',                              12, false, 'learn-practice-500',      'plain',   '',        '',                        'none',    true),
    ('explore-pages-50',        'Bá Khí Thiên Đồ',       'THIÊN ĐỒ',   '#0ea5e9', 'fa-map',                 'Ghé 50 trang khác nhau.',                                     13, false, 'explore-pages-50',        'plain',   '',        '',                        'none',    true),
    ('consist-days-30',         'Tam Thập Nhật Viên Mãn','VIÊN MÃN',   '#10b981', 'fa-calendar-plus',       'Hoạt động trong 30 ngày khác nhau.',                          14, false, 'consist-days-30',         'plain',   '',        '',                        'none',    true),
    ('music-200',               'Vô Tận Âm Trường',      'ÂM TRƯỜNG',  '#a855f7', 'fa-record-vinyl',        'Nghe trọn 200 lượt nhạc.',                                    15, false, 'music-200',               'plain',   '',        '',                        'none',    true),
    ('inter-meteor-1000',       'Lưu Tinh Kiếm Vũ',      'KIẾM VŨ',    '#f59e0b', 'fa-cloud-moon',          'Bắn 1.000 sao băng.',                                         16, false, 'inter-meteor-1000',       'plain',   '',        '',                        'none',    true),
    ('social-frame',            'Tiểu Quán Miện',        'TIỂU QUÁN',  '#ec4899', 'fa-crown',               'Trang bị một khung avatar.',                                  17, false, 'social-frame',            'plain',   '',        '',                        'none',    true),
    ('studio-words-500',        'Ngũ Bách Ngôn Phong',   'NGÔN PHONG', '#14b8a6', 'fa-feather-pointed',     'Viết một tài liệu dài 500 từ.',                               18, false, 'studio-words-500',        'plain',   '',        '',                        'none',    true),
    ('secret-completionist',    'Thất Thập Tam Quy Tông','QUY TÔNG',   '#94a3b8', 'fa-diamond',             'Mở khóa 73 badge tự động.',                                   19, false, 'secret-completionist',    'plain',   '',        '',                        'none',    true),
    ('founder-yin-yang',        'Âm Dương Thái Cực',     'ÂM DƯƠNG',   '#e2e8f0', 'fa-yin-yang',            'Khung Âm Dương Thái Cực độc bản, chỉ Founder có thể trao.',    30, true,  'founder-yin-yang',        'special', 'elegant', '#e2e8f0,#94a3b8,#f5f5f4', 'flow',    true),
    ('founder-cyberpunk',       'Sát Thủ Tương Lai',     'CYBERPUNK',  '#22d3ee', 'fa-robot',               'Khung Sát Thủ Tương Lai độc bản, chỉ Founder có thể trao.',    31, true,  'founder-cyberpunk',       'special', 'mono',    '#22d3ee,#d946ef,#f0abfc', 'shimmer', true),
    ('founder-ancient',         'Cổ Khí Thần Ấn',        'CỔ KHÍ',     '#d6d3d1', 'fa-scroll',              'Khung Cổ Khí Thần Ấn độc bản, chỉ Founder có thể trao.',       32, true,  'founder-ancient',         'special', 'serif',   '#d6d3d1,#fbbf24,#92400e', 'flow',    true),
    ('founder-samurai',         'Bushido',               'BUSHIDO',    '#ef4444', 'fa-sword',               'Khung Bushido độc bản, chỉ Founder có thể trao.',              33, true,  'founder-samurai',         'special', 'serif',   '#ef4444,#f8fafc,#0c0a09', 'pulse',   true),
    ('founder-void-emperor',    'Vô Cực Hoàng Đế',       'VÔ CỰC',     '#c084fc', 'fa-circle-notch',        'Khung Vô Cực Hoàng Đế độc bản, chỉ Founder có thể trao.',      34, true,  'founder-void-emperor',    'special', 'display', '#c084fc,#6d28d9,#0f172a', 'aurora',  true),
    ('founder-celestial-dragon','Thiên Long',            'THIÊN LONG', '#fbbf24', 'fa-dragon',              'Khung Thiên Long độc bản, chỉ Founder có thể trao.',           35, true,  'founder-celestial-dragon','special', 'display', '#fbbf24,#facc15,#a16207', 'flow',    true),
    ('founder-golden-ratio',    'Vàng Nguyên Tắc',       'NGUYÊN TẮC', '#f59e0b', 'fa-compass',             'Khung Vàng Nguyên Tắc độc bản, chỉ Founder có thể trao.',      36, true,  'founder-golden-ratio',    'special', 'elegant', '#f59e0b,#fde68a,#b45309', 'shimmer', true),
    ('founder-ember-core',      'Lòng Nõn',              'LÒNG NÕN',   '#fb7185', 'fa-fire',                'Khung Lòng Nõn độc bản, chỉ Founder có thể trao.',             37, true,  'founder-ember-core',      'special', 'display', '#fb7185,#fda4af,#881337', 'pulse',   true),
    ('founder-crystal-mind',    'Tinh Thần Tinh Thạch',  'TINH THẠCH', '#38bdf8', 'fa-gem',                 'Khung Tinh Thần Tinh Thạch độc bản, chỉ Founder có thể trao.', 38, true,  'founder-crystal-mind',    'special', 'elegant', '#38bdf8,#7dd3fc,#0c4a6e', 'shimmer', true),
    ('founder-neon-lotus',      'Sen Neon',              'SEN NEON',   '#e879f9', 'fa-lotus',               'Khung Sen Neon độc bản, chỉ Founder có thể trao.',             39, true,  'founder-neon-lotus',      'special', 'display', '#e879f9,#f0abfc,#701a75', 'aurora',  true),
    ('founder-genesis',         'Genesis',               'GENESIS',    '#5eead4', 'fa-circle-dot',          'Khởi nguyên — lõi năng lượng đầu tiên và quỹ đạo hình thành nên Bá Khí.', 41, true, 'founder-genesis', 'special', 'mono', '#5eead4,#99f6e4,#0f766e', 'aurora', true),
    ('founder-architect',       'Architect',             'ARCHITECT',  '#93c5fd', 'fa-compass-drafting',    'Người kiến tạo — bản thiết kế hình học của toàn bộ hệ thống.', 42, true,  'founder-architect',       'special', 'mono',    '#93c5fd,#e0f2fe,#1e3a8a', 'shimmer', true),
    ('founder-eternal-flame',   'Eternal Flame',         'ETERNAL',    '#fb7185', 'fa-fire-flame-curved',   'Ngọn lửa vĩnh cửu — nhiệt huyết không tắt của người khai sáng.', 43, true, 'founder-eternal-flame',  'special', 'display', '#fb7185,#fbbf24,#7f1d1d', 'pulse',   true),
    ('founder-nexus',           'Nexus',                 'NEXUS',      '#a855f7', 'fa-diagram-project',     'Trung tâm liên kết — nơi mọi luồng năng lượng và dữ liệu gặp nhau.', 44, true, 'founder-nexus',         'special', 'mono',    '#a855f7,#f0abfc,#6b21a8', 'aurora',  true),
    ('founder-celestial',       'Celestial',             'CELESTIAL',  '#818cf8', 'fa-galaxy',              'Thiên hà và tinh tú — tầm nhìn vượt khỏi đường chân trời.',    45, true,  'founder-celestial',       'special', 'elegant', '#818cf8,#c7d2fe,#1e1b4b', 'shimmer', true),
    ('founder-chronos',         'Chronos',               'CHRONOS',    '#d97706', 'fa-clock',               'Thời gian — đồng hồ cổ và cơ khí ghi dấu từng giai đoạn phát triển.', 46, true, 'founder-chronos',       'special', 'serif',   '#d97706,#fcd34d,#57534e', 'flow',    true),
    ('founder-void-sentinel',   'Void Sentinel',         'VOID',       '#06b6d4', 'fa-shield',              'Người canh giữ hư không — lá chắn đứng giữa khoảng trống vô tận.', 47, true, 'founder-void-sentinel',   'special', 'mono',    '#06b6d4,#67e8f9,#0c4a6e', 'pulse',   true),
    ('founder-prime-code',      'Prime Code',            'PRIME',      '#22d3ee', 'fa-code',                'Công nghệ và dữ liệu — dòng mã nguồn gốc của nền tảng.',        48, true,  'founder-prime-code',      'special', 'mono',    '#22d3ee,#67e8f9,#15803d', 'shimmer', true),
    ('founder-legacy',          'Legacy',                'LEGACY',     '#fbbf24', 'fa-crown',               'Di sản — vương miện và nguyệt quế của những gì còn lại mãi.',  49, true,  'founder-legacy',          'special', 'serif',   '#fbbf24,#fde68a,#713f12', 'flow',    true),
    ('founder-ascendant',       'Ascendant',             'ASCENDANT',  '#a78bfa', 'fa-gem',                 'Thăng hoa — pha lê và ánh sáng của bước tiến cuối cùng.',       50, true,  'founder-ascendant',       'special', 'display', '#a78bfa,#e9d5ff,#4c1d95', 'aurora',  true),
    ('dev-exclusive-aurora',    'Dao Quang Tuyệt Ảnh',   'AURORA',     '#5eead4', 'fa-code',                'Khung Dao quang độc bản, chỉ Founder có thể trao.',            60, true,  'dev-exclusive-aurora',    'special', 'mono',    '#5eead4,#67e8f9,#a855f7', 'aurora',  true),
    ('dev-exclusive-void',      'Vô Cực Hư Không',       'HƯ KHÔNG',   '#c084fc', 'fa-terminal',            'Khung Hư không độc bản, chỉ Founder có thể trao.',              61, true,  'dev-exclusive-void',      'special', 'mono',    '#c084fc,#e9d5ff,#6d28d9', 'pulse',   true),
    ('admin-chosen',            'Thiên Tuyển Chi Ấn',    'THIÊN TUYỂN','#7dd3fc', 'fa-hand-holding-heart',  'Badge đặc biệt do quản trị viên trao tặng.',                    70, true,  'admin-chosen',            'special', 'display', '#7dd3fc,#bae6fd,#0c4a6e', 'shimmer', true),
    ('admin-legend',            'Bá Khí Chí Tôn',        'CHÍ TÔN',    '#f5c451', 'fa-crown',               'Badge cao nhất, chỉ Administrator trao tặng.',                  71, true,  'admin-legend',            'special', 'display', '#f5c451,#fde68a,#b91c1c', 'flow',    true)
on conflict (id) do nothing;

-- 6. Danh hiệu mặc định cũ không ánh xạ badge, chưa từng được trao -----------
--    Giữ nguyên bản ghi (không xoá dữ liệu), chỉ tắt để danh mục 35 danh hiệu
--    ánh xạ badge là danh mục đang dùng. Founder có thể bật lại trong Tab Title.
update public.bakhi_titles
   set active = false
 where badge_id is null
   and active
   and not exists (select 1 from public.student_titles st where st.title_id = public.bakhi_titles.id)
   and not exists (select 1 from public.bakhi_title_grants g where g.title_id = public.bakhi_titles.id);

-- 7. Hàm đọc danh hiệu đang dùng kèm kiểu hiển thị (dùng chung cho chat/hồ sơ)
create or replace function public.bakhi_titles_active()
returns setof public.bakhi_titles
language sql
stable
as $$
    select * from public.bakhi_titles where active order by sort_order, name;
$$;

grant execute on function public.bakhi_titles_active() to anon, authenticated;

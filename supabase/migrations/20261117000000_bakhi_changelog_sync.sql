-- ============================================================================
-- Bá Khí — Đồng bộ CHANGELOG.md (GitHub Actions) với bảng changelog.
--
-- Mục tiêu:
--   1. Ghi nhận nguồn xuất bản (admin / github), trạng thái đồng bộ, lỗi và
--      hash nội dung cho từng phiên bản.
--   2. Liên kết một-một giữa changelog và announcement (thông báo đẩy cho
--      học sinh) để chống trùng lặp tuyệt đối.
--   3. Một hàm publish duy nhất dùng chung cho Admin Dashboard và workflow
--      GitHub — cùng cấu trúc dữ liệu, cùng quy tắc chống trùng.
--   4. Bảng app_settings cho feature flags / thông báo bảo trì (đọc công khai
--      các khoá `public.*`, ghi chỉ qua Edge Function service_role).
--
-- Không xoá bảng, không xoá dữ liệu, không đổi tên cột. Chạy lại nhiều lần
-- vẫn an toàn (idempotent).
--
-- Hoàn tác (nếu thật sự cần):
--   drop function if exists public.bakhi_publish_changelog(text,text,text,jsonb,text,text,text,timestamptz);
--   drop function if exists public.bakhi_mark_changelog_sync_failed(text,text);
--   drop function if exists public.bakhi_version_cmp(text,text);
--   alter table public.changelog drop column if exists announcement_id, ...;
--   drop table if exists public.app_settings;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cột đồng bộ cho changelog
-- ---------------------------------------------------------------------------
alter table public.changelog add column if not exists source text;
alter table public.changelog add column if not exists sync_state text;
alter table public.changelog add column if not exists sync_error text;
alter table public.changelog add column if not exists synced_at timestamptz;
alter table public.changelog add column if not exists content_hash text;
alter table public.changelog add column if not exists announcement_id uuid
    references public.announcements (id) on delete set null;

update public.changelog set source = 'admin' where source is null;
update public.changelog set sync_state = case when is_published then 'published' else 'draft' end
    where sync_state is null;

alter table public.changelog alter column source set default 'admin';
alter table public.changelog alter column source set not null;
alter table public.changelog alter column sync_state set default 'draft';
alter table public.changelog alter column sync_state set not null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'changelog_source_chk') then
        alter table public.changelog add constraint changelog_source_chk
            check (source in ('admin', 'github'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'changelog_sync_state_chk') then
        alter table public.changelog add constraint changelog_sync_state_chk
            check (sync_state in ('draft', 'published', 'failed'));
    end if;
end $$;

-- Mở rộng danh mục: thêm Bảo mật và Thông báo (dùng cho mục trong changelog).
alter table public.changelog drop constraint if exists changelog_category_check;
alter table public.changelog add constraint changelog_category_check
    check (category in
        ('features', 'improvements', 'fixes', 'ui', 'performance', 'security', 'notice', 'other'));

-- ---------------------------------------------------------------------------
-- 2. Liên kết announcement ↔ phiên bản changelog
--    Unique index bảo đảm mỗi phiên bản chỉ có tối đa MỘT thông báo.
-- ---------------------------------------------------------------------------
alter table public.announcements add column if not exists changelog_version text;
alter table public.announcements add column if not exists changelog_entry_id uuid
    references public.changelog (id) on delete set null;

create unique index if not exists announcements_changelog_version_uidx
    on public.announcements (changelog_version)
    where changelog_version is not null;

create index if not exists announcements_changelog_entry_idx
    on public.announcements (changelog_entry_id);

-- Chỉ index các bản ghi lỗi đồng bộ: bảng nhỏ nhưng màn hình Giám sát lọc
-- theo trạng thái này thường xuyên; partial index giữ chi phí ghi ở mức 0.
create index if not exists changelog_sync_failed_idx
    on public.changelog (synced_at desc)
    where sync_state = 'failed';

-- ---------------------------------------------------------------------------
-- 3. So sánh phiên bản theo từng đoạn số (3.1.10 > 3.1.9)
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_version_cmp(a text, b text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
    pa text[] := regexp_split_to_array(coalesce(a, ''), '[.+-]');
    pb text[] := regexp_split_to_array(coalesce(b, ''), '[.+-]');
    n integer := greatest(coalesce(array_length(pa, 1), 0), coalesce(array_length(pb, 1), 0));
    i integer;
    x text;
    y text;
    nx bigint;
    ny bigint;
begin
    for i in 1..n loop
        x := coalesce(pa[i], '0');
        y := coalesce(pb[i], '0');
        if x ~ '^[0-9]+$' and y ~ '^[0-9]+$' then
            nx := x::bigint;
            ny := y::bigint;
            if nx <> ny then
                return case when nx > ny then 1 else -1 end;
            end if;
        elsif x <> y then
            return case when x > y then 1 else -1 end;
        end if;
    end loop;
    return 0;
end;
$$;

revoke all on function public.bakhi_version_cmp(text, text)
    from public, anon, authenticated;
grant execute on function public.bakhi_version_cmp(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Hàm publish dùng chung (Admin Dashboard + GitHub Actions)
--
--    - Gọi tuần tự bằng advisory lock nên hai lần chạy đồng thời không thể
--      tạo hai announcement cho cùng một phiên bản.
--    - Chỉ tạo announcement khi: phiên bản mới hơn mọi phiên bản đã publish,
--      chưa từng có announcement cho version đó, và bản ghi mới được publish
--      (hoặc draft được admin publish).
--    - Chỉnh sửa nội dung một phiên bản đã publish → cập nhật bản ghi,
--      KHÔNG gửi lại thông báo.
-- ---------------------------------------------------------------------------
create or replace function public.bakhi_publish_changelog(
    p_version text,
    p_title text,
    p_summary text,
    p_content jsonb,
    p_category text,
    p_source text,
    p_content_hash text default null,
    p_published_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_existing public.changelog%rowtype;
    v_entry public.changelog%rowtype;
    v_ann public.announcements%rowtype;
    v_latest text;
    v_is_new boolean := false;
    v_should_notify boolean := false;
    v_ann_created boolean := false;
    v_title text := btrim(coalesce(p_title, ''));
    v_summary text := nullif(btrim(coalesce(p_summary, '')), '');
    v_content jsonb := case when jsonb_typeof(coalesce(p_content, '[]'::jsonb)) = 'array'
                            then coalesce(p_content, '[]'::jsonb) else '[]'::jsonb end;
    v_cat text := coalesce(p_category, 'other');
    v_section jsonb;
    v_item text;
    v_label text;
    v_body text := '';
begin
    if coalesce(p_version, '') !~ '^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$' then
        raise exception 'BAD_VERSION' using errcode = '22023';
    end if;
    if v_title = '' then
        raise exception 'MISSING_TITLE' using errcode = '22023';
    end if;
    if p_source not in ('admin', 'github') then
        raise exception 'BAD_SOURCE' using errcode = '22023';
    end if;
    if v_cat not in
        ('features', 'improvements', 'fixes', 'ui', 'performance', 'security', 'notice', 'other') then
        v_cat := 'other';
    end if;

    -- Một khoá duy nhất cho toàn bộ pipeline publish changelog.
    perform pg_advisory_xact_lock(hashtext('bakhi.changelog.publish'));

    select * into v_existing from public.changelog where version = p_version for update;

    -- Phiên bản cao nhất đã publish, KHÔNG tính chính phiên bản đang xử lý.
    select version into v_latest
      from public.changelog
     where is_published and version <> p_version
     order by public.bakhi_version_cmp(version, p_version) desc
     limit 1;

    if v_existing.id is null then
        v_is_new := true;
        insert into public.changelog
            (version, title, summary, content, category, is_published, published_at,
             source, sync_state, sync_error, synced_at, content_hash)
        values
            (p_version, left(v_title, 160), left(v_summary, 400), v_content, v_cat, true,
             coalesce(p_published_at, now()), p_source, 'published', null, now(),
             coalesce(p_content_hash, md5(v_content::text)))
        returning * into v_entry;
    else
        update public.changelog set
            title = left(v_title, 160),
            summary = left(v_summary, 400),
            content = v_content,
            category = v_cat,
            is_published = true,
            published_at = coalesce(published_at, coalesce(p_published_at, now())),
            sync_state = 'published',
            sync_error = null,
            synced_at = now(),
            content_hash = coalesce(p_content_hash, md5(v_content::text))
        where id = v_existing.id
        returning * into v_entry;
    end if;

    -- Chỉ bản ghi mới hoặc draft vừa được publish mới được xét thông báo.
    v_should_notify := (v_is_new or not v_existing.is_published)
        and (v_latest is null or public.bakhi_version_cmp(p_version, v_latest) > 0);

    if v_should_notify and v_entry.announcement_id is null then
        select * into v_ann from public.announcements where changelog_version = p_version limit 1;
        if v_ann.id is null then
            for v_section in select * from jsonb_array_elements(v_content) loop
                v_label := case coalesce(v_section->>'category', 'other')
                    when 'features' then 'Tính năng mới'
                    when 'improvements' then 'Cải tiến'
                    when 'fixes' then 'Sửa lỗi'
                    when 'ui' then 'Giao diện'
                    when 'performance' then 'Hiệu năng'
                    when 'security' then 'Bảo mật'
                    when 'notice' then 'Thông báo'
                    else 'Khác' end;
                v_body := v_body || v_label || E':\n';
                for v_item in
                    select jsonb_array_elements_text(coalesce(v_section->'items', '[]'::jsonb))
                loop
                    v_body := v_body || '• ' || v_item || E'\n';
                end loop;
                v_body := v_body || E'\n';
            end loop;

            insert into public.announcements
                (title, content, type, priority, is_published, published_at,
                 changelog_version, changelog_entry_id)
            values
                (left('Bá Khí ' || p_version || ' — ' || v_title, 160),
                 left(coalesce(v_summary || E'\n\n', '') || v_body, 20000),
                 'update', 'normal', true, coalesce(p_published_at, now()),
                 p_version, v_entry.id)
            returning * into v_ann;
            v_ann_created := true;
        end if;

        update public.changelog set announcement_id = v_ann.id where id = v_entry.id;
        v_entry.announcement_id := v_ann.id;
    end if;

    return jsonb_build_object(
        'ok', true,
        'version', v_entry.version,
        'created', v_is_new,
        'updated', not v_is_new,
        'announcement_created', v_ann_created,
        'announcement_id', v_entry.announcement_id,
        'published_at', v_entry.published_at,
        'content_hash', v_entry.content_hash
    );
end;
$$;

revoke all on function public.bakhi_publish_changelog(text, text, text, jsonb, text, text, text, timestamptz)
    from public, anon, authenticated;
grant execute on function public.bakhi_publish_changelog(text, text, text, jsonb, text, text, text, timestamptz)
    to service_role;

-- Ghi nhận lỗi đồng bộ cho một phiên bản đã tồn tại (workflow GitHub).
create or replace function public.bakhi_mark_changelog_sync_failed(
    p_version text,
    p_error text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    update public.changelog
       set sync_state = 'failed',
           sync_error = left(coalesce(p_error, 'Lỗi đồng bộ không xác định.'), 1000),
           synced_at = now()
     where version = p_version;
end;
$$;

revoke all on function public.bakhi_mark_changelog_sync_failed(text, text)
    from public, anon, authenticated;
grant execute on function public.bakhi_mark_changelog_sync_failed(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. app_settings — feature flags và thông báo bảo trì
--    - Trình duyệt đã đăng nhập ẩn danh chỉ đọc được khoá `public.*`.
--    - Mọi thao tác ghi đi qua Edge Function admin-actions (service_role).
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
    key         text primary key,
    value       jsonb not null default '{}'::jsonb,
    description text,
    updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public on public.app_settings
    for select to authenticated
    using (key like 'public.%');

insert into public.app_settings (key, value, description) values
    ('public.whatsnew', '{"enabled": true}'::jsonb,
     'Hiển thị khối "Cập nhật gần đây" trên trang chủ'),
    ('public.maintenance', '{"enabled": false, "message": ""}'::jsonb,
     'Thông báo bảo trì toàn website (hiển thị cho mọi trang)')
on conflict (key) do nothing;

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
    before update on public.app_settings
    for each row execute function public.bakhi_touch_updated_at();

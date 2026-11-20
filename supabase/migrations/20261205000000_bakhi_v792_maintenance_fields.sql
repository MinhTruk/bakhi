-- ============================================================================
-- Bá Khí 7.9.2 — Trường bảo trì toàn cục chuẩn hoá + Founder Login.
--
-- Không tạo bảng mới: trạng thái bảo trì vẫn ở app_settings.public.maintenance
-- và lịch sử chu kỳ vẫn ở maintenance_history (migration 7.0). Bản này chỉ bổ
-- sung năm trường chuẩn mà màn hình bảo trì và Founder Dashboard đọc:
--
--   maintenance_enabled      boolean  — đang bật hay tắt
--   maintenance_reason       text     — lý do (không hardcode ở client)
--   maintenance_started_at   timestamptz — mốc bắt đầu do DB/máy chủ ghi
--   maintenance_started_by   text     — người bật (Founder)
--   maintenance_updated_at   timestamptz — lần cập nhật cuối
--
-- Idempotent, không ghi đè giá trị đang dùng, không xoá dữ liệu.
-- RLS của app_settings không đổi: anon/authenticated chỉ đọc, ghi qua
-- Edge Function admin-actions (service_role) với scope Founder.
-- ============================================================================

update public.app_settings
   set value = value || jsonb_build_object(
        'maintenance_enabled',
            coalesce(value->'maintenance_enabled', to_jsonb(value->>'enabled' = 'true')),
        'maintenance_reason',
            coalesce(value->'maintenance_reason', to_jsonb(coalesce(value->>'reason', ''))),
        'maintenance_started_at',
            coalesce(value->'maintenance_started_at', value->'cycleStartedAt', 'null'::jsonb),
        'maintenance_started_by',
            coalesce(value->'maintenance_started_by', 'null'::jsonb),
        'maintenance_updated_at',
            coalesce(value->'maintenance_updated_at', value->'updatedAt', 'null'::jsonb)
       )
 where key = 'public.maintenance';

-- Bảo đảm bản ghi tồn tại kể cả khi migration 7.0 chưa chạy trên môi trường mới.
insert into public.app_settings (key, value, description) values
    ('public.maintenance',
     '{"enabled": false, "title": "Bá Khí đang bảo trì", "message": "", "reason": "",
       "startAt": null, "endAt": null, "updatedAt": null, "historyId": null, "cycleStartedAt": null,
       "maintenance_enabled": false, "maintenance_reason": "", "maintenance_started_at": null,
       "maintenance_started_by": null, "maintenance_updated_at": null}'::jsonb,
     'Bảo trì toàn website: bật/tắt, tiêu đề, nội dung, lý do, thời gian và chu kỳ bảo trì.')
on conflict (key) do nothing;

comment on column public.app_settings.value is
    'Cấu hình công khai. public.maintenance dùng các trường maintenance_* (7.9.2); khoá camelCase cũ được giữ để tương thích.';

-- Rollback (chạy tay khi cần): bỏ năm khoá maintenance_* khỏi value.
--   update public.app_settings
--      set value = value - 'maintenance_enabled' - 'maintenance_reason'
--                  - 'maintenance_started_at' - 'maintenance_started_by' - 'maintenance_updated_at'
--    where key = 'public.maintenance';

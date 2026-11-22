# Dữ liệu & migration AI Tutor (8.5.0)

Migration: `supabase/migrations/20261218000000_bakhi_v850_ai_tutor.sql`

Đây là migration **mới**. Không sửa migration đã áp dụng trên production.
Không xoá dữ liệu lịch sử. Mọi câu lệnh đều idempotent (`if not exists`,
`on conflict do nothing`, `create or replace`, `drop policy if exists`).

## 1. Bảng

### `ai_conversations`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid → `students(id)` on delete cascade | chủ sở hữu |
| `title` | text 1–120 | tạo từ câu hỏi đầu tiên |
| `mode` | text check 8 giá trị | `explain/steps/hint/check/practice/mistakes/summary/socratic` |
| `subject`, `topic` | text | từ ngữ cảnh, đã lọc |
| `last_provider`, `last_model` | text | provider THỰC TẾ đã trả lời |
| `message_count` | int ≥ 0 | |
| `is_archived` | boolean | dự phòng cho tính năng lưu trữ |
| `deleted_at` | timestamptz | **xoá mềm** |
| `last_message_at`, `created_at`, `updated_at` | timestamptz | |

Chỉ mục: `(student_id, last_message_at desc) where deleted_at is null`,
`(student_id, is_archived) where deleted_at is null`.

### `ai_messages`

| Cột | Ghi chú |
|---|---|
| `conversation_id` → `ai_conversations` cascade | |
| `student_id` → `students` cascade | để RLS lọc trực tiếp |
| `role` | `user` / `assistant` |
| `content` | 1–24 000 ký tự |
| `mode` | chế độ tại thời điểm gửi |
| `provider`, `model` | |
| `tokens_in`, `tokens_out` | ≥ 0 |
| `context_ref` | jsonb ngữ cảnh đã gửi (danh sách trắng) |
| `error_code` | mã lỗi nếu lượt đó thất bại |

Chỉ mục: `(conversation_id, created_at)`, `(student_id, created_at desc)`.

### `ai_usage_logs`

Một dòng cho mỗi lần gọi provider (kể cả thất bại và `admin.test`):
`action`, `provider`, `model`, `mode`, `tokens_in/out`, `latency_ms`, `ok`, `error_code`.
`student_id` cho phép NULL (log của quản trị).
Chỉ mục: `(student_id, created_at desc)`, `(created_at desc)`.

### `ai_settings` (một dòng, `id = 1`)

Chứa chế độ bật/tắt, provider/model, model định tuyến, giới hạn, ngôn ngữ,
`allowed_modes` (jsonb), `system_prompt` + `system_prompt_version`.
Có `check (id = 1)` để không thể tạo dòng thứ hai.
**Không có cột khoá/secret/token** — thiết kế có chủ đích.

### `ai_prompt_versions`

`id`, `version` (unique), `content`, `note`, `saved_by`, `created_at`.
Khôi phục = chèn phiên bản mới mang nội dung cũ; lịch sử không bị sửa.

## 2. RLS

```sql
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.ai_usage_logs      enable row level security;
alter table public.ai_settings        enable row level security;
alter table public.ai_prompt_versions enable row level security;
```

Ba policy duy nhất, tất cả `for select to authenticated`:

| Policy | Điều kiện |
|---|---|
| `ai_conversations_own_read` | `student_id = bakhi_current_student_id()` |
| `ai_messages_own_read` | `student_id = bakhi_current_student_id()` |
| `ai_usage_logs_own_read` | `student_id = bakhi_current_student_id()` |

**Không có policy INSERT/UPDATE/DELETE.** `ai_settings` và `ai_prompt_versions` không có
policy nào ⇒ chỉ `service_role` (tức Edge Function) đọc/ghi được.

## 3. Hàm & trigger

| Đối tượng | Vai trò |
|---|---|
| `bakhi_ai_touch()` | set `updated_at = now()` (trigger cho `ai_conversations`, `ai_settings`). |
| `bakhi_ai_usage(p_student uuid)` | JSON `{requests, tokens, failed}` trong 24 giờ; `revoke` khỏi public. |
| `bakhi_rate_limit(key, limit, window)` | **có sẵn** từ migration 20261115000000, dùng lại. |

## 4. Kiểm tra toàn vẹn sau migration

Migration kết thúc bằng một khối `do $$ ... $$` ném lỗi nếu:

- không có dòng `ai_settings` với `id = 1`, hoặc
- thiếu một trong ba bảng `ai_conversations`, `ai_messages`, `ai_usage_logs`.

Nếu migration báo lỗi, **không** commit tiếp; kiểm tra log `supabase db push` trước.

## 5. Dữ liệu cũ

- Không có bảng nào bị đổi tên, không cột nào bị xoá.
- Chat, Report, Gamification, Learning Intelligence **không bị ảnh hưởng**.
- Không có dữ liệu AI nào cần chuyển từ hệ thống cũ (trước 8.5.0 chưa có AI).
- Không có localStorage key mới bắt buộc; trạng thái giao diện AI nằm trong bộ nhớ trang.

## 6. Sao lưu & phục hồi

Trước khi áp migration trên production:

1. Supabase Dashboard → **Database → Backups** → xác nhận có bản backup gần nhất
   (gói miễn phí có backup hằng ngày; nâng cao có PITR).
2. Hoặc xuất ba bảng liên quan nếu đã có dữ liệu (chưa có ở lần đầu):
   ```sql
   -- chạy trong SQL Editor, lưu kết quả ra CSV
   select * from public.ai_conversations;
   select * from public.ai_messages;
   select * from public.ai_usage_logs;
   ```
3. Áp migration (xem `docs/DEPLOYMENT_V850.md`).
4. Kiểm tra: `select count(*) from public.ai_settings;` → phải bằng 1.

**Phương án rollback** (chỉ khi thật sự cần, sẽ mất dữ liệu AI):

```sql
drop table if exists public.ai_messages cascade;
drop table if exists public.ai_conversations cascade;
drop table if exists public.ai_usage_logs cascade;
drop table if exists public.ai_prompt_versions cascade;
drop table if exists public.ai_settings cascade;
drop function if exists public.bakhi_ai_usage(uuid);
drop function if exists public.bakhi_ai_touch();
```

Rollback **không** ảnh hưởng dữ liệu học tập khác. Không chạy rollback để “thử” trên
production khi đã có hội thoại thật.

## 7. Lưu trữ & xoá

- Học sinh “xoá hội thoại” = `deleted_at = now()`. Không hiện lại, không mở lại được.
- Dọn dẹp định kỳ (tuỳ chính sách, **không** chạy tự động trong bản này):
  ```sql
  -- ví dụ: xoá cứng hội thoại đã xoá mềm hơn 90 ngày
  delete from public.ai_conversations
  where deleted_at is not null and deleted_at < now() - interval '90 days';
  ```
  Xoá cứng hội thoại sẽ cascade xoá tin nhắn của nó.
- `ai_usage_logs` nên giữ để đối soát chi phí; nếu cần dọn:
  ```sql
  delete from public.ai_usage_logs where created_at < now() - interval '180 days';
  ```

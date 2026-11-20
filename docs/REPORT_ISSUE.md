# 🚩 Report Issue + Q&A (Bá Khí 8.1.1)

Tài liệu này mô tả hệ thống báo cáo vấn đề đang chạy trên production: nơi người dùng gặp nó,
cách dữ liệu đi qua Supabase, quyền của từng vai trò và cách vận hành.

- [1. Người dùng thấy gì](#1-người-dùng-thấy-gì)
- [2. Kiến trúc](#2-kiến-trúc)
- [3. Mô hình dữ liệu](#3-mô-hình-dữ-liệu)
- [4. Trạng thái & quy trình](#4-trạng-thái--quy-trình)
- [5. Quyền hạn](#5-quyền-hạn)
- [6. Tệp đính kèm](#6-tệp-đính-kèm)
- [7. Thông báo riêng](#7-thông-báo-riêng)
- [8. Hợp đồng API](#8-hợp-đồng-api)
- [9. Kiểm thử](#9-kiểm-thử)
- [10. Xử lý sự cố](#10-xử-lý-sự-cố)

## 1. Người dùng thấy gì

| Vị trí | Cách mở | Ghi chú |
|---|---|---|
| Trang chủ | **Cài đặt → Report Issue** | Nhúng cùng component, không mở trang Cài đặt thứ hai |
| Mọi trang môn học / bài học | Nút nổi **Báo cáo** ngay trên chuông thông báo | Kéo được, nhớ vị trí, `Home` trả về mặc định |
| Chat, Hồ sơ, Cài đặt, Studio | Nút nổi **Báo cáo** | Cùng component, cùng dữ liệu |
| Admin, Founder | Tab **Report** trong dashboard | Không dùng cửa sổ báo cáo của học sinh |

Cửa sổ có hai tab:

1. **Gửi báo cáo** — tiêu đề, nhóm vấn đề, loại báo cáo, mức ưu tiên, mô tả, tệp đính kèm,
   ngữ cảnh tự thu thập (thu gọn được).
2. **Báo cáo của tôi** — danh sách báo cáo của chính tài khoản đang gắn với thiết bị, có
   tìm kiếm theo mã/tiêu đề/nội dung, lọc *Tất cả / Đang mở / Đã xử lý*, tải thêm theo trang
   và xem trước phản hồi gần nhất. Bấm một dòng để mở chi tiết và Q&A.

Bản nháp (tiêu đề, mô tả, nhóm, loại, ưu tiên) được giữ ở `bakhiReportDraft.v1` khi chuyển
sang trang khác và chỉ xoá sau khi gửi thành công hoặc bấm **Xoá nội dung**.

Trên điện thoại, cửa sổ chuyển thành bottom sheet toàn chiều rộng; nút nổi thu về biểu tượng.

### Nút nổi và vị trí

- Mặc định nút nằm **ngay phía trên chuông thông báo** ở góc phải dưới và thẳng mép phải với
  chuông; nút tự căn lại khi chuông được dựng sau hoặc khi đổi kích thước cửa sổ. Trang chủ
  không có chuông nổi nên giữ vị trí góc phải dưới.
- **Kéo được** bằng chuột hoặc cảm ứng. Vị trí lưu ở `bakhiReportFab.v1`, áp dụng cho mọi
  trang ở các lần truy cập sau và luôn được giữ trong khung nhìn. Kéo nút không mở cửa sổ.
- Bàn phím: `←` `→` `↑` `↓` di chuyển 12px (giữ `Shift`: 40px), `Home` xoá vị trí đã lưu và
  trả nút về trên chuông. `BKReport.resetPosition()` làm điều tương tự từ mã nguồn.

### Giao diện

Cửa sổ và form dùng bảng biến `--bkrep-*`: chủ đề tối là mặc định (`color-scheme: dark`),
chủ đề sáng ghi đè khi `<html>` không có lớp `.dark`. Màu nền, viền, vòng focus và chữ phụ
được chọn để tương phản tốt trên nền tối, đồng thời khớp bảng màu Trung tâm thông báo
(`--bkc-n-*`).

### Ngữ cảnh tự thu thập

`page_url`, `page_title`, `route`, `subject`, `user_agent`, `platform`, `language`,
`screen`, `viewport`, `timezone`, `captured_at`.

Không thu thập mật khẩu, token, cookie, mã đăng nhập hay nội dung ô nhập khác.

## 2. Kiến trúc

```
bk-report.js ──► BKCloud.reportApi() ──► Edge Function report-api ──► public.reports
      │                                        │                        report_messages
      │                                        └──► storage: report-attachments
      └──► BKCloud.reportUpload() ─────────────► storage (RLS theo thư mục học sinh)

bk-devboard.js (tab Report) ──► BKCloud.adminAction() ──► admin-actions ──► reports.*
                                                              │
                                                              └──► report_notifications
bk-cloud.js (chuông) ◄── RLS select ◄── report_notifications ◄─┘
```

- **Trình duyệt chỉ đọc.** Ba policy SELECT cho phép học sinh đọc đúng hàng của mình; không
  có policy INSERT/UPDATE/DELETE nào cho client trên bốn bảng của hệ thống.
- **Mọi thao tác ghi ở máy chủ.** `report-api` xác minh phiên Anonymous Auth → tra
  `student_devices` → lấy `students` đang hoạt động. `admin-actions` xác minh `x-admin-token`
  trong `admin_sessions`.
- **Không có `student_id` từ client.** Payload tạo báo cáo không chứa trường này.

## 3. Mô hình dữ liệu

Migration: `supabase/migrations/20261206000000_bakhi_v800_reports.sql`.

### `reports`

| Cột | Ý nghĩa |
|---|---|
| `id` | UUID |
| `code` | Mã công khai `BK-xxxxx` (sequence `report_code_seq`) |
| `student_id` | Người báo cáo (FK `students`) |
| `title`, `description` | Nội dung báo cáo (4–160 / 10–5.000 ký tự) |
| `category` | `bug`, `ui`, `content`, `answer`, `account`, `performance`, `feature`, `data`, `other` |
| `issue_type` | `bug`, `question`, `suggestion`, `content_error` |
| `priority` | `low`, `normal`, `high`, `critical` |
| `status` | `new`, `pending`, `in_progress`, `waiting_student`, `resolved`, `closed` |
| `page_url`, `page_title`, `route`, `subject` | Ngữ cảnh trang |
| `context_data` | JSONB ngữ cảnh kỹ thuật đã lọc |
| `attachment_paths` | Đường dẫn trong bucket `report-attachments` |
| `assigned_to` | `admin` / `founder` |
| `resolved_by`, `resolution_note`, `resolved_at`, `closed_at` | Kết quả xử lý |
| `last_message_at`, `last_message_by` | Tin nhắn gần nhất |
| `student_unread`, `staff_unread` | Bộ đếm chưa đọc hai phía |

### `report_messages`

`sender_kind` (`student`/`staff`), `sender_student_id`, `sender_label`, `body` (1–4.000),
`attachments`, `is_private`, `read_by_student_at`, `read_by_staff_at`.

### `report_activity_logs`

`actor_kind`, `actor_label`, `action`, `old_value`, `new_value`, `metadata`. Không mở cho
trình duyệt; dashboard đọc qua `admin-actions` → `reports.detail`.

### `report_notifications`

`student_id`, `report_id`, `kind` (`reply`, `status`, `resolved`, `notice`), `title`, `body`,
`read_at`. Có unique index chống trùng nội dung cho cùng báo cáo.

## 4. Trạng thái & quy trình

```
new ─► pending ─► in_progress ─► waiting_student ─► in_progress ─► resolved ─► closed
                                                          ▲             │
                                                          └── reopen ───┘
```

- Bảng chuyển trạng thái hợp lệ nằm ở **máy chủ** (`REPORT_TRANSITIONS` trong
  `admin-actions`). Bước nhảy không hợp lệ bị từ chối với `409 BAD_TRANSITION`.
- `resolved` ghi `resolved_at` + `resolved_by`; `closed` ghi `closed_at`.
- Mở lại chỉ áp dụng cho `resolved`/`closed`, bắt buộc nhập lý do, ghi nhật ký và gửi thông
  báo cho học sinh.
- Học sinh trả lời một báo cáo `resolved` sẽ tự mở lại về `pending`.
- Học sinh không thể tự đánh dấu hoàn thiện: không có action nào cho phép.

## 5. Quyền hạn

| Hành động | Học sinh | Administrator | Founder |
|---|---|---|---|
| Tạo báo cáo | ✅ | — | — |
| Xem báo cáo của mình | ✅ | — | — |
| Xem mọi báo cáo | ❌ | ✅ | ✅ |
| Trả lời trong Q&A | ✅ (của mình) | ✅ | ✅ |
| Đổi trạng thái | ❌ | ✅ | ✅ |
| Complete Report | ❌ | ✅ | ✅ |
| Gửi tin nhắn riêng | ❌ | ✅ | ✅ |
| Mở lại báo cáo | ❌ | ✅ | ✅ |
| Gán người xử lý | ❌ | ✅ | ✅ |
| Tự nâng quyền Founder | ❌ | ❌ (chặn ở `admin-actions`) | — |

Administrator và Founder dùng chung tab Report và cùng các action `reports.*`; không có
đường nào để Administrator tự cấp quyền Founder qua hệ thống báo cáo.

## 6. Tệp đính kèm

- Bucket `report-attachments`, **private**, tối đa 5 MB mỗi tệp, nhận PNG/JPG/WEBP/GIF/PDF.
- Đường dẫn bắt buộc `<student_id>/<tên-tệp>`; policy storage kiểm tra thư mục đầu tiên
  khớp `public.bakhi_current_student_id()`.
- `report-api` lọc lại danh sách đường dẫn gửi lên (chỉ nhận trong thư mục của chính mình,
  tối đa 4) rồi mới ghi vào `attachment_paths`.
- Dashboard và trang học sinh nhận **signed URL** hạn 1 giờ do Edge Function sinh ra; không
  có URL công khai.

## 7. Thông báo riêng

Khi Administrator/Founder trả lời, gửi tin nhắn riêng, đổi trạng thái, hoàn thiện hoặc mở
lại báo cáo, máy chủ ghi một dòng `report_notifications` cho **đúng** `student_id` của báo
cáo. `bk-cloud.js` đọc bảng này bằng RLS và hiển thị nhóm **“Phản hồi báo cáo của bạn”**
trong Trung tâm thông báo hiện có, kèm realtime. Bấm vào sẽ mở đúng báo cáo qua
`BKReport.openReport(report_id)`.

Không có hệ thống thông báo thứ hai, không gửi cho toàn bộ người dùng, không có recipient do
client chọn.

## 8. Hợp đồng API

### `report-api` (học sinh, Bearer token Anonymous Auth)

| Action | Nội dung |
|---|---|
| `bootstrap` | Hồ sơ đang gắn + đếm báo cáo + số thông báo chưa đọc |
| `list` | `{ status?, q?, limit, offset }` → báo cáo của chính mình (`open`/`resolved` là nhóm trạng thái) |
| `detail` | `{ report_id }` → báo cáo + tệp (signed URL) + Q&A; tự đánh dấu đã đọc |
| `create` | `{ title, description, category, issue_type, priority, page_url, page_title, route, subject, context, attachments }` |
| `message.send` | `{ report_id, body, attachments? }` |
| `read.mark` | `{ report_id }` |
| `notifications` | Danh sách thông báo báo cáo |
| `notifications.read` | `{ notification_id? }` — không có id thì đánh dấu tất cả |

Giới hạn: tạo 6 báo cáo/giờ, 30 tin nhắn/10 phút (`bakhi_rate_limit`).

### `admin-actions` (header `x-admin-token`)

`reports.stats`, `reports.list`, `reports.detail`, `reports.reply`,
`reports.privateMessage`, `reports.status`, `reports.complete`, `reports.reopen`,
`reports.assign`, `reports.export`.

- `reports.list` trả thêm `last_message_preview` cho mỗi dòng.
- `reports.export` nhận đúng bộ lọc của `reports.list` (kể cả `q`) và trả CSV tối đa 5.000
  dòng; mỗi lần xuất được ghi vào `admin_activity_logs`.
- Tab Report có huy hiệu chưa đọc/mới, tự làm mới 45 giây/lần khi đang mở và chọn người xử
  lý (`Administrator`/`Founder`) ngay trong chi tiết.

## 9. Kiểm thử

```bash
NODE_PATH=/tmp/bktest/node_modules node tools/qa/report-smoke.js
```

Bộ QA kiểm tra: nút nổi, cửa sổ, form, validation, payload không có `student_id`, danh sách,
Q&A, gửi trả lời, `Esc`, chế độ nhúng Cài đặt, hợp đồng action của hai Edge Function, RLS và
bucket riêng tư.

Trạng thái trên project `wzvslyabhizsiggurwdq` (xác minh 20/11/2026):

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Migration `20261206000000_bakhi_v800_reports.sql` | ✅ Applied | Bốn bảng, index, trigger `reports_touch`/`report_messages_touch` có trên DB; đã ghi nhận trong `schema_migrations` |
| Bucket `report-attachments` | ✅ Applied | `public = false`, 5 MB, nhận PNG/JPG/WEBP/GIF/PDF |
| RLS bốn bảng | ✅ Applied | Chỉ có policy `SELECT` cho chủ sở hữu; không có policy ghi |
| GRANT ghi của client | ✅ Đã thu hồi (8.1.1) | `has_table_privilege('authenticated', …, 'INSERT')` = `false` trên cả bốn bảng |
| Edge Function `report-api` | ✅ Deployed | Phiên ẩn danh thật → `409 NOT_BOUND` (đúng thiết kế); không có phiên → `401 NO_SESSION` |
| Edge Function `admin-actions` (`reports.*`) | ✅ Deployed | Không có phiên quản trị → `401 NO_DEV_SESSION` |
| Luồng Q&A hai chiều trên dữ liệu thật | ⚠️ NOT VERIFIED | Cần một thiết bị đã gắn học sinh + mã quản trị; xem `docs/PRODUCTION_READINESS_REPORT.md` mục F |

Kiểm thử thủ công trên production (cần một tài khoản học sinh đã gắn):

1. Gửi báo cáo từ trang chủ và từ một trang bài học.
2. Mở tab Report trong dashboard, thấy báo cáo mới và thống kê tăng.
3. Trả lời → học sinh thấy thông báo trong chuông → bấm mở đúng báo cáo.
4. Complete Report kèm ghi chú → trạng thái `resolved`, có thông báo, có lịch sử.
5. Đăng nhập học sinh khác → không thấy báo cáo của người trước.

## 10. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Nút Báo cáo báo “chưa gắn học sinh” | Thiết bị chưa chọn họ tên | Chọn họ tên ở trang chủ rồi mở lại |
| Gửi báo cáo lỗi `report-api` 404 | Chưa deploy Edge Function | `npx supabase functions deploy report-api` |
| Tab Report trống, không có thống kê | Chưa chạy migration 8.0.0 | Chạy migration rồi tải lại dashboard |
| `report-api` báo `SERVER_ERROR` khi gửi báo cáo | Hàm bị thiếu khai báo `[functions.report-api]` trong `config.toml` | Chạy `node tools/qa/supabase-config.js` rồi deploy lại |
| Tab Report chỉ thấy phân trang, không có dòng nào (bản 8.0.1) | `renderPager()` xoá bảng vừa dựng | Cập nhật 8.1.0 (phân trang dùng host riêng) |
| “Xuất CSV” báo `UNKNOWN_ACTION` | `admin-actions` chưa được deploy bản 8.1.0 | `npx supabase functions deploy admin-actions` |
| Nút Báo cáo xuất hiện trên trang quản trị | Bản 8.0.x nạp `bk-report.js` ở `admin/`, `founder/` | Cập nhật 8.1.0 (đã gỡ + guard `BK_ADMIN_ONLY`) |
| Học sinh không thấy phản hồi | Chưa bật realtime hoặc chưa chạy migration | Kiểm tra `report_notifications` trong publication `supabase_realtime` |
| Tải tệp thất bại | Tệp > 5 MB hoặc sai định dạng | Dùng PNG/JPG/WEBP/GIF/PDF ≤ 5 MB |

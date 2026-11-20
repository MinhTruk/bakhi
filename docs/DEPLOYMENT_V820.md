# Triển khai 8.2.0 — nhật ký thực thi

Ghi lại **đúng những gì đã chạy** trên project thật `wzvslyabhizsiggurwdq` và repo
`MinhTruk/bakhi`, theo thứ tự mục XV của đặc tả. Mọi mục không thực hiện được đều ghi rõ lý do.

---

## 1. Trước khi triển khai

| Bước | Kết quả |
|---|---|
| Audit schema production | `student_progress` có 1 ràng buộc `progress_key` chỉ cho 7 khoá; 7 dòng dữ liệu, 1 học sinh |
| Đo kích thước dữ liệu hiện có | Lớn nhất 228 byte (`history`), không có payload gần ngưỡng |
| Kiểm tra khả năng phục hồi | Toàn bộ migration có khối rollback; dữ liệu client là local-first (mất mạng không ảnh hưởng) |
| Rủi ro đã xác định | Ràng buộc `progress_key` thiếu `signals`/`badges` (từ 8.1.0) → phải mở rộng **trước** khi frontend gửi khoá mới |

Không có bước sao lưu toàn bộ database do không có thay đổi phá huỷ (không `DROP`, không `DELETE`,
không đổi kiểu cột). Rủi ro còn lại là ràng buộc chặt hơn, đã được kiểm tra bằng dữ liệu thật.

## 2. Migration

```text
Tệp:     supabase/migrations/20261208000000_bakhi_v820_learning_intelligence.sql
Cách áp dụng: Management API (POST /v1/projects/{ref}/database/query), một transaction
Kết quả: HTTP 201
```

Xác minh sau khi áp dụng:

| Kiểm tra | Kết quả |
|---|---|
| `pg_get_constraintdef(progress_key)` | có đủ 12 khoá, gồm `plans`, `goals`, `revisionSessions` |
| `learning_mistakes_v`, `learning_plans_v` | tồn tại, `reloptions = ['security_invoker=true']` |
| `pg_trigger` trên `student_progress` | `student_progress_guard` |
| Quyền trên 2 view | chỉ `authenticated: SELECT` (anon bị thu hồi) |
| `select count(*)` trên 2 view | `0` / `0` (đúng với dữ liệu hiện có) |
| Áp dụng lần hai | thành công, không thay đổi (idempotent) |
| Chạy thử rollback trong `BEGIN … ROLLBACK` | cú pháp hợp lệ, trạng thái không đổi |
| `supabase_migrations.schema_migrations` | đã ghi `20261208000000` |

## 3. Edge Functions

```bash
npx supabase@2 functions deploy sync-student-progress --project-ref wzvslyabhizsiggurwdq
npx supabase@2 functions deploy admin-actions          --project-ref wzvslyabhizsiggurwdq
npx supabase@2 functions deploy dev-auth               --project-ref wzvslyabhizsiggurwdq
```

| Function | Thay đổi | Deploy | Kiểm tra sau deploy |
|---|---|---|---|
| `sync-student-progress` | nhận thêm `plans`, `goals`, `revisionSessions` | ✅ exit 0 | `401 BAD_SESSION` khi thiếu phiên (không phải lỗi 500) |
| `admin-actions` | `SERVER_VERSION 8.1.1 → 8.2.0` | ✅ exit 0 | `401 NO_DEV_SESSION` khi không có phiên |
| `dev-auth` | đồng bộ `verify_jwt = false` (tồn đọng từ 8.1.1) | ✅ exit 0 | Không có header Authorization → `401 BAD_DEV_CODE` (**không còn** `UNAUTHORIZED_NO_AUTH_HEADER`) ⇒ cổng JWT đã tắt thật |

Tất cả request kiểm tra đều dùng publishable key công khai, không dùng service-role key.

## 4. Kiểm tra dữ liệu

- 7 dòng `student_progress` trước và sau migration (xem [DATA_MIGRATION_V820.md](DATA_MIGRATION_V820.md)).
- Không tạo bản ghi trùng; không mất bản ghi nào.
- Ba khoá mới chưa có dữ liệu (đúng: chưa có học sinh nào dùng tính năng trên production).

## 5. QA trước khi phát hành

19 cổng, tất cả exit 0:

```text
content-integrity verify        OK — 123 tệp, không nội dung giáo dục nào thay đổi
smoke / cloud-smoke / shell-smoke / dev-smoke / badges-smoke
chat-smoke / admin-smoke / report-smoke / founder-smoke
maintenance-smoke / studio-smoke                 ALL CHECKS PASSED
mistake-notebook-smoke                          35 PASS
learning-analytics-smoke                        28 PASS
study-planner-smoke                             33 PASS
revision-engine-smoke                           28 PASS
learning-data-integrity                         37 PASS
learning-sync-smoke                             22 PASS
version-audit / supabase-config                 ALL CHECKS PASSED
```

Môi trường: Node 22/26 + `jsdom@31.0.1` + `typescript@5.6.3` (cài ngoài repo).

## 6. GitHub Pages

- Push `main` → GitHub Pages tự dựng lại (site tĩnh, không build).
- Bước xác minh production được ghi ở [RELEASE_REPORT_V820.md](RELEASE_REPORT_V820.md) mục 13.

## 7. Việc chưa thực hiện được trong môi trường này

| Việc | Lý do | Cách làm khi có điều kiện |
|---|---|---|
| Kiểm tra giao diện bằng mắt trên trình duyệt thật | Môi trường agent không có trình duyệt | Mở trang chủ → Trung tâm học tập, kiểm tra 6 khu vực mới trên desktop + mobile |
| Nhập câu trả lời thật trên trang bài học để xác nhận `chosen` | Cần trang có ngân hàng câu hỏi và thao tác click thật | Làm sai một câu ở `ktgk1/ly/ly1.html`, mở Sổ tay câu sai xem dòng "Bạn chọn" |
| E2E đồng bộ hai thiết bị với tài khoản học sinh thật | Cần thiết bị đã gắn học sinh | Đăng nhập hai thiết bị, tạo một nhiệm vụ ở A, xem ở B |
| Chạy CI trên GitHub | Chỉ chạy khi push; kết quả xem ở tab Actions | Kiểm tra badge `quality-check.yml` |

## 8. Thứ tự rollback nếu cần

1. Revert commit phát hành 8.2.0 trên `main` (Pages trở về 8.1.1).
2. Chạy khối rollback trong migration (mục 5 của `DATA_MIGRATION_V820.md`).
3. Không cần deploy lại Edge Function: `sync-student-progress` bản 8.2.0 vẫn tương thích payload
   8.1.1 (chỉ thêm khoá được phép).
4. Dữ liệu học sinh không bị ảnh hưởng: bản 8.1.1 bỏ qua trường lạ khi `sanitize()`.

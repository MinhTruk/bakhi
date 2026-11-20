# Migration dữ liệu 8.1.1 → 8.2.0

Tài liệu này ghi lại **chính xác** những gì đã thay đổi trong dữ liệu, những gì **không** thay
đổi, và cách đối chiếu. Mọi số liệu dưới đây lấy từ project thật
`wzvslyabhizsiggurwdq` ngày 20/11/2026.

---

## 1. Kết luận ngắn

| Hạng mục | Kết quả |
|---|---|
| Bảng mới | **0** |
| Bảng bị xoá | **0** |
| Cột bị xoá/đổi kiểu | **0** |
| Bản ghi bị xoá | **0** |
| Dữ liệu phải chuyển đổi | **0 bản ghi** (schema mở rộng tại chỗ) |
| Ràng buộc được mở rộng | 1 (`student_progress.progress_key`) |
| View chỉ đọc mới | 2 (`learning_mistakes_v`, `learning_plans_v`) |
| Migration đã áp dụng | `20261208000000_bakhi_v820_learning_intelligence.sql` |
| Rollback | đã kiểm tra cú pháp bằng transaction rollback (không đổi trạng thái) |

## 2. Vì sao không có bước chuyển dữ liệu

Sổ tay câu sai **không phải hệ thống mới thay thế hệ thống cũ**. Từ 8.0.0, `s.review` đã là nơi
lưu câu làm sai cùng `wrong/right/mastered/history/nextReview`. 8.2.0:

1. Mở rộng **tại chỗ** từng bản ghi (`status`, `errorType`, `chosen`, `note`, `pinned`, `streak`,
   `ease`, `intervalDays`, `questionId`, `updatedAt`).
2. Thêm ba mảng mới vào cùng kho dữ liệu: `plans`, `goals`, `revisionSessions`.
3. Giữ nguyên tên khoá `review` để dữ liệu đã đồng bộ trên `student_progress` vẫn đọc được.

Do đó không cần `INSERT ... SELECT`, không cần sao chép, không có nguy cơ nhân bản bản ghi.
Migration phía client chạy trong `sanitize()` của `bk-core.js`:

- `status` suy ra từ `mastered` và `wrong` nếu thiếu;
- mọi trường thiếu nhận giá trị mặc định hợp lệ;
- `meta.migratedFrom` ghi lại phiên bản gốc **một lần**, các lần sau không ghi đè;
- chạy lại nhiều lần cho cùng kết quả (idempotent) — có kiểm thử
  `learning-data-integrity.js` mục [1]–[2].

Client **luôn** chuẩn hoá trước khi ghi: `save()` chạy `sanitize()` trước `localStorage.setItem`,
nên dữ liệu hỏng từ đồng bộ/nhập tệp không thể tồn tại trên đĩa.

## 3. Migration SQL

Tệp: `supabase/migrations/20261208000000_bakhi_v820_learning_intelligence.sql`

1. **Mở rộng `progress_key`** — thêm `signals`, `badges`, `plans`, `goals`, `revisionSessions`.
   Trước 8.2.0, `student_progress` chỉ cho 7 khoá; hai khoá `signals`/`badges` mà Edge Function
   vẫn gửi từ 8.1.0 **chưa từng được khai báo** trong ràng buộc. Ràng buộc mới bao gồm toàn bộ
   khoá đang dùng thật.
2. **Chỉ mục** `student_progress_key_idx (progress_key, updated_at desc)`.
3. **Trigger `student_progress_guard`** — từ chối payload > 1 MB/khoá (lớp bảo vệ thứ hai sau
   giới hạn 1.5 MB của Edge Function).
4. **View chỉ đọc** `learning_mistakes_v`, `learning_plans_v` với `security_invoker = true`:
   dữ liệu **dẫn xuất** từ JSONB, không lưu trùng; RLS của `student_progress` vẫn áp dụng; chỉ
   `authenticated` có `SELECT`, `anon` bị thu hồi.

Không có `DROP TABLE`, không có `DELETE`, không có `ALTER ... DROP COLUMN`.

## 4. Đối chiếu sau migration (project thật)

```
select progress_key, count(*), max(pg_column_size(progress_data))
from public.student_progress group by 1;
```

| Thời điểm | Số khoá | Số dòng | Bản ghi học tập |
|---|---|---|---|
| Trước migration | 7 (`achievements`, `bookmarks`, `history`, `notes`, `practice`, `prefs`, `review`) | 7 | 1 hồ sơ học sinh |
| Sau migration | 7 (không đổi) | 7 (không đổi) | 1 hồ sơ học sinh |

Kiểm tra đã chạy trên production:

```
pg_get_constraintdef(student_progress_progress_key_check)
  → CHECK (progress_key = ANY (ARRAY[... 'plans','goals','revisionSessions']))
reloptions của 2 view              → ['security_invoker=true']
pg_trigger trên student_progress   → student_progress_guard
role_table_grants(learning_*_v)    → chỉ authenticated:SELECT
select count(*) from learning_mistakes_v → 0
select count(*) from learning_plans_v    → 0
```

- **Records trước migration:** 7 dòng `student_progress`.
- **Records sau migration:** 7 dòng.
- **Records bị bỏ qua / trùng / lỗi:** 0.
- **Kết quả đối chiếu:** khớp tuyệt đối, không mất dữ liệu.

Áp dụng lần hai (idempotency): trả về thành công, không đổi gì.

## 5. Rollback

Khối rollback nằm trong đầu tệp migration và đã được chạy thử trong
`BEGIN … ROLLBACK` (không thay đổi trạng thái production). Thứ tự:

```sql
drop view if exists public.learning_plans_v;
drop view if exists public.learning_mistakes_v;
drop trigger if exists student_progress_guard on public.student_progress;
drop function if exists public.bakhi_progress_guard();
drop index if exists public.student_progress_key_idx;
-- chỉ thu hẹp ràng buộc sau khi đã xoá các dòng dùng khoá mới
alter table public.student_progress drop constraint if exists student_progress_progress_key_check;
alter table public.student_progress add constraint student_progress_progress_key_check
  check (progress_key in ('practice','review','notes','bookmarks','history','achievements','prefs'));
```

Client 8.1.x vẫn đọc được dữ liệu do 8.2.0 ghi: các trường lạ bị `sanitize()` của bản cũ bỏ qua,
`review` giữ nguyên. Vì vậy rollback không cần migration dữ liệu ngược.

## 6. Danh sách thành phần cũ → thay thế

| Thành phần cũ | Thay thế | Dữ liệu cần migrate | Trạng thái |
|---|---|---|---|
| Tab **Ôn tập** trong `bk-learn.js` (`renderReview`, `reviewCard`, `attemptReview`, `focusCard`) | Sổ tay câu sai + Trung tâm ôn tập (`bk-learning.js`) | Không — cùng đọc `review` | **Đã xoá** (~400 dòng) |
| Tab **Lịch sử** (`renderHistory`) | Mục "Nhật ký hoạt động" trong tab Phân tích | Không — cùng đọc `history` | **Đã xoá** (~90 dòng) |
| `nextInterval()` (tính khoảng cách đơn giản) | `scheduleMistake()` (spaced repetition có `ease`/`streak`) | Không | **Đã xoá** |
| State `reviewQuery/reviewSubject/reviewShowMastered/reviewActive` | State riêng của `bk-learning.js` | Không | **Đã xoá** |
| Đồ thị 8 tuần/14 ngày trong tab Tổng quan | Tab Phân tích (một nơi duy nhất) | Không | **Đã chuyển** |
| `bk-notify.js` + `bk-notify.css` (chuông CHANGELOG cũ) | Chuông + trung tâm thông báo của `bk-cloud.js` | Không | **Deprecated** — xem mục 7 |

## 7. Vì sao `bk-notify` chưa bị xoá

`index.html` vẫn nạp `bk-notify.js` và `smoke.js` mục [3] vẫn kiểm thử hành vi của nó. Xoá ngay
sẽ là xoá một tính năng đang được nạp mà chưa có xác minh giao diện trên production.
**Điều kiện xoá:** (1) xác nhận trên production rằng chuông `bk-cloud` đã thay thế đầy đủ khối
"Cập nhật gần đây" của trang chủ; (2) xoá thẻ script trong `index.html` + mục [3] của `smoke.js`;
(3) chạy lại toàn bộ QA. Khi đó `bakhiNotifyReads.v1` chỉ được xoá sau khi xác nhận
`bk-cloud.js` không đọc khoá này.

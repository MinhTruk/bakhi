# Báo cáo phát hành Bá Khí 8.2.0

**Phiên bản:** 8.2.0 — Learning Intelligence & System Consolidation
**Ngày phát hành:** 20/11/2026 (thời điểm triển khai thật)
**Commit:** `5ff5ac9` trên `main`
**Site:** https://minhtruk.github.io/bakhi/
**Trạng thái cuối:** **PARTIALLY READY** — xem mục 15 để biết chính xác phần nào chưa xác minh.

---

## 1. Tổng quan phiên bản

8.2.0 là đợt nâng cấp **kiến trúc và dữ liệu**, không phải bổ sung giao diện. Trung tâm học tập
được tổ chức lại thành bốn hệ thống Learning Intelligence dùng chung một kho dữ liệu, và logic
ôn tập trùng lặp cũ đã bị xoá khỏi mã nguồn thay vì giữ song song.

| Hạng mục | Trước 8.2.0 | Sau 8.2.0 |
|---|---|---|
| Kho dữ liệu học tập | `bakhiLearn.v1` schema 1 | schema 2 (thêm `plans`, `goals`, `revisionSessions`) |
| Khu vực Trung tâm học tập | 7 tab, 2 tab trùng logic | 11 khu vực / 6 hệ thống mới + 4 công cụ cá nhân |
| Ôn tập | 1 danh sách + khoảng cách đơn giản | Sổ tay câu sai + Revision Engine (spaced repetition) |
| Phân tích | 2 biểu đồ trong tab Tổng quan | 7 biểu đồ + chỉ số + chủ đề yếu + Learning Score |
| Bảng Supabase dùng cho học tập | `student_progress` (7 khoá) | `student_progress` (12 khoá), **không bảng mới** |
| Smoke test | 11 | 17 |
| Kích thước `bk-learn.js` | 1901 dòng | 1642 dòng (−259) + `bk-learning.js` 1410 dòng mới |

## 2. Tính năng mới

1. **Sổ tay câu sai** — ghi tự động câu làm sai kèm đáp án đã chọn/đáp án đúng/lời giải,
   môn/chương/bài, sáu loại lỗi, ghi chú, ghim, năm trạng thái, lọc/tìm kiếm/sắp xếp ưu tiên.
2. **Phân tích học tập cá nhân** — bảy biểu đồ, bốn khoảng thời gian, chỉ số cá nhân,
   phát hiện chủ đề yếu (ngưỡng ≥ 4 câu) và **Learning Score** 0–100 có trọng số.
3. **Smart Study Planner** — nhiệm vụ ngày/tuần/tháng, hạn, hoàn thành/hoãn, gợi ý chỉ đề xuất.
4. **Revision Engine** — hàng đợi 5 phạm vi, phiên ôn, spaced repetition có `ease`/`streak`,
   thành thạo chỉ khi chuỗi đúng ≥ 2 và khoảng cách ≥ 21 ngày.
5. **Mục tiêu & Môn học** — mục tiêu đo bằng hoạt động thật; tab Môn học tổng hợp tiến độ.

## 3. Hệ thống cũ đã thay thế

| Cũ | Mới | Dữ liệu |
|---|---|---|
| Tab **Ôn tập** (`renderReview`, `reviewCard`, `attemptReview`, `focusCard`) | Sổ tay câu sai + Trung tâm ôn tập | Cùng đọc `s.review`, không chuyển đổi |
| Tab **Lịch sử** (`renderHistory`) | Nhật ký hoạt động trong tab Phân tích | Cùng đọc `s.history` |
| `nextInterval()` (khoảng cách ×2 đơn giản) | `scheduleMistake()` (ease + streak + ngưỡng 21 ngày) | Không |
| Biểu đồ 8 tuần/14 ngày trong tab Tổng quan | Tab Phân tích | Không |

## 4. Mô-đun đã xoá

- `assets/bakhi/bk-learn.js`: hàm `renderReview`, `reviewCard`, `attemptReview`, `focusCard`,
  `renderHistory` và state `reviewQuery/reviewSubject/reviewShowMastered/reviewActive`
  — **khoảng 490 dòng**, không còn wrapper hay fallback.
- `nextInterval()` trong `bk-core.js` (đã thay bằng `scheduleMistake`).

Không xoá tệp nào khác. `bk-notify.js` được ghi nhận **Deprecated** (lý do và điều kiện xoá ở
[DATA_MIGRATION_V820.md](DATA_MIGRATION_V820.md) mục 7) vì `index.html` vẫn nạp nó và chưa xác
minh giao diện thay thế trên production.

## 5. Mô-đun đã hợp nhất

| Trước | Sau |
|---|---|
| `bk-learn.js` (hub + ôn tập + lịch sử + ghi chú + đánh dấu + thành tích + cài đặt) | `bk-learn.js` (khung hub + công cụ cá nhân) + `bk-learning.js` (6 khu vực Learning Intelligence) |
| Ba nguồn số liệu khác nhau (tab Tổng quan, tab Ôn tập, dashboard) | `BK.analytics` duy nhất |
| Hai cách tính lịch ôn | `scheduleMistake` duy nhất |

## 6. Database migrations

- Tệp: `supabase/migrations/20261208000000_bakhi_v820_learning_intelligence.sql`.
- Đã áp dụng trên production (HTTP 201), đã ghi vào `supabase_migrations.schema_migrations`.
- Nội dung: mở rộng ràng buộc `progress_key` (12 khoá), chỉ mục `student_progress_key_idx`,
  trigger `student_progress_guard` (≤ 1 MB/khoá), hai view chỉ đọc `learning_mistakes_v` /
  `learning_plans_v` (`security_invoker = true`).
- Không có `DROP TABLE`, `DELETE` hay đổi kiểu cột. Idempotent (chạy hai lần không đổi).
- Rollback đã kiểm tra cú pháp trong `BEGIN … ROLLBACK`.

## 7. Dữ liệu đã chuyển

**0 bản ghi.** Sổ tay câu sai dùng lại khoá `review` đã có từ 8.0.0 và mở rộng trường tại chỗ;
ba mảng mới là dữ liệu mới. Không có bảng hay khoá thứ hai cho cùng dữ liệu.

## 8. Kết quả đối chiếu dữ liệu

| Thời điểm | `student_progress` (dòng) | Số khoá | Học sinh |
|---|---|---|---|
| Trước migration | 7 | 7 | 1 |
| Sau migration | 7 | 7 | 1 |

- Bản ghi bị bỏ qua / trùng / lỗi: **0**.
- View mới trả `0` dòng cho cả hai (đúng với dữ liệu hiện có — chưa ai dùng tính năng mới).
- Kích thước payload lớn nhất trước migration: 228 byte (xa ngưỡng 1 MB).

## 9. RLS và bảo mật

| Kiểm tra | Kết quả |
|---|---|
| `student_progress` RLS `select/insert/update_own` | Không đổi (đã có từ 8.0.0) |
| Quyền trên `learning_mistakes_v`, `learning_plans_v` | Chỉ `authenticated: SELECT`; `anon` bị thu hồi |
| View có rò dữ liệu người khác không | Không — `security_invoker = true` nên RLS bảng gốc áp dụng cho người gọi |
| Client tự tăng Learning Score | Không thể — điểm suy ra từ dữ liệu, không có API đặt điểm |
| Client tự cấp achievement | Không đổi — achievements vẫn ở `bk-core`/`student-profile` phía server |
| Sửa kết quả quiz lịch sử | Phiên ôn không ghi vào `practice`; có kiểm thử riêng |
| Ghi trực tiếp bảng qua REST | Không đổi — Edge Function là đường ghi duy nhất cho dữ liệu nhạy cảm |
| Truy cập ẩn danh (không phiên) vào `learning_mistakes_v`, `learning_plans_v`, `student_progress` | ✅ `401 42501 permission denied` trên cả ba — đã gọi REST thật bằng publishable key |
| Kiểm thử RLS với **hai tài khoản học sinh thật** | ❌ **Chưa chạy được** (không có thiết bị/tài khoản học sinh trong môi trường agent) |

## 10. QA Results

19 cổng, **tất cả exit 0** (Node 22/26, `jsdom@31.0.1`, `typescript@5.6.3`):

| Cổng | Kết quả |
|---|---|
| `content-integrity verify` | OK — 123 tệp, không nội dung giáo dục nào thay đổi |
| 11 smoke cũ (8.0.0–8.1.1) | ALL CHECKS PASSED (2 tệp được cập nhật theo cấu trúc tab mới) |
| `mistake-notebook-smoke` | 35/35 |
| `learning-analytics-smoke` | 28/28 |
| `study-planner-smoke` | 33/33 |
| `revision-engine-smoke` | 28/28 |
| `learning-data-integrity` | 37/37 |
| `learning-sync-smoke` | 22/22 |
| `version-audit` | ALL CHECKS PASSED (123 HTML, 26 JS, mọi `?v=` = 8.2.0) |
| `supabase-config` | ALL CHECKS PASSED (11 function ↔ 11 khai báo, 17 tệp TS) |

**183 kiểm tra Learning Intelligence mới**, gồm: quiz đúng/sai, làm lại quiz, refresh khi đang
học (mô phỏng bằng `reload()`), hai request cùng lúc (merge lặp), tài khoản khác truy cập trái
phép (kiểm tra quyền view), xoá/lưu trữ câu sai, hoàn thành mục tiêu, hoãn kế hoạch, phiên ôn,
tính lại analytics, migration và rollback.

Hai lỗi thật do QA phát hiện và đã sửa trong vòng phát triển:

1. **Lệch múi giờ**: khoá ngày tính theo giờ Hà Nội nhưng "hôm nay" trong lịch lại tính theo múi
   giờ máy → lệch một ngày với người dùng ngoài UTC+7. Đã thêm `BK.util.todayKey/dayKeyOf/keyAdd`
   và dùng chúng ở mọi nơi.
2. **Dữ liệu hỏng có thể vào localStorage**: `store.update()` ghi thẳng. Đã cho `save()` chạy
   `sanitize()` trước khi ghi.

## 11. GitHub Actions

- `changelog-sync.yml` — chạy sau push `main`, đồng bộ mục 8.2.0 lên Supabase.
- `quality-check.yml` — đã mở rộng lên **17 smoke test** (thêm 6 cổng Learning Intelligence).
  Badge `?branch=main` hiển thị **passing** sau khi push.
- Không đọc được API Actions chi tiết (rate limit khi chưa xác thực) → không xác nhận được
  từng bước log của run mới nhất.

## 12. Supabase Deployment

| Hạng mục | Trạng thái |
|---|---|
| Migration `20261208000000` | ✅ Applied & verified |
| `sync-student-progress` (thêm 3 khoá) | ✅ Deployed (exit 0) |
| `admin-actions` (`SERVER_VERSION 8.2.0`) | ✅ Deployed (exit 0) |
| `dev-auth` (`verify_jwt = false`) | ✅ Deployed — hết lỗi `UNAUTHORIZED_NO_AUTH_HEADER` |
| Kiểm tra API sau deploy | ✅ `401 BAD_SESSION` / `401 NO_DEV_SESSION` / `401 BAD_DEV_CODE` đúng thiết kế |
| Đồng bộ thật với tài khoản học sinh | ❌ Chưa chạy (xem mục 15) |

## 13. GitHub Pages

| Kiểm tra | Kết quả |
|---|---|
| `bk-version.js` trên production | `app: '8.2.0'` (HTTP 200) |
| `assets/bakhi/bk-learning.js` | HTTP 200, 69 492 byte, chứa `BKLearning` |
| `index.html` nạp `bk-learning.js?v=8.2.0` | ✅ |
| `settings/index.html` nạp `bk-learning.js?v=8.2.0` | ✅ |
| Giao diện hiển thị đúng trên trình duyệt | ❌ **Chưa xem bằng mắt** (môi trường không có trình duyệt) |

## 14. Known Issues

1. **Chưa kiểm tra giao diện bằng mắt.** 6 khu vực mới (đặc biệt lưới lịch tháng, donut phân bố
   lỗi) mới chỉ được kiểm tra ở mức DOM trong jsdom, chưa xem trên desktop/mobile thật.
2. **"Bạn chọn" là best-effort.** Với trang bài học không có `input[type=radio]`/`.is-wrong`/
   `.selected` trong cùng khối, Sổ tay hiển thị "—" cho đáp án đã chọn thay vì đoán bừa.
3. **Không có chỉ số thời gian học.** Cố ý: Bá Khí không chạy bộ đếm thời gian. Tab Phân tích
   dùng "ngày hoạt động" và "số lượt luyện" thay thế.
4. **`bk-notify.js` vẫn được nạp** ở trang chủ (Deprecated, có điều kiện xoá rõ ràng).
5. **Hai hệ thành tích song song** (30 mốc trong `bk-core` + 78 huy hiệu hồ sơ ở `bk-badges`).
   Chưa hợp nhất vì 78 huy hiệu do máy chủ xác minh và đang được trao thật; gộp lúc này sẽ phá
   dữ liệu đã trao.

## 15. Blocked Tasks / chưa xác minh

| Việc | Trạng thái | Cần gì |
|---|---|---|
| E2E: làm sai câu trên trang bài học → Sổ tay câu sai | **Chưa xác minh** | Trình duyệt + một trang có ngân hàng câu hỏi |
| E2E: đăng nhập hai thiết bị, tạo nhiệm vụ ở A, thấy ở B | **Chưa xác minh** | Hai thiết bị đã gắn cùng học sinh |
| RLS với hai tài khoản học sinh thật | **Chưa xác minh** | Hai tài khoản học sinh thật |
| Kiểm tra responsive/thiết bị thật | **Chưa xác minh** | Thiết bị hoặc trình duyệt |
| Đọc log chi tiết của GitHub Actions run mới nhất | **Blocked** | Token GitHub hoặc quyền xem Actions API |

## 16. Kết luận

**PARTIALLY READY.**

Đã **Implemented + Tested + Deployed + Verified** (có bằng chứng thực tế): mã nguồn, migration
trên production, ba Edge Function, site GitHub Pages phục vụ 8.2.0, 19 cổng QA, đồng bộ dữ liệu
không mất/không trùng bản ghi.

Chưa đạt **PRODUCTION READY** vì bốn việc ở mục 15 cần thiết bị, tài khoản học sinh thật hoặc
trình duyệt — những thứ môi trường này không có. Không có phần nào trong bốn việc đó được đánh
dấu hoàn thành.

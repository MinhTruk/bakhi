# Learning Intelligence (8.2.0)

Bốn hệ thống học tập của Bá Khí — Sổ tay câu sai, Phân tích học tập cá nhân, Lập kế hoạch
học tập, Ôn tập thông minh — cùng ba khu vực hỗ trợ (Tổng quan, Môn học, Mục tiêu).

Tài liệu liên quan: [ARCHITECTURE.md](ARCHITECTURE.md) · [LEARNING_ANALYTICS.md](LEARNING_ANALYTICS.md)
· [REVISION_ENGINE.md](REVISION_ENGINE.md) · [DATA_MIGRATION_V820.md](DATA_MIGRATION_V820.md)

---

## 1. Nguyên tắc: một nguồn dữ liệu

Toàn bộ Learning Intelligence đọc/ghi **một** kho dữ liệu: `BK.store` → `localStorage["bakhiLearn.v1"]`
(schema 2), đồng bộ lên Supabase qua **một** bảng `student_progress` (khoá–giá trị theo học sinh).

| Vai trò | Nơi lưu | Ghi chú |
|---|---|---|
| Source of truth (thiết bị) | `bakhiLearn.v1` | Mọi thao tác học tập đi qua `BK.store.update` |
| Source of truth (máy chủ) | `student_progress` | Cùng khoá, cùng payload; RLS theo `bakhi_current_student_id()` |
| Dữ liệu dẫn xuất | tính tại chỗ mỗi lần mở | Accuracy, Learning Score, chuỗi biểu đồ, chủ đề yếu |
| Cache / UI state | bộ nhớ trong `bk-learning.js` | Bộ lọc, tab đang mở, phiên ôn đang chạy |
| Nháp cục bộ | `bakhiLearn.v1` trước khi đồng bộ | Không có nguồn thứ hai nào khác |

**Không** có bảng `mistakes`, `study_plans`, `analytics` riêng. Dữ liệu học tập đã có chỗ lưu
đúng nghĩa; tạo bảng mới cho cùng dữ liệu sẽ vi phạm nguyên tắc "replace, don't accumulate".
Hai view chỉ đọc `learning_mistakes_v` / `learning_plans_v` suy ra từ JSONB cho truy vấn SQL
(xem [DATA_MIGRATION_V820.md](DATA_MIGRATION_V820.md)).

### Khoá dữ liệu trong `bakhiLearn.v1`

```js
{
  v: 2,
  practice: [],          // mọi lượt trả lời — nguồn gốc của phân tích
  review: [],            // SỔ TAY CÂU SAI (tên khoá giữ nguyên từ 8.0.0)
  plans: [],             // nhiệm vụ kế hoạch
  goals: [],             // mục tiêu học tập
  revisionSessions: [],  // phiên ôn
  notes: [], bookmarks: [], history: [],
  achievements: { unlocked: {}, counters: {} },
  prefs: { spaced, analytics, planner, ai, cloud, focus, fontSize, ambient },
  meta: { version: '3.0.0', schema: 2, migratedFrom: 1 }
}
```

Vì sao vẫn tên `review`: đây là khoá đã được đồng bộ lên `student_progress` từ 8.0.0. Đổi tên
sẽ tạo khoá mới song song và **mất dữ liệu của học sinh đang dùng bản cũ**. Tên hiển thị là
"Sổ tay câu sai"; tên khoá là chi tiết kỹ thuật, được ghi ở đây và trong `AGENTS.md`.

---

## 2. Sổ tay câu sai

Ghi tự động khi `BK.practice({ correct: false, ... })` được gọi — từ `bk-page.js` (trang bài học)
hoặc từ Trung tâm ôn tập.

Mỗi bản ghi (`s.review[i]`):

| Trường | Ý nghĩa |
|---|---|
| `key` | Khoá duy nhất theo `subject + questionId + 300 ký tự đầu của câu hỏi` |
| `question`, `options`, `answer`, `chosen` | Nội dung câu hỏi, đáp án đúng, đáp án học sinh đã chọn |
| `explanation` | Lời giải của trang gốc (chỉ sao chép, không sửa) |
| `subject`, `topic`, `difficulty`, `source` | Định danh môn/chương/bài |
| `wrong`, `right`, `streak` | Số lần sai/đúng, chuỗi đúng liên tiếp |
| `status` | `new` · `reviewing` · `needs_attention` · `mastered` · `archived` |
| `errorType` | `unclassified` · `knowledge_gap` · `misunderstanding` · `calculation` · `careless` · `memory` |
| `note`, `pinned` | Ghi chú cá nhân, ghim ưu tiên |
| `nextReview`, `intervalDays`, `ease` | Trạng thái lịch ôn (xem REVISION_ENGINE) |
| `history[]` | `{ ts, correct, perf, sessionId }` — lịch sử sửa sai |

Quy tắc:

- **Không trùng bản ghi.** Gặp lại cùng `key` thì cập nhật `wrong`, `history`, lịch ôn.
- **Không tự đoán nguyên nhân sai.** `errorType` mặc định `unclassified`; học sinh tự đổi.
- **Xoá khỏi sổ tay ≠ xoá lịch sử.** `practice` và `history` không bị đụng tới.
- **Lưu trữ** giữ bản ghi (và lịch sử) nhưng loại khỏi hàng đợi ôn và thống kê "đang theo dõi".

Giao diện: tab **Sổ tay câu sai** trong Trung tâm học tập — thẻ thống kê, lọc theo môn/chương/
loại lỗi/trạng thái, tìm kiếm, sắp xếp theo ưu tiên (ghim → cần chú ý → quá hạn → số lần sai).

---

## 3. Phân tích học tập cá nhân

Xem [LEARNING_ANALYTICS.md](LEARNING_ANALYTICS.md) cho công thức và giới hạn dữ liệu.

---

## 4. Lập kế hoạch học tập

Dữ liệu: `s.plans[]` — `{ id, title, subject, lesson, topic, date (YYYY-MM-DD), durationMin,
status, notes, goalId, source, createdAt, updatedAt, completedAt }`.

- `status`: `planned` · `done` · `postponed` · `skipped`.
- `durationMin` là **ước lượng** để học sinh tự sắp xếp. Bá Khí không có đồng hồ đếm ngược,
  không chấm thời gian, không nhắc gây áp lực.
- Giao diện: **Hôm nay**, **Tuần** (lưới 7 cột), **Tháng** (lưới tháng), cùng các nhóm
  *Quá hạn / Hôm nay / Sắp tới / Đã xong*.
- **Gợi ý thông minh** (`BK.planner.suggestions`) chỉ *đề xuất* dựa trên: câu đến hạn ôn, chủ đề
  yếu (≥ 4 câu, độ chính xác < 70% hoặc ≥ 2 câu sai), nhiệm vụ quá hạn. Học sinh chọn
  **Nhận / Chỉnh sửa / Bỏ qua**; không có nhiệm vụ nào được tự thêm vào lịch.
- Tắt gợi ý: `prefs.planner.suggestions = false` (Cài đặt học tập).

## 5. Mục tiêu học tập

Dữ liệu: `s.goals[]` — `{ id, title, subject, metric, target, deadline, status, createdAt,
completedAt }`. `metric` ∈ `questions` · `lessons` · `mastered` · `activeDays`.

Tiến độ **luôn tính lại** từ dữ liệu gốc kể từ `createdAt` của mục tiêu (`BK.goals.items()`),
không lưu bộ đếm riêng nên không thể bị chỉnh từ trình duyệt để "tăng thành tích".

## 6. Tổ chức Trung tâm học tập

| Tab | Nội dung | Nguồn |
|---|---|---|
| Tổng quan | Learning Score, việc cần làm hôm nay, hoạt động 14 ngày, tiến độ môn | tổng hợp |
| Môn học | Bảng tiến độ từng môn | `practice`, `history`, `review`, `plans` |
| Sổ tay câu sai | Câu sai, phân loại, ghi chú, lưu trữ | `review` |
| Phân tích | 7 biểu đồ + chỉ số + chủ đề yếu + nhật ký | `practice`, `review`, `plans` |
| Kế hoạch | Nhiệm vụ, lịch ngày/tuần/tháng, gợi ý | `plans` |
| Ôn tập | Hàng đợi, phiên ôn, lịch sử phiên | `review`, `revisionSessions` |
| Mục tiêu | Mục tiêu và tiến độ | `goals` |
| Ghi chú · Đánh dấu · Thành tích · Cài đặt | Công cụ cá nhân (giữ nguyên từ 8.1.x) | `notes`, `bookmarks`, … |

Tab cũ **Ôn tập** (thẻ ôn tập trùng logic với sổ tay) và tab **Lịch sử** (đã gộp vào Phân tích)
đã được **xoá khỏi mã nguồn**, không giữ song song.

## 7. Mô-đun

| Tệp | Trách nhiệm |
|---|---|
| `assets/bakhi/bk-core.js` | Store, `practice()`, `BK.mistakes`, `BK.revision`, `BK.planner`, `BK.goals`, `BK.analytics` |
| `assets/bakhi/bk-learning.js` | Giao diện 6 khu vực Learning Intelligence + biểu đồ SVG |
| `assets/bakhi/bk-learn.js` | Khung hub, tab cá nhân, tìm kiếm, command palette, dock |
| `assets/bakhi/bk-page.js` | Ghi nhận câu trả lời từ trang bài học (kèm đáp án đã chọn nếu đọc được) |
| `assets/bakhi/bk-cloud.js` | Đồng bộ `student_progress`, hợp nhất nhiều thiết bị |

## 8. Câu hỏi thường gặp

**Có bộ đếm thời gian học không?** Không. `durationMin` chỉ là ước lượng của học sinh.
**Có xếp hạng hay so sánh giữa học sinh?** Không. Mọi chỉ số là cá nhân.
**Learning Score có thay điểm chính thức?** Không. Nó là chỉ số tự theo dõi, có tài liệu công thức,
có giới hạn 0–100 và không dùng để đánh giá kết quả học tập.
**Mất mạng thì sao?** Mọi thứ vẫn hoạt động trên thiết bị; đồng bộ chạy lại khi có mạng.

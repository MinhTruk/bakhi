# Phân tích học tập cá nhân (8.2.0)

Mọi chỉ số trong tài liệu này được **tính lại từ dữ liệu gốc** (`s.practice`, `s.review`,
`s.plans`, `s.history`, `s.revisionSessions`) mỗi lần mở tab Phân tích. Không có bảng
analytics, không có bản ghi snapshot, không có số liệu demo hay ngẫu nhiên.

Mã nguồn: `BK.analytics` trong `assets/bakhi/bk-core.js`; giao diện trong `bk-learning.js`.

---

## 1. Khoảng thời gian

`BK.analytics.summary(days)` với `days` ∈ `7`, `30`, `90`, `0` (0 = tất cả thời gian).
Mốc bắt đầu tính từ 00:00 giờ Hà Nội của `days - 1` ngày trước.

## 2. Chống nhiễu trước khi tính

`effectivePractice(days)` chỉ giữ **lần trả lời đầu tiên** của mỗi câu trong một ngày
(khoá `dayKey + questionId`). Hệ quả:

- Làm lại cùng một câu 40 lần trong ngày **không** làm tăng số câu, độ chính xác hay Learning Score.
- `summary().rawAttempts` vẫn phản ánh số lượt thật để học sinh đối chiếu.
- Hành vi "cày" câu dễ không được thưởng.

## 3. Chỉ số

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| Câu đã luyện | số phần tử `effectivePractice` | đã khử trùng theo ngày/câu |
| Độ chính xác | `correct / total × 100` (làm tròn) | 0 khi chưa có dữ liệu, không chia cho 0 |
| Ngày hoạt động | số `dayKey` khác nhau | **không** phải "chuỗi ngày" — không có streak |
| Bài đã mở | số `url` bài học khác nhau trong `history` | |
| Câu sai / đến hạn / thành thạo | từ `BK.mistakes.stats()` | |
| Phiên ôn | `revisionSessions` đã kết thúc trong khoảng | |
| Kế hoạch | số nhiệm vụ tạo trong khoảng, số đã xong | |

**Không có chỉ số "tổng thời gian học".** Bá Khí không chạy bộ đếm thời gian (xem `AGENTS.md`
mục 1.2 và 5), nên thời gian học **không được đo** và **không được bịa**. Chỉ số thay thế là
*ngày hoạt động* và *số lượt luyện*.

## 4. Biểu đồ

| Biểu đồ | Dữ liệu | Cách vẽ |
|---|---|---|
| Learning Activity | số câu/ngày (≤ 31 cột gần nhất) | cột CSS `.bk-bars` |
| Accuracy Trend | gộp thành ≤ 12 điểm, `correct/total` mỗi điểm | SVG polyline |
| Subject Performance | `subjectPerformance(days)` | thanh tiến độ |
| Mistake Distribution | `mistakeDistribution(days)` theo `errorType` | SVG donut + chú giải |
| Weekly Progress | 8 tuần gần nhất | cột CSS |
| Monthly Overview | 6 tháng gần nhất | cột CSS |

Không nạp thư viện biểu đồ: mỗi lần mở tab chỉ dựng vài node SVG, không có phụ thuộc mạng và
không có nguy cơ nạp trùng thư viện.

## 5. Chủ đề yếu

`weakTopics(limit)`:

- Nhóm theo `topic + subject`.
- **Chỉ kết luận khi ≥ 4 câu** đã luyện ở chủ đề đó (chống kết luận vội).
- "Yếu" khi độ chính xác < 70% **hoặc** có ≥ 2 câu trong Sổ tay câu sai.
- Sắp xếp theo độ chính xác tăng dần, rồi số câu sai giảm dần.
- Gợi ý hành động: ôn câu sai của chủ đề, hoặc thêm nhiệm vụ vào kế hoạch hôm nay.

## 6. Learning Score

Chỉ số tổng hợp **0–100**, có tài liệu, có giới hạn, tính lại được và **không** thay điểm chính thức.

### 6.1. Điều kiện dữ liệu

Chỉ tính khi có **≥ 10 câu** trong 90 ngày (đã khử trùng). Dưới ngưỡng: `score = null`,
giao diện hiển thị "cần thêm dữ liệu" — không hiển thị số 0 gây hiểu nhầm.

### 6.2. Thành phần và trọng số

| Thành phần | Trọng số | Công thức |
|---|---|---|
| Accuracy | 40 | `correct / total` trên 90 ngày (đã khử trùng) |
| Consistency | 20 | `min(1, activeDays / 14)` |
| Progress | 20 | `mastered / max(1, mistakes)` |
| Revision | 10 | `min(1, số câu có streak > 0 / max(1, mistakes))` |
| Planning | 10 | `done / plansPast` — **chỉ thêm khi có nhiệm vụ đã đến ngày** |

`score = round(Σ(weight × ratio) / Σ(weight) × 100)`, mỗi `ratio` bị kẹp trong `[0, 1]`.

Khi chưa có kế hoạch, thành phần Planning bị **bỏ khỏi mẫu số** thay vì cho điểm miễn phí.

### 6.3. Chống lạm dụng

- Không thể tăng bằng cách lặp câu đã đúng (dedupe theo ngày/câu).
- Không thể tăng bằng cách tạo nhiệm vụ rồi tự đánh dấu xong liên tục: Planning chỉ chiếm 10 và
  chỉ tính nhiệm vụ đã đến ngày.
- Không có API nào cho client đặt điểm trực tiếp; điểm luôn suy ra từ dữ liệu.
- Điểm không bao giờ vượt 100 hay xuống dưới 0.

### 6.4. Ví dụ

40 câu, đúng 30 (75%), 6 ngày hoạt động trong 14 ngày, 10 câu sai trong đó 4 thành thạo,
6 câu có streak > 0, 5 nhiệm vụ đã đến ngày và 3 xong:

```
Accuracy   40 × 0.75 = 30.0
Consistency 20 × 0.43 =  8.6   (6/14)
Progress   20 × 0.40 =  8.0
Revision   10 × 0.60 =  6.0
Planning   10 × 0.60 =  6.0
Σ = 58.6 / 100 → 59
```

## 7. Nhật ký hoạt động

Tab Phân tích hiển thị 15 hoạt động gần nhất từ `s.history` (bài học, luyện tập, phiên ôn) và
cho phép xoá nhật ký — chỉ xoá `history`, không đụng `practice`, `review`, `plans`, `goals`.

## 8. Kiểm thử

`tools/qa/learning-analytics-smoke.js` (28 kiểm tra): chỉ số cơ bản, khử trùng khi lặp câu,
chuỗi theo ngày, hiệu suất môn, ngưỡng chủ đề yếu, phân bố lỗi, Learning Score có giới hạn và
không đổi khi spam.

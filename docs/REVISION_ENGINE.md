# Revision Engine — Ôn tập thông minh (8.2.0)

Hệ thống ôn tập dùng **spaced repetition có giới hạn**, tính từ chính kết quả trả lời của học
sinh. Không có bộ đếm thời gian, không có bài kiểm tra, không xếp hạng.

Mã nguồn: `scheduleMistake`, `BK.revision` trong `assets/bakhi/bk-core.js`; giao diện trong
`bk-learning.js` (tab **Ôn tập**) và phiên ôn dùng chung ngân hàng câu hỏi với Sổ tay câu sai.

---

## 1. Trạng thái một câu

| Trạng thái | Điều kiện |
|---|---|
| `new` | Vừa được ghi nhận, chưa ôn lần nào |
| `reviewing` | Đang trong lịch ôn bình thường |
| `needs_attention` | Sai ≥ 2 lần (hoặc học sinh tự đánh dấu) |
| `mastered` | Chuỗi đúng ≥ 2 **và** khoảng cách ôn ≥ 21 ngày |
| `archived` | Học sinh lưu trữ; giữ lịch sử, không vào hàng đợi |

Một câu trả lời đúng duy nhất **không bao giờ** đưa câu hỏi sang `mastered`. Đây là quy tắc
bắt buộc và có kiểm thử riêng (`revision-engine-smoke` mục [3]).

## 2. Công thức lịch ôn

Cấu hình mặc định: `again = 1`, `hard = 3`, `good = 7`, `easy = 14`, `max = 90` (ngày), học sinh
đổi được ở Cài đặt học tập.

Mỗi câu giữ `ease` (1.3–3.0, mặc định 2.5), `intervalDays`, `streak`.

```
again:  streak = 0
        ease   = max(1.3, ease − 0.2)
        next   = again

khác:   streak = streak + 1
        hard  → ease = max(1.3, ease − 0.15)
        easy  → ease = min(3.0, ease + 0.15)
        next  = intervalDays ? round(intervalDays × ease) : base
                (hard: max(hard, round(intervalDays × 1.3)))
        next  = clamp(next, again, max)
```

Sau khi tính:

```
if (perf === 'again')                       status = wrong >= 2 ? needs_attention : reviewing
else if (streak >= 2 && next >= 21)         status = mastered
else                                        status = reviewing
```

Ví dụ với cấu hình mặc định, sau khi sai một câu: đúng lần 1 → 7 ngày; đúng lần 2 → ~18 ngày
(chưa thành thạo); đúng lần 3 → ~45 ngày (đạt ngưỡng 21, `mastered`).

`BK.markReview(key, 'mastered')` cho phép học sinh tự đánh dấu thành thạo — hành động có chủ ý,
không phải suy diễn tự động.

## 3. Hàng đợi

`BK.revision.queue(scope, { subject, topic, limit })`:

| Phạm vi | Nội dung |
|---|---|
| `due` | Đến hạn hôm nay (`nextReview <= now`), chưa thành thạo, chưa lưu trữ |
| `overdue` | Quá hạn hơn 1 ngày |
| `upcoming` | Chưa đến hạn, sắp xếp theo ngày gần nhất |
| `weak` | Câu thuộc chủ đề yếu (theo `BK.analytics.weakTopics`) |
| `recent` | Câu vừa sai gần đây (theo `lastSeen`) |

Sắp xếp mặc định theo **độ ưu tiên**: ghim (+1000) → cần chú ý (+300) → quá hạn (4 điểm/ngày,
tối đa 200) → số lần sai (10 điểm/lần, tối đa 150).

## 4. Phiên ôn

```
session = BK.revision.start(scope | 'single', [keys?])   // tối đa 40 câu
BK.revision.answer(sessionId, key, correct)              // chấm + cập nhật lịch ôn
BK.revision.end(sessionId)                                // tổng kết + ghi lịch sử
```

Bảo đảm:

- **Không sửa kết quả luyện tập gốc.** Phiên ôn chỉ thêm `history` vào câu sai và ghi
  `revisionSessions`; `s.practice` không đổi. Có kiểm thử riêng.
- `revisionSessions[].items[] = { key, correct }` → tính lại được số đúng/tổng.
- Kết thúc phiên ghi một dòng vào nhật ký hoạt động (`history`, kind `review`).
- Đáp án đúng hiển thị ngay sau khi trả lời; câu không lưu phương án thì học sinh tự đánh giá
  "Nhớ tốt / Chưa nhớ".
- Câu đã `archived` hoặc `mastered` không vào hàng đợi; trả lời sai lại sẽ tự đưa về `reviewing`.

## 5. Liên kết với các hệ thống khác

| Sự kiện | Kết quả |
|---|---|
| Trả lời sai trên trang bài học | Câu vào Sổ tay + có lịch ôn |
| Trả lời sai trong phiên ôn | `wrong +1`, `streak = 0`, lịch về mức ngắn nhất |
| Trả lời đúng trong phiên ôn | `right +1`, `streak +1`, lịch giãn ra |
| Câu `mastered` | Tính vào Learning Score (Progress), biến mất khỏi hàng đợi |
| Kế hoạch | Gợi ý "Ôn N câu đã đến hạn" khi hàng đợi có câu |

## 6. Kiểm thử

`tools/qa/revision-engine-smoke.js` (28 kiểm tra): câu mới vào lịch ngày mai, các phạm vi hàng
đợi, một câu đúng chưa thành thạo, ngưỡng thành thạo 21 ngày, sai lại reset, phiên ôn không sửa
`practice`, lưu trữ bị loại khỏi hàng đợi, giới hạn 40 câu/phiên.

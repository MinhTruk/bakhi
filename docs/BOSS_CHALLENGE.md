# BOSS CHALLENGE (v8.3.0)

## 1. Mục tiêu

Thử thách tổng hợp để người học tự đánh giá mức làm chủ kiến thức — không phải
mini-game phản xạ, không có đồng hồ đếm ngược, không xếp hạng.

## 2. Phân loại

`kind`: `subject` (theo môn), `chapter` (theo chương), `knowledge` (nhóm kiến thức),
`revision` (ôn tập), `weekly` (theo tuần).

## 3. Cấu trúc

`boss_challenges`: `slug` (duy nhất), `name`, `description`, `kind`, `subject`,
`chapter`, `difficulty`, `pass_score` (%), `max_attempts`, `reward`,
`opens_at`, `closes_at`, `is_active`, `created_by`.

`boss_questions`: `prompt`, `options` (2–6), `correct_index`, `explanation`,
`sort_order`. **Không** cấp quyền đọc cho `anon`/`authenticated`; chỉ `service_role`.

`boss_attempts`: `idempotency_key`, `correct_count`, `total_count`, `score`,
`passed`, `answers` (chi tiết từng câu do máy chủ chấm), `created_at`.
Ràng buộc `unique(student_id, idempotency_key)`.

## 4. Nội dung do ai tạo

Bá Khí không có ngân hàng câu hỏi phía máy chủ trước 8.3.0. Để không bịa nội dung
giáo dục và vẫn chấm điểm an toàn:

- Thử thách **do quản trị viên biên soạn** trong Admin → Tiến trình → Thử thách Boss.
- Định dạng nhập: mỗi dòng `Nội dung | Phương án 1 | Phương án 2 | ... | số đáp án đúng | Giải thích`.
- **Không seed sẵn thử thách nào.** Khi chưa có, giao diện hiện trạng thái rỗng
  trung thực. Đây là lựa chọn có chủ đích, không phải tính năng giả.

## 5. Luồng làm bài

1. `boss.start` → máy chủ kiểm tra thử thách đang mở, số lượt còn lại, có câu hỏi;
   trả `questions` **chỉ gồm id, prompt, options**.
2. Người học chọn đáp án; giao diện gửi `boss.submit` với `[{question_id, choice}]`
   và một `idempotency_key` cho cả lượt.
3. `bk_gam_boss_submit()` chấm bằng `boss_questions.correct_index` trong Postgres,
   ghi `boss_attempts`, trả `details` (đúng/sai + đáp án đúng + giải thích) sau khi nộp.
4. Nếu `passed`: cấp XP `boss_passed` (idempotency `boss:<attempt_id>`) và vật phẩm
   trong `challenge.reward.items`, rồi chạy `bk_gam_evaluate()`.
5. Không ghi vào lịch sử quiz thông thường: kết quả nằm ở `boss_attempts` và hiển thị
   riêng trong trang tiến trình.

## 6. Chống gian lận

- Đáp án không bao giờ gửi xuống trình duyệt trước khi nộp.
- Điểm và XP do máy chủ tính; client không gửi điểm.
- Nộp lại cùng `idempotency_key` trả kết quả cũ, không cộng XP lần hai.
- Giới hạn `max_attempts`; kiểm tra `opens_at`/`closes_at`.
- Edge Function giới hạn tốc độ và chỉ nhận tối đa 50 câu/lượt.

## 7. Kết quả & kết nối

Sau khi nộp: điểm, số câu đúng, chi tiết từng câu kèm giải thích, XP (nếu đạt).
Kết quả được dùng cho chỉ số `boss_passed`/`boss_attempts` → thành tựu `boss`,
node nhánh `mastery`, nhiệm vụ tuần.
**Chưa** tự động ghi câu sai vào Sổ tay câu sai vì nội dung Boss độc lập với ngân
hàng câu hỏi của trang bài học; đây là hạn chế đã biết, ghi trong báo cáo phát hành.

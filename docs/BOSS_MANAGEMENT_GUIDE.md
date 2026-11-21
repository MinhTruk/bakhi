# Hướng dẫn quản lý Thử thách Boss

Mở: **Founder/Administrator Dashboard → Tiến trình → Thử thách Boss**

Bạn chỉ cần nhập **tên**, **nội dung** và **câu hỏi**. Mã Boss được tạo tự động.

---

## 1. Tạo Boss

1. Bấm **Soạn Boss mới**.
2. **Bước 1 — Thông tin Boss**: nhập **Tên Boss** (ví dụ `Ma Vương`).
   Hệ thống hiện ngay dòng “Mã Boss sẽ dùng: `ma_vuong`”.
3. **Bước 2 — Điều kiện & độ khó**: chọn Loại, Môn, Chương/chủ đề, Độ khó, Điểm đạt (%),
   số lượt thử tối đa, và bật/tắt “Đang mở cho học sinh”.
4. **Bước 3 — Câu hỏi**: mỗi dòng một câu theo đúng mẫu:

   ```
   Nội dung câu hỏi | Phương án 1 | Phương án 2 | … | số thứ tự đáp án đúng | Giải thích
   ```

   Ví dụ:

   ```
   Thủ đô Việt Nam là gì? | Hà Nội | Huế | Đà Nẵng | 1 | Hà Nội là thủ đô.
   ```

   Dòng không đúng mẫu bị bỏ qua và không tính vào số câu hợp lệ (hiển thị ngay bên dưới).
5. **Bước 4 — Xem trước**: xem tên, mã, loại, độ khó, số câu, số lượt.
6. Bấm **Lưu Boss**.

---

## 2. Sửa Boss

1. Tìm Boss trong danh sách (ô tìm kiếm theo tên hoặc mã).
2. Bấm **Sửa**.
3. Sửa các trường cần thiết. **Câu hỏi phải nhập lại toàn bộ** khi sửa — đáp án đúng không
   được gửi về trình duyệt để tránh lộ đề.
4. Bấm **Lưu Boss**.

Mã cũ được giữ nếu bạn không đổi. Nếu đổi mã, Boss cũ vẫn còn — hệ thống cảnh báo mã trùng
và đề xuất mã khác.

---

## 3. Đóng / lưu trữ Boss

| Nút | Kết quả |
|---|---|
| **Lưu trữ** | Boss không còn mở cho học sinh; câu hỏi, lượt thử và lịch sử vẫn giữ |

Không có thao tác xóa cứng Boss: dữ liệu lượt thử là lịch sử học tập, không được xóa.

---

## 4. Mã Boss

- Tự sinh từ tên: `Long Thần Hủy Diệt` → `long_than_huy_diet`.
- Chữ thường, không dấu, `đ` → `d`, khoảng trắng và ký tự đặc biệt → `_`.
- Chỉ gồm chữ thường, số, `_`, `-`; bắt đầu bằng chữ hoặc số; dài 3–64 ký tự.
- Không trùng: nếu trùng, hệ thống đề xuất `ma_vuong_2` và bạn phải xác nhận.
- Muốn đổi mã: mở **Cài đặt nâng cao**. Chỉ đổi khi thật cần, vì học sinh đang mở Boss
  bằng mã cũ.

---

## 5. Câu hỏi an toàn

- Nội dung câu hỏi và đáp án đúng chỉ nằm ở máy chủ (`boss_questions`, chỉ service role đọc).
- Học sinh nhận câu hỏi qua `boss.start`; đáp án đúng không bao giờ trả về trình duyệt.
- Chấm điểm và cộng XP chạy trong Postgres (`bk_gam_boss_submit`), có chống nộp trùng.

---

## 6. Kiểm tra nhanh sau khi tạo

1. Mở `/gamification/` bằng tài khoản học sinh.
2. Boss mới xuất hiện trong mục **Thử thách Boss** nếu đang mở và trong thời gian mở.
3. Làm thử, nộp bài, xem điểm và XP.

Nếu Boss không hiện: kiểm tra “Đang mở”, `closes_at` (Cài đặt nâng cao) và việc đã lưu câu hỏi.

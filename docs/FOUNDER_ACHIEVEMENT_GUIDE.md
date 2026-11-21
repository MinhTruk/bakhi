# Hướng dẫn quản lý Thành tích (dành cho người không biết lập trình)

Mở: **Founder Dashboard → Tiến trình → Thành tựu**
(hoặc Administrator Dashboard → Tiến trình → Thành tựu nếu tài khoản có quyền).

Bạn **không cần** biết mã, JSON, SQL hay lập trình. Chỉ cần biết mình muốn tạo thành tích gì.

---

## 1. Tạo một thành tích mới

1. Bấm **Tạo mới** ở khu vực **Thành tựu**.
2. Điền **Bước 1 — Thông tin cơ bản**:
   - **Tên thành tựu**: học sinh sẽ thấy, ví dụ `Ma Vương`.
   - **Mô tả**: một câu dễ hiểu, ví dụ “Vượt 1000 XP”.
   - **Biểu tượng**: gõ tên icon Font Awesome, ví dụ `fa-crown`. Không chắc thì để `fa-medal`.
   - **Độ hiếm**: Phổ biến → Huyền thoại. Chỉ ảnh hưởng màu khung thành tích.
   - **Nhóm**: Học tập / Luyện tập / Ôn tập / Đều đặn / Tinh thông.
3. Điền **Bước 2 — Điều kiện nhận**:
   - Chọn **Điều kiện nhận** trong danh sách (ví dụ “Tổng XP đạt được”).
   - Nhập **Mốc cần đạt** (ví dụ `1000`).
   - **Số bậc**: để `1` nếu chỉ có một mức; nhập `3` nếu muốn Bậc 1/2/3.
4. Điền **Bước 3 — Phần thưởng, hiển thị & trạng thái**:
   - **Vật phẩm thưởng**: mã vật phẩm trong Danh mục phần thưởng, cách nhau bằng dấu phẩy
     (ví dụ `frame-laurel`). Có thể để trống.
   - **XP thưởng thêm**: để `0` nếu không cộng XP.
   - **Ẩn khỏi danh sách**: bật nếu là thành tựu bí mật.
   - **Đang bật**: bật để học sinh có thể nhận.
5. Xem khung **Xem trước** — nó cập nhật ngay khi bạn gõ.
6. Bấm **Lưu thay đổi**.

Mã thành tích (`ma_vuong`) được **tự tạo từ tên**. Bạn không phải nhập.

---

## 2. Sửa một thành tích

1. Tìm thành tích trong danh sách (dùng ô tìm kiếm hoặc bộ lọc trạng thái).
2. Bấm **Sửa**.
3. Biểu mẫu đã điền sẵn dữ liệu cũ — chỉ sửa phần cần đổi.
4. Bấm **Lưu thay đổi**, hoặc **Hủy** để bỏ.

Không cần tạo lại, không cần nhập lại các trường không đổi.

---

## 3. Tạm ngừng, kích hoạt, lưu trữ, xóa

| Nút | Ý nghĩa | Dữ liệu |
|---|---|---|
| **Tạm ngừng** | Học sinh không nhận được nữa, thành tích vẫn còn | Giữ nguyên |
| **Kích hoạt** | Bật lại thành tích đã tạm ngừng | Giữ nguyên |
| **Xóa** | Xóa hẳn khỏi hệ thống | Chỉ xóa được khi **chưa ai nhận** |

Nếu đã có học sinh nhận, hệ thống từ chối xóa và hướng dẫn dùng **Tạm ngừng** — nhờ vậy
không mất thành tích đã trao và không mất lịch sử.

---

## 4. Mã bị trùng thì làm sao?

Khi bạn gõ tên, hệ thống tạo mã. Nếu mã đó đã có, bạn sẽ thấy:

> Mã “ma_vuong” đã tồn tại. Đề xuất: “ma_vuong_2”. **[Dùng mã đề xuất]**

- Bấm **Dùng mã đề xuất** để dùng mã mới, hoặc đổi tên thành tích.
- Nếu vẫn bấm Lưu với mã trùng, hệ thống **không ghi đè** thành tích cũ và báo lỗi bằng
  tiếng Việt.
- Máy chủ cũng kiểm tra lại: tạo mới mà mã đã tồn tại sẽ trả `CODE_TAKEN`.

---

## 5. Cài đặt nâng cao (khi nào cần?)

Mục **“Cài đặt nâng cao (dành cho kỹ thuật)”** mặc định đóng. Chỉ mở khi:

- Muốn đổi mã thành tích (ví dụ để khớp tài liệu cũ).
- Muốn sắp xếp thứ tự hiển thị.

**Lưu ý:** đổi mã của một thành tích đã có người nhận sẽ tạo thành tích *mới*; lịch sử cũ
không đi theo. Hãy giữ mã cũ nếu không thật sự cần.

---

## 6. Câu hỏi thường gặp

**Học sinh có tự khai điều kiện không?**
Không. Điều kiện do máy chủ đếm từ dữ liệu học tập thật (sổ XP, bài quiz, Boss, cây kỹ năng).

**Tôi gõ sai độ hiếm/nhóm thì sao?**
Giao diện chỉ cho chọn giá trị hợp lệ, nên không thể gửi giá trị lạ.

**Thành tích có cộng XP hai lần không?**
Không. Reward Engine chạy trong một transaction ở Postgres và có khoá chống trùng.

**Trao thành tích cho một học sinh cụ thể thì ở đâu?**
Founder Dashboard → **Thành tích** (trao badge/khung), còn *định nghĩa* thành tích nằm ở
tab **Tiến trình → Thành tựu** như hướng dẫn này.

**Ai được tạo/sửa?**
Chỉ phiên Administrator/Founder hợp lệ. Máy chủ kiểm tra quyền và ghi audit log
(`achievement_save`, `achievement_delete`).

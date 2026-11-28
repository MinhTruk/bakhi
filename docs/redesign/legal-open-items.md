# Legal open items — cần quản trị xác nhận

Nguồn: các marker `[CẦN QUẢN TRỊ XÁC NHẬN: …]` trong `assets/bakhi/bk-legal.js` (một nguồn nội
dung cho cả Điều khoản và Quyền riêng tư). Ngày 27/11/2026.

Nội dung pháp lý hiện tại **chỉ mô tả điều đọc được từ mã nguồn**: dữ liệu nào được thu thập, lưu
ở Supabase hay trên máy, gửi tới nhà cung cấp AI nào, không hứa hẹn bảo mật, không nêu thời hạn
lưu, không khẳng định tuân thủ bất kỳ luật nào. Mọi chỗ thiếu được đánh dấu trong trang.

## Cần xác nhận

| # | Nội dung | Xuất hiện ở |
|---|---|---|
| 1 | Tên pháp nhân/đơn vị chịu trách nhiệm chính thức, địa chỉ, người đại diện | Điều khoản |
| 2 | Email/đầu mối liên hệ chính thức | Điều khoản + Quyền riêng tư |
| 3 | Quy trình và thời hạn xử lý yêu cầu xoá tài khoản | Điều khoản |
| 4 | Cơ quan có thẩm quyền giải quyết tranh chấp và địa điểm | Điều khoản |
| 5 | Tên pháp nhân/đơn vị kiểm soát dữ liệu và đầu mối liên hệ | Quyền riêng tư |
| 6 | Cơ chế đồng ý cụ thể cho học sinh chưa thành niên; vai trò của phụ huynh/người giám hộ và đơn vị trường học | Quyền riêng tư |
| 7 | Thời hạn lưu cụ thể cho từng loại dữ liệu: tiến trình, tin nhắn, ảnh chat, nhật ký, bản sao lưu | Quyền riêng tư |
| 8 | Quy trình tiếp nhận và thời hạn phản hồi yêu cầu truy cập/xoá dữ liệu | Quyền riêng tư |
| 9 | Độ tuổi tối thiểu, cơ chế đồng ý của cha mẹ/người giám hộ, quy trình khi phát hiện tài khoản chưa đủ điều kiện | Quyền riêng tư |
| 10 | Email/đầu mối liên hệ chính thức và thời gian phản hồi | Quyền riêng tư |

## Vấn đề cần quyết định (không chỉ là điền chỗ trống)

1. **Nhận diện bằng họ tên, không có mật khẩu.** Bất kỳ ai biết tên một bạn trong danh sách đều
   mở được tiến trình/chat của tên đó. Điều khoản hiện mô tả đúng cơ chế này; nếu muốn giảm rủi ro
   thì phải đổi sang mã PIN/OTP — đó là thay đổi backend, ngoài phạm vi redesign.
2. **Dữ liệu học sinh có thể là người chưa thành niên.** Chưa có cơ chế đồng ý của phụ huynh.
3. **Chuyển dữ liệu tới nhà cung cấp AI.** Nội dung câu hỏi và ngữ cảnh bài học được gửi tới nhà
   cung cấp AI để trả lời; cần xác nhận nhà cung cấp nào và có thoả thuận xử lý dữ liệu hay không.
4. **Vùng lưu trữ dữ liệu** (Supabase region) chưa được nêu trong chính sách.

## Khuyến nghị

Rà soát pháp lý trước khi công bố. Các trang hiện tại **không** khẳng định tuân thủ luật Việt Nam
hay GDPR, và **không** hứa hẹn tính năng xoá/xuất dữ liệu mà backend chưa có.

## Đã kiểm chứng

- `legal/index.html`, `terms.html`, `privacy.html` render đúng, có TOC dính, ngày cập nhật, footer
  có cả hai link.
- `node tools/qa/v855-ui.js` và `v856-ui.js`: PASS (đo trang pháp lý + footer).
- Footer pháp lý xuất hiện trên mọi trang có shell, gồm `404.html` (kiểm bằng DOM thật).

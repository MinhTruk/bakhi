# Tính năng Bá Khí 2.0

Ký hiệu: ✅ hoàn thành · 🟡 một phần · ⛔ chưa làm · 🚫 bị chặn

## A. Nền tảng học tập (có trên mọi trang bài học + trang chủ)

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Phân tích tiến độ (tổng câu, đúng/sai, độ chính xác, theo môn/chủ đề, hoạt động 14 ngày & 8 tuần, chủ đề hay sai, mốc) | ✅ | Không đo thời gian học, không xếp hạng |
| 2 | Ôn tập thông minh (tự lưu câu sai, lịch ôn theo kết quả, thành thạo, tìm/lọc, hẹn ngày, lịch sử ôn) | ✅ | Spaced repetition cấu hình được |
| 3 | Ghi chú cá nhân (theo môn/câu hỏi, ghim, tìm, danh mục, Markdown an toàn, xuất) | ✅ | Markdown escape trước, chỉ http(s) |
| 4 | Đánh dấu (câu hỏi, bài học, môn, tài liệu; nhóm; tìm/lọc) | ✅ | Nút đánh dấu trên mỗi trang bài học |
| 5 | Lịch sử học tập (bài đã mở, câu đã luyện/ôn; tìm; xoá từng mục/toàn bộ) | ✅ | Không phải hồ sơ thi cử |
| 6 | Thành tích (10 mốc học thật) | ✅ | Không streak/điểm danh |
| 7 | Chế độ tập trung (ẩn điều hướng, cỡ chữ, nền nhẹ, Esc) | ✅ | Không có đồng hồ phiên |
| 8 | Tìm kiếm toàn cục (bài học, câu đã luyện, câu cần ôn, ghi chú, đánh dấu; gợi ý, nhóm, tô sáng, debounce) | ✅ | Không quét trước toàn site |
| 9 | Command palette `Ctrl/⌘ + K` (điều hướng, công cụ, theme, focus, dev) | ✅ | Bàn phím đầy đủ |
| 10 | Phím tắt (`Ctrl+K`, `/`, `Esc`, `←/→`, `A/B/C/D`) | ✅ | Bỏ qua khi đang gõ |
| 11 | Xuất / nhập JSON (tất cả, ghi chú, đánh dấu, thống kê; xem trước; xác thực; hợp nhất) | ✅ | Không ghi đè ngân hàng câu hỏi |
| 12 | Ghi nhận luyện tập tự động trên trang bài học | 🟡 | Theo mẫu feedback quen thuộc; API `BK.practice()` cho trang khác |
| 13 | Đồng bộ Supabase | 🟡 | Adapter hoàn chỉnh; cần cấu hình + SQL + SDK |
| 14 | AI hỗ trợ | 🟡 | Adapter + cấu hình endpoint; cần proxy (không có key trong trình duyệt) |

## B. Developer Playground 2.0 (`Ctrl+Shift+G`, sau khi xác thực Developer)

| # | Công cụ | Trạng thái | Chi tiết |
|---|---|---|---|
| 1 | Cửa sổ nổi | ✅ | Kéo, đổi kích thước, thu nhỏ, phóng to, nhớ vị trí/kích thước/tab |
| 2 | Inspector 2.0 | ✅ | Chọn phần tử, highlight, breadcrumb DOM, thuộc tính/class, computed styles, kích thước, box model, copy selector/HTML, sửa style tạm thời + khôi phục |
| 3 | CSS Studio | ✅ | Live CSS, rule builder (màu/chữ/khoảng cách/bo góc/bóng), undo/redo, reset, xuất CSS |
| 4 | Animation Studio | ✅ | 7 preset, keyframes, duration/delay/easing (kể cả cubic-bezier), hướng, lặp, timeline, play/pause/restart, xuất CSS, lưu/nhập preset, tôn trọng reduced-motion |
| 5 | Performance Lab | ✅ | TTFB, DOMContentLoaded, load, FCP, LCP, CLS, long tasks, FPS đo thật, tài nguyên nặng nhất; “không hỗ trợ” khi thiếu API |
| 6 | Storage Manager | ✅ | localStorage/sessionStorage, tìm, xem/sửa, xoá có bảo vệ, xuất/nhập, dung lượng |
| 7 | Console Pro | ✅ | log/warn/error/info/debug, lỗi JS, promise rejection, lọc, tìm, thời gian, xuất; console gốc giữ nguyên |
| 8 | Network Monitor | ✅ | Resource URL/loại/thời lượng/dung lượng/status, tổng quan lỗi; chỉ đọc |
| 9 | Theme Editor | ✅ | Biến màu/nền/chữ/bo góc/khoảng cách/bóng, xem trước, preset, khôi phục, xuất |
| 10 | Component Library | ✅ | 11 nhóm thành phần có demo + mã mẫu |
| 11 | Backup Manager | ✅ | Tạo/xem trước/khôi phục/xuất/nhập, kiểm tra phiên bản, xác nhận trước khi khôi phục |

Panel Developer cũ (11 tab `fx/tools/data/ui/debug/anim/adv/insp/perf/studio/bk`) vẫn hoạt động
nguyên vẹn và mở bằng nút trong menu 3 gạch hoặc lệnh trong palette.

## C. Cách dùng nhanh

- **Trung tâm học tập**: nút 🎓 ở góc phải dưới, hoặc `Ctrl+K` → “Trung tâm học tập”.
- **Ôn câu sai**: nút ↻ trên dock; dùng `←/→` chuyển câu, `A/B/C/D` chọn đáp án.
- **Ghi chú nhanh khi đang học**: nút 🎓 → 📝 trên trang bài học.
- **Focus mode**: nút 🌙 hoặc `Esc` để thoát.
- **Tìm kiếm**: phím `/` khi không ở trong ô nhập.
- **Developer Playground**: `Ctrl+Shift+G` (cần xác thực Developer trước).

URL hỗ trợ mở trực tiếp: `?bk=hub`, `?bk=review`, `?bk=notes`, `?bk=bookmarks`,
`?bk=history`, `?bk=achievements`, `?bk=settings`, `?bk=search&q=...`.

## D. Cấu hình AI (tuỳ chọn)

1. Dựng một proxy (Cloudflare Worker, Vercel function, backend riêng) nhận
   `POST { model, messages }` và gọi nhà cung cấp AI bằng khoá lưu ở server.
2. Trong Bá Khí: Cài đặt → AI → nhập URL proxy + tên model.
3. AI chỉ tạo nội dung **tham khảo**, luôn gắn nhãn “Nội dung do AI tạo — không phải
   nội dung gốc đã kiểm duyệt”. Không có thao tác nào để AI sửa câu hỏi/đáp án gốc.

## E. Không có trong sản phẩm (theo yêu cầu)

Không đề thi thử, không bài tính giờ, không đếm ngược, không giới hạn thời gian,
không tự nộp bài, không xếp hạng thi, không deadline, không cơ chế tạo áp lực thời gian.

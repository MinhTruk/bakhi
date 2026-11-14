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
| 1 | Cửa sổ nổi | ✅ | Kéo, đổi kích thước, thu nhỏ, phóng to, nhớ vị trí/kích thước/tab; chuyển tab có chuyển động nhẹ (tôn trọng reduced-motion) |
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
| 12 | Music (tab) | ✅ | Trạng thái trực tiếp theo sự kiện, mở/phóng to/thu nhỏ/đặt lại bố cục trình phát, kiểm tra file, thư viện 5 bài |

Panel Developer cũ (11 tab `fx/tools/data/ui/debug/anim/adv/insp/perf/studio/bk`) vẫn hoạt động
nguyên vẹn và mở bằng nút trong menu 3 gạch hoặc lệnh trong palette.

## C. Music Player dùng chung

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Thư viện 5 bài theo quy ước file `music/<slug>.mp3` · `.txt` · `.png` | ✅ | Thêm bài chỉ cần thêm file + một dòng trong `LIBRARY` |
| 2 | Queue: thêm, xoá, phát tiếp theo, kéo thả đổi thứ tự, `Alt+↑/↓` cho bàn phím | ✅ | Không tạo audio thứ hai |
| 3 | Shuffle (giữ bài đang phát đầu queue) và repeat 3 chế độ (off/all/one) | ✅ | Nhớ qua `bakhiMusic.v2` |
| 4 | Lời bài hát: file `.txt` (dòng `#` là ghi chú, `[mm:ss]` để đồng bộ) và lời tự nhập | ✅ | Lời tự nhập được ưu tiên; lỗi file không làm hỏng player |
| 5 | Bìa tự dò `.png → .jpg → .jpeg → .webp` | ✅ | Bìa xoay khi phát (tắt khi reduced-motion) |
| 6 | Bố cục nổi: kéo tiêu đề, kéo góc đổi kích thước, thu nhỏ, phóng to, nhấp đúp đặt lại | ✅ | Nhớ ở `bakhiMusic.panel.v1`; màn hình hẹp tự thành bảng đáy |
| 7 | Phím tắt `Space`, `←/→`, `M`, `Esc` chỉ khi panel mở | ✅ | Bỏ qua khi đang gõ hoặc tiêu điểm ở nút/liên kết |
| 8 | Không autoplay + nút “Tiếp tục” chỉ ẩn khi bài thật sự phát | ✅ | Tránh mất nút mà không có nhạc |
| 9 | Media Session (khoá màn hình/tai nghe) | 🟡 | Tuỳ trình duyệt |
| 10 | Logo ♪ kéo thả, chuột phải đặt lại | ✅ | Không đè logo Dev Panel |

## D. Khả năng tiếp cận & thiết bị

- Toàn bộ nút có nhãn `aria-label`; trạng thái bật/tắt dùng `aria-pressed`, logo dùng
  `aria-expanded`, panel là `role="dialog"` có tiêu điểm khi mở.
- Tab theo chuẩn `tablist`/`tabpanel` (`aria-selected`, `aria-controls`) và đổi tab bằng
  phím mũi tên `Home`/`End` ở cả Music Player lẫn Trung tâm học tập.
- Vùng `aria-live` đọc tên bài, trạng thái phát, thay đổi bố cục; thanh tua/âm lượng có
  `aria-valuetext`.
- Mục queue dùng được bằng bàn phím: `Enter`/`Space` phát, `Delete` xoá, `Alt+↑/↓` đổi vị trí.
- Viền tiêu điểm rõ ràng; tay chạm to hơn trên thiết bị cảm ứng; bố cục dùng được ở
  màn hình hẹp (panel nhạc thành bảng đáy, hub thành một cột).
- Tôn trọng `prefers-reduced-motion`: tắt xoay bìa, nhấp nháy, hiệu ứng chuyển tab.

## E. Cách dùng nhanh

- **Trung tâm học tập**: nút 🎓 ở góc phải dưới, hoặc `Ctrl+K` → “Trung tâm học tập”.
- **Ôn câu sai**: nút ↻ trên dock; dùng `←/→` chuyển câu, `A/B/C/D` chọn đáp án.
- **Ghi chú nhanh khi đang học**: nút 🎓 → 📝 trên trang bài học.
- **Focus mode**: nút 🌙 hoặc `Esc` để thoát.
- **Tìm kiếm**: phím `/` khi không ở trong ô nhập.
- **Developer Playground**: `Ctrl+Shift+G` (cần xác thực Developer trước).
- **Music Player**: logo ♪ góc trái dưới; `Space` phát/tạm dừng, `←/→` tua 5 giây,
  `M` tắt tiếng (chỉ khi panel nhạc mở), `Esc` đóng.

URL hỗ trợ mở trực tiếp: `?bk=hub`, `?bk=review`, `?bk=notes`, `?bk=bookmarks`,
`?bk=history`, `?bk=achievements`, `?bk=settings`, `?bk=search&q=...`.

## F. Cấu hình AI (tuỳ chọn)

1. Dựng một proxy (Cloudflare Worker, Vercel function, backend riêng) nhận
   `POST { model, messages }` và gọi nhà cung cấp AI bằng khoá lưu ở server.
2. Trong Bá Khí: Cài đặt → AI → nhập URL proxy + tên model.
3. AI chỉ tạo nội dung **tham khảo**, luôn gắn nhãn “Nội dung do AI tạo — không phải
   nội dung gốc đã kiểm duyệt”. Không có thao tác nào để AI sửa câu hỏi/đáp án gốc.

## G. Không có trong sản phẩm (theo yêu cầu)

Không đề thi thử, không bài tính giờ, không đếm ngược, không giới hạn thời gian,
không tự nộp bài, không xếp hạng thi, không deadline, không cơ chế tạo áp lực thời gian.

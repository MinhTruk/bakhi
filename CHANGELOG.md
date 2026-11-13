# Changelog

Mọi thay đổi đáng chú ý của Bá Khí. Định dạng dựa trên Keep a Changelog.

## [2.0.0] — 2026-11-13

### Nền tảng học tập

- **Thêm** lớp dữ liệu local-first `BK` (`assets/bakhi/bk-core.js`): key duy nhất
  `bakhiLearn.v1`, có phiên bản, validate từng trường, giới hạn kích thước, tự phục hồi
  và sao lưu dữ liệu hỏng.
- **Thêm** Trung tâm học tập 7 tab: tổng quan, ôn tập, ghi chú, đánh dấu, lịch sử,
  thành tích, cài đặt.
- **Thêm** ôn tập thông minh: tự lưu câu sai, lịch ôn theo kết quả, đánh dấu thành thạo,
  hẹn ngày thủ công, tìm/lọc theo môn, lịch sử ôn.
- **Thêm** ghi chú cá nhân (ghim, danh mục, Markdown an toàn, xuất tệp).
- **Thêm** đánh dấu câu hỏi/bài học/môn/tài liệu.
- **Thêm** lịch sử học tập có tìm kiếm, xoá từng mục và xoá toàn bộ có xác nhận.
- **Thêm** 10 thành tích dựa trên hoạt động học thật (không streak, không điểm danh).
- **Thêm** Focus Mode (không có đồng hồ phiên) và cỡ chữ điều chỉnh được.
- **Thêm** tìm kiếm toàn cục (bài học, câu đã luyện, câu cần ôn, ghi chú, đánh dấu)
  và command palette `Ctrl/⌘ + K` có điều hướng bàn phím.
- **Thêm** phím tắt: `/`, `Esc`, `←/→`, `A/B/C/D` — bỏ qua khi đang nhập liệu.
- **Thêm** xuất/nhập JSON có xem trước, kiểm tra phiên bản và hợp nhất không phá dữ liệu.
- **Thêm** cầu nối trang bài học: ghi lịch sử, đọc ngân hàng câu hỏi (chỉ đọc), ghi nhận
  kết quả luyện tập theo mẫu feedback quen thuộc + API `BK.practice()`.

### Developer Playground 2.0

- **Thêm** `assets/bakhi/bk-dev.js|css`: cửa sổ nổi kéo/đổi kích thước, thu nhỏ/phóng to,
  nhớ vị trí/kích thước/tab, responsive, `Ctrl+Shift+G`.
- **Thêm** Inspector 2.0: chọn phần tử, highlight, breadcrumb, thuộc tính, computed styles,
  box model, copy selector/HTML, sửa style tạm thời + khôi phục.
- **Thêm** CSS Studio: live CSS, rule builder, undo/redo, reset, xuất CSS.
- **Thêm** Animation Studio: preset, keyframes, easing (kể cả cubic-bezier), timeline,
  play/pause/restart, xuất CSS, lưu/nhập preset, tôn trọng reduced-motion.
- **Thêm** Performance Lab: TTFB, DCL, load, FCP, LCP, CLS, long tasks, FPS thật,
  tài nguyên nặng nhất; không suy đoán khi thiếu API.
- **Thêm** Storage Manager: xem/sửa/xoá có bảo vệ, tìm kiếm, xuất/nhập, dung lượng.
- **Thêm** Console Pro và Network Monitor (chỉ đọc), Theme Editor, Component Library,
  Backup Manager.
- **Giữ nguyên** Developer Panel cũ (11 tab) và toàn bộ hàm toàn cục (`DX`, `showToast`,
  `switchDevTab`, `palette`, …).

### Bảo toàn nội dung & chất lượng

- **Thêm** `tools/content-integrity.js` + baseline `docs/content-baseline.json` cho 56 tệp:
  xác minh sha256 sau khi loại đúng khối script được chèn.
- **Thêm** `tools/integrate-pages.js` (idempotent) và `tools/qa/smoke.js` (45 kiểm tra DOM).
- **Không thay đổi** bất kỳ câu hỏi, phương án, đáp án, giải thích, công thức nào.
- **Không thêm** bất kỳ tính năng thi cử/tính giờ nào.

### Tài liệu

- **Thêm** `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/SUPABASE_SETUP.md`,
  cập nhật `README.md` và `CHANGELOG.md`.

### Đã biết

- Ba tệp HTML không có `</body>` (`images/anh/1.html`, `music/1.html`,
  `ktgk1/hoa/indexhoa.html`) chưa được gắn cầu nối học tập.
- Ghi nhận luyện tập tự động là best-effort theo cấu trúc trang.
- Đồng bộ Supabase và AI cần cấu hình thêm (không có key trong repository).

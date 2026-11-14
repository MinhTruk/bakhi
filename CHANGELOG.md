# Changelog

Mọi thay đổi đáng chú ý của Bá Khí. Định dạng dựa trên Keep a Changelog.

## [2.3.0] — 2026-11-14

### Thành tích 30 mốc

- **Thêm** 17 mốc mới, nâng tổng lên 30, chia 5 nhóm: Học tập (6), Luyện tập (9),
  Sổ tay (6), Studio (5), Khám phá (4). Không mốc nào dựa trên chuỗi ngày, điểm danh
  hay thời gian.
- **Thêm** `BK.signals` — tín hiệu dùng chung ở key riêng `bakhiSignals.v1` (chỉ số đếm,
  không lưu nội dung): tài liệu/bản vẽ/lượt xuất/lượt chèn/số từ của Studio, lượt phát
  nhạc, lượt mở bảng lệnh, lượt xuất sao lưu.
- **Thêm** `BK.achievements.progress()` (tiến độ từng mốc) và `next()` (3 mốc gần đạt),
  `groups`, `lastUnlocked()`; thông báo toast khi mở khoá (gộp khi nhiều mốc cùng lúc).
- **Nâng cấp** tab Thành tích: tổng quan 30 mốc, tiến độ theo nhóm, lọc Tất cả/Đã đạt/
  Chưa đạt, tìm kiếm, thanh tiến độ và số đếm từng mốc, ngày đạt; huy hiệu `x/30` trên tab.
- **Nâng cấp** Tổng quan: thẻ Thành tích có thanh tiến độ, 3 mốc gần đạt tiếp theo và
  liên kết mở tab Thành tích.

### Studio & Music

- **Thêm** Studio tự ghi tín hiệu khi lưu tài liệu có nội dung, có bản vẽ, xuất HTML/TXT/
  PNG, chèn bản vẽ vào trang và ghi nhận số từ lớn nhất của một tài liệu.
- **Thêm** Music Player tăng tín hiệu ở mỗi lượt phát thật (sự kiện `play`) và tự kiểm tra
  thành tích nếu lớp học tập có mặt.
- **Thêm** xuất sao lưu dữ liệu và mở bảng lệnh được tính vào nhóm Khám phá.

### Kiểm thử

- **Mở rộng** smoke test: 30 mốc, 5 nhóm, cấu trúc `progress()`, mốc gần đạt, tín hiệu
  Studio/Music/bảng lệnh/sao lưu, bỏ qua đường dẫn lạ, kẹp giá trị âm, render/lọc/badge.

## [2.2.0] — 2026-11-14

### Bá Khí Studio (Word & Paint)

- **Thêm** ứng dụng tĩnh độc lập `studio/word-paint.html`: soạn thảo kiểu Word (định dạng chữ/đoạn,
  màu, danh sách, canh lề, liên kết, ảnh, đếm từ, in/PDF) kết hợp bảng vẽ kiểu Paint (bút, tẩy,
  hình khối, mũi tên, chữ, màu, cỡ nét, độ đậm, hoàn tác 8 bước, tải PNG).
- **Thêm** chèn bản vẽ vào tài liệu, ba chế độ Word/Paint/Chia đôi, nhiều tài liệu, đổi tên,
  nhân bản, xoá có xác nhận.
- **Thêm** lưu tự động (`bakhiStudio.v1`), xuất HTML tự chứa, xuất TXT, mở `.html/.txt`, dán an toàn.
- **Thêm** lối vào từ menu 3 gạch của trang chủ và từ command palette (`Ctrl/⌘ + K`).

### Tinh chỉnh

- **Sửa** thao tác định dạng trong Studio: giữ vùng chọn khi bấm nút và `Ctrl+A` chỉ chọn nội dung trang.
- **Thêm** tài liệu `docs/STUDIO.md`, cập nhật README, FEATURES, CHANGELOG.

## [2.1.0] — 2026-11-14

### Music Player

- **Thêm** bố cục nổi đầy đủ: kéo thanh tiêu đề để di chuyển, kéo góc dưới-trái để đổi
  kích thước, nút thu nhỏ / phóng to, nhấp đúp tiêu đề để đặt lại; nhớ ở
  `bakhiMusic.panel.v1`; màn hình hẹp tự chuyển thành bảng đáy.
- **Thêm** phím tắt `Space` (phát/tạm dừng), `←/→` (tua 5 giây), `M` (tắt tiếng),
  `Esc` (đóng) — chỉ khi panel nhạc đang mở, tự bỏ qua khi đang gõ hoặc tiêu điểm ở nút.
- **Sửa** nút “Tiếp tục: …”: trước đây biến mất ngay khi bấm mà không phát nhạc; nay
  nút chỉ ẩn khi âm thanh thực sự phát và tự đặt lại `src` khi cần.
- **Thêm** `BKMusic.on(fn)` (phát sự kiện thay đổi), `maximize()`, `minimize()`,
  `resetLayout()`, `showTab()`, `isOpen()`; tab Music của Dev Panel cập nhật theo sự
  kiện thay vì polling mỗi giây.
- **Thêm** Media Session (khoá màn hình / tai nghe) và vùng thông báo `aria-live`.
- **Cải thiện** trợ năng: `aria-label`, `aria-pressed`, `aria-valuetext`, tab theo chuẩn
  `tablist`/`tabpanel`, điều hướng tab bằng phím, mục queue dùng `Enter`/`Delete`/
  `Alt+↑↓`, viền tiêu điểm, tay chạm to hơn, tôn trọng `prefers-reduced-motion`.

### Giao diện

- **Thêm** chuyển động nhẹ khi đổi tab ở Developer Playground, Music Player và Trung tâm
  học tập, tự tắt khi người dùng chọn giảm chuyển động.

### Tài liệu

- **Thêm** `docs/MUSIC.md`; mở rộng `README.md` (mục Music Player, bảng phím tắt, trạng
  thái dự án), `docs/FEATURES.md` (mục Music Player & khả năng tiếp cận) và
  `docs/ARCHITECTURE.md`.

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

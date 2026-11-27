# Redesign status — Bá Khí “Quiet Graphite”

Cập nhật: 27/11/2026 · Nhánh: `redesign/bakhi-complete-rebirth` (tách từ `main` tại `a2dd6c74`).
Phiên bản ứng dụng không đổi (`8.8.0`, `CHANGELOG.md` không bị sửa).

## 1. Cách lớp mới hoạt động

- `tools/inject-rebirth.js` gắn `<link bk-rebirth.css>` + `<script bk-rebirth.js>` vào **cuối
  dòng cuối cùng đã có `assets/bakhi/`** trên mọi tệp HTML (129 tệp, idempotent, có `--check`).
  Gắn vào dòng đó — không thêm dòng mới — để `tools/content-integrity.js` bỏ nguyên dòng khi
  băm, giữ hash nội dung giáo dục. Lần chạy đầu thêm dòng mới và làm lệch hash; đã sửa.
- `bk-rebirth.js` dựng rail (desktop) / top bar / bottom tab / sheet “Thêm” / footer, **di
  chuyển** avatar + chuông đang có vào top bar (không tạo bản sao), một MotionEngine, và
  nhóm “Chuyển động” trong Cài đặt (`bk.ui.motion`, chỉ lưu máy khách).
- Studio, Founder, Admin giữ chrome riêng: chỉ nhận token + typography (xem `studio.md`).

## 2. Trạng thái theo pha

| Pha | Nội dung | Trạng thái |
|---|---|---|
| 0 | Audit, route map, role matrix, color map, data-flow, perf baseline | **Xong** — `audit.md`, `role-matrix.md`, `color-mapping.md`, `data-flow.md`, `perf-baseline.md`, `feature-parity.md` |
| 1 | Token, theme, typography, motion engine, shell, component CSS, cổng tương phản, gallery dev | **Xong** — `design-system.md`, `tools/qa/rebirth-contrast.js`, `gallery.html` |
| 2 | App shell + Trang chủ | **Xong** — hero, 8 thẻ đợt kiểm tra (chỉ cuộn/mở thư mục có sẵn), changelog giữ nguồn `bk-cloud` |
| 3 | Học tập / cây tài liệu | **Một phần** — bài học nhận token + quy đổi Tailwind; **chưa** dựng bố cục ba cột T2 (tree 280 / đọc ≤72ch / TOC 240) |
| 4 | Trợ lý AI | **Một phần** — re-skin qua token; không đổi provider/model/fallback; chưa dựng lại T5 |
| 5 | Chat | **Một phần** — re-skin; logic realtime/đã đọc giữ nguyên; chưa dựng lại T3 |
| 6 | Hồ sơ, Tiến trình, Kỹ năng, Cài đặt, thông báo | **Một phần** — re-skin + nhóm Chuyển động; bố cục T1 chưa dựng lại |
| 7 | Founder, Admin | **Một phần** — chỉ token, không rail/footer, quyền không đổi |
| 8 | Pháp lý, 404/lỗi, đăng nhập | **Một phần** — có `legal/index|terms|privacy` + footer mọi trang có shell; chưa có trang 404/500 tĩnh |
| 9 | Đánh bóng, hiệu năng, a11y, xoá mã cũ | **Chưa** — không xoá tệp nào |
| 10 | Báo cáo, tài liệu, hướng dẫn xem trước | **Xong một phần** — tài liệu này + design-system + studio |

## 3. Đã kiểm chứng trong phiên này

Kiểm tra bằng trình duyệt thật ở 1280×900 và 375×812 trên máy chủ tĩnh cục bộ
(`python -m http.server 8123 --bind 127.0.0.1`), trang chủ + một trang bài học + trang pháp lý:

- Không lỗi console (chỉ cảnh báo Tailwind CDN có sẵn từ trước).
- Không tràn ngang: `scrollWidth == clientWidth` ở 1280 và 375.
- Rail/top bar/bottom tab/footer/skip link có mặt đúng trang; 375 px ẩn rail, hiện tab bar.
- Ảnh chụp: `screens/home-gate-dark-1280.png`, `screens/lesson-dark-1280.png`,
  `screens/lesson-dark-375c.png`.

Ba lỗi giao diện phát hiện khi xem và đã sửa trong phiên này:

1. Tiêu đề cột footer phình 27,84px (quy tắc `h2` toàn cục ở mục 17 thắng `.bk-footer h2`)
   → thêm `.bk-footer .bk-footer-inner h2`.
2. Mobile lặp breadcrumb + tiêu đề ("Học tập | Học tập") → ẩn `.bk-crumbs` dưới 768px.
3. Nút nhạc nổi góc trái dưới đè lên tab bar → nâng lên trên thanh tab; dòng bản quyền
   chừa 150px bên phải cho nút nổi Hỏi AI/Báo lỗi.


- `node tools/content-integrity.js verify` → **OK**, 125 tệp nội dung gốc không đổi.
- `node tools/inject-rebirth.js --check` → **0 tệp cần cập nhật** (idempotent).
- `node --check assets/bakhi/bk-rebirth.js` → hợp lệ.
- `node tools/qa/rebirth-contrast.js` → **74 cặp, 0 không đạt**, thấp nhất 4.67:1.
- `node tools/qa/v855-ui.js`, `node tools/qa/v856-ui.js`, `node tools/qa/version-audit.js` → tất cả PASS
  (sau khi thêm `bk-tokens.css` + `bk-theme-boot.js` cho các trang mới).
- `index.html` đã được viết lại có chủ đích nên baseline được làm mới bằng
  `node tools/content-integrity-refresh.js index.html` (công cụ chấp nhận: trang không có
  nội dung giáo dục).

## 4. Lỗi / thiếu đã biết

1. **Bố cục đặc thù chưa dựng lại.** Học tập (T2), Chat (T3), Trợ lý AI (T5), Cài đặt (T4),
   Founder/Admin (T6) hiện là *re-skin bằng token*, chưa phải bố cục mới. Đây là khoảng cách
   lớn nhất so với yêu cầu “Complete UI Rebirth”.
2. **Trang lỗi 404/500 và màn hình đăng nhập** chưa được dựng lại.
3. **Năm tệp bài học cũ** (`ktgk1/anh/anh1.html`, `ktgk1/anh/indexanh.html`, và ba tệp tương
   tự) có thẻ tài nguyên nằm sau `</html>` — hiện trạng có từ trước. Không di chuyển vì làm
   lệch hash nội dung; đã ghi nhận trong `audit.md`.
4. **Chưa đo runtime**: LCP/CLS/INP/TBT chưa có số (chỉ có kích thước tệp trong
   `perf-baseline.md`). Không có Lighthouse/Playwright/axe trong phiên này.
5. **Chưa chụp ảnh so sánh** ở 5 kích thước × 2 theme. Báo cáo hình ảnh chưa tồn tại.
6. **Nhóm “Quản trị” trên rail** chỉ đọc phiên `bakhiAdmin.v1` để ẩn/hiện; quyền thật vẫn do
   Supabase/Edge Function quyết định. Chưa có test tự động chứng minh cách ly vai trò.

## 5. Chưa kiểm thử (và lý do)

- Đăng nhập/đăng xuất, đồng bộ tiến trình, realtime Chat, gửi/nhận tin, trạng thái đã đọc:
  cần tài khoản Supabase thật — không dùng dữ liệu production để thử.
- Trợ lý AI end-to-end: cần khoá provider; không kiểm thử trong phiên này.
- Bàn phím/screen reader trên luồng chính; zoom 200%; `prefers-contrast: more`.
- Xuất HTML/TXT/PNG của Studio.
- Bản deploy thật dưới base path GitHub Pages.

## 6. Việc tiếp theo (thứ tự đề xuất)

1. Dựng T2 cho khu bài học (tree + cột đọc + TOC + thanh tiến độ đọc) — vùng học tập là trọng tâm.
2. Dựng T5/T3 cho Trợ lý AI và Chat (khung ba vùng, composer dính đáy, drawer lịch sử < 1024px).
3. Dựng lại Founder/Admin theo T1/T6 + dải vai trò.
4. Trang 404/lỗi + màn hình đăng nhập theo T9/T7.
5. Chạy Playwright + axe (5 kích thước × 2 theme, reduced-motion) và đo lại Web Vitals.

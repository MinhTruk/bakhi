# Quiet Graphite — Design System

Nguồn token duy nhất: `assets/bakhi/bk-rebirth.css` (khối `:root, html.dark` và `html.light`).
Trang này mô tả hệ thống đang chạy, không phải bản đề xuất.

## 1. Token

| Nhóm | Token | Giá trị |
|---|---|---|
| Bề mặt | `--rb-bg` · `--rb-surface-1…3` · `--rb-hover` · `--rb-input` · `--rb-surface-inset` | `#0b0b0e` · `#111116` · `#17171d` · `#1f1f27` |
| Đường kẻ | `--rb-line` · `--rb-line-strong` · `--rb-line-accent` | alpha 7% · 14% · 34% hồng |
| Chữ | `--rb-text` · `--rb-text-2` · `--rb-text-3` | `#f2efec` · `#b9b6bd` · `#8f8c96` |
| Accent | `--rb-accent` `#ffb6c1` · `--rb-accent-ink` `#2b0f16` · `--rb-accent-soft` · `--rb-accent-text` | Accent chỉ dùng cho active, hành động chính, focus, tiến độ — ≤ 5% diện tích |
| Bổ trợ | `--rb-violet` · `--rb-sky` | Tên người, thông tin phụ, phiên bản |
| Trạng thái | `--rb-ok` · `--rb-warn` · `--rb-danger` | Luôn kèm icon + chữ, không dùng màu làm tín hiệu duy nhất |
| Bo góc | `--rb-r-sm` 8 · `--rb-r-md` 12 · `--rb-r-lg` 16 · `--rb-r-xl` 22 · `--rb-r-pill` | |
| Khoảng cách | `--rb-sp-1…8` | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72 |
| Chuyển động | `--rb-ease-out` · `--rb-ease-std` · `--rb-ease-in` · `--rb-dur-fast/std/emph/page/reveal` | 120 · 200 · 320 · 400 · 700 ms |
| Z-index | `--rb-z-base/sticky/nav/popover/overlay/toast/tooltip` | 0 · 20 · 30 · 40 · 50 · 60 · 70 |

Chế độ sáng ghi đè trong `html.light` và luôn dùng `--rb-accent-text` cho chữ/liên kết
(`#b3304f`), không dùng hồng nhạt làm màu chữ. Token cũ `--bk-*` / `--bkl-*` được ánh xạ
sang `--rb-*` trong cùng tệp, nên các mô-đun cũ không phải sửa.

## 2. Bộ dấu hiệu nhận diện (signature kit)

| # | Thành phần | Cài đặt |
|---|---|---|
| 1 | Notch accent | 3×20px `--rb-r-pill` ở cạnh trái mục đang chọn; tab dùng gạch chân 2px |
| 2 | Tiêu đề mục | Số thứ tự mono `--rb-text-3` + `h2` + hairline giãn hết chiều ngang + hành động bên phải |
| 3 | Mono marginalia | Phiên bản, ngày, số đếm trong `.bk-mono` |
| 4 | Lưới hairline | Lưới 1px alpha 4–6% có mặt nạ radial, chỉ ở dải chào, trang pháp lý, trạng thái lỗi |
| 5 | Corner ticks | 6px góc chữ L ở `--rb-line-strong`, chỉ hiện khi hover/focus thẻ mục |

## 3. Thành phần đã cài (CSS thuần, tiền tố `bk-`)

- **Hành động:** `.bk-btn` (`-primary`, `-ghost`, `-danger`, `-sm`), `.bk-chrome-btn`, `.bk-pill*`.
- **Dữ liệu:** `.bk-card` (`-pad`, `-soft`), `.bk-stat`, `.bk-badge`, `.bk-pill`, `.bk-exam-tile`, `.bk-tree-col`, `.bk-progress`, `.bk-skeleton`, `.bk-empty`, `.bk-scroll-x`.
- **Biểu mẫu:** `.bk-range`, `.bk-seg`, `.bk-set-row`, `.bk-set-card`, `.bk-set-nav`.
- **Điều hướng:** `.bk-rail` (+ `-expanded`), `.bk-chrome`, `.bk-tabbar`, `.bk-sheet`, `.bk-tabs`/`.bk-tab-btn`, `.bk-crumbs`, `.bk-footer`, `.bk-skip`.
- **Lớp nổi:** `.bk-modal`, `.bk-toast`, `.bk-sheet-panel`, `.bk-chrome-menu`.
- **Nội dung:** `.bk-reading`, `.bk-legal-layout`, `.bk-legal-toc`, `.bk-legal-callout`, `.bk-need-confirm`.
- **Trang:** `.bk-page`, `.bk-home-hero`, `.bk-profile-hero`, `.bk-motion-panel`.

Mọi thành phần dùng token; không có màu cứng trong component mới. Xem trạng thái thật
trong `docs/redesign/gallery.html` (tệp tĩnh, không phải route công khai, không được liên kết
từ ứng dụng).

## 4. Chữ tiếng Việt

- `lang="vi"`; heading `line-height ≥ 1.15`, `letter-spacing ≥ -0.03em` để không cắt dấu (Ệ, Ầ, Ổ).
- Không `uppercase` cho chuỗi dài, tên người hay nội dung bài học; eyebrow ≤ 3 từ, tracking ≤ .08em.
- Cỡ chữ nhỏ nhất 12px; nhãn icon trong rail/tab 11px; `text-wrap: balance` cho heading ngắn.
- Bộ kiểm tra dấu: “Cây Tài Liệu Ôn Tập”, “Ổn định Ầm Ặc Ữ Ỳ” ở mọi cấp heading, cả hai theme
  (trong gallery).
- Không đổi định dạng ngày/số/sắp xếp hiện có.

## 5. Chuyển động

- Một nguồn: `window.BKRebirth` (`assets/bakhi/bk-rebirth.js`). Một listener scroll passive +
  một `requestAnimationFrame`, đọc trước ghi sau; JS chỉ ghi CSS variable, CSS vẽ bằng
  `transform`/`opacity`.
- Mức: **0** cho đọc bài, chat, trợ lý AI, bảng, biểu mẫu (chỉ hover/press/focus ≤ 200ms);
  **1** reveal-once có stagger cho trang chủ, hồ sơ, tiến trình, kỹ năng, cài đặt; **2**
  parallax 2 lớp duy nhất ở dải chào trang chủ và tiêu đề pháp lý.
- Giảm chuyển động hai tầng: OS (`prefers-reduced-motion`) và lựa chọn trong ứng dụng
  (`bk.ui.motion` = `auto` | `reduced` | `full`, chỉ lưu máy khách). Khi giảm: tắt parallax,
  reveal hiện ngay, tắt shimmer skeleton; phản hồi chức năng (focus, hover) vẫn giữ.
- Không có animation vô hạn ngoài màn hình; không phủ nhiễu toàn trang; blur chỉ ở top bar
  khi đã cuộn và lớp nổi.

## 6. Báo cáo tương phản (WCAG 2.1)

Cổng kiểm tra: `node tools/qa/rebirth-contrast.js` — đọc giá trị thật từ CSS, ghép alpha lên
nền, tính tỉ lệ, thoát mã 1 nếu có cặp dưới ngưỡng (chữ 4.5:1, UI 3:1). Bảng đầy đủ:
`node tools/qa/rebirth-contrast.js --md` (74 cặp, cả hai theme).

Kết quả hiện tại: **74 cặp · 0 không đạt**. Thấp nhất: `--rb-text-3` trên `--rb-surface-3`
ở theme sáng **4.67:1**. `--rb-accent-ink` trên `--rb-accent` đạt 10.75:1 (dark) và 10.75:1
(light). Đã chỉnh `--rb-warn` theme sáng từ `#a16207` (4.48:1) sang `#8a5306` để đạt AA.

Ghi chú: `--rb-accent` không dùng làm màu chữ trên nền sáng; chữ trên nền accent luôn là
`--rb-accent-ink`. Thanh notch 3px luôn đi kèm nền `--rb-surface-2`/`--rb-accent-soft` nên
không phải tín hiệu duy nhất.

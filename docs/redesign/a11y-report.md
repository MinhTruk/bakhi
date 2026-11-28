# Accessibility report — Quiet Graphite

Ngày 27/11/2026. Kiểm bằng script và đọc mã; **chưa chạy axe-core, chưa test trình đọc màn hình**.

## 1. Tương phản màu — PASS (đo bằng script)

`node tools/qa/rebirth-contrast.js` đọc token thật trong `bk-rebirth.css`, ghép alpha, tính WCAG:

```
74 cặp màu · 0 không đạt
thấp nhất (light): --rb-text-3 trên --rb-surface-3 = 4,67:1
```

Đã sửa một token trong phiên trước: `--rb-warn` light `#a16207` → `#8a5306` (3,9:1 → 5,1:1).
Ngưỡng: chữ thường ≥ 4,5:1, chữ lớn và thành phần UI ≥ 3:1. Bảng đầy đủ nằm trong
`design-system.md`.

Hạn chế: script chỉ kiểm **cặp token**. Nó không biết một phần tử cụ thể đang đặt trên nền nào
(ví dụ chip accent trên ảnh nền), và không kiểm màu do Tailwind CDN sinh ra trong trang bài học.

## 2. Những gì đã làm trong phiên này

| Hạng mục | Cách làm | Kiểm chứng |
|---|---|---|
| Mục lục bài học | `<nav>` + `<ol>` + link thật `href="#id"`; mục đang đọc có `aria-current="true"` | Đo DOM: 5 mục, `aria-current` đổi khi cuộn |
| Mục lục mobile | `<details>/<summary>` gốc, `summary` cao 44 px | CSS + DOM |
| Focus | `:focus-visible` viền accent 2 px, offset 2 px trên nút/link/ô nhập | Đọc CSS, không chụp từng trạng thái |
| Skip link | “Bỏ qua điều hướng” là phần tử đầu tiên trong body, trỏ `#bkMain` | Có trên mọi trang có shell |
| Reduced motion | `--rb-k` về 0, tắt draw/parallax/shimmer; áp dụng ngay khi OS đổi | Có từ phiên trước, giữ nguyên |
| 404 | `h1` duy nhất, link thật, `noindex, follow` | Render thật |
| Bàn phím | Không thêm widget tự viết; `<details>`, `<a>`, `<button>` gốc | Đọc mã |

## 3. Khoảng trống đã biết

- **axe-core chưa chạy** trên bất kỳ route nào → không có kết luận “0 vi phạm”.
- **Trình đọc màn hình chưa test** (NVDA/VoiceOver): thứ tự đọc, thông báo live region của
  streaming Chat/Trợ lý AI chưa xác nhận.
- **320 px chưa đo lại** trong phiên này; đã đo 375 px ở phiên trước (không tràn ngang).
- **Zoom 200 %** chưa kiểm bằng mắt.
- Trang bài học giữ nhiều phần tử do Tailwind sinh (`text-[10px]`…): chưa rà toàn bộ cỡ chữ dưới
  12 px trong 125 tệp. Lớp mới không tạo chữ dưới 12 px, nhưng nội dung cũ có thể còn.
- Trang Founder/Admin và Chat **chưa kiểm** vì cần đăng nhập.

## 4. Kết luận

Những gì lớp mới thêm vào đều dùng phần tử ngữ nghĩa gốc và có tên truy cập; tương phản token
đạt AA. **Không được coi báo cáo này là “đã audit a11y”** — đó là việc của bước chạy axe trên
toàn bộ route, và bước đó chưa chạy.

# Performance baseline

Đo trên working tree ngày 26/11/2026. Số liệu là **kích thước tệp trên đĩa (chưa nén)**, không phải số đo mạng thực tế. Các chỉ số runtime (LCP, CLS, INP, TBT) **chưa đo được** trong môi trường này vì chưa chạy Lighthouse/Chrome trace trên bản deploy.

## 1. Tổng tài nguyên cục bộ mỗi trang

| Trang | Tệp cục bộ | Tổng (chưa nén) | Nặng nhất |
|---|---:|---:|---|
| `index.html` (trang chủ) | 29 | 1.541,9 KB | `bk-devboard.js` 274 KB, `bakhi-v4.js` 166 KB, `bk-cloud.js` 139 KB |
| `kttx/gk1/toan/indextoan.html` | 24 | 842,2 KB | `bk-cloud.js` 139 KB, `bk-core.js` 113 KB, `bk-profile.js` 97 KB |
| `gamification/index.html` | 25 | 873,5 KB | `bk-cloud.js` 139 KB, `bk-core.js` 113 KB |
| `chat/index.html` | 28 | 1.007,0 KB | `bk-cloud.js` 139 KB, `bk-core.js` 113 KB, `bk-chat.js` 106 KB |
| `ai-tutor/index.html` | 26 | 867,1 KB | `bk-cloud.js` 139 KB, `bk-core.js` 113 KB |

Chưa tính: Tailwind CDN (~100 KB), Font Awesome CSS + webfont, Google Fonts Lexend, KaTeX (trang bài học), Supabase JS UMD (~120 KB), ảnh/huy hiệu tải từ Supabase Storage.

## 2. Chi phí của lớp redesign

| Tệp | Kích thước | Ghi chú |
|---|---:|---|
| `assets/bakhi/bk-rebirth.css` | 65,2 KB | Token + shell + component + override module |
| `assets/bakhi/bk-rebirth.js` | 33,6 KB | Shell builder, motion engine, footer |
| `assets/bakhi/bk-legal.js` | 21,8 KB | Chỉ tải trên trang pháp lý |
| **Tổng thêm mỗi trang** | **≈ 98,8 KB** | Không thêm thư viện, không fetch mới |

Ước lượng sau gzip: CSS ≈ 12–14 KB, JS ≈ 8–9 KB. Không có request mạng mới ngoài 2 tệp tĩnh.

## 3. Những gì đã tối ưu trong lần này

- **Một scroll listener passive + một `requestAnimationFrame`** cho toàn bộ hiệu ứng cuộn (progress, sticky topbar, parallax nhẹ). Không có listener riêng lẻ.
- **`IntersectionObserver` reveal-once**: phần tử rời khỏi observer sau khi hiện, không tính toán lại.
- **Không ẩn nội dung khi JS lỗi**: class reveal chỉ gắn sau khi JS chạy; nếu JS tắt, nội dung vẫn hiện.
- **Ẩn hiệu ứng nặng của trang chủ** (canvas sao, tinh vân, hạt) bằng CSS, không chạy vòng lặp vẽ.
- **Tôn trọng `prefers-reduced-motion`** ở cấp CSS và JS; khi giảm chuyển động, không tạo observer/parallax.
- **Không thêm font mới**: dùng lại Lexend + monospace hệ thống.
- **Không thêm ảnh**: mark/icon đều là Font Awesome đã có.

## 4. Chưa đo / cần đo trên bản deploy

- LCP, CLS, INP, TBT, số request, transfer thực tế (nén + CDN).
- Chi phí Tailwind CDN trên trang chủ và 119 trang bài học.
- Ảnh đại diện/huy hiệu từ Supabase Storage.
- Hành vi trên thiết bị yếu (CPU thấp) và mạng 3G.
- Lighthouse mobile/desktop cho 5 trang đại diện.

## 5. Đề xuất tiếp theo (không làm trong lần này vì ngoài phạm vi “chỉ giao diện”)

1. Thay Tailwind CDN bằng CSS tĩnh đã build cho trang chủ/bài học.
2. Tách `bk-devboard.js` (274 KB) khỏi trang chủ nếu không cần ngay.
3. Nén trước CSS/JS bằng pipeline CI, giữ bản đọc được trong repo.
4. Thêm `loading="lazy"` cho ảnh huy hiệu/avatar ngoài màn hình đầu.

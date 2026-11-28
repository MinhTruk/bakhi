# Lean ledger — Quiet Graphite

Đơn vị: dòng và byte trên đĩa (chưa nén). “Thêm” tính trên tệp dùng chung của lớp redesign,
không tính tài liệu.

| Pha | Việc | CSS | JS | Dependency | Ghi chú |
|---|---|---:|---:|---:|---|
| P2 | Token, shell, component, motion engine, footer | +1.789 dòng (baseline phiên trước) | +829 dòng | 0 | một cặp tệp dùng chung |
| P4 | Mục lục đọc + tiến độ + CSS in | +110 | +85 | 0 | `mountReader`, không thư viện |
| P5 | Trợ lý AI: cột 760, serif, bong bóng | +44 | 0 | 0 | thuần CSS |
| P6 | Chat: 3 cột, bong bóng, badge | +41 | 0 | 0 | thuần CSS |
| P7 | Cài đặt T4 + touch target | +60 | 0 | 0 | thuần CSS |
| P9 | 404 + trạng thái | +48 | 0 | 0 | thêm `404.html` (52 dòng HTML) |
| P9 | Quy đổi Tailwind bài học (brand/amber/indigo) | +90 | 0 | 0 | thay màu, không đổi bố cục |
| P9 | Cổng nhận diện học sinh (bkc-gate) | +42 | 0 | 0 | bỏ gradient, dùng token |
| P9 | Nút nổi Báo cáo + trình phát nhạc | +28 | 0 | 0 | bỏ gradient tím |
| **Tổng phiên này** | | **+463** | **+88** | **0** | |

## Byte

| Tệp | Trước | Sau | Chênh |
|---|---:|---:|---:|
| `bk-rebirth.css` | 69.141 B | 89.720 B | +20.579 B |
| `bk-rebirth.js` | 36.657 B | 40.564 B | +3.907 B |
| `404.html` | – | 4,0 KB | mới, một trang |
| Font / thư viện | 0 | 0 | – |

Ước lượng sau gzip: **+3–4 KB mỗi trang** (hai tệp vốn đã được nạp).

## Đã cắt (không xây)

| Thứ đã cân nhắc | Lý do cắt |
|---|---|
| Thanh trượt cường độ chuyển động trong app | Đã có công tắc Chuyển động từ phiên trước; thêm nữa là tính năng mới |
| Command palette | Không được yêu cầu; thêm bề mặt |
| Trang đăng nhập học sinh | Sản phẩm không có mật khẩu; cổng nhận diện theo tên là auth duy nhất |
| Cây tài liệu 280 px giả trong từng bài học | Không tồn tại trong dữ liệu; sẽ là điều hướng bịa |
| Font serif tự host | 0 byte nếu dùng serif hệ thống; budget font không cần dùng |
| Hiệu ứng reveal từng section | “Tell” bị loại; app không cần |
| `robots.txt` / `sitemap.xml` | Crawler đọc ở gốc tên miền, không đọc `/bakhi/` |
| Xoá tệp JS/CSS cũ | Chưa chứng minh được “không còn tham chiếu” |

## Lean kết luận

**+551 dòng, +0 dependency, +24,5 KB thô (~+3–4 KB gzip).** Không thêm request, không thêm font,
không thêm ảnh.

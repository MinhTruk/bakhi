# Performance report — Quiet Graphite

Ngày 27/11/2026. **Không có số đo runtime** (LCP/CLS/INP/TBT) trong báo cáo này. Mọi con số dưới
đây là kích thước tệp trên đĩa và hành vi quan sát được trên máy chủ tĩnh cục bộ. Không có
Lighthouse, không có Chrome trace, không có dữ liệu người dùng thật.

## 1. Chi phí thêm vào mỗi trang (so với HEAD `d491628a`)

| Tệp | Trước | Sau | Chênh | Ghi chú |
|---|---:|---:|---:|---|
| `bk-rebirth.css` | 69.141 B | 89.720 B | **+20.579 B (+29,8 %)** | 461 dòng thêm: mục lục đọc, chat, Trợ lý AI, Cài đặt T4, 404, quy đổi Tailwind |
| `bk-rebirth.js` | 36.657 B | 40.564 B | **+3.907 B (+10,7 %)** | 88 dòng: `mountReader` + gọi một lần |
| Thư viện mới | 0 | 0 | 0 | không thêm dependency, không thêm font, không thêm request |
| **Tổng thêm mỗi trang** | | | **+24.486 B thô** | ước lượng sau gzip ≈ **+3–4 KB** |

Không có thêm request mạng nào: cả hai tệp đã được nạp trên mọi trang từ phiên trước.

## 2. Những gì đã cải thiện (đo được hoặc đọc mã)

- **Không thêm font.** Token `--rb-font-reading` trỏ tới serif hệ thống (Source Serif 4 → Noto
  Serif → Times New Roman) nên chi phí byte là **0**.
- **Vẫn một scroll listener.** `mountReader` không tự gắn `scroll`; thanh tiến độ dùng đúng
  `setupScroll()` (một listener passive + một rAF) đã có.
- **Scroll spy dùng `IntersectionObserver`** với `rootMargin`, chỉ theo dõi h2/h3 của trang hiện
  tại, không đo `getBoundingClientRect` mỗi frame.
- **CSS in** (~25 dòng) ẩn rail/top bar/tab bar/footer/nút nổi → in bài học ra giấy sạch, không
  tải gì thêm.
- **Mục lục ≤1500 px dùng `<details>`** thay vì thêm một JS drawer: 0 byte JS, 0 listener.

## 3. Những gì nặng thêm (thành thật)

- CSS toàn cục tăng 20,6 KB, tải trên **mọi** trang kể cả trang không dùng (Chat, Studio). Nếu
  muốn tối ưu tiếp: tách khối mục 19–27 sang `bk-rebirth-pages.css` và chỉ nạp ở nơi cần —
  chưa làm vì injector đang gắn một cặp tệp cho tất cả các trang, tách ra là thay đổi cơ chế.
- Quy đổi Tailwind bằng `[class~="…"]` sinh nhiều selector; trình duyệt xử lý tốt nhưng đây là
  phần lớn của 461 dòng thêm.

## 4. Baseline đã có (từ `perf-baseline.md`)

Trang chủ: 29 tệp cục bộ, 1.541,9 KB chưa nén; nặng nhất `bk-devboard.js` 274 KB. Trang bài học
điển hình: 24 tệp, 842,2 KB. Chưa tính Tailwind CDN (~100 KB), Font Awesome, Google Fonts,
KaTeX, Supabase UMD.

Sau redesign, các con số này **không đổi** ngoài +24,5 KB ở trên (hai tệp vốn đã có trong danh sách).

## 5. Not checked

- LCP, CLS, INP, TBT: **chưa đo**. Cần Lighthouse/Chrome trace trên bản deploy thật với
  throttling giống baseline.
- Số request, TTFB: không đổi cấu hình host nên không đo lại.
- Rò rỉ listener/subscription: chưa chạy vòng mount/unmount; phần mới chỉ thêm một
  `IntersectionObserver` không bao giờ bị huỷ (sống cùng trang, không phải SPA) — chấp nhận được
  vì trang tải lại là mất.

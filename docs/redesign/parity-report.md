# Parity report — đối chiếu chức năng sau redesign

Ngày 27/11/2026. Trạng thái: **Preserved** (giữ, đọc mã xác nhận) · **Tested** (đã chạy trên trình
duyệt thật trong phiên này) · **Not tested** (cần đăng nhập/dữ liệu thật) · **Defect**.

| # | Khu vực | Chức năng | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | Shell | Rail, top bar, bottom tab, sheet “Thêm”, skip link, footer | **Tested** | 1440×900, 1440×720, 375×780; rail 76 và 248 px, tooltip, chân rail không bị cắt; footer có link pháp lý |
| 2 | Shell | Chuyển theme + ghi nhớ | **Tested** | Nút theme trong rail hoạt động, khoá lưu cũ không đổi |
| 3 | Trang chủ | Cây tài liệu 8 thư mục, mở/đóng, link môn | **Tested** (mở thư mục) | Không sửa markup; nút “mở nhanh” cuộn + mở |
| 4 | Trang chủ | Changelog từ `bk-cloud.js` | Preserved | Nguồn không đổi; khung mới giữ đúng vị trí |
| 5 | Trang chủ | Ảnh nền tuỳ chỉnh + độ mờ | Preserved | `#bgInput`/`#opacityRange` còn nguyên |
| 6 | Trang chủ | Modal nhận diện học sinh (ghi tên) | **Tested (render)** | **Không submit** — tránh ghi dữ liệu thật |
| 7 | Bài học | Nội dung, công thức KaTeX, bảng ma trận | **Tested** | `content-integrity verify` OK; KaTeX render đúng |
| 8 | Bài học | Tab Ma trận / Luyện tập, chấm điểm | Preserved | Không sửa JS; mục lục tự dựng lại khi đổi tab |
| 9 | Bài học | Mục lục trong trang + tiến độ đọc (mới) | **Tested** | 1600 px: 5 mục, cách cột nội dung 72 px; 375 px: `<details>` cao 44 px, không tràn |
| 10 | Trợ lý AI | Gửi câu hỏi, streaming, lịch sử | **Not tested** | Cần đăng nhập + gọi Edge Function thật |
| 11 | Trợ lý AI | Bố cục T5 (cột 760, serif, bong bóng) | **Tested (CSS)** | Kiểm bằng tin nhắn tiêm vào DOM, không phải luồng thật |
| 12 | Chat | Gửi/nhận realtime, đã đọc, ảnh, reaction | **Not tested** | Trang chuyển về trang chủ khi chưa có phiên; không tạo tài khoản |
| 13 | Chat | Bố cục ba cột + bong bóng | Preserved (CSS) | Chỉ đọc CSS gốc; không xem được màn hình thật |
| 14 | Cài đặt | 6 tab cũ + tab Founder theo quyền | **Tested** | Nav dọc 240, nội dung 736 |
| 15 | Cài đặt | Lưu cài đặt, hình nền, khung avatar | Preserved | Không sửa `bk-settings.js` |
| 16 | Cài đặt | Nhóm “Chuyển động” (thêm phiên trước) | **Tested** | Chỉ lưu `bk.ui.motion` trên máy |
| 17 | Hồ sơ | Huy hiệu, khung, danh hiệu | **Tested (render)** | Ảnh chụp: khung tím hiển thị đúng, không cắt |
| 18 | Tiến trình / Kỹ năng | XP, cấp, cây kỹ năng | Preserved | Chỉ CSS |
| 19 | Studio | Soạn thảo, lưu cục bộ, xuất HTML/TXT/PNG | **Not tested** | Cần thao tác chuột trong canvas; chỉ re-skin |
| 20 | Founder / Admin | Cổng Founder Code | **Tested (render)** | Không có mã nên không đăng nhập |
| 21 | Founder / Admin | Dashboard, quyền, dữ liệu | **Not tested** | Không xem được DOM sau đăng nhập |
| 22 | Pháp lý | Điều khoản, quyền riêng tư, TOC, ngày cập nhật | **Tested** | Một nguồn nội dung `bk-legal.js` |
| 23 | 404 | Trang lỗi mới | **Tested** | Render + footer + rail; `noindex, follow` |
| 24 | Supabase | Bảng, RLS, Edge Function, auth | Preserved | Không sửa một dòng SQL/JS backend nào |
| 25 | Dữ liệu | Tiến trình, huy hiệu, chat, cài đặt | Preserved | Không có thao tác ghi nào trong phiên này |
| 26 | Khoá lưu trữ | theme cũ + `bk.ui.*` | **Tested** | Không đổi tên khoá cũ |
| 27 | CHANGELOG / phiên bản | `CHANGELOG.md`, `8.8.0` | Preserved | Không sửa; `version-audit` PASS |

## Tổng hợp

- **Tested:** 14 mục.
- **Preserved (đọc mã):** 9 mục.
- **Not tested:** 4 mục — tất cả đều cần tài khoản/dữ liệu thật (Chat, Trợ lý AI, Studio, dashboard
  Founder/Admin). Không mục nào bị đánh dấu **Defect**.
- Không có chức năng nào bị xoá. Không có nút nào không có handler do lớp mới thêm vào.

## Bổ sung sau khi kiểm thêm (cùng ngày)

- **Defect đã sửa:** 64 trang “coming soon” (`kttx`, `ktck1`, `ktck2`) không cuộn tới được footer vì
  `body{display:grid;overflow:hidden}`. Xem `STATUS.md` mục 8.
- Đã kiểm thêm 6 trang thuộc 4 mẫu bài học (bộ đề tự viết CSS, ma trận, Tailwind, mind map) ở
  desktop và mobile: không tràn ngang, rail/top bar/footer/tab bar đúng vị trí.
- **Vẫn Not tested:** Chat, Trợ lý AI, Studio, dashboard Founder/Admin (cần tài khoản thật).

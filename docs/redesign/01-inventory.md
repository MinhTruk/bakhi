# Inventory — route, màn hình, component, trạng thái

Ngày 27/11/2026. Số liệu đếm trực tiếp trên working tree.

## 1. Kỹ thuật

| Hạng mục | Hiện trạng |
|---|---|
| Stack | HTML tĩnh + JS thuần (IIFE), không bundler, không `package.json` |
| CSS | `bk-tokens.css` + từng module (`bk-core`, `bk-shell`, `bk-chat`, `bk-learn`…), cộng Tailwind Play CDN trong 125 trang bài học |
| Routing | Đa trang thật (`/kttx/…`, `/chat/`, `/settings/`…); deep link = đường dẫn tệp dưới base `/bakhi/` |
| Theme | `bk-theme-boot.js` áp trước khi vẽ; khoá lưu **giữ nguyên**; `bk.ui.*` chỉ cho dữ liệu mới |
| Backend | Supabase (auth nhận diện theo tên, bảng tiến trình/chat/thông báo), Edge Function cho AI |
| AI | gọi qua Edge Function, có fallback; UI không đổi provider/model/prompt |
| Deploy | GitHub Pages từ `main`; workflow chỉ chạy trên `main` (`changelog-sync.yml`, `music-library.yml`) |

## 2. Route (131 tệp HTML)

| Nhóm | Số tệp | Ví dụ |
|---|---:|---|
| Trang chủ | 1 | `index.html` |
| Bài học theo đợt | 125 | `ktgk1/ly/ly1.html`, `kttx/gk1/toan/indextoan.html` |
| Ứng dụng | 6 | `chat/`, `ai-tutor/`, `settings/`, `profile/`, `gamification/`, `skills/` |
| Studio | 1 | `studio/` |
| Quản trị | 2 | `founder/`, `admin/` |
| Pháp lý | 3 | `legal/index.html`, `terms.html`, `privacy.html` |
| Lỗi | 1 | `404.html` (thêm trong phiên này) |
| Ảnh | 1 | `images/anh/1.html` (trang xem ảnh) |
| Dev-only | 1 | `docs/redesign/gallery.html` (không nhận shell, không lên production) |

Nhánh đợt thi: `kttx` (thường xuyên), `ktgk1`/`ktgk2` (giữa kỳ), `ktck1`/`ktck2` (cuối kỳ) →
mỗi đợt có 10 môn (toán, lí, hoá, sinh, sử, địa, GDKT&PL, tin, văn, anh) → trong môn có trang
chỉ mục + các bài.

## 3. Màn hình và template đã áp

| Màn hình | Template | Trạng thái phiên này |
|---|---|---|
| Trang chủ | T1 | Đã dựng lại (hero cây tài liệu + changelog timeline) |
| Bài học | T2 | **Đã dựng**: mục lục “Trên trang” (cố định ≥1500 px, `<details>` dưới), thanh tiến độ đọc 2px, cột đoạn văn ≤72ch, CSS in |
| Chat | T3 | Ba cột 300 / 1fr / 320; bong bóng ≤75 %, đầu trang + composer dính; **logic realtime giữ nguyên, chưa kiểm thử được vì cần đăng nhập** |
| Trợ lý AI | T5 | Cột hội thoại ≤760, trả lời dạng serif không bong bóng, câu hỏi bong bóng phải; **chưa chạy luồng streaming thật** |
| Cài đặt | T4 | Điều hướng con 240 px dọc, nội dung ≤760, hàng cài đặt dạng đường kẻ |
| Hồ sơ / Tiến trình / Kỹ năng | T1 | Re-skin token (đã có từ phiên trước) |
| Studio | workspace riêng | Re-skin token, giữ chrome riêng |
| Founder / Admin | T1/T6 + cổng | Cổng Founder Code re-skin; **dashboard sau đăng nhập không kiểm thử được** |
| Pháp lý | T8 | Đã dựng (TOC dính + scroll spy + serif) |
| 404 | T9 | **Đã thêm** `404.html`, có footer pháp lý |

## 4. Component dùng chung (mỗi cái ≥ 2 nơi)

Rail, top bar, bottom tab, sheet “Thêm”, footer, skip link, panel/inset, nút (primary/secondary/
ghost/danger), field, badge, toast, dialog, progress, skeleton, TOC (`bk-reader`), status page
(`bk-status-*`). Không thêm component mới nào chỉ dùng một lần.

## 5. Trạng thái có/không (theo màn hình)

| Màn hình | loading | empty | error | disabled | 403 | offline |
|---|---|---|---|---|---|---|
| Trang chủ | có (skeleton khối chào) | có (không có cập nhật) | banner changelog | – | – | banner mất kết nối (Supabase) |
| Bài học | – (nội dung tĩnh) | – | – | nút luyện tập khi chưa chọn | – | – |
| Chat | có | có (chưa có tin nhắn) | có (gửi lỗi) | nút gửi khi rỗng | – | banner kết nối (có sẵn) |
| Trợ lý AI | có (đang suy nghĩ) | có (gợi ý mở đầu) | lỗi từng tin + Thử lại | nút gửi khi rỗng | – | banner |
| Cài đặt | có | – | lỗi lưu | control bị khoá | tab Founder ẩn theo quyền | – |
| 404 | – | – | – | – | – | – |

Khoảng trống đã biết: bài học không có trạng thái lỗi vì là tệp tĩnh; trang 404 không có nhánh
“thử lại”.

## 6. Khoá lưu trữ

| Khoá | Nguồn | Ghi chú |
|---|---|---|
| theme (`bk-theme`/thuộc tính `data-theme`) | có từ trước | **không đổi tên** |
| `bk.ui.motion` | thêm phiên trước | chỉ máy khách: `auto`/`reduced`/`full` |
| `bk.ui.nav` | thêm phiên trước | rail mở/đóng |
| phiên Founder | trong tab, không localStorage | theo mã nguồn hiện có |

## 7. Asset gamification

Khung avatar, huy hiệu, danh hiệu tải từ Supabase Storage; lớp mới **không** đổi kích thước hay
cắt khung, chỉ đặt nền trung tính phía sau. Ảnh chụp Hồ sơ cho thấy khung tím vẫn hiển thị đúng.

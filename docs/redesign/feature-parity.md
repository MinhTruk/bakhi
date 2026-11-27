# Feature parity — đối chiếu trước/sau redesign

Nguyên tắc: **không mất chức năng**. Mọi ID, hàm toàn cục, route, khóa lưu trữ và luồng dữ liệu cũ được giữ nguyên; thay đổi chỉ ở trình bày.

## 1. Trang chủ (`index.html`)

| Chức năng | Điểm neo cũ | Trạng thái sau redesign |
|---|---|---|
| Cây tài liệu 8 thư mục | `#categoriesTree`, `data-path`, `data-examkey` | Giữ nguyên cấu trúc và dữ liệu; chỉ đổi bề mặt/typography |
| Mở/đóng thư mục | `toggleFolder(id, btn)`, `.folder-content.open` | Giữ nguyên; thêm nút "mở nhanh" cuộn tới |
| Liên kết môn học do `bk-learn.js` render | `data-path` | Giữ nguyên |
| Lời chào theo giờ | `#bkGreeting`, `[data-bk-greet-*]` | Giữ nguyên, restyle thành dải chào |
| Ảnh nền tùy chỉnh | `#bgInput`, `#removeBgBtn`, `#opacityRange`, `handleCustomBackground`, `changeOverlayOpacity` | Giữ nguyên chức năng; ảnh chỉ hiện khi đã đặt (`.bk-has-wallpaper`) |
| Nhạc nền | `#bgmBtn`, `#bgmPanel`, `bgmToggle` | Ẩn khỏi trang chủ theo hướng tinh gọn; mã và nút gốc vẫn trong DOM, không lỗi |
| Hiệu ứng sao/tinh vân/hạt | `#starCanvas`, `.nebula`, `__fx` | Ẩn bằng CSS; mã vẫn tồn tại |
| README/CHANGELOG modal | `openReadmeModal`, `#readme-modal` | Giữ nguyên; có thể mở từ footer/command palette |
| Menu hamburger cũ | `#hamburgerDropdown`, `toggleHamburgerMenu` | Ẩn (đã bị `bk-shell` thay từ trước); DOM giữ nguyên |
| Xác thực Administrator | `#bkDevRevealBtn`, `#bkDevCodeInput`, `#bkDevAuthBtn`, `#bkDevDashSection` | Giữ nguyên trong DOM ẩn; luồng quyền không đổi |
| Changelog "Cập nhật gần đây" | `#bkcWhatsNew` do `bk-cloud.js` render | Có khung đặt sẵn đúng vị trí; nội dung và nguồn không đổi |
| Toast | `#toastContainer` | Giữ nguyên, restyle |

## 2. Trang module

| Trang | Chức năng chính | Cách giữ |
|---|---|---|
| `gamification/` | XP, cấp, cây kỹ năng, thành tựu, nhiệm vụ, Boss, kho vật phẩm | Chỉ CSS scoped `bkg-*`; `BK.gamification.mount` không đổi |
| `skills/` | Cây kỹ năng, trạng thái node | CSS scoped `bks-*` |
| `profile/` | Hồ sơ, huy hiệu, khung avatar, danh hiệu | CSS scoped `bkpf-*`; ID/JS không đổi |
| `settings/` | Giao diện, trợ năng, tài khoản, nhà phát triển, hình nền | Thêm panel "Chuyển động" (chỉ cục bộ); các panel cũ giữ nguyên |
| `chat/` | Phòng, tin nhắn, ảnh, reaction, đã đọc | CSS scoped `bkchat-*`; composer/list logic không đổi |
| `ai-tutor/` | Hội thoại AI, markdown, chọn model theo cấu hình máy chủ | CSS scoped `bkai-*`; không đổi provider/model/fallback |
| `studio/` | Soạn thảo Word/Paint, lưu cục bộ, xuất HTML/TXT/PNG | **Không chèn shell mới** để tránh phá layout; chỉ áp token/typography |
| `founder/`, `admin/` | Dashboard, quyền, dữ liệu quản trị | **Không chèn shell mới**; giữ nguyên `bkadm*` và phiên quyền |
| Bài học/đề | Nội dung, KaTeX, điều hướng bài, tiến trình đọc | Chỉ CSS quy đổi Tailwind màu; không sửa chữ |

## 3. Điều hướng & shell mới

- Rail desktop (76px, mở rộng 248px) + top bar 60px + bottom tab 5 mục trên mobile + sheet "Thêm".
- Nhóm: **Học** (Trang chủ, Tiến trình, Kỹ năng), **Công cụ** (Trợ lý AI, Chat, Studio), **Tài khoản** (Hồ sơ, Cài đặt, Pháp lý).
- Nhóm **Quản trị** chỉ hiện khi có phiên `bakhiAdmin.v1` (sessionStorage) hoặc đang ở trang Founder/Admin. Đây chỉ là hiển thị; quyền dữ liệu vẫn do Supabase/RLS quyết định.
- Avatar và chuông thông báo **được di chuyển** vào top bar, không tạo bản sao.
- `Ctrl/⌘+K` vẫn mở Trung tâm học tập của `bk-learn.js`.

## 4. Không thay đổi

- Route, tên tệp, đường dẫn tài liệu.
- Supabase schema/RLS/Edge Functions.
- Nội dung học tập, đáp án, README, CHANGELOG.
- Logic đăng nhập học sinh, Founder, Admin, Developer.
- Nhà cung cấp AI, mô hình, thứ tự fallback.
- Khóa lưu trữ cũ. Khóa mới: `bk.ui.nav`, `bk.ui.motion`.

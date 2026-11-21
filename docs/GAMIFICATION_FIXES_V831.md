# CÁC SỬA LỖI GAMIFICATION — v8.3.1

| # | Sửa lỗi | Tệp | Kiểm chứng |
|---|---|---|---|
| 1 | Nối đúng lớp máy chủ `window.BKCloud`; `BK.cloud` chỉ còn là fallback có kiểm tra | `bk-gamification.js` | `gamification-smoke` (stub production), `progress-load` ca 3 |
| 2 | Danh tính lấy từ `BKCloud.identity()` trước cache | `bk-gamification.js` | `gamification-smoke` |
| 3 | Máy trạng thái loader + 8 mã lỗi riêng + nút Thử lại | `bk-gamification.js`, `bk-gamification.css` | `progress-load` 29 ca |
| 4 | Retry giới hạn (2 lần, chỉ lỗi tạm thời), timeout 15 s | `bk-gamification.js` | `progress-load` ca 6, 7 |
| 5 | Chặn request chồng chéo khi đang tải/thử lại | `bk-gamification.js` | `progress-load` ca 6, 7 |
| 6 | `SEQ` chống phản hồi cũ ghi đè XP mới | `bk-gamification.js` | `progress-load` ca 10 |
| 7 | Giữ dữ liệu đã tải + băng báo lỗi một phần | `bk-gamification.js|css` | `progress-load` ca 8 |
| 8 | Lối vào Tiến trình trong menu tài khoản + `aria-current` | `bk-shell.js` | `navigation-smoke` 17 ca |
| 9 | Hàng đợi sự kiện gửi lại khi có danh tính/mạng (đã có ở 8.3.0, giữ nguyên) | `bk-gamification.js` | `gamification-smoke` |
| 10 | QA mô phỏng đúng hình dạng production; thêm 2 bộ QA; đưa 5 bộ vào CI | `tools/qa/*`, `quality-check.yml` | CI 22 smoke test |

## Không thay đổi

- Công thức cấp độ, schema, RLS, Reward Engine, nội dung thành tựu/nhiệm vụ/cây kỹ năng.
- Badge, Title, Learning Intelligence, đồng bộ tiến trình học tập.
- Không thêm bảng, không migration mới, không nới quyền.

## Hệ quả vận hành

- Không cần deploy lại database; chỉ deploy lại `admin-actions` vì `SERVER_VERSION`
  và đẩy tệp tĩnh lên GitHub Pages.

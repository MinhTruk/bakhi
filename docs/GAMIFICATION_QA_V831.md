# QA GAMIFICATION — v8.3.1

## 1. Bộ kiểm tra

| Tệp | Nội dung | Kết quả |
|---|---|---|
| `tools/qa/gamification-smoke.js` | nạp mô-đun, công thức cấp, hàng đợi idempotent, dựng dashboard, nộp Boss, cổng nhận diện | **31/31** |
| `tools/qa/gamification-progress-load-smoke.js` | 11 tình huống loader: chưa nhận diện, thành công, BKCloud vs BK.cloud, 401, 409, mất mạng, 5xx, cache + lỗi một phần, nút Thử lại, phản hồi cũ, thiếu lớp kết nối | **29/29** |
| `tools/qa/gamification-navigation-smoke.js` | route, mô-đun, menu thật trong jsdom, href, role, aria-current, không phụ thuộc trạng thái tải | **17/17** |
| `tools/qa/xp-level-integrity.js` | công thức JS ↔ Postgres, bất biến XP/cấp | **12/12** |
| `tools/qa/gamification-security-smoke.js` | RLS, payload, quyền admin/founder, không lộ đáp án | **30/30** |
| `tools/qa/gamification-db-check.js` | engine thật trong transaction rollback (cần `SUPABASE_ACCESS_TOKEN`) | **15/15** |

Tổng: 134 ca đạt, 0 lỗi. Không có ca BLOCKED ở tầng chạy được.

## 2. Hồi quy

Chạy lại toàn bộ 17 bộ QA cũ trong `quality-check.yml`: `smoke`, `cloud-smoke`,
`shell-smoke`, `dev-smoke`, `badges-smoke`, `chat-smoke`, `admin-smoke`, `report-smoke`,
`founder-smoke`, `maintenance-smoke`, `studio-smoke`, 6 cổng Learning Intelligence —
**tất cả đạt**. `content-integrity verify`: 123 tệp nội dung không đổi. `version-audit`:
124 trang, 28 JS, phiên bản 8.3.1 đồng nhất.

Cập nhật kỳ vọng hợp lệ duy nhất: `shell-smoke` thêm mục “Tiến trình học tập” vào thứ tự
menu (tính năng mới), kèm kiểm tra href `gamification/`.

## 3. CI

`.github/workflows/quality-check.yml` chạy 22 smoke test (17 cũ + 5 gamification).
`gamification-db-check` không đưa vào CI vì cần access token quản trị project.

## 4. NOT RUN / BLOCKED

| Hạng mục | Trạng thái | Lý do |
|---|---|---|
| Đăng nhập học sinh thật rồi làm quiz thấy XP tăng trên production | NOT RUN | Không có trình duyệt/phiên học sinh thật trong môi trường này; không tạo dữ liệu giả |
| Đồng bộ hai thiết bị thật | NOT RUN | Như trên |
| Soạn và chơi Boss thật | BLOCKED | Chưa có thử thách do quản trị viên biên soạn (cố ý không seed nội dung giáo dục) |
| Kiểm tra giao diện ở nhiều kích thước màn hình | NOT RUN | Không có trình duyệt; chỉ kiểm tra cấu trúc DOM/CSS |

Các mục trên được ghi nguyên trạng trong `RELEASE_REPORT_V831.md`, không đánh dấu PASS.

# GAMIFICATION AUDIT — v8.3.0

Ngày audit: 21/11/2026. Phạm vi: repository `MinhTruk/bakhi` tại commit nền `d7e5e86`
(v8.2.0) và project Supabase `wzvslyabhizsiggurwdq`.

## 1. Kết luận nhanh

Trước v8.3.0, Bá Khí **không có** hệ thống XP, cấp độ, nhiệm vụ, cây kỹ năng,
thử thách Boss hay kho vật phẩm. Vì vậy không có engine trùng lặp phải hợp nhất.
Phần đã có là **thành tích (badge)**, **danh hiệu (title)**, **danh vị học sinh
(role)** và **Learning Intelligence** — được giữ nguyên và chỉ được tham chiếu.

| Thành phần | Trạng thái trước 8.3.0 | Xử lý trong 8.3.0 |
|---|---|---|
| XP | Không có | Tạo mới: `xp_transactions` + Reward Engine |
| Level | Không có | Tạo mới: `bk_gam_level()` (một công thức duy nhất) |
| Badge | Có: `bk-badges.js` (99 badge: 74 tự động + 25 trao tay), `bakhiBadges.v1`, bảng trao tay phía máy chủ | **Giữ nguyên**. Gamification không ghi vào hệ badge |
| Title | Có: `bk-titles.js` + bảng `titles` phía máy chủ | **Giữ nguyên**. Không tạo bảng danh hiệu thứ hai |
| Achievement | Chưa có engine điều kiện phía máy chủ | Tạo mới `achievement_defs`/`user_achievements` (chỉ số lấy từ sổ XP) |
| Mission | Không có | Tạo mới `mission_defs`/`user_missions` |
| Reward | Badge/khung avatar trao tay | Tạo mới `reward_catalog`/`user_inventory` (trang trí) |
| Leaderboard | Không có | **Không thêm** (sản phẩm không phải nền tảng thi cử) |
| Profile | Hồ sơ local-first + badge board | Bổ sung trang `/gamification/`; không sửa hồ sơ hiện có |
| Admin | Administrator/Founder Dashboard 15 tab | Thêm tab **Tiến trình** (thứ 5) |

## 2. Bằng chứng đã kiểm tra

- `assets/bakhi/bk-version.js`: `app = '8.2.0'`, phát hành 20/11/2026.
- `assets/bakhi/*.js`: 34 tệp; không tệp nào chứa biến XP/level/điểm kinh nghiệm.
- `grep -rni "level"` chỉ trả về log level và `difficulty` của câu hỏi.
- `supabase/migrations/` có 27 migration tới `20261208000000_bakhi_v820_learning_intelligence.sql`;
  không có bảng XP/mission/boss/inventory.
- `supabase/functions/` có 11 function + 6 tệp `_shared`; không có gamification.
- `bk-badges.js` dùng khoá `bakhiBadges.v1.<studentId>`, mở khoá theo chỉ số cục bộ
  và nhận badge trao tay từ máy chủ (`applyGrants`).
- `bk-core.js`: `bakhiLearn.v1` (practice/review/plans/goals/revisionSessions),
  `bakhiSignals.v1` (bộ đếm), `addHistory`, `BK.practice`, `BK.mistakes`.
- `bk-learning.js`: phiên ôn (`BK.revision`), sổ tay câu sai, mục tiêu, kế hoạch.
- `bk-page.js`: quét phản hồi đúng/sai trên trang bài học và gọi `BK.practice`.
- Admin/Founder Dashboard dùng Edge Function `admin-actions` với `x-admin-token`;
  scope `admin`/`founder` đọc từ `admin_sessions.scope`.

## 3. Rủi ro đã xác định và cách xử lý

1. **Không có nguồn XP phía máy chủ.** Trước đây mọi thành tích tính từ localStorage
   nên không thể tin cậy đa thiết bị. 8.3.0 đưa XP vào Postgres; client chỉ gửi
   *sự kiện học tập* kèm khoá idempotency.
2. **Hai nguồn thành tích nếu làm ẩu.** Đã tránh bằng cách để achievement 8.3.0
   đọc chỉ số từ sổ XP, còn badge cũ vẫn do `bk-badges.js` quản lý — không ghi chéo.
3. **Nội dung Boss.** Không có ngân hàng câu hỏi phía máy chủ. Không thể lấy câu hỏi
   từ HTML tĩnh mà vẫn chấm điểm an toàn, nên Boss Challenge dùng bảng câu hỏi do
   quản trị viên biên soạn; **không seed câu hỏi giả**.
4. **Dữ liệu cũ.** Không xoá bất kỳ khoá localStorage hay bảng nào. Xem
   `GAMIFICATION_DATA_MIGRATION_V830.md`.
5. **Xung đột đa thiết bị.** XP do máy chủ cộng; localStorage chỉ là cache và hàng
   đợi sự kiện. Không lấy dữ liệu localStorage ghi đè Supabase.

## 4. Những gì KHÔNG làm (có lý do)

- Không thêm bảng xếp hạng thi đua: AGENTS.md cấm cơ chế thi cử/áp lực.
- Không thêm XP cho chat, gửi báo cáo, đổi giao diện hay thao tác lặp vô nghĩa.
- Không thay hệ badge/title hiện có bằng hệ mới.
- Không xoá bảng/cột cũ nào trong migration này.

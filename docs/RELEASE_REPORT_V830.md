# BÁO CÁO PHÁT HÀNH — Bá Khí v8.3.0

Ngày: 21/11/2026 · Commit: `760c61d` · Nhánh: `main` · Project: `wzvslyabhizsiggurwdq`

## 1. Tóm tắt triển khai

**Đã triển khai**

- Sổ giao dịch XP có idempotency, giới hạn/ngày, audit và hàm đối chiếu.
- Công thức cấp độ duy nhất (`bk_gam_level_floor` / `bk_gam_level`), bản hiển thị
  trong JS có QA đối chiếu với Postgres.
- Cây kỹ năng 5 nhánh, 15 node; thành tựu 17 định nghĩa; nhiệm vụ 9 định nghĩa;
  danh mục 6 vật phẩm; kho vật phẩm trang bị được.
- Thử thách Boss: ngân hàng câu hỏi phía máy chủ, chấm điểm tại máy chủ, chống nộp lại.
- Trang `/gamification/` (tổng quan, nhiệm vụ, bộ sưu tập, cây kỹ năng, Boss, lịch sử XP,
  tuỳ chọn hiển thị) và tab quản trị **Tiến trình** cho Administrator/Founder.
- Theo dõi hoạt động thật: quiz, lượt học, luyện nghe, phiên ôn, câu sai thành thạo,
  mục tiêu; chèn tự động vào 118 trang nội dung.

**Đã nâng cấp**

- `bk-page.js`, `bk-learning.js`: phát sự kiện học tập (không đổi nội dung giáo dục).
- `bk-cloud.js`: thêm `gamificationApi` và `gamificationAdmin`.
- `bk-devboard.js`: thêm tab thứ 5, giữ nguyên 14 tab còn lại.
- `admin-actions`: `SERVER_VERSION` lên 8.3.0.

**Hệ thống cũ đã hợp nhất**

- Không có engine XP/level/mission cũ để hợp nhất. Badge (99), Title, danh vị và
  Learning Intelligence được **giữ nguyên**, không bị ghi chéo.

**Hệ thống cũ đã loại bỏ**

- Không xoá gì. Không có thành phần dư thừa đủ điều kiện an toàn để xoá trong phát hành này.

## 2. Tóm tắt dữ liệu

- Migration mới: `20261209000000_bakhi_v830_gamification.sql` (1 tệp, idempotent).
- Bảng tạo mới (15): `gamification_config`, `xp_transactions`, `user_progression`,
  `skill_tree_nodes`, `user_skill_progress`, `achievement_defs`, `user_achievements`,
  `mission_defs`, `user_missions`, `boss_challenges`, `boss_questions`, `boss_attempts`,
  `reward_catalog`, `user_inventory`, `gamification_activity_logs`.
- Hàm tạo mới (14): xem `GAMIFICATION_ARCHITECTURE.md`.
- Bảng tái sử dụng: `students`, `student_devices`, `admin_sessions`,
  `admin_activity_logs`, `rate_limits`, `student_progress` (không đổi).
- Seed: 15 node, 17 thành tựu, 9 nhiệm vụ, 6 vật phẩm. **0 học sinh, 0 giao dịch XP,
  0 thử thách** — không có dữ liệu người dùng giả.
- Chuyển đổi dữ liệu: không cần (chưa có dữ liệu gamification trước đó).
- Toàn vẹn: `bk_gam_admin_drift()` trả **0 dòng** sau khi áp migration.

## 3. Tóm tắt bảo mật

- RLS bật trên toàn bộ bảng gamification; **không có policy INSERT/UPDATE/DELETE**.
- Policy SELECT giới hạn `student_id = bakhi_current_student_id()`.
- `boss_questions` và `gamification_activity_logs` không cấp quyền đọc cho học sinh.
- Hàm `bk_gam_*` chỉ `service_role` gọi được (revoke khỏi public/anon/authenticated).
- Danh tính lấy từ phiên thiết bị; quản trị lấy từ `admin_sessions` + scope đọc ở máy chủ.
- XP: số lượng lấy từ cấu hình, chống trùng bằng unique idempotency, giới hạn/ngày.
- Founder-only: điều chỉnh XP (bắt buộc lý do), xem nhật ký, tìm học sinh.
- Rủi ro đã phát hiện khi audit: client từng là nguồn thành tích duy nhất (localStorage)
  → nay XP và thành tựu 8.3.0 do máy chủ tính; hệ badge cũ vẫn local-first như thiết kế
  và không được dùng để cấp XP.

## 4. Tóm tắt QA

| Bộ kiểm tra | Kết quả |
|---|---|
| `gamification-db-check.js` (project thật, transaction rollback) | **15/15 đạt** |
| `gamification-smoke.js` (jsdom) | **31/31 đạt** |
| `xp-level-integrity.js` | **12/12 đạt** (gồm đối chiếu JS ↔ Postgres) |
| `gamification-security-smoke.js` | **30/30 đạt** |
| `content-integrity verify` | 123 tệp nội dung không đổi; 1 tệp HTML mới |
| 17 smoke test trong `quality-check.yml` (`smoke`, `cloud-smoke`, `shell`, `dev`, `badges`, `chat`, `admin`, `report`, `founder`, `maintenance`, `studio` + 6 cổng Learning) | **tất cả đạt** sau khi cập nhật kỳ vọng số tab: Administrator 13 → 14, Founder 16 → 17 (có kiểm tra tab **Tiến trình** tồn tại) |
| `node --check` các tệp JS đã sửa | Đạt |

Không chạy được: kiểm thử bằng tài khoản học sinh thật trên production và kiểm thử
trình duyệt tương tác (không có phiên đăng nhập học sinh trong môi trường này).

## 5. Tóm tắt triển khai

- Git commit: `760c61d` — `feat(8.3.0): Gamification 2.0 — hệ thống tiến trình thống nhất`.
- Git push: `d7e5e86..760c61d` → `main` (fast-forward, không force).
- Migration Supabase: đã áp, đã ghi `schema_migrations`.
- Edge Function: `gamification-api` (mới), `admin-actions` (8.3.0) đã deploy.
- GitHub Pages: `/gamification/` trả 200; `bk-version.js` trả 8.3.0; admin nạp mô-đun mới.
- Production verification: HTTP 200 + kiểm tra nội dung + xác thực cổng Edge (401 khi
  thiếu phiên). **Không** kiểm tra bằng trình duyệt tương tác.

## 6. Tóm tắt dọn dẹp hệ cũ

- Đã loại bỏ: không có.
- Đã thay thế: không có (không tồn tại hệ cũ tương ứng).
- Đã migrate dữ liệu: không cần.
- Còn giữ và lý do: `bk-badges.js`, `bk-titles.js`, `bakhiSignals.v1`,
  `bakhiBadges.v1` — vẫn là hệ thành tích/danh hiệu đang hoạt động và độc lập;
  `bakhiSignals.v1` không dùng làm XP nhưng vẫn được badge và Studio đọc.

## 7. Vấn đề còn lại

1. **Thử thách Boss chưa có nội dung.** Hệ thống chạy đúng nhưng cần quản trị viên
   soạn câu hỏi trong Admin → Tiến trình. Cố ý không seed để tránh nội dung giáo dục giả.
2. **Câu sai trong Boss chưa tự vào Sổ tay câu sai** (nội dung Boss độc lập với ngân
   hàng câu hỏi của trang bài học; cần ánh xạ câu hỏi nếu muốn).
3. **Chưa kiểm thử end-to-end bằng tài khoản học sinh thật**: XP tăng khi làm quiz trong
   trình duyệt, đồng bộ hai thiết bị, nhận thưởng nhiệm vụ trên production. Đã kiểm tra
   cùng logic ở tầng dữ liệu và jsdom nhưng chưa phải phiên thật.
4. **Không backfill XP** cho hoạt động trước 8.3.0 (cần migration riêng có đối chiếu).
5. **Huy hiệu hiển thị của gamification** (frame/title) chỉ áp dụng trong trang tiến trình,
   chưa đổi khung avatar ở header/hồ sơ — tránh xung đột với hệ khung avatar hiện có.
6. Chưa có màn hình quản trị **mùa sự kiện** riêng; `gamification_config.season` đã có
   trường dữ liệu nhưng chỉ sửa qua API cấu hình.

## 8. Trạng thái cuối

**PARTIALLY READY**

Lý do: kiến trúc, dữ liệu, bảo mật và QA tầng máy chủ đã đạt; production đã phát hành và
trả đúng phiên bản. Nhưng chưa xác minh luồng người học thật trên production (XP phát
sinh từ quiz, đồng bộ đa thiết bị, nhận thưởng), và Boss Challenge chưa có nội dung cho
đến khi quản trị viên biên soạn. Không có lỗi dữ liệu hay bảo mật đã biết.

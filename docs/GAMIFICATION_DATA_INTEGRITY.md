# TOÀN VẸN DỮ LIỆU GAMIFICATION

## 1. Nguồn sự thật

| Dữ liệu | Nguồn chính thức | Bản sao được phép |
|---|---|---|
| XP, cấp độ | `xp_transactions` + `user_progression` (Postgres) | cache `bakhiGamification.v1.<id>` (chỉ hiển thị) |
| Thành tựu | `user_achievements` (do `bk_gam_evaluate` ghi) | state trả về |
| Nhiệm vụ | `user_missions` (do `bk_gam_sync_missions`/`bk_gam_claim`) | state trả về |
| Cây kỹ năng | `user_skill_progress` | state trả về |
| Kho vật phẩm | `user_inventory` | state trả về |
| Boss | `boss_challenges` + `boss_questions` + `boss_attempts` | đề không kèm đáp án |
| Badge / Title | `bk-badges.js`, `bk-titles.js` (hệ cũ, độc lập) | — |

Client **không** ghi bảng, không tự tính XP, không tự mở node/thành tựu. Mọi thay đổi qua
`gamification-api` và các hàm `bk_gam_*`.

## 2. Bất biến và cách kiểm tra

| Bất biến | Công cụ |
|---|---|
| `total_xp` = Σ giao dịch `awarded` | `bk_gam_admin_drift()` = 0 dòng; `gamification-db-check` |
| `level` = `bk_gam_level(total_xp)` | `xp-level-integrity` (9 mốc, đối chiếu Postgres) |
| Cấp không giảm, XP không âm | engine test trong transaction rollback |
| Không có giao dịch trùng | unique idempotency; `gamification-db-check` |
| Vật phẩm sở hữu ↔ nguồn cấp | `bk_gam_grant_item` idempotent; `gamification-db-check` |
| Nhiệm vụ chỉ nhận thưởng một lần | `bk_gam_claim` kiểm tra trạng thái |
| Phản hồi cũ không ghi đè | `SEQ` ở client + `gamification-progress-load-smoke` |
| Cache không thay server | cache chỉ đọc; xoá theo `studentId` khi đổi người |

## 3. Hành vi khi phát hiện lệch

- `bk_gam_admin_drift()` chỉ **báo**, không tự sửa. Founder xem trong tab Tiến trình.
- Không có tác vụ tự động xoá/điều chỉnh hàng loạt.
- Điều chỉnh XP chỉ qua `bk_gam_adjust` (Founder, bắt buộc lý do, ghi audit).

## 4. Dữ liệu hiện tại (21/11/2026)

40 học sinh, 18 thiết bị đã gắn, 0 giao dịch XP, 0 dòng tiến trình — đúng với thực tế là
trước 8.3.1 chưa ai tải được tiến trình. Không tạo dữ liệu giả để lấp chỗ trống.

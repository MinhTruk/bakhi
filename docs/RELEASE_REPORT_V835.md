# Báo cáo phát hành Bá Khí 8.3.5

Ngày phát hành: 2026-11-21 · Phiên bản nền: 8.3.1 · Commit: `7e231c2`

---

## 1. Avatar Fix

**Nguyên nhân không đồng bộ.** Có hai lỗi độc lập:

1. Trang Tiến trình (`bk-gamification.js`) dựng avatar bằng chữ cái đầu và **không đọc**
   `BKProfile`, nên chưa bao giờ hiển thị ảnh đại diện thật.
2. Khung avatar có **hai nguồn sự thật**: `student_profiles.frame` (navbar, Hồ sơ, Chat) và
   `user_inventory.is_equipped` (Gamification). `bk_gam_equip` chỉ ghi vế thứ hai. Thêm nữa
   `bakhi_owned_frames` chỉ đọc `student_badges`, nên khung thưởng Gamification không thể
   trang bị ở Hồ sơ (trigger trả `FRAME_NOT_OWNED`).

**Cách sửa.**

- `student_profiles.frame` là nguồn chính thức duy nhất cho khung đang trang bị.
- `bk_gam_equip` (migration 8.3.5) ghi `student_profiles.frame` trong **cùng transaction**
  với `user_inventory.is_equipped`, và trả `kind`/`frame` cho client.
- `bakhi_owned_frames` bổ sung khung nhận qua kho vật phẩm (`reward_catalog.metadata.profile_frame`).
- Hero dùng chung `BKProfile.avatarNode()`; `avatarNode` được dùng cho navbar, Hồ sơ, Chat,
  Gamification.
- `BKProfile.applyServerFrame()` cập nhật cache + phát sự kiện để navbar vẽ lại ngay.
- Gamification nghe `BKProfile.on()` và chỉ render lại khi chữ ký avatar/khung đổi.

**Khu vực được đồng bộ.** Navbar, menu tài khoản, trang Hồ sơ, tab Hồ sơ trong Cài đặt,
Chat, hero trang Tiến trình, bảng học sinh trong Administrator (đọc `avatar_url`/`frame`).

**Database/API thay đổi.** Một migration mới + `gamification-api` (trả thêm `kind`, `frame`).
Không thêm bảng, không đổi RLS, không đổi `student-profile`.

**Kết quả kiểm tra.** QA tự động 16/16 cho luồng đồng bộ; kiểm tra trên production DB
(rollback) xác nhận trang bị khung → `student_profiles.frame = wreath`, danh sách sở hữu có
`wreath`, bỏ khung → `none`, vật phẩm vẫn trong kho. **Chưa kiểm tra đa thiết bị thật.**

---

## 2. Founder Dashboard Simplification

**Giao diện cũ có vấn đề gì.**

- Bắt tự nhập mã (`ach-vi-du`, `frame-bac`…), không gợi ý, gõ sai tạo bản ghi mới.
- Nhóm/độ hiếm/chỉ số là ô chữ tự do với gợi ý mơ hồ (`quiz | reading | revision`), dễ gửi
  giá trị không tồn tại.
- Trộn trường kỹ thuật với nội dung; không xem trước; không phát hiện mã trùng; không có
  Tạm ngừng/Lưu trữ/Xóa; thông báo lỗi kỹ thuật.

**Đã đơn giản hóa.**

- Chia biểu mẫu thành 3 bước có tiêu đề: Thông tin cơ bản → Điều kiện → Phần thưởng & trạng thái.
- Danh sách có tìm kiếm, lọc trạng thái, nút Sửa / Tạm ngừng–Kích hoạt / Xóa.
- Nút đặt tên rõ: **Tạo mới, Sửa, Lưu thay đổi, Hủy, Tạm ngừng, Kích hoạt, Lưu trữ, Xóa**.
- Lỗi tiếng Việt, chỉ rõ trường cần sửa; không lộ SQL/stack.

**Trường tự động tạo.** Mã thành tích/Boss/nhiệm vụ/node/phần thưởng (từ tên), thứ tự mặc
định, danh sách câu hỏi hợp lệ, mã đề xuất khi trùng, `expect_new` khi tạo mới.

**Trường kỹ thuật đã ẩn.** Mã, thứ tự, thời điểm đóng Boss — nằm trong **Cài đặt nâng cao**,
mặc định đóng. Không còn ô JSON nào.

**Kết quả tạo/sửa Boss.** Mã tự sinh (`Long Thần Hủy Diệt` → `long_than_huy_diet`), có xem
trước (tên, loại, môn, chương, độ khó, điểm đạt, mã, số câu, số lượt), cảnh báo trùng, lỗi
thiếu câu hỏi bằng tiếng Việt. Lưu trữ thay vì xóa cứng để giữ lịch sử lượt thử.

**Kết quả tạo/sửa Achievement.** 28/28 ca QA đạt: mã `ma_vuong`, trùng → `ma_vuong_2` +
nút xác nhận, xem trước theo thời gian thực, sửa điền sẵn, `expect_new` gửi máy chủ, Xóa bị
từ chối khi đã có người nhận.

---

## 3. Data Migration

- **Đã thực hiện:** `20261210000000_bakhi_v835_avatar_frame_sync.sql` (áp production, HTTP 201).
- **Dữ liệu bảo toàn:** không xóa dòng nào; không đổi kiểu cột; `student_badges`,
  `user_inventory`, `xp_transactions`, `boss_attempts` giữ nguyên.
- **Dữ liệu chuyển đổi:** `reward_catalog.metadata.profile_frame` cho hai khung
  (`frame-laurel → wreath`, `frame-ember → infernal`); ràng buộc slug Boss nới cho `_`.
- **Đối chiếu:** truy vấn `reward_catalog` trả đúng ánh xạ; `gamification-db-check`
  15/15 nhóm đạt, XA42–XA45 xác nhận đồng bộ hồ sơ và không mất vật phẩm; không lệch sổ XP.
- **Chưa thực hiện:** không đổi hàng loạt id cũ sang `_` (sẽ phá tham chiếu), không thêm bảng
  ánh xạ mới. Lý do: dữ liệu tương đương đã có và đang được dùng.

---

## 4. Security

| Hạng mục | Trạng thái |
|---|---|
| Authentication | Không đổi. `gamification-api` vẫn xác minh phiên thiết bị; action quản trị cần `x-admin-token` |
| Authorization | `admin.achievement.delete` chỉ chạy với phiên admin/founder hợp lệ; Founder-only giữ nguyên cho XP/logs/students.list |
| RLS | Không đổi; mọi bảng người dùng chỉ có policy SELECT |
| Inventory validation | `bk_gam_equip` kiểm tra `user_inventory` trước khi trang bị; API trả 403 `NOT_OWNED` |
| Frame validation | `bakhi_profile_frame_guard` chặn khung không sở hữu ở tầng DB, kể cả khi ghi trực tiếp |
| Founder permissions | Không mở rộng quyền Administrator thành Founder; scope đọc từ `admin_sessions`, không tin client |
| Audit Logs | `achievement_save`, `achievement_delete`, `challenge_save`, `challenge_close`, `item_equip` (kèm `profile_frame`) |

QA bảo mật: `gamification-security-smoke` 30/30, `gamification-db-check` 15/15 (gồm policy,
quyền anon, `boss_questions` không đọc được từ trình duyệt).

---

## 5. QA

- **Tổng số tệp QA:** 28 (27 chạy tự động + 1 cần token chủ dự án, đã chạy riêng).
- **Passed:** tất cả — 0 FAIL.
- **Failed:** 0.
- **Blocked:** 1 hạng mục — chơi thử Boss thật (chưa có nội dung do quản trị viên soạn).
- **Not Run:** đăng nhập học sinh thật, đồng bộ hai thiết bị thật, F5/đổi tài khoản trên
  production, kiểm tra nhiều kích thước màn hình + Light/Dark, Console/Network trên trình duyệt.

Số ca chính: avatar 16, founder dashboard 28, sinh mã 24, gamification 31, loader 29,
điều hướng 17, XP/cấp 12, bảo mật 30, DB 15 nhóm (XA1–XA45).

**Lỗi còn tồn tại:** không có lỗi đã biết trong phạm vi đã kiểm.

---

## 6. Cleanup

- **Đã gộp:** khung avatar chỉ còn một nguồn (`student_profiles.frame`); một component hiển
  thị avatar (`BKProfile.avatarNode`) cho mọi nơi.
- **Hàm trùng đã loại:** chỉ còn một `slugify`/`suggestCode` (client) và một `codeOf` (server);
  bộ đọc câu hỏi Boss chỉ còn một bản.
- **Đã xóa:** biểu mẫu cũ của tab Thành tích/Boss (thay thế, không chồng thêm); mã nhúng
  trạng thái “đang dùng” dựa riêng vào `is_equipped` trong Gamification.
- **Giữ lại có lý do:** `user_inventory.is_equipped` (hiển thị kho, lịch sử), `BKProfile`
  local-first (cache + nháp khi chưa nhận diện), `bakhi_owned_frames` cũ (tương thích badge).

---

## 7. Deployment

- **Commit:** `7e231c2` — `feat(8.3.5): đồng bộ avatar/khung toàn website và đơn giản hoá quản trị thành tích`.
- **Push:** `938d99f..7e231c2` → `main` (fast-forward).
- **Supabase:** migration áp thành công; `gamification-api` và `admin-actions` (8.3.5) đã deploy.
- **GitHub Pages:** tự phát hành sau push.
- **Production verification:** `bk-version.js` = 8.3.5; `/gamification/` nạp
  `bk-gamification.js?v=8.3.5`; production có `heroAvatar`/`applyServerFrame`/`slugify`;
  `SERVER_VERSION` của `admin-actions` = 8.3.5.

Chi tiết: `docs/DEPLOYMENT_V835.md`.

---

## 8. Trạng thái cuối

### PARTIALLY READY

Lý do:

- Toàn bộ tiêu chí kỹ thuật trong phạm vi kiểm thử tự động đã đạt; dữ liệu được bảo toàn;
  migration và Edge Functions đã chạy trên production; frontend đã xác minh phiên bản.
- **Nhưng** chưa có bằng chứng từ phiên học sinh thật và trình duyệt thật cho các tiêu chí
  “đăng nhập thiết bị khác vẫn đồng bộ”, “refresh không mất dữ liệu”, “desktop & mobile”,
  “Dark/Light Mode”, và chưa có nội dung Boss để chơi thử.

Để nâng lên **PRODUCTION READY** cần:

1. Đăng nhập bằng tài khoản học sinh thật, đổi avatar, mở `/gamification/` xác nhận ảnh.
2. Trang bị khung ở Gamification → kiểm navbar/Hồ sơ/chat → F5 → thiết bị thứ hai.
3. Soạn một Boss trong Dashboard, chơi thử và xác nhận chấm điểm + XP.
4. Kiểm tra mobile + Light/Dark, xem Console/Network không có lỗi.

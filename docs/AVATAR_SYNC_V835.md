# Đồng bộ Avatar & Khung avatar — 8.3.5

## 1. Một nguồn sự thật

| Dữ liệu | Nguồn chính thức | Cache phía trình duyệt |
|---|---|---|
| Ảnh đại diện | `student_profiles.avatar_url` | `bakhiProfile.v1` (theo `student_id`) |
| Khung đang trang bị | `student_profiles.frame` | cùng kho trên |
| Khung sở hữu | `bakhi_owned_frames(student_id)` | danh sách badge + `bakhiOwnedFrames.v1.<studentId>` |
| Vật phẩm đã nhận | `user_inventory` | trong `state` của Gamification |

`student_profiles.frame` là **nguồn duy nhất** cho toàn website. `user_inventory.is_equipped`
vẫn được ghi khi trang bị khung (để kho vật phẩm biết món nào đang dùng) nhưng **không còn**
là nguồn hiển thị: Gamification đọc khung từ `BKProfile`.

## 2. Bốn trường hợp bắt buộc

### A. Đổi avatar trong Hồ sơ

`BKProfile.setAvatar()` → `save()` → phát `bkprofile` → `bk-cloud.js` đẩy lên
`student-profile` → `student_profiles.avatar_url`. Navbar, menu tài khoản, Hồ sơ, Chat và
hero Gamification vẽ lại. `bk-gamification.js` nghe `BKProfile.on()` và so sánh chữ ký
`độ_dài + 32 ký tự cuối + frame` để chỉ render lại khi thật sự đổi.

### B. Trang bị khung trong Gamification

`gamification-api` → `bk_gam_equip()` (một transaction):

1. Kiểm tra `user_inventory` có vật phẩm (chưa sở hữu → `NOT_OWNED`, HTTP 403).
2. Bỏ trang bị các vật phẩm cùng `kind`.
3. Đặt `is_equipped` cho vật phẩm.
4. Nếu `kind = 'frame'`: ghi `student_profiles.frame = reward_catalog.metadata.profile_frame`
   (hoặc `'none'` khi bỏ). Trigger `bakhi_profile_frame_guard` xác nhận quyền sở hữu.
5. Ghi `gamification_activity_logs` kèm `profile_frame`.

API trả `{ ok, kind, frame, state }`. Client gọi `BKProfile.applyServerFrame(frame)` (không
đẩy ngược lên máy chủ, không đổi `updatedAt`) rồi `BKShell.refresh()`.

### C. Tháo khung

`bk_gam_equip(..., false)` → `student_profiles.frame = 'none'`. Avatar, vật phẩm trong kho
và lịch sử XP không đổi. F5 không tự trang bị lại.

### D. Đổi tài khoản

`BKProfile` khoá hồ sơ theo `studentId`; khoá `local` chỉ dùng khi chưa nhận diện. Sự kiện
`bk:identity` của Gamification xoá `state`, chữ ký hồ sơ và tải lại từ máy chủ. QA
`avatar-sync-smoke` kiểm tra tài khoản B không thấy avatar/khung của tài khoản A.

## 3. Hiển thị

`BKProfile.avatarNode({ size, className, showFrame })` là component duy nhất, dùng cho
navbar, Hồ sơ, Chat và Gamification:

- `span.bk-avatar` kích thước cố định → không nhảy layout.
- Khung SVG `position:absolute; inset:0` với phần giữa trong suốt → không che mặt.
- Ảnh `object-fit: cover`, `border-radius: 50%` → không méo.
- Không ảnh → `.bk-avatar-fallback` với chữ cái đầu.
- Ảnh lỗi → trình duyệt giữ khung; alt/aria-label lấy từ tên hiển thị.
- Khung động tôn trọng `animateAvatarBorders` (`html.bk-frames-still`).

Hero Gamification thêm `.bkg-hero-avatar` (58×58) và dùng đúng component trên.

## 4. Bảo mật

- Trình duyệt không ghi trực tiếp `student_profiles`; mọi thay đổi đi qua Edge Function
  `student-profile` (phiên thiết bị) hoặc `gamification-api` (service role).
- `bakhi_profile_frame_guard` từ chối khung không sở hữu (`FRAME_NOT_OWNED`).
- `bakhi_owned_frames` chỉ đọc dữ liệu của chính học sinh.
- Không mở quyền đọc `user_inventory` của người khác; bảng người dùng chỉ có policy SELECT.
- Không có API nào cho phép sửa avatar/khung của học sinh khác.

## 5. Vì sao client không còn hạ khung máy chủ về “Mặc định”

Trước 8.3.5, `BKProfile.applyRemote()` hạ mọi khung không nằm trong danh sách badge cục bộ
về `none`. Danh sách đó không biết khung thưởng Gamification, nên sau khi đăng nhập thiết bị
khác, khung đúng bị mất trên giao diện.

Nay: khung **có trong danh mục** và do máy chủ trả về được giữ nguyên (máy chủ đã kiểm tra
quyền); khung **không tồn tại** trong `BKProfile.frames` vẫn bị hạ về `none`. QA
`badges-smoke` kiểm tra cả hai vế.

## 6. Kiểm thử

- `tools/qa/avatar-sync-smoke.js` — 16 ca: hero có ảnh/khung, đổi avatar vẽ lại, trang bị
  khung ghi hồ sơ, bỏ khung giữ avatar, khung ngoài badge, đổi tài khoản, khung thưởng
  trang bị được từ Hồ sơ.
- `tools/qa/gamification-db-check.js` — XA42–XA45 trên production (rollback): trang bị
  khung → `student_profiles.frame = wreath`, `bakhi_owned_frames` có `wreath`, bỏ khung →
  `none`, vật phẩm vẫn trong kho.

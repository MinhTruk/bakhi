# Kiểm tra hệ thống trước khi phát hành 8.3.5

Ngày kiểm tra: 2026-11-21 · Phiên bản nền thực tế: **8.3.1** (`bk-version.js`,
`APP_VERSION` của `bk-devboard.js`, `SERVER_VERSION` của `admin-actions`, 123 trang HTML
đang dùng `?v=8.3.1`). Không có thay đổi chưa commit trong working tree.

## 1. Phiên bản & triển khai

| Hạng mục | Trạng thái trước 8.3.5 |
|---|---|
| `assets/bakhi/bk-version.js` | `app: '8.3.1'` |
| `bk-devboard.js` → `APP_VERSION` | `8.3.1` |
| `supabase/functions/admin-actions` → `SERVER_VERSION` | `8.3.1` (đã deploy) |
| `supabase/functions/gamification-api` | đã deploy bản 8.3.1 |
| Migrations | mới nhất `20261209000000_bakhi_v830_gamification.sql` |
| Service Worker | không có (site tĩnh, không build) |
| Cache busting | `?v=` trên toàn bộ thẻ script/CSS của `assets/bakhi` |

## 2. Avatar — nơi hiển thị và nguồn dữ liệu

Nơi dùng avatar: `bk-shell.js` (navbar + menu tài khoản), `bk-profile-ui.js` (trang Hồ sơ
và tab Hồ sơ trong Cài đặt), `bk-profile.js` (`avatarNode()` dùng chung), `bk-chat.js`,
`bk-devboard.js` (bảng học sinh, `profile.avatar_url`), `bk-founder.js` (tồn kho khung),
`bk-gamification.js` (hero trang Tiến trình).

Nguồn dữ liệu trước 8.3.5:

| Dữ liệu | Nơi lưu chính thức | Ghi chú |
|---|---|---|
| Ảnh đại diện | `student_profiles.avatar_url` (Supabase) | `BKProfile` giữ cache `bakhiProfile.v1`; `bk-cloud.js` đẩy/pull qua `student-profile` |
| Khung đang dùng (toàn site) | `student_profiles.frame` + trigger `bakhi_profile_frame_guard` | Danh sách hợp lệ do `bakhi_owned_frames` quyết định (khung cơ bản + khung thưởng badge) |
| Khung đang dùng (Gamification) | `user_inventory.is_equipped` (kind = `frame`) | Do `bk_gam_equip` ghi |
| Vật phẩm khung của Gamification | `reward_catalog` (`frame-laurel`, `frame-ember`) | Không có ánh xạ sang khung hồ sơ |

## 3. Nguyên nhân gốc tìm được

### 3.1. Avatar trong Gamification không đồng bộ

`bk-gamification.js` dựng hero bằng:

```js
var avatar = el('div', 'bkg-avatar');
avatar.appendChild(el('span', null, initial));   // chỉ chữ cái đầu
```

Trang Tiến trình **không đọc `BKProfile`**, nên không bao giờ hiển thị ảnh đại diện thật.
Đây là lỗi hiển thị, không phải lỗi đồng bộ dữ liệu: `student_profiles.avatar_url` vẫn đúng.

### 3.2. Khung avatar không đồng bộ giữa Gamification và phần còn lại

Có **hai nguồn sự thật** cho cùng một khái niệm “khung đang trang bị”:

- `student_profiles.frame` — navbar, Hồ sơ, Chat, Administrator đọc.
- `user_inventory.is_equipped` — Gamification đọc.

`bk_gam_equip` chỉ cập nhật vế thứ hai, nên bấm “Dùng” một khung trong Tiến trình **không
đổi** navbar/hồ sơ. Ngược lại, trang bị ở Hồ sơ không cập nhật kho vật phẩm, nên Tiến trình
vẫn hiện “Đã sở hữu”.

Ngoài ra `bakhi_owned_frames` chỉ đọc `student_badges`, nên hai khung thưởng của
Gamification (`frame-laurel`, `frame-ember`) **không thể** trang bị ở Hồ sơ dù đã sở hữu
(trigger `bakhi_profile_frame_guard` từ chối với `FRAME_NOT_OWNED`).

### 3.3. Rủi ro cache khi đổi tài khoản

`BKProfile.readAll()` khoá hồ sơ theo `studentId`; khi chưa nhận diện dùng khoá `local`.
`applyRemote` cũ hạ khung không nằm trong danh sách badge cục bộ về `none`, nên sau khi
đăng nhập thiết bị khác, khung thưởng Gamification bị mất trên giao diện dù máy chủ vẫn giữ.

## 4. Founder / Administrator Dashboard — tab Thành tích & Tiến trình

Mã nguồn: `assets/bakhi/bk-devboard-gamification.js` (639 dòng) — tab **Tiến trình** trong
Administrator/Founder Dashboard; `bk-founder.js` tab **Thành tích** chỉ trao badge/khung.

Trước 8.3.5, biểu mẫu bắt người quản trị tự nhập:

- `Mã` (`ach-vi-du`, `frame-bac`, `knowledge-1`…) — không có gợi ý, gõ sai là tạo bản ghi mới.
- `Nhóm`, `Độ hiếm`, `Chỉ số` dưới dạng ô chữ tự do (`quiz | reading | revision…`), dễ nhập
  giá trị không tồn tại (bảng chỉ chấp nhận `learning|practice|revision|consistency|mastery`).
- Điều kiện, phần thưởng, thứ tự kỹ thuật trộn lẫn với nội dung.
- Không có xem trước, không phát hiện mã trùng, không có hành động Lưu trữ/Xóa.
- Boss: tự nhập `slug`, tự nhập chuỗi ISO cho `closes_at`, không xem trước.

Trường **bắt buộc** với người quản trị: tên, mô tả, biểu tượng, nhóm, độ hiếm, điều kiện,
mốc, phần thưởng, trạng thái. Trường **có thể tự sinh**: mã, thứ tự, thời điểm tạo, người
tạo, phiên bản.

## 5. Kết luận audit

1. Sửa hiển thị avatar: dùng chung `BKProfile.avatarNode()`.
2. Hợp nhất khung về `student_profiles.frame`; `bk_gam_equip` ghi hồ sơ trong cùng
   transaction; mở rộng `bakhi_owned_frames` cho khung thưởng Gamification.
3. Không hạ khung do máy chủ trả về; chỉ hạ khung không tồn tại trong danh mục.
4. Viết lại biểu mẫu quản trị: mã tự sinh, chống trùng, xem trước, Cài đặt nâng cao,
   tiếng Việt dễ hiểu, có Lưu trữ/Xóa an toàn.
5. Không tạo bảng mới, không xoá dữ liệu, không nới quyền RLS.

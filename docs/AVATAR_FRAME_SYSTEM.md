# Hệ thống khung Avatar

## 1. Danh mục khung

`assets/bakhi/bk-profile.js` → `FRAMES` gồm **50 khung**, vẽ bằng SVG path, phần trung tâm
trong suốt:

| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| Khung thường | 27 | `none`, `leaf`, `sakura`, `sunflower`, `wreath`, `ear-cat`… |
| Developer | 2 | `dev-aurora`, `dev-void` |
| Founder | 21 | mỗi badge Founder một khung riêng (`founder`, `founder-yin-yang`…) |

Mỗi khung có `id`, `name`, `tier`, `rarity`, `ring`, `orn` (hoạ tiết), có thể có `art`
(bộ vẽ bespoke), `anim`, `desc`, `howTo`.

## 2. Quyền sở hữu

`bakhi_owned_frames(p_student)` (Postgres) trả về hợp của:

1. Khung cơ bản: `none`, `leaf`.
2. Khung thưởng badge đã xác minh (`student_badges` → `bakhi_badge_frames`, **58 ánh xạ**).
3. **8.3.5:** khung nhận qua kho vật phẩm Gamification —
   `user_inventory` ⋈ `reward_catalog` với `kind = 'frame'` và
   `metadata ->> 'profile_frame'`.
4. **8.3.6:** khung đang trang bị trong `student_profiles.frame` — giữ nguyên khi nâng cấp
   để không bao giờ biến khung hợp lệ thành “chưa mở”.

> **Bài học 8.3.6.** Bản 8.3.5 thay hàm này bằng danh sách 21 khung viết cứng, làm toàn bộ
> khung Founder bị coi là chưa mở và hồ sơ bị từ chối với thông báo “Khung avatar chưa mở”.
> Không được viết cứng danh sách khung: luôn đọc bảng ánh xạ. Trang `/gamification/` cũng
> phải nạp `bk-profile.js` + `bk-badges.js` trước `bk-gamification.js`.

Ánh xạ vật phẩm → khung hồ sơ nằm trong `reward_catalog.metadata.profile_frame`:

| Vật phẩm | Khung hồ sơ |
|---|---|
| `frame-laurel` | `wreath` |
| `frame-ember` | `infernal` |
| vật phẩm có id trùng khung (`leaf`, `crown`, `sakura`…) | chính id đó |

Quản trị viên đặt ánh xạ này ở trường **“Khung hồ sơ tương ứng”** khi tạo/sửa vật phẩm loại
“Khung avatar”.

## 3. Ghi trạng thái trang bị

Hai đường ghi, cùng một đích `student_profiles.frame`:

- **Hồ sơ / Cài đặt:** `BKProfile.equipFrame(id)` → kiểm tra `canEquip` → `save({ frame })`
  → `bk-cloud` đẩy qua `student-profile` → trigger kiểm tra lần cuối.
- **Gamification:** `gamification-api` action `equip` → `bk_gam_equip` ghi
  `user_inventory.is_equipped` **và** `student_profiles.frame` trong cùng transaction.

Trigger `bakhi_profile_frame_guard` (migration 20261119000000) chặn mọi giá trị không nằm
trong `bakhi_owned_frames`, kể cả khi gọi trực tiếp.

## 4. Hiển thị

`BKProfile.avatarNode()` chèn khung trước ảnh:

```
span.bk-avatar[data-frame][data-tier]
├── svg.bk-avatar-frame-svg   (position:absolute, inset:0, pointer-events:none)
└── img.bk-avatar-img | span.bk-avatar-fallback
```

Quy tắc:

- Khung và ảnh cùng một hộp vuông; khung canh giữa bằng `inset: 0`.
- Vùng giữa khung trong suốt → không che nội dung khuôn mặt.
- Ảnh `object-fit: cover` → không méo, không tràn.
- Khung không làm thay đổi kích thước layout (mọi thứ absolute bên trong).
- Kích thước hỗ trợ: 24, 36, 46, 58, 92 px (navbar, menu, lưới chọn, hero, hộp chi tiết).
- Sáng/tối: khung dùng biến `--bk-avatar-ring` + màu path riêng, không phụ thuộc nền.
- Giảm chuyển động: `html.bk-frames-still` tắt animation toàn site.

## 5. Bỏ khung và đổi tài khoản

- Bỏ khung chỉ đặt `frame = 'none'`; ảnh, vật phẩm, lịch sử không đổi.
- Kho hồ sơ khoá theo `student_id`; không dùng dữ liệu của tài khoản trước.
- Khi chưa nhận diện, khoá `local` chỉ là bản nháp trên thiết bị và không đẩy lên máy chủ.

## 6. Kiểm thử liên quan

`tools/qa/shell-smoke.js` (danh mục 50 khung, chặn khung chưa mở),
`tools/qa/badges-smoke.js` (ánh xạ badge → khung, SQL khớp danh mục),
`tools/qa/avatar-sync-smoke.js` (đồng bộ hai chiều),
`tools/qa/gamification-db-check.js` (trigger + `bakhi_owned_frames` trên production).

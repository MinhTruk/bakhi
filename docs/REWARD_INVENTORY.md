# PHẦN THƯỞNG & KHO VẬT PHẨM (v8.3.0)

## 1. Danh mục

`reward_catalog`: `id`, `kind`, `name`, `description`, `icon`, `rarity`,
`metadata`, `is_active`, `sort_order`.

`kind`: `badge`, `title`, `frame`, `theme`, `background`, `decoration`, `xp_bonus`.

Seed hiện tại (6): `frame-laurel`, `frame-ember`, `theme-dawn`, `theme-midnight`,
`deco-quill`, `title-scholar`.

Phần thưởng chỉ là **trang trí**: không tạo lợi thế trong học tập, không mở khoá
đáp án, không tăng điểm.

## 2. Kho

`user_inventory`: `student_id`, `item_id`, `source`, `is_equipped`, `metadata`,
`acquired_at`. Ràng buộc `unique(student_id, item_id)` — không nhận trùng.

- Cấp vật phẩm: `bk_gam_grant_item()` chỉ khi `item_id` có trong danh mục đang bật.
- Trang bị: `bk_gam_equip()` kiểm tra quyền sở hữu; mỗi `kind` chỉ một vật phẩm
  được trang bị cùng lúc.
- Trình duyệt không thể thêm vật phẩm: bảng chỉ có policy SELECT.

## 3. Hiển thị

- Trang `/gamification/`: khung avatar đổi viền theo `frame` đang dùng, chip danh
  hiệu theo `title`, icon theo `decoration`. Đây là hiển thị **trong trang tiến trình**;
  hồ sơ/badge/title hiện có không bị thay đổi.
- Danh mục hiển thị cả vật phẩm chưa sở hữu (mờ) để người học biết cách đạt.
- Nút "Dùng"/"Bỏ dùng" gọi `equip`; trạng thái đồng bộ đa thiết bị.

## 4. Bảo toàn hệ cũ

Badge và Title của 8.2.0 nằm ở hệ riêng (`bk-badges.js`, `bk-titles.js`, bảng
`titles`). 8.3.0 **không** đọc/ghi các bảng đó, không đổi id, không thu hồi gì.
Một vật phẩm `kind = 'badge'` trong danh mục chỉ là tham chiếu hiển thị, không
cấp badge thật — tránh hai nguồn sự thật.

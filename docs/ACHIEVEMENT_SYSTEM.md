# HỆ THỐNG THÀNH TỰU (v8.3.0)

## 1. Phân biệt rõ

| Khái niệm | Nơi lưu | Ai cấp |
|---|---|---|
| **Achievement** | `achievement_defs` + `user_achievements` | Máy chủ, khi chỉ số đạt điều kiện |
| **Badge** | `bk-badges.js`, `bakhiBadges.v1`, bảng trao tay | Hệ badge hiện có (giữ nguyên) |
| **Title** | `bk-titles.js` + bảng `titles` | Hệ danh hiệu hiện có (giữ nguyên) |
| **Reward** | `reward_catalog` | Khi mở thành tựu/node/nhiệm vụ/Boss |
| **Collection** | `user_inventory` + `user_achievements` | Hiển thị ở trang tiến trình |

8.3.0 **không** tạo bảng badge/title mới. Thành tựu 8.3.0 là lớp điều kiện phía
máy chủ, đọc chỉ số từ sổ XP; badge/title cũ vẫn hoạt động độc lập.

## 2. Mô hình dữ liệu

`achievement_defs`:

- `id` (duy nhất), `name`, `description`, `icon`
- `rarity`: `common | uncommon | rare | epic | legendary`
- `category`: `learning | quiz | reading | listening | revision | consistency | skill | boss | milestone | event`
- `conditions`: mảng `[{metric, target}]` — **tất cả** phải đạt
- `stages`: số bậc (1–10); bậc `n` cần `target × n`
- `reward`: `{items: ["frame-laurel", ...]}`
- `is_hidden`, `is_repeatable`, `is_active`, `sort_order`

## 3. Chỉ số dùng được

`quiz_completed`, `lesson_study`, `listening_completed`, `revision_session`,
`mistake_mastered`, `goal_completed`, `boss_passed`, `boss_attempts`, `level`,
`xp_total`, `distinct_active_days`, `streak_days`, `skill_nodes_completed`,
`achievements_unlocked`, `inventory_count`.

Tất cả suy ra từ dữ liệu máy chủ. Không dùng dữ liệu do client gửi (ví dụ độ chính
xác trong localStorage) để mở thành tựu.

## 4. Seed (17 định nghĩa)

Ví dụ: `ach-first-quiz` (1 quiz), `ach-quiz-10`, `ach-revision-20`,
`ach-mastery-50` (50 câu sổ tay), `ach-streak-7` (thưởng `theme-midnight`),
`ach-boss-5`, `ach-level-10`, `ach-hidden-early` (ẩn, chỉ hiện sau khi mở).

## 5. Mở khoá

`bk_gam_evaluate()` chạy sau mỗi sự kiện:

1. Tính `progress` = min trên các điều kiện (theo bậc).
2. Ghi/ cập nhật `user_achievements` (tiến độ chỉ tăng).
3. Khi đủ 100%: đặt `unlocked_at`, ghi audit, cấp XP `achievement_reward`
   (idempotency `ach:<id>:<stage>`), cấp vật phẩm trong `reward.items`.
4. Không bao giờ cấp trùng một bậc: khoá chính `(student_id, achievement_id, stage)`.

## 6. Giao diện bộ sưu tập

- Lọc: tất cả / đã mở / chưa mở; tìm theo tên và mô tả.
- Thành tựu ẩn chỉ hiện khi đã mở.
- Mỗi thẻ có thanh tiến trình, độ hiếm, bậc, ngày mở khoá.
- Hiệu ứng mở khoá là thông báo nổi nhẹ, tắt được; không chặn thao tác học.
- Màu độ hiếm chỉ là trang trí, trạng thái luôn có nhãn chữ.

## 7. Quản trị

Admin → Tiến trình → Thành tựu: tạo/sửa định nghĩa (mã, tên, nhóm, độ hiếm,
chỉ số, mốc, số bậc, vật phẩm, ẩn/bật). Không có thao tác "mở thành tựu cho học sinh"
— điều kiện luôn do máy chủ tính.

# Gamification 8.3.8 — Cây kỹ năng, trao tặng và đồng bộ thành tựu

Tài liệu vận hành cho bản 8.3.8. Đọc kèm
[GAMIFICATION_ARCHITECTURE.md](GAMIFICATION_ARCHITECTURE.md),
[XP_LEVEL_SYSTEM.md](XP_LEVEL_SYSTEM.md) và
[GAMIFICATION_ADMIN_V836.md](GAMIFICATION_ADMIN_V836.md).

## 1. Lỗi đã sửa: thành tựu không mở sau khi buff

`bk_gam_set_level` (đặt cấp trực tiếp) và `bk_gam_adjust` (buff/trừ XP) trước đây chỉ ghi
`user_progression` rồi kết thúc. Reward Engine chỉ chạy trong `bk_gam_award`, nên thành
tựu mốc cấp (`ach-level-*`, `ach-xp-*`) không bao giờ được trao khi Founder can thiệp.

Nay cả hai hàm gọi `bk_gam_evaluate(p_student, 0)` **trong cùng transaction**, sau khi đã
ghi cấp/XP:

- Buff 1 cấp → đánh giá đúng mốc vừa đạt.
- Buff nhiều cấp một lần → đánh giá toàn bộ mốc đã vượt, không bỏ sót.
- Đã sở hữu thành tựu → `bk_gam_grant_achievement` bỏ qua, không nhân bản, không cộng XP
  hai lần.
- Điều kiện kết hợp (cấp + nhiệm vụ) → chỉ trao khi mọi điều kiện đạt; chỉ số
  `missions_completed` đếm số nhiệm vụ khác nhau đã hoàn thành ít nhất một lần.

Kiểm chứng bằng transaction rollback trên production (không để lại dữ liệu):

| Kịch bản | Kết quả |
|---|---|
| `bk_gam_set_level(…, 5)` | mở `ach-level-5` |
| buff +20.000 XP từ cấp 5 | lên cấp 14, mở `ach-level-10`, `ach-xp-1000`, `ach-xp-10000` |
| gọi lại lần hai | 0 thành tựu mới (không trùng) |
| điều kiện cấp + nhiệm vụ | chỉ mở khi đủ cả hai |

## 2. Điều kiện cây kỹ năng

`skill_tree_nodes` được bổ sung:

| Cột | Ý nghĩa |
|---|---|
| `min_level` | Cấp tối thiểu |
| `required_missions` | Mã nhiệm vụ bắt buộc (mảng) |
| `required_achievements` | Mã thành tựu bắt buộc (mảng) |
| `requires` | Node tiên quyết (đã có từ trước, nay xét cùng lúc) |
| `pos_x`, `pos_y` | Toạ độ trên sơ đồ |
| `granted`, `granted_by`, `granted_at` | Dấu Founder cấp trọn cây (không cộng XP) |

Nhánh nằm ở bảng mới `skill_branches` (`id`, `name`, `icon`, `color`, `sort_order`,
`archived`), seed 5 nhánh cũ để dữ liệu đang chạy giữ nguyên.

Quy tắc mở khoá: `bk_gam_node_blockers(student, node)` trả mảng điều kiện còn thiếu
(`level`, `mission`, `achievement`, `node`, `metric`). `bk_gam_evaluate` chỉ đặt
`status = 'completed'` khi mảng rỗng. Client hiển thị đúng mảng này, không tự suy ra.

### Cấu hình an toàn

- Máy chủ từ chối node có `requires` trỏ vào chính nó hoặc tạo chu trình (`hasCycle`).
- `admin.skilltree.validate` gọi `bk_gam_tree_issues` để liệt kê: vòng lặp, `requires`
  không tồn tại, node không có nhánh hợp lệ, node không thể tới từ node gốc.
- Xoá node đã có người hoàn thành → chuyển sang lưu trữ (`archived`), không xoá dữ liệu.

## 3. Founder trao tặng

| Chức năng | Action | Hàm |
|---|---|---|
| Xem trước cây | `admin.skilltree.preview` | đếm node đã xong / còn lại |
| Cấp trọn cây | `admin.skilltree.grant` (`confirm: true`) | `bk_gam_grant_skill_tree` |
| Kho vật phẩm | `admin.items.catalog` | `gamification_rewards` + `user_inventory.quantity` |
| Xem trước vật phẩm | `admin.items.preview` | trước/sau theo `max_quantity` |
| Trao vật phẩm | `admin.items.grant` | `bk_gam_grant_items` |
| Bộ sưu tập | `admin.achievements.catalog` | `achievement_defs` + `student_achievements` |
| Trao thành tựu | `admin.achievements.grant` | `bk_gam_grant_achievements` |
| Lịch sử | `admin.grants.history` | `gamification_activity_logs` |

Tất cả nằm trong danh sách `founderOnly` của `gamification-api`; scope lấy từ JWT ở máy
chủ (`scope !== 'founder'` → `403 FOUNDER_ONLY`). Không có đường nào để học sinh tự gọi.

`bk_gam_grant_items` ghi `user_inventory.quantity` và tôn trọng
`gamification_rewards.metadata.max_quantity`; phần vượt giới hạn trả về trong `skipped`.
`bk_gam_grant_achievements` bỏ qua thành tựu đã sở hữu và không cộng XP lần hai.
`bk_gam_grant_skill_tree` đánh dấu `granted`, giữ nguyên node đã hoàn thành, không cộng XP
node, và trao vật phẩm thưởng qua Reward Engine idempotent.

Badge Gamification được trao ở tab **Thành tích** (`bk-founder.js` →
`sectionGamificationBadges`) qua `founder.grantItem`, dùng đúng quy tắc bảo vệ badge hiện
có; không mở thêm đường vòng cho Administrator.

## 4. Giao diện

### Trang `/skills/`

`skills/index.html` + `assets/bakhi/bk-skills.js|css`:

- Sơ đồ SVG đặt node theo `pos_x/pos_y`, đường nối theo `requires`.
- Kéo để di chuyển, lăn chuột để zoom, nút phóng to/thu nhỏ/về giữa.
- Tìm kiếm theo tên/mô tả, lọc theo nhánh, đếm node theo trạng thái.
- Bấm node → bảng chi tiết: mô tả, cấp yêu cầu, nhiệm vụ, thành tựu, node tiên quyết,
  phần thưởng, tiến độ chỉ số, điều kiện còn thiếu.
- Trạng thái: đã mở, có thể mở, chưa đủ điều kiện, bị khoá bởi node khác.
- Có loading, empty, error, `no_session`; responsive; tôn trọng
  `prefers-reduced-motion`.

### Trang `/gamification/`

- Tab Cây kỹ năng nhúng sơ đồ gọn và liên kết sang `/skills/`.
- Bộ sưu tập thành tựu: lọc trạng thái/nhóm/độ hiếm, tìm kiếm; modal hiện `condition_detail`
  với tiến độ từng điều kiện, phần trăm và điều kiện còn thiếu.
- Kho vật phẩm: lưới, tìm kiếm, lọc loại/sở hữu, tải thêm, modal hiện số lượng, cách nhận,
  công dụng.

## 5. Kiểm thử

```
NODE_PATH=/tmp/bktest/node_modules node tools/qa/v838-gamification.js
```

Bài kiểm tra này chạy thật trong jsdom: `BKFounderGrants` gọi đúng
`admin.skilltree.preview` → `admin.skilltree.grant` (có `confirm: true`),
`admin.items.preview` → `admin.items.grant` (đúng mã và số lượng),
`admin.achievements.grant`; `BKSkills` dựng node/đường nối từ dữ liệu máy chủ và không
gọi mạng khi chưa nhận diện.

Các cổng liên quan: `gamification-smoke`, `gamification-security-smoke`,
`xp-level-integrity`, `gamification-navigation-smoke`, `gamification-progress-load-smoke`,
`founder-smoke`, `founder-achievement-smoke`, `v836-founder-gamification`,
`v837-founder-search`, `v838-gamification`.

## 6. Migration

`supabase/migrations/20261212000000_bakhi_v838_gamification_overhaul.sql`

- Tạo `skill_branches` + RLS (đọc cho người đã đăng nhập, ghi qua Edge Function).
- Thêm cột node/tiến trình/`quantity`, mở rộng `category` của thành tựu.
- Thêm `missions_completed` cho `bk_gam_metric`.
- Thay `bk_gam_evaluate`, `bk_gam_set_level`, `bk_gam_adjust`; thêm
  `bk_gam_node_blockers`, `bk_gam_grant_items`, `bk_gam_grant_achievements`,
  `bk_gam_grant_skill_tree`, `bk_gam_details`, `bk_gam_tree_issues`.
- Seed 8 node mới, toạ độ 15 node cũ, 18 vật phẩm, 17 thành tựu.

Migration chạy lại an toàn (`if not exists`, `on conflict do nothing`) và không xoá dữ
liệu. Đã dry-run bằng transaction rollback rồi apply production (HTTP 201).

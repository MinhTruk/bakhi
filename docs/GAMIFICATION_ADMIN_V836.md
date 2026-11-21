# Quản trị Gamification từ Founder Dashboard (8.3.6)

## 1. Vì sao có thay đổi này

Hai lỗi người dùng gặp ở 8.3.5:

1. **“Khung avatar chưa mở nên chưa đồng bộ được. Hãy chọn khung khác.”**
   Migration `20261210000000_bakhi_v835_avatar_frame_sync.sql` thay hàm
   `bakhi_owned_frames` bằng danh sách **21 khung viết cứng**. Trong khi đó
   `student_badges` → `bakhi_badge_frames` có **58 ánh xạ**, gồm toàn bộ khung
   Founder (`founder-genesis`, `founder-yin-yang`…). Hệ quả: hồ sơ đang trang bị khung
   Founder bị trigger `bakhi_profile_frame_guard` coi là chưa mở, lần đồng bộ kế tiếp
   bị từ chối và client hiện thông báo trên.
2. **Trang `/gamification/` không có avatar và khung.**
   Trang chỉ nạp `bk-core`, `bk-shell`, `bk-cloud`, `bk-gamification` — thiếu
   `bk-profile.js` và `bk-badges.js`. `BKProfile` không tồn tại nên hero rơi về chữ cái
   đầu và không có khung.

## 2. Đã sửa

| Hạng mục | Thay đổi |
|---|---|
| `bakhi_owned_frames` | Đọc lại `bakhi_badge_frames` (58 ánh xạ) + khung kho vật phẩm + **khung đang trang bị trong hồ sơ** (grandfather) |
| `/gamification/` | Nạp `bk-profile.js`, `bk-badges.js` trước `bk-gamification.js` |
| `bk-cloud.js` | Áp `frames` máy chủ trả về vào `BKProfile.setOwnedFrames`; báo lỗi khung **một lần** |
| `bk-profile.js` | `setOwnedFrames` **hợp nhất** hai nguồn khung thay vì ghi đè |

Kiểm chứng trên production (sau migration):

- `select count(*) from student_profiles sp where frame <> 'none' and frame <> all (bakhi_owned_frames(sp.student_id))` → **0**
- Hồ sơ Founder đang dùng `founder-genesis`/`founder` nhận lại **50 khung** sở hữu.

## 3. Tab Gamification trong Founder Dashboard

Đường dẫn: **Founder Dashboard → tab Gamification**.

### 3.1. Chọn đối tượng (dùng chung cho cả hai thao tác)

| Kiểu | Ý nghĩa |
|---|---|
| Toàn bộ học sinh | Mọi hồ sơ `students.is_active = true` |
| Một học sinh | Tìm theo tên/username, chọn đúng một hồ sơ |
| Theo khoảng cấp độ | Học sinh có `user_progression.level` trong `[min, max]` |

Mỗi thao tác đều có bước **Xem trước**: máy chủ đếm số người thực sự bị ảnh hưởng và trả
mẫu 8 hồ sơ. Chỉ sau khi xem trước mới xuất hiện nút xác nhận — không có thao tác hàng
loạt nào chạy ngay khi bấm.

### 3.2. Đặt cấp độ

- Cấp 1–100, bắt buộc lý do (≥ 3 ký tự), tối đa 300 học sinh mỗi lần.
- Máy chủ gọi `bk_gam_set_level`: đặt `total_xp = bk_gam_level_floor(level)` và ghi phần
  chênh lệch vào `xp_transactions` theo từng giao dịch ≤ 100.000 XP (ràng buộc của bảng).
- Nhờ vậy `bk_gam_admin_drift()` luôn rỗng — không có XP “ma”, không mất XP hợp lệ.
- Ghi `gamification_activity_logs` với `action = 'level_set'`.

### 3.3. Buff XP

- Hệ số **x1,1 – x10**, thời hạn **1 – 720 giờ**, tên buff tuỳ chọn.
- Lưu ở `gamification_xp_buffs` với `audience` (`all` | `student` | `level`).
- `bk_gam_award` nhân số XP của hoạt động bằng `bk_gam_active_buff(student)`; nhiều buff
  chồng nhau lấy **hệ số cao nhất**.
- Học sinh thấy băng “Đang nhân xN XP” ở đầu trang Tiến trình.
- “Kết thúc” chỉ tắt `is_active` — giữ nguyên khung thời gian để lịch sử đúng và không vi
  phạm ràng buộc `ends_at > starts_at`.

### 3.4. Bảo mật

- Bảng `gamification_xp_buffs`: RLS bật, `revoke` khỏi `public/anon/authenticated`; chỉ
  `service_role` đọc/ghi (tức chỉ Edge Function).
- Ba action `admin.level.set`, `admin.xp.buff`, `admin.xp.buff.end` kiểm tra
  `scope === 'founder'`; `admin.audience.preview` cho cả Administrator để xem trước.
- Mọi thao tác ghi `gamification_activity_logs` + `audit`.

## 4. API

| Action | Tham số | Kết quả |
|---|---|---|
| `admin.audience.preview` | `audience` | `{ count, sample[] }` |
| `admin.level.set` | `audience`, `level`, `reason` | `{ level, total, updated, failed[] }` |
| `admin.xp.buff` | `audience`, `multiplier`, `hours`, `label` | `{ id, ends_at }` |
| `admin.xp.buff.list` | — | `{ buffs[] }` kèm `is_live` |
| `admin.xp.buff.end` | `id` | `{ ok }` |

`bk_gam_state` (qua `gamification-api`) được chèn thêm `buffs[]` và `xp_buff`.

## 5. Kiểm thử

```bash
NODE_PATH=/tmp/bktest/node_modules node tools/qa/v836-founder-gamification.js   # 36 đạt
NODE_PATH=/tmp/bktest/node_modules node tools/qa/avatar-sync-smoke.js           # 16 đạt
SUPABASE_ACCESS_TOKEN=... node tools/qa/gamification-db-check.js                # 17 nhóm
```

`gamification-db-check` thêm nhóm 8.3.6 (rollback):

- XA46/XA46b: khung Founder của badge nằm trong danh sách sở hữu và trang bị được.
- XA47: `learn-lessons-15` mở khung `celestial` qua bảng ánh xạ.
- XA48–XA51: đặt cấp 9 đúng cấp/tổng XP, không lệch sổ.
- XA52–XA55: buff x2 nhân XP 10 → 20 cho đúng học sinh, ghi hệ số vào sổ.
- XA56/XA56b: buff hết hạn hoặc đã tắt không còn hiệu lực.
- XA57: `anon`/`authenticated` không có quyền trên bảng buff.
- Dữ liệu thật: mọi khung đang trang bị đều nằm trong danh sách sở hữu.

## 6. Giới hạn đã biết

- Một lần đặt cấp tối đa 300 học sinh; buff không giới hạn số người nhưng mỗi lần chỉ tạo
  một buff cho một đối tượng.
- Cấp tối đa đặt tay là 100 (công thức cấp độ vẫn hỗ trợ tới 1000 nếu XP tự tích luỹ).
- Chưa có giao diện huỷ hàng loạt buff đã tạo — chỉ kết thúc từng buff.

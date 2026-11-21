# HỆ THỐNG XP & CẤP ĐỘ (v8.3.0)

## 1. Nguồn XP

XP chỉ được cấp từ hoạt động học tập có giá trị, qua `bk_gam_award()`:

| Hoạt động | XP | Giới hạn/ngày |
|---|---:|---:|
| `quiz_completed` — hoàn thành bài quiz | 20 | 6 |
| `lesson_study` — học/đọc một bài | 10 | 6 |
| `listening_completed` — luyện nghe | 12 | 4 |
| `revision_session` — phiên ôn tập | 18 | 4 |
| `mistake_mastered` — xử lý câu sai | 8 | 12 |
| `goal_completed` — đạt mục tiêu | 25 | 2 |
| `boss_passed` — vượt thử thách (máy chủ cấp) | 60 | 2 |
| `skill_node` — hoàn thành node | 30 | 4 |
| `achievement_reward` — mở thành tựu | 20 | 10 |
| `mission_reward` — nhận thưởng nhiệm vụ | 40 | 6 |

Bảng này nằm trong `gamification_config.xp_rules` (một dòng duy nhất) và có thể
sửa ở Admin → Tiến trình → Cấu hình XP. Không có con số XP nào hardcode trong
mô-đun giao diện.

**Không** cấp XP cho: gửi chat, gửi báo cáo, đổi giao diện, mở menu, thao tác
lặp lại không có giá trị học tập.

## 2. Công thức cấp độ

XP cần để đi từ cấp `L` sang `L+1`:

```
xpToNext(L) = 100 + 60·(L−1) + 20·(L−1)²
```

Mốc tích luỹ: 100 (cấp 2), 280 (cấp 3), 580 (cấp 4), 1040 (cấp 5), 1800 (cấp 6)…

- Bản chuẩn: `public.bk_gam_level_floor(level)` và `public.bk_gam_level(total)`.
- Bản hiển thị: `BK.gamification.levelFromXp / levelFloor / progressOf`, có QA đối
  chiếu tự động với Postgres (`tools/qa/xp-level-integrity.js`).

Đường cong tăng dần nên người học không lên cấp chóng mặt khi lặp thao tác đơn giản;
giới hạn/ngày chặn farm.

## 3. Trạng thái cấp độ

`bk_gam_state()` trả về: `total_xp`, `level`, `level_xp`, `level_span`,
`next_level_xp`, `xp_remaining`, `progress_pct`.

## 4. Lên cấp

- Khi `bk_gam_award()` phát hiện cấp mới, ghi `gamification_activity_logs`
  (`action = 'level_up'`, `detail = {from, to, total_xp}`).
- Giao diện hiển thị hộp thoại một lần khi phát hiện cấp tăng giữa hai lần tải
  state; refresh không phát lại thông báo.
- Người học tắt được hiệu ứng/thông báo trong "Tuỳ chọn hiển thị" ở trang tiến trình
  (`bakhiGamificationPrefs.v1`). `prefers-reduced-motion` được tôn trọng.
- Lên cấp **không** làm gián đoạn bài đang làm: thông báo nổi, không modal chặn
  khi sự kiện đến từ hoạt động học tập (modal chỉ dùng khi state được tải lại).

## 5. Điều chỉnh XP

Chỉ Founder, qua `bk_gam_adjust()`:

- bắt buộc lý do ≥ 3 ký tự;
- ghi một dòng `xp_transactions` với `status = 'adjusted'`, `activity_type = 'admin_adjust'`;
- ghi `gamification_activity_logs` với actor và lý do;
- tổng XP không bao giờ âm.

## 6. Đối chiếu toàn vẹn

`public.bk_gam_admin_drift()` so `user_progression.total_xp` với `sum(xp_transactions.amount)`
và cấp độ lưu với cấp độ tính lại. QA tầng dữ liệu gọi hàm này và yêu cầu 0 dòng lệch.

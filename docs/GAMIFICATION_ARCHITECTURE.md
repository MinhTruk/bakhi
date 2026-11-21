# KIẾN TRÚC GAMIFICATION 2.0 (v8.3.0)

## 1. Nguyên tắc

1. **Supabase là nguồn sự thật.** XP, cấp độ, thành tựu, nhiệm vụ và kho vật phẩm
   nằm trong Postgres. localStorage chỉ giữ cache, tuỳ chọn và hàng đợi offline.
2. **Reward Engine chạy trong một transaction của Postgres.** Một sự kiện học tập
   được xử lý bởi các hàm `bk_gam_*`; nếu bất kỳ bước nào lỗi, toàn bộ giao dịch
   bị huỷ. Không có trạng thái "cộng XP xong nhưng mất thành tựu".
3. **Client không quyết định phần thưởng.** Trình duyệt chỉ gửi loại hoạt động,
   nguồn và khoá idempotency.
4. **Không hệ thống thứ hai.** Badge/Title/Profile/Analytics hiện có được giữ
   nguyên; gamification chỉ đọc chỉ số và tham chiếu danh mục.

## 2. Luồng một sự kiện

```
Trang bài học / Learning Center
  └─ BK.gamification.track(activity, sourceId)
       ├─ khoá idempotency = evt:<activity>:<hash(source)>:<ngày>   (hoặc không ngày)
       ├─ hàng đợi localStorage (tối đa 40) — mất mạng vẫn giữ
       └─ POST gamification-api { action: 'event', ... }
            └─ xác minh phiên thiết bị → student_id (service_role)
                 └─ bk_gam_award()      → ghi xp_transactions (+ chống trùng, giới hạn/ngày)
                 └─ bk_gam_evaluate()   → thành tựu, cây kỹ năng, tiến trình nhiệm vụ
            └─ trả { award, evaluation, state }
                 └─ UI cập nhật + thông báo lên cấp/thành tựu
```

## 3. Bảng dữ liệu (15)

| Bảng | Vai trò |
|---|---|
| `gamification_config` | Một dòng: `xp_rules`, `level_curve`, `feature_flags`, `season` |
| `xp_transactions` | Sổ giao dịch XP — nguồn sự thật duy nhất |
| `user_progression` | Tổng XP + cấp độ (suy ra, có hàm đối chiếu) |
| `skill_tree_nodes` / `user_skill_progress` | Định nghĩa node và tiến trình từng học sinh |
| `achievement_defs` / `user_achievements` | Định nghĩa thành tựu, tiến trình và thời điểm mở khoá |
| `mission_defs` / `user_missions` | Định nghĩa nhiệm vụ, nhiệm vụ theo chu kỳ của từng học sinh |
| `boss_challenges` / `boss_questions` / `boss_attempts` | Thử thách, ngân hàng câu hỏi (máy chủ) và lượt làm |
| `reward_catalog` / `user_inventory` | Danh mục vật phẩm và kho của học sinh |
| `gamification_activity_logs` | Audit: XP, lên cấp, mở thành tựu, điều chỉnh của quản trị |

## 4. Hàm Postgres

| Hàm | Việc |
|---|---|
| `bk_gam_level_floor(level)` / `bk_gam_level(total)` | Công thức cấp độ duy nhất |
| `bk_gam_metric(student, metric)` | Chỉ số suy ra (không lưu trùng) |
| `bk_gam_award(student, activity, source, key, depth)` | Ghi XP, chống trùng, giới hạn/ngày, phát hiện lên cấp |
| `bk_gam_grant_item(student, item, source)` | Cấp vật phẩm nếu có trong danh mục |
| `bk_gam_evaluate(student, depth)` | Mở thành tựu, cập nhật node, tiến trình nhiệm vụ |
| `bk_gam_sync_missions(student)` | Tạo nhiệm vụ ngày/tuần theo UTC, đánh dấu quá hạn |
| `bk_gam_claim(student, user_mission)` | Nhận thưởng một lần |
| `bk_gam_boss_start/submit` | Phát câu hỏi không kèm đáp án; chấm điểm và ghi lượt |
| `bk_gam_equip` | Trang bị vật phẩm đã sở hữu |
| `bk_gam_adjust` | Founder điều chỉnh XP, bắt buộc lý do, ghi audit |
| `bk_gam_state(student)` | Toàn bộ dữ liệu dashboard trong một lần gọi |
| `bk_gam_admin_drift()` | Đối chiếu tổng XP với sổ giao dịch |

Tất cả bị `revoke` khỏi `anon`/`authenticated`; chỉ `service_role` gọi được.

## 5. Edge Function

`supabase/functions/gamification-api/index.ts` — một cổng duy nhất:

- Học sinh: `state`, `event`, `mission.claim`, `boss.start`, `boss.submit`, `equip`, `history`.
- Quản trị (`x-admin-token`): `admin.overview`, `admin.config.get/set`,
  `admin.defs.list`, `admin.node.save`, `admin.achievement.save`, `admin.mission.save`,
  `admin.reward.save`, `admin.challenge.save/delete`, `admin.metrics`,
  `admin.students.list` (Founder), `admin.xp.adjust` (Founder), `admin.logs` (Founder).

Giới hạn tốc độ 240 request/phút/học sinh qua `bakhi_rate_limit`.

## 6. Mô-đun trình duyệt

| Tệp | Việc |
|---|---|
| `assets/bakhi/bk-gamification.js` | Theo dõi hoạt động, hàng đợi, gọi API, dựng dashboard |
| `assets/bakhi/bk-gamification.css` | Giao diện `.bkg-*`, tôn trọng `prefers-reduced-motion` |
| `gamification/index.html` | Trang tiến trình |
| `assets/bakhi/bk-devboard-gamification.js` | Tab quản trị (cấu hình, định nghĩa, Boss, Founder) |
| `tools/inject-gamification.js` | Chèn thẻ script (idempotent) vào 118 trang |

## 7. Điểm tích hợp

| Hoạt động | Nguồn thật | Cách ghi |
|---|---|---|
| Quiz | `bk-page.js` quét phản hồi, ≥3 câu | `quiz_completed` (mỗi bài/ngày) |
| Luyện nghe | tiêu đề/đường dẫn có "nghe/listening/audio" | `listening_completed` |
| Học/đọc bài | mở trang nội dung | `lesson_study` (mỗi bài/ngày) |
| Ôn tập | `bk-learning.js` kết thúc phiên | `revision_session` |
| Sổ tay câu sai | đánh dấu "Thành thạo" | `mistake_mastered` |
| Mục tiêu | đánh dấu đạt | `goal_completed` |
| Boss | máy chủ chấm | `boss_passed` do máy chủ cấp |

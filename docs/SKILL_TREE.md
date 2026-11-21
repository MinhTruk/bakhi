# CÂY KỸ NĂNG (v8.3.0)

## 1. Năm nhánh

| Nhánh | Ý nghĩa | Chỉ số chính |
|---|---|---|
| `knowledge` | Kiến thức: bài học, quiz, cột mốc | `lesson_study`, `quiz_completed` |
| `practice` | Luyện tập đều và bền | `quiz_completed`, `distinct_active_days` |
| `memory` | Ghi nhớ: ôn tập, xử lý câu sai | `revision_session`, `mistake_mastered` |
| `consistency` | Nhịp học ổn định | `distinct_active_days`, `streak_days` |
| `mastery` | Tinh thông: Boss, thành tựu | `boss_passed`, `achievements_unlocked` |

## 2. Node

Mỗi node (`skill_tree_nodes`) gồm: `id`, `branch`, `name`, `description`, `icon`,
`metric`, `target`, `requires` (mảng id node trước), `reward` (`{items: [...]}`),
`sort_order`, `is_active`.

Seed hiện tại: **15 node**, 3 node mỗi nhánh. Ví dụ:

- `knowledge-1` Nền tảng — 3 lượt học.
- `knowledge-3` Vững kiến thức — 15 bài quiz, thưởng `frame-laurel`.
- `memory-3` Làm chủ câu sai — 10 câu trong Sổ tay câu sai.
- `consistency-3` Không gián đoạn — chuỗi 7 ngày, thưởng `theme-dawn`.
- `mastery-3` Tinh thông — 10 thành tựu, thưởng `title-scholar`.

## 3. Trạng thái

`locked` → `available` → `in_progress` → `completed`.

- `completed`: chỉ số đạt mốc **và** mọi node trong `requires` đã hoàn thành.
- `in_progress`: đã có tiến độ, hoặc đủ chỉ số nhưng còn node trước chưa xong.
- `available`: đủ điều kiện mở nhưng chưa có tiến độ.
- `locked`: còn node trước chưa hoàn thành.

Trạng thái đã `completed` **không bao giờ bị hạ** (hàm giữ `completed_at`).

## 4. Máy chủ quyết định

`bk_gam_evaluate()` tính lại toàn bộ node từ chỉ số thật sau mỗi sự kiện. Không có
API nào cho client đặt `status` hay `progress`. Trình duyệt chỉ đọc qua
`bk_gam_state()` / RLS SELECT của chính mình.

## 5. Giao diện

- Desktop: lưới theo nhánh, mỗi nhánh là một cột có thanh tiến trình riêng.
- Mobile: một cột, không tràn ngang; node xếp dọc.
- Node khoá hiển thị rõ **node nào cần hoàn thành trước**; node đang làm hiển thị
  `giá trị hiện tại / mốc` và tên chỉ số bằng tiếng Việt.
- Toàn bộ là danh sách ngữ nghĩa (`ul/li`), có `aria` cho thanh tiến trình và
  trạng thái được viết bằng chữ, không chỉ bằng màu.

## 6. Mở rộng

Thêm node bằng Admin → Tiến trình → Cây kỹ năng (mã, nhánh, chỉ số, mốc, node cần
trước, vật phẩm thưởng). Không cần sửa code. Nhánh mới cần thêm vào danh sách
`BRANCHES` trong `bk-gamification.js` và ràng buộc `check` trong migration.

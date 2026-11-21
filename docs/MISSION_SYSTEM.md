# HỆ THỐNG NHIỆM VỤ (v8.3.0)

## 1. Chu kỳ

- **Ngày**: `period_key = YYYY-MM-DD` theo **UTC**, hết hạn 00:00 UTC ngày kế tiếp.
- **Tuần**: `period_key = W<IYYY-IW>` theo ISO, hết hạn đầu tuần kế tiếp (UTC).
- Máy chủ lưu `expires_at` dạng `timestamptz`; giao diện hiển thị theo giờ máy
  người học.
- Đổi múi giờ/thiết bị không tạo nhiệm vụ trùng: khoá duy nhất
  `(student_id, mission_id, period_key)`.

## 2. Cấu trúc

`mission_defs`: `id`, `name`, `description`, `category`, `difficulty`,
`metric`, `target`, `cadence` (`daily|weekly`), `reward` (`{xp, items}`),
`min_level`, `is_active`, `sort_order`.

`user_missions`: bản giao cho từng học sinh, có `progress`, `target`, `status`,
`assigned_at`, `expires_at`, `completed_at`, `claimed_at`, `reward`.

Trạng thái: `available → in_progress → completed → claimed`, hoặc `expired`.

## 3. Seed (9 định nghĩa)

- Ngày: 1 quiz; 1 phiên ôn; 1 lượt học; 2 câu sổ tay; 3 quiz (mở từ cấp 3).
- Tuần: 5 quiz; 3 phiên ôn; 3 lượt học; 4 ngày hoạt động (mở từ cấp 2).

## 4. Vòng đời

1. `state` gọi `bk_gam_sync_missions()`: đánh dấu nhiệm vụ quá hạn, tạo nhiệm vụ
   của chu kỳ hiện tại cho định nghĩa có `min_level ≤ cấp hiện tại`.
2. Mỗi sự kiện, `bk_gam_evaluate()` cập nhật `progress` từ chỉ số thật; đủ mốc thì
   `status = 'completed'`.
3. Người học bấm **Nhận thưởng** → `mission.claim` → `bk_gam_claim()`:
   chỉ nhận khi `completed`; đặt `claimed_at`; cộng XP `mission_reward`
   (idempotency `mission:<user_mission_id>`) và cấp vật phẩm.
4. Lịch sử (`mission_history`) giữ 30 mục gần nhất gồm cả `claimed` và `expired`.

## 5. Quy tắc nội dung

- Không nhiệm vụ yêu cầu thao tác vô nghĩa.
- Không yêu cầu truy cập mỗi ngày để "giữ thưởng": nhiệm vụ quá hạn chỉ mất chu kỳ,
  không trừ XP, không phạt.
- Không nhiệm vụ bất khả thi: mốc đều là hoạt động học bình thường; nhiệm vụ khó
  chỉ mở khi người học đã đủ cấp.
- Không yêu cầu trả tiền; không có nhiệm vụ "mời bạn bè".
- Thưởng chỉ cấp sau khi máy chủ xác nhận hoàn thành.

## 6. Quản trị

Admin → Tiến trình → Nhiệm vụ. `min_level` cho phép nhiệm vụ khó xuất hiện muộn
hơn. Tắt một định nghĩa (`is_active = false`) không xoá lịch sử đã giao.

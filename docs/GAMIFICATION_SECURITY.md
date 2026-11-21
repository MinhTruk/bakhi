# BẢO MẬT GAMIFICATION (v8.3.0)

## 1. Mô hình quyền

| Đối tượng | Đọc | Ghi |
|---|---|---|
| `anon` | Không bảng gamification nào | Không |
| `authenticated` (học sinh) | Chỉ dòng của mình qua RLS `bakhi_current_student_id()`; định nghĩa đang bật | **Không có policy ghi** |
| `service_role` (Edge Function) | Tất cả | Chỉ qua hàm `bk_gam_*` |
| Administrator | Qua `gamification-api` với `x-admin-token` | Cấu hình, định nghĩa, thử thách |
| Founder | Như Administrator + `admin.xp.adjust`, `admin.logs`, `admin.students.list` | Điều chỉnh XP có audit |

- `gamification_config` bị `revoke` khỏi `anon`/`authenticated`; bật RLS, không policy.
- `boss_questions` bị `revoke` và không có policy: trình duyệt không đọc được đáp án.
- `gamification_activity_logs` không cấp quyền đọc cho học sinh.
- Tất cả hàm `bk_gam_*` bị `revoke` khỏi `public`, `anon`, `authenticated`; chỉ
  `service_role` có `execute`.

## 2. Xác thực

- Học sinh: Anonymous Auth của thiết bị → `callerUserId()` → `student_devices` →
  `students.is_active`. **Không nhận `student_id` từ client.**
- Quản trị: `x-admin-token` → SHA-256 → `admin_sessions.token_hash`, kiểm tra hạn,
  cập nhật `last_used_at`. `scope` đọc từ bảng, không tin client.
- Function quản trị dùng chung `adminScope()`; hành động Founder kiểm tra
  `scope === 'founder'` ở máy chủ (giao diện chỉ ẩn nút).

## 3. Toàn vẹn XP

- `unique(student_id, idempotency_key)` chặn cộng trùng khi refresh/retry.
- `activity_type` phải nằm trong `xp_rules`; số XP lấy từ cấu hình, không từ request.
- Giới hạn `daily_cap` theo ngày UTC cho từng hoạt động.
- `amount <> 0`, `total_xp >= 0`, `check` trên `status`.
- `bk_gam_admin_drift()` phát hiện lệch giữa sổ và bảng tiến trình.
- Điều chỉnh XP chỉ Founder, bắt buộc lý do, ghi cả `xp_transactions` và audit log.

## 4. Chống gian lận Boss

- Câu hỏi trả về không có `correct_index`.
- `bk_gam_boss_submit()` chấm trong Postgres; client chỉ gửi lựa chọn.
- Khoá idempotency theo lượt; `max_attempts`; cửa sổ mở/đóng.
- Tối đa 50 câu/lượt; Edge Function lọc `question_id` hợp lệ và `choice` 0–9.

## 5. Rate limit & lỗi

- 240 request/phút/học sinh qua `bakhi_rate_limit`; vượt → 429.
- Lỗi máy chủ trả mã + thông báo tiếng Việt, không lộ chi tiết SQL.
- Client giữ hàng đợi khi lỗi 5xx/mạng, bỏ sự kiện khi 4xx (sự kiện hỏng).

## 6. Bí mật

- Chỉ `sb_publishable_...` nằm trong `bk-supabase.config.js`.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ ở Edge Function Secrets.
- QA tự động chặn `service_role` trong mã trình duyệt
  (`tools/qa/gamification-security-smoke.js`).

## 7. Kiểm tra đã chạy

- `gamification-db-check.js` (thật, trên project): 0 policy ghi, `boss_questions`
  không có grant, `anon` không có quyền, mọi policy SELECT đều giới hạn theo học sinh.
- `gamification-security-smoke.js`: 30/30.
- Đối chiếu drift: 0 dòng.

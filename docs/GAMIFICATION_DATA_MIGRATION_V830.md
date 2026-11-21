# MIGRATION DỮ LIỆU GAMIFICATION (v8.3.0)

## 1. Nguyên tắc

`AUDIT → DESIGN → MIGRATE → VALIDATE → SWITCH → REMOVE LEGACY`

Với 8.3.0, bước "migrate" là **tạo mới**, không phải chuyển đổi: trước đó chưa có
XP/level/mission/boss/inventory. Vì vậy **không có dữ liệu tiến trình cũ nào bị xoá
hay ghi đè**.

## 2. Dữ liệu được giữ nguyên

| Dữ liệu | Vị trí | Trạng thái |
|---|---|---|
| Tiến trình học tập | `student_progress` (`bakhiLearn.v1`) | Không đổi |
| Sổ tay câu sai | khoá `review` | Không đổi |
| Kế hoạch / mục tiêu / phiên ôn | `plans`, `goals`, `revisionSessions` | Không đổi |
| Badge + badge trao tay | `bakhiBadges.v1.*`, bảng trao tay | Không đổi |
| Title | `bk-titles.js`, bảng `titles` | Không đổi |
| Danh vị | `student_roles` | Không đổi |
| Thông báo đã đọc | `bakhiNotifyReads.v1` | Không đổi |
| Bộ đếm | `bakhiSignals.v1` | Không đổi (không dùng làm XP) |

Không khoá localStorage nào bị xoá. Không bảng/cột nào bị drop.

## 3. Migration đã áp dụng

`supabase/migrations/20261209000000_bakhi_v830_gamification.sql`

- Idempotent: `create table if not exists`, `create or replace function`,
  seed bằng `on conflict do nothing` (không ghi đè định nghĩa đã sửa).
- Chạy trong một transaction; lỗi giữa chừng thì rollback toàn bộ.
- Đã ghi vào `supabase_migrations.schema_migrations` với version `20261209000000`.
- Có khối rollback ở đầu tệp (chỉ dùng khi thật sự cần, sau khi đã sao lưu).

Dữ liệu tạo ra bởi migration: 1 dòng cấu hình, 15 node, 17 thành tựu, 9 nhiệm vụ,
6 vật phẩm, **0 học sinh**, **0 giao dịch XP**, **0 thử thách**.

## 4. Kiểm tra trước/sau

Trước khi áp dụng, QA ghi nhận: 15 bảng mới chưa tồn tại, `schema_migrations`
dừng ở `20261208000000`. Sau khi áp dụng:

```sql
select (select count(*) from public.skill_tree_nodes) nodes,
       (select count(*) from public.achievement_defs) ach,
       (select count(*) from public.mission_defs) mis,
       (select count(*) from public.reward_catalog) rew,
       (select count(*) from public.xp_transactions) xp;
```

Kết quả thực tế: `nodes=15, ach=17, mis=9, rew=6, xp=0`.
`bk_gam_admin_drift()` trả 0 dòng.

## 5. Chuyển đổi dữ liệu cũ (không bắt buộc)

Nếu sau này muốn quy đổi hoạt động lịch sử (trước 8.3.0) thành XP, **không** đọc
localStorage của người học để cộng XP (không xác thực được). Cách đúng: dùng dữ
liệu đã đồng bộ trong `student_progress`, viết một migration riêng có bảng đối
chiếu và chạy `bk_gam_award` với idempotency `backfill:<khoá>`. Việc này **chưa
làm** trong 8.3.0 và không nằm trong phạm vi phát hành.

## 6. Rollback

1. Sao lưu `xp_transactions`, `user_progression`, `user_achievements`,
   `user_inventory`, `boss_attempts` (CSV hoặc `pg_dump` bảng).
2. Chạy khối rollback ở đầu tệp migration.
3. Gỡ `bk-gamification.js` khỏi HTML bằng cách chạy lại `tools/inject-gamification.js`
   sau khi xoá tệp — hoặc đơn giản là để mô-đun tự bỏ qua khi không có
   `gamification-api`.

Không có bước nào trong rollback chạm vào dữ liệu học tập cũ.

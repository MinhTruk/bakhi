# Migration dữ liệu 8.3.5

Tệp: `supabase/migrations/20261210000000_bakhi_v835_avatar_frame_sync.sql`
Đã áp lên production project `wzvslyabhizsiggurwdq` (Management API trả HTTP 201).

## 1. Vì sao cần migration

Sửa đồng bộ khung avatar cần ba thay đổi ở tầng dữ liệu, không thể chỉ sửa client:

1. Khung thưởng của Gamification cần được `bakhi_owned_frames` công nhận.
2. `bk_gam_equip` phải ghi `student_profiles.frame` trong cùng transaction.
3. Mã Boss phải cho phép `_` (`ma_vuong`) theo yêu cầu 8.3.5.

## 2. Nội dung

### 2.1. Ánh xạ vật phẩm khung → khung hồ sơ

```sql
update public.reward_catalog
   set metadata = metadata || jsonb_build_object('profile_frame', 'wreath')
 where kind = 'frame' and id = 'frame-laurel'
   and coalesce(metadata ->> 'profile_frame', '') = '';
-- tương tự frame-ember → infernal
-- các id trùng tên khung (leaf, crown, sakura…) → chính id
```

Chỉ điền khi chưa có, nên không ghi đè lựa chọn của quản trị viên.

### 2.2. Nới mã Boss

```sql
alter table public.boss_challenges drop constraint if exists boss_challenges_slug_check;
alter table public.boss_challenges add constraint boss_challenges_slug_check
  check (slug ~ '^[a-z0-9][a-z0-9_-]{2,63}$');
```

Dữ liệu cũ (`^[a-z0-9][a-z0-9-]{2,63}$`) vẫn thoả ràng buộc mới.

### 2.3. `bakhi_owned_frames`

Thêm nhánh thứ ba:

```sql
select nullif(rc.metadata ->> 'profile_frame', '')
  from public.user_inventory ui
  join public.reward_catalog rc on rc.id = ui.item_id
 where ui.student_id = p_student and rc.kind = 'frame'
```

Giữ nguyên toàn bộ ánh xạ badge → khung cũ.

### 2.4. `bk_gam_equip`

Với `kind = 'frame'`:

- Trang bị: `insert into student_profiles (student_id, frame) … on conflict do update`.
- Bỏ trang bị: `update student_profiles set frame = 'none'`.
- Trả thêm `kind` và `frame` để client cập nhật cache.

`revoke all … from public, anon, authenticated` giữ nguyên — chỉ service role gọi được.

## 3. An toàn dữ liệu

- Không tạo bảng mới, không đổi kiểu cột, không xoá dòng nào.
- Không đụng `student_badges`, `user_inventory`, `xp_transactions`, `boss_attempts`.
- Trigger `bakhi_profile_frame_guard` vẫn bắt buộc khung phải sở hữu.
- Migration idempotent: chạy lại không đổi kết quả.
- Không seed nội dung giáo dục hay dữ liệu người dùng giả.

## 4. Đối chiếu sau khi áp

| Kiểm tra | Kết quả |
|---|---|
| `select id, metadata->>'profile_frame' from reward_catalog where kind='frame'` | `frame-laurel → wreath`, `frame-ember → infernal` |
| Ràng buộc `boss_challenges_slug_check` | chấp nhận `ma_vuong`, vẫn chấp nhận slug cũ |
| `gamification-db-check` XA42–XA45 (rollback) | trang bị khung → `student_profiles.frame = wreath`; `bakhi_owned_frames` có `wreath`; bỏ khung → `none`; vật phẩm còn trong kho |
| `gamification-db-check` toàn bộ | 15/15 nhóm đạt, không để lại dữ liệu thử |

## 5. Rollback

```sql
-- 1. Khôi phục bk_gam_equip 8.3.0 (xem migration 20261209000000, mục 17)
-- 2. Khôi phục bakhi_owned_frames 7.7.0 (xem 20261119000000, mục 3)
alter table public.boss_challenges drop constraint if exists boss_challenges_slug_check;
alter table public.boss_challenges add constraint boss_challenges_slug_check
  check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$');
-- metadata.profile_frame có thể giữ nguyên: không ảnh hưởng dữ liệu cũ.
```

Rollback **không** cần thiết cho dữ liệu người dùng: không có dòng nào bị xoá hoặc đổi nghĩa.

## 6. Những thay đổi chưa thực hiện

- Không chuẩn hoá hàng loạt id cũ sang dấu `_` (sẽ phá tham chiếu badge/skill tree).
- Không thêm bảng ánh xạ khung riêng: `reward_catalog.metadata` đã đủ và đã được dùng.
- Không chuyển `student_profiles.frame` sang bảng mới: dữ liệu tương đương đã tồn tại.

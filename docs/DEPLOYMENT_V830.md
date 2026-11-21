# TRIỂN KHAI v8.3.0

Ngày: 21/11/2026. Project Supabase: `wzvslyabhizsiggurwdq` (bakhi).

## 1. Thứ tự đã thực hiện

| # | Bước | Kết quả |
|---|---|---|
| 1 | `git status` trước khi sửa | Sạch, không có thay đổi chưa commit của người dùng |
| 2 | Kiểm tra migration hiện có | Dừng ở `20261208000000` (8.2.0); không có bảng gamification |
| 3 | Áp migration `20261209000000_bakhi_v830_gamification.sql` | Thành công, một transaction; ghi `schema_migrations` |
| 4 | Deploy Edge Function `gamification-api` | Thành công |
| 5 | Deploy lại `admin-actions` (SERVER_VERSION 8.3.0) | Thành công |
| 6 | Kiểm tra RLS/permissions | 0 policy ghi; `boss_questions` không có grant; xem `GAMIFICATION_SECURITY.md` |
| 7 | Test server-side | `gamification-db-check.js`: 15/15 |
| 8 | Deploy frontend | `git push` `d7e5e86..760c61d` lên `main` |
| 9 | GitHub Pages | `/gamification/` trả 200 sau ~35 giây |
| 10 | Kiểm tra production URL | Xem mục 3 |
| 11 | Versioning | `bk-version.js`, `SERVER_VERSION`, `?v=` trên 122 trang đều 8.3.0 |

## 2. Lệnh đã chạy

```bash
# Database (Management API, transaction trong tệp migration)
POST /v1/projects/<ref>/database/query   # nội dung migration

# Edge Functions
npx supabase functions deploy gamification-api --project-ref <ref> --yes
npx supabase functions deploy admin-actions --project-ref <ref> --yes

# Frontend
git push origin HEAD:main

# QA
NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/xp-level-integrity.js
node tools/qa/gamification-security-smoke.js
node tools/qa/gamification-db-check.js
```

Không có secret nào được ghi vào repository, tệp tĩnh hay log.

## 3. Xác minh production

| Kiểm tra | Kết quả |
|---|---|
| `GET https://minhtruk.github.io/bakhi/gamification/` | 200; HTML nạp `bk-gamification.css` + `bk-gamification.js` |
| `GET .../assets/bakhi/bk-version.js` | `app: '8.3.0'` |
| `GET .../assets/bakhi/bk-gamification.js` | 200, tiêu đề tệp ghi 8.3.0 |
| `GET .../admin/` | nạp `bk-devboard-gamification.js?v=8.3.0` |
| `POST /functions/v1/gamification-api` không có Authorization | `401 NO_SESSION` — cổng xác thực hoạt động |
| Trang chủ, một trang bài học | nạp thêm đúng một thẻ `bk-gamification.js` |

Chưa kiểm tra bằng trình duyệt tương tác (đăng nhập học sinh thật, làm quiz để thấy XP
tăng) — xem mục "Remaining Issues" trong `RELEASE_REPORT_V830.md`.

## 4. Rollback

Xem `GAMIFICATION_DATA_MIGRATION_V830.md` mục 6. Tóm tắt: sao lưu 5 bảng tiến trình,
chạy khối rollback ở đầu migration, gỡ thẻ script bằng công cụ chèn. Không bước nào
chạm dữ liệu học tập cũ.

## 5. Việc cần làm khi vận hành

1. Vào **Admin → Tiến trình** kiểm tra cấu hình XP và bật/tắt feature flag.
2. Soạn ít nhất một **Thử thách Boss** (định dạng câu hỏi ghi trong `BOSS_CHALLENGE.md`).
3. Theo dõi **Founder → nhật ký gamification** vài ngày đầu để phát hiện bất thường.

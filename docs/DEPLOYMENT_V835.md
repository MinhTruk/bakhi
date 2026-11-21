# Triển khai 8.3.5

Ngày: 2026-11-21 · Nhánh: `main` · Repository: `MinhTruk/bakhi`

## 1. Trước khi triển khai

| Bước | Kết quả |
|---|---|
| `git status` | sạch trước khi sửa; không có thay đổi chưa commit của người dùng |
| Phiên bản nền | 8.3.1 (đọc từ mã, không dựa vào CHANGELOG) |
| `content-integrity verify` | PASS — 123 tệp nội dung gốc không đổi |
| `node --check` các tệp JS sửa | PASS |
| Toàn bộ QA | 0 FAIL (xem `docs/QA_V835.md`) |

## 2. Migration

```bash
# Áp qua Supabase Management API (POST /v1/projects/<ref>/database/query)
supabase/migrations/20261210000000_bakhi_v835_avatar_frame_sync.sql
```

Kết quả: HTTP **201**, không lỗi. Nội dung: `docs/DATA_MIGRATION_V835.md`.
Migration chỉ thêm/ghi đè có kiểm soát; không xóa dữ liệu.

## 3. Edge Functions

```bash
npx supabase functions deploy gamification-api --project-ref wzvslyabhizsiggurwdq --yes
npx supabase functions deploy admin-actions    --project-ref wzvslyabhizsiggurwdq --yes
```

| Function | Thay đổi | Xác minh |
|---|---|---|
| `gamification-api` | `equip` trả `kind`/`frame`; `codeOf()` cho phép `_`; `admin.achievement.delete`; `expect_new` → `CODE_TAKEN` | body deploy có `expect_new`, `CODE_TAKEN`, `achievement.delete`, `frame: (data && data.frame)` |
| `admin-actions` | `SERVER_VERSION = '8.3.5'` | body deploy báo `SERVER_VERSION = '8.3.5'` |
| `student-profile` | không đổi | — |

RLS không đổi. Không có secret mới. Không có service-role key trong mã nguồn.

## 4. Frontend

- `bk-version.js`: `app: '8.3.5'`.
- `bk-devboard.js`: `APP_VERSION = '8.3.5'`.
- Toàn bộ 123 trang HTML: `?v=8.3.5` (1025 thẻ asset).
- Không có Service Worker cần cập nhật.

Commit: **7e231c2** — `feat(8.3.5): đồng bộ avatar/khung toàn website và đơn giản hoá quản
trị thành tích`. Push fast-forward `938d99f..7e231c2` lên `main`; GitHub Pages tự phát hành.

## 5. Xác minh production

| Kiểm tra | Kết quả |
|---|---|
| `https://minhtruk.github.io/bakhi/assets/bakhi/bk-version.js` | `app: '8.3.5'` |
| `https://minhtruk.github.io/bakhi/gamification/` | nạp `bk-gamification.js?v=8.3.5` |
| `bk-gamification.js` trên production | có `heroAvatar` + `applyServerFrame` |
| `bk-devboard-gamification.js` trên production | có `slugify` |
| Supabase `admin-actions` | `SERVER_VERSION = 8.3.5` |
| Supabase `gamification-api` | có `codeOf`, `expect_new`, `admin.achievement.delete` |
| DB `reward_catalog` | `frame-laurel → wreath`, `frame-ember → infernal` |

## 6. Thứ tự đã thực hiện

1. Audit và xác định nguyên nhân gốc.
2. Sửa client (avatar/frame) và dashboard.
3. Thêm QA + chạy hồi quy.
4. Migration → deploy function → push frontend.
5. Xác minh production.
6. Tài liệu và báo cáo phát hành.

## 7. Rollback

- Frontend: `git revert 7e231c2` rồi push (Pages tự cập nhật).
- Function: deploy lại commit trước (`938d99f`).
- DB: xem mục 5 trong `docs/DATA_MIGRATION_V835.md`. Không cần khôi phục dữ liệu người dùng
  vì không có dòng nào bị xóa.

## 8. Việc chưa thực hiện

- Không deploy preview riêng: thay đổi đã kiểm bằng QA tự động và xác minh tệp trên production.
- Không kiểm tra bằng phiên học sinh thật (xem NOT RUN trong `docs/QA_V835.md`).

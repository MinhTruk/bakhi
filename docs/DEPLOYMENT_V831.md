# TRIỂN KHAI v8.3.1

Ngày: 21/11/2026 · Project: `wzvslyabhizsiggurwdq` (bakhi) · Nhánh: `main`

## 1. Thứ tự đã thực hiện

| # | Bước | Kết quả |
|---|---|---|
| 1 | `git status` trước khi sửa | Sạch, HEAD `05039aa` |
| 2 | Audit version/CHANGELOG/APP_VERSION/SERVER_VERSION | Đồng nhất 8.3.0 trước khi sửa |
| 3 | Kiểm tra Supabase | 15 bảng, 14 hàm, RLS, 0 policy ghi; 40 học sinh, 18 thiết bị |
| 4 | Kiểm tra Edge Function | `gamification-api` sống, `401 NO_SESSION` khi thiếu phiên |
| 5 | Kiểm tra đăng nhập ẩn danh | Bật (`external.anonymous_users = true`) |
| 6 | Sửa code (không migration) | Loader, navigation, version |
| 7 | QA tại chỗ | 22 smoke + 15 engine + integrity + version + config: **đạt** |
| 8 | Commit | `6267a31` |
| 9 | Push | `05039aa..6267a31` → `main` (fast-forward) |
| 10 | Deploy Edge Function | `admin-actions` (SERVER_VERSION 8.3.1) thành công |
| 11 | GitHub Pages | Trả 8.3.1 sau ~32 giây (lần dò thứ 5) |
| 12 | Xác minh production | Xem mục 3 |

**Không** chạy migration, **không** đổi schema/RLS, **không** xoá dữ liệu, **không** tạo
bản ghi XP/thử thách giả.

## 2. Lệnh đã chạy

```bash
# QA
NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-progress-load-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-navigation-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/xp-level-integrity.js
node tools/qa/gamification-security-smoke.js
node tools/qa/gamification-db-check.js        # cần SUPABASE_ACCESS_TOKEN
node tools/content-integrity.js verify
node tools/qa/version-audit.js

# Deploy
npx supabase functions deploy admin-actions --project-ref <ref> --yes
git push origin HEAD:main
```

## 3. Xác minh production

| Kiểm tra | Kết quả |
|---|---|
| `GET /assets/bakhi/bk-version.js` | `app: '8.3.1'` |
| `GET /assets/bakhi/bk-gamification.js` | 200, chứa `global.BKCloud && typeof global.BKCloud.gamificationApi` |
| `GET /assets/bakhi/bk-shell.js` | có đúng 1 `data-bk-progress-link` |
| `GET /gamification/` | 200 |
| `GET /admin/` | nạp `bk-devboard-gamification.js?v=8.3.1` |
| `POST /functions/v1/gamification-api` không phiên | `401 {"code":"NO_SESSION"}` |
| `bk_gam_state` học sinh thật (read-only) | level 1, 0 XP, 17 thành tựu, 15 node; sau sync 6 nhiệm vụ |
| `bk_gam_admin_drift()` | 0 dòng |
| Quality Check (GitHub Actions) | xem `RELEASE_REPORT_V831.md` |

## 4. Rollback

1. `git revert 6267a31` (chỉ tệp tĩnh + `SERVER_VERSION`).
2. Deploy lại `admin-actions` bản trước nếu cần.
3. Không cần rollback database: 8.3.1 không có migration.

## 5. Sau triển khai

- Người học mở menu tài khoản → **Tiến trình học tập**.
- Nếu vẫn thấy trạng thái lỗi, đọc mã `E_*` trên giao diện:
  `E_NO_SESSION`/`E_NOT_BOUND` → nhận diện lại ở trang chủ;
  `E_NETWORK` → kiểm tra mạng; `E_SERVER` → kiểm tra Edge Function/DB.
- Gỡ lỗi nhanh trong Console: `BK.gamification.status()` và `BK.gamification.lastError()`.

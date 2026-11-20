# Bá Khí 8.1.1 — Báo cáo sẵn sàng production

Ngày thực hiện: **20/11/2026** · Người thực hiện: coding agent (Freebuff) · Phạm vi: P0 → P1 → P2.

Mọi kết luận dưới đây dựa trên kiểm tra thực tế: chạy QA trong workspace, gọi trực tiếp
Management API / REST của Supabase project `wzvslyabhizsiggurwdq`, gọi HTTP tới Edge Function
từ Internet và tải lại trang GitHub Pages. Không có kết quả nào được giả lập.

---

## A. Tổng quan

| Hạng mục | Giá trị |
|---|---|
| Phiên bản trước | `8.1.0` (commit `a45ec43`) |
| Phiên bản sau | `8.1.1` |
| Commit mã nguồn + tài liệu | `b014e7a` — `feat(v8.1.1): đồng bộ cấu hình Supabase, siết quyền bảng báo cáo và thêm cổng CI` |
| Commit sửa CI | `6b46cad` — `fix(ci): ghim Node 22 LTS và jsdom 31.0.1 cho Quality Check` |
| Commit báo cáo này | commit kế tiếp sau `6b46cad` trên `main` |
| Branch | `main` (fast-forward, không force-push) |
| Thời điểm triển khai GitHub Pages | 20/11/2026 ~15:12 UTC (đã xác minh trang công khai trả `8.1.1`) |
| Thời điểm đồng bộ changelog | 20/11/2026 15:14:15 UTC (`changelog-sync`, `sync_state = published`) |

## B. Những gì đã sửa

| Tệp | Vấn đề ban đầu | Cách khắc phục | Kết quả |
|---|---|---|---|
| `supabase/config.toml` | Khai báo `[functions.passkey-api]` mồ côi (hàm đã gỡ ở 7.8.0) và **thiếu** `dev-auth` dù hàm có source và đã deploy | Xoá khối `passkey-api`, thêm `[functions.dev-auth] verify_jwt = false`; giữ `project_id = wzvslyabhizsiggurwdq` | `tools/qa/supabase-config.js` PASS: 11 source ↔ 11 khai báo |
| `supabase/migrations/20261207000000_bakhi_v811_report_privileges.sql` (mới) | `anon`/`authenticated` còn `INSERT/UPDATE/DELETE` ở tầng GRANT trên 4 bảng Report Issue (RLS đã chặn nhưng thiếu phòng thủ nhiều lớp); `bakhi_v800_touch` không ghim `search_path` | Thu hồi quyền ghi, chỉ giữ `SELECT` cho `authenticated`, ghim `search_path`; có khối rollback | Đã áp dụng; `has_table_privilege(... 'INSERT'/'UPDATE'/'DELETE')` = `false` trên cả 4 bảng |
| `supabase_migrations.schema_migrations` | 5 migration 7.7.0–8.0.0 đã tạo schema thật nhưng **không có dòng lịch sử** → lần `db push` sau sẽ chạy lại và lỗi | Kiểm tra từng đối tượng (bảng, cột, index, trigger, policy, function, bucket, khoá `app_settings`, grant `anon`) rồi ghi nhận đúng version, **không chạy lại SQL** | Lịch sử đủ 26 version đến `20261207000000` |
| `tools/qa/supabase-config.js` (mới) | Không có kiểm tra tự động nào giữ `config.toml` khớp `functions/` | Tool so hai chiều, kiểm tra `verify_jwt`, tên function frontend gọi, tham chiếu Passkey, migration trùng version, cú pháp TypeScript 17 tệp | PASS toàn bộ |
| `.github/workflows/quality-check.yml` (mới) | Không có cổng chất lượng; repo chỉ có 2 workflow phụ | Workflow chạy toàn vẹn nội dung, `node --check`, JSON, QA Supabase, `version-audit`, 11 smoke test | Run đầu **failing** → xem mục E |
| Workflow trên (lần 2) | Run đầu đỏ vì `jsdom` không ghim: bản mới đổi hành vi DOM (4 smoke test hỏng), bản cũ kéo phụ thuộc ESM-only nên Node 20 `require()` không nạp được | Ghim `node-version: '22'` + `jsdom@31.0.1` + `typescript@5.6.3`; đã tái hiện và kiểm chứng trên Node 22.20.0 | Badge `Quality Check - passing` |
| `assets/bakhi/bk-version.js`, 894 tham số `?v=` trong 122 tệp HTML, `bk-devboard.js` (`APP_VERSION`), `bk-founder.js`, `bk-shell.js`, `bk-founder-auth.js`, `bk-report.js` (CSS tự chèn), `admin-actions` (`SERVER_VERSION`), `report-smoke.js` | Phiên bản rải rác ở 8.1.0 | Đồng bộ 8.1.1 | `version-audit` PASS (1965 tham chiếu, 0 404, 0 trùng, 0 `?v=` cũ) |
| `CHANGELOG.md`, `README.md`, `AGENTS.md`, `docs/SUPABASE_SETUP.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/REPORT_ISSUE.md`, `docs/DEPLOYMENT_CHECKLIST.md` (mới) | Tài liệu còn ghi migration "⏳ chờ chạy", "7 Edge Function", trạng thái 15/11/2026 | Viết lại theo trạng thái xác minh 20/11/2026, tách rõ Implemented/Tested/Deployed/Verified/Blocked | Tài liệu khớp production |

Nội dung giáo dục: `node tools/content-integrity.js verify` → **123/123 tệp không đổi hash**
sau toàn bộ thay đổi (chỉ thẻ script `assets/bakhi/*` được phép đổi, và công cụ bỏ các dòng
`assets/bakhi` trước khi băm).

## C. Supabase (project `wzvslyabhizsiggurwdq`)

### Migration

- `ACTIVE_HEALTHY`, Postgres 17.11, region `ap-southeast-1`.
- Lịch sử: **26 version** từ `20261115000000` đến `20261207000000`, khớp 25 tệp SQL trong
  `supabase/migrations/` cộng migration 8.1.1 mới.
- Không migration nào bị chạy lại; không bảng/bucket/dữ liệu học sinh nào bị xoá.

### Edge Functions

| Function | Source | `config.toml` | Production (gọi từ Internet) |
|---|---|---|---|
| `admin-actions` | ✅ | ✅ `verify_jwt = false` | ✅ Deployed — `401 NO_DEV_SESSION` |
| `admin-auth` | ✅ | ✅ | ✅ Deployed — `401 BAD_DEV_CODE` |
| `bind-student-session` | ✅ | ✅ | ✅ Deployed — `401 NO_SESSION` |
| `changelog-sync` | ✅ | ✅ | ✅ Deployed — `401 BAD_SYNC_TOKEN`, đã đồng bộ 8.1.1 thật |
| `chat-api` | ✅ | ✅ | ✅ Deployed — `401 NO_SESSION` |
| `dev-auth` | ✅ | ✅ (thêm 8.1.1) | ✅ Deployed — `401 BAD_DEV_CODE` với mã sai; ⚠️ đang chạy `verify_jwt = true` (xem mục F) |
| `import-students` | ✅ | ✅ | ✅ Deployed — `401 NO_DEV_SESSION` |
| `report-api` | ✅ | ✅ | ✅ Deployed — `409 NOT_BOUND` với phiên ẩn danh thật |
| `search-students` | ✅ | ✅ | ✅ Deployed — `401 NO_SESSION` |
| `student-profile` | ✅ | ✅ | ✅ Deployed — `409 NOT_BOUND` với phiên ẩn danh thật |
| `sync-student-progress` | ✅ | ✅ | ✅ Deployed — `401 NO_SESSION` |
| `passkey-api` | 🗑️ gỡ ở 7.8.0 | 🗑️ đã xoá khỏi config | Không còn |

Anonymous sign-in: `POST /auth/v1/signup` → **200**, có `access_token`, `is_anonymous = true`
(user kiểm thử đã xoá sau khi xong).

### Secrets (chỉ tên, không giá trị)

| Secret | Trạng thái | Bằng chứng |
|---|---|---|
| `DEV_PLAYGROUND_CODE` | ✅ đã đặt | `dev-auth` trả `401 BAD_DEV_CODE` (không phải `503 NO_DEV_PLAYGROUND_CODE`) |
| `ADMIN_DEV_CODE` + mã Founder | ✅ đã đặt | `admin-auth` trả `401 BAD_DEV_CODE` khi mã sai |
| `CHANGELOG_SYNC_TOKEN` (Supabase + GitHub) | ✅ đã đặt | Workflow `changelog-sync` xanh, 8.1.1 `published` |
| `CHANGELOG_SYNC_URL` (GitHub) | ✅ đã đặt | Như trên |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` (GitHub, cho deploy tự động) | ❌ chưa đặt | Vì vậy Supabase deploy hiện thực hiện thủ công |

### RLS

| Kiểm tra | Kết quả |
|---|---|
| RLS bật trên `reports`, `report_messages`, `report_notifications`, `report_activity_logs` | ✅ `relrowsecurity = true` |
| Policy ghi của học sinh trên 4 bảng | ❌ không có policy `INSERT/UPDATE/DELETE` nào |
| `reports_select_own`, `report_messages_select_own`, `report_notifications_select_own` | ✅ lọc theo `bakhi_current_student_id()` |
| `report_activity_logs` | ✅ 0 policy ⇒ chỉ `service_role` đọc/ghi; quyền `SELECT` của client đã thu hồi |
| GRANT ghi của `anon`/`authenticated` trên 4 bảng | ✅ đã thu hồi (8.1.1) |
| `students`, `student_devices`, `dev_sessions`, `admin_activity_logs`, `student_login_codes` | ✅ RLS bật, không policy cho client (chỉ `service_role`) |
| `student_profiles`/`student_progress`/`music_tracks`/`announcement_reads` | ✅ policy ghi kèm `with_check = student_id = bakhi_current_student_id()` |
| Hàm `bakhi_rate_limit`, `bakhi_current_student_id` | ✅ tồn tại, `search_path = public` |

### Storage

| Kiểm tra | Kết quả |
|---|---|
| Bucket `report-attachments` | ✅ `public = false`, giới hạn 5 MB, chỉ PNG/JPG/WEBP/GIF/PDF |
| Policy `report_files_read_own` / `_upload_own` / `_delete_own` | ✅ ràng buộc `bucket_id` + `(storage.foldername(name))[1] = bakhi_current_student_id()` |
| Signed URL | ✅ do `report-api` sinh, hạn 3600 giây |
| Đổi UUID trên URL để đọc tệp người khác | ⛔ bị chặn bởi policy thư mục gốc = student id hiện tại |

## D. QA

Chạy trong workspace, Node 22.20.0 + jsdom 31.0.1 + typescript 5.6.3, sau thay đổi 8.1.1:

| Test | Kết quả | Ghi chú |
|---|---|---|
| Smoke | PASS | Trang chủ, chuông cũ, tiến trình |
| Cloud | PASS | Nhận diện, thông báo, changelog, đồng bộ, bảo mật |
| Shell | PASS | Avatar/menu, trợ năng, ẩn chrome cũ |
| Dev | PASS | Developer Playground 2.0, 14 tab |
| Badges | PASS | 99 badge, tính lại phía máy chủ, migration |
| Chat | PASS | Phòng, tin nhắn, reaction, RLS, trang `/chat/` |
| Admin | PASS | 12 mô-đun Administrator |
| Report | PASS | Nút nổi, form, Q&A, dashboard, RLS, bucket, chủ đề tối |
| Founder | PASS | 15 mô-đun Founder |
| Maintenance | PASS | Trạng thái bảo trì, Founder Login |
| Studio | PASS | Word & Paint hợp nhất |
| Version Audit | PASS | 123 trang, 1965 tham chiếu, 0 lỗi |
| Content Integrity | PASS | 123 tệp nội dung gốc không đổi |
| Supabase Config (mới) | PASS | 11 ↔ 11, `verify_jwt`, migration, cú pháp TS |

## E. Deployment

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| GitHub Pages | ✅ Verified | `https://minhtruk.github.io/bakhi/` → HTTP 200; `bk-version.js?v=8.1.1`, `app: '8.1.1'`; trang bài học `ktgk1/ly/ly1.html` cũng `v=8.1.1` |
| GitHub Actions — `Quality Check` | ✅ Verified | Run đầu **failing** (jsdom không ghim), đã sửa và push; badge hiện `passing` |
| GitHub Actions — `Changelog → Supabase` | ✅ Verified | 8.1.1 vào bảng `changelog` lúc 15:14:15 UTC, `sync_state = published`, không có `sync_error` |
| GitHub Actions — `Music → library.json` | ✅ passing | Không bị thay đổi |
| Supabase migrations | ✅ Applied | 26 version trong lịch sử; đối tượng kiểm tra trực tiếp trên DB |
| Edge Functions | ⚠️ Deployed, chưa đồng bộ phiên bản mới | 11 hàm đều sống; `admin-actions` đang chạy bản `8.1.0` (chỉ khác chuỗi `SERVER_VERSION`) |
| Production verification Report Issue | ⚠️ Một phần | Xác minh được: auth, chống truy cập trái phép, RLS, bucket, grant. **Chưa** xác minh luồng ghi end-to-end (xem mục F) |

## F. Việc còn tồn đọng

### BLOCKED

1. **Deploy lại Edge Function** — cần Supabase CLI + access token của chủ dự án (token không được
   đưa vào lệnh/tệp theo quy tắc bảo mật). Cụ thể:
   ```bash
   supabase functions deploy admin-actions --project-ref wzvslyabhizsiggurwdq --no-verify-jwt
   supabase functions deploy dev-auth      --project-ref wzvslyabhizsiggurwdq --no-verify-jwt
   ```
   - `admin-actions`: đưa `SERVER_VERSION` từ `8.1.0` lên `8.1.1` (chỉ là chuỗi hiển thị ở
     Administrator Dashboard → Settings, không ảnh hưởng logic).
   - `dev-auth`: đồng bộ `verify_jwt = false` như `config.toml` (hiện đang `true`; vẫn chạy được
     vì trình duyệt luôn gửi JWT phiên sau Anonymous Auth).
2. **Kiểm thử end-to-end Report Issue trên dữ liệu thật** — cần (a) một thiết bị đã gắn học sinh
   thật và (b) Administrator Code / Founder Code. Agent không giữ hai loại bí mật này. Kịch bản
   cần chủ dự án chạy nằm ở `docs/REPORT_ISSUE.md` mục 9 (5 bước) và
   `docs/DEPLOYMENT_CHECKLIST.md` mục 7.
3. **Deploy Supabase tự động trong CI** — chưa bật vì chưa có `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` trong GitHub Secrets và chưa xác minh yêu cầu
   "workflow mới tương thích" trên môi trường thật. Quy trình thủ công đã ghi trong
   `docs/DEPLOYMENT_CHECKLIST.md`.

### NOT VERIFIED

4. **Q&A hai chiều, thông báo riêng, Complete/Reopen, xuất CSV theo bộ lọc** trên production —
   logic đã được `report-smoke` kiểm thử trong jsdom và hợp đồng action đã đối chiếu, nhưng chưa
   chạy với một báo cáo thật + một tài khoản quản trị thật.
5. **Đăng nhập Developer Playground bằng Dev Code** end-to-end — mới xác minh hàm từ chối mã sai
   và chấp nhận request có JWT; chưa thử với mã đúng (không giữ Dev Code).
6. **Upload tệp đính kèm thật** lên bucket — chính sách bucket và signed URL đã đối chiếu ở tầng
   DB/HTTP, chưa thực hiện một lần upload/đọc/xoá thật.
7. **Responsive / thiết bị thật (P2)** — môi trường này không có trình duyệt để chạy Playwright.
   Các breakpoint, `prefers-reduced-motion`, floating elements (nút Report neo chuông) đã được
   kiểm bằng jsdom + đọc CSS, **chưa được nhìn bằng mắt** trên desktop/tablet/Android/iOS.
8. **GitHub Actions API** — không đọc được lịch sử run chi tiết (rate limit khi chưa xác thực);
   trạng thái workflow lấy từ badge công khai và từ hiệu ứng thật (changelog đã publish).

### Known Issues (không chặn production)

- `20261121000000` được ghi trong lịch sử với tên `bakhi_least_privilege`, còn tệp trong repo tên
  `bakhi_platform_5.sql`. Đây là tên ghi lúc áp dụng, không phải lỗi schema — không đổi để tránh
  rủi ro.
- `admin-actions` đang báo `SERVER_VERSION = 8.1.0` cho tới khi deploy lại (mục BLOCKED 1).
- Bảng cũ `passkey_challenges`/`student_passkeys` đã bị gỡ ở 7.8.0; tài liệu vẫn nhắc trong phần
  lịch sử, không còn trong mã.

## G. Kết luận

**PARTIALLY READY.**

Đã đạt và có bằng chứng: cấu hình Supabase đồng nhất, 11 Edge Function sống và tự xác thực đúng,
lịch sử migration khớp schema thật, RLS + Storage + GRANT đã kiểm tra ở tầng DB, bốn bảng Report
Issue siết quyền ghi, QA 14/14 PASS, version audit và content integrity PASS, `Quality Check`
xanh trên CI, GitHub Pages đang phục vụ 8.1.1, changelog 8.1.1 đã publish lên Supabase.

Chưa đạt: chưa kiểm thử end-to-end Report Issue/Q&A với dữ liệu thật, chưa deploy lại 2 Edge
Function để đồng bộ `SERVER_VERSION`/`verify_jwt`, chưa có deploy Supabase tự động trong CI, và
chưa kiểm tra giao diện trên thiết bị thật. Bốn việc này đều nằm trong mục **F** kèm lệnh/kịch
bản cụ thể cho chủ dự án, nên không thể tuyên bố `PRODUCTION READY` ở thời điểm này.

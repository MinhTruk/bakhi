# Bá Khí — Danh mục kiểm tra triển khai

Danh mục này là quy trình bắt buộc trước và sau mỗi lần phát hành. Mọi mục đều phải có
bằng chứng (log, truy vấn, ảnh chụp dashboard); không đánh dấu hoàn thành bằng cảm giác.

Trạng thái: **Implemented** (có trong source) · **Tested** (đã kiểm thử cục bộ) ·
**Deployed** (đã đẩy lên project thật) · **Verified** (đã gọi thử trên production).

---

## 1. Chuẩn bị

- [ ] Đọc `AGENTS.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/SUPABASE_SETUP.md`.
- [ ] `git status` sạch hoặc mọi thay đổi chưa commit đều thuộc phạm vi phát hành.
- [ ] `git fetch origin && git log --oneline origin/main -3` — nhánh đang làm việc không lệch
      khỏi `main`.
- [ ] Phiên bản mục tiêu đã có mục trong `CHANGELOG.md` (ngày + số phiên bản).
- [ ] Có bản sao lưu database gần nhất (Supabase → Database → Backups) hoặc xác nhận PITR
      đang bật. **Không** chạy thao tác phá huỷ khi chưa xác minh khả năng phục hồi.
- [ ] Không có file `.env`, `supabase/.temp/`, `node_modules/` trong `git status`.

## 2. Kiểm tra trước khi deploy

Chạy đúng thứ tự, dừng ngay khi một bước thất bại:

```bash
node tools/content-integrity.js verify          # nội dung giáo dục không đổi
node tools/qa/version-audit.js                  # ?v=, đường dẫn, APP_VERSION, SERVER_VERSION
node tools/qa/supabase-config.js                # functions ↔ config.toml, verify_jwt, migration
# (jsdom + typescript cài ngoài repo: npm install jsdom typescript@5.6.3 --prefix /tmp/bktest --no-save)
NODE_PATH=/tmp/bktest/node_modules node tools/qa/report-smoke.js
```

- [ ] Toàn bộ 11 smoke test trong `tools/qa/` xanh (xem `.github/workflows/quality-check.yml`).
- [ ] `node --check` cho mọi tệp JS vừa sửa.
- [ ] Không có chuỗi `service_role`, `sb_secret_`, Dev Code hay mật mã trong diff.
- [ ] `git diff --stat` chỉ chứa tệp thuộc phạm vi phát hành.

## 3. Database migration

- [ ] Liệt kê migration trong repo: `ls supabase/migrations/`.
- [ ] Đối chiếu với lịch sử thật:
      `supabase migration list --linked` (hoặc Management API → migration history).
- [ ] Phân loại từng migration: **đã chạy** / **chưa chạy** / **chạy một phần**.
- [ ] Migration chưa chạy: đọc kỹ, xác nhận idempotent (`if not exists`, `on conflict do nothing`,
      `revoke`/`grant` lặp lại được), rồi mới áp dụng bằng
      `supabase db push --linked` hoặc công cụ migration có ghi lịch sử.
- [ ] Migration đã chạy nhưng thiếu dòng lịch sử (đã gặp ở 7.7.0–8.0.0): kiểm tra **từng đối
      tượng** (bảng, cột, index, trigger, policy, function, bucket) rồi ghi nhận version bằng
      `supabase migration repair --status applied <version>`. **Không chạy lại SQL.**
- [ ] Không bao giờ sửa timestamp của migration đã áp dụng; thay đổi mới ⇒ migration mới.
- [ ] Không có `drop table`, `drop column`, `delete from` trên bảng dữ liệu học sinh trong
      migration mới.
- [ ] Sau khi áp dụng: `select version, name from supabase_migrations.schema_migrations order by version desc limit 5;`

## 4. Edge Functions

- [ ] `node tools/qa/supabase-config.js` → 11 source ↔ 11 khai báo, `verify_jwt = false` cho tất cả.
- [ ] Mỗi function tự xác thực bên trong (Anonymous Auth, `x-admin-token`, Dev Code) — không
      hàm nào tin `student_id` do client gửi.
- [ ] Deploy đúng hàm đã đổi:
      `supabase functions deploy <tên> --project-ref wzvslyabhizsiggurwdq`
      (thêm `--no-verify-jwt` khi `config.toml` khai báo `verify_jwt = false` mà CLI không đọc config).
- [ ] Hàm phụ thuộc migration mới được deploy **sau** khi migration đã áp dụng.
- [ ] Không deploy hàm đã bị gỡ (`passkey-api`), không xoá hàm còn được frontend gọi.

## 5. Secrets

Chỉ ghi **tên**, không bao giờ ghi giá trị.

| Secret | Nơi đặt | Dùng bởi |
|---|---|---|
| `ADMIN_DEV_CODE` (và mã Founder) | Supabase Edge Function Secrets | `admin-auth` |
| `DEV_PLAYGROUND_CODE` | Supabase Edge Function Secrets | `dev-auth` |
| `DEV_SESSION_HOURS` (tuỳ chọn) | Supabase Edge Function Secrets | `dev-auth` |
| `CHANGELOG_SYNC_TOKEN` | Supabase Secrets + GitHub Secrets | `changelog-sync`, workflow |
| `CHANGELOG_SYNC_URL` | GitHub Secrets | workflow `changelog-sync.yml` |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | GitHub Secrets (chỉ khi bật deploy Supabase tự động) | workflow deploy |

- [ ] Xác nhận secret tồn tại bằng dashboard hoặc `GET /functions/<tên>` trả mã lỗi nghiệp vụ
      (không phải `503` thiếu cấu hình).
- [ ] Không có secret nào trong `assets/`, HTML, `CHANGELOG.md` hay log workflow.

## 6. GitHub Actions

- [ ] `Quality Check` xanh trên commit phát hành.
- [ ] `Changelog → Supabase` chạy sau khi `CHANGELOG.md` lên `main`; tab **Giám sát** của
      dashboard không có hàng `sync_state = 'failed'`.
- [ ] `Music → library.json` chỉ commit `music/library.json` khi có tệp nhạc mới.
- [ ] Không có hai workflow cùng deploy một thứ (Pages chỉ phục vụ nhánh `main` từ cấu hình
      *Settings → Pages → Deploy from a branch*).
- [ ] Cache busting: `?v=` mọi tài nguyên nội bộ bằng `bk-version.js` (version-audit PASS).

## 7. Xác minh production

- [ ] `https://minhtruk.github.io/bakhi/` trả 200, hiển thị đúng phiên bản ở footer.
- [ ] Trang chủ, một trang bài học, `/settings/?tab=profile`, `/profile/`, `/admin/`,
      `/founder/`, `/chat/`, `/studio/` tải không lỗi console.
- [ ] Gọi thử từng Edge Function từ Internet và thấy mã lỗi nghiệp vụ của chính hàm
      (`401 NO_SESSION`, `401 NO_DEV_SESSION`, `401 BAD_DEV_CODE`, `409 NOT_BOUND`).
- [ ] Anonymous sign-in trả `200` và có `access_token`.
- [ ] Gửi một báo cáo thật → thấy trong tab **Report** của dashboard → trả lời → học sinh nhận
      thông báo trong chuông → Complete Report → Reopen → xuất CSV đúng bộ lọc.
- [ ] Học sinh thứ hai không thấy báo cáo của học sinh thứ nhất.
- [ ] Kiểm tra mã lỗi khi tải tệp sai định dạng (> 5 MB, `.exe`).

## 8. Rollback và phục hồi

- [ ] Mã nguồn: `git revert <commit>` rồi push — **không** force-push `main`.
- [ ] Edge Function: deploy lại commit trước (`supabase functions deploy <tên>` từ worktree cũ).
- [ ] Database: mỗi migration mới phải có khối `-- Rollback` ở cuối tệp; chạy tay phần rollback
      đó, **không** xoá bảng/bucket/dữ liệu học sinh.
- [ ] Sự cố dữ liệu nghiêm trọng: khôi phục từ backup/PITR của Supabase, không tự viết script xoá.
- [ ] Sau rollback: chạy lại toàn bộ mục 2 và 7.

## 9. Hậu kiểm

- [ ] Ghi kết quả vào `docs/PRODUCTION_READINESS_REPORT.md` (mục D, E, F).
- [ ] Cập nhật trạng thái trong `docs/SUPABASE_SETUP.md` nếu có thay đổi hạ tầng.
- [ ] Thông báo cho chủ dự án các mục `BLOCKED` / `NOT VERIFIED` còn lại.
- [ ] Không đánh dấu `Deployed` khi chưa `Verified` trên production.

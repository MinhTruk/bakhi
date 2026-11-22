# Triển khai Bá Khí v8.5.0 (Trợ lý AI)

Thứ tự dưới đây là bắt buộc. Không nhảy bước: Edge Function gọi bảng mới, nên migration
phải chạy trước; frontend gọi function, nên function phải deploy trước khi Pages cập nhật.

## 0. Chuẩn bị

```bash
cd <repo>
git status                 # phải sạch hoặc chỉ có thay đổi của bản này
git log --oneline -3
node tools/content-integrity.js verify
node tools/qa/supabase-config.js
node tools/bump-version.js --check
```

Cần: Supabase CLI đã `link` tới project `wzvslyabhizsiggurwdq`, quyền push `main`
lên GitHub, và quyền sửa Secrets của project.

## 1. Sao lưu

- Supabase → **Database → Backups**: xác nhận có bản gần nhất.
- Nếu đã có dữ liệu AI (lần nâng cấp sau): xuất `ai_conversations`, `ai_messages`,
  `ai_usage_logs` (xem `docs/AI_TUTOR_DATA_MIGRATION.md` mục 6).

## 2. Migration

```bash
supabase db push --dry-run     # xem trước
supabase db push               # áp migration
```

Migration được áp: `20261218000000_bakhi_v850_ai_tutor.sql`.

Kiểm tra ngay:

```sql
select count(*) from public.ai_settings;                    -- 1
select tablename, policyname, cmd
from pg_policies where tablename like 'ai[_]%';             -- 3 policy, cmd = SELECT
select proname from pg_proc where proname = 'bakhi_ai_usage'; -- 1 dòng
```

Nếu khối `do $$ ... $$` trong migration ném lỗi, migration **không** commit — đọc log,
sửa nguyên nhân, chạy lại. Không commit tiếp khi chưa rõ.

## 3. Secrets

Supabase → **Project Settings → Edge Functions → Secrets**:

| Secret | Giá trị |
|---|---|
| `AI_TUTOR_API_KEY` | khoá thật của nhà cung cấp |
| `AI_TUTOR_FALLBACK_API_KEY` | (tuỳ chọn) khoá dự phòng |
| `AI_TUTOR_MOCK` | **xoá** nếu có — không bao giờ bật ở production |

Không đặt khoá vào file, không gửi qua chat, không commit. Chi tiết:
`docs/AI_TUTOR_API_KEY_SETUP.md`.

## 4. Edge Functions

```bash
supabase functions deploy ai-tutor-api --no-verify-jwt
```

`--no-verify-jwt` khớp với `verify_jwt = false` trong `supabase/config.toml` (function tự
xác thực bên trong). Nếu quên, Supabase chặn ở cổng trước khi function chạy.

## 5. Kiểm tra backend trước khi đụng frontend

1. Mở Founder Dashboard → tab **AI Tutor**.
2. **Nhà cung cấp & mô hình**: chọn provider + model → **Lưu cấu hình**.
3. **Kiểm tra kết nối** → phải thấy provider/model/thời gian phản hồi.
4. Nếu lỗi: xem `docs/AI_TUTOR_FOUNDER_GUIDE.md` mục 6.
5. RLS: đăng nhập hai học sinh khác nhau trên hai trình duyệt; mỗi người chỉ thấy hội thoại
   của mình. Thử mở hội thoại của người kia bằng id → phải bị từ chối.

## 6. Frontend (GitHub Pages)

```bash
node tools/bump-version.js 8.5.0 --date 2026-11-22   # nếu chưa chạy
node tools/integrate-pages.js      # idempotent: chèn bk-ai-tutor vào trang mới
node tools/inject-shell.js         # idempotent: bk-cloud cho trang mới
node tools/content-integrity.js verify
node tools/qa/supabase-config.js
```

Rồi:

```bash
git add -A
git commit -m "feat(8.5.0): Trợ lý AI — đa nhà cung cấp, 8 chế độ, ngữ cảnh học tập"
git push origin main
```

GitHub Pages tự phát hành từ `main`. Workflow `changelog-sync.yml` đồng bộ `CHANGELOG.md`
lên Supabase sau khi push (kiểm tra ở tab **Giám sát**).

## 7. Kiểm tra production

1. `https://minhtruk.github.io/bakhi/` — không lỗi console, mở được.
2. `/ai-tutor/` — đăng nhập, hỏi một câu, nhận câu trả lời **thật** (không có dải “giả lập”).
3. Một trang bài học — nút “Hỏi AI” mở bảng, ngữ cảnh đúng môn/bài.
4. `/founder/` — tab AI Tutor hiện usage tăng sau câu hỏi ở bước 2.
5. Hồi quy: Quiz, Chat, Tiến trình, Hồ sơ, Cài đặt, Báo cáo.
6. Kiểm tra không có khoá trong bundle: mở DevTools → Sources → tìm `AI_TUTOR`,
   `AQ.`, `sk-`, `generativelanguage` → không có kết quả.

## 8. Rollback

| Tình huống | Cách làm |
|---|---|
| AI trả lời sai nghiêm trọng | Tắt “Bật Trợ lý AI” trong dashboard (không cần deploy). |
| Function lỗi | `supabase functions deploy ai-tutor-api` lại bản trước (git) — hoặc tắt AI trong dashboard. |
| Frontend lỗi | `git revert` commit 8.5.0, push lại. |
| Bảng lỗi | Xem rollback SQL trong `docs/AI_TUTOR_DATA_MIGRATION.md` mục 6 (mất dữ liệu AI). |

Không force-push. Không xoá migration đã áp.

## 9. Sau triển khai

- [ ] Ghi kết quả thật vào `docs/RELEASE_REPORT_V850.md` mục Deployment.
- [ ] Đặt lại hạn mức (`daily_requests`, `daily_tokens`) theo quy mô thật.
- [ ] Theo dõi tab AI Tutor trong 24 giờ đầu: lỗi, token, số học sinh.
- [ ] Nếu dùng gói miễn phí của provider, kiểm tra quota trước khi quảng bá rộng.

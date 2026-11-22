# Triển khai Bá Khí v8.5.1 (Trợ lý AI)

Tài liệu này ghi **đúng** việc đã làm và việc còn lại. Đừng đọc nó như một kế hoạch lý thuyết:
mọi mục đánh dấu ✅ đã thực sự chạy trên project `bakhi`.

| Thông tin | Giá trị |
|---|---|
| Project | `wzvslyabhizsiggurwdq` (tên `bakhi`) |
| Vùng Supabase | tự chọn theo project, không ảnh hưởng cấu hình |
| Phiên bản | 8.5.1 |
| Trạng thái | Database ✅ · Edge Function ✅ · Secret ✅ · Frontend ⏳ chưa push · Provider ⚠️ hết hạn mức |

---

## 0. Điều kiện cần

1. **Supabase Access Token** — tạo ở <https://supabase.com/dashboard/account/tokens>, đặt tên
   `SUPABASE_ACCESS_TOKEN`. Ba loại credential khác nhau, đừng lẫn:
   - *Access Token*: quản trị project (CLI, Management API). Chỉ dùng trên máy chạy lệnh.
   - *Publishable/anon key*: khoá công khai nhúng trong `assets/bakhi/bk-supabase.config.js`.
   - *Edge Function Secrets*: khoá bí mật của function (chứa `AI_TUTOR_API_KEY`).
2. **`AI_TUTOR_API_KEY`** — khoá nhà cung cấp AI, tạo mới và **chỉ** nhập ở
   *Project Settings → Edge Functions → Secrets*. Không dán vào chat, không ghi vào tệp.
3. `npx supabase --version` ≥ 2, Node ≥ 18.

---

## 1. Trạng thái đã triển khai (2026-11-22)

| Bước | Trạng thái | Bằng chứng |
|---|---|---|
| Migration `20261218000000_bakhi_v850_ai_tutor.sql` | ✅ áp dụng | 5 bảng `ai_*`, RLS bật cả 5, đúng 3 policy `SELECT` |
| Migration `20261218000001_bakhi_v850_ai_diagnostics.sql` | ✅ áp dụng | bảng `ai_provider_diagnostics`, RLS bật, **0 policy**, quyền `anon`/`authenticated` đã thu hồi |
| Migration `20261218000002_bakhi_v850_ai_model_default.sql` | ✅ áp dụng | `ai_settings.model = gemini-3.8-flash` |
| Edge Function `ai-tutor-api` | ✅ deploy | `status = ACTIVE`, `verify_jwt = false` (xác thực nằm trong function), version 6 |
| Secret `AI_TUTOR_API_KEY` | ✅ có (chỉ kiểm tra **tên**) | `GET /v1/projects/{ref}/secrets` trả về tên, không trả giá trị |
| Frontend trên GitHub Pages | ⏳ chưa push | cần làm sau khi provider trả lời được |

Ghi chú kỹ thuật: migration được áp qua Management API (`POST /v1/projects/{ref}/database/query`)
trong **một transaction** kèm dòng `supabase_migrations.schema_migrations`, vì CLI cần mật khẩu
database để `db push`. Cách này không reset và không xoá dữ liệu. Nếu sau này chạy
`supabase db push`, ba migration sẽ được coi là đã áp dụng.

---

## 2. Từ đầu: áp migration (khi làm lại ở project khác)

```bash
# 1) Đăng nhập (mở trình duyệt) — không dán token vào chat
npx supabase login

# 2) Liên kết project
npx supabase link --project-ref <PROJECT_REF>

# 3) Xem trước rồi áp dụng
npx supabase migration list
npx supabase db push          # KHÔNG dùng db reset
```

Nếu không có mật khẩu database, dùng Management API như mục 1:

```bash
# Áp một migration kèm ghi nhận phiên bản (một transaction)
node -e 'const fs=require("fs");
const sql=fs.readFileSync(process.argv[1],"utf8");
fs.writeFileSync("/tmp/m.sql.json",JSON.stringify({query:
 "begin;\n"+sql+"\ninsert into supabase_migrations.schema_migrations (version,name) values (\x27VERSION\x27,\x27NAME\x27) on conflict (version) do nothing;\ncommit;"}))' \
  supabase/migrations/20261218000000_bakhi_v850_ai_tutor.sql

curl -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/m.sql.json
```

Kiểm tra sau khi áp:

```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename like 'ai\_%';              -- 6 bảng, đều true

select tablename, policyname, cmd, roles::text from pg_policies
where schemaname='public' and tablename like 'ai\_%';              -- đúng 3 policy SELECT

select id, enabled, provider, model from public.ai_settings;       -- id=1, gemini-3.8-flash
```

## 3. Secrets

```bash
# Chỉ đặt TÊN, giá trị nhập trong Dashboard (hoặc dùng file cục bộ không commit)
npx supabase secrets list --project-ref <PROJECT_REF>
```

Dashboard: *Project Settings → Edge Functions → Secrets*.

| Tên | Bắt buộc | Ý nghĩa |
|---|---|---|
| `AI_TUTOR_API_KEY` | ✅ | khoá provider chính |
| `AI_TUTOR_FALLBACK_API_KEY` | ⬜ | khoá provider dự phòng (rất nên có, xem mục 7) |
| `AI_TUTOR_FALLBACK_BASE_URL` | ⬜ | chỉ cho provider `custom` |
| `AI_TUTOR_BASE_URL` | ⬜ | chỉ cho provider `custom`. **Đừng đặt** khi dùng Google/OpenAI/Groq…, nó ghi đè địa chỉ mặc định và gây 404 |
| `AI_TUTOR_MOCK` | ❌ | chỉ QA. **Không** bật ở production |

## 4. Deploy Edge Function

```bash
npx supabase functions deploy ai-tutor-api --no-verify-jwt --use-api --remote=<PROJECT_REF>
```

- `--no-verify-jwt`: function tự xác thực người dùng (`student_devices`) thay vì để gateway chặn;
  nhờ vậy trả được mã lỗi tiếng Việt và ghi usage.
- Không dùng `--project-ref` với CLI 3.x (đã deprecated), dùng `--remote=<ref>`.
- Deploy thành công **không** phải bằng chứng function chạy: kiểm tra ở mục 5.

## 5. Kiểm tra backend (không cần khoá AI)

```bash
PUB=<publishable key trong assets/bakhi/bk-supabase.config.js>
URL=https://<PROJECT_REF>.supabase.co

# 5.1 Thiếu phiên → 401 NO_SESSION
curl -s -o- -w '\n%{http_code}\n' -X POST "$URL/functions/v1/ai-tutor-api" \
  -H "apikey: $PUB" -H 'Content-Type: application/json' -d '{"action":"bootstrap"}'

# 5.2 JWT rác → 401 BAD_SESSION
curl -s -o- -w '\n%{http_code}\n' -X POST "$URL/functions/v1/ai-tutor-api" \
  -H "apikey: $PUB" -H 'Authorization: Bearer rac.khong.hop.le' \
  -H 'Content-Type: application/json' -d '{"action":"bootstrap"}'
```

Kết quả mong đợi: hai dòng `401`, thân JSON `{"ok":false,"error":{"code":...}}`, **không** có
stack trace, không có tên khoá, không có URL provider.

## 6. Frontend (GitHub Pages)

Chỉ push sau khi mục 5 xanh và provider đã trả lời được (mục 7).

```bash
node tools/content-integrity.js verify
node tools/qa/version-audit.js
git add -A && git commit -m "feat(8.5.1): ..."
git push origin main          # hoặc qua công cụ cloud_git
```

GitHub Pages tự phát hành `main`. Không có bước build.

## 7. Provider: hạn mức và model

Tình trạng đo được ngày 2026-11-22 với khoá Google hiện tại:

| Model | Kết quả | Ý nghĩa |
|---|---|---|
| `gemini-2.5-flash`, `-lite`, `-pro` | 404 | Google **ngừng cấp cho người dùng mới** |
| `gemini-3.8-flash-001/-exp/-latest/-preview/-thinking` | 404 | không tồn tại |
| `gemini-3.8-flash` | 503 / 429 | model tồn tại nhưng **quá tải** và **hết hạn mức** của khoá |

Vì vậy mặc định là `gemini-3.8-flash`, và để trợ lý dùng được ổn định cần **một trong hai**:

1. **Bật thanh toán cho project Google AI** (hoặc chờ hạn mức miễn phí được tính lại), rồi bấm
   **Kiểm tra kết nối** trong tab AI Tutor của Founder Dashboard.
2. **Cấu hình provider dự phòng** — không cần đổi mã:
   - Tạo khoá ở Groq / OpenRouter / Mistral / DeepSeek (đều có bậc miễn phí).
   - Đặt `AI_TUTOR_FALLBACK_API_KEY`.
   - Trong *Founder Dashboard → AI Tutor*: `Nhà cung cấp dự phòng` + `Model dự phòng`.
   - Dự phòng chỉ được dùng khi lỗi là tạm thời (`TIMEOUT`, `PROVIDER_DOWN`, `RATE_LIMIT`,
     `EMPTY_RESPONSE`) — không dùng khi khoá sai (`AUTH`) hoặc hết hạn mức (`QUOTA`).

Lý do thật của mọi lần lỗi nằm ở bảng `ai_provider_diagnostics` (chỉ service_role đọc được):

```sql
select created_at, provider, model, status, detail
from public.ai_provider_diagnostics order by created_at desc limit 20;
```

## 8. Kiểm tra production

| Việc | Cách làm | Kỳ vọng |
|---|---|---|
| Trang tải được | mở `/ai-tutor/`, F5 vài lần | khung trợ lý, 8 chế độ, không lỗi console |
| Nhận diện | chọn họ tên ở trang chủ rồi mở lại `/ai-tutor/` | “Hôm nay: 0/120 câu hỏi” |
| Gửi câu hỏi | hỏi một câu ngắn | có câu trả lời thật, có Markdown/LaTeX |
| Lưu trữ | F5 | hội thoại còn trong danh sách bên trái |
| Cách ly dữ liệu | đăng nhập thiết bị khác (học sinh khác) | không thấy hội thoại của người kia |
| Không lộ khoá | DevTools → Network → response của `ai-tutor-api` | không có `AIza…`, `sk-…`, không có URL provider |
| Giới hạn | gửi 11 câu trong một phút | câu 11 trả `RATE_LIMIT` |

## 9. Rollback

| Sự cố | Cách lùi an toàn |
|---|---|
| Frontend lỗi | `git revert <commit>` rồi push; Pages tự phát hành lại |
| Function lỗi | deploy lại commit trước: `git checkout <commit> -- supabase/functions` → deploy; hoặc xoá function trong Dashboard (frontend sẽ báo “Trợ lý AI cần kết nối máy chủ”) |
| Tắt tạm trợ lý | `update public.ai_settings set enabled = false where id = 1;` — học sinh thấy thông báo tắt, các trang bài học không bị ảnh hưởng |
| Bảng mới gây lỗi | `drop table public.ai_provider_diagnostics;` an toàn (chỉ chứa nhật ký). **Không** drop `ai_conversations`/`ai_messages` khi còn dữ liệu học sinh |
| Migration sai | áp migration mới sửa sai; **không** dùng `db reset` |

## 10. Sau triển khai

- Thêm mục `CHANGELOG.md` (push lên `main` sẽ tự đồng bộ Supabase qua workflow).
- Kiểm tra tab **Giám sát** của Administrator Dashboard.
- Chạy lại 4 cổng QA AI Tutor trước mỗi lần push frontend (xem `docs/AI_TUTOR_QA_V850.md`).

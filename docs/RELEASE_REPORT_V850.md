# Báo cáo phát hành Bá Khí v8.5.1 — Trợ lý AI (bản triển khai thật)

Ngày: 2026-11-22 · Project Supabase: `bakhi` (`wzvslyabhizsiggurwdq`) · Nhánh: `freebuff/443a3b2a19de6a328514fd7c`
· Commit trước bản này: `d0a4976` (8.5.0)

> **Trạng thái: PARTIALLY READY.**
> Database, Edge Function, secret và giao diện **đã chạy thật và đã được kiểm tra trên
> production**. Phần duy nhất còn chặn là **hạn mức của nhà cung cấp AI**: khoá Google hiện
> trả `429 quota` / `503 high demand` cho model duy nhất còn dùng được, nên chưa có câu trả lời
> AI thật nào được tạo ra. Không có mock nào được dùng để báo “đã hoạt động”.

## Bảng trạng thái

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Security audit | ✅ PASS | 52/52 cổng `ai-tutor-api-security`; không chuỗi giống khoá trong repo; response lỗi 401 chỉ có mã lỗi + câu tiếng Việt, không stack trace, không tên khoá; `detail` provider chỉ ghi vào bảng **không policy**; không có credential trong Git |
| Database migrations | ✅ ĐÃ DEPLOY | 3 migration áp dụng trong transaction: `ai_conversations`, `ai_messages`, `ai_usage_logs`, `ai_settings`, `ai_prompt_versions`, `ai_provider_diagnostics`; `schema_migrations` có đủ 3 dòng |
| RLS | ✅ PASS (thật) | 6 bảng `rowsecurity = true`; đúng 3 policy `SELECT`; gọi REST bằng JWT học sinh: đọc được đúng 1 hội thoại của mình, đọc hội thoại người khác trả **0 dòng**, `POST` trực tiếp trả **403** |
| Edge Function | ✅ ACTIVE | `ai-tutor-api` version 6, `verify_jwt = false`; `bootstrap` trả `200` với `connected: true`, 8 chế độ, hạn mức `0/120`; thiếu phiên → `401 NO_SESSION`, JWT rác → `401 BAD_SESSION` |
| AI provider | ❌ BLOCKED (phía Google) | Khoá hợp lệ (đã qua bước xác thực, Google trả lỗi nghiệp vụ chứ không phải 401/403). `gemini-2.5-*` bị Google ngừng cấp (404). `gemini-3.8-flash` trả `503 high demand` rồi `429 quota exceeded`. Không thể tạo câu trả lời thật cho tới khi bật thanh toán hoặc cấu hình provider dự phòng |
| Frontend | ✅ PASS (đã xem bằng trình duyệt thật) | `/ai-tutor/` render đúng: 8 chế độ, gợi ý, ô soạn, sidebar hội thoại, “Hôm nay: 0/120 câu hỏi”; trạng thái đang trả lời, thẻ lỗi + **Thử lại**, empty state; F5 vẫn còn hội thoại; không lỗi console |
| Authentication | ✅ PASS (thật) | Cổng nhận diện của `bk-cloud` chạy trước trang; sau khi chọn họ tên, `bind-student-session` tạo `student_devices`; `ai-tutor-api` suy ra `student_id` từ `student_devices`, không đọc từ body |
| Rate-limit | ✅ PASS (server-side) | `bakhi_rate_limit(p_key,p_limit,p_window_seconds)` có thật trong DB, được gọi trong `chat` trước khi gọi AI; hạn mức ngày đọc từ `ai_usage_logs` 24h; burst 10/phút. Chưa bắn 11 request liên tiếp để thấy `429` (xem “NOT TESTED”) |
| Tests | ✅ 4 cổng mới + 26 cổng hồi quy xanh · ⚠️ 1 cổng có 3 FAIL từ trước | Bảng chi tiết bên dưới |
| GitHub push | ⏳ chưa push | Backend đã sẵn sàng nhưng provider chưa trả lời được; xem “Việc còn lại” |
| Production verification | ⚠️ MỘT PHẦN | Đã kiểm tra trên bản chạy thật: auth, RLS, lưu trữ, giao diện, thông báo lỗi, thử lại. **Chưa** kiểm tra được: câu trả lời AI thật, mobile, 2 tài khoản thật |
| Documentation | ✅ CẬP NHẬT | `DEPLOYMENT_V850.md` viết lại theo trạng thái thật; `AI_TUTOR_PROVIDER_SETUP.md`, `AI_TUTOR_QA_V850.md`, `AI_TUTOR_ARCHITECTURE.md`, `AI_TUTOR_SECURITY.md`, `README.md`, `CHANGELOG.md` (8.5.1) |

---

## 1. File đã tạo / chỉnh sửa trong bản này

**Tạo mới**

| Tệp | Vì sao |
|---|---|
| `supabase/migrations/20261218000001_bakhi_v850_ai_diagnostics.sql` | bảng chẩn đoán provider, RLS bật, **không policy**, thu hồi quyền bảng |
| `supabase/migrations/20261218000002_bakhi_v850_ai_model_default.sql` | đổi model mặc định + dòng `ai_settings` sang `gemini-3.8-flash` |

**Sửa**

| Tệp | Thay đổi |
|---|---|
| `supabase/functions/ai-tutor-api/index.ts` | thử lại provider 1 lần; `retry: true` dùng lại câu hỏi đã lưu (`NOTHING_TO_RETRY`); `message_count` không cộng sai; ghi `ai_provider_diagnostics`; model mặc định |
| `supabase/functions/_shared/ai-providers.ts` | `ProviderError.detail` + `sanitizeProviderDetail()`; `MODEL_SUGGESTIONS` Google → `gemini-3.8-flash` |
| `assets/bakhi/bk-ai-tutor.js` | `send(text, isRetry)`; không thêm bong bóng thứ hai khi thử lại; `hasMessage()` chống trùng |
| `assets/bakhi/bk-founder-ai.js` | gợi ý model mới |
| `assets/bakhi/bk-version.js` + 126 tệp HTML + 4 tệp phiên bản | 8.5.0 → 8.5.1, `?v=` đồng bộ |
| `CHANGELOG.md` | mục 8.5.1 |
| `docs/DEPLOYMENT_V850.md` | viết lại theo trạng thái triển khai thật |
| `docs/RELEASE_REPORT_V850.md` | báo cáo này |
| `docs/AI_TUTOR_PROVIDER_SETUP.md`, `docs/AI_TUTOR_QA_V850.md`, `docs/AI_TUTOR_ARCHITECTURE.md`, `docs/AI_TUTOR_SECURITY.md`, `README.md` | model, hạn mức, bảng chẩn đoán, kết quả thật |

## 2. Lỗi đã sửa

| # | Lỗi | Nguyên nhân gốc | Cách sửa |
|---|---|---|---|
| 1 | Mọi câu hỏi trả `MODEL_NOT_FOUND` | Google **ngừng cấp** `gemini-2.5-flash` cho người dùng mới (thông điệp thật thu được từ provider) | đổi mặc định sang `gemini-3.8-flash` ở code + migration |
| 2 | Không ai biết vì sao khoá/model sai | `mapHttpError` đọc thân lỗi rồi **vứt đi**; chỉ còn một câu chung | thêm `ai_provider_diagnostics` (chỉ service_role) + lọc khoá trước khi ghi |
| 3 | **Thử lại nhân đôi câu hỏi** | client gửi lại nguyên văn và máy chủ ghi thêm dòng `user` | `retry: true` → dùng lại đúng dòng đã lưu; UI không thêm bong bóng; `hasMessage()` chống trùng |
| 4 | Provider quá tải thoáng qua là mất lượt | không có lần thử thứ hai | thử lại 1 lần cách 0,9 giây (vẫn có giới hạn, không vòng lặp) |
| 5 | Trang báo “thiết bị chưa nhận diện” dù đã chọn tên | `ai-tutor-api` gọi **trước** khi `bind-student-session` ghi `student_devices` | không phải lỗi code: nút **Tải lại** + thông báo hướng dẫn đã đúng; đã xác minh F5 là vào được |

Lỗi 1–4 đều là lỗi **thật**, phát hiện bằng kiểm thử đầu-cuối trên production, không phải suy đoán.

## 3. Test đã chạy

### 3.1. Cổng mới (offline)

| Cổng | Kết quả |
|---|---|
| `tools/qa/ai-tutor-model-routing.js` | **41 PASS / 0 FAIL** |
| `tools/qa/ai-tutor-api-security.js` | **52 PASS / 0 FAIL** |
| `tools/qa/ai-tutor-smoke.js` | **34 PASS / 0 FAIL** |
| `tools/qa/ai-tutor-rendering-security.js` | **14 PASS / 0 FAIL** |

### 3.2. Hồi quy (đều xanh)

`content-integrity verify` (“không có nội dung giáo dục nào bị thay đổi”, 126 trang),
`supabase-config` (13 function ↔ `config.toml`, TypeScript OK), `version-audit`,
`bump-version --check`, `build-search-index --check`,
`smoke`, `cloud-smoke`, `shell-smoke`, `admin-smoke`, `report-smoke`, `chat-smoke`, `dev-smoke`,
`gamification-smoke`, `gamification-navigation-smoke`, `avatar-sync-smoke`, `badges-smoke`,
`themes-smoke`, `search-index-smoke`, `mistake-notebook-smoke`, `learning-analytics-smoke`,
`study-planner-smoke`, `revision-engine-smoke`, `learning-data-integrity`, `learning-sync-smoke`.

### 3.3. Test thật trên production (không phải unit test)

| Việc | Kết quả |
|---|---|
| `POST ai-tutor-api` không có Authorization | 401 `NO_SESSION` |
| JWT rác | 401 `BAD_SESSION` |
| `bootstrap` với người dùng thật | 200, `connected: true`, 8 chế độ, `usage 0/0` |
| `chat` | 502 `MODEL_NOT_FOUND` → sau khi đổi model: 502 `PROVIDER_DOWN` (503) → 502 `QUOTA` (429) |
| Lưu trữ | 1 hội thoại + 1 tin nhắn + 1 dòng usage trong DB |
| Tải lại trang | hội thoại còn trong danh sách |
| RLS đọc chéo | 0 dòng |
| RLS ghi trực tiếp | 403 |
| Thử lại (server) | vẫn **1** dòng `user` |
| Thử lại (trình duyệt) | vẫn **1** bong bóng |
| Dữ liệu kiểm thử | đã xoá sạch: 0 học sinh, 0 hội thoại, 0 tin nhắn, 0 usage |

### 3.4. FAIL có sẵn từ trước

`tools/qa/gamification-health.js` → 3 FAIL về `bk_gam_health_drift`. Đã đối chiếu: bản 8.5.0 và
8.5.1 **không sửa** migration gamification nào (chỉ thêm 3 migration `ai_*`). Trạng thái trước và
sau giống nhau, không phải regression của Trợ lý AI. Chưa sửa vì ngoài phạm vi.

### 3.5. NOT TESTED

- Câu trả lời AI thật (chặn bởi hạn mức provider).
- `429 RATE_LIMIT` bằng 11 request liên tiếp (cần provider sống để không bị `QUOTA` chặn trước).
- Hai tài khoản thật cùng lúc; giao diện trên điện thoại thật.
- Provider dự phòng (chưa có khoá thứ hai).

## 4. Lệnh đã thực thi (thật)

```bash
# Xác minh project + bí mật (chỉ tên)
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" .../v1/projects/$REF/secrets

# Áp 3 migration (mỗi cái một transaction, có ghi schema_migrations)
curl -X POST .../v1/projects/$REF/database/query --data-binary @mig.json    # 201, 201, 201

# Deploy function
npx supabase functions deploy ai-tutor-api --no-verify-jwt --use-api --yes --remote=$REF
# → "Deployed Functions on project wzvslyabhizsiggurwdq: ai-tutor-api"

# Kiểm tra thật
node artifacts/e2e-ai-tutor.js       # auth, bootstrap, chat, lưu trữ, RLS
node artifacts/retry-check.js        # thử lại không tạo dòng trùng
node artifacts/model-probe.js        # dò model khả dụng
```

Các script kiểm thử nằm trong `artifacts/` (đã gitignore, không phát hành).

## 5. Đã deploy thành công

- 3 migration trên database production.
- Edge Function `ai-tutor-api` (version 6, ACTIVE).
- Secret `AI_TUTOR_API_KEY` đã có (chỉ kiểm tra tên).

## 6. Còn BLOCKED

**Hạn mức nhà cung cấp AI.** Đây là việc của chủ project, không sửa được bằng mã:

- Google trả `429 quota exceeded` cho `gemini-3.8-flash` và trước đó là `503 high demand`.
- Model `gemini-2.5-*` đã bị Google ngừng cấp (404).

## 7. Việc người dùng cần làm

1. **Mở khoá provider** (chọn một):
   - Bật thanh toán cho project Google AI, **hoặc**
   - Tạo khoá Groq/OpenRouter/Mistral/DeepSeek và đặt `AI_TUTOR_FALLBACK_API_KEY`
     (*Project Settings → Edge Functions → Secrets*), rồi trong *Founder Dashboard → AI Tutor*
     đặt **Nhà cung cấp dự phòng** + **Model dự phòng**.
2. Bấm **Kiểm tra kết nối** trong tab AI Tutor; nếu lỗi, đọc
   `select detail from ai_provider_diagnostics order by created_at desc limit 5;`
   (chạy trong SQL Editor — bảng này không mở cho trình duyệt).
3. Mở `/ai-tutor/`, chọn họ tên, hỏi thử một câu; sau đó F5 xem hội thoại còn không.
4. Trả lời tôi “provider đã thông” để tôi push `main` và kiểm tra production.

## 8. URL cần kiểm tra

| Mục | URL |
|---|---|
| Trang Trợ lý AI | `https://minhtruk.github.io/bakhi/ai-tutor/` (sau khi push) |
| Trang chủ (nhận diện) | `https://minhtruk.github.io/bakhi/` |
| Founder Dashboard | `https://minhtruk.github.io/bakhi/founder/` → tab **AI Tutor** |
| Function | `https://wzvslyabhizsiggurwdq.supabase.co/functions/v1/ai-tutor-api` |
| Dashboard function | `https://supabase.com/dashboard/project/wzvslyabhizsiggurwdq/functions` |

## 9. Trạng thái cuối cùng của AI Tutor

**Tích hợp xong, chạy được, chưa trả lời được.**

Đã xác minh thật: xác thực người dùng, RLS (đọc chéo bị chặn, ghi trực tiếp bị chặn), lưu hội
thoại và tin nhắn, hạn mức/usage, giao diện 8 chế độ, trạng thái đang trả lời, xử lý lỗi và
thử lại, không lộ khoá. Điều duy nhất chưa có là **nội dung trả lời từ AI**, vì khoá Google đã
hết hạn mức — sau khi mở khoá (hoặc cấu hình dự phòng) thì không cần sửa thêm mã.

---

## 8. Bản 8.5.2 — cấu hình provider Groq (CHƯA TRIỂN KHAI)

Trạng thái của bản 8.5.2 trong mã nguồn, tách biệt hoàn toàn với bản 8.5.1 đang chạy trên
production:

| Hạng mục | Trạng thái |
|---|---|
| Mã nguồn (adapter, prompt budget, Edge Function, Founder UI) | ✅ đã sửa |
| Migration `20261218000003_bakhi_v852_ai_provider_groq.sql` | ⏳ đã viết, **chưa áp** |
| Edge Function `ai-tutor-api` bản 8.5.2 | ⏳ **chưa deploy** |
| Frontend 8.5.2 (126 tệp HTML + `?v=8.5.2`) | ⏳ **chưa push** |
| Secrets Groq / Google | ⏳ người quản trị phải đặt trong Supabase Secrets |
| Kết nối Groq thật | ❌ **chưa kiểm thử** — không có khoá hợp lệ trong môi trường kiểm thử |
| Cổng QA offline (6 cổng AI Tutor + 5 cổng nền) | ✅ đã chạy, tất cả PASS |

Điều này có nghĩa: **production vẫn là 8.5.1 với Google Gemini**. Không có tuyên bố nào trong
tài liệu này nói Groq đã chạy thật.

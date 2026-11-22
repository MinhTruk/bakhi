# Báo cáo phát hành Bá Khí v8.5.0 — Trợ lý AI

Ngày: 2026-11-22 · Phiên bản trước: 8.4.4 · Nhánh: `freebuff/443a3b2a19de6a328514fd7c`

> **Trạng thái cuối: PARTIALLY READY.**
> Toàn bộ mã, giao diện, schema, tài liệu và QA offline đã xong. **Chưa** triển khai
> Supabase/GitHub Pages và **chưa** kết nối AI thật, vì (a) chưa có khoá API đặt trong
> Supabase Secrets và (b) môi trường làm việc này không có trình duyệt để đăng nhập
> Supabase CLI (không thể `supabase login` / `convex`-style interactive flow).
> Không có mock response nào được dùng để báo cáo “AI đã hoạt động”.

---

## 1. Architecture

| Hạng mục | Nội dung |
|---|---|
| Luồng | GitHub Pages → Supabase Auth → Edge Function `ai-tutor-api` → AI Provider |
| Frontend | `assets/bakhi/bk-ai-tutor.js` + `.css`, `ai-tutor/index.html`, nút “Hỏi AI” trên 121 trang |
| Quản trị | `assets/bakhi/bk-founder-ai.js` + `.css`, tab **AI Tutor** trong Administrator/Founder Dashboard |
| Provider đã tích hợp | `google` (Generative Language), `openai`, `groq`, `openrouter`, `mistral`, `deepseek`, `custom` (OpenAI-compatible) |
| Model | Không hardcode. Chọn trong dashboard; gợi ý: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gpt-4.1-mini`, `llama-3.3-70b-versatile`, … |
| Routing | `model_practice` → luyện tập; `model_complex` → từng bước/kiểm tra/phân tích lỗi/câu > 600 ký tự; `model_simple` → gợi ý/tóm tắt/câu ngắn; còn lại `model` |
| Fallback | Chỉ lỗi tạm thời (`TIMEOUT`, `PROVIDER_DOWN`, `RATE_LIMIT`, `EMPTY_RESPONSE`), chỉ khi đã cấu hình `fallback_provider` + `fallback_model` + `AI_TUTOR_FALLBACK_API_KEY`. Không gửi lặp vô hạn. |
| 8 chế độ | explain, steps, hint, check, practice, mistakes, summary, socratic |
| Streaming | **Không** triển khai ở 8.5.0 (xem mục 6). Có trạng thái “đang suy nghĩ” + nút Dừng huỷ request thật bằng `AbortController`. |

## 2. API Key & Security

### 2.1. Tên secret và vị trí

| Secret | Vai trò |
|---|---|
| `AI_TUTOR_API_KEY` | khoá provider chính (**bắt buộc**) |
| `AI_TUTOR_FALLBACK_API_KEY` | khoá provider dự phòng |
| `AI_TUTOR_PROVIDER`, `AI_TUTOR_MODEL` | giá trị mặc định ban đầu |
| `AI_TUTOR_BASE_URL`, `AI_TUTOR_FALLBACK_BASE_URL` | chỉ cho provider `custom` |
| `AI_TUTOR_MOCK` | chỉ QA, **không** ở production |

Vị trí: Supabase → **Project Settings → Edge Functions → Secrets**. Không nơi nào khác.
Cách thay khoá: `docs/AI_TUTOR_API_KEY_SETUP.md` §7 — không sửa mã, không deploy lại frontend,
lịch sử hội thoại giữ nguyên.

### 2.2. Kết quả kiểm tra bảo mật

`node tools/qa/ai-tutor-api-security.js` → **52/52 PASS**, gồm:

- ✅ Không có chuỗi giống khoá API/token thật trong toàn repo (quét 5 mẫu: Google, OpenAI,
  `AQ.`, Supabase PAT, JWT dài).
- ✅ Không tệp nào gán giá trị thật cho `AI_TUTOR_API_KEY`.
- ✅ Frontend không chứa địa chỉ nhà cung cấp AI (`generativelanguage`, `api.openai.com`, …).
- ✅ Frontend chỉ lấy phiên qua `BKCloud.chatClient()`, không tự tạo Supabase client.
- ✅ `innerHTML` đúng **1** chỗ trong `bk-ai-tutor.js` (đầu ra KaTeX, `trust:false`).
- ✅ Edge Function: `callerUserId` → `student_devices`, không đọc `student_id` từ body,
  kiểm tra `is_active`, `bakhi_rate_limit`, hạn mức ngày, chống gửi trùng, `FOUNDER_ONLY`,
  `logAction`, lưu câu hỏi trước khi gọi AI, xoá mềm.
- ✅ Migration: RLS bật cả 5 bảng, **3 policy SELECT**, không policy ghi, không `using (true)`,
  không cột khoá.
- ✅ `config.toml` + `bk-supabase.config.js` khai báo `ai-tutor-api`.
- ✅ `.env.example` chỉ placeholder.

`node tools/qa/ai-tutor-rendering-security.js` → **14/14 PASS**: `<script>`, `<img onerror>`,
`<iframe>`, `[x](javascript:…)` trong câu trả lời đều **không** tạo phần tử thật và **không**
chạy; code block chỉ là văn bản.

### 2.3. Xác nhận khoá không bị công bố

- Không có khoá trong `git diff` của bản này.
- Không có khoá trong tài liệu (14 tệp `docs/AI_TUTOR_*` + `DEPLOYMENT_V850.md` chỉ nêu **tên**
  secret).
- Không có khoá trong `ai_settings` (bảng cố ý không có cột khoá).
- Không có khoá trong response: `publicConfig()` chỉ trả boolean.

> **Cần làm ngay (bảo mật):** một khoá nhà cung cấp đã được dán trong **nội dung yêu cầu**
> của phiên làm việc này. Hãy coi khoá đó là **đã lộ**: thu hồi trên trang quản trị của nhà
> cung cấp, tạo khoá mới, và chỉ đặt khoá mới vào Supabase Secrets. Không dùng lại khoá cũ,
> không gửi khoá qua chat, không ghi vào tệp trong repo.

## 3. Features

| Nhóm | Trạng thái |
|---|---|
| Chat + hội thoại | ✅ tạo, tiếp tục, tìm, đổi tên, xoá (xác nhận, xoá mềm), sao chép, dừng, thử lại |
| 8 chế độ học tập | ✅ hướng dẫn riêng từng chế độ ở máy chủ |
| Context Awareness | ✅ tự nhận biết môn/bài/trang; API `explain()` / `analyzeMistake()`; danh sách trắng |
| Ngữ cảnh có nhãn + minh bạch nguồn | ✅ khối `---BEGIN-CONTEXT---`, câu nhắc lại sau khối |
| Cá nhân hoá | ✅ chọn chế độ; giới hạn/token hiển thị; tôn trọng `prefers-reduced-motion` |
| Tích hợp module | ⚠️ **một phần** — menu, tab dashboard, nút “Hỏi AI” toàn site đã có; **chưa** chèn nút
  trực tiếp vào từng màn Quiz/Reading/Listening (xem mục 6) |
| Founder management | ✅ trạng thái, provider/model, routing, limits, kiểm tra kết nối, System Prompt + lịch sử/khôi phục |
| Gamification | ✅ **không** bị ảnh hưởng — AI không có tool calling, không ghi XP/thành tựu |
| Chat cũ | ✅ không sửa `chat-api` / `bk-chat.js` |

## 4. Database

| Hạng mục | Nội dung |
|---|---|
| Migration | `supabase/migrations/20261218000000_bakhi_v850_ai_tutor.sql` (mới, idempotent) |
| Bảng | `ai_conversations`, `ai_messages`, `ai_usage_logs`, `ai_settings`, `ai_prompt_versions` |
| RLS | bật cả 5; 3 policy `SELECT` (`bakhi_current_student_id()`); 0 policy ghi |
| Ràng buộc | FK cascade, `check` cho `mode`/`role`/`id = 1`, `unique(version)`, độ dài cột |
| Chỉ mục | theo `student_id` + thời gian cho cả 3 bảng người dùng |
| Toàn vẹn | khối `do $$ … $$` ném lỗi nếu thiếu bảng/cấu hình |
| Migration dữ liệu | không cần — trước 8.5.0 chưa có dữ liệu AI |
| Áp dụng | **CHƯA CHẠY** trên project (xem mục 7) |

## 5. Usage & Cost

| Hạng mục | Giá trị |
|---|---|
| Burst | 10 request / 60 giây / học sinh (`bakhi_rate_limit`) |
| Hạn mức ngày | `daily_requests` 120 · `daily_tokens` 120 000 (mặc định, sửa được) |
| Giới hạn khác | `max_output_tokens` 1 600 · `timeout_ms` 45 000 · ngữ cảnh 12 lượt |
| Usage tracking | `ai_usage_logs` mỗi lần gọi (kể cả lỗi và `admin.test`) + `bakhi_ai_usage()` 24h |
| Fallback | cấu hình được; **chưa** bật (chưa có khoá dự phòng) |
| Miễn phí? | **Không khẳng định.** Tài liệu yêu cầu đọc trang giá/quota chính thức trước khi bật cho nhiều học sinh. |
| Giới hạn còn tồn tại | hạn mức là cửa sổ trượt 24h (không reset 0h); bộ đếm chống-trim trong bộ nhớ chỉ trong một isolate; chưa có cảnh báo tự động khi gần chạm hạn mức |

## 6. QA

### 6.1. Cổng mới — PASS

| Cổng | Kết quả |
|---|---|
| `tools/qa/ai-tutor-model-routing.js` | **41 PASS / 0 FAIL** |
| `tools/qa/ai-tutor-api-security.js` | **52 PASS / 0 FAIL** |
| `tools/qa/ai-tutor-smoke.js` | **34 PASS / 0 FAIL** |
| `tools/qa/ai-tutor-rendering-security.js` | **14 PASS / 0 FAIL** |

### 6.2. Hồi quy — PASS

`content-integrity verify` (125 tệp nội dung, “không có nội dung giáo dục nào bị thay đổi”),
`supabase-config` (13 function, TypeScript của `ai-tutor-api` + 2 `_shared/ai-*.ts`),
`version-audit`, `bump-version --check`, `build-search-index --check`,
`smoke`, `cloud-smoke`, `shell-smoke`, `admin-smoke`, `report-smoke`, `chat-smoke`,
`gamification-smoke`, `gamification-navigation-smoke`, `avatar-sync-smoke`, `badges-smoke`,
`dev-smoke`, `themes-smoke`, `search-index-smoke`, `mistake-notebook-smoke`,
`learning-analytics-smoke`, `study-planner-smoke`, `revision-engine-smoke`,
`learning-data-integrity`, `learning-sync-smoke`.

Ba cổng cũ đã được cập nhật **có chủ đích** vì hành vi thay đổi (không nới lỏng để “cho qua”):

- `cloud-smoke`, `admin-smoke`: 14 → **15 tab** (thêm tab AI Tutor), cập nhật thứ tự/nhãn.
- `shell-smoke`: thêm “Trợ lý AI” vào thứ tự menu.
- `integrate-pages.js`: `ensureReport` **bỏ qua** `admin/`, `founder/` — trước đó công cụ chèn
  `bk-report.js` vào dashboard, trái với AGENTS §4.2 (`report-smoke` phát hiện). Đã xoá thẻ
  khỏi `admin/index.html`.
- `inject-shell.js`: thêm `founder/index.html` vào SKIP — chèn khối shell vào dashboard làm
  nạp trùng `bk-badges.js` (`version-audit` phát hiện).

### 6.3. FAIL — có sẵn từ trước, không liên quan

`tools/qa/gamification-health.js` → 3 FAIL về `bk_gam_health_drift` (đối chiếu sổ XP,
quyền service_role, công thức cấp). Bản này **không** sửa migration gamification nào
(chỉ thêm một migration mới `ai_*`), nên đây là lỗi có từ trước. Chưa sửa vì ngoài phạm vi
Trợ lý AI — cần một bản sửa riêng.

### 6.4. NOT RUN — cần môi trường thật

| Hạng mục | Lý do |
|---|---|
| Gọi provider thật (thành công/thất bại/quota/timeout) | chưa có khoá API |
| `supabase db push` + kiểm tra RLS bằng 2 tài khoản | không có Supabase CLI session trong môi trường này |
| Rate limit thật (`bakhi_rate_limit`) | cần DB |
| Đăng nhập Anonymous Auth, `student_devices` | cần DB |
| Kiểm tra giao diện bằng trình duyệt / ảnh chụp | môi trường không có trình duyệt; **chưa ai nhìn thấy giao diện chạy thật** |
| Kiểm tra production | chưa triển khai |

## 7. Deployment

| Hạng mục | Trạng thái |
|---|---|
| Commit | ✅ `feat(8.5.0): Trợ lý AI — đa nhà cung cấp, 8 chế độ, ngữ cảnh học tập` trên nhánh `freebuff/443a3b2a19de6a328514fd7c` — xem `git log -1` để lấy hash (amend làm hash đổi sau mỗi lần sửa báo cáo) |
| Push lên `main` | ❌ **không thực hiện** — đẩy lên Pages lúc này sẽ phát hành nút “Hỏi AI” trỏ tới
  Edge Function chưa deploy, khiến mọi trang hiện lỗi AI. Push sau khi đã áp migration + deploy function. |
| Supabase migration | ❌ chưa (`supabase db push`) |
| Supabase Edge Function | ❌ chưa (`supabase functions deploy ai-tutor-api --no-verify-jwt`) |
| Supabase Secrets | ❌ chưa có `AI_TUTOR_API_KEY` |
| GitHub Pages | ❌ chưa |
| Kiểm tra AI Provider | ❌ chưa |

Thứ tự cần làm để đưa lên production: `docs/DEPLOYMENT_V850.md`.

## 8. Final Status

**PARTIALLY READY.**

Đã xong: kiến trúc đa nhà cung cấp, Edge Function, provider adapter, 8 chế độ, ngữ cảnh học tập,
lịch sử hội thoại, tab quản trị Founder, giới hạn chi phí, RLS, giao diện, 14 tài liệu,
4 cổng QA mới, toàn bộ cổng hồi quy xanh.

Còn thiếu (theo thứ tự cần làm):

1. Đặt `AI_TUTOR_API_KEY` trong Supabase Secrets (thu hồi khoá đã lộ trước đó).
2. `supabase db push` + `supabase functions deploy ai-tutor-api --no-verify-jwt`.
3. Chọn provider/model và bấm **Kiểm tra kết nối** trong Founder Dashboard.
4. Push `main` để Pages phát hành.
5. Chạy danh sách kiểm tra thủ công trong `docs/AI_TUTOR_QA_V850.md` §4 (auth, RLS 2 tài khoản,
   rate limit, provider thật) và xem giao diện bằng mắt.
6. (Hạng mục tiếp theo) streaming; nút “Giải thích câu này” trong từng màn Quiz/Reading/Listening;
   tóm tắt lịch sử cũ cho hội thoại dài.

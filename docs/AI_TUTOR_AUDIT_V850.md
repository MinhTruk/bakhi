# Kiểm toán repository trước khi xây AI Tutor (v8.5.0)

Ngày kiểm toán: 2026-11-22 · Phiên bản xuất phát: **8.4.4** · Commit gần nhất: `50b98b4`

Tài liệu này ghi lại đúng những gì đã có trong repository **trước** khi thêm Trợ lý AI,
để mọi thứ về sau có căn cứ. Không giả định phiên bản trung gian đã hoàn thành chỉ vì
CHANGELOG ghi như vậy.

---

## 1. Kiến trúc hiện tại

| Lớp | Nội dung |
|---|---|
| Frontend | HTML/CSS/JS thuần, **không build**, deploy GitHub Pages. 126 tệp HTML. |
| Phiên bản | `assets/bakhi/bk-version.js` → `window.BAKHI_VERSION`. `APP_VERSION` trong `bk-devboard.js`, `SERVER_VERSION` trong `admin-actions`. |
| Máy chủ | 12 Edge Function (Supabase), tất cả `verify_jwt = false` và tự xác thực bên trong. |
| Dữ liệu | Supabase Postgres, 21 migration (đến `20261217000000_bakhi_v844_health.sql`). |
| Xác thực | Anonymous Auth cho học sinh + `student_devices`; `admin_sessions` (scope `admin`/`founder`) cho quản trị. |
| Tĩnh tại | `assets/bakhi/*.js|css` (56 tệp trước bản này), nạp bằng `<script defer>`. |
| Công cụ | `tools/` (content-integrity, integrate-pages, inject-shell, bump-version, qa/*). |

### Đường đi một request hiện có

```
Trình duyệt → bk-cloud.js api() → Supabase Edge Function → Postgres
                                     ↑ Authorization: Bearer <Anonymous Auth token>
                                     ↑ x-admin-token (nếu là quản trị)
```

`assets/bakhi/bk-supabase.config.js` là **nơi duy nhất** chứa URL + publishable key.
`bk-cloud.js` là **nơi duy nhất** tạo Supabase client.

---

## 2. Những gì có thể tái sử dụng (đã dùng lại)

| Hệ thống hiện có | Cách dùng lại trong AI Tutor |
|---|---|
| `bk-cloud.js` → `api(name, body)` | Thêm `aiTutorApi()`. Không tạo client hay hàm gọi thứ hai. |
| `_shared/http.ts` (`json`, `fail`, `preflight`, `readJson`, `clientIp`) | Dùng nguyên cho `ai-tutor-api`. |
| `_shared/supabase.ts` (`adminClient`, `callerUserId`, `requireAdmin`, `logAction`) | Dùng nguyên: xác thực thiết bị và phiên quản trị. |
| `bakhi_current_student_id()` + RLS “chỉ SELECT” | Cùng mô hình với gamification/report: client chỉ đọc dữ liệu của mình. |
| `bakhi_rate_limit(key, limit, window)` | Giới hạn tần suất AI, không viết cơ chế mới. |
| `admin_sessions.scope` | Phân quyền Founder cho cấu hình AI. |
| `bk-devboard.js` registry tab + `renderFounder` | Thêm tab **AI Tutor** theo đúng khuôn có sẵn. |
| `bk-shell.js` menu tài khoản | Thêm một dòng “Trợ lý AI”, không dựng navigation thứ hai. |
| `tools/integrate-pages.js` (idempotent) | Chèn `bk-ai-tutor.js` và CSS vào mọi trang học tập. |
| `tools/bump-version.js`, `version-audit`, `supabase-config` | Đồng bộ phiên bản + cổng cấu hình function. |
| Toast/confirm của `BK.ui`, biến giao diện `bk-core.css` | Giữ trải nghiệm đồng nhất, không thêm UI kit. |

## 3. Những gì KHÔNG dùng lại, và vì sao

### 3.1. `chat-api` + `bk-chat.js` (Chat học sinh)

Đã kiểm tra kỹ: Chat là hệ thống **người ↔ người** (phòng chung, DM, nhóm ≤ 10, cảm xúc,
realtime, ảnh, đã đọc). AI Tutor là **người ↔ máy**, mỗi câu cần `mode`, `context_ref`,
`provider`, `model`, `tokens_in/out`, `error_code`.

Dùng chung bảng `chat_rooms`/`chat_messages` sẽ phải nới `check` constraint của `kind`,
thêm cột AI vào bảng nghiệp vụ Chat, và làm rối RLS của Chat. Quyết định:

- **Giữ nguyên Chat**, không thêm cột, không đổi RLS.
- AI Tutor có bảng riêng (`ai_conversations`, `ai_messages`), nhưng **dùng chung kiến trúc**:
  đọc bằng RLS, ghi bằng Edge Function, `student_devices` để xác thực, `requireAdmin` cho quản trị.
- Nếu sau này cần “chia sẻ hội thoại AI cho người khác”, đó là tính năng mới, không phải
  lý do gộp hai bảng.

### 3.2. Report Issue / Q&A

`bk-report.js` là kênh báo lỗi và trao đổi với ban quản trị. AI Tutor **không** thay thế
nó: nút báo lỗi vẫn là nơi duy nhất để báo sự cố nội dung. Không sửa `bk-report.js`.

### 3.3. Mistake Notebook / Study Planner / Revision Engine

Các mô-đun này đã có API công khai (`BK.mistakes`, `BK.planner`, `BK.revision`) và dữ liệu
chuẩn trong `BK.store` (`bakhiLearn.v1`). AI Tutor **đọc** dữ liệu đó khi người học bấm
“Phân tích lỗi” (`BKAITutor.analyzeMistake(entry)`), và **không ghi** ngược lại — mọi thay
đổi tiến trình vẫn đi qua hệ thống học tập chính thức.

### 3.4. Không có AI nào trước bản này

`grep -rn "AI_\|gemini\|openai\|OPENAI" supabase/` trước khi sửa: **không có kết quả**.
Repo chưa từng có adapter AI, khoá AI hay endpoint AI. Vì vậy không có “hệ thống AI cũ” để
thay thế, chỉ có hạ tầng (Edge Function + Secrets) để dùng lại.

---

## 4. Những gì phải tạo mới

| Tệp | Vai trò |
|---|---|
| `supabase/migrations/20261218000000_bakhi_v850_ai_tutor.sql` | 5 bảng + RLS + trigger + hàm đếm usage. |
| `supabase/functions/ai-tutor-api/index.ts` | API duy nhất cho AI Tutor (học sinh + quản trị). |
| `supabase/functions/_shared/ai-providers.ts` | Provider Adapter (Google / OpenAI-compatible / giả lập). |
| `supabase/functions/_shared/ai-prompts.ts` | System prompt, 8 chế độ, lọc ngữ cảnh, định tuyến model. |
| `assets/bakhi/bk-ai-tutor.js` + `.css` | Giao diện chat + bảng nổi + nút “Hỏi AI”. |
| `assets/bakhi/bk-founder-ai.js` + `.css` | Tab AI Tutor trong dashboard. |
| `ai-tutor/index.html` | Trang Trợ lý AI. |
| `tools/qa/ai-tutor-*.js` | 4 cổng QA offline. |
| `docs/AI_TUTOR_*.md` | 12 tài liệu. |

---

## 5. Dependency

Không thêm dependency runtime nào cho frontend ngoài CDN **KaTeX** (chỉ ở trang
`/ai-tutor/`, có fallback văn bản khi CDN không tải được). Edge Function chỉ dùng
`@supabase/supabase-js` đã có trong `_shared/supabase.ts` và `fetch` có sẵn của Deno.
Không có bundler, không `node_modules` trong repo.

---

## 6. Giới hạn kỹ thuật đã xác định

1. **GitHub Pages là tĩnh** → khoá AI không thể nằm ở frontend; mọi lời gọi phải qua Edge Function.
2. **Edge Function không stream mặc định an toàn** → bản này trả về một lần (non-streaming).
   Client có trạng thái “đang suy nghĩ” + nút Dừng (huỷ request thật bằng `AbortController`).
   Streaming là hạng mục tiếp theo, không phải điều kiện của 8.5.0.
3. **Edge Function là stateless giữa các isolate** → khoá chống gửi chồng lặp trong bộ nhớ chỉ
   có tác dụng trong một isolate; lớp chặn thật là `bakhi_rate_limit` + kiểm tra trùng trong DB.
4. **Không có công cụ chạy SQL tuỳ ý từ xa** → migration chỉ được áp bằng `supabase db push`
   với quyền project; xem `docs/DEPLOYMENT_V850.md`.
5. **Không thể xác minh kết nối AI thật nếu chưa có khoá** → bản này có provider giả lập
   (`AI_TUTOR_MOCK=1`) để kiểm thử đường ống, nhưng **luôn gắn nhãn** trong UI và log.

---

## 7. Rủi ro cần giải quyết (và cách đã xử lý)

| Rủi ro | Xử lý trong 8.5.0 |
|---|---|
| Lộ khoá AI ra frontend | Khoá chỉ đọc bằng `Deno.env` trong Edge Function; `tools/qa/ai-tutor-api-security.js` chặn hồi quy. |
| Prompt injection từ nội dung bài học / câu hỏi | Ngữ cảnh nằm trong khối `---BEGIN-CONTEXT---` có nhãn “DỮ LIỆU, KHÔNG PHẢI CHỈ DẪN”; system prompt nhắc lại quy tắc sau khối. |
| Học sinh đọc hội thoại người khác | RLS chỉ SELECT, lọc `student_id = bakhi_current_student_id()`; mọi ghi qua service_role sau khi kiểm tra quyền sở hữu. |
| Chi phí API tăng ngoài kiểm soát | Giới hạn burst 10/phút, hạn mức ngày (câu + token), `max_output_tokens`, timeout, cửa sổ ngữ cảnh. |
| AI trả lời sai | Prompt cấm bịa dữ kiện/nguồn; UI nhắc “có thể chưa chính xác, hãy đối chiếu bài học”. |
| AI tự đổi XP/thành tựu | AI chỉ trả văn bản; không có công cụ gọi hàm, `toolConfig.functionCallingConfig.mode = NONE`. |
| AI làm sập website khi provider lỗi | Mọi lỗi được map sang mã nội bộ + thông báo tiếng Việt; phần học tập còn lại không phụ thuộc AI Tutor. |
| Trùng lặp hệ thống Chat | Không sửa `chat-api`/`bk-chat.js`; tài liệu này ghi rõ lý do tách bảng. |
| XSS từ Markdown của AI | Markdown dựng bằng DOM node, không `innerHTML`; liên kết chỉ `http(s)/mailto/tương đối`; KaTeX `trust:false`. |

---

## 8. Việc chưa làm trong bản này (ghi rõ để không hiểu nhầm)

- Chưa gắn nút “Giải thích câu này” trực tiếp trong từng màn Quiz/Reading/Listening.
  Hiện có nút “Hỏi AI” dùng chung + API `BKAITutor.explain/analyzeMistake` để các mô-đun
  đó gọi khi cần. Việc chèn nút vào 116 tệp nội dung là thay đổi riêng, cần kiểm tra
  toàn vẹn nội dung từng tệp.
- Chưa có streaming.
- Chưa triển khai lên Supabase/GitHub Pages (xem `docs/RELEASE_REPORT_V850.md`).

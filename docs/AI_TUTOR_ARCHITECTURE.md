# Kiến trúc Trợ lý AI Bá Khí (8.5.0)

## 1. Luồng tổng thể

```
Người học (GitHub Pages, HTML tĩnh)
   │  bk-ai-tutor.js — chỉ gửi câu hỏi + ngữ cảnh đã lọc
   ▼
Supabase Auth (Anonymous Auth của thiết bị)
   │  Authorization: Bearer <access_token>
   ▼
Edge Function  ai-tutor-api          ← nơi DUY NHẤT giữ logic AI
   │  • xác thực thiết bị → student_id
   │  • giới hạn tần suất + hạn mức ngày
   │  • dựng system prompt + khối ngữ cảnh
   │  • chọn model (định tuyến) → gọi provider
   │  • lưu hội thoại, ghi usage log
   ▼
AI Provider (Google Gemini, OpenAI, Groq, OpenRouter, Mistral, DeepSeek, custom)
   ▲
   └── API key: chỉ trong Supabase Edge Function Secrets
```

Không có VPS, không có server chạy 24/7. Toàn bộ nằm trong hạ tầng sẵn có
(GitHub Pages + Supabase).

## 2. Thành phần

### 2.1. Frontend — `assets/bakhi/bk-ai-tutor.js`

| Trách nhiệm | Không làm |
|---|---|
| Giao diện chat, danh sách hội thoại, chế độ học tập | Không giữ khoá AI |
| Gửi câu hỏi + ngữ cảnh đã lọc | Không tự tính usage hay tự cộng/trừ hạn mức |
| Render Markdown an toàn, công thức, code block | Không dựng HTML từ chuỗi dữ liệu |
| Trạng thái loading/error/retry, Dừng request | Không gọi thẳng nhà cung cấp AI |
| Hiển thị hạn mức còn lại (chỉ đọc) | Không đọc dữ liệu học sinh khác |

Hai hình thức, một mô-đun duy nhất:

- **Trang đầy đủ** — `/ai-tutor/` gọi `BKAITutor.mount(root)`.
- **Bảng nổi** — mọi trang học tập có nút “Hỏi AI”; gọi `BKAITutor.open({context})`.
  Kèm ngữ cảnh tự nhận biết (môn theo thư mục, bài theo `<h1>`, đường dẫn trang).

### 2.2. Máy chủ — `supabase/functions/ai-tutor-api/index.ts`

Một function, hai nhánh quyền:

- **Học sinh** (`Authorization` + `student_devices`): `bootstrap`, `conversations.list`,
  `conversation.create|rename|delete`, `messages.list`, `chat`, `usage`.
- **Quản trị** (`x-admin-token` + `admin_sessions.scope`): `admin.status`,
  `admin.settings.save`, `admin.prompt.save|versions|restore`, `admin.test`.
  Chỉ `scope = founder` được ghi (`FOUNDER_ONLY`).

Quy tắc bất di bất dịch:

1. Không đọc `student_id` từ body. Luôn suy ra từ thiết bị đã xác thực.
2. Kiểm tra quyền sở hữu hội thoại trước mọi thao tác đọc/ghi/xoá.
3. Lưu câu hỏi **trước** khi gọi AI để lỗi mạng không làm mất nội dung.
4. Xoá hội thoại là **xoá mềm** (`deleted_at`), không mất dữ liệu.
5. Mọi lỗi provider được map sang mã nội bộ + thông báo tiếng Việt.

### 2.3. Provider Adapter — `_shared/ai-providers.ts`

```ts
callProvider({ provider, model, role, system, messages, maxTokens, timeoutMs })
  → { text, provider, model, usage, finishReason, mock }
```

- Hai khuôn giao thức: **Google** (`:generateContent`) và **OpenAI-compatible**
  (`/chat/completions`) cho groq/openai/cerebras/openrouter/mistral/deepseek/custom.
- **`PROVIDER_CATALOG`** là nguồn duy nhất khai báo cho từng provider: id, tên hiển thị,
  giao thức, base URL, tên secret, giới hạn ngữ cảnh, trần token ra, thời gian chờ và khả
  năng liệt kê model. Founder Dashboard đọc đúng danh mục này.
- `listProviderModels()` là health check thật: `GET /models` bằng khoá đang cấu hình,
  không tốn token sinh văn bản. Action `admin.provider.verify` (Founder) dùng nó để xác nhận
  model có thật trước khi áp dụng.
- Uỷ quyền chọn khoá theo **vai trò**: `primary` → `AI_TUTOR_API_KEY`,
  `fallback` → `AI_TUTOR_FALLBACK_API_KEY`. Địa chỉ tuỳ chỉnh:
  `AI_TUTOR_BASE_URL` / `AI_TUTOR_FALLBACK_BASE_URL`.
- Timeout bằng `AbortController`; lỗi phân loại `AUTH | MODEL_NOT_FOUND | RATE_LIMIT |
  QUOTA | TIMEOUT | PROVIDER_DOWN | EMPTY_RESPONSE | BAD_CONFIG`.
- Response được chuẩn hoá → frontend không phụ thuộc cấu trúc của provider nào.
- Giả lập: chỉ khi `AI_TUTOR_MOCK=1`; kết quả mang `mock: true` và UI hiện cảnh báo.

### 2.4. Prompt & ngữ cảnh — `_shared/ai-prompts.ts`

Bốn lớp tách biệt, không bao giờ trộn:

```
1. System prompt      (Founder quản lý) + hướng dẫn chế độ
2. Course context     (khối ---BEGIN-CONTEXT--- ... ---END-CONTEXT---)
3. Conversation history (N lượt gần nhất, bắt đầu bằng lượt người học)
4. User message
```

Ngữ cảnh do client gửi lên đi qua **danh sách trắng** `sanitizeContext()`:
chỉ `subject, topic, lesson, page, question, options, user_answer, correct_answer,
explanation, mistake_note, source_url`, mỗi trường bị cắt độ dài, tối đa 8 phương án.
Trường lạ (ví dụ `instruction`, `system`, `student_id`) bị **bỏ hoàn toàn**.

### 2.5. Định tuyến model

| Loại | Model dùng |
|---|---|
| Tạo bài luyện tập | `model_practice` |
| Giải từng bước / kiểm tra bài / phân tích lỗi / câu hỏi > 600 ký tự hoặc có từ khoá nặng | `model_complex` |
| Gợi ý, tóm tắt, câu hỏi ngắn | `model_simple` |
| Không cấu hình / routing tắt | `model` (mặc định) |

Mọi model đều lấy từ cấu hình đã lưu; không hardcode tên model ở client,
không chọn theo quảng cáo.

### 2.6. Fallback

```
provider chính lỗi
  ├─ lỗi không phục hồi (AUTH, MODEL_NOT_FOUND, BAD_CONFIG) → trả lỗi, KHÔNG đổi provider
  └─ lỗi tạm thời (TIMEOUT, PROVIDER_DOWN, RATE_LIMIT, EMPTY_RESPONSE)
        ├─ thử lại tối đa AI_TUTOR_MAX_RETRIES lần (0–2, cách 0,9s)
        ├─ đánh dấu cooldown 60s cho provider đó
        └─ nếu fallback_enabled + fallback_provider + fallback_model +
              AI_TUTOR_FALLBACK_API_KEY và provider khác provider chính
              → gọi lại MỘT lần, giữ nguyên system + history + trần token
              → ghi provider thực tế + fell_back=true vào usage log
```

Không gửi lặp vô hạn. Không chuyển dữ liệu sang dịch vụ chưa được cấu hình.
Provider đang trong cooldown bị bỏ qua (không gọi) cho đến khi hết 60 giây.

### 2.7. Ngân sách token đầu ra

`outputTokensForMode(mode, message, configuredMax)` lấy `min(trần cấu hình, trần chế độ)`:

| Chế độ | Trần mục tiêu |
|---|---|
| `hint` (Quick Answer) | 256 |
| `explain`, `summary`, `socratic` (Normal) | 512 |
| `steps`, `check`, `mistakes`, `practice` (Detailed) | 1024 |
| Giải thích sâu (yêu cầu rõ trong câu hỏi) | 2048 |

Không dưới 128 token (dưới mức đó câu trả lời bị cụt) và không bao giờ vượt trần
`ai_settings.max_output_tokens` hay `ProviderInfo.maxOutput`. Chế độ `hint` và `socratic`
**không** được nâng lên 2048 vì sẽ khuyến khích model viết sẵn lời giải.

## 3. Cơ sở dữ liệu

Chi tiết bảng/RLS: `docs/AI_TUTOR_DATA_MIGRATION.md`.

```
students 1 ──< ai_conversations 1 ──< ai_messages
    │
    └──< ai_usage_logs
ai_settings (1 dòng) · ai_prompt_versions (lịch sử System Prompt)
ai_provider_diagnostics (nhật ký lỗi provider — CHỈ service_role, không policy)
```

## 4. Điểm tích hợp trong Bá Khí

| Nơi | Cách tích hợp |
|---|---|
| Menu tài khoản (`bk-shell.js`) | Dòng “Trợ lý AI” → `/ai-tutor/` |
| Trang `/ai-tutor/` | Giao diện đầy đủ |
| Mọi trang học tập | Nút “Hỏi AI”, ngữ cảnh tự nhận biết |
| Founder/Administrator Dashboard | Tab **AI Tutor** (`bk-founder-ai.js`) |
| Mistake Notebook | `BKAITutor.analyzeMistake(entry)` |
| Quiz / Reading / Listening | `BKAITutor.explain({question, options, user_answer, correct_answer})` |
| Gamification | **Không** tích hợp ghi. AI không cấp XP/thành tựu. |
| Chat | Độc lập; không dùng chung bảng, dùng chung mẫu kiến trúc |

## 5. Tính sẵn sàng

AI Tutor là lớp **phụ**. Khi provider lỗi hoặc AI bị tắt:

- trang bài học, Quiz, Reading, Listening, Chat, Gamification vẫn chạy bình thường;
- nút “Hỏi AI” mở được và hiện thông báo tiếng Việt + nút Thử lại;
- không có lời gọi nào chặn tải trang (script `defer`, mọi request phát sinh sau thao tác
  của người dùng).

## 10. Chuỗi nhiều model & fallback (8.5.4)

Nguồn sự thật của thứ tự model là bảng `ai_model_routes` (migration `20261220000000`):

| Cột | Ý nghĩa |
|---|---|
| `position` | `0` = Primary, `1+` = Fallback 1, 2, 3… |
| `label` | Tên gợi nhớ hiển thị trên Dashboard (không dùng để định tuyến) |
| `provider`, `model` | Provider id trong `PROVIDER_CATALOG` và tên model thật |
| `key_ref` | TÊN secret chứa khoá (vd `AI_TUTOR_KEY_3`). Không có cột chứa khoá |
| `enabled` | Model đang bật mới được đưa vào chuỗi |
| `last_status`, `last_error_code`, `last_latency_ms`, `last_checked_at` | Kết quả lần kiểm tra gần nhất |

`ai_model_attempts` lưu từng lần thử model trong một câu hỏi để tab **Logs** hiển thị
lịch sử fallback thật. Cả hai bảng bật RLS **không policy**; quyền chỉ cấp cho
`service_role`.

Luồng trong `ai-tutor-api` → `runProvider()`:

1. Đọc các dòng `ai_model_routes` đang bật, sắp theo `position` (tối đa 10 model).
2. Bảng rỗng → dùng cấu hình cũ trong `ai_settings` (một primary + một fallback) để
   tương thích ngược với 8.5.2.
3. Gọi lần lượt; mỗi model có `timeoutMs` riêng (provider → `timeout_ms` → `AI_TUTOR_TIMEOUT`).
4. Lỗi tạm thời (`TIMEOUT`, `PROVIDER_DOWN`, `RATE_LIMIT`, `QUOTA`, `EMPTY_RESPONSE`) được
   thử lại tối đa `max_retries` (0–3). Lỗi `AUTH`, `MODEL_NOT_FOUND`, `UNKNOWN` không thử lại
   nhưng vẫn chuyển sang model kế tiếp. `NO_KEY` và `BAD_CONFIG` dừng chuỗi.
5. Model vừa lỗi tạm thời nghỉ 60 giây (`providerCooldown`, khoá `provider|model`).
6. Model thành công được trả về trong `meta.provider`, `meta.model`, `meta.routeLabel`,
   `meta.attempts`; `ai_usage_logs.fell_back` ghi lượt phải qua dự phòng.

Chi tiết lỗi trả cho học sinh đi qua `safeErrorDetail()`: provider, model, mã HTTP, loại lỗi,
thời điểm, trạng thái dự phòng và danh sách model đã thử. Không có khoá, header hay raw
response; thông điệp gốc của provider chỉ hiện trong `ai_provider_diagnostics` (Founder).

## 11. Giao diện trên điện thoại (8.5.5)

- **Header một hàng:** `.bkai-head` xếp bằng `order` — `#bkaiMenuBtn` (0), tiêu đề (1),
  cụm nút (3, `margin-left:auto`), dòng phụ (4, `flex-basis:100%`). Nút đóng `.bkai-close`
  (44×44px) chỉ tồn tại khi `S.layout === 'dock'` và nằm cuối cụm nút, tức sát phải tiêu đề.
  Đóng cửa sổ chỉ ẩn `.bkai-dock-host`; `S.messages`/`S.active` giữ nguyên.
- **Sidebar kiểu ChatGPT:** dưới 860px `.bkai-page .bkai-side` chuyển thành off-canvas
  (`position:fixed`, `transform:translateX(-102%)`, `visibility:hidden` có trễ để còn thấy
  animation đóng). `.bkai-page.is-side-open` trượt vào; `.bkai-side-scrim` là lớp phủ đóng.
  Khoá cuộn nền bằng `html.bkai-side-lock`. `setSidebar()` cập nhật `aria-expanded`.
- **Đóng sidebar:** bấm lớp phủ, `Esc`, hoặc chọn/tạo hội thoại (`openConversation`,
  `startNew`). Không tải lại và không tạo cuộc trò chuyện mới ngoài ý muốn.
- **Desktop không đổi:** từ 861px trở lên, `.bkai-page .bkai-shell` vẫn là grid hai cột
  `280px minmax(0, 1fr)` và nút mở sidebar bị ẩn.
- **Màu:** `.bkai` lấy `--bkai-*` từ token chung `--bk-*` (`bk-tokens.css`), nên cửa sổ nổi
  và trang đầy đủ dùng cùng bảng màu với phần còn lại của website.

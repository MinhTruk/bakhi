# Cấu hình nhà cung cấp AI (multi-provider)

Bá Khí không gắn chặt vào một nhà cung cấp. Mọi nhà cung cấp đi qua **một** lớp adapter
(`supabase/functions/_shared/ai-providers.ts`) và trả về cùng một cấu trúc kết quả.

## 1. Cách adapter chọn giao thức

| Provider ID | Giao thức | Endpoint mặc định |
|---|---|---|
| `google` | Google Generative Language | `https://generativelanguage.googleapis.com/v1beta` |
| `openai` | OpenAI-compatible | `https://api.openai.com/v1` |
| `groq` | OpenAI-compatible | `https://api.groq.com/openai/v1` |
| `openrouter` | OpenAI-compatible | `https://openrouter.ai/api/v1` |
| `mistral` | OpenAI-compatible | `https://api.mistral.ai/v1` |
| `deepseek` | OpenAI-compatible | `https://api.deepseek.com/v1` |
| `custom` | OpenAI-compatible | `AI_TUTOR_BASE_URL` (bắt buộc) |

Google dùng header `x-goog-api-key` và `:generateContent`; các provider còn lại dùng
`Authorization: Bearer` và `/chat/completions`.

## 2. Khoá theo vai trò, không theo nhà cung cấp

| Vai trò | Secret |
|---|---|
| Provider chính | `AI_TUTOR_API_KEY` |
| Provider dự phòng | `AI_TUTOR_FALLBACK_API_KEY` |
| Base URL tuỳ chỉnh | `AI_TUTOR_BASE_URL`, `AI_TUTOR_FALLBACK_BASE_URL` |

Nhờ vậy, đổi từ Google sang Groq chỉ cần: đổi khoá trong `AI_TUTOR_API_KEY` + chọn
`groq` trong Founder Dashboard. Không sửa mã, không deploy lại frontend.

## 3. Ví dụ cấu hình từng nhà cung cấp

### 3.1. Google Gemini (mặc định)

```
AI_TUTOR_PROVIDER = google
AI_TUTOR_MODEL    = gemini-3.8-flash
AI_TUTOR_API_KEY  = <khoá từ aistudio.google.com/app/apikey>
```

**Chỉ `gemini-3.8-flash` còn dùng được** (đo ngày 2026-11-22). Google đã ngừng cấp
`gemini-2.5-flash`, `-lite`, `-pro` — gọi vào trả 404 *“no longer available to new users”*.
Các biến thể `gemini-3.8-flash-001/-exp/-latest/-preview/-thinking` cũng 404.

⚠️ **Hạn mức:** khoá miễn phí rất dễ chạm trần — model trả `503 high demand` rồi
`429 quota exceeded`. Khi đó trợ lý báo *“Trợ lý AI đã hết hạn mức sử dụng của nhà cung cấp.”*
Cách xử lý: bật thanh toán cho project Google AI, hoặc cấu hình provider dự phòng (mục 4),
hoặc đợi hạn mức miễn phí được tính lại.

### 3.2. OpenAI

```
AI_TUTOR_PROVIDER = openai
AI_TUTOR_MODEL    = gpt-4.1-mini
AI_TUTOR_API_KEY  = <khoá từ platform.openai.com/api-keys>
```

### 3.3. Groq (tốc độ cao)

```
AI_TUTOR_PROVIDER = groq
AI_TUTOR_MODEL    = llama-3.3-70b-versatile
```

### 3.4. OpenRouter

```
AI_TUTOR_PROVIDER = openrouter
AI_TUTOR_MODEL    = google/gemini-3.8-flash
```

### 3.5. Provider nội bộ / tương thích OpenAI

```
AI_TUTOR_PROVIDER = custom
AI_TUTOR_MODEL    = <model-id>
AI_TUTOR_BASE_URL = https://ai.example.edu/v1
AI_TUTOR_API_KEY  = <khoá nội bộ>
```

## 4. Nguyên tắc chọn model

1. **Chỉ dùng model đã kiểm tra hoạt động** với khoá hiện tại (bấm *Kiểm tra kết nối*).
2. **Không** chọn model theo tên hay quảng cáo. So sánh trên chính câu hỏi của học sinh:
   độ chính xác, độ ổn định, tốc độ, chi phí.
3. Model mặc định nên là model **cân bằng**; chỉ dùng model mạnh cho câu phức tạp.
4. Ghi lại model đã chọn trong `docs/AI_TUTOR_USAGE_LIMITS.md` khi thay đổi.

Danh sách gợi ý trong dashboard (`MODEL_SUGGESTIONS` trong mã) **chỉ là gợi ý**,
không phải danh sách model luôn tồn tại. Nhà cung cấp có thể đổi tên hoặc ngừng model.

## 5. Định tuyến model

Bật/tắt ở **Founder Dashboard → AI Tutor → Định tuyến model**.

| Trường | Dùng cho |
|---|---|
| `model` | Mặc định cho mọi câu hỏi |
| `model_simple` | Gợi ý, tóm tắt, câu ngắn |
| `model_complex` | Giải từng bước, kiểm tra bài, phân tích lỗi, câu hỏi dài |
| `model_practice` | Tạo bài luyện tập |

Để trống một trường = dùng `model` mặc định.

## 6. Dự phòng (fallback)

Điều kiện để fallback hoạt động:

1. `fallback_provider` và `fallback_model` đã chọn và lưu.
2. `AI_TUTOR_FALLBACK_API_KEY` tồn tại trong Secrets.

Chỉ lỗi **tạm thời** mới chuyển provider: `TIMEOUT`, `PROVIDER_DOWN`, `RATE_LIMIT`,
`EMPTY_RESPONSE`. Lỗi cấu hình (`AUTH`, `MODEL_NOT_FOUND`, `QUOTA`, `BAD_CONFIG`)
**không** chuyển, vì provider khác cũng sẽ gặp lỗi tương tự.

Khi fallback được dùng:

- ngữ cảnh và lịch sử giữ nguyên;
- hội thoại ghi `last_provider`/`last_model` của provider thực tế;
- giao diện hiện một dòng thông báo;
- `ai_usage_logs` ghi đúng provider đã xử lý.

## 7. Kiểm thử không tốn tiền

Đặt `AI_TUTOR_MOCK=1` để bật provider giả lập:

- trả về câu trả lời mẫu, **không** gọi mạng, **không** tốn quota;
- mọi kết quả mang cờ `mock: true`;
- giao diện hiện dải cảnh báo đỏ và Founder Dashboard hiện nhãn “Giả lập (QA)”;
- dùng để kiểm tra đường ống, lưu hội thoại, RLS, rate limit.

**Không bao giờ** để `AI_TUTOR_MOCK=1` ở production. Nếu thấy dải cảnh báo giả lập
trong khi dùng thật, hãy xoá secret đó.

## 8. Khi nhà cung cấp thay đổi chính sách

1. Kiểm tra trang giá/quota chính thức.
2. Cập nhật `AI_TUTOR_API_KEY` (hoặc chuyển provider) trong Secrets/Dashboard.
3. Bấm **Kiểm tra kết nối**.
4. Điều chỉnh `daily_requests` / `daily_tokens` nếu cần.
5. Ghi lại thay đổi trong `CHANGELOG.md`.

Không có phần nào của giao diện, lịch sử hội thoại hay ngữ cảnh học tập phụ thuộc
vào nhà cung cấp cụ thể.

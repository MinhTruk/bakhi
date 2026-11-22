# Cấu hình nhà cung cấp AI cho Trợ lý AI (Bá Khí 8.5.2)

Tài liệu này dành cho **người quản trị không cần biết lập trình**. Làm theo thứ tự từ
mục 1 đến mục 7 là đủ để đổi nhà cung cấp AI, chọn model và theo dõi lượng token.

> **Nguyên tắc bất di bất dịch:** API key **không bao giờ** nằm trong mã nguồn, tệp HTML,
> JavaScript phía trình duyệt, ảnh chụp màn hình, tài liệu hay chat. Khoá chỉ nằm trong
> **Supabase → Edge Functions → Secrets**. Giao diện quản trị chỉ hiển thị *đã cấu hình*
> hay *chưa*, không bao giờ hiển thị lại giá trị khoá — kể cả với Founder.

---

## 1. Mặc định của bản 8.5.2

| Vai trò | Nhà cung cấp | Model | Secret |
|---|---|---|---|
| Chính | Groq | `openai/gpt-oss-20b` | `AI_TUTOR_API_KEY` |
| Dự phòng | Google AI Studio | `gemini-3.8-flash` | `AI_TUTOR_FALLBACK_API_KEY` |

- Groq dùng giao thức **OpenAI-compatible** (`https://api.groq.com/openai/v1`), nên dùng
  chung một adapter với OpenAI, Cerebras, OpenRouter, Mistral, DeepSeek. Không có nhánh mã
  riêng cho từng nhà cung cấp.
- Đổi nhà cung cấp = đổi khoá trong Secrets + chọn lại trong Founder Dashboard.
  **Không sửa mã, không deploy lại frontend.**

---

## 2. Bước 1 — Lấy Groq API Key

1. Mở <https://console.groq.com/keys> và đăng nhập.
2. Chọn **Create API Key**, đặt tên dễ nhớ (ví dụ `bakhi-ai-tutor`).
3. Sao chép khoá ngay khi hiện ra (Groq chỉ hiện **một lần**). Khoá Groq bắt đầu bằng `gsk_`.
4. Dán tạm vào trình quản lý mật khẩu của bạn. **Không** dán vào chat, email, ảnh chụp
   màn hình, tệp `.env` được commit hay mã nguồn.

Nếu khoá đã từng bị dán vào nơi công khai (chat, issue, commit, ảnh): **thu hồi (revoke)**
khoá đó trong Groq Console và tạo khoá mới trước khi làm bước 3.

---

## 3. Bước 2 — Thêm khoá vào Supabase Secrets

1. Mở <https://supabase.com/dashboard>, chọn project **bakhi**.
2. Vào **Edge Functions → Secrets** (hoặc **Project Settings → Edge Functions → Secrets**).
3. Thêm từng dòng sau (tên phải viết đúng từng ký tự):

| Tên | Giá trị |
|---|---|
| `AI_TUTOR_API_KEY` | khoá Groq vừa tạo |
| `AI_TUTOR_FALLBACK_API_KEY` | khoá Google AI Studio (nếu dùng dự phòng) |

4. Bấm **Save**. Edge Function tự đọc lại biến môi trường, không cần sửa mã.

Có thể đặt thêm (tuỳ chọn):

| Tên | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_TUTOR_FALLBACK_ENABLED` | `true` | `false` để tắt hoàn toàn dự phòng |
| `AI_TUTOR_FALLBACK_PROVIDER` | `google` | nhà cung cấp dự phòng khi bảng cấu hình để trống |
| `AI_TUTOR_FALLBACK_MODEL` | `gemini-3.8-flash` | model dự phòng khi bảng cấu hình để trống |
| `AI_TUTOR_MAX_RETRIES` | `1` | số lần thử lại provider chính (0–2) |
| `AI_TUTOR_TIMEOUT` | *(trống)* | thời gian chờ mỗi lượt (ms); trống = dùng cấu hình trong database |

> Không đặt `AI_TUTOR_BASE_URL` trừ khi dùng provider `custom`. Một giá trị sai ở biến này
> làm **mọi** câu hỏi trả lỗi 404 với nội dung rỗng.

---

## 4. Bước 3 — Cấu hình nhà cung cấp trong Founder Dashboard

1. Đăng nhập **Founder Dashboard** (mã Founder).
2. Mở tab **AI Tutor**.
3. Thẻ **Nhà cung cấp & mô hình**:
   - **Nhà cung cấp chính:** `Groq`.
   - **Mô hình mặc định:** `openai/gpt-oss-20b`.
   - **Nhà cung cấp dự phòng:** `Google AI Studio (Gemini)`.
   - **Mô hình dự phòng:** `gemini-3.8-flash`.
   - **Dự phòng tự động:** bật.
4. Bấm **Lưu cấu hình**.

Chỉ **Founder** thấy nút Lưu. Administrator chỉ xem trạng thái; máy chủ trả
`FOUNDER_ONLY` nếu cố ghi. Quyền không bao giờ lấy từ trình duyệt mà đọc từ
`admin_sessions.scope`.

---

## 5. Bước 4 — Chọn model (không cần sửa mã)

1. Trong thẻ **Nhà cung cấp & mô hình**, ô *Mô hình mặc định* có danh sách gợi ý theo
   nhà cung cấp:
   - Groq: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`,
     `llama-3.1-8b-instant`
   - Google: `gemini-3.8-flash`
   - Cerebras: `llama-3.3-70b`, `llama-3.1-8b`, `qwen-3-32b`
2. Bấm **Kiểm tra model**. Máy chủ đọc danh sách model **thật** của nhà cung cấp bằng khoá
   trong Secrets:
   - *Đã xác nhận…* → model có trong danh sách, có thể lưu.
   - *KHÔNG có trong danh sách…* → tên model sai hoặc khoá không có quyền. Sửa trước khi lưu.
3. Bấm **Lưu cấu hình**.

Tên model chỉ chấp nhận chữ, số và `._:/-` (ví dụ `openai/gpt-oss-20b`). Tên có dấu cách
hoặc ký tự lạ bị từ chối để không thể chèn nội dung lạ vào URL.

---

## 6. Bước 5 — Kiểm tra kết nối

1. Thẻ **Tổng quan → Kiểm tra kết nối**. Đây là một lượt gọi AI thật, rất nhỏ (≤ 16 token).
2. Kết quả thành công hiển thị nhà cung cấp, model và thời gian phản hồi, kèm ghi chú
   *(qua dự phòng)* nếu nhà cung cấp chính vừa lỗi.

| Thông báo | Nghĩa | Việc cần làm |
|---|---|---|
| `NO_KEY` | Chưa có khoá trong Secrets | Làm mục 3 |
| `AUTH` | Khoá sai hoặc đã bị thu hồi | Tạo khoá mới, cập nhật Secrets |
| `MODEL_NOT_FOUND` | Model không tồn tại với khoá này | Bấm **Kiểm tra model**, chọn lại |
| `RATE_LIMIT` | Nhà cung cấp giới hạn tần suất | Chờ vài phút; cân nhắc bật dự phòng |
| `QUOTA` | Hết hạn mức miễn phí | Nạp hạn mức hoặc dùng dự phòng |
| `TIMEOUT` | Phản hồi quá lâu | Tăng `AI_TUTOR_TIMEOUT` hoặc đổi model nhỏ hơn |
| `PROVIDER_DOWN` | Nhà cung cấp đang lỗi 5xx | Chờ; dự phòng sẽ tự chạy nếu bật |
| `BAD_CONFIG` | Thiếu base URL hoặc model rỗng | Kiểm tra provider/model |

Chi tiết kỹ thuật (mã HTTP, thông điệp đã lọc bỏ khoá) nằm ở thẻ **Lỗi nhà cung cấp gần đây**
— **chỉ Founder** thấy. Học sinh chỉ nhận thông báo tiếng Việt dễ hiểu.

---

## 7. Bước 6 — Cấu hình dự phòng (fallback)

Thứ tự xử lý khi học sinh gửi câu hỏi:

1. Gọi nhà cung cấp **chính** (Groq).
2. Nếu lỗi **tạm thời** (`429`, `5xx`, timeout, phản hồi rỗng): thử lại tối đa
   `AI_TUTOR_MAX_RETRIES` lần (mặc định 1, cách nhau 0,9 giây).
3. Vẫn lỗi → chuyển sang nhà cung cấp **dự phòng** nếu: công tắc dự phòng bật,
   `AI_TUTOR_FALLBACK_API_KEY` có, provider/model hợp lệ và khác provider chính.
4. Cả hai lỗi → học sinh nhận một thông báo tiếng Việt ngắn, không thấy chi tiết kỹ thuật.

Dự phòng **không** chạy khi:

- lỗi do khoá sai/quyền (`AUTH`), model không tồn tại (`MODEL_NOT_FOUND`) hay cấu hình sai
  (`BAD_CONFIG`) — đổi provider không sửa được các lỗi này, chỉ che mất nguyên nhân;
- nhà cung cấp vừa lỗi tạm thời trong **60 giây** gần nhất (cooldown) — tránh đốt token vào
  chuỗi request chắc chắn thất bại;
- chưa có khoá dự phòng.

Không có cơ chế thử vô hạn và không tạo request trùng lặp: mỗi câu hỏi chỉ sinh tối đa
`1 + AI_TUTOR_MAX_RETRIES + 1` lượt gọi.

---

## 8. Bước 7 — Theo dõi token usage

Thẻ **Thống kê token & lượt gọi** trong tab AI Tutor:

| Chỉ số | Ý nghĩa |
|---|---|
| Lượt gọi | số request AI trong khoảng đã chọn |
| Thành công / Lỗi | số lượt thành công và thất bại |
| Token vào / Token ra / Tổng token | token của prompt và của câu trả lời |
| Qua dự phòng | số lượt phải dùng nhà cung cấp dự phòng |
| Token ước lượng | số lượt mà nhà cung cấp **không** trả usage, máy chủ phải ước lượng (~4 ký tự/token) |
| Thời gian TB | thời gian phản hồi trung bình của các lượt thành công |

Bộ lọc: **Hôm nay / 7 ngày / 30 ngày / Tất cả**, theo **nhà cung cấp** và **model**.
Bên dưới là bảng *Theo model* và *Theo ngày*.

- Token **thật** là số nhà cung cấp trả về (`usage.prompt_tokens`, `usage.completion_tokens`).
- Token **ước lượng** chỉ dùng khi nhà cung cấp không trả usage; luôn được đếm riêng để
  không báo cáo sai.
- Thống kê **không** lưu nội dung hội thoại — chỉ số đếm, token và thời gian.

Tổng hợp chạy bằng hàm SQL `bakhi_ai_usage_stats()`, không bị giới hạn 1000 dòng của API.

---

## 9. Tiết kiệm token (đã bật sẵn)

| Chế độ | Trần đầu ra |
|---|---|
| Gợi ý (Quick Answer) | 256 |
| Giải thích / Tóm tắt / Hỏi dẫn dắt (Normal) | 512 |
| Từng bước / Kiểm tra bài làm / Phân tích lỗi / Luyện tập (Detailed) | 1024 |
| Giải thích sâu (Deep Explanation) | 2048 |

- Trần thực tế = `min(trần Founder đặt, trần chế độ)`, không dưới 128 token.
- Chế độ **Gợi ý** không bao giờ được nâng trần: nâng sẽ khiến model viết sẵn lời giải.
- Lịch sử chỉ gửi **10 lượt gần nhất** (cấu hình được 2–40); không gửi toàn bộ hội thoại.
- Không gửi lại nội dung môn học không liên quan: ngữ cảnh đi qua danh sách trắng
  (`sanitizeContext`) và chỉ chứa bài đang xem.

---

## 10. Danh mục nhà cung cấp

| Provider ID | Tên | Giao thức | Base URL | Ngữ cảnh | Trần ra |
|---|---|---|---|---|---|
| `groq` | Groq | OpenAI | `https://api.groq.com/openai/v1` | 131.072 | 32.768 |
| `google` | Google AI Studio | Google | `https://generativelanguage.googleapis.com/v1beta` | 1.048.576 | 8.192 |
| `openai` | OpenAI | OpenAI | `https://api.openai.com/v1` | lớn | 16.384 |
| `cerebras` | Cerebras | OpenAI | `https://api.cerebras.ai/v1` | 131.072 | 8.192 |
| `openrouter` | OpenRouter | OpenAI | `https://openrouter.ai/api/v1` | 131.072 | 8.192 |
| `mistral` | Mistral | OpenAI | `https://api.mistral.ai/v1` | 131.072 | 8.192 |
| `deepseek` | DeepSeek | OpenAI | `https://api.deepseek.com/v1` | 65.536 | 8.192 |
| `custom` | Tự cấu hình | OpenAI | `AI_TUTOR_BASE_URL` | 32.768 | 8.192 |

Mỗi provider khai báo đủ: id, tên hiển thị, giao thức, base URL, tên secret, giới hạn ngữ
cảnh, trần token ra, thời gian chờ và khả năng liệt kê model — trong **một** nơi duy nhất
(`supabase/functions/_shared/ai-providers.ts` → `PROVIDER_CATALOG`).

---

## 11. Những điều không được làm

- Không dán API key vào tài liệu, mã nguồn, HTML/JS phía client, commit, issue hay chat.
- Không thêm cột chứa khoá vào bảng Supabase; không trả khoá về trình duyệt.
- Không ghi khoá vào log hay thông báo lỗi. Chi tiết chẩn đoán đã đi qua
  `sanitizeProviderDetail()` (lọc `AIza…`, `gsk_…`, `sk-…`, `AQ.…`, `eyJ…`).
- Không cho Administrator hay học sinh sửa cấu hình provider; mọi hành động ghi đều kiểm
  tra scope ở máy chủ.
- Không tắt kiểm tra quyền, không tin `role` do frontend gửi.
- Không bật `AI_TUTOR_MOCK=1` ở production.

---

## 12. Kiểm thử

```bash
# Cổng cấu hình provider, ngân sách token, lọc khoá
NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-model-routing.js

# Bảo mật API (không lộ khoá, phân quyền)
NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-api-security.js

# Giao diện Trợ lý AI
NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-rendering-security.js

# Offline, không cần khoá, không gọi mạng ngoài:
#   ánh xạ 401/404/429/5xx/timeout, token thật vs ước lượng, không lộ khoá
NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-provider-adapter.js
#   thử lại đúng số lần, chuyển dự phòng, cooldown 60s, tắt dự phòng, trần token
NODE_PATH=/tmp/bktest/node_modules node tools/qa/ai-tutor-fallback.js
```

Gọi Groq thật **chỉ** thực hiện được sau khi khoá đã nằm trong Supabase Secrets. Không có
khoá hợp lệ thì không được tuyên bố “đã kết nối Groq”.

## Thêm một AI Model trong Founder Dashboard (8.5.4)

Mở **Founder Dashboard → AI Tutor → tab AI Models**. Thực hiện đúng thứ tự:

1. **Bấm “+ Thêm AI Model”.** Một dòng cấu hình mới xuất hiện. Dòng đầu tiên là
   **Primary**; các dòng sau tự đánh số **Fallback 1, 2, 3…**.
2. **Chọn nhà cung cấp.** Danh sách lấy từ `PROVIDER_CATALOG` của máy chủ. Với nhà cung cấp
   không có trong danh sách, chọn `Tự cấu hình (OpenAI-compatible)` và đặt
   `AI_TUTOR_BASE_URL` trong Supabase Secrets.
3. **Nhập tên model** đúng như nhà cung cấp công bố (ví dụ `openai/gpt-oss-20b`,
   `gemini-3.8-flash`, `llama-3.3-70b-versatile`). Ô nhập có gợi ý nhưng không ép buộc.
4. **Chọn khoá API (Secret).** Khoá không nhập vào Dashboard và không nằm trong database.
   Đặt khoá trong **Supabase → Edge Functions → Secrets** với tên `AI_TUTOR_API_KEY`,
   `AI_TUTOR_FALLBACK_API_KEY`, `AI_TUTOR_KEY_3` … `AI_TUTOR_KEY_6`, rồi chọn đúng tên
   secret ở ô **API Key (Secret)**. Để trống nghĩa là Primary dùng `AI_TUTOR_API_KEY` và
   các dòng fallback dùng `AI_TUTOR_FALLBACK_API_KEY`.
5. **Bấm “Kiểm tra”.** Máy chủ đọc danh sách model của nhà cung cấp (không tốn token) hoặc
   gửi một lượt sinh 16 token nếu provider không cho liệt kê. Kết quả hiện ngay: OK kèm thời
   gian phản hồi, hoặc lỗi kèm mã (AUTH, MODEL_NOT_FOUND, RATE_LIMIT…).
6. **Đổi thứ tự ưu tiên** bằng nút ↑ ↓. Không thể có hai Primary: vị trí 0 luôn là Primary.
7. **Xoá model** bằng nút thùng rác — có hộp xác nhận, các model còn lại tự đánh số lại.
8. **Bấm “Lưu danh sách model”.** Chỉ sau bước này học sinh mới dùng cấu hình mới. Nút
   **Hoàn tác thay đổi** bỏ mọi sửa đổi chưa lưu.

Kiểm tra sau khi lưu: tab **Tổng quan** hiện đúng Primary/fallback và số model sẵn sàng; tab
**Logs** hiện lượt gọi và lịch sử fallback; nút **Kiểm tra toàn chuỗi model** gọi thử chuỗi
thật.

Lưu ý: model chưa có khoá vẫn lưu được nhưng sẽ bị bỏ qua khi chạy; trạng thái hiện
“Chưa cấu hình khoá”. Khi tất cả model đều lỗi, học sinh nhận thông báo thân thiện kèm nút
**Xem chi tiết** (không chứa khoá hay raw response).

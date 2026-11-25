# Bá Khí 8.7.4 — AI Pipeline Performance

Bản này tối ưu **những công đoạn backend thực sự kiểm soát được**: chuẩn bị
request, xây dựng prompt, đo thời gian, streaming, huỷ, retry và fallback. Nó
không làm model của Groq/Google suy luận nhanh hơn và không hứa hẹn TTFT thấp
hơn khi provider chậm.

## 0. Audit trước khi sửa (BEFORE)

Những gì đã có từ 8.6.x/8.7.x và **được giữ nguyên**:

| Hạng mục | Trước 8.7.4 |
|---|---|
| HTTP client | Một `reqwest::Client` dùng chung trong `AppState` (keep-alive, pool idle, TCP nodelay, connect timeout) |
| Provider | `AiProvider` trait + `ProviderRegistry`; OpenAI-compatible (Groq, OpenAI, Cerebras, OpenRouter, Mistral, DeepSeek, custom) và Gemini |
| Primary/Fallback | Thứ tự cố định theo `ai_model_routes.position`, circuit breaker theo provider |
| Retry | Chỉ lỗi tạm thời, tôn trọng `Retry-After`, backoff **cố định** `AI_RETRY_BACKOFF_MS` |
| Timeout | connect → attempt (`AI_TUTOR_TIMEOUT`) → cả chuỗi (`AI_GATEWAY_TIMEOUT_MS`) → request |
| Đồng thời | toàn dịch vụ / lượt AI / mỗi người dùng / mỗi provider (semaphore + hạn chờ) |
| Streaming | **Không có** ở backend; endpoint trả JSON trọn gói |
| Huỷ | Trình duyệt `abort()` ⇒ hyper drop handler ⇒ reqwest bị huỷ; **không có số đo** |
| TTFT | **Không có** (chưa streaming nên không có mốc token đầu) |
| Chuẩn bị request | `ai_settings` → `ai_model_routes` → hồ sơ học sinh đọc **tuần tự**, dù độc lập |
| Metrics | HTTP/AI/token/cost/cache; không có TTFT, không có thời gian chuẩn bị |

Điểm nghẽn phân loại (có căn cứ, không suy đoán):

- **I/O-bound / network-bound**: 3 lượt đọc Supabase tuần tự mỗi lượt chat
  (cấu hình, route, hồ sơ) — đo được bằng thời gian chuẩn bị mới.
- **Serialization-bound**: đã tối ưu từ 8.7.2 (mượn dữ liệu, struct `Serialize`);
  microbench xác nhận không hồi quy.
- **Provider-bound**: phần lớn latency thật. Backend chỉ có thể giảm phần
  *trước* khi gọi và *sau* khi có chunk đầu.
- **Không có bằng chứng** rằng Rust runtime là nút cổ chai: microbench nội bộ ở
  mức nano/micro giây, trong khi provider ở mức trăm mili giây.

## 1. Thay đổi

### 1.1 Chuẩn bị request song song (thật, đo được)

`chat_inner()` chạy đồng thời ba lượt đọc độc lập bằng `tokio::join!`:

```
ai_settings ─┐
ai_model_routes ─┼─► (chờ lượt chậm nhất) ─► prompt ─► provider
student_devices → students ─┘
```

Trước đây là tổng của ba lượt; nay là lượt chậm nhất. Không đổi dữ liệu, không
đổi quyền: mỗi truy vấn vẫn dùng đúng loại khoá như cũ (service role cho cấu
hình, JWT người dùng cho `student_devices`).

Thời gian chuẩn bị được ghi vào histogram `bakhi_ai_preparation_seconds` (chỉ
số, không nội dung).

### 1.2 Streaming SSE thật

`POST /api/v1/ai/chat/stream` (bật/tắt bằng `AI_STREAM_ENABLED`, mặc định bật):

```
event: delta   {"text":"…"}                  (nhiều lần, đúng thứ tự)
event: done    {"ok":true,"data":{…},"request_id":"…"}
event: error   {"ok":false,"error":{…},"request_id":"…"}
```

- `done.data` **giống hệt** body của `POST /api/v1/ai/chat` ⇒ frontend thay thế
  bản đang stream bằng bản đầy đủ (hội thoại, token, meta, `fellBack`).
- Không buffer toàn bộ: provider đọc `response.chunk()`, tách dòng SSE, gửi
  từng delta qua kênh có hạn 64 frame. Kênh đầy ⇒ provider bị chặn
  (backpressure), không mất chunk.
- UTF-8 an toàn: `SseLines` giữ **byte** cho tới khi có `\n`, nên ký tự tiếng
  Việt bị cắt giữa hai chunk TCP vẫn ghép đúng (có unit test).
- Stream kết thúc bất thường hoặc provider đóng kết nối ⇒ `EMPTY_RESPONSE` /
  `PROVIDER_DOWN`, không trả câu trả lời rỗng.
- Provider không hỗ trợ streaming (`supports_stream() == false`) vẫn phục vụ
  endpoint này bằng một response trọn gói; khi đó **không ghi TTFT**.

Frontend: `BK_BACKEND.streaming = true` (chỉ có tác dụng khi `mode = 'rust'`).
Mặc định **tắt** để không đổi hành vi đang chạy; bật là một dòng cấu hình.

### 1.3 TTFT và các mốc thời gian

`bakhi_ai_time_to_first_token_seconds{role,provider,model}` chỉ được ghi khi
stream thực sự trả **chunk nội dung đầu tiên**, đo từ lúc gửi HTTP request tới
provider. Đây **không phải** thời điểm model sinh token đầu tiên — provider
không cung cấp mốc đó. Response không stream không bao giờ ghi TTFT.

Các mốc khác: `bakhi_ai_preparation_seconds` (nội bộ), duration attempt
(`bakhi_ai_request_duration_seconds`), tổng request (HTTP histogram).

### 1.4 Retry có kiểm soát hơn

- Backoff **luỹ thừa** (`AI_RETRY_BACKOFF_MS` → `AI_RETRY_BACKOFF_MAX_MS`), jitter
  nửa khoảng để nhiều người dùng không thử lại đồng loạt.
- `Retry-After` vẫn được ưu tiên (trần 30 s).
- **Không retry sau khi đã gửi delta**: nối hai câu trả lời là lỗi nội dung.
- **Không fallback sau delta đầu tiên**: cùng lý do.
- Huỷ của người dùng (`CANCELLED`) dừng cả chuỗi, không chuyển provider.

### 1.5 Huỷ xuyên suốt

- Trình duyệt `abort()` / đóng tab → hyper drop response → kênh SSE đóng →
  `call_provider` thấy `sink.tx.closed()` → dừng future provider (reqwest huỷ
  kết nối) → không retry, không fallback.
- `CancelGuard` đếm lượt bị huỷ **thật** (future bị drop trước khi xong) vào
  `bakhi_ai_cancelled_total{stage="request"}`; huỷ giữa stream đếm
  `stage="stream"`. Lỗi bình thường không bị đếm là huỷ.
- Không có token toàn cục dùng chung: mỗi request có kênh riêng, nên huỷ lượt
  này không ảnh hưởng lượt khác.

## 2. Cấu hình mới

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_STREAM_ENABLED` | `1` | Bật endpoint `/ai/chat/stream`; `0` ⇒ 404 |
| `AI_TTFT_TIMEOUT_MS` | `15000` | Chờ chunk nội dung đầu; ≥ 500 và ≤ `AI_TUTOR_TIMEOUT` |
| `AI_STREAM_IDLE_TIMEOUT_MS` | `20000` | Khoảng lặng tối đa giữa hai chunk |
| `AI_RETRY_BACKOFF_MAX_MS` | `8000` | Trần backoff; ≥ `AI_RETRY_BACKOFF_MS`, ≤ 60000 |

Mọi ràng buộc được kiểm tra lúc khởi động; thông điệp nêu tên biến, không nêu
khoá.

## 3. Đo lường (số thật, cùng máy, `cargo run --release --example pipeline_bench`)

Chỉ là **microbenchmark nội bộ**, không phải end-to-end với provider thật:

| Hạng mục | Kết quả |
|---|---|
| Mượn system + turns / attempt (large) | 1 ns (so với 3.887 ns khi clone) |
| Body typed borrow + `to_vec` (large) | 27.315 ns (so với 89.861 ns với cây `Value`) |
| Cache L1 hit cấu hình AI | 200 ns (so với 19.048 ns khi clone) |
| Đọc 1 chunk SSE (`SseLines::push` + `data_of`) | 185 ns |
| Backoff luỹ thừa + jitter | 4 ns |

**Chưa đo được** (và không được phép bịa): TTFT, tổng latency, throughput so
với provider thật. Lý do: môi trường này không có khoá AI, không gọi mạng ra
Groq/Google. Muốn có số BEFORE/AFTER thật cho TTFT phải chạy
`rust-backend` với khoá thật, bật `METRICS_ENABLED=1`, rồi scrape
`bakhi_ai_time_to_first_token_seconds` trước và sau khi bật streaming.

## 4. Giới hạn đã biết

- GitHub Pages **không chạy được** tiến trình Rust thường trực. Streaming và các
  metrics trên chỉ có ý nghĩa khi backend được deploy ở nơi chạy Docker/tiến
  trình liên tục.
- `access_log` đo tới lúc **gửi header** của response SSE, không phải lúc stream
  kết thúc; thời lượng stream nằm ở metrics AI.
- TTFT phụ thuộc provider/model/mạng; backend chỉ đo, không làm nó nhanh hơn.
- Threshold lô nhỏ của `learning-stats` (xem `docs/PARALLEL_ENGINE_V880.md`) là
  quyết định dựa trên overhead đo được, không phải giới hạn production.

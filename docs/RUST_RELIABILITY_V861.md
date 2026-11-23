# Bá Khí v8.6.1 — Độ tin cậy backend Rust

> Phiên bản: 8.6.1 · Ngày: 2026-11-24 · Trạng thái: mã nguồn + test + Docker + CI hoàn thiện,
> **chưa deploy**. Tài liệu này phản ánh code trong `rust-backend/src/`.
>
> Phạm vi: vòng đời tiến trình, retry/timeout, circuit breaker, giới hạn tài nguyên và
> quan sát. Không thay đổi giao diện, không đổi `BK_BACKEND.mode` (vẫn `edge`), không đổi
> schema Supabase.

## 1. Vì sao có bản này

v8.6.0 dựng được AI Gateway chạy đúng nhưng còn ba lỗ hổng vận hành:

1. **Không có đường dừng an toàn** — SIGTERM làm Axum dừng ngay, request đang gọi provider bị
   cắt giữa chừng.
2. **Provider lỗi liên tục vẫn bị gọi** — không có ngưỡng nào để tạm bỏ qua một provider đang
   hỏng, mỗi request vẫn trả giá bằng timeout.
3. **Ánh xạ học sinh sai schema** — backend truy vấn `students.auth_user_id`, cột không tồn
   tại; mọi request có xác thực đều lỗi khi chạy với Supabase thật.

v8.6.1 sửa cả ba và bổ sung contract testing để những khác biệt như (3) không lặp lại.

## 2. Vòng đời tiến trình

```
main()
 ├─ Settings::from_env()        đọc env + Settings::validate() (dừng ngay nếu sai)
 ├─ AppState::new()            HTTP client, Supabase client, provider registry,
 │                             circuit breaker, semaphore, metrics — MỘT LẦN
 ├─ build_router(state)        middleware + route
 ├─ TcpListener::bind()        lỗi ⇒ exit(1) kèm thông điệp
 ├─ log "đã sẵn sàng"          chỉ sau khi mọi thứ trên hoàn tất
 └─ axum::serve(...).with_graceful_shutdown(signal)
        │
        ├─ SIGTERM / SIGINT
        │    ├─ lifecycle.begin_shutdown()   ⇒ /ready trả 503 ngay
        │    ├─ Axum ngừng nhận kết nối mới
        │    └─ chờ request đang chạy (tối đa SHUTDOWN_GRACE_MS)
        └─ hết hạn chờ ⇒ log lỗi + kết thúc tiến trình
```

Điểm quan trọng:

- Cờ `draining` bật **trước** khi ngừng nhận kết nối, nên load balancer thấy 503 trước khi
  kết nối bị từ chối.
- Request chỉ được trả lời sau khi ghi database hoàn tất; huỷ do hết hạn chờ không làm mất
  dữ liệu đã xác nhận thành công.
- `/health` vẫn 200 trong lúc draining và báo `"draining": true` để vận hành phân biệt
  "đang dừng" với "đã chết".

## 3. Health và readiness

| Endpoint | Ý nghĩa | Phụ thuộc | Ghi chú |
|---|---|---|---|
| `GET /api/v1/health` | tiến trình còn sống | không | không chạm Supabase, không gọi AI; có `uptimeSeconds`, `activeRequests`, `draining` |
| `GET /api/v1/ready` | phục vụ request mới được | cấu hình + Supabase Auth | timeout 3 giây; 503 khi draining, thiếu service key (và `AI_PERSIST_CONVERSATIONS=true`), hoặc Auth không trả lời |

`/ready` ghi lý do vào header **nội bộ** `x-ready-reason` (`draining`, `config_error`,
`dependency_down`). Body vẫn là envelope chung, không chứa URL, khoá hay chi tiết kết nối.
Readiness **không** gọi AI provider — provider hỏng không làm instance bị rút khỏi luồng.

## 4. Chính sách thử lại

| Tình huống | Thử lại? | Chuyển provider kế tiếp? |
|---|---|---|
| HTTP 408, timeout | có | có |
| HTTP 429 (không phải quota) | có, tôn trọng `Retry-After` | có |
| HTTP 500, 502, 503, 504 | có | có |
| Lỗi kết nối tạm thời | có | có |
| HTTP 400, request không hợp lệ | không | không |
| HTTP 401, 403 (khoá sai) | không | không |
| Model không tồn tại (404) | không | không |
| Cấu hình sai (`BAD_CONFIG`) | không | không |
| Hết hạn mức nhà cung cấp (`QUOTA`) | không | có |

- Số lần thử lại mỗi provider: `AI_TUTOR_MAX_RETRIES` (0–2, mặc định 1).
- `Retry-After` được đọc từ header (giây hoặc HTTP-date), giới hạn trần 30 giây.
- Không có `Retry-After` ⇒ chờ `AI_RETRY_BACKOFF_MS` (mặc định 500 ms).
- **Hạn cứng:** mọi attempt cộng lại không vượt `AI_GATEWAY_TIMEOUT_MS`; trước mỗi attempt
  kiểm tra thời gian còn lại, dưới 50 ms thì dừng chuỗi.
- Không thử lại sau khi đã có kết quả thành công; không gửi song song nhiều provider.
- Không tự chuyển sang Edge Function — chat không idempotent.

## 5. Circuit breaker

Trạng thái theo **từng provider** (không theo người dùng, tối đa 8 mục):

```
CLOSED ──(đủ AI_CIRCUIT_THRESHOLD lỗi liên tiếp)──► OPEN
   ▲                                                  │
   │                                          (hết cooldown)
   │                                                  ▼
   └────────────(1 request thử thành công)──── HALF_OPEN
                                                      │
                                             (thử mà vẫn lỗi)
                                                      ▼
                                                    OPEN
```

- `AI_CIRCUIT_THRESHOLD` (mặc định 5), `AI_CIRCUIT_COOLDOWN_MS` (30 000),
  `AI_CIRCUIT_HALF_OPEN` (1 request thử).
- Chỉ lỗi **tạm thời** mới tính vào ngưỡng. Lỗi xác thực/model/cấu hình không mở circuit vì
  chúng là lỗi cấu hình, không phải provider quá tải.
- Provider OPEN bị **bỏ qua**, provider khác vẫn chạy; thứ tự Primary → Fallback không đổi.
- Nếu mọi provider đều OPEN, phản hồi cho học sinh vẫn là `PROVIDER_DOWN` (không lộ khái
  niệm circuit breaker); lần thử bị bỏ qua được ghi trong `meta.attempts` với mã
  `CIRCUIT_OPEN` để chẩn đoán.
- Trạng thái circuit hiện trong `/api/v1/metrics` (gauge `bakhi_circuit_state`).

## 6. Timeout theo lớp

| Lớp | Biến | Mặc định | Ràng buộc |
|---|---|---|---|
| Kết nối TCP | `CONNECT_TIMEOUT_MS` | 5 000 | ≤ `AI_TUTOR_TIMEOUT` |
| Một attempt provider | `AI_TUTOR_TIMEOUT` | 30 000 | ≤ gateway |
| Toàn chuỗi provider | `AI_GATEWAY_TIMEOUT_MS` | 40 000 | ≤ request |
| Request Supabase | `SUPABASE_TIMEOUT_MS` | 10 000 | ≤ request |
| Request HTTP của Axum | `REQUEST_TIMEOUT_MS` | 45 000 | — |
| Chờ khi shutdown | `SHUTDOWN_GRACE_MS` | 20 000 | ≥ 1 000 |

`Settings::validate()` chạy ngay khi khởi động. Cấu hình mâu thuẫn ⇒ tiến trình **không mở
cổng**, in tên biến sai (không in giá trị bí mật) và thoát với mã 1.

## 7. Giới hạn đồng thời

| Lớp | Biến | Mặc định | Hành vi khi vượt |
|---|---|---|---|
| Toàn dịch vụ | `MAX_CONCURRENCY` | 512 | 429 `RATE_LIMIT` |
| Lượt gọi AI | `AI_MAX_CONCURRENCY` | 32 | 429 `BUSY` |
| Mỗi người dùng | `AI_USER_MAX_CONCURRENCY` | 1 | 429 `BUSY` |

- Mọi lần chờ semaphore có hạn `CONCURRENCY_WAIT_MS` (mặc định 750 ms). Hết hạn ⇒ 429, không
  bao giờ chờ vô hạn.
- `/api/v1/health` và `/api/v1/ready` **không** đi qua giới hạn đồng thời toàn dịch vụ: probe
  không được trả 429 vì tải cao (nếu không orchestrator sẽ restart vòng lặp).
- Giới hạn theo người dùng dùng bộ đếm trong bộ nhớ, tự xoá khi về 0 và có trần 10 000 khoá.
- `AI_USER_MAX_CONCURRENCY=1` tương đương khoá `inFlight` của Edge Function: hai tab không
  gọi AI chồng nhau.
- Đây là giới hạn **mỗi instance**. Nhiều instance ⇒ tổng trần = số instance × cấu hình; hạn
  mức theo ngày vẫn nằm trong database (`ai_settings.daily_requests` / `daily_tokens`).

## 8. Fallback và nhật ký sử dụng

- Chuỗi Primary → Fallback lấy từ `ai_model_routes` (position 0, 1, …), rỗng thì dùng
  `ai_settings`. Không có bảng provider thứ hai.
- `ai_usage_logs` ghi **một dòng cho mỗi request chat** (kể cả khi thử lại nội bộ), gồm
  provider/model thực tế, `fell_back`, `tokens_estimated`; token chỉ ghi khi provider trả
  usage đáng tin cậy, còn lại đánh dấu ước lượng.
- Lỗi ghi nhật ký chỉ ghi log nội bộ, **không** làm hỏng câu trả lời đã thành công.
- Không lưu khoá, không lưu nội dung hội thoại trong log.

## 9. Giới hạn đã biết

- Rate limit, circuit breaker và metrics là **trạng thái trong tiến trình**, không chia sẻ
  giữa các instance. Muốn chính xác toàn cụm cần Redis/Prometheus — chưa làm ở 8.6.1.
- Không có streaming SSE.
- Chưa có endpoint admin (giữ `admin-actions` của Edge Function).
- Backend chưa được deploy; mọi số liệu benchmark vẫn là môi trường cục bộ.

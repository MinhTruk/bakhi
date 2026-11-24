# Bá Khí — Observability (v8.6.2)

Tài liệu vận hành cho lớp quan sát của **backend Rust** (`rust-backend/`). Website tĩnh,
Edge Function và schema Supabase không thay đổi. Metrics là một phần của runtime backend:
Prometheus scrape được **độc lập** với Founder Dashboard và với frontend.

---

## 1. Kiến trúc

```
Trình duyệt ──(chat)──► Rust backend ──► AI provider (Primary → Fallback)
                            │
                            ├─ middleware HTTP: counter + histogram (một lần/request)
                            ├─ AI gateway: attempt/latency/token/cost theo role+provider+model
                            ├─ registry trong RAM (Mutex<BTreeMap>, AtomicI64)
                            ├─ GET /metrics            ◄── Prometheus (Bearer token)
                            └─ POST /api/v1/observability/summary ◄── Founder Dashboard
                                                                 (x-admin-token, scope=founder)
```

Nguyên tắc:

- **Không** gọi database cho từng metric; **không** gửi HTTP nội bộ để "ghi nhận".
- **Không** block response AI để ghi metrics: ghi sau khi có kết quả, trong bộ nhớ.
- Dashboard chỉ là lớp hiển thị. Backend vẫn thu thập và `/metrics` vẫn phục vụ khi
  không ai mở dashboard.
- Counter/histogram reset khi tiến trình khởi động lại — đúng hành vi Prometheus;
  lịch sử dài hạn do Prometheus lưu, không phải database của Bá Khí.

Mã nguồn chính:

| Tệp | Vai trò |
|---|---|
| `src/observability/metrics.rs` | Registry, histogram, quantile, Prometheus, JSON tổng hợp |
| `src/observability/pricing.rs` | Bảng giá AI tách khỏi logic AI |
| `src/observability/mod.rs` | Chuẩn hoá route, access log, ghi HTTP metrics |
| `src/routes/metrics.rs` | `GET /metrics` + `GET /api/v1/metrics` (Bearer) |
| `src/routes/observability.rs` | `POST /api/v1/observability/summary` (Founder) |
| `src/services/ai_service.rs` | Ghi attempt, token, chi phí, fallback |
| `assets/bakhi/bk-observability.js|css` | Tab **Vận hành** trong Founder Dashboard |

---

## 2. Danh sách metrics

### HTTP

| Metric | Kiểu | Nhãn |
|---|---|---|
| `bakhi_http_requests_total` | counter | `method`, `route`, `status` |
| `bakhi_http_request_duration_seconds` | histogram | `method`, `route`, `status` |
| `bakhi_http_errors_total` | counter | `method`, `route`, `category` |
| `bakhi_http_in_flight_requests` | gauge | — |

`category` ∈ `client_error` (4xx) · `server_error` (5xx) · `upstream_error` (502/503) ·
`timeout` (504) · `other`.

### AI

| Metric | Kiểu | Nhãn |
|---|---|---|
| `bakhi_ai_requests_total` | counter | `role`, `provider`, `model`, `status` |
| `bakhi_ai_request_duration_seconds` | histogram | `role`, `provider`, `model` |
| `bakhi_ai_tokens_total` | counter | `role`, `provider`, `model`, `type`, `estimated` |
| `bakhi_ai_estimated_cost_usd_total` | counter | `role`, `provider`, `model`, `currency` |
| `bakhi_ai_provider_errors_total` | counter | `provider`, `model`, `code` |
| `bakhi_ai_retries_total` | counter | `provider`, `model` |
| `bakhi_ai_fallback_total` | counter | `outcome` ∈ `attempted` · `success` · `failure` · `skipped` |
| `bakhi_ai_user_requests_total` | counter | — (một lượt người dùng) |
| `bakhi_ai_user_fallback_total` | counter | — |
| `bakhi_ai_user_failed_total` | counter | — |
| `bakhi_ai_unpriced_requests_total` | counter | — (model chưa có giá) |

`role` ∈ `primary` · `fallback`. `type` ∈ `input` · `output`. `estimated` ∈ `true` · `false`.
`bakhi_ai_user_fallback_total` đếm cả lượt thất bại đã đi qua nhánh dự phòng.

### Hệ thống

| Metric | Kiểu | Ghi chú |
|---|---|---|
| `bakhi_process_uptime_seconds` | gauge | Từ lúc tiến trình khởi động |
| `bakhi_process_resident_memory_bytes` | gauge | RSS từ `/proc/self/statm`; **bỏ** nếu không đọc được |
| `bakhi_build_info` | gauge | `version`, `service` = 1 |
| `bakhi_pricing_info` | gauge | `version`, `currency`, `models` |
| `bakhi_circuit_state` | gauge | `provider`; 0=closed, 1=half_open, 2=open |

**Không có** `bakhi_ai_time_to_first_token_seconds`: AI Tutor chưa hỗ trợ streaming, nên
metric đó sẽ là số bịa. Khi streaming được triển khai mới thêm.

---

## 3. Ý nghĩa từng nhóm

- **HTTP counter**: số request đã hoàn tất, tách theo method/route/status. Scrape `/metrics`
  không được tính.
- **Histogram latency**: phân phối thời gian xử lý phía máy chủ, tính từ lúc middleware
  nhận request tới khi response sẵn sàng. Không gồm mạng phía người dùng.
- **Error counter**: chỉ để trả lời "endpoint nào lỗi và lỗi loại gì"; 4xx do dữ liệu
  người dùng sai không phải sự cố máy chủ.
- **AI attempt**: một lượt chat có thể có nhiều attempt (retry + fallback). `role=primary`
  là vị trí 0 trong `ai_model_routes` (hoặc provider chính trong `ai_settings`);
  `role=fallback` là vị trí ≥ 1.
- **Token**: lấy từ `usage` metadata provider trả về; nếu provider thiếu, hệ thống ước
  lượng (~4 ký tự/token) và ghi `estimated="true"`. Không bao giờ ghi 0 khi không có dữ liệu.
- **Cost**: `input/1e6 × giá_in + output/1e6 × giá_out`. Không có giá ⇒ không có series,
  chỉ tăng `bakhi_ai_unpriced_requests_total`.

---

## 4. Label và cardinality

Được phép: `method`, `route` (đã chuẩn hoá), `status` (mã hữu hạn), `provider`, `model`
(≤ 80 ký tự), `role`, `status`, `type`, `estimated`, `category`, `code`, `currency`,
`version`.

**Cấm**: user id, email, IP, session id, request id, URL có query, nội dung câu hỏi/trả lời,
thông điệp lỗi thô, API key, bất kỳ dữ liệu cá nhân nào.

Chuẩn hoá route (`src/observability/mod.rs`):

| Đầu vào | Nhãn |
|---|---|
| `/health`, `/api/v1/health` | `/health` |
| `/api/v1/ready` | `/ready` |
| `/api/v1/ai/chat` | `/api/v1/ai/chat` |
| `/api/v1/students/123` | `/other` |
| `/wp-login.php`, `/` | `/other` |

Registry có trần `MAX_SERIES = 2000`; vượt trần thì route mới gộp vào `other` thay vì phình
bộ nhớ. Request id **không** phải nhãn Prometheus — nó chỉ nằm trong log.

---

## 5. Đo HTTP latency

Middleware `observability::access_log` (đặt ngoài concurrency, trong request id) ghi **một
lần** sau khi handler trả về:

```
started = Instant::now()  →  next.run(request)  →  seconds = elapsed
record_http(method, route, status, seconds, category)
```

Không có middleware nào khác đo latency, nên không có hiện tượng cộng dồn. Timeout của
`tower_http::timeout` vẫn được tính là một request 504 bình thường.

Bucket HTTP (giây): `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 45, 60`.

---

## 6. Đo AI provider latency

Trong `run_chain()`, mỗi attempt đo riêng từ trước khi gửi tới khi provider trả response
hoàn chỉnh (hoặc timeout của attempt). Không tính thời gian dựng prompt, ghi database hay
xử lý frontend. `bakhi_ai_request_duration_seconds` dùng bucket AI:

`0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 30, 45, 60`.

---

## 7. Phân biệt Primary và Fallback

- Thứ tự ứng viên do `ai_model_routes.position` quyết định (0 = Primary). Không có bảng
  route thì `ai_settings.provider/model` là Primary, `fallback_provider/model` là Fallback.
- `role` gắn theo **vị trí**, không theo tên provider — đổi provider không làm sai nhãn.
- `bakhi_ai_fallback_total{outcome="attempted"}` tăng một lần cho mỗi lượt có gọi provider
  dự phòng; `success`/`failure` là kết quả cuối của chuỗi; `skipped` là provider dự phòng bị
  circuit breaker bỏ qua.
- Một lượt người dùng = một `bakhi_ai_user_requests_total`, dù có 3 attempt. Fallback rate =
  `bakhi_ai_user_fallback_total / bakhi_ai_user_requests_total`. `run_chain()` ghi bộ đếm này
  đúng **một lần** cho mỗi lượt (nhánh thành công và nhánh lỗi).
- **Lượt thất bại sau khi đã chuyển dự phòng vẫn đếm là lượt fallback**: nếu chuỗi đã chạm
  nhánh dự phòng (kể cả provider dự phòng bị circuit breaker bỏ qua) rồi mới sập, lượt đó
  vào `bakhi_ai_user_fallback_total` và `bakhi_ai_user_failed_total`, không bị coi là
  "chỉ primary". `summary()` tương ứng: `fallbackRequests` tăng, `primaryOnly` không tăng.
- **Lỗi trước khi gọi provider không phải lượt AI**: 401, 429 hạn mức, `EMPTY_MESSAGE`,
  `MODE_DISABLED`, `DUPLICATE`… không làm tăng `bakhi_ai_user_requests_total` hay
  `..._failed_total`, nên `availability` chỉ phản ánh kết quả provider thật.
- **Circuit OPEN**: attempt không được gửi, nhưng vẫn ghi nhận `skipped` — không tạo
  latency hoặc token giả.

---

## 8. Token usage

1. Adapter đọc `usage` (`prompt_tokens`/`completion_tokens` hoặc
   `usageMetadata.promptTokenCount`/`candidatesTokenCount`).
2. Thiếu một trong hai ⇒ ước lượng bằng `estimate_tokens()` và đặt `estimated=true`.
3. `record_ai_tokens()` chỉ ghi phần > 0. Trường hợp cả input và output đều 0 (provider
   không trả gì) thì **không** tạo series token.
4. Dashboard hiển thị `estimated` riêng; cảnh báo khi `tokens.estimated > 0`.

---

## 9. Cấu hình bảng giá AI

Giá **không** nằm trong mã. Nạp bằng một trong hai biến:

```bash
# Cách 1: JSON trực tiếp (khuyến nghị cho secret manager)
AI_PRICING_JSON='{"version":"2026-11-24","currency":"USD","models":[
  {"provider":"groq","model":"openai/gpt-oss-20b",
   "input_per_million":0.0,"output_per_million":0.0}]}'

# Cách 2: tệp JSON trên máy chủ
AI_PRICING_FILE=/etc/bakhi/pricing.json
```

Xem `rust-backend/pricing.example.json`. Quy tắc:

- Mỗi model cần `provider`, `model`, `input_per_million`, `output_per_million`
  (USD / 1.000.000 token).
- `version` và `currency` là metadata; đổi giá chỉ cần đổi tệp/biến, không sửa logic AI.
- Dòng thiếu trường hoặc giá âm bị bỏ qua kèm cảnh báo; JSON hỏng ⇒ bảng rỗng, backend
  vẫn chạy.
- Model chưa có giá ⇒ `costUsd` không xuất hiện, `unpricedRequests` tăng. **Không** tính 0.

Giá trong tệp mẫu chỉ minh hoạ cấu trúc — thay bằng giá thật từ trang giá của nhà cung cấp.

---

## 10. Bảo vệ `/metrics`

- Mặc định **tắt**: `METRICS_ENABLED=0`. Khi tắt hoặc thiếu `METRICS_TOKEN`, endpoint trả
  **404** (không tiết lộ sự tồn tại).
- Khi bật: bắt buộc `Authorization: Bearer <METRICS_TOKEN>`; so sánh constant-time; sai
  token trả 401.
- Scrape không bị rate limit, không bị giới hạn đồng thời, không bị tính vào thống kê.
- Không đưa `METRICS_TOKEN` vào frontend. Không dùng CORS như cơ chế xác thực.
- Ưu tiên mạng nội bộ (Prometheus cùng VPC/private network). Nếu buộc phải public, đặt
  sau reverse proxy giới hạn IP + HTTPS, hoặc dùng bearer token dài ngẫu nhiên.
- Dashboard Founder **không** gọi `/metrics`; nó gọi endpoint tổng hợp có xác thực phiên
  Founder. Nhờ vậy không có token metrics nào trong trình duyệt.

---

## 11. Tích hợp Prometheus

1. Bật metrics trên backend (`METRICS_ENABLED=1`, `METRICS_TOKEN=…`), khởi động lại.
2. Kiểm tra:
   ```bash
   curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" https://BACKEND/metrics | head
   ```
   Phải thấy `# TYPE bakhi_http_requests_total counter`.
3. Dùng `docs/prometheus.yml`, thay target và token.
4. `promtool check config prometheus.yml` rồi khởi động Prometheus.
5. Mở **Status → Targets**: job `bakhi` phải `UP`, `last scrape` vài giây trước.
6. Kiểm tra dữ liệu: `count(bakhi_http_requests_total)` > 0 sau khi có request thật.

Không cần cài Prometheus trên hosting của Bá Khí; Prometheus bên ngoài scrape qua HTTPS
hoặc mạng nội bộ.

---

## 12. PromQL thường dùng

```promql
# p50 / p95 / p99 toàn hệ thống (5 phút)
histogram_quantile(0.50, sum by (le) (rate(bakhi_http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.95, sum by (le) (rate(bakhi_http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.99, sum by (le) (rate(bakhi_http_request_duration_seconds_bucket[5m])))

# p95 theo endpoint
histogram_quantile(0.95,
  sum by (le, route, method) (rate(bakhi_http_request_duration_seconds_bucket[5m])))

# Tỷ lệ lỗi theo endpoint (%)
100 * sum by (route) (rate(bakhi_http_errors_total[5m]))
    / sum by (route) (rate(bakhi_http_requests_total[5m]))

# Request/giây theo status
sum by (route, status) (rate(bakhi_http_requests_total[5m]))

# AI: success rate theo provider
100 * sum by (provider, model) (rate(bakhi_ai_requests_total{status="success"}[15m]))
    / sum by (provider, model) (rate(bakhi_ai_requests_total[15m]))

# Tỷ lệ fallback
100 * increase(bakhi_ai_user_fallback_total[1h]) / increase(bakhi_ai_user_requests_total[1h])

# Token mỗi giờ theo provider
sum by (provider, type) (increase(bakhi_ai_tokens_total[1h]))

# Chi phí ước tính 24h theo provider
sum by (provider) (increase(bakhi_ai_estimated_cost_usd_total[24h]))

# Model chưa có giá
increase(bakhi_ai_unpriced_requests_total[1h])

# Circuit đang mở
bakhi_circuit_state == 2

# RSS và uptime
bakhi_process_resident_memory_bytes / 1024 / 1024
bakhi_process_uptime_seconds
```

---

## 13. Giới hạn của hosting hiện tại

- Website là GitHub Pages (tĩnh). **Không** chạy được tiến trình Rust thường trực.
- Backend Rust chưa deploy; metrics chỉ tồn tại khi backend chạy ở đâu đó có tiến trình
  liên tục (container/VPS/PaaS free-tier hỗ trợ Docker).
- Nếu hosting chỉ chạy theo request (serverless function), mỗi invocation có bộ nhớ riêng:
  counter sẽ không tích luỹ đúng và `/metrics` không có ý nghĩa. Khi đó cần một tiến trình
  thường trực hoặc đẩy metrics sang hệ thống ngoài — **không** giả lập metrics trong RAM.
- Nhiều instance: scrape từng instance (xem `docs/prometheus.yml`); không gộp sau load
  balancer.
- Không có lịch sử dài hạn trong Bá Khí: dashboard hiển thị "từ lúc khởi động". Muốn lịch
  sử, dùng Prometheus/ hệ thống lưu trữ ngoài; không ghi mỗi request thành một dòng DB.

---

## 14. Troubleshooting

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `/metrics` trả 404 | `METRICS_ENABLED=0`, hoặc thiếu `METRICS_TOKEN` | Đặt cả hai, khởi động lại |
| `/metrics` trả 401 | Sai/thiếu `Authorization: Bearer` | Kiểm tra token, không có khoảng trắng thừa |
| Prometheus target `DOWN` | Sai host/port, chặn mạng, chứng chỉ | `curl -v` từ máy Prometheus; kiểm tra firewall |
| `UP` nhưng không có series | Chưa có request thật, hoặc scrape trúng instance khác | Gọi `/api/v1/health` rồi scrape lại; kiểm tra `instance` |
| Histogram có nhưng quantile trống | Chưa có quan sát trong cửa sổ `rate()` | Dùng `[15m]`, kiểm tra traffic |
| `bakhi_ai_unpriced_requests_total` tăng | Model chưa có trong bảng giá | Thêm model vào `AI_PRICING_JSON`/`AI_PRICING_FILE` |
| Dashboard báo "Chưa cấu hình" | `BK_BACKEND.rustBaseUrl` rỗng hoặc không phải https | Đặt URL https của backend |
| Dashboard 401 | Phiên Founder hết hạn | Đăng nhập lại Founder Dashboard |
| Dashboard 403 | Phiên Administrator thường | Chỉ Founder xem được dữ liệu vận hành |
| Dashboard "Mất kết nối" | CORS chặn origin, backend tắt | Thêm `https://minhtruk.github.io` vào `CORS_ORIGINS`; kiểm tra `/health` |
| Số liệu nhảy về 0 | Backend vừa restart | Bình thường; xem lịch sử trên Prometheus |
| Log có `error_code` nhưng không rõ nguồn | Cần tra theo `request_id` | Tìm `request_id` trong log backend |

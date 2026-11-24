# Bá Khí backend (Rust)

Backend cho các tác vụ cần máy chủ thật: AI Gateway, xác thực tập trung, giới hạn tần suất và
đồng thời, xử lý dữ liệu. Website tĩnh (GitHub Pages / Supabase) **không bị thay thế**.

> Trạng thái 8.7.2: mã nguồn + 166 test + Docker + CI + metrics Prometheus + runtime tối ưu,
> **chưa deploy**. Mặc định website vẫn dùng Supabase Edge Function
> (`BK_BACKEND.mode = 'edge'`).

## Chạy nhanh

```bash
cp .env.example .env      # điền giá trị thật, KHÔNG commit
export $(grep -v '^#' .env | xargs)   # hoặc dùng --env-file với Docker

cargo run                  # http://127.0.0.1:8080
curl -s localhost:8080/api/v1/health
curl -s localhost:8080/api/v1/ready
```

Không có khoá AI? Chạy `AI_TUTOR_MOCK=1 cargo run` để dùng provider giả lập.

## Kiểm tra

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo build --release --locked
```

**166 test**: 81 unit + 85 integration/contract. Supabase và AI provider đều là HTTP server giả
lập trên loopback — không cần khoá thật, không gọi mạng ngoài.

Nhóm test: `health_tests`, `auth_tests`, `api_contract_tests`, `ai_gateway_tests`,
`fallback_tests`, `circuit_breaker_tests`, `learning_stats_tests`, `error_handling_tests`,
`concurrency_tests`, `observability_tests`; golden fixtures ở `tests/fixtures/`.

## Runtime Engine (8.7.1)

- **Một** Tokio multi-thread runtime cho cả vòng đời tiến trình. `RUST_WORKER_THREADS`
  chọn số worker (không đặt = theo số CPU, trần 256); số worker thực tế được log lúc khởi
  động. Không tạo runtime cho từng request.
- **Giới hạn đồng thời 4 lớp**: toàn dịch vụ, lượt AI, mỗi người dùng và mỗi provider AI.
  `RUST_MAX_CONCURRENT_PROVIDER_REQUESTS` (mặc định 10) tách provider chậm khỏi provider
  khác; hết hạn chờ thì chuyển provider kế tiếp, không xếp hàng vô hạn.
- **Tên cấu hình `RUST_*`** được ưu tiên, tên cũ vẫn đọc được:
  `RUST_MAX_CONCURRENT_REQUESTS`, `RUST_MAX_CONCURRENT_AI_REQUESTS`,
  `RUST_MAX_CONCURRENT_PROVIDER_REQUESTS`, `RUST_REQUEST_TIMEOUT_SECS`,
  `RUST_CONNECT_TIMEOUT_SECS`, `RUST_IDLE_CONNECTION_TIMEOUT_SECS`,
  `RUST_POOL_MAX_IDLE_PER_HOST`, `RUST_WORKER_THREADS`. Xem `rust-backend/.env.example`.
- **HTTP pool dùng chung** cho Supabase và mọi provider: idle theo host + idle timeout cấu
  hình được, TCP keep-alive, `tcp_nodelay`.
- **Không blocking trong async path**: render Prometheus chạy trong `spawn_blocking`; đọc
  bảng giá từ tệp chỉ xảy ra một lần lúc khởi động.

## Data Pipeline (8.7.2)

- `ProviderRequest` **mượn** `system`, `messages`, `model`, `api_key`; mỗi provider/retry
  không còn sao chép system prompt và toàn bộ lịch sử hội thoại.
- Body gửi provider được serialize từ struct `Serialize` mượn dữ liệu (OpenAI-compatible
  và Gemini), không dựng cây `serde_json::Value` cho từng lượt.
- Phản hồi provider được đọc bằng borrow; không clone `choices[0]`/`candidates[0]`/`usage`.
- Ước lượng token khi thiếu usage đếm ký tự trực tiếp (`usage_from_parts`), không tạo
  chuỗi `system + model` chỉ để đo.
- Microbenchmark: `cargo run --release --locked --example pipeline_bench` (cũng chạy trong
  job release của CI). Đây là microbenchmark, không phải số đo end-to-end.

## Observability (8.6.2)

```bash
# Bật metrics + token (mặc định tắt)
METRICS_ENABLED=1 METRICS_TOKEN=<token-dài> cargo run
curl -s -H "Authorization: Bearer $METRICS_TOKEN" localhost:8080/metrics | head
```

Metrics: HTTP counter/histogram (p50/p95/p99), error theo endpoint, AI Primary/Fallback,
token thật/ước tính, chi phí ước tính từ `AI_PRICING_JSON`/`AI_PRICING_FILE` (xem
`pricing.example.json`). Scrape không ảnh hưởng thống kê nghiệp vụ. Chi tiết metric, PromQL,
bảo mật và troubleshooting: `docs/OBSERVABILITY.md`, `docs/prometheus.yml`.

## Benchmark

```bash
cargo build --release
node bench/run.mjs        # ghi bench/results.json
```

## Cấu trúc

```
src/
├── main.rs              khởi động, tracing, graceful shutdown có hạn chờ
├── lib.rs               AppState, router, CORS, giới hạn body/timeout, thứ tự middleware
├── lifecycle.rs         cờ draining + đếm request đang chạy
├── config/settings.rs   cấu hình từ env, kiểm tra ràng buộc khi khởi động
├── errors/api_error.rs  error envelope thống nhất + request id
├── middleware/          auth, rate_limit, concurrency, content_type, request_id
├── observability/       metrics (Prometheus text) + access log
├── routes/              health, ready, metrics, me, ai, data
├── providers/           trait AiProvider, OpenAI-compatible, Gemini, circuit breaker
└── services/            prompts, ai_service, data_service, supabase client
```

## Endpoint

| Method | Path | Xác thực | Ghi chú |
|---|---|---|---|
| GET | `/api/v1/health` | không | liveness, không chạm DB |
| GET | `/api/v1/ready` | không | readiness, 503 khi draining/thiếu cấu hình/Supabase down |
| GET | `/api/v1/metrics` | token riêng | mặc định tắt (`METRICS_ENABLED`) |
| GET | `/api/v1/me` | Bearer JWT | danh tính + hồ sơ (student_devices) |
| POST | `/api/v1/ai/chat` | Bearer JWT | AI Gateway, tương thích `ai-tutor-api` action `chat` |
| POST | `/api/v1/data/learning-stats` | Bearer JWT | tổng hợp dữ liệu học tập (hàm thuần) |

## Độ tin cậy (8.6.1)

- Graceful shutdown: SIGTERM/SIGINT ⇒ `/ready` 503, chờ request đang chạy tối đa
  `SHUTDOWN_GRACE_MS` rồi kết thúc.
- Retry chỉ với lỗi tạm thời (408/429/5xx/timeout), tôn trọng `Retry-After`, có hạn gateway.
- Circuit breaker theo provider (CLOSED/OPEN/HALF_OPEN).
- Giới hạn đồng thời toàn dịch vụ / AI / người dùng, có hạn chờ.
- Nhật ký `ai_usage_logs` có `fell_back` + `tokens_estimated`; mỗi request một dòng.
- Metrics ghi một lượt người dùng cho mỗi lượt chat ở `run_chain()`; lượt thất bại sau khi
  đã chuyển dự phòng vẫn tính là lượt fallback.

## Tài liệu

- `docs/RUST_ARCHITECTURE_V860.md` — kiến trúc nền
- `docs/RUST_DEPLOYMENT_V860.md` — triển khai
- `docs/RUST_MIGRATION_V860.md` — chuyển đổi từ Edge
- `docs/RUST_BENCHMARK_V860.md` — số đo 8.6.0
- `docs/RUST_RELIABILITY_V861.md` — vòng đời, retry, timeout, circuit breaker
- `docs/RUST_CONTRACT_TESTING_V861.md` — contract với Edge Function
- `docs/RUST_TESTING_GUIDE_V861.md` — cách chạy và thêm test
- `docs/RUST_OPERATIONS_V861.md` — biến môi trường, runbook
- `docs/RUST_SECURITY_AUDIT_V861.md` — tự đánh giá bảo mật

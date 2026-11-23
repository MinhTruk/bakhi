# Bá Khí backend (Rust)

Backend cho các tác vụ cần máy chủ thật: AI Gateway, xác thực tập trung, giới hạn tần suất và
đồng thời, xử lý dữ liệu. Website tĩnh (GitHub Pages / Supabase) **không bị thay thế**.

> Trạng thái 8.6.1: mã nguồn + 135 test + Docker + CI hoàn thiện, **chưa deploy**. Mặc định
> website vẫn dùng Supabase Edge Function (`BK_BACKEND.mode = 'edge'`).

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

**135 test**: 62 unit + 73 integration/contract. Supabase và AI provider đều là HTTP server giả
lập trên loopback — không cần khoá thật, không gọi mạng ngoài.

Nhóm test: `health_tests`, `auth_tests`, `api_contract_tests`, `ai_gateway_tests`,
`fallback_tests`, `circuit_breaker_tests`, `learning_stats_tests`, `error_handling_tests`,
`concurrency_tests`; golden fixtures ở `tests/fixtures/`.

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

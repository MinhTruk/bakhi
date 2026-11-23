# Bá Khí backend (Rust)

Backend cho các tác vụ cần máy chủ thật: AI Gateway, xác thực tập trung, giới hạn tần suất,
xử lý dữ liệu. Website tĩnh (GitHub Pages / Supabase) **không bị thay thế**.

> Trạng thái 8.6.0: mã nguồn + test + Docker + CI hoàn thiện, **chưa deploy**. Mặc định
> website vẫn dùng Supabase Edge Function (`BK_BACKEND.mode = 'edge'`).

## Chạy nhanh

```bash
cp .env.example .env      # điền giá trị thật, KHÔNG commit
export $(grep -v '^#' .env | xargs)   # hoặc dùng --env-file với Docker

cargo run                  # http://127.0.0.1:8080
curl -s localhost:8080/api/v1/health
```

Không có khoá AI? Chạy `AI_TUTOR_MOCK=1 cargo run` để dùng provider giả lập.

## Kiểm tra

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
cargo build --release
```

58 test: 42 unit + 16 end-to-end (mock Supabase + mock provider, không gọi mạng ngoài).

## Benchmark

```bash
cargo build --release
node bench/run.mjs        # ghi bench/results.json
```

## Cấu trúc

```
src/
├── main.rs              khởi động, tracing, graceful shutdown
├── lib.rs               AppState, router, CORS, giới hạn body/timeout
├── config/settings.rs   cấu hình từ biến môi trường (Debug đã che khoá)
├── errors/api_error.rs  error envelope thống nhất + request id
├── middleware/          auth (Supabase JWT), rate_limit, request_id
├── routes/              health, me, ai, data
├── providers/           trait AiProvider + OpenAI-compatible + Gemini + registry
└── services/            prompts, ai_service, data_service, supabase client
```

Không có module rỗng: mỗi tệp đều phục vụ một endpoint hoặc một quy tắc đang dùng.

## Endpoint

| Method | Path | Xác thực |
|---|---|---|
| GET | `/api/v1/health` | không |
| GET | `/api/v1/ready` | không |
| GET | `/api/v1/me` | Bearer JWT |
| POST | `/api/v1/ai/chat` | Bearer JWT |
| POST | `/api/v1/data/learning-stats` | Bearer JWT |

## Tài liệu

- `docs/RUST_ARCHITECTURE_V860.md`
- `docs/RUST_DEPLOYMENT_V860.md`
- `docs/RUST_MIGRATION_V860.md`
- `docs/RUST_BENCHMARK_V860.md`

# Bá Khí v8.6.1 — Hướng dẫn kiểm thử backend Rust

> Phiên bản: 8.6.1 · Ngày: 2026-11-24
>
> Toàn bộ test chạy offline: Supabase và AI provider đều là HTTP server giả lập trên
> `127.0.0.1`. Không cần khoá thật, không ghi vào production.

## 1. Cài đặt

```bash
export PATH="$HOME/.cargo/bin:$PATH"   # nếu cargo chưa có trên PATH
rustup component add rustfmt clippy    # một lần cho mỗi máy
cd rust-backend
cargo fetch --locked
```

Không cần Node, jsdom hay Supabase CLI cho test Rust.

## 2. Lệnh kiểm tra bắt buộc trước khi push

```bash
cd rust-backend
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo build --release --locked
```

CI job `check` chạy đúng bốn bước trên (trừ `--check` ở fmt), job `contract` chạy riêng nhóm
contract/resilience, job `security` quét khoá bí mật và lỗ hổng phụ thuộc, job `build` dựng
image Docker và thử SIGTERM. Không job nào cần secret production.

## 3. Cấu trúc test

```
rust-backend/
├── src/**                       unit test trong `#[cfg(test)] mod tests`
└── tests/
    ├── common/mod.rs            harness dùng chung (mock Supabase + mock provider)
    ├── fixtures/*.json          golden fixtures cho contract test
    ├── integration.rs           15 test end-to-end cũ (giữ nguyên hành vi)
    ├── health_tests.rs          liveness / readiness / metrics
    ├── auth_tests.rs            JWT, ánh xạ danh tính, quyền sở hữu
    ├── api_contract_tests.rs    schema + status + error envelope
    ├── ai_gateway_tests.rs      retry, Retry-After, timeout budget, usage log
    ├── fallback_tests.rs        Primary → Fallback, nhãn route
    ├── circuit_breaker_tests.rs CLOSED/OPEN/HALF_OPEN + bỏ qua provider
    ├── learning_stats_tests.rs  hàm thuần, không I/O
    ├── error_handling_tests.rs  không rò rỉ nội bộ, request id
    └── concurrency_tests.rs     giới hạn đồng thời, 429 có hạn chờ
```

Tổng: **135 test** (62 unit + 73 integration/contract).

### Phân loại

| Nhóm | Ở đâu | Kiểm tra |
|---|---|---|
| Unit | `src/**` | hàm thuần, parse, envelope, circuit state machine, metrics |
| Integration | `tests/integration.rs` + các tệp `*_tests.rs` | router + middleware thật, mock HTTP |
| Contract | `api_contract_tests.rs` | schema, status, mã lỗi so với Edge |
| Resilience | `ai_gateway_tests`, `fallback_tests`, `circuit_breaker_tests` | retry, timeout, fallback, circuit |
| Security | `auth_tests`, `error_handling_tests`, `concurrency_tests` | xác thực, quyền, rò rỉ, tài nguyên |

## 4. Harness giả lập

`tests/common/mod.rs` dựng:

- Supabase Auth: `GET /auth/v1/user`, `GET /auth/v1/health`.
- PostgREST: `student_devices`, `students`, `ai_settings`, `ai_model_routes`, `ai_messages`,
  `ai_conversations`, `ai_usage_logs` (GET/POST/PATCH).
- AI provider: `/v1/chat/completions` (OpenAI-compatible) và
  `/v1beta/models/<model>:generateContent` (Gemini).
- Điều khiển: `set_provider_mode`, `set_provider_sequence`, `set_provider_delay_ms`,
  `set_routes`, `set_device_bound`, `set_student_active`, `set_auth_health`, `set_db_fail`.

Ví dụ điều khiển chế độ:

| Lệnh | Hành vi provider |
|---|---|
| `set_provider_mode("auth_error")` | 401 |
| `set_provider_mode("bad_request")` | 400 |
| `set_provider_mode("server_error")` | 500 |
| `set_provider_mode("rate_limit")` | 429 + `Retry-After: 0` |
| `set_provider_mode("quota")` | 429 + body quota |
| `set_provider_mode("primary_down")` | 503 cho model bắt đầu bằng `primary` |
| `set_provider_sequence(vec![429, 200])` | lần lượt theo danh sách |
| `set_provider_delay_ms(400)` | độ trễ trước khi trả lời |

## 5. Thêm test mới

- Dùng `harness(|settings| { … }).await`; mọi thay đổi cấu hình đi qua closure.
- Không gọi mạng ngoài; nếu cần hành vi mới, thêm nhánh vào `mock_handler` và một setter.
- Test lỗi phải kiểm tra **cả** status, mã lỗi và việc không rò rỉ (`assert_clean`).
- Test song song phải giữ permit của request đầu bằng một tác vụ `tokio::spawn` rồi mới gửi
  request thứ hai.
- Khi thêm endpoint: cập nhật fixture + `api_contract_tests` + tài liệu contract.

## 6. Kiểm thử cần môi trường thật (chưa chạy được ở đây)

| Việc | Cần gì | Trạng thái |
|---|---|---|
| Ghi hội thoại/usage vào Supabase thật | JWT học sinh đã gắn phiên | **chưa chạy** |
| Gọi provider thật (Groq/Gemini) | khoá AI thật, tốn phí | **chưa chạy** |
| So sánh độ trễ với Edge Function | deploy staging | **chưa chạy** |
| Kiểm tra trình duyệt khi `mode: 'rust'` | backend đã deploy | **chưa chạy** |
| Build Docker trong máy này | Docker daemon | **chưa chạy** (CI sẽ chạy) |

Không được ghi những mục trên là "đã kiểm thử" trong báo cáo phát hành.

## 7. Kiểm thử frontend liên quan (không đổi ở 8.6.1)

```bash
node tools/content-integrity.js verify
node tools/qa/ai-tutor-smoke.js
node tools/qa/ai-tutor-rendering-security.js
node tools/qa/version-audit.js
node tools/bump-version.js --check
```

Các lệnh này chứng minh frontend và cấu hình mặc định `edge` vẫn nguyên vẹn sau khi bump
phiên bản.

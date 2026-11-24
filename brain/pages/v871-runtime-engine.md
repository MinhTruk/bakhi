---
id: v871-runtime-engine
title: "v8.7.1: Runtime Engine — một Tokio runtime, giới hạn theo provider, HTTP pool dùng chung"
category: decision
status: active
tags: [runtime, tokio, concurrency, reqwest, rust, 8.7.1]
created: "2026-11-24T19:09:20"
updated: "2026-11-24T19:09:20"
---

<!-- compiled_truth -->
## Bối cảnh

8.6.2 đã có observability nhưng runtime vẫn dùng `#[tokio::main]` mặc định, giới hạn đồng
thời chỉ có ba lớp (toàn dịch vụ / AI / người dùng), tham số HTTP pool viết cứng trong
`lib.rs`, và handler `/metrics` đọc `/proc/self/statm` bằng `std::fs` ngay trong async
context. 8.7.1 tối ưu phần thực thi, **không** đổi kiến trúc Hybrid, API contract hay
`BK_BACKEND.mode = 'edge'`.

## Quyết định

- **Một runtime duy nhất, cấu hình được.** `main.rs` bỏ `#[tokio::main]`, dựng
  `Builder::new_multi_thread().enable_all().thread_name("bakhi-worker")` rồi
  `block_on(run(...))`. `RUST_WORKER_THREADS` (0/không đặt = theo CPU, trần 256). Số worker
  thực tế log lúc khởi động. Không runtime nào được tạo cho từng request.
- **Giới hạn đồng thời theo từng provider.** `Concurrency` giữ `HashMap<&'static str,
  Arc<Semaphore>>` dựng từ `Provider::ALL`; `run_chain()` lấy permit ngay trước khi gọi HTTP
  và `drop` trước khi xử lý kết quả/backoff. Hết `CONCURRENCY_WAIT_MS` ⇒ ghi attempt
  `PROVIDER_DOWN`, chuyển provider kế tiếp, không xếp hàng vô hạn và không mở circuit.
- **Tên cấu hình `RUST_*` ưu tiên, tên cũ vẫn đọc.** `var_any()`/`parse_num_any()` cho phép
  `RUST_MAX_CONCURRENT_REQUESTS` thay `MAX_CONCURRENCY`, v.v. Thời gian chờ có thêm dạng
  giây (`RUST_REQUEST_TIMEOUT_SECS`, `RUST_CONNECT_TIMEOUT_SECS`,
  `RUST_IDLE_CONNECTION_TIMEOUT_SECS`). Mọi giá trị vẫn được validate khi khởi động; lỗi
  nêu tên biến, không nêu giá trị bí mật.
- **HTTP pool cấu hình được và dùng chung.** `build_http_client()` đọc
  `RUST_POOL_MAX_IDLE_PER_HOST` (mặc định 32, trần 1024) và
  `RUST_IDLE_CONNECTION_TIMEOUT_SECS` (mặc định 90), thêm TCP keep-alive 60 giây; Supabase
  và mọi provider dùng cùng client trong `AppState`.
- **Không file I/O blocking trong async path.** `/metrics` render trong
  `tokio::task::spawn_blocking` (đọc `/proc/self/statm` + dựng chuỗi lớn). `AI_PRICING_FILE`
  vẫn chỉ đọc một lần trong `Settings::from_env()` trước khi runtime chạy.
- **Cấp phát trước** cho `attempts` (số provider × số retry) và message gửi provider
  (`Vec::with_capacity`). Không thêm crate, không `unsafe`.
- **Release profile giữ nguyên** (`opt-level = 3`, `lto = "thin"`, `codegen-units = 1`,
  `strip = true`) vì đã đúng từ trước; không đổi chỉ để "đổi".

## Bằng chứng

- `cargo fmt`/`clippy`/`test`/`build --release` **không chạy được trên máy phiên này**
  (không có Rust toolchain, không có Docker). CI `rust-backend.yml` là nơi xác nhận; không
  tạo số liệu benchmark giả.
- Test mới: giới hạn provider tách biệt và nhả permit khi drop (`concurrency.rs`), validate
  giây/worker/pool (`settings.rs`). Tổng dự kiến 166 test (81 unit + 85 integration).

## Hệ quả

- Cấu hình triển khai cũ chạy nguyên, không phải đổi biến môi trường.
- Provider quá tải trả lỗi nhanh (502 `PROVIDER_DOWN`/timeout) thay vì giữ request hàng phút.
- Khi cần giới hạn CPU container: đặt `RUST_WORKER_THREADS`, không sửa code.


## Timeline

- time: 2026-11-24T19:09:20
  kind: decision
  summary: "Created this page: v8.7.1: Runtime Engine — một Tokio runtime, giới hạn theo provider, HTTP pool dùng chung"
  source: v8.7.1 runtime optimization
  affects: [v871-runtime-engine]

- time: 2026-11-24T19:09:20
  kind: decision
  summary: "chốt cấu hình runtime 8.7.1"
  source: rust-backend v8.7.1
  affects: [v871-runtime-engine]

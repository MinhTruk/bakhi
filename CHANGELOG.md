# Changelog

Mọi thay đổi đáng chú ý của Bá Khí. Định dạng dựa trên Keep a Changelog.

## [8.7.2] — 2026-11-24

**Serialization & Data Optimization.** Giảm chi phí chuyển dữ liệu giữa JavaScript và
Rust ở AI Gateway: không còn sao chép system prompt/lịch sử cho mỗi lần thử provider,
body provider được serialize trực tiếp từ struct mượn dữ liệu thay vì dựng cây
`serde_json::Value`, và bỏ các clone `Value` không cần thiết khi đọc phản hồi.
**Không đổi API contract, schema Supabase, auth/RLS, logic Primary/Fallback,
`BK_BACKEND.mode` (vẫn `edge`), không deploy.**

### Cải tiến

- **Bỏ deep-clone ở mỗi attempt** — `ProviderRequest` nay mượn `system`, lịch sử hội
  thoại, model và khoá API. Trước đây mỗi provider/retry sao chép toàn bộ system prompt
  (có thể vài KB) và cả `Vec<ChatTurn>`; chuỗi tối đa 6 provider × 3 lần thử nên bản sao
  tăng theo số attempt.
- **Serialize body provider không qua `Value`** — adapter OpenAI-compatible và Gemini
  dùng struct `Serialize` mượn dữ liệu, bỏ một map `json!` cho mỗi lượt hội thoại.
- **Đọc phản hồi provider không clone** — bỏ `.cloned()` trên `choices[0]`,
  `candidates[0]` và `usage`; nội dung nhiều part được ghép trong một buffer thay vì
  `Vec<&str>` + `join` + `trim` tạo nhiều chuỗi trung gian.
- **Ước lượng token không tạo chuỗi** — `usage_from_parts` đếm ký tự của system + model
  thay vì `format!` toàn bộ system prompt chỉ để ước lượng khi provider thiếu usage.
- **Bớt clone cấu hình và bản ghi** — không dựng `ModelRoute` tạm (5 chuỗi) cho cấu hình
  mặc định, không clone toàn bộ `AiSettings` khi định tuyến model, đọc dòng
  `ai_settings`/tin nhắn cuối bằng quyền sở hữu hoặc borrow.
- **Ghi tin nhắn không cắt chuỗi vô ích** — chỉ cấp phát bản sao khi nội dung vượt
  24.000 ký tự; `clean_message` giảm từ bốn lần cấp phát xuống hai.
- **Benchmark micro chạy trong CI** — `rust-backend/examples/pipeline_bench.rs` đo
  clone system + lịch sử, dựng body bằng `Value` so với struct, và parse chat request
  ở ba quy mô. Đây là microbenchmark của đúng các thao tác đã đổi, không phải số đo
  end-to-end.

### Ghi chú

- **Không thêm batch API.** AI chat là một lượt mỗi lần gọi; `/api/v1/data/learning-stats`
  đã nhận cả lô trong một request. Thêm endpoint batch cho chat sẽ trùng API và phá
  semantics chống gửi trùng/hạn mức hiện có.
- **Chưa streaming.** Chuyển sang SSE sẽ đổi contract response và frontend — ngoài
  phạm vi tối ưu an toàn của bản này.
- Số liệu benchmark lấy từ log CI của job release, không ghi số ước lượng vào tài liệu.
- 166 test hiện có vẫn là cổng chặn; không đổi fixture hay contract.

## [8.7.1] — 2026-11-24

**Runtime Engine.** Tối ưu cách Rust Backend thực thi tác vụ: một Tokio multi-thread
runtime cho toàn bộ vòng đời tiến trình, worker thread cấu hình được, giới hạn đồng thời
theo từng provider AI, tên cấu hình `RUST_*` chuẩn hoá (vẫn đọc tên cũ), và bỏ file I/O
đồng bộ khỏi async path. **Không đổi API contract, không đổi giao diện/URL học sinh,
không đổi `BK_BACKEND.mode` (vẫn `edge`), không đổi schema Supabase, không deploy.**

### Tính năng

- **Một Tokio multi-thread runtime, cấu hình được** — `main.rs` dựng runtime tường minh
  thay vì `#[tokio::main]`; `RUST_WORKER_THREADS` chọn số worker (mặc định để Tokio tự
  chọn theo CPU), có `thread_keep_alive`, không tạo runtime cho từng request. Số worker
  thực tế được log lúc khởi động. Giá trị 0/không đặt = tự động; trần 256.
- **Giới hạn đồng thời theo từng provider AI** — mỗi provider có semaphore riêng
  (`RUST_MAX_CONCURRENT_PROVIDER_REQUESTS`, mặc định 10). Provider chậm hoặc đang bão hoà
  không chiếm hết chỗ của provider khác; hết `CONCURRENCY_WAIT_MS` thì bỏ provider đó và
  chuyển provider kế tiếp thay vì xếp hàng vô hạn. Permit chỉ giữ trong lúc gọi HTTP,
  không giữ qua backoff/retry.
- **Chuẩn hoá tên cấu hình** — `RUST_MAX_CONCURRENT_REQUESTS`,
  `RUST_MAX_CONCURRENT_AI_REQUESTS`, `RUST_MAX_CONCURRENT_PROVIDER_REQUESTS`,
  `RUST_REQUEST_TIMEOUT_SECS`, `RUST_CONNECT_TIMEOUT_SECS`,
  `RUST_IDLE_CONNECTION_TIMEOUT_SECS`, `RUST_POOL_MAX_IDLE_PER_HOST`,
  `RUST_WORKER_THREADS`. Tên cũ (`MAX_CONCURRENCY`, `REQUEST_TIMEOUT_MS`, …) vẫn hoạt
  động nên cấu hình triển khai hiện có không phải sửa; mọi giá trị được kiểm tra khi
  khởi động và lỗi nêu tên biến, không nêu giá trị bí mật.
- **HTTP client/connection pool dùng chung** — `AppState` dựng client MỘT LẦN; pool idle
  theo host và idle timeout nay cấu hình được (mặc định 32 / 90 giây), giữ TCP keep-alive
  và `tcp_nodelay`. Supabase và mọi provider AI dùng lại cùng pool.
- **Giảm cấp phát bộ nhớ** — `Vec` attempt của chuỗi provider và danh sách message gửi
  provider được cấp phát trước theo kích thước đã biết.
- **Không còn file I/O đồng bộ trong async path** — render Prometheus (đọc
  `/proc/self/statm` và dựng chuỗi lớn) chạy trong `tokio::task::spawn_blocking`, không
  chặn worker thread của runtime.
- **166 test** (81 unit + 85 integration/contract), thêm test cho giới hạn provider,
  kiểm tra giá trị giây và trần worker/pool.

### Ghi chú

- Release profile giữ `opt-level = 3`, `lto = "thin"`, `codegen-units = 1`, `strip = true`:
  cấu hình này đã có từ trước và không thay đổi trong 8.7.1.
- Chưa có số đo benchmark mới: môi trường phiên làm việc này không có Rust toolchain.
  `bench/run.mjs` đã sẵn sàng để đo lại khi có môi trường build release; không tạo số liệu
  minh hoạ.

## [8.6.2] — 2026-11-24

**Observability.** Backend Rust tự bộc lộ tình trạng hoạt động: histogram latency thật
(p50/p95/p99), tỷ lệ lỗi theo endpoint, giám sát AI Primary/Fallback, token thực tế/ước
tính, chi phí AI ước tính từ bảng giá cấu hình, `/metrics` tương thích Prometheus và tab
**Vận hành** trong Founder Dashboard. **Không đổi giao diện học sinh**, không đổi
`BK_BACKEND.mode` (vẫn `edge`), không đổi schema Supabase, không deploy.

### Tính năng

- **HTTP metrics thật** — mỗi request ghi một lần sau khi hoàn tất:
  `bakhi_http_requests_total{method,route,status}` và histogram
  `bakhi_http_request_duration_seconds{method,route,status}` với 15 bucket từ 5 ms tới 60 s.
  p50/p95/p99 tính bằng nội suy bucket (thuật toán `histogram_quantile`), không lấy trung
  bình của các trung bình. Route chuẩn hoá (`/api/v1/students/123` → nhãn cố định), path lạ
  gộp `/other` để cardinality hữu hạn.
- **Tỷ lệ lỗi theo endpoint** — `bakhi_http_errors_total{method,route,category}` phân biệt
  `client_error` (4xx), `server_error` (5xx), `upstream_error` (502/503) và `timeout` (504).
  Lỗi do người dùng gửi dữ liệu sai KHÔNG bị tính là lỗi máy chủ.
- **Giám sát AI Primary/Fallback** — `bakhi_ai_requests_total{role,provider,model,status}`,
  histogram latency riêng từng provider, `bakhi_ai_fallback_total{outcome}`
  (`attempted`/`success`/`failure`/`skipped`) và bộ đếm lượt người dùng
  (`bakhi_ai_user_requests_total`, `..._fallback_total`, `..._failed_total`). Một lượt
  chuyển dự phòng vẫn là MỘT lượt AI của người dùng.
- **Token và chi phí** — `bakhi_ai_tokens_total{role,provider,model,type,estimated}` tách
  token thật (`estimated="false"`) khỏi token ước lượng; chi phí
  `bakhi_ai_estimated_cost_usd_total` tính từ bảng giá nạp bằng `AI_PRICING_JSON` hoặc
  `AI_PRICING_FILE`. Model thiếu giá ⇒ `bakhi_ai_unpriced_requests_total` tăng và **không**
  bao giờ bị tính thành 0 USD.
- **`GET /metrics`** — Prometheus text exposition (`text/plain; version=0.0.4`), có cả ở
  `/api/v1/metrics` cho tương thích 8.6.1. Mặc định TẮT; chỉ bật khi `METRICS_ENABLED=1`
  và `METRICS_TOKEN` được đặt, request phải gửi `Authorization: Bearer <token>`. Scrape
  không bị tính vào thống kê nghiệp vụ và không bị chặn bởi giới hạn đồng thời.
- **Tab Vận hành (Founder Dashboard)** — tổng quan request/lỗi/latency/p50/p95/p99, bảng
  API sắp xếp được, bảng provider Primary/Fallback, token + chi phí ước tính, trạng thái
  hệ thống (uptime, RSS, metrics, circuit). Dữ liệu lấy từ
  `POST /api/v1/observability/summary` bằng chính phiên Founder (`x-admin-token`);
  Administrator thường nhận 403, chưa đăng nhập nhận 401. Không có token metrics nào
  trong trình duyệt.
- **163 test** (78 unit + 85 integration/contract), thêm test observability: ẩn/bảo vệ
  `/metrics`, đếm đúng 4xx, loại scrape khỏi thống kê, token thật/ước tính, chi phí có/không
  có bảng giá, fallback thành công/thất bại (kể cả lượt thất bại đã qua dự phòng), lỗi trước
  khi gọi provider, xác thực Founder cho endpoint tổng hợp.

### Sửa lỗi

- **Lượt thất bại sau khi chuyển dự phòng được tính là fallback** — trước đây
  `bakhi_ai_user_fallback_total` chỉ tăng khi provider dự phòng trả lời thành công, nên chuỗi
  Primary → Fallback cùng sập bị đếm như "chỉ primary" và fallback rate thấp hơn thực tế.
  Nay `run_chain()` ghi bộ đếm lượt người dùng đúng một lần ở cả nhánh lỗi, với
  `fell_back = true` khi đã chạm nhánh dự phòng (kể cả provider dự phòng bị circuit OPEN bỏ
  qua); `ai_usage_logs.fell_back` của lượt lỗi cũng ghi trung thực.
- **Lỗi trước khi gọi provider không còn làm sai `availability`** — 401, 429 hạn mức, câu
  hỏi rỗng, chế độ tắt, câu hỏi trùng không còn bị đếm là lượt AI thất bại.
- **Docker builder dùng toolchain mới hơn** — image builder nâng từ `rust:1.83-bookworm` lên
  `rust:1.92-bookworm` (và `rust-version` lên 1.85) vì `Cargo.lock` có crate khai báo manifest
  edition 2024 mà Cargo 1.83 không đọc được, làm bước build image trong CI thất bại.
- **Tab Vận hành chỉ dành cho Founder** — Administrator thường không còn thấy mục này trong
  điều hướng dashboard (trước đó chỉ bị chặn ở máy chủ bằng 403).

### Cải tiến

- **Access log có tương quan** — `request_id`, method, route chuẩn hoá, status, thời gian,
  nhóm lỗi và mã lỗi nghiệp vụ (`x-error-code`); mức WARN cho 5xx. Không ghi Authorization,
  khoá, nội dung hội thoại hay dữ liệu cá nhân.
- **RSS và uptime** — `bakhi_process_uptime_seconds`, `bakhi_process_resident_memory_bytes`
  (đọc `/proc/self/statm`, không có thì bỏ metric thay vì bịa số) và `bakhi_build_info`.
- **Tài liệu vận hành** — `docs/OBSERVABILITY.md` (metric, label, PromQL, bảo mật,
  troubleshooting), `docs/prometheus.yml`, `rust-backend/pricing.example.json`.

### Ghi chú

- **Chưa deploy.** Hosting hiện tại chưa có backend Rust chạy liên tục; Prometheus phải
  scrape từ ngoài (xem `docs/OBSERVABILITY.md` mục 13). Metric là dữ liệu runtime trong
  bộ nhớ — counter reset khi restart là hành vi đúng.
- **Chưa có streaming** nên chưa có `bakhi_ai_time_to_first_token_seconds`; không tạo
  metric rỗng chỉ để đủ danh sách.

## [8.6.1] — 2026-11-24

**Reliability before performance.** Củng cố backend Rust trước khi triển khai: vòng đời
(shutdown có hạn), phục hồi khi provider/Supabase lỗi, contract testing với Edge Function,
giới hạn tài nguyên và bộ test đầy đủ hơn. **Không thay đổi giao diện người dùng**, không đổi
`BK_BACKEND.mode` (vẫn `edge`), không đổi schema Supabase, không deploy.

### Tính năng

- **Graceful shutdown có hạn chờ** — nhận SIGTERM/SIGINT ⇒ bật cờ draining (`/ready` trả 503
  ngay), ngừng nhận request mới, chờ request đang chạy tối đa `SHUTDOWN_GRACE_MS` (mặc định
  20 giây) rồi kết thúc. Log ghi số request đang chạy; cấu hình sai làm tiến trình dừng ngay
  khi khởi động với thông điệp không chứa khoá.
- **Health/readiness tách đúng nghĩa** — `/health` chỉ phản ánh tiến trình (không chạm
  Supabase, không gọi AI); `/ready` kiểm tra cấu hình bắt buộc + Supabase Auth với timeout
  ngắn, phân biệt `config_error` với `dependency_down` qua header nội bộ `x-ready-reason`.
- **Circuit breaker theo provider** — CLOSED/OPEN/HALF_OPEN, ngưỡng + cooldown + số request
  thử cấu hình được; provider OPEN bị bỏ qua nhưng provider khác và thứ tự Primary → Fallback
  không đổi. Trạng thái chỉ theo provider (tối đa 8 mục), không theo người dùng.
- **Chính sách thử lại có kỷ luật** — chỉ 408/429/5xx/timeout/kết nối; tôn trọng
  `Retry-After` (trần 30 giây); 400/401/403/lỗi cấu hình/model không thử lại và không chuyển
  dự phòng; tổng thời gian mọi attempt không vượt hạn gateway (`AI_GATEWAY_TIMEOUT_MS`).
- **Giới hạn đồng thời ba lớp** — toàn dịch vụ, lượt gọi AI, mỗi người dùng (mặc định 1 như
  khoá `inFlight` của Edge); mọi lần chờ có hạn, hết hạn trả 429 `BUSY`/`RATE_LIMIT` thay vì
  treo.
- **Metrics nội bộ** — `GET /api/v1/metrics` định dạng Prometheus, **mặc định tắt**, chỉ bật
  khi `METRICS_ENABLED=1` và `METRICS_TOKEN` được đặt; không chứa dữ liệu người dùng.
- **135 test** (62 unit + 73 integration/contract) chia theo nhóm: health, auth, API contract,
  AI gateway, fallback, circuit breaker, learning stats, error handling, concurrency; golden
  fixtures trong `rust-backend/tests/fixtures/`.

### Sửa lỗi

- **Ánh xạ học sinh sai schema** — backend từng truy vấn `students.auth_user_id`, cột không
  tồn tại (quan hệ thật là auth.users → `student_devices` → `students`). Nay liên kết đọc qua
  `student_devices` bằng JWT của chính người học, hồ sơ đọc bằng service role (bảng `students`
  bị thu hồi với `authenticated`). Tài khoản chưa gắn hồ sơ trả 409 `NOT_BOUND`, hồ sơ ngừng
  hoạt động trả 403 `INACTIVE` như Edge Function.
- **Mã lỗi nghiệp vụ khớp Edge** — hạn mức ngày dùng `DAILY_LIMIT`/`DAILY_TOKEN_LIMIT`;
  lỗi dữ liệu trả 500 `DB_ERROR`; thêm 415 `UNSUPPORTED_MEDIA_TYPE` khi body không phải JSON.
- **Nhật ký sử dụng AI** ghi thêm `fell_back` và `tokens_estimated` như Edge Function; mỗi
  request chỉ một dòng, lỗi ghi log không làm hỏng câu trả lời.
- **Tiêu đề hội thoại tự sinh** cắt 64 ký tự kèm dấu ba chấm, khớp Edge Function.

### Cải tiến

- **Timeout theo lớp** — kết nối, provider, gateway, Supabase và request; kiểm tra tính nhất
  quán ngay khi khởi động (gateway ≤ request, provider ≤ gateway, connect ≤ provider).
- **Log có cấu trúc** — mỗi request ghi `request_id`, method, route, status, thời gian và nhóm
  lỗi; không ghi Authorization/apikey/nội dung.
- **CI** — thêm job contract test tách riêng, kiểm tra lỗ khoá bí mật (gitleaks) và lỗ hổng
  phụ thuộc (cargo-audit), giữ nguyên bước build Docker nhưng **không deploy**.
- **Docker** — thêm `STOPSIGNAL SIGTERM` để orchestration dừng đúng tín hiệu graceful.
- **Tài liệu** — `docs/RUST_RELIABILITY_V861.md`, `docs/RUST_CONTRACT_TESTING_V861.md`,
  `docs/RUST_TESTING_GUIDE_V861.md`, `docs/RUST_OPERATIONS_V861.md`,
  `docs/RUST_SECURITY_AUDIT_V861.md`.

### Ghi chú triển khai

- Backend Rust **vẫn chưa deploy** và **vẫn không phải backend mặc định**
  (`BK_BACKEND.mode = 'edge'`). Toàn bộ thay đổi nằm trong `rust-backend/`, tài liệu và CI;
  website, Edge Function và schema Supabase không đổi.

## [8.6.0] — 2026-11-23

**Rust Hybrid Architecture.** Backend Rust độc lập cho các tác vụ phù hợp; website tĩnh,
Supabase và toàn bộ giao diện giữ nguyên. Không có thay đổi nào trên giao diện người dùng.

### Tính năng

- **Backend Rust mới (`rust-backend/`)** — Axum + Tokio + Serde, kiến trúc modular
  monolith. Có `/api/v1/health`, `/api/v1/ready`, `/api/v1/me`, `/api/v1/ai/chat`,
  `/api/v1/data/learning-stats`; Dockerfile nhiều tầng; workflow CI riêng
  (`.github/workflows/rust-backend.yml`) chạy `cargo fmt --check`, `cargo clippy -D warnings`,
  `cargo test` và build Docker.
- **AI Gateway bằng Rust** — điều phối provider giống Edge Function `ai-tutor-api`: đọc
  `ai_settings` + `ai_model_routes`, chạy chuỗi Primary → Fallback, thử lại chỉ với lỗi tạm
  thời, timeout theo cấu hình, ghi `ai_usage_logs`. Giữ nguyên system prompt, 8 chế độ,
  định tuyến model, ngân sách token và hình dạng phản hồi nên giao diện không phải sửa.
- **Endpoint tổng hợp dữ liệu học tập** — độ chính xác theo môn, chủ đề yếu nhất, chuỗi
  ngày học, nhịp học theo tuần; hàm thuần, không truy cập database.
- **Chọn backend khi cần (`BK_BACKEND`)** — khoá cấu hình trong
  `assets/bakhi/bk-supabase.config.js`, **mặc định `edge`**. Khi đặt `mode: 'rust'` và
  `rustBaseUrl` hợp lệ, Trợ lý AI gọi backend Rust qua đúng một điểm vào (`post()`);
  không tự chuyển ngầm về Edge Function vì chat không idempotent.

### Cải tiến

- **Bảo mật backend:** xác thực bằng Supabase Auth (không tự phát minh đăng nhập), CORS
  theo danh sách origin, giới hạn kích thước body, request ID, giới hạn tần suất theo IP
  và theo người dùng, che khoá trong log, error envelope thống nhất không lộ stack trace
  hay chi tiết nhà cung cấp AI.
- **Hiệu năng:** một HTTP client dùng chung cho mọi request (keep-alive, pool 32 kết nối),
  provider registry khởi tạo một lần, không tạo client mới trong mỗi lượt gọi.
- **Tài liệu:** `docs/RUST_ARCHITECTURE_V860.md`, `docs/RUST_DEPLOYMENT_V860.md`,
  `docs/RUST_MIGRATION_V860.md`, `docs/RUST_BENCHMARK_V860.md`.

### Ghi chú triển khai

- Backend Rust **chưa được deploy** — chưa có hosting dịch vụ và chưa cấu hình secret trên
  nền tảng. Website tiếp tục chạy đúng như 8.5.6 qua Supabase Edge Function.
- Không thay đổi schema Supabase, không thay đổi Edge Function, không xoá API cũ.

## [8.5.6] — 2026-11-23

### Tính năng

- **Xoá mọi thông báo thông thường trong Trung tâm thông báo.** Thông báo cập nhật
  phiên bản, cập nhật tính năng, bảo trì, thông báo hệ thống và thông báo chung đều có
  nút xoá riêng; mục trong nhóm “Cập nhật phiên bản” cũng xoá được. Loại thông báo được
  xác định bằng **dữ liệu** (`type`, `admin_session`, `notice_kind`, `category`) chứ không
  so sánh văn bản hiển thị.
- **Hai loại thông báo được bảo vệ:** thông báo quản trị phiên không có nút xoá, và phản
  hồi báo cáo tiếp tục đi theo cơ chế báo cáo hiện có (đọc / hoàn thiện / đóng) — không
  bị nút xoá thông thường hay xoá hàng loạt can thiệp.
- **Founder Dashboard — chọn nhiều thông báo để xoá.** Mỗi dòng có checkbox, hàng tiêu đề
  có **Chọn tất cả**, thanh công cụ có **Bỏ chọn**, số lượng đang chọn và **Xoá đã chọn**
  (chỉ bật khi có lựa chọn). Hộp xác nhận nêu rõ số lượng; kết quả từng phần được báo
  trung thực (`Đã xoá 3/5 thông báo…`) và lựa chọn được giữ lại cho lần thử tiếp.
- **Founder Dashboard — xoá báo cáo đã hoàn thành.** Báo cáo ở trạng thái đã giải quyết
  hoặc đã đóng có nút **Xoá báo cáo** trong menu thao tác của dòng và trong trang chi
  tiết, kèm hộp xác nhận. Máy chủ (`reports.delete`) kiểm tra trạng thái thật trong cơ sở
  dữ liệu và từ chối mọi báo cáo chưa hoàn thành.
- **Tab Report — khu vực nhận diện báo cáo mới.** Đầu tab hiển thị số báo cáo cần xử lý
  (`Mới`, `Đang xử lý`, `Chờ học sinh`) tách khỏi số đã hoàn thành, cập nhật theo dữ liệu
  thật và tự làm mới khi tab đang mở. Bấm vào khu vực này để lọc ngay nhóm **Cần xử lý**.
- **Một nguồn trạng thái giao diện cho toàn website.** `assets/bakhi/bk-theme-boot.js`
  chạy đồng bộ ngay trước `<head>` trên mọi trang, đọc khoá `theme` và đặt
  `html.dark`/`html.light` + `data-bk-theme` trước khi trình duyệt vẽ khung đầu tiên nên
  không còn nháy tối → sáng. Theme đổi ở tab này được các tab khác nhận ngay.

### Cải tiến

- **Animation xoá thông báo:** hàng thông báo thu gọn (grid 1fr → 0fr) rồi mờ dần trước
  khi biến mất, không cắt nội dung dài; tắt hoàn toàn khi người dùng giảm chuyển động.
- **Giao diện sáng đầy đủ cho thành phần nổi:** bảng thông báo, hộp xác nhận, xem trước
  changelog (`.bkc-dark`), màn hình nhận diện, gợi ý tên, toast, nhãn dock học tập, Dev
  Playground và toast Tiến trình nay lấy màu từ token `--bk-*`. Màn hình bảo trì vẫn cố ý
  giữ nền đen tuyền ở cả hai giao diện vì đây là trạng thái chặn toàn site, không phải
  thành phần nằm trong trang.
- **Bộ token bổ sung cho animation:** `--bk-glow`, `--bk-glow-soft`, `--bk-glow-danger`,
  `--bk-skeleton`, `--bk-press`; giao diện sáng hạ glow thành bóng mờ để không chói.
- Chuyển giao diện mượt bằng transition trên nền/chữ của khung trang, không transition
  toàn bộ phần tử.

### Sửa lỗi

- **Trang chủ không bật được Light Theme.** `toggleDarkMode()` và `initTheme()` chỉ bỏ
  class `.dark` mà không thêm `.light`, trong khi từ 8.5.5 giao diện sáng được đánh dấu
  bằng `html.light` — toàn trang vẫn tối sau khi bấm đổi giao diện.
- **Trang bài học, Studio và quản trị bỏ qua giao diện đã chọn.** `bk-shell.js` chỉ áp
  dụng theme khi trang có `#themeIcon` hoặc `body.bk-app`, nên các trang khác luôn tối dù
  người học đã chọn sáng.
- **`/admin` dùng khoá giao diện riêng** (`bkAdminTheme`) nên không đồng bộ với phần còn
  lại của website; nay dùng chung khoá `theme` và chuyển giá trị cũ một lần.
- **Xoá thông báo thất bại vẫn biến mất khỏi giao diện.** Nay máy chủ được ghi trước; nếu
  lỗi, thông báo được giữ lại kèm thông báo lỗi để thử lại.

### Thay đổi kỹ thuật

- `assets/bakhi/bk-theme-boot.js` (mới) — nguồn khởi tạo giao diện dùng chung.
- `tools/integrate-pages.js` chèn script khởi tạo giao diện cho mọi tệp HTML (idempotent).
- Edge Function `admin-actions`: thêm `announcements.bulkDelete`, `reports.delete`; bộ lọc
  `reports.list`/`reports.export` nhận `status = 'active'` (mọi trạng thái chưa hoàn thành).
- Không có migration mới: dùng `announcement_reads.dismissed_at` đã có từ 8.5.5; xoá báo
  cáo dựa trên khoá ngoại `ON DELETE CASCADE` sẵn có.
- QA mới: `tools/qa/v856-ui.js`.

## [8.5.5] — 2026-11-22

### Tính năng

- **Xoá thông báo trong Trung tâm thông báo.** Thông báo phản hồi báo cáo, thông báo cập
  nhật và thông báo bảo trì có nút xoá riêng (vùng chạm 40px trên thiết bị cảm ứng) và
  nút **Xoá thông báo (N)** xoá hàng loạt sau khi xác nhận. Việc xoá được lưu bền vững:
  `announcement_reads.dismissed_at` và `report_notifications.dismissed_at` khi đã gắn hồ
  sơ, cộng bản ghi thiết bị `bakhiNotifyDismissed.v1`; tải lại trang không thấy lại thông
  báo đã xoá. **Thông báo cập nhật phiên bản không có nút xoá** và luôn được giữ khi xoá
  hàng loạt. Dữ liệu gốc (`announcements`, `changelog`, `reports`) không bị xoá.
- **Lịch sử trò chuyện kiểu ChatGPT trên điện thoại.** Trang `/ai-tutor/` ẩn sidebar lịch
  sử dưới 860px, thêm nút mở ở góc trên bên trái; sidebar trượt từ trái vào cùng lớp phủ,
  đóng bằng lớp phủ, phím Esc hoặc khi chọn/tạo hội thoại. Giữ nguyên danh sách, tìm kiếm,
  đổi tên, xoá và toàn bộ dữ liệu hội thoại; desktop không đổi bố cục.
- **Design Tokens dùng chung `assets/bakhi/bk-tokens.css`.** Một bảng màu duy nhất
  (nền `#0b0f14`, bề mặt `#161f2b`, hover `#202c3a`, viền `#293646`, chữ `#e8edf5` /
  `#9aa8b8` / `#718096`) được nạp trên **mọi** trang, kể cả `studio/`, `admin/`,
  `founder/` và các trang bài học.

### Cải tiến

- **Header cửa sổ Trợ lý AI một hàng:** tiêu đề "Trợ lý AI" bên trái, cụm nút (đổi tên,
  xoá hội thoại, đóng) sát phải, cùng hàng và căn giữa theo chiều dọc; dòng phụ luôn nằm
  dưới nên không đẩy nút X lệch chỗ. Vùng chạm nút đóng giữ 44×44px.
- **Đồng bộ Dark Theme toàn nền tảng:** `bk-core.css` không còn mặc định màu sáng; mọi
  mô-đun (`--bkc-n-*`, `--bkrep-*`, `--bkai-*`, nhạc, quản trị, gamification, cây kỹ năng,
  hồ sơ, cài đặt) lấy màu từ bộ token chung. Chế độ sáng chỉ bật khi người học chọn trong
  menu tài khoản (`html.light`), không component nào tự chuyển nền sáng.

### Sửa lỗi

- **Founder / Administrator Dashboard bị sáng.** `.bkc-dash`, `.bkc-side`, `.bkc-modal` và
  trang đăng nhập `/admin` mặc định nền sáng và chỉ tối khi `<html>` có class `.dark` —
  nhưng các trang này không đặt class đó. Nay tối là mặc định.
- **Cửa sổ Report Issue tự chuyển nền trắng trên trang bài học.** Điều kiện
  `html:not(.dark)` biến mọi trang không có class `.dark` thành chế độ sáng; đã đổi sang
  chế độ sáng chủ động `html.light`.
- **Trung tâm thông báo báo "Chưa có thông báo nào" khi chỉ có phản hồi báo cáo.** Điều
  kiện rỗng nay tính cả thông báo báo cáo.

### Thay đổi kỹ thuật

- Migration `20261225000000_bakhi_v855_notification_dismissals.sql`: thêm cột
  `dismissed_at` (nullable) cho `announcement_reads` và `report_notifications` cùng hai
  index bộ phận. Không tạo bảng mới, không đổi RLS.
- Edge Function `report-api`: action `notifications.dismiss` (chỉ đánh dấu `dismissed_at`
  trên dòng của chính học sinh đang gắn).
- `tools/integrate-pages.js` chèn `bk-tokens.css` cho mọi tệp HTML (idempotent, gắn `?v=`).

## [8.5.4] — 2026-11-22

### Tính năng

- **Quản lý nhiều AI Model có thứ tự ưu tiên.** Founder Dashboard → AI Tutor → tab
  **AI Models** cho phép thêm bao nhiêu model tuỳ nhu cầu: dòng đầu là Primary, các dòng sau
  tự đánh số Fallback 1, 2, 3… Có nút ↑ ↓ đổi thứ tự, xoá có xác nhận (tự đánh lại số) và
  nút **Lưu danh sách model**. Không còn giới hạn cứng một primary + một fallback.
- **Chuỗi dự phòng thật ở máy chủ.** Mỗi câu hỏi đi lần lượt Primary → Fallback 1 → …;
  model nào trả lời thành công được ghi lại trong `meta` và `ai_usage_logs`. Lỗi được phân
  loại (AUTH, QUOTA, RATE_LIMIT, TIMEOUT, MODEL_NOT_FOUND, PROVIDER_DOWN, EMPTY_RESPONSE…);
  chỉ lỗi tạm thời mới thử lại, tối đa `max_retries` (0–3), mỗi model có timeout riêng và
  nghỉ 60 giây sau lỗi tạm thời. Lỗi cấu hình của chính model (thiếu khoá, sai định dạng)
  dừng chuỗi để không đốt token.
- **Kiểm tra kết nối từng model.** Nút **Kiểm tra** gửi một request tối giản (đọc danh sách
  model, hoặc một lượt sinh 16 token) và ghi lại trạng thái, mã lỗi, thời gian phản hồi.
- **Năm tab trong Founder Dashboard:** Tổng quan · AI Models · System Prompt · Cấu hình ·
  Logs. Kèm khối “Thêm một AI Model — các bước cần làm” ngay trên tab AI Models.
- **Cửa sổ chi tiết lỗi nhà cung cấp.** Khi provider lỗi, học sinh thấy thông báo ngắn và
  nút **Xem chi tiết** mở cửa sổ có nút X: nhà cung cấp, model, mã HTTP, loại lỗi, thời
  điểm, trạng thái dự phòng và danh sách model đã thử. Không có API key, header hay raw
  response.
- **Tab Logs:** lượt gọi, provider/model, token vào–ra, thời gian phản hồi, trạng thái, lỗi
  và lịch sử fallback theo từng lần thử model.

### Sửa lỗi

- **`load is not a function` khi lưu System Prompt.** Nguyên nhân: trong `paint()` của
  `bk-founder-ai.js`, biến `var load = el('div', …)` (khung chờ) trùng tên và che (shadow)
  hàm `load()` của mô-đun, nên mọi callback bên trong `paint()` — gồm nút lưu System
  Prompt, lưu cấu hình và nút thử lại — gọi một `<div>` thay vì hàm. Đã đổi tên biến khung
  chờ thành `spinnerBox`; không thêm try/catch che lỗi.
- **Nút × cạnh nút “Hỏi AI” bị bỏ hoàn toàn.** Nút nổi chỉ còn một thành phần. Cờ ẩn cũ
  `bakhiAiFabHidden.v1` được xoá khi tải trang để nút trở lại trên máy từng bấm ×.
- **Không đóng được cửa sổ Trợ lý AI trên điện thoại.** Nút X nay nằm ở góc trên bên phải
  cửa sổ (vùng chạm 44×44px), chỉ xuất hiện khi cửa sổ mở; đóng không xoá hội thoại, mở lại
  thấy đúng cuộc trò chuyện đang giữ trong phiên.
- **Giữ nội dung đã nhập khi request thất bại** và không làm hỏng giao diện khi lỗi.

### Cải tiến

- **Token tách riêng đầu vào / đầu ra.** Thêm `ai_settings.max_input_tokens` (mặc định
  3000) và `ai_settings.max_retries` (mặc định 1). Lịch sử được cắt theo ngân sách token
  đầu vào (`trimHistoryByBudget`), không gửi toàn bộ hội thoại.
- **Giao diện cửa sổ Trợ lý AI trên điện thoại:** dùng `visualViewport` để cao đúng vùng
  nhìn thấy, tôn trọng `safe-area-inset` trên iOS/Android, không tràn màn hình và không bị
  bàn phím ảo che ô soạn.
- **System Prompt:** có trạng thái Đã lưu / Chưa lưu, nút Hoàn tác về bản đã lưu, nút Reset
  về mặc định (có xác nhận, tạo phiên bản mới thay vì xoá lịch sử), giữ nguyên nội dung khi
  chuyển tab.
- **Streaming** được ghi rõ là chưa hỗ trợ (ô tuỳ chọn bị khoá) thay vì hiển thị một công
  tắc không có tác dụng.

### Cơ sở dữ liệu & triển khai

- Migration mới `20261220000000_bakhi_v854_ai_model_routes.sql`: bảng `ai_model_routes`
  (thứ tự model, bật/tắt, trạng thái kiểm tra) và `ai_model_attempts` (lịch sử từng lần
  thử), cả hai bật RLS **không policy** và chỉ cấp quyền cho `service_role`; thêm cột
  `max_input_tokens`, `max_retries`, `streaming_enabled` cho `ai_settings`. Không có cột
  chứa khoá: mỗi dòng chỉ ghi **tên secret** (`key_ref`). Migration
  chuyển cấu hình provider/model đang chạy thành các dòng Primary/Fallback **chỉ khi bảng
  còn rỗng** — không xoá dữ liệu, không đổi lịch sử hội thoại.
- Cần deploy lại Edge Function `ai-tutor-api`. Không cần thêm secret mới: khoá vẫn đọc từ
  `AI_TUTOR_API_KEY` / `AI_TUTOR_FALLBACK_API_KEY`; model thứ ba trở đi dùng
  `AI_TUTOR_KEY_3…6` nếu muốn tách khoá riêng cho từng dòng.

## [8.5.3] — 2026-11-22

### Tính năng

- **Nút × đóng nút nổi “Hỏi AI” (điện thoại).** Nút “Hỏi AI” góc phải màn hình có thêm nút
  × nhỏ ở góc trên bên phải. Bấm × sẽ ẩn hẳn nút và ghi nhớ lựa chọn trên thiết bị
  (`bakhiAiFabHidden.v1`), nên nút không còn che nội dung bài học trên màn hình nhỏ.
  Lối vào Trợ lý AI vẫn còn: menu tài khoản → **Trợ lý AI**, hoặc trang `/ai-tutor/`;
  gọi `BKAITutor.showFab()` để hiện lại nút.
- **“Hỏi AI” có mặt ở mọi trang học sinh.** `tools/integrate-pages.js` chèn mô-đun vào cả
  `studio/` (trước đây bị bỏ qua), nên Word & Paint cũng có nút hỏi trợ lý. Trang quản trị
  `admin/` và `founder/` vẫn không nạp nút này; `ai-tutor/` dùng giao diện đầy đủ.

### Cải tiến

- Nút nổi được bọc trong khối định vị `.bkai-launcher` để nút × luôn dính góc và cả hai
  cùng nhường chỗ cho nút Báo cáo; trên màn hình ≤ 860px nút × tăng lên 30px cho dễ bấm.
- **Cache busting cho thẻ `bk-ai-tutor.js|css`:** `tools/integrate-pages.js` nay chèn kèm
  `?v=<phiên bản hiện tại>` và cập nhật `?v=` cho thẻ đã có (122 trang), tránh việc trình
  duyệt dùng bản 8.5.2 đã cache và không thấy nút ×.

## [8.5.2] — 2026-11-22

### Tính năng

- **Nhà cung cấp mặc định chuyển sang Groq với `openai/gpt-oss-20b`.** Groq dùng giao thức
  OpenAI-compatible nên không cần adapter riêng; đổi provider vẫn chỉ bằng một dòng cấu hình.
  Migration `20261218000003` đổi giá trị mặc định của cột và dòng `ai_settings` đang chạy,
  thêm provider `cerebras` vào danh sách hợp lệ. Không tạo bảng mới, không xoá dữ liệu.
- **Danh mục provider dùng chung** (`PROVIDER_CATALOG` trong `_shared/ai-providers.ts`):
  mỗi provider khai báo id, tên hiển thị, giao thức, base URL, tên secret, giới hạn ngữ cảnh,
  trần token đầu ra, thời gian chờ và khả năng liệt kê model. Founder Dashboard đọc đúng
  danh mục này thay vì tự đoán endpoint.
- **Kiểm tra model trước khi áp dụng** — action `admin.provider.verify` đọc danh sách model
  thật của provider bằng khoá trong Secrets (không tốn token sinh văn bản), chỉ Founder gọi được.
- **Tối ưu token theo chế độ:** Gợi ý 256 · Giải thích/Tóm tắt/Hỏi dẫn dắt 512 ·
  Từng bước/Kiểm tra/Phân tích lỗi/Luyện tập 1024 · Giải thích sâu 2048. Trần mỗi lượt là
  `min(trần Founder đặt, trần chế độ)`, không bao giờ dưới 128 và không vượt trần đã đặt.
  Chế độ Gợi ý **không** được nâng trần, để model không viết sẵn lời giải.
- **Dự phòng có công tắc và cooldown:** `AI_TUTOR_FALLBACK_ENABLED`, `AI_TUTOR_MAX_RETRIES`
  (0–2), `AI_TUTOR_TIMEOUT`. Provider vừa lỗi tạm thời nghỉ 60 giây để không đốt token vào
  chuỗi request chắc chắn thất bại. Lỗi khoá/model/cấu hình **không** kích hoạt dự phòng.
- **Thống kê token trung thực:** `ai_usage_logs.fell_back` và `.tokens_estimated`; hàm SQL
  `bakhi_ai_usage_stats()` tổng hợp theo ngày/tuần/tháng, lọc provider và model, trả cả
  token vào/ra, số lượt lỗi, số lượt qua dự phòng, số lượt dùng token ước lượng và thời gian
  phản hồi trung bình. Không lưu nội dung hội thoại để thống kê.
- **Founder Dashboard → AI Tutor** có thêm ba thẻ: *Sức khoẻ nhà cung cấp* (khoá, giới hạn,
  nút kiểm tra từng provider), *Thống kê token & lượt gọi* (bộ lọc thời gian/provider/model)
  và *Lỗi nhà cung cấp gần đây* (chỉ Founder thấy; chi tiết đã lọc bỏ khoá).

### Sửa lỗi

- **Thẻ Sức khoẻ nhà cung cấp báo thiếu khoá sai cho provider dự phòng.** `admin.status`
  dùng chung cờ của khoá chính (`AI_TUTOR_API_KEY`) cho mọi provider, nên Google khi là
  dự phòng bị gắn nhãn “Thiếu khoá” dù `AI_TUTOR_FALLBACK_API_KEY` đã có. Nay máy chủ trả
  `primaryKeyConfigured` / `fallbackKeyConfigured` theo đúng vai trò và UI ghi rõ từng loại
  khoá; nút **Kiểm tra** của từng provider cũng thử bằng khoá của vai trò đó.
- **`founder-smoke` còn ghim 17 tab.** Dashboard Founder đã có 18 tab từ 8.5.0 (thêm
  **AI Tutor**) nhưng kỳ vọng của cổng QA chưa cập nhật, làm `quality-check` báo lỗi.

### Cải tiến

- `admin.status` trả thêm danh mục provider, trạng thái khoá chính/dự phòng, số lần thử lại,
  cooldown còn lại và ngân sách token từng chế độ. Administrator chỉ xem, không sửa được.
- Mặc định `max_output_tokens` 2048 và `timeout_ms` 30000; cửa sổ ngữ cảnh tối đa 10 lượt
  cho cấu hình mới (giảm token gửi lên mỗi câu hỏi).

### Triển khai

- Migration `20261218000003` và Edge Function `ai-tutor-api` đã áp/deploy lên project
  production ngày 2026-11-22. Khoá Groq/Google vẫn phải do người quản trị đặt trong
  Supabase → Edge Functions → Secrets, không nằm trong mã nguồn hay tài liệu.

## [8.5.1] — 2026-11-22

### Sửa lỗi

- **Mô hình mặc định đã bị Google ngừng cấp.** `gemini-2.5-flash` trả 404
  (`no longer available to new users`), làm mọi câu hỏi đều báo “mô hình không còn khả dụng”.
  Mặc định chuyển sang `gemini-3.8-flash`; migration `20261218000002` cập nhật cả ràng buộc
  mặc định lẫn dòng `ai_settings` đang chạy. Chỉ đổi tên model, không đụng dữ liệu hội thoại.
- **Thử lại làm lặp câu hỏi.** Nút **Thử lại** gửi lại nguyên văn câu hỏi và máy chủ ghi thêm
  một dòng `user`, nên hội thoại có hai bong bóng giống nhau. Nay client gửi `retry: true`
  và máy chủ dùng lại đúng câu hỏi đã lưu (`NOTHING_TO_RETRY` nếu chưa có), không tạo dòng mới,
  không cộng sai `message_count`.

### Cải tiến

- **Nhật ký chẩn đoán nhà cung cấp.** Bảng mới `ai_provider_diagnostics`
  (migration `20261218000001`), **RLS bật và không có policy nào**, đã thu hồi quyền bảng của
  `anon`/`authenticated`: chỉ Edge Function đọc/ghi. Lưu mã HTTP và thông điệp đã lọc khoá để
  Ban quản trị biết chính xác vì sao khoá/model sai, mà học sinh không thấy chi tiết nội bộ.
- **Thử lại provider chính một lần** (cách nhau 0,9 giây) trước khi xét provider dự phòng —
  xử lý các lần provider quá tải thoáng qua. Vẫn không bao giờ thử vô hạn.

### Triển khai

- Đã áp ba migration và deploy `ai-tutor-api` lên project `bakhi`; secret `AI_TUTOR_API_KEY`
  đã có sẵn. Xem `docs/RELEASE_REPORT_V850.md` để biết phần nào đã xác minh thật và phần nào
  còn chặn.

## [8.5.0] — 2026-11-22

### Tính năng

- **Trợ lý AI (AI Tutor) toàn website.** Trang mới `/ai-tutor/` và nút **Hỏi AI** trên mọi
  trang học tập; bảng nổi tự nhận biết môn/bài đang xem. Mô-đun dùng chung
  `assets/bakhi/bk-ai-tutor.js|css`, một nguồn duy nhất cho cả hai hình thức.
- **Tám chế độ học tập:** Giải thích, Từng bước, Gợi ý (không cho đáp án), Kiểm tra bài làm,
  Luyện tập, Phân tích lỗi, Tóm tắt, Hỏi dẫn dắt. Hướng dẫn riêng cho từng chế độ được nối
  vào system prompt ở máy chủ.
- **Kiến trúc đa nhà cung cấp.** Edge Function mới `ai-tutor-api` cùng lớp adapter
  `_shared/ai-providers.ts` hỗ trợ Google Gemini, OpenAI, Groq, OpenRouter, Mistral,
  DeepSeek và endpoint tương thích OpenAI tự cấu hình. Đổi provider/model không cần sửa frontend.
- **Định tuyến model và dự phòng.** Model riêng cho câu đơn giản / phức tạp / luyện tập;
  tự chuyển provider dự phòng **chỉ** với lỗi tạm thời và **chỉ** khi đã cấu hình khoá dự phòng.
- **Ngữ cảnh học tập.** Ngữ cảnh đi qua danh sách trắng, được bao trong khối
  `---BEGIN-CONTEXT---` có nhãn “dữ liệu, không phải chỉ dẫn”; API `BKAITutor.explain()` và
  `BKAITutor.analyzeMistake()` cho Quiz/Reading/Listening/Sổ tay câu sai gọi khi cần.
- **Lịch sử hội thoại.** Tạo, tiếp tục, tìm kiếm, đổi tên, xoá (có xác nhận, xoá mềm), sao chép
  câu trả lời, dừng câu trả lời (huỷ request thật), thử lại khi lỗi.
- **Founder Dashboard → tab AI Tutor.** Trạng thái, nhà cung cấp/mô hình, định tuyến, giới hạn
  sử dụng, kiểm tra kết nối, quản lý System Prompt có lịch sử phiên bản và khôi phục.
  Administrator chỉ xem; máy chủ trả `FOUNDER_ONLY` cho mọi thao tác ghi.
- **Kiểm soát chi phí.** Burst 10 request/phút, hạn mức câu hỏi và token trong 24 giờ, giới hạn
  token đầu ra, timeout, cửa sổ ngữ cảnh — tất cả cấu hình tập trung ở `ai_settings`.
- **Migration `20261218000000_bakhi_v850_ai_tutor.sql`:** 5 bảng (`ai_conversations`,
  `ai_messages`, `ai_usage_logs`, `ai_settings`, `ai_prompt_versions`), RLS **chỉ SELECT** cho
  học sinh, trigger `updated_at`, hàm `bakhi_ai_usage()`.
- **Bốn cổng QA offline:** `ai-tutor-model-routing.js`, `ai-tutor-api-security.js`,
  `ai-tutor-smoke.js`, `ai-tutor-rendering-security.js`.
- **Mười bốn tài liệu** từ `AI_TUTOR_AUDIT_V850.md` đến `RELEASE_REPORT_V850.md`, kèm
  `.env.example` chỉ chứa placeholder.

### Bảo mật

- Khoá AI chỉ đọc từ Supabase Edge Function Secrets (`AI_TUTOR_API_KEY`), không bao giờ trả về
  trình duyệt, không nằm trong log, không nằm trong bảng cấu hình.
- Học sinh chỉ đọc được hội thoại của chính mình (RLS + kiểm tra sở hữu ở máy chủ); mọi thao
  tác ghi đi qua Edge Function với `student_id` suy ra từ `student_devices`.
- Chống prompt injection bốn lớp; AI không có tool calling nên không thể đổi XP, thành tựu hay
  truy cập database.
- Markdown của AI được dựng thành DOM node (không `innerHTML`), liên kết `javascript:` bị loại,
  code block chỉ hiển thị văn bản, KaTeX chạy với `trust: false`.

### Cải tiến

- `tools/integrate-pages.js` chèn `bk-ai-tutor.js|css` (idempotent) vào mọi trang có `bk-cloud.js`,
  nối ở cuối tệp để không phá các trang có thẻ `<script>` mở trên dòng riêng.
- Menu tài khoản có thêm lối vào **Trợ lý AI**, đặt cạnh Chat và Tiến trình.
- `bk-cloud.js` có `aiTutorApi()`; `bk-supabase.config.js` khai báo `aiTutor: 'ai-tutor-api'`;
  `supabase/config.toml` khai báo function với `verify_jwt = false`.

### Ghi chú

- `chat-api` / `bk-chat.js` **không** bị sửa. Chat là hệ thống người ↔ người, AI Tutor là
  người ↔ máy; lý do tách bảng được ghi ở `docs/AI_TUTOR_AUDIT_V850.md` mục 3.1.
- Chưa triển khai production trong bản này (chưa có khoá API). Trạng thái: **PARTIALLY READY** —
  xem `docs/RELEASE_REPORT_V850.md`.

## [8.4.4] — 2026-11-22

### Tính năng

- **Tết Nguyên Đán và Trung Thu miễn phí cho toàn bộ học sinh.** Hai giao diện mới
  (`theme-tet`, `theme-midautumn`) nằm cùng nhóm bốn giao diện theo mùa miễn phí, chọn được
  ngay trong **Cài đặt → Hình nền**: mai vàng rơi + đèn lồng đỏ cho Tết, trăng rằm + đèn ông
  sao cho Trung Thu. Migration `20261216000000_bakhi_v844_seasonal_themes_extras.sql` bổ sung
  `reward_catalog`, mở rộng `bk_gam_free_themes()` và backfill mọi hồ sơ.
- **Giao diện mùa tự bật.** Khi học sinh chưa tự chọn giao diện, trang tự dùng giao diện của
  mùa đang diễn ra (Giáng Sinh 01/12–10/01, Tết 15/01–20/02, Trung Thu 20/08–25/09,
  Halloween 10/10–02/11). Cài đặt → Hình nền hiện thanh gợi ý kèm nút **Tắt tự bật theo mùa**;
  chọn tay bất kỳ giao diện nào cũng tự tắt, và khi bật giảm chuyển động thì không tự bật.
- **Tìm kiếm xuyên toàn bộ bài học.** `assets/bakhi/search-index.js` (115 trang, sinh bằng
  `tools/build-search-index.js`) được tải muộn và gộp vào `BK.search`, nên ô tìm kiếm ở bất kỳ
  trang nào cũng ra bài của môn khác — kể cả tìm không dấu — thay vì chỉ thấy liên kết trên
  trang đang mở.
- **Dùng được khi mất mạng (PWA).** `sw.js` + `manifest.webmanifest`: HTML theo kiểu
  network-first (chỉ dùng bản lưu khi mất mạng), tài nguyên `assets/bakhi/` cache-first theo
  `?v=` nên không bao giờ phục vụ JS/CSS cũ, dữ liệu Supabase không đi qua cache. Trang mất
  mạng hiện thông báo thay vì lỗi trình duyệt.
- **Kiểm tra sức khoẻ tiến trình.** Hàm `bk_gam_health_drift()` đối chiếu sổ XP
  (`xp_transactions`) với `user_progression` và công thức cấp, chỉ service_role gọi được;
  cổng `tools/qa/gamification-health.js` kiểm tra các bất biến này và (tuỳ chọn) truy vấn
  trực tiếp project để tìm hồ sơ lệch.

### Sửa lỗi

- **Phiên bản đồng bộ trong mọi mô-đun.** `bk-founder.js` và `bk-founder-gamification.js`
  còn khai báo `8.3.8` trong khi `bk-version.js` đã là `8.4.4`; nay cả hai đọc đúng bản
  phát hành và `tools/bump-version.js` tự đổi chúng trong mọi lần bump sau này.
- **`/admin` và `/founder` không còn nạp `bk-report.js`.** Trước đây hai trang quản trị
  vẫn tải tệp nút báo cáo học sinh rồi thoát ngay qua `BK_ADMIN_ONLY`; nay không tải,
  đúng quy ước trong `AGENTS.md`.
- **Trang khách không còn lỗi 409 trong DevTools.** Nút báo cáo chỉ hỏi `report-api`
  `bootstrap` khi thiết bị đã nhận diện học sinh; trước đây khách chưa nhận diện vẫn gọi
  và nhận `NOT_BOUND` (409) ngay khi tải trang.
- **Service worker không giữ mã cũ và revalidate tệp không kèm `?v=`.** Tài nguyên
  `assets/bakhi/` có `?v=` vẫn cache-first; tệp nạp không kèm phiên bản chuyển sang
  network-first kèm `cache: 'no-cache'` nên không bị HTTP cache 10 phút của GitHub Pages
  giữ bản cũ. Tên cache thêm `REVISION` để worker mới dọn sạch cache cũ kể cả khi số
  phiên bản phát hành không đổi.

### Cải tiến

- **Hiệu ứng nhẹ hơn trên máy yếu.** Số hạt tuyết/mai/sao giảm còn ~40% khi màn hình ≤ 720px,
  `deviceMemory` ≤ 4 GB hoặc CPU ≤ 4 luồng; animation tự tạm dừng khi tab bị ẩn để không đốt pin.
- **Bump phiên bản bằng một lệnh.** `tools/bump-version.js 8.4.5` đổi `bk-version.js`, mọi
  chuỗi `?v=` trong HTML, `APP_VERSION` của devboard và `SERVER_VERSION` của `admin-actions`,
  và từ chối bump khi `CHANGELOG.md` chưa có mục phát hành.
- **Cổng nội dung phủ thêm trang giao diện.** `tools/content-integrity-refresh.js` nay thêm
  được trang mới vào baseline (vẫn từ chối tệp có dấu hiệu nội dung giáo dục);
  `gamification/` và `skills/` đã vào baseline nên không còn nằm ngoài cổng bảo vệ.
- `tools/inject-pwa.js` chèn manifest vào 124/125 trang; hai trang có `<head>` nằm giữa dòng
  (`ktgk1/anh/*`) được bỏ qua có chủ đích để không làm sai lệch hash nội dung.

## [8.4.3] — 2026-11-22

### Sửa lỗi

- **Halloween: bí ngô rơi khắp trang.** Ba quả bí ngô trước đây neo ở đáy trang chủ
  (`bottom: -2%`) nên gần như chỉ thấy một hàng ở cuối trang. Nay chúng rơi tự do từ
  đỉnh xuống hết chiều cao màn hình (`bkthPumpkinFall`, ba quỹ đạo lệch nhau), vẫn giữ
  hiệu ứng phát sáng và dơi bay. Khi bật giảm chuyển động, bí ngô trở lại đứng yên ở đáy
  thay vì nằm ngoài khung nhìn phía trên.
- **Bí ngô và tuyết không còn bị nền trang chủ che.** Lớp nền giao diện dùng
  `z-index: -1` trong khi trang chủ có `#bgOverlay` (90% đục) và canvas sao ở `z-index: 0`,
  nên hiệu ứng gần như vô hình sau các thẻ nội dung. Nay hiệu ứng chuyển động nằm ở lớp
  riêng `#bkThemeFx` (`z-index: 2`, `pointer-events: none`) phía trên nội dung, còn nền +
  lớp phủ giữ tương phản vẫn ở `#bkThemeLayer` phía sau. Khi bật giao diện trang chủ,
  `#bgImage` / `#bgOverlay` / `#starCanvas` / `.nebula` nhường chỗ (opacity 0).
- **Giáng Sinh: tuyết rơi toàn website.** Trước đây tuyết chỉ có ở trang chủ. Nay:
  trang chính vẫn phủ tuyết toàn màn hình; trang môn học/bài học có tuyết rơi **bên trong
  khung header** (`.bkth-head-snow`, cắt theo header, không đụng nội dung bài học); hồ sơ,
  cài đặt, tiến trình và các trang chỉ dùng điểm nhấn có lớp tuyết phủ toàn trang
  (`#bkThemeOverlay`) mà không vẽ lại nền nên chữ vẫn đọc rõ. Mọi hạt tuyết vẫn tắt hoàn
  toàn theo `prefers-reduced-motion` và lớp `bk-a11y-reduce-motion`.

### Cải tiến

- **Halloween và Giáng Sinh miễn phí cho toàn bộ học sinh.** Hai giao diện theo mùa
  trước đây chỉ dùng được khi được Founder trao; nay mọi hồ sơ đều có sẵn và chọn được
  ngay trong **Cài đặt → Hình nền**. Migration mới
  `20261215000000_bakhi_v843_free_seasonal_themes.sql` cấp sẵn `user_inventory`
  (`source = 'seasonal_free'`) cho toàn bộ học sinh, trigger cấp sẵn cho hồ sơ tạo sau
  này, và `bk_gam_equip` cấp bù khi cần nên trang bị không còn trả `NOT_OWNED`. Phía
  client, `BKThemes.FREE_THEMES` / `BKThemes.isFree()` khiến hai giao diện luôn được coi
  là đã sở hữu (kể cả khi kho chưa đồng bộ) và hiện nhãn **Miễn phí** thay vì khoá.
- Thêm kiểm tra trong `tools/qa/themes-smoke.js`: bí ngô rơi từ đỉnh (không neo đáy),
  tuyết trong header trang môn, tuyết toàn trang ở hồ sơ không kèm nền, và giảm chuyển
  động thì không sinh hạt tuyết ở lớp phủ.
- Thêm kiểm tra giao diện miễn phí trong `tools/qa/themes-smoke.js`: chọn được Halloween
  và Giáng Sinh khi kho chưa có, thẻ trong Cài đặt không bị khoá và có nhãn Miễn phí,
  `syncFromState` luôn giữ hai giao diện này trong danh sách sở hữu.
- Đồng bộ phiên bản 8.4.3: `bk-version.js`, `bk-devboard.js`, `admin-actions` và chuỗi
  `?v=` trong các trang HTML.

## [8.4.2] — 2026-11-21

### Sửa lỗi

- **Trang chủ không còn vỡ layout khi bật giao diện.** Quy tắc
  `html[data-bk-theme-scope="page"] body > *` trong `bk-themes.css` ép
  `position: relative` lên **mọi** phần tử con trực tiếp của `body`, đè `position: fixed`
  của header dính, chuông thông báo, nút **Báo cáo** và trình nhạc. Khi một tài khoản
  trang bị giao diện (ví dụ sau khi nhận giao diện/badge trong Founder Dashboard), các nút
  nổi giãn hết chiều ngang thành dải tím, header trôi theo trang và nội dung bị đẩy lệch.
  Nay lớp nền dùng `z-index: -1` nên nằm dưới nội dung mà không đổi kiểu định vị của bất
  kỳ thành phần nào; nền và lớp phủ giữ tương phản vẫn hiển thị đúng ở Light/Dark.
- **Header trang bài học còn dính khi cuộn.** `.bk-theme-head` từng đặt
  `position: relative` và đè `sticky` của Tailwind, làm thanh đầu trang mất tác dụng dính
  trên mọi trang môn/KTTX khi có giao diện. Nay giữ nguyên `sticky`/`fixed`/`absolute`
  của header, chỉ bổ sung gốc định vị cho lớp trang trí.

### Cải tiến

- Thêm kiểm tra hồi quy trong `tools/qa/themes-smoke.js`: chặn quy tắc ép định vị lên
  toàn bộ `body > *`, bắt buộc lớp nền dùng `z-index` âm và vẫn `pointer-events: none`.
- Đồng bộ phiên bản 8.4.2: `bk-version.js`, `bk-devboard.js`, `admin-actions` và chuỗi
  `?v=` trong các trang HTML.

## [8.4.1] — 2026-11-21

### Tính năng

- **Founder Dashboard — Give Themes.** Thẻ mới trong tab Gamification để trao giao diện
  cho một học sinh, cùng luồng với Give Special Badges: chọn người nhận → chọn nhiều giao
  diện → xem trước (Đang có / Sau khi trao) → xác nhận. Có tìm kiếm, nút chọn tất cả chưa
  sở hữu và bỏ chọn; giao diện đã sở hữu bị khoá, giao diện chưa có trong `reward_catalog`
  hiện ghi chú cần chạy migration.
- Thao tác vẫn đi qua `admin.items.preview` / `admin.items.grant` (`bk_gam_grant_items`):
  máy chủ kiểm tra scope Founder, bỏ qua giao diện đã sở hữu, tôn trọng giới hạn và ghi
  `gamification_activity_logs`. Danh sách tự làm mới và lịch sử trao tặng tải lại ngay
  sau khi trao.

### Cơ sở dữ liệu

- Migration `20261214000000_bakhi_v841_founder_full_items.sql` (idempotent, chỉ INSERT):
  hồ sơ Founder (`is_founder = true`, gồm Hứa Viết Minh Trúc) mặc định sở hữu toàn bộ vật
  phẩm đang bật trong `reward_catalog`, kể cả giao diện thêm sau này.

### Cải tiến

- Phiên bản đồng bộ 8.4.1: `bk-version.js`, `bk-devboard.js`, `admin-actions` và chuỗi
  `?v=` trong 121 trang HTML.

## [8.4.0] — 2026-11-21

Phạm vi thực tế của bản này: hệ **giao diện (theme)**, **biểu tượng trang trí cạnh tên**
dùng chung toàn website, và **bốn huy hiệu đặc biệt** trong Founder Dashboard. Các phần
lớn khác của đề bài 8.4.0 (chuẩn hoá toàn bộ index môn học, thu hồi cây kỹ năng) chưa
hoàn tất — xem ghi chú ở cuối mục.

### Tính năng

- **Hệ giao diện dùng chung (`bk-themes.js` + `bk-themes.css`).** Mười giao diện có nền
  thật: Bình Minh, Nửa Đêm, Anh Đào, Đại Dương, Rừng Xanh, Hoàng Gia, Bạc Hà, Hồng Ngọc,
  Halloween và Giáng Sinh. Giao diện mở khoá từ Kho vật phẩm, áp dụng theo tài khoản và
  đồng bộ giữa các thiết bị qua `bk_gam_equip`.
- **Phạm vi hiển thị theo trang.** Trang chủ phủ nền toàn màn hình có lớp phủ giữ tương
  phản; trang môn học chỉ đổi khu vực đầu trang; hồ sơ, Tiến trình, Cài đặt và Kỹ năng chỉ
  đổi màu nhấn; trang quản trị không áp dụng.
- **Giao diện Halloween**: bí ngô khắc mặt phát sáng (ba cỡ, SVG nội tuyến), dơi bay, tông
  cam–tím, có nhịp sáng tắt nhẹ.
- **Giao diện Giáng Sinh**: tuyết rơi liên tục 28 hạt với kích thước/tốc độ khác nhau, cây
  thông trang trí, tông xanh–đỏ; tuyết không chặn cuộn hay che nội dung.
- **Tôn trọng giảm chuyển động**: khi `prefers-reduced-motion` hoặc trợ năng "Giảm chuyển
  động" đang bật thì không tạo tuyết/dơi và tắt animation trang trí.
- **Cài đặt → Hình nền có mục Giao diện**: xem trước, trạng thái Đang dùng / Sẵn sàng /
  Chưa sở hữu, nút áp dụng và nút về giao diện mặc định. Ảnh nền tự tải lên vẫn độc lập.
- **`BKUserName` — tên có biểu tượng trang trí dùng chung**: một định nghĩa duy nhất thay cho
  các đoạn dựng icon rời rạc, đã dùng ở menu tài khoản, hồ sơ và hero trang Tiến trình;
  hỗ trợ mini profile `[Avatar] Tên [Biểu tượng] + dòng phụ`, tên dài tự cắt ellipsis.
- **Founder Dashboard — Give Special Badges**: thẻ riêng cho bốn huy hiệu *Ba mươi ngày học*
  (Cực hiếm · Hoạt động), *Mười ải Boss* (Huyền thoại · Boss), *Nhà thám hiểm* (Ít gặp ·
  Khám phá), *Mùa Khởi Đầu* (Huyền thoại · Giới hạn). Chọn một hoặc nhiều, xem trước trạng
  thái sở hữu, xác nhận rồi trao; máy chủ bỏ qua huy hiệu đã có và ghi nguồn Founder.
- **Thẻ cấp cây kỹ năng đổi tên thành “Give Full Skills Tree”**, giữ nguyên luồng xem
  trước → xác nhận → ghi nhật ký.

### Cải tiến

- `tools/integrate-pages.js` chèn `bk-themes.css|js` vào mọi trang có `bk-core.js` (trừ
  `admin/`, `founder/`), idempotent và **không đổi hash nội dung giáo dục** — thẻ được nối
  thành dòng riêng ở cuối tệp để `content-integrity` vẫn khôi phục đúng bản gốc.
- Phiên bản đồng bộ 8.4.0 toàn hệ thống: `bk-version.js`, `bk-devboard.js`,
  `admin-actions` và chuỗi `?v=` trong 125 trang HTML.
- Thêm `tools/qa/themes-smoke.js` (25 kiểm tra jsdom) và `docs/THEMES_V840.md`.

### Cơ sở dữ liệu

- Migration `20261213000000_bakhi_v840_founder_grants.sql` (idempotent): thêm
  `theme-halloween`, `theme-christmas` vào `reward_catalog`; thêm cột
  `user_skill_progress.founder_granted`; bảng `founder_skill_grants`; hàm chỉ đọc
  `bk_gam_founder_tree_status(uuid)`. **Chưa áp dụng** — xem mục Chưa hoàn thành.
- Không xoá bảng/cột, không đổi kiểu dữ liệu, không tạo hệ thống thứ hai.

### Chưa hoàn thành trong 8.4.0

- **Chuẩn hoá toàn bộ index môn học** (tách `hoc.html` / `kiemtra.html`, bộ component dùng
  chung cho 114 trang): chưa thực hiện — đây là thay đổi cấu trúc trên toàn bộ nội dung
  giáo dục và cần một đợt riêng có kiểm thử liên kết đầy đủ.
- **Thu hồi quyền mở khoá do Founder cấp**: đã có dữ liệu dấu vết (`founder_granted`,
  `founder_skill_grants`) nhưng chưa có hàm thu hồi/API, vì chưa thể kiểm thử trên Supabase
  thật trong phiên này.
- **Founder Activity Log mở rộng**: vẫn dùng `gamification_activity_logs` hiện có; chưa có
  chế độ xem lịch sử theo thao tác Founder riêng.

## [8.3.8] — 2026-11-21

### Tính năng

- **Cây kỹ năng thành trang riêng `/skills/`** với sơ đồ phân nhánh trực quan: kéo để di
  chuyển, zoom, nút “Về giữa”, tìm kiếm, lọc theo nhánh, bảng chi tiết node. Đường nối đổi
  trạng thái theo tiến trình, node vừa mở có hiệu ứng và được ghi nhớ trên thiết bị.
- **Điều kiện mở khoá đầy đủ**: cấp độ tối thiểu, nhiệm vụ bắt buộc, thành tựu bắt buộc,
  node tiên quyết và mốc chỉ số. Máy chủ trả danh sách điều kiện còn thiếu
  (`bk_gam_node_blockers`) để giao diện nói rõ cần làm gì.
- **Founder cấp trọn cây kỹ năng** cho một học sinh, có xem trước số node còn thiếu, xác
  nhận trước khi ghi, không xoá node đã hoàn thành và không trao trùng vật phẩm thưởng.
- **Founder trao vật phẩm** theo kho Gamification với số lượng, tôn trọng giới hạn
  `metadata.max_quantity`; kho hiển thị số lượng đang sở hữu trước và sau khi trao.
- **Founder trao thành tựu** nhiều mục một lần, bỏ qua thành tựu đã sở hữu.
- **Tab Thành tích có khu trao Badge Gamification**: tìm theo tên, lọc nhóm/độ hiếm, hiện
  trạng thái sở hữu và trao nhiều badge trong một lần.
- **Lịch sử trao tặng** trong tab Gamification: lọc theo học sinh hoặc loại phần thưởng,
  hiện người nhận, hành động, số lượng/nội dung và thời gian.
- **Cấu hình cây kỹ năng cho Founder**: tạo/sửa/lưu trữ node, thêm nhánh, đặt toạ độ, kiểm
  tra cấu trúc để phát hiện vòng lặp, tham chiếu thiếu và node cô lập.
- **Mở rộng kho vật phẩm**: thêm 6 giao diện, 4 trang trí, 4 hình nền và 4 danh hiệu, mỗi
  vật phẩm có cách nhận và công dụng.
- **Mở rộng bộ sưu tập thành tựu**: thêm 17 thành tựu theo nhóm Học tập, Cấp độ, Nhiệm vụ,
  Hoạt động, Khám phá, Gamification và Giới hạn, tất cả dựa trên chỉ số thật.
- **Chi tiết vật phẩm và thành tựu**: modal hiện mô tả, độ hiếm, trạng thái sở hữu, số
  lượng, cách nhận, công dụng; thành tựu hiện tiến độ từng điều kiện, phần trăm và điều
  kiện còn thiếu.
- **Kho vật phẩm dạng lưới** có tìm kiếm, lọc loại/sở hữu và tải thêm khi danh mục dài.

### Sửa lỗi

- **Buff Level và buff XP giờ mở đúng thành tựu mốc cấp.** `bk_gam_set_level` và
  `bk_gam_adjust` gọi `bk_gam_evaluate` trong cùng transaction, nên tăng nhiều cấp trong
  một lần vẫn trao đủ thành tựu, không bỏ sót và không trao trùng.
- **Thành tựu có điều kiện nhiệm vụ** dùng được chỉ số `missions_completed` (đếm nhiệm vụ
  khác nhau đã hoàn thành ít nhất một lần).
- **Node kỹ năng không còn mở chỉ vì đủ chỉ số**: điều kiện cấp độ/nhiệm vụ/thành tựu/node
  trước được xét cùng lúc trước khi chuyển sang `completed`.
- **Không còn cấu hình tạo vòng lặp**: máy chủ từ chối node tự trỏ vào chính nó hoặc tạo
  chu trình, kèm thông báo tiếng Việt chỉ rõ node cần sửa.

### Cải tiến

- **Đồng bộ dữ liệu**: thêm cột có giá trị mặc định (`quantity`, `min_level`, `pos_x`,
  `pos_y`, `granted`) nên dữ liệu cũ giữ nguyên; không xoá tiến trình hay vật phẩm.
- **Nhật ký rõ ràng**: mọi thao tác trao tặng ghi `gamification_activity_logs` và
  `admin_activity_logs`, có người thực hiện, người nhận, nội dung và lý do.
- **Giao diện**: dùng lại biến màu của `bk-core.css`, hỗ trợ Light/Dark, có trạng thái
  loading/empty/error, modal đóng được bằng nút và phím, responsive trên điện thoại.
- **Menu tài khoản** có thêm lối vào **Cây kỹ năng**.

### Bảo mật

- Mọi action trao tặng (`admin.items.grant`, `admin.achievements.grant`,
  `admin.skilltree.grant`, `admin.grants.history`) kiểm tra scope `founder` ở máy chủ,
  không dựa vào việc ẩn nút ở trình duyệt.
- Cấp trọn cây bắt buộc `confirm: true`; trao vật phẩm/thành tựu giới hạn số mục mỗi lần,
  lọc mã hợp lệ và chống trao trùng bằng khoá chính của bảng.
- Học sinh vẫn chỉ đọc dữ liệu của mình qua RLS; mọi ghi đi qua `service_role` trong
  Edge Function và ghi audit.

## [8.3.7] — 2026-11-21

### Sửa lỗi

- **Tìm học sinh trong tab Gamification không còn báo “Hành động không hợp lệ.”**
  Ô tìm kiếm gọi `students.search` trên `gamification-api`, nhưng action này không có
  trong nhánh quản trị nên máy chủ xử lý như học sinh và trả `UNKNOWN_ACTION`; bước lùi
  `students.list` cũng không tồn tại. Nay có action quản trị riêng `admin.students.search`:
  tìm theo tên không dấu (`normalized_name`) và tên hiển thị, chỉ học sinh đang hoạt động,
  tối đa 20 kết quả; mô-đun chỉ lùi về `admin.students.list` khi máy chủ còn bản cũ.
- **Không còn gửi đối tượng rỗng lên máy chủ.** Chọn “Một học sinh” mà chưa chọn ai thì
  nút Xem trước báo “Hãy tìm và chọn một học sinh trước khi xem trước.” thay vì để máy chủ
  từ chối với thông báo chung.
- **Nhật ký đặt cấp độ hiện đúng số liệu.** Bản 8.3.6 đọc `from_level`/`to_level` không
  tồn tại nên cột chi tiết hiện “undefined”; nay máy chủ lưu `level`, `updated`, `reason`
  và giao diện hiển thị “cấp 12 · 3 học sinh · lý do”.
- **Gõ tên khác sau khi đã chọn học sinh thì bỏ lựa chọn cũ**, tránh đặt cấp hoặc buff
  nhầm người vừa chọn trước đó.

## [8.3.6] — 2026-11-21

### Sửa lỗi

- **Khung avatar không còn bị báo “chưa mở”.** Migration 8.3.5 thay `bakhi_owned_frames`
  bằng danh sách 21 khung viết cứng nên khung Founder và nhiều khung badge khác bị coi là
  chưa mở: hồ sơ bị từ chối và hiện “Khung avatar chưa mở nên chưa đồng bộ được”. Nay hàm
  đọc lại bảng ánh xạ `bakhi_badge_frames` (58 khung), cộng khung kho vật phẩm và khung đang
  trang bị — hồ sơ đang dùng `founder-genesis`, `founder`… vẫn hợp lệ sau nâng cấp.
- **Avatar và khung hiện đúng ở trang Tiến trình.** `/gamification/` chưa nạp
  `bk-profile.js`/`bk-badges.js` nên hero chỉ vẽ chữ cái đầu; nay nạp đủ hai mô-đun trước
  `bk-gamification.js`.
- **Bộ chọn khung nhận danh sách từ máy chủ.** `bk-cloud.js` bỏ qua `frames` máy chủ trả về;
  nay áp vào cache hồ sơ và hợp nhất với khung kho vật phẩm thay vì ghi đè lẫn nhau.
- **Thông báo khung không hợp lệ chỉ hiện một lần**, nói rõ máy chủ giữ khung hiện tại thay
  vì lặp lại lỗi sau mỗi lần đồng bộ.

### Tính năng

- **Tab Gamification trong Founder Dashboard**: chọn đối tượng (toàn bộ học sinh / một học
  sinh / khoảng cấp độ), xem trước số người bị ảnh hưởng rồi mới xác nhận, đặt cấp độ 1–100
  và tạo buff XP có thời hạn. Có danh sách buff đang chạy và nhật ký thao tác.
- **Buff XP theo đối tượng** (`gamification_xp_buffs`): hệ số x1,1–x10, 1–720 giờ, áp dụng
  ngay trong `bk_gam_award`; học sinh thấy băng “Đang nhân xN XP” ở trang Tiến trình.
- **Đặt cấp độ ghi sổ XP từng phần** (`bk_gam_set_level`): tổng XP luôn khớp mốc cấp, không
  tạo lệch sổ, bắt buộc lý do và ghi `gamification_activity_logs`.

## [8.3.5] — 2026-11-21

### Sửa lỗi

- **Avatar đồng bộ toàn website.** Gamification trước đây chỉ vẽ chữ cái đầu thay vì ảnh
  đại diện thật. Nay hero dùng chung component `BKProfile.avatarNode()` với navbar, hồ sơ
  và chat; đổi avatar ở Hồ sơ thì Gamification vẽ lại ngay, không cần tải lại trang.
- **Khung avatar chỉ còn MỘT nguồn sự thật.** Khung được lưu ở hai nơi (`student_profiles.frame`
  cho toàn site và `user_inventory.is_equipped` cho Gamification) nên trang bị ở Gamification
  không đổi navbar/hồ sơ. Nay `student_profiles.frame` là nguồn chính thức, `bk_gam_equip` ghi
  luôn hồ sơ trong cùng transaction, và `bakhi_owned_frames` bao gồm khung nhận qua kho vật phẩm.
- **Bỏ khung không làm mất avatar hay vật phẩm.** Bỏ trang bị chỉ đưa khung về “Mặc định”.
- **Khung máy chủ không bị hạ về “Mặc định”.** Cache hồ sơ không còn tự loại khung mà danh
  sách badge cục bộ chưa biết.
- **Đổi tài khoản không dùng nhầm hồ sơ/khung của tài khoản trước.**

### Tính năng

- **Tab Thành tích / Tiến trình dễ dùng cho người không biết lập trình.** Mã thành tựu,
  Boss, nhiệm vụ, node và phần thưởng được **tự sinh từ tên** (`Ma Vương` → `ma_vuong`,
  `Đỉnh Cao Kiến Thức` → `dinh_cao_kien_thuc`).
- **Chống mã trùng:** cảnh báo ngay khi gõ, đề xuất `ma_vuong_2` và chỉ dùng khi người quản
  trị bấm xác nhận; máy chủ trả `CODE_TAKEN` nếu vẫn gửi mã đã tồn tại.
- **Xem trước trực tiếp** thành tựu/nhiệm vụ/node/vật phẩm/Boss khi đang soạn.
- **Cài đặt nâng cao** (mã, thứ tự, thời gian đóng) được thu gọn, mặc định đóng.
- **Tìm kiếm, lọc trạng thái** và hành động rõ ràng: Tạo mới, Sửa, Lưu thay đổi, Hủy,
  Tạm ngừng/Kích hoạt, Lưu trữ, Xóa.
- **Xóa thành tựu có kiểm soát:** từ chối nếu đã có học sinh nhận, hướng dẫn dùng Lưu trữ.
- Mã Boss được phép dùng dấu gạch dưới (`ma_vuong`) — migration nới ràng buộc slug.

### Cải tiến

- Thông báo lỗi trong dashboard bằng tiếng Việt, chỉ rõ trường cần sửa; không lộ SQL/stack.
- Avatar hero có kích thước cố định, khung canh giữa, không che mặt, không nhảy layout.

## [8.3.1] — 2026-11-21

### Sửa lỗi

- **Không tải được tiến trình — đã sửa tận gốc.** `bk-gamification.js` gọi API máy chủ qua
  `BK.cloud`, nhưng đó là adapter localStorage của `bk-core.js`, không hề có
  `gamificationApi`; lớp máy chủ thật là `window.BKCloud`. Mọi lần tải đều thất bại ngay
  trên trình duyệt với câu “Chưa kết nối máy chủ Bá Khí”. Nay loader dùng `BKCloud`, lấy
  danh tính từ `BKCloud.identity()` và chỉ fallback `BK.cloud` khi nó thật sự có API.
- **Một thông báo lỗi cho mọi tình huống.** Loader được thay bằng máy trạng thái phân biệt
  chưa nhận diện, đang khôi phục phiên, đang tải, chưa có dữ liệu, mất mạng, hết phiên,
  thiếu quyền, giới hạn tốc độ, máy chủ lỗi và dữ liệu sai cấu trúc; mỗi trạng thái có mã
  lỗi riêng (`E_NETWORK`, `E_UNAUTHORIZED`, `E_NOT_BOUND`…) và hành động phù hợp.
- **XP nhảy về giá trị cũ.** Phản hồi `state` về muộn không còn ghi đè kết quả `event` vừa
  cộng: mỗi request có số thứ tự, phản hồi cũ bị bỏ.
- **Request lặp khi lỗi.** Retry giới hạn 2 lần, chỉ cho lỗi mạng/5xx, có timeout 15 giây;
  không còn vòng lặp request do render gọi lại loader.
- **Mất dữ liệu khi làm mới thất bại.** Dữ liệu đã tải được giữ nguyên và hiện băng
  “Một số dữ liệu chưa tải được” kèm nút làm mới.

### Tính năng

- **Lối vào Tiến trình** trong menu tài khoản dùng chung, ngay sau Hồ sơ cá nhân; hoạt động
  trên desktop và mobile, có `aria-current` khi đang ở `/gamification/`, không phụ thuộc
  trạng thái tải dữ liệu.

### Cải tiến

- **QA mô phỏng đúng production.** Stub `BK.cloud` sai hình dạng đã được thay bằng
  `window.BKCloud`; thêm `gamification-progress-load-smoke` (29 ca) và
  `gamification-navigation-smoke` (17 ca); 5 bộ QA gamification chạy trong
  `quality-check.yml` (tổng 22 smoke test).
- `BK.gamification.status()` và `lastError()` để gỡ lỗi nhanh mà không lộ token.

### Ghi chú

- Không có migration mới, không đổi schema/RLS/Reward Engine, không xoá dữ liệu.
- Chi tiết nguyên nhân và bằng chứng: `docs/GAMIFICATION_BUG_AUDIT_V831.md`.

## [8.3.0] — 2026-11-21

### Tính năng

- **Gamification 2.0 — một hệ thống tiến trình thống nhất.** XP, cấp độ, cây kỹ năng,
  thành tựu, nhiệm vụ ngày/tuần, thử thách Boss và kho vật phẩm dùng chung **một** sổ giao dịch
  `xp_transactions` và **một** công thức cấp độ (`bk_gam_level`). Không có engine XP thứ hai,
  không có bảng danh hiệu hay thành tựu trùng lặp.
- **Reward Engine phía máy chủ.** Một sự kiện học tập đi qua `gamification-api` → các hàm
  `bk_gam_*` chạy trong **một transaction** của Postgres: ghi XP (có idempotency và giới hạn
  mỗi ngày), tính lại cấp, mở thành tựu, cập nhật cây kỹ năng, tiến trình nhiệm vụ và cấp
  vật phẩm. Client chỉ gửi loại hoạt động, nguồn và khoá chống trùng.
- **Trang Tiến trình `/gamification/`.** Tổng quan (cấp, XP, thành tựu nổi bật, nhiệm vụ,
  cây kỹ năng), nhiệm vụ ngày/tuần có nhận thưởng, bộ sưu tập thành tựu có lọc/tìm kiếm,
  kho vật phẩm trang bị được, cây kỹ năng 5 nhánh, thử thách Boss và lịch sử XP.
- **Tab quản trị “Tiến trình”** trong Administrator/Founder Dashboard: cấu hình XP và feature
  flag, quản lý thành tựu/nhiệm vụ/nút cây kỹ năng/danh mục phần thưởng, soạn thử thách Boss
  kèm ngân hàng câu hỏi; Founder có thêm điều chỉnh XP (bắt buộc lý do, ghi audit) và nhật ký.
- **Theo dõi hoạt động học tập thật.** `bk-page.js` ghi `quiz_completed` khi trang bài học
  ghi nhận ≥ 3 câu trả lời, `bk-learning.js` ghi `revision_session`, `mistake_mastered`,
  `goal_completed`; mở bài học ghi `lesson_study`. Chat, báo cáo và thao tác giao diện
  **không** cấp XP.
- **15 bảng + 14 hàm SQL mới** (`20261209000000_bakhi_v830_gamification.sql`), RLS chỉ cho
  đọc dòng của chính mình, không có policy ghi, `boss_questions` không đọc được từ trình duyệt.

### Cải tiến

- **Đồng bộ đa thiết bị.** XP nằm trên Supabase; localStorage chỉ giữ cache, tuỳ chọn và hàng
  đợi sự kiện offline (tối đa 40, gửi lại khi có mạng). Refresh hay retry không cộng trùng.
- **Không làm chậm hoạt động học.** Sự kiện gửi nền sau khi người học đã hoàn thành thao tác;
  dashboard chỉ tải khi mở trang; lịch sử XP phân trang 20 dòng.
- **Trợ năng.** Thanh tiến trình có `aria-value*`, trạng thái luôn có nhãn chữ, tôn trọng
  `prefers-reduced-motion`, có công tắc giảm hiệu ứng và tắt thông báo.

### Sửa lỗi

- **Phiên bản máy chủ lệch frontend.** `SERVER_VERSION` của `admin-actions` được nâng lên
  8.3.0 để dashboard và website hiển thị cùng một phiên bản.

### Ghi chú

- Badge (99), Title, danh vị, Learning Intelligence và mọi dữ liệu cũ **giữ nguyên**; không
  xoá khoá localStorage hay bảng nào.
- Thử thách Boss không seed sẵn câu hỏi: nội dung do quản trị viên biên soạn để không tạo
  nội dung giáo dục giả. Xem `docs/BOSS_CHALLENGE.md` và `docs/RELEASE_REPORT_V830.md`.

## [8.2.0] — 2026-11-20

### Tính năng

- **Sổ tay câu sai (Learning Intelligence).** Câu làm sai được ghi tự động từ mọi bài luyện tập
  kèm đáp án đã chọn, đáp án đúng, lời giải, môn/chương/bài, số lần sai, lịch sử sửa sai, sáu
  loại lỗi (học sinh tự phân loại), ghi chú, ghim và năm trạng thái
  New/Reviewing/Needs Attention/Mastered/Archived. Không tạo hệ thống quiz thứ hai và không bao
  giờ sửa kết quả bài làm gốc.
- **Phân tích học tập cá nhân.** Bảy biểu đồ (hoạt động, xu hướng độ chính xác, kết quả từng
  môn, phân bố lỗi, tiến độ tuần/tháng), bốn khoảng thời gian (7/30/90 ngày, tất cả), chỉ số cá
  nhân, chủ đề yếu (chỉ kết luận khi ≥ 4 câu) và **Learning Score** 0–100 có trọng số, có ngưỡng
  dữ liệu và chống nhiễu bằng cách chỉ tính lần trả lời đầu tiên của mỗi câu trong ngày.
- **Smart Study Planner.** Nhiệm vụ theo ngày/tuần/tháng, hạn, môn học, thời lượng ước lượng,
  hoàn thành/hoãn/sửa/xoá, nhóm Quá hạn/Hôm nay/Sắp tới/Đã xong và gợi ý dựa trên câu đến hạn,
  chủ đề yếu, nhiệm vụ quá hạn — chỉ đề xuất, không tự thêm vào lịch.
- **Revision Engine.** Spaced repetition có giới hạn (`again/hard/good/easy`, trần 90 ngày,
  `ease`, `streak`), hàng đợi đến hạn/quá hạn/sắp tới/chủ đề yếu/mới sai, phiên ôn có chấm điểm
  và cập nhật lịch, thành thạo chỉ khi chuỗi đúng ≥ 2 **và** khoảng cách ≥ 21 ngày.
- **Mục tiêu học tập & Môn học.** Mục tiêu đo bằng câu hỏi/bài học/câu thành thạo/ngày hoạt động,
  tiến độ tính lại từ dữ liệu gốc; tab Môn học tổng hợp tiến độ từng môn.

### Cải tiến

- **Trung tâm học tập tái cấu trúc.** 11 khu vực có nhóm rõ ràng. Tab **Ôn tập** cũ (trùng logic
  với sổ tay) và tab **Lịch sử** (gộp vào nhật ký của tab Phân tích) đã được **xoá khỏi mã
  nguồn** — khoảng 490 dòng JS trùng lặp, không giữ wrapper/fallback song song.
- **Một nguồn dữ liệu.** `bakhiLearn.v1` lên schema 2: thêm `plans`, `goals`, `revisionSessions`;
  `save()` chuẩn hoá bằng `sanitize()` trước khi ghi nên dữ liệu hỏng từ đồng bộ/nhập tệp không
  thể vào localStorage. Không có bảng hay mảng dữ liệu thứ hai cho cùng một nhiệm vụ.
- **Đồng bộ nhiều thiết bị.** `student_progress` nhận thêm ba khoá mới trong **cùng** bảng, hợp
  nhất theo `updatedAt`, không nhân bản khi hai lần ghi cùng lúc.
- **Biểu đồ nhẹ.** Toàn bộ biểu đồ dựng bằng CSS/SVG trong `bk-learning.js` — không nạp thư viện
  chart, không nạp lặp, không phụ thuộc mạng.
- **Trang bài học.** `bk-page.js` đọc thêm phương án học sinh đã chọn (best-effort, chỉ đọc DOM)
  để Sổ tay câu sai hiển thị "Bạn chọn" bên cạnh "Đáp án đúng".

### Sửa lỗi

- **Ràng buộc `student_progress.progress_key` thiếu khoá thật.** Từ 8.1.0 Edge Function vẫn gửi
  `signals` và `badges` nhưng ràng buộc chỉ cho 7 khoá cũ. Migration `20261208000000` mở rộng
  đúng danh sách khoá đang dùng (bao gồm `plans`, `goals`, `revisionSessions`) nên đồng bộ không
  còn bị từ chối.
- **`dev-auth` từng chạy `verify_jwt = true`.** Đã deploy lại; gọi không có header Authorization
  giờ trả `401 BAD_DEV_CODE` thay vì lỗi cổng JWT.

### Bảo mật & dữ liệu

- Migration `20261208000000_bakhi_v820_learning_intelligence.sql`: mở rộng ràng buộc, thêm chỉ
  mục, trigger chặn payload > 1 MB/khoá, hai view chỉ đọc `security_invoker` (chỉ `authenticated`
  có `SELECT`). **Không** xoá bảng/cột/dòng, không chạy lại SQL cũ, đã kiểm tra idempotent và
  rollback trong transaction.
- Thêm `student_progress_key_idx (progress_key, updated_at desc)`.

### QA

- Thêm 6 cổng: `mistake-notebook-smoke` (35), `learning-analytics-smoke` (28),
  `study-planner-smoke` (33), `revision-engine-smoke` (28), `learning-data-integrity` (37),
  `learning-sync-smoke` (22) — tổng **183 kiểm tra mới**. Toàn bộ 11 cổng cũ vẫn xanh; CI chạy
  **17** smoke test.
- `smoke.js` và `shell-smoke.js` được cập nhật theo cấu trúc tab mới (11 khu vực thay vì 7) và
  kiểm tra thêm Sổ tay câu sai/Phân tích/Kế hoạch/Mục tiêu.

### Tài liệu

- Thêm `docs/LEARNING_INTELLIGENCE.md`, `docs/LEARNING_ANALYTICS.md`,
  `docs/REVISION_ENGINE.md`, `docs/DATA_MIGRATION_V820.md`, `docs/DEPLOYMENT_V820.md`,
  `docs/RELEASE_REPORT_V820.md`; cập nhật README, AGENTS, ARCHITECTURE, FEATURES, SUPABASE_SETUP.

## [8.1.1] — 2026-11-20

### Sửa lỗi

- **`supabase/config.toml` khớp lại với Edge Function thật.** Bỏ khai báo mồ côi
  `passkey-api` (hàm đã bị gỡ ở 7.8.0) và bổ sung `dev-auth` còn thiếu, nên lần deploy tới
  Developer Playground không còn bị cổng JWT của Supabase chặn. `project_id` vẫn là
  `wzvslyabhizsiggurwdq`.
- **Lịch sử migration được đối chiếu và ghi nhận đủ.** Năm migration 7.7.0–8.0.0 đã tạo
  schema trên project thật nhưng chưa có dòng trong `supabase_migrations.schema_migrations`
  (`20261203–20261206`); chúng đã được kiểm tra từng đối tượng và ghi nhận đúng version,
  **không chạy lại SQL** và không mất dữ liệu.
- **Thu hồi quyền ghi trực tiếp trên bảng Report Issue.** `anon` và `authenticated` còn giữ
  `INSERT/UPDATE/DELETE` ở tầng GRANT trên `reports`, `report_messages`, `report_notifications`,
  `report_activity_logs` dù RLS đã chặn. Migration mới thu hồi các quyền đó (chỉ còn `SELECT`
  cho chủ sở hữu) và ghim `search_path` cho trigger `bakhi_v800_touch`.

### Cải tiến

- **QA cấu hình Supabase.** Thêm `tools/qa/supabase-config.js`: so hai chiều
  `supabase/functions/*` ↔ `config.toml`, bắt khai báo mồ côi, `verify_jwt` thiếu hoặc bật
  nhầm, tên function frontend gọi không tồn tại, tham chiếu Passkey còn sót, migration trùng
  version và cú pháp TypeScript của toàn bộ Edge Function.
- **CI/CD.** Thêm `.github/workflows/quality-check.yml`: chạy toàn vẹn nội dung, cú pháp
  JS/JSON, QA cấu hình Supabase, `version-audit` và 11 smoke test DOM trên mỗi push `main` /
  pull request. Không đụng hai workflow đang chạy (changelog-sync, music-library).
- **Phiên bản đồng nhất 8.1.1.** `bk-version.js`, `?v=` trong 122 tệp HTML, `APP_VERSION`
  của dashboard, `bk-founder.js` và `SERVER_VERSION` của `admin-actions` cùng là `8.1.1`.
- **Tài liệu.** Thêm `docs/DEPLOYMENT_CHECKLIST.md` và
  `docs/PRODUCTION_READINESS_REPORT.md`; cập nhật `docs/SUPABASE_SETUP.md` sang trạng thái
  xác minh ngày 20/11/2026.

## [8.1.0] — 2026-11-20

### Sửa lỗi

- **Founder/Administrator Dashboard hiện lại danh sách báo cáo.** `renderPager()` xoá sạch
  host của nó, và tab Report gọi nó ngay trên host vừa dựng bảng — nên sau khi tải xong chỉ
  còn phần phân trang, không có dòng báo cáo nào. Phân trang giờ có host riêng; tab Report
  hiển thị đầy đủ mã, tiêu đề, học sinh, nhóm, ưu tiên, trạng thái và thời gian cập nhật.
- **Nút báo cáo của học sinh không còn xuất hiện trên trang quản trị.** `admin/` và
  `founder/` gỡ thẻ `bk-report.js`; component cũng tự bỏ qua khi `BK_ADMIN_ONLY` được bật.
  Người quản trị dùng tab **Report** trong dashboard, không dùng cửa sổ báo cáo học sinh.
- **Hết tải trùng khi mở chi tiết từ chuông.** Danh sách và chi tiết dùng số thứ tự yêu cầu;
  phản hồi danh sách đến muộn không ghi đè màn hình chi tiết nữa.
- **Form không còn đường gửi kép.** Nút “Gửi báo cáo” chỉ submit form một lần thay vì vừa
  `click` vừa `submit`.

### Tính năng

- **Tab Report đầy đủ trong cả hai dashboard.** Huy hiệu số báo cáo chưa đọc/mới trên tab,
  tự làm mới mỗi 45 giây khi tab đang mở, chọn **người xử lý** (`Administrator`/`Founder`)
  ngay trong chi tiết, và **xuất CSV** theo đúng bộ lọc hiện tại.
- **“Báo cáo của tôi” có tìm kiếm, lọc và tải thêm.** Tìm theo mã/tiêu đề/nội dung, lọc
  *Tất cả / Đang mở / Đã xử lý*, tải thêm theo trang; mỗi dòng hiện xem trước phản hồi gần nhất.
- **Bản nháp được giữ qua lần chuyển trang.** Tiêu đề, mô tả, nhóm, loại và ưu tiên lưu ở
  `bakhiReportDraft.v1` (350 ms sau khi ngừng gõ), xoá sau khi gửi thành công hoặc bấm
  “Xoá nội dung”. Bộ đếm ký tự cho tiêu đề và mô tả.
- **Chấm đỏ cập nhật theo thời gian thực.** Chuông phát sự kiện `bk:report-notes` sau khi tải
  phản hồi mới; nút Báo cáo và danh sách đang mở cập nhật mà không cần tải lại trang.
- **Máy chủ.** `report-api` lọc theo từ khoá và nhóm trạng thái, trả `last_message_preview`;
  `admin-actions` thêm `reports.export` (CSV, tối đa 5.000 dòng, có ghi nhật ký).

### Cải tiến

- **Phiên bản đồng nhất 8.1.0.** `bk-version.js`, `?v=` trong 122 tệp HTML, `APP_VERSION`
  của dashboard, `bk-founder.js` và `SERVER_VERSION` của `admin-actions` cùng là `8.1.0`.
- **QA.** `report-smoke` thêm 19 kiểm tra: dựng Founder Dashboard thật trong jsdom để xác
  nhận tab Report có dòng dữ liệu, huy hiệu chưa đọc, tìm kiếm/lọc/tải thêm, bản nháp,
  `reports.export` và việc trang quản trị không nạp nút báo cáo học sinh.

## [8.0.1] — 2026-11-20

### Sửa lỗi

- **Nút Báo cáo không còn chồng lên chuông thông báo.** Trên mọi trang có chuông nổi (trang
  môn học, bài học, Chat, Hồ sơ, Cài đặt, Studio, Admin, Founder), nút **Báo cáo** mặc định
  nằm ngay **phía trên chuông**, thẳng mép phải. Nút tự căn lại khi chuông được dựng sau nút
  hoặc khi đổi kích thước cửa sổ. Trang chủ không có chuông nổi nên giữ vị trí góc phải dưới.
- **Nút Báo cáo kéo được.** Giữ và kéo bằng chuột hoặc cảm ứng; vị trí được nhớ trong
  `localStorage` (`bakhiReportFab.v1`) và áp dụng cho các lần truy cập sau, luôn được giữ
  trong khung nhìn. Kéo nút không mở cửa sổ ngoài ý muốn. Dùng bàn phím: mũi tên di chuyển
  12px (Shift: 40px), `Home` trả nút về vị trí mặc định.

### Cải tiến

- **Giao diện tối của cửa sổ Report Issue.** Bảng màu mới đồng bộ với Trung tâm thông báo
  (`--bkc-n-*`): nền phân tầng, viền và vòng focus rõ hơn, chữ phụ có độ tương phản tốt hơn,
  ô nhập, bong bóng Q&A và thẻ báo cáo có nền riêng, cuộn và `color-scheme` theo đúng chế độ
  tối. Chủ đề sáng vẫn dùng cùng cấu trúc biến nên không phát sinh quy tắc trùng lặp.
- **Phiên bản đồng nhất 8.0.1.** `bk-version.js`, `?v=` trong 122 tệp HTML, `APP_VERSION` của
  dashboard/Founder và `SERVER_VERSION` của `admin-actions` cùng là `8.0.1`.

## [8.0.0] — 2026-11-20

### Tính năng

- **Hệ thống Report Issue toàn website.** Một component dùng chung (`bk-report.js` +
  `bk-report.css`) xuất hiện ở hai nơi: mục **Cài đặt → Report Issue** trên trang chủ và
  **nút nổi** ở góc phải dưới trên mọi trang môn học, bài học, Chat, Hồ sơ, Cài đặt và
  Studio. Cửa sổ nổi kéo được, thu nhỏ được, nhớ vị trí, đóng bằng `Esc`, chuyển thành
  bottom sheet trên điện thoại.
- **Báo cáo cơ bản và nâng cao.** Biểu mẫu gồm tiêu đề, nhóm vấn đề (9 nhóm), loại báo cáo,
  mức ưu tiên, mô tả chi tiết, tệp đính kèm (tối đa 4 tệp ≤ 5 MB: PNG/JPG/WEBP/GIF/PDF),
  ngữ cảnh tự thu thập (URL, tiêu đề trang, khu vực, kích thước màn hình, trình duyệt,
  múi giờ, thời điểm) và mã báo cáo dạng `BK-xxxxx`. Không thu thập mật khẩu, token, cookie
  hay dữ liệu cá nhân không cần thiết.
- **Theo dõi và lịch sử báo cáo của chính mình.** Tab *Báo cáo của tôi* hiển thị mã, tiêu
  đề, trạng thái, ưu tiên, thời gian cập nhật và nhãn “Phản hồi mới”. Học sinh chỉ thấy báo
  cáo thuộc tài khoản của mình.
- **Q&A riêng cho từng báo cáo.** Hội thoại hai chiều giữa người báo cáo và ban quản trị,
  sắp theo thời gian, có nhãn *Tin nhắn riêng*, trả lời được nhiều lượt trên cùng một báo
  cáo, không sửa được nội dung đã gửi. Trả lời vào báo cáo đã hoàn thiện sẽ mở lại báo cáo.
- **Thông báo riêng cho đúng học sinh.** Phản hồi, tin nhắn riêng, thay đổi trạng thái và
  kết quả hoàn thiện đều tạo một dòng trong `report_notifications` và hiển thị trong
  **Trung tâm thông báo hiện có** (nhóm “Phản hồi báo cáo của bạn”) — không có chuông thứ
  hai. Bấm thông báo sẽ mở đúng báo cáo. Realtime qua `report_notifications`.
- **Tab Report trong cả hai dashboard.** Administrator Dashboard và Founder Dashboard dùng
  chung một tab, một nguồn dữ liệu `public.reports` và cùng các action `reports.*`:
  thống kê thật (tổng, mới, đang xử lý, chờ học sinh, đã giải quyết, cần chú ý, chưa đọc),
  danh sách có tìm kiếm, lọc trạng thái/nhóm/ưu tiên/ngày/chưa đọc, phân trang phía máy chủ.
- **Chi tiết báo cáo và quy trình xử lý.** Xem thông tin, ngữ cảnh, tệp đính kèm, toàn bộ
  Q&A, đổi trạng thái theo luồng hợp lệ, **Complete Report** (bắt buộc ghi chú kết quả, ghi
  người thực hiện + thời gian, tạo thông báo và tin nhắn trong Q&A), **Gửi tin nhắn riêng**
  cho đúng người báo cáo, mở lại báo cáo kèm lý do, và bảng **Lịch sử xử lý**.
- **Nhật ký và chống lạm dụng.** Mọi chuyển trạng thái, trả lời, hoàn thiện, mở lại và trao
  người xử lý đều ghi `report_activity_logs` và `admin_activity_logs`. Máy chủ giới hạn tần
  suất tạo báo cáo (6/giờ) và gửi trả lời (30/10 phút), chặn tệp ngoài thư mục của học sinh
  và cảnh báo báo cáo trùng lặp trong 24 giờ mà không tự từ chối báo cáo hợp lệ.
- **Nâng cấp toàn bộ tài liệu Markdown.** README, CHANGELOG, AGENTS, ARCHITECTURE, FEATURES,
  SUPABASE_SETUP, MUSIC, STUDIO được rà soát và đồng bộ với mã nguồn 8.0.0; thêm
  [docs/REPORT_ISSUE.md](docs/REPORT_ISSUE.md) mô tả đầy đủ hệ thống báo cáo.

### Sửa lỗi

- **Phiên bản đồng nhất toàn website.** `bk-version.js`, mọi tham số `?v=` trong 123 tệp
  HTML, `APP_VERSION` của dashboard/Founder, `SERVER_VERSION` của `admin-actions` và bộ QA
  cùng là `8.0.0`; `tools/qa/version-audit.js` xác nhận không còn tài nguyên lỗi thời.
- **Chuông thông báo không bị phá khi chưa chạy migration báo cáo.** Nếu bảng
  `report_notifications` chưa tồn tại, chuông vẫn hoạt động bình thường và chỉ bỏ qua nhóm
  phản hồi báo cáo.

### Cải tiến

- **Một component báo cáo duy nhất.** Cài đặt, cửa sổ nổi và dashboard đều dùng chung logic
  kiểm tra dữ liệu, danh mục, nhãn trạng thái và định dạng thời gian; không có bản sao thứ hai.
- **Quyền kiểm tra ở máy chủ.** Trình duyệt chỉ đọc dữ liệu của chính mình qua RLS
  (`reports_select_own`, `report_messages_select_own`, `report_notifications_select_own`);
  mọi thao tác ghi đi qua Edge Function `report-api` (học sinh) hoặc `admin-actions`
  (Administrator/Founder) sau khi xác minh phiên. Không có `student_id` nào do client gửi lên.
- **Tệp đính kèm riêng tư.** Bucket `report-attachments` để `public = false`; học sinh chỉ
  ghi/đọc trong thư mục của mình, quản trị viên xem qua signed URL do Edge Function sinh ra.
- **QA mới `tools/qa/report-smoke.js`** kiểm tra form, validation, payload không chứa
  `student_id`, danh sách, Q&A, chế độ nhúng Cài đặt, hợp đồng máy chủ, RLS và bucket.

### Ghi chú phát hành

- Cần chạy migration `20261206000000_bakhi_v800_reports.sql` và deploy Edge Function
  `report-api` (cùng `admin-actions`) trước khi tab Report hoạt động trên production.
- Chưa triển khai: thông báo đẩy ngoài trình duyệt (Web Push) và xuất báo cáo ra CSV — không
  nằm trong phạm vi 8.0.0.

## [7.9.2] — 2026-11-20

### Tính năng

- **Đăng nhập Founder ngay trên màn hình bảo trì, cho toàn bộ website.** Mọi trang công khai
  (trang chủ, 116 trang môn học/Studio, chat, hồ sơ, cài đặt) dùng chung một màn hình bảo trì
  với nút **Đăng nhập Founder**. Nút mở giao diện nhập mã ngay trên màn hình đó: ô mã bị che,
  có nút hiện/ẩn, nút quay lại, trạng thái đang xác thực và thông báo lỗi rõ ràng.
- **Một cơ chế xác thực Founder duy nhất.** Nút trên màn hình bảo trì, trang `founder/` và
  Founder Dashboard cùng dùng Edge Function `admin-auth` với `scope = founder`, cùng bảng
  `founder_config` (chỉ lưu băm SHA-256), cùng bảng phiên `admin_sessions` và cùng thời hạn
  phiên. Không có mã Founder thứ hai, không có hệ đăng nhập thứ hai.
- **Máy chủ xác minh lại phiên** bằng action mới `admin-actions` → `session.check` trước khi
  gỡ màn hình bảo trì. Sửa `sessionScope` trong JavaScript, dựng lại sessionStorage hay gọi
  thẳng API đều không vượt được bước này.
- **Founder Dashboard → Bảo trì** có thêm khu **Founder Access**: trạng thái phiên Founder,
  trạng thái bảo trì toàn hệ thống, thời gian bắt đầu do máy chủ ghi, nút mở trang bảo trì và
  mở Founder Dashboard. Bật/tắt bảo trì đều có hộp xác nhận.

### Sửa lỗi

- **Administrator không còn vượt được bảo trì toàn hệ thống.** Hai màn hình bảo trì cũ (một
  trong `bk-shell.js`, một trong `bk-core.js`) đều cho nhập Administrator Code để mở khoá;
  màn hình cũ trong `bk-core.js` đã bị gỡ hẳn và `bk-shell.js` chỉ chấp nhận phiên Founder do
  máy chủ xác nhận.
- **Chỉ còn một màn hình bảo trì.** `bk-cloud.js` không còn tự vẽ thông báo bảo trì thứ hai;
  nó chỉ phát trạng thái để `bk-shell.js` dựng đúng giao diện chung.
- **Administrator không còn thấy công tắc bảo trì** trong mục feature flag của dashboard;
  máy chủ vẫn chặn `settings.set` cho `public.maintenance` (chỉ Founder).
- **Thiên Khải Sáng Thế không còn được tự gắn cờ Founder theo tên hiển thị.** `badges.grant`
  chỉ cấp badge `founder` khi hồ sơ đã có `is_founder = true`; việc trao và thu hồi badge độc
  quyền đều bắt buộc phạm vi Founder và được ghi `admin_activity_logs`.
- **Sửa quyền đọc `app_settings` cho khách chưa đăng nhập.** Migration 5.0 đã tạo policy
  `app_settings_select_anon` (chỉ khoá `public.*`) nhưng thiếu `grant select ... to anon`,
  nên trình duyệt nhận lỗi `42501 permission denied for table app_settings`: màn hình bảo trì
  và feature flag công khai không bao giờ tải được. 7.9.2 cấp đúng quyền đọc (không mở quyền
  ghi — PATCH từ anon vẫn bị từ chối) trong migration
  `20261205000000_bakhi_v792_maintenance_fields.sql`.
- **Mã Founder sai trả về đúng một thông báo** “Mã Founder không hợp lệ.”, không phân biệt mã
  rỗng, sai hay chưa cấu hình; giới hạn 5 lần thử / 10 phút theo IP kèm thời gian thử lại.

### Cải tiến

- Màn hình bảo trì theo đúng đặc tả: nền đen tuyền, nội dung căn giữa, tiêu đề **Bảo trì**,
  lý do (không hardcode), **Thời gian bắt đầu** lấy từ máy chủ/DB, vòng xoay tải và nút Đăng
  nhập Founder là tương tác duy nhất; navbar và nội dung website phía dưới bị ẩn.
- `public.maintenance` lưu thêm `maintenance_enabled`, `maintenance_reason`,
  `maintenance_started_at`, `maintenance_started_by`, `maintenance_updated_at`; các khoá
  camelCase cũ được giữ để tương thích.
- Đồng bộ trạng thái bảo trì không cần xoá cache: realtime `app_settings` cập nhật ngay, và
  khi kết nối realtime được khôi phục, `bk-cloud.js` đọc lại toàn bộ feature flag.
- Nâng toàn bộ website lên 7.9.2 (122 tệp HTML, `bk-version.js`, dashboard, chat, Edge Function).

## [7.9.1] — 2026-11-20

### Sửa lỗi

- **Bấm vào hồ sơ ở trang chủ không còn tự chạy tìm kiếm theo tên đăng nhập.** Từ 7.9.0, khung
  tìm kiếm căn bản đã bị gỡ khỏi giao diện nhưng mã của nó vẫn còn sống trong `index.html`:
  ô `#searchInput` vẫn nằm trong DOM (chỉ bị ẩn bằng CSS), vẫn gắn `oninput` và vẫn nhận sự kiện
  `input` do trình duyệt/trình quản lý mật khẩu tự điền. Khi việc đó xảy ra, `handleSearch()`
  ẩn `#categoriesTree` và hiện “Không tìm thấy kết quả phù hợp cho từ khóa …”, khiến các thẻ môn
  học biến mất và không bấm được cho tới khi tải lại trang.
- Đã gỡ **toàn bộ** hệ thống tìm kiếm căn bản ở trang chủ: ô nhập, khu kết quả
  (`#searchResultsSection`), `handleSearch()`, `debouncedSearch()`, hai hàm chỉ phục vụ nó
  (`hlText`, `norm`/`nrm1`), phím tắt `Ctrl/⌘ + /` mở ô cũ, và đoạn mã gắn cứng vào nó trong
  hiệu ứng click.
- `bk-shell.js` không còn dựng ô tìm kiếm trong menu hồ sơ và không còn `hookSearch()` bọc
  `debouncedSearch`; mở menu hồ sơ chỉ đưa focus vào mục đầu tiên, không vào ô nhập nào.

### Cải tiến

- Thành tích **Tầm Bảo Nhất Niệm** (dùng tìm kiếm) giờ đếm ở bảng lệnh kiêm tìm kiếm toàn cục
  trong Trung tâm học tập — tìm kiếm duy nhất còn lại của website — thay vì ô tìm kiếm đã gỡ.
- Nâng toàn bộ website lên 7.9.1 (122 tệp HTML, `bk-version.js`, dashboard, chat, Edge Function).

## [7.9.0] — 2026-11-19

### Tính năng

- **Founder trao badge/khung Founder cho mọi học sinh.** Ngoại lệ duy nhất là badge tối cao
  **Thiên Khải Sáng Thế** (`founder`), vẫn chỉ cấp cho hồ sơ `is_founder = true`. 20 badge và
  khung Founder còn lại, cùng các danh hiệu ánh xạ, do Founder trao tay từ
  **Founder Dashboard → Thành tích** cho bất kỳ học sinh đang hoạt động; máy chủ kiểm tra lại
  quyền và ghi `admin_activity_logs`.
- Founder Dashboard chặn chọn Thiên Khải Sáng Thế khi người nhận không phải hồ sơ Founder và
  hiện nhãn “Chỉ hồ sơ Founder”.

### Sửa lỗi

- `titles.grant` không còn chặn mọi danh hiệu `founder_only` với học sinh thường: chỉ danh hiệu
  “Nhà Sáng Lập” giữ giới hạn hồ sơ Founder, các danh hiệu Founder khác vẫn yêu cầu sở hữu
  badge nguồn trước khi dùng.

### Cải tiến

- Gỡ secret `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` khỏi Supabase sau khi passkey đã bị loại bỏ hoàn toàn.
- Nâng toàn bộ website lên 7.9.0 (122 tệp HTML, `bk-version.js`, dashboard, chat, Edge Function).

## [7.8.0] — 2026-11-19

### Tính năng

- **Mật mã đăng nhập thay hoàn toàn passkey.** Mỗi học sinh có thể đặt mật mã 4–32 ký tự trong
  **Cài đặt → Hồ sơ → Mật mã đăng nhập**. Khi bấm đúng họ tên và xác nhận, nếu hồ sơ đã gắn mật
  mã thì màn hình nhận diện hiện thêm **một khung nhập mật mã**; nhập đúng rồi bấm “Mở khoá”
  mới vào được Bá Khí. Mật mã lưu dạng băm PBKDF2-SHA256 (salt riêng, 120.000 vòng) trên máy
  chủ, không lưu mật mã thô, nên dùng được trên điện thoại, máy tính và mọi trình duyệt —
  khắc phục việc passkey trình duyệt chỉ dùng được trên máy đã tạo credential.
- Đổi hoặc gỡ mật mã phải nhập đúng mật mã hiện tại; có nút **Hiện/Ẩn** khi nhập và thông báo
  số lần thử còn lại.

### Sửa lỗi

- Sai mật mã 5 lần liên tiếp sẽ tạm khoá 10 phút (`student_login_codes.failed_count`/
  `locked_until`), thêm giới hạn 30 lượt/10 phút mỗi thiết bị để chống dò mật mã.
- Hồ sơ có mật mã không còn bị gắn thiết bị trước khi xác thực: `bind-student-session` chỉ trả
  `code_required`, không upsert `student_devices`.

### Cải tiến

- Gỡ toàn bộ mã và dữ liệu passkey: xoá Edge Function `passkey-api`, `_shared/passkeys.ts`,
  `student_passkeys`, `passkey_challenges`; secret `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` không còn
  dùng. Migration `20261204000000_bakhi_v780_login_code.sql` chỉ bổ sung bảng mới và idempotent.
- `student-profile` thêm `code`, `code.set`, `code.remove`; `bk-cloud.js` bỏ API passkey, thêm
  `loginCodeStatus`/`loginCodeSet`/`loginCodeRemove`; kiểm thử `cloud-smoke`/`shell-smoke` cập
  nhật theo luồng mật mã.

## [7.7.1] — 2026-11-18

### Sửa lỗi

- **Đổi khung avatar không còn nhân bản khối “Danh hiệu”**: mỗi lần bấm một khung trong
  **Hồ sơ / Cài đặt → Khung avatar**, giao diện thay nhầm ô lưới khung bằng cả một cụm mới, nên
  cụm cũ nằm lại và cứ mỗi lần đổi khung lại lồng thêm một cụm — khối “Danh hiệu” vì thế xuất
  hiện nhiều lần và lặp liên tục. Nay chỉ một cụm `.bk-frames-wrap` tồn tại, được thay trọn gói
  mỗi lần đổi khung.
- Không còn lưới khung lồng nhau sau nhiều lần đổi khung; vị trí và số khung giữ nguyên.

### Cải tiến

- Thêm `tools/qa/version-audit.js` để kiểm tra “nâng cấp toàn bộ”: mọi tài nguyên nội bộ của
  123 trang đều tồn tại, mọi `?v=` trùng `APP_VERSION`, không còn phiên bản cũ trong HTML/JS,
  không trang nào nạp trùng mô-đun, và 5 trang dùng Danh hiệu nạp `bk-titles.js/css` đúng một lần.
- `shell-smoke` thêm 6 kiểm tra hồi quy cho lỗi nhân bản khối Danh hiệu khi đổi khung.

## [7.7.0] — 2026-11-18

### Sửa lỗi

- **Cấp trọn bộ badge hoạt động thật**: RPC `bakhi_grant_badges` báo lỗi
  `42702 column reference "badge_id" is ambiguous` (OUT parameter trùng tên cột), nên mọi lần
  “Cấp toàn bộ badge” và “Cấp trọn bộ cho hồ sơ Founder” đều thất bại ở máy chủ. Migration
  `20261203000001_bakhi_v770_grant_badges_fix.sql` thêm `#variable_conflict use_column`.
- **Một hợp đồng phản hồi trao tặng duy nhất**: `badges.grantAll`, `founder.grantAll`,
  `founder.grantItem`, `avatar.grant`, `badges.grant` đều trả `success`, `status`,
  `requested_count`, `granted_count`, `already_owned_count`, `failed_count`, `granted_badges`,
  `errors`, `message`. Không còn cảnh giao diện đoán số lượng hay in “undefined badge”.
  Phản hồi không rõ kết quả thì giao diện chuyển sang **“Cần đối soát giao dịch”** và không tự
  gửi lại.
- **Chống trao trùng và chạy lặp**: cùng `request_id` được máy chủ nhận diện (`replayGrant`) và
  trả lại kết quả cũ, không cấp thêm, không ghi lịch sử hai lần; nút gửi bị khoá khi đang chạy.
- **Hai lỗi `titles.*` / `titles.save`**: Edge Function `admin-actions` đang deploy là bản cũ
  (v19) không có namespace `titles.*` — đã deploy bản 7.7.0 và xác minh trực tiếp trên máy chủ
  thật (tạo, cập nhật, trao, gỡ, ngừng dùng, bổ sung danh hiệu mặc định).
- **Lỗi máy chủ không còn `[object Object]`**: nhánh lỗi chung đọc `message`/`code`/`details`
  của PostgrestError để chẩn đoán được.

### Tính năng mới

- **Founder Dashboard chia 3 tab**: **Thành tích** (tồn kho, trao một/nhiều vật phẩm, cấp hàng
  loạt, tự động xét badge, cấp trọn bộ, lịch sử), **Danh hiệu** (danh mục Title, trao/gỡ, người
  giữ, bổ sung danh hiệu mặc định) và **Founder** (chỉ còn xác minh hồ sơ Founder + đặt danh vị).
- **Trao nhiều vật phẩm cùng lúc**: chọn nhiều badge/khung trong lưới, xác nhận một lần, báo cáo
  riêng số cấp mới / đã sở hữu / lỗi.
- **Danh hiệu hai kiểu hiển thị**: Bình thường (font thường, màu tĩnh) và Đặc biệt (font riêng +
  gradient chuyển động: flow, shimmer, pulse, aurora), có bảng màu cấu hình và xem trước.
- **35 danh hiệu mặc định ánh xạ từ badge**: 10 badge tự động tiêu biểu (kiểu Bình thường) +
  21 Founder + 2 Developer + 2 Administrator (kiểu Đặc biệt). Mỗi danh hiệu giữ `badge_id`
  nguồn để xác minh quyền sở hữu; không tạo danh sách dữ liệu trùng lặp.
- **Học sinh tự chọn danh hiệu**: khối “Danh hiệu” trong Hồ sơ/Cài đặt liệt kê đúng danh hiệu
  mình sở hữu (badge nguồn hoặc được trao tay), cho trang bị, đổi và gỡ.
- **Mô-đun dùng chung `bk-titles.js` / `bk-titles.css`**: một cách vẽ nhãn danh hiệu cho Chat,
  Hồ sơ, Cài đặt và Dashboard; hiệu ứng tắt khi `prefers-reduced-motion` hoặc khi người dùng tắt
  animate khung.
- Action chẩn đoán `version` trong `admin-actions` để dashboard hiển thị đúng phiên bản máy chủ.

### Cải tiến

- Migration `20261203000000_bakhi_v770_titles_rework.sql`: thêm cột `badge_id`, `style`, `font`,
  `palette`, `effect`, `created_by`, `updated_by` (chỉ thêm, idempotent), bảng
  `bakhi_title_grants`, hàm `bakhi_title_eligible()` và seed 35 danh hiệu mặc định.
- `chat-api` trả kèm `style`, `font`, `palette`, `effect` trong `title` của mọi profile card.
- `student-profile` thêm action `titles` (đọc danh hiệu khả dụng) và `title` (trang bị/gỡ), kiểm
  tra quyền sử dụng ở máy chủ, không tin dữ liệu phân quyền từ client.

## [7.6.1] — 2026-11-18

### Sửa lỗi

- **Founder Dashboard không còn trao “undefined badge”**: báo cáo cấp badge hàng loạt và cấp
  trọn bộ đọc số lượng qua hàm chuẩn hoá, nên khi máy chủ trả thiếu trường (bản cũ hoặc chỉ trả
  `{ ok, count }`) giao diện hiện đúng số badge đã cấp, số đã sở hữu và số badge độc quyền bị
  loại trừ thay vì `undefined`; nếu phản hồi không có số nào thì hiện thông báo rõ ràng để đối
  chiếu lại tồn kho.
- **Bản xem trước và hộp xác nhận cấp hàng loạt** luôn có số badge hợp lệ (0 khi thiếu dữ liệu),
  không còn “Dự kiến cấp undefined badge”.
- **Số khung avatar ở khu “Cấp trọn bộ cho hồ sơ Founder”** đếm từ ánh xạ badge → khung khi
  trang Founder không nạp `bk-profile.js`, thay vì báo 0 khung.
- **Dòng tồn kho vật phẩm** hiện `x / 99 badge` ngay cả khi phản hồi thiếu `catalogTotal` hoặc
  danh sách khung.

## [7.6.0] — 2026-11-17

### Tính năng mới

- **Hệ thống Danh hiệu (Title)**: lớp hoàn toàn mới, **độc lập với badge, khung avatar và
  thành tích**. Mỗi học sinh giữ tối đa một danh hiệu, do Founder trao tay; danh hiệu không
  tự mở khoá và không ảnh hưởng tới badge đang có.
- **Danh hiệu hiển thị TRƯỚC tên trong chat** ở mọi vị trí: bong bóng tin nhắn, đầu hội thoại,
  danh sách đoạn chat (nhắn riêng), danh sách chọn người nhận, thẻ hồ sơ và dòng “Hồ sơ của bạn”.
  Nhãn có màu + icon riêng và cập nhật realtime khi Founder trao hoặc thu hồi.
- **Founder Dashboard → Danh hiệu**: trao/thu hồi danh hiệu cho từng học sinh, xem số người giữ,
  thêm/sửa danh hiệu (mã, tên, nhãn ngắn, màu, icon, mô tả, thứ tự, chỉ-Founder) và ngừng dùng.
- **12 danh hiệu khởi đầu**: Nhà Sáng Lập, Quản Trị Viên, Kỹ Sư Hệ Thống, Học Giả, Nhà Thám Hiểm,
  Tiên Phong, Chiến Lược Gia, Nghệ Nhân, Người Dẫn Đường, Người Giữ Lửa, Mầm Xanh, Ngôi Sao Bá Khí.

### Cải tiến

- `chat-api` trả `title` trong **mọi** profile card (`profiles.cards`, `students.search`,
  thành viên phòng, người gửi tin) nên chat hiển thị danh hiệu mà không cần thêm request.
- Migration `20261202000000_bakhi_v760_titles.sql`: bảng `bakhi_titles` (danh mục) và
  `student_titles` (danh hiệu hiện tại), RLS chỉ cho đọc, realtime cho cả hai bảng, seed 12
  danh hiệu — chạy lại nhiều lần vẫn an toàn và không ghi đè danh hiệu Founder đã sửa.
- Founder Dashboard báo rõ khi máy chủ chưa có action `titles.*` thay vì lỗi thô.

## [7.5.3] — 2026-11-17

### Tính năng mới

- **Đủ 21 khung avatar Founder cho 21 badge Founder**: thêm 4 khung độc quyền mới —
  Khởi Nguyên (`founder-genesis`), Liên Kết (`founder-nexus`), Mã Nguồn Gốc
  (`founder-prime-code`), Di Sản (`founder-legacy`) — nên mỗi badge Founder (Genesis → Ascendant)
  mở khoá đúng một khung riêng. Tổng **50 khung**: 27 thường + 2 Developer + 21 Founder.
- **Mỗi khung Founder có mô tả và cách lấy** trong hộp chi tiết khung (ví dụ “Cách lấy: mở khoá
  badge ‘Genesis’ — badge Founder độc quyền, chỉ Founder trao tay”).
- **Vẽ lại 7 khung Founder cũ bằng bộ hình tượng riêng**: Thiên Khải, Vô Cực Hoàng Đế, Thiên Long,
  Vàng Nguyên Tắc, Lòng Nõn, Tinh Thần Tinh Thạch, Sen Neon — thay cho việc ghép primitive
  dùng chung. Mọi khung Founder nay có `art` riêng (21 bộ vẽ).
- **Lớp hoàn thiện dùng chung cho mọi khung**: viền trong, ánh phản chiếu chéo và quầng sáng
  ngoài, giúp cả 50 khung (kể cả khung thường) trông sâu và sạch hơn.

### Sửa lỗi

- **“Hành động không hợp lệ: students.search” và “admin.items.list”**: nguyên nhân là Edge
  Function `admin-actions` trên máy chủ còn bản cũ, chưa có các action 7.5.x. Founder Dashboard
  nay tự lùi về action tương thích (`students.list`, `badges.list`, `badges.grant`) và dựng danh
  mục vật phẩm cục bộ từ `bk-badges.js`, nên tìm người nhận, chọn vật phẩm, đọc tồn kho và
  trao tặng vẫn dùng được ngay; bản xem trước “trao toàn bộ badge” cũng tính cục bộ.
- **Lỗi tương tự ở các action mới khác**: `students.inventory`, `founder.grantItem`,
  `badges.grantAllPreview` có fallback; `admin.grantHistory` báo rõ cần deploy thay vì lỗi thô.
- Migration `20261201000000_bakhi_v753_founder_frames.sql` thêm 4 ánh xạ badge → khung mới
  (idempotent), không đổi id khung cũ nên không ai mất quyền sở hữu.

## [7.5.2] — 2026-11-17

### Sửa lỗi

- **Cơ cấu badge thống nhất toàn website — 99 badge = 74 tự động + 21 Founder + 2 Developer
  + 2 Administrator**: thêm `BK.badges.breakdown()` và `BK.badges.summaryText()` suy ra trực tiếp
  từ danh mục, nên mọi nơi hiển thị cùng một con số. Hết cảnh 89/78 badge ở trang hồ sơ,
  Cài đặt và dashboard.
- **Thông báo tặng badge ở tab Badge và tab Founder**: bản xem trước, hộp kết quả và toast đều
  nêu rõ danh mục (74 tự động · 21 Founder · 2 Developer · 2 Administrator) và số badge bị loại
  trừ (21 Founder + 2 Developer); không còn hiện `undefined` khi cấp trọn bộ.
- **Máy chủ trả kèm cơ cấu danh mục** trong `founder.grantAll`, `badges.grantAll`,
  `badges.grantAllPreview` và `students.inventory` (`catalog: { total, auto, founder, dev, admin }`)
  để giao diện không phải tự đếm và không lệch với `bk-badges.js`.
- **Founder Dashboard (tab Thành tích)**: bảng số liệu tách đủ 5 ô — Tổng 99, Tự động 74,
  Founder 21, Developer 2, Administrator 2 — tính trên toàn danh mục, kể cả khi Administrator
  chỉ trao được badge thường.
- **Giữ nguyên các fix đã có ở 7.5.1**: `students.search` đọc avatar từ `student_profiles`,
  `admin.grantHistory` bỏ kiểu nhúng `students:target_student` + fallback schema 7.4.0,
  kiểm tra UUID cho `id` (chuỗi "undefined" không còn gây lỗi 22P02) và ghi lịch sử cấp
  không còn nuốt lỗi.

## [7.5.1] — 2026-11-17

### Sửa lỗi

- **`students.search` luôn lỗi**: câu truy vấn chọn `avatar_url` từ `public.students` — cột này
  nằm ở `student_profiles`, nên PostgREST trả 42703 và Founder Dashboard không tìm được người
  nhận. Nay tách thành hai bước: tìm hồ sơ, rồi đọc avatar từ `student_profiles`.
- **Danh mục badge chỉ còn 89 trên toàn website**: mọi trang vẫn nạp `bk-badges.js?v=7.1.0`
  (bản 89 badge) nên trình duyệt dùng bản cache cũ. Đồng bộ toàn bộ chuỗi phiên bản tài sản
  lên `7.5.1` ở 122 tệp HTML/JS; khôi phục đủ **99 badge** (74 tự động + 25 trao tay).
- **Founder/Administrator Dashboard ghi cứng "89 badge"**: nay lấy `catalog.length` từ danh mục,
  không còn số viết tay lệch với `bk-badges.js`.
- **`admin.grantHistory` hỏng khi đọc lịch sử cấp**: bỏ kiểu nhúng `students:target_student(...)`
  (chỉ cần FK/policy khác là PostgREST trả PGRST200 và mất cả bảng), tra tên người nhận bằng
  truy vấn thứ hai; nếu cơ sở dữ liệu chưa chạy migration 7.5.0 thì đọc lại theo cột của 7.4.0.
- **Ghi lịch sử cấp thất bại âm thầm**: `admin_grant_history`/`admin_grant_batches` không còn
  nuốt lỗi; khi thiếu cột/bảng mới, lịch sử được ghi theo đúng các cột 7.4.0 để không mất dấu vết.
- **Cấp toàn bộ badge cho "undefined"**: mọi action nhận `id` nay kiểm tra UUID (chuỗi "undefined"
  không còn được gửi vào `.eq('id', …)` và gây lỗi 22P02), `founder.grantAll` coi id không hợp lệ
  là "để máy chủ tự xác định hồ sơ Founder", và thông báo trên giao diện lấy đúng trường
  `added`/`badgeTotal`/`studentName` thay vì hiện `undefined`.

### Cải tiến

- Sau khi cấp trọn bộ ở Cài đặt, danh sách badge hiển thị được đồng bộ lại từ `students.inventory`.

## [7.5.0] — 2026-11-17

### Tính năng mới

- **10 Founder Badge 7.5.0 có hình tượng riêng**: Genesis, Architect, Eternal Flame, Nexus,
  Celestial, Chronos, Void Sentinel, Prime Code, Legacy, Ascendant. Mỗi badge có SVG nhiều lớp,
  bảng màu và silhouette riêng (`BK.badges.art`), hiển thị cả trong lưới thành tích và
  hộp xem chi tiết. Tổng danh mục: **99 badge** (74 tự động + 25 trao tay).
- **6 khung Founder concept mới**: Thiên Văn Đài, Vực Thẳm, Phượng Hoàng Tái Sinh,
  Pha Lê Đế Vương, Cỗ Máy Thời Gian, Băng Đế — mỗi khung có bộ vẽ bespoke thay vì
  ghép primitive dùng chung. Tổng **46 khung** (27 thường + 2 Developer + 17 Founder).
- **Bộ chọn người nhận dùng chung** cho mọi thao tác trao: debounce 280 ms, trạng thái
  loading/empty/error, avatar + tên + mã phân biệt + nhãn Founder, bỏ chọn và đổi người nhận.
- **Bộ chọn vật phẩm thống nhất** với 4 nhóm (Badge / Founder Badge / Khung / Khung Founder),
  lọc theo tên hoặc mã, tuỳ chọn "chỉ món chưa sở hữu", xem trước lớn, nhãn trạng thái sở hữu.
- **Hộp xác nhận trước mọi thao tác ghi** (người nhận, loại, vật phẩm, hiện trạng, lý do) và
  khoá nút khi đang gửi; mỗi yêu cầu có `request_id`.
- **Báo cáo tự động xét badge đầy đủ**: mới cấp / đã sở hữu / chưa đủ điều kiện / bị loại trừ kèm lý do.
- **Lịch sử cấp vật phẩm thật**: bảng `admin_grant_history` + `admin_grant_batches`, lọc theo
  người nhận, có nút tải thêm.

### Tính năng được tái cấu trúc

- **Founder Dashboard tách mô-đun** `assets/bakhi/bk-founder.js` (tìm người nhận, bộ chọn vật phẩm,
  dịch vụ trao, báo cáo, lịch sử). `renderFounder` trong `bk-devboard.js` còn 15 dòng ủy quyền,
  xoá ba khối tìm kiếm trùng nhau và các listener gắn lặp.
- **Ánh xạ badge → khung chuyển sang bảng** `bakhi_badge_frames`; `bakhi_owned_frames` không còn
  CASE 39 nhánh viết cứng.
- **Danh mục badge phía máy chủ sinh tự động** vào `admin-actions` (khối `generated:badge-catalog`)
  từ `bk-badges.js`, hết lệch giữa client và Edge Function.
- **Quy tắc độc quyền suy ra từ danh mục** (`exclusive`), không còn danh sách 13 mã viết cứng.

### Sửa lỗi

- **Xem trước "trao toàn bộ badge" đã cấp badge thật**: 7.4.0 dùng chung `badges.grantAll` cho cả
  xem trước; nay tách `badges.grantAllPreview` chỉ đọc.
- **Trao khung ghi đè khung đang trang bị**: 7.4.0 ghi thẳng `student_profiles.frame`. Nay trao khung
  = trao badge sở hữu khung; khung đang dùng không bị đổi.
- **Lịch sử cấp chưa từng được ghi**: 7.4.0 chỉ đọc `admin_grant_history` mà không insert.
- **Nhận badge id lạ**: `founder.grantItem` chỉ kiểm tra định dạng mã; nay bắt buộc có trong danh mục.
- **Trao đè quyền sở hữu cũ**: upsert `ignoreDuplicates: false` ghi đè `awarded_at/awarded_by/reason`;
  nay dùng `on conflict do nothing`.
- **Tab "Founder Badge/Founder Khung" hiện toàn bộ danh mục** và danh sách chỉ có id, không tên/mô tả.
- **Tự động cấp badge chạy ngay khi chọn tài khoản**; nay phải bấm chạy và có báo cáo trước/sau.
- **`student_roles` ghi sai cột/khoá** (`assigned_by`, `onConflict student_id,role_key` trong khi
  khoá chính là `student_id`).

### Thay đổi cơ sở dữ liệu

- Migration `20261130000000_bakhi_v750_founder_rework.sql` (idempotent, tương thích ngược):
  `admin_grant_history.request_id/badge_id` + unique index chống trùng; bảng `admin_grant_batches`;
  bảng `bakhi_badge_frames` (54 ánh xạ); RPC `bakhi_grant_badges(uuid, text[], text, text)` cấp
  nguyên tử theo lô; chỉ mục tìm kiếm; seed 99 badge cho hồ sơ `is_founder = true`.
- `bakhi_owned_frames` viết lại theo bảng ánh xạ; giữ nguyên chữ ký và quyền gọi.

### Cải tiến bảo mật

- **Đóng rò rỉ lịch sử cấp**: 7.4.0 cấp `select` cho `anon/authenticated` trên `admin_grant_history`
  (ai cũng đọc được); nay thu hồi, chỉ `service_role`.
- RPC cấp badge chỉ `service_role` được execute; client không gọi trực tiếp được.
- `students.inventory`, `admin.items.list`, `founder.grantItem`, `avatar.grant` kiểm tra scope
  Founder ở máy chủ; badge Founder bắt buộc hồ sơ `is_founder = true`.
- Tìm kiếm người nhận chỉ trả học sinh đang hoạt động, tối đa 20 dòng, không trả dữ liệu nhạy cảm.

### Cải tiến hiệu năng

- Tìm kiếm có debounce + sequence token (bỏ kết quả cũ), không tải cả bảng học sinh.
- Danh mục vật phẩm tải một lần theo nhóm, lọc phía client; không N+1 khi chọn người nhận.
- Cấp hàng loạt dùng một câu lệnh insert cho mỗi 100 badge thay vì vòng upsert từng badge.

### Giới hạn đã biết

- Chưa chạy E2E trên Supabase production: migration và Edge Function cần được deploy thủ công.
- Hình tượng badge/khung là SVG dựng bằng mã (không dùng tệp PNG), đã kiểm tra bằng jsdom nhưng
  chưa được duyệt thị giác trên thiết bị thật.
- `admin.items.list` trả tối đa toàn bộ danh mục (99 badge / 46 khung); nếu danh mục tăng rất lớn
  cần phân trang phía máy chủ.

## [7.4.0] — 2026-11-17

### Tính năng

- **Founder Dashboard: tìm người nhận trực quan** — nhập một phần tên để tìm học sinh, hiển thị avatar/tên hiển thị/username trong kết quả gợi ý, tự động xác định User ID nội bộ. Không yêu cầu nhập UUID thủ công.
- **Founder Dashboard: trao badge và khung avatar** — bộ chọn loại vật phẩm (Badge, Khung avatar, Badge Founder, Khung Founder), danh sách tải tự động từ danh mục, xem trước trước khi xác nhận, hỗ trợ trạng thái thành công/thất bại/đã sở hữu/không đủ quyền.
- **Founder Dashboard: cấp trọn bộ 89 badge + toàn bộ khung** cho hồ sơ Founder Minh Trúc (is_founder = true), idempotent, ghi vào `admin_grant_history`.
- **Founder Dashboard: trao toàn bộ badge đồng bộ** — Trao tất cả badge có thể tặng cho một học sinh, tự động loại trừ 13 badge độc quyền (founder + 10 founder-* + 2 dev-exclusive).
- **Founder Dashboard: tự động cấp badge đạt được** — Kiểm tra điều kiện thành tích, chỉ cấp badge đủ điều kiện, loại trừ badge chỉ nhận qua trao tặng, báo cáo chi tiết (mới cấp / đã sở hữu / chưa đủ điều kiện / bị loại trừ).
- **Lịch sử cấp vật phẩm** — bảng `admin_grant_history` ghi nhận người trao, người nhận, vật phẩm, thời gian, lý do; xem được trong Founder Dashboard.
- **Backend: action `avatar.grant`, `founder.grantItem`, `admin.grantHistory`, `admin.items.list`, `students.search`** trong `admin-actions`; kiểm tra quyền Founder ở máy chủ trước mọi thao tác.
- **Backend: `founder.grantAll` cấp 89 badge** (bao gồm `ke-suu-tam` + 10 founder-badge mới), không còn giới hạn ở 78.

### Cải tiến

- Sửa lỗi `renderFounder`: `el` và `cloud` chưa định dạng gây ReferenceError.
- Sửa `isExclusiveBadge` nhận diện đúng 11 badge Founder-exclusive (`founder-*`).
- Số khung avatar hiển thị động thay vì cứng 30.
- `ALL_BADGE_IDS` bổ sung `ke-suu-tam` và 10 badge founder-*.

### Sửa lỗi

- `gen-badge-catalog.js` và `badge-catalog.ts` bổ sung trường `exclusive` để máy chủ phân biệt badge Founder/Dev/Admin.
- Migration `20261129000000_bakhi_v740_founder_badge_frame.sql`: bảng `admin_grant_history`, hỗ trợ ghi khung avatar vào `student_profiles.frame`.

## [7.3.0] — 2026-11-17

### Cải tiến

- **Vai trò học sinh mới**: Hứa Viết Minh Trúc chỉ còn 'Người sáng lập'; Trần Văn Bách, Võ Mai Phương, Trương Lê Bảo Hân là 'Lớp Phó'; Phấn, Trâm, Trần Lê Gia Huy, Khoa là 'Tổ Trưởng'.
- **10 khung Founder-exclusive mới**: Âm Dương Thái Cực (yin-yang), Sát Thủ Tương Lai (cyberpunk), Cổ Khí Thần Ấn, Bushido (samurai), Vô Cực Hoàng Đế, Thiên Long, Vàng Nguyên Tắc, Lòng Nôc, Tinh Thần Tinh Thạch, Sen Neon — mỗi khung có SVG multi-layer và animation riêng.
- **10 badge Founder-exclusive mới** kèm theo từng khung founder, chỉ Founder được trao tay.
- **Tab Trang trí Avatar chuyển vào Founder Dashboard**:功 năng trao khung avatar và badge kèm được dời từ trang Cài đặt vào Founder Dashboard (chỉ Founder).
- **Badge 'Kẻ sưu tầm' mới**: thu thập toàn bộ 75 badge (ngoại trừ 11 Founder + 2 Developer), tổng danh mục tăng lên 89 badge (74 tự động + 15 Administrator/độc quyền).
- **Đồng bộ số lượng thành tựu**: số huy hiệu hiển thị tự động từ danh mục badge trên Cài đặt, Hồ sơ, Founder Dashboard và Trung tâm học tập.

## [7.1.3] — 2026-11-17

### Sửa lỗi

- **Chat: chấm chưa đọc vẫn hiện sau F5 reload**: trong `openRoom`, tính toán `unread` từ dữ liệu local (`S.messages` so với `last_read_at` của chính mình) ngay sau khi `messages.list` trả về, trước khi gọi `markRead`; UI phản ánh ngay lập tức không cần đợi API `read.mark` hoàn tất.

## [7.1.2] — 2026-11-17

### Sửa lỗi

- **Chat: tái cấu trúc Read Receipt**: viết lại `markRead` thành `markReadThrough` với génération token, idempotent và retry tối đa 3 lần; thêm `IntersectionObserver` theo dõi tin nhắn hiển thị trong viewport; debounce 300ms khi cuộn qua `scheduleReadThrough`; dọn dẹp tracker khi chuyển phòng qua `teardownReadTracking`; realtime `chat_members` bỏ qua sự kiện cũ hơn mốc đã biết (tránh ghi đè trạng thái mới hơn); realtime `chat_messages` INSERT dùng `scheduleReadThrough` thay vì đánh dấu ngay.

## [7.1.1] — 2026-11-17

### Tính năng

- **Chat: bảng chọn cảm xúc 12 biểu tượng**: bấm biểu tượng mặt cười bên cạnh tin nhắn để mở bảng chọn, thả/bỏ cảm xúc ngay trên tin, hiển thị danh sách người đã thả (tối đa 4 tên + dấu …), chip của bạn tô màu xanh. Chọn lại biểu tượng của mình = bỏ cảm xúc.
- **Chat: đánh dấu đã đọc chỉ biểu tượng**: nút ở đầu hội thoại chỉ giữ icon ✓✓, không có dòng chữ; chuyển màu xanh khi không còn tin chưa đọc.

### Cải tiến

- **Chat: không hiển thị số tin nhắn chưa đọc**: danh sách phòng chỉ hiện chấm màu, không hiện con số; tiêu đề trang không gắn số đếm.
- **Chat: lưu đã đọc theo từng học sinh**: mốc `last_read_at` lưu trong `chat_members` cho mỗi thành viên, nhãn ✓/✓✓ của tin bạn gửi cập nhật ngay khi người khác đọc (realtime) và khi bấm nút đánh dấu đã đọc.
- **Chat: đồng bộ trạng thái chưa đọc toàn trang**: tổng số chưa đọc đẩy sang lớp Cloud (menu tài khoản) qua `setChatUnread`.

## [7.1.0] — 2026-11-17

### Tính năng

- **Trình phát nhạc theo tệp trở lại**: 5 bài gốc trong `music/` phát bằng
  `HTMLAudioElement`, kèm Queue, shuffle, repeat, lời bài hát và cửa sổ nổi như
  trước. Mọi tệp `.mp3` mới bỏ vào `music/` được `tools/music-scan.js` ghi vào
  `music/library.json`; trình phát tự nạp thêm khi mở trang, không cần sửa mã
  hay build. Bài đã xoá khỏi Queue không tự quay lại.
- **Chat: hồ sơ đầy đủ và sửa biệt danh**: thẻ hồ sơ hiện ảnh bìa, khung avatar,
  giới thiệu, liên kết và danh vị lớp (lớp trưởng, bí thư…). Bấm tên hoặc avatar
  ở đầu cuộc nhắn riêng để mở hồ sơ; hàng “Hồ sơ của bạn” ở chân danh sách mở
  hồ sơ của chính mình và cho sửa biệt danh ngay trong Chat.
- **Đánh dấu đã đọc kiểu biểu tượng**: tin của bạn hiện ✓ khi đã gửi và ✓✓ khi
  người nhận đã đọc, không còn nhãn chữ; tin của người khác không hiện dấu thừa.

### Cải tiến

- **Bảo trì khóa toàn website**: khi Founder bật bảo trì, mọi trang hiện màn hình
  chờ có biểu tượng tải, chặn cuộn, chạm, bàn phím và liên kết; chỉ `/admin/`,
  `/founder/`, Administrator Code và thao tác tải lại trang được giữ.
- **Menu 3 chấm trong Chat gọn hơn**: đúng hai nút biểu tượng có nhãn **Ghim** và
  **Lưu trữ**, mở thành popup nhỏ ngay dưới nút thay vì hộp thoại lớn.
- **Đọc tin chính xác hơn**: chỉ đánh dấu đã đọc khi tab đang hiện, cửa sổ được
  chú ý và người dùng đang ở gần cuối khung; mốc gửi lên giữ nguyên độ chính xác
  microseconds và không gửi lặp cùng một mốc.
- **Tắt hiệu ứng viền avatar áp toàn site**: công tắc **Animate Avatar Borders**
  gắn lớp `bk-frames-still` lên `<html>` nên mọi khung — kể cả của người khác
  trong Chat — đứng yên ngay trên mọi trang.
- **Bỏ chấm đỏ trên avatar**: Chat chỉ còn số tin chưa đọc trong menu tài khoản.

### Sửa lỗi

- **Founder Dashboard không còn mang tên Administrator**: tên cũ lưu trong cơ sở
  dữ liệu được coi là “chưa đặt tên” khi mở bằng phiên Founder.
- **Phiên bản 7.1.0** áp dụng cho toàn bộ tệp HTML, `bk-version.js` và dashboard.

## [7.0.1] — 2026-11-17

### Sửa lỗi

- **Tab Bảo trì không còn lỗi `appendChild`**: ô “Đang bật bảo trì” được gắn
  đúng phần tử DOM; lưu cấu hình và tắt bảo trì đọc đúng trạng thái checkbox.
- **Chấm đỏ Chat sau khi đã đọc**: mốc đã đọc lưu nguyên độ chính xác từ
  PostgreSQL thay vì bị cắt về milliseconds; tin của chính mình không còn bị
  cộng vào số chưa đọc; số chưa đọc được đẩy ngay sang lớp Cloud để chấm đỏ
  trên avatar/menu biến mất tức thời sau khi đọc.
- **Thời gian changelog đúng UTC+7**: ngày trong `CHANGELOG.md` được hiểu là
  nửa đêm giờ Việt Nam ở cả bộ phân tích, Edge Function đồng bộ và giao diện;
  dữ liệu cũ được chuẩn hoá bằng migration.

### Tính năng

- **Đánh dấu đã đọc trong Chat**: nút “Đánh dấu đã đọc” ở đầu hội thoại, tự
  đánh dấu khi mở phòng, và nhãn “Đã gửi / Đã đọc” cho tin của bạn,
  “Bạn đã đọc / Chưa đọc” cho tin của người khác; cập nhật realtime khi thành
  viên khác đọc tin.
- **Music Player luôn có ô dán liên kết**: form thêm bài nằm ngay dưới khung
  phát, không còn ẩn trong tab Thư viện; nút “Thêm bài” mở trình phát và đưa
  con trỏ vào ô liên kết.

### Cải tiến

- **Founder Dashboard đúng tên**: phiên Founder mặc định hiển thị “Founder
  Dashboard”; Administrator vẫn là “Administrator Dashboard”. Tên tuỳ chỉnh
  trong Cấu hình vẫn được ưu tiên.
- **Phiên bản 7.0.1** áp dụng cho toàn bộ tệp HTML, `bk-version.js` và dashboard.

## [7.0.0] — 2026-11-17

### Tính năng

- **Chat đầy đủ hơn**: ghim và lưu trữ từng cuộc trò chuyện, bộ lọc “Đã lưu trữ”,
  ưu tiên phòng đã ghim, tìm người để nhắn riêng có trạng thái tải/trống/lỗi và
  thử lại. Bấm vào cảm xúc để xem ai đã thả; thả hoặc bỏ cảm xúc cập nhật ngay
  trên giao diện và tự hoàn tác nếu máy chủ báo lỗi.
- **Đã đọc do máy chủ quyết định**: mốc đã đọc lưu theo từng thành viên, không
  còn phụ thuộc đồng hồ thiết bị; chấm đỏ trên avatar đồng bộ giữa các trang và
  tự làm mới khi quay lại tab. Mọi mốc thời gian dùng múi giờ Việt Nam (UTC+7).
- **Khung avatar có chi tiết**: khung chưa mở vẫn bấm được để xem ảnh xem trước,
  độ hiếm, cách mở khoá và trạng thái sở hữu. Công tắc **Animate Avatar Borders**
  lưu theo tài khoản, đồng bộ khi đã nhận diện học sinh và tắt được hiệu ứng
  chuyển động của khung.
- **Bảo trì toàn website**: Founder bật/tắt bảo trì, nhập lý do và lưu cấu hình;
  trạng thái lan truyền realtime. Lịch sử ghi nhận thời điểm bắt đầu/kết thúc,
  người thực hiện, lý do, trạng thái và thời lượng, có tìm kiếm và lọc. Mỗi đợt
  bảo trì chỉ tạo một thông báo hoàn tất.
- **Màn hình bảo trì dùng chung** cho mọi trang, có nút “Thử lại”. Quản trị viên
  có thể vào bằng Administrator Code; máy chủ xác thực phiên, giới hạn tần suất
  và ghi nhật ký, không lộ mã trong trình duyệt.
- **Quản trị thành tích**: mở chi tiết từng badge (độ hiếm, phạm vi, cách đạt).
  Founder/Administrator có thể **Cấp thành tích tự động** cho hồ sơ đủ điều kiện
  và **Cấp toàn bộ badge** (trừ `founder` và mọi badge `dev-exclusive-*`), chống
  trùng, báo rõ số đã cấp/đã có/lỗi và ghi nhật ký.
- **Lời chào trang chủ**: “Chào buổi sáng/chiều/tối” kèm tên hiển thị theo giờ
  Việt Nam, cập nhật mỗi phút và không nhấp nháy khi hồ sơ tải xong.
- **Thư viện nhạc cá nhân**: mặc định trống, không còn bài hát đóng gói sẵn. Dán
  liên kết YouTube, Spotify hoặc SoundCloud chính thức để thêm bài; sửa tên,
  nghệ sĩ và lời bài hát của riêng bạn. Bìa được tạo từ chữ cái đầu, thư viện
  đồng bộ theo từng học sinh, vẫn giữ queue, shuffle, repeat và cửa sổ nổi.
- **Tên dashboard theo thương hiệu**: Founder chỉnh tên hiển thị của Administrator
  Dashboard; giá trị được lưu trên máy chủ và áp cho mọi phiên, không đổi đường dẫn `/admin/`.

### Sửa lỗi

- **Không còn nhấp nháy tên ở lời chào**: lời chào vẽ lại ngay khi sự kiện nhận
  diện phát ra, kể cả khi hồ sơ tải chậm hơn trang.
- **Mốc cập nhật tín hiệu ổn định**: `BK.signals.get()` giữ nguyên `updatedAt` đã
  lưu thay vì sinh mốc mới mỗi lần đọc, tránh sai lệch so sánh và kiểm thử.
- **Shuffle thật sự đổi bài**: khi bật shuffle, “Bài kế”/“Bài trước” chọn ngẫu
  nhiên bài khác trong queue thay vì chỉ đổi màu nút.
- **Biểu tượng cảm xúc rõ nghĩa**: bấm cảm xúc mở danh sách người đã thả và cho
  phép thả/bỏ ngay trong đó; không còn phụ thuộc một cú bấm mơ hồ.

### Cải tiến

- **Cơ sở dữ liệu 7.0**: migration `20261126000000_bakhi_platform_7.sql` bổ sung
  tuỳ chọn hội thoại, lịch sử bảo trì, tuỳ chọn hồ sơ, thương hiệu và thư viện
  nhạc. Mọi bảng người dùng bật RLS; realtime bật cho tuỳ chọn hội thoại và nhạc.
- **Ghi quyền qua Edge Function**: `admin-actions`, `chat-api`, `student-profile`
  xử lý bảo trì, thương hiệu, trao badge, ghim/lưu trữ và tuỳ chọn hồ sơ. Khoá
  service-role chỉ nằm ở máy chủ; trình duyệt không lưu mã quản trị.
- **Đồng bộ nhạc nhẹ nhàng**: thư viện đọc từ bộ nhớ cục bộ trước, sau đó đối
  chiếu `music_tracks` của chính học sinh; thao tác thêm/sửa/xoá không chặn giao
  diện khi mất mạng.
- **Phiên bản 7.0.0** áp dụng cho toàn bộ tệp HTML, `bk-version.js` và dashboard.

## [6.2.0] — 2026-11-17

### Tính năng

- **Trạng thái hoạt động trong chat**: chấm xanh trên avatar phòng nhắn riêng và
  dòng “Đang hoạt động / Hoạt động x phút trước” ở đầu cuộc trò chuyện. Máy chủ
  cập nhật `last_seen_at` mỗi lần chat gọi API; tab đang mở tự gửi nhịp mỗi phút
  và khi quay lại tab.
- **Passkey trong Cài đặt**: tab Hồ sơ có mục Passkey để thêm (tối đa 5) hoặc xoá
  passkey của thiết bị. Khoá riêng tư ở lại trên thiết bị; máy chủ chỉ lưu khoá
  công khai và bộ đếm chống phát lại.
- **Bắt buộc xác minh passkey sau khi đăng nhập bằng tên**: nếu hồ sơ đã có
  passkey, màn hình nhận diện giữ nguyên và yêu cầu vân tay, khuôn mặt hoặc mã
  khoá thiết bị trước khi gắn phiên. Huỷ hộp thoại sẽ không gắn thiết bị.

### Sửa lỗi

- **Đã đọc chính xác hơn**: máy khách gửi mốc thời gian của tin cuối cùng đã tải
  (`through`), máy chủ lưu mốc lớn hơn giữa lần đọc cũ và mốc mới. Tin đến trong
  lúc gọi API không còn bị đánh dấu đã đọc oan; tab ẩn không tự đánh dấu cho đến
  khi người dùng quay lại.

## [6.1.7] — 2026-11-16

### Sửa lỗi

- **Không còn tràn khung nhập**: toàn bộ lớp giao diện dùng `border-box`, nên ô
  Founder Code, Dev Code, mật khẩu và các nút rộng 100% nằm gọn trong thẻ thay vì
  cộng thêm padding/viền ra ngoài.
- **Đăng nhập toàn màn hình trên điện thoại**: thẻ đăng nhập Administrator/Founder
  chiếm trọn chiều rộng và chiều cao màn hình, có chừa vùng an toàn tai thỏ.
- **Nút Founder gọn lại**: nút xác thực không còn bị kéo giãn bằng ô nhập; trên
  điện thoại vẫn xếp dọc và rộng bằng khung.

### Cải tiến

- **Cài đặt theo thiết bị**: tab Cài đặt chuyển thành lưới 2 cột trên máy nhỏ,
  không còn bị cắt chữ ở mép phải; thẻ nội dung giảm padding trên màn hình hẹp.
- Sửa tràn ngang giúp trang không bị đẩy lệch, kéo theo các nút nổi như Music
  Player không còn bị cắt ở mép trái.

## [6.1.6] — 2026-11-16

### Cải tiến

- **Thả cảm xúc không còn icon mặt cười**: nút chữ “Thả cảm xúc” vẫn mở bảng cảm xúc
  và gọi `reactions.toggle` như cũ; khu vực gần thanh soạn tin không còn icon emoji.
- **Ô soạn tin gọn**: chỉ còn ô nhập chữ và nút gửi. Emoji gõ trực tiếp từ bàn phím
  vẫn được giữ nguyên trong nội dung tin nhắn.

## [6.1.5] — 2026-11-16

### Sửa lỗi

- **Hồ sơ rộng và thoáng hơn**: vùng nội dung tăng lên 1120px; avatar vẫn chồng
  nhẹ lên ảnh bìa nhưng tên, biệt danh và phần giới thiệu bắt đầu bên dưới banner,
  không còn đè chữ lên ảnh.
- **Biệt danh có chỗ riêng**: tên dài được xuống dòng gọn, biệt danh hiển thị dạng
  chip riêng cạnh tên và không bị ép tràn ra ngoài thẻ hồ sơ.

## [6.1.4] — 2026-11-16

### Sửa lỗi

- **Badge số tin Chat không tràn mép menu hồ sơ**: hàng menu dùng `border-box`,
  badge giới hạn chiều rộng và co đúng trong mọi bố cục.
- **Chấm đỏ avatar luôn nằm ở góc avatar**: chấm được đặt trong khung bọc riêng
  quanh ảnh, không phụ thuộc vị trí nút hay mũi tên trên từng trang.
- **Popup Administrator/Founder Dashboard có nền đục**: popup gắn vào `body` nay
  tự mang token màu sáng/tối thay vì kế thừa biến không tồn tại từ dashboard.

## [6.1.3] — 2026-11-16

### Cải tiến

- **Mở đoạn chat không tự bật bàn phím**: chạm vào phòng hoặc tin nhắn chỉ mở nội
  dung để xem; con trỏ không nhảy vào ô soạn tin. Bàn phím chỉ hiện khi người học
  chủ động chạm ô nhập, tránh che mất tin nhắn ngay khi vừa mở.

## [6.1.2] — 2026-11-16

### Sửa lỗi

- **Bàn phím ảo không còn đẩy cả trang Chat**: khung chat lấy chiều cao từ
  `visualViewport` và `interactive-widget=resizes-content`; trên mobile chỉ vùng
  tin nhắn cuộn, trang không bị đẩy lên khi focus ô soạn tin. Khi bàn phím đóng,
  chiều cao tự trở lại.
- **Dễ thấy tin nhắn mới**: mục Chat trong menu hồ sơ thu nhỏ có số tin chưa đọc,
  avatar có chấm đỏ; số này đồng bộ từ Chat và cập nhật qua realtime khi có tin mới.

### Cải tiến

- Ô soạn tin và header Chat giữ nguyên vị trí trong lúc bàn phím mở; giảm giật
  trang khi lướt tin nhắn cũ.

## [6.1.1] — 2026-11-16

### Sửa lỗi

- **Xoá tin nhắn Chat**: bảng `chat_messages` không còn chặn trạng thái xoá mềm
  (`body` rỗng, `image_path` null, `deleted_at` có giá trị). Migration
  `20261124000000_bakhi_chat_soft_delete.sql` sửa ràng buộc; API `messages.delete`
  đã trả `ok` và danh sách hiển thị “Tin nhắn đã được xoá”.
- **Nút Xoá trên điện thoại**: hàng thời gian/thao tác của tin nhắn của mình luôn
  hiện, không còn phụ thuộc hover; nút Xoá có màu đỏ và vùng chạm lớn hơn.
- **Đồng bộ tiến độ badge được trao**: badge trao tay hiện đúng tiến độ đầy đủ,
  không còn 0/goal; bản ghi trao từ máy chủ cập nhật cả khi badge đã có cục bộ.
  Khi đang kéo hồ sơ mà badge thay đổi, client hẹn đồng bộ lại thay vì bỏ sự kiện.
- **Thông báo đã đọc xuyên trang**: trạng thái đã đọc ở trang bài học được lưu
  local, hợp nhất và đẩy lên Supabase khi về trang chủ; mở thông báo ở trang đầy
  đủ cũng lưu local để trang bài học không hiện lại chưa đọc.

### Cải tiến

- **Tên badge và khung Hán-Việt**: đổi loạt tên sang hàm ý sâu hơn (Tri Thức
  Nhập Môn, Bá Khí Thiên Đồ, Thất Tinh Liên Châu, Thiên Khải Sáng Thế…), bỏ chữ
  “Developer” khỏi tên/khung độc quyền; khung dùng tên như Bồ Đề Sơ Diệp, Cửu
  Trùng Miện, Ngân Hà Tinh Đồ. Id badge/khung giữ nguyên để không mất dữ liệu.

## [6.1.0] — 2026-11-16

### Tính năng

- **Chat kiểu Messenger**: danh sách người trò chuyện là sidebar trái; chọn một người mở
  khung chat, icon trên header thu gọn/mở lại sidebar. Trên điện thoại, danh sách hiện
  trước, chọn người mới vào khung chat; icon đưa về danh sách. Bố cục dùng chiều cao
  `100dvh`, giảm thanh cuộn lồng nhau.
- **Chi tiết thành tích**: mọi badge đều bấm được để xem mô tả, độ hiếm, tiến độ, phần
  thưởng khung avatar và **cách lấy** — kể cả badge bí mật và badge quản trị.
- **Tên badge mới**: 78 badge được đặt lại tên gợi cảm hứng hơn, giữ nguyên id, điều kiện
  và khung thưởng để không mất dữ liệu đã mở.
- **Trung tâm học tập đồng bộ hơn**: thêm danh sách huy hiệu gần mở, tiến độ từng badge và
  gợi ý badge kế tiếp ngay trong tab Thành tích.

### Sửa lỗi

- **Avatar/bìa/biệt danh không sang thiết bị khác**: lần kéo hồ sơ đầu tiên không còn ghi đè
  bản local mới hơn. Nếu vừa đổi ảnh mà chưa kịp đẩy, bản local được đẩy lên trước; sau đó
  Supabase là nguồn chuẩn và timestamp hai bên được đồng bộ lại.
- **Giờ Hà Nội UTC+7**: ngày giờ thông báo, chat, nhật ký quản trị, hồ sơ và mốc ngày dùng
  `Asia/Ho_Chi_Minh`, không phụ thuộc múi giờ thiết bị.
- **Chỉ quản trị viên gửi thông báo**: bỏ toàn bộ nhãn “giáo viên” khỏi giao diện thông báo,
  nhận diện học sinh và tài liệu; thông báo chỉ đến từ Administrator/Founder.
- **Bớt thanh cuộn thừa**: menu tài khoản bỏ gutter luôn chiếm chỗ, thanh cuộn toàn site mảnh
  và trong suốt hơn; chat, hồ sơ và dashboard không còn khung cuộn lồng không cần thiết.

## [6.0.1] — 2026-11-16

### Sửa lỗi

- **Hồ sơ và avatar lấy Supabase làm nguồn chuẩn**: trang Hồ sơ và Cài đặt chạy đầy đủ
  chế độ đồng bộ thay vì chỉ thông báo. Lần đầu gắn học sinh luôn kéo hồ sơ/avatar từ
  `student_profiles`; bản localStorage cũ không còn đè lên máy chủ. Thay đổi mới được đẩy
  lên ngay, chỉ giữ local làm bộ đệm khi mất mạng.
- **Founder nhận đúng toàn bộ thành tích**: máy chủ tự tìm hồ sơ Founder theo cờ
  `is_founder` hoặc họ tên `Hứa Viết Minh Trúc` / `Minh Trúc` (chỉ khi khớp duy nhất),
  tự đánh dấu rồi cấp đủ 78 badge + 30 khung. Migration 6.0.1 cấp lại idempotent cho các
  project đã chạy migration 6.0.0.
- **Trao badge Founder và badge độc quyền**: `founder.grantAll` không còn lỗi khi cờ
  Founder chưa được đặt; badge Founder chỉ trao được cho đúng hồ sơ Founder đã xác minh,
  còn Administrator vẫn bị chặn.
- **Bố cục đăng nhập**: thẻ đăng nhập Administrator/Founder có khoảng cách field–nút–thông
  báo thống nhất, cuộn được trên màn hình thấp và không còn nút dính sát chữ.
- **Khoảng cách Cài đặt**: khung nhập mã/nút trong tab Quyền, khoảng cách tiêu đề, mô tả
  và các nút được nới hợp lý; nút đủ chiều cao chạm trên điện thoại.

## [6.0.0] — 2026-11-16

### Tính năng

- **Founder Dashboard**: khu vực toàn quyền tại `founder/` và tab **Founder** trong Cài đặt.
  Founder Code được xác thực ở Edge Function `admin-auth` bằng băm SHA-256 lưu trong bảng
  `founder_config`; mã gốc không nằm trong mã nguồn, localStorage hay chat. Phiên Founder
  có phạm vi riêng (`admin_sessions.scope = 'founder'`) và hạn 12 giờ.
- **Founder kế thừa toàn bộ Administrator Dashboard** (14 mô-đun) và mở thêm quyền tối mật:
  Bảo trì, Dữ liệu & sao lưu, đặt danh vị, trao **mọi** badge kể cả Founder/Developer.
  Administrator thường bị ẩn và bị máy chủ chặn các mục này.
- **Cấp trọn bộ thành tích**: nút trong Founder Dashboard trao đủ 78 badge và mở 30/30 khung
  cho hồ sơ `is_founder = true`; migration 6.0.0 cũng tự cấp trọn bộ cho hồ sơ Founder.
- **Khung avatar thế hệ mới**: cả 30 khung có vòng gradient, quỹ đạo xoay, hạt sáng, glow
  theo độ hiếm; khung Developer/Founder thêm quỹ đạo và vương miện chuyển động.
- **Đồng bộ tức thời**: realtime `student_badges` + sự kiện `storage`/`bk:identity` cập nhật
  badge, khung và Trung tâm học tập ngay khi trao/thu hồi hoặc đổi học sinh; bảo trì và
  What's New áp dụng ngay khi Founder/Administrator lưu.
- **Trung tâm học tập đếm đúng**: tab Thành tích hiển thị `đã mở/78` huy hiệu hồ sơ, tách
  khỏi 12 mốc học tập nội bộ.

### Sửa lỗi

- Menu hồ sơ thu nhỏ tự đóng khi cuộn trang (vẫn cuộn được bên trong menu), bố cục desktop
  và bottom-sheet mobile không còn tràn/che nội dung.
- Cài đặt Nhà phát triển: nút mở/Thoát Dev không còn đè lên dòng hướng dẫn; bố cục xuống
  hàng gọn trên màn hình hẹp.
- Thu hồi badge trao tay ở thiết bị khác được phản ánh đúng, không giữ badge cũ.

### Cải tiến

- **Chat chỉ gửi văn bản**: bỏ nút gửi ảnh, hộp chọn tệp và bảng emoji soạn tin; vẫn giữ
  cảm xúc cho tin nhắn và hiển thị ảnh cũ đã có.
- Migration `20261122000000_bakhi_founder_6.sql` thêm `founder_config`, `admin_sessions.scope`
  và seed toàn bộ badge/khung cho Founder; không xoá dữ liệu cũ.

## [5.0.0] — 2026-11-16

### Tính năng

- **30 khung avatar thật bằng SVG**: 27 khung thường, 2 khung Developer độc quyền và
  1 khung Founder. Mỗi khung có cấu trúc hoa văn riêng (vương miện, cánh, nguyệt quế,
  pha lê, cyber, gothic, hoả ngục, thiên hà…), phần trung tâm trong suốt để ảnh đại diện
  hiển thị bên dưới. Khung hiển thị nhất quán ở header, hồ sơ, Chat và Profile Card.
- **Danh mục thành tích mở rộng 78 badge**: 73 badge tự động + 2 badge Administrator +
  2 badge Developer (kèm khung Cực quang/Hư không) + 1 badge Founder.
- **Administrator trao mọi badge**: tab Thành tích có tìm kiếm, lọc theo độ hiếm, xem
  trước và trao bất kỳ badge nào trong danh mục. Badge tự động đạt và badge trao tay
  được lưu tách biệt (`auto_earned` / `manual_granted`); thu hồi trao tay không xoá
  kết quả tự động. Badge Founder chỉ trao được cho hồ sơ đã xác minh `is_founder`.
- **Bảo trì toàn website**: tab **Bảo trì** trong Administrator Dashboard (bật/tắt, tiêu
  đề, nội dung, lý do, thời gian bắt đầu/dự kiến mở lại, xem trước). Trạng thái lưu ở
  `app_settings.public.maintenance`; mọi trang public hiển thị trang bảo trì, Admin đã
  đăng nhập vẫn vào được Dashboard.
- **Danh vị học sinh**: bảng `student_roles` (khoá theo canonical student_id) và module
  dùng chung `bk-roles.js`. Hiển thị Lớp trưởng, Bí thư, Người sáng lập ở menu tài khoản,
  chip nhận diện, Chat và danh sách Admin. Danh vị chỉ là nhãn hiển thị, không cấp quyền.
- **What's New chỉ bản mới nhất**: hiển thị đúng một phiên bản, tối đa 10 dòng nội dung,
  có `Xem thêm` / `Thu gọn`; lịch sử cũ vẫn nằm trong trung tâm cập nhật.
- **Hồ sơ ẩn badge mặc định**: ban đầu chỉ hiện tổng quan và số badge; nút `Hiện badge` /
  `Ẩn badge` ghi nhớ lựa chọn theo từng tài khoản.
- **Chat**: bố cục tin nhắn tách hàng avatar/bong bóng/reaction (avatar không bị reaction
  kéo lệch); bảng emoji có tìm kiếm và danh mục; khung avatar SVG trong Chat; nhãn danh vị
  cạnh tên người gửi; bố cục mobile một khung với nút quay lại.
- **Đồng bộ đổi học sinh**: mỗi học sinh có kho thành tích cục bộ riêng; đổi học sinh phát
  sự kiện `bk:identity` để hồ sơ, bảng thành tích, Trung tâm học tập và menu cập nhật ngay
  không cần tải lại trang. Đổi học sinh không trộn dữ liệu hai tài khoản.
- **Administrator Code không tự chuyển trang**: xác thực xong chỉ báo thành công và hiện
  nút mở Dashboard trong tab mới (`target=_blank`, `rel="noopener noreferrer"`), giữ nguyên
  tab Cài đặt. Chat cũng mở tab mới từ menu tài khoản.

### Sửa lỗi

- Ô nhập Dev Code/Administrator Code không còn đè lên nút trên màn hình hẹp; layout dọc
  dưới 520px, thông báo xác thực có vị trí riêng.
- Không còn tràn ngang ở Chat mobile; khung chat dùng `100dvh` và safe-area cho thanh nhập.

### Cải tiến

- Migration `20261121000000_bakhi_platform_5.sql`: thêm `students.is_founder`,
  `student_badges.auto_earned/manual_granted`, bảng `student_roles`, mở rộng
  `bakhi_owned_frames` cho 30 khung, cấu trúc `public.maintenance` và realtime.
- `admin-actions` thêm `roles.list/roles.set`, trao/thu hồi badge theo cơ chế trao tay;
  `student-profile` chỉ tính lại badge tự động và giữ nguyên trao tay.
- QA cập nhật cho 78 badge, 30 khung, 14 tab quản trị và What's New một phiên bản.
- Cache-busting toàn website lên `5.0.0`.

## [3.9.0] — 2026-11-16

### Tính năng

- **Bá Khí Studio hợp nhất**: `/studio/` là một ứng dụng duy nhất với ba chế độ
  **Word**, **Paint** và **Chia đôi**; bản Studio rút gọn trước đây đã được gộp vào.
- **Nhập dữ liệu Studio cũ**: dự án lưu trong `lexend-studio-doc` được chuyển một lần
  thành tài liệu `<tên> (Studio cũ)` — giữ hộp văn bản, ảnh và hình vẽ (SVG) đúng vị trí.
  Khoá cũ vẫn còn nguyên để sao lưu.
- **Tương thích địa chỉ cũ**: `/studio/word-paint.html` tự chuyển hướng về `/studio/`,
  giữ query và hash; liên kết cũ và dấu trang không bị hỏng.

### Sửa lỗi

- Không có.

### Cải tiến

- Trang chủ trỏ thẳng tới `/studio/`; bớt một bước chuyển hướng.
- Studio mang đầy đủ shell tài khoản dùng chung (avatar, menu) như các trang khác.
- QA mới `tools/qa/studio-smoke.js`: ba chế độ, lưu tự động, nhập dữ liệu cũ,
  chuyển hướng địa chỉ cũ, không có đồng hồ/thi cử và không có khoá bí mật.
- Tài liệu `docs/STUDIO.md` mô tả kiến trúc một ứng dụng, cấu trúc `bakhiStudio.v1`
  và quy trình nhập dữ liệu cũ.
- Cache-busting toàn website lên `3.9.0`.

## [3.8.0] — 2026-11-16

### Tính năng

- **Administrator Dashboard 4.2 — 13 mô-đun**: bổ sung Hồ sơ, Thành tích, Chat và
  What's New bên cạnh 9 mô-đun cũ. Sidebar giữ nguyên phong cách, mọi thao tác ghi vẫn
  đi qua Edge Function `admin-actions`.
- **Hồ sơ**: danh sách học sinh có tìm kiếm/phân trang, xem biệt danh, khung avatar,
  ảnh bìa và toàn bộ thành tích đã xác minh (`profiles.list`, `profiles.detail`).
- **Thành tích**: chọn học sinh rồi trao/thu hồi đúng hai badge Administrator
  (`admin-chosen`, `admin-legend`); badge tự động chỉ hiển thị để đối chiếu, không có
  nút trao tay. Máy chủ trả `NOT_ADMIN_BADGE` cho mọi id khác.
- **Kiểm duyệt Chat**: xem phòng, thành viên và tin nhắn; xoá mềm tin (kèm xoá ảnh
  Storage), tạm khoá/mở khoá gửi tin, gỡ thành viên khỏi nhóm và xoá phòng riêng.
  Phòng chung được bảo vệ bằng `PROTECTED_ROOM`.
- **What's New**: công tắc `public.whatsnew` và bảng xem trước các phiên bản đã xuất
  bản; chỉ đọc changelog, không tạo bản ghi mới.

### Sửa lỗi

- `chat-api` từ chối tin nhắn mới bằng `403 MUTED` khi học sinh đang bị tạm khoá trong
  phòng, thay vì chỉ ẩn giao diện.

### Cải tiến

- **Backend quản trị**: `admin-actions` thêm `chat.rooms`, `chat.messages`, `chat.delete`,
  `chat.room.delete`, `chat.member.remove`, `chat.mute`; mọi hành động ghi
  `admin_activity_logs` và không tin dữ liệu phân quyền từ client.
- **Badge**: trang quản trị nạp `bk-badges.js` chỉ để đọc tên badge; cờ `BK_ADMIN_ONLY`
  chặn ghi `bakhiBadges.v1` trong trình duyệt quản trị.
- **Giao diện**: thêm khối hồ sơ, lưới badge, luồng tin nhắn và khối trao badge vào
  `bk-admin-dashboard.css`; giữ bố cục một cột dưới 640px.
- Cache-busting toàn website lên `3.8.0`.
- QA mới `tools/qa/admin-smoke.js`: kiểm tra 13 tab, trao/thu hồi badge, kiểm duyệt
  chat, công tắc What's New, cùng các ràng buộc bảo mật phía máy chủ.

## [3.7.0] — 2026-11-16

### Tính năng

- **Chat toàn trường**: trang `/chat/` với phòng chung cho mọi học sinh đã gắn danh
  tính, tin nhắn riêng từng cặp và nhóm tối đa 10 người. Danh sách phòng sắp theo hoạt
  động gần nhất, có tìm kiếm và bộ đếm tin chưa đọc (cả trên tiêu đề tab).
- **Tin nhắn**: nội dung tối đa 2.000 ký tự, gửi bằng Enter (Shift+Enter xuống dòng),
  ảnh PNG/JPEG/WEBP/GIF tối đa 3 MB qua bucket `chat-images`, thả 12 cảm xúc, xoá mềm
  tin của mình. Không nhận tệp khác ngoài ảnh.
- **Profile Card**: bấm ảnh hoặc tên trong chat để xem biệt danh, giới thiệu, khung
  avatar và số thành tích; từ đó mở ngay cuộc trò chuyện riêng.
- **Realtime**: tin nhắn, cảm xúc và tên nhóm cập nhật trực tiếp qua Supabase Realtime
  (RLS chỉ trả dữ liệu phòng mình tham gia).
- **Quản lý nhóm**: trưởng nhóm đổi tên, thêm/xoá thành viên, rời nhóm; khi trưởng
  nhóm rời đi, người vào sớm nhất được chuyển làm trưởng.
- **Lối vào Chat** trong menu tài khoản, cạnh Hồ sơ cá nhân.

### Sửa lỗi

- Không có.

### Cải tiến

- **Backend Chat**: migration `20261120000000_bakhi_chat.sql` tạo `chat_rooms`,
  `chat_members`, `chat_messages`, `chat_reactions`, view `chat_profiles` (chỉ lộ tên,
  biệt danh, giới thiệu, ảnh, khung, số thành tích), RLS chỉ đọc và thu hồi toàn bộ
  quyền ghi khỏi `anon`/`authenticated`.
- **Edge Function `chat-api`**: mọi thao tác ghi chạy bằng service role sau khi xác minh
  thiết bị đã gắn học sinh, tư cách thành viên, độ dài nội dung, quyền sở hữu ảnh và
  giới hạn tần suất (20 tin/phút, 120 cảm xúc/phút).
- **Storage**: bucket `chat-images` công khai theo URL, chỉ nhận `image/*` ≤ 3 MB, mỗi
  người chỉ ghi/xoá trong thư mục uuid của chính mình.
- Cache-busting toàn website lên `3.7.0`.
- QA mới `tools/qa/chat-smoke.js`: dựng giao diện bằng jsdom, kiểm tra tải phòng, gửi
  tin, ảnh, cảm xúc, Profile Card, nhắn riêng, tạo nhóm, cùng các ràng buộc RLS,
  giới hạn nhóm và Storage.

> Ghi chú triển khai: Chat cần chạy migration `20261120000000` và deploy Edge Function
> `chat-api` trên dự án Supabase thật. Khi chưa deploy, trang `/chat/` hiển thị thông
> báo máy chủ chưa sẵn sàng và các trang học tập khác không bị ảnh hưởng.

## [3.6.0] — 2026-11-16

### Tính năng

- **Hồ sơ đồng bộ máy chủ**: biệt danh, giới thiệu, liên kết và khung avatar được lưu
  theo học sinh trong bảng `student_profiles` và tự đồng bộ giữa các thiết bị qua Edge
  Function `student-profile`. Dữ liệu cục bộ (`bakhiProfile.v1`) vẫn là bản dùng ngay
  khi ngoại tuyến; bản máy chủ chỉ ghi đè khi mới hơn.
- **75 thành tích xác minh phía máy chủ**: máy chủ đọc dữ liệu học tập đã đồng bộ, tự
  tính lại chỉ số rồi mới ghi badge vào `student_badges`. Trình duyệt không gửi danh
  sách badge đã mở và không ghi trực tiếp được vào bảng này. 73 badge tự động theo dữ
  liệu thật; 2 badge Administrator (`admin-chosen`, `admin-legend`) chỉ do
  `admin-actions` trao khi có phiên Administrator.
- **Khung avatar có chủ**: mỗi khung đến từ một badge đã xác minh; trigger
  `bakhi_profile_frame_guard` chặn gán khung chưa sở hữu (`FRAME_NOT_OWNED`), và
  `bakhi_owned_frames()` là nguồn duy nhất cho cả client lẫn máy chủ.
- **Quản trị hồ sơ trong dashboard**: `admin-actions` thêm `profiles.list`,
  `profiles.detail`, `badges.list`, `badges.grant`, `badges.revoke`. Mọi thao tác trao
  hoặc thu hồi badge đều ghi vào `admin_activity_logs` kèm mã phiên Administrator.
- **Danh mục badge dùng chung**: `tools/gen-badge-catalog.js` sinh
  `supabase/functions/_shared/badge-catalog.ts` từ `bk-badges.js`; QA đối chiếu hai bên
  để không lệch danh mục, mục tiêu hay khung thưởng.

### Sửa lỗi

- `BK.signals.get()` không còn tự đổi `updatedAt` khi chỉ đọc.
- Đồng bộ hồ sơ tự tắt khi Edge Function `student-profile` chưa được triển khai (404)
  để website đang chạy không phát sinh lỗi lặp lại.

### Cải tiến

- Cache-busting toàn website lên `3.6.0`.
- Migration `20261119000000_bakhi_profile_badges.sql`: bật RLS cho `student_profiles`
  và `student_badges`, chỉ cho đọc bản ghi của chính mình, thu hồi toàn bộ quyền ghi
  `student_badges` khỏi `anon`/`authenticated`.
- `sync-student-progress` nhận thêm `signals` và `badges` (bộ đếm thành tích, trang đã
  ghé, chuỗi ngày) — chỉ để máy chủ tính lại thành tích, không cấp quyền gì.
- QA mới `tools/qa/badges-smoke.js`: đối chiếu danh mục 75 badge, so khớp chỉ số máy
  chủ với client, chặn tự trao badge Administrator, kiểm tra `applyRemote` và các ràng
  buộc RLS/trigger trong migration. `cloud-smoke.js` thêm mục kiểm tra đồng bộ hồ sơ.

> Ghi chú triển khai: các tính năng trên cần chạy migration `20261119000000` và deploy
> Edge Functions `student-profile`, `admin-actions`, `sync-student-progress` trên dự án
> Supabase thật. Khi chưa deploy, website vẫn hoạt động local-first như trước.

## [3.5.0] — 2026-11-16

### Tính năng

- **Dev Code trong Cài đặt**: tab Nhà phát triển có mục Dev Code riêng, đặt trước
  Administrator Code. Mã được xác minh ở Edge Function `dev-auth`; trình duyệt chỉ
  giữ token + hạn dùng trong `sessionStorage` (`bakhiDev.v1`), không lưu mã và không
  dùng menu ba gạch cũ. Phiên Dev tách hoàn toàn khỏi phiên Administrator.
- **Developer Playground 2.1 — đủ 14 tab**: thêm Studio (trạng thái tài liệu + lối mở
  nhanh), Dữ liệu (chỉ đọc kho dùng chung, xuất JSON từng khoá) và Gỡ lỗi (chẩn đoán
  môi trường, phiên, viewport, cloud, shell; không chứa token hay mã).
- **Thoát Dev**: nút đỏ `Thoát Dev` nằm bên trái nút Thu nhỏ, có hộp xác nhận; thoát
  sẽ xoá phiên Dev, đóng panel và ẩn biểu tượng công cụ. Thu nhỏ giữ nguyên tab,
  kích thước và trạng thái panel.
- **Nút Dev góc dưới bên trái**: chỉ xuất hiện sau khi Dev Code được máy chủ xác minh,
  nằm ngay trên Music Player; tải `bk-dev.js` theo nhu cầu từ `bk-shell.js`.
- **Backend Dev Code**: migration `dev_sessions` (RLS bật, không policy, thu hồi quyền
  anon/authenticated), Edge Function `dev-auth` giới hạn 10 lần/10 phút theo IP, thời
  hạn phiên 1–12 giờ (mặc định 4). `dev-auth` không cấp quyền gọi `admin-actions`.

### Sửa lỗi

- `BK.ui.confirm()` luôn trả về `false` vì `onClose` được gọi trước khi nút đồng ý
  phân giải Promise; nay nút Đồng ý trả về `true`, nút Huỷ trả về `false`. Sửa lỗi
  này khôi phục mọi hộp xác nhận dùng chung (đổi học sinh, thoát Dev, xoá dữ liệu).
- Hộp xác nhận bị Developer Playground che do z-index panel cao hơn overlay; panel
  nay nằm dưới `.bk-overlay` để luôn bấm được.
- `BK.signals.get()` tự đổi `updatedAt` mỗi lần đọc; nay giữ nguyên mốc đã lưu.
- Trang Cài đặt nạp `bk-cloud.js` trước `bk-settings.js` để mở trực tiếp
  `?tab=dev` thấy đúng trạng thái cấu hình máy chủ.

### Cải tiến

- Cache-busting toàn website lên `3.5.0`; `bk-dev.js` trên trang chủ dùng chung số
  phiên bản với `bk-version.js`.
- QA mới `tools/qa/dev-smoke.js`: xác thực Dev, 14 tab, Thoát Dev + xác nhận, thu nhỏ
  giữ trạng thái, FAB trên Music Player, không đổi favicon, không có Highlight Manager
  độc lập, không lưu mã; `smoke.js` và `shell-smoke.js` cập nhật theo hành vi mới.

## [3.4.0] — 2026-11-16

### Tính năng

- **Lớp shell dùng chung toàn website**: avatar tài khoản thay cho menu ba gạch và nút
  README riêng trên trang chủ. Menu tài khoản gồm Hồ sơ cá nhân, Giao diện, README.md,
  Bá Khí Studio, Cài đặt; ô tìm kiếm nhanh giữ nguyên hành vi cũ. Mục Chat chưa được
  thêm vì `/chat/` chưa tồn tại — không tạo liên kết chết.
- **Trang `/profile/`**: ảnh đại diện, ảnh bìa, biệt danh, giới thiệu, tối đa 6 liên kết
  http/https, 13 khung avatar và bảng 75 thành tích. Dữ liệu local-first ở
  `bakhiProfile.v1`, ảnh được thu nhỏ bằng canvas trước khi lưu.
- **Trang `/settings/`**: 5 tab — Hồ sơ, Trung tâm học tập (gắn đúng bộ tab đang dùng
  qua `BKLearn.mountHub`, không có hệ thống thứ hai), Hiển thị & Trợ năng, Hình nền
  (dùng chung kho IndexedDB `bakhi`/`kv` với trang chủ) và Nhà phát triển.
- **75 thành tích**: 73 badge tự động theo dõi học tập, khám phá, chuỗi ngày, âm nhạc,
  tương tác, hồ sơ, Studio và badge bí mật; 2 badge chỉ Administrator trao. Mỗi badge
  có danh mục, độ hiếm, tiến độ và một số badge thưởng khung avatar.
- **What's New trên trang chủ**: danh sách thống nhất, hiển thị 10 mục mới nhất theo số
  phiên bản kèm nút `Xem thêm` / `Thu gọn` và bộ đếm `đang xem / tổng`.
- **`bk-version.js`**: nguồn phiên bản duy nhất cho toàn website
  (`window.BAKHI_VERSION`, `BK.release`).

### Sửa lỗi

- Chuẩn hoá tên trường cũ "THPT FPT" thành "THPT Huỳnh Ngọc Huệ" ngay khi chạy, chỉ
  trong header/footer/main và không sửa bất kỳ tệp nội dung giáo dục nào.
- Trung tâm học tập không mở lại được sau khi đóng: tham chiếu modal được giải phóng
  đúng lúc thay vì giữ mãi.
- Đồng bộ cache-busting của `bk-cloud.js`, `bk-cloud.css` và `bk-learn.js` về `3.4.0`
  để trình duyệt không dùng bản JS/CSS cũ.
- Menu tài khoản tự đóng khi chọn mục, giữ focus bàn phím và đóng bằng Esc hoặc bấm ra ngoài.

### Cải tiến

- Trợ năng toàn website: cỡ chữ 90–130%, tương phản cao, giảm chuyển động, viền focus
  rõ và gạch chân liên kết; lưu ở `bakhiA11y.v1`, tôn trọng `prefers-reduced-motion`.
- Dock nổi của Trung tâm học tập được thay bằng mục Cài đặt trong menu tài khoản;
  phím tắt `Ctrl/⌘ + K` và `/` vẫn hoạt động như trước.
- Câu hướng dẫn trên trang chủ được cập nhật theo giao diện avatar thay vì nhắc menu ba gạch.
- Giao diện Cài đặt/Hồ sơ dùng chung token `--bkl-*`, hỗ trợ sáng/tối và màn hình nhỏ.

### Khác

- Chưa triển khai trong bản này: chat `/chat/`, hợp nhất hai trang Studio, Dev Playground
  14 tab, xác minh badge phía máy chủ, mở rộng Administrator Dashboard A–M. Các phần này
  cần bảng/RLS/Storage/Edge Function mới nên được tách thành giai đoạn riêng.

## [3.3.0] — 2026-11-15

### Tính năng

- **Tự động đồng bộ CHANGELOG.md lên Supabase**: GitHub Actions đọc `CHANGELOG.md` khi
  có thay đổi trên nhánh `main`, tách phiên bản / ngày / nhóm nội dung / markdown, rồi
  gọi Edge Function `changelog-sync` ghi vào bảng `changelog`. Mỗi phiên bản mới được
  tạo **một** thông báo đẩy liên kết qua `announcements.changelog_version`, chống trùng
  bằng `pg_advisory_xact_lock` và unique index; chạy lại chỉ cập nhật, không báo lại.
- **Administrator Dashboard 9 mô-đun**: Tổng quan, Học sinh, Thông báo, Lịch sử phiên
  bản, Nhật ký, Giám sát, Quyền, Cấu hình, Dữ liệu. Bảng có tìm kiếm, lọc, sắp xếp,
  phân trang phía máy chủ; xem chi tiết học sinh, xuất CSV/JSON, xác nhận trước thao tác
  ảnh hưởng dữ liệu; sidebar thu gọn được, breadcrumb, trạng thái tải/thành công/lỗi/rỗng.
- **Lịch sử phiên bản dạng cột dọc** trong dashboard: biểu mẫu tạo/sửa phiên bản chiếm
  toàn chiều rộng phía trên, danh sách phiên bản bên dưới với cột rõ ràng, cuộn ngang
  trên màn hình hẹp; giữ nguyên tìm kiếm, lọc nguồn/đồng bộ, xuất JSON, sửa và xoá.
- **Giao diện thông báo tối thống nhất**: trung tâm thông báo, bảng thông báo, popup,
  danh sách, chi tiết, thông báo lịch sử phiên bản, toast, modal, trạng thái tải/rỗng/lỗi
  dùng chung bộ biến `--bkc-n-*` và lớp `.bkc-dark`; không còn thẻ trắng hay chữ khó đọc
  trên nền tối.
- **Cờ tính năng và bảo trì**: bảng `app_settings` (chỉ đọc khoá `public.*`), realtime
  đẩy thay đổi ngay tới trình duyệt; `public.whatsnew` điều khiển khối “Cập nhật gần đây”,
  `public.maintenance` bật dải thông báo bảo trì toàn site.
- **Favicon tĩnh dùng chung**: `assets/bakhi/favicon.svg` cùng bộ PNG 16/32/48/192/512,
  `apple-touch-icon.png` và `favicon.ico`; chèn link tương đối đúng cho 118/119 trang,
  gồm cả Studio, Word & Paint và trang quản trị. Không còn favicon GIF động.

### Sửa lỗi

- **Bỏ “Có gì mới” khỏi Studio và Word & Paint** bằng logic: `bk-cloud.js` chỉ dựng khối
  cập nhật gần đây khi thẻ script có `data-bk-whatsnew="1"` hoặc trang đã có khung
  `#bkcWhatsNew`; hai trang Studio chạy chế độ chỉ thông báo nên không bao giờ hiện khối
  này, không dùng CSS che.
- **Không hiện hai chuông thông báo**: `bk-cloud.js` gỡ chuông `bk-notify.js` cũ trên
  trang chủ khi lớp thông báo mới đã dựng xong.
- **Markdown an toàn trong thông báo**: nội dung từ máy chủ được escape trước, chỉ cho
  phép liên kết `http(s)`, không chèn HTML thô; giữ xuống dòng và danh sách.
- **Liên kết thông báo → phiên bản**: bấm thông báo sinh ra từ CHANGELOG sẽ mở đúng mục
  phiên bản trong cửa sổ lịch sử, kể cả sau khi tải lại trang.

### Cải tiến

- **Backend admin mở rộng trong một Edge Function**: `admin-actions` bổ sung
  `students.detail`, `students.export`, `announcements.stats`, `changelog.list` có phân
  trang/lọc, lưu và xuất bản changelog qua RPC dùng chung, `logs.list`/`logs.export`,
  `settings.get`/`settings.set`, `system.health`, `permissions.get`, `data.integrity`.
  Mọi thao tác xác thực lại Administrator Code ở máy chủ.
- **Giám sát đúng phiên bản**: `system.health` và `overview` so sánh từng đoạn số như
  `bakhi_version_cmp` thay vì sắp theo `published_at`; changelog đồng bộ chỉ có ngày nên
  trước đây 3.2.0 bị coi là mới hơn 3.3.0.
- **Danh sách phiên bản đúng thứ tự**: `changelog.list` lấy tối đa 500 hàng đã lọc, sắp
  theo từng đoạn số rồi mới cắt trang; trang đầu luôn là 3.3.0, 3.2.1… thay vì 2.0.0.
- **Báo cáo quyền thật**: `permissions.get` gọi `bakhi_permissions_report()` trả về hàm,
  bảng + RLS và policy đọc từ catalog; migration mới
  `20261117002000_bakhi_permissions_report.sql` chỉ cấp quyền cho `service_role`.
- **Migration mới**: `20261117000000_bakhi_changelog_sync.sql` (cột đồng bộ, liên kết
  announcement, hàm so sánh phiên bản, RPC publish, `app_settings`),
  `20261117001000_app_settings_realtime.sql` (đưa `app_settings` vào realtime) và
  `20261117002000_bakhi_permissions_report.sql` (báo cáo quyền chỉ đọc).
- **Cache-bust tài sản dùng chung** lên `?v=4.1.0` cho `bk-cloud`, `bk-admin-dashboard`
  và `?v=4.1.1` cho `bk-devboard` trên toàn bộ trang để trình duyệt nhận giao diện mới.
- **Tài liệu**: cập nhật kiến trúc, tính năng, hướng dẫn Supabase, README và AGENTS.md
  cho quy trình đồng bộ changelog, 9 mô-đun quản trị, favicon và migration mới.

### Bảo mật

- **Khoá đồng bộ changelog**: workflow dùng GitHub Secrets `CHANGELOG_SYNC_TOKEN` và
  `CHANGELOG_SYNC_URL`; Edge Function so token bằng thời gian hằng, không nhận request
  không có token, không đặt khoá bí mật trong mã nguồn.
- **Ghi cấu hình chỉ qua service role**: `app_settings` không cho ghi từ trình duyệt;
  `admin-actions` chỉ chấp nhận hai khoá `public.whatsnew` và `public.maintenance`.

## [3.2.1] — 2026-11-15

### Bảo mật

- **Chặn `anon` gọi hàm SECURITY DEFINER**: audit phát hiện Supabase cấp mặc định
  `EXECUTE` cho `anon`/`authenticated` trên mọi hàm mới của schema `public`, nên
  `revoke ... from public` trong migration gốc không có tác dụng. Hệ quả là bất kỳ ai
  có publishable key đều gọi được `bakhi_rate_limit()` và ghi thêm hàng vào
  `rate_limits` không giới hạn. Nay chỉ `service_role` (Edge Function) gọi được hàm
  này; `bakhi_current_student_id()` chỉ còn `authenticated` và `service_role`.
- **Tiến trình học tập chỉ ghi qua Edge Function**: thu hồi `INSERT`/`UPDATE` trên
  `student_progress` khỏi `authenticated`. Trước đây một thiết bị đã gắn hồ sơ có thể
  ghi thẳng vào bảng qua REST, bỏ qua giới hạn 1,5 MB và quy tắc “chỉ ghi khi mốc thời
  gian mới hơn” của `sync-student-progress`. Trình duyệt vẫn đọc được hàng của mình.
- **Khoá `search_path` cho hàm trigger** `bakhi_touch_updated_at`
  (`public, pg_temp`), theo khuyến nghị của Supabase Security Advisor.
- **Thêm index khoá ngoại** `announcement_reads(announcement_id)` và đổi policy
  `student_devices` sang `(select auth.uid())` để tránh RLS initplan.

### Cải tiến

- **Migration gia cố riêng**: `supabase/migrations/20261116000000_bakhi_security_hardening.sql`,
  idempotent, có ghi chú hoàn tác; tài liệu Supabase thêm mục “Gia cố bảo mật” kèm câu
  SQL kiểm chứng quyền hàm và quyền bảng.

## [3.2.0] — 2026-11-15

### Tính năng

- **Chuông thông báo phủ toàn website**: mọi trang môn học, bài học, đề kiểm tra, thư viện,
  trang chủ và cả hai trang Studio đều có chuông thông báo. Thông báo mới từ giáo viên và
  phiên bản mới hiện ngay bằng Supabase Realtime, không cần quay lại trang chính hay tải lại.
- **Chế độ “chỉ nhận thông báo”** cho trang bài học: bật bằng thuộc tính
  `data-bk-notify-only="1"` trên thẻ `bk-cloud.js`. Chế độ này chỉ dựng chuông, bảng thông báo,
  đếm chưa đọc và realtime; **không** mở màn hình nhận diện học sinh, **không** đồng bộ
  tiến trình, **không** ghi đè dữ liệu học tập trên máy.
- **Trạng thái đã đọc dùng chung toàn site**: đọc thông báo ở trang bài học, Studio hay trang
  chủ đều được ghi nhớ. Ở chế độ chỉ nhận thông báo, trạng thái lưu cục bộ theo origin
  (`bakhiNotifyReads.v1`) nên mọi trang trong cùng website thấy cùng số chưa đọc.
- **Chuông nổi cho trang không có header chung**: chuông đặt cố định ở góc phải dưới, bảng
  thông báo tự mở **lên trên** khi chuông nằm ở nửa dưới màn hình, không bị cắt khỏi khung nhìn.
- **Studio có thông báo**: `studio/index.html` và `studio/word-paint.html` nạp lớp thông báo
  như mọi trang khác; không ảnh hưởng tài liệu đang soạn hay bản vẽ đang mở.

### Sửa lỗi

- **Administrator Dashboard — thẻ danh sách nằm sai cột**: thẻ “Quản lý thông báo” và
  “Lịch sử phiên bản” trước đây được gắn vào khung cha thay vì lưới hai cột, khiến cột phải
  trống và biểu mẫu co lại một nửa. Nay hai tab này hiển thị đúng bố cục hai cột, tự chuyển
  thành một cột khi cửa sổ hẹp.
- **Khung nhập không còn tràn viền**: toàn bộ dashboard dùng `box-sizing: border-box`;
  `input`, `textarea`, `select` rộng 100% nằm gọn trong thẻ, không còn vượt qua mép phải
  của thẻ hay tạo thanh cuộn ngang.
- **Biểu mẫu rộng hết tab và màn hình**: khung nội dung `.bkc-pane` chiếm toàn bộ chiều rộng
  khả dụng; lưới hai cột tự gộp dưới 1180px để biểu mẫu không bị bóp hẹp.
- **Xem trước thông báo tự xuống dòng**: nội dung dài, chuỗi không khoảng trắng và liên kết
  dài không còn đẩy thẻ rộng ra ngoài.
- **Liên kết CHANGELOG.md đúng đường dẫn**: nút “Xem CHANGELOG.md” trong bảng thông báo ở
  trang bài học/Studio mở đúng tệp gốc thay vì tìm trong thư mục môn học.
- **Công cụ bảo toàn nội dung nhận diện thẻ script có thuộc tính**: `content-integrity`
  loại bỏ đúng cả thẻ script được chèn kèm `data-*`, nhờ vậy nội dung giáo dục vẫn
  được xác minh là không đổi.

### Cải tiến

- Nâng phiên bản tài nguyên dùng chung lên `?v=4.0.1` (bk-cloud, bk-cloud.css,
  bk-admin-dashboard.css, bk-devboard) để trình duyệt tải bản mới thay vì bản lưu đệm.
- Tài liệu được rà soát và mở rộng: README, AGENTS, kiến trúc, tính năng, Music, Studio,
  Supabase — bổ sung sơ đồ trang, bảng key lưu trữ, quy trình kiểm thử và xử lý sự cố.

## [3.1.3] — 2026-11-15

### Tính năng

- **Khôi phục khu vực “Cập nhật gần nhất” (What's New)** trên trang chính: hiện phiên bản
  mới nhất kèm tóm tắt và danh sách thay đổi, có nút mở trung tâm thông báo và xem CHANGELOG.md.
- **Mục Administrator Dashboard mở tab mới**: sau khi xác nhận Administrator Code, bấm mục này
  sẽ mở `admin/index.html` ở tab riêng (trang quản trị đầy đủ, tự yêu cầu mã riêng khi mở tab mới).
- **Header tự thu gọn**: khi không đủ chỗ, nút README.md và tên học sinh trên header được ẩn bớt
  và thay bằng mục tương ứng trong menu 3 gạch, tránh tràn ngang trên điện thoại và cửa sổ hẹp.

### Sửa lỗi

- **Thông báo mới hiện ngay lập tức**: sự kiện realtime trước đây bị bỏ qua bởi bộ nhớ đệm 5 giây,
  nên vừa mở panel hoặc vừa tải lại xong thì thông báo mới không xuất hiện. Nay sự kiện realtime
  luôn tải lại ngay.
- **Đóng dashboard bằng phím Esc** và không còn mở khoá cuộn trang khi đóng hộp xem trước
  trong lúc dashboard vẫn mở.
- Nhãn “Đăng xuất Dev” đổi thành “Đăng xuất Administrator”.


## [3.1.2] — 2026-11-15

### Tính năng

- Trang quản trị riêng tại admin/ — mở là phải nhập Administrator Code, dùng chung dữ liệu với trang chính.
- Menu 3 gạch có mục Administrator: nhập Administrator Code để mở Administrator Dashboard, kèm đường dẫn mở thẳng trang quản trị riêng.
- Trung tâm thông báo hiện cả thông báo từ giáo viên và toàn bộ phiên bản cập nhật, xếp từ cũ đến mới theo số phiên bản.
- Bấm vào một phiên bản trong trung tâm thông báo để xem đầy đủ nội dung thay đổi của phiên bản đó.

### Sửa lỗi

- Sửa nút × của trung tâm thông báo: trước đây panel dùng thuộc tính hiển thị riêng nên không tắt được, giờ bấm là đóng.
- Bỏ khu vực cập nhật (What's New) khỏi màn hình chính để không trùng lặp với trung tâm thông báo.

### Cải tiến

- Đổi tên Dev Code thành Administrator Code và Dev Dashboard thành Administrator Dashboard trên toàn bộ giao diện lẫn thông điệp máy chủ.
- Ô nhập mã quản trị được giấu sau nút Administrator, chỉ hiện khi bấm; mục Administrator Dashboard chỉ xuất hiện sau khi xác nhận mã đúng.

## [3.0.0] — 2026-11-15

### Tính năng

- Nhận diện học sinh bằng họ tên: gõ tên, chọn trong danh sách gợi ý có tô sáng — không cần email, không cần mật khẩu, không cần tài khoản Google.
- Phiên ẩn danh Supabase Auth: mỗi thiết bị một phiên riêng, không thu thập email hay số điện thoại.
- Đồng bộ tiến trình học tập giữa các thiết bị: luyện tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích — tự lưu, tự thử lại khi mất mạng.
- Trung tâm thông báo tức thời: giáo viên đăng là máy học sinh hiện ngay, có đếm chưa đọc, mức ưu tiên và đánh dấu đã đọc.
- What's New: xem bản cập nhật mới nhất và toàn bộ lịch sử phiên bản ngay trên trang chủ.
- Dev Dashboard 6 tab cho giáo viên: Tổng quan, Học sinh, Thông báo, Changelog, Nhật ký, Cài đặt.
- Import danh sách học sinh từ tệp TXT, tự phát hiện trùng họ tên và đánh dấu hồ sơ cần phân biệt.

### Cải tiến

- Bảo mật: bật RLS cho toàn bộ bảng; danh sách học sinh không đọc được từ trình duyệt, chỉ Edge Function dùng khoá máy chủ mới đọc được.
- Mọi thao tác quản trị đi qua Edge Function và phải xác thực bằng Dev Code; Dev Code không lưu ở máy người dùng.
- Giới hạn tần suất cho tìm kiếm, gắn danh tính và đăng nhập Dev Code để chống lạm dụng.
- Máy chủ kiểm tra lại họ tên khi gắn danh tính, không tin dữ liệu do trình duyệt gửi lên.

## [3.1.1] — 2026-11-15

### Sửa lỗi

- Sửa lỗi lớn nhất: hộp thoại xác nhận danh tính nằm BÊN DƯỚI màn hình nhận diện nên bấm Xác nhận không có phản ứng gì. Đã sửa đúng thứ tự lớp và bỏ bước xác nhận trùng — bấm Xác nhận là vào ngay.
- Không còn bắt buộc phải chọn trong danh sách gợi ý: gõ đúng họ tên rồi bấm Xác nhận (hoặc Enter) là được, máy chủ tự đối chiếu.
- Máy chủ trước đây hiểu nhầm yêu cầu chỉ có họ tên là 'xem liên kết' nên trả về chưa gắn danh tính — đã sửa để xác nhận đúng.
- Trên điện thoại, chạm vào gợi ý giờ chọn được ngay; trước đây danh sách ẩn trước khi kịp nhận cú chạm nên không bao giờ chọn được tên.
- Hồ sơ trùng họ tên: máy chủ trả về danh sách hồ sơ để chọn đúng người thay vì báo lỗi chung.

### Cải tiến

- Thông báo lỗi rõ ràng cho từng trường hợp: không tìm thấy họ tên, hồ sơ chờ giáo viên phân biệt, hồ sơ đã bị vô hiệu hoá, thử quá nhiều lần.
- Chặn bấm Xác nhận nhiều lần liên tiếp để không tạo yêu cầu trùng.
- Gợi ý cách dùng ngay trên màn hình nhận diện: nhập đúng họ tên rồi bấm Xác nhận.

## [3.1.0] — 2026-11-15

### Sửa lỗi

- Xác nhận danh tính giờ kiểm tra đúng tên: nút Xác nhận chỉ mở khi đã chọn một gợi ý và tên trong ô phải khớp với gợi ý đó; máy chủ kiểm tra lần nữa và trả NAME_MISMATCH nếu lệch.
- Bỏ tự chọn hộ khi tìm kiếm chỉ trả về một kết quả — học sinh luôn tự chọn tên của mình.
- Chỉ còn một chuông thông báo: gỡ chuông đọc CHANGELOG.md cũ để không còn hai mục thông báo trùng nhau.
- Danh sách gợi ý không còn cách ô nhập và chỉ cuộn bên trong danh sách, không kéo cả màn hình đăng nhập.

### Giao diện & trải nghiệm

- Thêm nút icon đổi học sinh ngay cạnh chuông khi đã có danh tính.
- Vào thẳng màn hình nhận diện: nội dung trang ẩn cho tới khi xác định xong phiên, có splash BÁ KHÍ thay cho nháy trang.
- Dev Dashboard nằm trong menu 3 gạch và chỉ hiện sau khi nhập đúng Dev Code.
- Thêm đường dẫn CHANGELOG.md trong cửa sổ What's New và trong cửa sổ lịch sử cập nhật để xem lại toàn bộ phiên bản cũ.
- Tinh chỉnh giao diện điện thoại và máy tính: tên trên header thu gọn thành icon dưới 720px, panel rộng hết màn hình, tôn trọng vùng an toàn của tai thỏ.

### Hiệu năng

- Giảm gọi mạng trùng khi khởi động: thông báo và changelog chỉ tải một lần, thêm preconnect tới Supabase.
- Tạm dừng đồng bộ khi tab bị ẩn và chỉ làm mới trung tâm thông báo tối đa 5 giây một lần.

## [2.4.2] — 2026-11-14

### Giao diện & thông báo

- **Chỉ giữ** chuông thông báo cập nhật ở trang chủ `index.html`; loại bỏ hoàn toàn
  khỏi các trang môn, bài học, Studio và Music.
- **Tự giảm animation** trên máy yếu hoặc khi bật giảm chuyển động: thêm lớp `.lite`
  toàn cục, tắt hiệu ứng nặng ở toast, modal, overlay và thanh tiến độ.
- **Loại bỏ** badge “Portal [môn]” trên mọi thiết bị để header các trang môn gọn hơn.
- **Tinh chỉnh** bố cục mobile cho header, bảng thông báo và các nút điều hướng.

## [2.4.1] — 2026-11-14

### Thông báo trên header

- **Chuyển** chuông thông báo vào header thay vì nút nổi góc phải dưới; ở trang chủ
  chuông nằm ngay **bên trái nút README.md**, các trang bài học đặt cạnh nhóm nút bên phải.
- **Chuyển** bảng thông báo lên **góc trên bên phải**, ngay dưới chuông, tự canh lại khi đổi
  kích thước/cuộn trang.
- **Sửa** lỗi bảng thông báo đang ẩn vẫn chiếm chỗ và chặn thao tác — nguyên nhân khiến
  không bấm được nút ×/chuông; thêm `[hidden] { display: none }`.
- **Sửa** nút ×: vùng bấm lớn hơn (44px), thêm `touch-action`, đóng cả khi trình duyệt
  không phát `click`; giữ `Esc`, bấm nền và nút “Đóng”.
- **Thu gọn** chuông trên điện thoại (2,4rem) và tự chuyển thành nút nổi dưới header khi
  header quá chật, tránh tràn ngang.

## [2.4.0] — 2026-11-14

### Thông báo cập nhật

- **Thêm** chuông thông báo ở góc phải dưới trên mọi trang: mỗi phiên bản trong
  `CHANGELOG.md` là một thông báo, có badge số chưa đọc.
- **Thêm** bảng thông báo với nút **Đánh dấu đã đọc tất cả**, danh sách phiên bản kèm
  ngày và số thay đổi; trạng thái lưu ở `bakhiNotify.v1`.
- **Thêm** cửa sổ toàn màn hình khi bấm một thông báo: đầy đủ nội dung phiên bản
  (Markdown an toàn), nút ×, `Esc` và bấm nền để đóng.
- **Thêm** `BKNotify` API: `open`/`close`, `openArticle`, `markAll`, `items`, `unread`,
  `parse`, `setSource`, `refresh`.
- **Hỗ trợ** đọc `CHANGELOG.md` trực tiếp khi chạy http(s); khi mở `file://` hiện
  thông báo giải thích thay vì lỗi.

## [2.3.0] — 2026-11-14

### Thành tích 30 mốc

- **Thêm** 17 mốc mới, nâng tổng lên 30, chia 5 nhóm: Học tập (6), Luyện tập (9),
  Sổ tay (6), Studio (5), Khám phá (4). Không mốc nào dựa trên chuỗi ngày, điểm danh
  hay thời gian.
- **Thêm** `BK.signals` — tín hiệu dùng chung ở key riêng `bakhiSignals.v1` (chỉ số đếm,
  không lưu nội dung): tài liệu/bản vẽ/lượt xuất/lượt chèn/số từ của Studio, lượt phát
  nhạc, lượt mở bảng lệnh, lượt xuất sao lưu.
- **Thêm** `BK.achievements.progress()` (tiến độ từng mốc) và `next()` (3 mốc gần đạt),
  `groups`, `lastUnlocked()`; thông báo toast khi mở khoá (gộp khi nhiều mốc cùng lúc).
- **Nâng cấp** tab Thành tích: tổng quan 30 mốc, tiến độ theo nhóm, lọc Tất cả/Đã đạt/
  Chưa đạt, tìm kiếm, thanh tiến độ và số đếm từng mốc, ngày đạt; huy hiệu `x/30` trên tab.
- **Nâng cấp** Tổng quan: thẻ Thành tích có thanh tiến độ, 3 mốc gần đạt tiếp theo và
  liên kết mở tab Thành tích.

### Studio & Music

- **Thêm** Studio tự ghi tín hiệu khi lưu tài liệu có nội dung, có bản vẽ, xuất HTML/TXT/
  PNG, chèn bản vẽ vào trang và ghi nhận số từ lớn nhất của một tài liệu.
- **Thêm** Music Player tăng tín hiệu ở mỗi lượt phát thật (sự kiện `play`) và tự kiểm tra
  thành tích nếu lớp học tập có mặt.
- **Thêm** xuất sao lưu dữ liệu và mở bảng lệnh được tính vào nhóm Khám phá.

### Kiểm thử

- **Mở rộng** smoke test: 30 mốc, 5 nhóm, cấu trúc `progress()`, mốc gần đạt, tín hiệu
  Studio/Music/bảng lệnh/sao lưu, bỏ qua đường dẫn lạ, kẹp giá trị âm, render/lọc/badge.

## [2.2.0] — 2026-11-14

### Bá Khí Studio (Word & Paint)

- **Thêm** ứng dụng tĩnh độc lập `studio/word-paint.html`: soạn thảo kiểu Word (định dạng chữ/đoạn,
  màu, danh sách, canh lề, liên kết, ảnh, đếm từ, in/PDF) kết hợp bảng vẽ kiểu Paint (bút, tẩy,
  hình khối, mũi tên, chữ, màu, cỡ nét, độ đậm, hoàn tác 8 bước, tải PNG).
- **Thêm** chèn bản vẽ vào tài liệu, ba chế độ Word/Paint/Chia đôi, nhiều tài liệu, đổi tên,
  nhân bản, xoá có xác nhận.
- **Thêm** lưu tự động (`bakhiStudio.v1`), xuất HTML tự chứa, xuất TXT, mở `.html/.txt`, dán an toàn.
- **Thêm** lối vào từ menu 3 gạch của trang chủ và từ command palette (`Ctrl/⌘ + K`).

### Tinh chỉnh

- **Sửa** thao tác định dạng trong Studio: giữ vùng chọn khi bấm nút và `Ctrl+A` chỉ chọn nội dung trang.
- **Thêm** tài liệu `docs/STUDIO.md`, cập nhật README, FEATURES, CHANGELOG.

## [2.1.0] — 2026-11-14

### Music Player

- **Thêm** bố cục nổi đầy đủ: kéo thanh tiêu đề để di chuyển, kéo góc dưới-trái để đổi
  kích thước, nút thu nhỏ / phóng to, nhấp đúp tiêu đề để đặt lại; nhớ ở
  `bakhiMusic.panel.v1`; màn hình hẹp tự chuyển thành bảng đáy.
- **Thêm** phím tắt `Space` (phát/tạm dừng), `←/→` (tua 5 giây), `M` (tắt tiếng),
  `Esc` (đóng) — chỉ khi panel nhạc đang mở, tự bỏ qua khi đang gõ hoặc tiêu điểm ở nút.
- **Sửa** nút “Tiếp tục: …”: trước đây biến mất ngay khi bấm mà không phát nhạc; nay
  nút chỉ ẩn khi âm thanh thực sự phát và tự đặt lại `src` khi cần.
- **Thêm** `BKMusic.on(fn)` (phát sự kiện thay đổi), `maximize()`, `minimize()`,
  `resetLayout()`, `showTab()`, `isOpen()`; tab Music của Dev Panel cập nhật theo sự
  kiện thay vì polling mỗi giây.
- **Thêm** Media Session (khoá màn hình / tai nghe) và vùng thông báo `aria-live`.
- **Cải thiện** trợ năng: `aria-label`, `aria-pressed`, `aria-valuetext`, tab theo chuẩn
  `tablist`/`tabpanel`, điều hướng tab bằng phím, mục queue dùng `Enter`/`Delete`/
  `Alt+↑↓`, viền tiêu điểm, tay chạm to hơn, tôn trọng `prefers-reduced-motion`.

### Giao diện

- **Thêm** chuyển động nhẹ khi đổi tab ở Developer Playground, Music Player và Trung tâm
  học tập, tự tắt khi người dùng chọn giảm chuyển động.

### Tài liệu

- **Thêm** `docs/MUSIC.md`; mở rộng `README.md` (mục Music Player, bảng phím tắt, trạng
  thái dự án), `docs/FEATURES.md` (mục Music Player & khả năng tiếp cận) và
  `docs/ARCHITECTURE.md`.

## [2.0.0] — 2026-11-13

### Nền tảng học tập

- **Thêm** lớp dữ liệu local-first `BK` (`assets/bakhi/bk-core.js`): key duy nhất
  `bakhiLearn.v1`, có phiên bản, validate từng trường, giới hạn kích thước, tự phục hồi
  và sao lưu dữ liệu hỏng.
- **Thêm** Trung tâm học tập 7 tab: tổng quan, ôn tập, ghi chú, đánh dấu, lịch sử,
  thành tích, cài đặt.
- **Thêm** ôn tập thông minh: tự lưu câu sai, lịch ôn theo kết quả, đánh dấu thành thạo,
  hẹn ngày thủ công, tìm/lọc theo môn, lịch sử ôn.
- **Thêm** ghi chú cá nhân (ghim, danh mục, Markdown an toàn, xuất tệp).
- **Thêm** đánh dấu câu hỏi/bài học/môn/tài liệu.
- **Thêm** lịch sử học tập có tìm kiếm, xoá từng mục và xoá toàn bộ có xác nhận.
- **Thêm** 10 thành tích dựa trên hoạt động học thật (không streak, không điểm danh).
- **Thêm** Focus Mode (không có đồng hồ phiên) và cỡ chữ điều chỉnh được.
- **Thêm** tìm kiếm toàn cục (bài học, câu đã luyện, câu cần ôn, ghi chú, đánh dấu)
  và command palette `Ctrl/⌘ + K` có điều hướng bàn phím.
- **Thêm** phím tắt: `/`, `Esc`, `←/→`, `A/B/C/D` — bỏ qua khi đang nhập liệu.
- **Thêm** xuất/nhập JSON có xem trước, kiểm tra phiên bản và hợp nhất không phá dữ liệu.
- **Thêm** cầu nối trang bài học: ghi lịch sử, đọc ngân hàng câu hỏi (chỉ đọc), ghi nhận
  kết quả luyện tập theo mẫu feedback quen thuộc + API `BK.practice()`.

### Developer Playground 2.0

- **Thêm** `assets/bakhi/bk-dev.js|css`: cửa sổ nổi kéo/đổi kích thước, thu nhỏ/phóng to,
  nhớ vị trí/kích thước/tab, responsive, `Ctrl+Shift+G`.
- **Thêm** Inspector 2.0: chọn phần tử, highlight, breadcrumb, thuộc tính, computed styles,
  box model, copy selector/HTML, sửa style tạm thời + khôi phục.
- **Thêm** CSS Studio: live CSS, rule builder, undo/redo, reset, xuất CSS.
- **Thêm** Animation Studio: preset, keyframes, easing (kể cả cubic-bezier), timeline,
  play/pause/restart, xuất CSS, lưu/nhập preset, tôn trọng reduced-motion.
- **Thêm** Performance Lab: TTFB, DCL, load, FCP, LCP, CLS, long tasks, FPS thật,
  tài nguyên nặng nhất; không suy đoán khi thiếu API.
- **Thêm** Storage Manager: xem/sửa/xoá có bảo vệ, tìm kiếm, xuất/nhập, dung lượng.
- **Thêm** Console Pro và Network Monitor (chỉ đọc), Theme Editor, Component Library,
  Backup Manager.
- **Giữ nguyên** Developer Panel cũ (11 tab) và toàn bộ hàm toàn cục (`DX`, `showToast`,
  `switchDevTab`, `palette`, …).

### Bảo toàn nội dung & chất lượng

- **Thêm** `tools/content-integrity.js` + baseline `docs/content-baseline.json` cho 56 tệp:
  xác minh sha256 sau khi loại đúng khối script được chèn.
- **Thêm** `tools/integrate-pages.js` (idempotent) và `tools/qa/smoke.js` (45 kiểm tra DOM).
- **Không thay đổi** bất kỳ câu hỏi, phương án, đáp án, giải thích, công thức nào.
- **Không thêm** bất kỳ tính năng thi cử/tính giờ nào.

### Tài liệu

- **Thêm** `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/SUPABASE_SETUP.md`,
  cập nhật `README.md` và `CHANGELOG.md`.

### Đã biết

- Ba tệp HTML không có `</body>` (`images/anh/1.html`, `music/1.html`,
  `ktgk1/hoa/indexhoa.html`) chưa được gắn cầu nối học tập.
- Ghi nhận luyện tập tự động là best-effort theo cấu trúc trang.
- Đồng bộ Supabase và AI cần cấu hình thêm (không có key trong repository).

---
id: v862-observability
title: "v8.6.2: observability runtime, /metrics Prometheus và tab Vận hành chỉ Founder"
category: decision
status: active
tags: [observability, metrics, prometheus, rust, 8.6.2]
created: "2026-11-24T09:48:51"
updated: "2026-11-24T09:48:51"
---

<!-- compiled_truth -->
## Bối cảnh

8.6.2 thêm lớp observability cho backend Rust (`rust-backend/src/observability/`) mà không
đổi giao diện/URL học sinh, không đổi `BK_BACKEND.mode` (`edge`), không đổi schema Supabase,
không deploy. Metrics phải sống trong runtime, không phụ thuộc việc mở Founder Dashboard.

## Quyết định

- **Registry tự viết trong RAM** (`metrics.rs`): counter + histogram thật, `Mutex<Inner>`,
  trần `MAX_SERIES = 2000`, route lạ gộp `/other`. Không thêm crate `prometheus`; chỉ dùng
  `sha2` để băm token phiên admin (khớp `sha256Hex()` của `admin-actions`).
- **Prometheus scrape độc lập:** `GET /metrics` (và `/api/v1/metrics`) mặc định TẮT; chỉ bật
  khi `METRICS_ENABLED=1` + `METRICS_TOKEN`, xác thực Bearer so sánh constant-time. Scrape
  không bị tính vào thống kê nghiệp vụ và không đi qua giới hạn đồng thời.
- **Một lần ghi cho mỗi request:** middleware `access_log` (ngoài concurrency) ghi counter +
  histogram + log có `request_id`; không middleware nào khác đo latency.
- **p50/p95/p99** tính bằng nội suy bucket trong histogram, không lấy trung bình của trung bình.
- **Primary/Fallback theo VỊ TRÍ** trong `ai_model_routes` (position 0 = primary). Một lượt
  người dùng vẫn là một lượt dù nhiều attempt; circuit OPEN ghi `skipped`.
- **Đếm fallback trung thực (sửa sau khi rà):** `run_chain()` gọi `record_ai_request()` đúng
  MỘT lần cho mỗi lượt ở cả nhánh thành công lẫn nhánh lỗi, với `fell_back = true` khi đã chạm
  nhánh dự phòng (kể cả bị circuit OPEN bỏ qua). Trước đó lượt thất bại sau fallback bị đếm
  như "chỉ primary" và `ai_usage_logs.fell_back` ghi sai. Lỗi trước khi gọi provider (401,
  429, câu hỏi rỗng, chế độ tắt, trùng câu hỏi) không còn bị tính là lượt AI thất bại.
- **Token/giá:** dùng usage metadata provider; thiếu thì ước lượng và `estimated="true"`.
  Giá nạp từ `AI_PRICING_JSON`/`AI_PRICING_FILE`; model thiếu giá tăng
  `bakhi_ai_unpriced_requests_total`, KHÔNG tính 0 USD. Chưa có streaming nên không tạo
  `time_to_first_token` giả.
- **Founder Dashboard tab Vận hành** gọi `POST /api/v1/observability/summary` bằng phiên
  Founder (`x-admin-token`, backend yêu cầu `scope='founder'`); tab bị ẨN khỏi điều hướng
  Administrator thường (sidebar giữ 15 mục, Founder 19 mục).
- **Toolchain Docker:** builder nâng `rust:1.83` → `rust:1.92-bookworm` và `rust-version` 1.85
  vì `Cargo.lock` có crate manifest edition 2024 (rand_core 0.10) mà Cargo 1.83 không đọc được.


## Timeline

- time: 2026-11-24T09:48:51
  kind: decision
  summary: "Created this page: v8.6.2: observability runtime, /metrics Prometheus và tab Vận hành chỉ Founder"
  source: session 2026-11-24
  affects: [v862-observability]

- time: 2026-11-24T09:48:51
  kind: decision
  summary: "Metrics là một phần backend runtime; đếm fallback cả khi thất bại; tab Vận hành chỉ Founder"
  source: session 2026-11-24
  affects: [v862-observability]

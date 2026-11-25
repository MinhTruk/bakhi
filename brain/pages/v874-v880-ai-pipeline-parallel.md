---
id: v874-v880-ai-pipeline-parallel
title: "v8.7.4–8.8.0: AI pipeline performance và Parallel Execution Engine"
category: decision
status: active
created: "2026-11-25T12:17:23"
updated: "2026-11-25T12:17:23"
---

<!-- compiled_truth -->
## Quyết định bền vững

- **Streaming là endpoint RIÊNG** `/api/v1/ai/chat/stream`; `/ai/chat` giữ JSON trọn gói. Cả hai dùng chung `chat_guarded → chat_inner → run_chain_inner`, nên hạn mức, xác thực, lưu hội thoại và fallback chỉ có MỘT logic.
- **Sau khi đã gửi delta cho trình duyệt thì không retry, không fallback.** `StreamContext.delta_sent()` là ranh giới duy nhất. Lý do: nối hai câu trả lời là lỗi nội dung và tốn chi phí AI.
- **TTFT chỉ ghi khi stream thật** (`ProviderResult.ttft = Some`), đo từ lúc gửi HTTP tới chunk nội dung đầu tiên. Không suy diễn cho response trọn gói, không ghi 0 giả.
- **Backoff luỹ thừa + jitter** thay cho backoff cố định; `Retry-After` vẫn thắng; `CANCELLED` dừng cả chuỗi.
- **Chuẩn bị request song song** bằng `tokio::join!` cho ba lượt đọc độc lập (ai_settings, ai_model_routes, hồ sơ học sinh).
- **Parallel Engine chỉ cho CPU-bound**, dùng `spawn_blocking` của runtime sẵn có (không tạo thread/runtime mới). Ba lớp giới hạn: hàng đợi, worker, timeout; panic bắt bằng `catch_unwind`.
- **Timeout không giết được closure CPU** ⇒ permit được giữ tới khi closure xong để không vượt trần worker. Đây là lựa chọn có chủ đích, đừng "sửa" bằng cách drop permit sớm.
- **Ngưỡng 500 dòng** cho `learning-stats`: overhead engine đo được ~28 µs/tác vụ nên lô nhỏ giữ đường inline. Con số này phải đo lại bằng `rust-backend/examples/pipeline_bench.rs` nếu đổi.
- **TTFT/latency/throughput với provider thật chưa được đo** trong môi trường phát triển này (không có khoá AI). Không được tuyên bố cải thiện end-to-end khi chưa có số đo thật.
- **GitHub Pages không chạy tiến trình Rust thường trực** ⇒ streaming/metrics chỉ có ý nghĩa khi backend chạy ở nơi có Docker/tiến trình liên tục.


## Timeline

- time: 2026-11-25T12:17:23
  kind: decision
  summary: "Created this page: v8.7.4–8.8.0: AI pipeline performance và Parallel Execution Engine"
  source: created via brain create-page
  affects: [v874-v880-ai-pipeline-parallel]

- time: 2026-11-25T12:17:23
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v874-v880-ai-pipeline-parallel]

- time: 2026-11-25T12:17:23
  kind: decision
  summary: "8.7.4 streaming SSE + TTFT + huỷ; 8.8.0 Parallel Engine có hàng đợi/worker/timeout; không retry sau delta; threshold 500 dòng dựa trên overhead đo được"
  affects: [v874-v880-ai-pipeline-parallel]

---
id: v844-pwa-search-usage
title: "v8.4.4: PWA, tim kiem toan site, dem luot dung an danh"
category: decision
status: active
created: "2026-11-22T03:19:49"
updated: "2026-11-22T03:43:43"
---

<!-- compiled_truth -->
# PWA, tìm kiếm toàn site và sức khoẻ tiến trình (8.4.4)

## PWA
- `sw.js` ở gốc repo; HTML network-first (cache chỉ khi mất mạng), `assets/bakhi/` cache-first theo `?v=`, mọi request `/rest|auth|storage|functions/v1/` đi thẳng ra mạng.
- Đăng ký trong `bk-core.js` (HTTPS, sau load, kèm `?v=<phiên bản>`), manifest ở `assets/bakhi/manifest.webmanifest` với `start_url/scope = ../../`.
- `tools/inject-pwa.js`: hai trang `ktgk1/anh/anh1.html`, `ktgk1/anh/indexanh.html` có `<head>` giữa dòng nên BỊ BỎ QUA để content-integrity không báo sai. Không cố chèn bằng cách đổi cấu trúc dòng.

## Tìm kiếm toàn site
- `tools/build-search-index.js` sinh `assets/bakhi/search-index.js` (115 trang môn học, bỏ trang giao diện); `bk-core` tải muộn và gộp vào `BK.search.lessons()`, bỏ mục trùng trang đang mở.
- Thêm/đổi tiêu đề trang bài học phải sinh lại chỉ mục (`--check` trong QA).

## Bộ đếm lượt dùng ẩn danh — ĐÃ LOẠI BỎ
- 8.4.4 từng có `usage_counters` + RPC `bk_usage_ping` + `assets/bakhi/bk-usage.js`. Nay gỡ hoàn toàn theo yêu cầu (chưa cần thiết): không bảng, không RPC, không mã client, không lời gọi trong `bk-core`/`bk-themes`.
- `tools/qa/gamification-health.js` khẳng định không còn tham chiếu nào và migration không tạo lại bảng/RPC.

## Sức khoẻ tiến trình
- `bk_gam_health_drift()` (service_role) đối chiếu `xp_transactions` ↔ `user_progression` ↔ `bk_gam_level`.
- `bk_gam_award` không tự gọi `bk_gam_evaluate`; hợp đồng là gamification-api gọi ngay sau đó — `tools/qa/gamification-health.js` kiểm tra đúng hợp đồng này.


## Timeline

- time: 2026-11-22T03:19:49
  kind: decision
  summary: "Created this page: v8.4.4: PWA, tim kiem toan site, dem luot dung an danh"
  source: created via brain create-page
  affects: [v844-pwa-search-usage]

- time: 2026-11-22T03:19:49
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v844-pwa-search-usage]

- time: 2026-11-22T03:43:43
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v844-pwa-search-usage]

- time: 2026-11-22T03:43:43
  kind: reversal
  summary: "Loại bỏ hoàn toàn bộ đếm lượt dùng ẩn danh (usage_counters, bk_usage_ping, bk-usage.js) trước khi phát hành 8.4.4"
  affects: [v844-pwa-search-usage]

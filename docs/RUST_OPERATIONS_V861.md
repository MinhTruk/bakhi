# Bá Khí v8.6.1 — Vận hành backend Rust

> Phiên bản: 8.6.1 · Ngày: 2026-11-24 · **Backend chưa deploy.** Tài liệu này mô tả cách
> vận hành khi có hosting; không phải bằng chứng đã chạy production.

## 1. Biến môi trường

### Bắt buộc

| Biến | Ghi chú |
|---|---|
| `SUPABASE_URL` | https; chỉ cho phép `http://` với loopback khi phát triển |
| `SUPABASE_PUBLISHABLE_KEY` | khoá công khai, dùng `apikey` cho Auth/PostgREST |
| `SUPABASE_SERVICE_ROLE_KEY` | chỉ ở máy chủ; đọc `ai_settings`, `ai_model_routes`, ánh xạ hồ sơ, ghi hội thoại/usage |
| `AI_TUTOR_API_KEY` | khoá provider chính (cùng tên với Edge Function) |

### Tuỳ chọn chính

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `HOST` / `PORT` | `0.0.0.0` / `8080` | địa chỉ lắng nghe |
| `CORS_ORIGINS` | `https://minhtruk.github.io` | danh sách origin, không dùng `*` |
| `AI_TUTOR_FALLBACK_API_KEY` | — | khoá provider dự phòng |
| `AI_TUTOR_KEY_3…6` | — | khoá theo `ai_model_routes.key_ref` |
| `AI_TUTOR_BASE_URL` | — | ghi đè base URL (provider `custom`, kiểm thử) |
| `AI_TUTOR_MOCK` | `0` | **không bật ở production** |
| `AI_PERSIST_CONVERSATIONS` | `true` | `false` ⇒ chỉ hỏi–đáp, không ghi hội thoại |
| `AI_TUTOR_MAX_RETRIES` | `1` | 0–2 |
| `CONNECT_TIMEOUT_MS` | `5000` | timeout kết nối |
| `AI_TUTOR_TIMEOUT` | `30000` | một attempt provider |
| `AI_GATEWAY_TIMEOUT_MS` | `40000` | toàn chuỗi provider |
| `SUPABASE_TIMEOUT_MS` | `10000` | request Supabase |
| `REQUEST_TIMEOUT_MS` | `45000` | request HTTP |
| `SHUTDOWN_GRACE_MS` | `20000` | chờ tối đa khi SIGTERM |
| `AI_RETRY_BACKOFF_MS` | `500` | chờ giữa hai lần thử |
| `MAX_CONCURRENCY` | `512` | request đồng thời |
| `AI_MAX_CONCURRENCY` | `32` | lượt AI đồng thời |
| `AI_USER_MAX_CONCURRENCY` | `1` | lượt AI/người dùng |
| `CONCURRENCY_WAIT_MS` | `750` | chờ semaphore |
| `AI_CIRCUIT_THRESHOLD` | `5` | lỗi liên tiếp để mở circuit |
| `AI_CIRCUIT_COOLDOWN_MS` | `30000` | thời gian OPEN |
| `AI_CIRCUIT_HALF_OPEN` | `1` | request thử ở HALF_OPEN |
| `RATE_LIMIT_PER_MIN` | `240` | theo IP |
| `AI_RATE_LIMIT_PER_MIN` | `30` | theo người dùng |
| `MAX_BODY_BYTES` | `262144` | 1 KiB – 16 MiB |
| `METRICS_ENABLED` | `0` | bật `/api/v1/metrics` |
| `METRICS_TOKEN` | — | bearer token cho metrics; thiếu ⇒ 404 |
| `TRUST_PROXY` | `false` | chỉ bật sau reverse proxy có kiểm soát |
| `RUST_LOG` | `bakhi_backend=info,tower_http=warn` | mức log |

Ràng buộc: `CONNECT ≤ AI_TUTOR_TIMEOUT ≤ AI_GATEWAY ≤ REQUEST_TIMEOUT`, `SUPABASE ≤ REQUEST`.
Sai ⇒ tiến trình không mở cổng và in tên biến sai.

## 2. Khởi động

```bash
./bakhi-backend
# hoặc
docker run -p 8080:8080 --env-file .env bakhi-backend
```

Thứ tự: đọc cấu hình → kiểm tra → dựng client/registry/circuit/metrics → bind cổng → log
`Bá Khí backend đã sẵn sàng` (kèm version, bind, grace). Nếu log này chưa xuất hiện, instance
**chưa** phục vụ được dù cổng đã mở.

## 3. Kiểm tra sức khoẻ

```bash
curl -s https://<host>/api/v1/health
# {"ok":true,"data":{"status":"ok","service":"bakhi-backend","version":"8.6.1",
#  "uptimeSeconds":123,"activeRequests":0,"draining":false}}

curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/v1/ready
# 200 khi sẵn sàng; 503 khi draining / thiếu cấu hình / Supabase Auth không trả lời
curl -sI https://<host>/api/v1/ready | grep x-ready-reason
```

- Liveness probe → `/api/v1/health`.
- Readiness probe → `/api/v1/ready`.
- `x-ready-reason`: `draining` | `config_error` | `dependency_down`.

Docker image có `HEALTHCHECK` gọi `/health` và `STOPSIGNAL SIGTERM`.

## 4. Metrics

Bật:

```bash
METRICS_ENABLED=1
METRICS_TOKEN=<chuỗi ngẫu nhiên dài>
```

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" https://<host>/api/v1/metrics
```

Gauge/counter: `bakhi_requests_total`, `_success_total`, `_failed_total`,
`bakhi_active_requests`, `bakhi_ai_requests_total`, `_ai_success_total`, `_ai_failed_total`,
`bakhi_ai_fallbacks_total`, `bakhi_ai_retries_total`, `bakhi_ai_latency_ms_avg`,
`bakhi_provider_latency_ms_avg`, `bakhi_circuit_state{provider=…}` (0 closed, 1 half_open,
2 open). Không có nhãn người dùng.

Chưa tích hợp Prometheus server — chỉ xuất text exposition để scrape ở bản sau.

## 5. Graceful shutdown

1. Orchestrator gửi SIGTERM (Docker `STOPSIGNAL`, Kubernetes mặc định).
2. `/ready` trả 503 ngay; load balancer ngừng gửi request.
3. Axum ngừng nhận kết nối mới, chờ request đang chạy.
4. Hết `SHUTDOWN_GRACE_MS` ⇒ log `quá thời gian chờ shutdown; kết thúc tiến trình`.
5. Log cuối: `đã dừng an toàn` kèm `active_requests`.

Đặt `terminationGracePeriodSeconds` (K8s) lớn hơn `SHUTDOWN_GRACE_MS` ít nhất 5 giây.

## 6. Runbook sự cố

| Triệu chứng | Kiểm tra | Hành động |
|---|---|---|
| `/ready` 503, `x-ready-reason: config_error` | log `bakhi::ready` | đặt `SUPABASE_SERVICE_ROLE_KEY` hoặc tắt `AI_PERSIST_CONVERSATIONS` |
| `/ready` 503, `dependency_down` | Supabase status, `SUPABASE_URL` | chờ Supabase; không restart liên tục |
| 429 `RATE_LIMIT` hàng loạt | `bakhi_requests_failed_total`, IP | kiểm tra tấn công; nâng `RATE_LIMIT_PER_MIN` có kiểm soát |
| 429 `BUSY` khi một người chat | `AI_USER_MAX_CONCURRENCY` | giữ 1 (chống trùng); người dùng chờ câu trước |
| 502 `PROVIDER_DOWN` kéo dài | `bakhi_circuit_state` | kiểm tra status provider; circuit tự đóng sau cooldown |
| 502 `AUTH` | khoá AI | xoay khoá trong secret; không log khoá |
| 502 `TIMEOUT` | `bakhi_provider_latency_ms_avg` | tăng `AI_TUTOR_TIMEOUT` trong giới hạn gateway |
| `DB_ERROR` | `bakhi::db` log (status PostgREST) | kiểm tra Supabase/RLS/quyền service key |

Không bao giờ dán giá trị secret vào ticket hay chat. Log chỉ ghi mã lỗi và status.

## 7. Nhật ký

Mỗi request:

```
request_id=… method=POST route=/api/v1/ai/chat status=200 duration_ms=812 category=ok
```

Sự kiện: `bakhi::startup`, `bakhi::shutdown`, `bakhi::request`, `bakhi::auth`, `bakhi::db`,
`bakhi::ratelimit`, `bakhi::concurrency`, `bakhi::circuit`, `bakhi::ready`, `bakhi::ai`.
Không log Authorization, apikey, nội dung câu hỏi hay nội dung AI.

## 8. Checklist trước khi deploy (chưa thực hiện)

- [ ] Hosting chạy container + TLS, healthcheck trỏ `/api/v1/health`.
- [ ] Secret đặt trên nền tảng: Supabase URL/keys, khoá AI (cùng tên biến với Edge).
- [ ] `CORS_ORIGINS` đúng domain; không dùng `*`.
- [ ] `AI_TUTOR_MOCK=0`, `METRICS_ENABLED` theo nhu cầu.
- [ ] Chạy 6 bước kiểm thử staging trong `docs/RUST_MIGRATION_V860.md` mục 4.
- [ ] Chỉ sau đó đặt `BK_BACKEND.mode = 'rust'` + bump bản vá.
- [ ] Rollback: `mode = 'edge'` + bump bản vá (không cần tắt backend ngay).

## 9. Giới hạn

- Trạng thái rate limit / circuit / metrics là **theo từng instance**.
- Chưa có dashboard; chỉ metrics text.
- Chưa có endpoint quản trị; dùng `admin-actions` của Edge Function.

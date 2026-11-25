# Bá Khí 8.7.3 — Intelligent Caching

Tài liệu triển khai Cache Engine (Giai đoạn 4). Mọi mục dưới đây mô tả code đã có
trong repository, không phải đề xuất.

---

## 1. Kiến trúc trước và sau

### Trước 8.7.3

- **Rust:** mỗi lượt `/api/v1/ai/chat` đọc lại `ai_settings` **và** `ai_model_routes`
  từ Supabase, dù hai bảng này giống nhau với mọi người dùng và chỉ đổi khi Founder
  sửa cấu hình. Không có bộ nhớ đệm, không gộp request đồng thời.
- **JavaScript:** `bk-cloud.js` tự giữ vài biến trạng thái (`S.announcements`,
  `S.changelog`, `S.flags`) và tự đặt cửa sổ 5 giây. Cửa sổ này chỉ sống trong một
  trang; mở trang khác là tải lại. Không có tầng lưu trữ bền, không có dedup dùng chung.
- **HTTP:** `sw.js` đã cache tài nguyên `assets/bakhi/` theo `?v=<phiên bản>`, HTML
  network-first. `respond()` của Rust đặt `Cache-Control: no-store` cho mọi phản hồi API.

### Sau 8.7.3

```
Trình duyệt
  ├── L3  HTTP cache + Service Worker (sw.js): tài nguyên ?v=, network-first cho HTML
  ├── L2  IndexedDB "bakhi-cache" (chỉ nội dung công khai, có version + TTL)
  └── L1  BKCache.shared (Map + LRU + TTL + dedup)
                 │
                 ▼  HTTPS JSON
Rust backend
  ├── L1  cache::Cache (Mutex + BTreeMap LRU + TTL + tag/namespace)
  ├── singleflight::SingleFlight (gộp request đọc đồng thời)
  └── nguồn: Supabase PostgREST (ai_settings, ai_model_routes)
```

## 2. File tạo mới

| File | Nội dung |
|---|---|
| `rust-backend/src/cache/mod.rs` | L1 cache: TTL, LRU, giới hạn entry/byte, tag, namespace, stale, metrics |
| `rust-backend/src/cache/singleflight.rs` | Gộp request đọc đồng thời, lan truyền lỗi, chống treo khi huỷ |
| `rust-backend/tests/cache_tests.rs` | Test nối dây AppState + cấu hình + Prometheus |
| `assets/bakhi/bk-cache.js` | L1 + L2 + dedup phía trình duyệt, an toàn theo tài khoản |
| `tools/qa/v873-cache.js` | QA tĩnh + chạy thật bk-cache.js + benchmark `--bench` |
| `docs/INTELLIGENT_CACHING_V873.md` | Tài liệu này |

## 3. File chỉnh sửa

| File | Thay đổi |
|---|---|
| `rust-backend/src/lib.rs` | `AppState` giữ `cache` + `flights`, dựng một lần |
| `rust-backend/src/config/settings.rs` | Thêm `CACHE_*`, kiểm tra ràng buộc |
| `rust-backend/src/services/ai_service.rs` | Đọc cấu hình/route qua cache + singleflight, fallback stale |
| `rust-backend/src/routes/metrics.rs` | Ghép metrics cache vào `/metrics` |
| `rust-backend/src/routes/observability.rs` | Thêm khối `cache` vào summary Founder |
| `rust-backend/examples/pipeline_bench.rs` | Benchmark cache hit/miss so với clone cấu hình |
| `assets/bakhi/bk-cloud.js` | Thông báo/changelog/feature flags đi qua `BKCache.shared` |
| 124 tệp HTML | Nạp `bk-cache.js` **trước** `bk-cloud.js`, cùng `?v=` |
| `.github/workflows/quality-check.yml` | Thêm cổng `v873-cache` |
| `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `rust-backend/README.md` | Tài liệu phát hành |

## 4. Dependency

**Không thêm dependency nào.** L1 dùng `HashMap` + `BTreeMap` + `Mutex` + atomic của
std; dedup dùng `tokio::sync::broadcast` đã có sẵn trong Tokio. Không dùng DashMap/Moka:
dữ liệu cần cache ở backend chỉ là hai bảng cấu hình (vài chục KB), một mutex giữ
trong vài micro-giây rẻ hơn một dependency mới và dễ suy luận hơn về tính nhất quán.

Phía trình duyệt dùng `Map`, `Promise` và `IndexedDB` có sẵn — không thêm thư viện.

## 5. Cách hoạt động từng tầng

### L1 — Rust (`cache::Cache`)

- `get()` trả `Arc<Value>`: **không clone payload**, chỉ tăng reference count.
- Mỗi entry có `expires_at` (TTL) và `stale_until` (TTL + `CACHE_STALE_WHILE_REVALIDATE`).
- `get()` **không bao giờ** trả entry hết TTL; `get_stale()` chỉ dùng khi nguồn dữ liệu lỗi.
- LRU: `BTreeMap<tick, key>` với tick tăng đơn điệu → loại entry ít dùng nhất bằng
  `pop_first()` (O(log n)), không quét toàn bộ cache.
- Giới hạn kép: `CACHE_MAX_ENTRIES` và `CACHE_MAX_MEMORY_BYTES` (dung lượng ước lượng
  bằng cách duyệt `Value`, **không** serialize lại). Một payload lớn hơn cả hạn mức bị
  từ chối thay vì đẩy toàn bộ cache ra.
- TTL jitter tất định theo khoá (`CACHE_TTL_JITTER_PERCENT`, mặc định 10%) để các entry
  không hết hạn cùng lúc.
- Khoá mutex **chỉ** giữ trong thao tác trên map; không có `.await`, không I/O, nên
  không chặn Tokio worker. Bộ đếm metrics là atomic nằm ngoài mutex.
- `Cache::clear()`, `invalidate(key)`, `invalidate_namespace(ns)`, `invalidate_tag(tag)`.

### L1 — Trình duyệt (`BKCache`)

- Mỗi instance có `Map` với thứ tự LRU (Map giữ thứ tự chèn), TTL theo entry, hạn mức
  entry + byte, tag và namespace.
- Chỉ **một** instance dùng chung (`BKCache.create`), không tạo cache rải rác trong
  từng component.
- `wrap(key, loader, opts)` = đọc cache → nếu miss thì gộp request đang chạy → nếu chưa
  có thì gọi loader, có timeout, sau đó ghi cache.

### L2 — IndexedDB (tuỳ chọn)

- Database `bakhi-cache`, version 1, object store `entries`.
- Chỉ dùng khi nơi gọi đặt `persist: true` **và** instance không phải `private`.
- Bản ghi mang `version` (schema/phiên bản code): bản ghi khác version bị coi là miss và xoá.
- Có hạn thời gian mỗi thao tác (400 ms); lỗi/quota/timeout ⇒ tăng bộ đếm, fallback L1
  hoặc gọi nguồn, **không bao giờ** ném lỗi làm hỏng trang.
- Trình duyệt chặn storage (chế độ riêng tư, quyền bị từ chối) ⇒ `l2Available: false`,
  mọi thứ tiếp tục bằng L1.

### L3 — HTTP + Service Worker

- Backend Rust không phục vụ tài nguyên tĩnh: API trả `Cache-Control: no-store` (dữ liệu
  người dùng, không được shared-cache). Vì vậy L3 **không** đặt ở backend.
- `sw.js` đã là tầng L3 thật: HTML network-first; `assets/bakhi/*?v=` cache-first vì URL
  gắn với đúng một bản phát hành; không cache `/rest/`, `/auth/`, `/storage/`,
  `/functions/` và không cache cross-origin. Cache mang cả `?v=` và `REVISION` của worker,
  nên bản mới dọn cache cũ ⇒ không thể phục vụ JS/CSS cũ sau khi nâng cấp.
- Mọi tệp HTML nạp `bk-cache.js`/`bk-cloud.js` kèm `?v=<phiên bản>` (cổng QA kiểm tra).

## 6. Cache policy và TTL

| Namespace / khoá | Nơi lưu | TTL mặc định | Persist L2 | Ghi chú |
|---|---|---|---|---|
| `ai:settings:v1` | Rust L1 | 30 s (`CACHE_TTL_AI_CONFIG`) | — | cấu hình AI dùng chung |
| `ai:routes:v1` | Rust L1 | 30 s | — | tuyến model dùng chung |
| `announcements:v1` | JS L1+L2 | 60 s | có | nội dung công khai đã publish |
| `changelog:v1` | JS L1+L2 | 300 s | có | nội dung công khai |
| `site-flags:v1` | JS L1+L2 | 60 s | có | `app_settings` tiền tố `public.` |
| Trạng thái đã đọc, phản hồi báo cáo, hồ sơ | — | **không cache** | không | dữ liệu cá nhân |
| Token, phiên, nội dung AI theo yêu cầu | — | **không cache** | không | bí mật/nhạy cảm |

TTL là điểm khởi đầu, điều chỉnh bằng biến môi trường; không có giá trị nào bị hardcode
ở nhiều module.

## 7. Invalidation

| Cơ chế | Cách dùng |
|---|---|
| Theo key | `cache.invalidate(key)`, `BKCache.del(key)` |
| Theo namespace | `invalidate_namespace("ai")`, `instance.clear()` |
| Theo tag | `invalidate_tag("ai-config")`, `invalidateTag('public-content')` |
| Buộc tải lại | `loadAnnouncements(force)` ⇒ `wrap(..., {force:true})` xoá key trước khi đọc |
| Hết TTL | kiểm tra ở mỗi lần đọc; entry hết hạn bị xoá và đếm `expirations` |
| Đổi tài khoản/đăng xuất | `bk:identity` (detail `null`), `bk:logout`, `bk:admin-logout` ⇒ `clearPrivate()` |
| Nâng cấp phiên bản | `?v=` mới ⇒ SW dùng cache khác; bản ghi L2 khác `version` bị loại |

Supabase thay đổi dữ liệu: TTL ngắn (30–300 s) là cơ chế chính; thao tác của người dùng
(đánh dấu đã đọc, dismiss) không đi qua cache nên không bao giờ bị dữ liệu cũ che mất.
Hiện chưa có webhook/Realtime invalidation cho `announcements` — xem mục 13.

## 8. Request deduplication

- **Rust:** `SingleFlight::run(key, loader)` — request đầu tiên chạy loader; request đến
  sau trong cùng khoảng thời gian nhận chung `Arc<Value>` hoặc chung lỗi. Khoá hiện dùng:
  `ai:settings:v1`, `ai:routes:v1` (dữ liệu dùng chung, không chứa thông tin người dùng).
- In-flight được xoá ngay sau khi xong (thành công **hoặc** lỗi), nên request sau thất
  bại có thể thử lại. Nếu request dẫn đầu bị huỷ, request chờ nhận
  `CACHE_FLIGHT_CANCELLED` thay vì treo.
- **Trình duyệt:** `wrap()` giữ map `inflight` theo `namespace|scope|key`; ba component
  hỏi cùng dữ liệu ⇒ một request Supabase. Request ghi (upsert, insert) không đi qua dedup.

## 9. Bảo mật và quyền riêng tư

- Không cache: access/refresh token, phiên, hồ sơ, trạng thái đã đọc, phản hồi báo cáo,
  nội dung AI, dữ liệu quản trị.
- Khoá cache là tên dữ liệu; không chứa token/email/tên học sinh.
- Không log payload hoặc khoá cache; log chỉ có tên khoá cấu hình khi dùng bản stale.
- Cache không tham gia xác thực/phân quyền: RLS và `AuthUser` vẫn quyết định trước khi
  dữ liệu vào cache.
- Instance `private: true` không ghi L2 và bị xoá khi đổi tài khoản; instance công khai
  không bị ảnh hưởng bởi đăng nhập/đăng xuất.
- Metrics chỉ chứa số đếm/dung lượng — không có nội dung dữ liệu (có test).

## 10. Metrics

Prometheus (`/metrics`, cùng registry 8.6.2):

`bakhi_cache_hit_total`, `bakhi_cache_miss_total`, `bakhi_cache_hit_rate`,
`bakhi_cache_eviction_total`, `bakhi_cache_expiration_total`,
`bakhi_cache_invalidation_total`, `bakhi_cache_size_bytes`, `bakhi_cache_entry_count`,
`bakhi_cache_dedup_total`, `bakhi_cache_saved_requests`, `bakhi_cache_bypass_total`.

Founder Dashboard (`POST /api/v1/observability/summary`) nhận thêm object `cache`:
hit/miss/hitRate, evictions, expirations, invalidations, bypasses, rejected, staleServed,
dedupJoined/dedupLeader/dedupErrors, savedRequests, entryCount, sizeBytes, maxEntries,
maxBytes và `lookupP50Us`/`lookupP95Us`/`lookupAvgUs` (histogram đo thời gian tra L1).

Phía trình duyệt: `BKCache.stats()` trả mảng snapshot từng instance (L1/L2 hits, dedup,
evictions, expirations, invalidations, bypasses, lỗi, kích thước). Không gửi dữ liệu này
lên máy chủ.

## 11. Kiểm thử

- Rust unit (`src/cache/mod.rs`): hit/miss, TTL, stale, LRU, hạn mức byte, payload quá
  lớn, invalidation key/namespace/tag, cache tắt, TTL 0, truy cập đồng thời 8 task,
  stats không lộ payload.
- Rust unit (`singleflight.rs`): gộp 2 request đồng thời, khoá khác không gộp, lỗi lan
  truyền + thử lại được, dedup tắt.
- Rust integration (`tests/cache_tests.rs`): AppState dùng chung cache, Prometheus có đủ
  metric, tắt cache không lưu, validate `CACHE_*`, mặc định an toàn.
- JS (`tools/qa/v873-cache.js`): chạy thật `bk-cache.js` trong sandbox — hit/miss,
  TTL, LRU, byte limit, tag/namespace invalidation, dedup 3 lời gọi ⇒ 1 loader, lỗi +
  thử lại, cache tắt, fallback không IndexedDB, đổi tài khoản, thứ tự nạp script trên
  toàn bộ HTML, nối dây Rust.

## 12. Benchmark

Microbenchmark (không phải end-to-end, không đo mạng/provider):

```
node tools/qa/v873-cache.js --bench
  BKCache.get (L1 hit, gồm Promise)              ~1.500 ns/op
  BKCache.peek (L1 hit, đồng bộ)                 ~1.360 ns/op
  baseline: xử lý lại payload (JSON round-trip)  ~37.600 ns/op
```

Payload 40 dòng (title 60 + summary 200 ký tự). Con số đo trên Node 22 tại máy phát
triển, chỉ so sánh tương đối: một lần hit L1 rẻ hơn khoảng 25 lần so với việc xử lý lại
cùng payload. Nó **không** đo độ trễ Supabase — phần tiết kiệm lớn nhất của cache là bỏ
hẳn round trip mạng, thứ không thể đo offline.

Rust: `cargo run --release --locked --example pipeline_bench` thêm mục `[cache]` so sánh
`cache.get()` (gồm mutex + LRU + metrics) với `Value::clone` cấu hình mỗi lượt. Số liệu
được in trong job release của CI; đây là số đo thật của lần chạy đó, không phải ước lượng.

## 13. Vấn đề chưa giải quyết

1. **Chưa có invalidation tức thời từ Supabase.** Thông báo/changelog/flags dựa vào TTL
   60–300 s. Thêm webhook hoặc lắng nghe Realtime để xoá ngay là bước tiếp theo, cần
   thay đổi phía Supabase (ngoài phạm vi bản này).
2. **Không cache dữ liệu cá nhân**, nên các trang vẫn đọc hồ sơ/tiến độ từ Supabase mỗi
   lần. Đây là lựa chọn có chủ đích: an toàn dữ liệu quan trọng hơn hit rate.
3. **L2 chỉ áp dụng cho nội dung công khai.** Chưa có thống kê hit rate L2 trên production
   (cần thu thập từ `BKCache.stats()` trong trình duyệt thật).
4. **Không đo p50/p95/p99 end-to-end, CPU/RSS trước–sau.** Cần Prometheus + tải thật;
   microbenchmark không thay thế được.
5. **AI config cache 30 s** có nghĩa thay đổi cấu hình của Founder có thể trễ tối đa 30 s
   (cộng jitter). Chấp nhận được với cấu hình model; nếu cần tức thời thì đặt
   `CACHE_TTL_AI_CONFIG=0`.
6. **Rollback không xoá dữ liệu người dùng.** Không có migration, không bảng mới.

## 14. Rollback

Không cần revert code:

```bash
# Tắt toàn bộ Cache Engine ở backend (hành vi như 8.7.2)
CACHE_ENABLED=0

# Hoặc tắt riêng từng phần
CACHE_L1_ENABLED=0
CACHE_DEDUP_ENABLED=0
CACHE_TTL_AI_CONFIG=0
```

Trình duyệt: gỡ `bk-cache.js` khỏi HTML ⇒ `bk-cloud.js` tự gọi thẳng Supabase (đã có
fallback). Xoá L2: DevTools → Application → IndexedDB → `bakhi-cache` → Delete, hoặc
`BKCache.stats()` để xem instance đang giữ gì. Tăng `?v=`/`REVISION` của service worker
làm cache HTTP cũ bị dọn tự động.

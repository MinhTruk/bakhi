# Benchmark Bá Khí v8.6.0 — số đo thật và giới hạn của số đo

> Nguyên tắc: **không tuyên bố nhanh hơn khi chưa đo.** Tài liệu này ghi rõ cái gì đo được,
> đo trong điều kiện nào, và cái gì **không** đo được.

## 1. Tóm tắt

| Endpoint | p50 | p95 | p99 | Throughput | Lỗi |
|---|---|---|---|---|---|
| `GET /api/v1/health` | 6,81 ms | 14,10 ms | 32,37 ms | 3.850 req/s | 0 |
| `POST /api/v1/data/learning-stats` (400 progress + 150 review + 120 session) | 9,11 ms | 16,32 ms | 23,79 ms | 1.599 req/s | 0 |
| `GET /api/v1/me` (xác thực + truy vấn hồ sơ) | 6,38 ms | 10,55 ms | 30,37 ms | 2.219 req/s | 0 |
| `POST /api/v1/ai/chat` (toàn bộ đường đi) | 11,23 ms | 21,22 ms | 36,93 ms | 655 req/s | 0 |

Tài nguyên trong suốt 8.100 request: **RSS 7 MiB**, **CPU 2,48 s**.
Binary release: **4,9 MB** (đã strip), 23 tệp nguồn Rust.

## 2. Môi trường đo

| Thành phần | Giá trị |
|---|---|
| CPU | 2 vCPU (máy ảo cloud) |
| Hệ điều hành | Linux x86_64 |
| Rust | stable 1.100.0, `--release` (`opt-level=3`, `lto=thin`, `codegen-units=1`, `strip=true`) |
| Node (load generator) | v26.13.1 |
| Supabase | **giả lập cục bộ** (Node `http`) |
| AI provider | **giả lập cục bộ** (trả cố định 1 lựa chọn) |
| Client đo | `node:http`, `keepAlive: false` ⇒ **mỗi request gồm cả bắt tay TCP** |
| Ngày đo | 2026-11-23 |

Cách tái lập:

```bash
cargo build --release --manifest-path rust-backend/Cargo.toml
node rust-backend/bench/run.mjs      # ghi rust-backend/bench/results.json
```

Script tự dựng Supabase/provider giả lập, khởi động binary, đo, rồi dọn tiến trình. Không
gọi mạng ngoài, không cần khoá thật.

## 3. Cấu hình test

| Scenario | Request | Concurrency | Ghi chú |
|---|---|---|---|
| health | 4.000 | 32 | Đường nóng tối thiểu (không DB) |
| learning-stats | 2.000 | 16 | Payload 670 dòng, ~24 KB |
| me | 1.500 | 16 | 1 lần gọi Auth + 1 lần PostgREST |
| ai/chat | 600 | 8 | Auth + settings + routes + hội thoại + 2 tin nhắn + PATCH + usage + provider |

`RATE_LIMIT_PER_MIN`/`AI_RATE_LIMIT_PER_MIN` đặt rất cao trong lúc đo để số đo phản ánh
đường xử lý chứ không phải bộ giới hạn tần suất. Giới hạn tần suất có bài kiểm thử riêng
(`ai_rate_limit_is_per_user_and_returns_429`).

## 4. Baseline

### 4.1. Baseline frontend/Edge Function: **không đo được**

Để đo p50/p95/p99 của `ai-tutor-api` (Edge Function) cần:
- deploy lên Supabase project thật, **và**
- JWT hợp lệ của một học sinh đã bind phiên, **và**
- khoá AI thật (mỗi lần chat tiêu tiền của chủ project).

Môi trường build này không có cả ba. Vì vậy **không có số baseline Edge Function**, và
tài liệu này **không** đưa ra bất kỳ so sánh "nhanh hơn X%" nào giữa hai backend. Bất kỳ
con số nào như vậy sẽ là bịa.

### 4.2. Baseline JavaScript cho phép tổng hợp (đo được)

Cùng payload (400 progress + 150 review + 120 session), cùng phép tính (tổng, độ chính xác
theo môn, tuần ISO), chạy **trong tiến trình Node, không HTTP**:

| | Thời gian mỗi lần |
|---|---|
| JavaScript (Node, in-process, 500 lần) | **0,17 ms** |
| Rust qua HTTP (p50, gồm xác thực + TCP + JSON) | **9,11 ms** |

**Kết luận trung thực: JavaScript nhanh hơn ~50 lần cho phép tính này ở kích thước dữ liệu
thật.** Đó là lý do:
- Không chuyển phần tổng hợp dữ liệu học tập sang Rust cho client.
- Không đưa WASM vào website.
- Giữ nguyên `bk-learning.js`.

Endpoint Rust vẫn hữu ích khi phía máy chủ cần tổng hợp (báo cáo cho giáo viên, dữ liệu quá
lớn để tải lên trình duyệt), nhưng không dùng để thay thế tính toán tại chỗ.

### 4.3. Baseline Rust không có gì để so

Đây là lần đầu Bá Khí có backend riêng, nên "trước/sau" cho backend là không tồn tại. Số đo
trên là **baseline cho các phiên bản sau** — dùng để phát hiện hồi quy.

## 5. Các điểm cải thiện thực tế (có đo hoặc có lý do kỹ thuật rõ)

| Điểm | Trước 8.6.0 | Sau 8.6.0 | Đo được? |
|---|---|---|---|
| HTTP client cho AI | Mỗi lần gọi tạo `fetch`/client mới trong Edge Function | **Một** `reqwest::Client` dùng chung (keep-alive, pool 32) | Có: `/ai/chat` p50 11,2 ms với 7 lượt HTTP nội bộ |
| Đọc cấu hình AI | Mỗi request đọc `ai_settings` | Mỗi request vẫn đọc (đúng, vì Founder có thể đổi bất cứ lúc nào) — không cache để tránh cấu hình cũ | Không hứa hẹn |
| Giới hạn tần suất | Trong isolate, mất khi isolate tái tạo | Trong tiến trình, cộng hạn mức ngày trong DB | Có test |
| Chống gửi trùng | Bộ nhớ isolate | Dữ liệu database (12 giây) ⇒ đúng cả khi nhiều instance | Có test |
| Rò rỉ khoá trong log | Đã lọc ở Edge Function | Lọc thêm một lớp trong Rust (`sanitize_detail`) | Có unit test |

## 6. Các điểm **chưa** cải thiện

- **Không có cache.** Cố ý: cấu hình AI và dữ liệu người học không được cache để tránh dữ
  liệu cũ/sai quyền.
- **Không có connection pool tới PostgreSQL.** Mọi truy vấn đi qua PostgREST (HTTP). Kết nối
  trực tiếp sẽ nhanh hơn nhưng bỏ qua tầng RLS/PostgREST đang được kiểm chứng — không đánh
  đổi.
- **Không streaming.** Cả hai backend đều chưa stream.
- **Độ trễ thật của Supabase/provider chưa đo.** Số trên là cận dưới (giả lập trả lời tức
  thì). Trong thực tế p95 của `/ai/chat` sẽ bị chi phối bởi provider (thường 0,5–3 s).

## 7. Giới hạn của kết quả

1. **Dependency là giả lập.** Số đo phản ánh chi phí của backend, không phải độ trễ Supabase
   hay Groq/Gemini.
2. **2 vCPU.** Throughput sẽ khác trên máy nhiều nhân; p99 phụ thuộc mạnh vào số nhân.
3. **Client tắt keep-alive.** Mỗi request gồm bắt tay TCP, nên p50 cao hơn so với client
   thật có keep-alive. Đây là lựa chọn cố ý để số đo không phụ thuộc hành vi tái dùng socket
   của Node.
4. **Một tiến trình.** Không đo nhiều instance sau load balancer.
5. **Không đo tải bền.** 8.100 request trong ~10 giây; không phát hiện rò rỉ bộ nhớ dài hạn.

## 8. Việc cần làm khi có môi trường thật

1. Deploy backend + cấu hình secret (xem [RUST_DEPLOYMENT_V860.md](RUST_DEPLOYMENT_V860.md)).
2. Đo `ai-tutor-api` (Edge) trên staging với cùng payload, cùng JWT ⇒ có baseline thật.
3. Đo `/api/v1/ai/chat` trên staging ⇒ so sánh p50/p95/p99 **cùng điều kiện**.
4. Ghi kết quả vào tài liệu này, kèm ngày và phiên bản, trước khi bật `mode: 'rust'` cho
   người dùng thật.

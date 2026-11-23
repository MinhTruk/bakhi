# Bá Khí v8.6.1 — Kiểm tra bảo mật backend Rust

> Phiên bản: 8.6.1 · Ngày: 2026-11-24 · Phạm vi: `rust-backend/` và cấu hình CI đi kèm.
> Đây là **tự đánh giá dựa trên mã nguồn và test**, không phải chứng nhận độc lập.

## 1. Xác thực

- Backend **không** tự phát minh đăng nhập. Token người học được gửi tới
  `GET /auth/v1/user` của Supabase; chữ ký, issuer và thời hạn do Supabase Auth kiểm tra.
  Backend chỉ tin `id`/`email` trong phản hồi đã xác thực.
- Không decode JWT rồi tin nội dung; không nhận `user_id` từ client.
- Token không được ghi log (`AuthUser` có `Debug` che token), không trả lại client.
- Bearer scheme bắt buộc; token quá ngắn/quá dài/chứa khoảng trắng bị từ chối (400/401).
- Endpoint công khai chỉ có `/health`, `/ready` và `/metrics` (khi bật, cần token riêng).

## 2. Phân quyền

- Danh tính → hồ sơ: `student_devices` lọc `auth_user_id = user.id` và được đọc bằng **JWT của
  chính người dùng** (RLS `student_devices_select_own`). Service role chỉ dùng để đọc
  `students` (bảng đã bị `revoke` với `authenticated`) và các bảng cấu hình/nhật ký.
- Không có đường nào cho phép đọc learning stats của người khác: endpoint
  `/data/learning-stats` chỉ xử lý dữ liệu **client gửi lên** cho chính phiên đã xác thực,
  không truy vấn hồ sơ người khác.
- `ai_conversations` / `ai_messages` luôn lọc `student_id` suy ra từ token; `conversation_id`
  client gửi phải là UUID và phải thuộc chính học sinh đó.
- Hồ sơ `is_active = false` ⇒ 403 `INACTIVE`; chưa gắn hồ sơ ⇒ 409 `NOT_BOUND`.
- Không tin `student_id` trong body — có test gửi id giả và kiểm tra dòng ghi vẫn dùng id thật.

## 3. Bảo vệ tài nguyên

| Lớp | Cơ chế | Test |
|---|---|---|
| Kích thước body | `DefaultBodyLimit` 1 KiB–16 MiB (mặc định 256 KiB) | `oversized_body_is_rejected`, `oversized_payload_is_rejected_cleanly` |
| Content-Type | POST phải `application/json`, nếu không 415 | `json_endpoints_require_json_content_type` |
| Tần suất | 240/phút theo IP, 30/phút theo người dùng | `ai_rate_limit_is_per_user_and_returns_429` |
| Đồng thời | toàn cục/AI/người dùng, có hạn chờ | `concurrency_tests` |
| Hạn mức ngày | `ai_settings.daily_requests`/`daily_tokens` | contract test cho `DAILY_LIMIT` |
| Provider lỗi | circuit breaker + retry có hạn | `circuit_breaker_tests`, `ai_gateway_tests` |
| Thời gian | timeout theo lớp, hạn chuỗi | `timeout_budget_is_bounded_by_gateway_deadline` |

Giới hạn bộ nhớ: rate limit tối đa 10 000 khoá, bộ đếm người dùng dọn khi về 0 và có trần
10 000, circuit breaker cố định 8 provider.

## 4. Xử lý lỗi và rò rỉ thông tin

- Một envelope duy nhất; không trả stack trace, tên bảng, SQL, đường dẫn tệp, header
  Authorization hay body thô của provider.
- Chi tiết provider chỉ vào log nội bộ sau `sanitize_detail()` (che `AIza`, `gsk_`, `csk-`,
  `sk-`, `AQ.`, `eyJ…`, gộp khoảng trắng, cắt 400 ký tự).
- `Settings` có `Debug` thủ công: chỉ in độ dài khoá, không in giá trị.
- `x-request-id` do client gửi chỉ được nhận nếu 8–64 ký tự `[A-Za-z0-9_-]`; phản hồi luôn có
  mã do server sinh khi thiếu/không hợp lệ.
- Test `error_handling_tests` chặn 8 chuỗi cấm trong phản hồi lỗi.

## 5. CORS, TLS, secret

- CORS theo danh sách origin cấu hình; từ chối `*` và origin không phải http(s). Header được
  phép: `Authorization`, `Content-Type`, `apikey`, `Accept`, `x-request-id`.
- Backend không tự kết thúc TLS: đặt sau reverse proxy/ingress có TLS.
- Khoá chỉ đọc từ biến môi trường; `.env.example` không chứa giá trị thật; `.env` đã nằm trong
  `.gitignore`.
- `SUPABASE_URL` bắt buộc https (trừ loopback khi phát triển).
- CI có job `gitleaks` quét khoá đã commit và `cargo audit` quét lỗ hổng phụ thuộc.
- Metrics yêu cầu token riêng và so sánh constant-time; thiếu token ⇒ 404 (không tiết lộ).

## 6. Những gì KHÔNG được log

- Authorization header, apikey, JWT.
- Nội dung câu hỏi/câu trả lời của học sinh.
- Body thô của provider.
- URL Supabase đầy đủ trong phản hồi lỗi.

## 7. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Rate limit/circuit theo từng instance | trung bình | nhiều instance ⇒ trần thực tế cao hơn; hạn mức ngày vẫn ở DB |
| Không có WAF/IPS | trung bình | phụ thuộc hạ tầng hosting |
| Không kiểm tra audience/issuer cục bộ | thấp | Supabase Auth đã kiểm tra khi trả `/auth/v1/user`; muốn kiểm tra cục bộ cần JWKS |
| Metrics không có Prometheus server | thấp | chỉ xuất text, chưa scrape |
| Service role đọc `students` | thấp | bắt buộc vì bảng bị `revoke` với `authenticated`; chỉ đọc hồ sơ của chính auth user vừa xác thực |
| Chưa deploy | — | không có bề mặt production nào được mở ở 8.6.1 |

## 8. Kiểm thử bảo mật đã chạy

```bash
cd rust-backend
cargo test --test auth_tests
cargo test --test error_handling_tests
cargo test --test concurrency_tests
cargo test --test api_contract_tests
```

Kết quả: pass toàn bộ (xem `docs/RUST_TESTING_GUIDE_V861.md`). Không có kiểm thử xâm nhập
(pentest) hay quét động vì backend chưa được deploy.

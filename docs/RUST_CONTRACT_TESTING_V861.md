# Bá Khí v8.6.1 — Contract testing Rust ↔ Edge Function

> Phiên bản: 8.6.1 · Ngày: 2026-11-24 · Chạy offline, không cần Supabase hay khoá AI thật.
>
> Nguồn đối chiếu: `supabase/functions/ai-tutor-api/index.ts`,
> `supabase/functions/_shared/http.ts`, `supabase/functions/_shared/ai-prompts.ts`,
> `assets/bakhi/bk-ai-tutor.js`. Fixtures: `rust-backend/tests/fixtures/`.

## 1. Mục tiêu

Rust là backend **thay thế tuỳ chọn** cho `ai-tutor-api`. Khi bật `BK_BACKEND.mode = 'rust'`,
frontend không được sửa một dòng nào — vì vậy hình dạng request/response, mã lỗi và HTTP
status phải khớp. Contract test kiểm tra đúng những điều đó và **không** yêu cầu nội dung AI
giống từng ký tự.

## 2. Phạm vi

| Endpoint | Method | Xác thực | Contract test |
|---|---|---|---|
| `/api/v1/health` | GET | không | `health_response.json` + version |
| `/api/v1/ready` | GET | không | 200/503, header `x-ready-reason` |
| `/api/v1/me` | GET | Bearer | `me_response.json` |
| `/api/v1/ai/chat` | POST | Bearer | `chat_success_response.json` + 7 nhánh lỗi |
| `/api/v1/data/learning-stats` | POST | Bearer | `learning_stats_request/response.json` |
| `/api/v1/metrics` | GET | token riêng (tuỳ chọn) | 404 khi tắt, 401 khi sai token |

Kiểm tra cho từng endpoint: method, yêu cầu xác thực, JSON schema (field + kiểu), HTTP status,
error envelope, field null/tuỳ chọn, header `x-request-id`, `cache-control: no-store`.

## 3. Error envelope

```json
{
  "ok": false,
  "error": { "code": "PROVIDER_DOWN", "message": "…", "retryable": true },
  "request_id": "…"
}
```

Edge Function trả `{ ok:false, error:{ code, message } }`; Rust thêm `retryable` và
`request_id` — **chỉ bổ sung**, không đổi field cũ. Fixture `error_envelope.json` khẳng định
đúng ba khoá cấp cao nhất.

## 4. Bảng mã lỗi đã đối chiếu

| Tình huống | Edge Function | Rust 8.6.1 | Khớp |
|---|---|---|---|
| Thiếu/sai token | 401 `UNAUTHORIZED` | 401 `UNAUTHORIZED` | ✅ |
| Chưa gắn hồ sơ | 409 `NOT_BOUND` | 409 `NOT_BOUND` | ✅ (đã sửa) |
| Hồ sơ ngừng hoạt động | 403 `INACTIVE` | 403 `INACTIVE` | ✅ (đã sửa) |
| Câu hỏi rỗng | 400 `EMPTY_MESSAGE` | 400 `EMPTY_MESSAGE` | ✅ |
| Câu hỏi quá dài | 400 `MESSAGE_TOO_LONG` | 400 `MESSAGE_TOO_LONG` | ✅ |
| Chế độ bị tắt | 400 `MODE_DISABLED` | 400 `MODE_DISABLED` | ✅ |
| Gửi trùng trong 12 giây | 409 `DUPLICATE` | 409 `DUPLICATE` | ✅ |
| Đang trả lời câu trước | 429 `BUSY` | 429 `BUSY` | ✅ (mới) |
| Vượt tần suất | 429 `RATE_LIMIT` | 429 `RATE_LIMIT` | ✅ |
| Hết hạn mức ngày | 429 `DAILY_LIMIT` | 429 `DAILY_LIMIT` | ✅ (đã sửa) |
| Hết hạn mức token | 429 `DAILY_TOKEN_LIMIT` | 429 `DAILY_TOKEN_LIMIT` | ✅ (đã sửa) |
| AI tắt | 503 `AI_DISABLED` | 503 `AI_DISABLED` | ✅ |
| Provider lỗi tạm thời | 502 `PROVIDER_DOWN` v.v. | 502 cùng mã | ✅ |
| Lỗi dữ liệu | 500 `DB_ERROR` | 500 `DB_ERROR` | ✅ (đã sửa) |
| Body không phải JSON | (Edge đọc `{}`) | 415 `UNSUPPORTED_MEDIA_TYPE` | ⚠️ khác có chủ đích |

`415` là khác biệt có chủ đích: frontend luôn gửi JSON; từ chối sớm giúp lỗi rõ ràng và giảm
tải parser. Nếu cần khớp tuyệt đối, có thể bỏ middleware `content_type` — nhưng khi đó body
không phải JSON sẽ thành `{}` rồi trả `EMPTY_MESSAGE`.

## 5. Compatibility gaps phát hiện và đã sửa ở Rust

1. **`students.auth_user_id` không tồn tại.** Schema thật: `student_devices(auth_user_id,
   student_id)` và `students` bị `revoke` với `authenticated`. Rust 8.6.0 truy vấn cột không
   có ⇒ mọi lượt chat có xác thực đều lỗi. 8.6.1 đọc liên kết qua `student_devices` bằng JWT
   người dùng rồi đọc hồ sơ bằng service role (bảng `students` không cho `authenticated`).
2. **Mã hạn mức ngày** dùng `RATE_LIMIT` chung thay vì `DAILY_LIMIT`/`DAILY_TOKEN_LIMIT`.
3. **Lỗi dữ liệu trả 503** thay vì 500 `DB_ERROR` như Edge.
4. **`BUSY`** chưa có: hai tab có thể gọi AI chồng nhau. Nay giới hạn 1 lượt/người dùng.
5. **`ai_usage_logs`** thiếu `fell_back` / `tokens_estimated`.
6. **Tiêu đề hội thoại** cắt 70 ký tự không dấu ba chấm thay vì 64 + `…`.
7. **Thiếu kiểm tra `is_active`** của hồ sơ học sinh.

Tất cả được sửa trong Rust; Edge Function **không** bị thay đổi.

## 6. Golden fixtures

| Tệp | Dùng cho |
|---|---|
| `health_response.json` | hình dạng liveness |
| `me_response.json` | danh tính + hồ sơ |
| `chat_request_valid.json` | request đầy đủ (context, conversation_id) |
| `chat_request_empty.json` | câu hỏi rỗng |
| `chat_request_disabled_mode.json` | chế độ lạ |
| `chat_success_response.json` | phản hồi chat đầy đủ (conversation, message, meta) |
| `error_envelope.json` | envelope lỗi |
| `learning_stats_request.json` / `learning_stats_response.json` | tổng hợp dữ liệu |

Quy tắc:

- **Không** đưa JWT thật, khoá API hay dữ liệu cá nhân thật vào fixture.
- Fixture mô tả **kiểu và sự tồn tại** của field; `null` nghĩa là "phải có, kiểu bất kỳ".
- Khi Edge Function đổi schema có chủ đích: cập nhật fixture + test + ghi CHANGELOG.

## 7. AI Tutor: 8 chế độ và prompt

- System prompt, `MODE_INSTRUCTIONS`, ngân sách token, `sanitizeContext`, `trimHistoryByBudget`
  trong `rust-backend/src/services/prompts.rs` là **bản sao có chủ đích** của
  `supabase/functions/_shared/ai-prompts.ts`. Sửa một bên phải sửa cả hai.
- Test đối chiếu: danh sách 8 chế độ, ngân sách đầu ra (256/512/1024/2048), quy tắc định
  tuyến model, nhãn "DỮ LIỆU, KHÔNG PHẢI CHỈ DẪN" của khối ngữ cảnh.
- Không kiểm tra nội dung AI sinh ra — chỉ kiểm tra cấu trúc, quy tắc và giới hạn.

## 8. Cách chạy

```bash
cd rust-backend
cargo test --test api_contract_tests
cargo test --test ai_gateway_tests --test fallback_tests --test circuit_breaker_tests
cargo test --test auth_tests --test error_handling_tests --test concurrency_tests
```

Supabase và provider giả lập chạy trên `127.0.0.1` trong cùng tiến trình test. CI chạy nhóm
này ở job `contract` (`.github/workflows/rust-backend.yml`).

## 9. Chưa xác minh

- Ghi dữ liệu AI vào **Supabase thật** (cần JWT hợp lệ của học sinh đã gắn phiên).
- Baseline độ trễ của Edge Function (cần deploy staging + khoá AI thật).
- Hành vi của trình duyệt thật khi `mode: 'rust'` (chưa deploy backend).

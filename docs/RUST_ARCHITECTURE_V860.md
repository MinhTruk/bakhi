# Kiến trúc Bá Khí v8.6.0 — Rust Hybrid

> Phiên bản: 8.6.0 · Ngày: 2026-11-23 · Trạng thái: backend đã hoàn thiện và kiểm thử,
> **chưa deploy** (xem [RUST_DEPLOYMENT_V860.md](RUST_DEPLOYMENT_V860.md)).

## 1. Tổng quan

Bá Khí 8.6.0 bổ sung **một backend Rust độc lập** cho những việc backend thực sự có lợi:
điều phối AI provider, xác thực tập trung, giới hạn tần suất, xử lý dữ liệu. Website vẫn là
HTML/CSS/JS tĩnh trên GitHub Pages; Supabase vẫn là nơi lưu dữ liệu, xác thực và realtime.

Không có thay đổi nào trên giao diện người dùng. Không có API cũ nào bị xoá.

```
                    ┌──────────────────────────────────────┐
   Trình duyệt ────►│  HTML + CSS + JavaScript (tĩnh)      │  GitHub Pages
                    │  assets/bakhi/*.js                   │  (không đổi đường dẫn)
                    └───────────────┬──────────────────────┘
                                    │
              BK_BACKEND.mode = 'edge' (mặc định)  │  'rust' (tuỳ chọn)
                        ┌───────────────────────────┴───────────────────┐
                        ▼                                               ▼
        ┌───────────────────────────────┐              ┌────────────────────────────────┐
        │ Supabase Edge Function        │              │ Rust backend (Axum + Tokio)    │
        │ ai-tutor-api / *-api          │              │ rust-backend/                  │
        └───────────────┬───────────────┘              └───────────────┬────────────────┘
                        │                                              │
                        └──────────────┬───────────────────────────────┘
                                       ▼
                     ┌─────────────────────────────────────┐
                     │ Supabase                            │
                     │ PostgreSQL + RLS · Auth · Storage   │
                     │ Realtime · Edge Functions           │
                     └─────────────────┬───────────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────────┐
                     │ AI Providers                        │
                     │ Groq (chính) · Gemini (dự phòng)    │
                     │ OpenAI · Cerebras · OpenRouter …    │
                     └─────────────────────────────────────┘
```

## 2. Vai trò từng thành phần

| Thành phần | Vai trò | Có thay đổi ở 8.6.0? |
|---|---|---|
| `index.html`, các trang môn học, Studio, dashboard | Giao diện, nội dung giáo dục | **Không** (chỉ `?v=` tài nguyên) |
| `assets/bakhi/*.js` | Toàn bộ tương tác, theme, âm nhạc, gamification, Trợ lý AI | Thêm cầu nối backend + khoá cấu hình |
| `supabase/migrations/` | Schema, RLS, hàm `bk_gam_*`, bảng AI | **Không đổi** |
| `supabase/functions/` | Xác thực phiên, ghi dữ liệu, AI Gateway hiện tại | **Không đổi** |
| `rust-backend/` | API + AI Gateway dự phòng, xác thực, xử lý dữ liệu | **Mới** |
| `.github/workflows/rust-backend.yml` | CI riêng cho Rust | **Mới** |

## 3. Những gì chuyển sang Rust

### 3.1. AI Gateway (`rust-backend/src/services/ai_service.rs`)

Đường đi của một câu hỏi khi `BK_BACKEND.mode = 'rust'`:

1. `AuthUser` extractor gọi `GET {SUPABASE_URL}/auth/v1/user` bằng JWT của học sinh.
   Không tin bất kỳ `student_id` nào từ client.
2. Đọc `ai_settings` (một dòng) và `ai_model_routes` (đang bật, theo `position`) bằng
   service role — chỉ đọc **cấu hình máy chủ**, không đọc dữ liệu học tập của người khác.
3. Suy ra `students.id` từ `auth_user_id` của tài khoản đã xác thực.
4. Kiểm tra hạn mức ngày (`daily_requests`, `daily_tokens`) từ `ai_usage_logs`.
5. Hội thoại: dùng lại nếu thuộc về học sinh đó, hoặc tạo mới.
6. Chống gửi trùng trong 12 giây; `retry: true` dùng lại đúng dòng `user` đã lưu.
7. Dựng system prompt: `DEFAULT_SYSTEM_PROMPT` + hướng dẫn chế độ + khối ngữ cảnh có nhãn
   `---BEGIN-CONTEXT---`. Ngữ cảnh đi qua danh sách trắng `sanitize_context`.
8. Cắt lịch sử theo ngân sách `max_input_tokens`; trần đầu ra theo
   `output_tokens_for_mode` (256/512/1024/2048).
9. Lưu câu hỏi **trước** khi gọi AI; chạy chuỗi provider; lưu câu trả lời; cập nhật
   `ai_conversations`; ghi `ai_usage_logs`.
10. Trả về đúng hình dạng `data` của Edge Function (`conversation`, `user_message`,
    `message`, `meta`) nên giao diện không phải sửa.

Chuỗi provider (`run_chain`) hoạt động như sau:

- Danh sách ứng viên: `ai_model_routes` nếu có, ngược lại `ai_settings.provider/model`
  (Primary) và `fallback_provider/model` (Fallback).
- Mỗi ứng viên được thử tối đa `AI_TUTOR_MAX_RETRIES` (0–2) lần, **chỉ** với lỗi tạm thời
  (`TIMEOUT`, `PROVIDER_DOWN`, `RATE_LIMIT`, `EMPTY_RESPONSE`).
- Lỗi `AUTH`, `MODEL_NOT_FOUND`, `BAD_CONFIG` dừng ngay ứng viên đó và chuyển sang ứng viên
  kế tiếp — không thử lại vô ích.
- Timeout tổng của một lượt gọi = `min(ai_settings.timeout_ms, 120s)`, bọc thêm
  `tokio::time::timeout` để hàng đợi provider không treo worker.

### 3.2. Xác thực và phân quyền

- **Không** tự phát minh đăng nhập. Token được Supabase Auth xác nhận.
- Truy vấn dữ liệu của người học (`/api/v1/me` → `students`) dùng **JWT của chính người
  dùng**, nên RLS quyết định quyền đọc.
- Service role chỉ dùng cho ba việc được ghi rõ trong mã: đọc `ai_settings`,
  đọc `ai_model_routes`, ghi/đọc `ai_usage_logs` và hội thoại AI (đúng như Edge Function
  đang làm, vì các bảng này bật RLS **không policy**).
- Không có endpoint quản trị nào trong backend Rust. Founder/Admin Dashboard vẫn đi qua
  `admin-actions` (Edge Function) với kiểm tra `admin_sessions.scope`.

### 3.3. Xử lý dữ liệu (`services/data_service.rs`)

`POST /api/v1/data/learning-stats` nhận dữ liệu học tập do client gửi và trả:

- tổng số câu, số đúng, độ chính xác;
- độ chính xác theo môn;
- 5 chủ đề yếu nhất (chỉ tính chủ đề có ≥ 3 câu);
- sổ tay câu sai theo môn;
- chuỗi ngày học liên tiếp và nhịp học 8 tuần gần nhất (tuần ISO-8601).

Đây là hàm thuần, không I/O. Xem kết luận đánh giá ở mục 6 và trong
[RUST_BENCHMARK_V860.md](RUST_BENCHMARK_V860.md).

## 4. Những gì **giữ nguyên JavaScript** (và vì sao)

| Thành phần | Vì sao không chuyển |
|---|---|
| DOM, modal, toast, menu, animation | Việc của trình duyệt. WASM chỉ thêm tầng trung gian và dung lượng tải. |
| Theme sáng/tối, hiệu ứng mùa | Đọc/ghi `localStorage` + CSS. Chuyển sang Rust không cải thiện gì. |
| Điều hướng, tìm kiếm, command palette | Độ trễ phụ thuộc DOM, không phụ thuộc CPU. |
| Music Player, Studio (Word & Paint) | Web Audio, Canvas, luồng tệp của trình duyệt. |
| Gamification hiển thị | Nguồn sự thật là Supabase; client chỉ vẽ. |
| Report Issue, thông báo realtime | Realtime subscription của Supabase chạy ở client. |
| Tính toán học tập hiện có | Xem [RUST_BENCHMARK_V860.md](RUST_BENCHMARK_V860.md): ở kích thước dữ liệu thật, JavaScript nhanh hơn đáng kể so với gọi mạng. **Không chuyển.** |
| `bakhi-v4.js` (lớp V4 cũ) | Đang phục vụ trang chủ; thay thế là rủi ro không có lợi ích đo được. |

Không có WebAssembly trong 8.6.0. Lý do: chưa có thuật toán nào trên client chứng minh
được lợi ích sau khi đo (mục 6).

## 5. Luồng giao tiếp API

Tất cả endpoint có tiền tố `/api/v1` và trả JSON thống nhất:

```
thành công  200  { "ok": true,  "data": … }
lỗi         4xx  { "ok": false, "error": { "code", "message", "retryable" }, "request_id": … }
```

| Endpoint | Xác thực | Mô tả |
|---|---|---|
| `GET /api/v1/health` | không | Service sống, phiên bản, uptime. Không chạm DB. |
| `GET /api/v1/ready` | không | Kiểm tra Supabase Auth trả lời; 503 nếu không. |
| `GET /api/v1/me` | Bearer JWT | Danh tính đã xác thực + hồ sơ học sinh (RLS). |
| `POST /api/v1/ai/chat` | Bearer JWT | AI Gateway, tương thích `ai-tutor-api` action `chat`. |
| `POST /api/v1/data/learning-stats` | Bearer JWT | Tổng hợp dữ liệu học tập (hàm thuần). |

Mọi phản hồi mang `x-request-id` (nhận từ client nếu hợp lệ, nếu không thì sinh UUID v4).
`Cache-Control: no-store` cho mọi phản hồi có dữ liệu người dùng.

### 5.1. Cơ chế chọn backend ở frontend

`assets/bakhi/bk-supabase.config.js` khai báo:

```js
global.BK_BACKEND = {
    mode: 'edge',        // 'edge' (mặc định) | 'rust'
    rustBaseUrl: '',     // ví dụ 'https://bakhi-api.example.com' (bắt buộc https)
    timeoutMs: 45000,
    fallbackOnError: false
};
```

`bk-ai-tutor.js` gọi backend qua **một** hàm `post()`. Khi `mode === 'rust'` và
`rustBaseUrl` hợp lệ, request đi tới `POST <rustBaseUrl>/api/v1/ai/chat` với cùng body và
cùng hình dạng phản hồi. `window.BKRust.enabled()` / `.baseUrl()` để chẩn đoán.

**Không tự chuyển ngầm về Edge Function khi Rust lỗi.** Chat không idempotent: nếu request
Rust đã lưu câu hỏi rồi mới lỗi, gửi lại sang Edge Function sẽ tạo câu trả lời trùng. Muốn
quay lại hoàn toàn, đặt `mode: 'edge'`.

## 6. Kết luận đánh giá (đo, không đoán)

Số đo đầy đủ ở [RUST_BENCHMARK_V860.md](RUST_BENCHMARK_V860.md). Tóm tắt:

- Backend Rust phục vụ tốt và ổn định: `/health` p50 6,8 ms, `/ai/chat` p50 11,2 ms
  (bao gồm xác thực, đọc cấu hình, ghi database giả lập, gọi provider giả lập), 0 lỗi.
- Tổng hợp dữ liệu học tập trong JavaScript (cùng phép tính, cùng dữ liệu, không HTTP):
  **0,17 ms/lần**. Gọi endpoint Rust: **9,1 ms/lần**. Vì vậy **không** chuyển phần tổng hợp
  sang Rust cho client; endpoint chỉ dùng khi cần tổng hợp phía máy chủ.
- Lợi ích thật của Rust nằm ở **điều phối provider, timeout, thử lại, giới hạn tần suất,
  xác thực tập trung** — những việc một isolate Edge Function khó làm gọn, không phải ở
  tốc độ tính toán.

## 7. Bảo mật

| Hạng mục | Cách làm |
|---|---|
| Xác thực | Supabase Auth (`/auth/v1/user`); token không bao giờ được log hay trả lại. |
| Phân quyền | JWT người dùng cho dữ liệu người dùng (RLS); service role chỉ cho cấu hình + nhật ký AI. |
| CORS | Danh sách origin cấu hình (`CORS_ORIGINS`); từ chối `*`. |
| Kích thước request | `DefaultBodyLimit` (`MAX_BODY_BYTES`, mặc định 256 KiB). |
| Giới hạn tần suất | Theo IP (middleware, 240/phút) và theo người dùng cho AI (30/phút) + hạn mức ngày trong DB. |
| Timeout | Provider: `ai_settings.timeout_ms`; request: `REQUEST_TIMEOUT_MS` (mặc định 45 s). |
| Lỗi | Error envelope cố định; không stack trace, không SQL, không body thô của provider. |
| Khoá | Chỉ từ biến môi trường/secrets; `Settings` in `Debug` đã che khoá (có unit test). |
| Log | `sanitize_detail()` che mọi chuỗi giống khoá (`AIza…`, `gsk_…`, `sk-…`, `eyJ…`). |

## 8. Những điểm phải xử lý khi vận hành nhiều instance

- Bộ giới hạn tần suất nằm trong bộ nhớ tiến trình: mỗi instance đếm riêng. Hạn mức theo
  ngày của AI vẫn chính xác vì nằm trong `ai_usage_logs` (database).
- Chống gửi trùng (12 giây) dựa trên dữ liệu đã lưu, nên vẫn đúng khi có nhiều instance.
- Khi cần giới hạn tần suất chính xác toàn cụm, thay `RateLimiter` bằng Redis — chưa làm
  vì quy mô hiện tại chưa cần.

## 9. Tài liệu liên quan

- [RUST_DEPLOYMENT_V860.md](RUST_DEPLOYMENT_V860.md) — chạy, build, deploy, secret.
- [RUST_MIGRATION_V860.md](RUST_MIGRATION_V860.md) — đã chuyển gì, chưa chuyển gì, rollback.
- [RUST_BENCHMARK_V860.md](RUST_BENCHMARK_V860.md) — số đo và giới hạn của số đo.
- [ARCHITECTURE.md](ARCHITECTURE.md) — kiến trúc tổng thể của website.
- [AI_TUTOR_ARCHITECTURE.md](AI_TUTOR_ARCHITECTURE.md) — AI Tutor phía Edge Function.

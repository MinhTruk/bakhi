# Migration Bá Khí v8.6.0 — trạng thái chuyển đổi và rollback

> Nguyên tắc: **Preserve Everything.** Không tính năng nào bị xoá, không API cũ nào bị gỡ,
> không schema nào bị đổi. Backend Rust là **lựa chọn thêm vào**, mặc định tắt.

## 1. Bảng trạng thái

| # | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Backend Rust (Axum/Tokio) | ✅ Hoàn thành | Biên dịch, 58 test, clippy `-D warnings` sạch |
| 2 | Health / Ready | ✅ Hoàn thành | `/api/v1/health`, `/api/v1/ready` |
| 3 | Xác thực JWT qua Supabase Auth | ✅ Hoàn thành | Không tự phát minh đăng nhập |
| 4 | Bảo toàn RLS | ✅ Hoàn thành | Truy vấn hồ sơ dùng JWT người dùng |
| 5 | AI Gateway (chat) | ✅ Hoàn thành (mã + test) | Tương thích `ai-tutor-api` action `chat` |
| 6 | Chuỗi provider + fallback + retry | ✅ Hoàn thành | `ai_model_routes` → `ai_settings` |
| 7 | Ghi hội thoại/tin nhắn/usage | ⚠️ Có mã, **chưa kiểm thử với Supabase thật** | Mục 4 |
| 8 | Streaming SSE | ❌ Không làm | Xem mục 5 |
| 9 | Endpoint quản trị (admin.*) | ❌ Không làm | Vẫn dùng `admin-actions` |
| 10 | Tổng hợp dữ liệu học tập | ✅ Hoàn thành (endpoint) | Chưa nối vào UI — có chủ đích, xem mục 6 |
| 11 | Chọn backend ở frontend | ✅ Hoàn thành | `BK_BACKEND`, mặc định `edge` |
| 12 | Docker + CI | ✅ Hoàn thành | Workflow chưa chạy trên GitHub (chưa push) |
| 13 | Deploy backend | ❌ Chưa | Thiếu hosting + secret |
| 14 | WebAssembly | ❌ Không làm | Không có lợi ích đo được |
| 15 | Migration database | ➖ Không có | Không đổi schema |

## 2. API cũ và API mới

| Chức năng | API cũ (vẫn dùng) | API mới (tuỳ chọn) | Tương thích |
|---|---|---|---|
| Trợ lý AI | `POST /functions/v1/ai-tutor-api` action `chat` | `POST /api/v1/ai/chat` | Cùng body, cùng `data` trả về |
| Phiên/hồ sơ | `student-profile`, `bind-student-session` | `GET /api/v1/me` | Chỉ đọc; không thay luồng đăng nhập |
| Gamification | `gamification-api` | — | Không chuyển |
| Báo cáo | `report-api`, `admin-actions` | — | Không chuyển |
| Chat người–người | `chat-api` | — | Không chuyển |
| Thông báo/changelog | `bk-cloud.js` + Realtime | — | Không chuyển |
| Tổng hợp dữ liệu | `bk-learning.js` (client) | `POST /api/v1/data/learning-stats` | Không thay thế |

Không có endpoint cũ nào bị xoá hay đổi hình dạng.

## 3. Thay đổi tương thích đã thực hiện

1. **Khoá cấu hình mới `BK_BACKEND`** trong `assets/bakhi/bk-supabase.config.js`, mặc định
   `mode: 'edge'` ⇒ hành vi hiện tại không đổi.
2. **Một điểm vào duy nhất** trong `assets/bakhi/bk-ai-tutor.js`: hàm `post()`. Khi
   `mode === 'rust'` mới gọi backend Rust; nếu không, code cũ chạy y nguyên.
3. **`window.BKRust`** chỉ để chẩn đoán (`enabled()`, `baseUrl()`), không ảnh hưởng UI.
4. **Phiên bản 8.6.0** đồng bộ ở mọi nguồn: `bk-version.js`, `bk-devboard.js`,
   `bk-founder.js`, `bk-founder-gamification.js`, `bk-ai-tutor.js`,
   `supabase/functions/admin-actions/index.ts`, 126 tệp HTML (`?v=`), `CHANGELOG.md`.
5. **`tools/bump-version.js`** bổ sung `bk-ai-tutor.js` vào danh sách tệp phiên bản, để lần
   bump sau không bỏ sót (lỗi này có từ 8.5.x, được phát hiện khi bump 8.6.0).
6. **`tools/qa/v855-ui.js`, `tools/qa/v856-ui.js`** cập nhật kỳ vọng phiên bản 8.6.0.

Không sửa dòng nội dung giáo dục nào: `node tools/content-integrity.js verify` báo OK.

## 4. Phần chưa kiểm thử (trung thực)

**Ghi hội thoại AI vào Supabase thật.** Đường ghi (`ai_conversations`, `ai_messages`,
`ai_conversations` PATCH, `ai_usage_logs`) đã được kiểm thử **qua Supabase giả lập** trong
`rust-backend/tests/integration.rs` (16 test, bao gồm happy path, lỗi provider, hạn mức,
dedupe, body quá lớn, CORS). Nó **chưa** được chạy với project Supabase thật vì môi trường
build không có JWT hợp lệ của học sinh.

Trước khi bật `mode: 'rust'` cho người dùng thật, cần làm bài kiểm thử sau trên môi trường
staging:

1. Đăng nhập một tài khoản học sinh thật trên bản staging của website.
2. Hỏi 3 câu trong `/ai-tutor/`, tải lại trang, mở lại hội thoại ⇒ thấy đủ 6 tin nhắn.
3. Kiểm tra `ai_messages` có `provider`/`model`/`tokens_in`/`tokens_out` đúng.
4. Kiểm tra `ai_usage_logs` có bản ghi `ok = true` và `latency_ms > 0`.
5. Gửi cùng câu hỏi hai lần trong 12 giây ⇒ nhận `DUPLICATE` (không tạo tin nhắn thứ hai).
6. Bấm "Thử lại" ⇒ không sinh thêm dòng `user` trùng.

Nếu bất kỳ bước nào sai: đặt `mode: 'edge'` (xem mục 7) và báo lỗi trước khi tiếp tục.

## 5. Những gì **cố ý không** chuyển

- **Streaming SSE.** Edge Function hiện tại **chưa** hỗ trợ streaming (`streaming_enabled`
  là cờ chưa có tác dụng). Vì vậy không có trải nghiệm nào bị mất khi backend Rust cũng
  không stream. Nếu sau này bật streaming, làm ở **một** nơi rồi mới chuyển cả hai.
- **Endpoint quản trị.** `admin.*` nằm trong `admin-actions` với kiểm tra
  `admin_sessions.scope`. Chuyển sang Rust mà không có phiên quản trị tương đương sẽ tạo
  ra lỗ hổng phân quyền. Giữ nguyên.
- **Chat người–người, báo cáo, gamification, Studio, nhạc, theme.** Lợi ích bằng 0 hoặc âm.
- **WebAssembly.** Đo được: JavaScript xử lý dữ liệu học tập trong 0,17 ms; gọi mạng chậm
  hơn 50 lần. Chuyển sang WASM chỉ thêm dung lượng tải.

## 6. Vì sao chưa nối `/data/learning-stats` vào giao diện

Endpoint hoạt động và có test, nhưng **không** được gọi từ UI. Lý do: phép tổng hợp hiện
có trong `bk-learning.js` chạy tại chỗ trong ~0,17 ms; gọi mạng chậm hơn và làm chậm trang.
Việc nối vào UI chỉ có lợi khi cần tổng hợp phía máy chủ (ví dụ xuất báo cáo cho giáo viên,
hoặc dữ liệu quá lớn để gửi lên trình duyệt). Khi đó dùng endpoint này thay vì viết lại.

## 7. Rollback

### 7.1. Rollback chỉ phần AI (nhanh nhất, không cần deploy lại)

```js
// assets/bakhi/bk-supabase.config.js
global.BK_BACKEND.mode = 'edge';
global.BK_BACKEND.rustBaseUrl = '';
```

Sau đó bump phiên bản bản vá (`node tools/bump-version.js 8.6.1`) để trình duyệt tải lại
tệp cấu hình (tệp được nạp với `?v=`). Trợ lý AI trở lại Edge Function ngay.

**Không cần** dừng backend Rust: nó không nhận request nào khi `mode: 'edge'`.

### 7.2. Rollback toàn bộ mã nguồn

```bash
git revert --no-edit <commit-8.6.0>
```

Không có migration database, không có dữ liệu nào bị chuyển đổi, nên revert mã là đủ.
Dữ liệu AI vẫn nằm trong các bảng cũ (`ai_conversations`, `ai_messages`) — backend Rust
dùng **cùng** bảng, cùng hình dạng, nên không mất hội thoại khi đổi qua lại.

### 7.3. Rollback tệp phiên bản

Toàn bộ `?v=8.6.0` trong 126 tệp HTML được sinh bằng `tools/bump-version.js`. Muốn quay
lại: `node tools/bump-version.js 8.5.6 --date 2026-11-23` (CHANGELOG đã có mục 8.5.6).

## 8. Việc người quản trị cần làm để hoàn tất

1. Chọn nền tảng chạy container (mục 7 của [RUST_DEPLOYMENT_V860.md](RUST_DEPLOYMENT_V860.md)).
2. Đặt secret: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `AI_TUTOR_API_KEY` (+ dự phòng nếu có), `CORS_ORIGINS`.
3. Deploy, kiểm tra `/api/v1/health` và `/api/v1/ready`.
4. Chạy bài kiểm thử staging ở mục 4.
5. Đặt `BK_BACKEND.mode = 'rust'` + `rustBaseUrl`, bump bản vá, kiểm tra Trợ lý AI.
6. Theo dõi 24 giờ: tỉ lệ lỗi, p95 của `/ai/chat`, số lượt `AUTH`/`MODEL_NOT_FOUND`.

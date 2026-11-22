---
id: v851-ai-tutor-deploy
title: "v8.5.1: AI Tutor đã deploy và những gì rút ra từ production"
category: decision
status: active
created: "2026-11-22T10:15:23"
updated: "2026-11-22T10:15:23"
---

<!-- compiled_truth -->
Trợ lý AI (AI Tutor) **đã được deploy thật** lên project Supabase `bakhi` ngày 2026-11-22 (phiên bản 8.5.1):
3 migration `ai_*`, Edge Function `ai-tutor-api` (ACTIVE, `verify_jwt = false`, tự xác thực qua
`student_devices`), secret `AI_TUTOR_API_KEY` đã có. Xác minh thật: auth trả `401 NO_SESSION` /
`BAD_SESSION`; `bootstrap` trả `200` với 8 chế độ; hội thoại/tin nhắn/usage được lưu; RLS cho phép
đọc dữ liệu của mình, **0 dòng** khi đọc của người khác, **403** khi ghi trực tiếp; thử lại không
tạo dòng trùng; giao diện `/ai-tutor/` đã được xem trên trình duyệt thật.

Bốn quyết định bền vững rút ra (không suy ra được từ mã):

1. **Model.** Google đã ngừng cấp `gemini-2.5-flash` cho người dùng mới (404 *"no longer available
   to new users"*); các biến thể `gemini-3.8-flash-001/-exp/-latest/-preview/-thinking` cũng 404.
   Chỉ `gemini-3.8-flash` tồn tại, và nó hay trả `503 high demand` / `429 quota exceeded` với khoá
   miễn phí. Vì vậy mặc định là `gemini-3.8-flash`, và muốn ổn định phải bật thanh toán hoặc cấu
   hình provider dự phòng. Đừng "sửa" bằng cách đoán tên model khác.
2. **Chẩn đoán.** Lỗi provider trước đây bị nuốt nên không ai biết vì sao khoá/model sai. Nay
   `ai_provider_diagnostics` (RLS bật, **không policy**, revoked khỏi `anon`/`authenticated`) là
   nơi duy nhất lưu mã HTTP + thông điệp đã lọc khoá. Khi trợ lý báo lỗi, đọc bảng này trước.
3. **Thử lại.** `retry: true` để máy chủ dùng lại đúng dòng `user` đã lưu. Gửi lại nguyên văn câu
   hỏi làm hội thoại có hai bong bóng và hai dòng DB — lỗi thật đã gặp và đã sửa ở 8.5.1.
4. **Đường deploy.** CLI Supabase cần mật khẩu database cho `db push`, nên migration được áp qua
   Management API (`POST /v1/projects/{ref}/database/query`) trong một transaction kèm dòng
   `supabase_migrations.schema_migrations`. Function deploy bằng
   `npx supabase functions deploy ai-tutor-api --no-verify-jwt --use-api --yes --remote=<ref>`
   (`--project-ref` đã deprecated ở CLI 3.x). Không reset database.

Còn chặn: câu trả lời AI thật (hạn mức provider) và việc push `main` (chờ provider sống).


## Timeline

- time: 2026-11-22T10:15:23
  kind: decision
  summary: "Created this page: v8.5.1: AI Tutor đã deploy và những gì rút ra từ production"
  source: created via brain create-page
  affects: [v851-ai-tutor-deploy]

- time: 2026-11-22T10:15:23
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v851-ai-tutor-deploy]

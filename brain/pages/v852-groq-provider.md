---
id: v852-groq-provider
title: "8.5.2 — Groq là provider mặc định của AI Tutor"
category: decision
status: active
created: "2026-11-22T11:31:07"
updated: "2026-11-22T11:31:07"
---

<!-- compiled_truth -->
# Quyết định

Từ 8.5.2, AI Tutor mặc định dùng **Groq** với model `openai/gpt-oss-20b`; Google AI Studio
(`gemini-3.8-flash`) là provider **dự phòng**. Thay đổi này chỉ là cấu hình + kiến trúc,
không viết lại AI Tutor.

# Vì sao

Khoá Gemini miễn phí liên tục trả `503 high demand` / `429 quota exceeded`, làm mọi câu hỏi
thất bại. Groq dùng giao thức OpenAI-compatible nên dùng chung một adapter, không thêm nhánh
mã riêng.

# Ràng buộc đi kèm

- `PROVIDER_CATALOG` trong `supabase/functions/_shared/ai-providers.ts` là nguồn duy nhất
  khai báo provider (giao thức, base URL, tên secret, context limit, max output, timeout).
- Ngân sách token đầu ra theo chế độ nằm duy nhất ở `outputTokensForMode()` /
  `MODE_MAX_TOKENS`: 256 / 512 / 1024 / 2048; `hint` và `socratic` không được nâng trần.
- Retry tối đa `AI_TUTOR_MAX_RETRIES` (0–2) rồi cooldown 60 giây cho provider vừa lỗi.
  `AUTH`/`MODEL_NOT_FOUND`/`BAD_CONFIG` không kích hoạt dự phòng.
- Khoá chỉ nằm trong Supabase Edge Function Secrets; không bao giờ xuống client hay vào bảng.
- `admin.provider.verify` (chỉ Founder) kiểm tra model bằng GET `/models`, không tốn token.
- Thống kê dùng `bakhi_ai_usage_stats()`; `fell_back` và `tokens_estimated` phải ghi trung thực.

# Trạng thái

Mã nguồn xong, cổng QA offline xanh. Migration 00003, deploy function và push frontend
**chưa** thực hiện — chờ người quản trị cho phép và đặt khoá Groq trong Supabase Secrets.


## Timeline

- time: 2026-11-22T11:31:07
  kind: decision
  summary: "Created this page: 8.5.2 — Groq là provider mặc định của AI Tutor"
  source: created via brain create-page
  affects: [v852-groq-provider]

- time: 2026-11-22T11:31:07
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v852-groq-provider]

- time: 2026-11-22T11:31:07
  kind: decision
  summary: "Chuyển mặc định AI Tutor sang Groq openai/gpt-oss-20b, Google làm dự phòng; thêm token budget theo chế độ, cooldown 60s, thống kê usage và kiểm tra model."
  affects: [v852-groq-provider]

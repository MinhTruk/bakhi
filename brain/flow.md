---
slug: flow
title: Key flows
role: key flows
updated: "2026-11-21T12:55:05"
---

# Key flows

## End-to-end path of a typical request

Học sinh mở một trang bài học trên GitHub Pages:

```mermaid
sequenceDiagram
  participant U as Học sinh
  participant P as Trang bài học (HTML tĩnh)
  participant C as bk-core (BK.store)
  participant N as bk-cloud (notify-only)
  participant S as Supabase
  U->>P: mở /ktgk1/...
  P->>C: nạp bakhiLearn.v1, validate, phục hồi nếu hỏng
  P->>N: data-bk-notify-only=1 → chỉ chuông + realtime
  N->>S: đọc thông báo / trạng thái đã đọc cục bộ
  U->>P: làm câu hỏi, xem giải thích
  P->>C: ghi tiến trình, sổ tay câu sai, tín hiệu thành tích
  C-->>P: render lại tiến trình cục bộ (không chờ mạng)
```

## Other important flows

- **Đồng bộ tiến trình (trang chủ, chế độ đầy đủ):** `bk-cloud` nhận diện học sinh → đẩy sự kiện học tập + idempotency key lên `gamification-api` → máy chủ cộng XP trong transaction và gọi `bk_gam_evaluate`.
- **Trao thành tích của Founder:** dashboard → `admin-actions` → hàm `bk_gam_grant_*`, kiểm tra scope ở máy chủ.
- **Report Issue:** nút nổi (kéo được, neo trên chuông) → `report-api`; quản trị xử lý ở tab Report của `bk-devboard`.
- **Chèn lớp nâng cấp vào trang mới:** `tools/integrate-pages.js` → `tools/inject-favicon.js` → `node tools/content-integrity.js verify`.

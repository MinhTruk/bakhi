---
slug: roadmap
title: Roadmap
role: milestones
updated: "2026-11-21T12:55:06"
---

# Roadmap

## Milestones

Mốc dưới đây là kế hoạch **tạm thời**, suy ra từ trạng thái hiện tại (8.3.8, tháng 11/2026) — không phải cam kết phát hành.

```mermaid
gantt
  title Bá Khí — chặng tiếp theo
  dateFormat YYYY-MM-DD
  section Ổn định 8.3.x
  Sửa lỗi gamification còn lại      :done, a1, 2026-11-01, 21d
  Rà soát bảo mật RLS + Edge Function :active, a2, 2026-11-21, 14d
  section 8.4
  Chuyển QA DOM vào CI              :b1, 2026-12-05, 21d
  Hợp nhất tìm kiếm học tập          :b2, after b1, 14d
  section 9.0
  Đo lường hiệu năng trang bài học  :c1, 2027-01-15, 21d
  Rà soát lại toàn bộ nội dung      :c2, after c1, 21d
```

## Ghi chú

- Không đưa mốc "thi thử/tính giờ" vào roadmap — xem [[no-exam-timers]].
- Mọi thay đổi hành vi vẫn phải có mục trong `CHANGELOG.md` và giữ [[content-integrity-invariant]] xanh.

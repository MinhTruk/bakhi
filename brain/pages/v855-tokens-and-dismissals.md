---
id: v855-tokens-and-dismissals
title: "v8.5.5: Design Tokens dùng chung, xoá thông báo, sidebar mobile"
category: decision
status: active
created: "2026-11-22T23:59:29"
updated: "2026-11-23T00:00:09"
---

<!-- compiled_truth -->
# v8.5.5 — Design Tokens, xoá thông báo, sidebar mobile

## Quyết định

1. **Một nguồn màu duy nhất:** `assets/bakhi/bk-tokens.css` (token `--bk-*`, bảng tối
   `#0b0f14 / #161f2b / #202c3a / #293646 / #e8edf5 / #9aa8b8 / #718096`). Token cũ
   `--bkl-*` của `bk-core.css` chỉ còn là ánh xạ `var(--bk-*)`; `--bkc-n-*`, `--bkrep-*`,
   `--bkai-*`, nhạc, dashboard đều trỏ về token chung.
2. **Tối là mặc định, không phụ thuộc `class="dark"`.** Nhiều trang (`studio/`, `admin/`,
   `founder/`, trang bài học) không đặt class này; trước 8.5.5 chúng rơi vào nhánh sáng.
   Chế độ sáng chỉ bật bằng `html.light` (do `bk-shell` đặt khi người học chọn).
   `html:not(.dark)` bị cấm cho nhánh sáng — đó là nguyên nhân Report Panel trắng.
3. **Xoá thông báo = xoá bản hiển thị.** Không có bảng mới, không API mới:
   `announcement_reads.dismissed_at` (RLS ghi sẵn có) + `report_notifications.dismissed_at`
   (action `notifications.dismiss` của `report-api`) + `bakhiNotifyDismissed.v1` trên thiết bị.
   Thông báo cập nhật phiên bản (`changelog_version`) và nhóm `changelog` không xoá được;
   xoá hàng loạt đi qua `canDismissAnnouncement()`.
4. **Sidebar lịch sử AI trên điện thoại** là biến thể CSS của cùng `.bkai-side` (off-canvas
   dưới 860px, mở bằng `#bkaiMenuBtn`), không dựng kho lịch sử thứ hai.
5. **Header cửa sổ AI** xếp bằng `order` để tiêu đề luôn trái, nút đóng luôn phải, cùng hàng.

## Hệ quả / điều cần nhớ

- `tools/integrate-pages.js` chèn `bk-tokens.css` cho mọi tệp HTML; đừng thêm bảng màu
  thứ hai trong component mới.
- `gamification-health.js` từng giả định "tệp migration mới nhất chứa `bk_gam_health_drift`";
  đã đổi sang bản định nghĩa cuối cùng của chính hàm, nên thêm migration không còn báo sai.
- QA: `tools/qa/v855-ui.js` (tĩnh) + `cloud-smoke` mục [4b] (DOM thật cho việc xoá).


## Timeline

- time: 2026-11-22T23:59:29
  kind: decision
  summary: "Created this page: v8.5.5: Design Tokens dùng chung, xoá thông báo, sidebar mobile"
  source: created via brain create-page
  affects: [v855-tokens-and-dismissals]

- time: 2026-11-23T00:00:09
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v855-tokens-and-dismissals]

- time: 2026-11-23T00:00:09
  kind: decision
  summary: "8.5.5: tokens --bk-* duy nhất, tối mặc định (html.light mới là sáng), xoá thông báo qua dismissed_at + bakhiNotifyDismissed.v1, sidebar AI off-canvas trên mobile"
  affects: [v855-tokens-and-dismissals]

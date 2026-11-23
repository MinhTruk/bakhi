---
id: v856-theme-sync-and-notification-admin
title: "v8.5.6: một nguồn theme toàn site, xoá mọi thông báo thường, quản trị thông báo/báo cáo hàng loạt"
category: decision
status: active
created: "2026-11-23T06:26:37"
updated: "2026-11-23T06:26:37"
---

<!-- compiled_truth -->
## Bối cảnh

8.5.5 đã gom màu về `bk-tokens.css` nhưng vẫn còn ba lỗi kiến trúc khiến giao diện không
đồng bộ: trang chủ chỉ bỏ `.dark` mà không thêm `.light`; `BKShell.applyTheme()` bị chặn
bởi `themeCapable()` (`#themeIcon`/`body.bk-app`) nên trang bài học, Studio và quản trị
luôn tối; `/admin` dùng khoá `bkAdminTheme` riêng. 8.5.6 sửa cả ba.

## Quyết định

- **Một nguồn trạng thái giao diện:** khoá `localStorage.theme` (`dark` | `light`).
  `assets/bakhi/bk-theme-boot.js` chạy đồng bộ trong `<head>`, đặt `html.dark`/`html.light`
  + `data-bk-theme` trước lần vẽ đầu tiên (chống FOUC) và tự đồng bộ giữa các tab bằng
  `storage`. `bk-shell.js` và `bk-admin-theme.js` đều đi qua `BKThemeBoot`; khoá cũ
  `bkAdminTheme` chỉ được đọc một lần để chuyển đổi.
- **Chèn script khởi tạo phải hash-neutral:** `integrate-pages.js` chèn vào ĐẦU MỘT DÒNG
  MỚI ngay sau dòng chứa `<head>` (không chèn trước `<!DOCTYPE>` vì mất doctype → quirks
  mode; không sửa byte dòng cũ vì hash nội dung giáo dục sẽ đổi).
- **`.bkc-dark` không còn ép nền tối** — bảng thông báo, hộp xác nhận, xem trước changelog
  đổi theo Light/Dark. Màn hình bảo trì vẫn cố ý đen tuyền ở cả hai giao diện (trạng thái
  chặn toàn site, `maintenance-smoke` giữ luật này).
- **Xoá thông báo:** mọi thông báo thường xoá được, kể cả cập nhật phiên bản (đảo quyết
  định 8.5.5). Chỉ hai loại bị chặn: thông báo quản trị phiên (`isSessionNotice()`) và
  phản hồi báo cáo — loại sau vẫn đi theo cơ chế báo cáo hiện có, không dùng nút xoá
  thông thường và không bị xoá hàng loạt. Phân loại bằng DỮ LIỆU, không so văn bản.
- **Ghi máy chủ trước, giao diện sau:** xoá thất bại thì thông báo được giữ lại và người
  học thử lại; mục `changelog` lưu mốc `changelog:<id>` trên thiết bị.
- **Founder Dashboard:** chọn nhiều qua `S.notif.selected` (làm mới mỗi lần tải danh sách)
  + `announcements.bulkDelete` trả `deletedIds`/`failed`; xoá báo cáo qua `reports.delete`
  với kiểm tra trạng thái ở máy chủ (`resolved`/`closed`); khu vực nhận diện đầu tab Report
  đếm báo cáo chưa hoàn thành và lọc `status='active'`.

## Hệ quả

- Không có migration 8.5.6: dùng `announcement_reads.dismissed_at` (đã có từ 8.5.5) và
  `ON DELETE CASCADE` sẵn có của `report_messages`/`report_activity_logs`/
  `report_notifications`.
- Phải deploy lại Edge Function `admin-actions` để có `announcements.bulkDelete`,
  `reports.delete` và bộ lọc `active`.
- QA mới `tools/qa/v856-ui.js`; `v855-ui.js` và `cloud-smoke` [4b] đã cập nhật theo hành vi
  mới.


## Timeline

- time: 2026-11-23T06:26:37
  kind: decision
  summary: "Created this page: v8.5.6: một nguồn theme toàn site, xoá mọi thông báo thường, quản trị thông báo/báo cáo hàng loạt"
  source: created via brain create-page
  affects: [v856-theme-sync-and-notification-admin]

- time: 2026-11-23T06:26:37
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [v856-theme-sync-and-notification-admin]

- time: 2026-11-23T06:26:37
  kind: decision
  summary: "8.5.6: một nguồn theme (bk-theme-boot), mọi thông báo thường xoá được, bulk delete + xoá báo cáo hoàn thành ở Founder"
  affects: [v856-theme-sync-and-notification-admin]

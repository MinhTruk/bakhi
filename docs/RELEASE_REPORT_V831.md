# BÁO CÁO PHÁT HÀNH — Bá Khí v8.3.1

Ngày: 21/11/2026 · Commit code: `6267a31` · Nhánh: `main` · Project: `wzvslyabhizsiggurwdq`

## 1. Root Cause Analysis

**Lỗi:** “Chưa tải được tiến trình — Chưa kết nối máy chủ Bá Khí.” trên `/gamification/`.

- **Nguyên nhân gốc:** mô-đun gamification lấy API máy chủ từ **sai đối tượng**.
  `bk-core.js:2217` gán `BK.cloud = cloud` — một adapter localStorage (khai báo dòng 1324,
  chỉ có `init/push/pull/merge`, **không có** `gamificationApi`). Lớp máy chủ thật là
  `window.BKCloud` (`bk-cloud.js:2536`), nơi `gamificationApi` được định nghĩa (dòng 2570).
- **Tệp/hàm liên quan:** `assets/bakhi/bk-gamification.js`, hàm `api()` (bản 8.3.0 dòng 295)
  và `studentId()` (dòng 134).
- **Request bị lỗi:** **không có request nào được gửi.** `api()` trả `null` → `call()`
  reject ngay bằng `new Error('Chưa kết nối máy chủ Bá Khí.')`; `refresh()` gán nguyên câu
  đó vào `S.error` và render nguyên văn. Vì vậy lỗi xuất hiện tức thời, không phụ thuộc
  mạng, tài khoản hay RLS.
- **Backend response trước khi sửa:** không tồn tại (không có lời gọi). Bằng chứng gián
  tiếp: `xp_transactions` = 0 dòng sau khi 8.3.0 phát hành, dù 18 thiết bị đã gắn học sinh.
- **Vì sao QA không phát hiện:** `gamification-smoke` tự tạo stub
  `BK.cloud = { identity, gamificationApi }` — hình dạng không tồn tại trong production.
- **Cách sửa:** thêm `cloudApi()`/`cloudIdentity()` ưu tiên `window.BKCloud` (kiểm tra hàm
  tồn tại), chỉ fallback `BK.cloud` khi nó thật sự có `gamificationApi`.
- **Xác minh sau sửa:** stub QA đổi đúng hình dạng production; thêm 29 ca loader
  (`BKCloud` thành công, `BK.cloud` giả bị bỏ qua, 401/409/mạng/5xx, cache, retry,
  phản hồi cũ); production trả `8.3.1` và tệp đang phục vụ có đúng nhánh `BKCloud`;
  `bk_gam_state` cho học sinh thật trả dữ liệu hợp lệ (đọc, rollback).

Các lỗi phụ sửa trong cùng đợt: một thông báo chung cho mọi lỗi; phản hồi `state` cũ ghi
đè XP vừa cộng; retry phát sinh 8–9 request; mất dữ liệu đã tải khi làm mới thất bại;
thiếu lối vào `/gamification/`.

## 2. Bug Fix Summary

- **Đã sửa:** LỖI 1 (loader sai lớp máy chủ), LỖI 2 (thiếu điều hướng), LỖI 3 (race
  state/event), LỖI 4 (request lặp), LỖI 5 (thông báo lỗi chung), LỖI 6 (QA sai hình dạng
  production).
- **Còn lại:** xem mục 8.
- **Không tái hiện được:** không có báo cáo lỗi nào khác từ người dùng ngoài hai lỗi trên.
- **Bị chặn do môi trường:** kiểm thử phiên học sinh thật/trình duyệt và nội dung Boss.

## 3. Gamification Summary

| Hạng mục | Trạng thái sau 8.3.1 |
|---|---|
| XP | Engine giữ nguyên; loader đã tải được; sự kiện gửi qua `BKCloud`; chống trùng, giới hạn/ngày |
| Level | Công thức JS ↔ Postgres khớp 9 mốc; thanh tiến trình dùng `level_xp/level_span` từ server |
| Skill Tree | 15 node, 5 nhánh; trạng thái do server trả; client không mở node |
| Achievement | 17 định nghĩa; server mở khoá, client chỉ hiển thị |
| Mission | 6 nhiệm vụ được tạo khi sync (ngày/tuần); nhận thưởng qua `mission.claim` |
| Boss Challenge | Luồng chạy, đề không lộ đáp án; **chưa có nội dung** do quản trị biên soạn |
| Reward & Inventory | 6 vật phẩm catalog; equip qua server; idempotent |
| Navigation | Mục “Tiến trình học tập” trong menu tài khoản, `aria-current`, không phụ thuộc loader |
| Dashboard | 6 khu vực; giữ dữ liệu đã tải khi lỗi một phần |

## 4. Data & Security Summary

- **Database changes:** không có. Không migration mới.
- **RLS:** giữ nguyên 15 bảng, 0 policy ghi; đã kiểm tra lại sau deploy.
- **API/Edge Functions:** chỉ deploy lại `admin-actions` (SERVER_VERSION). `gamification-api`
  không đổi.
- **Đồng bộ:** Supabase là nguồn sự thật; cache client chỉ để hiển thị, khoá theo `studentId`.
- **Toàn vẹn:** `bk_gam_admin_drift()` = 0; `gamification-db-check` 15/15.
- **Phân quyền:** học sinh chỉ đọc dữ liệu của mình; admin/founder dùng `x-admin-token`;
  không có endpoint nào nhận `student_id` từ trình duyệt cho hành động của học sinh.

## 5. QA Summary

| Bộ | Kết quả |
|---|---|
| `gamification-smoke` | 31/31 PASS |
| `gamification-progress-load-smoke` | 29/29 PASS |
| `gamification-navigation-smoke` | 17/17 PASS |
| `xp-level-integrity` | 12/12 PASS |
| `gamification-security-smoke` | 30/30 PASS |
| `gamification-db-check` (project thật, rollback) | 15/15 PASS |
| 17 bộ QA cũ | tất cả PASS (cập nhật hợp lệ: thứ tự menu shell có thêm mục mới) |
| `content-integrity`, `version-audit`, `supabase-config`, `node --check` | PASS |

**Tổng:** 134 ca gamification đạt, 0 lỗi, 0 FAIL. Không có ca nào được đánh dấu PASS khi
chưa chạy.

- **NOT RUN:** đăng nhập học sinh thật + làm quiz thấy XP tăng; đồng bộ hai thiết bị;
  kiểm tra giao diện nhiều kích thước màn hình (không có trình duyệt trong môi trường).
- **BLOCKED:** chơi Boss thật (chưa có thử thách do quản trị biên soạn).

## 6. Cleanup Summary

- **Code cũ đã loại bỏ:** trường `S.error` (chuỗi lỗi chung) không còn dùng; nhánh render
  lỗi cũ thay bằng `renderGate`/`renderPartialNotice`.
- **Module hợp nhất:** vẫn chỉ một Progress Loader (`refresh`) và một nguồn dữ liệu
  (`BKCloud.gamificationApi`); không tạo loader/endpoint thứ hai.
- **API thay thế:** không có; dùng lại `gamification-api` hiện hữu.
- **Dữ liệu migrate:** không cần.
- **Giữ lại và lý do:** `BK.cloud` (adapter localStorage của core) vẫn cần cho các tính
  năng cũ; gamification chỉ fallback khi nó có API. Badge/Title giữ nguyên.

## 7. Deployment Summary

- Commit: `6267a31` (code + QA + docs) và commit tài liệu báo cáo này.
- Push: `05039aa..6267a31` → `main`, fast-forward, không force.
- Supabase: deploy lại `admin-actions` (8.3.1). Không đổi `gamification-api`.
- GitHub Pages: 8.3.1 phục vụ sau ~32 giây; `/gamification/` 200; admin nạp mô-đun 8.3.1;
  shell có đúng một lối vào Tiến trình.
- Kiểm tra production: version, tệp tĩnh, lối vào, trạng thái Edge Function, dữ liệu
  `bk_gam_state` của học sinh thật (read-only), `bk_gam_admin_drift` = 0.

## 8. Vấn đề còn lại

1. **Chưa xác minh bằng phiên học sinh thật trên trình duyệt** (XP tăng sau quiz, đồng bộ
   hai thiết bị). Nguyên nhân là môi trường không có trình duyệt/phiên thật; không tạo dữ
   liệu giả. Đề nghị: đăng nhập một tài khoản học sinh, làm một quiz ≥ 3 câu, mở
   `/gamification/` và kiểm tra XP + lịch sử; sau đó mở trên thiết bị thứ hai.
2. **Boss chưa có nội dung** — cần quản trị viên soạn thử thách trong Admin → Tiến trình.
3. **Không backfill XP** cho hoạt động trước 8.3.1.
4. Câu sai trong Boss chưa tự vào Sổ tay câu sai.

## 9. Trạng thái cuối

**PARTIALLY READY**

Lý do: lỗi chặn (không tải được tiến trình) đã được truy nguyên và sửa tận gốc, có bằng
chứng ở mã nguồn, ở 134 ca QA, ở dữ liệu Supabase đọc thật và ở tệp production đang phục
vụ; điều hướng đã có. Chưa đạt PRODUCTION READY vì các tiêu chí “đăng nhập thật, XP tăng
trong trình duyệt, đồng bộ hai thiết bị” chưa thể chạy trong môi trường này và Boss chưa
có nội dung — hai mục này được ghi rõ là NOT RUN/BLOCKED, không đánh dấu đạt.

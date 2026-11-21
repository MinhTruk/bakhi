# AUDIT LỖI GAMIFICATION — v8.3.1

Ngày: 21/11/2026 · Nền: v8.3.0 (`05039aa`) · Project: `wzvslyabhizsiggurwdq`

## 1. Phạm vi audit

Đọc code thực tế thay vì tin CHANGELOG: `bk-version.js`, `bk-devboard.js`
(`APP_VERSION`), `supabase/functions/admin-actions` (`SERVER_VERSION`), 124 trang HTML,
`assets/bakhi/bk-gamification.js|css`, `bk-devboard-gamification.js`, `bk-cloud.js`,
`bk-core.js`, `bk-shell.js`, `bk-page.js`, `bk-learning.js`, migration
`20261209000000_bakhi_v830_gamification.sql`, `supabase/config.toml`,
`.github/workflows/quality-check.yml`; trạng thái thật của Supabase (bảng, hàm, RLS),
GitHub Pages và Edge Functions.

## 2. Bảng lỗi phát hiện

### LỖI 1 — Không tải được tiến trình (mức nghiêm trọng: chặn toàn bộ tính năng)

| Mục | Nội dung |
|---|---|
| Triệu chứng | Trang `/gamification/` hiện “Chưa tải được tiến trình — Chưa kết nối máy chủ Bá Khí.” cho **mọi** học sinh, kể cả người đã nhận diện. |
| Nguyên nhân gốc | `bk-gamification.js` lấy API máy chủ từ `BK.cloud.gamificationApi`. Nhưng `BK.cloud` là **adapter localStorage** do `bk-core.js` tạo (`BK.cloud = cloud;` — dòng 2217), không hề có `gamificationApi`. Lớp máy chủ thật là `window.BKCloud` do `bk-cloud.js` công bố. Vì vậy `api()` luôn trả `null`, `call()` luôn reject với đúng câu “Chưa kết nối máy chủ Bá Khí.” trước khi có bất kỳ request nào. |
| Bằng chứng | `bk-core.js:2217` `BK.cloud = cloud;` (đối tượng `cloud` khai báo ở dòng 1324, chỉ có `init/push/pull/merge`). `bk-cloud.js:2536` `global.BKCloud = {...}` và dòng 2570 mới là `gamificationApi`. `bk-gamification.js:296` (bản 8.3.0) đọc `BK.cloud`. Các mô-đun khác (`bk-devboard.js:4972`, `bk-settings.js:210`, `bk-titles.js:159`) đều dùng `global.BKCloud` — chỉ gamification dùng sai. |
| Vì sao QA 8.3.0 không bắt được | `tools/qa/gamification-smoke.js` tự tạo stub `BK.cloud = { identity, gamificationApi }` — một hình dạng **không tồn tại trong production**, nên bài kiểm tra xanh trong khi production luôn hỏng. |
| Ảnh hưởng | Không học sinh nào tải được XP/cấp độ/nhiệm vụ/thành tựu/Boss/kho đồ; không sự kiện nào được gửi; bảng `xp_transactions` vẫn 0 dòng sau 1 ngày phát hành. |
| Cách khắc phục | Thêm `cloudApi()` / `cloudIdentity()` ưu tiên `window.BKCloud` (có kiểm tra hàm tồn tại), chỉ fallback `BK.cloud` nếu nó thật sự có `gamificationApi`. `studentId()` và phần hiển thị tên cũng lấy danh tính từ `BKCloud.identity()`. |
| Xác minh | `gamification-smoke` (stub đã sửa đúng hình dạng production) 31/31; `gamification-progress-load-smoke` 29/29, trong đó có ca “BK.cloud giả có gamificationApi ném lỗi → loader vẫn dùng BKCloud”. |

### LỖI 2 — Thiếu lối vào Gamification (mức: không thể khám phá)

| Mục | Nội dung |
|---|---|
| Triệu chứng | Không có liên kết nào trong giao diện dẫn tới `/gamification/`; chỉ vào được nếu gõ URL. |
| Nguyên nhân | Trang được tạo ở 8.3.0 nhưng không thêm mục vào menu tài khoản `bk-shell.js`. |
| Cách khắc phục | Thêm mục **“Tiến trình học tập”** ngay sau “Hồ sơ cá nhân” trong menu tài khoản dùng chung toàn site (desktop + mobile), `role="menuitem"`, `data-bk-progress-link`, `aria-current="page"` khi đang ở `/gamification/`. |
| Xác minh | `gamification-navigation-smoke` 17/17 (mở menu thật trong jsdom, kiểm tra href, role, aria-current, không phụ thuộc trạng thái tải). |

### LỖI 3 — Phản hồi cũ ghi đè XP mới

| Mục | Nội dung |
|---|---|
| Triệu chứng | Sau khi làm quiz, XP có thể nhảy về giá trị cũ. |
| Nguyên nhân | `state` gửi trước, `event` gửi sau nhưng phản hồi `state` về muộn hơn → `applyState` cũ ghi đè kết quả vừa cộng. |
| Cách khắc phục | Bộ đếm thứ tự `SEQ` gắn vào từng request; `applyState(state, notify, seq)` bỏ qua phản hồi có `seq` nhỏ hơn lần đã áp dụng. |
| Xác minh | Ca 10 của `gamification-progress-load-smoke` (state trả muộn 300 XP, event trả 320 XP → giao diện giữ 320). |

### LỖI 4 — Vòng lặp request khi lỗi mạng/máy chủ

| Mục | Nội dung |
|---|---|
| Triệu chứng | Khi máy chủ lỗi, loader có thể phát sinh hàng loạt request (đo được 8–9 lần thay vì 3). |
| Nguyên nhân | Nhánh render trạng thái “đang tải” gọi lại `refresh()` mỗi lần render, trong khi cơ chế retry cũng đang chạy. |
| Cách khắc phục | Render chỉ hiển thị trạng thái; việc tải do `mount`/`retry`/sự kiện danh tính điều phối. Retry tối đa 2 lần, chỉ cho lỗi mạng và 5xx, backoff 0,9 s và 1,8 s. |
| Xác minh | Ca 6 và 7 của `gamification-progress-load-smoke`: đúng 3 lần gọi, không tăng sau 1,2 s chờ thêm. |

### LỖI 5 — Một thông báo chung cho mọi lỗi

| Mục | Nội dung |
|---|---|
| Triệu chứng | Mọi tình huống đều hiện “Chưa tải được tiến trình”, không phân biệt chưa đăng nhập, mất mạng, hết phiên hay máy chủ lỗi. |
| Cách khắc phục | 8 trạng thái có tiêu đề, mô tả, mã lỗi và hành động riêng (`E_NO_SESSION`, `E_UNAUTHORIZED`, `E_NOT_BOUND`, `E_FORBIDDEN`, `E_RATE_LIMITED`, `E_NETWORK`, `E_SERVER`, `E_UNKNOWN`); giữ dữ liệu đã tải và hiện băng “một số dữ liệu chưa tải được” khi lỗi một phần. |
| Xác minh | Ca 1, 4, 5, 6, 7, 8 của `gamification-progress-load-smoke`. |

### LỖI 6 — QA 8.3.0 không mô phỏng đúng production

| Mục | Nội dung |
|---|---|
| Nguyên nhân | Như LỖI 1: stub sai hình dạng `BK.cloud`. |
| Cách khắc phục | Stub chuyển sang `window.BKCloud`; thêm 2 bộ QA mới cho loader và điều hướng; đưa 5 bộ QA gamification vào `quality-check.yml`. |
| Xác minh | `quality-check` trên GitHub Actions chạy 22 smoke test. |

## 3. Hạng mục đã kiểm tra và **không** thấy lỗi

- Công thức cấp độ JS ↔ Postgres: khớp 9 mốc (0/100/280/580/1040/…/1.000.000).
- `bk_gam_state` cho học sinh thật đang gắn thiết bị: trả `level`, `total_xp`, 17 thành tựu, 15 node; sau `bk_gam_sync_missions` có 6 nhiệm vụ ngày/tuần (kiểm tra trong transaction rollback, không ghi dữ liệu).
- Không có chênh lệch giữa `xp_transactions` và `user_progression` (`bk_gam_admin_drift` = 0 dòng).
- RLS: 0 policy ghi trên 15 bảng gamification; học sinh không đọc được `boss_questions`.
- Edge Function: trả `401 NO_SESSION` khi thiếu phiên; `gamificationAdmin` dùng `x-admin-token` qua `BKCloud` (đúng).
- Đăng nhập ẩn danh Supabase đang bật (`external.anonymous_users = true`), nên luồng auth của `bk-cloud` hoạt động.

## 4. Hạng mục **chưa** kiểm chứng được trong môi trường này

- Phiên học sinh thật trên trình duyệt (đăng nhập, làm quiz, thấy XP tăng, đồng bộ hai thiết bị). Không có trình duyệt và không có phiên học sinh thật; không tạo dữ liệu giả trên production.
- Nội dung Boss: chưa có thử thách nào do quản trị viên biên soạn, nên chỉ kiểm tra được luồng rỗng và hợp đồng dữ liệu.

# AGENTS.md — Bá Khí

Hướng dẫn cho agent/developer làm việc trong repository này. Đọc hết trước khi sửa mã.

## 0. Bối cảnh nhanh

- Website tĩnh cho học sinh ôn tập: HTML/CSS/JS thuần, deploy GitHub Pages, **không build**.
- 119 tệp HTML: 1 trang chủ, 1 trang quản trị, 116 trang môn/bài học/Studio và 1 tệp rỗng.
- Toàn bộ nội dung giáo dục nằm trong chính các tệp HTML; lớp nâng cấp chỉ chèn thêm thẻ script.
- Supabase là **tuỳ chọn**: nhận diện học sinh, đồng bộ tiến trình, thông báo realtime.
- Hai chế độ thông báo: đầy đủ (trang chủ) và chỉ thông báo (trang bài học, Studio).

## 1. Nguyên tắc bất di bất dịch

1. **Bảo toàn nội dung giáo dục tuyệt đối.** Không sửa câu hỏi, phương án, đáp án,
   giải thích, công thức, số liệu, cấu trúc môn học. Giao diện được phép thay đổi;
   nội dung thì không.
2. **Không phải nền tảng thi cử.** Không thêm và không giữ bất kỳ: đề thi thử, bài
   kiểm tra tính giờ, đồng hồ đếm ngược, giới hạn thời gian, tự nộp bài, xếp hạng thi.
   Mọi tính năng phải khuyến khích học tập tự nhịp.
3. Nếu phát hiện trang cũ có cơ chế tính giờ/thi cử, **báo cáo trước**, không tự xoá
   hay viết lại nếu chưa được cho phép.
4. Không đưa API key, service-role key hay token vào mã nguồn, tệp tĩnh hay chat.
5. Không đổi tên/gộp thư mục môn học hoặc đợt kiểm tra — đó là đường dẫn công khai.

## 2. Kiến trúc hiện tại

```
/                      index.html (trung tâm) + bakhi-v4.js (lớp V4 cũ)
/admin                 admin/index.html — Administrator Dashboard (Administrator Code)
/profile               profile/index.html — Hồ sơ cá nhân + thành tích
/gamification          gamification/index.html — Tiến trình: XP, nhiệm vụ, bộ sưu tập, Boss, cây kỹ năng
/settings              settings/index.html — Hồ sơ, Trung tâm học tập, hiển thị, hình nền, quyền
/assets/bakhi/         Lớp nâng cấp dùng chung
  bk-version.js        Nguồn phiên bản duy nhất (window.BAKHI_VERSION, BK.release)
  bk-shell.js|css      Avatar + menu tài khoản, trợ năng toàn site, ẩn chrome cũ
  bk-profile.js|css    Hồ sơ local-first, ảnh đại diện/bìa, 50 khung avatar SVG
  bk-roles.js          Danh vị học sinh dùng chung (student_roles, canonical id)
  bk-badges.js         99 thành tích (74 tự động + 25 trao tay)
  bk-gamification.js|css  Tiến trình 8.3.5: XP, cấp, hàng đợi sự kiện, dashboard,
                       avatar/khung dùng chung BKProfile
  bk-devboard-gamification.js  Tab quản trị Tiến trình (cấu hình, định nghĩa, Boss)
                       — 8.3.5: mã tự sinh, xem trước, Cài đặt nâng cao
  bk-profile-ui.js     Component hồ sơ/badge dùng chung (profile + settings)
  bk-settings.js|css   5 tab Cài đặt
  bk-core.js|css       Kho dữ liệu local-first, UI kit, tìm kiếm, adapter AI/Supabase
  bk-learning.js|css   Learning Intelligence: sổ tay câu sai, phân tích, kế hoạch,
                       ôn tập, mục tiêu, môn học (dùng chung khung với bk-learn)
  bk-learn.js|css      Trung tâm học tập: khung hub, tổng quan, ghi chú, đánh dấu,
                       thành tích, cài đặt, tìm kiếm, command palette
  bk-dev.js|css        Developer Playground 2.0 (11 công cụ, tab Music)
  bk-music.js|css      Music Player dùng chung (queue, shuffle, repeat, lyrics)
  bk-cloud.js|css      Nhận diện, thông báo realtime, changelog, đồng bộ (Supabase)
  bk-report.js|css     Report Issue + Q&A dùng chung (cửa sổ nổi + nhúng Cài đặt)
  bk-devboard.js       Administrator (12) / Founder (15) Dashboard
  bk-admin-dashboard.css  Giao diện dashboard 4.2
  bk-admin.css|bk-admin-theme.js  Trang đăng nhập quản trị + theme
  bk-supabase.config.js  Nơi duy nhất chứa URL + publishable key
  bk-notify.js|css     Chuông CHANGELOG.md cũ (chỉ nạp ở index.html, dự phòng)
  favicon.svg|*.png|.ico  Favicon tĩnh dùng chung (không dùng GIF)
  bk-bkt.js            Hiệu ứng chuyển trang "bàn tay kéo"
  bk-page.js           Cầu nối cho trang bài học
/ktgk1, /ktgk2, /ktck1, /ktck2, /kttx   Nội dung giáo dục (HTML tĩnh)
/music                 music/<slug>.mp3|txt|png
/studio                index.html (Word & Paint hợp nhất) + word-paint.html (chuyển hướng)
/supabase/             migrations/ (schema + RLS + realtime) + functions/ (11 Edge Function)
                      + config.toml (mỗi function phải có đúng một khối [functions.<tên>])
/.github/workflows/    changelog-sync.yml (CHANGELOG.md → Supabase)
/tools                 content-integrity (+ content-integrity-refresh), integrate-pages, inject-favicon, make-favicon, qa/smoke, qa/cloud-smoke
/docs                  Kiến trúc, tính năng, Music, Studio, Supabase, baseline nội dung
```

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 3. Quy trình làm việc

```bash
# 1. Kiểm tra toàn vẹn nội dung (bắt buộc trước và sau khi sửa)
node tools/content-integrity.js verify

# 2. Kiểm tra cú pháp JS dùng chung
node --check assets/bakhi/bk-core.js
node --check assets/bakhi/bk-cloud.js
node --check assets/bakhi/bk-devboard.js

# 3. Smoke test DOM (cần jsdom, cài ngoài repo)
# Ghim jsdom@31.0.1: bản mới hơn đổi hành vi DOM, bản cũ kéo phụ thuộc chỉ có ESM.
npm install jsdom@31.0.1 typescript@5.6.3 --prefix /tmp/bktest --no-save
NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/cloud-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/shell-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/dev-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/badges-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/chat-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/admin-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/report-smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/version-audit.js
node tools/qa/supabase-config.js
# 6 cổng Learning Intelligence (8.2.0)
node tools/qa/mistake-notebook-smoke.js
node tools/qa/learning-analytics-smoke.js
node tools/qa/study-planner-smoke.js
node tools/qa/revision-engine-smoke.js
node tools/qa/learning-data-integrity.js
node tools/qa/learning-sync-smoke.js

# 4. Chèn thẻ script vào các trang mới (idempotent)
node tools/integrate-pages.js
node tools/inject-shell.js
```

Trên Windows, dùng một thư mục tạm như `%TEMP%\bktest` và đặt `$env:NODE_PATH`.

- Không có bước build. Website là HTML/CSS/JS tĩnh, deploy GitHub Pages.
- Khi thêm trang HTML mới trong thư mục nội dung: chạy `node tools/integrate-pages.js`
  để chèn thẻ script, sau đó chạy lại kiểm tra toàn vẹn.
- `node tools/qa/supabase-config.js` là cổng bắt buộc khi thêm/gỡ Edge Function: nó so
  `supabase/functions/*` với `supabase/config.toml` (không còn khai báo mồ côi), kiểm tra
  `verify_jwt = false` cho mọi function, tên function frontend gọi và cú pháp TypeScript.
- Nếu baseline nội dung chưa tồn tại: `node tools/content-integrity.js baseline`
  **trước khi** sửa bất kỳ nội dung nào.
- Khi một trang **không chứa nội dung giáo dục** (trang chủ, `studio/`) được viết lại
  có chủ đích: `node tools/content-integrity-refresh.js <tệp…>`. Tool tự từ chối tệp có
  dấu hiệu nội dung giáo dục và ghi lại lý do trong `notes` của baseline. Không bao giờ
  chạy `baseline` để ghi đè toàn bộ 122 tệp chỉ vì vài trang giao diện đổi.
- Hash bỏ qua khác biệt CRLF/LF (chuẩn hoá về LF trước khi băm) để checkout trên Windows
  không báo sai; thay đổi nội dung thật vẫn bị phát hiện.
- `integrate-pages.js` chỉ chèn thẻ script; các trang Studio không có `bk-core.js` cần
  thêm thủ công hai dòng `bk-supabase.config.js` + `bk-cloud.js` (xem mục 4).


## 4. Quy ước mã nguồn

- ES5-ish + DOM API thuần, không framework, không bundler, không thêm dependency
  runtime. Không dùng `innerHTML` với dữ liệu người dùng chưa escape; ưu tiên
  `textContent` và `BK.ui.el`.
- Mọi phím tắt mới phải bỏ qua khi đang gõ trong `input/textarea/select/contenteditable`
  và không chiếm phím trình duyệt (trừ Ctrl/⌘+K đã được thiết kế).
- Mọi dữ liệu người dùng đi qua `BK.store` (một key duy nhất `bakhiLearn.v1`,
  có `v` phiên bản + validate + phục hồi khi hỏng).
- Không xoá key localStorage cũ: `theme`, `fxCfg`, `uiCfg`, `favCfg`, `bktCfg`,
  `appHighlightsDataMap`, `bakhiBackups`, `bakhi_ly11_progress`,
  `bakhi_toan11_checklist`, `devToken`, `bakhiSchema`…
- CSS mới đặt trong `assets/bakhi/*.css`, tiền tố `.bk-` (lớp học tập) hoặc
  `.bkdev-` (playground) để tránh xung đột Tailwind hiện có.
- Developer Playground cũ (`index.html`, các hàm `DX`, tab `insp/perf/studio/bk`)
  **phải được giữ nguyên hoạt động**. Lớp mới chỉ bổ sung, không thay thế.

### 4.1. Thông báo toàn website

- `bk-cloud.js` có hai chế độ:
  - **Đầy đủ** (trang chủ): màn hình nhận diện, đồng bộ tiến trình, chuông trên header.
  - **Chỉ thông báo**: bật bằng `data-bk-notify-only="1"` trên thẻ script; chỉ chuông,
    realtime, bảng thông báo và trạng thái đã đọc cục bộ.
- **What's New là tuỳ chọn**: chỉ trang có `data-bk-whatsnew="1"` (hiện là `index.html`)
  mới dựng khối “Cập nhật gần đây”. Studio và Word & Paint **không** được bật cờ này;
  không dùng CSS để che khối.
- Khi thêm trang mới, dùng đúng mẫu (giữ `defer` và thứ tự config → cloud):

```html
<script src="../../assets/bakhi/bk-supabase.config.js?v=4.0.0" defer></script>
<script src="../../assets/bakhi/bk-cloud.js?v=4.1.0" data-bk-notify-only="1" defer></script>
```

- Chỉ nạp `bk-cloud.js` **một lần** trên mỗi trang. Ở chế độ đầy đủ, không thêm
  `data-bk-notify-only`.
- Không đặt chuông/thông báo trong iframe nội dung; dùng chuông nổi của `bk-cloud`.
- Trạng thái đã đọc cục bộ ở `bakhiNotifyReads.v1`; không xoá key này khi nâng cấp.
- Giao diện thông báo dùng bộ biến `--bkc-n-*` và lớp `.bkc-dark`; trang mới không tự đặt
  thẻ trắng trong luồng thông báo.
- **Favicon tĩnh**: chạy `node tools/inject-favicon.js` sau khi thêm trang HTML. Tool chèn
  link SVG/PNG/ICO/apple-touch-icon với đường dẫn tương đối đúng; không dùng GIF.

### 4.2. Report Issue

- Một component duy nhất: `assets/bakhi/bk-report.js|css`. Cửa sổ nổi tự gắn vào mọi trang có
  `bk-cloud.js` (do `tools/integrate-pages.js` chèn, idempotent); trang chủ dùng thêm chế độ
  nhúng trong `bk-settings.js` → tab **Report Issue**. Không tạo bản sao thứ hai.
- Học sinh chỉ đọc dữ liệu của mình qua RLS; mọi thao tác ghi đi qua Edge Function
  `report-api` (học sinh) hoặc `admin-actions` → `reports.*` (Administrator/Founder).
  Không bao giờ gửi `student_id` từ trình duyệt.
- Nút nổi neo ngay **trên chuông thông báo nổi** (đo bằng `getBoundingClientRect`, không đặt
  cứng toạ độ) và **kéo được**; vị trí lưu ở `bakhiReportFab.v1`, `Home` trả về mặc định.
  Không tạo nút thứ hai, không hạ/nâng z-index tuỳ tiện: nút phải nằm dưới panel thông báo.
  Nút nổi chỉ dành cho trang học sinh; `admin/` và `founder/` **không** nạp `bk-report.js`
  (component tự bỏ qua khi `BK_ADMIN_ONLY`).
- Tab **Report** của `bk-devboard.js` là nơi quản trị xử lý báo cáo: thống kê, danh sách có
  phân trang, chi tiết, gán người xử lý và xuất CSV. Mọi bảng có phân trang phải dùng host
  riêng cho `renderPager()` — hàm này xoá host của nó (lỗi 8.0.1 làm mất toàn bộ bảng).
- Thông báo riêng dùng bảng `report_notifications` và hiển thị trong chuông `bk-cloud` hiện
  có — không dựng Notification System thứ hai.
- Chi tiết: [docs/REPORT_ISSUE.md](docs/REPORT_ISSUE.md).

### 4.3. Bảng lưu trữ

| Key | Ghi chú |
|---|---|
| `bakhiLearn.v1` | Nguồn sự thật duy nhất của dữ liệu học tập (schema 2) |
| └ `review` | Sổ tay câu sai — giữ nguyên tên khoá để tương thích dữ liệu đã đồng bộ |
| └ `plans` / `goals` / `revisionSessions` | Kế hoạch, mục tiêu, phiên ôn (8.2.0) |
| `bakhiSignals.v1` | Chỉ số đếm cho thành tích |
| `bakhiNotifyReads.v1` | Đã đọc ở chế độ chỉ thông báo |
| `bakhiStudio.v1` | Tài liệu Studio |
| `bakhiMusic.v2`, `.panel.v1`, `.fab.v1` | Trạng thái trình phát nhạc |
| `bakhiStudent.v1`, `bakhiAdmin.v1` | Hồ sơ học sinh / phiên quản trị (sessionStorage) |

### 4.4. Quy ước tài liệu & phát hành

- Mọi thay đổi hành vi phải có mục trong `CHANGELOG.md`, theo nhóm
  **Tính năng / Sửa lỗi / Cải tiến**, ghi ngày và số phiên bản mới.
- Sau khi push `CHANGELOG.md` lên `main`, workflow `.github/workflows/changelog-sync.yml`
  tự đồng bộ lên Supabase. Không sửa tay bảng `changelog` cho nội dung đã có trong tệp;
  không tạo announcement trùng. Kiểm tra trạng thái ở tab **Giám sát** của dashboard.
- Khi đổi API/cấu trúc dữ liệu, cập nhật đồng thời `docs/ARCHITECTURE.md` và
  `docs/FEATURES.md`; khi đổi quy trình cài đặt, cập nhật `docs/SUPABASE_SETUP.md`.
- Commit message bằng tiếng Việt có dấu, ví dụ:
  `feat(3.3.0): đồng bộ changelog, 9 mô-đun quản trị và favicon tĩnh`.
- Trước khi push: chạy `content-integrity verify`, `node --check` cho các tệp JS đã sửa,
  hai smoke test, và mở thử trang chủ + một trang bài học + Studio + dashboard.

## 5. Những việc không được làm

- Sửa/xoá dòng nội dung trong các tệp HTML môn học (trừ thẻ script do tool chèn).
- Đổi tên hoặc gộp thư mục môn học/đợt kiểm tra (đường dẫn GitHub Pages).
- Thêm timer dưới mọi hình thức vào tính năng học tập.
- Ghi service-role key hoặc gọi Supabase bằng khoá bí mật từ trình duyệt.
- Force-push hoặc commit file `.env`, khoá API, `node_modules`.

## 6. Gamification 2.0 (8.3.0)

- Supabase là nguồn sự thật cho XP/cấp độ/thành tựu/nhiệm vụ/vật phẩm. Client chỉ gửi
  sự kiện học tập + khoá idempotency qua `gamification-api`; không tự cộng XP.
- Mọi bảng người dùng chỉ có policy SELECT. Không thêm policy ghi; muốn đổi dữ liệu thì
  sửa hàm `bk_gam_*` trong migration mới.
- Không tạo engine XP/level/mission thứ hai. Công thức cấp độ chỉ ở `bk_gam_level_floor`
  và bản sao hiển thị trong `bk-gamification.js` (QA đối chiếu tự động).
- Badge/Title cũ không bị gamification ghi vào.
- **Lớp máy chủ là `window.BKCloud`**, không phải `BK.cloud` (adapter localStorage của
  `bk-core.js`). Dùng `BK.cloud.gamificationApi` sẽ khiến loader luôn báo “Chưa kết nối
  máy chủ” — đây là nguyên nhân lỗi 8.3.0, xem `docs/GAMIFICATION_BUG_AUDIT_V831.md`.
- Lối vào Tiến trình nằm trong menu tài khoản (`bk-shell.js`), chỉ một định nghĩa.
- Sau khi thêm trang HTML mới, chạy `node tools/inject-gamification.js` (idempotent).
- **Avatar & khung avatar (8.3.5):** `student_profiles.frame` là nguồn sự thật DUY NHẤT cho
  khung đang trang bị trên toàn website. `user_inventory.is_equipped` chỉ là trạng thái kho.
  `bk_gam_equip` ghi cả hai trong cùng transaction; `bakhi_owned_frames` gồm khung badge +
  khung nhận qua kho vật phẩm (`reward_catalog.metadata.profile_frame`). Không dựng nguồn
  khung thứ hai, không tự hạ khung máy chủ về `none` ở client.
- Mọi nơi hiển thị avatar dùng `BKProfile.avatarNode()` — không tự dựng ảnh/chữ cái đầu riêng
  (đây là lỗi 8.3.5 ở hero trang Tiến trình).
- **Khung hồ sơ (8.3.6):** `bakhi_owned_frames` phải đọc bảng ánh xạ `bakhi_badge_frames`
  (58 khung), cộng khung kho vật phẩm và khung đang trang bị. Không thay bằng danh sách
  viết cứng — lỗi 8.3.5 làm khung Founder bị coi là chưa mở. `/gamification/` phải nạp
  `bk-profile.js` + `bk-badges.js` trước `bk-gamification.js`, nếu không hero mất avatar.
- **Buff XP & đặt cấp (8.3.6):** bảng `gamification_xp_buffs` chỉ service_role đọc/ghi;
  `bk_gam_award` nhân XP bằng `bk_gam_active_buff`. Đặt cấp độ chỉ qua `bk_gam_set_level`
  (ghi sổ từng phần ≤ 100.000 XP), không `UPDATE user_progression` trực tiếp.
- **Cây kỹ năng có điều kiện (8.3.8):** `skill_tree_nodes` có `requires`,
  `required_missions`, `required_achievements`, `min_level`, `pos_x/pos_y`; nhánh nằm ở
  `skill_branches`. Chỉ `bk_gam_evaluate` được chuyển node sang `completed`, và chỉ khi
  `bk_gam_node_blockers()` rỗng. Trang `/skills/` (`bk-skills.js|css`) không tự tính điều
  kiện — mọi trạng thái đến từ `gamification-api` action `state`.
- **Đổi cấp/XP phải đánh giá thành tựu (8.3.8):** `bk_gam_set_level` và `bk_gam_adjust`
  gọi `bk_gam_evaluate` trong cùng transaction. Không thêm đường ghi `user_progression`
  trực tiếp nào khác, nếu không thành tựu mốc cấp sẽ lệch.
- **Trao tặng của Founder (8.3.8):** `bk_gam_grant_items` (quantity + `metadata.max_quantity`),
  `bk_gam_grant_achievements` (bỏ qua mục đã có), `bk_gam_grant_skill_tree` (xác nhận
  `confirm: true`). Các action `admin.items.grant`, `admin.achievements.grant`,
  `admin.skilltree.grant`, `admin.grants.history` chỉ Founder và kiểm tra scope ở máy chủ.
- **Cấu hình cây (8.3.8):** máy chủ chặn node tự trỏ vào chính nó và chu trình
  (`hasCycle`), `admin.skilltree.validate` trả lỗi/cảnh báo từ `bk_gam_tree_issues`.
- **Tìm học sinh trong tab Gamification (8.3.7):** dùng `admin.students.search` của
  `gamification-api` (tìm không dấu theo `normalized_name` + `display_name`, chỉ học sinh
  đang hoạt động). Không gọi `students.search` trên `gamificationApi` — action đó thuộc
  nhánh học sinh nên máy chủ trả `UNKNOWN_ACTION` (“Hành động không hợp lệ.”). Chưa chọn
  học sinh thì chặn Xem trước ở client, không gửi `audience` rỗng.
- **Mã tự sinh (8.3.5):** chỉ một `BKGamificationAdmin.slugify()` ở client và một `codeOf()`
  ở `gamification-api`. Mã cho phép `_` và `-`; `Ma Vương` → `ma_vuong`. Không thêm hàm slug
  thứ hai. Tạo mới phải gửi `expect_new` để máy chủ trả `CODE_TAKEN` khi mã đã tồn tại.
- Không xoá cứng thành tựu đã có người nhận: `admin.achievement.delete` trả `IN_USE`, dùng
  Lưu trữ (`is_active = false`) để giữ lịch sử.
- QA gamification:
  ```bash
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-smoke.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-progress-load-smoke.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-navigation-smoke.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/avatar-sync-smoke.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/founder-achievement-smoke.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/v835-code-generator.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/v836-founder-gamification.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/v837-founder-search.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/v838-gamification.js
  NODE_PATH=/tmp/bktest/node_modules node tools/qa/xp-level-integrity.js
  node tools/qa/gamification-security-smoke.js
  SUPABASE_ACCESS_TOKEN=... node tools/qa/gamification-db-check.js   # cần quyền project
  ```

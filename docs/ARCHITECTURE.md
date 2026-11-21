# Kiến trúc Bá Khí

Tài liệu này mô tả hiện trạng repository, lớp nâng cấp dùng chung, cơ chế thông báo và các
quyết định kỹ thuật. Cập nhật: 20/11/2026 (phiên bản 8.0.0).

## 1. Kiểm toán repository (trước khi nâng cấp)

| Hạng mục | Số lượng / ghi chú |
|---|---|
| Tệp HTML | 119 (1 trang chủ, 1 trang quản trị, 116 trang nội dung/Studio, 1 tệp rỗng `images/anh/1.html`) |
| Ngân hàng câu hỏi | 10 `MCQ_BANK`, 10 `TF_BANK`, 2 `ESSAY_BANK`; 29 `correctAnswer`, 252 `correct:`, 817 `explanation/exp/solution`, 41 mảng `options` |
| CSS | Nhúng trong từng trang + Tailwind CDN + style V4 tự inject (`bakhi-v4.js`) + CSS dùng chung trong `assets/bakhi/` |
| JS dùng chung | `bakhi-v4.js` (trang chủ), `bakhi-transition.js`, khối `BKT` inline trong `<head>`, lớp `bk-*.js` |
| Developer Panel | 11 tab cũ: fx, tools, data, ui, debug, anim, adv, insp, perf, studio, bk (core trong `index.html`, `bakhi-v4.js`) |
| Storage keys | `theme`, `b11theme`, `bgOpacity`, `customBg`, `fxCfg`, `uiCfg`, `hiddenSubjects`, `favCfg`, `bktCfg`, `appHighlightsDataMap`, `bakhiBackups`, `bakhiSchema`, `bakhiColors`, `bakhiErrors`, `bakhiSnips`, `devToken`, `devLock`, `bakhi_ly11_progress`, `bakhi_toan11_checklist`, `lexend-*`, `bgmMuted` + các key mới bên dưới |
| Theme | `html.dark` + `localStorage.theme`; token V4 `--bk-*` |
| Chuyển trang | Khối BKT (hiệu ứng bàn tay/vải) + `sessionStorage.bktF` |
| Supabase | Đã tích hợp: migration + 11 Edge Function + RLS + realtime (xem mục 8) |
| Deploy | GitHub Pages, đường dẫn tương đối, không build |


### Vấn đề phát hiện

1. Mỗi trang nội dung tự chứa toàn bộ CSS/JS → trùng lặp lớn, không có lớp dữ liệu chung.
2. Không có nơi lưu kết quả luyện tập thống nhất (mỗi trang dùng key riêng hoặc không lưu).
3. Developer Panel nằm trong một modal cố định, không kéo/đổi kích thước được, phụ thuộc
   markup của `index.html`.
4. `Ctrl+K` cũ chỉ hoạt động khi đã xác thực Developer.
5. `innerHTML` được dùng ở nhiều nơi với dữ liệu tĩnh (chấp nhận được), nhưng cần lớp mới
   escape mọi dữ liệu người dùng.
6. Chưa có kiểm thử tự động hay công cụ bảo vệ nội dung.
7. Một tệp HTML rỗng (`images/anh/1.html`) và các trang Studio không có `bk-core.js`, cần
   cách chèn script riêng.

## 2. Lớp nâng cấp 2.0

```
index.html ──► bk-core.js ──► bk-learning.js ──► bk-learn.js ──► bk-dev.js
                   ▲
trang bài học ─────┴──► bk-page.js
```

- **bk-core.js** — nguồn sự thật duy nhất cho dữ liệu người dùng:
  - `BK.store`: key `bakhiLearn.v1`, schema `v:1`, sanitize từng trường, giới hạn kích thước,
    phục hồi khi JSON hỏng (sao lưu `bakhiLearn.corrupt.<ts>` rồi tạo state rỗng).
  - `BK.practice()`: ghi lượt luyện, tự đưa câu sai vào review, cập nhật lịch ôn theo
    kết quả (spaced repetition cấu hình được).
  - `BK.addNote/addBookmark/addHistory`, `BK.achievements` (30 mốc, `progress()`,
    `next()`, `groups`), `BK.signals` (tín hiệu dùng chung), `BK.search`, `BK.io`
    (export/validate/import), `BK.ai`, `BK.cloud` (adapter tuỳ chọn).
  - `BK.signals`: key riêng `bakhiSignals.v1` với các nhóm `studio{docs,drawings,
    exports,inserts,words}`, `music{plays}`, `ui{palette,searches}`, `backup{exports}`.
    Chỉ là số đếm (0–999999), không chứa nội dung; Studio ghi trực tiếp key này nên
    thành tích nhóm Studio hoạt động dù trang Studio là tệp tĩnh độc lập.
- **bk-notify.js/css** — chuông thông báo cập nhật kiểu cũ, **chỉ nạp trực tiếp ở `index.html`**:
  tải `CHANGELOG.md`, tách mỗi `## [x.y.z] — ngày` thành một thông báo, badge chưa đọc,
  “Đánh dấu đã đọc tất cả” và cửa sổ toàn màn hình đọc đầy đủ nội dung. Trạng thái ở
  `bakhiNotify.v1`; API `BKNotify` (`open`, `close`, `openArticle`, `markAll`, `items`,
  `unread`, `parse`, `setSource`, `refresh`). Khi lớp Supabase chạy, `bk-cloud.js` gỡ chuông
  cũ để không hiện hai chuông. Các trang môn/bài học dùng chuông mới ở chế độ chỉ thông báo
  (xem mục 2.1). Không chứa nội dung giáo dục. Từ 3.3.0, chuông mới là giao diện duy nhất
  người dùng thấy; `bk-notify.js` chỉ còn là lớp dự phòng khi Supabase không cấu hình.
- **Favicon tĩnh** — `assets/bakhi/favicon.svg` là nguồn; `tools/make-favicon.js` sinh bộ
  PNG 16/32/48/192/512, `apple-touch-icon.png` và `favicon.ico` không phụ thuộc thư viện.
  `tools/inject-favicon.js` chèn link tương đối vào 118/119 tệp HTML (bỏ qua
  `images/anh/1.html` vì tệp rỗng). Mọi dòng chèn chứa `assets/bakhi/` nên
  `content-integrity` bỏ qua; không dùng favicon GIF.
- **bk-learn.js/css** — khung Trung tâm học tập: dock nổi, hub 11 khu vực, command palette
  (Ctrl/⌘+K), tìm kiếm toàn cục (`/`), focus mode, ghi chú, đánh dấu, thành tích, xuất/nhập.
- **bk-learning.js/css** (8.2.0) — Learning Intelligence: 6 khu vực dùng chung khung với
  `bk-learn` (Môn học, Sổ tay câu sai, Phân tích, Kế hoạch, Ôn tập, Mục tiêu) và biểu đồ SVG
  tự dựng (không nạp thư viện chart). Dữ liệu lấy từ `BK.mistakes`, `BK.analytics`,
  `BK.planner`, `BK.revision`, `BK.goals` trong `bk-core.js`.
- **`bakhiLearn.v1` schema 2** — thêm `plans`, `goals`, `revisionSessions`; `review` (Sổ tay câu
  sai) được mở rộng tại chỗ với `status`, `errorType`, `chosen`, `note`, `pinned`, `streak`,
  `ease`, `intervalDays`. `save()` chuẩn hoá bằng `sanitize()` trước khi ghi.
- **bk-dev.js/css** — Developer Playground 2.0: cửa sổ nổi kéo/đổi kích thước, nhớ
  vị trí/kích thước/tab, 11 công cụ (thêm tab Music). Không thay thế panel cũ.
- **bk-music.js/css** — Music Player dùng chung, **trình phát theo tệp từ 7.1.0**:
  thư viện gốc 5 bài trong `music/<slug>.mp3` kèm `.txt` (lời) và `.png` (bìa).
  `tools/music-scan.js` sinh `music/library.json`; player tải manifest và gộp bài mới
  một lần (theo dõi qua `state.seen`), bài người dùng đã xoá không tự quay lại. Queue
  (thêm/xoá), shuffle chọn bài ngẫu nhiên, repeat 3 chế độ. Panel nổi kéo được, đổi
  kích thước, thu nhỏ/phóng to, nhớ bố cục (`bakhiMusic.panel.v1`); thư viện + queue ở
  `bakhiMusic.v2`, lời tự nhập ở `bakhiMusic.lyrics.v1`, vị trí logo ở
  `bakhiMusic.fab.v1`; không autoplay, không tải nhạc lên máy chủ. Phím tắt
  (`Space`, `←/→`, `Esc`) chỉ kích hoạt khi panel mở và bỏ qua khi đang gõ. Có
  `BKMusic.on(fn)` phát sự kiện thay đổi để UI khác (tab Music của Dev Panel) cập nhật
  không cần polling. Chi tiết: [MUSIC.md](MUSIC.md).
- **Chuyển động & trợ năng** — ba bề mặt (Dev Panel, Music Player, Trung tâm học tập)
  đều có hiệu ứng chuyển tab ngắn (`.bkdev-pane-in`, `.bkm-anim`, `.bk-tab-in`) và tự
  tắt khi `prefers-reduced-motion: reduce`. Tab dùng `role="tablist"/"tabpanel"`,
  điều hướng bằng phím mũi tên; mọi nút điều khiển có `aria-label`, trạng thái
  `aria-pressed` và viền `:focus-visible`.
- **bk-page.js** — chỉ chạy trên trang bài học: ghi lịch sử, đọc ngân hàng câu hỏi
  (chỉ đọc), bắt kết quả kiểm tra theo mẫu feedback quen thuộc, dock nhỏ 4 nút.

### 2.1. Thông báo toàn website (`bk-cloud.js`)

`bk-cloud.js` là nơi duy nhất tạo Supabase client và dựng chuông thông báo. Từ 3.2.0, tệp này
được nạp trên **mọi trang** với hai chế độ:

| Chế độ | Điều kiện | Hành vi |
|---|---|---|
| Đầy đủ | `global.BK_ADMIN_ONLY` không đặt, không có `data-bk-notify-only` | Nhận diện học sinh, đồng bộ tiến trình, chuông trên header, đã đọc trên Supabase |
| Chỉ thông báo | `data-bk-notify-only="1"` trên thẻ script | Chỉ chuông, realtime, bảng thông báo; đã đọc ở `localStorage` |

Luồng khởi động ở chế độ chỉ thông báo:

```
DOMContentLoaded
  └─ injectCss()                       (bk-cloud.css?v=4.1.0)
  └─ buildBell()                       (chuông nổi góc phải dưới)
  └─ ensureReady() → ensureSdk() → ensureSession()   (Anonymous Auth)
       └─ subscribeRealtime()          (announcements + changelog + app_settings)
       └─ loadAnnouncements(true) + loadChangelog() + loadSiteFlags()
       └─ emit('ready', { bound:false, notifyOnly:true })
```

- **Không có màn hình nhận diện** và **không gọi** `bind-student-session` hay
  `sync-student-progress`, nên mở trang bài học không làm thay đổi hồ sơ đang gắn.
- `readAnnouncementIds()` trả về `localReads()`; `markRead()`/`markAllRead()` ghi
  `bakhiNotifyReads.v1`, dùng chung cho mọi trang cùng origin.
- `paintBell()` đếm chưa đọc khi `S.bound || NOTIFY_ONLY`, nên badge hoạt động dù không có
  hồ sơ học sinh.
- Khi Supabase thiếu cấu hình hoặc mất mạng, `bootNotifyOnly()` chỉ ghi cảnh báo và mở khoá
  trang; trang học không bị chặn.
- `placePanel()` đo `documentElement.clientWidth/clientHeight` (trừ thanh cuộn). Nếu tâm
  chuông nằm ở nửa dưới màn hình, bảng được neo `bottom` và mở lên trên; ngược lại mở xuống
  dưới. Chiều cao tối đa luôn nằm trong khung nhìn.
- Realtime là kênh `bakhi-public` với hai bảng; ngoài ra có poll 60 giây và tải lại khi
  `online` để bù khi realtime không khả dụng.
- Liên kết “Xem CHANGELOG.md” dùng `basePath()`, nên đúng cả ở trang bài học nhiều cấp thư mục.

#### Giao diện tối và khối “Cập nhật gần đây” (3.3.0)

- Toàn bộ bề mặt thông báo dùng chung bộ biến `--bkc-n-*` trong `bk-cloud.css` và lớp
  `.bkc-dark`: trung tâm thông báo, bảng, popup, danh sách, chi tiết, toast, modal, trạng
  thái tải/rỗng/lỗi. Không có thẻ trắng nào còn sót trong luồng thông báo.
- **What's New là tuỳ chọn**: `bk-cloud.js` chỉ dựng khối cập nhật gần đây khi thẻ script
  có `data-bk-whatsnew="1"` hoặc trang đã có khung `#bkcWhatsNew`. Chỉ `index.html` bật cờ
  này; `studio/index.html` (Word & Paint hợp nhất) chạy chế độ chỉ thông báo nên không
  bao giờ hiện khối. Đây là logic, không phải CSS ẩn.
- Feature flag đọc từ `app_settings` qua RLS `public.*`: `public.whatsnew` bật/tắt khối
  cập nhật gần đây, `public.maintenance` hiện dải bảo trì toàn site. Hai bảng `app_settings`
  và `announcements`/`changelog` đều nằm trong realtime nên thay đổi từ dashboard tới
  trình duyệt ngay.
- Thông báo sinh ra từ CHANGELOG mang `changelog_version`; khi bấm, `bk-cloud.js` mở đúng
  mục phiên bản trong cửa sổ lịch sử. Markdown từ máy chủ được escape trước, chỉ cho phép
  liên kết `http(s)`.
- Kênh realtime `bakhi-public` lắng nghe `announcements`, `changelog`, `app_settings`;
  trạng thái kênh được công bố qua `BKCloud.state().realtime` để dashboard giám sát.
- Từ 7.0.1, ngày trong `CHANGELOG.md` (`## [x.y.z] — YYYY-MM-DD`) được hiểu là **nửa đêm
  giờ Việt Nam** ở cả `tools/changelog/parse.js`, Edge Function `changelog-sync` và giao diện
  (`+07:00`). Migration `20261127000000_bakhi_changelog_vn_time.sql` dịch các mốc cũ đúng
  `00:00:00Z` về `00:00+07:00`; không đụng thông báo đăng tay có giờ cụ thể. Edge Function
  `changelog-sync` cũng tự chuẩn hoá những dòng còn ở mốc `00:00Z` sau mỗi lần đồng bộ,
  nên cơ sở dữ liệu đang chạy không cần chạy migration thủ công vẫn hiển thị đúng.

#### Danh sách cập nhật giới hạn 10 mục (3.4.0)

- Khối “Cập nhật gần đây” dùng một danh sách thống nhất thay cho việc chỉ dựng phiên bản
  mới nhất: sắp theo **số phiên bản** (không theo ngày đăng), hiển thị tối đa `WN_LIMIT = 10`
  mục, phần còn lại sau nút `Xem thêm` / `Thu gọn` kèm bộ đếm `đang xem / tổng`.
- Mỗi mục là một thẻ gọn: tag phiên bản, danh mục, ngày, tiêu đề, tóm tắt. Nội dung chi tiết
  vẫn nằm trong trung tâm thông báo, mở bằng nút “Xem tất cả cập nhật”.
- `BKCloud.state()` công bố `wnLimit` và `wnExpanded` để QA kiểm tra giới hạn.

### 2.2. Lớp shell dùng chung (3.4.0)

- `bk-version.js` là nguồn phiên bản duy nhất: `window.BAKHI_VERSION` và `BK.release`.
  `BK.version` vẫn là phiên bản thư viện core, không dùng để hiển thị bản phát hành.
- `bk-shell.js` + `bk-shell.css` chạy trên mọi trang trừ `admin/index.html` (dashboard có
  `bkAdminTheme` riêng) và `images/anh/1.html` (tệp rỗng):
  - Dựng avatar ở header (trang chủ: chèn vào cụm chứa `#bkReadmeBtn`; trang bài học/Studio:
    tìm hàng flex bên trong `<header>`; không tìm được thì chèn vào `<body>`).
  - Menu tài khoản: **Hồ sơ cá nhân, Giao diện, README.md, Bá Khí Studio, Cài đặt**.
    Không thêm Chat khi `/chat/` chưa tồn tại.
  - Ẩn chrome cũ bằng CSS: `#bkReadmeBtn`, menu ba gạch (`#hamburgerDropdown`), khối hình nền
    trên trang chủ, dock nổi `#bkDock`. DOM được giữ lại để script cũ không lỗi.
  - “Giao diện” chỉ xuất hiện ở trang thật sự đổi được sáng/tối (`#themeIcon` hoặc `.bk-app`);
    trang bài học và Studio dùng bảng màu cố định nên không hiện mục này.
  - Trợ năng dùng chung `bakhiA11y.v1` (cỡ chữ 90–130%, tương phản, giảm chuyển động, viền
    focus, gạch chân liên kết), áp bằng biến `--bk-font-scale` và lớp trên `<html>`.
  - Chuẩn hoá `THPT FPT` → `THPT Huỳnh Ngọc Huệ` chỉ trong text node của
    `header/footer/main` lúc chạy, nên baseline nội dung không đổi.
- `tools/inject-shell.js` chèn bốn thẻ script (`bk-version`, `bk-profile`, `bk-badges`,
  `bk-shell`) trước `</body>`, idempotent; mọi dòng chèn đều chứa `assets/bakhi/` nên
  `tools/content-integrity.js` bỏ qua.

### 2.3. Hồ sơ, thành tích và Cài đặt (3.4.0)

- **Hồ sơ local-first** (`bk-profile.js`, khoá `bakhiProfile.v1`): biệt danh, giới thiệu,
  ảnh đại diện/bìa (canvas resize rồi lưu data URL), tối đa 6 liên kết chỉ nhận `http(s)`,
  khung avatar đang dùng. Hồ sơ gắn với danh tính `bakhiStudent.v1`; bản cục bộ vẫn là
  nguồn dùng ngay khi ngoại tuyến, còn bản máy chủ (3.6.0) chỉ ghi đè khi mới hơn.
- **Thành tích** (`bk-badges.js`, khoá `bakhiBadges.v1.<studentId>`): đúng 99 badge — 74 tự động theo
  chỉ số học tập/khám phá/chuỗi ngày/âm nhạc/tương tác/hồ sơ/Studio/bí mật, 25 badge chỉ trao tay
  (2 Administrator + 2 Developer + 11 Founder 7.4 + 10 Founder Badge 7.5 có SVG riêng). 8 danh mục, 6 bậc độ hiếm; badge đã mở thưởng khung avatar
  (`ownedFrames`). Từ 3.6.0, badge tự động được máy chủ xác minh lại (xem 2.6).
- **Component dùng chung** (`bk-profile-ui.js`): `renderHero`, `renderEditor`,
  `renderFrames`, `renderBadgeBoard` — dùng cho cả `/profile/` và tab Hồ sơ trong `/settings/`,
  không có hệ thống hồ sơ thứ hai.
- **Cài đặt** (`bk-settings.js`): 5 tab — Hồ sơ, Trung tâm học tập, Hiển thị & Trợ năng,
  Hình nền, Nhà phát triển. Tab Trung tâm học tập gọi `BKLearn.mountHub(container, tab)`
  nên dùng đúng bộ tab/dữ liệu của modal (7 tab), không nhân bản logic.
- Tab Hình nền dùng chung kho IndexedDB `bakhi`/`kv` với trang chủ (khoá `bg`, `bgOpacity`).
- Tab Nhà phát triển có **hai mục tách biệt**: Dev Code (mở Developer Playground) và
  Administrator Code (mở Administrator Dashboard). Cả hai mã đều xác minh ở Edge Function
  và không bao giờ lưu trong trình duyệt; Dev Code chỉ giữ token + hạn dùng trong
  `sessionStorage` (`bakhiDev.v1`), Administrator Code chỉ giữ token phiên admin.

### 2.5. Developer Playground 2.1 và Dev Code (3.5.0)

- **Xác thực hai lớp**: `dev-auth` nhận Dev Code, giới hạn 10 lần/10 phút theo IP
  (`bakhi_rate_limit`), ghi phiên vào `dev_sessions` (chỉ lưu hash token), trả token +
  hạn dùng 1–12 giờ. `dev_sessions` bật RLS, không policy, thu hồi quyền
  `anon`/`authenticated`; `admin-actions` không đọc bảng này nên Dev Code **không** cấp
  quyền quản trị.
- **Một nguồn trạng thái**: `bk-cloud.js` công bố `devLogin`, `devSession`, `devToken`,
  `devLogout` và phát sự kiện `bk:dev`. `bk-shell.js` và `bk-dev.js` chỉ phản ứng theo
  sự kiện này; không còn `localStorage.devToken` hay kiểm tra container ẩn.
- **Tải theo nhu cầu**: `bk-shell.js` chèn `bk-dev.js` khi có phiên Dev; trang chủ vẫn nạp
  tĩnh `bk-dev.js` nhưng chỉ dựng FAB sau khi `authorized()` thấy token thật.
- **14 tab**: Inspector, CSS Studio, Animation, Performance, Storage, Console, Network,
  Theme, Components, Backup, Music, Studio, Dữ liệu, Gỡ lỗi. Tab Studio chỉ đọc trạng thái
  và mở nhanh, không nhân bản Studio; tab Dữ liệu chỉ đọc/xuất JSON; tab Gỡ lỗi không chứa
  token hay mã.
- **Vòng đời**: nút `Thoát Dev` đỏ nằm trái nút Thu nhỏ, xác nhận trước khi thoát; thoát
  xoá phiên, đóng panel, gỡ FAB. Thu nhỏ giữ tab/kích thước/trạng thái. Panel nằm dưới
  `.bk-overlay` để hộp xác nhận luôn bấm được; không có animation favicon và không có
  Highlight Manager độc lập.

### 2.6. Hồ sơ và thành tích xác minh phía máy chủ (3.6.0)

- **Bảng dữ liệu** (`supabase/migrations/20261119000000_bakhi_profile_badges.sql`):
  - `student_profiles` (1 dòng/học sinh): biệt danh, giới thiệu, ảnh đại diện/bìa, liên kết,
    khung avatar. RLS: mỗi học sinh chỉ đọc/ghi dòng của mình.
  - `student_badges` (khoá chính `student_id` + `badge_id`, cột `kind` = `auto`/`admin`):
    RLS chỉ có policy đọc của chính mình; **thu hồi toàn bộ quyền ghi** khỏi
    `anon`/`authenticated`. Chỉ service role trong Edge Function ghi được.
  - `bakhi_owned_frames(uuid)`: 2 khung cơ bản + khung thưởng của badge đã xác minh, đọc từ
    bảng ánh xạ `bakhi_badge_frames` (8.3.6 — không viết cứng danh sách),
    bảng ánh xạ `bakhi_badge_frames`; trigger `bakhi_profile_frame_guard` chặn gán khung chưa
    sở hữu (`FRAME_NOT_OWNED`).
  - `bakhi_grant_badges(uuid, text[], text, text)`: cấp một lô badge trong một câu lệnh
    (`on conflict do nothing`, trả về badge thực sự được thêm); chỉ `service_role` execute.
  - `admin_grant_history` + `admin_grant_batches`: audit cấp vật phẩm, chống trùng theo
    `request_id`; không cấp quyền đọc cho `anon`/`authenticated`.
- **Edge Function `student-profile`** (`sync` | `update` | `get`): đọc `student_progress`
  đã đồng bộ, dựng ảnh chụp, tính lại chỉ số bằng `_shared/badge-rules.ts` rồi ghi badge
  `auto` đủ điều kiện. Client **không** gửi danh sách badge đã mở; `applyServer()` chỉ nhận
  id có trong danh mục và badge `admin` chỉ khi `kind='admin'`. Giới hạn 90 lần/giờ/học sinh.
- **Danh mục dùng chung**: `tools/gen-badge-catalog.js` sinh
  `_shared/badge-catalog.ts` từ `bk-badges.js`; `badges-smoke.js` đối chiếu để phát hiện lệch.
- **Trao badge Administrator**: chỉ `admin-actions` với `x-admin-token` (các action
  `badges.grant`/`badges.revoke`), giới hạn ở `admin-chosen` và `admin-legend`, ghi
  `admin_activity_logs`. `student-profile` không bao giờ ghi hai id này.
- **Trao badge/khung Founder (7.9.0)**: `founder.grantItem` (và alias `avatar.grant`) cho phép
  Founder trao mọi badge/khung `exclusive = founder` cho học sinh đang hoạt động; chỉ badge
  `founder` (Thiên Khải Sáng Thế) còn đòi `students.is_founder = true`. Badge Developer vẫn chỉ
  Founder trao. Mọi lần trao ghi `admin_grant_history`/`admin_grant_batches` và audit log.
- **Đồng bộ máy khách**: `bk-cloud.js` đẩy hồ sơ khi `updatedAt` mới hơn bản máy chủ, kéo
  badge đã xác minh, và tự tắt (`studentDisabled`) khi Edge Function chưa được deploy (404).
- **Trạng thái triển khai**: migration `20261119000000` (3.6.0) và ba Edge Function
  (`student-profile`, `admin-actions`, `sync-student-progress`) đã được deploy và xác minh
  trên project `wzvslyabhizsiggurwdq` (20/11/2026).

### 2.6.0.1. Bảo trì toàn hệ thống & Founder Login (7.9.2)

- **Một nguồn trạng thái**: `app_settings.public.maintenance` (`maintenance_enabled`,
  `maintenance_reason`, `maintenance_started_at`, `maintenance_started_by`,
  `maintenance_updated_at`; giữ thêm các khoá camelCase cũ) và bảng `maintenance_history`
  cho từng chu kỳ. Chỉ `admin-actions` (`service_role`) ghi; `settings.set` cho khoá bảo trì
  bắt buộc `scope = founder`.
- **Một giao diện**: `bk-shell.js` dựng `#bkMaintenance` trên mọi trang công khai;
  `bk-cloud.js` chỉ phát sự kiện `bk:maintenance` khi feature flag đổi, không vẽ UI thứ hai.
  Màn hình cũ trong `bk-core.js` đã bị gỡ.
- **Một cơ chế xác thực Founder**: `assets/bakhi/bk-founder-auth.js` gọi `admin-auth`
  (`scope = founder`, so băm SHA-256 với `founder_config`) rồi ghi phiên vào
  `sessionStorage['bakhiAdmin.v1']` — đúng khoá mà `bk-cloud.js` và `founder/` dùng.
  Sau đó client gọi `admin-actions → session.check`; máy chủ đọc lại token trong
  `admin_sessions` và trả `scope`. Chỉ `scope = founder` mới gỡ màn hình bảo trì.
  Không có cơ chế thứ hai, không có mã riêng cho màn hình bảo trì.
- **Giới hạn thử**: `admin-auth` dùng RPC `bakhi_rate_limit` theo IP — Founder 5 lần / 10 phút,
  trả `retryAfter`; mọi trường hợp sai đều trả “Mã Founder không hợp lệ.”

### 2.9. Report Issue + Q&A (8.1.0)

```
bk-report.js ─► BKCloud.reportApi ─► report-api ─► reports / report_messages
      │                                          └─ storage report-attachments
      └─► BKCloud.reportUpload ─────────────────────┘
bk-devboard.js (tab Report) ─► adminAction ─► admin-actions ─► reports.* + report_notifications
bk-cloud.js (chuông) ◄── RLS select ── report_notifications
```

- **Một component duy nhất.** `assets/bakhi/bk-report.js` dựng cả cửa sổ nổi (trên mọi trang
  có `bk-cloud.js`) và chế độ nhúng trong `bk-settings.js` → tab **Report Issue**. Không có
  biến thể riêng cho trang chủ hay trang môn học. Trang `admin/` và `founder/` **không** nạp
  component này (guard `BK_ADMIN_ONLY`): quản trị dùng tab **Report** của dashboard.
- **Dashboard Report.** `bk-devboard.js` tải thống kê, danh sách có phân trang và chi tiết;
  tab có huy hiệu chưa đọc, tự làm mới 45 giây/lần khi đang mở, gán người xử lý và xuất CSV
  qua `reports.export`. Phân trang luôn dùng host riêng vì `renderPager()` xoá host của nó.
- **Neo và kéo nút nổi.** Nút bám ngay trên chuông nổi (`.bkc-bell-float`) nhờ đo
  `getBoundingClientRect` lúc khởi tạo và khi đổi kích thước; người dùng kéo được, vị trí lưu
  ở `bakhiReportFab.v1`, `Home` (hoặc `BKReport.resetPosition()`) trả về mặc định. z-index
  2147481250 đặt nút dưới panel thông báo để panel không bị che.
- **Giao diện theo biến.** `bk-report.css` chỉ dùng biến `--bkrep-*`; chủ đề tối là mặc định
  (`color-scheme: dark`) và chủ đề sáng ghi đè khi `<html>` không có lớp `.dark`.
- **Trình duyệt chỉ đọc.** Ba policy SELECT (`reports_select_own`,
  `report_messages_select_own`, `report_notifications_select_own`) dùng
  `public.bakhi_current_student_id()`. Không có policy INSERT/UPDATE/DELETE cho client.
- **Mọi thao tác ghi ở máy chủ.** `report-api` xác minh Anonymous Auth → `student_devices` →
  `students.is_active`; `admin-actions` xác minh `x-admin-token` trong `admin_sessions`.
  Không có `student_id` nào do client gửi lên.
- **Một Trung tâm thông báo.** Thông báo riêng cho người báo cáo nằm ở
  `report_notifications` và được `bk-cloud.js` hiển thị chung nhóm “Phản hồi báo cáo của
  bạn”, có realtime; không dựng chuông thứ hai.
- **Tab Report dùng chung** cho Administrator và Founder (`reports.stats/list/detail/reply/
  privateMessage/status/complete/reopen/assign`), ghi `report_activity_logs` và
  `admin_activity_logs` cho mọi thay đổi.
- Chi tiết đầy đủ: [REPORT_ISSUE.md](REPORT_ISSUE.md).

### 2.6.1. Danh hiệu — Title (7.6.0, hoàn thiện ở 7.7.0)

- Danh hiệu là lớp **độc lập** với badge, khung avatar và thành tích: không tự mở khoá,
  không phụ thuộc `student_badges`/`bakhi_owned_frames`. Từ 7.7.0 danh hiệu mặc định **ánh xạ
  1-1 từ badge nguồn** (`badge_id`) để xác minh quyền sở hữu, kèm hai kiểu hiển thị:
  `style = plain` (font thường, màu tĩnh) và `style = special` (font riêng + gradient chuyển
  động qua `palette`/`effect`), `prefers-reduced-motion` được tôn trọng.
- **Bảng dữ liệu** (`supabase/migrations/20261202000000_bakhi_v760_titles.sql`):
  - `bakhi_titles`: danh mục (`id` slug, `name`, `short` = nhãn ngắn trước tên, `color`,
    `icon`, `description`, `sort_order`, `founder_only`, `active`).
  - `student_titles`: danh hiệu hiện tại của mỗi học sinh (khoá chính `student_id`), kèm
    `assigned_by`/`assigned_at`; mỗi học sinh giữ tối đa một danh hiệu.
  - RLS bật, chỉ policy `select` cho `anon`/`authenticated` (chat cần đọc danh hiệu của người
    khác); không có policy ghi — mọi thao tác ghi qua `admin-actions` bằng `service_role`.
  - Hai bảng nằm trong publication `supabase_realtime` để chat cập nhật tức thời.
- **Hiển thị**: `chat-api` trả `title` trong mọi profile card (thành viên phòng, người gửi
  tin, `profiles.cards`, `students.search`); `bk-chat.js` vẽ nhãn danh hiệu **trước** tên
  hiển thị ở mọi vị trí (bong bóng tin nhắn, đầu hội thoại, danh sách phòng, danh sách chọn
  người, thẻ hồ sơ) và nghe realtime `student_titles` để cập nhật ngay.
- **Founder Dashboard → Danh hiệu**: `titles.list`, `titles.holders`, `titles.save`,
  `titles.seed`, `titles.grant`, `titles.revoke`, `titles.delete` — tất cả trong danh sách
  `founderOnly`, ghi `admin_activity_logs`. `titles.delete` chỉ đặt `active = false` để không
  làm mất nhãn của người đang giữ. Từ 7.9.0, `titles.grant` chỉ giới hạn hồ sơ Founder với
  danh hiệu tối cao `founder`; các danh hiệu Founder khác yêu cầu sở hữu badge nguồn.
- **7.7.0 — quyền sử dụng**: học sinh tự chọn/gỡ danh hiệu mình sở hữu qua Edge Function
  `student-profile` (`action: 'titles'` để đọc, `action: 'title'` để trang bị/gỡ; `title_id`
  rỗng = gỡ). Hàm `bakhi_title_eligible(p_student)` chỉ trả danh hiệu đang dùng mà học sinh
  sở hữu badge nguồn hoặc đã được trao tay (`bakhi_title_grants`), nên client không thể tự cấp.
- **7.7.0 — danh mục mặc định**: 35 danh hiệu = 10 badge tự động tiêu biểu + 21 Founder +
  2 Developer + 2 Administrator (`DEFAULT_TITLES` trong `admin-actions`, seed bằng migration
  `20261203000000_bakhi_v770_titles_rework.sql`). 64 badge tự động còn lại chỉ là thành tích.
- **7.7.0 — hợp đồng phản hồi trao tặng**: mọi action trao vật phẩm trả cùng một hình dạng
  (`success`, `status`, `requested_count`, `granted_count`, `already_owned_count`,
  `failed_count`, `granted_badges`, `errors`, `message`) qua hàm `grantReport`; `request_id`
  trùng được phát hiện bằng `replayGrant` nên không bao giờ trao lặp hoặc ghi lịch sử hai lần.
- **7.7.0 — sửa RPC**: `20261203000001_bakhi_v770_grant_badges_fix.sql` thêm
  `#variable_conflict use_column` cho `bakhi_grant_badges` (OUT parameter `badge_id` trùng tên
  cột làm `on conflict (student_id, badge_id)` báo `42702 ambiguous`).

### 2.7. Chat phòng chung, tin nhắn riêng và nhóm nhỏ (3.7.0)

- **Trang** `/chat/` (`chat/index.html`) nạp `bk-cloud.js` ở chế độ đầy đủ và `bk-chat.js` +
  `bk-chat.css`. Bố cục ba cột (danh sách phòng — hội thoại — Profile Card), dưới 900px gộp
  thành một cột có nút quay lại. Lối vào nằm trong menu tài khoản của `bk-shell.js`.
- **Bảng dữ liệu** (`supabase/migrations/20261120000000_bakhi_chat.sql`):
  - `chat_rooms` (`kind` = `global`/`dm`/`group`, `dm_key` unique cho cặp bạn, một phòng
    `global` duy nhất), `chat_members` (khoá chính `room_id`+`student_id`, `role`, `last_read_at`),
    `chat_messages` (nội dung ≤ 2.000 ký tự hoặc `image_path`, `reply_to`, `deleted_at` xoá mềm)
    và `chat_reactions` (một emoji/người/tin).
  - Trigger `bakhi_chat_member_guard` giới hạn DM đúng 2 và nhóm ≤ 10; `bakhi_chat_message_guard`
    chặn gửi vào phòng không tham gia; `bakhi_chat_touch_room` cập nhật `last_message_at`.
  - **RLS chỉ đọc**: bốn bảng chỉ có policy `select` (phòng chung hoặc phòng mình là thành viên),
    không có policy ghi; `revoke insert/update/delete` khỏi `anon`/`authenticated`.
  - View `chat_profiles` (`security_invoker = false`) chỉ lộ `display_name`, `nickname`, `bio`,
    `avatar_url`, `frame`, `badge_count`, `last_seen_at` — không lộ `student_code` hay dữ liệu học tập.
    `last_seen_at` là lần hoạt động gần nhất từ `student_devices`, dùng cho chấm xanh/“Đang hoạt động”.
  - Từ 7.8.0 passkey WebAuthn đã được gỡ: bảng `student_passkeys`/`passkey_challenges` bị xoá
    trong migration `20261204000000_bakhi_v780_login_code.sql`. Thay bằng `student_login_codes`
    (băm PBKDF2-SHA256 + salt riêng, `failed_count`/`locked_until`), chỉ service_role truy cập.
  - `replica identity full` và đưa cả bốn bảng vào `supabase_realtime`; bucket `chat-images`
    công khai theo URL, chỉ nhận `image/png|jpeg|webp|gif` ≤ 3 MB, mỗi người ghi/xoá trong
    thư mục uuid của chính mình.
- **Edge Function `chat-api`**: mọi thao tác ghi (`messages.send/delete`, `reactions.toggle`,
  `read.mark`, `presence.ping`, `dm.open`, `group.*`, `messages.purge_own`) chạy bằng service role
  sau khi xác minh `auth.uid()` đã gắn với học sinh đang hoạt động và tư cách thành viên. Mỗi
  request cập nhật `student_devices.last_seen_at`; `read.mark` nhận nguyên chuỗi `through`
  (độ chính xác microseconds của PostgreSQL) của tin cuối client đã tải và chỉ tăng
  `last_read_at`, không lùi về sau. Bộ đếm chưa đọc bỏ qua tin do chính học sinh gửi.
  Giới hạn: 300 lượt/giờ/học sinh, 20 tin/phút, 120 cảm xúc/phút. Không tin `student_id` từ client.
- **Máy khách** (`bk-chat.js`): đọc dữ liệu trực tiếp qua Supabase (RLS), ghi qua `BKCloud.chatApi`;
  bộ đếm chưa đọc cả trên tiêu đề tab; realtime cho tin nhắn, cảm xúc và tên nhóm; toàn bộ nội dung
  render bằng `textContent`. Từ 6.0.0 chỉ nhận văn bản (bỏ gửi ảnh/emoji soạn tin); không có đồng hồ đếm ngược.
  Tab ẩn không đánh dấu đã đọc; quay lại tab mới đánh dấu và gửi nhịp hoạt động.
- **Chat 7.0.0**: `chat_conversation_prefs` lưu `pinned`/`archived` theo từng học sinh
  (RLS, realtime). `chat-api` trả `pinned`/`archived` theo phòng và `pref` trong
  `messages.list`; thêm `conversation.pin`/`conversation.archive`. Tổng chưa đọc bỏ qua
  phòng đã lưu trữ. Giao diện có bộ lọc “Đã lưu trữ”, phòng ghim xếp trước, thả cảm xúc
  tối ưu (hoàn tác khi lỗi) và popover xem ai đã thả. Mọi mốc thời gian hiển thị theo
  `Asia/Ho_Chi_Minh` (UTC+7).
- **Đã đọc 7.1.0**: chỉ tin của chính mình mới có dấu — ✓ khi đã gửi, ✓✓ khi
  `last_read_at` lớn nhất của thành viên khác vượt qua `created_at`; không còn nhãn
  chữ. `read.mark` chỉ gửi khi tab đang hiện, cửa sổ được chú ý và người dùng ở gần
  cuối khung, kèm chống gửi lặp cùng mốc; mở phòng/visibility/focus đều kích hoạt lại.
  Nút “Đánh dấu đã đọc” ở đầu hội thoại gọi ngay. Kênh realtime `bakhi-chat` lắng nghe
  cả `chat_members` để dấu đổi ngay khi thành viên khác đọc. Trang Chat đẩy tổng chưa
  đọc sang `BKCloud.setChatUnread`; avatar không còn chấm đỏ, chỉ còn số trong menu.
- **Hồ sơ trong Chat 7.1.0**: `profilesByIds` của `chat-api` đọc thêm
  `student_profiles.banner_url`/`links` và `student_roles.role_key/role_label` bằng
  service role (không cần migration mới). Thẻ hồ sơ hiện ảnh bìa, khung, giới thiệu,
  liên kết và chip danh vị lớp; bấm tên/avatar đầu cuộc DM hoặc hàng “Hồ sơ của bạn”
  mở thẻ tương ứng, cho sửa biệt danh qua `BKProfile.save`.
- **Mật mã đăng nhập (7.8.0, thay passkey)**: mỗi hồ sơ có thể đặt mật mã 4–32 ký tự.
  `_shared/login-code.ts` băm PBKDF2-SHA256 (salt 16 byte riêng, 120.000 vòng) nên mật mã thô
  không nằm trong database hay log. Khi hồ sơ đã có mật mã, `bind-student-session` trả
  `code_required` thay vì gắn thiết bị; client hiện thêm ô nhập mật mã rồi gọi lại kèm `code`.
  Sai 5 lần liên tiếp khoá 10 phút (`failed_count`/`locked_until`), thêm giới hạn 30 lượt/10 phút
  mỗi thiết bị. Đặt/đổi/gỡ mật mã đi qua `student-profile` (`code`, `code.set`, `code.remove`),
  đổi hoặc gỡ bắt buộc nhập đúng mật mã hiện tại. Cách này chạy trên mọi thiết bị, khắc phục
  hạn chế của passkey chỉ dùng được trên máy đã tạo credential.
- **Trạng thái triển khai**: migration `20261120000000`, `20261125000000`,
  `20261126000000` (7.0.0) và `20261204000000` (7.8.0), các Edge Function `chat-api`,
  `bind-student-session`, `admin-actions`, `student-profile` và bucket `chat-images` đã deploy
  trên dự án thật. `passkey-api` đã được gỡ khỏi dự án.

### 2.8. Bá Khí Studio hợp nhất (3.9.0)

- Trước 3.9.0 có hai tệp: `studio/index.html` (trình thiết kế trang A4, khoá
  `lexend-studio-doc`) và `studio/word-paint.html` (Word & Paint, khoá `bakhiStudio.v1`).
  Nay `/studio/index.html` là **ứng dụng duy nhất** với ba chế độ Word / Paint / Chia đôi.
- `studio/word-paint.html` chỉ còn nhiệm vụ tương thích: meta refresh +
  `location.replace('index.html' + search + hash)`, kèm liên kết dự phòng khi JavaScript bị tắt.
  Địa chỉ cũ, dấu trang và liên kết trong tài liệu cũ vẫn hoạt động.
- **Nhập dữ liệu cũ** chạy một lần khi mở trang: đọc `lexend-studio-doc`, dựng HTML tĩnh
  (hộp văn bản, ảnh data URL, hình/SVG giữ toạ độ trên trang A4), thêm tài liệu
  `<tên> (Studio cũ)` vào `bakhiStudio.v1`, ghi mốc `migrated.legacy`. Khoá cũ không bị xoá.
- Không có đồng hồ, không có bài tính giờ; Studio vẫn là công cụ sáng tạo tự nhịp, dữ liệu
  cục bộ, không gửi nội dung lên máy chủ. Kiểm thử: `tools/qa/studio-smoke.js`.

### 2.4. Administrator Dashboard 4.2

- `admin/index.html` nạp `bk-admin-dashboard.css` + `bk-devboard.js` + `bk-badges.js` (chỉ để đọc
  danh mục badge; `BK_ADMIN_ONLY` chặn ghi `bakhiBadges.v1` trong trình duyệt quản trị); mọi
  thao tác ghi đi qua Edge Function `admin-actions` với header `x-admin-token`.
- **12 mô-đun Administrator (Founder thấy 15, thêm Bảo trì, Dữ liệu và tab Founder)**: Tổng quan, Học sinh, Hồ sơ, Thành tích, Chat, Thông báo, What's New,
  Lịch sử phiên bản, Nhật ký, Giám sát, Quyền & bảo mật, Cấu hình, Dữ liệu & sao lưu.
  Sidebar thu gọn được, breadcrumb, tìm kiếm, trạng thái tải/thành công/lỗi/rỗng; bảng có
  lọc, sắp xếp, phân trang phía máy chủ.
- **Hồ sơ**: `profiles.list` (tìm, phân trang, đếm badge) và `profiles.detail` (hồ sơ,
  khung avatar, danh sách badge kèm loại `auto`/`admin`, lý do và thời điểm).
- **Thành tích**: `badges.list` + `badges.grant` + `badges.revoke`. Máy chủ chỉ nhận
  `admin-chosen`/`admin-legend`; mọi id khác trả `NOT_ADMIN_BADGE`. Không có quyền tự mở
  badge tự động — chúng do `student-profile` tính lại từ tiến trình đã đồng bộ.
  Từ 7.0.0 có `badges.autoGrant` (gọi nội bộ `student-profile` để đồng bộ hồ sơ) và
  `badges.grantAll` (bỏ `founder` + mọi `dev-exclusive-*`, chống trùng, trả
  `added`/`alreadyOwned`/`failed`/`excluded`). Thẻ badge mở modal chi tiết.
- **Bảo trì (Founder)**: `settings.set` ghi `public.maintenance` (bật/tắt, lý do, người
  thực hiện) và mở/đóng một dòng `maintenance_history`. Máy chủ tính thời lượng, ghi
  audit và chỉ tạo **một** announcement hoàn tất cho mỗi đợt. `maintenance.history`
  hỗ trợ tìm kiếm/lọc trạng thái. `bk-shell.js` dựng màn hình bảo trì chung có biểu
  tượng tải, khóa cuộn/chạm/bàn phím/liên kết trên toàn trang (`html.bk-maint-lock`),
  chỉ chừa `/admin/`, `/founder/`, Administrator Code và thao tác tải lại trang.
- **Thương hiệu**: Founder sửa tên hiển thị Administrator Dashboard trong
  `public.branding`; `bk-devboard.js` áp dụng realtime cho tiêu đề dashboard và không
  đổi đường dẫn `/admin/`.
- **Chat**: `chat.rooms`/`chat.messages` đọc phòng, thành viên, tin nhắn;
  `chat.delete` xoá mềm + xoá ảnh Storage; `chat.room.delete` chặn phòng `global`;
  `chat.member.remove`; `chat.mute` bật/tắt cột `chat_members.muted` và được `chat-api`
  kiểm tra trước khi nhận tin mới. Mọi hành động ghi `admin_activity_logs`.
- **What's New**: công tắc `public.whatsnew` qua `settings.get`/`settings.set` và bảng xem
  trước các phiên bản đã xuất bản. Chỉ đọc changelog, không tạo bản ghi mới.
- Bố cục nội dung `.bkc-pane` rộng 100% (tối đa 82rem). Tab Lịch sử phiên bản dùng
  `.bkc-stack`: biểu mẫu tạo/sửa chiếm toàn chiều rộng phía trên, danh sách phiên bản bên
  dưới. Tab Thông báo vẫn dùng `.bkc-split` hai cột; dưới 1180px lưới gộp thành một cột.
- `.bkc-dash, .bkc-dash *` đặt `box-sizing: border-box`; `input/textarea/select` có
  `width/max-width: 100%` và `min-width: 0`, nên không tràn mép thẻ.
- Bảng danh sách (thông báo/changelog/học sinh/nhật ký) nằm trong `layout` (lưới), không
  phải `pane`, tránh cột phải rỗng; bảng rộng cuộn trong `.bkc-table-wrap`.
- Panel xem trước có `overflow-wrap: anywhere`.
- Mô-đun Quyền chỉ đọc: hệ thống chỉ có một Administrator Code dùng chung, không có danh
  tính quản trị riêng để phân vai trò. Dashboard hiển thị báo cáo quyền thật từ
  `bakhi_permissions_report()` (hàm, bảng + RLS, policy) thay vì giả lập nhiều vai trò.
- Mô-đun Dữ liệu chỉ kiểm tra toàn vẹn và xuất CSV/JSON; không có nút xoá hàng loạt.

### Vì sao không gộp vào `bakhi-v4.js`

`bakhi-v4.js` là lớp V4 đã ổn định và được nạp bởi trang chủ. Tách module giúp:
- Trang bài học chỉ tải ~68KB (core + page) thay vì toàn bộ 167KB V4.
- Có thể kiểm thử độc lập bằng jsdom.
- Giảm rủi ro regression cho panel cũ và hiệu ứng hiện có.

## 3. Mô hình dữ liệu

Từ 8.0.0, bốn bảng của hệ thống báo cáo nằm trong
`supabase/migrations/20261206000000_bakhi_v800_reports.sql`:

| Bảng | Vai trò | Client đọc |
|---|---|---|
| `reports` | Báo cáo, trạng thái, kết quả xử lý | Chỉ hàng của mình (RLS) |
| `report_messages` | Q&A của một báo cáo | Chỉ thuộc báo cáo của mình |
| `report_activity_logs` | Nhật ký xử lý | Không (qua `admin-actions`) |
| `report_notifications` | Thông báo riêng cho người báo cáo | Chỉ hàng của mình |

Bucket `report-attachments` để private; học sinh ghi/đọc trong thư mục `<student_id>/`,
quản trị viên xem qua signed URL do Edge Function sinh ra.

```jsonc
{
  "v": 1,
  "createdAt": 0, "updatedAt": 0,
  "practice": [{ "id", "ts", "subject", "questionId", "question", "topic",
                 "difficulty", "correct", "source", "lesson" }],
  "review":   [{ "id", "key", "subject", "question", "options", "answer",
                 "explanation", "topic", "difficulty", "wrong", "right",
                 "mastered", "nextReview", "history": [{ "ts", "correct" }] }],
  "notes":    [{ "id", "title", "body", "subject", "questionId", "category",
                 "pinned", "createdAt", "updatedAt" }],
  "bookmarks":[{ "id", "type", "ref", "title", "subject", "folder", "url", "createdAt" }],
  "history":  [{ "id", "ts", "kind", "title", "url", "subject", "meta" }],
  "achievements": { "unlocked": { "id": 0 }, "counters": {} },
  "prefs": { "focus", "fontSize", "ambient", "spaced": {...}, "ai": {...}, "cloud": {...} }
}
```

Giới hạn: practice 5000, history 600, notes 500, bookmarks 500, review 800.
Câu hỏi được lưu dưới dạng **bản sao văn bản** để hiển thị/ôn tập; không có thao tác nào
ghi ngược vào ngân hàng câu hỏi gốc.

### Nhịp ôn tập

`again` (mặc định 1 ngày), `hard` 3, `good` 7, `easy` 14, tối đa 90 — cấu hình trong
Cài đặt. Trả lời đúng 2 lần → `mastered`. Hẹn ngày thủ công bằng ô ngày.

## 4. Ghi nhận luyện tập trên trang bài học

`bk-page.js` đọc các biến toàn cục quen thuộc (`MCQ_BANK`, `TF_BANK`, `rawMcqData`,
`tfData`, `quizData`, `QUESTIONS`, …) và sau khi người dùng bấm kiểm tra (hoặc gọi hàm
`checkAllAnswers`, `submitQuiz`, …) sẽ quét các phần tử phản hồi có class xanh/đỏ.

Đây là **best-effort**: trang có cấu trúc khác có thể gọi trực tiếp:

```js
BK.practice({
  question: '...', questionId: '...', subject: 'ly',
  topic: '...', correct: true, options: ['...'], answer: 0,
  explanation: '...', source: location.pathname, lesson: document.title
});
```

Không có cơ chế nào sửa DOM câu hỏi, đáp án hay giải thích.

## 5. Toàn vẹn nội dung

`tools/content-integrity.js` băm sha256 từng tệp HTML sau khi loại bỏ **đúng khối script**
do lớp nâng cấp chèn (đánh dấu bằng bình luận + đường dẫn `assets/bakhi/`). Từ 3.2.0, bộ lọc
chấp nhận cả thẻ script có thuộc tính bổ sung (ví dụ `data-bk-notify-only="1"`), nên việc
thêm chế độ chỉ thông báo không làm sai lệch hash. Từ 3.9.0, kiểu xuống dòng được chuẩn hoá
về LF **trước** khi bỏ khối: nếu không, trên Windows (checkout CRLF) regex của khối shell
không khớp và một thẻ `</script>` bị xoá nhầm, sinh báo động giả dù nội dung không đổi.
Chuẩn hoá chỉ bỏ khác biệt CRLF/LF — thay đổi nội dung thật vẫn bị phát hiện.

Baseline lưu tại `docs/content-baseline.json` (**122 tệp**, kèm thống kê câu hỏi/giải thích).

Kết quả sau nâng cấp: **122/122 tệp không đổi nội dung** (`verify` thoát mã 0). Nguyên tắc:
- Dòng chứa `assets/bakhi/` là dòng của lớp nâng cấp, được phép thay đổi.
- Mọi thay đổi khác trong tệp nội dung đều bị coi là regression.
- Không chạy `baseline` để “che” thay đổi nội dung; chỉ chạy khi thực sự có thay đổi được duyệt.
- Trang **không có nội dung giáo dục** được viết lại có chủ đích (trang chủ, `studio/`) thì
  dùng `tools/content-integrity-refresh.js <tệp…>`: tool từ chối tệp có dấu hiệu nội dung
  giáo dục và ghi lý do vào `notes` của baseline, thay vì ghi đè toàn bộ baseline.

## 6. Bảo mật

- Mọi dữ liệu người dùng hiển thị qua `textContent` hoặc `BK.util.esc`; Markdown escape
  trước khi bật cú pháp; liên kết chỉ chấp nhận `http(s)`.
- Import JSON: kiểm tra `app`, `kind`, `version`, kiểu mảng; không nhập `prefs`
  (tránh đổi endpoint AI/cloud ngoài ý muốn); không bao giờ `eval` dữ liệu nhập.
- Storage Manager bảo vệ các key quan trọng và yêu cầu xác nhận.
- Không có service-role key. Supabase chỉ dùng anon key + RLS (xem docs/SUPABASE_SETUP.md).
- Developer Playground dùng chung cổng xác thực hiện có (`devToken` + `devPanelBtnContainer`),
  đây là khoá giao diện cho site tĩnh, không phải bảo mật thật.

## 7. Giới hạn đã biết

- Bắt kết quả luyện tập phụ thuộc cấu trúc từng trang; trang không theo mẫu feedback
  sẽ không tự ghi (dùng API `BK.practice`).
- Không có backend mặc định: dữ liệu nằm ở localStorage, không đồng bộ giữa thiết bị trừ khi
  cấu hình Supabase.
- Tệp `images/anh/1.html` rỗng và không được chèn script. Hai trang Studio không có
  `bk-core.js` nên được chèn thủ công `bk-supabase.config.js` + `bk-cloud.js`.
- Tìm kiếm câu hỏi giới hạn ở câu đã luyện/đang ôn và ngân hàng của trang hiện tại,
  không quét trước toàn bộ 119 trang (tránh tải nặng).
- `prefers-reduced-motion` được tôn trọng ở animation mới; các hiệu ứng cũ giữ nguyên.
- Chế độ chỉ thông báo không đồng bộ tiến trình, nên dữ liệu học trên trang bài học chỉ nằm
  trên thiết bị. Đây là chủ ý để không cần đăng nhập khi đang học.
- Hồ sơ và thành tích: bản cục bộ (`bakhiProfile.v1`, `bakhiBadges.v1`) luôn dùng được;
  đồng bộ/xác minh phía máy chủ dùng migration `20261119000000` và Edge Functions
  `student-profile`/`admin-actions`. Nếu máy chủ chưa sẵn sàng, `bk-cloud.js` tự tắt
  đồng bộ hồ sơ sau lỗi 404 và website giữ nguyên hành vi local-first.
- Chat, mật mã đăng nhập (7.8.0) và các bảng 7.0 đã có migration + Edge Function tương ứng; `/chat/` vẫn
  báo “máy chủ chưa sẵn sàng” nếu thiếu cấu hình hoặc phiên Supabase không hợp lệ.
- Thư viện nhạc 7.1 đọc tệp tĩnh trong `music/` và manifest `music/library.json`;
  không cần phiên Supabase và không đẩy dữ liệu lên máy chủ. Bảng `music_tracks` cũ
  vẫn để nguyên cho dữ liệu lịch sử nhưng trình phát không đọc/ghi nữa.
- Vì menu ba gạch bị ẩn, Dev Code **chỉ** vào từ Cài đặt → Nhà phát triển → Dev Code;
  Developer Playground chỉ mở khi `dev-auth` đã cấp phiên (xem 2.5).

## Lớp Supabase (nhận diện, thông báo, đồng bộ)

| Thành phần | Tệp / vị trí | Vai trò |
| --- | --- | --- |
| Nhận diện học sinh | `assets/bakhi/bk-cloud.js` + `supabase/functions/bind-student-session` | Gõ họ tên hoặc chọn gợi ý; máy chủ đối chiếu `normalized_name`; hồ sơ có mật mã phải nhập đúng mật mã trước khi gắn phiên |
| Mật mã đăng nhập | `supabase/functions/student-profile` + `student_login_codes` | Đặt/đổi/gỡ mật mã (**Cài đặt → Hồ sơ**); lưu băm PBKDF2, sai 5 lần khoá 10 phút |
| Tìm kiếm gợi ý | `supabase/functions/search-students` | Tối đa 8 kết quả/lần, giới hạn tần suất theo phiên |
| Đồng bộ tiến trình | `bk-cloud.js` + `sync-student-progress` | Debounce, thử lại theo cấp số nhân, gộp dữ liệu hai chiều |
| Trung tâm thông báo | `bk-cloud.js` + bảng `announcements` | Realtime + đếm chưa đọc + đánh dấu đã đọc; có mặt trên mọi trang (chế độ chỉ thông báo ở trang bài học/Studio) |
| Lịch sử phiên bản | bảng `changelog` | Hiển thị trong trung tâm thông báo và khối “Cập nhật gần đây” chỉ bật ở trang chủ, xếp theo số phiên bản |
| Đồng bộ changelog | `.github/workflows/changelog-sync.yml` + `supabase/functions/changelog-sync` | GitHub Actions đọc `CHANGELOG.md`, gọi hàm bằng `CHANGELOG_SYNC_TOKEN`; hàm dùng RPC `bakhi_publish_changelog` để ghi và tạo thông báo một lần |
| Cấu hình site | bảng `app_settings` | Chỉ đọc khoá `public.*`; `public.whatsnew`, `public.maintenance`, `public.branding`; realtime; ghi qua `admin-actions` |
| Tuỳ chọn hội thoại | bảng `chat_conversation_prefs` | Ghim/lưu trữ theo học sinh; RLS + realtime; ghi qua `chat-api` (`conversation.*`) |
| Lịch sử bảo trì | bảng `maintenance_history` | Bắt đầu/kết thúc, người thực hiện, lý do, thời lượng; Founder đọc qua `admin-actions` (`maintenance.history`) |
| Thư viện nhạc | `music/*.mp3` + `music/library.json` | Tệp tĩnh trong repository; `tools/music-scan.js` sinh manifest; player gộp bài mới một lần, không đồng bộ máy chủ. Bảng `music_tracks` cũ giữ nguyên nhưng không còn dùng |
| Tuỳ chọn hồ sơ | cột `student_profiles.prefs` (jsonb) | `animateAvatarBorders` và tuỳ chọn giao diện; đọc/ghi qua `student-profile` |
| Quản trị | `assets/bakhi/bk-devboard.js`, `admin/index.html`, `founder/index.html` | 13 mô-đun Administrator; 16 mô-đun Founder, xác thực mã qua `admin-auth`; mọi thao tác kiểm tra lại ở `admin-actions` |
| Dev Code | `assets/bakhi/bk-settings.js`, `bk-cloud.js`, `supabase/functions/dev-auth`, bảng `dev_sessions` | Xác minh mã ở máy chủ, giới hạn tần suất, chỉ trả token + hạn dùng; tách hoàn toàn khỏi phiên quản trị |

Ghi chú triển khai:

- Mọi Edge Function đặt `verify_jwt = false` trong `supabase/config.toml` nhưng tự kiểm tra phiên
  người gọi (ẩn danh), `x-admin-token` (quản trị) hoặc `CHANGELOG_SYNC_TOKEN` (workflow).
- Bảng `students` không có policy đọc cho `anon`/`authenticated`; chỉ service role trong Edge
  Function đọc được, nên danh sách thật không lộ ra trình duyệt.
- `announcements`, `changelog` và `app_settings` nằm trong publication `supabase_realtime` để
  cập nhật tức thời.
- Chống trùng changelog: `changelog.version` là duy nhất; `announcements.changelog_version`
  có partial unique index; RPC dùng `pg_advisory_xact_lock` và chỉ tạo thông báo khi phiên
  bản mới hơn mọi phiên bản đã xuất bản và chưa có thông báo liên kết.
- Workflow chạy lại chỉ cập nhật hàng đã có (hash nội dung), không tạo thêm thông báo; lỗi
  từng phần được ghi vào `sync_state`/`sync_error` và trả HTTP 207.

## 4. Gamification 2.0 (8.3.0)

- Sổ XP duy nhất `xp_transactions`; bảng tiến trình `user_progression` chỉ là bản suy ra
  có hàm đối chiếu `bk_gam_admin_drift()`.
- Reward Engine là các hàm Postgres `bk_gam_*` chạy trong một transaction; client gọi
  qua Edge Function `gamification-api`, không ghi bảng.
- Client: `bk-gamification.js` (theo dõi + hàng đợi + dashboard) và
  `bk-devboard-gamification.js` (tab quản trị). Trang `/gamification/`.
- Không thay đổi badge/title/profile/sync hiện có.

Chi tiết: [GAMIFICATION_ARCHITECTURE.md](GAMIFICATION_ARCHITECTURE.md),
[XP_LEVEL_SYSTEM.md](XP_LEVEL_SYSTEM.md), [GAMIFICATION_SECURITY.md](GAMIFICATION_SECURITY.md).

### 4.1. Progress Loader (8.3.1)

`bk-gamification.js` là nơi duy nhất tải tiến trình: `BKCloud.gamificationApi({action:'state'})`
→ `gamification-api` → `bk_gam_state` (+ `bk_gam_sync_missions`). Client có máy trạng thái
(restoring/loading/ready/…), retry giới hạn, timeout, chống phản hồi cũ và cache theo
`studentId`. Chi tiết: [GAMIFICATION_PROGRESS_LOADING.md](GAMIFICATION_PROGRESS_LOADING.md).

### 4.2. Avatar & khung avatar (8.3.5)

`student_profiles` là nguồn dữ liệu hiển thị danh tính duy nhất: `avatar_url` (ảnh) và
`frame` (khung đang trang bị). `BKProfile` giữ cache localStorage theo `student_id` và
`bk-cloud.js` đồng bộ hai chiều qua `student-profile`.

- Mọi nơi hiển thị avatar dùng `BKProfile.avatarNode()` (navbar, menu, Hồ sơ, Chat,
  hero `/gamification/`).
- Trang bị khung ở Gamification: `gamification-api` → `bk_gam_equip` ghi
  `user_inventory.is_equipped` **và** `student_profiles.frame` trong cùng transaction;
  API trả `{ kind, frame }`, client gọi `BKProfile.applyServerFrame()`.
- `bakhi_owned_frames` = khung cơ bản + khung thưởng badge (bảng ánh xạ `bakhi_badge_frames`,
  58 ánh xạ) + khung nhận qua kho vật phẩm (`reward_catalog.metadata.profile_frame`) +
  khung đang trang bị trong hồ sơ (giữ nguyên khi nâng cấp). Trigger
  `bakhi_profile_frame_guard` chặn khung chưa sở hữu ở tầng DB.
- 8.3.6: `/gamification/` nạp `bk-profile.js` + `bk-badges.js`; `bk-cloud.js` áp danh sách
  `frames` máy chủ trả về; lỗi khung chỉ thông báo một lần.
- Client không hạ khung máy chủ về `none`; chỉ khung không tồn tại trong danh mục mới bị hạ.

Chi tiết: [AVATAR_SYNC_V835.md](AVATAR_SYNC_V835.md) ·
[AVATAR_FRAME_SYSTEM.md](AVATAR_FRAME_SYSTEM.md).

### 4.3. Quản trị tiến trình từ Founder Dashboard (8.3.6)

Tab **Gamification** của Founder Dashboard (`bk-founder-gamification.js`) gửi một
`audience` (`all` | `student` | `level`) tới `gamification-api`:

| Action | Việc làm |
|---|---|
| `admin.audience.preview` | Đếm và lấy mẫu học sinh trong đối tượng (tối đa 2000) |
| `admin.level.set` | `bk_gam_set_level` cho từng học sinh (tối đa 300/lần) |
| `admin.xp.buff` | Tạo dòng `gamification_xp_buffs` (x1,1–x10, 1–720 giờ) |
| `admin.xp.buff.list` / `admin.xp.buff.end` | Danh sách / tắt buff (giữ lịch sử) |

`bk_gam_award` nhân XP bằng `bk_gam_active_buff(student)`; buff chồng nhau lấy hệ số cao
nhất. Học sinh thấy buff qua `buffs`/`xp_buff` trong `bk_gam_state` (API chèn thêm).
Đặt cấp độ ghi sổ `xp_transactions` từng phần ≤ 100.000 XP nên `bk_gam_admin_drift` luôn
rỗng. Chi tiết: [GAMIFICATION_ADMIN_V836.md](GAMIFICATION_ADMIN_V836.md).

### 4.4. Sinh mã trong dashboard quản trị (8.3.5)

`bk-devboard-gamification.js` tự sinh mã từ tên cho thành tựu, Boss, nhiệm vụ, node và
phần thưởng (`BKGamificationAdmin.slugify`), cảnh báo trùng và đề xuất `_2`, `_3`, có xem
trước và gom trường kỹ thuật vào “Cài đặt nâng cao”. Máy chủ xác nhận lại bằng `codeOf()`
và `expect_new` → `409 CODE_TAKEN`. Chi tiết: [CODE_GENERATOR.md](CODE_GENERATOR.md).

# Kiến trúc Bá Khí

Tài liệu này mô tả hiện trạng repository, lớp nâng cấp dùng chung, cơ chế thông báo và các
quyết định kỹ thuật. Cập nhật: 15/11/2026 (phiên bản 3.2.0).

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
| Supabase | Đã tích hợp: migration + 6 Edge Function + RLS + realtime (xem mục 8) |
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
index.html ──► bk-core.js ──► bk-learn.js ──► bk-dev.js
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
  (xem mục 2.1). Không chứa nội dung giáo dục.
- **bk-learn.js/css** — UI: dock nổi, modal Trung tâm học tập 7 tab, command palette
  (Ctrl/⌘+K), tìm kiếm toàn cục (`/`), focus mode, xuất/nhập.
- **bk-dev.js/css** — Developer Playground 2.0: cửa sổ nổi kéo/đổi kích thước, nhớ
  vị trí/kích thước/tab, 11 công cụ (thêm tab Music). Không thay thế panel cũ.
- **bk-music.js/css** — Music Player dùng chung: thư viện 5 bài, queue (thêm/xoá/
  kéo thả hoặc `Alt+↑↓`), shuffle, repeat 3 chế độ, âm lượng, lyrics có timestamp.
  Quy ước file (không phải sửa code): `music/<slug>.mp3` (bài hát),
  `music/<slug>.txt` (lời, dòng `#` là ghi chú), `music/<slug>.png` (bìa, tự dò
  `.jpg/.jpeg/.webp`). Panel nổi kéo được, đổi kích thước ở góc dưới-trái, thu nhỏ/
  phóng to, nhớ bố cục (`bakhiMusic.panel.v1`); state ở `bakhiMusic.v2`, vị trí logo
  ở `bakhiMusic.fab.v1`, lời tự nhập ở `bakhiMusic.lyrics.v1`; không autoplay.
  Phím tắt (`Space`, `←/→`, `M`, `Esc`) chỉ kích hoạt khi panel mở và bỏ qua khi đang
  gõ. Có `BKMusic.on(fn)` phát sự kiện thay đổi để UI khác (tab Music của Dev Panel)
  cập nhật không cần polling. Media Session được đăng ký khi trình duyệt hỗ trợ.
  Do `bk-core.js` nạp trên mọi trang nên chỉ có một audio instance cho mỗi trang.
  Chi tiết: [MUSIC.md](MUSIC.md).
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
  └─ injectCss()                       (bk-cloud.css?v=4.0.1)
  └─ buildBell()                       (chuông nổi góc phải dưới)
  └─ ensureReady() → ensureSdk() → ensureSession()   (Anonymous Auth)
       └─ subscribeRealtime()          (announcements + changelog)
       └─ loadAnnouncements(true) + loadChangelog()
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

### 2.2. Administrator Dashboard 4.0

- `admin/index.html` nạp `bk-admin-dashboard.css` + `bk-devboard.js`; mọi thao tác ghi đi qua
  Edge Function `admin-actions` với header `x-admin-token`.
- Bố cục nội dung `.bkc-pane` rộng 100% (tối đa 82rem). Hai tab Notifications/Changelog dùng
  `.bkc-split` hai cột; mỗi cột là một `.bkc-card`. Dưới 1180px lưới gộp thành một cột để
  biểu mẫu không bị bóp hẹp.
- `.bkc-dash, .bkc-dash *` đặt `box-sizing: border-box`; `input/textarea/select` có
  `width/max-width: 100%` và `min-width: 0`, nên không tràn mép thẻ.
- Bảng danh sách (thông báo/changelog/học sinh) nằm trong `layout` (lưới), không phải `pane`,
  tránh cột phải rỗng.
- Panel xem trước có `overflow-wrap: anywhere`; bảng dữ liệu rộng cuộn trong `.bkc-table-wrap`.

### Vì sao không gộp vào `bakhi-v4.js`

`bakhi-v4.js` là lớp V4 đã ổn định và được nạp bởi trang chủ. Tách module giúp:
- Trang bài học chỉ tải ~68KB (core + page) thay vì toàn bộ 167KB V4.
- Có thể kiểm thử độc lập bằng jsdom.
- Giảm rủi ro regression cho panel cũ và hiệu ứng hiện có.

## 3. Mô hình dữ liệu

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
thêm chế độ chỉ thông báo không làm sai lệch hash.

Baseline lưu tại `docs/content-baseline.json` (**119 tệp**, kèm thống kê câu hỏi/giải thích).

Kết quả sau nâng cấp: **119/119 tệp không đổi nội dung** (`verify` thoát mã 0). Nguyên tắc:
- Dòng chứa `assets/bakhi/` là dòng của lớp nâng cấp, được phép thay đổi.
- Mọi thay đổi khác trong tệp nội dung đều bị coi là regression.
- Không chạy `baseline` để “che” thay đổi nội dung; chỉ chạy khi thực sự có thay đổi được duyệt.

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

## Lớp Supabase (nhận diện, thông báo, đồng bộ)

| Thành phần | Tệp / vị trí | Vai trò |
| --- | --- | --- |
| Nhận diện học sinh | `assets/bakhi/bk-cloud.js` + `supabase/functions/bind-student-session` | Gõ họ tên hoặc chọn gợi ý; máy chủ đối chiếu `normalized_name` và gắn phiên |
| Tìm kiếm gợi ý | `supabase/functions/search-students` | Tối đa 8 kết quả/lần, giới hạn tần suất theo phiên |
| Đồng bộ tiến trình | `bk-cloud.js` + `sync-student-progress` | Debounce, thử lại theo cấp số nhân, gộp dữ liệu hai chiều |
| Trung tâm thông báo | `bk-cloud.js` + bảng `announcements` | Realtime + đếm chưa đọc + đánh dấu đã đọc; có mặt trên mọi trang (chế độ chỉ thông báo ở trang bài học/Studio) |
| Lịch sử phiên bản | bảng `changelog` | Hiển thị ở What's New và trong trung tâm thông báo, xếp theo số phiên bản |
| Quản trị | `assets/bakhi/bk-devboard.js`, `admin/index.html` | 6 tab, xác thực Administrator Code qua `admin-auth` |

Ghi chú triển khai:

- Mọi Edge Function đặt `verify_jwt = false` trong `supabase/config.toml` nhưng tự kiểm tra phiên
  người gọi (ẩn danh) hoặc `x-admin-token` (quản trị).
- Bảng `students` không có policy đọc cho `anon`/`authenticated`; chỉ service role trong Edge
  Function đọc được, nên danh sách thật không lộ ra trình duyệt.
- `announcements` và `changelog` nằm trong publication `supabase_realtime` để cập nhật tức thời.

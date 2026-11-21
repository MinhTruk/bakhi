# Tính năng Bá Khí 8.0.0

Tài liệu liệt kê toàn bộ tính năng đang có, trạng thái và ghi chú triển khai. Ký hiệu:
✅ hoàn thành · 🟡 một phần · ⛔ chưa làm · 🚫 bị chặn

Phạm vi: trang chủ, các trang môn học/bài học/đề kiểm tra, hai trang Studio, trình phát nhạc,
Trung tâm học tập, hồ sơ/cài đặt, Developer Playground, Administrator Dashboard và lớp Supabase.

## A. Nền tảng học tập (có trên mọi trang bài học + trang chủ)

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Phân tích tiến độ (tổng câu, đúng/sai, độ chính xác, theo môn/chủ đề, hoạt động 14 ngày & 8 tuần, chủ đề hay sai, mốc) | ✅ | Không đo thời gian học, không xếp hạng |
| 2 | Ôn tập thông minh (tự lưu câu sai, lịch ôn theo kết quả, thành thạo, tìm/lọc, hẹn ngày, lịch sử ôn) | ✅ | Spaced repetition cấu hình được |
| 3 | Ghi chú cá nhân (theo môn/câu hỏi, ghim, tìm, danh mục, Markdown an toàn, xuất) | ✅ | Markdown escape trước, chỉ http(s) |
| 4 | Đánh dấu (câu hỏi, bài học, môn, tài liệu; nhóm; tìm/lọc) | ✅ | Nút đánh dấu trên mỗi trang bài học |
| 5 | Lịch sử học tập (bài đã mở, câu đã luyện/ôn; tìm; xoá từng mục/toàn bộ) | ✅ | Không phải hồ sơ thi cử |
| 6 | Thành tích (30 mốc, 5 nhóm) | ✅ | Không streak/điểm danh; có tiến độ, lọc, tìm kiếm, thông báo |
| 7 | Chế độ tập trung (ẩn điều hướng, cỡ chữ, nền nhẹ, Esc) | ✅ | Không có đồng hồ phiên |
| 8 | Tìm kiếm toàn cục (bài học, câu đã luyện, câu cần ôn, ghi chú, đánh dấu; gợi ý, nhóm, tô sáng, debounce) | ✅ | Không quét trước toàn site |
| 9 | Command palette `Ctrl/⌘ + K` (điều hướng, công cụ, theme, focus, dev) | ✅ | Bàn phím đầy đủ |
| 10 | Phím tắt (`Ctrl+K`, `/`, `Esc`, `←/→`, `A/B/C/D`) | ✅ | Bỏ qua khi đang gõ |
| 11 | Xuất / nhập JSON (tất cả, ghi chú, đánh dấu, thống kê; xem trước; xác thực; hợp nhất) | ✅ | Không ghi đè ngân hàng câu hỏi |
| 12 | Ghi nhận luyện tập tự động trên trang bài học | 🟡 | Theo mẫu feedback quen thuộc; API `BK.practice()` cho trang khác |
| 13 | Đồng bộ Supabase | ✅ | Adapter + migration + Edge Function; bật bằng cấu hình, không bắt buộc |
| 14 | AI hỗ trợ | 🟡 | Adapter + cấu hình endpoint; cần proxy (không có key trong trình duyệt) |
| 15 | Danh hiệu (Title) trong chat: Founder trao/thu hồi, nhãn hiển thị trước tên ở mọi vị trí, realtime | ✅ | Độc lập badge/khung/thành tích; xem A2.1 |

## A2. Founder Dashboard (6.0.0)

- Mở từ **Cài đặt → Founder** hoặc trực tiếp `founder/`; xác thực bằng Founder Code riêng.
- Founder Code chỉ lưu dạng băm SHA-256 trong `founder_config`; Edge Function `admin-auth`
  so sánh băm và cấp phiên `scope = founder`.
- Founder thấy đủ 14 mô-đun Administrator, thêm tab **Founder** (`bk-founder.js`) để tìm người nhận,
  trao badge/khung, cấp trọn bộ 99 badge và toàn bộ 50 khung cho hồ sơ `is_founder = true`.
- Từ 7.9.0, Founder trao được **mọi badge và khung Founder cho bất kỳ học sinh**, trừ badge tối
  cao **Thiên Khải Sáng Thế** (`founder`) vẫn chỉ dành cho hồ sơ `is_founder = true`. Danh hiệu
  ánh xạ badge Founder cũng trao được sau khi người nhận sở hữu badge nguồn.
- Các quyền tối mật chỉ Founder: bảo trì, dữ liệu & sao lưu, đặt danh vị, trao badge
  Founder/Developer. Máy chủ chặn Administrator thường bằng `FOUNDER_ONLY`.

### A2.1. Danh hiệu — Title (7.6.0, hoàn thiện 7.7.0)

- Danh hiệu tách hẳn khỏi badge, khung avatar và thành tích; mỗi học sinh giữ tối đa một danh hiệu.
- Danh hiệu hiển thị **trước** tên hiển thị trong chat: bong bóng tin nhắn, đầu hội thoại,
  danh sách đoạn chat, danh sách chọn người nhận, thẻ hồ sơ và Hồ sơ cá nhân; đổi ở máy chủ là
  chat cập nhật ngay.
- **35 danh hiệu mặc định ánh xạ badge**: 10 badge tự động tiêu biểu (Tri Thức Nhập Môn,
  Tam Thập Thông Tuệ, Ngũ Bách Tinh Anh, Bá Khí Thiên Đồ, Tam Thập Nhật Viên Mãn, Vô Tận Âm
  Trường, Lưu Tinh Kiếm Vũ, Tiểu Quán Miện, Ngũ Bách Ngôn Phong, Thất Thập Tam Quy Tông) mang
  kiểu **Bình thường**; 21 Founder + 2 Developer + 2 Administrator mang kiểu **Đặc biệt**
  (font riêng + gradient chuyển động).
- **Hai kiểu hiển thị**: Bình thường (font thường, màu tĩnh) và Đặc biệt (font display/serif/
  mono/elegant/rounded + bảng màu gradient + hiệu ứng flow/shimmer/pulse/aurora), có xem trước
  trong trình soạn và tôn trọng `prefers-reduced-motion`.
- **Học sinh tự chọn**: khối “Danh hiệu” trong Hồ sơ / Cài đặt liệt kê đúng những danh hiệu
  mình sở hữu (badge nguồn hoặc được trao tay), cho trang bị, đổi và gỡ.
- Founder Dashboard có **tab Danh hiệu** riêng: tải danh mục, tìm/lọc theo kiểu, thêm/sửa
  (mã, tên, nhãn ngắn, màu, icon, mô tả, thứ tự, badge nguồn, kiểu, font, palette, hiệu ứng,
  chỉ-Founder, trạng thái), xem người giữ, trao/gỡ, ngừng dùng và bổ sung danh hiệu mặc định.
- Bảng dữ liệu: `bakhi_titles` (danh mục) + `student_titles` (danh hiệu hiện tại) +
  `bakhi_title_grants` (danh hiệu tự tạo đã trao tay); RLS chỉ đọc, ghi qua Edge Function.
  Migration `20261202000000_bakhi_v760_titles.sql` và
  `20261203000000_bakhi_v770_titles_rework.sql`.

### A3. Report Issue + Q&A (8.1.0, hoàn thiện 8.1.1)

> 8.1.1 thu hồi `INSERT/UPDATE/DELETE` ở tầng GRANT của `anon`/`authenticated` trên bốn bảng
> Report Issue (RLS đã chặn từ 8.0.0), ghim `search_path` cho trigger `bakhi_v800_touch` và
> đưa `passkey-api` ra khỏi `config.toml`. Bảng dưới mô tả tính năng, không phải trạng thái
> triển khai — trạng thái đó ở `docs/PRODUCTION_READINESS_REPORT.md`.

| Hạng mục | Trạng thái |
|---|---|
| Nút nổi trên mọi trang môn học / bài học / Studio / Chat / Hồ sơ | 🟢 Hoạt động |
| Nút nổi neo trên chuông thông báo, kéo được và nhớ vị trí | 🟢 Hoạt động |
| Giao diện tối đồng bộ Trung tâm thông báo (`--bkrep-*`, `color-scheme`) | 🟢 Hoạt động |
| Mục **Cài đặt → Report Issue** trên trang chủ | 🟢 Hoạt động |
| Biểu mẫu đầy đủ (tiêu đề, nhóm, loại, ưu tiên, mô tả, tệp, ngữ cảnh) | 🟢 Hoạt động |
| Lịch sử và theo dõi báo cáo của chính mình | 🟢 Hoạt động |
| Tìm kiếm, lọc trạng thái và tải thêm trong “Báo cáo của tôi” | 🟢 Hoạt động |
| Bản nháp giữ qua lần chuyển trang (`bakhiReportDraft.v1`) | 🟢 Hoạt động |
| Q&A riêng cho từng báo cáo (hai chiều) | 🟢 Hoạt động |
| Thông báo riêng trong Trung tâm thông báo hiện có | 🟢 Hoạt động |
| Tab **Report** trong Administrator và Founder Dashboard | 🟢 Hoạt động |
| Huy hiệu chưa đọc, tự làm mới, gán người xử lý trong dashboard | 🟢 Hoạt động |
| Complete Report + lịch sử xử lý + mở lại | 🟢 Hoạt động |
| Tệp đính kèm riêng tư (bucket private, signed URL) | 🟢 Hoạt động |
| RLS chỉ cho đọc dữ liệu của chính mình | 🟢 Hoạt động |
| Xuất báo cáo ra CSV theo bộ lọc (`reports.export`) | 🟢 Hoạt động |
| Thông báo đẩy ngoài trình duyệt (Web Push) | ⚪ Chưa triển khai |

Chi tiết: [REPORT_ISSUE.md](REPORT_ISSUE.md).

### A2.2. Bảo trì toàn hệ thống & Founder Login (7.9.2)

- **Một màn hình bảo trì cho mọi website**: trang chủ, 116 trang môn học/Studio, chat, hồ sơ,
  cài đặt đều do `bk-shell.js` dựng khi `public.maintenance.enabled = true`. Màn hình nền đen
  tuyền, căn giữa: tiêu đề **Bảo trì**, lý do (không hardcode), **Thời gian bắt đầu** lấy từ
  máy chủ/DB, vòng xoay tải và nút **Đăng nhập Founder**. Navbar và nội dung phía dưới bị ẩn.
- **Founder Login dùng chung**: nút mở `assets/bakhi/bk-founder-auth.js` — cùng Edge Function
  `admin-auth` (`scope = founder`), cùng bảng `founder_config` (băm SHA-256), cùng phiên
  `admin_sessions` và cùng thời hạn với trang `founder/`. Không có mã Founder thứ hai.
- **Xác minh ở máy chủ**: trước khi gỡ màn hình, client gọi `admin-actions → session.check`;
  chỉ khi máy chủ trả `scope = founder` mới cho vào. Sửa sessionStorage hay biến JavaScript
  không có tác dụng. Ô mã bị che, có hiện/ẩn, chống gửi lặp, báo “Mã Founder không hợp lệ.”
  khi sai và thông báo thử lại sau khi bị giới hạn 5 lần / 10 phút.
- **Administrator không vượt được bảo trì**: màn hình cũ trong `bk-core.js` đã bị gỡ; lối nhập
  Administrator Code bị loại bỏ hoàn toàn. `settings.set` cho `public.maintenance` chỉ Founder.
- **Tab Bảo trì của Founder Dashboard** có Global Maintenance (bật/tắt có xác nhận, lý do, giờ
  bắt đầu do máy chủ ghi), **Founder Access** (kiểm tra phiên, mở trang bảo trì, mở Founder
  Dashboard) và **Maintenance History** (lý do, người thực hiện, thời gian bắt đầu/kết thúc).
- **Đồng bộ**: realtime `app_settings` cập nhật tức thời; sau khi kết nối realtime được khôi
  phục, `bk-cloud.js` đọc lại feature flag nên không cần xoá cache hay cài lại.

## B. Developer Playground 2.1 — 14 tab (`Ctrl+Shift+G`, sau khi xác thực Dev Code)

Dev Code nằm trong **Cài đặt → Nhà phát triển → Dev Code**, xác minh ở Edge Function
`dev-auth`; mã không lưu, chỉ token phiên trong `sessionStorage`. Nút công cụ chỉ xuất hiện
sau khi xác thực, ở góc dưới bên trái ngay trên Music Player.

| # | Công cụ | Trạng thái | Chi tiết |
|---|---|---|---|
| 1 | Cửa sổ nổi | ✅ | Kéo, đổi kích thước, thu nhỏ, phóng to, nhớ vị trí/kích thước/tab; thu nhỏ giữ trạng thái |
| 2 | Inspector 2.0 | ✅ | Chọn phần tử, highlight, breadcrumb DOM, thuộc tính/class, computed styles, kích thước, box model, copy selector/HTML, sửa style tạm thời + khôi phục |
| 3 | CSS Studio | ✅ | Live CSS, rule builder (màu/chữ/khoảng cách/bo góc/bóng), undo/redo, reset, xuất CSS |
| 4 | Animation Studio | ✅ | 7 preset, keyframes, duration/delay/easing (kể cả cubic-bezier), hướng, lặp, timeline, play/pause/restart, xuất CSS, lưu/nhập preset, tôn trọng reduced-motion |
| 5 | Performance Lab | ✅ | TTFB, DOMContentLoaded, load, FCP, LCP, CLS, long tasks, FPS đo thật, tài nguyên nặng nhất; “không hỗ trợ” khi thiếu API |
| 6 | Storage Manager | ✅ | localStorage/sessionStorage, tìm, xem/sửa, xoá có bảo vệ, xuất/nhập, dung lượng |
| 7 | Console Pro | ✅ | log/warn/error/info/debug, lỗi JS, promise rejection, lọc, tìm, thời gian, xuất; console gốc giữ nguyên |
| 8 | Network Monitor | ✅ | Resource URL/loại/thời lượng/dung lượng/status, tổng quan lỗi; chỉ đọc |
| 9 | Theme Editor | ✅ | Biến màu/nền/chữ/bo góc/khoảng cách/bóng, xem trước, preset, khôi phục, xuất |
| 10 | Component Library | ✅ | 11 nhóm thành phần có demo + mã mẫu |
| 11 | Backup Manager | ✅ | Tạo/xem trước/khôi phục/xuất/nhập, kiểm tra phiên bản, xác nhận trước khi khôi phục |
| 12 | Music (tab) | ✅ | Trạng thái trực tiếp theo sự kiện, mở/phóng to/thu nhỏ/đặt lại bố cục trình phát, kiểm tra file, thư viện 5 bài |
| 13 | Studio (tab) | ✅ | Chỉ đọc trạng thái `bakhiStudio.v1`, mở nhanh Studio/Word & Paint, tải JSON; không nhân bản Studio |
| 14 | Dữ liệu | ✅ | Chỉ đọc 6 khoá dùng chung, xuất JSON từng khoá hoặc toàn bộ; không tự ghi đè dữ liệu |
| 15 | Gỡ lỗi | ✅ | Chẩn đoán phiên bản, viewport, theme, cloud, shell, trợ năng, phiên Admin/Dev; không chứa token hay mã |

Thoát Dev: nút đỏ bên trái Thu nhỏ, có hộp xác nhận; thoát xoá phiên, đóng panel và gỡ FAB.
Không có animation favicon và không có Highlight Manager độc lập.

## C. Music Player dùng chung

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Thư viện 5 bài theo quy ước file `music/<slug>.mp3` · `.txt` · `.png` | ✅ | Bỏ tệp mới vào `music/`, chạy `tools/music-scan.js`; player tự gộp qua `music/library.json` (7.1.0) |
| 2 | Queue: thêm, xoá, phát tiếp theo, kéo thả đổi thứ tự, `Alt+↑/↓` cho bàn phím | ✅ | Không tạo audio thứ hai |
| 3 | Shuffle (giữ bài đang phát đầu queue) và repeat 3 chế độ (off/all/one) | ✅ | Nhớ qua `bakhiMusic.v2` |
| 4 | Lời bài hát: file `.txt` (dòng `#` là ghi chú, `[mm:ss]` để đồng bộ) và lời tự nhập | ✅ | Lời tự nhập được ưu tiên; lỗi file không làm hỏng player |
| 5 | Bìa tự dò `.png → .jpg → .jpeg → .webp` | ✅ | Bìa xoay khi phát (tắt khi reduced-motion) |
| 6 | Bố cục nổi: kéo tiêu đề, kéo góc đổi kích thước, thu nhỏ, phóng to, nhấp đúp đặt lại | ✅ | Nhớ ở `bakhiMusic.panel.v1`; màn hình hẹp tự thành bảng đáy |
| 7 | Phím tắt `Space`, `←/→`, `M`, `Esc` chỉ khi panel mở | ✅ | Bỏ qua khi đang gõ hoặc tiêu điểm ở nút/liên kết |
| 8 | Không autoplay + nút “Tiếp tục” chỉ ẩn khi bài thật sự phát | ✅ | Tránh mất nút mà không có nhạc |
| 9 | Media Session (khoá màn hình/tai nghe) | 🟡 | Tuỳ trình duyệt |
| 10 | Logo ♪ kéo thả, chuột phải đặt lại | ✅ | Không đè logo Dev Panel |

## D. Khả năng tiếp cận & thiết bị

- Toàn bộ nút có nhãn `aria-label`; trạng thái bật/tắt dùng `aria-pressed`, logo dùng
  `aria-expanded`, panel là `role="dialog"` có tiêu điểm khi mở.
- Tab theo chuẩn `tablist`/`tabpanel` (`aria-selected`, `aria-controls`) và đổi tab bằng
  phím mũi tên `Home`/`End` ở cả Music Player lẫn Trung tâm học tập.
- Vùng `aria-live` đọc tên bài, trạng thái phát, thay đổi bố cục; thanh tua/âm lượng có
  `aria-valuetext`.
- Mục queue dùng được bằng bàn phím: `Enter`/`Space` phát, `Delete` xoá, `Alt+↑/↓` đổi vị trí.
- Viền tiêu điểm rõ ràng; tay chạm to hơn trên thiết bị cảm ứng; bố cục dùng được ở
  màn hình hẹp (panel nhạc thành bảng đáy, hub thành một cột).
- Tôn trọng `prefers-reduced-motion`: tắt xoay bìa, nhấp nháy, hiệu ứng chuyển tab.

## E. Cách dùng nhanh

- **Trung tâm học tập**: `Ctrl+K` → “Trung tâm học tập”, hoặc **Cài đặt → Trung tâm học tập**.
- **Hồ sơ & thành tích**: bấm avatar ở góc phải header → Hồ sơ cá nhân (hoặc `/profile/`).
- **Cài đặt**: avatar → Cài đặt (`/settings/`): hồ sơ, giao diện, trợ năng, hình nền, quyền.
- **Ôn câu sai**: `Ctrl+K` → “Ôn tập câu đã sai”; dùng `←/→` chuyển câu, `A/B/C/D` chọn đáp án.
- **Ghi chú nhanh khi đang học**: `Ctrl+K` → Ghi chú.
- **Focus mode**: `Ctrl+K` → Chế độ tập trung, hoặc `Esc` để thoát.
- **Tìm kiếm**: phím `/` khi không ở trong ô nhập (bảng lệnh kiêm tìm kiếm toàn cục). Menu hồ sơ
  không còn ô tìm kiếm căn bản — ô này đã bị gỡ hẳn từ 7.9.1.
- **Developer Playground**: `Ctrl+Shift+G` (chỉ khi máy đã có quyền Developer).
- **Music Player**: logo ♪ góc trái dưới; `Space` phát/tạm dừng, `←/→` bài trước/kế
  (chỉ khi panel nhạc mở), `Esc` đóng. Thêm bài bằng liên kết YouTube/Spotify/SoundCloud
  trong tab Thư viện.
- **Thông báo**: bấm chuông (header ở trang chủ, góc phải dưới ở trang bài học/Studio);
  bấm “Đánh dấu tất cả đã đọc” để xoá badge; bấm một mục để đọc đầy đủ.
- **Studio**: avatar → Bá Khí Studio, hoặc `/studio/` (địa chỉ cũ `/studio/word-paint.html`
  tự chuyển hướng).

URL hỗ trợ mở trực tiếp: `?bk=hub`, `?bk=review`, `?bk=notes`, `?bk=bookmarks`,
`?bk=history`, `?bk=achievements`, `?bk=settings`, `?bk=search&q=...`.

## F. Cấu hình AI (tuỳ chọn)

1. Dựng một proxy (Cloudflare Worker, Vercel function, backend riêng) nhận
   `POST { model, messages }` và gọi nhà cung cấp AI bằng khoá lưu ở server.
2. Trong Bá Khí: Cài đặt → AI → nhập URL proxy + tên model.
3. AI chỉ tạo nội dung **tham khảo**, luôn gắn nhãn “Nội dung do AI tạo — không phải
   nội dung gốc đã kiểm duyệt”. Không có thao tác nào để AI sửa câu hỏi/đáp án gốc.

## G. Bá Khí Studio — Word & Paint (`studio/index.html`)

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Soạn thảo trang A4: đậm/nghiêng/gạch chân/gạch ngang, tiêu đề 1–3, trích dẫn | ✅ | `execCommand` + `styleWithCSS`, giữ vùng chọn khi bấm nút |
| 2 | Cỡ chữ, màu chữ, màu nền, danh sách, canh lề, liên kết, chèn ảnh, xoá định dạng | ✅ | Ảnh giới hạn 1,2 MB |
| 3 | Dán an toàn | ✅ | Bỏ script/iframe/`on*`/`javascript:` |
| 4 | Bảng vẽ: bút lông/chì/dạ quang/tẩy, đường, chữ nhật, tròn, mũi tên, chữ | ✅ | Canvas 1200×675, hỗ trợ cảm ứng |
| 5 | Màu tuỳ ý, cỡ nét 1–64, độ đậm 10–100%, hoàn tác 8 bước, tải PNG | ✅ | Ảnh bản vẽ lưu cùng tài liệu |
| 6 | Chèn bản vẽ vào tài liệu | ✅ | Chuyển sang chế độ chia đôi |
| 7 | Ba chế độ Word / Paint / Chia đôi | ✅ | Nhớ chế độ |
| 8 | Nhiều tài liệu: mới, mở, đổi tên, nhân bản, xoá | ✅ | Danh sách bên trái |
| 9 | Lưu tự động, xuất HTML tự chứa, xuất TXT, mở `.html/.txt`, in/PDF | ✅ | `bakhiStudio.v1` |
| 10 | Đếm từ/ký tự, trạng thái lưu, thông báo `aria-live` | ✅ | Lưu sau 0,5 giây |
| 11 | **Một ứng dụng duy nhất** tại `/studio/`; bỏ bản Studio rút gọn | ✅ | `word-paint.html` chỉ còn trang chuyển hướng |
| 12 | **Nhập dữ liệu Studio cũ** (`lexend-studio-doc`): văn bản, ảnh, hình SVG | ✅ | Nhập một lần, giữ khoá cũ, đánh dấu trong `migrated.legacy` |
| 13 | **Tương thích địa chỉ cũ** `/studio/word-paint.html` | ✅ | Meta refresh + `location.replace`, giữ query/hash |

## G2. Nhạc theo tệp, hồ sơ & cài đặt (7.1.0)

### G2.1. Music Player

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Thư viện gốc 5 bài `.mp3` trong `music/`, phát bằng `HTMLAudioElement` | ✅ | Quay lại kiến trúc 6.x; một audio duy nhất |
| 2 | Tự phát hiện bài mới qua `music/library.json` | ✅ | `tools/music-scan.js` sinh manifest; workflow `music-library.yml` chạy khi `music/` đổi |
| 3 | Bài mới chỉ thêm một lần; bài đã xoá không tự quay lại | ✅ | Theo dõi `state.seen` trong `bakhiMusic.v2` |
| 4 | Lời từ `music/<slug>.txt`, hỗ trợ `[mm:ss]`; lời tự nhập được ưu tiên | ✅ | Lời tự nhập ở `bakhiMusic.lyrics.v1` |
| 5 | Bìa tự dò `.png → .jpg → .jpeg → .webp` | ✅ | Tắt xoay khi reduced-motion |
| 6 | Queue, shuffle, repeat 3 chế độ, panel kéo/đổi kích thước | ✅ | Shuffle chọn bài khác khi bấm kế/trước |
| 7 | Không autoplay, không tải nhạc lên máy chủ | ✅ | Tệp tĩnh trong repository; bảng `music_tracks` cũ không còn dùng |

### G2.2. Hồ sơ & Cài đặt

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Khung avatar chưa mở bấm xem ảnh trước, độ hiếm, cách mở khoá | ✅ | Modal `.bk-frame-detail` |
| 2 | Công tắc **Animate Avatar Borders** lưu theo tài khoản và đồng bộ | ✅ | `student_profiles.prefs`; áp lớp `bk-frames-still` lên `<html>` |
| 3 | Tắt hiệu ứng khung áp toàn site, kể cả avatar người khác trong Chat | ✅ | `bk-core.css` + `bk-chat.css`; giữ hoa văn tĩnh |
| 4 | Lời chào trang chủ theo giờ Việt Nam kèm tên hiển thị | ✅ | `bk-shell.js`, cập nhật mỗi phút, không nhấp nháy |
| 5 | Bảo trì khóa toàn site: biểu tượng tải, chặn cuộn/chạm/bàn phím, lối vào Administrator Code | ✅ | Overlay + `html.bk-maint-lock` trong `bk-shell.js` (7.1.0) |

## H. Thành tích & tín hiệu dùng chung

### H.1. Hệ 78 thành tích (3.4.0 → xác minh máy chủ 3.6.0 → mở rộng 5.0.0)

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Đúng 99 badge: 74 tự động + 25 trao tay (2 Administrator + 2 Developer + 21 Founder) | ✅ | `bk-badges.js`, `bakhiBadges.v1.<studentId>` |
| 2 | 8 danh mục: Học tập, Khám phá, Đều đặn, Âm nhạc, Tương tác, Hồ sơ, Sáng tạo, Bí mật | ✅ | Mỗi badge có danh mục + độ hiếm |
| 3 | 6 bậc độ hiếm: Phổ biến, Ít gặp, Hiếm, Cực hiếm, Huyền thoại, Bí mật | ✅ | Hiển thị trên thẻ badge |
| 4 | Tiến độ từng badge, thanh tiến độ, lọc danh mục/độ hiếm/trạng thái, tìm kiếm | ✅ | `BKProfileUI.renderBadgeBoard` |
| 5 | 50 khung avatar SVG (27 thường + 2 Developer + 21 Founder); chỉ trang bị khi đã mở khoá | ✅ | `ownedFrames`/`canEquip`, trigger `bakhi_profile_frame_guard` |
| 6 | Trao/thu hồi badge Administrator có kiểm tra phiên, ghi audit log | ✅ | `admin-actions` `badges.grant`/`badges.revoke` |
| 7 | Xác minh thành tích phía máy chủ, không tin danh sách client gửi | ✅ | `student-profile` + `_shared/badge-rules.ts` + bảng `student_badges` |
| 8 | Đồng bộ hồ sơ và thành tích giữa các thiết bị | ✅ | `student_profiles` + `BKProfile.applyRemote`/`BK.badges.applyServer` |
| 9 | Modal chi tiết badge: độ hiếm, phạm vi, cách đạt, tiến độ | ✅ | `BKProfileUI` + dashboard 7.0 |
| 10 | Cấp badge đủ điều kiện tự động cho một hồ sơ | ✅ | `badges.autoGrant` gọi nội bộ `student-profile` |
| 11 | Cấp toàn bộ badge, trừ `founder` và `dev-exclusive-*`, chống trùng | ✅ | `badges.grantAll` trả `added`/`alreadyOwned`/`failed`/`excluded` |
| 12 | Founder trao badge/khung Founder cho học sinh (7.9.0), trừ Thiên Khải Sáng Thế | ✅ | `founder.grantItem` + `grantSingleItem` kiểm tra `is_founder` chỉ cho `founder` |

### H.2. Thành tích 2.3 trong Trung tâm học tập

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | 30 mốc chia 5 nhóm: Học tập (6), Luyện tập (9), Sổ tay (6), Studio (5), Khám phá (4) | ✅ | Mỗi mốc gắn một hành động tự làm |
| 2 | Tiến độ từng mốc (`current/goal`), thanh tiến độ, ngày đạt | ✅ | `BK.achievements.progress()` |
| 3 | Gợi ý “3 mốc gần đạt tiếp theo” ở Tổng quan | ✅ | `BK.achievements.next(3)` |
| 4 | Lọc Tất cả / Đã đạt / Chưa đạt + tìm kiếm theo tên/mô tả/nhóm | ✅ | Tìm kiếm không phân biệt dấu |
| 5 | Thông báo khi mở khoá (gộp khi nhiều mốc đến cùng lúc) | ✅ | Toast qua `BK.ui.toast` |
| 6 | Huy hiệu `x/30` trên tab Thành tích | ✅ | Cập nhật mỗi lần đổi tab |
| 7 | Tín hiệu Studio: tài liệu, bản vẽ, lượt xuất, lượt chèn, số từ | ✅ | `bakhiSignals.v1`, chỉ số đếm |
| 8 | Tín hiệu Music Player: mỗi lượt phát thật | ✅ | Sự kiện `play`, không autoplay |
| 9 | Tín hiệu bảng lệnh và xuất sao lưu | ✅ | Nhóm Khám phá |
| 10 | Không lưu nội dung trong tín hiệu, không gửi lên mạng | ✅ | Chỉ `localStorage`, giới hạn 999999 |

## H.3. Learning Intelligence (8.2.0)

Bốn hệ thống dùng chung một kho dữ liệu (`bakhiLearn.v1` schema 2) và một bảng đồng bộ
(`student_progress`). Chi tiết: [LEARNING_INTELLIGENCE.md](LEARNING_INTELLIGENCE.md).

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Sổ tay câu sai ghi tự động từ mọi bài luyện | ✅ | `BK.practice`, chống trùng theo `key` |
| 2 | Lưu đáp án đã chọn, đáp án đúng, lời giải, môn/chương | ✅ | `chosen` đọc best-effort từ DOM ở `bk-page.js` |
| 3 | Sáu loại lỗi, học sinh tự phân loại | ✅ | Không tự kết luận nguyên nhân sai |
| 4 | Trạng thái New/Reviewing/Needs Attention/Mastered/Archived | ✅ | Lưu trữ giữ nguyên lịch sử |
| 5 | Ghi chú + ghim + tìm kiếm + lọc môn/chương/loại lỗi | ✅ | Sắp xếp theo ưu tiên |
| 6 | Phân tích 7 biểu đồ, 4 khoảng thời gian | ✅ | 7/30/90 ngày và tất cả |
| 7 | Learning Score 0–100 có trọng số và ngưỡng dữ liệu | ✅ | [LEARNING_ANALYTICS.md](LEARNING_ANALYTICS.md) |
| 8 | Chủ đề yếu chỉ kết luận khi ≥ 4 câu | ✅ | Có nút ôn / thêm kế hoạch |
| 9 | Kế hoạch ngày/tuần/tháng, quá hạn/sắp tới/đã xong | ✅ | `s.plans`, thời lượng là ước lượng |
| 10 | Gợi ý nhiệm vụ — Nhận/Chỉnh sửa/Bỏ qua, không tự thêm | ✅ | `BK.planner.suggestions()` |
| 11 | Revision Engine: hàng đợi 5 phạm vi + phiên ôn | ✅ | [REVISION_ENGINE.md](REVISION_ENGINE.md) |
| 12 | Phiên ôn không sửa kết quả luyện tập gốc | ✅ | Có kiểm thử riêng |
| 13 | Mục tiêu theo câu hỏi/bài học/thành thạo/ngày hoạt động | ✅ | Tiến độ tính lại từ dữ liệu gốc |
| 14 | Đồng bộ nhiều thiết bị, hợp nhất theo `updatedAt` | ✅ | Cùng `student_progress`, không bảng mới |
| 15 | Không có bộ đếm thời gian, không xếp hạng, không thi thử | ✅ | Giữ nguyên nguyên tắc cốt lõi |

## I. Trung tâm thông báo (`bk-cloud.js`, `bk-notify.js`)

Từ 8.0.0, chuông có thêm nhóm **“Phản hồi báo cáo của bạn”** — đọc bảng
`report_notifications` theo RLS, cập nhật realtime và mở đúng báo cáo khi bấm. Đây vẫn là
**một** Trung tâm thông báo duy nhất, không có chuông hay hệ thống thứ hai.

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Chuông thông báo trên **mọi trang**: chủ, môn học, bài học, đề kiểm tra, Studio | ✅ | Từ 3.2.0; trang bài học dùng chuông nổi |
| 2 | Chế độ **chỉ nhận thông báo** cho trang bài học/Studio | ✅ | `data-bk-notify-only="1"`; không nhận diện, không đồng bộ tiến trình |
| 3 | Thông báo từ quản trị viên qua Supabase Realtime | ✅ | Không cần tải lại; poll 60 giây dự phòng |
| 4 | Mỗi phiên bản `## [x.y.z] — ngày` trong `CHANGELOG.md`/bảng `changelog` là một mục | ✅ | Đọc trực tiếp, không nhân bản dữ liệu |
| 5 | Badge số chưa đọc, chấm “chưa đọc” từng mục, mức ưu tiên | ✅ | Ẩn badge khi đã đọc hết |
| 6 | **Đánh dấu đã đọc tất cả** ngay trong bảng | ✅ | Trang chủ: Supabase; trang bài học: `bakhiNotifyReads.v1` |
| 7 | Bấm một mục → cửa sổ đầy đủ nội dung phiên bản/thông báo | ✅ | Markdown an toàn, đóng bằng ×, `Esc`, bấm nền |
| 8 | Bảng tự mở lên trên khi chuông ở nửa dưới màn hình | ✅ | Không bị cắt khỏi khung nhìn |
| 9 | Liên kết “Xem CHANGELOG.md” đúng đường dẫn ở mọi cấp thư mục | ✅ | Dùng `basePath()` |
| 10 | Khối “Cập nhật gần đây” hiển thị 10 mục mới nhất theo số phiên bản, có `Xem thêm`/`Thu gọn`, **chỉ bật ở trang chủ** | ✅ | `data-bk-whatsnew="1"`; `WN_LIMIT = 10`; Studio/Word & Paint không dựng khối này |
| 11 | Chuông cũ `bk-notify.js` tự được gỡ khi lớp mới hoạt động | ✅ | Tránh hiện hai chuông |
| 12 | Giao diện thông báo tối thống nhất | ✅ | Biến `--bkc-n-*` + `.bkc-dark`; không còn thẻ trắng |
| 13 | Trạng thái tải / rỗng / lỗi rõ ràng trong bảng thông báo | ✅ | Có nút thử lại khi lỗi |
| 14 | Markdown an toàn + liên kết `http(s)` | ✅ | Escape trước, không chèn HTML thô |
| 15 | Thông báo sinh từ CHANGELOG mở đúng phiên bản | ✅ | Liên kết qua `changelog_version` |
| 16 | Cờ `public.whatsnew` và `public.maintenance` | ✅ | Đọc từ `app_settings`, realtime |
| 17 | Dải thông báo bảo trì toàn site | ✅ | Bật/tắt từ dashboard, có nút ẩn |
| 18 | Đồng bộ CHANGELOG.md tự động, chống trùng | ✅ | GitHub Actions + `changelog-sync` + RPC publish |

### Hai chế độ thông báo

| | Đầy đủ (trang chủ) | Chỉ thông báo (bài học, Studio) |
|---|---|---|
| Màn hình nhận diện | Có | Không |
| Đồng bộ tiến trình | Có | Không |
| Vị trí chuông | Header cạnh README.md | Nổi góc phải dưới |
| Đã đọc | `announcement_reads` (Supabase) | `bakhiNotifyReads.v1` (local) |
| Realtime + poll | Có | Có |
| Ảnh hưởng dữ liệu học | Không | Không |

## J. Administrator Dashboard 8.0

- **13 mô-đun Administrator** (thêm tab **Report**), **16 với Founder** (thêm Bảo trì, Dữ liệu
  và Founder). Cả hai dashboard dùng chung tab Report và cùng nguồn dữ liệu `public.reports`.
- **Tab Report**: thống kê thật (tổng, mới, đang xử lý, chờ học sinh, đã giải quyết, cần chú ý,
  chưa đọc), tìm kiếm, lọc trạng thái/nhóm/ưu tiên/ngày/chưa đọc, phân trang phía máy chủ,
  chi tiết báo cáo, Q&A, Complete Report, gửi tin nhắn riêng, mở lại, lịch sử xử lý.
- **Phân quyền**: Administrator và Founder cùng xử lý báo cáo; máy chủ kiểm tra từng action
  `reports.*`; không có đường tự nâng quyền Founder.

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | **12 mô-đun Administrator**: Tổng quan, Học sinh, Hồ sơ, Thành tích, Chat, Thông báo, What's New, Lịch sử phiên bản, Nhật ký, Giám sát, Quyền & bảo mật, Cấu hình. Founder thấy thêm Bảo trì, Dữ liệu và tab Founder (15) | ✅ | `admin/index.html`, `founder/index.html` + `bk-devboard.js` |
| 2 | Sidebar thu gọn, breadcrumb, tìm kiếm, trạng thái tải/thành công/lỗi/rỗng | ✅ | Bố cục không tràn ngang |
| 3 | Bảng có tìm kiếm, lọc, sắp xếp, phân trang phía máy chủ | ✅ | Học sinh, hồ sơ, thông báo, changelog, nhật ký |
| 4 | Lịch sử phiên bản dạng cột dọc | ✅ | Biểu mẫu toàn chiều rộng trên, danh sách bên dưới |
| 5 | Xem chi tiết học sinh + xuất CSV/JSON | ✅ | Dữ liệu đọc qua `admin-actions` |
| 6 | Lưu/xuất bản changelog qua RPC dùng chung với GitHub | ✅ | Cùng quy tắc chống trùng |
| 7 | Nhật ký thao tác quản trị + xuất | ✅ | Lọc theo hành động/đối tượng |
| 8 | Giám sát hệ thống: độ trễ, số bản ghi, hàng đợi đồng bộ, lỗi gần đây | ✅ | `system.health` |
| 9 | Quyền & bảo mật: báo cáo thật về hàm/bảng/policy | ✅ | Đọc catalog qua `bakhi_permissions_report()`; một Administrator Code dùng chung, chưa có vai trò riêng |
| 10 | Cấu hình: bật/tắt What's New và bảo trì | ✅ | `public.whatsnew`, `public.maintenance`; ghi qua `settings.set` |
| 11 | Dữ liệu & sao lưu: kiểm tra toàn vẹn + xuất CSV/JSON | ✅ | Không có xoá hàng loạt |
| 12 | Xác nhận trước thao tác ảnh hưởng dữ liệu | ✅ | Sửa/xoá thông báo, changelog, badge, tin nhắn, phòng chat |
| 13 | Xác thực Administrator Code + phiên `sessionStorage` | ✅ | Mọi thao tác kiểm tra lại ở máy chủ |
| 14 | Import `students.txt`, phát hiện trùng tên | ✅ | Xem SUPABASE_SETUP |
| 15 | Push thông báo/changelog ngay, ẩn/đăng lại/xoá | ✅ | Realtime tới máy học sinh |
| 16 | **Hồ sơ**: danh sách, tìm kiếm, chi tiết biệt danh/khung/ảnh bìa, thành tích đã xác minh | ✅ | `profiles.list`, `profiles.detail`; không lộ mã nội bộ ngoài dashboard |
| 17 | **Thành tích**: trao/thu hồi đúng `admin-chosen` và `admin-legend` | ✅ | Máy chủ từ chối `NOT_ADMIN_BADGE`; badge tự động không trao tay được |
| 18 | **Chat**: danh sách phòng, xem thành viên/tin nhắn, xoá mềm tin, tạm khoá, gỡ thành viên, xoá phòng riêng | ✅ | `chat.*` trong `admin-actions`; phòng chung được bảo vệ (`PROTECTED_ROOM`) |
| 19 | **What's New**: bật/tắt khối cập nhật và xem trước changelog đã xuất bản | ✅ | Chỉ ghi `public.whatsnew` qua `settings.set`; không sửa changelog |
| 20 | Kiểm thử dashboard (14 tab + bảo mật) | ✅ | `tools/qa/admin-smoke.js`, `founder-smoke.js` (jsdom) |
| 21 | **Bảo trì**: bật/tắt toàn site, lý do, lưu cấu hình, realtime | ✅ | Founder-only; `public.maintenance` |
| 22 | **Lịch sử bảo trì**: bắt đầu/kết thúc/người/lý do/trạng thái/thời lượng, tìm kiếm/lọc | ✅ | `maintenance.history`; realtime qua `bk:settings-changed` |
| 23 | **Cấp badge tự động / toàn bộ** cho hồ sơ | ✅ | `badges.autoGrant`, `badges.grantAll`; loại `founder` + `dev-exclusive-*` |
| 24 | **Modal chi tiết badge** và tên dashboard theo thương hiệu | ✅ | `bk-devboard.js`; `public.branding` (Founder) |

> Migration 7.0 `20261126000000` bổ sung tuỳ chọn hội thoại, lịch sử bảo trì, thương hiệu,
> tuỳ chọn hồ sơ và `music_tracks`. Các migration 3.x/6.x và Edge Function
> `student-profile`/`chat-api`/`admin-actions` đã deploy; dashboard đọc dữ liệu thật,
> không giả lập.

## K. Chat — phòng chung, tin nhắn riêng, nhóm nhỏ (3.7.0)

Trang `/chat/`, mở từ menu tài khoản (cạnh Hồ sơ cá nhân). Mọi thao tác ghi đi qua Edge
Function `chat-api`; trình duyệt chỉ đọc dữ liệu phòng mình tham gia nhờ RLS.

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Phòng chung cho mọi học sinh đã gắn danh tính | ✅ | `chat_rooms` kind `global`, một phòng duy nhất |
| 2 | Tin nhắn riêng từng cặp (DM) | ✅ | `dm_key` sắp xếp cặp uuid, unique; đúng 2 thành viên |
| 3 | Nhóm tối đa 10 người, trưởng nhóm đổi tên/thêm/xoá/rời | ✅ | Trigger `bakhi_chat_member_guard`; chuyển trưởng khi người cũ rời |
| 4 | Tin nhắn văn bản ≤ 2.000 ký tự, Enter gửi, Shift+Enter xuống dòng | ✅ | `messages.send` |
| 5 | Chat chỉ gửi văn bản (6.0.0 bỏ gửi ảnh và bảng emoji soạn tin) | ✅ | Ảnh cũ vẫn hiển thị; server trả `IMAGES_DISABLED` nếu client cố gửi ảnh mới |
| 6 | 12 cảm xúc emoji, bấm lại để bỏ | ✅ | `chat_reactions`, `reactions.toggle`; cập nhật tối ưu + hoàn tác khi lỗi |
| 7 | Realtime tin nhắn, cảm xúc, tên nhóm | ✅ | Các bảng trong `supabase_realtime`, `replica identity full` |
| 8 | Bộ đếm tin chưa đọc theo phòng + trên tiêu đề tab | ✅ | `last_read_at`; `read.mark` giữ nguyên mốc microseconds, bỏ qua tin của chính mình, chỉ gửi khi tab hiện + focus + gần cuối khung (7.1.0) |
| 9 | Profile Card: tên, biệt danh, ảnh bìa, giới thiệu, khung, liên kết, danh vị lớp, số thành tích | ✅ | `chat-api` đọc thêm `student_profiles`/`student_roles`; view `chat_profiles` không lộ `student_code` |
| 10 | Tìm học sinh để nhắn riêng hoặc thêm vào nhóm | ✅ | `students.search` qua `chat-api`; có trạng thái tải/trống/lỗi + thử lại |
| 11 | Xoá mềm tin của mình; trưởng nhóm xoá tin trong nhóm | ✅ | `deleted_at`, hiện “Tin nhắn đã được xoá” |
| 12 | Không có đồng hồ đếm ngược hay giới hạn thời gian | ✅ | Đúng nguyên tắc sản phẩm |
| 13 | Kiểm thử giao diện và ràng buộc bảo mật | ✅ | `tools/qa/chat-smoke.js` (jsdom) |
| 14 | Trạng thái hoạt động: chấm xanh avatar DM, “Đang hoạt động / x phút trước” | ✅ | `presence.ping` mỗi phút khi tab hiện; online nếu `last_seen_at` ≤ 2 phút |
| 15 | Mật mã đăng nhập trong Cài đặt, bắt buộc sau khi đăng nhập bằng tên (7.8.0 thay passkey) | ✅ | `student-profile` `code.set`/`code.remove`; băm PBKDF2; sai 5 lần khoá 10 phút; dùng được trên mọi thiết bị |
| 16 | Ghim/lưu trữ hội thoại theo từng học sinh | ✅ | `chat_conversation_prefs` + `conversation.pin`/`conversation.archive` |
| 17 | Bộ lọc “Đã lưu trữ”, phòng ghim xếp trước | ✅ | Tổng chưa đọc bỏ qua phòng đã lưu trữ |
| 18 | Xem ai đã thả cảm xúc | ✅ | Popover `.bkchat-reaction-pop`, tải Profile Card còn thiếu |
| 19 | Số chưa đọc đồng bộ giữa các trang, không còn chấm đỏ trên avatar | ✅ | `bk-cloud.js` làm mới khi `chat_members`/`chat_conversation_prefs` đổi; trang Chat đẩy số qua `setChatUnread` (7.1.0) |
| 20 | Mọi mốc thời gian theo `Asia/Ho_Chi_Minh` (UTC+7) | ✅ | Không dùng múi giờ thiết bị; changelog hiểu ngày là nửa đêm UTC+7 từ 7.0.1 |
| 21 | Dấu đã đọc kiểu biểu tượng: ✓ đã gửi, ✓✓ đã đọc | ✅ | Chỉ tin của chính mình; so sánh `chat_members.last_read_at`; realtime `chat_members` (7.1.0) |
| 22 | Nút “Đánh dấu đã đọc” ở đầu hội thoại | ✅ | Gọi `read.mark` ngay; mở phòng/visibility/focus tự đánh dấu khi đủ điều kiện |
| 23 | Menu 3 chấm đúng 2 nút **Ghim** và **Lưu trữ** dạng popup nhỏ | ✅ | `.bkchat-menu-pop`, biểu tượng + nhãn (7.1.0) |
| 24 | Bấm tên/avatar đầu cuộc DM mở hồ sơ đối phương | ✅ | Ảnh bìa, khung, giới thiệu, liên kết, danh vị lớp |
| 25 | Hàng “Hồ sơ của bạn” + sửa biệt danh trong Chat | ✅ | `#bkChatMe`; lưu qua `BKProfile.save`, đồng bộ như trang Hồ sơ (7.1.0) |

> Từ 7.0.0, migration `20261126000000` bổ sung `chat_conversation_prefs` (RLS + realtime)
> và `chat-api` xử lý ghim/lưu trữ. Các migration `20261120000000`/`20261125000000`,
> Edge Function `chat-api`, `bind-student-session`, `admin-actions`, `student-profile` và bucket
> `chat-images` đã deploy trên dự án thật. Từ 7.8.0 passkey WebAuthn được thay hoàn toàn bằng
> **mật mã đăng nhập** (bảng `student_login_codes`), nên không còn phụ thuộc `PASSKEY_RP_ID`,
> không cần tạo credential trên từng thiết bị và điện thoại đăng nhập được như máy tính.

## L. Không có trong sản phẩm (theo yêu cầu)

Không đề thi thử, không bài tính giờ, không đếm ngược, không giới hạn thời gian,
không tự nộp bài, không xếp hạng thi, không deadline, không cơ chế tạo áp lực thời gian.

## Nhận diện, thông báo & quản trị (lớp Supabase)

| Tính năng | Trạng thái | Ghi chú |
| --- | --- | --- |
| Nhận diện bằng họ tên | ✅ | Gõ tên hoặc chọn gợi ý; máy chủ đối chiếu |
| Phiên ẩn danh | ✅ | Không email/mật khẩu |
| Đồng bộ tiến trình | ✅ | Tự lưu, tự thử lại, gộp hai chiều |
| Trung tâm thông báo | ✅ | Thông báo quản trị viên + toàn bộ changelog |
| Khối “Cập nhật gần đây” | ✅ | Chỉ trang chủ; Studio/Word & Paint không dựng |
| Đồng bộ CHANGELOG.md | ✅ | GitHub Actions + `changelog-sync`, một thông báo mỗi phiên bản |
| Cấu hình site | ✅ | `app_settings` (`public.whatsnew`, `public.maintenance`), realtime |
| Administrator Dashboard | ✅ | `admin/index.html`, yêu cầu Administrator Code, 14 mô-đun |
| Import danh sách học sinh | ✅ | Từ `students.txt`, phát hiện trùng tên |
| Nhật ký thao tác quản trị | ✅ | Ai làm gì, lúc nào; chỉ đọc trong dashboard |
| Thông báo trên trang bài học/Studio | ✅ | Chế độ chỉ thông báo, không cần đăng nhập |
| Kiểm thử & bảo toàn nội dung | ✅ | `content-integrity` 119 tệp + 2 bộ smoke test |
| Favicon tĩnh dùng chung | ✅ | SVG + PNG 16/32/48/192/512 + ICO + apple-touch-icon; 118/119 trang |
| Tài liệu | ✅ | README, AGENTS, ARCHITECTURE, FEATURES, MUSIC, STUDIO, SUPABASE_SETUP |

## Gamification 2.0 (8.3.5)

| Tính năng | Trang | Ghi chú |
|---|---|---|
| XP & cấp độ | `/gamification/` | Từ hoạt động học thật, giới hạn/ngày |
| Lối vào Tiến trình | Menu tài khoản → Tiến trình học tập | 8.3.1, desktop + mobile |
| Nhiệm vụ ngày/tuần | `/gamification/` | Nhận thưởng một lần, chu kỳ UTC |
| Cây kỹ năng | `/gamification/` | 5 nhánh, node mở theo điều kiện |
| Bộ sưu tập thành tựu | `/gamification/` | Lọc, tìm kiếm, thành tựu ẩn |
| Thử thách Boss | `/gamification/` | Câu hỏi do quản trị biên soạn, chấm tại máy chủ |
| Kho vật phẩm | `/gamification/` | Trang trí, không tạo lợi thế học tập |
| Quản trị | Admin/Founder → Tiến trình | Cấu hình, định nghĩa, duyệt bất thường; 8.3.5 tự sinh mã, xem trước, Cài đặt nâng cao |
| Avatar & khung đồng bộ | Toàn website | 8.3.5 — `student_profiles.frame` là nguồn duy nhất; trang bị ở Gamification đổi navbar/hồ sơ/chat |

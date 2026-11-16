# Tính năng Bá Khí 3.6

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
| 1 | Thư viện 5 bài theo quy ước file `music/<slug>.mp3` · `.txt` · `.png` | ✅ | Thêm bài chỉ cần thêm file + một dòng trong `LIBRARY` |
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
- **Tìm kiếm**: phím `/` khi không ở trong ô nhập, hoặc ô tìm kiếm trong menu tài khoản.
- **Developer Playground**: `Ctrl+Shift+G` (chỉ khi máy đã có quyền Developer).
- **Music Player**: logo ♪ góc trái dưới; `Space` phát/tạm dừng, `←/→` tua 5 giây,
  `M` tắt tiếng (chỉ khi panel nhạc mở), `Esc` đóng.
- **Thông báo**: bấm chuông (header ở trang chủ, góc phải dưới ở trang bài học/Studio);
  bấm “Đánh dấu tất cả đã đọc” để xoá badge; bấm một mục để đọc đầy đủ.
- **Studio**: avatar → Bá Khí Studio, hoặc `/studio/word-paint.html`.

URL hỗ trợ mở trực tiếp: `?bk=hub`, `?bk=review`, `?bk=notes`, `?bk=bookmarks`,
`?bk=history`, `?bk=achievements`, `?bk=settings`, `?bk=search&q=...`.

## F. Cấu hình AI (tuỳ chọn)

1. Dựng một proxy (Cloudflare Worker, Vercel function, backend riêng) nhận
   `POST { model, messages }` và gọi nhà cung cấp AI bằng khoá lưu ở server.
2. Trong Bá Khí: Cài đặt → AI → nhập URL proxy + tên model.
3. AI chỉ tạo nội dung **tham khảo**, luôn gắn nhãn “Nội dung do AI tạo — không phải
   nội dung gốc đã kiểm duyệt”. Không có thao tác nào để AI sửa câu hỏi/đáp án gốc.

## G. Bá Khí Studio — Word & Paint (`studio/word-paint.html`)

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

## H. Thành tích & tín hiệu dùng chung

### H.1. Hệ 75 thành tích (3.4.0 → xác minh máy chủ 3.6.0)

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Đúng 75 badge: 73 tự động + 2 chỉ Administrator trao | ✅ | `bk-badges.js`, `bakhiBadges.v1` |
| 2 | 8 danh mục: Học tập, Khám phá, Đều đặn, Âm nhạc, Tương tác, Hồ sơ, Sáng tạo, Bí mật | ✅ | Mỗi badge có danh mục + độ hiếm |
| 3 | 6 bậc độ hiếm: Phổ biến, Ít gặp, Hiếm, Cực hiếm, Huyền thoại, Bí mật | ✅ | Hiển thị trên thẻ badge |
| 4 | Tiến độ từng badge, thanh tiến độ, lọc danh mục/độ hiếm/trạng thái, tìm kiếm | ✅ | `BKProfileUI.renderBadgeBoard` |
| 5 | Badge thưởng khung avatar; khung chỉ trang bị khi đã mở khoá | ✅ | 13 khung, `ownedFrames`/`canEquip`, trigger `bakhi_profile_frame_guard` |
| 6 | Trao/thu hồi badge Administrator có kiểm tra phiên, ghi audit log | ⚠️ đã có mã | `admin-actions` `badges.grant`/`badges.revoke`, 2 id admin; cần deploy |
| 7 | Xác minh thành tích phía máy chủ, không tin danh sách client gửi | ⚠️ đã có mã | `student-profile` + `_shared/badge-rules.ts` + bảng `student_badges`; cần deploy |
| 8 | Đồng bộ hồ sơ và thành tích giữa các thiết bị | ⚠️ đã có mã | `student_profiles` + `BKProfile.applyRemote`/`BK.badges.applyServer`; cần deploy |

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

## I. Trung tâm thông báo (`bk-cloud.js`, `bk-notify.js`)

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Chuông thông báo trên **mọi trang**: chủ, môn học, bài học, đề kiểm tra, Studio | ✅ | Từ 3.2.0; trang bài học dùng chuông nổi |
| 2 | Chế độ **chỉ nhận thông báo** cho trang bài học/Studio | ✅ | `data-bk-notify-only="1"`; không nhận diện, không đồng bộ tiến trình |
| 3 | Thông báo từ giáo viên qua Supabase Realtime | ✅ | Không cần tải lại; poll 60 giây dự phòng |
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

## J. Administrator Dashboard 4.1

| # | Tính năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | **9 mô-đun**: Tổng quan, Học sinh, Thông báo, Lịch sử phiên bản, Nhật ký, Giám sát, Quyền, Cấu hình, Dữ liệu | ✅ | `admin/index.html` + `bk-devboard.js` |
| 2 | Sidebar thu gọn, breadcrumb, tìm kiếm, trạng thái tải/thành công/lỗi/rỗng | ✅ | Bố cục không tràn ngang |
| 3 | Bảng có tìm kiếm, lọc, sắp xếp, phân trang phía máy chủ | ✅ | Học sinh, thông báo, changelog, nhật ký |
| 4 | Lịch sử phiên bản dạng cột dọc | ✅ | Biểu mẫu toàn chiều rộng trên, danh sách bên dưới |
| 5 | Xem chi tiết học sinh + xuất CSV/JSON | ✅ | Dữ liệu đọc qua `admin-actions` |
| 6 | Lưu/xuất bản changelog qua RPC dùng chung với GitHub | ✅ | Cùng quy tắc chống trùng |
| 7 | Nhật ký thao tác quản trị + xuất | ✅ | Lọc theo hành động/đối tượng |
| 8 | Giám sát hệ thống: độ trễ, số bản ghi, hàng đợi đồng bộ, lỗi gần đây | ✅ | `system.health` |
| 9 | Quyền: báo cáo thật về hàm/bảng/policy | ✅ | Đọc catalog qua `bakhi_permissions_report()`; một Administrator Code dùng chung, chưa có vai trò riêng |
| 10 | Cấu hình: bật/tắt What's New và bảo trì | ✅ | Chỉ hai khoá `public.*` |
| 11 | Dữ liệu: kiểm tra toàn vẹn + xuất CSV/JSON | ✅ | Không có xoá hàng loạt |
| 12 | Xác nhận trước thao tác ảnh hưởng dữ liệu | ✅ | Sửa/xoá thông báo, changelog |
| 13 | Xác thực Administrator Code + phiên `sessionStorage` | ✅ | Mọi thao tác kiểm tra lại ở máy chủ |
| 14 | Import `students.txt`, phát hiện trùng tên | ✅ | Xem SUPABASE_SETUP |
| 15 | Push thông báo/changelog ngay, ẩn/đăng lại/xoá | ✅ | Realtime tới máy học sinh |

## K. Không có trong sản phẩm (theo yêu cầu)

Không đề thi thử, không bài tính giờ, không đếm ngược, không giới hạn thời gian,
không tự nộp bài, không xếp hạng thi, không deadline, không cơ chế tạo áp lực thời gian.

## Nhận diện, thông báo & quản trị (lớp Supabase)

| Tính năng | Trạng thái | Ghi chú |
| --- | --- | --- |
| Nhận diện bằng họ tên | ✅ | Gõ tên hoặc chọn gợi ý; máy chủ đối chiếu |
| Phiên ẩn danh | ✅ | Không email/mật khẩu |
| Đồng bộ tiến trình | ✅ | Tự lưu, tự thử lại, gộp hai chiều |
| Trung tâm thông báo | ✅ | Thông báo giáo viên + toàn bộ changelog |
| Khối “Cập nhật gần đây” | ✅ | Chỉ trang chủ; Studio/Word & Paint không dựng |
| Đồng bộ CHANGELOG.md | ✅ | GitHub Actions + `changelog-sync`, một thông báo mỗi phiên bản |
| Cấu hình site | ✅ | `app_settings` (`public.whatsnew`, `public.maintenance`), realtime |
| Administrator Dashboard | ✅ | `admin/index.html`, yêu cầu Administrator Code, 9 mô-đun |
| Import danh sách học sinh | ✅ | Từ `students.txt`, phát hiện trùng tên |
| Nhật ký thao tác quản trị | ✅ | Ai làm gì, lúc nào; chỉ đọc trong dashboard |
| Thông báo trên trang bài học/Studio | ✅ | Chế độ chỉ thông báo, không cần đăng nhập |
| Kiểm thử & bảo toàn nội dung | ✅ | `content-integrity` 119 tệp + 2 bộ smoke test |
| Favicon tĩnh dùng chung | ✅ | SVG + PNG 16/32/48/192/512 + ICO + apple-touch-icon; 118/119 trang |
| Tài liệu | ✅ | README, AGENTS, ARCHITECTURE, FEATURES, MUSIC, STUDIO, SUPABASE_SETUP |

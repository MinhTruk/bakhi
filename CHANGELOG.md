# Changelog

Mọi thay đổi đáng chú ý của Bá Khí. Định dạng dựa trên Keep a Changelog.

## [3.2.1] — 2026-11-15

### Bảo mật

- **Chặn `anon` gọi hàm SECURITY DEFINER**: audit phát hiện Supabase cấp mặc định
  `EXECUTE` cho `anon`/`authenticated` trên mọi hàm mới của schema `public`, nên
  `revoke ... from public` trong migration gốc không có tác dụng. Hệ quả là bất kỳ ai
  có publishable key đều gọi được `bakhi_rate_limit()` và ghi thêm hàng vào
  `rate_limits` không giới hạn. Nay chỉ `service_role` (Edge Function) gọi được hàm
  này; `bakhi_current_student_id()` chỉ còn `authenticated` và `service_role`.
- **Tiến trình học tập chỉ ghi qua Edge Function**: thu hồi `INSERT`/`UPDATE` trên
  `student_progress` khỏi `authenticated`. Trước đây một thiết bị đã gắn hồ sơ có thể
  ghi thẳng vào bảng qua REST, bỏ qua giới hạn 1,5 MB và quy tắc “chỉ ghi khi mốc thời
  gian mới hơn” của `sync-student-progress`. Trình duyệt vẫn đọc được hàng của mình.
- **Khoá `search_path` cho hàm trigger** `bakhi_touch_updated_at`
  (`public, pg_temp`), theo khuyến nghị của Supabase Security Advisor.
- **Thêm index khoá ngoại** `announcement_reads(announcement_id)` và đổi policy
  `student_devices` sang `(select auth.uid())` để tránh RLS initplan.

### Cải tiến

- **Migration gia cố riêng**: `supabase/migrations/20261116000000_bakhi_security_hardening.sql`,
  idempotent, có ghi chú hoàn tác; tài liệu Supabase thêm mục “Gia cố bảo mật” kèm câu
  SQL kiểm chứng quyền hàm và quyền bảng.

## [3.2.0] — 2026-11-15

### Tính năng

- **Chuông thông báo phủ toàn website**: mọi trang môn học, bài học, đề kiểm tra, thư viện,
  trang chủ và cả hai trang Studio đều có chuông thông báo. Thông báo mới từ giáo viên và
  phiên bản mới hiện ngay bằng Supabase Realtime, không cần quay lại trang chính hay tải lại.
- **Chế độ “chỉ nhận thông báo”** cho trang bài học: bật bằng thuộc tính
  `data-bk-notify-only="1"` trên thẻ `bk-cloud.js`. Chế độ này chỉ dựng chuông, bảng thông báo,
  đếm chưa đọc và realtime; **không** mở màn hình nhận diện học sinh, **không** đồng bộ
  tiến trình, **không** ghi đè dữ liệu học tập trên máy.
- **Trạng thái đã đọc dùng chung toàn site**: đọc thông báo ở trang bài học, Studio hay trang
  chủ đều được ghi nhớ. Ở chế độ chỉ nhận thông báo, trạng thái lưu cục bộ theo origin
  (`bakhiNotifyReads.v1`) nên mọi trang trong cùng website thấy cùng số chưa đọc.
- **Chuông nổi cho trang không có header chung**: chuông đặt cố định ở góc phải dưới, bảng
  thông báo tự mở **lên trên** khi chuông nằm ở nửa dưới màn hình, không bị cắt khỏi khung nhìn.
- **Studio có thông báo**: `studio/index.html` và `studio/word-paint.html` nạp lớp thông báo
  như mọi trang khác; không ảnh hưởng tài liệu đang soạn hay bản vẽ đang mở.

### Sửa lỗi

- **Administrator Dashboard — thẻ danh sách nằm sai cột**: thẻ “Quản lý thông báo” và
  “Lịch sử phiên bản” trước đây được gắn vào khung cha thay vì lưới hai cột, khiến cột phải
  trống và biểu mẫu co lại một nửa. Nay hai tab này hiển thị đúng bố cục hai cột, tự chuyển
  thành một cột khi cửa sổ hẹp.
- **Khung nhập không còn tràn viền**: toàn bộ dashboard dùng `box-sizing: border-box`;
  `input`, `textarea`, `select` rộng 100% nằm gọn trong thẻ, không còn vượt qua mép phải
  của thẻ hay tạo thanh cuộn ngang.
- **Biểu mẫu rộng hết tab và màn hình**: khung nội dung `.bkc-pane` chiếm toàn bộ chiều rộng
  khả dụng; lưới hai cột tự gộp dưới 1180px để biểu mẫu không bị bóp hẹp.
- **Xem trước thông báo tự xuống dòng**: nội dung dài, chuỗi không khoảng trắng và liên kết
  dài không còn đẩy thẻ rộng ra ngoài.
- **Liên kết CHANGELOG.md đúng đường dẫn**: nút “Xem CHANGELOG.md” trong bảng thông báo ở
  trang bài học/Studio mở đúng tệp gốc thay vì tìm trong thư mục môn học.
- **Công cụ bảo toàn nội dung nhận diện thẻ script có thuộc tính**: `content-integrity`
  loại bỏ đúng cả thẻ script được chèn kèm `data-*`, nhờ vậy nội dung giáo dục vẫn
  được xác minh là không đổi.

### Cải tiến

- Nâng phiên bản tài nguyên dùng chung lên `?v=4.0.1` (bk-cloud, bk-cloud.css,
  bk-admin-dashboard.css, bk-devboard) để trình duyệt tải bản mới thay vì bản lưu đệm.
- Tài liệu được rà soát và mở rộng: README, AGENTS, kiến trúc, tính năng, Music, Studio,
  Supabase — bổ sung sơ đồ trang, bảng key lưu trữ, quy trình kiểm thử và xử lý sự cố.

## [3.1.3] — 2026-11-15

### Tính năng

- **Khôi phục khu vực “Cập nhật gần nhất” (What's New)** trên trang chính: hiện phiên bản
  mới nhất kèm tóm tắt và danh sách thay đổi, có nút mở trung tâm thông báo và xem CHANGELOG.md.
- **Mục Administrator Dashboard mở tab mới**: sau khi xác nhận Administrator Code, bấm mục này
  sẽ mở `admin/index.html` ở tab riêng (trang quản trị đầy đủ, tự yêu cầu mã riêng khi mở tab mới).
- **Header tự thu gọn**: khi không đủ chỗ, nút README.md và tên học sinh trên header được ẩn bớt
  và thay bằng mục tương ứng trong menu 3 gạch, tránh tràn ngang trên điện thoại và cửa sổ hẹp.

### Sửa lỗi

- **Thông báo mới hiện ngay lập tức**: sự kiện realtime trước đây bị bỏ qua bởi bộ nhớ đệm 5 giây,
  nên vừa mở panel hoặc vừa tải lại xong thì thông báo mới không xuất hiện. Nay sự kiện realtime
  luôn tải lại ngay.
- **Đóng dashboard bằng phím Esc** và không còn mở khoá cuộn trang khi đóng hộp xem trước
  trong lúc dashboard vẫn mở.
- Nhãn “Đăng xuất Dev” đổi thành “Đăng xuất Administrator”.


## [3.1.2] — 2026-11-15

### Tính năng

- Trang quản trị riêng tại admin/ — mở là phải nhập Administrator Code, dùng chung dữ liệu với trang chính.
- Menu 3 gạch có mục Administrator: nhập Administrator Code để mở Administrator Dashboard, kèm đường dẫn mở thẳng trang quản trị riêng.
- Trung tâm thông báo hiện cả thông báo từ giáo viên và toàn bộ phiên bản cập nhật, xếp từ cũ đến mới theo số phiên bản.
- Bấm vào một phiên bản trong trung tâm thông báo để xem đầy đủ nội dung thay đổi của phiên bản đó.

### Sửa lỗi

- Sửa nút × của trung tâm thông báo: trước đây panel dùng thuộc tính hiển thị riêng nên không tắt được, giờ bấm là đóng.
- Bỏ khu vực cập nhật (What's New) khỏi màn hình chính để không trùng lặp với trung tâm thông báo.

### Cải tiến

- Đổi tên Dev Code thành Administrator Code và Dev Dashboard thành Administrator Dashboard trên toàn bộ giao diện lẫn thông điệp máy chủ.
- Ô nhập mã quản trị được giấu sau nút Administrator, chỉ hiện khi bấm; mục Administrator Dashboard chỉ xuất hiện sau khi xác nhận mã đúng.

## [3.0.0] — 2026-11-15

### Tính năng

- Nhận diện học sinh bằng họ tên: gõ tên, chọn trong danh sách gợi ý có tô sáng — không cần email, không cần mật khẩu, không cần tài khoản Google.
- Phiên ẩn danh Supabase Auth: mỗi thiết bị một phiên riêng, không thu thập email hay số điện thoại.
- Đồng bộ tiến trình học tập giữa các thiết bị: luyện tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích — tự lưu, tự thử lại khi mất mạng.
- Trung tâm thông báo tức thời: giáo viên đăng là máy học sinh hiện ngay, có đếm chưa đọc, mức ưu tiên và đánh dấu đã đọc.
- What's New: xem bản cập nhật mới nhất và toàn bộ lịch sử phiên bản ngay trên trang chủ.
- Dev Dashboard 6 tab cho giáo viên: Tổng quan, Học sinh, Thông báo, Changelog, Nhật ký, Cài đặt.
- Import danh sách học sinh từ tệp TXT, tự phát hiện trùng họ tên và đánh dấu hồ sơ cần phân biệt.

### Cải tiến

- Bảo mật: bật RLS cho toàn bộ bảng; danh sách học sinh không đọc được từ trình duyệt, chỉ Edge Function dùng khoá máy chủ mới đọc được.
- Mọi thao tác quản trị đi qua Edge Function và phải xác thực bằng Dev Code; Dev Code không lưu ở máy người dùng.
- Giới hạn tần suất cho tìm kiếm, gắn danh tính và đăng nhập Dev Code để chống lạm dụng.
- Máy chủ kiểm tra lại họ tên khi gắn danh tính, không tin dữ liệu do trình duyệt gửi lên.

## [3.1.1] — 2026-11-15

### Sửa lỗi

- Sửa lỗi lớn nhất: hộp thoại xác nhận danh tính nằm BÊN DƯỚI màn hình nhận diện nên bấm Xác nhận không có phản ứng gì. Đã sửa đúng thứ tự lớp và bỏ bước xác nhận trùng — bấm Xác nhận là vào ngay.
- Không còn bắt buộc phải chọn trong danh sách gợi ý: gõ đúng họ tên rồi bấm Xác nhận (hoặc Enter) là được, máy chủ tự đối chiếu.
- Máy chủ trước đây hiểu nhầm yêu cầu chỉ có họ tên là 'xem liên kết' nên trả về chưa gắn danh tính — đã sửa để xác nhận đúng.
- Trên điện thoại, chạm vào gợi ý giờ chọn được ngay; trước đây danh sách ẩn trước khi kịp nhận cú chạm nên không bao giờ chọn được tên.
- Hồ sơ trùng họ tên: máy chủ trả về danh sách hồ sơ để chọn đúng người thay vì báo lỗi chung.

### Cải tiến

- Thông báo lỗi rõ ràng cho từng trường hợp: không tìm thấy họ tên, hồ sơ chờ giáo viên phân biệt, hồ sơ đã bị vô hiệu hoá, thử quá nhiều lần.
- Chặn bấm Xác nhận nhiều lần liên tiếp để không tạo yêu cầu trùng.
- Gợi ý cách dùng ngay trên màn hình nhận diện: nhập đúng họ tên rồi bấm Xác nhận.

## [3.1.0] — 2026-11-15

### Sửa lỗi

- Xác nhận danh tính giờ kiểm tra đúng tên: nút Xác nhận chỉ mở khi đã chọn một gợi ý và tên trong ô phải khớp với gợi ý đó; máy chủ kiểm tra lần nữa và trả NAME_MISMATCH nếu lệch.
- Bỏ tự chọn hộ khi tìm kiếm chỉ trả về một kết quả — học sinh luôn tự chọn tên của mình.
- Chỉ còn một chuông thông báo: gỡ chuông đọc CHANGELOG.md cũ để không còn hai mục thông báo trùng nhau.
- Danh sách gợi ý không còn cách ô nhập và chỉ cuộn bên trong danh sách, không kéo cả màn hình đăng nhập.

### Giao diện & trải nghiệm

- Thêm nút icon đổi học sinh ngay cạnh chuông khi đã có danh tính.
- Vào thẳng màn hình nhận diện: nội dung trang ẩn cho tới khi xác định xong phiên, có splash BÁ KHÍ thay cho nháy trang.
- Dev Dashboard nằm trong menu 3 gạch và chỉ hiện sau khi nhập đúng Dev Code.
- Thêm đường dẫn CHANGELOG.md trong cửa sổ What's New và trong cửa sổ lịch sử cập nhật để xem lại toàn bộ phiên bản cũ.
- Tinh chỉnh giao diện điện thoại và máy tính: tên trên header thu gọn thành icon dưới 720px, panel rộng hết màn hình, tôn trọng vùng an toàn của tai thỏ.

### Hiệu năng

- Giảm gọi mạng trùng khi khởi động: thông báo và changelog chỉ tải một lần, thêm preconnect tới Supabase.
- Tạm dừng đồng bộ khi tab bị ẩn và chỉ làm mới trung tâm thông báo tối đa 5 giây một lần.

## [2.4.2] — 2026-11-14

### Giao diện & thông báo

- **Chỉ giữ** chuông thông báo cập nhật ở trang chủ `index.html`; loại bỏ hoàn toàn
  khỏi các trang môn, bài học, Studio và Music.
- **Tự giảm animation** trên máy yếu hoặc khi bật giảm chuyển động: thêm lớp `.lite`
  toàn cục, tắt hiệu ứng nặng ở toast, modal, overlay và thanh tiến độ.
- **Loại bỏ** badge “Portal [môn]” trên mọi thiết bị để header các trang môn gọn hơn.
- **Tinh chỉnh** bố cục mobile cho header, bảng thông báo và các nút điều hướng.

## [2.4.1] — 2026-11-14

### Thông báo trên header

- **Chuyển** chuông thông báo vào header thay vì nút nổi góc phải dưới; ở trang chủ
  chuông nằm ngay **bên trái nút README.md**, các trang bài học đặt cạnh nhóm nút bên phải.
- **Chuyển** bảng thông báo lên **góc trên bên phải**, ngay dưới chuông, tự canh lại khi đổi
  kích thước/cuộn trang.
- **Sửa** lỗi bảng thông báo đang ẩn vẫn chiếm chỗ và chặn thao tác — nguyên nhân khiến
  không bấm được nút ×/chuông; thêm `[hidden] { display: none }`.
- **Sửa** nút ×: vùng bấm lớn hơn (44px), thêm `touch-action`, đóng cả khi trình duyệt
  không phát `click`; giữ `Esc`, bấm nền và nút “Đóng”.
- **Thu gọn** chuông trên điện thoại (2,4rem) và tự chuyển thành nút nổi dưới header khi
  header quá chật, tránh tràn ngang.

## [2.4.0] — 2026-11-14

### Thông báo cập nhật

- **Thêm** chuông thông báo ở góc phải dưới trên mọi trang: mỗi phiên bản trong
  `CHANGELOG.md` là một thông báo, có badge số chưa đọc.
- **Thêm** bảng thông báo với nút **Đánh dấu đã đọc tất cả**, danh sách phiên bản kèm
  ngày và số thay đổi; trạng thái lưu ở `bakhiNotify.v1`.
- **Thêm** cửa sổ toàn màn hình khi bấm một thông báo: đầy đủ nội dung phiên bản
  (Markdown an toàn), nút ×, `Esc` và bấm nền để đóng.
- **Thêm** `BKNotify` API: `open`/`close`, `openArticle`, `markAll`, `items`, `unread`,
  `parse`, `setSource`, `refresh`.
- **Hỗ trợ** đọc `CHANGELOG.md` trực tiếp khi chạy http(s); khi mở `file://` hiện
  thông báo giải thích thay vì lỗi.

## [2.3.0] — 2026-11-14

### Thành tích 30 mốc

- **Thêm** 17 mốc mới, nâng tổng lên 30, chia 5 nhóm: Học tập (6), Luyện tập (9),
  Sổ tay (6), Studio (5), Khám phá (4). Không mốc nào dựa trên chuỗi ngày, điểm danh
  hay thời gian.
- **Thêm** `BK.signals` — tín hiệu dùng chung ở key riêng `bakhiSignals.v1` (chỉ số đếm,
  không lưu nội dung): tài liệu/bản vẽ/lượt xuất/lượt chèn/số từ của Studio, lượt phát
  nhạc, lượt mở bảng lệnh, lượt xuất sao lưu.
- **Thêm** `BK.achievements.progress()` (tiến độ từng mốc) và `next()` (3 mốc gần đạt),
  `groups`, `lastUnlocked()`; thông báo toast khi mở khoá (gộp khi nhiều mốc cùng lúc).
- **Nâng cấp** tab Thành tích: tổng quan 30 mốc, tiến độ theo nhóm, lọc Tất cả/Đã đạt/
  Chưa đạt, tìm kiếm, thanh tiến độ và số đếm từng mốc, ngày đạt; huy hiệu `x/30` trên tab.
- **Nâng cấp** Tổng quan: thẻ Thành tích có thanh tiến độ, 3 mốc gần đạt tiếp theo và
  liên kết mở tab Thành tích.

### Studio & Music

- **Thêm** Studio tự ghi tín hiệu khi lưu tài liệu có nội dung, có bản vẽ, xuất HTML/TXT/
  PNG, chèn bản vẽ vào trang và ghi nhận số từ lớn nhất của một tài liệu.
- **Thêm** Music Player tăng tín hiệu ở mỗi lượt phát thật (sự kiện `play`) và tự kiểm tra
  thành tích nếu lớp học tập có mặt.
- **Thêm** xuất sao lưu dữ liệu và mở bảng lệnh được tính vào nhóm Khám phá.

### Kiểm thử

- **Mở rộng** smoke test: 30 mốc, 5 nhóm, cấu trúc `progress()`, mốc gần đạt, tín hiệu
  Studio/Music/bảng lệnh/sao lưu, bỏ qua đường dẫn lạ, kẹp giá trị âm, render/lọc/badge.

## [2.2.0] — 2026-11-14

### Bá Khí Studio (Word & Paint)

- **Thêm** ứng dụng tĩnh độc lập `studio/word-paint.html`: soạn thảo kiểu Word (định dạng chữ/đoạn,
  màu, danh sách, canh lề, liên kết, ảnh, đếm từ, in/PDF) kết hợp bảng vẽ kiểu Paint (bút, tẩy,
  hình khối, mũi tên, chữ, màu, cỡ nét, độ đậm, hoàn tác 8 bước, tải PNG).
- **Thêm** chèn bản vẽ vào tài liệu, ba chế độ Word/Paint/Chia đôi, nhiều tài liệu, đổi tên,
  nhân bản, xoá có xác nhận.
- **Thêm** lưu tự động (`bakhiStudio.v1`), xuất HTML tự chứa, xuất TXT, mở `.html/.txt`, dán an toàn.
- **Thêm** lối vào từ menu 3 gạch của trang chủ và từ command palette (`Ctrl/⌘ + K`).

### Tinh chỉnh

- **Sửa** thao tác định dạng trong Studio: giữ vùng chọn khi bấm nút và `Ctrl+A` chỉ chọn nội dung trang.
- **Thêm** tài liệu `docs/STUDIO.md`, cập nhật README, FEATURES, CHANGELOG.

## [2.1.0] — 2026-11-14

### Music Player

- **Thêm** bố cục nổi đầy đủ: kéo thanh tiêu đề để di chuyển, kéo góc dưới-trái để đổi
  kích thước, nút thu nhỏ / phóng to, nhấp đúp tiêu đề để đặt lại; nhớ ở
  `bakhiMusic.panel.v1`; màn hình hẹp tự chuyển thành bảng đáy.
- **Thêm** phím tắt `Space` (phát/tạm dừng), `←/→` (tua 5 giây), `M` (tắt tiếng),
  `Esc` (đóng) — chỉ khi panel nhạc đang mở, tự bỏ qua khi đang gõ hoặc tiêu điểm ở nút.
- **Sửa** nút “Tiếp tục: …”: trước đây biến mất ngay khi bấm mà không phát nhạc; nay
  nút chỉ ẩn khi âm thanh thực sự phát và tự đặt lại `src` khi cần.
- **Thêm** `BKMusic.on(fn)` (phát sự kiện thay đổi), `maximize()`, `minimize()`,
  `resetLayout()`, `showTab()`, `isOpen()`; tab Music của Dev Panel cập nhật theo sự
  kiện thay vì polling mỗi giây.
- **Thêm** Media Session (khoá màn hình / tai nghe) và vùng thông báo `aria-live`.
- **Cải thiện** trợ năng: `aria-label`, `aria-pressed`, `aria-valuetext`, tab theo chuẩn
  `tablist`/`tabpanel`, điều hướng tab bằng phím, mục queue dùng `Enter`/`Delete`/
  `Alt+↑↓`, viền tiêu điểm, tay chạm to hơn, tôn trọng `prefers-reduced-motion`.

### Giao diện

- **Thêm** chuyển động nhẹ khi đổi tab ở Developer Playground, Music Player và Trung tâm
  học tập, tự tắt khi người dùng chọn giảm chuyển động.

### Tài liệu

- **Thêm** `docs/MUSIC.md`; mở rộng `README.md` (mục Music Player, bảng phím tắt, trạng
  thái dự án), `docs/FEATURES.md` (mục Music Player & khả năng tiếp cận) và
  `docs/ARCHITECTURE.md`.

## [2.0.0] — 2026-11-13

### Nền tảng học tập

- **Thêm** lớp dữ liệu local-first `BK` (`assets/bakhi/bk-core.js`): key duy nhất
  `bakhiLearn.v1`, có phiên bản, validate từng trường, giới hạn kích thước, tự phục hồi
  và sao lưu dữ liệu hỏng.
- **Thêm** Trung tâm học tập 7 tab: tổng quan, ôn tập, ghi chú, đánh dấu, lịch sử,
  thành tích, cài đặt.
- **Thêm** ôn tập thông minh: tự lưu câu sai, lịch ôn theo kết quả, đánh dấu thành thạo,
  hẹn ngày thủ công, tìm/lọc theo môn, lịch sử ôn.
- **Thêm** ghi chú cá nhân (ghim, danh mục, Markdown an toàn, xuất tệp).
- **Thêm** đánh dấu câu hỏi/bài học/môn/tài liệu.
- **Thêm** lịch sử học tập có tìm kiếm, xoá từng mục và xoá toàn bộ có xác nhận.
- **Thêm** 10 thành tích dựa trên hoạt động học thật (không streak, không điểm danh).
- **Thêm** Focus Mode (không có đồng hồ phiên) và cỡ chữ điều chỉnh được.
- **Thêm** tìm kiếm toàn cục (bài học, câu đã luyện, câu cần ôn, ghi chú, đánh dấu)
  và command palette `Ctrl/⌘ + K` có điều hướng bàn phím.
- **Thêm** phím tắt: `/`, `Esc`, `←/→`, `A/B/C/D` — bỏ qua khi đang nhập liệu.
- **Thêm** xuất/nhập JSON có xem trước, kiểm tra phiên bản và hợp nhất không phá dữ liệu.
- **Thêm** cầu nối trang bài học: ghi lịch sử, đọc ngân hàng câu hỏi (chỉ đọc), ghi nhận
  kết quả luyện tập theo mẫu feedback quen thuộc + API `BK.practice()`.

### Developer Playground 2.0

- **Thêm** `assets/bakhi/bk-dev.js|css`: cửa sổ nổi kéo/đổi kích thước, thu nhỏ/phóng to,
  nhớ vị trí/kích thước/tab, responsive, `Ctrl+Shift+G`.
- **Thêm** Inspector 2.0: chọn phần tử, highlight, breadcrumb, thuộc tính, computed styles,
  box model, copy selector/HTML, sửa style tạm thời + khôi phục.
- **Thêm** CSS Studio: live CSS, rule builder, undo/redo, reset, xuất CSS.
- **Thêm** Animation Studio: preset, keyframes, easing (kể cả cubic-bezier), timeline,
  play/pause/restart, xuất CSS, lưu/nhập preset, tôn trọng reduced-motion.
- **Thêm** Performance Lab: TTFB, DCL, load, FCP, LCP, CLS, long tasks, FPS thật,
  tài nguyên nặng nhất; không suy đoán khi thiếu API.
- **Thêm** Storage Manager: xem/sửa/xoá có bảo vệ, tìm kiếm, xuất/nhập, dung lượng.
- **Thêm** Console Pro và Network Monitor (chỉ đọc), Theme Editor, Component Library,
  Backup Manager.
- **Giữ nguyên** Developer Panel cũ (11 tab) và toàn bộ hàm toàn cục (`DX`, `showToast`,
  `switchDevTab`, `palette`, …).

### Bảo toàn nội dung & chất lượng

- **Thêm** `tools/content-integrity.js` + baseline `docs/content-baseline.json` cho 56 tệp:
  xác minh sha256 sau khi loại đúng khối script được chèn.
- **Thêm** `tools/integrate-pages.js` (idempotent) và `tools/qa/smoke.js` (45 kiểm tra DOM).
- **Không thay đổi** bất kỳ câu hỏi, phương án, đáp án, giải thích, công thức nào.
- **Không thêm** bất kỳ tính năng thi cử/tính giờ nào.

### Tài liệu

- **Thêm** `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/SUPABASE_SETUP.md`,
  cập nhật `README.md` và `CHANGELOG.md`.

### Đã biết

- Ba tệp HTML không có `</body>` (`images/anh/1.html`, `music/1.html`,
  `ktgk1/hoa/indexhoa.html`) chưa được gắn cầu nối học tập.
- Ghi nhận luyện tập tự động là best-effort theo cấu trúc trang.
- Đồng bộ Supabase và AI cần cấu hình thêm (không có key trong repository).

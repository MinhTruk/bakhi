# Repo audit — Bá Khí (P0, đọc mã, không sửa gì)

Ngày: 27/11/2026 · Nhánh: `redesign/bakhi-complete-rebirth` · Chỉ đọc mã và chạy thử cục bộ.

**What this repo does:** một site tĩnh cho học sinh Việt ôn thi. `index.html` là trang chủ dựng
cây tài liệu (KTTX / KTGK / KTCK → môn → bài), 125 tệp HTML còn lại là phiếu ôn tập có sẵn nội
dung, ma trận đề và bài luyện tập. Dịch vụ đi kèm là Supabase (tài khoản nhận diện theo tên,
tiến trình, chat realtime, thông báo) và một Trợ lý AI gọi qua Edge Function. **Tải dự kiến:** vài
trăm học sinh cùng lúc, dồn vào buổi tối và trước kỳ thi; phần lớn là điện thoại, đọc lâu.

## Must fix

### 1. Mọi trang bài học phụ thuộc 4 CDN bên thứ ba
- `What this is:` Tailwind Play CDN, Font Awesome, KaTeX và Google Fonts tải từ mạng ngoài.
- `Problem:` trên 3G hoặc khi CDN chậm, trang trắng/không style vài giây; Tailwind CDN còn tự
  cảnh báo "should not be used in production" trong console. Không có bản dự phòng cục bộ.
- `Fix:` nhỏ nhất là chấp nhận (site tĩnh, không có bước build) và ghi rõ; bước đúng là build
  Tailwind + self-host font, việc này cần đổi quy trình phát hành nên **không làm trong redesign UI**.
- `If we skip it:` mỗi lần CDN sự cố, toàn bộ khu bài học mất định dạng. Đây là rủi ro sẵn có,
  không phải do redesign tạo ra.
- `ktgk1/ly/ly1.html:17-30`, `:38-44` (scrollbar màu cứng trong `<style>` từng trang).

### 2. Hai hệ chrome cùng tồn tại
- `What this is:` `bk-shell.js` vẫn dựng header/footer cũ; `bk-rebirth.js` dựng rail/top bar/footer mới.
- `Problem:` DOM cũ vẫn được tạo rồi bị ẩn bằng `.bk-hide-legacy`, tốn công dựng và dễ lệch trạng thái
  (ví dụ avatar bị di chuyển sang top bar mới nhưng vẫn còn node gốc).
- `Fix:` khi nào xoá `bk-shell` thì xoá cả hai chỗ; trong phạm vi redesign chỉ ẩn, có ghi chú.
- `If we skip it:` ~vài chục ms mỗi lần tải và một nguồn lỗi khó lần khi debug chrome.
- `assets/bakhi/bk-rebirth.css:328-332` (khối ẩn chrome cũ), `assets/bakhi/bk-rebirth.js` (`hideLegacyChrome`).

### 3. Khoá cache `?v=8.8.0` viết tay trên mọi thẻ tài nguyên
- `What this is:` mọi `<link>`/`<script>` trỏ `assets/bakhi/…` đều có `?v=8.8.0`.
- `Problem:` không có content hash. Nếu deploy mà quên đổi `VERSION`, trình duyệt dùng JS/CSS cũ
  (đã gặp thật trong phiên này khi kiểm thử: server trả tệp mới, tab vẫn chạy bản cache).
- `Fix:` đổi sang hash khi có bước build; hiện tại giữ nguyên và ghi vào `STATUS.md`.
- `If we skip it:` người dùng thấy giao diện nửa cũ nửa mới sau khi phát hành.
- `tools/inject-rebirth.js:22` (`const VERSION = '8.8.0'`).

## Should fix

### 4. Cổng nhận diện ghi họ tên thật vào Supabase, không có mật khẩu
- `What this is:` lần đầu vào site, học sinh nhập họ tên; tên được tra trong danh sách do quản trị
  viên nhập, không phải mật khẩu.
- `Problem:` bất kỳ ai biết tên một bạn trong danh sách đều mở được tiến trình/chat của tên đó.
  Đây là quyết định sản phẩm có từ trước, không phải lỗi UI, nhưng là rủi ro riêng tư lớn nhất của app.
- `Fix:` không sửa trong redesign (đổi auth là thay đổi backend). Đã ghi vào `legal-open-items.md`
  và `seo-report.md` phần "Owner decisions".
- `If we skip it:` dữ liệu học tập của học sinh có thể bị người khác xem.
- `assets/bakhi/bk-cloud.js:392-440` (`buildGate`), `index.html` (modal nhận diện).

### 5. Trang Founder tải toàn bộ devboard trước khi xác thực
- `What this is:` `founder/index.html` nạp `bk-devboard.js` (274 KB), `bk-cloud.js` (139 KB),
  `bk-observability.js`… ngay cả khi người xem chỉ thấy form Founder Code.
- `Problem:` tải nặng cho một trang chỉ có một ô nhập; mã dashboard nằm trong bộ nhớ trước khi có quyền.
- `Fix:` tải động sau khi xác thực (cần sửa logic khởi động, ngoài phạm vi UI); trước mắt ghi nhận.
- `If we skip it:` chậm trên mạng yếu và bề mặt tấn công rộng hơn cần thiết.
- `founder/index.html:100-116`.

### 6. `bk-devboard.js` (274 KB) nằm trong trang chủ
- `What this is:` trang chủ nạp cả bảng điều khiển phát triển.
- `Problem:` chiếm phần lớn 1,5 MB tài nguyên cục bộ của trang chủ (xem `perf-baseline.md`).
- `Fix:` chỉ nạp khi có cờ quản trị; cần kiểm tra lại luồng quyền trước khi đổi.
- `If we skip it:` LCP trang chủ chậm hơn mức cần thiết trên 3G.
- `index.html` danh sách script cuối trang.

## Nice to have

### 7. Không có `robots.txt` / `sitemap.xml` ở gốc host
- `What this is:` repo được phục vụ dưới `/bakhi/`, crawler chỉ đọc `robots.txt` ở gốc tên miền.
- `Problem:` không thể khai báo từ repo này; hiện không có tệp nào.
- `Fix:` để nguyên và ghi rõ trong `seo-report.md`; thêm tệp trong repo sẽ không có tác dụng.
- `If we skip it:` không ảnh hưởng app riêng tư, chỉ ảnh hưởng nếu sau này mở công khai.

### 8. Năm tệp bài học có thẻ tài nguyên sau `</html>`
- `What this is:` `ktgk1/anh/anh1.html`, `ktgk1/anh/indexanh.html`, `kttx/gk1/sinh/indexsinh.html`,
  `kttx/gk1/su/su4.html`, `kttx/gk1/tin/tin.html`.
- `Problem:` HTML không hợp lệ; trình duyệt vẫn xử lý nhưng công cụ kiểm tra sẽ báo.
- `Fix:` di chuyển vào `<head>` sẽ làm lệch hash nội dung (`tools/content-integrity.js`), nên giữ
  nguyên và ghi nhận; injector chèn vào đúng dòng cuối đã có `assets/bakhi/` để không tăng thêm.
- `If we skip it:` không ảnh hưởng người dùng.

## Verdict
Repo tĩnh, dễ đọc, không có build; rủi ro lớn nhất không nằm ở giao diện mà ở phụ thuộc CDN và
cơ chế nhận diện bằng tên. Redesign UI không chạm vào hai chỗ đó.

**Lean:** không xoá tệp nào trong phiên này; có thể giảm ~274 KB/trang nếu bỏ devboard khỏi
trang chủ, và ~0 dependency vì không có `package.json`.

**Not checked:** `rust-backend/`, `brain-toolkit/`, `supabase/` (SQL, Edge Functions) — chỉ đọc
phần client gọi tới chúng; không chạy test của repo; không đo tải thật.

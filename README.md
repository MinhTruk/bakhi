# 📚 BAKHI

### 🌐 Nền tảng học tập và ôn luyện trực tuyến

> **BAKHI** là một website học tập cá nhân được xây dựng nhằm tổng hợp tài liệu, bài tập, câu hỏi trắc nghiệm và nội dung ôn thi vào một nơi duy nhất.

<p align="center">

- 🌐 **[Mở BAKHI](https://minhtruk.github.io/bakhi/)**  
- 🛠️ **[Administrator Dashboard](https://minhtruk.github.io/bakhi/admin/)** (cần Administrator Code)  
- 📦 **[GitHub Repository](https://github.com/MinhTruk/bakhi)**
- 📱 **[TikTok](https://www.tiktok.com/@meionyx)**   
- 🟦 **[Facebook](https://www.facebook.com/meionyxx/)**

</p>

---

## 📖 Giới thiệu

Trong quá trình học tập, tài liệu thường nằm rải rác ở nhiều nơi. **BAKHI** được tạo ra để giải quyết vấn đề đó bằng cách xây dựng một không gian học tập riêng, nơi các nội dung có thể được sắp xếp theo **môn học, học kỳ, bài kiểm tra và chủ đề**.

BAKHI hướng đến việc giúp việc ôn tập trở nên:

- 📚 **Gọn gàng** hơn
- 🔎 **Dễ tìm kiếm** hơn
- ⚡ **Nhanh chóng** hơn
- 📝 **Tương tác** hơn
- 🎯 **Tập trung vào việc ôn thi**

### Điểm nổi bật ở phiên bản 3.4.0

- **Một tài khoản, một menu**: avatar ở góc phải header thay cho menu ba gạch và nút README
  riêng. Menu gồm Hồ sơ cá nhân, Giao diện, README.md, Bá Khí Studio và Cài đặt.
- **Hồ sơ và thành tích**: trang `/profile/` có ảnh đại diện, ảnh bìa, biệt danh, giới thiệu,
  liên kết, 30 khung avatar (27 thường + 2 Developer + 1 Founder) và 78 thành tích
  (73 tự động + 2 Administrator + 2 Developer + 1 Founder).
- **Cài đặt tập trung**: `/settings/` gồm Hồ sơ, toàn bộ tab Trung tâm học tập, Hiển thị &
  Trợ năng, Hình nền và Nhà phát triển.
- **What's New gọn hơn**: chỉ hiển thị phiên bản mới nhất, tối đa 10 dòng, có
  `Xem thêm` / `Thu gọn`; lịch sử đầy đủ vẫn mở từ nút “Xem tất cả cập nhật”.
- **Một website, một trải nghiệm thông báo**: chuông thông báo có mặt trên trang chủ, mọi
  trang môn học/bài học/đề kiểm tra và cả Studio. Quản trị viên đăng thông báo là máy học sinh
  nhận được ngay, kể cả khi đang làm bài; toàn bộ giao diện thông báo dùng chung một theme tối.
- **CHANGELOG.md tự lên sóng**: GitHub Actions đọc tệp khi bạn push, đồng bộ lên Supabase và
  tạo đúng một thông báo cho mỗi phiên bản mới. Không cần sửa HTML mỗi lần phát hành.
- **Học tập local-first**: tiến trình, ghi chú, đánh dấu, thành tích lưu trên máy trước;
  Supabase chỉ là lớp đồng bộ tuỳ chọn, không bắt buộc tài khoản.
- **Không áp lực thời gian**: không đồng hồ đếm ngược, không tính giờ, không xếp hạng thi.
- **Quản trị tập trung**: Administrator Dashboard 12 mô-đun; Founder Dashboard 15 mô-đun (thêm Bảo trì, Dữ liệu, trao mọi badge), có xem trước thông báo/changelog
  trước khi push, quản lý học sinh, nhật ký, giám sát, cấu hình và dữ liệu.
- **Công cụ học tập đi kèm**: Trung tâm học tập 7 tab, Music Player, Bá Khí Studio (Word & Paint),
  Developer Playground 2.0. Favicon tĩnh dùng chung trên toàn site.

### Yêu cầu & tương thích

| Hạng mục | Ghi chú |
|---|---|
| Trình duyệt | Chrome/Edge/Firefox/Safari bản mới; cần JavaScript và `localStorage` |
| Hosting | Bất kỳ host tĩnh nào (GitHub Pages, Netlify, Vercel, `python -m http.server`) |
| Build | Không có bước build, không bundler, không framework runtime |
| Supabase | Tuỳ chọn — cần cho nhận diện học sinh, đồng bộ và thông báo realtime |
| Mạng | Trang học vẫn dùng được khi mất mạng; thông báo và đồng bộ sẽ thử lại sau |

> Mở trực tiếp bằng `file://` vẫn xem được nội dung, nhưng một số tính năng (đọc
> `CHANGELOG.md`, gọi Supabase) bị chặn bởi chính sách bảo mật của trình duyệt. Nên chạy
> qua một web server tĩnh, kể cả khi chỉ học cục bộ.


---

# ✨ Tính năng

## 📚 Hệ thống tài liệu

Các nội dung học tập được phân chia thành từng khu vực riêng, giúp dễ dàng tìm đúng bài học hoặc phần cần ôn.

Có thể tổ chức theo:

- 📖 Môn học
- 📅 Học kỳ
- 📝 Bài kiểm tra
- 📑 Chủ đề
- 🎯 Nội dung ôn tập

---

## 📝 Bài tập tương tác

Thay vì chỉ đọc tài liệu, BAKHI hướng đến việc cho phép người dùng **làm bài trực tiếp trên website**.

Các trang bài tập có thể bao gồm:

- Câu hỏi trắc nghiệm
- Nhiều lựa chọn
- Câu hỏi theo chủ đề
- Bài luyện tập
- Nội dung ôn thi

---

## 🎲 Xáo trộn câu hỏi

Một số bài tập có thể sử dụng cơ chế xáo trộn để mỗi lần luyện tập có trải nghiệm khác nhau.

```text
Lần 1 → Câu 1 → Câu 5 → Câu 3 → Câu 2
Lần 2 → Câu 3 → Câu 1 → Câu 2 → Câu 5
```

Điều này giúp hạn chế việc ghi nhớ vị trí câu hỏi hoặc đáp án.

---

## ⚡ Phản hồi kết quả

Sau khi hoàn thành bài tập, hệ thống có thể cung cấp phản hồi trực tiếp như:

- ✅ Đáp án đúng
- ❌ Đáp án sai
- 📊 Điểm số
- 💡 Giải thích
- 🔄 Làm lại bài

---

# 🌐 Website

BAKHI được triển khai bằng **GitHub Pages**, vì vậy có thể truy cập trực tiếp mà không cần cài đặt.

### 🔗 Website

**https://minhtruk.github.io/bakhi/**

### 📦 Mã nguồn

**https://github.com/MinhTruk/bakhi**

---

BAKHI là một dự án web tĩnh nên **không yêu cầu backend hoặc quá trình cài đặt phức tạp**.

---

# 📖 Cách sử dụng

### 1️⃣ Truy cập website

Mở:

**https://minhtruk.github.io/bakhi/**

### 2️⃣ Chọn nội dung

Đi đến môn học hoặc học kỳ cần ôn tập.

### 3️⃣ Chọn bài

Chọn bài học, đề kiểm tra hoặc chủ đề tương ứng.

### 4️⃣ Làm bài

Trả lời các câu hỏi trực tiếp trên website.

### 5️⃣ Kiểm tra kết quả

Xem điểm và đáp án để xác định phần kiến thức cần ôn lại.

---

# 🚀 Chạy cục bộ

Không cần cài dependency để xem website. Chỉ cần một web server tĩnh:

```bash
# Cách 1: Python (có sẵn trên macOS/Linux, thường có trên Windows)
python -m http.server 8765

# Cách 2: Node.js
npx serve .

# Sau đó mở http://127.0.0.1:8765/
```

Nếu chỉ muốn xem nhanh, mở `index.html` bằng trình duyệt cũng được, nhưng nên dùng server
để tránh giới hạn `file://` khi đọc `CHANGELOG.md` hoặc gọi Supabase.

### Muốn cấu hình thông báo/đồng bộ?

Làm theo [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Tóm tắt:

1. Điền Project URL + Publishable key vào `assets/bakhi/bk-supabase.config.js`.
2. Bật Anonymous sign-ins trong Supabase.
3. Chạy migration SQL và deploy 7 Edge Function.
4. Đặt secret `ADMIN_DEV_CODE` + `CHANGELOG_SYNC_TOKEN`, sau đó import `students.txt` trong
   Administrator Dashboard và thêm GitHub Secrets cho đồng bộ changelog.

Không cấu hình Supabase thì website vẫn hoạt động đầy đủ ở chế độ local-first; chỉ thiếu
nhận diện học sinh, đồng bộ giữa thiết bị và thông báo realtime.

---

# 🗂️ Bản đồ trang

| Đường dẫn | Nội dung | Lớp nâng cấp |
|---|---|---|
| `/index.html` | Trang chủ, điều hướng môn học, Trung tâm học tập, What's New | `bk-core`, `bk-learn`, `bk-dev`, `bk-music`, `bk-cloud` |
| `/admin/index.html` | Administrator Dashboard (yêu cầu Administrator Code) | `bk-cloud` (admin-only), `bk-devboard` |
| `/ktgk1`, `/ktgk2`, `/ktck1`, `/ktck2`, `/kttx` | Nội dung giáo dục theo đợt kiểm tra và môn học | `bk-core`, `bk-page`, `bk-cloud` (chỉ thông báo) |
| `/studio/index.html` | Bá Khí Studio — Word & Paint (Word / Paint / Chia đôi) | `bk-cloud` (chỉ thông báo), shell tài khoản |
| `/studio/word-paint.html` | Trang tương thích: chuyển hướng về `/studio/` | — |
| `/music/` | Tệp âm thanh, lời, ảnh bìa | — |
| `/assets/bakhi/` | Toàn bộ JavaScript/CSS dùng chung | — |
| `/supabase/` | Migration SQL + Edge Functions | — |
| `/tools/` | Kiểm thử và bảo toàn nội dung (không chạy trên production) | — |

Mọi trang nội dung đều tĩnh, tự chứa phần giáo dục; lớp nâng cấp chỉ được chèn thêm thẻ
script và không sửa nội dung gốc.

---

# 📈 Trạng thái dự án

| Hạng mục | Trạng thái |
|---|---|
| 🌐 Website chính | 🟢 Hoạt động |
| 🏠 Trang chủ | 🟢 Hoạt động |
| 📚 Tài liệu học tập | 🟢 Đang phát triển |
| 📝 Bài tập tương tác | 🟢 Đang phát triển |
| 🎲 Xáo trộn câu hỏi | 🟢 Có |
| 📱 Giao diện responsive | 🟢 Đang cải thiện |
| 📊 Thống kê kết quả | 🟢 Đã hoàn thành |
| 💾 Lưu tiến độ | 🟢 Đã có (local-first) |
| 🧠 Trung tâm học tập | 🟢 Đã có |
| 🛠 Developer Playground 2.0 | 🟢 Đã có |
| 🎧 Music Player dùng chung | 🟢 Đã có |
| 🎨 Bá Khí Studio (Word & Paint) | 🟢 Đã có |
| 🔔 Thông báo realtime toàn website (kể cả trang bài học, Studio) | 🟢 Đã có (3.2.0) |
| 🛠️ Administrator Dashboard 6.0 (12 mô-đun) + Founder Dashboard (15 mô-đun, trao mọi badge) | 🟢 Đã có (6.1.5) |
| 🔄 Đồng bộ CHANGELOG.md tự động qua GitHub Actions | 🟢 Đã có (3.3.0) |
| 🌙 Giao diện thông báo tối thống nhất | 🟢 Đã có (3.3.0) |
| 🖼️ Favicon tĩnh SVG/PNG/ICO toàn site | 🟢 Đã có (3.3.0) |
| 🧪 Bảo toàn nội dung bằng hash (content-integrity) | 🟢 Đã có |
| ♿ Trợ năng (bàn phím, ARIA, giảm chuyển động) | 🟢 Đang cải thiện |

---

# 🗺️ Lộ trình phát triển

### ✅ Đã thực hiện

- [x] Xây dựng website chính
- [x] Tạo hệ thống điều hướng
- [x] Tổ chức tài liệu theo thư mục
- [x] Triển khai bằng GitHub Pages
- [x] Xây dựng các trang bài tập
- [x] Thêm các chức năng tương tác
- [x] Music Player dùng chung (queue, shuffle, repeat, lyrics, bố cục kéo/thu/phóng)
- [x] Chuyển động nhẹ khi đổi tab (dev panel, music, trung tâm học tập)
- [x] Cải thiện trợ năng: phím tắt, ARIA, viền tiêu điểm, giảm chuyển động
- [x] Bá Khí Studio: soạn thảo kiểu Word + bảng vẽ kiểu Paint, lưu cục bộ, xuất HTML/TXT/PNG
- [x] Thông báo cập nhật trên mọi trang: mỗi phiên bản trong `CHANGELOG.md` là một thông báo,
  đánh dấu đã đọc tất cả và đọc đầy đủ trong cửa sổ toàn màn hình
- [x] Đồng bộ `CHANGELOG.md` lên Supabase bằng GitHub Actions, chống trùng thông báo
- [x] Giao diện thông báo tối thống nhất và favicon tĩnh SVG/PNG/ICO toàn site
- [x] Lớp shell dùng chung: avatar + menu tài khoản thay menu ba gạch, thay nút README riêng
- [x] Trang Hồ sơ và Cài đặt local-first; 78 thành tích và 30 khung avatar; What's New một phiên bản

### 🔨 Đang phát triển

- [x] Cải thiện giao diện
- [ ] Bổ sung thêm môn học (Đang bổ sung)
- [ ] Bổ sung thêm đề kiểm tra (Chưa có kế hoạch)
- [x] Tối ưu giao diện trên điện thoại
- [ ] Cải thiện hệ thống câu hỏi

---

# 🧠 Nền tảng học tập 2.0

Lớp nâng cấp 2.0 bổ sung trải nghiệm học tập tự nhịp và bộ công cụ phát triển,
**không thay đổi bất kỳ nội dung giáo dục nào**.

### Trung tâm học tập

Mở bằng `Ctrl/⌘ + K`, phím `/` để tìm kiếm, hoặc vào **Cài đặt → Trung tâm học tập**
(menu tài khoản ở góc phải header):

- 📊 **Tổng quan** — số câu đã luyện, đúng/sai, độ chính xác, tiến độ theo môn/chủ đề,
  hoạt động 14 ngày và 8 tuần, chủ đề hay sai, mốc học tập.
- 🔁 **Ôn tập** — câu làm sai được lưu tự động; ôn theo nhịp độ dựa trên kết quả
  (spaced repetition cấu hình được), đánh dấu thành thạo, hẹn ngày ôn, tìm/lọc.
- 📝 **Ghi chú** — theo môn/câu hỏi, ghim, danh mục, Markdown an toàn, xuất tệp.
- 🔖 **Đánh dấu** — câu hỏi, bài học, môn học, tài liệu.
- 🕘 **Lịch sử** — bài đã mở, câu đã luyện/ôn; tìm và xoá từng mục.
- 🏅 **Thành tích** — 30 mốc chia 5 nhóm (Học tập, Luyện tập, Sổ tay, Studio, Khám phá),
  có thanh tiến độ từng mốc, bộ lọc, tìm kiếm và thông báo khi mở khoá; không streak/điểm danh.
- ⚙️ **Cài đặt** — focus mode, cỡ chữ, nhịp ôn, AI (tuỳ chọn), Supabase (tuỳ chọn),
  xuất/nhập dữ liệu.

### Thông báo cập nhật & thông báo giáo viên

- 🔔 Chuông **có mặt trên toàn website**: trang chủ (ngay bên trái nút README.md), mọi trang
  môn học/bài học/đề kiểm tra và cả hai trang Studio. Trang không có header chung dùng
  **chuông nổi** ở góc phải dưới.
- Bảng thông báo mở ở góc trên bên phải khi chuông ở nửa trên màn hình và **tự mở lên trên**
  khi chuông ở nửa dưới, nên không bao giờ bị cắt khỏi khung nhìn.
- Hai nguồn thông báo: **thông báo từ quản trị viên** (bảng `announcements`, realtime) và
  **phiên bản cập nhật** (bảng `changelog` / `CHANGELOG.md`).
- Badge hiển thị số chưa đọc; **Đánh dấu đã đọc tất cả** trong bảng; bấm một mục để mở nội
  dung đầy đủ (đóng bằng ×, `Esc` hoặc bấm nền).
- Trạng thái đã đọc dùng chung trong cùng website: trang chủ lưu trên Supabase theo hồ sơ
  học sinh; trang bài học/Studio lưu cục bộ ở `bakhiNotifyReads.v1`.
- Chế độ **chỉ nhận thông báo** trên trang bài học không mở màn hình nhận diện, không đồng bộ
  tiến trình — chỉ chuông, realtime và trạng thái đã đọc. Nhờ vậy thêm thông báo không làm
  thay đổi cách học hiện có.

### Tìm kiếm & phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl/⌘ + K` | Command palette (lệnh + tìm kiếm) |
| `/` | Tìm kiếm toàn cục (khi không ở trong ô nhập) |
| `Esc` | Đóng hộp thoại / thoát focus mode |
| `← →` | Chuyển câu trong Ôn tập |
| `A B C D` | Chọn đáp án khi ôn tập |
| `Ctrl/⌘ + Shift + G` | Developer Playground (sau khi xác thực) |
| `Space` | Phát / tạm dừng khi Music Player đang mở |
| `← →` | Tua 5 giây khi Music Player đang mở |
| `M` | Tắt / bật tiếng khi Music Player đang mở |

Phím tắt của trình phát chỉ hoạt động khi panel nhạc đang mở và tự bỏ qua khi đang gõ.

### Chế độ tập trung

Ẩn bớt điều hướng và hiệu ứng, tăng khoảng đọc, chỉnh cỡ chữ, nền nhẹ tuỳ chọn.
Không có đồng hồ phiên, không có thời lượng bắt buộc.

### Dữ liệu của bạn

- Lưu cục bộ trong `localStorage` (một key duy nhất `bakhiLearn.v1`, có phiên bản,
  kiểm tra dữ liệu và tự phục hồi khi hỏng).
- Xuất/nhập JSON bất cứ lúc nào; nhập dữ liệu **không bao giờ** ghi đè ngân hàng câu hỏi.
- Không có backend mặc định, không gửi dữ liệu đi đâu.

---

# 🎧 Music Player

Trình phát nhạc dùng chung, mở từ logo ♪ ở góc trái dưới (logo kéo thả được, chuột
phải để đặt lại). Chi tiết: [docs/MUSIC.md](docs/MUSIC.md).

- **5 bài** trong thư viện; queue thêm/xoá/đổi thứ tự (kéo thả hoặc `Alt+↑/↓`), shuffle,
  repeat 3 chế độ, âm lượng, tua, lời có timestamp.
- **Bố cục tự do**: kéo thanh tiêu đề để di chuyển, kéo góc dưới-trái để đổi kích thước,
  nút thu nhỏ / phóng to, nhấp đúp tiêu đề để đặt lại. Vị trí, kích thước và tab đang mở
  được nhớ cho lần sau.
- **Phím tắt khi trình phát đang mở**: `Space` phát/tạm dừng, `← →` tua 5 giây,
  `M` tắt tiếng, `Esc` đóng, `← →` trên thanh tab để đổi tab.
- **Thư mục nhạc đơn giản**: `music/<slug>.mp3`, `music/<slug>.txt` (lời),
  `music/<slug>.png` (bìa) — thêm bài mới chỉ cần thêm file và một dòng trong `LIBRARY`.
- Không autoplay, không có audio thứ hai. Bài đang nghe dở hiện nút “Tiếp tục” và chỉ
  phát khi bạn bấm; nút chỉ biến mất khi âm thanh thực sự phát.
- Hỗ trợ Media Session (khoá màn hình / tai nghe) khi trình duyệt cho phép.

---

# 🎨 Bá Khí Studio — Word & Paint

Ứng dụng tĩnh độc lập: [studio/](studio/index.html) — mở từ menu 3 gạch
hoặc `Ctrl/⌘ + K` → “Mở Bá Khí Studio (Word & Paint)”. Địa chỉ cũ
`/studio/word-paint.html` tự chuyển hướng và dữ liệu Studio cũ được nhập một lần.

- **Word mini**: trang giấy A4, đậm/nghiêng/gạch chân, tiêu đề, danh sách, canh lề, màu chữ,
  màu nền, liên kết, chèn ảnh, hoàn tác/làm lại, đếm từ, in/lưu PDF.
- **Paint mini**: bút lông/chì/dạ quang/tẩy, đường thẳng, chữ nhật, hình tròn, mũi tên, chữ,
  bảng màu, cỡ nét, độ đậm, hoàn tác 8 bước, tải PNG và **chèn bản vẽ vào tài liệu**.
- **Ba chế độ**: Word · Paint · Chia đôi; nhớ chế độ đang dùng.
- **Nhiều tài liệu** trong danh sách bên trái, đổi tên, nhân bản, xoá có xác nhận.
- **Lưu tự động** trên máy (`bakhiStudio.v1`), xuất HTML tự chứa, xuất TXT, mở lại `.html/.txt`.
- Không backend, không thư viện ngoài, không gửi dữ liệu đi đâu.

Chi tiết & giới hạn: [docs/STUDIO.md](docs/STUDIO.md).

---

# 🛠 Developer Playground 2.0

Cửa sổ nổi (`Ctrl+Shift+G`, cần mã Developer như bảng điều khiển cũ) với 11 công cụ:

Inspector 2.0 · CSS Studio · Animation Studio · Performance Lab · Storage Manager ·
Console Pro · Network Monitor · Theme Editor · Component Library · Backup Manager · Music.

Cửa sổ kéo/đổi kích thước được, nhớ vị trí, kích thước và tab; chuyển tab có chuyển
động nhẹ và tôn trọng `prefers-reduced-motion`. Tab Music có nút mở, phóng to, thu nhỏ,
đặt lại bố cục trình phát và cập nhật trạng thái theo sự kiện (không polling).
Panel Developer cũ (11 tab) vẫn hoạt động nguyên vẹn.

Chi tiết: [docs/FEATURES.md](docs/FEATURES.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

# 🔐 Nhận diện học sinh & đồng bộ (Supabase)

Bá Khí có lớp nhận diện và đồng bộ chạy trên Supabase, nhưng **không bắt học sinh tạo tài khoản**:

- **Nhận diện bằng họ tên** — gõ đúng họ và tên (có dấu hay không dấu đều được), bấm **Xác nhận**
  hoặc chọn trong danh sách gợi ý. Máy chủ đối chiếu lại với danh sách học sinh do quản trị viên import, nên
  không thể “nhận vơ” một cái tên không tồn tại.
- **Phiên ẩn danh** — mỗi thiết bị có một phiên Supabase Anonymous Auth riêng: không email,
  không mật khẩu, không đăng nhập Google.
- **Đồng bộ tiến trình** — luyện tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích và tuỳ chọn
  được lưu trên máy trước, tự đẩy lên máy chủ, tự thử lại khi mất mạng và gộp khi có dữ liệu mới
  từ thiết bị khác.
- **Đổi học sinh** — bấm icon cạnh chuông hoặc mục “Đổi học sinh” trong menu 3 gạch. Tiến trình
  của người trước vẫn được giữ trên máy chủ.
- **Danh sách học sinh không công khai** — bảng `students` khoá RLS; chỉ Edge Function dùng khoá
  máy chủ mới đọc được, trình duyệt không bao giờ tải cả danh sách về.

Hướng dẫn cài đặt, mô hình dữ liệu và cách kiểm thử: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

---

# 🔔 Trung tâm thông báo

Chuông là nơi duy nhất hiển thị thông tin cập nhật, và nay có mặt trên **mọi trang**:

- **Thông báo từ quản trị viên** — đăng từ Administrator Dashboard, hiện ngay trên máy học sinh nhờ
  Supabase Realtime (không cần tải lại trang), có đếm số chưa đọc, mức ưu tiên và trạng thái
  đã đọc. Cơ chế dự phòng: tự tải lại mỗi 60 giây và khi mạng có lại.
- **Cập nhật phiên bản** — toàn bộ changelog, xếp theo **số phiên bản** từ cũ đến mới
  (3.0.0 → 3.1.0 → … → 3.2.1 → 3.3.0), bấm vào để đọc đầy đủ từng mục.
- **What's New** — thẻ “Cập nhật gần nhất” **chỉ có trên trang chính**, tóm tắt phiên bản mới
  nhất và dẫn tới trung tâm thông báo hoặc tệp [CHANGELOG.md](CHANGELOG.md). Studio và
  Word & Paint không dựng khối này.
- **Theme tối thống nhất** — trung tâm thông báo, bảng, popup, chi tiết, toast và trạng thái
  tải/rỗng/lỗi dùng chung bộ biến `--bkc-n-*`; không còn thẻ trắng hay chữ khó đọc.
- **Cờ cấu hình** — `public.whatsnew` bật/tắt khối cập nhật gần đây, `public.maintenance`
  hiện dải bảo trì toàn site; thay đổi từ dashboard tới trình duyệt ngay qua realtime.

### Hai chế độ hoạt động

| Chế độ | Trang áp dụng | Nhận diện học sinh | Đồng bộ tiến trình | Trạng thái đã đọc |
|---|---|---|---|---|
| Đầy đủ | `index.html` | Có (màn hình chào + gợi ý tên) | Có | Supabase `announcement_reads` |
| Chỉ thông báo | Trang môn/bài học, Studio | Không | Không | `localStorage` → `bakhiNotifyReads.v1` |

Chế độ chỉ thông báo được bật bằng thuộc tính trên thẻ script:

```html
<script src="../../assets/bakhi/bk-supabase.config.js?v=4.0.0" defer></script>
<script src="../../assets/bakhi/bk-cloud.js?v=3.4.0" data-bk-notify-only="1" defer></script>
```

Nếu Supabase chưa cấu hình hoặc đang mất mạng, chuông vẫn xuất hiện và trang học hoạt động
bình thường; thông báo sẽ được tải lại khi kết nối trở lại. Xem thêm
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#thông-báo-toàn-website).

---

# 🛠️ Administrator Dashboard

Trang quản trị dành riêng cho quản trị viên, **yêu cầu Administrator Code** ở cả hai lối vào:

| Lối vào | Đường dẫn | Ghi chú |
| --- | --- | --- |
| Menu 3 gạch | nút **Administrator** → nhập mã | Mục “Administrator Dashboard” chỉ hiện sau khi mã đúng, bấm vào mở **tab mới** |
| Trang riêng | [`/admin/`](https://minhtruk.github.io/bakhi/admin/) | Tự hỏi Administrator Code khi mở tab mới |

Chín mô-đun:

1. **Tổng quan** — số học sinh, thông báo, phiên bản, nhật ký hoạt động gần đây, hồ sơ cần phân biệt.
2. **Học sinh** — import `students.txt`, tìm kiếm, sửa họ tên, đánh dấu phân biệt trùng tên, vô hiệu hoá, xem chi tiết, xuất CSV.
3. **Thông báo** — soạn, xem trước, **PUSH NOTIFICATION NOW**, thống kê, sửa/ẩn/đăng lại/xoá.
4. **Lịch sử phiên bản** — biểu mẫu toàn chiều rộng phía trên, danh sách phiên bản bên dưới; lọc nguồn/đồng bộ, xuất JSON, lưu nháp hoặc xuất bản.
5. **Nhật ký** — nhật ký thao tác quản trị (ai làm gì, lúc nào), lọc và xuất.
6. **Giám sát** — độ trễ, số bản ghi, hàng đợi đồng bộ changelog, lỗi gần đây.
7. **Quyền** — báo cáo thật về hàm, bảng và policy; chỉ đọc.
8. **Cấu hình** — bật/tắt What's New và thông báo bảo trì.
9. **Dữ liệu** — kiểm tra toàn vẹn và xuất CSV/JSON; không có xoá hàng loạt.

### Giao diện 4.1

- **12 mô-đun Administrator (15 với Founder) trong sidebar thu gọn được**, breadcrumb, tìm kiếm, trạng thái tải/thành công/lỗi/rỗng.
- **Bảng dữ liệu** có tìm kiếm, lọc, sắp xếp và phân trang phía máy chủ; bảng rộng cuộn trong
  khung, không đẩy vỡ bố cục.
- **Lịch sử phiên bản dạng cột dọc**: biểu mẫu tạo/sửa chiếm toàn chiều rộng, danh sách bên dưới.
- **Khung nhập chuẩn**: `input`, `textarea`, `select` dùng `border-box`, rộng tối đa bằng
  phần nội dung của thẻ — không tràn viền, không tạo thanh cuộn ngang.
- **Bảng lệnh nhanh** (`Ctrl/⌘ + K`): nhảy tab, làm mới dữ liệu, tạo thông báo hoặc changelog mới.
- **Xác nhận trước thao tác** ảnh hưởng dữ liệu; mọi thao tác ghi kiểm tra lại Administrator
  Code ở máy chủ.
- **Giao diện sáng/tối** theo theme của site, chế độ **compact** để xem nhiều dòng hơn,
  nút trợ giúp tóm tắt phím tắt và quy trình push.
- **Xem trước trực tiếp** thông báo/changelog ngay trong biểu mẫu trước khi xuất bản.
- Đóng dashboard bằng nút × hoặc `Esc`; trạng thái trang và hộp thoại trước đó được khôi phục.

Bảo mật: Administrator Code và `service_role` key chỉ nằm trong Supabase Edge Function Secrets;
dashboard không bao giờ đọc hay hiển thị giá trị của chúng. Mọi thao tác ghi đều đi qua Edge Function
có kiểm tra phiên quản trị.

---

# 🧱 Kiến trúc kỹ thuật

```
/                       index.html (trung tâm) + bakhi-v4.js (lớp V4 cũ)
/admin                  admin/index.html — Administrator Dashboard (Administrator Code)
/profile                profile/index.html — Hồ sơ cá nhân + 78 thành tích
/settings               settings/index.html — Hồ sơ, Trung tâm học tập, hiển thị, hình nền, quyền
/assets/bakhi/
  bk-core.js|css        Kho dữ liệu local-first, UI kit, tìm kiếm
  bk-version.js         Nguồn phiên bản duy nhất (window.BAKHI_VERSION, BK.release)
  bk-shell.js|css       Avatar + menu tài khoản, trợ năng toàn site, chrome cũ
  bk-profile.js|css     Hồ sơ local-first, ảnh đại diện/bìa, khung avatar
  bk-badges.js          78 thành tích (73 tự động + 5 Administrator/độc quyền)
  bk-profile-ui.js      Component hồ sơ/badge dùng chung cho profile và settings
  bk-settings.js|css    5 tab Cài đặt
  bk-learn.js|css       Trung tâm học tập, ôn tập, ghi chú, đánh dấu, thành tích
  bk-dev.js|css         Developer Playground 2.0
  bk-music.js|css       Music Player dùng chung
  bk-cloud.js|css       Nhận diện, thông báo realtime, changelog, đồng bộ (Supabase)
  bk-devboard.js        Administrator/Founder Dashboard 12–15 mô-đun + menu quản trị
  bk-admin-dashboard.css Giao diện dashboard 4.1 (sidebar thu gọn, bảng phân trang)
  bk-admin.css|bk-admin-theme.js  Trang đăng nhập quản trị + theme
  bk-supabase.config.js Nơi duy nhất chứa Project URL + Publishable key
  bk-notify.js|css      Chuông CHANGELOG.md cũ (dự phòng, bị gỡ khi lớp Supabase hoạt động)
  favicon.svg|*.png|.ico  Favicon tĩnh dùng chung
  bk-bkt.js, bk-page.js Hiệu ứng chuyển trang & cầu nối trang bài học
/ktgk1, /ktgk2, /ktck1, /ktck2, /kttx
                        Nội dung giáo dục (HTML tĩnh, mỗi trang tự chứa)
/music                  music/<slug>.mp3|txt|png
/studio                 index.html (Word & Paint hợp nhất) + word-paint.html (chuyển hướng)
/supabase/
  migrations/           Schema + RLS + realtime cho announcements & changelog
  functions/            admin-auth, admin-actions, search-students, bind-student-session,
                        sync-student-progress, import-students
/tools                  content-integrity, integrate-pages, inject-shell,
                        qa/smoke, qa/cloud-smoke, qa/shell-smoke
/docs                   Kiến trúc, tính năng, Music, Studio, Supabase, baseline nội dung
```

Không có bước build: website là HTML/CSS/JS tĩnh, deploy bằng GitHub Pages. Các trang nội dung
chỉ được chèn thẻ script trỏ tới `assets/bakhi/`; công cụ `content-integrity` dùng hash để
chứng minh phần giáo dục không thay đổi.

---

# 🚫 Không phải nền tảng thi cử

Bá Khí **không có** đề thi thử, bài tính giờ, đồng hồ đếm ngược, giới hạn thời gian,
tự nộp bài, xếp hạng thi hay bất kỳ cơ chế tạo áp lực thời gian nào.

---

# 🧪 Kiểm thử & bảo toàn nội dung

```bash
# 1. Xác minh nội dung giáo dục không thay đổi (so với baseline)
node tools/content-integrity.js verify

# 2. Kiểm tra cú pháp JavaScript dùng chung
node --check assets/bakhi/bk-core.js
node --check assets/bakhi/bk-cloud.js
node --check assets/bakhi/bk-devboard.js

# 3. Smoke test DOM (cần jsdom, cài ngoài repo)
npm install jsdom --prefix /tmp/bktest --no-save
NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/cloud-smoke.js

# 4. Chèn thẻ script cho trang HTML mới (idempotent)
node tools/integrate-pages.js
```

Trên Windows PowerShell, thay `/tmp/bktest` bằng một thư mục tạm, ví dụ
`C:\Users\<bạn>\AppData\Local\Temp\bktest`, rồi đặt `$env:NODE_PATH="...\node_modules"`.

`docs/content-baseline.json` lưu hash của **119 tệp HTML** (đã loại đúng khối script do
nâng cấp chèn, kể cả thẻ script có thuộc tính `data-*`). Baseline ghi cả thống kê câu hỏi,
đáp án, giải thích để phát hiện sửa nội dung ngoài ý muốn. Quy trình và quy ước chi tiết:
[AGENTS.md](AGENTS.md).

Kết quả mong đợi:

```
Đã kiểm tra 119 file nội dung gốc.
OK — không có nội dung giáo dục nào bị thay đổi.
```

Nếu một tệp bị báo thay đổi, **không** cập nhật baseline ngay. Hãy xem `git diff` để chắc
chắn chỉ có thẻ script/định dạng bị đổi, hoặc khôi phục nội dung gốc rồi kiểm tra lại. Chỉ
chạy `node tools/content-integrity.js baseline` khi bạn **chủ động** thay đổi nội dung giáo
dục và đã được duyệt.

---

# 💾 Dữ liệu lưu trên máy

| Key | Nội dung | Ghi chú |
|---|---|---|
| `bakhiLearn.v1` | Luyện tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích, tuỳ chọn | Nguồn sự thật local-first |
| `bakhiSignals.v1` | Số đếm tín hiệu cho thành tích (Studio, nhạc, palette, backup) | Chỉ số đếm, không nội dung |
| `bakhiNotify.v1` | Trạng thái đã đọc của chuông `bk-notify` cũ | Chỉ dùng ở trang chủ |
| `bakhiNotifyReads.v1` | Trạng thái đã đọc ở chế độ chỉ thông báo | Dùng chung theo origin |
| `bakhiStudio.v1` | Tài liệu Studio (HTML + bản vẽ data URL) | Có thể xuất HTML/TXT để sao lưu |
| `bakhiMusic.v2` | Queue, bài đang phát, shuffle/repeat, âm lượng | Không autoplay |
| `bakhiMusic.panel.v1` | Vị trí/kích thước panel nhạc | Xoá để đặt lại |
| `bakhiMusic.fab.v1` | Vị trí logo ♪ | Chuột phải logo để đặt lại |
| `bakhiStudent.v1` | Hồ sơ học sinh đã gắn (nếu dùng Supabase) | Không chứa mật khẩu |
| `bakhiAdmin.v1` | Phiên quản trị trong `sessionStorage` | Mất khi đóng tab |

Supabase (khi bật) còn lưu `bakhi.auth.v1` cho phiên Anonymous Auth. Không có key nào chứa
service-role key hay Administrator Code.

---

# 📚 Tài liệu chi tiết

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — kiểm toán, kiến trúc, mô hình dữ liệu, cơ chế thông báo, giới hạn
- [docs/FEATURES.md](docs/FEATURES.md) — danh sách tính năng & trạng thái từng mục
- [docs/MUSIC.md](docs/MUSIC.md) — Music Player: quy ước file, phím tắt, bố cục, xử lý sự cố
- [docs/STUDIO.md](docs/STUDIO.md) — Bá Khí Studio: Word & Paint, lưu trữ, giới hạn
- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) — cài đặt Supabase, Administrator Code, RLS, kiểm thử
- [CHANGELOG.md](CHANGELOG.md) — lịch sử thay đổi theo phiên bản
- [AGENTS.md](AGENTS.md) — quy ước làm việc trong repository

---

# ❓ Câu hỏi thường gặp

**Tôi có cần tài khoản không?**
Không. Website dùng được ngay ở chế độ local-first. Nếu quản trị viên bật Supabase, bạn chỉ cần
chọn đúng họ tên để đồng bộ giữa các thiết bị.

**Thông báo có hiện khi đang làm bài không?**
Có. Từ 3.2.0, chuông có mặt trên trang bài học và Studio. Bấm chuông để xem; badge tự giảm
khi bạn đọc.

**Vì sao trang bài học không hỏi tên tôi?**
Trang bài học chạy ở chế độ **chỉ nhận thông báo**: không mở màn hình nhận diện và không
đồng bộ tiến trình. Việc học vẫn được ghi cục bộ bởi `bk-page.js`.

**Đã đọc thông báo ở trang bài học, vì sao trang chủ vẫn hiện chưa đọc?**
Trang chủ lưu trạng thái theo hồ sơ học sinh trên Supabase; trang bài học lưu cục bộ. Hai nơi
dùng chung origin nhưng khác nguồn dữ liệu. Đây là chủ ý để trang bài học không cần đăng nhập.

**Dữ liệu của tôi có bị gửi đi đâu không?**
Mặc định không. Chỉ khi cấu hình Supabase, tiến trình mới được đồng bộ lên project của bạn.
Không có analytics, không quảng cáo, không theo dõi.

**Làm sao đặt lại toàn bộ?**
Xoá các key `bakhiLearn.v1`, `bakhiStudio.v1`, `bakhiMusic.*`, `bakhiNotifyReads.v1` trong
Local Storage, hoặc dùng Cài đặt → xuất dữ liệu rồi xoá. Nên xuất JSON trước khi đặt lại.

**Vì sao mở bằng `file://` không thấy thông báo?**
Trình duyệt chặn đọc `CHANGELOG.md` và gọi mạng từ `file://`. Hãy chạy qua web server tĩnh
(xem [Chạy cục bộ](#-chạy-cục-bộ)).

---

# 🤝 Quy ước đóng góp

1. Đọc [AGENTS.md](AGENTS.md) trước khi sửa bất kỳ tệp nào.
2. Không sửa nội dung giáo dục. Chỉ thêm thẻ script do công cụ chèn.
3. Chạy `content-integrity verify` trước và sau khi sửa.
4. Giữ phong cách ES5-ish + DOM thuần, không thêm dependency runtime.
5. Cập nhật `CHANGELOG.md` và tài liệu liên quan khi thay đổi hành vi.
6. Commit message bằng tiếng Việt, mô tả rõ phần đã thay đổi.

---

# 👤 Tác giả

### MinhTruk

💻 Lập trình • 📚 Học tập • 🧪 Thử nghiệm

BAKHI được xây dựng trong quá trình học tập và phát triển các kỹ năng lập trình web.

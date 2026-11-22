<div align="center">

# 📚 BAKHI

### Nền tảng học tập, luyện tập và công cụ cá nhân trên nền web

<p align="center">
  <img src="https://img.shields.io/badge/BAKHI-LEARNING%20PLATFORM-8B5CF6?style=for-the-badge" alt="BAKHI Learning Platform" />
  <img src="https://img.shields.io/badge/PLATFORM-WEB-06B6D4?style=for-the-badge" alt="Platform Web" />
  <img src="https://img.shields.io/badge/TOOLS-05-F59E0B?style=for-the-badge" alt="Five core tool groups" />
  <img src="https://img.shields.io/badge/STATUS-ACTIVE-22C55E?style=for-the-badge" alt="Project status active" />
</p>

<p>
  <strong>Một không gian để học, luyện tập, lưu trữ và sáng tạo.</strong><br />
  Tập trung vào trải nghiệm tự học, dữ liệu local-first và khả năng mở rộng theo nhu cầu.
</p>

<p>
  <a href="https://minhtruk.github.io/bakhi/"><strong>🌐 Mở website</strong></a>
  ·
  <a href="https://github.com/MinhTruk/bakhi"><strong>📦 Source code</strong></a>
  ·
  <a href="https://minhtruk.github.io/bakhi/admin/"><strong>🛠 Administrator</strong></a>
  ·
  <a href="CHANGELOG.md"><strong>📝 Changelog</strong></a>
</p>

<p>
  <a href="https://www.tiktok.com/@meionyx">TikTok</a>
  ·
  <a href="https://www.facebook.com/meionyxx/">Facebook</a>
</p>

</div>

---

## 🎮 Gamification 2.0 (v8.3.8)

Một hệ thống tiến trình duy nhất cho toàn bộ hoạt động học tập:

- **XP & cấp độ** tính từ hoạt động thật (quiz, bài học, ôn tập, sổ tay, mục tiêu,
  Boss), có giới hạn mỗi ngày và chống cộng trùng.
- **Nhiệm vụ** ngày/tuần, **cây kỹ năng** (trang riêng `/skills/` với sơ đồ kéo/zoom),
  **bộ sưu tập thành tựu**, **thử thách Boss** và **kho vật phẩm trang trí**.
- **Founder Dashboard → tab Gamification**: đặt cấp độ, buff XP, cấp trọn cây kỹ năng,
  trao vật phẩm/thành tựu và xem lịch sử trao tặng (xem trước rồi mới xác nhận).
- Dữ liệu nằm trên Supabase; mở nhiều thiết bị vẫn thấy cùng một tiến trình.
- Trang tiến trình: [/gamification/](https://minhtruk.github.io/bakhi/gamification/)
  — mở từ menu tài khoản → **Tiến trình học tập**
- Tài liệu: [kiến trúc](docs/GAMIFICATION_ARCHITECTURE.md) ·
  [XP & cấp độ](docs/XP_LEVEL_SYSTEM.md) · [bảo mật](docs/GAMIFICATION_SECURITY.md)

---

## 🧭 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tổng quan tính năng](#-tổng-quan-tính-năng)
- [Report Issue và Q&A](#-report-issue-và-qa)
- [Năm nhóm công cụ chính](#-năm-nhóm-công-cụ-chính)
- [Nguyên tắc thiết kế](#-nguyên-tắc-thiết-kế)
- [Bắt đầu sử dụng](#-bắt-đầu-sử-dụng)
- [Chạy dự án cục bộ](#-chạy-dự-án-cục-bộ)
- [Cấu hình Supabase](#-cấu-hình-supabase-tuỳ-chọn)
- [Bản đồ thư mục và trang](#-bản-đồ-thư-mục-và-trang)
- [Kiến trúc kỹ thuật](#-kiến-trúc-kỹ-thuật)
- [Phím tắt](#-phím-tắt)
- [Lưu trữ và quyền riêng tư](#-lưu-trữ-và-quyền-riêng-tư)
- [Kiểm thử và bảo toàn nội dung](#-kiểm-thử-và-bảo-toàn-nội-dung)
- [Trạng thái và định hướng](#-trạng-thái-và-định-hướng)
- [Tài liệu liên quan](#-tài-liệu-liên-quan)
- [Câu hỏi thường gặp](#-câu-hỏi-thường-gặp)
- [Đóng góp](#-đóng-góp)
- [Tác giả](#-tác-giả)

---

## 📖 Giới thiệu

**BAKHI** là một website học tập cá nhân, tập hợp tài liệu, bài học, câu hỏi luyện tập và các công cụ hỗ trợ học tập trong cùng một không gian. Dự án được xây dựng theo hướng web tĩnh, ưu tiên JavaScript thuần, không yêu cầu quy trình build và có thể triển khai trên GitHub Pages.

Ngoài phần nội dung học tập, BAKHI còn có hồ sơ cá nhân, trung tâm học tập, hệ thống thông báo, trình phát nhạc, không gian soạn thảo và vẽ, cùng các khu vực quản trị và phát triển.

### 🎯 Mục tiêu

- **Tập trung:** sắp xếp tài liệu theo môn học, học kỳ, bài kiểm tra và chủ đề.
- **Chủ động:** cho phép người học luyện tập và xem lại kết quả theo nhịp độ riêng.
- **Liền mạch:** giữ trải nghiệm nhất quán giữa trang chủ, trang học tập và các công cụ.
- **Bền vững:** ưu tiên lưu dữ liệu trên thiết bị; đồng bộ đám mây là tuỳ chọn.
- **Dễ mở rộng:** giữ cấu trúc web tĩnh và các mô-đun JavaScript/CSS dùng chung.

### 🔗 Các địa chỉ chính

| Khu vực | Liên kết | Mục đích |
|---|---|---|
| Website | [minhtruk.github.io/bakhi](https://minhtruk.github.io/bakhi/) | Truy cập và sử dụng BAKHI |
| Repository | [github.com/MinhTruk/bakhi](https://github.com/MinhTruk/bakhi) | Mã nguồn dự án |
| Administrator | [Mở Dashboard](https://minhtruk.github.io/bakhi/admin/) | Khu vực quản trị, cần mã xác thực |
| Changelog | [CHANGELOG.md](CHANGELOG.md) | Lịch sử thay đổi theo phiên bản |
| Tài liệu Supabase | [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Cấu hình dịch vụ đồng bộ và thông báo |

---

## ✨ Tổng quan tính năng

| Nhóm | Những gì BAKHI cung cấp |
|---|---|
| 📚 Học tập | Tổ chức nội dung theo môn, học kỳ, bài học, chủ đề và đợt kiểm tra |
| 📝 Luyện tập | Câu hỏi tương tác, lựa chọn đáp án, xáo trộn câu hỏi, phản hồi và giải thích |
| 🧠 Theo dõi tiến độ | Tổng quan học tập, ôn tập câu sai, ghi chú, đánh dấu, lịch sử và thành tích |
| 👤 Cá nhân hoá | Hồ sơ, ảnh đại diện/ảnh bìa, khung avatar, giao diện và cài đặt |
| 🔔 Thông báo | Thông báo quản trị, cập nhật phiên bản và trạng thái đã đọc |
| 🚩 Báo cáo | Gửi báo cáo lỗi, theo dõi trạng thái và trao đổi riêng (Q&A) với ban quản trị |
| 🎧 Giải trí nhẹ | Music Player có hàng đợi, lời bài hát và bố cục có thể di chuyển |
| 🎨 Sáng tạo | Bá Khí Studio với trình soạn thảo văn bản và bảng vẽ |
| 🛠 Phát triển | Developer Playground và các công cụ kiểm tra, tuỳ chỉnh giao diện |
| 🤖 Trợ lý AI | Gia sư AI 8 chế độ (giải thích, từng bước, gợi ý, kiểm tra bài, luyện tập, phân tích lỗi, tóm tắt, hỏi dẫn dắt) với ngữ cảnh bài đang học và lịch sử hội thoại — [mở Trợ lý AI](https://minhtruk.github.io/bakhi/ai-tutor/) |
| 🔐 Quản trị | Administrator Dashboard và Founder Dashboard với các chức năng quản lý riêng |

---

## 🤖 Trợ lý AI (v8.5.1)

Trợ lý AI là gia sư học tập, **không** phải chatbot chung:

- **Hai lối vào:** trang riêng <https://minhtruk.github.io/bakhi/ai-tutor/> và nút **Hỏi AI**
  trên mọi trang học tập (bảng nổi tự biết môn/bài đang xem).
- **Tám chế độ:** Giải thích · Từng bước · Gợi ý (không cho đáp án) · Kiểm tra bài làm ·
  Luyện tập · Phân tích lỗi · Tóm tắt · Hỏi dẫn dắt.
- **Đa nhà cung cấp:** Gemini, OpenAI, Groq, OpenRouter, Mistral, DeepSeek hoặc endpoint
  tương thích OpenAI. Đổi provider/model trong Founder Dashboard, không sửa mã.
- **An toàn:** khoá API chỉ nằm trong Supabase Edge Function Secrets, không bao giờ xuống
  trình duyệt; học sinh chỉ đọc được hội thoại của mình; AI không thể đổi XP hay dữ liệu học tập.
- **Không thay thế** Chat (người ↔ người) hay Report Issue (báo lỗi nội dung).
- **Trạng thái triển khai:** database, Edge Function và secret đã chạy trên production; câu trả lời
  AI thật đang chờ nhà cung cấp mở hạn mức (xem `docs/RELEASE_REPORT_V850.md`). Model mặc định
  `gemini-3.8-flash` — Google đã ngừng cấp `gemini-2.5-*`.

Cấu hình: [docs/AI_TUTOR_API_KEY_SETUP.md](docs/AI_TUTOR_API_KEY_SETUP.md) · Kiến trúc:
[docs/AI_TUTOR_ARCHITECTURE.md](docs/AI_TUTOR_ARCHITECTURE.md) · Quản trị:
[docs/AI_TUTOR_FOUNDER_GUIDE.md](docs/AI_TUTOR_FOUNDER_GUIDE.md).

---

## 🚩 Report Issue và Q&A

Hệ thống báo cáo dùng chung cho **toàn website**, với một component duy nhất
(`assets/bakhi/bk-report.js`):

- **Trang chủ:** mở **Cài đặt → Report Issue**.
- **Mọi trang môn học, bài học, Chat, Hồ sơ, Cài đặt và Studio:** nút nổi **Báo cáo** nằm
  ngay trên chuông thông báo ở góc phải dưới và **kéo được** (nhớ vị trí, `Home` để trả về
  mặc định). Cửa sổ kéo được, thu nhỏ, nhớ vị trí, đóng bằng `Esc`; trên điện thoại trở thành
  bottom sheet.

Mỗi báo cáo có mã `BK-xxxxx`, tiêu đề, nhóm vấn đề, loại báo cáo, mức ưu tiên, mô tả, tệp đính
kèm (tối đa 4 tệp ≤ 5 MB) và ngữ cảnh tự thu thập (URL, tiêu đề trang, khu vực, trình duyệt,
màn hình, múi giờ — không có mật khẩu, token hay cookie).

Sau khi gửi, người báo cáo theo dõi được trạng thái và **hội thoại riêng** với ban quản trị:
phản hồi, câu hỏi làm rõ, tin nhắn riêng, kết quả xử lý. Khi có phản hồi mới, học sinh nhận
thông báo trong **Trung tâm thông báo hiện có** và bấm vào là mở đúng báo cáo.

Mục **Báo cáo của tôi** có tìm kiếm, lọc *Đang mở / Đã xử lý*, tải thêm theo trang và xem
trước phản hồi gần nhất; bản nháp đang viết được giữ khi chuyển sang trang khác.

Phía quản trị, **tab Report** trong Administrator và Founder Dashboard dùng chung một nguồn dữ
liệu: thống kê, tìm kiếm/lọc/phân trang, huy hiệu chưa đọc, tự làm mới, chi tiết báo cáo, gán
người xử lý, Complete Report (bắt buộc ghi chú kết quả), gửi tin nhắn riêng, mở lại, xuất CSV
và lịch sử xử lý. Trang `admin/` và `founder/` không hiển thị nút báo cáo của học sinh.

Quyền được kiểm tra ở máy chủ: trình duyệt chỉ đọc dữ liệu của chính mình qua RLS; mọi thao tác
ghi đi qua Edge Function `report-api` (học sinh) hoặc `admin-actions` (quản trị). Chi tiết:
[docs/REPORT_ISSUE.md](docs/REPORT_ISSUE.md).

---

## 🧰 Năm nhóm công cụ chính

Badge `TOOLS-05` đại diện cho năm nhóm công cụ nổi bật của BAKHI. Bên trong mỗi nhóm có thể có nhiều chức năng nhỏ hơn.

### 1. 🧠 Trung tâm học tập

Không gian theo dõi và quản lý quá trình tự học, mở qua `Ctrl/⌘ + K` hoặc mục **Cài đặt → Trung tâm học tập**.

- **Tổng quan:** Learning Score, việc cần làm hôm nay, hoạt động 14 ngày và tiến độ theo môn.
- **Môn học:** tiến độ từng môn từ dữ liệu thật (câu đã luyện, bài đã mở, câu sai, kế hoạch).
- **Sổ tay câu sai:** câu làm sai được ghi tự động kèm đáp án đã chọn, đáp án đúng, lời giải,
  loại lỗi, ghi chú và trạng thái ôn (8.2.0).
- **Phân tích:** bảy biểu đồ, chỉ số cá nhân, chủ đề yếu và nhật ký hoạt động (8.2.0).
- **Kế hoạch:** nhiệm vụ theo ngày/tuần/tháng, gợi ý thông minh không tự áp đặt (8.2.0).
- **Ôn tập:** hàng đợi đến hạn/quá hạn/chủ đề yếu và phiên ôn spaced repetition (8.2.0).
- **Mục tiêu:** mục tiêu đo bằng hoạt động thật, tính lại từ dữ liệu gốc (8.2.0).
- **Ghi chú, Đánh dấu, Thành tích, Cài đặt:** công cụ cá nhân, focus mode, nhịp ôn,
  tuỳ chọn AI/Supabase và xuất/nhập dữ liệu.

### 2. 🎧 Music Player

Trình phát nhạc dùng chung trên website, có thể mở từ biểu tượng nhạc ở góc màn hình.

- Hàng đợi phát: thêm, xoá và sắp xếp lại bài hát.
- Shuffle, repeat, âm lượng và tua bài.
- Hiển thị lời bài hát có mốc thời gian nếu có tệp lời tương ứng.
- Cửa sổ có thể kéo, thu nhỏ, phóng to và thay đổi kích thước.
- Ghi nhớ vị trí, kích thước và trạng thái giao diện.
- Hỗ trợ Media Session khi trình duyệt và thiết bị cho phép.
- Không tự động phát nhạc; người dùng chủ động bấm phát hoặc tiếp tục.

Chi tiết: [docs/MUSIC.md](docs/MUSIC.md).

### 3. 🎨 Bá Khí Studio

Bộ công cụ sáng tạo chạy độc lập trong trình duyệt, gồm ba chế độ **Word**, **Paint** và **Chia đôi**.

**Word mini**
- Trang giấy A4 và các thao tác định dạng văn bản cơ bản.
- Tiêu đề, danh sách, canh lề, màu chữ, màu nền và liên kết.
- Chèn ảnh, hoàn tác/làm lại và đếm từ.
- In hoặc lưu tài liệu thành PDF thông qua trình duyệt.

**Paint mini**
- Bút vẽ, bút chì, bút dạ quang và tẩy.
- Đường thẳng, hình chữ nhật, hình tròn, mũi tên và chữ.
- Tuỳ chỉnh bảng màu, kích thước nét và độ đậm.
- Hoàn tác và xuất bản vẽ PNG.
- Chèn bản vẽ vào tài liệu Word.

Studio hỗ trợ nhiều tài liệu, tự lưu trên thiết bị và xuất HTML/TXT để sao lưu. Chi tiết: [docs/STUDIO.md](docs/STUDIO.md).

### 4. 🛠 Developer Playground

Bộ công cụ dành cho phát triển và kiểm tra giao diện. Một số chức năng yêu cầu xác thực Developer.

Các công cụ gồm:

- Inspector
- CSS Studio
- Animation Studio
- Performance Lab
- Storage Manager
- Console Pro
- Network Monitor
- Theme Editor
- Component Library
- Backup Manager
- Music controls

Cửa sổ công cụ có thể kéo và đổi kích thước, ghi nhớ trạng thái sử dụng, đồng thời hỗ trợ `prefers-reduced-motion`.

Chi tiết: [docs/FEATURES.md](docs/FEATURES.md) và [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### 5. 🔐 Administrator & Founder Dashboard

Khu vực quản trị dành cho người được cấp quyền. Trang Administrator yêu cầu **Administrator Code**; Founder Dashboard có các quyền và công cụ bổ sung.

Các nhóm chức năng chính:

- **Tổng quan:** xem trạng thái hệ thống và dữ liệu tổng hợp.
- **Học sinh:** nhập danh sách, tìm kiếm, cập nhật và quản lý hồ sơ học sinh.
- **Thông báo:** soạn, xem trước, xuất bản, chỉnh sửa hoặc ẩn thông báo.
- **Lịch sử phiên bản:** quản lý changelog, bản nháp và trạng thái đồng bộ.
- **Nhật ký:** theo dõi thao tác quản trị.
- **Giám sát:** kiểm tra hoạt động đồng bộ, độ trễ và lỗi được ghi nhận.
- **Quyền:** xem thông tin hàm, bảng và policy được hệ thống báo cáo.
- **Báo cáo:** tiếp nhận báo cáo của học sinh, trao đổi Q&A, gửi tin nhắn riêng, hoàn thiện
  hoặc mở lại báo cáo và xem lịch sử xử lý (dùng chung dữ liệu giữa hai dashboard).
- **Cấu hình:** quản lý một số tuỳ chọn công khai và trạng thái bảo trì.
- **Dữ liệu:** kiểm tra toàn vẹn và xuất dữ liệu phù hợp.
- **Công cụ Founder:** các thao tác bảo trì và quản lý đặc quyền dành riêng cho Founder.

Mọi thao tác ghi quan trọng phải được máy chủ xác thực. `service_role` key và mã quản trị không được đặt trong mã JavaScript chạy ở trình duyệt.

---

## 🧩 Nguyên tắc thiết kế

### Local-first

Dữ liệu học tập được ghi trên thiết bị trước. Khi được cấu hình, Supabase đóng vai trò lớp đồng bộ bổ sung; website không yêu cầu người dùng phải kết nối Supabase mới có thể sử dụng các chức năng học tập cơ bản.

### Web tĩnh, không cần build

BAKHI sử dụng HTML, CSS và JavaScript. Repository không yêu cầu bundler hoặc framework runtime để chạy website. Có thể triển khai trực tiếp trên GitHub Pages hoặc một static host tương thích.

### Không tạo áp lực thời gian

BAKHI tập trung vào việc học theo nhịp độ cá nhân. Dự án không định hướng trải nghiệm bằng đồng hồ đếm ngược, giới hạn thời gian làm bài hoặc bảng xếp hạng thi đua.

### Bảo toàn nội dung học tập

Các mô-đun dùng chung được bổ sung bên ngoài nội dung giáo dục. Công cụ `content-integrity` kiểm tra hash để phát hiện thay đổi ngoài dự kiến trong các trang học.

---

## 💻 Yêu cầu và tương thích

| Thành phần | Yêu cầu / ghi chú |
|---|---|
| Trình duyệt | Phiên bản mới của Chrome, Edge, Firefox hoặc Safari |
| JavaScript | Cần bật JavaScript |
| Lưu trữ | Cần `localStorage` cho các chức năng lưu dữ liệu cục bộ |
| Hosting | GitHub Pages, Netlify, Vercel hoặc static web server |
| Build | Không cần build, bundler hoặc framework runtime |
| Supabase | Tuỳ chọn; dùng cho nhận diện học sinh, đồng bộ và thông báo realtime |
| Kết nối mạng | Nội dung đã tải và dữ liệu cục bộ có thể tiếp tục dùng; tính năng cloud cần kết nối mạng |

> **Khuyến nghị:** chạy website qua một web server tĩnh thay vì mở trực tiếp bằng `file://`. Một số tính năng như đọc `CHANGELOG.md` hoặc gọi Supabase có thể bị trình duyệt giới hạn khi mở tệp trực tiếp.

---

## 🚀 Bắt đầu sử dụng

### Dành cho người học

1. Mở [BAKHI](https://minhtruk.github.io/bakhi/).
2. Chọn môn học, học kỳ hoặc khu vực nội dung cần xem.
3. Mở bài học, chủ đề hoặc bài luyện tập.
4. Trả lời câu hỏi và xem phản hồi sau khi hoàn thành.
5. Dùng Trung tâm học tập để lưu ghi chú, đánh dấu và ôn lại câu hỏi.

Không cần tạo tài khoản để bắt đầu sử dụng các chức năng local-first.

### Dành cho người phát triển

1. Clone repository về máy.
2. Chạy một static server trong thư mục dự án.
3. Mở website tại địa chỉ localhost được server cung cấp.
4. Đọc `AGENTS.md` trước khi chỉnh sửa cấu trúc hoặc nội dung.
5. Chạy các bước kiểm thử phù hợp trước khi commit.

---

## 🧪 Chạy dự án cục bộ

BAKHI không yêu cầu cài dependency để xem website. Tại thư mục gốc của repository, chạy một trong các lệnh sau:

```bash
# Python
python -m http.server 8765

# Hoặc Node.js
npx serve .
```

Sau đó mở:

```text
http://127.0.0.1:8765/
```

### Clone repository

```bash
git clone https://github.com/MinhTruk/bakhi.git
cd bakhi
python -m http.server 8765
```

Nếu chỉ mở `index.html` trực tiếp, một số tính năng phụ thuộc HTTP hoặc API có thể không hoạt động đầy đủ.

---

## ☁️ Cấu hình Supabase (tuỳ chọn)

Supabase được dùng như lớp dịch vụ bổ sung cho nhận diện học sinh, đồng bộ tiến trình và thông báo realtime. Khi không cấu hình Supabase, website vẫn có thể hoạt động ở chế độ local-first.

Hướng dẫn đầy đủ nằm tại [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Quy trình khái quát:

1. Tạo Supabase project.
2. Cấu hình Project URL và Publishable/anon key trong `assets/bakhi/bk-supabase.config.js`.
3. Bật Anonymous Sign-ins nếu dự án sử dụng phiên đăng nhập ẩn danh.
4. Chạy các migration SQL trong thư mục `supabase/migrations/`.
5. Deploy các Edge Functions trong `supabase/functions/` theo hướng dẫn. `supabase/config.toml`
   phải có đúng một khối `[functions.<tên>]` cho mỗi thư mục — kiểm tra bằng
   `node tools/qa/supabase-config.js`.
6. Cấu hình secrets cần thiết ở môi trường máy chủ và GitHub Actions.
7. Import danh sách học sinh từ khu vực quản trị nếu sử dụng tính năng nhận diện.
8. Kiểm tra RLS, quyền truy cập và luồng đồng bộ trước khi đưa vào sử dụng.

### 🔒 Lưu ý bảo mật

- Chỉ sử dụng Publishable/anon key trong cấu hình phía trình duyệt.
- **Không bao giờ** đưa `service_role` key, `ADMIN_DEV_CODE` hoặc token bí mật vào HTML, JavaScript công khai hay commit lên GitHub.
- Các secret máy chủ phải được lưu trong Supabase Edge Function Secrets hoặc GitHub Secrets theo đúng mục đích.
- Mọi thao tác quản trị có ghi dữ liệu phải được xác thực ở phía máy chủ; không dựa vào việc ẩn nút trên giao diện để bảo vệ quyền.
- Kiểm tra RLS và quyền của từng bảng trước khi bật đồng bộ cho người dùng thật.

---

## 🗂️ Bản đồ thư mục và trang

| Đường dẫn | Nội dung |
|---|---|
| `/index.html` | Trang chủ, điều hướng môn học, Trung tâm học tập, Report Issue (trong Cài đặt) và What's New |
| `/admin/` | Administrator Dashboard |
| `/profile/` | Hồ sơ cá nhân |
| `/settings/` | Hồ sơ, Trung tâm học tập, hiển thị, hình nền và cài đặt |
| `/ktgk1/`, `/ktgk2/`, `/ktck1/`, `/ktck2/`, `/kttx/` | Các khu vực nội dung học tập và kiểm tra |
| `/studio/` | Bá Khí Studio: Word, Paint và chế độ chia đôi |
| `/studio/word-paint.html` | Đường dẫn tương thích, chuyển hướng về Studio mới |
| `/music/` | Tệp nhạc, lời bài hát và ảnh bìa |
| `/assets/bakhi/` | JavaScript và CSS dùng chung |
| `/supabase/` | Migration SQL và Edge Functions |
| `/tools/` | Công cụ tích hợp trang, QA và kiểm tra toàn vẹn |
| `/docs/` | Tài liệu kiến trúc, tính năng và cấu hình |

Các trang học tập giữ phần nội dung giáo dục trong HTML; lớp nâng cấp dùng chung được tích hợp thông qua các tệp trong `assets/bakhi/`.

---

## 🧱 Kiến trúc kỹ thuật

```text
/
├── index.html                 # Trang chủ và điểm điều hướng chính
├── admin/                     # Administrator Dashboard
├── profile/                   # Hồ sơ cá nhân
├── settings/                  # Trang cài đặt
├── ktgk1/ ktgk2/ ktck1/        # Nội dung học tập theo đợt
├── ktck2/ kttx/                # Nội dung học tập theo đợt
├── studio/                    # Bá Khí Studio
├── music/                     # Tài nguyên Music Player
├── assets/bakhi/
│   ├── bk-core.js / .css       # Core, UI kit, dữ liệu local-first
│   ├── bk-version.js           # Nguồn phiên bản dùng chung
│   ├── bk-shell.js / .css      # Account shell và trải nghiệm toàn site
│   ├── bk-profile.js / .css    # Hồ sơ cá nhân
│   ├── bk-badges.js            # Hệ thống thành tích/badge
│   ├── bk-profile-ui.js        # Thành phần hồ sơ và badge dùng chung
│   ├── bk-settings.js / .css   # Cài đặt
│   ├── bk-learning.js / .css   # Learning Intelligence (8.2.0)
│   ├── bk-learn.js / .css      # Khung Trung tâm học tập
│   ├── bk-dev.js / .css        # Developer Playground
│   ├── bk-music.js / .css      # Music Player
│   ├── bk-cloud.js / .css      # Supabase, đồng bộ, thông báo
│   ├── bk-devboard.js          # Administrator/Founder Dashboard
│   ├── bk-supabase.config.js   # Project URL và Publishable/anon key
│   └── favicon.*               # Favicon dùng chung
├── supabase/
│   ├── migrations/             # Schema, RLS và cấu hình realtime
│   └── functions/              # Supabase Edge Functions
├── tools/                     # Công cụ tích hợp và kiểm thử
├── docs/                      # Tài liệu dự án
├── CHANGELOG.md                # Lịch sử thay đổi
└── AGENTS.md                   # Quy ước dành cho agent/người đóng góp
```

### Các lớp chính

| Lớp | Trách nhiệm |
|---|---|
| Static pages | Cung cấp nội dung học tập và cấu trúc trang |
| Shared client modules | Bổ sung UI, hồ sơ, học tập, nhạc, Studio và công cụ phát triển |
| Local storage | Lưu tiến trình và tuỳ chọn trên thiết bị |
| Supabase | Tuỳ chọn cho xác thực ẩn danh, đồng bộ, dữ liệu quản trị và realtime |
| Report Issue | Cửa sổ báo cáo dùng chung + Q&A; dữ liệu qua `report-api`/`admin-actions`, lưu ở `reports`, `report_messages`, `report_activity_logs`, `report_notifications` |
| GitHub Actions | Tự động hoá các quy trình repository, bao gồm đồng bộ changelog khi được cấu hình |

Không có bước build bắt buộc. Các trang tĩnh tải trực tiếp HTML/CSS/JavaScript và các mô-đun dùng chung.

---

## ⌨️ Phím tắt

| Phím | Chức năng | Điều kiện |
|---|---|---|
| `Ctrl/⌘ + K` | Mở Command Palette và tìm kiếm/lệnh | Khi tính năng được tải |
| `/` | Mở tìm kiếm toàn cục | Không đặt con trỏ trong ô nhập |
| `Esc` | Đóng hộp thoại hoặc thoát Focus Mode | Khi hộp thoại/chế độ tương ứng đang mở |
| `←` / `→` | Chuyển câu trong phiên ôn tập | Khi đang dùng Ôn tập |
| `A` / `B` / `C` / `D` | Chọn đáp án | Khi khu vực hỗ trợ phím tắt đang hoạt động |
| `Ctrl/⌘ + Shift + G` | Mở Developer Playground | Sau khi xác thực Developer |
| `Space` | Phát/tạm dừng nhạc | Khi Music Player đang mở và không nhập văn bản |
| `←` / `→` | Tua nhạc | Khi Music Player đang mở và không nhập văn bản |
| `M` | Tắt/bật tiếng | Khi Music Player đang mở và không nhập văn bản |

Một số phím có thể có tác dụng khác nhau tuỳ khu vực đang hoạt động. Phím tắt của Music Player sẽ bỏ qua thao tác khi người dùng đang nhập văn bản.

---

## 💾 Lưu trữ và quyền riêng tư

### Dữ liệu trên thiết bị

Các tính năng local-first sử dụng `localStorage` và `sessionStorage` để lưu dữ liệu phù hợp với chức năng. Một số key quan trọng:

| Key | Nội dung |
|---|---|
| `bakhiLearn.v1` | Luyện tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích và tuỳ chọn học tập |
| `bakhiSignals.v1` | Bộ đếm tín hiệu hoạt động phục vụ thành tích |
| `bakhiNotify.v1` | Trạng thái đọc của hệ thống thông báo cũ |
| `bakhiNotifyReads.v1` | Trạng thái đã đọc trong chế độ chỉ thông báo |
| `bakhiStudio.v1` | Tài liệu và dữ liệu bản vẽ trong Studio |
| `bakhiMusic.v2` | Hàng đợi, bài đang phát, shuffle/repeat và âm lượng |
| `bakhiMusic.panel.v1` | Vị trí và kích thước cửa sổ Music Player |
| `bakhiMusic.fab.v1` | Vị trí biểu tượng mở Music Player |
| `bakhiStudent.v1` | Thông tin hồ sơ học sinh đã liên kết, nếu dùng Supabase |
| `bakhiAdmin.v1` | Phiên quản trị trong `sessionStorage` |

Supabase có thể tạo thêm dữ liệu phiên ẩn danh khi được bật. Các key lưu trên trình duyệt không phải nơi lưu trữ secret máy chủ.

### Quyền kiểm soát dữ liệu

- Người dùng có thể xuất/nhập dữ liệu học tập từ phần cài đặt được hỗ trợ.
- Nên xuất bản sao lưu trước khi xoá dữ liệu trình duyệt hoặc đặt lại website.
- Xoá dữ liệu trình duyệt có thể làm mất dữ liệu chỉ tồn tại cục bộ.
- Khi bật Supabase, dữ liệu được đồng bộ theo cấu hình và chính sách của project đó.
- Theo thiết kế hiện tại, BAKHI không cần analytics hoặc quảng cáo để cung cấp chức năng học tập.

---

## 🧪 Kiểm thử và bảo toàn nội dung

Các công cụ trong `tools/` giúp kiểm tra cú pháp, tích hợp trang và bảo toàn nội dung học tập.

```bash
# Xác minh nội dung giáo dục so với baseline
node tools/content-integrity.js verify

# Kiểm tra cú pháp JavaScript của các mô-đun quan trọng
node --check assets/bakhi/bk-core.js
node --check assets/bakhi/bk-cloud.js
node --check assets/bakhi/bk-devboard.js

# Chèn/tích hợp script cho các trang HTML theo cấu hình công cụ
node tools/integrate-pages.js
```

### Smoke test với jsdom

Một số bài kiểm thử DOM yêu cầu `jsdom`. Có thể cài trong thư mục tạm để tránh thêm dependency vào repository:

```bash
npm install jsdom --prefix /tmp/bktest --no-save
NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/cloud-smoke.js
```

Trên Windows PowerShell, thay `/tmp/bktest` bằng một thư mục tạm phù hợp và đặt biến môi trường `NODE_PATH` trỏ đến `node_modules`.

### Quy tắc khi baseline báo thay đổi

1. Xem `git diff` để xác định chính xác phần thay đổi.
2. Xác nhận nội dung giáo dục không bị chỉnh sửa ngoài dự kiến.
3. Khôi phục phần thay đổi không được phép trước khi tiếp tục.
4. Chỉ tạo baseline mới khi chủ động thay đổi nội dung giáo dục và đã kiểm tra kỹ.

Không chạy lệnh tạo baseline chỉ để làm mất cảnh báo kiểm thử. Quy trình chi tiết nằm trong [AGENTS.md](AGENTS.md).

---

## 📈 Trạng thái và định hướng

BAKHI đang được phát triển và duy trì theo hướng mở rộng trải nghiệm học tập, tăng độ ổn định và hoàn thiện các mô-đun dùng chung.

| Khu vực | Trạng thái mô tả |
|---|---|
| Website và điều hướng | Đã triển khai trên GitHub Pages |
| Nội dung học tập | Đang được bổ sung và hoàn thiện |
| Bài tập tương tác | Có hệ thống luyện tập; ngân hàng câu hỏi tiếp tục được cập nhật |
| Trung tâm học tập | 8.2.0: Sổ tay câu sai, Phân tích, Kế hoạch, Ôn tập, Mục tiêu, Môn học cùng một nguồn dữ liệu |
| Hồ sơ và cài đặt | Đã có các khu vực hồ sơ và cá nhân hoá |
| Music Player | Đã tích hợp |
| Bá Khí Studio | Đã tích hợp |
| Developer Playground | Đã tích hợp |
| Administrator/Founder Dashboard | Đã tích hợp, quyền truy cập có xác thực |
| Report Issue và Q&A | Đã tích hợp toàn website (8.1.0), hoàn thiện bảo mật và cấu hình ở 8.1.1; dữ liệu qua Supabase với RLS |
| Supabase | Tuỳ chọn, phụ thuộc cấu hình project |
| Trợ năng và responsive | Tiếp tục được cải thiện |

### 🗺️ Hướng phát triển

- Mở rộng nội dung học tập và ngân hàng câu hỏi.
- Cải thiện trải nghiệm làm bài, phản hồi và ôn tập.
- Tiếp tục tối ưu giao diện trên thiết bị di động.
- Tăng độ tin cậy của đồng bộ và khả năng phục hồi dữ liệu.
- Hoàn thiện kiểm thử, tài liệu và công cụ dành cho người phát triển.

> Phiên bản mới nhất và các thay đổi cụ thể được ghi trong [CHANGELOG.md](CHANGELOG.md). README chỉ mô tả kiến trúc và nhóm tính năng, tránh cố định các con số dễ thay đổi theo từng bản phát hành.

---

## 📚 Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Lịch sử cập nhật và thay đổi theo phiên bản |
| [AGENTS.md](AGENTS.md) | Quy ước làm việc trong repository |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc, mô hình dữ liệu, luồng hoạt động và giới hạn |
| [docs/FEATURES.md](docs/FEATURES.md) | Danh sách tính năng và mô tả chi tiết |
| [docs/MUSIC.md](docs/MUSIC.md) | Hướng dẫn Music Player và quy ước tài nguyên |
| [docs/STUDIO.md](docs/STUDIO.md) | Hướng dẫn Bá Khí Studio |
| [docs/REPORT_ISSUE.md](docs/REPORT_ISSUE.md) | Report Issue và Q&A: vị trí, dữ liệu, quyền, API, kiểm thử |
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Cài đặt Supabase, RLS, secrets và kiểm thử |

---

## ❓ Câu hỏi thường gặp

<details>
<summary><strong>Tôi có cần tạo tài khoản để sử dụng BAKHI không?</strong></summary>

Không. Các chức năng local-first có thể sử dụng mà không cần tạo tài khoản. Nếu project bật Supabase, người dùng có thể được nhận diện theo quy trình cấu hình của website để đồng bộ dữ liệu.

</details>

<details>
<summary><strong>Dữ liệu học tập được lưu ở đâu?</strong></summary>

Mặc định, dữ liệu được lưu trên trình duyệt của thiết bị. Khi Supabase được cấu hình và người dùng sử dụng tính năng đồng bộ, dữ liệu phù hợp sẽ được gửi đến project Supabase.

</details>

<details>
<summary><strong>Vì sao trang học không yêu cầu nhận diện học sinh?</strong></summary>

Một số trang học chạy ở chế độ chỉ nhận thông báo. Chế độ này không mở màn hình nhận diện và không đồng bộ tiến trình; nội dung học vẫn có thể sử dụng cơ chế lưu cục bộ.

</details>

<details>
<summary><strong>Vì sao trạng thái đã đọc thông báo có thể khác giữa trang chủ và trang học?</strong></summary>

Tuỳ chế độ hoạt động, trang chủ có thể lưu trạng thái đọc theo hồ sơ trên Supabase, trong khi trang học lưu cục bộ để không yêu cầu nhận diện. Vì vậy hai khu vực có thể sử dụng nguồn trạng thái khác nhau.

</details>

<details>
<summary><strong>Vì sao mở bằng file:// không có đầy đủ thông báo hoặc đồng bộ?</strong></summary>

Trình duyệt giới hạn một số thao tác mạng và đọc tệp khi trang được mở trực tiếp từ ổ đĩa. Hãy chạy một static server theo hướng dẫn [Chạy dự án cục bộ](#-chạy-dự-án-cục-bộ).

</details>

<details>
<summary><strong>Làm sao sao lưu hoặc đặt lại dữ liệu?</strong></summary>

Hãy dùng chức năng xuất dữ liệu trong phần cài đặt nếu có, sau đó mới xoá dữ liệu website trong trình duyệt. Không nên xoá `localStorage` trước khi tạo bản sao lưu nếu bạn cần giữ tiến trình, ghi chú hoặc tài liệu Studio.

</details>

<details>
<summary><strong>BAKHI có phải nền tảng thi có giới hạn thời gian không?</strong></summary>

Không. BAKHI hướng đến tự học và luyện tập theo nhịp độ cá nhân, không lấy đồng hồ đếm ngược hoặc giới hạn thời gian làm cơ chế cốt lõi.

</details>

---

## 🤝 Đóng góp

Trước khi chỉnh sửa repository:

1. Đọc [AGENTS.md](AGENTS.md) để nắm quy ước và giới hạn của dự án.
2. Xác định phạm vi thay đổi, đặc biệt với các trang chứa nội dung giáo dục.
3. Chạy `node tools/content-integrity.js verify` trước và sau khi sửa nếu thay đổi có thể ảnh hưởng các trang học.
4. Giữ định hướng HTML/CSS/JavaScript thuần và hạn chế thêm dependency runtime.
5. Cập nhật `CHANGELOG.md` và tài liệu liên quan khi thay đổi hành vi.
6. Kiểm tra các luồng liên quan trước khi commit.

### Quy ước commit

Ưu tiên commit message tiếng Việt, ngắn gọn và mô tả đúng thay đổi, ví dụ:

```text
docs: nâng cấp README và sơ đồ kiến trúc
fix: sửa lỗi đồng bộ trạng thái đã đọc
feat: bổ sung bộ lọc trong trung tâm học tập
```

---

## 👤 Tác giả

<div align="center">

### MinhTruk

💻 Lập trình · 📚 Học tập · 🧪 Thử nghiệm

**BAKHI** được xây dựng trong quá trình học tập, thử nghiệm và phát triển các kỹ năng lập trình web.

</div>

---

<div align="center">

**BAKHI · Learn at your own pace.**

[🌐 Website](https://minhtruk.github.io/bakhi/) · [📦 GitHub](https://github.com/MinhTruk/bakhi) · [📝 Changelog](CHANGELOG.md)

</div>

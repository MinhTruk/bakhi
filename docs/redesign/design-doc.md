# Design doc — Bá Khí “Quiet Graphite”

Nhánh: `redesign/bakhi-complete-rebirth` · 27/11/2026 · Chế độ: autonomous (chủ dự án đã
duyệt trước, không hỏi lại trong phạm vi).

## 1. Intent playback

**Điều chủ dự án nói:** dựng lại toàn bộ giao diện Bá Khí theo design system mới (nền graphite
gần đen, accent hồng phấn, phụ lavender/glacier, light mode trắng ấm), giữ nguyên 100 % nội dung
giáo dục, dữ liệu, quyền và hành vi; làm trên nhánh riêng; không push nếu có thể deploy.
*(nói)*

**Điều tôi suy ra:** người dùng là học sinh Việt, phần lớn mở bằng điện thoại vào buổi tối, đọc
lâu; việc chính là tìm đúng tài liệu và đọc cho thoải mái, việc phụ là giữ động lực và hỏi AI.
*(suy ra)*

**Vì sao bây giờ:** giao diện hiện tại là nhiều lớp chồng lên nhau — Tailwind Play CDN màu vàng
trong 125 trang bài học, chrome cũ của `bk-shell`, chrome mới của phiên trước — nên cùng một sản
phẩm có ba bảng màu. Học sinh thấy màu hổ phách ở bài học, hồng ở trang chủ.

**Thành công trông thế nào:** mở bất kỳ trang nào cũng nhận ra cùng một sản phẩm; bài học đọc
được như một tài liệu có mục lục; không mất một nút, một quyền, một dòng nội dung nào.

## 2. Goals / non-goals / anti-goals

**Goals**
1. Một bảng màu, một thang chữ, ba cấp container trên mọi bề mặt.
2. Bài học có mục lục trong trang và tiến độ đọc; cột chữ không quá dài.
3. Chat / Trợ lý AI / Cài đặt có bố cục theo template T3/T5/T4.
4. Footer pháp lý trên mọi trang; trang 404 riêng.
5. Không tăng dependency, không tăng đáng kể byte.

**Non-goals:** không đổi Supabase/RLS/Edge Function, không đổi logic AI, không đổi khoá lưu trữ
cũ, không sửa `CHANGELOG.md` hay số phiên bản, không thêm analytics, không thêm dark-mode switch
(đã có), không thêm i18n.

**Anti-goals** (thành công kỹ thuật nhưng vẫn là thất bại): “trông mới nhưng Founder/Admin vẫn cũ”;
“đẹp nhưng bảng ma trận tràn ngang ở 320 px”; “nhanh hơn trên giấy nhưng nặng thêm 300 KB”;
“đổi màu mà bố cục y nguyên” — tức là chỉ re-skin.

## 3. Ràng buộc thật của repo

- 125 trang bài học có nội dung nằm trong HTML và được băm bởi `tools/content-integrity.js`.
  **Mọi thay đổi cấu trúc trên các tệp đó đều làm lệch hash**, nên không thể viết lại markup.
- Không có bước build: không thể đổi Tailwind CDN sang build, không thể hash tài nguyên.
- Chat, Trợ lý AI, Hồ sơ cần đăng nhập Supabase thật → không kiểm thử được end-to-end khi không
  có tài khoản; Founder cần Founder Code.

## 4. Các hướng đã cân nhắc

**A. “The Branch” — cây là ngôn ngữ thị giác** (chọn). Đường nhánh mảnh + nút nhỏ chỉ xuất hiện ở
nơi có quan hệ cha/con thật: cây tài liệu, changelog, kỹ năng. Điểm nhấn duy nhất là khối cây
tài liệu ở trang chủ; phần còn lại im.
*Đổi lại:* phải kỷ luật — nhánh không được dùng làm hoa văn, nếu không sẽ thành trang trí vô nghĩa.

**B. Bàn đọc yên tĩnh, dashboard quy ước.** Bỏ ẩn dụ cây, dùng sidebar + bảng điều khiển quen
thuộc. *Đổi lại:* dễ làm hơn nhưng sản phẩm mất thứ duy nhất khiến nó khác một folder Google Drive;
và IA hiện tại vốn đã là cây nên phải bẻ lại.

**C. Launcher điều khiển bằng lệnh (⌘K).** Một ô lệnh là điểm vào. *Đổi lại:* thêm bề mặt mới cho
người dùng điện thoại, không có trong yêu cầu; đã bị loại ở bước scope challenge.

**Chọn A**, vì IA của sản phẩm đã là cây và vì nó cho phép giữ nguyên route + nội dung: không cần
đổi một tệp bài học nào.

## 5. Design plan (đã sửa so với mặc định)

**Bảng màu.** Basalt `#0e0d12` (nền), graphite `#17161d`/`#1f1e27` (panel/nhấn), bone `#f2efec`
(chữ), rose quartz `#ffb6c1` (accent), lavender `#c4b5fd`, glacier `#7dd3fc`; light mode giấy
`#f6f4f1`. Accent chỉ dùng cho trạng thái đang chọn, hành động chính, focus, tiến độ — khoảng 5 %
màn hình.

**Chữ.** UI dùng Lexend (giữ font hiện có, đủ dấu tiếng Việt, 0 byte thêm). Nội dung đọc dài —
bài học, câu trả lời AI, trang pháp lý — dùng serif hệ thống qua token `--rb-font-reading`
(Source Serif 4 → Noto Serif → Times New Roman). **Đây là chỗ tôi sửa so với mặc định ban đầu:**
mặc định cấm serif ở dashboard, nhưng đây là bề mặt *đọc*, không phải dashboard; serif tách nội
dung khỏi giao diện và không tốn byte vì không tự host.

**Ba cấp container.** Panel (surface-1 + hairline) chỉ cho khối thật sự là một đơn vị; Open (nền
canvas + đường kẻ) cho danh sách, hành cài đặt, nội dung đọc; Inset (surface-2) cho input, chip,
khối code. Không đổ shadow trong luồng trang.

**Bố cục.** Căn trái, bất đối xứng; T2 đọc có mục lục; T4 điều hướng con dọc; T5 cột hội thoại
≤760; T3 ba cột.

**Chữ Việt.** `line-height` tiêu đề ≥ 1.15, tracking ≥ −0.03em, không cắt dấu; `lang="vi"`.
Stress fixture nằm trong `gallery.html`.

**Chuyển động.** Ba mức: đứng yên (đọc, chat, bảng, form), một khoảnh khắc có chủ đích ở trang chủ,
scroll-driven chỉ ở header trang pháp lý. Tôn trọng `prefers-reduced-motion`, áp dụng ngay khi đổi.

**Những mặc định đã từ chối:** thanh trượt cường độ chuyển động trong app (chỉ giữ công tắc
Chuyển động cục bộ đã có từ phiên trước, vì nó đã tồn tại); command palette; hiệu ứng reveal từng
section; gradient/glow trang trí; eyebrow in hoa giãn chữ; số thứ tự giả; monospace cho metadata.

## 6. Agent's calls (ghi lại để chủ dự án bác nếu cần)

1. **Không viết lại 125 tệp bài học.** Vì hash nội dung; thay vào đó JS đọc h2/h3 có sẵn, thêm id
   và mục lục. *Lý do:* giữ nguyên văn bản + hash, vẫn có T2.
2. **Mục lục cố định chỉ từ 1500 px.** Dưới ngưỡng đó dùng `<details>` để không chồng lên cột nội
   dung 980 px. *Lý do:* đo thật ở 1600 px thấy còn 80 px trống mỗi bên.
3. **Bỏ gradient Tailwind ở bài học, không đổi cỡ chữ/khoảng cách.** *Lý do:* gradient cam là
   “tell” rõ nhất và là nguồn lệch bảng màu lớn nhất.
4. **Giữ nguyên chữ in hoa có sẵn** (“MA TRẬN & ĐẶC TẢ KIẾN THỨC”, “CHÀO MỪNG BẠN…”) vì đó là
   copy hiện có; chỉ giảm tracking/cỡ chữ, không viết lại lời.
5. **Không dựng lại dashboard Founder/Admin sau đăng nhập.** Không có Founder Code nên không thể
   xem DOM thật; sửa mù sẽ phá bảng điều khiển đang chạy. Ghi “not tested”.
6. **Không thêm trang đăng nhập học sinh.** Sản phẩm không có mật khẩu; cổng nhận diện theo tên
   đã là “auth” duy nhất. Tạo trang login mới sẽ là tính năng không tồn tại.
7. **Không tạo `robots.txt`/`sitemap.xml`.** Crawler đọc ở gốc tên miền, repo nằm dưới `/bakhi/`;
   thêm tệp chỉ tạo cảm giác đã làm SEO.
8. **Không xoá tệp cũ nào.** Chưa có bằng chứng “không còn tham chiếu” cho bất kỳ tệp JS/CSS nào;
   xoá sai sẽ làm trắng một màn hình.

## 7. Còn lại cho người xây dựng (chưa làm)

- Kiểm thử end-to-end Chat/Trợ lý AI/Hồ sơ với tài khoản thử.
- Dựng lại dashboard Founder/Admin khi có Founder Code.
- Chuyển Tailwind CDN sang build (cần đổi quy trình phát hành).
- Đo LCP/CLS/INP bằng Lighthouse trên bản deploy thật.

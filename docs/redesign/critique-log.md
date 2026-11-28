# Critique log — Quiet Graphite

Mỗi mục là một lần nhìn ảnh chụp thật trong phiên này (hoặc phiên trước, ghi rõ), theo mẫu
design-critique. Chỉ ghi những gì **đã thấy**; không suy đoán màn hình chưa mở được.

---

## Design Critique: Bài học Vật lí 11 / 1600 px / dark

### Overall Impression
Cấu trúc rõ, đọc được, và lần đầu tiên màu hổ phách biến mất. Cơ hội lớn nhất: hàng thẻ thông tin
ở đầu trang vẫn là bốn thẻ giống hệt nhau.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| Mục lục “Trên trang” nằm sát mép phải, chữ 13 px, không có chỉ báo vị trí khi mới mở | 🟡 Moderate | Đã thêm `aria-current` + vạch accent bên trái khi cuộn tới mục |
| Nút “Bắt đầu luyện tập” gradient cam cạnh các chip xám → lệch bảng màu | 🔴 Critical | **Đã sửa**: bỏ gradient, dùng accent phẳng, chữ `--accent-ink` |
| Thanh tiến độ trong header bài học màu cam, trùng vai với thanh tiến độ đọc mới | 🟡 Moderate | **Đã sửa**: cả hai dùng accent; thanh đọc 2 px ở đỉnh, thanh bài tập trong header |

### Visual Hierarchy
- **What draws the eye first**: tiêu đề lớn + watermark hình học bên phải. Đúng, vì đó là tên bài.
- **Reading flow**: tiêu đề → bốn thẻ → dải tab → bảng. Hợp lí.
- **Emphasis**: bảng ma trận được đóng khung panel, đúng vai trò nội dung chính.

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Bốn thẻ “Môn học / Chủ đề / Phạm vi / Các hình thức” | Cùng bán kính, cùng viền, cùng nền → đúng “identical cards” tell | Chấp nhận ở phiên này (dữ liệu 4 cột thật, không phải trang trí), nhưng nên gộp thành một dải 4 cột có đường kẻ thay vì 4 hộp |
| Chip “MA TRẬN & ĐẶC TẢ KIẾN THỨC” | In hoa, giãn chữ — tell | Giữ copy, đã giảm tracking; có thể hạ xuống chữ thường ở lần sau |

### Accessibility
- **Color contrast**: tiêu đề và thân đạt; chữ phụ trong bảng (`text-slate-400`) đã map sang `--rb-text-2`.
- **Touch targets**: chip và nút ≥ 36 px; trên mobile cần ≥ 44 px — **chưa đo lại ở 375 px trong phiên này**.
- **Text readability**: thân 16 px, dòng 1,6; dấu tiếng Việt trong “Ôn Tập Vật Lí 11 – Đề Cương” không bị cắt.

### Tells check
Gradient cam (đã bỏ), gradient tím ở nút nổi nhạc/báo cáo (đã bỏ), chip in hoa (giữ copy).

### What Works Well
- Mục lục dùng đúng heading có sẵn, không bịa thêm mục.
- Bảng rộng vẫn nằm trong panel riêng, không đẩy body cuộn ngang (`scrollWidth 1589 < 1600`).

### Priority Recommendations
1. **Gộp bốn thẻ đầu trang thành một dải có đường kẻ**: bớt một lớp hộp, tăng nhịp đọc.
2. **Đo lại 375 px** và nâng chip lên 44 px nếu thiếu.
3. **Rà chữ < 12 px** trong 125 tệp bài học (nội dung cũ, chưa sửa).

---

## Design Critique: Cài đặt / 1440 px / dark

### Overall Impression
Điều hướng con dọc 240 px làm trang đọc như một bảng cài đặt thật thay vì một dãy tab. Cơ hội:
khối Hồ sơ vẫn là một “thẻ trong thẻ”.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| Tab đang chọn có nền hồng nhạt + viền trái accent, nhưng cả tab còn viền bao quanh → hơi nặng | 🟡 Moderate | Đã bỏ viền bao, chỉ giữ vạch trái + nền `surface-1` |
| “Hỏi AI” và “Báo cáo” là hai nút nổi chồng lên vùng nội dung cuối trang | 🟡 Moderate | Đã chặn khoảng trống cuối footer; nút Báo cáo đổi sang surface, không còn tím |
| Nút “Báo cáo” màu tím gradient lệch hoàn toàn bảng màu | 🔴 Critical | **Đã sửa**: surface-2 + hairline + focus accent |

### Visual Hierarchy
- **What draws the eye first**: ảnh bìa hồ sơ lớn. Với trang Cài đặt thì hơi lấn; nhưng đây là
  khối “Hồ sơ” nên chấp nhận.
- **Reading flow**: tiêu đề → nav trái → nội dung. Đúng T4.
- **Emphasis**: “14/99 badge” nổi bật vừa phải.

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Panel Hồ sơ | Bo góc + viền + nền = panel lồng trong panel | Gộp ảnh bìa và thông tin vào một panel, bỏ viền trong |
| Nút phụ “Mở trang hồ sơ đầy đủ” | Icon + chữ, cùng kiểu nút như các nút khác | Ổn |

### Accessibility
- **Contrast**: nhãn nav `--rb-text-2` trên nền canvas đạt 4,5:1 (đo bằng script).
- **Touch targets**: tab 40 px cao — dưới 44 px; **cần nâng ở lần chạm cuối**.
- **Text readability**: mô tả 13 px, đạt ngưỡng 12 px.

### Tells check
Gradient ở nút Báo cáo (đã bỏ). Không có eyebrow, không số thứ tự giả.

### Priority Recommendations
1. Nâng tab và hàng cài đặt lên 44 px trên thiết bị cảm ứng.
2. Bỏ viền panel lồng trong khối Hồ sơ.
3. Ảnh bìa: đặt `aspect-ratio` cố định để không nhảy khi tải.

---

## Design Critique: 404 / 1440 px / dark

### Overall Impression
Đúng vai trò: mã lỗi, một câu giải thích, hai hành động, link phụ. Không có gì để cắt.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| “Quay lại trang trước” dùng `javascript:history.back()` | 🟡 Moderate | **Đã sửa**: đổi thành `<button type="button" onclick="history.back()">` |

### Visual Hierarchy
- **What draws the eye first**: “404” màu accent. Đúng.
- **Reading flow**: mã → tiêu đề → giải thích → hành động → link phụ. Tuyến tính, tốt.

### Accessibility
- Một `h1`, link thật, focus visible theo token. `noindex, follow` để không bị index.

### Tells check
Không có gradient, không eyebrow, không số thứ tự giả (404 là số thật của trạng thái).

### Priority Recommendations
1. ~~Thay `javascript:` bằng handler.~~ Đã sửa trong phiên này.
2. Nút chính “Về trang chủ”: `.bk-btn-primary` bị CSS cũ thắng specificity → đã đổi selector sang
   `body.bk-rebirth .bk-btn-primary` và kiểm lại: nền `rgb(255 182 193)`, chữ `rgb(43 15 22)`.

---

## Design Critique: Trợ lý AI — kiểm tra CSS bằng tin nhắn tiêm / 1440 px / dark

**Lưu ý:** không phải hội thoại thật. Chỉ để kiểm tra bố cục.

### Overall Impression
Câu trả lời đọc như một bài giảng (serif 17 px/1,75, cột 578 px), câu hỏi là bong bóng phải. Đúng ý đồ.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| Nhãn “Trợ lý AI” và model hiển thị cùng dòng, model 10 px | 🟡 Moderate | Đã nâng nhãn lên 12 px; model giữ 10 px vì là metadata phụ — **cần quyết định**: có nên ẩn model khỏi UI? |
| Nút sao chép/tạo lại nằm cuối mỗi câu trả lời | 🟢 Minor | Ổn, hiện khi hover |

### Priority Recommendations
1. Chạy luồng streaming thật để kiểm tra nhịp cập nhật và `aria-live`.
2. Quyết định ẩn/hiện tên model trong UI.

---

## Critique bổ sung: rail và biểu tượng (cùng phiên)

| Finding | Severity | Xử lý |
|---|---|---|
| Biểu tượng lấy từ Font Awesome CDN, mỗi glyph một độ dày/chiều cao khác nhau (đo 22×16,8 px); mất CDN là rail trống | 🔴 Major | Bộ SVG nội tuyến, lưới 24, nét 1,6; 11 biểu tượng, không phụ thuộc CDN |
| Nút thu gọn nằm cạnh logo trong rail 76 px: chồng lên logo, bị `overflow:hidden` cắt | 🔴 Major | Chuyển xuống chân rail, có nhãn và `aria-label` theo trạng thái |
| Tooltip CSS bị `overflow` của rail/nav cắt → nhãn của rail thu gọn không bao giờ hiện | 🔴 Major | Một tooltip trong `<body>`, định vị theo mép phải rail (đo: x = 86, không bị cắt) |
| Chân rail bị đẩy ra ngoài khung khi cửa sổ thấp (720 px) | 🟡 Moderate | Rail thành grid `auto 1fr auto`; đo lại: chân rail 551–708 trong 720 |
| Nút nhạc nổi đè lên chân rail | 🟡 Moderate | Đẩy sang phải rail trên desktop |
| Trạng thái đang chọn dùng nền hồng + vạch hồng ngoài, hơi ồn so với Quiet Graphite | 🟢 Minor | Bề mặt `--rb-surface-3` + vạch nhấn 2 px phía trong |
| Nhãn nhóm ẩn nhưng vẫn chiếm chỗ → khoảng cách giữa nhóm không đều | 🟢 Minor | `display:none` khi thu gọn + dấu phân cách 1 px |

## Tổng kết critique

- 🔴 đã sửa trong phiên này: gradient cam ở CTA bài học, gradient tím ở nút Báo cáo/nhạc, bảng màu
  Tailwind còn sót, chữ 11 px trong mục lục và badge chat.
- 🟡 còn mở: touch target 44 px cho tab/hàng cài đặt, bốn thẻ đầu bài học, panel lồng trong Hồ sơ,
  `javascript:` ở nút quay lại 404, nhãn model AI.
- 🟢 ghi nhận: hiệu ứng hover của nút phụ.

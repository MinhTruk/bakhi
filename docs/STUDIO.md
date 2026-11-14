# 🎨 Bá Khí Studio — Word & Paint

Ứng dụng tĩnh độc lập: `studio/word-paint.html` (mở từ menu 3 gạch → **Bá Khí Studio — Word & Paint**,
từ command palette `Ctrl/⌘ + K`, hoặc trực tiếp `/studio/word-paint.html`).

Một chỗ làm việc gồm **soạn thảo văn bản kiểu Word** và **bảng vẽ kiểu Paint**, chuyển qua lại
hoặc chia đôi màn hình. Không backend, không thư viện ngoài, dữ liệu nằm trên máy bạn.

## 1. Ba chế độ

| Chế độ | Dùng để |
|---|---|
| **Word** | Viết tài liệu trên trang giấy A4, định dạng chữ/đoạn, chèn ảnh, in/PDF |
| **Paint** | Vẽ tự do, hình khối, tẩy, chữ; chèn bản vẽ vào tài liệu |
| **Chia đôi** | Vừa viết vừa vẽ cạnh nhau |

Chế độ được nhớ cho lần mở sau.

## 2. Soạn thảo (Word)

- **Định dạng**: đậm/nghiêng/gạch chân/gạch ngang, tiêu đề 1–3, trích dẫn, cỡ chữ, màu chữ,
  màu nền chữ, danh sách chấm/số, canh trái/giữa/phải, liên kết, ảnh, đường kẻ ngang, xoá định dạng.
- **Hoàn tác / làm lại**: nút ↶ ↷ hoặc `Ctrl+Z`, `Ctrl+Shift+Z`.
- **Dán thông minh**: giữ định dạng cơ bản nhưng tự bỏ `<script>`, `<iframe>`, thuộc tính `on*`
  và liên kết `javascript:`.
- **Chèn ảnh**: tối đa 1,2 MB/ảnh (để không làm đầy bộ nhớ trình duyệt).
- **Đếm chữ/ký tự** ở thanh dưới.
- **In / lưu PDF**: `Ctrl+P` — chỉ in trang giấy, ẩn thanh công cụ.

Phím tắt: `Ctrl/⌘+S` lưu, `Ctrl/⌘+N` tài liệu mới, `Ctrl/⌘+P` in, `Ctrl+A` chỉ chọn nội dung trang.

## 3. Vẽ (Paint)

| Nhóm | Công cụ |
|---|---|
| Nét | bút lông, bút chì, bút dạ quang (mờ), tẩy |
| Hình | đường thẳng, hình chữ nhật, hình tròn, mũi tên |
| Chữ | công cụ **T** — bấm lên bảng vẽ rồi nhập nội dung |
| Màu | 8 màu nhanh + bảng chọn màu tuỳ ý |
| Nét | cỡ 1–64 px, độ đậm 10–100% |
| Khác | hoàn tác/làm lại (8 bước), xoá bảng vẽ, **Chèn vào trang**, **Tải PNG** |

- Bảng vẽ 1200 × 675 (16:9), tự co giãn theo khung; vẽ được bằng chuột, bút cảm ứng, ngón tay.
- **Chèn vào trang** đưa bản vẽ thành ảnh ngay tại con trỏ và chuyển sang chế độ chia đôi.
- Bản vẽ được lưu cùng tài liệu, mở lại vẫn còn.

## 4. Tài liệu & lưu trữ

- Danh sách tài liệu bên trái: mở, nhấp đúp để đổi tên, nút × để xoá (có xác nhận).
- **Lưu tự động** sau 0,5 giây kể từ thay đổi cuối; trạng thái “Đã lưu HH:MM” ở góc phải.
- Toàn bộ nằm trong một key `localStorage`: `bakhiStudio.v1`
  (`docs[]` gồm `title`, `html`, `draw` dạng data URL, `updated`).
- Menu **Tệp**:
  - Tài liệu mới, Lưu ngay, Nhân bản
  - Mở tệp `.html`/`.txt` (HTML được làm sạch trước khi chèn)
  - Xuất HTML (tệp tự chứa, mở được ở bất kỳ đâu)
  - Xuất TXT
  - In / Lưu PDF
  - **Xoá toàn bộ dữ liệu Studio** (có xác nhận) — đặt lại về một tài liệu trắng

> Giới hạn của `localStorage` khoảng 5 MB. Ảnh và bản vẽ được nhúng dạng data URL nên nếu
> trình duyệt báo đầy bộ nhớ, hãy xuất HTML rồi xoá bớt tài liệu/ảnh.

## 5. Trợ năng & thiết bị

- Nút có `aria-label`/`aria-pressed`, thanh công cụ dùng `role="toolbar"`, trang soạn thảo
  là `role="textbox"` có `aria-multiline`, thông báo qua vùng `aria-live`.
- Viền tiêu điểm rõ ràng, tay chạm to hơn trên thiết bị cảm ứng, tôn trọng
  `prefers-reduced-motion`.
- Màn hình hẹp: danh sách tài liệu mở bằng nút **Tài liệu**; trang và bảng vẽ xếp dọc.
- In: chỉ nội dung trang giấy, không in thanh công cụ.

## 6. Thành tích

Studio ghi tín hiệu vào `bakhiSignals.v1` (chỉ số đếm, không nội dung) để Trung tâm
học tập mở khoá 5 mốc nhóm **Studio**:

| Mốc | Điều kiện |
|---|---|
| Trang giấy đầu tiên | Lưu một tài liệu có từ 20 từ |
| Nét vẽ đầu tiên | Lưu một tài liệu có bản vẽ |
| Minh hoạ tài liệu | Bấm **Chèn vào trang** |
| Chia sẻ tác phẩm | Xuất HTML/TXT hoặc tải PNG |
| Cây bút 500 từ | Một tài liệu đạt 500 từ |

Tín hiệu được đồng bộ khi Studio lưu (sau 0,5 giây) và khi xuất/chèn. Xoá dữ liệu
Studio không xoá thành tích đã đạt — thành tích nằm trong `bakhiLearn.v1`.

## 7. Giới hạn đã biết

- Không phải bộ soạn thảo đầy đủ như Word thật: chưa có bảng, chú thích, header/footer,
  đánh số trang, theo dõi thay đổi.
- Không đồng bộ giữa các thiết bị (dữ liệu cục bộ); hãy xuất HTML/TXT để sao lưu.
- Ảnh/bản vẽ lớn làm tăng dung lượng lưu; nên xuất PNG riêng khi không cần nhúng.
- Canvas không thao tác được hoàn toàn bằng bàn phím (bản chất công cụ vẽ).

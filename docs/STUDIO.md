# 🎨 Bá Khí Studio — Word & Paint

Ứng dụng tĩnh độc lập: `studio/index.html` (mở từ menu 3 gạch → **Bá Khí Studio — Word & Paint**,
từ command palette `Ctrl/⌘ + K`, hoặc trực tiếp `/studio/`). Địa chỉ cũ
`/studio/word-paint.html` tự chuyển hướng về đây.

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

## 8. Một ứng dụng duy nhất

| Địa chỉ | Vai trò |
|---|---|
| `/studio/` (`studio/index.html`) | **Ứng dụng chính** — Word, Paint và Chia đôi |
| `/studio/word-paint.html` | Trang tương thích: chuyển hướng ngay sang `/studio/`, giữ query và hash |

Trước 3.9.0 có hai tệp: `studio/index.html` là trình thiết kế trang A4 và
`studio/word-paint.html` là Word & Paint. Nay chỉ còn **một** giao diện Word & Paint;
trình thiết kế cũ đã được hợp nhất và dữ liệu của nó được nhập tự động.

### Nhập dữ liệu Studio cũ

- Khoá cũ `lexend-studio-doc` được đọc **một lần** khi mở `/studio/`.
- Mỗi dự án cũ trở thành một tài liệu mới tên `<tên dự án> (Studio cũ)`:
  hộp văn bản, ảnh (data URL) và hình vẽ (SVG) được giữ nguyên vị trí trên trang A4.
- Khoá cũ **không bị xoá**; mốc nhập lưu trong `bakhiStudio.v1` (`migrated.legacy`)
  nên mở lại không sinh tài liệu trùng.
- Nếu dự án cũ có thành phần ngoài phạm vi chuyển đổi, bạn vẫn có thể mở lại tệp JSON
  đã lưu trước đây — dữ liệu gốc còn nguyên.

Tệp tĩnh độc lập, không cần backend. Chuông thông báo đặt ở góc phải dưới và
không che thanh công cụ. Thông báo không làm gián đoạn tài liệu đang soạn: bảng chỉ mở khi
bấm chuông.

## 8.1. Report Issue trên Studio (8.0.1)

Studio cũng nạp `bk-report.js`, nên nút **Báo cáo** nằm ngay trên chuông thông báo ở góc phải
dưới (kéo được, nhớ vị trí) và mở cùng cửa sổ báo cáo như mọi trang khác. Báo cáo gửi từ Studio tự gắn ngữ cảnh `studio` (khu vực) và URL hiện tại, giúp
ban quản trị biết vấn đề nằm ở Word hay Paint. Không có hệ thống báo cáo riêng cho Studio.

## 9. Dữ liệu, an toàn và sao lưu

### Cấu trúc `bakhiStudio.v1`

```jsonc
{
  "v": 1,
  "active": "doc-...",          // tài liệu đang mở
  "mode": "word",               // word | paint | split
  "migrated": { "legacy": "..." },   // mốc đã nhập dự án Studio cũ
  "docs": [
    {
      "id": "doc-...",
      "title": "Tài liệu chưa đặt tên",
      "html": "<p>...</p>",
      "draw": "data:image/png;base64,...",   // có thể rỗng
      "updated": 1760000000000
    }
  ]
}
```

### An toàn

- Dán và mở tệp HTML đều đi qua bộ lọc: bỏ `<script>`, `<iframe>`, thuộc tính `on*`,
  `javascript:`, `data:` nguy hiểm.
- Xuất HTML tạo tệp **tự chứa** (CSS inline), không nhúng mã độc từ tài liệu gốc.
- Studio không đọc cookie, không gọi mạng, không gửi dữ liệu tới Supabase.

### Sao lưu & phục hồi

1. **Menu Tệp → Xuất HTML** cho từng tài liệu quan trọng.
2. **Xuất TXT** nếu chỉ cần nội dung chữ.
3. **Tải PNG** cho bản vẽ.
4. Để phục hồi: **Menu Tệp → Mở tệp** và chọn `.html`/`.txt` đã xuất.
5. Xoá dữ liệu Studio chỉ đặt lại `bakhiStudio.v1`; thành tích đã đạt vẫn còn trong
   `bakhiLearn.v1`.

## 10. Câu hỏi thường gặp

**Studio có cần đăng nhập không?**
Không. Studio chạy hoàn toàn cục bộ; chuông thông báo dùng chế độ chỉ thông báo.

**Vì sao không thấy nút chèn bảng?**
Bảng chưa được hỗ trợ (xem Giới hạn). Có thể dùng HTML trong chế độ xem mã nguồn nếu cần.

**Tôi lỡ xoá tài liệu, có khôi phục được không?**
Chỉ khi bạn đã xuất HTML/TXT trước đó. Dữ liệu Studio không có lịch sử phiên bản.

**Dung lượng đầy thì sao?**
Xuất và xoá bớt tài liệu/ảnh; hoặc giảm kích thước ảnh trước khi chèn (giới hạn 1,2 MB/ảnh).

**Có thể mở Studio trên điện thoại không?**
Có. Giao diện xếp dọc, danh sách tài liệu mở bằng nút **Tài liệu**; vẽ bằng ngón tay được.

## 11. Kiểm thử

- Mở `/studio/`, tạo tài liệu, gõ vài từ, đổi chế độ, tải lại trang → nội dung
  còn nguyên.
- Mở `/studio/word-paint.html` → tự chuyển sang `/studio/`, không mất dữ liệu.
- Có dự án cũ trong `lexend-studio-doc` → thấy tài liệu `(Studio cũ)` đúng một lần,
  khoá cũ vẫn còn.
- Xuất HTML rồi mở tệp đã xuất ở cửa sổ ẩn danh → nội dung và định dạng hiển thị đúng.
- Vẽ vài nét, chèn vào trang, xuất PNG → ảnh đúng.
- Bấm chuông thông báo → bảng mở, không che thanh công cụ.
- `NODE_PATH=... node tools/qa/studio-smoke.js` kiểm tra ba chế độ, lưu tự động,
  nhập dữ liệu cũ và chuyển hướng địa chỉ cũ.
- `NODE_PATH=... node tools/qa/smoke.js` (nhóm `[1]`) kiểm tra tín hiệu Studio → thành tích.

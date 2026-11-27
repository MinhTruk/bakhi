# Studio (Word & Paint) — audit và cách áp giao diện

## 1. Studio làm gì (đọc từ `studio/index.html`, 1318 dòng)

- Một trang duy nhất, toàn màn hình, không nạp `bk-core.js`; chrome riêng (`.appbar`,
  thanh công cụ, vùng soạn thảo/bảng vẽ).
- Hai chế độ: **Word** (soạn thảo rich-text) và **Paint** (vẽ canvas).
- Dữ liệu: `localStorage` khoá `bakhiStudio.v1` (+ khoá cũ đọc một lần); ảnh bị giới hạn
  kích thước để không làm hỏng localStorage; xuất **HTML**, **TXT**, và ảnh PNG từ Paint.
- Chỉ số đếm cho thành tựu: `bakhiSignals.v1` (nhóm `studio`: docs, drawings, exports, inserts, words).
- `studio/word-paint.html` chỉ chuyển hướng về `studio/index.html`.
- Không có Supabase, không có upload máy chủ, không có route con.

## 2. Mẫu đã chọn

Studio là **workspace**, không phải dashboard (T1), không phải master-detail (T3),
không phải hội thoại (T5). Vì vậy:

- **Không chèn** rail, top bar, bottom tab hay footer của `bk-rebirth.js` — chèn vào sẽ
  làm tràn khung soạn thảo và phá bố cục hai chế độ.
- Chỉ áp **token + typography**: `bk-rebirth.css` được nạp trên trang, cung cấp lại
  `--bk-*` / `--bkl-*` theo bảng Quiet Graphite và quy đổi các lớp Tailwind cũ trong
  phạm vi trang, nên toolbar, khung soạn thảo và bảng vẽ đổi tông mà không đổi cấu trúc.
- Nút và ô nhập của Studio giữ nguyên kích thước/ID/handler; chỉ đổi bề mặt, viền, bo góc.

## 3. Điều đã giữ nguyên

- Toàn bộ hàm và ID: lưu/khôi phục tài liệu, chèn ảnh, xuất HTML/TXT/PNG, xoá dữ liệu,
  phím tắt, giới hạn ảnh, `bakhiSignals.v1`.
- Không đổi tên khoá lưu trữ, không đổi định dạng tệp xuất.

## 4. Chưa làm / giới hạn

- Không dựng lại giao diện Studio theo bố cục mới (side panel, thanh công cụ nhóm lại);
  đây là bề mặt duy nhất chỉ được re-skin bằng token trong lần này.
- Chưa kiểm thử xuất PNG/HTML trên trình duyệt thật trong phiên này; luồng không bị sửa mã.

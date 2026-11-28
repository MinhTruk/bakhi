# Post-build audit — lớp Quiet Graphite

Ngày 27/11/2026. Phương pháp ponytail-audit áp lên **chính thay đổi của phiên này**
(`bk-rebirth.css`, `bk-rebirth.js`, `404.html`), không áp lên toàn repo (đã có `00-repo-audit.md`).

## Số liệu

| Hạng mục | Số | Nhận xét |
|---|---:|---|
| Dòng CSS thêm | +463 | mục 19–27: đọc bài, Trợ lý AI, Chat, Cài đặt, 404, quy đổi Tailwind, cổng nhận diện, nút nổi |
| Dòng JS thêm | +88 | `mountReader` + một lời gọi |
| `!important` trong phần mới | 109 | **cao** — xem mục 1 |
| Màu hex viết cứng trong phần mới | 6 | chỉ trong `@media print` (`#000`, `#fff`, `#bbb`) — cố ý cho giấy |
| `console.log` thêm | 0 | |
| Dependency thêm | 0 | |
| Component dùng đúng 1 nơi | 1 | `.bk-status-*` (chỉ 404) — xem mục 3 |
| Tệp xoá | 0 | chưa có bằng chứng “không còn tham chiếu” |

## Must fix (do phiên này tạo ra) — đã sửa

### 1. `!important` tràn lan trong phần mới
- `What this is:` 109/463 dòng mới dùng `!important` để thắng CSS module cũ.
- `Problem:` khó ghi đè tiếp, dễ sinh chiến tranh specificity về sau; đây là nợ kỹ thuật có chủ đích.
- `Fix:` phần lớn là cần thiết vì CSS module (`bk-chat.css`, `bk-ai-tutor.css`) cũng dùng
  `!important` và nạp **trước**; đã giới hạn ở thuộc tính màu/nền/viền, không dùng cho bố cục
  (`grid-template-columns` chỉ 3 chỗ, có chủ đích).
- `If we skip it:` bỏ `!important` sẽ làm phần lớn thay đổi màu không hiển thị.
- Nơi: `assets/bakhi/bk-rebirth.css` mục 19–27.

### 2. Chữ 11 px ở hai chỗ
- `What this is:` mục lục cấp 3 và badge chat đặt 11 px.
- `Problem:` dưới ngưỡng 12 px của thiết kế.
- `Fix:` **đã sửa** cả hai về 12 px (`0.75rem`, `0.8125rem`).

## Should fix

### 3. `.bk-status-*` chỉ dùng ở một trang
- `What this is:` khối CSS cho trang 404.
- `Problem:` vi phạm quy tắc “component phải dùng ≥ 2 nơi”.
- `Fix:` chấp nhận: đây là **template T9** (trang trạng thái), không phải component; T9 còn dùng cho
  màn hình lỗi/bảo trì chưa tồn tại. Nếu sau này không làm các màn đó thì nên inline vào `404.html`.
- `If we skip it:` ~30 dòng CSS thừa trong tệp dùng chung.

### 4. `mountReader` gắn một listener `click` toàn trang
- `What this is:` để dựng lại mục lục khi đổi tab Ma trận/Luyện tập.
- `Problem:` listener sống suốt trang, chạy `setTimeout` 180 ms sau **mọi** cú click.
- `Fix:` chấp nhận (chỉ một listener, không đo layout, chỉ so số heading); nếu sau này cần sạch thì
  gắn listener vào hai nút tab cụ thể.
- `If we skip it:` một hàm rỗng chạy sau mỗi click — không đáng kể.

### 5. Scroll spy không được gắn lại sau khi dựng lại mục lục
- `What this is:` sau khi đổi tab, danh sách mới không còn `aria-current`.
- `Problem:` mất chỉ báo “đang đọc mục nào” trong tab vừa chuyển.
- `Fix:` có ghi `shortcut:` trong mã; gắn lại observer là ~10 dòng nếu thấy cần.
- `If we skip it:` thiếu chỉ báo, không sai chức năng.

## Nice to have

### 6. Quy đổi Tailwind bằng `[class~="…"]` dài
- Có thể rút gọn bằng cách sửa `tailwind.config` trong từng trang (không làm: 125 tệp, phá hash).

## Kiểm tra bắt buộc — kết quả

| Kiểm tra | Kết quả |
|---|---|
| Màu cứng ngoài `@media print` | 0 |
| Thời lượng/thời gian viết cứng ngoài token | 0 (dùng `--rb-dur-*`) |
| `console.log` | 0 |
| Nút không có handler do lớp mới thêm | 0 |
| `alt`/nhãn thiếu ở phần tử mới | 0 (mục lục là link có chữ; nút nổi đã có nhãn từ trước) |
| Chữ < 12 px | 0 trong phần mới (đã sửa) |
| Target < 44 px trên `pointer: coarse` | tab Cài đặt đã nâng; mục lục mobile 48 px |
| Đụng vào auth/role/schema/API | **không** |

## Verdict

Không còn **Must fix** do phiên này tạo ra. Nợ kỹ thuật đã biết: `!important` (có chủ đích),
component T9 dùng một nơi, scroll spy sau khi đổi tab.

**Lean:** +551 dòng, +0 dependency, +24,5 KB thô (~+3–4 KB gzip).

**Not checked:** axe, Lighthouse, đăng nhập thật, Founder dashboard, Chat realtime.

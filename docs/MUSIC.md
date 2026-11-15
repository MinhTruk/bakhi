# 🎧 Music Player dùng chung

Trình phát nhạc chạy trên **mọi trang** của Bá Khí (do `bk-core.js` nạp `bk-music.js`).
Chỉ có **một** thẻ audio cho mỗi trang, không autoplay, không gửi dữ liệu đi đâu.

- Mã nguồn: `assets/bakhi/bk-music.js` · giao diện: `assets/bakhi/bk-music.css`
- Logo ♪ ở góc trái dưới, kéo thả tự do; chuột phải để đặt lại vị trí logo.
- Panel nhớ vị trí, kích thước, trạng thái thu nhỏ/phóng to và tab đang mở.

## 1. Quy ước file (không phải sửa code khi thêm bài)

```
music/<slug>.mp3    bài hát
music/<slug>.txt    lời bài hát (tùy chọn)
music/<slug>.png    ảnh bìa (tự dò .png → .jpg → .jpeg → .webp)
```

`<slug>` là chữ thường, không dấu, nối bằng dấu gạch ngang. Ví dụ:

```
music/gia-nhu.mp3 · music/gia-nhu.txt · music/gia-nhu.png
```

Thư viện hiện có 5 bài:

| `id` | Tệp |
|---|---|
| `co-le-anh` | `co-le-anh.mp3` · `.txt` · `.png` |
| `du-bao-thoi-tiet-hom-nay-mua` | `du-bao-thoi-tiet-hom-nay-mua.mp3` · `.txt` · `.png` |
| `gia-nhu` | `gia-nhu.mp3` · `.txt` · `.png` |
| `homesick` | `homesick.mp3` · `.txt` · `.png` |
| `xuong-rong-intro` | `xuong-rong-intro.mp3` · `.txt` · `.png` |

Thêm bài mới:

1. Bỏ 3 file vào thư mục `music/`.
2. Thêm **một dòng** vào `LIBRARY` trong `assets/bakhi/bk-music.js`:

```js
{ id: 'gia-nhu', title: 'Giá như', artist: 'xoxad' },
```

`src`, `lyricSrc` và `coverBase` được sinh tự động từ `id` — không khai báo tay.

> Các file `.mp3` hiện có là bản thu thử ngắn tự tạo để trình phát chạy được ngay.
> Hãy thay bằng file bạn có quyền sử dụng; giữ nguyên tên file là đủ.

### Kích thước & hiệu năng

- Mỗi tệp `.mp3` hiện khoảng 8–13 MB. Trình duyệt chỉ tải bài khi bạn bấm phát (không
  tải trước toàn bộ thư viện), trừ khi trình duyệt tự cache.
- Ảnh bìa nên giữ dưới ~300 KB để panel mở nhanh trên mạng chậm.
- Lời bài hát là tệp văn bản nhỏ, tải khi mở tab Lời.
- Không có audio thứ hai: chuyển bài dùng lại cùng một thẻ `<audio>`, nên không bị chồng nhạc.

## 2. Lời bài hát

- File `.txt` cùng tên với bài; mỗi dòng là một câu.
- Dòng bắt đầu bằng `#` là ghi chú, không hiển thị.
- Có thể đồng bộ theo thời gian bằng timestamp đầu dòng:

```text
# Lời do bạn tự nhập hoặc có quyền sử dụng
[00:12] Câu hát đầu tiên
[00:19] Câu hát tiếp theo
```

- Nút **Sửa lời** cho phép dán lời ngay trong trình duyệt (lưu `localStorage`, chỉ trên
  máy bạn) và **được ưu tiên hơn file `.txt`**.
- Thiếu file hoặc file lỗi chỉ hiện gợi ý đường dẫn, không làm hỏng trình phát.

## 3. Điều khiển & phím tắt

| Thao tác | Cách dùng |
|---|---|
| Phát / tạm dừng | Nút ▶/⏸ hoặc `Space` (khi trình phát đang mở) |
| Bài trước / bài kế | Nút ⏮ ⏭ |
| Tua 5 giây | `←` / `→` (khi trình phát đang mở) |
| Tắt / bật tiếng | Nút loa hoặc `M` |
| Đóng trình phát | `Esc` hoặc nút × |
| Đổi tab | Bấm tab, hoặc `←` `→` `Home` `End` khi đang ở thanh tab |
| Di chuyển queue | Kéo thả, hoặc `Alt+↑/↓` khi mục đang được chọn |
| Xoá khỏi queue | Nút × trên mục, hoặc `Delete` khi mục đang được chọn |
| Đổi vị trí panel | Kéo thanh tiêu đề |
| Đổi kích thước | Kéo góc dưới-trái |
| Thu nhỏ / phóng to | Nút — và ⛶ trên thanh tiêu đề |
| Đặt lại bố cục | Nhấp đúp thanh tiêu đề |

Phím tắt **chỉ hoạt động khi panel nhạc đang mở** và tự bỏ qua khi đang gõ trong
`input`, `textarea`, `select`, vùng `contenteditable` hoặc khi tiêu điểm ở nút/liên kết.

Ngoài ra trình phát còn đăng ký Media Session (nếu trình duyệt hỗ trợ) để điều khiển
được từ khoá màn hình, tai nghe hoặc bảng điều khiển media của hệ điều hành.

## 4. Bố cục & dữ liệu lưu

| Key | Nội dung |
|---|---|
| `bakhiMusic.v2` | Queue, vị trí bài, shuffle, repeat, âm lượng, thời điểm đang nghe |
| `bakhiMusic.panel.v1` | Vị trí/kích thước panel, trạng thái thu nhỏ/phóng to, tab đang mở |
| `bakhiMusic.fab.v1` | Vị trí logo ♪ |
| `bakhiMusic.lyrics.v1` | Lời do người dùng tự nhập |

- Màn hình hẹp (≤ 640px): panel luôn là bảng rộng hết chiều ngang ở đáy, hình học tự
  đặt tạm thời được bỏ qua; tay chạm to hơn cho các nút.
- Không autoplay sau khi tải lại: bài đang nghe dở hiện nút **“Tiếp tục: …”**, chỉ phát
  khi bạn bấm. Nút này chỉ biến mất khi âm thanh **thực sự** phát.

## 5. Trợ năng

- Nút có `aria-label`, trạng thái `aria-pressed` (shuffle/repeat/thu nhỏ/phóng to),
  `aria-expanded` cho logo.
- Tab theo chuẩn `tablist`/`tabpanel` với `aria-selected`, `aria-controls` và điều hướng
  bằng phím mũi tên.
- Vùng `aria-live="polite"` đọc tên bài, trạng thái phát và các thay đổi bố cục.
- Thanh tua/âm lượng có `aria-valuetext` (“0:12 trên 0:34”, “60%”).
- Mọi điều khiển có viền tiêu điểm rõ ràng; tôn trọng `prefers-reduced-motion`
  (tắt xoay bìa, nhấp nháy, chuyển tab).

## 6. Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Không phát được | Mở file `.mp3` trực tiếp; xem tab Network có 404 không; tên file phải khớp `id` |
| Bìa trống | Đặt `music/<slug>.png` (hoặc `.jpg/.jpeg/.webp`) đúng tên |
| Lời không hiện | File `.txt` đúng tên, không phải `.TXT`; dòng ghi chú phải bắt đầu bằng `#` |
| Panel nằm ngoài màn hình | Nhấp đúp thanh tiêu đề, hoặc xoá `bakhiMusic.panel.v1` trong localStorage |
| Logo ♪ mất | Chuột phải vào logo, hoặc xoá `bakhiMusic.fab.v1` |
| Phím `Space` không tác dụng | Panel nhạc phải đang mở và không được đứng trong ô nhập |
| Nhạc tự phát khi mở trang | Kiểm tra tiện ích trình duyệt/xem trước autoplay; thiết kế không autoplay |
| Bài bị nhảy về đầu | File `.mp3` hỏng hoặc bị chặn range request; thử tệp khác |
| Panel che nội dung đang đọc | Kéo panel sang chỗ khác, thu nhỏ, hoặc nhấp đúp tiêu đề để đặt lại |
| Lời bị lệch nhịp | Timestamp chỉ là gợi ý; sửa `[mm:ss]` trong file `.txt` hoặc dùng **Sửa lời** |

Kiểm tra tự động: `NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js` (nhóm `[1b]`).
Trên Windows, đặt `$env:NODE_PATH` tới thư mục `node_modules` của jsdom.

## 7. Tích hợp với phần còn lại

- **Thành tích**: mỗi lượt phát thật ghi tín hiệu `music.plays` vào `bakhiSignals.v1`; Trung
  tâm học tập dùng số đếm này cho nhóm **Khám phá**, không lưu tên bài hay nội dung.
- **Developer Playground**: tab **Music** đọc trạng thái qua `BKMusic.on(fn)` và có nút mở,
  phóng to, thu nhỏ, đặt lại bố cục; không polling.
- **Trang chủ & trang bài học**: `bk-core.js` nạp `bk-music.js` một lần cho mỗi trang, nên
  trình phát tồn tại xuyên suốt nhưng không chồng audio.
- **Thông báo**: chuông thông báo là phần tử riêng, không che logo ♪ (logo ở trái dưới,
  chuông ở phải dưới).
- **Focus mode**: panel nhạc vẫn dùng được; không tự phát, không tự đóng.

## 8. Câu hỏi thường gặp

**Tôi có thể thêm nhiều bài cùng lúc không?**
Có, miễn mỗi bài có `id` riêng và một dòng trong `LIBRARY`.

**Có cần cài thư viện ngoài không?**
Không. Toàn bộ dùng HTML5 Audio + DOM thuần.

**Nhạc có được gửi lên máy chủ không?**
Không. Tệp nằm trong repository tĩnh; trạng thái nghe lưu cục bộ.

**Vì sao mở trang mới thì nhạc dừng?**
Mỗi trang là một tài liệu riêng (điều hướng tĩnh), nên thẻ audio được tạo lại. Đây là giới
hạn của website không SPA, không phải lỗi.

**Làm sao xoá lịch sử nghe?**
Xoá `bakhiMusic.v2` (queue/trạng thái) trong Local Storage; không ảnh hưởng dữ liệu học tập.

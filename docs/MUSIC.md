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

Thêm bài mới:

1. Bỏ 3 file vào thư mục `music/`.
2. Thêm **một dòng** vào `LIBRARY` trong `assets/bakhi/bk-music.js`:

```js
{ id: 'gia-nhu', title: 'Giá như', artist: 'xoxad' },
```

`src`, `lyricSrc` và `coverBase` được sinh tự động từ `id` — không khai báo tay.

> Các file `.mp3` hiện có là **bản thu thử 12 giây** tự tạo để trình phát chạy được ngay.
> Hãy thay bằng file bạn có quyền sử dụng; giữ nguyên tên file là đủ.

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

Kiểm tra tự động: `NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js` (nhóm `[1b]`).

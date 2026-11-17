# 🎧 Music Player dùng chung

Trình phát nhạc chạy trên **mọi trang** của Bá Khí (do `bk-core.js` nạp `bk-music.js`).
Từ 7.0.0, đây là **thư viện nhạc cá nhân**: mặc định trống, bài hát được thêm bằng
liên kết chính thức của YouTube, Spotify hoặc SoundCloud và phát trong khung nhúng
của chính nền tảng.

- Mã nguồn: `assets/bakhi/bk-music.js` · giao diện: `assets/bakhi/bk-music.css`
- Logo ♪ ở góc trái dưới, kéo thả tự do; chuột phải để đặt lại vị trí logo.
- Panel nhớ vị trí, kích thước, trạng thái thu nhỏ/phóng to và tab đang mở.
- Không có tệp `.mp3` đóng gói sẵn, không tự phát, không tải nhạc lên máy chủ.

## 1. Thêm bài hát

1. Mở panel nhạc → tab **Thư viện** → **Thêm bài** (hoặc nút “Thêm bài” ở chân panel).
2. Dán liên kết chính thức:
   - YouTube: video (`watch?v=…`, `youtu.be/…`, `shorts/…`) hoặc danh sách phát (`list=…`).
   - Spotify: `open.spotify.com/track|album|playlist|episode|show|artist/…`.
   - SoundCloud: `soundcloud.com/<nghệ sĩ>/<bài>` hoặc widget `w.soundcloud.com/player`.
3. Có thể nhập **tên bài** và **nghệ sĩ**; bỏ trống sẽ dùng tên do nền tảng gợi ý.
4. Bấm **Thêm**. Bài xuất hiện trong Thư viện và cuối Queue.

Quy tắc:

- Chỉ nhận `http`/`https` và host chính thức; liên kết lạ bị từ chối kèm lý do.
- Mỗi liên kết chỉ có một bài (chống trùng theo `source_key`).
- Tối đa **200 bài** mỗi học sinh.
- Bìa được tạo tại chỗ từ chữ cái đầu và màu theo tên bài — không cần ảnh PNG.
- Nút **Sửa** trong Thư viện cho phép đổi tên, nghệ sĩ và lời bài hát.
- Nút **Xoá** hỏi xác nhận trước khi bỏ bài khỏi thư viện và Queue.

## 2. Lời bài hát

- Lời lưu **theo từng bài**, do người dùng tự nhập (tối đa 20.000 ký tự).
- Nút **Sửa lời** mở ô nhập cho bài đang chọn; **Lưu lời** ghi vào thư viện,
  **Xoá lời** đặt lại trống.
- Mỗi dòng là một câu. Dòng bắt đầu bằng `[mm:ss]` được hiển thị kèm mốc thời gian:

```text
[00:12] Câu hát đầu tiên
[00:19] Câu hát tiếp theo
```

- Bài chưa có lời hiện gợi ý “Chưa có lời cho bài này…” thay vì lỗi.
- Không tải lời từ nền tảng và không hiển thị lời có bản quyền ngoài phần bạn tự nhập.

## 3. Điều khiển & phím tắt

| Thao tác | Cách dùng |
|---|---|
| Phát / tạm dừng | Nút ▶/⏸ hoặc `Space` (khi panel đang mở) |
| Bài trước / bài kế | Nút ⏮ ⏭ hoặc `←` / `→` |
| Đóng trình phát | `Esc` hoặc nút × |
| Bật / tắt shuffle | Nút shuffle; bài kế/trước chọn ngẫu nhiên bài khác trong Queue |
| Repeat | Nút repeat: tắt → lặp toàn bộ → lặp một bài |
| Thêm vào Queue | Nút **+** trên mục trong Thư viện |
| Xoá khỏi Queue | Nút × trên mục Queue |
| Xoá toàn bộ Queue | Nút **Xoá queue** ở chân panel |
| Thêm bài / Sửa lời | Hai nút tương ứng ở chân panel |
| Đồng bộ thư viện | Nút **Đồng bộ** (khi đã nhận diện học sinh) |
| Đổi vị trí panel | Kéo thanh tiêu đề |
| Đổi kích thước | Kéo góc dưới-phải |
| Thu nhỏ / phóng to | Nút — và ⛶ trên thanh tiêu đề |
| Đặt lại bố cục | Nhấp đúp thanh tiêu đề |

Phím tắt **chỉ hoạt động khi panel nhạc đang mở** và tự bỏ qua khi đang gõ trong
`input`, `textarea`, `select` hoặc vùng `contenteditable`.

## 4. Phát nhạc

- Mỗi bài phát trong `<iframe>` chính thức của nền tảng, dựng khi bấm phát.
- YouTube và SoundCloud nhận lệnh play/pause qua `postMessage`; Spotify do chính
  khung nhúng của Spotify điều khiển.
- Khi chuyển bài, khung nhúng cũ được thay bằng khung mới; không có hai nguồn phát
  cùng lúc.
- Không autoplay sau khi mở trang. Bài đang chọn chỉ phát khi người dùng bấm.
- Trình duyệt có thể chặn phát tự động sau thao tác chuyển bài; bấm ▶ để tiếp tục.

## 5. Bố cục & dữ liệu lưu

| Key | Nội dung |
|---|---|
| `bakhiMusic.v3` | Thư viện bài hát, tên/nghệ sĩ/lời, Queue, vị trí bài, shuffle, repeat |
| `bakhiMusic.panel.v1` | Vị trí/kích thước panel, trạng thái thu nhỏ/phóng to, tab đang mở |
| `bakhiMusic.fab.v1` | Vị trí logo ♪ |

- Màn hình hẹp (≤ 640px): panel là bảng rộng hết chiều ngang ở đáy; hình học tự đặt
  tạm thời được bỏ qua; tay chạm lớn hơn cho các nút.
- Dữ liệu cũ `bakhiMusic.v2` và `bakhiMusic.lyrics.v1` **không bị xoá**; trình phát
  7.0 không đọc hai khoá này nhưng để nguyên để không mất dữ liệu của người dùng cũ.

## 6. Đồng bộ theo học sinh

- Local-first: mọi thao tác ghi vào `bakhiMusic.v3` trước, giao diện không chờ mạng.
- Khi đã nhận diện học sinh và có `BKCloud.chatClient()`, thư viện được đối chiếu với
  bảng `music_tracks` của chính học sinh (RLS + `bakhi_current_student_id()`).
- Thêm/sửa/xoá được đẩy lên máy chủ sau ~1,2 giây; nút **Đồng bộ** tải lại thủ công.
- Dòng trạng thái dưới panel cho biết: chưa nhận diện, đang tải, đã đồng bộ hoặc chỉ
  lưu trên thiết bị khi mất mạng.
- Thư viện trống **không** xoá hàng trên máy chủ, tránh mất dữ liệu khi đăng nhập nhầm
  thiết bị.

## 7. Trợ năng

- Nút có `aria-label`, trạng thái `aria-pressed` (shuffle/repeat/thu nhỏ/phóng to).
- Tab theo chuẩn `tablist`/`tabpanel` với `aria-selected` và `aria-controls`.
- Vùng `aria-live="polite"` đọc tên bài, trạng thái phát và thay đổi bố cục.
- Mọi điều khiển có viền tiêu điểm rõ ràng; tôn trọng `prefers-reduced-motion`
  (tắt chuyển động bìa, nhấp nháy, chuyển tab).

## 8. Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Không thêm được bài | Liên kết phải là https và thuộc YouTube/Spotify/SoundCloud chính thức |
| Khung nhúng trắng | Mạng chặn iframe hoặc video bị hạn chế nhúng; mở liên kết gốc để kiểm tra |
| Không phát tiếng | Bấm ▶ trong khung nhúng; một số video YouTube yêu cầu thao tác trực tiếp |
| Lời không hiện | Bài chưa có lời; bấm **Sửa lời** để nhập |
| Thư viện không đồng bộ | Kiểm tra đã nhận diện học sinh, mạng, và dòng trạng thái dưới panel |
| Mất thư viện trên thiết bị mới | Bấm **Đồng bộ** sau khi nhận diện đúng hồ sơ |
| Panel nằm ngoài màn hình | Nhấp đúp thanh tiêu đề, hoặc xoá `bakhiMusic.panel.v1` |
| Logo ♪ mất | Chuột phải vào logo, hoặc xoá `bakhiMusic.fab.v1` |
| Phím `Space` không tác dụng | Panel phải đang mở và không đứng trong ô nhập |

Kiểm tra tự động: `NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js` (nhóm `[1b]`).
Trên Windows, đặt `$env:NODE_PATH` tới thư mục `node_modules` của jsdom.

## 9. Tích hợp với phần còn lại

- **Thành tích**: mỗi lượt phát thật ghi tín hiệu `music.plays` vào `bakhiSignals.v1`;
  Trung tâm học tập dùng số đếm cho nhóm **Khám phá**, không lưu tên bài.
- **Developer Playground**: tab **Music** đọc trạng thái qua `BKMusic.on(fn)`, hiển thị
  nền tảng/liên kết nguồn và có nút mở, phóng to, thu nhỏ, đặt lại bố cục.
- **Trang chủ & trang bài học**: `bk-core.js` nạp `bk-music.js` một lần cho mỗi trang,
  nên trình phát tồn tại xuyên suốt nhưng không chồng nguồn phát.
- **Thông báo**: chuông thông báo là phần tử riêng, không che logo ♪.
- **Focus mode**: panel nhạc vẫn dùng được; không tự phát, không tự đóng.

## 10. Câu hỏi thường gặp

**Tôi có thể thêm nhiều bài cùng lúc không?**
Có; mỗi liên kết là một bài, tối đa 200 bài.

**Có cần cài thư viện ngoài không?**
Không. Chỉ DOM thuần và iframe chính thức của nền tảng.

**Nhạc có được tải lên máy chủ không?**
Không. Máy chủ chỉ lưu liên kết, tên, nghệ sĩ và lời do bạn nhập.

**Vì sao mở trang mới thì nhạc dừng?**
Mỗi trang là một tài liệu riêng (điều hướng tĩnh), nên khung nhúng được tạo lại. Đây là
giới hạn của website không SPA, không phải lỗi.

**Làm sao xoá lịch sử nghe?**
Xoá `bakhiMusic.v3` trong Local Storage; không ảnh hưởng dữ liệu học tập. Thao tác này
chỉ xoá trên thiết bị hiện tại.

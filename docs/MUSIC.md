# 🎧 Music Player dùng chung

Trình phát nhạc chạy trên **mọi trang** của Bá Khí (do `bk-core.js` nạp `bk-music.js`).
Từ 7.1.0, đây là **trình phát theo tệp**: nhạc nằm trong thư mục `music/`, tự phát
hiện bài mới, không cần sửa mã và không cần build.

- Mã nguồn: `assets/bakhi/bk-music.js` · giao diện: `assets/bakhi/bk-music.css`
- Logo ♪ ở góc trái dưới, kéo thả tự do; chuột phải để đặt lại vị trí logo.
- Panel nhớ vị trí, kích thước, trạng thái thu nhỏ/phóng to và tab đang mở.
- Không tự phát khi mở trang, không tải nhạc lên máy chủ.

## 1. Thư viện nhạc

Thư viện gốc gồm 5 bài trong `music/`:

| Bài | Nghệ sĩ |
|---|---|
| Giá như | xoxad |
| Có lẽ anh | fishy |
| Xương rồng (intro) | dangrangto |
| Dự báo thời tiết hôm nay mưa | GREY D |
| homesick | wave to earth |

Quy ước tệp — chỉ cần bỏ tệp vào `music/`, không sửa code:

```text
music/<slug>.mp3   bài hát (bắt buộc)
music/<slug>.txt   lời bài hát (tùy chọn, hỗ trợ [mm:ss] đầu dòng)
music/<slug>.png   ảnh bìa (hoặc .jpg / .jpeg / .webp)
```

`<slug>` chỉ gồm chữ, số, dấu chấm, gạch ngang và gạch dưới
(`/^[a-z0-9][a-z0-9._-]{0,80}$/i`). Đường dẫn phát luôn được ghép trong mã
(`music/<slug>.mp3`) nên manifest không thể trỏ ra ngoài thư mục nhạc.

## 2. Tự phát hiện bài mới

1. Chép tệp `.mp3` (kèm `.txt`/`.png` nếu có) vào `music/`.
2. Chạy `node tools/music-scan.js` để sinh lại `music/library.json`.
3. Commit cả tệp nhạc và manifest.

Workflow `.github/workflows/music-library.yml` cũng chạy bước quét khi `music/`
thay đổi trên `main`, nên chỉ cần tải tệp lên là đủ.

Khi mở trang, trình phát tải `music/library.json` và **gộp** vào thư viện:

- Bài chưa từng thấy trên trình duyệt này được thêm một lần vào cuối Queue.
- Bài người dùng đã xoá khỏi Queue **không tự quay lại** (theo dõi qua `state.seen`).
- Manifest lỗi/404 không ảnh hưởng 5 bài gốc; chỉ ghi trạng thái `missing`.
- Gọi `BKMusic.refreshLibrary()` để quét lại thủ công; `BKMusic.libraryState()`
  trả `idle` / `loading` / `ok` / `missing` / `unsupported`.

## 3. Lời bài hát

- Ưu tiên tệp `music/<slug>.txt` cùng tên bài.
- Người dùng có thể bổ sung/sửa lời tại chỗ; lời tự nhập lưu theo từng bài trong
  `bakhiMusic.lyrics.v1` (tối đa 20.000 ký tự).
- Mỗi dòng là một câu. Dòng bắt đầu bằng `[mm:ss]` được hiển thị kèm mốc thời gian:

```text
[00:12] Câu hát đầu tiên
[00:19] Câu hát tiếp theo
```

- Bài chưa có lời hiện gợi ý “Chưa có lời cho bài này…” thay vì lỗi.

## 4. Điều khiển & phím tắt

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
| Sửa lời | Nút **Sửa lời** cho bài đang chọn |
| Quét lại thư viện | Gọi `BKMusic.refreshLibrary()` trong console khi cần |
| Đổi vị trí panel | Kéo thanh tiêu đề |
| Đổi kích thước | Kéo góc dưới-phải |
| Thu nhỏ / phóng to | Nút — và ⛶ trên thanh tiêu đề |
| Đặt lại bố cục | Nhấp đúp thanh tiêu đề |

Phím tắt **chỉ hoạt động khi panel nhạc đang mở** và tự bỏ qua khi đang gõ trong
`input`, `textarea`, `select` hoặc vùng `contenteditable`.

## 5. Phát nhạc

- Một `HTMLAudioElement` duy nhất trong closure; mỗi trang chỉ có một trình phát.
- Bài đang chọn chỉ phát khi người dùng bấm; không autoplay sau khi mở trang.
- Chuyển bài thay `src` của cùng một audio, không tạo hai nguồn phát.
- Lỗi tệp hoặc lỗi mạng hiện thông báo trong panel, không làm hỏng giao diện.

## 6. Bố cục & dữ liệu lưu

| Key | Nội dung |
|---|---|
| `bakhiMusic.v2` | Thư viện/Queue, vị trí bài, thời gian, shuffle, repeat, volume, `seen` |
| `bakhiMusic.panel.v1` | Vị trí/kích thước panel, trạng thái thu nhỏ/phóng to, tab đang mở |
| `bakhiMusic.fab.v1` | Vị trí logo ♪ |
| `bakhiMusic.lyrics.v1` | Lời do người dùng tự nhập, theo từng bài |

- Màn hình hẹp (≤ 640px): panel là bảng rộng hết chiều ngang ở đáy; hình học tự đặt
  tạm thời được bỏ qua; tay chạm lớn hơn cho các nút.
- Dữ liệu cũ `bakhiMusic.v3` **không bị xoá**; trình phát 7.1 không đọc khoá này
  nhưng để nguyên để không mất dữ liệu của người dùng cũ.
- `state.seen` giữ id các bài đã từng xuất hiện để bài mới chỉ được thêm một lần.

## 7. Trợ năng

- Nút có `aria-label`, trạng thái `aria-pressed` (shuffle/repeat/thu nhỏ/phóng to).
- Tab theo chuẩn `tablist`/`tabpanel` với `aria-selected` và `aria-controls`.
- Vùng `aria-live="polite"` đọc tên bài, trạng thái phát và thay đổi bố cục.
- Mọi điều khiển có viền tiêu điểm rõ ràng; tôn trọng `prefers-reduced-motion`
  (tắt chuyển động bìa, nhấp nháy, chuyển tab).

## 8. Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Bài mới không xuất hiện | Đã chạy `node tools/music-scan.js` và commit `music/library.json` chưa? |
| Bài mới không phát | Tên tệp đúng `<slug>.mp3`, không dấu cách/ký tự lạ |
| Bài cũ tự quay lại | Chỉ xảy ra khi xoá `bakhiMusic.v2`; `state.seen` bị mất |
| Không phát tiếng | Bấm ▶; kiểm tra âm lượng tab/hệ thống và định dạng tệp |
| Lời không hiện | Chưa có `music/<slug>.txt`; bấm **Sửa lời** để nhập |
| Panel nằm ngoài màn hình | Nhấp đúp thanh tiêu đề, hoặc xoá `bakhiMusic.panel.v1` |
| Logo ♪ mất | Chuột phải vào logo, hoặc xoá `bakhiMusic.fab.v1` |
| Phím `Space` không tác dụng | Panel phải đang mở và không đứng trong ô nhập |

Kiểm tra tự động:

```bash
node tools/music-scan.js --check
NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js   # nhóm [1b]
```

Trên Windows, đặt `$env:NODE_PATH` tới thư mục `node_modules` của jsdom.

## 9. Tích hợp với phần còn lại

- **Thành tích**: mỗi lượt phát thật ghi tín hiệu `music.plays` vào `bakhiSignals.v1`;
  Trung tâm học tập dùng số đếm cho nhóm **Khám phá**, không lưu tên bài.
- **Developer Playground**: tab **Music** đọc trạng thái qua `BKMusic.on(fn)` và có nút
  mở, phóng to, thu nhỏ, đặt lại bố cục.
- **Trang chủ & trang bài học**: `bk-core.js` nạp `bk-music.js` một lần cho mỗi trang,
  nên trình phát tồn tại xuyên suốt nhưng không chồng nguồn phát.
- **Thông báo**: chuông thông báo là phần tử riêng, không che logo ♪.
- **Report Issue (8.0.1)**: nút **Báo cáo** nằm ngay trên chuông thông báo ở góc phải dưới,
  kéo được và là phần tử độc lập với logo ♪ (bên trái); báo cáo gửi từ bất kỳ trang nào cũng
  vào cùng một hệ thống.
- **Focus mode**: panel nhạc vẫn dùng được; không tự phát, không tự đóng.

## 10. Câu hỏi thường gặp

**Tôi có thể thêm nhiều bài cùng lúc không?**
Có; chép nhiều tệp vào `music/` rồi chạy lại `node tools/music-scan.js`.

**Có cần cài thư viện ngoài không?**
Không. Chỉ DOM thuần, `HTMLAudioElement` và một manifest JSON tĩnh.

**Nhạc có được tải lên máy chủ không?**
Không. Tệp nằm trong repository và được GitHub Pages phục vụ như tài nguyên tĩnh.

**Vì sao mở trang mới thì nhạc dừng?**
Mỗi trang là một tài liệu riêng (điều hướng tĩnh), nên audio được tạo lại. Đây là
giới hạn của website không SPA, không phải lỗi.

**Làm sao xoá lịch sử nghe?**
Xoá `bakhiMusic.v2` và `bakhiMusic.lyrics.v1` trong Local Storage; không ảnh hưởng
dữ liệu học tập và chỉ xoá trên thiết bị hiện tại.

# PWA, tìm kiếm toàn site và sức khoẻ tiến trình (8.4.4)

Ba phần này độc lập với giao diện, không đụng nội dung giáo dục và không thêm dependency.

## 1. PWA — dùng được khi mạng yếu

| Tệp | Vai trò |
|---|---|
| `sw.js` (gốc repo) | Service worker: HTML network-first, tài nguyên `assets/bakhi/` cache-first |
| `assets/bakhi/manifest.webmanifest` | Tên, icon 192/512, `display: standalone`, `start_url: ../../` |
| `tools/inject-pwa.js` | Chèn `<link rel="manifest">` + `theme-color` vào mọi trang (idempotent) |
| `assets/bakhi/bk-core.js` | Đăng ký `sw.js` trên HTTPS sau khi trang tải xong (kèm `?v=<phiên bản>`) |

Quy tắc an toàn:

- **Không cache dữ liệu người học.** Mọi request tới `/rest/v1/`, `/auth/v1/`,
  `/storage/v1/`, `/functions/v1/` đi thẳng ra mạng; service worker bỏ qua.
- **Không phục vụ JS/CSS cũ.** Tài nguyên `assets/bakhi/` chỉ được cache theo URL có
  `?v=<phiên bản>`, nên bản mới là URL mới; cache của bản cũ bị xoá khi worker mới kích hoạt.
- **HTML luôn ưu tiên bản mới.** Chỉ khi `fetch` lỗi mới dùng bản đã lưu, sau đó là trang
  thông báo mất mạng.
- **Hai trang bị bỏ qua:** `ktgk1/anh/anh1.html` và `ktgk1/anh/indexanh.html` có `<head>`
  nằm giữa dòng; chèn manifest sẽ làm dòng đổi cấu trúc và `content-integrity` coi là sửa
  nội dung giáo dục. PWA vẫn hoạt động vì service worker đăng ký từ các trang khác trong
  cùng phạm vi site.

Kiểm tra: build không cần bước nào; sau khi deploy mở DevTools → Application → Service
Workers để thấy worker ở phạm vi `/bakhi/`.

## 2. Tìm kiếm toàn site

- `tools/build-search-index.js` quét 115 trang môn học, lấy `<title>`, `<h1>`, môn, đợt và
  tên tệp → `assets/bakhi/search-index.js` (`window.BK_LESSON_INDEX`). Tệp này là JS tĩnh
  (không phải JSON tải bằng fetch) để chạy được cả khi mở bằng `file://`.
- `bk-core.js` tải chỉ mục muộn (`requestIdleCallback`, dự phòng 1,5 giây) hoặc ngay khi
  học sinh bắt đầu tìm kiếm, rồi gộp vào `BK.search.lessons()` với đường dẫn tính từ
  `basePath()`. Bỏ qua mục trùng với trang đang mở.
- Sau khi thêm/đổi tiêu đề trang bài học: `node tools/build-search-index.js`.
  Cổng `--check` báo lệch nếu quên sinh lại.

## 3. Sức khoẻ tiến trình

`bk_gam_health_drift()` trả về các hồ sơ có `total_xp`/`level` lệch so với sổ XP và công
thức `bk_gam_level()`. Chỉ service_role gọi được.

```bash
node tools/qa/gamification-health.js          # bất biến tĩnh, không cần mạng
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=... \
  node tools/qa/gamification-health.js        # + truy vấn trực tiếp project
```

Token **không** được đặt trong repo; truyền qua biến môi trường của phiên làm việc.

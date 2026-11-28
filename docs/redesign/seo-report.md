# SEO report — Bá Khí

Ngày 27/11/2026. Phạm vi: SEO kỹ thuật + on-page cho **bề mặt công khai**. Không làm link building,
local SEO, hreflang (một ngôn ngữ), ecommerce, programmatic SEO, GEO/AI-citation.

## 1. Bề mặt công khai (S0)

| URL | Công khai? | Index được? |
|---|---|---|
| `/bakhi/` (trang chủ) | có | có, nhưng bị modal nhận diện chặn nội dung |
| `/bakhi/legal/`, `/terms.html`, `/privacy.html` | có | có |
| `/bakhi/404.html` | có | `noindex, follow` (thêm phiên này) |
| 125 trang bài học | có (không cần đăng nhập) | có |
| `chat/`, `ai-tutor/`, `profile/`, `settings/`, `gamification/`, `skills/`, `studio/` | có đường dẫn, nội dung do JS dựng sau đăng nhập | crawler thấy khung rỗng |
| `founder/`, `admin/` | có đường dẫn | `noindex, nofollow` (đã có sẵn) |

Routing là đa trang thật dưới base `/bakhi/`, nên mỗi bài học là một URL riêng — điểm tốt sẵn có.

## 2. Hiện trạng trước/sau

| Hạng mục | Trước | Sau | Đánh giá |
|---|---|---|---|
| `<html lang="vi">` | có (bài học, app) | giữ nguyên; `404.html` có | giữ |
| `<title>` riêng mỗi trang | có | giữ; `404.html` có title riêng | giữ |
| `<meta name="description">` | có ở trang app + pháp lý; **không có ở 125 trang bài học** | giữ nguyên (không sửa nội dung bài học) | **khoảng trống sẵn có** |
| `rel="canonical"` | 1 tệp | giữ nguyên | **khoảng trống sẵn có** |
| `robots.txt` / `sitemap.xml` | không có | không thêm | xem mục 3 |
| JSON-LD | không có | không thêm | cố ý: không có dữ liệu tổ chức đáng tin |
| Ảnh có `alt` | phần lớn có | không đổi | chưa rà toàn bộ |
| `404.html` | không tồn tại | **có**, `noindex, follow`, có link về trang chủ + pháp lý | cải thiện |
| `h1` mỗi trang | 1 (bài học, app) | giữ; 404 có đúng 1 | giữ |
| Link điều hướng | `<a href>` thật trong rail/tab bar/footer mới | giữ | giữ |

## 3. Vì sao không thêm `robots.txt` / `sitemap.xml`

Repo được phục vụ tại `https://minhtruk.github.io/bakhi/`. Crawler chỉ đọc `robots.txt` ở
**gốc tên miền** (`minhtruk.github.io/robots.txt`), không phải `/bakhi/robots.txt`. Tệp đặt trong
repo này sẽ không được đọc. Cách đúng cần quyền với repo gốc tên miền hoặc custom domain — nằm
ngoài phạm vi và không có quyền. **Không tạo tệp để trông như đã làm SEO.**

`404.html` trên GitHub Pages: máy chủ trả về nội dung của tệp này nhưng **HTTP status vẫn là 200**
với một số cấu hình; nghĩa là trang lỗi có thể bị index nếu không có `noindex` — đã đặt
`noindex, follow` để chặn. Đây là giới hạn của host, không phải của trang.

## 4. Việc đã làm trong phiên này (S2)

- Thêm `404.html`: `lang="vi"`, title/description riêng, `noindex, follow`, một `h1`, link thật,
  footer pháp lý (do shell chèn).
- Giữ nguyên title/description hiện có; **không** viết lại copy SEO của bất kỳ trang nào.
- Trang pháp lý đã có title/description riêng từ phiên trước (`v855-ui`, `v856-ui` PASS).

## 5. Not checked

- Không chạy `/seo page|technical|schema|images|sitemap` (không có CLI đó trong môi trường này).
- Không có Google Search Console / dữ liệu trường.
- Không so sánh drift với `LIVE_URL`: bản redesign **chưa deploy**, nên “drift compare passed”
  là câu không thể nói. Bảng trên là so sánh mã nguồn, không phải so sánh với bản live.
- Không đo Core Web Vitals (xem `perf-report.md`).

## 6. Owner decisions (cần chủ dự án quyết)

1. Có muốn thêm `noindex` cho 125 trang bài học (giữ kín nội dung) hay để index?
2. Có thêm `robots.txt`/`sitemap.xml` ở gốc tên miền không (cần quyền ngoài repo)?
3. Có thêm `meta description` cho 125 trang bài học không? Việc này sửa `<head>` từng tệp và
   **không** ảnh hưởng hash nội dung (hash bỏ dòng có `assets/bakhi/`), nhưng là 125 lần sửa.
4. Có thêm `WebSite` JSON-LD tối giản không? Hiện không có dữ liệu tổ chức đáng tin để khai báo.

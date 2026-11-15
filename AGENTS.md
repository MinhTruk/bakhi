# AGENTS.md — Bá Khí

Hướng dẫn cho agent/developer làm việc trong repository này. Đọc hết trước khi sửa mã.

## 0. Bối cảnh nhanh

- Website tĩnh cho học sinh ôn tập: HTML/CSS/JS thuần, deploy GitHub Pages, **không build**.
- 119 tệp HTML: 1 trang chủ, 1 trang quản trị, 116 trang môn/bài học/Studio và 1 tệp rỗng.
- Toàn bộ nội dung giáo dục nằm trong chính các tệp HTML; lớp nâng cấp chỉ chèn thêm thẻ script.
- Supabase là **tuỳ chọn**: nhận diện học sinh, đồng bộ tiến trình, thông báo realtime.
- Hai chế độ thông báo: đầy đủ (trang chủ) và chỉ thông báo (trang bài học, Studio).

## 1. Nguyên tắc bất di bất dịch

1. **Bảo toàn nội dung giáo dục tuyệt đối.** Không sửa câu hỏi, phương án, đáp án,
   giải thích, công thức, số liệu, cấu trúc môn học. Giao diện được phép thay đổi;
   nội dung thì không.
2. **Không phải nền tảng thi cử.** Không thêm và không giữ bất kỳ: đề thi thử, bài
   kiểm tra tính giờ, đồng hồ đếm ngược, giới hạn thời gian, tự nộp bài, xếp hạng thi.
   Mọi tính năng phải khuyến khích học tập tự nhịp.
3. Nếu phát hiện trang cũ có cơ chế tính giờ/thi cử, **báo cáo trước**, không tự xoá
   hay viết lại nếu chưa được cho phép.
4. Không đưa API key, service-role key hay token vào mã nguồn, tệp tĩnh hay chat.
5. Không đổi tên/gộp thư mục môn học hoặc đợt kiểm tra — đó là đường dẫn công khai.

## 2. Kiến trúc hiện tại

```
/                      index.html (trung tâm) + bakhi-v4.js (lớp V4 cũ)
/admin                 admin/index.html — Administrator Dashboard (Administrator Code)
/assets/bakhi/         Lớp nâng cấp dùng chung
  bk-core.js|css       Kho dữ liệu local-first, UI kit, tìm kiếm, adapter AI/Supabase
  bk-learn.js|css      Trung tâm học tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích
  bk-dev.js|css        Developer Playground 2.0 (11 công cụ, tab Music)
  bk-music.js|css      Music Player dùng chung (queue, shuffle, repeat, lyrics)
  bk-cloud.js|css      Nhận diện, thông báo realtime, changelog, đồng bộ (Supabase)
  bk-devboard.js       Administrator Dashboard 9 mô-đun
  bk-admin-dashboard.css  Giao diện dashboard 4.1
  bk-admin.css|bk-admin-theme.js  Trang đăng nhập quản trị + theme
  bk-supabase.config.js  Nơi duy nhất chứa URL + publishable key
  bk-notify.js|css     Chuông CHANGELOG.md cũ (chỉ nạp ở index.html, dự phòng)
  favicon.svg|*.png|.ico  Favicon tĩnh dùng chung (không dùng GIF)
  bk-bkt.js            Hiệu ứng chuyển trang "bàn tay kéo"
  bk-page.js           Cầu nối cho trang bài học
/ktgk1, /ktgk2, /ktck1, /ktck2, /kttx   Nội dung giáo dục (HTML tĩnh)
/music                 music/<slug>.mp3|txt|png
/studio                index.html (bản rút gọn) + word-paint.html (Word & Paint)
/supabase/             migrations/ (schema + RLS + realtime) + functions/ (7 Edge Function)
/.github/workflows/    changelog-sync.yml (CHANGELOG.md → Supabase)
/tools                 content-integrity, integrate-pages, inject-favicon, make-favicon, qa/smoke, qa/cloud-smoke
/docs                  Kiến trúc, tính năng, Music, Studio, Supabase, baseline nội dung
```

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 3. Quy trình làm việc

```bash
# 1. Kiểm tra toàn vẹn nội dung (bắt buộc trước và sau khi sửa)
node tools/content-integrity.js verify

# 2. Kiểm tra cú pháp JS dùng chung
node --check assets/bakhi/bk-core.js
node --check assets/bakhi/bk-cloud.js
node --check assets/bakhi/bk-devboard.js

# 3. Smoke test DOM (cần jsdom, cài ngoài repo)
npm install jsdom --prefix /tmp/bktest --no-save
NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js
NODE_PATH=/tmp/bktest/node_modules node tools/qa/cloud-smoke.js

# 4. Chèn thẻ script vào các trang mới (idempotent)
node tools/integrate-pages.js
```

Trên Windows, dùng một thư mục tạm như `%TEMP%\bktest` và đặt `$env:NODE_PATH`.

- Không có bước build. Website là HTML/CSS/JS tĩnh, deploy GitHub Pages.
- Khi thêm trang HTML mới trong thư mục nội dung: chạy `node tools/integrate-pages.js`
  để chèn thẻ script, sau đó chạy lại kiểm tra toàn vẹn.
- Nếu baseline nội dung chưa tồn tại: `node tools/content-integrity.js baseline`
  **trước khi** sửa bất kỳ nội dung nào.
- `integrate-pages.js` chỉ chèn thẻ script; các trang Studio không có `bk-core.js` cần
  thêm thủ công hai dòng `bk-supabase.config.js` + `bk-cloud.js` (xem mục 4).


## 4. Quy ước mã nguồn

- ES5-ish + DOM API thuần, không framework, không bundler, không thêm dependency
  runtime. Không dùng `innerHTML` với dữ liệu người dùng chưa escape; ưu tiên
  `textContent` và `BK.ui.el`.
- Mọi phím tắt mới phải bỏ qua khi đang gõ trong `input/textarea/select/contenteditable`
  và không chiếm phím trình duyệt (trừ Ctrl/⌘+K đã được thiết kế).
- Mọi dữ liệu người dùng đi qua `BK.store` (một key duy nhất `bakhiLearn.v1`,
  có `v` phiên bản + validate + phục hồi khi hỏng).
- Không xoá key localStorage cũ: `theme`, `fxCfg`, `uiCfg`, `favCfg`, `bktCfg`,
  `appHighlightsDataMap`, `bakhiBackups`, `bakhi_ly11_progress`,
  `bakhi_toan11_checklist`, `devToken`, `bakhiSchema`…
- CSS mới đặt trong `assets/bakhi/*.css`, tiền tố `.bk-` (lớp học tập) hoặc
  `.bkdev-` (playground) để tránh xung đột Tailwind hiện có.
- Developer Playground cũ (`index.html`, các hàm `DX`, tab `insp/perf/studio/bk`)
  **phải được giữ nguyên hoạt động**. Lớp mới chỉ bổ sung, không thay thế.

### 4.1. Thông báo toàn website

- `bk-cloud.js` có hai chế độ:
  - **Đầy đủ** (trang chủ): màn hình nhận diện, đồng bộ tiến trình, chuông trên header.
  - **Chỉ thông báo**: bật bằng `data-bk-notify-only="1"` trên thẻ script; chỉ chuông,
    realtime, bảng thông báo và trạng thái đã đọc cục bộ.
- **What's New là tuỳ chọn**: chỉ trang có `data-bk-whatsnew="1"` (hiện là `index.html`)
  mới dựng khối “Cập nhật gần đây”. Studio và Word & Paint **không** được bật cờ này;
  không dùng CSS để che khối.
- Khi thêm trang mới, dùng đúng mẫu (giữ `defer` và thứ tự config → cloud):

```html
<script src="../../assets/bakhi/bk-supabase.config.js?v=4.0.0" defer></script>
<script src="../../assets/bakhi/bk-cloud.js?v=4.1.0" data-bk-notify-only="1" defer></script>
```

- Chỉ nạp `bk-cloud.js` **một lần** trên mỗi trang. Ở chế độ đầy đủ, không thêm
  `data-bk-notify-only`.
- Không đặt chuông/thông báo trong iframe nội dung; dùng chuông nổi của `bk-cloud`.
- Trạng thái đã đọc cục bộ ở `bakhiNotifyReads.v1`; không xoá key này khi nâng cấp.
- Giao diện thông báo dùng bộ biến `--bkc-n-*` và lớp `.bkc-dark`; trang mới không tự đặt
  thẻ trắng trong luồng thông báo.
- **Favicon tĩnh**: chạy `node tools/inject-favicon.js` sau khi thêm trang HTML. Tool chèn
  link SVG/PNG/ICO/apple-touch-icon với đường dẫn tương đối đúng; không dùng GIF.

### 4.2. Bảng lưu trữ

| Key | Ghi chú |
|---|---|
| `bakhiLearn.v1` | Nguồn sự thật duy nhất của dữ liệu học tập |
| `bakhiSignals.v1` | Chỉ số đếm cho thành tích |
| `bakhiNotifyReads.v1` | Đã đọc ở chế độ chỉ thông báo |
| `bakhiStudio.v1` | Tài liệu Studio |
| `bakhiMusic.v2`, `.panel.v1`, `.fab.v1` | Trạng thái trình phát nhạc |
| `bakhiStudent.v1`, `bakhiAdmin.v1` | Hồ sơ học sinh / phiên quản trị (sessionStorage) |

### 4.3. Quy ước tài liệu & phát hành

- Mọi thay đổi hành vi phải có mục trong `CHANGELOG.md`, theo nhóm
  **Tính năng / Sửa lỗi / Cải tiến**, ghi ngày và số phiên bản mới.
- Sau khi push `CHANGELOG.md` lên `main`, workflow `.github/workflows/changelog-sync.yml`
  tự đồng bộ lên Supabase. Không sửa tay bảng `changelog` cho nội dung đã có trong tệp;
  không tạo announcement trùng. Kiểm tra trạng thái ở tab **Giám sát** của dashboard.
- Khi đổi API/cấu trúc dữ liệu, cập nhật đồng thời `docs/ARCHITECTURE.md` và
  `docs/FEATURES.md`; khi đổi quy trình cài đặt, cập nhật `docs/SUPABASE_SETUP.md`.
- Commit message bằng tiếng Việt có dấu, ví dụ:
  `feat(3.3.0): đồng bộ changelog, 9 mô-đun quản trị và favicon tĩnh`.
- Trước khi push: chạy `content-integrity verify`, `node --check` cho các tệp JS đã sửa,
  hai smoke test, và mở thử trang chủ + một trang bài học + Studio + dashboard.

## 5. Những việc không được làm

- Sửa/xoá dòng nội dung trong các tệp HTML môn học (trừ thẻ script do tool chèn).
- Đổi tên hoặc gộp thư mục môn học/đợt kiểm tra (đường dẫn GitHub Pages).
- Thêm timer dưới mọi hình thức vào tính năng học tập.
- Ghi service-role key hoặc gọi Supabase bằng khoá bí mật từ trình duyệt.
- Force-push hoặc commit file `.env`, khoá API, `node_modules`.

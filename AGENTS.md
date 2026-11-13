# AGENTS.md — Bá Khí

Hướng dẫn cho agent/developer làm việc trong repository này.

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

## 2. Kiến trúc hiện tại

```
/                      index.html (trung tâm) + bakhi-v4.js (lớp V4 cũ)
/assets/bakhi/         Lớp nâng cấp 2.0 (mới)
  bk-core.js|css       Kho dữ liệu local-first, UI kit, tìm kiếm, adapter AI/Supabase
  bk-learn.js|css      Trung tâm học tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích
  bk-dev.js|css        Developer Playground 2.0 (11 công cụ, tab Music)
  bk-music.js|css      Music Player dùng chung (queue, shuffle, repeat, lyrics)
  music/<slug>.mp3|txt|png  Quy ước file nhạc: bài hát + lời + ảnh bìa
  bk-bkt.js            Hiệu ứng chuyển trang "bàn tay kéo" dùng chung
  bk-page.js           Cầu nối cho các trang bài học
/ktgk1, /kttx, /music  Nội dung giáo dục (HTML tĩnh, mỗi trang tự chứa)
/studio                Ứng dụng thiết kế poster độc lập (không can thiệp)
/tools                 Công cụ kiểm tra (không chạy trên production)
/docs                  Tài liệu kiến trúc, tính năng, Supabase, baseline nội dung
```

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 3. Quy trình làm việc

```bash
# 1. Kiểm tra toàn vẹn nội dung (bắt buộc trước và sau khi sửa)
node tools/content-integrity.js verify

# 2. Kiểm tra cú pháp JS
node --check assets/bakhi/bk-core.js
node --check assets/bakhi/bk-learn.js
node --check assets/bakhi/bk-dev.js
node --check assets/bakhi/bk-page.js

# 3. Smoke test DOM (cần jsdom, cài ngoài repo)
npm install jsdom --prefix /tmp/bktest --no-save
NODE_PATH=/tmp/bktest/node_modules node tools/qa/smoke.js

# 4. Chèn thẻ script vào các trang mới (idempotent)
node tools/integrate-pages.js
```

- Không có bước build. Website là HTML/CSS/JS tĩnh, deploy GitHub Pages.
- Khi thêm trang HTML mới trong thư mục nội dung: chạy `node tools/integrate-pages.js`
  để chèn thẻ script, sau đó chạy lại kiểm tra toàn vẹn.
- Nếu baseline nội dung chưa tồn tại: `node tools/content-integrity.js baseline`
  **trước khi** sửa bất kỳ nội dung nào.

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

## 5. Những việc không được làm

- Sửa/xoá dòng nội dung trong các tệp HTML môn học (trừ thẻ script do tool chèn).
- Đổi tên hoặc gộp thư mục môn học/đợt kiểm tra (đường dẫn GitHub Pages).
- Thêm timer dưới mọi hình thức vào tính năng học tập.
- Ghi service-role key hoặc gọi Supabase bằng khoá bí mật từ trình duyệt.
- Force-push hoặc commit file `.env`, khoá API, `node_modules`.

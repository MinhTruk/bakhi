# Implementation plan — Quiet Graphite

Cập nhật 27/11/2026. Trạng thái ghi theo việc **đã kiểm chứng**, không theo việc đã viết mã.

| Pha | Việc | Tệp chạm | Kiểm chứng | Trạng thái |
|---|---|---|---|---|
| P0 | Audit, inventory, baseline hiệu năng, ảnh chụp, role matrix | `docs/redesign/00-repo-audit.md`, `01-inventory.md`, `perf-baseline.md`, `role-matrix.md`, `color-mapping.md`, `data-flow.md` | Đọc mã + đếm tệp; không đo runtime | **Xong** (runtime metrics: chưa) |
| P1 | Brainstorm, scope challenge, design doc, plan, builder check | `design-doc.md`, `plan.md` | Tự đọc lại như người xây mới; 8 quyết định ghi ở mục 6 | **Xong** |
| P2 | Token, theme boot, thang chữ, motion engine, component nền, cổng tương phản, gallery | `assets/bakhi/bk-rebirth.css`, `bk-rebirth.js`, `tools/qa/rebirth-contrast.js`, `docs/redesign/gallery.html` | `rebirth-contrast.js` 74 cặp / 0 fail; gallery mở được ở cả hai theme | **Xong** |
| P3 | Shell (rail/top bar/tab bar/sheet/footer/skip), Trang chủ | `bk-rebirth.js` (`buildRail`, `buildChrome`, `buildTabbar`, `buildSheet`, `buildFooter`), `index.html` | Trình duyệt thật 1280 + 375; không tràn ngang; footer có link pháp lý | **Xong** |
| P4 | Bài học: T2 | `bk-rebirth.css` mục 19 + 24, `bk-rebirth.js` (`mountReader`) | Đo 1600 px: mục lục 208 px, cách cột nội dung 72 px, 5 mục; thanh tiến độ có; body không tràn ngang | **Xong** (bố cục 3 cột đầy đủ: không — xem ghi chú) |
| P5 | Trợ lý AI: T5 | `bk-rebirth.css` mục 20 | Đo DOM 1440: cột hội thoại 760, trả lời serif 17 px/1,75, câu hỏi bong bóng phải | **Một phần** — luồng streaming thật chưa chạy |
| P6 | Chat: T3 | `bk-rebirth.css` mục 21 | Chỉ đọc CSS gốc + DOM lúc chưa đăng nhập; **không xem được màn hình chat thật** | **Một phần** — not tested |
| P7 | Hồ sơ, Tiến trình, Kỹ năng, Studio, Cài đặt, thông báo | `bk-rebirth.css` mục 12 + 22 | Cài đặt: đo 1440 → nav 240×292, nội dung 736; ảnh chụp có | **Xong cho Cài đặt**, phần khác re-skin |
| P8 | Founder, Admin | `bk-rebirth.css` mục 14 | Chỉ thấy cổng Founder Code; dashboard sau đăng nhập không mở được | **Một phần** — not tested |
| P9 | Pháp lý, 404, SEO build | `legal/*`, `404.html`, `bk-legal.js` | `404.html` render + footer + rail; `v855-ui`/`v856-ui`/`version-audit` PASS | **Xong** (SEO: xem `seo-report.md`) |
| P10 | Đánh bóng, a11y, hiệu năng, báo cáo, post-audit | mọi báo cáo trong `docs/redesign/` | `content-integrity verify` OK; `inject-rebirth --check` 0 cần cập nhật | **Xong phần đo được**; Lighthouse/axe: chưa |

## Ghi chú P4

Yêu cầu gốc của T2 là **ba cột**: cây 280 + cột đọc + TOC 240. Repo không có “cây” ở trang bài
học — cây nằm ở trang chủ và trang chỉ mục môn; mỗi bài học là một phiếu ôn tập có tab. Vì vậy
T2 được áp đúng phần còn thiếu và có nghĩa: **mục lục trong trang + tiến độ đọc + cột chữ**. Dựng
thêm một cây 280 px giả bên trái mỗi bài sẽ là bịa điều hướng không tồn tại (và phá hash nếu sửa
markup). Đã ghi vào `design-doc.md` mục 6.

## Thứ tự kiểm tra đã chạy

```
node tools/content-integrity.js verify     # OK, 125 tệp nội dung
node tools/inject-rebirth.js --check       # 130 tệp HTML · 0 cần cập nhật
node --check assets/bakhi/bk-rebirth.js    # cú pháp OK
node tools/qa/rebirth-contrast.js          # 74 cặp, 0 không đạt
node tools/qa/v855-ui.js                   # PASS
node tools/qa/v856-ui.js                   # PASS
node tools/qa/version-audit.js             # PASS
```

## Việc còn lại (theo thứ tự)

1. Kiểm thử Chat gửi/nhận/đã đọc bằng hai tài khoản thử trên môi trường staging.
2. Mở Founder dashboard bằng Founder Code thử, chụp 6 màn hình, sửa theo `critique-log.md`.
3. Chạy Playwright + axe ở 375/768/1024/1440/1920 × dark/light + `reducedMotion: reduce`.
4. Đo LCP/CLS/INP bằng Lighthouse trên bản deploy thử, đối chiếu `perf-baseline.md`.

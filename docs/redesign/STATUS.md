# Redesign status — Bá Khí “Quiet Graphite”

Cập nhật: 27/11/2026 (prompt v5) · Nhánh `redesign/bakhi-complete-rebirth`, tách từ `main` tại
`a2dd6c74`. Phiên bản ứng dụng **không đổi** (`8.8.0`, `CHANGELOG.md` không bị sửa).
**Trạng thái git: có thay đổi chưa commit** — chủ dự án yêu cầu chưa push/commit ở bước này.

## 1. Cách lớp mới hoạt động

- `tools/inject-rebirth.js` gắn `bk-rebirth.css` + `bk-rebirth.js` vào **cuối dòng cuối cùng đã có
  `assets/bakhi/`** trên mọi tệp HTML (130 tệp). Không thêm dòng mới để `tools/content-integrity.js`
  bỏ nguyên dòng khi băm → hash nội dung giáo dục không đổi.
- `bk-rebirth.js` dựng rail / top bar / bottom tab / sheet “Thêm” / footer / skip link, di chuyển
  avatar + chuông đang có vào top bar (không tạo bản sao), một MotionEngine duy nhất, và **mục lục
  bài học** (`mountReader`).
- Studio, Founder, Admin giữ chrome riêng: chỉ nhận token + typography.

## 2. Trạng thái theo pha (bản v5)

| Pha | Nội dung | Trạng thái | Bằng chứng |
|---|---|---|---|
| P0 | Audit, inventory, baseline, role matrix, data-flow | **Xong** | `00-repo-audit.md`, `01-inventory.md`, `audit.md`, `role-matrix.md`, `perf-baseline.md`, `color-mapping.md`, `data-flow.md` |
| P1 | Brainstorm, scope challenge, design doc, plan | **Xong** | `design-doc.md` (intent + 3 hướng + 8 quyết định), `plan.md` |
| P2 | Token, theme, thang chữ, motion, component nền, cổng tương phản, gallery | **Xong** | `design-system.md`, `rebirth-contrast.js` 74 cặp / 0 fail, `gallery.html` |
| P3 | Shell + Trang chủ | **Xong** | Trình duyệt thật 1280/375, không tràn ngang |
| P4 | Bài học (T2) | **Xong phần có nghĩa** | Mục lục “Trên trang” + thanh tiến độ + cột chữ + CSS in. *Không* dựng cây 280 px giả — xem `design-doc.md` mục 6 |
| P5 | Trợ lý AI (T5) | **CSS xong, luồng chưa test** | Đo DOM: cột 760, serif 17 px/1,75 |
| P6 | Chat (T3) | **CSS xong, chưa xem màn hình thật** | Cần đăng nhập |
| P7 | Hồ sơ, Tiến trình, Kỹ năng, Studio, Cài đặt | **Cài đặt xong (T4)**, phần khác re-skin | Ảnh chụp `screens/settings-t4-dark-1440.png` |
| P8 | Founder, Admin | **Một phần** | Chỉ thấy cổng Founder Code; dashboard cần mã |
| P9 | Pháp lý, 404, SEO build | **Xong** | `404.html` mới; `v855-ui`, `v856-ui`, `version-audit` PASS |
| P10 | Báo cáo, a11y, hiệu năng, post-audit | **Xong phần đo được** | `parity-report.md`, `perf-report.md`, `a11y-report.md`, `seo-report.md`, `critique-log.md`, `post-audit.md`, `lean-ledger.md`, `legal-open-items.md` |

## 3. Đã kiểm chứng trong phiên này

Chạy trên máy chủ tĩnh cục bộ **có header `Cache-Control: no-store`** (cổng 8124) để tránh đọc
bản JS/CSS cũ từ cache trình duyệt — lỗi đã gặp thật ở lần kiểm tra đầu.

| Kiểm tra | Kết quả |
|---|---|
| `node tools/content-integrity.js verify` | OK — 125 tệp nội dung gốc không đổi |
| `node tools/inject-rebirth.js --check` | 130 tệp HTML · 0 cần cập nhật |
| `node --check assets/bakhi/bk-rebirth.js` | cú pháp OK |
| `node tools/qa/rebirth-contrast.js` | 74 cặp · 0 không đạt |
| `node tools/qa/v855-ui.js`, `v856-ui.js`, `version-audit.js` | PASS |
| Bài học @1600×900 | Mục lục 208 px cách nội dung 72 px; 5 mục; thanh tiến độ có; `scrollWidth 1589 < 1600` |
| Cài đặt @1440×900 | `display:grid`, cột `240px / 736px`, nav cao 292 px, tab căn trái 40 px |
| 404 @1440 | `.bk-status-page` render, rail + footer + link pháp lý có mặt |
| Trợ lý AI @1440 | Trả lời: nền trong suốt, serif 17 px/1,75, cột 578 px; câu hỏi: bong bóng phải `rgb(255 182 193 / .12)` |
| Console | Chỉ cảnh báo Tailwind CDN có sẵn từ trước |

**Chưa kiểm:** Chat (cần đăng nhập), Trợ lý AI streaming thật, Studio, dashboard Founder/Admin,
axe-core, Lighthouse/Web Vitals, 320 px, zoom 200 %, trình đọc màn hình.

## 4. Git

- 4 commit trước đó trên nhánh: `763d7fb8`, `1e7a85a0`, `35a99785`, `d491628a`.
- Phiên này **không commit, không push** theo yêu cầu. Thay đổi đang nằm trong working tree:
  - `assets/bakhi/bk-rebirth.css` (+~470 dòng), `assets/bakhi/bk-rebirth.js` (+88 dòng)
  - `404.html` (mới)
  - `docs/redesign/*` (12 tài liệu mới/cập nhật) + 3 ảnh chụp
- Không xoá tệp nào. Không thêm dependency. Không sửa `CHANGELOG.md`, `.github/workflows/`,
  SQL, Edge Function hay cấu hình deploy.
- An toàn push: workflow chỉ chạy trên `main` (`changelog-sync.yml`, `music-library.yml`), không có
  workflow deploy nhánh. Vẫn **chưa push** vì chủ dự án chưa yêu cầu.

## 5. Xem trước

```
# tại thư mục repo
python -c "import http.server,functools as f;h=type('H',(http.server.SimpleHTTPRequestHandler,),{'end_headers':lambda s:(s.send_header('Cache-Control','no-store'),super(type(s),s).end_headers())[1]});http.server.ThreadingHTTPServer(('127.0.0.1',8124),f.partial(h,directory='.')).serve_forever()"
# rồi mở http://127.0.0.1:8124/index.html
```
Base path trong repo là tương đối (`../assets/…`), nên chạy ở gốc repo là đủ; bản deploy dùng
`/bakhi/` — không đổi gì.

## 6. Việc còn lại (theo thứ tự ưu tiên)

1. **Chat + Trợ lý AI + Hồ sơ**: kiểm thử end-to-end với tài khoản thử trên staging (gửi, nhận,
   đã đọc, streaming, lỗi mạng). Không dùng dữ liệu thật.
2. **Founder/Admin**: mở dashboard bằng Founder Code thử, chụp 6 màn hình, sửa theo `critique-log.md`.
3. **Playwright + axe**: 375/768/1024/1440/1920 × dark/light + `reducedMotion: reduce`.
4. **Lighthouse** trên bản deploy thử: LCP/CLS/INP, so với `perf-baseline.md`.
5. **320 px + zoom 200 %**: đo tràn ngang và touch target.
6. Quyết định của chủ dự án: 4 mục trong `seo-report.md` mục 6 và 10 mục trong `legal-open-items.md`.

## 7. Rủi ro phải biết

- **Chat/Trợ lý AI chưa được kiểm thử thật.** CSS đã đổi bố cục ba cột và cột hội thoại; nếu logic
  gốc dựa vào chiều rộng cố định thì có thể lệch. Rủi ro trung bình, cần bước 1 ở trên.
- **`!important` nhiều** trong lớp phủ: mọi tinh chỉnh sau này phải tăng specificity hoặc sửa CSS gốc.
- **Khoá cache `?v=8.8.0` viết tay**: sau khi phát hành, người dùng có thể còn bản cũ đến khi
  `VERSION` được đổi.
- **Tailwind CDN** vẫn là điểm yếu sẵn có của khu bài học (không phải do redesign).

## 8. Sửa rail và kiểm lớp phủ trên nhiều trang bài học (cùng phiên)

### Biểu tượng

- Bỏ phụ thuộc Font Awesome 6.4.0 (cdnjs) cho biểu tượng của shell: `bk-rebirth.js` có bảng SVG
  nội tuyến, cùng lưới 24, cùng nét 1.6, đầu nét tròn. Trước đây rail không có biểu tượng nào
  nếu CDN bị chặn, và mỗi glyph lại có chiều cao quang học khác nhau (đo được 22×16,8 px).
- Thay biểu tượng theo nghĩa, không theo mốt: la bàn (`fa-compass`) cho Trợ lý AI thay cho đũa
  phép + tia sáng, chìa khoá cho Founder thay cho vương miện, thanh trượt cho Cài đặt thay cho
  bánh răng, tài liệu cho Pháp lý thay cho cân công lý. Nhãn hiệu là monogram `BK`, không phải
  biểu tượng thư mục trên nền gradient.

### Bố cục rail

- Nút thu gọn/mở rộng chuyển từ hàng đầu (nơi nó chồng lên logo 38 px trong rail 76 px và bị
  `overflow: hidden` cắt) xuống chân rail, có nhãn “Thu gọn/Mở rộng” và `aria-label` đổi theo trạng thái.
- Rail là grid `auto minmax(0,1fr) auto`: chân rail luôn nằm trong khung kể cả khi cửa sổ thấp
  (đo ở 1440×720: chân rail 551–708, nút thu gọn 662–706).
- Tooltip của rail thu gọn do JS đặt trong `<body>` (một nút duy nhất, định vị theo mép phải rail),
  vì tooltip CSS cũ bị chính `overflow` của rail và của `nav` cắt nên không bao giờ hiện.
- Trạng thái đang chọn nhẹ lại: bề mặt `--rb-surface-3` + một vạch nhấn 2 px phía trong, thay cho
  nền hồng nhạt + vạch hồng bên ngoài.
- Nhóm điều hướng khi thu gọn dùng dấu phân cách 1 px thay cho nhãn nhóm ẩn (trước đây nhãn vẫn
  chiếm chỗ nên khoảng cách giữa các nhóm không đều).
- Nút nhạc nổi (mặc định góc trái dưới) đè lên chân rail → đẩy ra ngoài rail trên desktop:
  `left: calc(var(--rb-rail-w) + 16px)`.

### Lớp phủ trên các trang bài học

- **Lỗi tìm thấy:** 64 trang “coming soon” (`kttx`, `ktck1`, `ktck2`) đặt
  `body{display:grid;place-items:center;overflow:hidden;height:100%}`. Shell chèn footer vào body
  nên footer nằm ngoài khung và **không cuộn tới được** — mất footer pháp lý. Đã sửa bằng
  `body.bk-rebirth:has(> main.soon)`: body thành cột flex, thẻ giới hạn 560 px, footer nằm trong
  luồng cuộn. Đo lại: `docH` 1062, footer hiện sau khi cuộn, không tràn ngang.
- Kiểm thêm (1440×900, 1440×720, 375×780): `ktgk1/anh/anh1` (bộ đề tự viết CSS),
  `ktgk1/anh/indexanh` (ma trận, bảng 720 px cuộn trong khung), `ktgk1/gdqp/qp1` (Tailwind),
  `kttx/gk1/anh/indexanh` (Tailwind + body flex), `kttx/gk1/sinh/tuduy`, `ktck1/anh/indexanh`.
  Không trang nào tràn ngang; rail/chrome/footer/tab bar đúng vị trí.
- `#ind` (vạch chỉ báo tab của vài trang bài học cũ) đổi từ gradient ba màu sang `--rb-accent`.

### Chưa kiểm

- Trang chủ, Chat, Trợ lý AI vẫn phụ thuộc Supabase: trong môi trường này không đăng nhập được nên
  chỉ đo được khung, không đo được nội dung sau nhận diện.
- 320 px, zoom 200 %, axe, Lighthouse: vẫn chưa chạy.
- `images/anh/1.html` là tệp rỗng có sẵn (không có `<main>`), shell không thêm footer — giữ nguyên
  hiện trạng.

## 9. Sửa lỗi trang chủ không hiện gì (cùng phiên)

- **Triệu chứng:** mở `index.html` chỉ thấy khung (rail, top bar, nền) — toàn bộ nội dung trang trắng.
- **Nguyên nhân:** `bk-shell.js` dọn “khối hình nền cũ” bằng
  `bgInput.closest('.flex-col')`. Khối hình nền cũ **không còn trong markup** (trang chủ mới giữ điều
  khiển này trong `<details class="bk-customize">`), nên `closest` leo qua mọi tổ tiên và khớp
  wrapper trang `div.relative.flex.flex-col.min-h-screen`; nó gắn `.bk-legacy-wallpaper` lên đó và
  `bk-shell.css` ẩn bằng `display:none !important`.
- **Sửa:** bỏ đoạn dò ngược đó (không còn khối nào để ẩn) và bỏ luật `.bk-legacy-wallpaper` đã thành
  mã chết. `tools/qa/shell-smoke.js` đổi từ “khối hình nền cũ bị ẩn” (luôn PASS giả vì khớp wrapper)
  sang “không ẩn nhầm khối nội dung khi dọn khối hình nền cũ”.
- **Đo lại (1280×720):** `main` cao 2797, hero 370, 3 section, footer ở 2929, không tràn ngang,
  lời chào + “Cây tài liệu ôn tập” + nút hành động hiện đầy đủ. 375×780: `main` rộng 288, không
  tràn ngang, `<details>` hình nền mở được (cao 316), `#bgInput` vẫn nằm trong `<label>` như cũ.
- Lưu ý khi đo: animation vào trang `rbPageIn` (400 ms, `both`) đứng ở `opacity: 0` nếu tab đang bị
  ẩn/không vẽ khung — đo trong tab nền sẽ thấy `main` vô hình dù bố cục đã đúng.

## 10. Nhận diện riêng, menu tài khoản & nhịp cuộn (cùng phiên)

- **Logo thay chữ “BK”:** `assets/bakhi/logo.svg` và `favicon.svg` dùng cùng hình học (điểm neo
  + hai cung “khí” hồng trên nền graphite). `brandMark()` trong `bk-rebirth.js` vẽ SVG nội tuyến
  (`BKRebirth.logo`), rail 21px, footer 17px. Bộ PNG/ICO sinh lại bằng
  `node tools/make-favicon.js` — hình học trong tool đã đổi theo logo, không thêm thư viện.
  Logo nằm trong `assets/bakhi/`, không đặt trong `images/`.
- **Menu tài khoản (mọi trang):** panel 21rem, bo 18px, nền đặc `--rb-surface-2` (không còn
  `backdrop-filter` để chữ nền không lộ qua), hàng 40px (46px khi cảm ứng), icon 18px lấy bộ SVG
  1.6 nét qua `upgradeMenuIcons()` (nâng cấp lúc mở menu vì menu có thể dựng trước khi lớp mới
  nạp), head sticky, focus ring accent, dưới 640px thành sheet đáy.
- **Rail:** nhịp padding mới, mục đang xem nền accent 9% + vệt 2px, phản hồi `:active`, và
  “xương sống” tiến độ đọc 2px ở mép phải (`--rb-scroll` do `setupScroll` cập nhật mỗi khung).
- **Con trỏ riêng:** vòng “khí” 22px + biến thể pointer cho liên kết/nút; chỉ bật khi
  `(pointer: fine) and (hover: hover)`; ô nhập giữ con trỏ văn bản của hệ điều hành.
- **Nhịp cuộn riêng:** đường kẻ mảnh đầu mỗi `.bk-section` tự vẽ theo vị trí cuộn bằng
  scroll-driven animation (`animation-timeline: view()`), chỉ `transform`/`opacity`, tự tắt khi
  `prefers-reduced-motion`; trình duyệt không hỗ trợ thì bỏ qua.
- **Đo thật:** 1440 — rail 76px, logo 21px `rgb(255,182,193)`, menu 336×571, 9 icon SVG;
  trang bài học `/ktgk1/anh/anh1.html` — `--rb-scroll` 0.2598 và `scaleY(0.2598)` khớp, menu
  336×531, 8 icon SVG.
- **Cổng:** `shell-smoke` ALL PASSED; `rebirth-contrast` 74 cặp, 0 không đạt; `v855-ui`,
  `v856-ui`, `version-audit` PASS; `inject-rebirth --check` 0 tệp cần cập nhật;
  `content-integrity verify` OK (125 tệp).

## 11. Kiểm thử toàn site + favicon đậm hơn (cùng phiên)

Quét bằng biểu thức DOM trên trình duyệt thật, mỗi lượt đều tắt transition/animation trước khi đo
(tab ẩn làm `rbPageIn` đứng ở `opacity: 0`). Các bề rộng: 1440, 1024, 768, 375, 320.

| Trang | Bề rộng | Kết quả |
|---|---|---|
| `index.html` | 1440, 1024 | không tràn ngang, `main` hiện, 0 ảnh hỏng, 0 icon Font Awesome rỗng |
| `lesson` (`/ktgk1/anh/anh1.html`) | 320 | không tràn ngang, không cắt chữ, tap target ≥ 34px |
| `legal/`, `profile/` | 320, 768 | sạch; không phần tử fixed nào chồng nhau |
| `settings/` | 768 | dải tab là vùng cuộn ngang có chủ đích (461/934), không phải lỗi |
| `gamification/` | 375 | cây kỹ năng là canvas kéo-thả (1432 rộng) — chủ đích, không tràn trang |
| `studio/` | 375 | không tràn ngang |
| `chat/` | 1440 | khung soạn 881×47 nằm trong cột nội dung |
| `404.html` | 1024 | đúng nội dung mới, không còn chữ “BK” |

Lỗi tìm được và đã sửa (mục 27 của `bk-rebirth.css`):

- **Nút `#vb` “Dịch từ vựng”** (chỉ có ở `ktgk1/anh/anh1.html`) là `position: fixed` ở góc dưới nên
  **đè lên tabbar** và nút nhạc ở 320/375 → neo lên trên cụm nút nổi. Đo lại ở 320: `#vb` 495–534,
  nút nhạc 551–599, tabbar 611–675, không còn chồng.
- **Nút “Hỏi AI” đè nút báo cáo** ở `/profile/` (375): `bottom` cố định 148px trong
  `bk-ai-tutor.css` thấp hơn nút báo cáo → neo theo `--rb-tabbar-h`. Đo lại: AI 574–612,
  báo cáo 624–664, tabbar 716.
- **Thanh công cụ Studio** có nút 30×34 → nâng lên 38×38 (`body.bk-rebirth .ribbon .tb`), vì luật
  của trang đặt `min-height: 34px` mạnh hơn selector cũ.

Favicon “black-theme” chi tiết hơn (vẫn một hình học: `logo.svg` = `favicon.svg` = `brandMark()`):

- Nền ba lớp: gradient `#16161d → #0d0d11 → #08080a`, quầng hồng radial 16% quanh điểm neo,
  hai đường hairline trắng 10% / 3,5% lồng trong tile bo 14.
- Dấu: điểm neo r 5,2 có **quầng tròn 8,7** (thêm chất “khí”, đồng thời phá cách đọc thành icon wifi),
  hai cung 22/13 với góc quét lệch nhau (−90→−18 và −92→−30), và một vệt echo 0,5 nét ở r 30.
- `tools/make-favicon.js` thêm hai chế độ theo cỡ: `size ≥ 48` vẽ đủ chi tiết (quầng + echo),
  `size ≤ 32` chỉ còn điểm neo r 7,4 + một cung dày 4,4 — vì ở 16px bản đầy đủ nhoè thành vệt.
  Đã xem lại 512, 32, 16: mark hồng đọc rõ, 16px là một khối liền.
- `LOGO_PATHS` trong `bk-rebirth.js` đổi theo (24×24): rail 17×17, footer cùng hình.

Cổng sau thay đổi: `shell-smoke` ALL PASSED · `rebirth-contrast` 74 cặp / 0 fail · `v855-ui`,
`v856-ui`, `version-audit` PASS · `inject-rebirth --check` 0 tệp · `content-integrity verify` OK
(125 tệp) · `node --check` cho `bk-rebirth.js`, `bk-shell.js`, `tools/make-favicon.js`.
Chưa commit, chưa push.

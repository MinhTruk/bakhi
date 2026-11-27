# Phase 0 — Audit hiện trạng Bá Khí

Ngày audit: 26/11/2026 · Nhánh làm việc: `main` (không commit) · Phiên bản ứng dụng: `8.8.0`

## 1. Kiến trúc

- Website tĩnh, không build step, không bundler, không framework. Toàn bộ chạy trực tiếp từ GitHub Pages.
- 126 tệp HTML. Trang chủ `index.html` là trang nguyên khối (≈1.987 dòng, Tailwind CDN + CSS/JS nội tuyến).
- 119 trang bài học/đề nằm trong `kttx/`, `ktck1/`, `ktck2/`, `ktgk1/`, `ktgk2/`. Mỗi trang là một tệp HTML độc lập dùng Tailwind CDN, KaTeX, Font Awesome.
- Lớp nâng cấp dùng chung nằm ở `assets/bakhi/` (CSS/JS thuần, tiền tố `bk`, `bkl`, `bkg`, `bks`, `bkc`, `bkai`, `bkadm`).
- PWA: `manifest.webmanifest`, `sw.js`, favicon bộ đầy đủ.
- Dữ liệu: Supabase (Postgres + Auth + Storage + Realtime) qua `bk-supabase.config.js` và `bk-cloud.js`.
- AI: Supabase Edge Function gọi Groq (chính) và Google AI Studio (dự phòng). Khoá API chỉ ở máy chủ.

## 2. Bản đồ route

| Route | Tệp | Loại | Chrome hiện tại |
|---|---|---|---|
| `/` | `index.html` | Trang chủ, cây tài liệu | Header nội tuyến + avatar (bk-shell) |
| `/gamification/` | `gamification/index.html` | Tiến trình | `header.bk-topbar` + `main.bk-page` |
| `/skills/` | `skills/index.html` | Cây kỹ năng | `header.bk-topbar` + `main.bk-page` |
| `/profile/` | `profile/index.html` | Hồ sơ | `header.bk-topbar` + `main.bk-page` |
| `/settings/` | `settings/index.html` | Cài đặt | `header.bk-topbar` + `main.bk-page` |
| `/chat/` | `chat/index.html` | Chat | `header.bk-topbar` + `main.bk-page` |
| `/ai-tutor/` | `ai-tutor/index.html` | Trợ lý AI | `header.bk-topbar` + `main.bk-page` |
| `/studio/` | `studio/index.html` | Word & Paint | `header.appbar` riêng, toàn màn hình |
| `/founder/` | `founder/index.html` | Founder Console | `main.bkadm-card` riêng |
| `/admin/` | `admin/index.html` | Admin Console | `main.bkadm-card` riêng |
| `/kttx/{gk1,gk2,ck1,ck2}/{môn}/` | 65 tệp | Đề/ôn tập | `header` + `main` + `footer` Tailwind |
| `/ktgk1/`, `/ktgk2/`, `/ktck1/`, `/ktck2/` | 49 tệp | Đề/ôn tập | `header` + `main` + `footer` Tailwind |
| `/legal/terms.html`, `/legal/privacy.html` | mới | Pháp lý | Shell mới |

## 3. Thành phần dùng chung hiện có

- `bk-theme-boot.js`: áp `html.dark` / `html.light` trước khi vẽ, đọc `localStorage.theme`.
- `bk-tokens.css`: token `--bk-*` (V4) và `--bkl-*` (lớp học tập).
- `bk-core.css`: token + nút/ô nhập/modal/toast cơ bản.
- `bk-shell.css` + `bk-shell.js`: avatar, menu tài khoản, trợ năng, topbar đơn giản. **Không có rail điều hướng.**
- `bk-cloud.js`: Supabase, thông báo (`.bkc-bell` / `#bkcBell`), changelog (`#bkcWhatsNew`), đồng bộ hồ sơ.
- `bk-learn.js`: Trung tâm học tập, palette tìm kiếm (`Ctrl/⌘+K`), `window.BKLearn`.
- `bk-gamification.js`, `bk-badges.js`, `bk-profile.js`, `bk-roles.js`: XP, huy hiệu, hồ sơ, vai trò.
- `bk-version.js`: nguồn phiên bản duy nhất (`8.8.0`, phát hành 25/11/2026).

## 4. Vấn đề phát hiện

1. **Thẻ CSS/JS nằm sau `</html>`** trên gần như mọi trang (`bk-themes.css`, `bk-ai-tutor.css`, `bk-tokens.css`). Trình duyệt vẫn nạp nhưng thứ tự cascade mong manh và HTML không hợp lệ.
2. **Hai lớp giao diện chồng nhau**: token V4 `--bk-*`, lớp học tập `--bkl-*`, CSS riêng từng module, và Tailwind CDN trên trang chủ/bài học.
3. **Không có điều hướng toàn cục**: mỗi trang tự dựng topbar; người dùng phải quay về trang chủ để đi tiếp.
4. **Trang chủ nặng**: hiệu ứng sao/tinh vân, nhạc nền, hiệu ứng hạt, Tailwind CDN, nhiều script đồng bộ.
5. **Không có trang pháp lý** dù có thu thập dữ liệu học sinh, chat, ảnh và nội dung AI.
6. **Không có lựa chọn giảm chuyển động** trong giao diện (chỉ dựa vào OS).
7. **Thiếu trạng thái focus nhất quán** giữa các module; nhiều nút chỉ có hover.
8. **Màu accent phân tán**: indigo, purple, blue, emerald, amber tuỳ module, không có quy ước ngữ nghĩa.

## 5. Ràng buộc đã giữ

- Không sửa schema, RLS, Edge Function hay cấu hình Supabase.
- Không đổi nội dung học tập, đáp án, đề bài.
- Không đổi logic đăng nhập, phân quyền, hay luồng AI.
- Không đổi tên khóa lưu trữ hiện có (`theme`, `bktCfg`, `bakhiStudent.v1`, `bakhiLearn.v1`, `bakhiAdmin.v1`, `bgOpacity`, …).
- Khóa mới của giao diện chỉ dùng tiền tố `bk.ui.` và chỉ lưu cục bộ.

## 6. Ghi chú môi trường

- Khi bắt đầu, working tree thiếu 310 tệp đã được theo dõi (toàn bộ `kttx/`, `ktck*`, `ktgk*`, `profile/`, `settings/`, `skills/`, `studio/`, `tools/`, `supabase/`, `rust-backend/`, `sw.js`). Không có thay đổi cục bộ nào bị mất.
- Đã khôi phục bằng `git checkout -- .` từ HEAD và sửa index bị kẹt (`git read-tree HEAD`) sau khi xoá `.git/index.lock` cũ. Không commit, không push.

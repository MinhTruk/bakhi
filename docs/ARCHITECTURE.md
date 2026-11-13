# Kiến trúc Bá Khí

Tài liệu này mô tả hiện trạng repository, lớp nâng cấp 2.0 và các quyết định kỹ thuật.
Cập nhật: 13/11/2026.

## 1. Kiểm toán repository (trước khi nâng cấp)

| Hạng mục | Số lượng / ghi chú |
|---|---|
| Tệp HTML | 56 (1 trang chủ, 51 trang nội dung, 1 trang studio, 3 trang đặc biệt không có `</body>`) |
| Ngân hàng câu hỏi | 10 `MCQ_BANK`, 10 `TF_BANK`, 2 `ESSAY_BANK`; 29 `correctAnswer`, 252 `correct:`, 817 `explanation/exp/solution`, 41 mảng `options` |
| CSS | Nhúng trong từng trang + Tailwind CDN + style V4 tự inject (`bakhi-v4.js`) |
| JS dùng chung | `bakhi-v4.js` (chỉ trang chủ), `bakhi-transition.js` (3 trang), khối `BKT` inline trong `<head>` của mọi trang |
| Developer Panel | 11 tab cũ: fx, tools, data, ui, debug, anim, adv, insp, perf, studio, bk (core trong `index.html`, `bakhi-v4.js`) |
| Storage keys | `theme`, `b11theme`, `bgOpacity`, `customBg`, `fxCfg`, `uiCfg`, `hiddenSubjects`, `favCfg`, `bktCfg`, `appHighlightsDataMap`, `bakhiBackups`, `bakhiSchema`, `bakhiColors`, `bakhiErrors`, `bakhiSnips`, `devToken`, `devLock`, `bakhi_ly11_progress`, `bakhi_toan11_checklist`, `lexend-*`, `bgmMuted` |
| Theme | `html.dark` + `localStorage.theme`; token V4 `--bk-*` |
| Chuyển trang | Khối BKT (hiệu ứng bàn tay/vải) + `sessionStorage.bktF` |
| Supabase | **Chưa có** trong mã nguồn (không có SDK, không có URL/key) |
| Deploy | GitHub Pages, đường dẫn tương đối, không build |

### Vấn đề phát hiện

1. Mỗi trang nội dung tự chứa toàn bộ CSS/JS → trùng lặp lớn, không có lớp dữ liệu chung.
2. Không có nơi lưu kết quả luyện tập thống nhất (mỗi trang dùng key riêng hoặc không lưu).
3. Developer Panel nằm trong một modal cố định, không kéo/đổi kích thước được, phụ thuộc
   markup của `index.html`.
4. `Ctrl+K` cũ chỉ hoạt động khi đã xác thực Developer.
5. `innerHTML` được dùng ở nhiều nơi với dữ liệu tĩnh (chấp nhận được), nhưng cần lớp mới
   escape mọi dữ liệu người dùng.
6. Chưa có kiểm thử tự động hay công cụ bảo vệ nội dung.
7. Ba tệp HTML là fragment (không có `</body>`), không thể chèn script theo cách thông thường.

## 2. Lớp nâng cấp 2.0

```
index.html ──► bk-core.js ──► bk-learn.js ──► bk-dev.js
                   ▲
trang bài học ─────┴──► bk-page.js
```

- **bk-core.js** — nguồn sự thật duy nhất cho dữ liệu người dùng:
  - `BK.store`: key `bakhiLearn.v1`, schema `v:1`, sanitize từng trường, giới hạn kích thước,
    phục hồi khi JSON hỏng (sao lưu `bakhiLearn.corrupt.<ts>` rồi tạo state rỗng).
  - `BK.practice()`: ghi lượt luyện, tự đưa câu sai vào review, cập nhật lịch ôn theo
    kết quả (spaced repetition cấu hình được).
  - `BK.addNote/addBookmark/addHistory`, `BK.achievements`, `BK.search`, `BK.io`
    (export/validate/import), `BK.ai`, `BK.cloud` (adapter tuỳ chọn).
- **bk-learn.js/css** — UI: dock nổi, modal Trung tâm học tập 7 tab, command palette
  (Ctrl/⌘+K), tìm kiếm toàn cục (`/`), focus mode, xuất/nhập.
- **bk-dev.js/css** — Developer Playground 2.0: cửa sổ nổi kéo/đổi kích thước, nhớ
  vị trí/kích thước/tab, 11 công cụ (thêm tab Music). Không thay thế panel cũ.
- **bk-music.js/css** — Music Player dùng chung: thư viện 10 bài, queue (thêm/xoá/
  kéo thả), shuffle, repeat 3 chế độ, âm lượng, lyrics có timestamp do người dùng
  tự bổ sung. Trạng thái lưu ở `bakhiMusic.v1`; không autoplay. Do `bk-core.js`
  nạp trên mọi trang nên chỉ có một audio instance cho mỗi trang.
- **bk-page.js** — chỉ chạy trên trang bài học: ghi lịch sử, đọc ngân hàng câu hỏi
  (chỉ đọc), bắt kết quả kiểm tra theo mẫu feedback quen thuộc, dock nhỏ 4 nút.

### Vì sao không gộp vào `bakhi-v4.js`

`bakhi-v4.js` là lớp V4 đã ổn định và được nạp bởi trang chủ. Tách module giúp:
- Trang bài học chỉ tải ~68KB (core + page) thay vì toàn bộ 167KB V4.
- Có thể kiểm thử độc lập bằng jsdom.
- Giảm rủi ro regression cho panel cũ và hiệu ứng hiện có.

## 3. Mô hình dữ liệu

```jsonc
{
  "v": 1,
  "createdAt": 0, "updatedAt": 0,
  "practice": [{ "id", "ts", "subject", "questionId", "question", "topic",
                 "difficulty", "correct", "source", "lesson" }],
  "review":   [{ "id", "key", "subject", "question", "options", "answer",
                 "explanation", "topic", "difficulty", "wrong", "right",
                 "mastered", "nextReview", "history": [{ "ts", "correct" }] }],
  "notes":    [{ "id", "title", "body", "subject", "questionId", "category",
                 "pinned", "createdAt", "updatedAt" }],
  "bookmarks":[{ "id", "type", "ref", "title", "subject", "folder", "url", "createdAt" }],
  "history":  [{ "id", "ts", "kind", "title", "url", "subject", "meta" }],
  "achievements": { "unlocked": { "id": 0 }, "counters": {} },
  "prefs": { "focus", "fontSize", "ambient", "spaced": {...}, "ai": {...}, "cloud": {...} }
}
```

Giới hạn: practice 5000, history 600, notes 500, bookmarks 500, review 800.
Câu hỏi được lưu dưới dạng **bản sao văn bản** để hiển thị/ôn tập; không có thao tác nào
ghi ngược vào ngân hàng câu hỏi gốc.

### Nhịp ôn tập

`again` (mặc định 1 ngày), `hard` 3, `good` 7, `easy` 14, tối đa 90 — cấu hình trong
Cài đặt. Trả lời đúng 2 lần → `mastered`. Hẹn ngày thủ công bằng ô ngày.

## 4. Ghi nhận luyện tập trên trang bài học

`bk-page.js` đọc các biến toàn cục quen thuộc (`MCQ_BANK`, `TF_BANK`, `rawMcqData`,
`tfData`, `quizData`, `QUESTIONS`, …) và sau khi người dùng bấm kiểm tra (hoặc gọi hàm
`checkAllAnswers`, `submitQuiz`, …) sẽ quét các phần tử phản hồi có class xanh/đỏ.

Đây là **best-effort**: trang có cấu trúc khác có thể gọi trực tiếp:

```js
BK.practice({
  question: '...', questionId: '...', subject: 'ly',
  topic: '...', correct: true, options: ['...'], answer: 0,
  explanation: '...', source: location.pathname, lesson: document.title
});
```

Không có cơ chế nào sửa DOM câu hỏi, đáp án hay giải thích.

## 5. Toàn vẹn nội dung

`tools/content-integrity.js` băm sha256 từng tệp HTML sau khi loại bỏ **đúng khối script**
do lớp nâng cấp chèn (đánh dấu bằng bình luận + đường dẫn `assets/bakhi/`).
Baseline lưu tại `docs/content-baseline.json` (56 tệp, kèm thống kê câu hỏi/giải thích).

Kết quả sau nâng cấp: **56/56 tệp không đổi nội dung** (`verify` thoát mã 0).

## 6. Bảo mật

- Mọi dữ liệu người dùng hiển thị qua `textContent` hoặc `BK.util.esc`; Markdown escape
  trước khi bật cú pháp; liên kết chỉ chấp nhận `http(s)`.
- Import JSON: kiểm tra `app`, `kind`, `version`, kiểu mảng; không nhập `prefs`
  (tránh đổi endpoint AI/cloud ngoài ý muốn); không bao giờ `eval` dữ liệu nhập.
- Storage Manager bảo vệ các key quan trọng và yêu cầu xác nhận.
- Không có service-role key. Supabase chỉ dùng anon key + RLS (xem docs/SUPABASE_SETUP.md).
- Developer Playground dùng chung cổng xác thực hiện có (`devToken` + `devPanelBtnContainer`),
  đây là khoá giao diện cho site tĩnh, không phải bảo mật thật.

## 7. Giới hạn đã biết

- Bắt kết quả luyện tập phụ thuộc cấu trúc từng trang; trang không theo mẫu feedback
  sẽ không tự ghi (dùng API `BK.practice`).
- Không có backend: dữ liệu nằm ở localStorage, không đồng bộ giữa thiết bị trừ khi
  cấu hình Supabase.
- Ba tệp fragment (`images/anh/1.html`, `music/1.html`, `ktgk1/hoa/indexhoa.html`)
  không được chèn script do thiếu `</body>`.
- Tìm kiếm câu hỏi giới hạn ở câu đã luyện/đang ôn và ngân hàng của trang hiện tại,
  không quét trước toàn bộ 56 trang (tránh tải nặng).
- `prefers-reduced-motion` được tôn trọng ở animation mới; các hiệu ứng cũ giữ nguyên.

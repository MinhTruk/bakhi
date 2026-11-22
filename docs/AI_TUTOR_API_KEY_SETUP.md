# Cấu hình khoá API cho Trợ lý AI (viết cho người không lập trình)

Tài liệu này hướng dẫn **từng bước** cách đặt khoá API cho Trợ lý AI Bá Khí.
Bạn không cần sửa bất kỳ tệp JavaScript nào.

> **Điều quan trọng nhất:** khoá API **không** nằm trong mã nguồn, **không** nằm trong
> trình duyệt, **không** nằm trong GitHub. Khoá chỉ được lưu ở một nơi duy nhất:
> **Supabase → Edge Functions → Secrets**.

---

## 1. Tên secret cần dùng

| Tên secret | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `AI_TUTOR_API_KEY` | **Có** | Khoá của nhà cung cấp AI chính. |
| `AI_TUTOR_FALLBACK_API_KEY` | Không | Khoá của nhà cung cấp dự phòng (nếu dùng). |
| `AI_TUTOR_PROVIDER` | Không | Mặc định ban đầu (`google`, `openai`, …) — có thể đổi trong Founder Dashboard. |
| `AI_TUTOR_MODEL` | Không | Mặc định ban đầu — có thể đổi trong Founder Dashboard. |
| `AI_TUTOR_BASE_URL` | Chỉ khi `custom` | Địa chỉ API tương thích OpenAI của riêng bạn. |
| `AI_TUTOR_FALLBACK_BASE_URL` | Không | Như trên, cho provider dự phòng. |
| `AI_TUTOR_MOCK` | **Không bao giờ** ở production | `1` = chế độ giả lập để kiểm thử. |

Các secret có sẵn của Bá Khí (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) do Supabase
tự cấp, không cần thêm.

---

## 2. Chọn nhà cung cấp AI

Bạn chỉ cần **một** nhà cung cấp để bắt đầu. Chọn theo nhu cầu:

| Nhà cung cấp | Khi nào phù hợp |
|---|---|
| Groq | **Mặc định từ 8.5.2** (`openai/gpt-oss-20b`); giao thức OpenAI-compatible, có hạn mức miễn phí. |
| Google Gemini | Dự phòng mặc định (`gemini-3.8-flash`); có gói miễn phí nhưng dễ chạm `429`/`503`. |
| OpenAI | Cần chất lượng suy luận cao; tính phí theo lượng dùng. |
| Groq | Cần trả lời rất nhanh. |
| OpenRouter | Muốn một khoá dùng được nhiều mô-đun khác nhau. |
| Mistral / DeepSeek | Phương án thay thế, giá khác nhau. |
| Custom | Bạn đã có endpoint tương thích OpenAI. |

**Không** giả định một dịch vụ luôn miễn phí. Hạn mức và giá thay đổi theo thời gian —
hãy xem trang giá chính thức của nhà cung cấp bạn chọn trước khi dùng cho nhiều học sinh.

---

## 3. Tạo khoá API (ví dụ với Google Gemini)

1. Mở <https://aistudio.google.com/app/apikey>.
2. Đăng nhập bằng tài khoản Google của bạn.
3. Bấm **Create API key** → chọn project (hoặc để mặc định).
4. Sao chép chuỗi khoá vừa tạo. Chuỗi này chỉ hiện đầy đủ một lần.

Với nhà cung cấp khác, làm tương tự trên trang quản trị của họ
(xem `docs/AI_TUTOR_PROVIDER_SETUP.md`).

> Không dán khoá vào chat, vào tệp trong repo, hay vào ảnh chụp màn hình.

---

## 4. Đặt khoá vào Supabase Secrets

1. Mở <https://supabase.com/dashboard> và chọn project **Bá Khí**
   (`wzvslyabhizsiggurwdq`).
2. Menu trái → **Project Settings** → **Edge Functions** → mục **Secrets**
   (một số phiên bản: **Settings → Functions → Secrets**).
3. Bấm **Add new secret**.
4. Name: `AI_TUTOR_API_KEY`
5. Value: dán khoá đã sao chép ở bước 3.
6. Bấm **Save**.

Lặp lại nếu bạn muốn có provider dự phòng với tên `AI_TUTOR_FALLBACK_API_KEY`.

Sau khi lưu, Supabase áp secret cho mọi Edge Function trong vài giây. Bạn **không** cần
sửa mã và **không** cần deploy lại frontend.

---

## 5. Bật tab AI Tutor trong Founder Dashboard

1. Mở <https://minhtruk.github.io/bakhi/founder/>.
2. Nhập mã Founder của bạn.
3. Tab **AI Tutor** xuất hiện trong danh sách bên trái.
4. Mục **Nhà cung cấp & mô hình**: chọn nhà cung cấp (ví dụ *Google Gemini*),
   nhập mô hình (ví dụ `gemini-2.5-flash`).
5. Bấm **Lưu cấu hình**.
6. Bấm **Kiểm tra kết nối**.

Kết quả mong đợi: dòng thông báo màu xanh dạng
`Kết nối thành công: Groq · openai/gpt-oss-20b · 780ms`.

Chi tiết đầy đủ (lấy khoá, kiểm tra model, cấu hình dự phòng, đọc thống kê token):
[docs/AI_TUTOR_PROVIDER_CONFIGURATION.md](AI_TUTOR_PROVIDER_CONFIGURATION.md).

Nếu thấy:
- **“chưa có khoá API”** → secret chưa được lưu hoặc lưu sai tên. Làm lại bước 4.
- **“Khoá API không hợp lệ hoặc đã bị thu hồi”** → khoá sai/đã xoá. Tạo khoá mới.
- **“Mô hình không còn khả dụng”** → tên mô hình sai. Chọn tên khác trong gợi ý.
- **“đã hết hạn mức”** → tài khoản nhà cung cấp hết quota. Xem mục 7.

---

## 6. Kiểm tra Trợ lý AI

1. Đăng nhập Bá Khí trên một thiết bị (chọn họ tên ở trang chủ).
2. Mở <https://minhtruk.github.io/bakhi/ai-tutor/>.
3. Chọn chế độ **Giải thích**, hỏi: *“Giải thích định luật bảo toàn khối lượng bằng ví dụ.”*
4. Câu trả lời phải xuất hiện trong vài giây, có định dạng đẹp.
5. Tải lại trang → hội thoại vẫn còn trong danh sách bên trái.

Nếu UI hiện dải cảnh báo **“Chế độ giả lập đang bật”**, nghĩa là `AI_TUTOR_MOCK=1`.
Hãy xoá secret đó trước khi dùng thật — câu trả lời khi đó **không** phải từ AI.

---

## 7. Khi hết hạn mức hoặc cần đổi nhà cung cấp

- **Đổi khoá mới:** lặp lại bước 4 với khoá mới. Lịch sử hội thoại **không** bị mất.
- **Đổi nhà cung cấp:** vào **Founder Dashboard → AI Tutor → Nhà cung cấp & mô hình**,
  chọn provider + model mới, bấm **Lưu cấu hình**, rồi **Kiểm tra kết nối**.
- **Dùng dự phòng:** đặt `AI_TUTOR_FALLBACK_API_KEY`, chọn *Nhà cung cấp dự phòng* và
  *Mô hình dự phòng*, lưu lại. Hệ thống chỉ chuyển sang dự phòng khi lỗi tạm thời.
- **Hết hạn mức**: học sinh thấy thông báo tiếng Việt và nút Thử lại. Việc học bình
  thường (bài học, Quiz, Chat, Tiến trình) **không** bị ảnh hưởng.

---

## 8. Thu hồi khoá khi nghi bị lộ

1. Vào trang quản trị của nhà cung cấp → **xoá / thu hồi** khoá cũ ngay.
2. Tạo khoá mới và lưu vào Supabase Secrets như bước 4.
3. Bấm **Kiểm tra kết nối** để xác nhận.
4. Nếu khoá từng bị đưa lên GitHub: xoá khỏi lịch sử commit (hoặc chuyển repo sang
   private) và coi như khoá đó đã lộ vĩnh viễn.

---

## 9. Những việc KHÔNG được làm

- Không sửa `assets/bakhi/bk-*.js` để nhét khoá vào.
- Không tạo tệp `.env` trong repo rồi commit.
- Không đặt khoá trong biến môi trường của GitHub Actions.
- Không dán khoá vào chat, ticket, hay tài liệu.
- Không đặt khoá trong bảng `ai_settings` (bảng này cố ý không có cột khoá).

Kiểm tra tự động: `node tools/qa/ai-tutor-api-security.js` sẽ **fail** nếu phát hiện
chuỗi giống khoá thật trong bất kỳ tệp nào của repo.

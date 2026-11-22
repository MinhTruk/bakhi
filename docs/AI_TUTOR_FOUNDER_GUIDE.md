# Hướng dẫn quản trị Trợ lý AI (Founder / Administrator)

Mở <https://minhtruk.github.io/bakhi/founder/> → đăng nhập bằng mã Founder → tab **AI Tutor**.
(Administrator thấy cùng tab nhưng chỉ xem được trạng thái; máy chủ chặn mọi thao tác ghi.)

## 1. Tổng quan

Hiển thị trong 24 giờ gần nhất:

- **Trạng thái** — đang bật / đang tắt.
- **Nhà cung cấp**, **Mô hình** đang dùng.
- **Kết nối** — *Đã cấu hình khoá* / *Chưa có khoá API* / *Giả lập (QA)* / *Đang tắt*.
- **Request**, **Lỗi**, **Học sinh dùng**, **Token**.
- **Hội thoại**, **Tin nhắn** (tổng, không giới hạn 24 giờ).

Nút **Kiểm tra kết nối** gửi một lượt gọi rất nhỏ (dùng `model_simple` nếu có) và báo
provider/model/thời gian phản hồi. Lượt này **có** tốn một ít quota nhưng **không** lưu
hội thoại.

## 2. Nhà cung cấp & mô hình

| Trường | Ghi chú |
|---|---|
| Nhà cung cấp chính | Google / OpenAI / Groq / OpenRouter / Mistral / DeepSeek / Custom. |
| Mô hình mặc định | Chỉ dùng tên model đã kiểm tra hoạt động. |
| Nhà cung cấp dự phòng | Để trống nếu không dùng. Cần `AI_TUTOR_FALLBACK_API_KEY`. |
| Mô hình dự phòng | Bắt buộc nếu đã chọn provider dự phòng. |
| Định tuyến model | Bật/tắt phần chọn model theo loại câu hỏi. |
| Model cho câu đơn giản / phức tạp / luyện tập | Để trống = dùng model mặc định. |

Bấm **Lưu cấu hình** → **Kiểm tra kết nối** để xác nhận.

> Khoá API **không** nhập ở đây. Khoá nằm trong Supabase Secrets — xem
> `docs/AI_TUTOR_API_KEY_SETUP.md`.

## 3. Giới hạn sử dụng & chi phí

| Trường | Gợi ý |
|---|---|
| Số câu hỏi / 24 giờ | 20 khi thử, 60 cho một lớp, 120–150 toàn trường. |
| Token / 24 giờ | 20 000 → 150 000 tùy quy mô. |
| Token tối đa mỗi câu trả lời | 800–1600. |
| Thời gian chờ (ms) | 45 000 mặc định; giảm nếu mạng nội bộ tốt. |
| Số tin nhắn ngữ cảnh | 8–12. Tăng thì tốn token hơn. |
| Ngôn ngữ | Tiếng Việt (mặc định) hoặc có chú thích tiếng Anh. |
| Bật Trợ lý AI | Tắt = học sinh thấy thông báo tạm tắt, phần học tập không đổi. |
| Lưu lịch sử hội thoại | Tắt = không lưu câu trả lời (vẫn lưu câu hỏi). |
| Tự gửi ngữ cảnh bài học | Tắt = AI không nhận nội dung bài đang xem. |
| Chế độ học tập được phép | Bỏ chọn để ẩn một chế độ với học sinh. |

## 4. System Prompt

Khung soạn thảo lớn chứa hướng dẫn chung cho mọi câu trả lời.

1. Sửa nội dung (tối thiểu 40 ký tự, tối đa 12 000).
2. Ghi **Ghi chú phiên bản** (ví dụ: “thêm quy tắc không bịa nguồn”).
3. Bấm **Lưu hướng dẫn mới** → tạo phiên bản mới, áp dụng ngay.
4. Danh sách **Phiên bản trước** hiện bên dưới; bấm **Khôi phục** để quay lại
   (khôi phục = tạo phiên bản mới mang nội dung cũ, lịch sử không bị sửa).
5. **Xem trước** hiển thị nội dung hiện tại.

Khuyến nghị: giữ các quy tắc cấm bịa nguồn, cấm đổi dữ liệu học tập, cấm tiết lộ cấu hình,
và câu nhắc lại sau khối ngữ cảnh. Chi tiết: `docs/AI_TUTOR_SYSTEM_PROMPT.md`.

## 5. Quyền

| Hành động | Founder | Administrator |
|---|---|---|
| Xem trạng thái, usage | ✅ | ✅ |
| Sửa cấu hình | ✅ | ❌ `403 FOUNDER_ONLY` |
| Sửa / khôi phục System Prompt | ✅ | ❌ |
| Kiểm tra kết nối | ✅ | ❌ |

Mọi thay đổi cấu hình và prompt đều ghi vào **Nhật ký** quản trị
(`ai_tutor.settings.save`, `ai_tutor.prompt.save`, `ai_tutor.prompt.restore`).

## 6. Tình huống thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| “Chưa có khoá API” | Secret chưa lưu / sai tên | Lưu `AI_TUTOR_API_KEY` trong Supabase Secrets |
| “Khoá API không hợp lệ” | Khoá bị xoá hoặc sai | Tạo khoá mới, cập nhật secret |
| “Mô hình không còn khả dụng” | Tên model sai/ngừng hỗ trợ | Chọn model khác, kiểm tra lại |
| Lỗi tăng đột biến | Hết quota / provider sự cố | Kiểm tra quota; bật provider dự phòng |
| Học sinh báo “đã hết hạn mức” | Chạm `daily_requests` | Tăng hạn mức nếu ngân sách cho phép |
| Trợ lý trả lời kỳ lạ sau khi sửa prompt | Prompt mới quá mơ hồ | Khôi phục phiên bản trước |
| Thấy “Chế độ giả lập” | `AI_TUTOR_MOCK=1` còn trong Secrets | Xoá secret đó |

## 7. Bật/tắt khẩn cấp

Nếu AI trả lời sai nghiêm trọng: **bỏ chọn “Bật Trợ lý AI cho học sinh” → Lưu cấu hình**.
Học sinh thấy thông báo tạm tắt; bài học, Quiz, Chat, Tiến trình không bị ảnh hưởng.
Sau khi sửa prompt/model, bật lại.

## 8. Những gì dashboard cố ý không cho làm

- Không hiển thị, không nhập, không trả về API key.
- Không sửa trực tiếp hội thoại của học sinh.
- Không nhập JSON thô cho cấu hình.
- Không cấp XP/thành tựu qua AI Tutor.

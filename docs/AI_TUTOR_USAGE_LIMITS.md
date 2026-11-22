# Giới hạn sử dụng & kiểm soát chi phí (AI Tutor 8.5.0)

## 1. Cấu hình tập trung ở một nơi

Mọi giới hạn nằm trong bảng `ai_settings` (một dòng `id = 1`), sửa qua
**Founder Dashboard → AI Tutor**. Không có hằng số giới hạn nào rải rác trong mã frontend.

| Trường | Mặc định | Ý nghĩa |
|---|---|---|
| `daily_requests` | 120 | Số câu hỏi / 24 giờ / học sinh. `0` = không giới hạn. |
| `daily_tokens` | 120 000 | Tổng token (vào + ra) / 24 giờ / học sinh. `0` = không giới hạn. |
| `max_output_tokens` | 1 600 | Token tối đa cho một câu trả lời. |
| `max_context_messages` | 12 | Số lượt hội thoại gần nhất gửi kèm. |
| `timeout_ms` | 45 000 | Thời gian chờ provider. |
| `enabled` | `true` | Bật/tắt toàn bộ Trợ lý AI. |

Burst cố định trong mã (không cần cấu hình): **10 request / 60 giây / học sinh**, qua
`bakhi_rate_limit()` — cơ chế có sẵn của Bá Khí, không viết mới.

## 2. Cách kiểm tra hạn mức

Mỗi lần `chat`, máy chủ:

1. Kiểm tra burst (60 giây).
2. Đếm `ai_usage_logs` trong 24 giờ qua bằng `bakhi_ai_usage(student_id)`.
3. So với `daily_requests` và `daily_tokens`.
4. Nếu vượt → trả `429` với mã `DAILY_LIMIT` hoặc `DAILY_TOKEN_LIMIT` và thông báo:
   *“Bạn đã dùng hết N câu hỏi AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.”*
5. Nếu chưa vượt → gọi provider, ghi usage log với token thật (hoặc ước lượng nếu
   provider không trả usage).

Học sinh xem được số câu đã dùng ở chân danh sách hội thoại:
*“Hôm nay: 12/120 câu hỏi”*.

## 3. Kiểm soát chi phí khi cấu hình

Khuyến nghị cho một trường/lớp:

| Bối cảnh | `daily_requests` | `daily_tokens` | `max_output_tokens` |
|---|---|---|---|
| Dùng thử nội bộ | 20 | 20 000 | 800 |
| Lớp học (≈40 học sinh) | 60 | 60 000 | 1 200 |
| Toàn trường, ngân sách thoải mái | 150 | 150 000 | 1 600 |

Bật **định tuyến model** để câu hỏi đơn giản không dùng model đắt. Xem
`docs/AI_TUTOR_PROVIDER_SETUP.md` mục 5.

## 4. Theo dõi

Founder Dashboard → AI Tutor → **Tổng quan**:

- request / lỗi / số học sinh / token trong 24 giờ
- tổng số hội thoại và tin nhắn
- trạng thái kết nối (đã có khoá / chưa có khoá / giả lập)

Bảng gốc: `ai_usage_logs` (một dòng cho mỗi lần gọi, kể cả lần thất bại và lần
`admin.test`). Học sinh chỉ đọc được dòng của chính mình (RLS).

## 5. Không tự tiêu tiền ngoài cấu hình

Hệ thống **chỉ** dùng đúng provider/model đã lưu trong `ai_settings`:

- Không tự chuyển sang nhà cung cấp khác nếu chưa cấu hình `fallback_*` + khoá dự phòng.
- Không dùng model đắt hơn model đã cấu hình.
- Không gọi AI để tạo tiêu đề hội thoại (tiêu đề lấy từ câu hỏi đầu tiên — 0 token).
- `admin.test` dùng `model_simple` (hoặc `model`) và không lưu hội thoại.

## 6. Về “miễn phí”

Tài liệu này **không** khẳng định bất kỳ nhà cung cấp nào miễn phí. Gói miễn phí, hạn mức
và giá thay đổi theo thời gian và theo tài khoản. Trước khi bật cho nhiều học sinh:

1. Đọc trang giá và hạn mức chính thức của nhà cung cấp bạn chọn.
2. Đặt `daily_requests`/`daily_tokens` thấp trước, theo dõi 1–2 ngày.
3. Nâng dần khi đã biết mức dùng thực tế.

## 7. Khi hết hạn mức

- Học sinh: thông báo tiếng Việt + nút Thử lại; **không** mất hội thoại; **không** bị khoá
  tài khoản Bá Khí; vẫn học/Quiz/Chat/Tiến trình bình thường.
- Founder: xem tab AI Tutor để biết request/lỗi/token; tăng hạn mức hoặc đổi provider.

## 8. Hạn chế còn tồn tại

- Hạn mức tính theo cửa sổ trượt 24 giờ, không theo ngày lịch. “Hạn mức tính lại sau 24 giờ”
  nghĩa là các request cũ dần rơi khỏi cửa sổ, không phải reset lúc 0 giờ.
- Bộ đếm trong bộ nhớ (chặn gửi chồng lặp trong isolate) không chia sẻ giữa các isolate;
  lớp chặn thật là `bakhi_rate_limit` + kiểm tra trùng trong DB.
- Chưa có cảnh báo tự động khi gần chạm hạn mức; hiện chỉ hiển thị số đã dùng.

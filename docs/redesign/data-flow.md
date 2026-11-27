# Data flow — dữ liệu đi đâu, ở đâu

Tài liệu này là nguồn cho trang Chính sách quyền riêng tư. Chỉ mô tả những gì mã nguồn thực sự làm.

## 1. Sơ đồ tổng quát

```
Trình duyệt (học sinh)
  ├─ localStorage / sessionStorage / IndexedDB
  ├─ Supabase JS client ──► Supabase Postgres (RLS) ──► Edge Functions
  │                              ├─ Auth / phiên
  │                              ├─ Storage: chat-images, report-attachments
  │                              └─ Realtime: chat, thông báo
  └─ Edge Function ai-tutor-api ──► Groq (chính) ──► Google AI Studio (dự phòng)
```

## 2. Dữ liệu trên thiết bị

| Khóa / kho | Nội dung | Ghi chú |
|---|---|---|
| `theme` | `dark` / `light` | Đọc trước khi vẽ bởi `bk-theme-boot.js` |
| `bakhiStudent.v1` | Hồ sơ học sinh đã bind | Không đổi tên |
| `bakhiLearn.v1`, `bakhiLearn.preBind.*`, `bakhiLearn.corrupt.*` | Tiến trình học, hàng đợi đồng bộ | `bk-learn.js` |
| `bakhiAdmin.v1` (sessionStorage) | Phiên Founder/Admin | Do máy chủ cấp; UI chỉ đọc |
| `devToken` (sessionStorage) | Phiên Developer | Do `dev-auth` cấp |
| `bgOpacity`, `customBg` + IndexedDB `bg` | Ảnh nền tùy chỉnh | Ảnh nén JPEG trước khi lưu |
| `bktCfg`, `bakhiA11y.v1` | Cấu hình giao diện/trợ năng | Không đổi tên |
| `bk.ui.nav` | Rail mở rộng hay thu gọn | **Mới**, chỉ cục bộ |
| `bk.ui.motion` | `auto` / `reduced` / `full` | **Mới**, chỉ cục bộ |
| Studio: khóa riêng của `studio/index.html` | Tài liệu, bản vẽ | Chủ yếu cục bộ |

## 3. Supabase

- Client khởi tạo một lần trong `bk-supabase.config.js`; URL dự án: `wzvslyabhizsiggurwdq.supabase.co`.
- Bảng được client đọc/ghi trực tiếp (theo mã hiện có): `announcements`, `announcement_reads`, `app_settings`, `changelog`, `report_notifications`.
- Chat, tiến trình, hồ sơ, gamification, quyền quản trị đi qua Edge Function (`chat-api`, `gamification-api`, `student-profile`, `sync-student-progress`, `admin-auth`, `admin-actions`, `report-api`, …) và RLS.
- Storage bucket: `chat-images` (ảnh chat, chỉ png/jpeg/webp/gif ≤ 3 MB) và `report-attachments`.
- Realtime dùng cho chat và thông báo. Không có bảng quảng cáo, không có tracking bên thứ ba.

## 4. AI

- Trình duyệt gọi Edge Function `ai-tutor-api`; **không** gọi thẳng nhà cung cấp.
- `_shared/ai-providers.ts`: Groq là chính, Google AI Studio là dự phòng. Thứ tự và mô hình do máy chủ quyết định.
- Khoá API nằm trong biến môi trường của Supabase; không có trong HTML/JS tĩnh.
- Nội dung gửi trong phiên Trợ lý AI được chuyển tới nhà cung cấp để tạo câu trả lời; không dùng để huấn luyện theo cấu hình hiện tại (cần quản trị xác nhận với điều khoản nhà cung cấp).

## 5. Luồng dữ liệu của lớp giao diện mới

`bk-rebirth.js` **không gửi dữ liệu đi đâu**. Nó chỉ:

1. Đọc `theme` (qua `bk-theme-boot`/`BKShell`) để vẽ đúng.
2. Đọc `bk.ui.nav`, `bk.ui.motion` từ localStorage.
3. Đọc số chưa đọc từ `BKCloud.chatUnread` (đã có sẵn trong bộ nhớ).
4. Đọc `bakhiAdmin.v1` từ sessionStorage để hiện/ẩn nhóm "Quản trị".
5. Dựng DOM rail/topbar/footer/tab bar và các hiệu ứng.

Không có fetch mới, không có thư viện mới, không có pixel/tracking.

## 6. Điểm cần quản trị xác nhận

- Thời hạn lưu từng loại dữ liệu (tiến trình, tin nhắn, ảnh, nhật ký).
- Đầu mối liên hệ chính thức và thời gian phản hồi yêu cầu truy cập/xoá.
- Cơ chế đồng ý cho học sinh chưa thành niên và vai trò của nhà trường/phụ huynh.
- Chính sách của nhà cung cấp AI về việc dùng dữ liệu huấn luyện.

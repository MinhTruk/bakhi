# Role matrix — quyền và bề mặt giao diện

Ma trận mô tả **những gì người dùng thấy** và **nơi quyền thực sự được kiểm tra**. Redesign không thay đổi bất kỳ kiểm tra quyền nào.

| Vai trò | Cách nhận diện | Thấy trong UI | Quyền thực tế được kiểm ở |
|---|---|---|---|
| Khách (chưa có mã học sinh) | Không có `bakhiStudent.v1` | Trang chủ, toàn bộ tài liệu, pháp lý; rail không có mục quản trị | Supabase RLS; các trang học tập mở công khai |
| Học sinh | `bakhiStudent.v1` + phiên Supabase | Thêm Hồ sơ, Tiến trình, Kỹ năng, Chat, Trợ lý AI, Cài đặt | `bk-core.js`, `bk-cloud.js`, RLS theo `student_id` |
| Học sinh có quyền đặc biệt | Trường vai trò trên hồ sơ | Huy hiệu/danh hiệu/khung; không thấy console quản trị | `bk-roles.js` + RLS; UI chỉ ẩn/hiện |
| Developer | Phiên `devToken` (sessionStorage) do máy chủ cấp | Nút mở Developer Panel trên trang chủ | `bk-dev.js`, Edge Function xác thực mã |
| Founder | Phiên `bakhiAdmin.v1` với scope founder | Rail nhóm **Quản trị** (Founder), link Founder Console | `bk-founder-auth.js`, `admin_sessions`, Edge Functions |
| Administrator | Phiên `bakhiAdmin.v1` với scope admin | Rail nhóm **Quản trị** (Quản trị), link Admin Console | `bk-founder-auth.js`, `admin_sessions`, Edge Functions |

## Quy tắc đã áp dụng trong `bk-rebirth.js`

- `adminAllowed()` chỉ **đọc** phiên quản trị đã có trong `sessionStorage` để quyết định hiện nhóm "Quản trị". Không tạo phiên, không nâng quyền, không gọi mạng.
- Nếu không đọc được phiên, nhóm "Quản trị" ẩn. Người dùng vẫn mở trực tiếp `/founder/` hoặc `/admin/` được, và trang đó tự kiểm tra quyền như cũ.
- Trang Founder/Admin/Studio **không** nhận rail/topbar công khai, tránh vô tình lộ điều hướng quản trị trong ảnh chụp màn hình hoặc khi chia sẻ.
- Nút "Báo lỗi" và liên kết GitHub mở tab mới với `rel="noopener noreferrer"`.

## Điều KHÔNG làm

- Không thêm/xoá dòng trong bảng vai trò, bảng admin, hay policy RLS.
- Không đổi tên khóa `bakhiAdmin.v1`, `devToken`, `bakhiStudent.v1`.
- Không để giao diện quyết định quyền: mọi hành động quản trị vẫn qua Supabase/Edge Function.

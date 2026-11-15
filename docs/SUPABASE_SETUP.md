# Bá Khí × Supabase — Hướng dẫn cài đặt đầy đủ

Hệ thống Supabase của Bá Khí gồm 4 phần:

| Phần | Tệp / vị trí | Vai trò |
|---|---|---|
| Cấu hình công khai | `assets/bakhi/bk-supabase.config.js` | **Nơi duy nhất** chứa Project URL + Publishable key |
| Lớp client | `assets/bakhi/bk-cloud.js` | Một Supabase client duy nhất: Anonymous Auth, nhận diện học sinh, thông báo, changelog, đồng bộ |
| Administrator Dashboard | `assets/bakhi/bk-devboard.js` + `admin/index.html` | 6 tab quản trị, xác thực Administrator Code qua Edge Function |
| Backend | `supabase/migrations/`, `supabase/functions/` | Schema + RLS + 6 Edge Functions |

> ⚠️ **Không bao giờ** đặt `service_role` key, secret key, database password, Administrator Code
> hay bất kỳ secret xác thực nào vào repository, HTML, JavaScript hoặc chat.
> Tất cả secret nằm trong **Supabase → Edge Functions → Secrets**.

## Trạng thái project hiện tại (15/11/2026)

Project `wzvslyabhizsiggurwdq` **đã được cài đặt và kiểm chứng**:

| Hạng mục | Trạng thái |
|---|---|
| Anonymous sign-ins | ✅ đã bật |
| Migration `20261115000000_bakhi_supabase.sql` | ✅ đã chạy — 9 bảng, RLS bật toàn bộ |
| 6 Edge Function | ✅ `ACTIVE`, `verify_jwt = false` |
| Secret `ADMIN_DEV_CODE` | ✅ đã đặt |
| Roster `students.txt` | ✅ 40 học sinh, 0 hồ sơ trùng tên |

Kiểm chứng end-to-end đã chạy trực tiếp trên project (không phải mock):

- Tạo phiên Anonymous Auth → 200.
- `search-students` với `nguyen hoang` (không dấu) → 4 kết quả đúng; `khoa anh` (đảo thứ tự) → `Phạm Anh Khoa`.
- Trình duyệt gọi `GET /rest/v1/students` → **403 permission denied** (đúng thiết kế: danh sách không công khai).
- `bind-student-session` → gắn `student_id`, trả `student_code`; gọi lại `{}` → khôi phục phiên không cần nhập tên.
- `sync-student-progress` → ghi 2 khoá; phiên mới gắn cùng tên **khôi phục đúng** practice + prefs; phiên chưa gắn đọc được **0 hàng** (RLS).
- Push thông báo qua `admin-actions` → học sinh đọc được bản published, bản draft trả `[]`.
- Administrator Code sai → `401 BAD_DEV_CODE`.

Dữ liệu test (tiến trình, thiết bị, thông báo, auth user) đã được xoá — project đang ở trạng thái sạch, chỉ còn 40 hồ sơ học sinh.

---

## Bước 1. Lấy Project URL

Supabase Dashboard → project của bạn → **Project Settings → Data API** →
`Project URL`, dạng `https://<project-ref>.supabase.co`.

## Bước 2. Lấy Publishable Key

Cùng trang → **API Keys** → sao chép **Publishable key**
(`sb_publishable_...`). Nếu project cũ chỉ có `anon public`, dùng khoá đó — cả hai
đều là khoá công khai và được bảo vệ bằng RLS.

**Không** dùng `service_role` / `secret` key ở bước này.

## Bước 3. Điền vào file cấu hình (KHU VỰC 1 và KHU VỰC 2)

Mở `assets/bakhi/bk-supabase.config.js`:

```js
/* [KHU VỰC 1 – SUPABASE PROJECT URL] */
var SUPABASE_URL = 'https://wzvslyabhizsiggurwdq.supabase.co';

/* [KHU VỰC 2 – SUPABASE PUBLISHABLE KEY] */
var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
```

Hai khu vực nằm cạnh nhau trong cùng tệp. Không đặt key ở bất kỳ tệp nào khác —
`bk-cloud.js` tạo **một** client duy nhất từ hai giá trị này. Nếu thiếu một trong hai,
website hiển thị cảnh báo “Cấu hình Supabase chưa hoàn tất” và vẫn hoạt động local-first
thay vì bị lỗi trắng.

## Bước 4. Bật Anonymous Auth

Dashboard → **Authentication → Sign In / Providers → Anonymous sign-ins** → bật.

Đây là danh tính phiên nội bộ duy nhất của học sinh. Không có email, mật khẩu hay
Google OAuth. Phiên được lưu bền trong `localStorage` (storage key `bakhi.auth.v1`) nên
học sinh không phải nhập lại tên sau khi tải lại trang hoặc đóng/mở trình duyệt.

Nên đặt **Authentication → Sessions → Time-box** đủ dài (ví dụ 30 ngày trở lên) để
hạn chế việc phải chọn lại tên.

## Bước 5. Chạy SQL migration

Dashboard → **SQL Editor** → dán toàn bộ nội dung
`supabase/migrations/20261115000000_bakhi_supabase.sql` → **Run**.

Tạo các bảng: `students`, `student_devices`, `student_progress`, `announcements`,
`announcement_reads`, `changelog`, `admin_activity_logs`, `admin_sessions`,
`rate_limits`; kèm trigger `updated_at`, index, unique constraint, RLS và realtime.

Hoặc dùng CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## Bước 6. Deploy Edge Functions

```bash
supabase functions deploy admin-auth
supabase functions deploy admin-actions
supabase functions deploy import-students
supabase functions deploy search-students
supabase functions deploy bind-student-session
supabase functions deploy sync-student-progress
```

Bắt buộc dùng `--no-verify-jwt` cho các function tự xác thực phiên riêng:

```bash
supabase functions deploy admin-auth --no-verify-jwt
supabase functions deploy admin-actions --no-verify-jwt
supabase functions deploy import-students --no-verify-jwt
supabase functions deploy search-students --no-verify-jwt
supabase functions deploy bind-student-session --no-verify-jwt
supabase functions deploy sync-student-progress --no-verify-jwt
```

Lý do: học sinh dùng Anonymous Auth và Administrator Dashboard dùng phiên quản trị riêng; cả hai
đều tự kiểm tra quyền bên trong function.

## Bước 7. Đặt Administrator Code (KHU VỰC 3)

Tự tạo một mã mạnh (tối thiểu 16 ký tự, không dùng lại mật khẩu khác), rồi:

```bash
supabase secrets set ADMIN_DEV_CODE='<mã-của-bạn>'
```

hoặc Dashboard → **Edge Functions → Secrets → Add new secret**.

| Secret | Bắt buộc | Mục đích |
|---|---|---|
| `ADMIN_DEV_CODE` | ✅ | Administrator Code dùng để mở Administrator Dashboard. Không lưu ở client. |
| `ADMIN_SESSION_HOURS` | – | Thời hạn phiên quản trị (mặc định 8, tối đa 24). |

Dev code được gửi tới `admin-auth`, so sánh theo thời gian hằng, giới hạn 8 lần / 10 phút
mỗi IP. Khi hợp lệ, function sinh token ngẫu nhiên 256-bit, chỉ lưu **hash SHA-256**
trong `admin_sessions`. Dashboard giữ token trong `sessionStorage` (mất khi đóng tab) và
gửi qua header `x-admin-token`; `admin-actions` xác thực lại ở **mỗi** thao tác.

## Bước 8. Các secret còn lại (KHU VỰC 4)

| Secret | Bắt buộc | Mục đích |
|---|---|---|
| `SUPABASE_URL` | ✅ tự có | Supabase tự inject cho Edge Functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ tự có | Supabase tự inject; **không** đặt vào repository và không gửi về client. |
| `STUDENT_ROSTER_SECRET` | – | Chỉ dùng để đối chiếu khi bạn muốn xác nhận một bản import do chính bạn khởi tạo (ví dụ chạy bằng script/CI). Dashboard hiện xác thực import bằng Dev session nên secret này không bắt buộc. Nếu đặt, dùng một chuỗi ngẫu nhiên ≥ 32 ký tự do bạn tự sinh. |

Trạng thái các secret được hiển thị trong **Administrator Dashboard → Settings** (chỉ hiện
“đã đặt / thiếu”, không bao giờ hiện giá trị).

## Bước 9. Cấu hình RLS (đã có trong migration)

Migration đã bật RLS cho toàn bộ bảng:

| Bảng | Học sinh (authenticated) | Ghi chú |
|---|---|---|
| `students` | **không có quyền** | Chỉ Edge Function (service_role) đọc — danh sách không công khai |
| `student_devices` | chỉ đọc hàng của `auth.uid()` | Ghi do `bind-student-session` |
| `student_progress` | đọc/ghi hàng của `bakhi_current_student_id()` | Không đọc được của người khác |
| `announcements` | chỉ đọc bản `is_published` | Ghi qua `admin-actions` |
| `announcement_reads` | đọc/ghi hàng của chính mình | Trạng thái đã đọc riêng từng học sinh |
| `changelog` | chỉ đọc bản `is_published` | Ghi qua `admin-actions` |
| `admin_activity_logs`, `admin_sessions`, `rate_limits` | **không có quyền** | Chỉ service_role |

Kiểm tra nhanh: mở Console trình duyệt khi đã chọn tên và chạy

```js
// Phải trả về [] hoặc lỗi quyền — không được trả về danh sách học sinh
await supabase.from('students').select('*');
```

## Bước 10. Storage bucket

Hệ thống **không cần** bucket công khai: nội dung TXT được gửi tới
`import-students` trong body request và chỉ lưu vào bảng `students`. Nhờ vậy danh sách
thật không bao giờ nằm trong repository hay GitHub Pages.

Nếu bạn muốn lưu bản gốc TXT để đối chiếu, tạo bucket **private** tên `rosters`:

```sql
insert into storage.buckets (id, name, public)
values ('rosters', 'rosters', false)
on conflict (id) do nothing;

create policy "roster admin read only"
on storage.objects for select to authenticated
using (false);  -- chỉ service_role truy cập được
```

## Bước 11. Import students.txt

1. Mở website → menu 3 gạch → **Administrator** → nhập **Administrator Code**.
2. Hoặc mở riêng trang `admin/index.html` — cũng yêu cầu Administrator Code.
3. Tab **Students** → chọn tệp `students.txt` (hoặc dán nội dung).
4. Bấm **Import danh sách**.

Kết quả hiển thị: số thêm mới / cập nhật / không đổi / trùng / bỏ qua.

Quy tắc xử lý: UTF-8, bỏ dòng trống và dòng bắt đầu bằng `#`, gộp khoảng trắng, bỏ dấu
khi so khớp. Hai hồ sơ trùng hoàn toàn họ tên **không** bị gộp: hồ sơ thứ hai phải có
thông tin phân biệt do Admin đặt trong tab Students (ví dụ “10A1”), nếu không sẽ bị đánh
dấu `needs_review` và không thể chọn.

## Bước 12. Kiểm tra hệ thống

| # | Việc cần thử | Kết quả mong đợi |
|---|---|---|
| 1 | Mở trang chủ lần đầu | Màn hình “CHÀO MỪNG BẠN ĐẾN VỚI BÁ KHÍ” + ô nhập tên |
| 2 | Gõ `minh anh` (không dấu) | Gợi ý đúng học sinh có dấu |
| 3 | Gõ `Minh Anh` (đảo thứ tự) | Gợi ý các học sinh chứa cả hai từ |
| 4 | Chọn tên → Xác nhận | Vào website, có tên ở header |
| 5 | F5 / đóng và mở lại trình duyệt | Không hỏi lại tên |
| 6 | Menu → Đổi học sinh | Quay lại màn hình nhập tên |
| 7 | Administrator Dashboard → Push notification | Chuông tăng số ngay, không cần F5 |
| 8 | Push changelog | Khu vực “What’s New” cập nhật ngay |
| 9 | Học 1 câu ở máy A, mở máy B chọn cùng tên | Tiến trình được khôi phục |
| 10 | Ngắt mạng → học tiếp → bật mạng | Tự retry, dữ liệu local không mất |

---

## Bảo mật & giới hạn cần biết

- **Tên học sinh không phải mật khẩu.** Người biết tên có thể chọn tên đó trên một
  trình duyệt mới. Đây là phương thức nhận diện thuận tiện, không phải xác minh danh
  tính bảo mật. Không dùng tên để bảo vệ dữ liệu nhạy cảm.
- Kiến trúc đã tách sẵn chỗ để bổ sung **PIN cá nhân** sau này: thêm cột hash PIN vào
  `students` và kiểm tra trong `bind-student-session`, không phải viết lại hệ thống.
- Giới hạn tốc độ: `search-students` 40 lượt/phút mỗi phiên; `bind-student-session`
  10 lượt/10 phút mỗi thiết bị; `admin-auth` 8 lượt/10 phút mỗi IP.
- `student_id` do máy chủ xác định từ `auth.uid()`; frontend không bao giờ gửi
  `student_id` khi đọc/ghi tiến trình.
- Nội dung thông báo và changelog được render bằng `textContent` (không `innerHTML`)
  nên không thể chèn HTML/script.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| “Cấu hình Supabase chưa hoàn tất” | Chưa điền KHU VỰC 1/2 |
| “Không tạo được phiên ẩn danh” | Chưa bật Anonymous sign-ins |
| “Không tìm thấy học sinh phù hợp” | Chưa import students.txt, hoặc hồ sơ bị vô hiệu |
| “Hồ sơ đang chờ Admin phân biệt” | Trùng họ tên, cần đặt thông tin phân biệt |
| “Phiên quản trị đã hết hạn” | Quá `ADMIN_SESSION_HOURS`, nhập lại Administrator Code |
| “Chưa cấu hình ADMIN_DEV_CODE” | Thiếu secret ở Bước 7 |
| Thông báo không tự cập nhật | Realtime chưa bật cho bảng; polling 60s vẫn hoạt động |

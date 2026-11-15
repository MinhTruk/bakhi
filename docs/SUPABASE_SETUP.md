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
| Thông báo toàn website (3.2.0) | ✅ chuông ở trang chủ, trang bài học và Studio |

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

Sau đó chạy tiếp migration gia cố bảo mật (xem
[Gia cố bảo mật](#gia-cố-bảo-mật-15112026)):

```
supabase/migrations/20261116000000_bakhi_security_hardening.sql
```

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

### Vai trò & xác thực từng function

| Function | Người gọi | Xác thực | Giới hạn |
|---|---|---|---|
| `search-students` | Học sinh (ẩn danh) | Phiên Supabase | 40 lượt/phút/phiên |
| `bind-student-session` | Học sinh (ẩn danh) | Phiên + họ tên đối chiếu server | 10 lượt/10 phút/thiết bị |
| `sync-student-progress` | Học sinh (ẩn danh) | Phiên + `student_id` do server suy ra | Theo phiên |
| `admin-auth` | Giáo viên | `ADMIN_DEV_CODE` so sánh hằng thời gian | 8 lượt/10 phút/IP |
| `admin-actions` | Dashboard | `x-admin-token` (hash trong `admin_sessions`) | Theo phiên quản trị |
| `import-students` | Dashboard / script | `x-admin-token` hoặc `STUDENT_ROSTER_SECRET` | Theo phiên |

Riêng `admin-actions` xác thực lại ở **mỗi** thao tác, không tin trạng thái đã đăng nhập ở
client. Token quản trị chỉ nằm trong `sessionStorage`, mất khi đóng tab.

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
| `student_progress` | **chỉ đọc** hàng của `bakhi_current_student_id()` | Ghi duy nhất qua `sync-student-progress` (service_role); trình duyệt không có quyền INSERT/UPDATE |
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
- Administrator Code không bao giờ nằm trong bundle; chỉ hash SHA-256 của token phiên
  được lưu trong `admin_sessions`, token thật ở `sessionStorage` của tab quản trị.
- Publishable key là khoá công khai; bảo vệ dữ liệu dựa hoàn toàn vào RLS + Edge Function.

### Gia cố bảo mật (15/11/2026)

Kết quả audit schema + RLS trên DB thật phát hiện một điểm dễ sai: **Supabase đặt default
privileges cho schema `public`**, nên mọi hàm mới tự động có `EXECUTE` cho `anon`,
`authenticated` và `service_role`. Lệnh `revoke ... from public` **không** thu hồi quyền đã
cấp trực tiếp cho hai vai trò kia. Vì vậy migration gốc để lọt hai đường:

| Trước | Sau (migration gia cố) |
|---|---|
| `anon` gọi được `bakhi_rate_limit()` → ai có publishable key cũng thêm được hàng `rate_limits` không giới hạn | Chỉ `service_role` (Edge Function) gọi được |
| `anon` gọi được `bakhi_current_student_id()` | Chỉ `authenticated` + `service_role` |
| `authenticated` INSERT/UPDATE trực tiếp `student_progress` → bỏ qua giới hạn 1,5 MB và quy tắc mốc thời gian | Chỉ `SELECT`; mọi lượt ghi đi qua `sync-student-progress` |
| `bakhi_touch_updated_at` không khoá `search_path` | `search_path = public, pg_temp` |
| Thiếu index cho FK `announcement_reads.announcement_id` | Đã thêm `announcement_reads_announcement_idx` |
| Policy `student_devices` gọi `auth.uid()` mỗi hàng | `(select auth.uid())` — tính một lần mỗi câu lệnh |

Kiểm tra lại quyền (phải ra đúng như bảng trên):

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'student_progress'
group by grantee;
```

Hai bảng `admin_activity_logs`, `admin_sessions`, `rate_limits` và `students` vẫn hiện cảnh báo
“RLS Enabled No Policy” trên Security Advisor — **đây là chủ ý**: chúng đã bị `revoke` toàn bộ
quyền khỏi `anon`/`authenticated` và chỉ `service_role` dùng, nên không cần policy.

## Thông báo trên toàn website

Từ phiên bản 3.2.0, lớp thông báo chạy ở hai chế độ:

| Trang | Chế độ | Đã đọc lưu ở | Gọi Edge Function |
|---|---|---|---|
| `index.html` | Đầy đủ | `announcement_reads` (Supabase) | `bind-student-session`, `sync-student-progress` |
| Trang môn/bài học, `studio/*` | Chỉ thông báo | `bakhiNotifyReads.v1` (local) | Không |

Hệ quả cần biết khi vận hành:

- Học sinh **không cần chọn tên** để thấy thông báo trên trang bài học. Trang chỉ đọc bảng
  `announcements`/`changelog` bản `is_published` bằng phiên ẩn danh.
- Trạng thái đã đọc trên trang bài học **không** đồng bộ lên Supabase; đây là chủ ý để
  không cần hồ sơ học sinh. Trên trang chủ, trạng thái vẫn đồng bộ theo hồ sơ.
- Realtime dùng kênh `bakhi-public` cho hai bảng `announcements` và `changelog`. Nếu dự án
  tắt realtime, chuông vẫn cập nhật qua poll 60 giây và khi mạng có lại.
- Thông báo mới hiện ngay khi giáo viên bấm **PUSH NOTIFICATION NOW**; không cần deploy lại
  trang tĩnh.

### Kiểm tra thông báo realtime

1. Mở một trang bài học ở cửa sổ thường, giữ nguyên.
2. Ở cửa sổ ẩn danh, mở Administrator Dashboard → Notifications → tạo và push một thông báo.
3. Trong vài giây, chuông ở cửa sổ thứ nhất tăng badge và hiện mục mới.
4. Bấm chuông → đọc → badge giảm; tải lại trang → trạng thái đã đọc được giữ.
5. Tắt mạng, push thông báo khác, bật mạng lại → trong tối đa 60 giây thông báo xuất hiện.

## Vận hành & bảo trì

### Xoay Administrator Code

```bash
supabase secrets set ADMIN_DEV_CODE='<mã-mới>'
```

Sau khi đổi, các phiên quản trị đang mở vẫn dùng được tới khi hết hạn (`ADMIN_SESSION_HOURS`);
muốn thu hồi ngay, xoá các hàng trong `admin_sessions`:

```sql
delete from public.admin_sessions;
```

### Kiểm tra sức khoẻ định kỳ

| Việc | Cách làm |
|---|---|
| RLS còn bật | `select relname, relrowsecurity from pg_class where relname in ('students','announcements','changelog');` |
| Realtime còn bật | Dashboard → Database → Replication → kiểm tra `announcements`, `changelog` |
| Function còn sống | Dashboard → Edge Functions → trạng thái `ACTIVE` |
| Rate limit | Xem bảng `rate_limits`; dọn định kỳ nếu phình to |
| Quyền hàm | `select proname, has_function_privilege('anon', oid, 'execute') from pg_proc where pronamespace = 'public'::regnamespace;` — `anon` phải là `false` với cả ba hàm |
| Log thao tác | Administrator Dashboard → Activity Logs |
| Phiên cũ | Xoá `admin_sessions` hết hạn, `student_devices` không dùng |

### Chạy lại migration an toàn

Migration dùng `create table if not exists`, `drop policy if exists` và `create or replace
function`, nên chạy lại không làm mất dữ liệu. Tuy vậy vẫn nên sao lưu trước:

```bash
supabase db dump --data-only > backup.sql
```

**Luôn chạy đủ hai tệp theo đúng thứ tự**: `20261115000000_bakhi_supabase.sql` rồi
`20261116000000_bakhi_security_hardening.sql`. Tệp đầu có `grant select, insert, update on
public.student_progress to authenticated`; nếu chạy riêng nó, quyền ghi trực tiếp sẽ mở lại và
phải chạy tệp gia cố để đóng.

### Dọn dữ liệu test

```sql
delete from public.student_progress where student_id in (select id from public.students where student_code like 'TEST%');
delete from public.announcements where title like '[TEST]%';
delete from public.changelog where version like '0.0.%';
```

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
| Chuông không hiện trên trang bài học | Thiếu thẻ `bk-cloud.js` hoặc sai đường dẫn tương đối |
| Chuông hiện nhưng không có thông báo | Chưa có bản `is_published`, hoặc RLS/publishable key sai |
| Đã đọc trên trang bài học nhưng trang chủ vẫn báo chưa đọc | Hai nguồn trạng thái khác nhau (local vs Supabase) — đúng thiết kế |
| Dashboard báo 401 khi push | Token hết hạn hoặc `admin_sessions` bị xoá |
| Import báo 0 học sinh | Tệp sai UTF-8, hoặc mọi dòng bắt đầu bằng `#` |
| Trang trắng sau khi deploy | Đường dẫn tuyệt đối thay vì tương đối; kiểm tra Console/Network |

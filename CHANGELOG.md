# Changelog

Mọi thay đổi đáng chú ý của Bá Khí. Định dạng dựa trên Keep a Changelog.

## [7.9.2] — 2026-11-20

### Tính năng

- **Đăng nhập Founder ngay trên màn hình bảo trì, cho toàn bộ website.** Mọi trang công khai
  (trang chủ, 116 trang môn học/Studio, chat, hồ sơ, cài đặt) dùng chung một màn hình bảo trì
  với nút **Đăng nhập Founder**. Nút mở giao diện nhập mã ngay trên màn hình đó: ô mã bị che,
  có nút hiện/ẩn, nút quay lại, trạng thái đang xác thực và thông báo lỗi rõ ràng.
- **Một cơ chế xác thực Founder duy nhất.** Nút trên màn hình bảo trì, trang `founder/` và
  Founder Dashboard cùng dùng Edge Function `admin-auth` với `scope = founder`, cùng bảng
  `founder_config` (chỉ lưu băm SHA-256), cùng bảng phiên `admin_sessions` và cùng thời hạn
  phiên. Không có mã Founder thứ hai, không có hệ đăng nhập thứ hai.
- **Máy chủ xác minh lại phiên** bằng action mới `admin-actions` → `session.check` trước khi
  gỡ màn hình bảo trì. Sửa `sessionScope` trong JavaScript, dựng lại sessionStorage hay gọi
  thẳng API đều không vượt được bước này.
- **Founder Dashboard → Bảo trì** có thêm khu **Founder Access**: trạng thái phiên Founder,
  trạng thái bảo trì toàn hệ thống, thời gian bắt đầu do máy chủ ghi, nút mở trang bảo trì và
  mở Founder Dashboard. Bật/tắt bảo trì đều có hộp xác nhận.

### Sửa lỗi

- **Administrator không còn vượt được bảo trì toàn hệ thống.** Hai màn hình bảo trì cũ (một
  trong `bk-shell.js`, một trong `bk-core.js`) đều cho nhập Administrator Code để mở khoá;
  màn hình cũ trong `bk-core.js` đã bị gỡ hẳn và `bk-shell.js` chỉ chấp nhận phiên Founder do
  máy chủ xác nhận.
- **Chỉ còn một màn hình bảo trì.** `bk-cloud.js` không còn tự vẽ thông báo bảo trì thứ hai;
  nó chỉ phát trạng thái để `bk-shell.js` dựng đúng giao diện chung.
- **Administrator không còn thấy công tắc bảo trì** trong mục feature flag của dashboard;
  máy chủ vẫn chặn `settings.set` cho `public.maintenance` (chỉ Founder).
- **Thiên Khải Sáng Thế không còn được tự gắn cờ Founder theo tên hiển thị.** `badges.grant`
  chỉ cấp badge `founder` khi hồ sơ đã có `is_founder = true`; việc trao và thu hồi badge độc
  quyền đều bắt buộc phạm vi Founder và được ghi `admin_activity_logs`.
- **Sửa quyền đọc `app_settings` cho khách chưa đăng nhập.** Migration 5.0 đã tạo policy
  `app_settings_select_anon` (chỉ khoá `public.*`) nhưng thiếu `grant select ... to anon`,
  nên trình duyệt nhận lỗi `42501 permission denied for table app_settings`: màn hình bảo trì
  và feature flag công khai không bao giờ tải được. 7.9.2 cấp đúng quyền đọc (không mở quyền
  ghi — PATCH từ anon vẫn bị từ chối) trong migration
  `20261205000000_bakhi_v792_maintenance_fields.sql`.
- **Mã Founder sai trả về đúng một thông báo** “Mã Founder không hợp lệ.”, không phân biệt mã
  rỗng, sai hay chưa cấu hình; giới hạn 5 lần thử / 10 phút theo IP kèm thời gian thử lại.

### Cải tiến

- Màn hình bảo trì theo đúng đặc tả: nền đen tuyền, nội dung căn giữa, tiêu đề **Bảo trì**,
  lý do (không hardcode), **Thời gian bắt đầu** lấy từ máy chủ/DB, vòng xoay tải và nút Đăng
  nhập Founder là tương tác duy nhất; navbar và nội dung website phía dưới bị ẩn.
- `public.maintenance` lưu thêm `maintenance_enabled`, `maintenance_reason`,
  `maintenance_started_at`, `maintenance_started_by`, `maintenance_updated_at`; các khoá
  camelCase cũ được giữ để tương thích.
- Đồng bộ trạng thái bảo trì không cần xoá cache: realtime `app_settings` cập nhật ngay, và
  khi kết nối realtime được khôi phục, `bk-cloud.js` đọc lại toàn bộ feature flag.
- Nâng toàn bộ website lên 7.9.2 (122 tệp HTML, `bk-version.js`, dashboard, chat, Edge Function).

## [7.9.1] — 2026-11-20

### Sửa lỗi

- **Bấm vào hồ sơ ở trang chủ không còn tự chạy tìm kiếm theo tên đăng nhập.** Từ 7.9.0, khung
  tìm kiếm căn bản đã bị gỡ khỏi giao diện nhưng mã của nó vẫn còn sống trong `index.html`:
  ô `#searchInput` vẫn nằm trong DOM (chỉ bị ẩn bằng CSS), vẫn gắn `oninput` và vẫn nhận sự kiện
  `input` do trình duyệt/trình quản lý mật khẩu tự điền. Khi việc đó xảy ra, `handleSearch()`
  ẩn `#categoriesTree` và hiện “Không tìm thấy kết quả phù hợp cho từ khóa …”, khiến các thẻ môn
  học biến mất và không bấm được cho tới khi tải lại trang.
- Đã gỡ **toàn bộ** hệ thống tìm kiếm căn bản ở trang chủ: ô nhập, khu kết quả
  (`#searchResultsSection`), `handleSearch()`, `debouncedSearch()`, hai hàm chỉ phục vụ nó
  (`hlText`, `norm`/`nrm1`), phím tắt `Ctrl/⌘ + /` mở ô cũ, và đoạn mã gắn cứng vào nó trong
  hiệu ứng click.
- `bk-shell.js` không còn dựng ô tìm kiếm trong menu hồ sơ và không còn `hookSearch()` bọc
  `debouncedSearch`; mở menu hồ sơ chỉ đưa focus vào mục đầu tiên, không vào ô nhập nào.

### Cải tiến

- Thành tích **Tầm Bảo Nhất Niệm** (dùng tìm kiếm) giờ đếm ở bảng lệnh kiêm tìm kiếm toàn cục
  trong Trung tâm học tập — tìm kiếm duy nhất còn lại của website — thay vì ô tìm kiếm đã gỡ.
- Nâng toàn bộ website lên 7.9.1 (122 tệp HTML, `bk-version.js`, dashboard, chat, Edge Function).

## [7.9.0] — 2026-11-19

### Tính năng

- **Founder trao badge/khung Founder cho mọi học sinh.** Ngoại lệ duy nhất là badge tối cao
  **Thiên Khải Sáng Thế** (`founder`), vẫn chỉ cấp cho hồ sơ `is_founder = true`. 20 badge và
  khung Founder còn lại, cùng các danh hiệu ánh xạ, do Founder trao tay từ
  **Founder Dashboard → Thành tích** cho bất kỳ học sinh đang hoạt động; máy chủ kiểm tra lại
  quyền và ghi `admin_activity_logs`.
- Founder Dashboard chặn chọn Thiên Khải Sáng Thế khi người nhận không phải hồ sơ Founder và
  hiện nhãn “Chỉ hồ sơ Founder”.

### Sửa lỗi

- `titles.grant` không còn chặn mọi danh hiệu `founder_only` với học sinh thường: chỉ danh hiệu
  “Nhà Sáng Lập” giữ giới hạn hồ sơ Founder, các danh hiệu Founder khác vẫn yêu cầu sở hữu
  badge nguồn trước khi dùng.

### Cải tiến

- Gỡ secret `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` khỏi Supabase sau khi passkey đã bị loại bỏ hoàn toàn.
- Nâng toàn bộ website lên 7.9.0 (122 tệp HTML, `bk-version.js`, dashboard, chat, Edge Function).

## [7.8.0] — 2026-11-19

### Tính năng

- **Mật mã đăng nhập thay hoàn toàn passkey.** Mỗi học sinh có thể đặt mật mã 4–32 ký tự trong
  **Cài đặt → Hồ sơ → Mật mã đăng nhập**. Khi bấm đúng họ tên và xác nhận, nếu hồ sơ đã gắn mật
  mã thì màn hình nhận diện hiện thêm **một khung nhập mật mã**; nhập đúng rồi bấm “Mở khoá”
  mới vào được Bá Khí. Mật mã lưu dạng băm PBKDF2-SHA256 (salt riêng, 120.000 vòng) trên máy
  chủ, không lưu mật mã thô, nên dùng được trên điện thoại, máy tính và mọi trình duyệt —
  khắc phục việc passkey trình duyệt chỉ dùng được trên máy đã tạo credential.
- Đổi hoặc gỡ mật mã phải nhập đúng mật mã hiện tại; có nút **Hiện/Ẩn** khi nhập và thông báo
  số lần thử còn lại.

### Sửa lỗi

- Sai mật mã 5 lần liên tiếp sẽ tạm khoá 10 phút (`student_login_codes.failed_count`/
  `locked_until`), thêm giới hạn 30 lượt/10 phút mỗi thiết bị để chống dò mật mã.
- Hồ sơ có mật mã không còn bị gắn thiết bị trước khi xác thực: `bind-student-session` chỉ trả
  `code_required`, không upsert `student_devices`.

### Cải tiến

- Gỡ toàn bộ mã và dữ liệu passkey: xoá Edge Function `passkey-api`, `_shared/passkeys.ts`,
  `student_passkeys`, `passkey_challenges`; secret `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` không còn
  dùng. Migration `20261204000000_bakhi_v780_login_code.sql` chỉ bổ sung bảng mới và idempotent.
- `student-profile` thêm `code`, `code.set`, `code.remove`; `bk-cloud.js` bỏ API passkey, thêm
  `loginCodeStatus`/`loginCodeSet`/`loginCodeRemove`; kiểm thử `cloud-smoke`/`shell-smoke` cập
  nhật theo luồng mật mã.

## [7.7.1] — 2026-11-18

### Sửa lỗi

- **Đổi khung avatar không còn nhân bản khối “Danh hiệu”**: mỗi lần bấm một khung trong
  **Hồ sơ / Cài đặt → Khung avatar**, giao diện thay nhầm ô lưới khung bằng cả một cụm mới, nên
  cụm cũ nằm lại và cứ mỗi lần đổi khung lại lồng thêm một cụm — khối “Danh hiệu” vì thế xuất
  hiện nhiều lần và lặp liên tục. Nay chỉ một cụm `.bk-frames-wrap` tồn tại, được thay trọn gói
  mỗi lần đổi khung.
- Không còn lưới khung lồng nhau sau nhiều lần đổi khung; vị trí và số khung giữ nguyên.

### Cải tiến

- Thêm `tools/qa/version-audit.js` để kiểm tra “nâng cấp toàn bộ”: mọi tài nguyên nội bộ của
  123 trang đều tồn tại, mọi `?v=` trùng `APP_VERSION`, không còn phiên bản cũ trong HTML/JS,
  không trang nào nạp trùng mô-đun, và 5 trang dùng Danh hiệu nạp `bk-titles.js/css` đúng một lần.
- `shell-smoke` thêm 6 kiểm tra hồi quy cho lỗi nhân bản khối Danh hiệu khi đổi khung.

## [7.7.0] — 2026-11-18

### Sửa lỗi

- **Cấp trọn bộ badge hoạt động thật**: RPC `bakhi_grant_badges` báo lỗi
  `42702 column reference "badge_id" is ambiguous` (OUT parameter trùng tên cột), nên mọi lần
  “Cấp toàn bộ badge” và “Cấp trọn bộ cho hồ sơ Founder” đều thất bại ở máy chủ. Migration
  `20261203000001_bakhi_v770_grant_badges_fix.sql` thêm `#variable_conflict use_column`.
- **Một hợp đồng phản hồi trao tặng duy nhất**: `badges.grantAll`, `founder.grantAll`,
  `founder.grantItem`, `avatar.grant`, `badges.grant` đều trả `success`, `status`,
  `requested_count`, `granted_count`, `already_owned_count`, `failed_count`, `granted_badges`,
  `errors`, `message`. Không còn cảnh giao diện đoán số lượng hay in “undefined badge”.
  Phản hồi không rõ kết quả thì giao diện chuyển sang **“Cần đối soát giao dịch”** và không tự
  gửi lại.
- **Chống trao trùng và chạy lặp**: cùng `request_id` được máy chủ nhận diện (`replayGrant`) và
  trả lại kết quả cũ, không cấp thêm, không ghi lịch sử hai lần; nút gửi bị khoá khi đang chạy.
- **Hai lỗi `titles.*` / `titles.save`**: Edge Function `admin-actions` đang deploy là bản cũ
  (v19) không có namespace `titles.*` — đã deploy bản 7.7.0 và xác minh trực tiếp trên máy chủ
  thật (tạo, cập nhật, trao, gỡ, ngừng dùng, bổ sung danh hiệu mặc định).
- **Lỗi máy chủ không còn `[object Object]`**: nhánh lỗi chung đọc `message`/`code`/`details`
  của PostgrestError để chẩn đoán được.

### Tính năng mới

- **Founder Dashboard chia 3 tab**: **Thành tích** (tồn kho, trao một/nhiều vật phẩm, cấp hàng
  loạt, tự động xét badge, cấp trọn bộ, lịch sử), **Danh hiệu** (danh mục Title, trao/gỡ, người
  giữ, bổ sung danh hiệu mặc định) và **Founder** (chỉ còn xác minh hồ sơ Founder + đặt danh vị).
- **Trao nhiều vật phẩm cùng lúc**: chọn nhiều badge/khung trong lưới, xác nhận một lần, báo cáo
  riêng số cấp mới / đã sở hữu / lỗi.
- **Danh hiệu hai kiểu hiển thị**: Bình thường (font thường, màu tĩnh) và Đặc biệt (font riêng +
  gradient chuyển động: flow, shimmer, pulse, aurora), có bảng màu cấu hình và xem trước.
- **35 danh hiệu mặc định ánh xạ từ badge**: 10 badge tự động tiêu biểu (kiểu Bình thường) +
  21 Founder + 2 Developer + 2 Administrator (kiểu Đặc biệt). Mỗi danh hiệu giữ `badge_id`
  nguồn để xác minh quyền sở hữu; không tạo danh sách dữ liệu trùng lặp.
- **Học sinh tự chọn danh hiệu**: khối “Danh hiệu” trong Hồ sơ/Cài đặt liệt kê đúng danh hiệu
  mình sở hữu (badge nguồn hoặc được trao tay), cho trang bị, đổi và gỡ.
- **Mô-đun dùng chung `bk-titles.js` / `bk-titles.css`**: một cách vẽ nhãn danh hiệu cho Chat,
  Hồ sơ, Cài đặt và Dashboard; hiệu ứng tắt khi `prefers-reduced-motion` hoặc khi người dùng tắt
  animate khung.
- Action chẩn đoán `version` trong `admin-actions` để dashboard hiển thị đúng phiên bản máy chủ.

### Cải tiến

- Migration `20261203000000_bakhi_v770_titles_rework.sql`: thêm cột `badge_id`, `style`, `font`,
  `palette`, `effect`, `created_by`, `updated_by` (chỉ thêm, idempotent), bảng
  `bakhi_title_grants`, hàm `bakhi_title_eligible()` và seed 35 danh hiệu mặc định.
- `chat-api` trả kèm `style`, `font`, `palette`, `effect` trong `title` của mọi profile card.
- `student-profile` thêm action `titles` (đọc danh hiệu khả dụng) và `title` (trang bị/gỡ), kiểm
  tra quyền sử dụng ở máy chủ, không tin dữ liệu phân quyền từ client.

## [7.6.1] — 2026-11-18

### Sửa lỗi

- **Founder Dashboard không còn trao “undefined badge”**: báo cáo cấp badge hàng loạt và cấp
  trọn bộ đọc số lượng qua hàm chuẩn hoá, nên khi máy chủ trả thiếu trường (bản cũ hoặc chỉ trả
  `{ ok, count }`) giao diện hiện đúng số badge đã cấp, số đã sở hữu và số badge độc quyền bị
  loại trừ thay vì `undefined`; nếu phản hồi không có số nào thì hiện thông báo rõ ràng để đối
  chiếu lại tồn kho.
- **Bản xem trước và hộp xác nhận cấp hàng loạt** luôn có số badge hợp lệ (0 khi thiếu dữ liệu),
  không còn “Dự kiến cấp undefined badge”.
- **Số khung avatar ở khu “Cấp trọn bộ cho hồ sơ Founder”** đếm từ ánh xạ badge → khung khi
  trang Founder không nạp `bk-profile.js`, thay vì báo 0 khung.
- **Dòng tồn kho vật phẩm** hiện `x / 99 badge` ngay cả khi phản hồi thiếu `catalogTotal` hoặc
  danh sách khung.

## [7.6.0] — 2026-11-17

### Tính năng mới

- **Hệ thống Danh hiệu (Title)**: lớp hoàn toàn mới, **độc lập với badge, khung avatar và
  thành tích**. Mỗi học sinh giữ tối đa một danh hiệu, do Founder trao tay; danh hiệu không
  tự mở khoá và không ảnh hưởng tới badge đang có.
- **Danh hiệu hiển thị TRƯỚC tên trong chat** ở mọi vị trí: bong bóng tin nhắn, đầu hội thoại,
  danh sách đoạn chat (nhắn riêng), danh sách chọn người nhận, thẻ hồ sơ và dòng “Hồ sơ của bạn”.
  Nhãn có màu + icon riêng và cập nhật realtime khi Founder trao hoặc thu hồi.
- **Founder Dashboard → Danh hiệu**: trao/thu hồi danh hiệu cho từng học sinh, xem số người giữ,
  thêm/sửa danh hiệu (mã, tên, nhãn ngắn, màu, icon, mô tả, thứ tự, chỉ-Founder) và ngừng dùng.
- **12 danh hiệu khởi đầu**: Nhà Sáng Lập, Quản Trị Viên, Kỹ Sư Hệ Thống, Học Giả, Nhà Thám Hiểm,
  Tiên Phong, Chiến Lược Gia, Nghệ Nhân, Người Dẫn Đường, Người Giữ Lửa, Mầm Xanh, Ngôi Sao Bá Khí.

### Cải tiến

- `chat-api` trả `title` trong **mọi** profile card (`profiles.cards`, `students.search`,
  thành viên phòng, người gửi tin) nên chat hiển thị danh hiệu mà không cần thêm request.
- Migration `20261202000000_bakhi_v760_titles.sql`: bảng `bakhi_titles` (danh mục) và
  `student_titles` (danh hiệu hiện tại), RLS chỉ cho đọc, realtime cho cả hai bảng, seed 12
  danh hiệu — chạy lại nhiều lần vẫn an toàn và không ghi đè danh hiệu Founder đã sửa.
- Founder Dashboard báo rõ khi máy chủ chưa có action `titles.*` thay vì lỗi thô.

## [7.5.3] — 2026-11-17

### Tính năng mới

- **Đủ 21 khung avatar Founder cho 21 badge Founder**: thêm 4 khung độc quyền mới —
  Khởi Nguyên (`founder-genesis`), Liên Kết (`founder-nexus`), Mã Nguồn Gốc
  (`founder-prime-code`), Di Sản (`founder-legacy`) — nên mỗi badge Founder (Genesis → Ascendant)
  mở khoá đúng một khung riêng. Tổng **50 khung**: 27 thường + 2 Developer + 21 Founder.
- **Mỗi khung Founder có mô tả và cách lấy** trong hộp chi tiết khung (ví dụ “Cách lấy: mở khoá
  badge ‘Genesis’ — badge Founder độc quyền, chỉ Founder trao tay”).
- **Vẽ lại 7 khung Founder cũ bằng bộ hình tượng riêng**: Thiên Khải, Vô Cực Hoàng Đế, Thiên Long,
  Vàng Nguyên Tắc, Lòng Nõn, Tinh Thần Tinh Thạch, Sen Neon — thay cho việc ghép primitive
  dùng chung. Mọi khung Founder nay có `art` riêng (21 bộ vẽ).
- **Lớp hoàn thiện dùng chung cho mọi khung**: viền trong, ánh phản chiếu chéo và quầng sáng
  ngoài, giúp cả 50 khung (kể cả khung thường) trông sâu và sạch hơn.

### Sửa lỗi

- **“Hành động không hợp lệ: students.search” và “admin.items.list”**: nguyên nhân là Edge
  Function `admin-actions` trên máy chủ còn bản cũ, chưa có các action 7.5.x. Founder Dashboard
  nay tự lùi về action tương thích (`students.list`, `badges.list`, `badges.grant`) và dựng danh
  mục vật phẩm cục bộ từ `bk-badges.js`, nên tìm người nhận, chọn vật phẩm, đọc tồn kho và
  trao tặng vẫn dùng được ngay; bản xem trước “trao toàn bộ badge” cũng tính cục bộ.
- **Lỗi tương tự ở các action mới khác**: `students.inventory`, `founder.grantItem`,
  `badges.grantAllPreview` có fallback; `admin.grantHistory` báo rõ cần deploy thay vì lỗi thô.
- Migration `20261201000000_bakhi_v753_founder_frames.sql` thêm 4 ánh xạ badge → khung mới
  (idempotent), không đổi id khung cũ nên không ai mất quyền sở hữu.

## [7.5.2] — 2026-11-17

### Sửa lỗi

- **Cơ cấu badge thống nhất toàn website — 99 badge = 74 tự động + 21 Founder + 2 Developer
  + 2 Administrator**: thêm `BK.badges.breakdown()` và `BK.badges.summaryText()` suy ra trực tiếp
  từ danh mục, nên mọi nơi hiển thị cùng một con số. Hết cảnh 89/78 badge ở trang hồ sơ,
  Cài đặt và dashboard.
- **Thông báo tặng badge ở tab Badge và tab Founder**: bản xem trước, hộp kết quả và toast đều
  nêu rõ danh mục (74 tự động · 21 Founder · 2 Developer · 2 Administrator) và số badge bị loại
  trừ (21 Founder + 2 Developer); không còn hiện `undefined` khi cấp trọn bộ.
- **Máy chủ trả kèm cơ cấu danh mục** trong `founder.grantAll`, `badges.grantAll`,
  `badges.grantAllPreview` và `students.inventory` (`catalog: { total, auto, founder, dev, admin }`)
  để giao diện không phải tự đếm và không lệch với `bk-badges.js`.
- **Founder Dashboard (tab Thành tích)**: bảng số liệu tách đủ 5 ô — Tổng 99, Tự động 74,
  Founder 21, Developer 2, Administrator 2 — tính trên toàn danh mục, kể cả khi Administrator
  chỉ trao được badge thường.
- **Giữ nguyên các fix đã có ở 7.5.1**: `students.search` đọc avatar từ `student_profiles`,
  `admin.grantHistory` bỏ kiểu nhúng `students:target_student` + fallback schema 7.4.0,
  kiểm tra UUID cho `id` (chuỗi "undefined" không còn gây lỗi 22P02) và ghi lịch sử cấp
  không còn nuốt lỗi.

## [7.5.1] — 2026-11-17

### Sửa lỗi

- **`students.search` luôn lỗi**: câu truy vấn chọn `avatar_url` từ `public.students` — cột này
  nằm ở `student_profiles`, nên PostgREST trả 42703 và Founder Dashboard không tìm được người
  nhận. Nay tách thành hai bước: tìm hồ sơ, rồi đọc avatar từ `student_profiles`.
- **Danh mục badge chỉ còn 89 trên toàn website**: mọi trang vẫn nạp `bk-badges.js?v=7.1.0`
  (bản 89 badge) nên trình duyệt dùng bản cache cũ. Đồng bộ toàn bộ chuỗi phiên bản tài sản
  lên `7.5.1` ở 122 tệp HTML/JS; khôi phục đủ **99 badge** (74 tự động + 25 trao tay).
- **Founder/Administrator Dashboard ghi cứng "89 badge"**: nay lấy `catalog.length` từ danh mục,
  không còn số viết tay lệch với `bk-badges.js`.
- **`admin.grantHistory` hỏng khi đọc lịch sử cấp**: bỏ kiểu nhúng `students:target_student(...)`
  (chỉ cần FK/policy khác là PostgREST trả PGRST200 và mất cả bảng), tra tên người nhận bằng
  truy vấn thứ hai; nếu cơ sở dữ liệu chưa chạy migration 7.5.0 thì đọc lại theo cột của 7.4.0.
- **Ghi lịch sử cấp thất bại âm thầm**: `admin_grant_history`/`admin_grant_batches` không còn
  nuốt lỗi; khi thiếu cột/bảng mới, lịch sử được ghi theo đúng các cột 7.4.0 để không mất dấu vết.
- **Cấp toàn bộ badge cho "undefined"**: mọi action nhận `id` nay kiểm tra UUID (chuỗi "undefined"
  không còn được gửi vào `.eq('id', …)` và gây lỗi 22P02), `founder.grantAll` coi id không hợp lệ
  là "để máy chủ tự xác định hồ sơ Founder", và thông báo trên giao diện lấy đúng trường
  `added`/`badgeTotal`/`studentName` thay vì hiện `undefined`.

### Cải tiến

- Sau khi cấp trọn bộ ở Cài đặt, danh sách badge hiển thị được đồng bộ lại từ `students.inventory`.

## [7.5.0] — 2026-11-17

### Tính năng mới

- **10 Founder Badge 7.5.0 có hình tượng riêng**: Genesis, Architect, Eternal Flame, Nexus,
  Celestial, Chronos, Void Sentinel, Prime Code, Legacy, Ascendant. Mỗi badge có SVG nhiều lớp,
  bảng màu và silhouette riêng (`BK.badges.art`), hiển thị cả trong lưới thành tích và
  hộp xem chi tiết. Tổng danh mục: **99 badge** (74 tự động + 25 trao tay).
- **6 khung Founder concept mới**: Thiên Văn Đài, Vực Thẳm, Phượng Hoàng Tái Sinh,
  Pha Lê Đế Vương, Cỗ Máy Thời Gian, Băng Đế — mỗi khung có bộ vẽ bespoke thay vì
  ghép primitive dùng chung. Tổng **46 khung** (27 thường + 2 Developer + 17 Founder).
- **Bộ chọn người nhận dùng chung** cho mọi thao tác trao: debounce 280 ms, trạng thái
  loading/empty/error, avatar + tên + mã phân biệt + nhãn Founder, bỏ chọn và đổi người nhận.
- **Bộ chọn vật phẩm thống nhất** với 4 nhóm (Badge / Founder Badge / Khung / Khung Founder),
  lọc theo tên hoặc mã, tuỳ chọn "chỉ món chưa sở hữu", xem trước lớn, nhãn trạng thái sở hữu.
- **Hộp xác nhận trước mọi thao tác ghi** (người nhận, loại, vật phẩm, hiện trạng, lý do) và
  khoá nút khi đang gửi; mỗi yêu cầu có `request_id`.
- **Báo cáo tự động xét badge đầy đủ**: mới cấp / đã sở hữu / chưa đủ điều kiện / bị loại trừ kèm lý do.
- **Lịch sử cấp vật phẩm thật**: bảng `admin_grant_history` + `admin_grant_batches`, lọc theo
  người nhận, có nút tải thêm.

### Tính năng được tái cấu trúc

- **Founder Dashboard tách mô-đun** `assets/bakhi/bk-founder.js` (tìm người nhận, bộ chọn vật phẩm,
  dịch vụ trao, báo cáo, lịch sử). `renderFounder` trong `bk-devboard.js` còn 15 dòng ủy quyền,
  xoá ba khối tìm kiếm trùng nhau và các listener gắn lặp.
- **Ánh xạ badge → khung chuyển sang bảng** `bakhi_badge_frames`; `bakhi_owned_frames` không còn
  CASE 39 nhánh viết cứng.
- **Danh mục badge phía máy chủ sinh tự động** vào `admin-actions` (khối `generated:badge-catalog`)
  từ `bk-badges.js`, hết lệch giữa client và Edge Function.
- **Quy tắc độc quyền suy ra từ danh mục** (`exclusive`), không còn danh sách 13 mã viết cứng.

### Sửa lỗi

- **Xem trước "trao toàn bộ badge" đã cấp badge thật**: 7.4.0 dùng chung `badges.grantAll` cho cả
  xem trước; nay tách `badges.grantAllPreview` chỉ đọc.
- **Trao khung ghi đè khung đang trang bị**: 7.4.0 ghi thẳng `student_profiles.frame`. Nay trao khung
  = trao badge sở hữu khung; khung đang dùng không bị đổi.
- **Lịch sử cấp chưa từng được ghi**: 7.4.0 chỉ đọc `admin_grant_history` mà không insert.
- **Nhận badge id lạ**: `founder.grantItem` chỉ kiểm tra định dạng mã; nay bắt buộc có trong danh mục.
- **Trao đè quyền sở hữu cũ**: upsert `ignoreDuplicates: false` ghi đè `awarded_at/awarded_by/reason`;
  nay dùng `on conflict do nothing`.
- **Tab "Founder Badge/Founder Khung" hiện toàn bộ danh mục** và danh sách chỉ có id, không tên/mô tả.
- **Tự động cấp badge chạy ngay khi chọn tài khoản**; nay phải bấm chạy và có báo cáo trước/sau.
- **`student_roles` ghi sai cột/khoá** (`assigned_by`, `onConflict student_id,role_key` trong khi
  khoá chính là `student_id`).

### Thay đổi cơ sở dữ liệu

- Migration `20261130000000_bakhi_v750_founder_rework.sql` (idempotent, tương thích ngược):
  `admin_grant_history.request_id/badge_id` + unique index chống trùng; bảng `admin_grant_batches`;
  bảng `bakhi_badge_frames` (54 ánh xạ); RPC `bakhi_grant_badges(uuid, text[], text, text)` cấp
  nguyên tử theo lô; chỉ mục tìm kiếm; seed 99 badge cho hồ sơ `is_founder = true`.
- `bakhi_owned_frames` viết lại theo bảng ánh xạ; giữ nguyên chữ ký và quyền gọi.

### Cải tiến bảo mật

- **Đóng rò rỉ lịch sử cấp**: 7.4.0 cấp `select` cho `anon/authenticated` trên `admin_grant_history`
  (ai cũng đọc được); nay thu hồi, chỉ `service_role`.
- RPC cấp badge chỉ `service_role` được execute; client không gọi trực tiếp được.
- `students.inventory`, `admin.items.list`, `founder.grantItem`, `avatar.grant` kiểm tra scope
  Founder ở máy chủ; badge Founder bắt buộc hồ sơ `is_founder = true`.
- Tìm kiếm người nhận chỉ trả học sinh đang hoạt động, tối đa 20 dòng, không trả dữ liệu nhạy cảm.

### Cải tiến hiệu năng

- Tìm kiếm có debounce + sequence token (bỏ kết quả cũ), không tải cả bảng học sinh.
- Danh mục vật phẩm tải một lần theo nhóm, lọc phía client; không N+1 khi chọn người nhận.
- Cấp hàng loạt dùng một câu lệnh insert cho mỗi 100 badge thay vì vòng upsert từng badge.

### Giới hạn đã biết

- Chưa chạy E2E trên Supabase production: migration và Edge Function cần được deploy thủ công.
- Hình tượng badge/khung là SVG dựng bằng mã (không dùng tệp PNG), đã kiểm tra bằng jsdom nhưng
  chưa được duyệt thị giác trên thiết bị thật.
- `admin.items.list` trả tối đa toàn bộ danh mục (99 badge / 46 khung); nếu danh mục tăng rất lớn
  cần phân trang phía máy chủ.

## [7.4.0] — 2026-11-17

### Tính năng

- **Founder Dashboard: tìm người nhận trực quan** — nhập một phần tên để tìm học sinh, hiển thị avatar/tên hiển thị/username trong kết quả gợi ý, tự động xác định User ID nội bộ. Không yêu cầu nhập UUID thủ công.
- **Founder Dashboard: trao badge và khung avatar** — bộ chọn loại vật phẩm (Badge, Khung avatar, Badge Founder, Khung Founder), danh sách tải tự động từ danh mục, xem trước trước khi xác nhận, hỗ trợ trạng thái thành công/thất bại/đã sở hữu/không đủ quyền.
- **Founder Dashboard: cấp trọn bộ 89 badge + toàn bộ khung** cho hồ sơ Founder Minh Trúc (is_founder = true), idempotent, ghi vào `admin_grant_history`.
- **Founder Dashboard: trao toàn bộ badge đồng bộ** — Trao tất cả badge có thể tặng cho một học sinh, tự động loại trừ 13 badge độc quyền (founder + 10 founder-* + 2 dev-exclusive).
- **Founder Dashboard: tự động cấp badge đạt được** — Kiểm tra điều kiện thành tích, chỉ cấp badge đủ điều kiện, loại trừ badge chỉ nhận qua trao tặng, báo cáo chi tiết (mới cấp / đã sở hữu / chưa đủ điều kiện / bị loại trừ).
- **Lịch sử cấp vật phẩm** — bảng `admin_grant_history` ghi nhận người trao, người nhận, vật phẩm, thời gian, lý do; xem được trong Founder Dashboard.
- **Backend: action `avatar.grant`, `founder.grantItem`, `admin.grantHistory`, `admin.items.list`, `students.search`** trong `admin-actions`; kiểm tra quyền Founder ở máy chủ trước mọi thao tác.
- **Backend: `founder.grantAll` cấp 89 badge** (bao gồm `ke-suu-tam` + 10 founder-badge mới), không còn giới hạn ở 78.

### Cải tiến

- Sửa lỗi `renderFounder`: `el` và `cloud` chưa định dạng gây ReferenceError.
- Sửa `isExclusiveBadge` nhận diện đúng 11 badge Founder-exclusive (`founder-*`).
- Số khung avatar hiển thị động thay vì cứng 30.
- `ALL_BADGE_IDS` bổ sung `ke-suu-tam` và 10 badge founder-*.

### Sửa lỗi

- `gen-badge-catalog.js` và `badge-catalog.ts` bổ sung trường `exclusive` để máy chủ phân biệt badge Founder/Dev/Admin.
- Migration `20261129000000_bakhi_v740_founder_badge_frame.sql`: bảng `admin_grant_history`, hỗ trợ ghi khung avatar vào `student_profiles.frame`.

## [7.3.0] — 2026-11-17

### Cải tiến

- **Vai trò học sinh mới**: Hứa Viết Minh Trúc chỉ còn 'Người sáng lập'; Trần Văn Bách, Võ Mai Phương, Trương Lê Bảo Hân là 'Lớp Phó'; Phấn, Trâm, Trần Lê Gia Huy, Khoa là 'Tổ Trưởng'.
- **10 khung Founder-exclusive mới**: Âm Dương Thái Cực (yin-yang), Sát Thủ Tương Lai (cyberpunk), Cổ Khí Thần Ấn, Bushido (samurai), Vô Cực Hoàng Đế, Thiên Long, Vàng Nguyên Tắc, Lòng Nôc, Tinh Thần Tinh Thạch, Sen Neon — mỗi khung có SVG multi-layer và animation riêng.
- **10 badge Founder-exclusive mới** kèm theo từng khung founder, chỉ Founder được trao tay.
- **Tab Trang trí Avatar chuyển vào Founder Dashboard**:功 năng trao khung avatar và badge kèm được dời từ trang Cài đặt vào Founder Dashboard (chỉ Founder).
- **Badge 'Kẻ sưu tầm' mới**: thu thập toàn bộ 75 badge (ngoại trừ 11 Founder + 2 Developer), tổng danh mục tăng lên 89 badge (74 tự động + 15 Administrator/độc quyền).
- **Đồng bộ số lượng thành tựu**: số huy hiệu hiển thị tự động từ danh mục badge trên Cài đặt, Hồ sơ, Founder Dashboard và Trung tâm học tập.

## [7.1.3] — 2026-11-17

### Sửa lỗi

- **Chat: chấm chưa đọc vẫn hiện sau F5 reload**: trong `openRoom`, tính toán `unread` từ dữ liệu local (`S.messages` so với `last_read_at` của chính mình) ngay sau khi `messages.list` trả về, trước khi gọi `markRead`; UI phản ánh ngay lập tức không cần đợi API `read.mark` hoàn tất.

## [7.1.2] — 2026-11-17

### Sửa lỗi

- **Chat: tái cấu trúc Read Receipt**: viết lại `markRead` thành `markReadThrough` với génération token, idempotent và retry tối đa 3 lần; thêm `IntersectionObserver` theo dõi tin nhắn hiển thị trong viewport; debounce 300ms khi cuộn qua `scheduleReadThrough`; dọn dẹp tracker khi chuyển phòng qua `teardownReadTracking`; realtime `chat_members` bỏ qua sự kiện cũ hơn mốc đã biết (tránh ghi đè trạng thái mới hơn); realtime `chat_messages` INSERT dùng `scheduleReadThrough` thay vì đánh dấu ngay.

## [7.1.1] — 2026-11-17

### Tính năng

- **Chat: bảng chọn cảm xúc 12 biểu tượng**: bấm biểu tượng mặt cười bên cạnh tin nhắn để mở bảng chọn, thả/bỏ cảm xúc ngay trên tin, hiển thị danh sách người đã thả (tối đa 4 tên + dấu …), chip của bạn tô màu xanh. Chọn lại biểu tượng của mình = bỏ cảm xúc.
- **Chat: đánh dấu đã đọc chỉ biểu tượng**: nút ở đầu hội thoại chỉ giữ icon ✓✓, không có dòng chữ; chuyển màu xanh khi không còn tin chưa đọc.

### Cải tiến

- **Chat: không hiển thị số tin nhắn chưa đọc**: danh sách phòng chỉ hiện chấm màu, không hiện con số; tiêu đề trang không gắn số đếm.
- **Chat: lưu đã đọc theo từng học sinh**: mốc `last_read_at` lưu trong `chat_members` cho mỗi thành viên, nhãn ✓/✓✓ của tin bạn gửi cập nhật ngay khi người khác đọc (realtime) và khi bấm nút đánh dấu đã đọc.
- **Chat: đồng bộ trạng thái chưa đọc toàn trang**: tổng số chưa đọc đẩy sang lớp Cloud (menu tài khoản) qua `setChatUnread`.

## [7.1.0] — 2026-11-17

### Tính năng

- **Trình phát nhạc theo tệp trở lại**: 5 bài gốc trong `music/` phát bằng
  `HTMLAudioElement`, kèm Queue, shuffle, repeat, lời bài hát và cửa sổ nổi như
  trước. Mọi tệp `.mp3` mới bỏ vào `music/` được `tools/music-scan.js` ghi vào
  `music/library.json`; trình phát tự nạp thêm khi mở trang, không cần sửa mã
  hay build. Bài đã xoá khỏi Queue không tự quay lại.
- **Chat: hồ sơ đầy đủ và sửa biệt danh**: thẻ hồ sơ hiện ảnh bìa, khung avatar,
  giới thiệu, liên kết và danh vị lớp (lớp trưởng, bí thư…). Bấm tên hoặc avatar
  ở đầu cuộc nhắn riêng để mở hồ sơ; hàng “Hồ sơ của bạn” ở chân danh sách mở
  hồ sơ của chính mình và cho sửa biệt danh ngay trong Chat.
- **Đánh dấu đã đọc kiểu biểu tượng**: tin của bạn hiện ✓ khi đã gửi và ✓✓ khi
  người nhận đã đọc, không còn nhãn chữ; tin của người khác không hiện dấu thừa.

### Cải tiến

- **Bảo trì khóa toàn website**: khi Founder bật bảo trì, mọi trang hiện màn hình
  chờ có biểu tượng tải, chặn cuộn, chạm, bàn phím và liên kết; chỉ `/admin/`,
  `/founder/`, Administrator Code và thao tác tải lại trang được giữ.
- **Menu 3 chấm trong Chat gọn hơn**: đúng hai nút biểu tượng có nhãn **Ghim** và
  **Lưu trữ**, mở thành popup nhỏ ngay dưới nút thay vì hộp thoại lớn.
- **Đọc tin chính xác hơn**: chỉ đánh dấu đã đọc khi tab đang hiện, cửa sổ được
  chú ý và người dùng đang ở gần cuối khung; mốc gửi lên giữ nguyên độ chính xác
  microseconds và không gửi lặp cùng một mốc.
- **Tắt hiệu ứng viền avatar áp toàn site**: công tắc **Animate Avatar Borders**
  gắn lớp `bk-frames-still` lên `<html>` nên mọi khung — kể cả của người khác
  trong Chat — đứng yên ngay trên mọi trang.
- **Bỏ chấm đỏ trên avatar**: Chat chỉ còn số tin chưa đọc trong menu tài khoản.

### Sửa lỗi

- **Founder Dashboard không còn mang tên Administrator**: tên cũ lưu trong cơ sở
  dữ liệu được coi là “chưa đặt tên” khi mở bằng phiên Founder.
- **Phiên bản 7.1.0** áp dụng cho toàn bộ tệp HTML, `bk-version.js` và dashboard.

## [7.0.1] — 2026-11-17

### Sửa lỗi

- **Tab Bảo trì không còn lỗi `appendChild`**: ô “Đang bật bảo trì” được gắn
  đúng phần tử DOM; lưu cấu hình và tắt bảo trì đọc đúng trạng thái checkbox.
- **Chấm đỏ Chat sau khi đã đọc**: mốc đã đọc lưu nguyên độ chính xác từ
  PostgreSQL thay vì bị cắt về milliseconds; tin của chính mình không còn bị
  cộng vào số chưa đọc; số chưa đọc được đẩy ngay sang lớp Cloud để chấm đỏ
  trên avatar/menu biến mất tức thời sau khi đọc.
- **Thời gian changelog đúng UTC+7**: ngày trong `CHANGELOG.md` được hiểu là
  nửa đêm giờ Việt Nam ở cả bộ phân tích, Edge Function đồng bộ và giao diện;
  dữ liệu cũ được chuẩn hoá bằng migration.

### Tính năng

- **Đánh dấu đã đọc trong Chat**: nút “Đánh dấu đã đọc” ở đầu hội thoại, tự
  đánh dấu khi mở phòng, và nhãn “Đã gửi / Đã đọc” cho tin của bạn,
  “Bạn đã đọc / Chưa đọc” cho tin của người khác; cập nhật realtime khi thành
  viên khác đọc tin.
- **Music Player luôn có ô dán liên kết**: form thêm bài nằm ngay dưới khung
  phát, không còn ẩn trong tab Thư viện; nút “Thêm bài” mở trình phát và đưa
  con trỏ vào ô liên kết.

### Cải tiến

- **Founder Dashboard đúng tên**: phiên Founder mặc định hiển thị “Founder
  Dashboard”; Administrator vẫn là “Administrator Dashboard”. Tên tuỳ chỉnh
  trong Cấu hình vẫn được ưu tiên.
- **Phiên bản 7.0.1** áp dụng cho toàn bộ tệp HTML, `bk-version.js` và dashboard.

## [7.0.0] — 2026-11-17

### Tính năng

- **Chat đầy đủ hơn**: ghim và lưu trữ từng cuộc trò chuyện, bộ lọc “Đã lưu trữ”,
  ưu tiên phòng đã ghim, tìm người để nhắn riêng có trạng thái tải/trống/lỗi và
  thử lại. Bấm vào cảm xúc để xem ai đã thả; thả hoặc bỏ cảm xúc cập nhật ngay
  trên giao diện và tự hoàn tác nếu máy chủ báo lỗi.
- **Đã đọc do máy chủ quyết định**: mốc đã đọc lưu theo từng thành viên, không
  còn phụ thuộc đồng hồ thiết bị; chấm đỏ trên avatar đồng bộ giữa các trang và
  tự làm mới khi quay lại tab. Mọi mốc thời gian dùng múi giờ Việt Nam (UTC+7).
- **Khung avatar có chi tiết**: khung chưa mở vẫn bấm được để xem ảnh xem trước,
  độ hiếm, cách mở khoá và trạng thái sở hữu. Công tắc **Animate Avatar Borders**
  lưu theo tài khoản, đồng bộ khi đã nhận diện học sinh và tắt được hiệu ứng
  chuyển động của khung.
- **Bảo trì toàn website**: Founder bật/tắt bảo trì, nhập lý do và lưu cấu hình;
  trạng thái lan truyền realtime. Lịch sử ghi nhận thời điểm bắt đầu/kết thúc,
  người thực hiện, lý do, trạng thái và thời lượng, có tìm kiếm và lọc. Mỗi đợt
  bảo trì chỉ tạo một thông báo hoàn tất.
- **Màn hình bảo trì dùng chung** cho mọi trang, có nút “Thử lại”. Quản trị viên
  có thể vào bằng Administrator Code; máy chủ xác thực phiên, giới hạn tần suất
  và ghi nhật ký, không lộ mã trong trình duyệt.
- **Quản trị thành tích**: mở chi tiết từng badge (độ hiếm, phạm vi, cách đạt).
  Founder/Administrator có thể **Cấp thành tích tự động** cho hồ sơ đủ điều kiện
  và **Cấp toàn bộ badge** (trừ `founder` và mọi badge `dev-exclusive-*`), chống
  trùng, báo rõ số đã cấp/đã có/lỗi và ghi nhật ký.
- **Lời chào trang chủ**: “Chào buổi sáng/chiều/tối” kèm tên hiển thị theo giờ
  Việt Nam, cập nhật mỗi phút và không nhấp nháy khi hồ sơ tải xong.
- **Thư viện nhạc cá nhân**: mặc định trống, không còn bài hát đóng gói sẵn. Dán
  liên kết YouTube, Spotify hoặc SoundCloud chính thức để thêm bài; sửa tên,
  nghệ sĩ và lời bài hát của riêng bạn. Bìa được tạo từ chữ cái đầu, thư viện
  đồng bộ theo từng học sinh, vẫn giữ queue, shuffle, repeat và cửa sổ nổi.
- **Tên dashboard theo thương hiệu**: Founder chỉnh tên hiển thị của Administrator
  Dashboard; giá trị được lưu trên máy chủ và áp cho mọi phiên, không đổi đường dẫn `/admin/`.

### Sửa lỗi

- **Không còn nhấp nháy tên ở lời chào**: lời chào vẽ lại ngay khi sự kiện nhận
  diện phát ra, kể cả khi hồ sơ tải chậm hơn trang.
- **Mốc cập nhật tín hiệu ổn định**: `BK.signals.get()` giữ nguyên `updatedAt` đã
  lưu thay vì sinh mốc mới mỗi lần đọc, tránh sai lệch so sánh và kiểm thử.
- **Shuffle thật sự đổi bài**: khi bật shuffle, “Bài kế”/“Bài trước” chọn ngẫu
  nhiên bài khác trong queue thay vì chỉ đổi màu nút.
- **Biểu tượng cảm xúc rõ nghĩa**: bấm cảm xúc mở danh sách người đã thả và cho
  phép thả/bỏ ngay trong đó; không còn phụ thuộc một cú bấm mơ hồ.

### Cải tiến

- **Cơ sở dữ liệu 7.0**: migration `20261126000000_bakhi_platform_7.sql` bổ sung
  tuỳ chọn hội thoại, lịch sử bảo trì, tuỳ chọn hồ sơ, thương hiệu và thư viện
  nhạc. Mọi bảng người dùng bật RLS; realtime bật cho tuỳ chọn hội thoại và nhạc.
- **Ghi quyền qua Edge Function**: `admin-actions`, `chat-api`, `student-profile`
  xử lý bảo trì, thương hiệu, trao badge, ghim/lưu trữ và tuỳ chọn hồ sơ. Khoá
  service-role chỉ nằm ở máy chủ; trình duyệt không lưu mã quản trị.
- **Đồng bộ nhạc nhẹ nhàng**: thư viện đọc từ bộ nhớ cục bộ trước, sau đó đối
  chiếu `music_tracks` của chính học sinh; thao tác thêm/sửa/xoá không chặn giao
  diện khi mất mạng.
- **Phiên bản 7.0.0** áp dụng cho toàn bộ tệp HTML, `bk-version.js` và dashboard.

## [6.2.0] — 2026-11-17

### Tính năng

- **Trạng thái hoạt động trong chat**: chấm xanh trên avatar phòng nhắn riêng và
  dòng “Đang hoạt động / Hoạt động x phút trước” ở đầu cuộc trò chuyện. Máy chủ
  cập nhật `last_seen_at` mỗi lần chat gọi API; tab đang mở tự gửi nhịp mỗi phút
  và khi quay lại tab.
- **Passkey trong Cài đặt**: tab Hồ sơ có mục Passkey để thêm (tối đa 5) hoặc xoá
  passkey của thiết bị. Khoá riêng tư ở lại trên thiết bị; máy chủ chỉ lưu khoá
  công khai và bộ đếm chống phát lại.
- **Bắt buộc xác minh passkey sau khi đăng nhập bằng tên**: nếu hồ sơ đã có
  passkey, màn hình nhận diện giữ nguyên và yêu cầu vân tay, khuôn mặt hoặc mã
  khoá thiết bị trước khi gắn phiên. Huỷ hộp thoại sẽ không gắn thiết bị.

### Sửa lỗi

- **Đã đọc chính xác hơn**: máy khách gửi mốc thời gian của tin cuối cùng đã tải
  (`through`), máy chủ lưu mốc lớn hơn giữa lần đọc cũ và mốc mới. Tin đến trong
  lúc gọi API không còn bị đánh dấu đã đọc oan; tab ẩn không tự đánh dấu cho đến
  khi người dùng quay lại.

## [6.1.7] — 2026-11-16

### Sửa lỗi

- **Không còn tràn khung nhập**: toàn bộ lớp giao diện dùng `border-box`, nên ô
  Founder Code, Dev Code, mật khẩu và các nút rộng 100% nằm gọn trong thẻ thay vì
  cộng thêm padding/viền ra ngoài.
- **Đăng nhập toàn màn hình trên điện thoại**: thẻ đăng nhập Administrator/Founder
  chiếm trọn chiều rộng và chiều cao màn hình, có chừa vùng an toàn tai thỏ.
- **Nút Founder gọn lại**: nút xác thực không còn bị kéo giãn bằng ô nhập; trên
  điện thoại vẫn xếp dọc và rộng bằng khung.

### Cải tiến

- **Cài đặt theo thiết bị**: tab Cài đặt chuyển thành lưới 2 cột trên máy nhỏ,
  không còn bị cắt chữ ở mép phải; thẻ nội dung giảm padding trên màn hình hẹp.
- Sửa tràn ngang giúp trang không bị đẩy lệch, kéo theo các nút nổi như Music
  Player không còn bị cắt ở mép trái.

## [6.1.6] — 2026-11-16

### Cải tiến

- **Thả cảm xúc không còn icon mặt cười**: nút chữ “Thả cảm xúc” vẫn mở bảng cảm xúc
  và gọi `reactions.toggle` như cũ; khu vực gần thanh soạn tin không còn icon emoji.
- **Ô soạn tin gọn**: chỉ còn ô nhập chữ và nút gửi. Emoji gõ trực tiếp từ bàn phím
  vẫn được giữ nguyên trong nội dung tin nhắn.

## [6.1.5] — 2026-11-16

### Sửa lỗi

- **Hồ sơ rộng và thoáng hơn**: vùng nội dung tăng lên 1120px; avatar vẫn chồng
  nhẹ lên ảnh bìa nhưng tên, biệt danh và phần giới thiệu bắt đầu bên dưới banner,
  không còn đè chữ lên ảnh.
- **Biệt danh có chỗ riêng**: tên dài được xuống dòng gọn, biệt danh hiển thị dạng
  chip riêng cạnh tên và không bị ép tràn ra ngoài thẻ hồ sơ.

## [6.1.4] — 2026-11-16

### Sửa lỗi

- **Badge số tin Chat không tràn mép menu hồ sơ**: hàng menu dùng `border-box`,
  badge giới hạn chiều rộng và co đúng trong mọi bố cục.
- **Chấm đỏ avatar luôn nằm ở góc avatar**: chấm được đặt trong khung bọc riêng
  quanh ảnh, không phụ thuộc vị trí nút hay mũi tên trên từng trang.
- **Popup Administrator/Founder Dashboard có nền đục**: popup gắn vào `body` nay
  tự mang token màu sáng/tối thay vì kế thừa biến không tồn tại từ dashboard.

## [6.1.3] — 2026-11-16

### Cải tiến

- **Mở đoạn chat không tự bật bàn phím**: chạm vào phòng hoặc tin nhắn chỉ mở nội
  dung để xem; con trỏ không nhảy vào ô soạn tin. Bàn phím chỉ hiện khi người học
  chủ động chạm ô nhập, tránh che mất tin nhắn ngay khi vừa mở.

## [6.1.2] — 2026-11-16

### Sửa lỗi

- **Bàn phím ảo không còn đẩy cả trang Chat**: khung chat lấy chiều cao từ
  `visualViewport` và `interactive-widget=resizes-content`; trên mobile chỉ vùng
  tin nhắn cuộn, trang không bị đẩy lên khi focus ô soạn tin. Khi bàn phím đóng,
  chiều cao tự trở lại.
- **Dễ thấy tin nhắn mới**: mục Chat trong menu hồ sơ thu nhỏ có số tin chưa đọc,
  avatar có chấm đỏ; số này đồng bộ từ Chat và cập nhật qua realtime khi có tin mới.

### Cải tiến

- Ô soạn tin và header Chat giữ nguyên vị trí trong lúc bàn phím mở; giảm giật
  trang khi lướt tin nhắn cũ.

## [6.1.1] — 2026-11-16

### Sửa lỗi

- **Xoá tin nhắn Chat**: bảng `chat_messages` không còn chặn trạng thái xoá mềm
  (`body` rỗng, `image_path` null, `deleted_at` có giá trị). Migration
  `20261124000000_bakhi_chat_soft_delete.sql` sửa ràng buộc; API `messages.delete`
  đã trả `ok` và danh sách hiển thị “Tin nhắn đã được xoá”.
- **Nút Xoá trên điện thoại**: hàng thời gian/thao tác của tin nhắn của mình luôn
  hiện, không còn phụ thuộc hover; nút Xoá có màu đỏ và vùng chạm lớn hơn.
- **Đồng bộ tiến độ badge được trao**: badge trao tay hiện đúng tiến độ đầy đủ,
  không còn 0/goal; bản ghi trao từ máy chủ cập nhật cả khi badge đã có cục bộ.
  Khi đang kéo hồ sơ mà badge thay đổi, client hẹn đồng bộ lại thay vì bỏ sự kiện.
- **Thông báo đã đọc xuyên trang**: trạng thái đã đọc ở trang bài học được lưu
  local, hợp nhất và đẩy lên Supabase khi về trang chủ; mở thông báo ở trang đầy
  đủ cũng lưu local để trang bài học không hiện lại chưa đọc.

### Cải tiến

- **Tên badge và khung Hán-Việt**: đổi loạt tên sang hàm ý sâu hơn (Tri Thức
  Nhập Môn, Bá Khí Thiên Đồ, Thất Tinh Liên Châu, Thiên Khải Sáng Thế…), bỏ chữ
  “Developer” khỏi tên/khung độc quyền; khung dùng tên như Bồ Đề Sơ Diệp, Cửu
  Trùng Miện, Ngân Hà Tinh Đồ. Id badge/khung giữ nguyên để không mất dữ liệu.

## [6.1.0] — 2026-11-16

### Tính năng

- **Chat kiểu Messenger**: danh sách người trò chuyện là sidebar trái; chọn một người mở
  khung chat, icon trên header thu gọn/mở lại sidebar. Trên điện thoại, danh sách hiện
  trước, chọn người mới vào khung chat; icon đưa về danh sách. Bố cục dùng chiều cao
  `100dvh`, giảm thanh cuộn lồng nhau.
- **Chi tiết thành tích**: mọi badge đều bấm được để xem mô tả, độ hiếm, tiến độ, phần
  thưởng khung avatar và **cách lấy** — kể cả badge bí mật và badge quản trị.
- **Tên badge mới**: 78 badge được đặt lại tên gợi cảm hứng hơn, giữ nguyên id, điều kiện
  và khung thưởng để không mất dữ liệu đã mở.
- **Trung tâm học tập đồng bộ hơn**: thêm danh sách huy hiệu gần mở, tiến độ từng badge và
  gợi ý badge kế tiếp ngay trong tab Thành tích.

### Sửa lỗi

- **Avatar/bìa/biệt danh không sang thiết bị khác**: lần kéo hồ sơ đầu tiên không còn ghi đè
  bản local mới hơn. Nếu vừa đổi ảnh mà chưa kịp đẩy, bản local được đẩy lên trước; sau đó
  Supabase là nguồn chuẩn và timestamp hai bên được đồng bộ lại.
- **Giờ Hà Nội UTC+7**: ngày giờ thông báo, chat, nhật ký quản trị, hồ sơ và mốc ngày dùng
  `Asia/Ho_Chi_Minh`, không phụ thuộc múi giờ thiết bị.
- **Chỉ quản trị viên gửi thông báo**: bỏ toàn bộ nhãn “giáo viên” khỏi giao diện thông báo,
  nhận diện học sinh và tài liệu; thông báo chỉ đến từ Administrator/Founder.
- **Bớt thanh cuộn thừa**: menu tài khoản bỏ gutter luôn chiếm chỗ, thanh cuộn toàn site mảnh
  và trong suốt hơn; chat, hồ sơ và dashboard không còn khung cuộn lồng không cần thiết.

## [6.0.1] — 2026-11-16

### Sửa lỗi

- **Hồ sơ và avatar lấy Supabase làm nguồn chuẩn**: trang Hồ sơ và Cài đặt chạy đầy đủ
  chế độ đồng bộ thay vì chỉ thông báo. Lần đầu gắn học sinh luôn kéo hồ sơ/avatar từ
  `student_profiles`; bản localStorage cũ không còn đè lên máy chủ. Thay đổi mới được đẩy
  lên ngay, chỉ giữ local làm bộ đệm khi mất mạng.
- **Founder nhận đúng toàn bộ thành tích**: máy chủ tự tìm hồ sơ Founder theo cờ
  `is_founder` hoặc họ tên `Hứa Viết Minh Trúc` / `Minh Trúc` (chỉ khi khớp duy nhất),
  tự đánh dấu rồi cấp đủ 78 badge + 30 khung. Migration 6.0.1 cấp lại idempotent cho các
  project đã chạy migration 6.0.0.
- **Trao badge Founder và badge độc quyền**: `founder.grantAll` không còn lỗi khi cờ
  Founder chưa được đặt; badge Founder chỉ trao được cho đúng hồ sơ Founder đã xác minh,
  còn Administrator vẫn bị chặn.
- **Bố cục đăng nhập**: thẻ đăng nhập Administrator/Founder có khoảng cách field–nút–thông
  báo thống nhất, cuộn được trên màn hình thấp và không còn nút dính sát chữ.
- **Khoảng cách Cài đặt**: khung nhập mã/nút trong tab Quyền, khoảng cách tiêu đề, mô tả
  và các nút được nới hợp lý; nút đủ chiều cao chạm trên điện thoại.

## [6.0.0] — 2026-11-16

### Tính năng

- **Founder Dashboard**: khu vực toàn quyền tại `founder/` và tab **Founder** trong Cài đặt.
  Founder Code được xác thực ở Edge Function `admin-auth` bằng băm SHA-256 lưu trong bảng
  `founder_config`; mã gốc không nằm trong mã nguồn, localStorage hay chat. Phiên Founder
  có phạm vi riêng (`admin_sessions.scope = 'founder'`) và hạn 12 giờ.
- **Founder kế thừa toàn bộ Administrator Dashboard** (14 mô-đun) và mở thêm quyền tối mật:
  Bảo trì, Dữ liệu & sao lưu, đặt danh vị, trao **mọi** badge kể cả Founder/Developer.
  Administrator thường bị ẩn và bị máy chủ chặn các mục này.
- **Cấp trọn bộ thành tích**: nút trong Founder Dashboard trao đủ 78 badge và mở 30/30 khung
  cho hồ sơ `is_founder = true`; migration 6.0.0 cũng tự cấp trọn bộ cho hồ sơ Founder.
- **Khung avatar thế hệ mới**: cả 30 khung có vòng gradient, quỹ đạo xoay, hạt sáng, glow
  theo độ hiếm; khung Developer/Founder thêm quỹ đạo và vương miện chuyển động.
- **Đồng bộ tức thời**: realtime `student_badges` + sự kiện `storage`/`bk:identity` cập nhật
  badge, khung và Trung tâm học tập ngay khi trao/thu hồi hoặc đổi học sinh; bảo trì và
  What's New áp dụng ngay khi Founder/Administrator lưu.
- **Trung tâm học tập đếm đúng**: tab Thành tích hiển thị `đã mở/78` huy hiệu hồ sơ, tách
  khỏi 12 mốc học tập nội bộ.

### Sửa lỗi

- Menu hồ sơ thu nhỏ tự đóng khi cuộn trang (vẫn cuộn được bên trong menu), bố cục desktop
  và bottom-sheet mobile không còn tràn/che nội dung.
- Cài đặt Nhà phát triển: nút mở/Thoát Dev không còn đè lên dòng hướng dẫn; bố cục xuống
  hàng gọn trên màn hình hẹp.
- Thu hồi badge trao tay ở thiết bị khác được phản ánh đúng, không giữ badge cũ.

### Cải tiến

- **Chat chỉ gửi văn bản**: bỏ nút gửi ảnh, hộp chọn tệp và bảng emoji soạn tin; vẫn giữ
  cảm xúc cho tin nhắn và hiển thị ảnh cũ đã có.
- Migration `20261122000000_bakhi_founder_6.sql` thêm `founder_config`, `admin_sessions.scope`
  và seed toàn bộ badge/khung cho Founder; không xoá dữ liệu cũ.

## [5.0.0] — 2026-11-16

### Tính năng

- **30 khung avatar thật bằng SVG**: 27 khung thường, 2 khung Developer độc quyền và
  1 khung Founder. Mỗi khung có cấu trúc hoa văn riêng (vương miện, cánh, nguyệt quế,
  pha lê, cyber, gothic, hoả ngục, thiên hà…), phần trung tâm trong suốt để ảnh đại diện
  hiển thị bên dưới. Khung hiển thị nhất quán ở header, hồ sơ, Chat và Profile Card.
- **Danh mục thành tích mở rộng 78 badge**: 73 badge tự động + 2 badge Administrator +
  2 badge Developer (kèm khung Cực quang/Hư không) + 1 badge Founder.
- **Administrator trao mọi badge**: tab Thành tích có tìm kiếm, lọc theo độ hiếm, xem
  trước và trao bất kỳ badge nào trong danh mục. Badge tự động đạt và badge trao tay
  được lưu tách biệt (`auto_earned` / `manual_granted`); thu hồi trao tay không xoá
  kết quả tự động. Badge Founder chỉ trao được cho hồ sơ đã xác minh `is_founder`.
- **Bảo trì toàn website**: tab **Bảo trì** trong Administrator Dashboard (bật/tắt, tiêu
  đề, nội dung, lý do, thời gian bắt đầu/dự kiến mở lại, xem trước). Trạng thái lưu ở
  `app_settings.public.maintenance`; mọi trang public hiển thị trang bảo trì, Admin đã
  đăng nhập vẫn vào được Dashboard.
- **Danh vị học sinh**: bảng `student_roles` (khoá theo canonical student_id) và module
  dùng chung `bk-roles.js`. Hiển thị Lớp trưởng, Bí thư, Người sáng lập ở menu tài khoản,
  chip nhận diện, Chat và danh sách Admin. Danh vị chỉ là nhãn hiển thị, không cấp quyền.
- **What's New chỉ bản mới nhất**: hiển thị đúng một phiên bản, tối đa 10 dòng nội dung,
  có `Xem thêm` / `Thu gọn`; lịch sử cũ vẫn nằm trong trung tâm cập nhật.
- **Hồ sơ ẩn badge mặc định**: ban đầu chỉ hiện tổng quan và số badge; nút `Hiện badge` /
  `Ẩn badge` ghi nhớ lựa chọn theo từng tài khoản.
- **Chat**: bố cục tin nhắn tách hàng avatar/bong bóng/reaction (avatar không bị reaction
  kéo lệch); bảng emoji có tìm kiếm và danh mục; khung avatar SVG trong Chat; nhãn danh vị
  cạnh tên người gửi; bố cục mobile một khung với nút quay lại.
- **Đồng bộ đổi học sinh**: mỗi học sinh có kho thành tích cục bộ riêng; đổi học sinh phát
  sự kiện `bk:identity` để hồ sơ, bảng thành tích, Trung tâm học tập và menu cập nhật ngay
  không cần tải lại trang. Đổi học sinh không trộn dữ liệu hai tài khoản.
- **Administrator Code không tự chuyển trang**: xác thực xong chỉ báo thành công và hiện
  nút mở Dashboard trong tab mới (`target=_blank`, `rel="noopener noreferrer"`), giữ nguyên
  tab Cài đặt. Chat cũng mở tab mới từ menu tài khoản.

### Sửa lỗi

- Ô nhập Dev Code/Administrator Code không còn đè lên nút trên màn hình hẹp; layout dọc
  dưới 520px, thông báo xác thực có vị trí riêng.
- Không còn tràn ngang ở Chat mobile; khung chat dùng `100dvh` và safe-area cho thanh nhập.

### Cải tiến

- Migration `20261121000000_bakhi_platform_5.sql`: thêm `students.is_founder`,
  `student_badges.auto_earned/manual_granted`, bảng `student_roles`, mở rộng
  `bakhi_owned_frames` cho 30 khung, cấu trúc `public.maintenance` và realtime.
- `admin-actions` thêm `roles.list/roles.set`, trao/thu hồi badge theo cơ chế trao tay;
  `student-profile` chỉ tính lại badge tự động và giữ nguyên trao tay.
- QA cập nhật cho 78 badge, 30 khung, 14 tab quản trị và What's New một phiên bản.
- Cache-busting toàn website lên `5.0.0`.

## [3.9.0] — 2026-11-16

### Tính năng

- **Bá Khí Studio hợp nhất**: `/studio/` là một ứng dụng duy nhất với ba chế độ
  **Word**, **Paint** và **Chia đôi**; bản Studio rút gọn trước đây đã được gộp vào.
- **Nhập dữ liệu Studio cũ**: dự án lưu trong `lexend-studio-doc` được chuyển một lần
  thành tài liệu `<tên> (Studio cũ)` — giữ hộp văn bản, ảnh và hình vẽ (SVG) đúng vị trí.
  Khoá cũ vẫn còn nguyên để sao lưu.
- **Tương thích địa chỉ cũ**: `/studio/word-paint.html` tự chuyển hướng về `/studio/`,
  giữ query và hash; liên kết cũ và dấu trang không bị hỏng.

### Sửa lỗi

- Không có.

### Cải tiến

- Trang chủ trỏ thẳng tới `/studio/`; bớt một bước chuyển hướng.
- Studio mang đầy đủ shell tài khoản dùng chung (avatar, menu) như các trang khác.
- QA mới `tools/qa/studio-smoke.js`: ba chế độ, lưu tự động, nhập dữ liệu cũ,
  chuyển hướng địa chỉ cũ, không có đồng hồ/thi cử và không có khoá bí mật.
- Tài liệu `docs/STUDIO.md` mô tả kiến trúc một ứng dụng, cấu trúc `bakhiStudio.v1`
  và quy trình nhập dữ liệu cũ.
- Cache-busting toàn website lên `3.9.0`.

## [3.8.0] — 2026-11-16

### Tính năng

- **Administrator Dashboard 4.2 — 13 mô-đun**: bổ sung Hồ sơ, Thành tích, Chat và
  What's New bên cạnh 9 mô-đun cũ. Sidebar giữ nguyên phong cách, mọi thao tác ghi vẫn
  đi qua Edge Function `admin-actions`.
- **Hồ sơ**: danh sách học sinh có tìm kiếm/phân trang, xem biệt danh, khung avatar,
  ảnh bìa và toàn bộ thành tích đã xác minh (`profiles.list`, `profiles.detail`).
- **Thành tích**: chọn học sinh rồi trao/thu hồi đúng hai badge Administrator
  (`admin-chosen`, `admin-legend`); badge tự động chỉ hiển thị để đối chiếu, không có
  nút trao tay. Máy chủ trả `NOT_ADMIN_BADGE` cho mọi id khác.
- **Kiểm duyệt Chat**: xem phòng, thành viên và tin nhắn; xoá mềm tin (kèm xoá ảnh
  Storage), tạm khoá/mở khoá gửi tin, gỡ thành viên khỏi nhóm và xoá phòng riêng.
  Phòng chung được bảo vệ bằng `PROTECTED_ROOM`.
- **What's New**: công tắc `public.whatsnew` và bảng xem trước các phiên bản đã xuất
  bản; chỉ đọc changelog, không tạo bản ghi mới.

### Sửa lỗi

- `chat-api` từ chối tin nhắn mới bằng `403 MUTED` khi học sinh đang bị tạm khoá trong
  phòng, thay vì chỉ ẩn giao diện.

### Cải tiến

- **Backend quản trị**: `admin-actions` thêm `chat.rooms`, `chat.messages`, `chat.delete`,
  `chat.room.delete`, `chat.member.remove`, `chat.mute`; mọi hành động ghi
  `admin_activity_logs` và không tin dữ liệu phân quyền từ client.
- **Badge**: trang quản trị nạp `bk-badges.js` chỉ để đọc tên badge; cờ `BK_ADMIN_ONLY`
  chặn ghi `bakhiBadges.v1` trong trình duyệt quản trị.
- **Giao diện**: thêm khối hồ sơ, lưới badge, luồng tin nhắn và khối trao badge vào
  `bk-admin-dashboard.css`; giữ bố cục một cột dưới 640px.
- Cache-busting toàn website lên `3.8.0`.
- QA mới `tools/qa/admin-smoke.js`: kiểm tra 13 tab, trao/thu hồi badge, kiểm duyệt
  chat, công tắc What's New, cùng các ràng buộc bảo mật phía máy chủ.

## [3.7.0] — 2026-11-16

### Tính năng

- **Chat toàn trường**: trang `/chat/` với phòng chung cho mọi học sinh đã gắn danh
  tính, tin nhắn riêng từng cặp và nhóm tối đa 10 người. Danh sách phòng sắp theo hoạt
  động gần nhất, có tìm kiếm và bộ đếm tin chưa đọc (cả trên tiêu đề tab).
- **Tin nhắn**: nội dung tối đa 2.000 ký tự, gửi bằng Enter (Shift+Enter xuống dòng),
  ảnh PNG/JPEG/WEBP/GIF tối đa 3 MB qua bucket `chat-images`, thả 12 cảm xúc, xoá mềm
  tin của mình. Không nhận tệp khác ngoài ảnh.
- **Profile Card**: bấm ảnh hoặc tên trong chat để xem biệt danh, giới thiệu, khung
  avatar và số thành tích; từ đó mở ngay cuộc trò chuyện riêng.
- **Realtime**: tin nhắn, cảm xúc và tên nhóm cập nhật trực tiếp qua Supabase Realtime
  (RLS chỉ trả dữ liệu phòng mình tham gia).
- **Quản lý nhóm**: trưởng nhóm đổi tên, thêm/xoá thành viên, rời nhóm; khi trưởng
  nhóm rời đi, người vào sớm nhất được chuyển làm trưởng.
- **Lối vào Chat** trong menu tài khoản, cạnh Hồ sơ cá nhân.

### Sửa lỗi

- Không có.

### Cải tiến

- **Backend Chat**: migration `20261120000000_bakhi_chat.sql` tạo `chat_rooms`,
  `chat_members`, `chat_messages`, `chat_reactions`, view `chat_profiles` (chỉ lộ tên,
  biệt danh, giới thiệu, ảnh, khung, số thành tích), RLS chỉ đọc và thu hồi toàn bộ
  quyền ghi khỏi `anon`/`authenticated`.
- **Edge Function `chat-api`**: mọi thao tác ghi chạy bằng service role sau khi xác minh
  thiết bị đã gắn học sinh, tư cách thành viên, độ dài nội dung, quyền sở hữu ảnh và
  giới hạn tần suất (20 tin/phút, 120 cảm xúc/phút).
- **Storage**: bucket `chat-images` công khai theo URL, chỉ nhận `image/*` ≤ 3 MB, mỗi
  người chỉ ghi/xoá trong thư mục uuid của chính mình.
- Cache-busting toàn website lên `3.7.0`.
- QA mới `tools/qa/chat-smoke.js`: dựng giao diện bằng jsdom, kiểm tra tải phòng, gửi
  tin, ảnh, cảm xúc, Profile Card, nhắn riêng, tạo nhóm, cùng các ràng buộc RLS,
  giới hạn nhóm và Storage.

> Ghi chú triển khai: Chat cần chạy migration `20261120000000` và deploy Edge Function
> `chat-api` trên dự án Supabase thật. Khi chưa deploy, trang `/chat/` hiển thị thông
> báo máy chủ chưa sẵn sàng và các trang học tập khác không bị ảnh hưởng.

## [3.6.0] — 2026-11-16

### Tính năng

- **Hồ sơ đồng bộ máy chủ**: biệt danh, giới thiệu, liên kết và khung avatar được lưu
  theo học sinh trong bảng `student_profiles` và tự đồng bộ giữa các thiết bị qua Edge
  Function `student-profile`. Dữ liệu cục bộ (`bakhiProfile.v1`) vẫn là bản dùng ngay
  khi ngoại tuyến; bản máy chủ chỉ ghi đè khi mới hơn.
- **75 thành tích xác minh phía máy chủ**: máy chủ đọc dữ liệu học tập đã đồng bộ, tự
  tính lại chỉ số rồi mới ghi badge vào `student_badges`. Trình duyệt không gửi danh
  sách badge đã mở và không ghi trực tiếp được vào bảng này. 73 badge tự động theo dữ
  liệu thật; 2 badge Administrator (`admin-chosen`, `admin-legend`) chỉ do
  `admin-actions` trao khi có phiên Administrator.
- **Khung avatar có chủ**: mỗi khung đến từ một badge đã xác minh; trigger
  `bakhi_profile_frame_guard` chặn gán khung chưa sở hữu (`FRAME_NOT_OWNED`), và
  `bakhi_owned_frames()` là nguồn duy nhất cho cả client lẫn máy chủ.
- **Quản trị hồ sơ trong dashboard**: `admin-actions` thêm `profiles.list`,
  `profiles.detail`, `badges.list`, `badges.grant`, `badges.revoke`. Mọi thao tác trao
  hoặc thu hồi badge đều ghi vào `admin_activity_logs` kèm mã phiên Administrator.
- **Danh mục badge dùng chung**: `tools/gen-badge-catalog.js` sinh
  `supabase/functions/_shared/badge-catalog.ts` từ `bk-badges.js`; QA đối chiếu hai bên
  để không lệch danh mục, mục tiêu hay khung thưởng.

### Sửa lỗi

- `BK.signals.get()` không còn tự đổi `updatedAt` khi chỉ đọc.
- Đồng bộ hồ sơ tự tắt khi Edge Function `student-profile` chưa được triển khai (404)
  để website đang chạy không phát sinh lỗi lặp lại.

### Cải tiến

- Cache-busting toàn website lên `3.6.0`.
- Migration `20261119000000_bakhi_profile_badges.sql`: bật RLS cho `student_profiles`
  và `student_badges`, chỉ cho đọc bản ghi của chính mình, thu hồi toàn bộ quyền ghi
  `student_badges` khỏi `anon`/`authenticated`.
- `sync-student-progress` nhận thêm `signals` và `badges` (bộ đếm thành tích, trang đã
  ghé, chuỗi ngày) — chỉ để máy chủ tính lại thành tích, không cấp quyền gì.
- QA mới `tools/qa/badges-smoke.js`: đối chiếu danh mục 75 badge, so khớp chỉ số máy
  chủ với client, chặn tự trao badge Administrator, kiểm tra `applyRemote` và các ràng
  buộc RLS/trigger trong migration. `cloud-smoke.js` thêm mục kiểm tra đồng bộ hồ sơ.

> Ghi chú triển khai: các tính năng trên cần chạy migration `20261119000000` và deploy
> Edge Functions `student-profile`, `admin-actions`, `sync-student-progress` trên dự án
> Supabase thật. Khi chưa deploy, website vẫn hoạt động local-first như trước.

## [3.5.0] — 2026-11-16

### Tính năng

- **Dev Code trong Cài đặt**: tab Nhà phát triển có mục Dev Code riêng, đặt trước
  Administrator Code. Mã được xác minh ở Edge Function `dev-auth`; trình duyệt chỉ
  giữ token + hạn dùng trong `sessionStorage` (`bakhiDev.v1`), không lưu mã và không
  dùng menu ba gạch cũ. Phiên Dev tách hoàn toàn khỏi phiên Administrator.
- **Developer Playground 2.1 — đủ 14 tab**: thêm Studio (trạng thái tài liệu + lối mở
  nhanh), Dữ liệu (chỉ đọc kho dùng chung, xuất JSON từng khoá) và Gỡ lỗi (chẩn đoán
  môi trường, phiên, viewport, cloud, shell; không chứa token hay mã).
- **Thoát Dev**: nút đỏ `Thoát Dev` nằm bên trái nút Thu nhỏ, có hộp xác nhận; thoát
  sẽ xoá phiên Dev, đóng panel và ẩn biểu tượng công cụ. Thu nhỏ giữ nguyên tab,
  kích thước và trạng thái panel.
- **Nút Dev góc dưới bên trái**: chỉ xuất hiện sau khi Dev Code được máy chủ xác minh,
  nằm ngay trên Music Player; tải `bk-dev.js` theo nhu cầu từ `bk-shell.js`.
- **Backend Dev Code**: migration `dev_sessions` (RLS bật, không policy, thu hồi quyền
  anon/authenticated), Edge Function `dev-auth` giới hạn 10 lần/10 phút theo IP, thời
  hạn phiên 1–12 giờ (mặc định 4). `dev-auth` không cấp quyền gọi `admin-actions`.

### Sửa lỗi

- `BK.ui.confirm()` luôn trả về `false` vì `onClose` được gọi trước khi nút đồng ý
  phân giải Promise; nay nút Đồng ý trả về `true`, nút Huỷ trả về `false`. Sửa lỗi
  này khôi phục mọi hộp xác nhận dùng chung (đổi học sinh, thoát Dev, xoá dữ liệu).
- Hộp xác nhận bị Developer Playground che do z-index panel cao hơn overlay; panel
  nay nằm dưới `.bk-overlay` để luôn bấm được.
- `BK.signals.get()` tự đổi `updatedAt` mỗi lần đọc; nay giữ nguyên mốc đã lưu.
- Trang Cài đặt nạp `bk-cloud.js` trước `bk-settings.js` để mở trực tiếp
  `?tab=dev` thấy đúng trạng thái cấu hình máy chủ.

### Cải tiến

- Cache-busting toàn website lên `3.5.0`; `bk-dev.js` trên trang chủ dùng chung số
  phiên bản với `bk-version.js`.
- QA mới `tools/qa/dev-smoke.js`: xác thực Dev, 14 tab, Thoát Dev + xác nhận, thu nhỏ
  giữ trạng thái, FAB trên Music Player, không đổi favicon, không có Highlight Manager
  độc lập, không lưu mã; `smoke.js` và `shell-smoke.js` cập nhật theo hành vi mới.

## [3.4.0] — 2026-11-16

### Tính năng

- **Lớp shell dùng chung toàn website**: avatar tài khoản thay cho menu ba gạch và nút
  README riêng trên trang chủ. Menu tài khoản gồm Hồ sơ cá nhân, Giao diện, README.md,
  Bá Khí Studio, Cài đặt; ô tìm kiếm nhanh giữ nguyên hành vi cũ. Mục Chat chưa được
  thêm vì `/chat/` chưa tồn tại — không tạo liên kết chết.
- **Trang `/profile/`**: ảnh đại diện, ảnh bìa, biệt danh, giới thiệu, tối đa 6 liên kết
  http/https, 13 khung avatar và bảng 75 thành tích. Dữ liệu local-first ở
  `bakhiProfile.v1`, ảnh được thu nhỏ bằng canvas trước khi lưu.
- **Trang `/settings/`**: 5 tab — Hồ sơ, Trung tâm học tập (gắn đúng bộ tab đang dùng
  qua `BKLearn.mountHub`, không có hệ thống thứ hai), Hiển thị & Trợ năng, Hình nền
  (dùng chung kho IndexedDB `bakhi`/`kv` với trang chủ) và Nhà phát triển.
- **75 thành tích**: 73 badge tự động theo dõi học tập, khám phá, chuỗi ngày, âm nhạc,
  tương tác, hồ sơ, Studio và badge bí mật; 2 badge chỉ Administrator trao. Mỗi badge
  có danh mục, độ hiếm, tiến độ và một số badge thưởng khung avatar.
- **What's New trên trang chủ**: danh sách thống nhất, hiển thị 10 mục mới nhất theo số
  phiên bản kèm nút `Xem thêm` / `Thu gọn` và bộ đếm `đang xem / tổng`.
- **`bk-version.js`**: nguồn phiên bản duy nhất cho toàn website
  (`window.BAKHI_VERSION`, `BK.release`).

### Sửa lỗi

- Chuẩn hoá tên trường cũ "THPT FPT" thành "THPT Huỳnh Ngọc Huệ" ngay khi chạy, chỉ
  trong header/footer/main và không sửa bất kỳ tệp nội dung giáo dục nào.
- Trung tâm học tập không mở lại được sau khi đóng: tham chiếu modal được giải phóng
  đúng lúc thay vì giữ mãi.
- Đồng bộ cache-busting của `bk-cloud.js`, `bk-cloud.css` và `bk-learn.js` về `3.4.0`
  để trình duyệt không dùng bản JS/CSS cũ.
- Menu tài khoản tự đóng khi chọn mục, giữ focus bàn phím và đóng bằng Esc hoặc bấm ra ngoài.

### Cải tiến

- Trợ năng toàn website: cỡ chữ 90–130%, tương phản cao, giảm chuyển động, viền focus
  rõ và gạch chân liên kết; lưu ở `bakhiA11y.v1`, tôn trọng `prefers-reduced-motion`.
- Dock nổi của Trung tâm học tập được thay bằng mục Cài đặt trong menu tài khoản;
  phím tắt `Ctrl/⌘ + K` và `/` vẫn hoạt động như trước.
- Câu hướng dẫn trên trang chủ được cập nhật theo giao diện avatar thay vì nhắc menu ba gạch.
- Giao diện Cài đặt/Hồ sơ dùng chung token `--bkl-*`, hỗ trợ sáng/tối và màn hình nhỏ.

### Khác

- Chưa triển khai trong bản này: chat `/chat/`, hợp nhất hai trang Studio, Dev Playground
  14 tab, xác minh badge phía máy chủ, mở rộng Administrator Dashboard A–M. Các phần này
  cần bảng/RLS/Storage/Edge Function mới nên được tách thành giai đoạn riêng.

## [3.3.0] — 2026-11-15

### Tính năng

- **Tự động đồng bộ CHANGELOG.md lên Supabase**: GitHub Actions đọc `CHANGELOG.md` khi
  có thay đổi trên nhánh `main`, tách phiên bản / ngày / nhóm nội dung / markdown, rồi
  gọi Edge Function `changelog-sync` ghi vào bảng `changelog`. Mỗi phiên bản mới được
  tạo **một** thông báo đẩy liên kết qua `announcements.changelog_version`, chống trùng
  bằng `pg_advisory_xact_lock` và unique index; chạy lại chỉ cập nhật, không báo lại.
- **Administrator Dashboard 9 mô-đun**: Tổng quan, Học sinh, Thông báo, Lịch sử phiên
  bản, Nhật ký, Giám sát, Quyền, Cấu hình, Dữ liệu. Bảng có tìm kiếm, lọc, sắp xếp,
  phân trang phía máy chủ; xem chi tiết học sinh, xuất CSV/JSON, xác nhận trước thao tác
  ảnh hưởng dữ liệu; sidebar thu gọn được, breadcrumb, trạng thái tải/thành công/lỗi/rỗng.
- **Lịch sử phiên bản dạng cột dọc** trong dashboard: biểu mẫu tạo/sửa phiên bản chiếm
  toàn chiều rộng phía trên, danh sách phiên bản bên dưới với cột rõ ràng, cuộn ngang
  trên màn hình hẹp; giữ nguyên tìm kiếm, lọc nguồn/đồng bộ, xuất JSON, sửa và xoá.
- **Giao diện thông báo tối thống nhất**: trung tâm thông báo, bảng thông báo, popup,
  danh sách, chi tiết, thông báo lịch sử phiên bản, toast, modal, trạng thái tải/rỗng/lỗi
  dùng chung bộ biến `--bkc-n-*` và lớp `.bkc-dark`; không còn thẻ trắng hay chữ khó đọc
  trên nền tối.
- **Cờ tính năng và bảo trì**: bảng `app_settings` (chỉ đọc khoá `public.*`), realtime
  đẩy thay đổi ngay tới trình duyệt; `public.whatsnew` điều khiển khối “Cập nhật gần đây”,
  `public.maintenance` bật dải thông báo bảo trì toàn site.
- **Favicon tĩnh dùng chung**: `assets/bakhi/favicon.svg` cùng bộ PNG 16/32/48/192/512,
  `apple-touch-icon.png` và `favicon.ico`; chèn link tương đối đúng cho 118/119 trang,
  gồm cả Studio, Word & Paint và trang quản trị. Không còn favicon GIF động.

### Sửa lỗi

- **Bỏ “Có gì mới” khỏi Studio và Word & Paint** bằng logic: `bk-cloud.js` chỉ dựng khối
  cập nhật gần đây khi thẻ script có `data-bk-whatsnew="1"` hoặc trang đã có khung
  `#bkcWhatsNew`; hai trang Studio chạy chế độ chỉ thông báo nên không bao giờ hiện khối
  này, không dùng CSS che.
- **Không hiện hai chuông thông báo**: `bk-cloud.js` gỡ chuông `bk-notify.js` cũ trên
  trang chủ khi lớp thông báo mới đã dựng xong.
- **Markdown an toàn trong thông báo**: nội dung từ máy chủ được escape trước, chỉ cho
  phép liên kết `http(s)`, không chèn HTML thô; giữ xuống dòng và danh sách.
- **Liên kết thông báo → phiên bản**: bấm thông báo sinh ra từ CHANGELOG sẽ mở đúng mục
  phiên bản trong cửa sổ lịch sử, kể cả sau khi tải lại trang.

### Cải tiến

- **Backend admin mở rộng trong một Edge Function**: `admin-actions` bổ sung
  `students.detail`, `students.export`, `announcements.stats`, `changelog.list` có phân
  trang/lọc, lưu và xuất bản changelog qua RPC dùng chung, `logs.list`/`logs.export`,
  `settings.get`/`settings.set`, `system.health`, `permissions.get`, `data.integrity`.
  Mọi thao tác xác thực lại Administrator Code ở máy chủ.
- **Giám sát đúng phiên bản**: `system.health` và `overview` so sánh từng đoạn số như
  `bakhi_version_cmp` thay vì sắp theo `published_at`; changelog đồng bộ chỉ có ngày nên
  trước đây 3.2.0 bị coi là mới hơn 3.3.0.
- **Danh sách phiên bản đúng thứ tự**: `changelog.list` lấy tối đa 500 hàng đã lọc, sắp
  theo từng đoạn số rồi mới cắt trang; trang đầu luôn là 3.3.0, 3.2.1… thay vì 2.0.0.
- **Báo cáo quyền thật**: `permissions.get` gọi `bakhi_permissions_report()` trả về hàm,
  bảng + RLS và policy đọc từ catalog; migration mới
  `20261117002000_bakhi_permissions_report.sql` chỉ cấp quyền cho `service_role`.
- **Migration mới**: `20261117000000_bakhi_changelog_sync.sql` (cột đồng bộ, liên kết
  announcement, hàm so sánh phiên bản, RPC publish, `app_settings`),
  `20261117001000_app_settings_realtime.sql` (đưa `app_settings` vào realtime) và
  `20261117002000_bakhi_permissions_report.sql` (báo cáo quyền chỉ đọc).
- **Cache-bust tài sản dùng chung** lên `?v=4.1.0` cho `bk-cloud`, `bk-admin-dashboard`
  và `?v=4.1.1` cho `bk-devboard` trên toàn bộ trang để trình duyệt nhận giao diện mới.
- **Tài liệu**: cập nhật kiến trúc, tính năng, hướng dẫn Supabase, README và AGENTS.md
  cho quy trình đồng bộ changelog, 9 mô-đun quản trị, favicon và migration mới.

### Bảo mật

- **Khoá đồng bộ changelog**: workflow dùng GitHub Secrets `CHANGELOG_SYNC_TOKEN` và
  `CHANGELOG_SYNC_URL`; Edge Function so token bằng thời gian hằng, không nhận request
  không có token, không đặt khoá bí mật trong mã nguồn.
- **Ghi cấu hình chỉ qua service role**: `app_settings` không cho ghi từ trình duyệt;
  `admin-actions` chỉ chấp nhận hai khoá `public.whatsnew` và `public.maintenance`.

## [3.2.1] — 2026-11-15

### Bảo mật

- **Chặn `anon` gọi hàm SECURITY DEFINER**: audit phát hiện Supabase cấp mặc định
  `EXECUTE` cho `anon`/`authenticated` trên mọi hàm mới của schema `public`, nên
  `revoke ... from public` trong migration gốc không có tác dụng. Hệ quả là bất kỳ ai
  có publishable key đều gọi được `bakhi_rate_limit()` và ghi thêm hàng vào
  `rate_limits` không giới hạn. Nay chỉ `service_role` (Edge Function) gọi được hàm
  này; `bakhi_current_student_id()` chỉ còn `authenticated` và `service_role`.
- **Tiến trình học tập chỉ ghi qua Edge Function**: thu hồi `INSERT`/`UPDATE` trên
  `student_progress` khỏi `authenticated`. Trước đây một thiết bị đã gắn hồ sơ có thể
  ghi thẳng vào bảng qua REST, bỏ qua giới hạn 1,5 MB và quy tắc “chỉ ghi khi mốc thời
  gian mới hơn” của `sync-student-progress`. Trình duyệt vẫn đọc được hàng của mình.
- **Khoá `search_path` cho hàm trigger** `bakhi_touch_updated_at`
  (`public, pg_temp`), theo khuyến nghị của Supabase Security Advisor.
- **Thêm index khoá ngoại** `announcement_reads(announcement_id)` và đổi policy
  `student_devices` sang `(select auth.uid())` để tránh RLS initplan.

### Cải tiến

- **Migration gia cố riêng**: `supabase/migrations/20261116000000_bakhi_security_hardening.sql`,
  idempotent, có ghi chú hoàn tác; tài liệu Supabase thêm mục “Gia cố bảo mật” kèm câu
  SQL kiểm chứng quyền hàm và quyền bảng.

## [3.2.0] — 2026-11-15

### Tính năng

- **Chuông thông báo phủ toàn website**: mọi trang môn học, bài học, đề kiểm tra, thư viện,
  trang chủ và cả hai trang Studio đều có chuông thông báo. Thông báo mới từ giáo viên và
  phiên bản mới hiện ngay bằng Supabase Realtime, không cần quay lại trang chính hay tải lại.
- **Chế độ “chỉ nhận thông báo”** cho trang bài học: bật bằng thuộc tính
  `data-bk-notify-only="1"` trên thẻ `bk-cloud.js`. Chế độ này chỉ dựng chuông, bảng thông báo,
  đếm chưa đọc và realtime; **không** mở màn hình nhận diện học sinh, **không** đồng bộ
  tiến trình, **không** ghi đè dữ liệu học tập trên máy.
- **Trạng thái đã đọc dùng chung toàn site**: đọc thông báo ở trang bài học, Studio hay trang
  chủ đều được ghi nhớ. Ở chế độ chỉ nhận thông báo, trạng thái lưu cục bộ theo origin
  (`bakhiNotifyReads.v1`) nên mọi trang trong cùng website thấy cùng số chưa đọc.
- **Chuông nổi cho trang không có header chung**: chuông đặt cố định ở góc phải dưới, bảng
  thông báo tự mở **lên trên** khi chuông nằm ở nửa dưới màn hình, không bị cắt khỏi khung nhìn.
- **Studio có thông báo**: `studio/index.html` và `studio/word-paint.html` nạp lớp thông báo
  như mọi trang khác; không ảnh hưởng tài liệu đang soạn hay bản vẽ đang mở.

### Sửa lỗi

- **Administrator Dashboard — thẻ danh sách nằm sai cột**: thẻ “Quản lý thông báo” và
  “Lịch sử phiên bản” trước đây được gắn vào khung cha thay vì lưới hai cột, khiến cột phải
  trống và biểu mẫu co lại một nửa. Nay hai tab này hiển thị đúng bố cục hai cột, tự chuyển
  thành một cột khi cửa sổ hẹp.
- **Khung nhập không còn tràn viền**: toàn bộ dashboard dùng `box-sizing: border-box`;
  `input`, `textarea`, `select` rộng 100% nằm gọn trong thẻ, không còn vượt qua mép phải
  của thẻ hay tạo thanh cuộn ngang.
- **Biểu mẫu rộng hết tab và màn hình**: khung nội dung `.bkc-pane` chiếm toàn bộ chiều rộng
  khả dụng; lưới hai cột tự gộp dưới 1180px để biểu mẫu không bị bóp hẹp.
- **Xem trước thông báo tự xuống dòng**: nội dung dài, chuỗi không khoảng trắng và liên kết
  dài không còn đẩy thẻ rộng ra ngoài.
- **Liên kết CHANGELOG.md đúng đường dẫn**: nút “Xem CHANGELOG.md” trong bảng thông báo ở
  trang bài học/Studio mở đúng tệp gốc thay vì tìm trong thư mục môn học.
- **Công cụ bảo toàn nội dung nhận diện thẻ script có thuộc tính**: `content-integrity`
  loại bỏ đúng cả thẻ script được chèn kèm `data-*`, nhờ vậy nội dung giáo dục vẫn
  được xác minh là không đổi.

### Cải tiến

- Nâng phiên bản tài nguyên dùng chung lên `?v=4.0.1` (bk-cloud, bk-cloud.css,
  bk-admin-dashboard.css, bk-devboard) để trình duyệt tải bản mới thay vì bản lưu đệm.
- Tài liệu được rà soát và mở rộng: README, AGENTS, kiến trúc, tính năng, Music, Studio,
  Supabase — bổ sung sơ đồ trang, bảng key lưu trữ, quy trình kiểm thử và xử lý sự cố.

## [3.1.3] — 2026-11-15

### Tính năng

- **Khôi phục khu vực “Cập nhật gần nhất” (What's New)** trên trang chính: hiện phiên bản
  mới nhất kèm tóm tắt và danh sách thay đổi, có nút mở trung tâm thông báo và xem CHANGELOG.md.
- **Mục Administrator Dashboard mở tab mới**: sau khi xác nhận Administrator Code, bấm mục này
  sẽ mở `admin/index.html` ở tab riêng (trang quản trị đầy đủ, tự yêu cầu mã riêng khi mở tab mới).
- **Header tự thu gọn**: khi không đủ chỗ, nút README.md và tên học sinh trên header được ẩn bớt
  và thay bằng mục tương ứng trong menu 3 gạch, tránh tràn ngang trên điện thoại và cửa sổ hẹp.

### Sửa lỗi

- **Thông báo mới hiện ngay lập tức**: sự kiện realtime trước đây bị bỏ qua bởi bộ nhớ đệm 5 giây,
  nên vừa mở panel hoặc vừa tải lại xong thì thông báo mới không xuất hiện. Nay sự kiện realtime
  luôn tải lại ngay.
- **Đóng dashboard bằng phím Esc** và không còn mở khoá cuộn trang khi đóng hộp xem trước
  trong lúc dashboard vẫn mở.
- Nhãn “Đăng xuất Dev” đổi thành “Đăng xuất Administrator”.


## [3.1.2] — 2026-11-15

### Tính năng

- Trang quản trị riêng tại admin/ — mở là phải nhập Administrator Code, dùng chung dữ liệu với trang chính.
- Menu 3 gạch có mục Administrator: nhập Administrator Code để mở Administrator Dashboard, kèm đường dẫn mở thẳng trang quản trị riêng.
- Trung tâm thông báo hiện cả thông báo từ giáo viên và toàn bộ phiên bản cập nhật, xếp từ cũ đến mới theo số phiên bản.
- Bấm vào một phiên bản trong trung tâm thông báo để xem đầy đủ nội dung thay đổi của phiên bản đó.

### Sửa lỗi

- Sửa nút × của trung tâm thông báo: trước đây panel dùng thuộc tính hiển thị riêng nên không tắt được, giờ bấm là đóng.
- Bỏ khu vực cập nhật (What's New) khỏi màn hình chính để không trùng lặp với trung tâm thông báo.

### Cải tiến

- Đổi tên Dev Code thành Administrator Code và Dev Dashboard thành Administrator Dashboard trên toàn bộ giao diện lẫn thông điệp máy chủ.
- Ô nhập mã quản trị được giấu sau nút Administrator, chỉ hiện khi bấm; mục Administrator Dashboard chỉ xuất hiện sau khi xác nhận mã đúng.

## [3.0.0] — 2026-11-15

### Tính năng

- Nhận diện học sinh bằng họ tên: gõ tên, chọn trong danh sách gợi ý có tô sáng — không cần email, không cần mật khẩu, không cần tài khoản Google.
- Phiên ẩn danh Supabase Auth: mỗi thiết bị một phiên riêng, không thu thập email hay số điện thoại.
- Đồng bộ tiến trình học tập giữa các thiết bị: luyện tập, ôn tập, ghi chú, đánh dấu, lịch sử, thành tích — tự lưu, tự thử lại khi mất mạng.
- Trung tâm thông báo tức thời: giáo viên đăng là máy học sinh hiện ngay, có đếm chưa đọc, mức ưu tiên và đánh dấu đã đọc.
- What's New: xem bản cập nhật mới nhất và toàn bộ lịch sử phiên bản ngay trên trang chủ.
- Dev Dashboard 6 tab cho giáo viên: Tổng quan, Học sinh, Thông báo, Changelog, Nhật ký, Cài đặt.
- Import danh sách học sinh từ tệp TXT, tự phát hiện trùng họ tên và đánh dấu hồ sơ cần phân biệt.

### Cải tiến

- Bảo mật: bật RLS cho toàn bộ bảng; danh sách học sinh không đọc được từ trình duyệt, chỉ Edge Function dùng khoá máy chủ mới đọc được.
- Mọi thao tác quản trị đi qua Edge Function và phải xác thực bằng Dev Code; Dev Code không lưu ở máy người dùng.
- Giới hạn tần suất cho tìm kiếm, gắn danh tính và đăng nhập Dev Code để chống lạm dụng.
- Máy chủ kiểm tra lại họ tên khi gắn danh tính, không tin dữ liệu do trình duyệt gửi lên.

## [3.1.1] — 2026-11-15

### Sửa lỗi

- Sửa lỗi lớn nhất: hộp thoại xác nhận danh tính nằm BÊN DƯỚI màn hình nhận diện nên bấm Xác nhận không có phản ứng gì. Đã sửa đúng thứ tự lớp và bỏ bước xác nhận trùng — bấm Xác nhận là vào ngay.
- Không còn bắt buộc phải chọn trong danh sách gợi ý: gõ đúng họ tên rồi bấm Xác nhận (hoặc Enter) là được, máy chủ tự đối chiếu.
- Máy chủ trước đây hiểu nhầm yêu cầu chỉ có họ tên là 'xem liên kết' nên trả về chưa gắn danh tính — đã sửa để xác nhận đúng.
- Trên điện thoại, chạm vào gợi ý giờ chọn được ngay; trước đây danh sách ẩn trước khi kịp nhận cú chạm nên không bao giờ chọn được tên.
- Hồ sơ trùng họ tên: máy chủ trả về danh sách hồ sơ để chọn đúng người thay vì báo lỗi chung.

### Cải tiến

- Thông báo lỗi rõ ràng cho từng trường hợp: không tìm thấy họ tên, hồ sơ chờ giáo viên phân biệt, hồ sơ đã bị vô hiệu hoá, thử quá nhiều lần.
- Chặn bấm Xác nhận nhiều lần liên tiếp để không tạo yêu cầu trùng.
- Gợi ý cách dùng ngay trên màn hình nhận diện: nhập đúng họ tên rồi bấm Xác nhận.

## [3.1.0] — 2026-11-15

### Sửa lỗi

- Xác nhận danh tính giờ kiểm tra đúng tên: nút Xác nhận chỉ mở khi đã chọn một gợi ý và tên trong ô phải khớp với gợi ý đó; máy chủ kiểm tra lần nữa và trả NAME_MISMATCH nếu lệch.
- Bỏ tự chọn hộ khi tìm kiếm chỉ trả về một kết quả — học sinh luôn tự chọn tên của mình.
- Chỉ còn một chuông thông báo: gỡ chuông đọc CHANGELOG.md cũ để không còn hai mục thông báo trùng nhau.
- Danh sách gợi ý không còn cách ô nhập và chỉ cuộn bên trong danh sách, không kéo cả màn hình đăng nhập.

### Giao diện & trải nghiệm

- Thêm nút icon đổi học sinh ngay cạnh chuông khi đã có danh tính.
- Vào thẳng màn hình nhận diện: nội dung trang ẩn cho tới khi xác định xong phiên, có splash BÁ KHÍ thay cho nháy trang.
- Dev Dashboard nằm trong menu 3 gạch và chỉ hiện sau khi nhập đúng Dev Code.
- Thêm đường dẫn CHANGELOG.md trong cửa sổ What's New và trong cửa sổ lịch sử cập nhật để xem lại toàn bộ phiên bản cũ.
- Tinh chỉnh giao diện điện thoại và máy tính: tên trên header thu gọn thành icon dưới 720px, panel rộng hết màn hình, tôn trọng vùng an toàn của tai thỏ.

### Hiệu năng

- Giảm gọi mạng trùng khi khởi động: thông báo và changelog chỉ tải một lần, thêm preconnect tới Supabase.
- Tạm dừng đồng bộ khi tab bị ẩn và chỉ làm mới trung tâm thông báo tối đa 5 giây một lần.

## [2.4.2] — 2026-11-14

### Giao diện & thông báo

- **Chỉ giữ** chuông thông báo cập nhật ở trang chủ `index.html`; loại bỏ hoàn toàn
  khỏi các trang môn, bài học, Studio và Music.
- **Tự giảm animation** trên máy yếu hoặc khi bật giảm chuyển động: thêm lớp `.lite`
  toàn cục, tắt hiệu ứng nặng ở toast, modal, overlay và thanh tiến độ.
- **Loại bỏ** badge “Portal [môn]” trên mọi thiết bị để header các trang môn gọn hơn.
- **Tinh chỉnh** bố cục mobile cho header, bảng thông báo và các nút điều hướng.

## [2.4.1] — 2026-11-14

### Thông báo trên header

- **Chuyển** chuông thông báo vào header thay vì nút nổi góc phải dưới; ở trang chủ
  chuông nằm ngay **bên trái nút README.md**, các trang bài học đặt cạnh nhóm nút bên phải.
- **Chuyển** bảng thông báo lên **góc trên bên phải**, ngay dưới chuông, tự canh lại khi đổi
  kích thước/cuộn trang.
- **Sửa** lỗi bảng thông báo đang ẩn vẫn chiếm chỗ và chặn thao tác — nguyên nhân khiến
  không bấm được nút ×/chuông; thêm `[hidden] { display: none }`.
- **Sửa** nút ×: vùng bấm lớn hơn (44px), thêm `touch-action`, đóng cả khi trình duyệt
  không phát `click`; giữ `Esc`, bấm nền và nút “Đóng”.
- **Thu gọn** chuông trên điện thoại (2,4rem) và tự chuyển thành nút nổi dưới header khi
  header quá chật, tránh tràn ngang.

## [2.4.0] — 2026-11-14

### Thông báo cập nhật

- **Thêm** chuông thông báo ở góc phải dưới trên mọi trang: mỗi phiên bản trong
  `CHANGELOG.md` là một thông báo, có badge số chưa đọc.
- **Thêm** bảng thông báo với nút **Đánh dấu đã đọc tất cả**, danh sách phiên bản kèm
  ngày và số thay đổi; trạng thái lưu ở `bakhiNotify.v1`.
- **Thêm** cửa sổ toàn màn hình khi bấm một thông báo: đầy đủ nội dung phiên bản
  (Markdown an toàn), nút ×, `Esc` và bấm nền để đóng.
- **Thêm** `BKNotify` API: `open`/`close`, `openArticle`, `markAll`, `items`, `unread`,
  `parse`, `setSource`, `refresh`.
- **Hỗ trợ** đọc `CHANGELOG.md` trực tiếp khi chạy http(s); khi mở `file://` hiện
  thông báo giải thích thay vì lỗi.

## [2.3.0] — 2026-11-14

### Thành tích 30 mốc

- **Thêm** 17 mốc mới, nâng tổng lên 30, chia 5 nhóm: Học tập (6), Luyện tập (9),
  Sổ tay (6), Studio (5), Khám phá (4). Không mốc nào dựa trên chuỗi ngày, điểm danh
  hay thời gian.
- **Thêm** `BK.signals` — tín hiệu dùng chung ở key riêng `bakhiSignals.v1` (chỉ số đếm,
  không lưu nội dung): tài liệu/bản vẽ/lượt xuất/lượt chèn/số từ của Studio, lượt phát
  nhạc, lượt mở bảng lệnh, lượt xuất sao lưu.
- **Thêm** `BK.achievements.progress()` (tiến độ từng mốc) và `next()` (3 mốc gần đạt),
  `groups`, `lastUnlocked()`; thông báo toast khi mở khoá (gộp khi nhiều mốc cùng lúc).
- **Nâng cấp** tab Thành tích: tổng quan 30 mốc, tiến độ theo nhóm, lọc Tất cả/Đã đạt/
  Chưa đạt, tìm kiếm, thanh tiến độ và số đếm từng mốc, ngày đạt; huy hiệu `x/30` trên tab.
- **Nâng cấp** Tổng quan: thẻ Thành tích có thanh tiến độ, 3 mốc gần đạt tiếp theo và
  liên kết mở tab Thành tích.

### Studio & Music

- **Thêm** Studio tự ghi tín hiệu khi lưu tài liệu có nội dung, có bản vẽ, xuất HTML/TXT/
  PNG, chèn bản vẽ vào trang và ghi nhận số từ lớn nhất của một tài liệu.
- **Thêm** Music Player tăng tín hiệu ở mỗi lượt phát thật (sự kiện `play`) và tự kiểm tra
  thành tích nếu lớp học tập có mặt.
- **Thêm** xuất sao lưu dữ liệu và mở bảng lệnh được tính vào nhóm Khám phá.

### Kiểm thử

- **Mở rộng** smoke test: 30 mốc, 5 nhóm, cấu trúc `progress()`, mốc gần đạt, tín hiệu
  Studio/Music/bảng lệnh/sao lưu, bỏ qua đường dẫn lạ, kẹp giá trị âm, render/lọc/badge.

## [2.2.0] — 2026-11-14

### Bá Khí Studio (Word & Paint)

- **Thêm** ứng dụng tĩnh độc lập `studio/word-paint.html`: soạn thảo kiểu Word (định dạng chữ/đoạn,
  màu, danh sách, canh lề, liên kết, ảnh, đếm từ, in/PDF) kết hợp bảng vẽ kiểu Paint (bút, tẩy,
  hình khối, mũi tên, chữ, màu, cỡ nét, độ đậm, hoàn tác 8 bước, tải PNG).
- **Thêm** chèn bản vẽ vào tài liệu, ba chế độ Word/Paint/Chia đôi, nhiều tài liệu, đổi tên,
  nhân bản, xoá có xác nhận.
- **Thêm** lưu tự động (`bakhiStudio.v1`), xuất HTML tự chứa, xuất TXT, mở `.html/.txt`, dán an toàn.
- **Thêm** lối vào từ menu 3 gạch của trang chủ và từ command palette (`Ctrl/⌘ + K`).

### Tinh chỉnh

- **Sửa** thao tác định dạng trong Studio: giữ vùng chọn khi bấm nút và `Ctrl+A` chỉ chọn nội dung trang.
- **Thêm** tài liệu `docs/STUDIO.md`, cập nhật README, FEATURES, CHANGELOG.

## [2.1.0] — 2026-11-14

### Music Player

- **Thêm** bố cục nổi đầy đủ: kéo thanh tiêu đề để di chuyển, kéo góc dưới-trái để đổi
  kích thước, nút thu nhỏ / phóng to, nhấp đúp tiêu đề để đặt lại; nhớ ở
  `bakhiMusic.panel.v1`; màn hình hẹp tự chuyển thành bảng đáy.
- **Thêm** phím tắt `Space` (phát/tạm dừng), `←/→` (tua 5 giây), `M` (tắt tiếng),
  `Esc` (đóng) — chỉ khi panel nhạc đang mở, tự bỏ qua khi đang gõ hoặc tiêu điểm ở nút.
- **Sửa** nút “Tiếp tục: …”: trước đây biến mất ngay khi bấm mà không phát nhạc; nay
  nút chỉ ẩn khi âm thanh thực sự phát và tự đặt lại `src` khi cần.
- **Thêm** `BKMusic.on(fn)` (phát sự kiện thay đổi), `maximize()`, `minimize()`,
  `resetLayout()`, `showTab()`, `isOpen()`; tab Music của Dev Panel cập nhật theo sự
  kiện thay vì polling mỗi giây.
- **Thêm** Media Session (khoá màn hình / tai nghe) và vùng thông báo `aria-live`.
- **Cải thiện** trợ năng: `aria-label`, `aria-pressed`, `aria-valuetext`, tab theo chuẩn
  `tablist`/`tabpanel`, điều hướng tab bằng phím, mục queue dùng `Enter`/`Delete`/
  `Alt+↑↓`, viền tiêu điểm, tay chạm to hơn, tôn trọng `prefers-reduced-motion`.

### Giao diện

- **Thêm** chuyển động nhẹ khi đổi tab ở Developer Playground, Music Player và Trung tâm
  học tập, tự tắt khi người dùng chọn giảm chuyển động.

### Tài liệu

- **Thêm** `docs/MUSIC.md`; mở rộng `README.md` (mục Music Player, bảng phím tắt, trạng
  thái dự án), `docs/FEATURES.md` (mục Music Player & khả năng tiếp cận) và
  `docs/ARCHITECTURE.md`.

## [2.0.0] — 2026-11-13

### Nền tảng học tập

- **Thêm** lớp dữ liệu local-first `BK` (`assets/bakhi/bk-core.js`): key duy nhất
  `bakhiLearn.v1`, có phiên bản, validate từng trường, giới hạn kích thước, tự phục hồi
  và sao lưu dữ liệu hỏng.
- **Thêm** Trung tâm học tập 7 tab: tổng quan, ôn tập, ghi chú, đánh dấu, lịch sử,
  thành tích, cài đặt.
- **Thêm** ôn tập thông minh: tự lưu câu sai, lịch ôn theo kết quả, đánh dấu thành thạo,
  hẹn ngày thủ công, tìm/lọc theo môn, lịch sử ôn.
- **Thêm** ghi chú cá nhân (ghim, danh mục, Markdown an toàn, xuất tệp).
- **Thêm** đánh dấu câu hỏi/bài học/môn/tài liệu.
- **Thêm** lịch sử học tập có tìm kiếm, xoá từng mục và xoá toàn bộ có xác nhận.
- **Thêm** 10 thành tích dựa trên hoạt động học thật (không streak, không điểm danh).
- **Thêm** Focus Mode (không có đồng hồ phiên) và cỡ chữ điều chỉnh được.
- **Thêm** tìm kiếm toàn cục (bài học, câu đã luyện, câu cần ôn, ghi chú, đánh dấu)
  và command palette `Ctrl/⌘ + K` có điều hướng bàn phím.
- **Thêm** phím tắt: `/`, `Esc`, `←/→`, `A/B/C/D` — bỏ qua khi đang nhập liệu.
- **Thêm** xuất/nhập JSON có xem trước, kiểm tra phiên bản và hợp nhất không phá dữ liệu.
- **Thêm** cầu nối trang bài học: ghi lịch sử, đọc ngân hàng câu hỏi (chỉ đọc), ghi nhận
  kết quả luyện tập theo mẫu feedback quen thuộc + API `BK.practice()`.

### Developer Playground 2.0

- **Thêm** `assets/bakhi/bk-dev.js|css`: cửa sổ nổi kéo/đổi kích thước, thu nhỏ/phóng to,
  nhớ vị trí/kích thước/tab, responsive, `Ctrl+Shift+G`.
- **Thêm** Inspector 2.0: chọn phần tử, highlight, breadcrumb, thuộc tính, computed styles,
  box model, copy selector/HTML, sửa style tạm thời + khôi phục.
- **Thêm** CSS Studio: live CSS, rule builder, undo/redo, reset, xuất CSS.
- **Thêm** Animation Studio: preset, keyframes, easing (kể cả cubic-bezier), timeline,
  play/pause/restart, xuất CSS, lưu/nhập preset, tôn trọng reduced-motion.
- **Thêm** Performance Lab: TTFB, DCL, load, FCP, LCP, CLS, long tasks, FPS thật,
  tài nguyên nặng nhất; không suy đoán khi thiếu API.
- **Thêm** Storage Manager: xem/sửa/xoá có bảo vệ, tìm kiếm, xuất/nhập, dung lượng.
- **Thêm** Console Pro và Network Monitor (chỉ đọc), Theme Editor, Component Library,
  Backup Manager.
- **Giữ nguyên** Developer Panel cũ (11 tab) và toàn bộ hàm toàn cục (`DX`, `showToast`,
  `switchDevTab`, `palette`, …).

### Bảo toàn nội dung & chất lượng

- **Thêm** `tools/content-integrity.js` + baseline `docs/content-baseline.json` cho 56 tệp:
  xác minh sha256 sau khi loại đúng khối script được chèn.
- **Thêm** `tools/integrate-pages.js` (idempotent) và `tools/qa/smoke.js` (45 kiểm tra DOM).
- **Không thay đổi** bất kỳ câu hỏi, phương án, đáp án, giải thích, công thức nào.
- **Không thêm** bất kỳ tính năng thi cử/tính giờ nào.

### Tài liệu

- **Thêm** `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/SUPABASE_SETUP.md`,
  cập nhật `README.md` và `CHANGELOG.md`.

### Đã biết

- Ba tệp HTML không có `</body>` (`images/anh/1.html`, `music/1.html`,
  `ktgk1/hoa/indexhoa.html`) chưa được gắn cầu nối học tập.
- Ghi nhận luyện tập tự động là best-effort theo cấu trúc trang.
- Đồng bộ Supabase và AI cần cấu hình thêm (không có key trong repository).

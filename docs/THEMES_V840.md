# Giao diện & nhận diện — Bá Khí 8.4.0

Tài liệu cho hệ **giao diện (theme)** và **biểu tượng trang trí cạnh tên**.
Hai thành phần này dùng chung một mô-đun để tránh mỗi trang tự dựng một bản.

| Tệp | Vai trò |
|---|---|
| `assets/bakhi/bk-themes.js` | `window.BKThemes` (giao diện) và `window.BKUserName` (tên + biểu tượng) |
| `assets/bakhi/bk-themes.css` | Lớp nền, nghệ thuật theo mùa, quy tắc phạm vi, thẻ chọn giao diện, kiểu tên |
| `tools/integrate-pages.js` | Chèn hai thẻ trên vào mọi trang có `bk-core.js` (idempotent) |
| `tools/qa/themes-smoke.js` | Smoke test jsdom cho cả hai thành phần |

## 1. Nguồn sự thật

- **Sở hữu** và **đang dùng** nằm ở Supabase: `user_inventory` với
  `reward_catalog.kind = 'theme'`; `bk_gam_equip` đặt `is_equipped` và tự bỏ trang bị
  của giao diện cùng loại. Không có bảng thứ hai.
- `bk-themes.js` chỉ giữ **cache cục bộ** (`localStorage.bakhiTheme.v1`) gồm
  `{ id, owned[], deco }`. Cache này được ghi lại mỗi lần `BKThemes.syncFromState(state)`
  chạy — tức là mỗi lần `bk-gamification.js` nhận trạng thái mới từ máy chủ.
- `BKThemes.setTheme()` **từ chối** giao diện không có trong danh sách sở hữu, đồng thời
  gọi `equip` để lựa chọn theo tài khoản và đồng bộ sang thiết bị khác.
- Biểu tượng trang trí dùng đúng `is_equipped` của vật phẩm `kind = 'decoration'`;
  cùng một cache `deco` phục vụ mọi nơi hiển thị tên.

## 2. Phạm vi hiển thị

`BKThemes.scope()` quyết định phạm vi, theo thứ tự:

1. `data-bk-theme-scope` trên `<body>` nếu trang tự khai báo
   (`page` / `head` / `accent` / `none`).
2. Đường dẫn: `/ktgk1|ktgk2|ktck1|ktck2|kttx` → `head`; trang chủ `/` → `page`;
   còn lại → `accent`.

| Phạm vi | Nơi áp dụng | Cách hiển thị |
|---|---|---|
| `page` | Trang chủ | `#bkThemeLayer` phủ toàn màn hình, có lớp phủ giữ tương phản; nội dung nằm trên |
| `head` | Trang môn học | Chỉ `header` / `.bk-topbar` / `.bk-page-head` nhận `bk-theme-head`; nội dung bài học giữ nguyên. Giáng Sinh thả tuyết **trong khung header** (`.bkth-head-snow`) |
| `accent` | Hồ sơ, Tiến trình, Cài đặt, Kỹ năng | Chỉ đổi biến màu nhấn và thanh tiến trình, **không** phủ nền. Giáng Sinh thêm lớp tuyết toàn trang `#bkThemeOverlay` (không vẽ lại nền) |
| `none` | Trang quản trị | Không áp dụng |

Trang `admin/` và `founder/` không được chèn `bk-themes.js`.

## 3. Bộ giao diện

| id | Tên | Nghệ thuật |
|---|---|---|
| `theme-dawn` | Bình Minh | nền chuyển sắc cam → hồng |
| `theme-midnight` | Nửa Đêm | xanh đêm + quầng sáng lạnh |
| `theme-sakura` | Anh Đào | hồng phấn |
| `theme-ocean` | Đại Dương | xanh biển → ngọc lam |
| `theme-forest` | Rừng Xanh | xanh lá trầm |
| `theme-royal` | Hoàng Gia | tím + vàng đồng |
| `theme-mint` | Bạc Hà | xanh ngọc |
| `theme-ember` | Hồng Ngọc | đỏ than hồng |
| `theme-halloween` | Halloween | bí ngô khắc mặt phát sáng (3 cỡ) **rơi khắp trang** (`bkthPumpkinFall`), dơi bay, tông cam–tím |
| `theme-christmas` | Giáng Sinh | **tuyết rơi toàn website** (28 hạt ở trang chủ, 16 hạt trong header trang môn, 24 hạt ở lớp phủ hồ sơ/cài đặt/tiến trình), cây thông, tông xanh–đỏ |

**Halloween và Giáng Sinh miễn phí cho toàn bộ học sinh (8.4.3).** Hai giao diện này
luôn có trong kho của mọi hồ sơ (`user_inventory.source = 'seasonal_free'`) và client
coi là đã sở hữu (`BKThemes.FREE_THEMES`, `BKThemes.isFree()`) nên học sinh chọn được
ngay trong Cài đặt → Hình nền, không cần Founder trao. Tám giao diện còn lại vẫn là vật
phẩm mở khoá từ Kho vật phẩm.

Bí ngô và cây thông là SVG nội tuyến (data URI) nên không cần tải ảnh; tuyết và dơi là
phần tử CSS thuần với `transform`/`opacity`, không chặn cuộn (`pointer-events: none`).

### Thêm một giao diện mới

1. Thêm một mục vào `THEMES` trong `bk-themes.js` (`id`, `name`, `art`, `accent`, `desc`).
2. Thêm khối `html[data-bk-theme="<id>"]` trong `bk-themes.css` để đặt `--bkth-*`.
3. Thêm dòng `reward_catalog` trong một migration mới (không sửa migration cũ).
4. Nếu cần nghệ thuật riêng: thêm nhánh trong `buildLayer()` và biến `--bkth-art-<art>`.

## 4. Tên có biểu tượng — `BKUserName`

```js
// Tên + biểu tượng đang trang bị
node.appendChild(BKUserName.node('Nguyễn An', { size: 'large' }));

// Mini profile: [Avatar] Tên [Biểu tượng] + dòng phụ
host.appendChild(BKUserName.mini({ name: 'Nguyễn An', sub: 'Cấp 12', avatar: avatarNode }));

// Hồ sơ người khác: truyền biểu tượng của chính người đó
BKUserName.node(name, { deco: otherDeco, size: 'large' });

BKUserName.refresh(); // cập nhật mọi [data-bk-user-name] sau khi đổi biểu tượng
```

Đã dùng tại: menu tài khoản (`bk-shell.js`), hồ sơ (`bk-profile-ui.js`),
hero trang Tiến trình (`bk-gamification.js`). Tên dài được cắt bằng ellipsis;
biểu tượng `flex: 0 0 auto` nên không chồng lên badge, tên hay khung avatar.

## 5. Cài đặt → Hình nền

`bk-settings.js` dựng `BKThemes.renderPicker()` ngay dưới phần hình nền có sẵn:
xem trước, trạng thái **Đang dùng / Sẵn sàng / Chưa sở hữu**, nút áp dụng và
nút **Về giao diện mặc định**. Ảnh nền tự tải lên (IndexedDB) vẫn hoạt động độc lập.
Halloween và Giáng Sinh hiện nhãn **Miễn phí** thay cho **Chưa sở hữu** và luôn bấm được.

## 6. Migration

`supabase/migrations/20261213000000_bakhi_v840_founder_grants.sql`:

1. Thêm `theme-halloween`, `theme-christmas` vào `reward_catalog`.
2. Thêm cột `user_skill_progress.founder_granted` để phân biệt node Founder cấp với node
   học sinh tự mở.
3. Bảng `founder_skill_grants` (ai cấp, khi nào, bao nhiêu node, khi nào thu hồi).
4. Hàm chỉ đọc `bk_gam_founder_tree_status(uuid)`.

Migration **chưa được áp dụng** trong phiên 8.4.0. Chạy `supabase db push` rồi trao
giao diện theo mùa trong tab Gamification → Give Themes.

### Giao diện theo mùa miễn phí (8.4.3)

`supabase/migrations/20261215000000_bakhi_v843_free_seasonal_themes.sql`:

1. Bảo đảm `theme-halloween`, `theme-christmas` có trong `reward_catalog`.
2. `bk_gam_free_themes(uuid)` cấp hai giao diện (`source = 'seasonal_free'`), idempotent.
3. Backfill cho toàn bộ học sinh hiện có; trigger `students_free_seasonal_themes` cấp sẵn
   cho hồ sơ tạo sau này.
4. `bk_gam_equip` gọi `bk_gam_free_themes` khi trang bị hai giao diện này nên không còn
   trả `NOT_OWNED`. Học sinh không cần thao tác gì thêm.

## 7. Give Themes — trao giao diện từ Founder Dashboard (8.4.1)

Thẻ **Give Themes** nằm trong tab **Gamification** của Founder Dashboard
(`bk-founder-grants.js` → `BKFounderGrants.renderThemes()`), cùng chỗ với
Give Special Badges và Trao vật phẩm:

1. Chọn người nhận ở thẻ **Đối tượng nhận** (một học sinh).
2. Chọn một hoặc nhiều giao diện trong lưới (có tìm kiếm, nút chọn tất cả chưa sở hữu).
   Giao diện đã sở hữu bị khoá; giao diện chưa có trong `reward_catalog` hiện ghi chú
   “cần chạy migration”.
3. **Xem trước trao giao diện** → bảng Đang có / Sau khi trao → **Xác nhận**.

Không có đường ghi mới: thao tác đi qua `admin.items.preview` và `admin.items.grant`
(`bk_gam_grant_items`), nên máy chủ vẫn kiểm tra scope Founder, tôn trọng
`metadata.max_quantity`, bỏ qua giao diện đã sở hữu và ghi `gamification_activity_logs`.
Danh mục lấy từ `admin.items.catalog`; `BKThemes.THEMES` chỉ bổ sung tên/mô tả khi kho
thiếu bản ghi — không có danh sách giao diện thứ hai.

`20261214000000_bakhi_v841_founder_full_items.sql` (idempotent) cấp toàn bộ vật phẩm
đang bật cho hồ sơ Founder, để chính Founder không phải tự trao giao diện cho mình.

## 8. Ghi chú 8.4.2 — xếp lớp nền trang chủ

`bk-themes.css` **không được** đặt `position` cho con của `body`. Lớp `#bkThemeLayer`
dùng `position: fixed; inset: 0; z-index: -1; pointer-events: none`, nội dung trang vẽ
phía trên theo luồng bình thường. Nhờ vậy header dính, chuông, nút Báo cáo và trình nhạc
giữ đúng `position: fixed/sticky`.

Với trang môn học (`scope=head`), `.bk-theme-head` chỉ thêm gốc định vị cho
`::before/::after`; các lớp `sticky` / `fixed` / `absolute` của header được khôi phục
bằng quy tắc riêng để thanh đầu trang vẫn dính khi cuộn.

Kiểm tra hồi quy: `NODE_PATH=/tmp/bktest/node_modules node tools/qa/themes-smoke.js`
(có mục “Xếp lớp trang chủ (hồi quy 8.4.2)”).

## 9. Ghi chú 8.4.3 — hiệu ứng theo mùa phủ toàn trang

- **Hai lớp, hai nhiệm vụ:** `#bkThemeLayer` (z-index `-1`) giữ nền gradient, lớp phủ giữ
  tương phản và cây thông phía sau nội dung; `#bkThemeFx` (z-index `2`, `pointer-events:
  none`) chứa hiệu ứng chuyển động nên bí ngô/dơi/tuyết hiện được **trên** thẻ nội dung
  thay vì bị che mất.
- **Halloween**: `.bkth-pumpkin` trong `#bkThemeFx` đặt `top: -22vh` và chạy
  `bkthPumpkinFall` (0 → 122vh) nên bí ngô rơi qua toàn bộ chiều cao trang chủ, không còn
  `bottom` cố định. Ba quỹ đạo (`is-a/b/c`) lệch nhau bằng `animation-delay` âm và khác độ
  mờ/kích thước để không che chữ quá nhiều. Khi giảm chuyển động, quy tắc
  `top: auto; bottom: 2%` đưa bí ngô về trạng thái đứng yên ở đáy.
- **Giáng Sinh** dùng chung một hàm `snowPile(count, cls)` cho ba phạm vi:
  - `page` → `#bkThemeLayer` (toàn màn hình, kèm cây thông).
  - `head` → `.bkth-head-snow` gắn trong `.bk-theme-head`, `overflow: hidden` + keyframe
    `bkthSnowHead` chạy theo `top` phần trăm nên rơi vừa mọi chiều cao header.
  - `accent` → `#bkThemeOverlay` (fixed, `pointer-events: none`, `z-index: 1`), chỉ có hạt
    tuyết, không có nền/veil để không che nội dung.
- `clearScopeMarks()` gỡ `#bkThemeLayer`, `#bkThemeFx`, `.bkth-head-snow` và
  `#bkThemeOverlay` mỗi lần `paint()`, nên đổi giao diện hoặc tắt giao diện không để lại
  hạt tuyết hay bí ngô mồ côi.
- **Nền riêng của trang chủ nhường chỗ:** khi có giao diện phạm vi `page`,
  `#bgImage`, `#bgOverlay`, `#starCanvas` và `.nebula` được đặt `opacity: 0`. Trước đây
  `#bgOverlay` (90% đục) phủ lên lớp nền `z-index: -1` nên bí ngô/tuyết gần như vô hình.

# Sinh mã tự động (Achievement · Boss · Mission · Node · Reward)

Một hàm duy nhất: `BKGamificationAdmin.slugify()` trong
`assets/bakhi/bk-devboard-gamification.js`. Không có hàm slug thứ hai trong dự án.

## 1. Quy tắc

1. Chuẩn hoá Unicode NFD, bỏ dấu tiếng Việt.
2. `đ` / `Đ` → `d` / `D`.
3. Chuyển chữ thường.
4. Mọi chuỗi ký tự không phải `a-z0-9` → `_`.
5. Gộp nhiều `_` liên tiếp, bỏ `_` ở đầu/cuối.
6. Cắt tối đa 64 ký tự.
7. Kết quả rỗng → **không lưu** (báo lỗi yêu cầu nhập tên có chữ/số).

## 2. Ví dụ bắt buộc

| Đầu vào | Mã |
|---|---|
| Ma Vương | `ma_vuong` |
| Nhà Thám Hiểm | `nha_tham_hiem` |
| Bậc Thầy Kiến Thức | `bac_thay_kien_thuc` |
| Chiến Binh Tri Thức | `chien_binh_tri_thuc` |
| Người Ôn Tập Chăm Chỉ | `nguoi_on_tap_cham_chi` |
| Đỉnh Cao Kiến Thức | `dinh_cao_kien_thuc` |
| Đường Đến Thành Công | `duong_den_thanh_cong` |
| Long Thần Hủy Diệt | `long_than_huy_diet` |
| Boss 01 | `boss_01` |

## 3. Chống trùng

`suggestCode(base, taken)`:

- Chưa tồn tại → giữ nguyên.
- Đã tồn tại → `ma_vuong_2`, `ma_vuong_3`… (tối đa 999).

Giao diện hiển thị cảnh báo + nút **Dùng mã đề xuất**; người quản trị phải bấm mới đổi.
Máy chủ kiểm tra lần cuối bằng `expect_new` → `409 CODE_TAKEN` nếu mã đã tồn tại.

## 4. Phía máy chủ

`supabase/functions/gamification-api/index.ts` → `codeOf()`:

```ts
str(v, 64).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9_-]+/g, '_')
  .replace(/^[_-]+|[_-]+$/g, '')
  .slice(0, 64);
```

Giữ được cả `_` và `-` để không phá mã cũ (ví dụ node `knowledge-1`).

## 5. Ràng buộc cơ sở dữ liệu

- `achievement_defs.id`, `mission_defs.id`, `skill_tree_nodes.id`, `reward_catalog.id`:
  `text` 1–64 ký tự, khoá chính.
- `boss_challenges.slug`: từ 8.3.5 cho phép `_` —
  `check (slug ~ '^[a-z0-9][a-z0-9_-]{2,63}$')`.
- Không dùng **tên hiển thị** làm khoá. Luôn phân biệt: `id` (khoá ổn định), `name`
  (hiển thị), `code` (chính là `id` do người quản trị đọc được).

## 6. Đổi tên và tham chiếu

- Đổi **tên** không đổi **mã** trừ khi bạn xóa mã trong Cài đặt nâng cao.
- Đổi **mã** = tạo bản ghi mới. Với thành tích, lịch sử người đã nhận không đi theo; với
  Boss, học sinh đang mở bằng mã cũ sẽ không thấy Boss mới. Giao diện cảnh báo trước.

## 7. Kiểm thử

`tools/qa/v835-code-generator.js` — 24 ca: bảng ví dụ, chữ hoa, khoảng trắng liên tiếp,
ký tự đặc biệt, tên rỗng, chỉ ký tự đặc biệt, `đ`, số, chống trùng `_2/_3`, bộ đọc câu hỏi Boss.

# Color mapping — Quiet Graphite

Một nguồn token duy nhất: `assets/bakhi/bk-rebirth.css`. Không hard-code màu trong component mới.

## 1. Bảng ánh xạ token cũ → mới

| Token cũ | Token mới | Vai trò |
|---|---|---|
| `--bk-bg`, `--bk-bg-2` | `--rb-bg` `#0b0b0e` | Nền trang |
| `--bk-surface` | `--rb-surface-1` `#111116` | Thẻ, panel |
| `--bk-surface-2` | `--rb-surface-2` `#17171d` | Bề mặt phụ, input |
| `--bk-surface-3` | `--rb-surface-3` `#1f1f27` | Lớp nổi, toast |
| `--bk-line` | `--rb-line-strong` `rgb(255 255 255 / .14)` | Đường phân cách rõ |
| `--bk-line-soft` | `--rb-line` `rgb(255 255 255 / .07)` | Hairline |
| `--bk-text` | `--rb-text` `#f2efec` | Chữ chính |
| `--bk-text-2` | `--rb-text-2` `#b9b6bd` | Chữ phụ |
| `--bk-text-3` | `--rb-text-3` `#8f8c96` | Chữ mờ, nhãn |
| `--bk-brand` / `--bk-primary` | `--rb-accent` `#ffb6c1` | Accent duy nhất |
| `--bk-brand-2` / `--bk-secondary` | `--rb-violet` `#c4b5fd` | Accent bổ trợ (hạn chế) |
| `--bk-highlight` | `--rb-sky` `#7dd3fc` | Liên kết/phiên bản |
| `--bk-ok/warn/danger` | `--rb-ok/warn/danger` | Trạng thái |
| `--bkl-primary` | `--rb-accent` | Lớp học tập |
| `--bkl-surface*` | `--rb-surface*` | Lớp học tập |
| `--bkl-radius` | `--rb-r-md` `12px` | Bo góc |

Chế độ sáng ghi đè trong `html.light`; các token cũ được ánh xạ lại để module không phải sửa.

## 2. Quy ước dùng màu

- **Accent hồng ≤ 5% diện tích**: chỉ dùng cho active, hành động chính, focus, thanh tiến độ, badge chưa đọc.
- **Không dùng màu làm tín hiệu duy nhất**: trạng thái luôn có icon + chữ.
- **Nền tối mặc định**, `html.light` là bề mặt giấy ấm `#f6f4f1`, không phải trắng tinh.
- **Đường kẻ bằng alpha**, không dùng xám đặc, để chuyển theme không lệch.
- **Bóng đổ chỉ cho lớp nổi** (toast, dialog, rail tooltip); dark dùng chênh bề mặt thay vì bóng dày.
- **Tailwind cũ** (indigo/blue/emerald/amber) được quy đổi trong phạm vi `body.bk-rebirth` để bài học và trang chủ không còn lệch tông.

## 3. Độ tương phản đo được (WCAG 2.1)

| Cặp | Tỷ lệ | Mức |
|---|---|---|
| Dark text / bg | 17.16:1 | AAA |
| Dark text-2 / bg | 9.82:1 | AAA |
| Dark text-3 / bg | 5.95:1 | AA |
| Dark accent text / bg | 11.90:1 | AAA |
| Accent ink / accent | 10.75:1 | AAA |
| Dark ok / surface-1 | 13.41:1 | AAA |
| Dark warn / surface-1 | 13.05:1 | AAA |
| Dark danger / surface-1 | 8.30:1 | AAA |
| Light text / bg | 16.51:1 | AAA |
| Light text-2 / bg | 7.89:1 | AAA |
| Light text-3 / bg | 4.96:1 | AA |
| Light accent text / white | 6.08:1 | AA |
| Light ok / white | 5.48:1 | AA |
| Light warn / white | 4.92:1 | AA |
| Light danger / white | 6.47:1 | AA |

Ghi chú: `text-3` là mức thấp nhất và vẫn ≥ 4.5:1 cho chữ thường. Chữ trên accent dùng `--rb-accent-ink` (nâu đậm), không dùng trắng.

## 4. Chỗ cần kiểm tra thêm khi có dữ liệu thật

- Ảnh đại diện/huy hiệu do người dùng tải lên có thể có nền sáng; khung avatar dùng viền `--rb-line-strong` để tách.
- Màu trong nội dung bài học (highlight, KaTeX) giữ nguyên; không ép màu để tránh sai nghĩa.
- Biểu đồ trong gamification/admin nếu có dùng màu riêng của module — chưa ghi đè vì chưa có dữ liệu đo.

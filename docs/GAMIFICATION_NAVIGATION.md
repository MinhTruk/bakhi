# ĐIỀU HƯỚNG TỚI TIẾN TRÌNH (8.3.1)

## Vị trí

Menu tài khoản dùng chung (`assets/bakhi/bk-shell.js`), ngay sau **Hồ sơ cá nhân**:

```
Hồ sơ cá nhân
Tiến trình học tập   ← /gamification/   (XP · cấp độ · nhiệm vụ)
Chat
Giao diện
README.md
Bá Khí Studio
Cài đặt
```

Menu này xuất hiện trên mọi trang có `bk-shell.js` (desktop và mobile), nên chỉ có **một**
định nghĩa lối vào — không tạo nút thứ hai, không sửa từng trang.

## Thuộc tính

| Thuộc tính | Giá trị |
|---|---|
| Thẻ | `<a>` (liên kết thật, không phải nút giả) |
| `href` | `S.base + 'gamification/'` → đúng route `gamification/index.html` |
| `role` | `menuitem` |
| `data-bk-progress-link` | `1` (dấu hiệu cho QA) |
| `aria-current` | `page` khi `location.pathname` kết thúc bằng `/gamification/` |
| Đóng menu | `closeMenu()` trước khi điều hướng, không reload thừa |

## Hành vi

- Route là thư mục tĩnh của GitHub Pages; mở trực tiếp URL, Back/Forward và refresh đều
  hoạt động vì không có router phía client.
- Nút **không** phụ thuộc trạng thái tải tiến trình: nó được dựng cùng menu, không chờ
  `BKCloud`, không bị vô hiệu hoá khi loader lỗi. Trang đích luôn hiển thị (nội dung tĩnh +
  trạng thái lỗi phù hợp), không bao giờ là trang trắng.
- Không có `preventDefault` nên không phá lịch sử trình duyệt.

## Kiểm tra

`tools/qa/gamification-navigation-smoke.js` (17 ca): route tồn tại, trang nạp đúng mô-đun,
menu mở được trong jsdom, href/role/nhãn/aria-current, không bị vô hiệu hoá, không phụ
thuộc trạng thái tải, chỉ một định nghĩa.

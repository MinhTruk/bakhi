# 📚 BAKHI

### 🌐 Nền tảng học tập và ôn luyện trực tuyến

> **BAKHI** là một website học tập cá nhân được xây dựng nhằm tổng hợp tài liệu, bài tập, câu hỏi trắc nghiệm và nội dung ôn thi vào một nơi duy nhất.

<p align="center">

🌐 **[Mở BAKHI](https://minhtruk.github.io/bakhi/)**  
&nbsp; • &nbsp;
📦 **[GitHub Repository](https://github.com/MinhTruk/bakhi)**

</p>

---

## 📖 Giới thiệu

Trong quá trình học tập, tài liệu thường nằm rải rác ở nhiều nơi. **BAKHI** được tạo ra để giải quyết vấn đề đó bằng cách xây dựng một không gian học tập riêng, nơi các nội dung có thể được sắp xếp theo **môn học, học kỳ, bài kiểm tra và chủ đề**.

BAKHI hướng đến việc giúp việc ôn tập trở nên:

- 📚 **Gọn gàng** hơn
- 🔎 **Dễ tìm kiếm** hơn
- ⚡ **Nhanh chóng** hơn
- 📝 **Tương tác** hơn
- 🎯 **Tập trung vào việc ôn thi**

---

# ✨ Tính năng

## 📚 Hệ thống tài liệu

Các nội dung học tập được phân chia thành từng khu vực riêng, giúp dễ dàng tìm đúng bài học hoặc phần cần ôn.

Có thể tổ chức theo:

- 📖 Môn học
- 📅 Học kỳ
- 📝 Bài kiểm tra
- 📑 Chủ đề
- 🎯 Nội dung ôn tập

---

## 📝 Bài tập tương tác

Thay vì chỉ đọc tài liệu, BAKHI hướng đến việc cho phép người dùng **làm bài trực tiếp trên website**.

Các trang bài tập có thể bao gồm:

- Câu hỏi trắc nghiệm
- Nhiều lựa chọn
- Câu hỏi theo chủ đề
- Bài luyện tập
- Nội dung ôn thi

---

## 🎲 Xáo trộn câu hỏi

Một số bài tập có thể sử dụng cơ chế xáo trộn để mỗi lần luyện tập có trải nghiệm khác nhau.

```text
Lần 1 → Câu 1 → Câu 5 → Câu 3 → Câu 2
Lần 2 → Câu 3 → Câu 1 → Câu 2 → Câu 5
```

Điều này giúp hạn chế việc ghi nhớ vị trí câu hỏi hoặc đáp án.

---

## ⚡ Phản hồi kết quả

Sau khi hoàn thành bài tập, hệ thống có thể cung cấp phản hồi trực tiếp như:

- ✅ Đáp án đúng
- ❌ Đáp án sai
- 📊 Điểm số
- 💡 Giải thích
- 🔄 Làm lại bài

---

# 🌐 Website

BAKHI được triển khai bằng **GitHub Pages**, vì vậy có thể truy cập trực tiếp mà không cần cài đặt.

### 🔗 Website

**https://minhtruk.github.io/bakhi/**

### 📦 Mã nguồn

**https://github.com/MinhTruk/bakhi**

---

# 🗂️ Cấu trúc dự án

Cấu trúc thư mục được tổ chức theo từng khu vực học tập:

```text
bakhi/
│
├── index.html
│
├── kttx/
│   └── gk1/
│       └── ...
│
├── gk1/
│   └── ...
│
├── hk1/
│   └── ...
│
├── gk2/
│   └── ...
│
├── hk2/
│   └── ...
│
├── ktgk1/
│   └── ...
│
├── ktck1/
│   └── ...
│
├── ktgk2/
│   └── ...
│
├── ktck2/
│   └── ...
│
└── README.md
```

> 📌 Cấu trúc có thể thay đổi khi BAKHI được mở rộng thêm nội dung.

---

# 🧭 Hệ thống điều hướng

`index.html` đóng vai trò là trang chính của website.

Có thể hình dung hệ thống như sau:

```text
                         📚 BAKHI
                            │
              ┌─────────────┴─────────────┐
              │                           │
          📅 Học kỳ                    📖 Môn học
              │                           │
        ┌─────┴─────┐                     │
       HK1          HK2                    │
        │             │                    │
       GK1           GK2                  ...
       CK1           CK2
```

Mỗi khu vực có thể chứa các trang HTML riêng và liên kết với nhau.

---

# 🛠️ Công nghệ sử dụng

BAKHI được xây dựng chủ yếu bằng các công nghệ web cơ bản:

### 🌐 HTML5

Dùng để xây dựng cấu trúc và nội dung của các trang.

### 🎨 CSS3

Dùng để thiết kế giao diện và bố cục.

### ⚙️ JavaScript

Dùng cho các chức năng tương tác, xử lý câu hỏi, xáo trộn và các tính năng động.

### 🐙 GitHub

Dùng để lưu trữ và quản lý mã nguồn.

### 🚀 GitHub Pages

Dùng để triển khai website.

---

# 💻 Chạy dự án trên máy

Clone repository:

```bash
git clone https://github.com/MinhTruk/bakhi.git
```

Di chuyển vào thư mục:

```bash
cd bakhi
```

Sau đó mở:

```text
index.html
```

bằng trình duyệt.

BAKHI là một dự án web tĩnh nên **không yêu cầu backend hoặc quá trình cài đặt phức tạp**.

---

# 📖 Cách sử dụng

### 1️⃣ Truy cập website

Mở:

**https://minhtruk.github.io/bakhi/**

### 2️⃣ Chọn nội dung

Đi đến môn học hoặc học kỳ cần ôn tập.

### 3️⃣ Chọn bài

Chọn bài học, đề kiểm tra hoặc chủ đề tương ứng.

### 4️⃣ Làm bài

Trả lời các câu hỏi trực tiếp trên website.

### 5️⃣ Kiểm tra kết quả

Xem điểm và đáp án để xác định phần kiến thức cần ôn lại.

---

# 📈 Trạng thái dự án

| Hạng mục | Trạng thái |
|---|---|
| 🌐 Website chính | 🟢 Hoạt động |
| 🏠 Trang chủ | 🟢 Hoạt động |
| 📚 Tài liệu học tập | 🟢 Đang phát triển |
| 📝 Bài tập tương tác | 🟢 Đang phát triển |
| 🎲 Xáo trộn câu hỏi | 🟢 Có |
| 📱 Giao diện responsive | 🟢 Đang cải thiện |
| 📊 Thống kê kết quả | 🟡 Đang lên kế hoạch |
| 💾 Lưu tiến độ | 🟡 Đang lên kế hoạch |

---

# 🗺️ Lộ trình phát triển

### ✅ Đã thực hiện

- [x] Xây dựng website chính
- [x] Tạo hệ thống điều hướng
- [x] Tổ chức tài liệu theo thư mục
- [x] Triển khai bằng GitHub Pages
- [x] Xây dựng các trang bài tập
- [x] Thêm các chức năng tương tác

### 🔨 Đang phát triển

- [ ] Cải thiện giao diện
- [ ] Bổ sung thêm môn học
- [ ] Bổ sung thêm đề kiểm tra
- [ ] Tối ưu giao diện trên điện thoại
- [ ] Cải thiện hệ thống câu hỏi

### 🔮 Dự kiến

- [ ] 💾 Lưu tiến độ học tập
- [ ] 📊 Thống kê kết quả
- [ ] 🏆 Lịch sử luyện tập
- [ ] 🔎 Tìm kiếm tài liệu
- [ ] 🎯 Phân loại độ khó
- [ ] 📈 Theo dõi quá trình học tập

---

# 🎨 Định hướng thiết kế

BAKHI hướng đến một giao diện:

- 🧹 Gọn gàng
- 👀 Dễ nhìn
- ⚡ Phản hồi nhanh
- 📱 Dễ sử dụng trên nhiều thiết bị
- 🧭 Dễ điều hướng
- 🛠️ Dễ mở rộng và bảo trì

Mục tiêu không phải biến website thành một hệ thống quá phức tạp, mà là tạo ra một **không gian học tập cá nhân tiện dụng**.

---

# 📂 Thêm nội dung mới

Khi muốn thêm một môn học hoặc một bài kiểm tra mới, có thể tạo các thư mục và trang HTML tương ứng.

Ví dụ:

```text
mon-hoc/
└── hoc-ky/
    ├── index.html
    ├── bai-01.html
    ├── bai-02.html
    └── quiz.html
```

Sau đó thêm liên kết đến trang tương ứng trong hệ thống điều hướng.

---

# 🤝 Đóng góp

BAKHI hiện là một **dự án học tập cá nhân**.

Nếu phát hiện lỗi hoặc có ý tưởng cải thiện, bạn có thể:

1. Kiểm tra lại đường dẫn trang.
2. Kiểm tra Console của trình duyệt nếu có lỗi JavaScript.
3. Tạo **Issue** trên GitHub để báo lỗi hoặc đề xuất tính năng.

---

# 📜 Bản quyền

BAKHI được xây dựng chủ yếu cho mục đích **học tập và sử dụng cá nhân**.

Các tài liệu hoặc nội dung có bản quyền thuộc về tác giả/chủ sở hữu tương ứng và không nên được phân phối lại khi chưa có sự cho phép.

---

# 👤 Tác giả

### MinhTruk

💻 Lập trình • 📚 Học tập • 🧪 Thử nghiệm

BAKHI được xây dựng trong quá trình học tập và phát triển các kỹ năng lập trình web.

---

<p align="center">

## 📚 BAKHI

**Học tập • Ôn luyện • Phát triển**

> *Tự xây công cụ để việc học trở nên dễ dàng hơn.*

</p>

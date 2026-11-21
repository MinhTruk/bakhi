---
slug: background
title: Project background
role: project background
updated: "2026-11-21T12:55:05"
---

# Project background

## Why

Học sinh Việt Nam ôn tập theo chương trình phổ thông cần một chỗ **học tự nhịp**: mở đúng bài, xem lại câu đã sai, và thấy tiến bộ của chính mình. Bá Khí gom nội dung ôn tập (Toán, Lý, các đợt kiểm tra giữa kỳ/cuối kỳ) vào một website tĩnh, mở là học, không cần đăng nhập để bắt đầu.

## Goals

- Nội dung giáo dục đầy đủ, ổn định, **không bao giờ bị thay đổi bởi việc nâng cấp giao diện**.
- Học sinh học được ngay khi mở trang; tài khoản chỉ để đồng bộ tiến trình, không phải cửa ải.
- Trải nghiệm đồng nhất trên 119 trang nhờ một lớp nâng cấp dùng chung (`assets/bakhi/`).
- Tiến trình, thành tích, kỹ năng được máy chủ (Supabase) xác nhận, không thể tự cộng XP ở trình duyệt.

## Non-goals

- Không phải nền tảng thi cử: không đề thi thử, không tính giờ, không đếm ngược, không tự nộp bài, không xếp hạng theo điểm thi.
- Không có bước build, không framework, không bundler, không thêm dependency chạy thời gian thực.
- Không đổi tên/gộp thư mục môn học hay đợt kiểm tra (đó là URL công khai của GitHub Pages).
- Không đưa khoá bí mật (service-role key, token) vào mã nguồn, tệp tĩnh hay chat.

## Target user

Học sinh cấp 3 tự ôn theo bài và theo đợt kiểm tra, thường dùng điện thoại, mạng không ổn định — nên thiết kế phải local-first, nhẹ, không phụ thuộc mạng để đọc nội dung. Giáo viên/Founder dùng dashboard để theo dõi tiến trình và trao thành tích. Xem [[static-no-build-architecture]].

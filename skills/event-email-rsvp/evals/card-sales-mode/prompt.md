---
tags: [skill-creator]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Mình cần dựng hệ thống gửi email mời + xác nhận tham dự cho sự kiện TALENT DAY 2026 của công ty. Danh sách khách nằm ở tab `KH_T11` trên Google Sheet của team (guest-list.csv là bản xuất: dòng 1 là nhóm cột, dòng 2 là header, dữ liệu từ dòng 3). Sales gọi điện mời xong thì tick để gửi; mỗi Sales gửi từ hộp thư công ty của chính họ (cột "Nhân viên phụ trách"). Email kèm thiệp mời in tên khách: thiệp làm trên Canva khổ 1080×1350 px, ô tên ở left 90, top 610, rộng 900, cao 130 px, font Dancing Script cỡ 72, màu #065f46; trên thiệp ghi giờ 13:30 - 17:30. Nội dung email theo email-template.txt. Menu trên sheet đặt tên "TALENT DAY", mã khách dạng TD26-0001.

Hôm nay chỉ dựng project trên máy vào thư mục `project/` — chưa đụng tới Google (không clasp, không đăng nhập, không gửi email). Làm xong cho mình xem trước email và liệt kê những việc còn lại phải làm trên Google.

Input files: guest-list.csv, email-template.txt

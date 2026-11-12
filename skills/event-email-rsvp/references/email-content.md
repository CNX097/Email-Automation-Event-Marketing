# Nội dung email: từ template marketing → event.json / Email.html

## Chuyển template marketing

Template marketing thường là Google Doc / văn bản có: lời chào, câu mở đầu, thông tin thời gian – địa điểm, lợi ích
khi tham dự, lưu ý, liên hệ, lời kết, chữ ký. Ánh xạ:

| Trong template | Trường `event` |
|---|---|
| "Kính gửi Anh/Chị …" / "Chào bạn …" | Tự sinh: `<greeting> <Tên in thiệp hoặc Họ tên>`; tên chưa có danh xưng → chèn `salutation` (mặc định "Kính gửi" + "Quý Anh/Chị"; sự kiện sinh viên: "Chào" + "bạn") |
| Cách xưng hô trong toàn email ("Anh/Chị", "bạn") | `pronoun` — dùng trong câu chữ cố định của email + form; câu chữ của template giữ nguyên văn |
| Câu mở đầu (dẫn vào tên sự kiện) | `intro` — email tự nối thêm ` <b>title</b>:` |
| Tên chương trình | `title` (đầy đủ), `name` (ngắn, dùng cho form / thư mục / thiệp) |
| Thời gian, địa điểm | `timeText`, `start`, `end`, `place`, `mapQuery` |
| Danh sách lợi ích / giá trị | `highlightsTitle` + `highlights[{title, text}]` |
| Lưu ý (giờ check-in…) | `note` |
| Liên hệ | `hotline`, `links[{label, url}]` |
| Lời kết, chữ ký | `closing`, `signOff` |
| Tiêu đề email | `subject` |

Giữ nguyên văn câu chữ đã được marketing duyệt; chỉ sửa lỗi chính tả rõ ràng và **báo lại** cho người dùng những gì
đã sửa. Thông tin xung đột (giờ trên Doc ≠ giờ trên thiệp, sai tên địa điểm) → hỏi, đừng tự chọn.

Không tự thêm thông tin người dùng không đưa (hạn chót xác nhận, gửi xe, trang phục, agenda chi tiết…) — mỗi dòng
thêm là một điều ban tổ chức phải cam kết với khách. Gợi ý thì được, nhưng để người dùng quyết.

Nội dung khác bố cục mẫu (thêm khối agenda, ảnh banner, nhiều nút…) → sửa `apps-script/Email.html`:
- Giữ `{{CONFIRM_URL}}`, `{{DECLINE_URL}}`, `{{TEST_BANNER}}`, `{{GREETING}}` và khối `<!--CARD-->` (nếu có thiệp).
- Placeholder mới → thêm vào `fill_(…)` trong `buildEmailHtml_` (Mailer.gs) và giá trị trong EVENT.
- Chạy lại selftest: nó báo `{{…}}` hay `<!--TÊN-->` còn sót.

## Tiêu đề, preheader, người gửi

- Tiêu đề: `[Đơn vị] Thư mời <Tên sự kiện> | <giờ> <thứ> <ngày>` — có thời gian giúp khách nhận ra ngay; tránh toàn
  chữ in hoa, nhiều dấu "!" (dễ vào spam).
- `preheader`: dòng xem trước trong hộp thư (≈ 90 ký tự): tên + giờ + nơi.
- Tên người gửi: `sales` → `<Tên Sales> – <senderSuffix>` (khách nhận ra người vừa gọi điện); `shared` →
  `sharedSenderName`.

## Quy tắc HTML email (Email.html đã tuân thủ — giữ khi sửa)

- Bố cục bằng `<table role="presentation">`, CSS **inline**, rộng tối đa 640px; không `<style>` ngoài, không JS,
  không font web (Outlook bỏ qua).
- Nút = `<table>` có `bgcolor` + thẻ `<a>` bên trong (Outlook không vẽ `border-radius`/`padding` trên `<a>`).
- Ảnh thiệp `cid:thiep` có `width` thuộc tính + `max-width:100%` để co trên điện thoại; luôn có `alt`.
- Mọi giá trị chèn vào HTML đi qua `esc_()`. Link chứa `&` phải là `&amp;` trong `href` (esc_ lo việc này).
- Có bản text thuần (`buildEmailText_`) cho trình đọc không hiển thị HTML.
- Kiểm tra màu chữ trên nền: nút chữ trắng trên `accent` phải đủ tương phản (accent đậm, vd. `#2563eb`, `#6d28d9`).

## Duyệt nội dung (gợi ý kiểm tra trước khi gửi người dùng xem)

- Lời chào với 3 kiểu tên: có danh xưng ("Chị Hường"), không ("Nguyễn Thị Hường"), "Anh/Chị Hường".
- Giờ / ngày / thứ khớp lịch thật (thứ của ngày đó đúng chưa?) và khớp thiệp.
- Link "Thêm vào lịch" mở đúng giờ; link bản đồ đúng địa điểm.
- Đọc trên điện thoại (bản xem trước thu hẹp cửa sổ ~375px).
- Không còn chữ của sự kiện / đơn vị khác (selftest bắt một phần).

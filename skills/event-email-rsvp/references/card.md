# Thiệp mời in tên khách

Chỉ dùng khi `settings.cardEnabled = true`. Mỗi email có 1 ảnh JPG riêng in tên khách, chèn trong thân email
(không đính kèm), lưu trong thư mục Drive của sự kiện, link ở cột "Link thiệp".

## Nguồn thiết kế → Slides mẫu

Script cần 1 file **Google Slides mẫu**: slide đầu có ảnh nền (thiết kế đã xóa chữ tên) + 1 ô chữ chứa đúng
`{{TEN_KH}}`. Có 2 cách:

### A. Thiết kế trên Canva (hay gặp nhất)

1. **Làm trên bản sao** của thiết kế (không sửa bản gốc của designer). Có connector Canva thì dùng nó để sao chép
   design; không thì nhờ người dùng "Make a copy" trên Canva.
2. Trên bản sao: xóa ô tên mẫu (để trống chỗ in tên). Nếu thiết kế nhiều trang, chỉ giữ / chọn trang thiệp.
3. Export **PNG** (nền) và **PPTX** (cùng trang) — PPTX chỉ dùng để Slides có đúng khổ trang.
   Link export của Canva **chỉ sống vài giờ** và Canva không cho export kích thước tùy chỉnh → export xong dựng mẫu ngay,
   hoặc tải file lên Drive và dùng Drive file ID.
4. Ghi lại vị trí ô tên **theo pixel của thiết kế** (đọc từ Canva: left/top/width/height của ô tên gốc) và chiều rộng
   trang → `settings.card.pageWidthPx`, `settings.card.nameBox`. Font, cỡ chữ, màu → `font`, `fontSize`, `color`.
5. Trong Apps Script editor chạy:
   ```js
   createCardTemplate('<link PNG hoặc Drive ID>', '<link PPTX hoặc Drive ID>')
   ```
   Script: chuyển PPTX thành Slides (đúng khổ), xóa mọi phần tử, đặt PNG làm nền, thêm ô `{{TEN_KH}}` theo `nameBox`.

### B. Thiết kế thẳng trên Google Slides

1. Tạo Slides, **File → Page setup → Custom** đúng tỉ lệ thiệp (vd. dọc 1064 × 1478 px).
2. Đặt nền / hình, thêm 1 ô chữ gõ `{{TEN_KH}}`, chỉnh font / cỡ / màu / căn giữa ngay trên ô đó.
3. Chạy `useCardTemplate('<ID file Slides>')` — script dùng file đó làm mẫu (chuyển vào thư mục sự kiện nếu được).

## Kiểm tra & tinh chỉnh

- `previewCards()` tạo 4 thiệp mẫu (tên ngắn, tên rất dài có danh xưng, "Ms Vy", tên 4 chữ) vào thư mục sự kiện →
  **mở xem từng ảnh**: tên nằm đúng chỗ, không đè chữ khác, không xuống dòng, dấu tiếng Việt đủ.
- Lệch vị trí: sửa `settings.card.nameBox` → `scaffold.py --config-only` → push → chạy `applyNameBoxLayout()` →
  `previewCards()`. Hoặc chỉnh tay ô `{{TEN_KH}}` trên Slides mẫu — lần gửi sau tự dùng bản mới.
- Tên dài bị tràn: giảm `fitChars` (tên dài hơn số ký tự này sẽ tự thu nhỏ, tối thiểu 40% cỡ gốc) hoặc nới `nameBox.width`.
- Font: phải là font có trong Google Slides và hỗ trợ tiếng Việt (vd. Great Vibes, Dancing Script, Playfair Display,
  Be Vietnam Pro, Montserrat). Font không có dấu tiếng Việt sẽ vỡ dấu — xem ảnh preview.
- Ảnh thiệp ra tối đa 1600px cạnh dài (giới hạn thumbnail của Slides), JPG ~150–200KB.
- Menu **Tạo / xem thiệp dòng đang chọn**: xem thiệp của 1 khách cụ thể trước khi gửi.

## Lưu ý

- Script không sửa Slides mẫu; nó dùng 1 bản làm việc "(bản làm việc của script, đừng sửa)" và tự sao lại khi mẫu đổi.
- Chế độ `sales`: thiệp tạo dưới tài khoản Sales → Sales cần quyền sửa thư mục sự kiện (menu "Cập nhật danh sách Sales
  + chia sẻ thư mục" chia sẻ không gửi thông báo).
- Thông tin trên thiệp (giờ, địa điểm) phải khớp email — lỗi chữ trên thiết kế thì báo người dùng / designer, chỉ sửa
  trên bản sao khi được đồng ý.

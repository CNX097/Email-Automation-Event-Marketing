# Khung hướng dẫn cho người dùng sheet (Sales)

Dùng khi người dùng muốn tài liệu phát cho team. Điền phần `<…>` theo sự kiện, bỏ mục không áp dụng (vd. thiệp,
kích hoạt Sales khi gửi từ hộp thư chung). Viết ngắn, nhiều bảng, đúng chữ hiển thị trên sheet / menu — người đọc
không phải dân kỹ thuật. Tạo tài liệu ở nơi người dùng chọn; **không tự chia sẻ** cho ai.

---

# Hướng dẫn gửi email mời <Tên sự kiện>

## Tóm tắt
Tick ô **Gửi Email** ở dòng khách → trong 1–2 phút email mời (kèm thiệp in tên khách) đi **từ hộp thư của bạn** →
khách bấm 1 nút "Xác nhận tham dự" / "Không thể tham dự" → sheet tự cập nhật. Không cần tạo ảnh, tải file hay soạn email.

## Lần đầu: kích hoạt gửi (1 lần / người)
1. Mở sheet `<tên sheet>` → menu **<menuName>** (hiện sau vài giây) → **Kích hoạt gửi bằng email của tôi (Sales)**.
2. Google hỏi quyền → chọn đúng tài khoản công ty → **Cho phép**. Script cần quyền: đọc/ghi sheet, gửi email từ hộp thư
   của bạn, tạo ảnh thiệp trong thư mục sự kiện, chạy tự động mỗi phút.
3. Nếu được hỏi tên: gõ đúng tên của bạn như ở cột **<cột Sales>**.
4. Thấy thông báo "Đã kích hoạt" là xong. Muốn dừng: menu → **Tắt gửi bằng email của tôi**.

## Gửi email cho khách
| Cột | Bạn làm gì |
|---|---|
| **<cột họ tên>**, **<cột email>** | Điền đúng. Nhiều email trong 1 ô: cách nhau bởi dấu phẩy |
| **Tên in thiệp** | Không bắt buộc. Tên in trên thiệp + lời chào, vd. `Chị Hường`. Bỏ trống = dùng họ tên ("Quý Anh/Chị …") |
| **Gửi Email** | Tick khi đã gọi khách và muốn gửi thư mời |
| Trạng thái email · Thời gian gửi · Link thiệp · KH phản hồi · Mã KH | Hệ thống tự ghi — không sửa |

Trạng thái thay đổi: `Chờ gửi` → `Đang gửi` → `Đã gửi` (cột **<cột đã mời>** tự tick).

## Khách phản hồi
- Khách bấm **Xác nhận tham dự** → tick **<cột xác nhận>**; bấm **Không thể tham dự** → tick **<cột không tham dự>**.
  Ô **KH phản hồi** ghi lựa chọn + thời gian.
- **KH phản hồi = "Cần kiểm tra – …"**: có thể do hệ thống bảo mật email của công ty khách tự mở link. Gọi khách xác
  nhận rồi tick tay, hoặc nhờ khách bấm lại nút trong email sau vài phút.
- Khách đổi ý: bấm nút còn lại.

## Gặp lỗi
| Trạng thái | Cách xử lý |
|---|---|
| `Lỗi: thiếu hoặc sai Email KH` | Sửa email → xóa ô Trạng thái email |
| `Lỗi: … chưa kích hoạt gửi email` | Làm mục "Lần đầu: kích hoạt gửi" → xóa ô Trạng thái email |
| `Lỗi: chưa có email Sales của …` | Báo quản trị `<tên, liên hệ>` |
| Kẹt `Chờ gửi` quá 5 phút | Báo quản trị |

**Gửi lại** (sửa email/tên, khách không thấy email): xóa ô **Trạng thái email**, vẫn để tick.
**Hủy** khi còn `Chờ gửi`: bỏ tick.

## Gửi thử / xem thiệp
- Menu → **Gửi thử dòng đang chọn tới email của tôi**: xem đúng email khách sẽ nhận (gửi về hộp thư của bạn).
- Menu → **Tạo / xem thiệp dòng đang chọn**: xem thiệp trước khi gửi.

## Giai đoạn chạy thử
Khi hệ thống ở chế độ TEST, email chỉ về hộp thư của bạn (tiêu đề có `[TEST]`), trạng thái ghi `TEST đã gửi`. Khi
chuyển sang gửi thật, quản trị sẽ báo; các dòng `TEST đã gửi` muốn gửi thật thì xóa ô Trạng thái email.

## Không nên
- Sửa / xóa các cột hệ thống tự ghi, đổi tên cột, chèn cột giữa nhóm cột tự động.
- Tick hàng loạt khi chưa gọi khách.
- Sửa ô `{{TEN_KH}}` trên Slides mẫu thiệp.

## Liên hệ
Quản trị hệ thống: `<tên, email/điện thoại>`

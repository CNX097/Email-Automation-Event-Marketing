# Sổ tay vận hành

Đọc khi người dùng hỏi về trạng thái / lỗi trên sheet, phản hồi của khách, gửi lại, thay đổi giữa chừng, hoặc trước
khi chuyển sang gửi thật.

## Trạng thái trên sheet

| "Trạng thái email" | Nghĩa | Việc cần làm |
|---|---|---|
| (trống) + đã tick | Chưa xử lý (trigger onSheetEdit chưa chạy / tick bằng dán dữ liệu) | Chờ 1–2 phút; vẫn trống → bỏ tick rồi tick lại |
| `Chờ gửi` | Trong hàng đợi | processQueue của người gửi gửi trong 1–2 phút. Kẹt lâu → người gửi chưa có trigger (xem dưới) |
| `Đang gửi` | Đang tạo thiệp / gửi | Thường vài giây |
| `Đã gửi` | Đã gửi email thật, tick cột "đã mời" | — |
| `TEST đã gửi → <email>` | Gửi bản thử về hộp thư người gửi | Khi chuyển sang gửi thật: xóa ô này để gửi thật |
| `Lỗi: thiếu hoặc sai Email KH` | Ô email trống / sai định dạng | Sửa email → xóa ô trạng thái |
| `Lỗi: dòng chưa có <cột Sales>` | Dòng chưa gán Sales (chế độ sales) | Điền tên Sales → xóa ô trạng thái |
| `Lỗi: chưa có email Sales của "X"…` | Tab SALES_EMAIL thiếu email | Quản trị điền cột B → menu Cập nhật danh sách Sales → xóa ô trạng thái |
| `Lỗi: Sales X (…) chưa kích hoạt…` | Sales chưa chạy menu Kích hoạt | Sales kích hoạt → xóa ô trạng thái |
| `Lỗi: chỉ <email> mới gửi được dòng này…` | Dòng đổi Sales sau khi xếp hàng | Xóa ô trạng thái (Sales đúng sẽ gửi) |
| `Lỗi: không rõ đã gửi chưa…` | Lần chạy trước bị ngắt khi đang gửi | Xem LOG (`SENT` của dòng?) + hỏi Sales / khách; chưa gửi thì xóa ô |
| `Lỗi: …` khác (Slides, Drive, hạn mức) | Xem chi tiết trong LOG | Xem bảng xử lý lỗi bên dưới |

Gửi lại 1 dòng (sửa email, sửa tên, gửi lại cho khách): **xóa ô "Trạng thái email"**, vẫn để tick "Gửi Email".
Mã KH giữ nguyên → link trong email cũ vẫn hợp lệ. Bỏ tick khi còn "Chờ gửi" = hủy.

## "KH phản hồi"

| Giá trị | Nghĩa |
|---|---|
| `Đã xác nhận – <thời gian>` / `Không tham dự – <thời gian>` | Khách bấm nút, đã tick cột tương ứng |
| `Cần kiểm tra – bấm trong 30 giây đầu…` | Nghi bộ quét link (hoặc khách bấm rất nhanh). Không đổi kết quả |
| `Cần kiểm tra – bấm cả 2 nút trong vòng 3 phút…` | Nghi bộ quét link; kết quả trả về như trước lượt nghi. "Đang giữ: …" = kết quả đang giữ |
| `[TEST] … · nếu thật: …` | Bấm trong bản thử — không đổi cột kết quả |

"Cần kiểm tra": Sales gọi khách xác nhận rồi tick tay cột kết quả (ô "KH phản hồi" vẫn giữ chữ cũ — có thể xóa tay),
hoặc nhờ khách bấm lại nút trong email sau vài phút (ghi nhận bình thường).

Khách đổi ý: bấm nút còn lại (sau 3 phút kể từ lượt trước) → ghi nhận lựa chọn mới. Nút trong email không gửi ghi chú;
khách muốn dặn thêm thì trả lời email / gọi hotline.

## Sự kiện trong LOG_EMAIL

`QUEUED` · `UNQUEUED` · `CARD_CREATED` · `TEST_SENT` · `SENT` · `SEND_ERROR` · `CONFIRMED` · `DECLINED` ·
`SCANNER_SUSPECTED` · `TEST_CONFIRMED` / `TEST_DECLINED` / `TEST_SCANNER_SUSPECTED` · `INVALID_RESPONSE` (mã sai / không
tìm thấy Mã KH) · `RESPONSE_ERROR` · `SALES_ACTIVATED` / `SALES_DEACTIVATED` · `FOLDER_SHARED` / `FOLDER_SHARE_ERROR` ·
`TEST_MODE_ON` / `TEST_MODE_OFF`. Mỗi dòng có Mã KH, dòng, khách, Sales, chi tiết, người thao tác.

## Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân hay gặp | Cách xử lý |
|---|---|---|
| Dòng mới (từ Google Form) không có ô tick "Gửi Email" | Form chèn dòng mới không mang định dạng | Tự thêm trong ≤ 1 phút (processQueue). Chưa có người gửi kích hoạt → chưa chạy; tick tay bằng cách gõ `TRUE` |
| `setup()` báo "phải chạy setup() khi đăng nhập …" | Chế độ `shared`, đang chạy bằng tài khoản khác hộp thư chung | Mở Apps Script editor bằng đúng hộp thư chung (`sharedSender`) rồi chạy lại |
| Không thấy menu trên sheet | Menu tải sau vài giây; hoặc code chưa push | Tải lại sheet, chờ 5–10 giây; kiểm tra Extensions → Apps Script có file |
| Kẹt "Chờ gửi" | Người gửi không có trigger `processQueue` (chưa kích hoạt, hoặc quản trị chạy lại `setup()` bằng tài khoản khác) | Menu Kiểm tra cài đặt (bằng tài khoản người gửi) → thiếu `processQueue` → Sales kích hoạt lại / chạy `installTriggers()` bằng hộp thư chung |
| Bấm nút không đổi sheet | Trigger `onConfirmSubmit` thuộc tài khoản quản trị đã mất quyền / bị xóa; hoặc mã sai | LOG có `INVALID_RESPONSE`? Không có gì trong LOG → chạy lại `setup()` bằng tài khoản quản trị |
| Khách bấm nút bị đòi đăng nhập Google | Admin Workspace giới hạn form trong tổ chức | Nhờ admin cho phép chia sẻ form ra ngoài (hoặc dùng tài khoản/OU được phép) — trong lúc chờ, Sales ghi nhận qua điện thoại |
| Nhiều "Cần kiểm tra" từ cùng 1 công ty | Công ty khách có bộ quét link | Bình thường. Gọi xác nhận hoặc nhờ khách bấm lại |
| `Lỗi: … Slides mẫu không còn ô {{TEN_KH}}` | Ai đó sửa mất chữ `{{TEN_KH}}` trên Slides mẫu | Gõ lại `{{TEN_KH}}` vào ô tên trên Slides mẫu |
| Sales kích hoạt báo chưa có quyền thư mục thiệp | Chưa chia sẻ thư mục | Quản trị: điền email Sales → menu Cập nhật danh sách Sales + chia sẻ thư mục → Sales kích hoạt lại |
| Email vào spam | Tên miền / nội dung | Gửi từ hộp thư Sales (đã quen với khách) thay vì hộp thư mới; tránh tiêu đề toàn chữ in hoa; không đính kèm |
| Hết hạn mức | >1.500 người nhận/ngày/tài khoản | Phần còn lại gửi hôm sau (tự động); hoặc chia cho nhiều Sales |
| Lời chào "Quý Anh/Chị Anh/Chị X" | — | Đã xử lý: tên bắt đầu bằng danh xưng (Anh/Chị/Ông/Bà/Ms/Mr…, kể cả "Anh/Chị X") được giữ nguyên |

## Thay đổi giữa chừng

- **Sửa nội dung email / giờ / địa điểm** khi đã gửi một phần: sửa `event.json` → `scaffold.py --config-only` →
  selftest → pull/diff → push. Email đã gửi không đổi. Thông tin quan trọng (giờ, địa điểm) đổi → hỏi người dùng có
  gửi email cập nhật cho khách đã mời không (đó là một email mới — cần họ duyệt nội dung và danh sách).
- **Đổi thiệp**: sửa Slides mẫu (lần gửi sau tự dùng bản mới) hoặc dựng mẫu mới (`createCardTemplate` / `useCardTemplate`).
- **Thêm Sales**: dòng mới có tên Sales mới → menu Cập nhật danh sách Sales → điền email → Sales kích hoạt.
- **Đổi tab danh sách**: Script Property `DATA_TAB` = tên tab mới → chạy lại `setup()` (thêm cột AUTO cho tab mới).
- **Đổi câu chữ form / lời cảm ơn**: sửa `Form.gs` → push → chạy lại `setup()`. Không đổi tiêu đề 3 câu hỏi trực
  tiếp trên form.
- **Không bao giờ đổi `SECRET`** sau khi đã gửi email: mọi nút trong email đã gửi sẽ thành "mã không hợp lệ".

## Checklist trước khi gửi thật

- [ ] Selftest đạt 100% với header thật (`--sample-csv` hoặc `--headers`)
- [ ] Người phụ trách đã xem và duyệt email thử (nội dung, giờ khớp thiệp, tiêu đề, người gửi)
- [ ] Thiệp đã xem với tên ngắn / dài / có danh xưng (`previewCards`)
- [ ] Bấm thử cả 2 nút trong email thử (sau 30 giây) → LOG đúng
- [ ] Link nút mở được từ cửa sổ ẩn danh (khách ngoài tổ chức)
- [ ] Người gửi sẵn sàng: mọi Sales có khách cần gửi đã kích hoạt (tab SALES_EMAIL ✅) / hộp thư chung có trigger
- [ ] Đã xóa ô "Trạng thái email" của các dòng `TEST đã gửi`, bỏ tick dòng chưa muốn gửi
- [ ] Người phụ trách **đồng ý rõ ràng** → họ (hoặc bạn, khi họ yêu cầu) vào menu Bật / tắt chế độ TEST
- [ ] Theo dõi LOG vài email thật đầu tiên (`SENT`, không có `SEND_ERROR`)

## Sau sự kiện

- Tắt gửi: menu **Bật / tắt chế độ TEST** (bật lại TEST) hoặc từng Sales **Tắt gửi bằng email của tôi**.
- Tắt hẳn: xóa trigger (Apps Script → Triggers) của mọi tài khoản; giữ sheet + LOG làm báo cáo.
- Dọn Script Properties `RSVP_*` nếu tái dùng project (không khuyến khích — dựng project mới cho sự kiện mới).
- Báo cáo nhanh: đếm cột "đã mời" / "xác nhận" / "không tham dự" và số "Cần kiểm tra" chưa xử lý.

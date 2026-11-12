# Kiến trúc & lý do thiết kế

Đọc khi cần sửa code, giải thích cho người dùng vì sao hệ thống làm vậy, hoặc khi gặp giới hạn của Google.

## Thành phần

| File | Vai trò |
|---|---|
| `Config.gs` | Khối CONFIG (EVENT, SETTINGS, COL, RESULT_COL) + hằng số + helper (`prop_`, `setProp_`, `esc_`…) |
| `Sheet.gs` | Đọc / ghi tab danh sách theo **tên header** (không theo chữ cột), thêm nhóm cột AUTO, ghi LOG |
| `Mailer.gs` | `processQueue` (hàng đợi), `sendRow_`, dựng HTML / text email, ký mã xác nhận |
| `Form.gs` | Google Form ghi nhận phản hồi, link 1 lần bấm, `onConfirmSubmit`, bộ lọc bộ quét link |
| `Sales.gs` | Người gửi: tab SALES_EMAIL, kích hoạt / tắt gửi theo từng Sales, hoặc hộp thư chung |
| `Setup.gs` | `setup()`, `installTriggers()`, `onSheetEdit`, menu trên sheet |
| `Card.gs` | Thiệp: Slides mẫu → bản làm việc → thumbnail JPG; `createCardTemplate`, `useCardTemplate`, `previewCards` |
| `Email.html` | Khung email (bảng, CSS inline — an toàn với Outlook) với `{{…}}` và khối `<!--TÊN-->…<!--/TÊN-->` |

## Quyết định thiết kế và lý do

**Xác nhận qua Google Form thay vì trang web riêng.** Nhiều admin Google Workspace chặn Web App Apps Script ở chế độ
"Anyone" (deploy báo lỗi *ANYONE access has been disabled by your domain administrator*), nên không có URL công khai
cho khách ngoài. Google Form thì công khai được. Nút trong email là link
`…/formResponse?entry.<lựa chọn>=…&entry.<mã>=<Mã xác nhận>&submit=Submit` — mở link (GET) là Google lưu phản hồi
ngay và hiện lời cảm ơn của form: khách **bấm 1 lần**, không thấy form, không bấm "Gửi". Entry id lấy từ
`createResponse(...).toPrefilledUrl()` rồi đổi `/viewform` → `/formResponse`. Tiêu đề 3 câu hỏi là khóa để script tìm
câu hỏi → không đổi tiêu đề trên form (đổi trong code thì chạy lại `setup()`).

**Mã xác nhận ký HMAC.** Mã = `<Mã KH>.<chữ ký>` (bản thử: `<Mã KH>.T.<chữ ký>`), chữ ký = HMAC-SHA256(Mã KH | chế độ,
`SECRET`) rút gọn 12 ký tự. Ai sửa Mã KH trong link (để bấm hộ người khác) → chữ ký sai → LOG `INVALID_RESPONSE`, sheet
không đổi. Mã bản thử không dùng được cho email thật và ngược lại.

**Bộ lọc bộ quét link.** Outlook Safe Links, Mimecast, Proofpoint, Barracuda… tự mở mọi link trong email ngay khi
email tới — với nút 1 lần bấm, việc này giống khách bấm thật (thường bấm cả 2 nút). Quy tắc trong `Form.gs`:

| Quy tắc | Ngưỡng | Xử lý |
|---|---|---|
| Bấm quá sớm | `SCAN_EARLY_MS` = 30 giây sau khi gửi | Không đổi kết quả, "KH phản hồi" = `Cần kiểm tra – …` |
| Bấm cả 2 nút | `SCAN_PAIR_MS` = 3 phút | Không đổi kết quả; lượt trước đó đã ghi thì **khôi phục** như trước lượt đó |

Đánh đổi: khách thật bấm trong 30 giây đầu (đang nghe máy Sales) hoặc đổi ý trong 3 phút cũng bị "Cần kiểm tra" —
không mất dữ liệu, bấm lại sau vài phút là ghi nhận. Bộ quét chỉ mở 1 nút và sau 30 giây thì không phân biệt được
(Form không cho biết IP / trình duyệt). Ngưỡng 30 giây (không phải 2 phút) vì Sales hay gửi email khi đang gọi điện và
khách bấm ngay. Mốc gửi ghi vào `RSVP_SENT_<T|L>_<Mã KH>` **trước** khi gửi để không lỡ lượt quét đầu tiên.

**Người gửi = tài khoản chạy trigger.** `MailApp` gửi từ tài khoản sở hữu trigger. Muốn mỗi Sales gửi từ hộp thư của
mình mà không cần quyền Gmail rộng / alias → mỗi Sales tự cài trigger `processQueue` dưới tài khoản của họ (menu
"Kích hoạt…"), trigger đó chỉ gửi dòng có Sales = chính họ (`canSendAs_`, `sendRow_` kiểm lại). Tài khoản quản trị chỉ
giữ `onSheetEdit` + `onConfirmSubmit`. Chế độ `shared`: tài khoản chạy `setup()` là người gửi (`SHARED_SENDER`).
Tên hiển thị đặt qua `name` của MailApp; không dùng alias / `from` (cần scope Gmail đầy đủ).

**Trigger cài đặt (installable), không dùng `onEdit` đơn giản.** `onEdit` đơn giản không được gửi email / mở file khác.
`installTriggers()` xóa rồi tạo lại trigger của tài khoản đang chạy — và **cài lại `processQueue` nếu tài khoản đó là
người gửi** (thiếu bước này từng làm dòng của quản trị kẹt "Chờ gửi" sau khi chạy lại setup).

**Khóa.** `processQueue` giữ `LockService.getScriptLock()` (dùng chung giữa mọi tài khoản → không gửi trùng khi nhiều
Sales chạy cùng lúc). `onConfirmSubmit` dùng `getUserLock()` riêng để không phải chờ một đợt gửi dài.

**Không tự gửi lại khi không chắc.** Dòng còn "Đang gửi" (lần chạy trước bị ngắt) → chuyển thành
`Lỗi: không rõ đã gửi chưa…` thay vì gửi lại — tránh khách nhận 2 email. Người dùng xem LOG rồi xóa ô để gửi lại.

**Cột tìm theo tên header** (dòng `headerRow`, không phân biệt hoa thường / khoảng trắng thừa). Team chèn cột mới
không làm hỏng script. Header trùng tên → lấy cột đầu tiên.

**Thiệp qua Google Slides** thay vì Canva API: không cần tài khoản Canva Enterprise / API, ai có Slides mẫu là sửa được
font / vị trí tên. Script không bao giờ sửa Slides mẫu: tạo bản làm việc (`CARD_WORK_ID`), tự sao lại khi mẫu đổi
(so `getLastUpdated`). Mỗi thiệp = nhân bản slide → thay tên → thumbnail `LARGE` (cạnh dài tối đa 1600px) → JPG.
Tên dài hơn `fitChars` ký tự → thu nhỏ cỡ chữ (tối thiểu 40%) để vẫn 1 dòng.

**Thiệp chỉ inline, không đính kèm** (`inlineImages: { thiep }`, `<img src="cid:thiep">`): đính kèm làm email nặng,
dễ vào spam, và khách thấy 2 lần.

**Chế độ TEST mặc định bật.** Email thử về chính hộp thư người gửi, có dải "BẢN THỬ" ghi rõ email thật sẽ gửi tới ai.
Bấm nút trong bản thử chạy đúng logic thật trên **bản mô phỏng** (lưu trong Script Properties), chỉ ghi LOG `TEST_*` và
"KH phản hồi" dạng `[TEST] … · nếu thật: Xác nhận ✓, Không tham dự ☐` — không đổi cột kết quả, không đè phản hồi thật.
Gửi thật thì tự xóa `[TEST]`.

## Script Properties

| Property | Ai ghi | Ý nghĩa |
|---|---|---|
| `SHEET_ID` | setup | Sheet gắn script (trigger time-based không có "active spreadsheet") |
| `SECRET` | setup (1 lần) | Khóa ký mã — **đổi = mọi nút trong email đã gửi thành vô hiệu** |
| `TEST_MODE` | setup (`true`), menu | `false` = gửi thật |
| `FORM_ID`, `FORM_SUBMIT_YES`, `FORM_SUBMIT_NO` | setup | Form + mẫu link 1 lần bấm (`MAXACNHAN` thay bằng mã) |
| `FOLDER_ID` | setup | Thư mục Drive: form, Slides mẫu, bản làm việc, ảnh thiệp |
| `CARD_TEMPLATE_ID`, `CARD_BG_FILE_ID`, `CARD_WORK_ID`, `CARD_WORK_SYNCED`, `CARD_FONT` | card | Thiệp |
| `SHARED_SENDER` | setup (shared) | Hộp thư chung (= `SETTINGS.sharedSender`; setup() chặn tài khoản khác) |
| `CHECKBOX_LAST_ROW` | processQueue | Dòng cuối đã đặt ô tick (dòng mới từ Google Form được thêm ô tick) |
| `SALES_ACTIVE_<email>` | menu kích hoạt | Sales đã kích hoạt (giá trị = thời điểm) |
| `KEY_COUNTER` | sendRow_ | Bộ đếm Mã KH |
| `RSVP_<T|L>_<Mã KH>`, `RSVP_SENT_<T|L>_<Mã KH>` | onConfirmSubmit, sendRow_ | Lịch sử lượt bấm (20 lượt gần nhất) + mốc gửi |
| `DATA_TAB` | tay (tùy chọn) | Đổi tab danh sách không cần sửa code |

Script Properties giới hạn ~500KB tổng — đủ cho vài nghìn khách; sự kiện lớn hơn nên dọn `RSVP_*` sau sự kiện.

## Giới hạn Google đã biết

| Giới hạn | Hệ quả / cách xử lý |
|---|---|
| Admin Workspace chặn Web App "Anyone" | Lý do dùng Google Form (xem trên) |
| Form trong Workspace mặc định có thể giới hạn người trong tổ chức | Code đặt `setRequireLogin(false)`; nếu admin cấm chia sẻ form ra ngoài → khách bị đòi đăng nhập. Kiểm bằng cửa sổ ẩn danh trước khi gửi thật |
| Hạn mức gửi: Workspace ~1.500 người nhận/ngày/tài khoản, Gmail cá nhân ~100 | `processQueue` dừng khi hết hạn mức, phần còn lại gửi hôm sau. Nhiều Sales gửi song song = cộng hạn mức |
| Trigger chạy tối đa 6 phút | `MAX_RUN_MS` 4,5 phút / lượt, phần còn lại lượt sau (mỗi phút) |
| Slides API không đổi khổ trang | Khổ trang lấy từ file PPTX khi dựng mẫu, hoặc người dùng tự đặt Page setup trên Slides |
| Thumbnail Slides `LARGE` tối đa 1600px cạnh dài | Đủ nét cho email (~150–200KB JPG) |
| Link export của Canva sống vài giờ; Canva không export kích thước tùy chỉnh | Export xong chạy `createCardTemplate` ngay; hoặc lưu file lên Drive rồi truyền Drive ID |
| `clasp create-script --parentId` ở vài phiên bản tạo sheet mới thay vì gắn | Dùng `scripts/create_bound_script.js` |
| Menu `onOpen` hiện sau vài giây | Bình thường; tải lại sheet nếu không thấy |
| `push --force` ghi đè mọi thay đổi trong editor | `clasp pull` vào thư mục tạm + diff trước khi push |

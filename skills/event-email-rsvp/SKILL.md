---
name: event-email-rsvp
description: Dựng và vận hành luồng email mời sự kiện tự động trên Google Sheets + Apps Script — người phụ trách tick ô "Gửi Email" trên danh sách khách → email HTML theo template marketing (tùy chọn kèm thiệp mời in tên khách từ Canva/Google Slides) đi từ hộp thư của Sales hoặc hộp thư chung → khách bấm 1 nút "Xác nhận tham dự / Không thể tham dự" → sheet tự cập nhật, mọi bước ghi LOG; có chế độ TEST, chống bộ quét link, bộ test giả lập chạy không cần Google. Dùng skill này khi người dùng muốn gửi thư mời / email xác nhận tham dự (RSVP) cho khách mời hội thảo, workshop, job fair, gala, sự kiện doanh nghiệp; tự động gửi email từ danh sách Google Sheet; làm thiệp mời cá nhân hóa theo tên; theo dõi ai đã xác nhận tham dự; hoặc sửa, vận hành, xử lý lỗi một hệ thống như vậy — kể cả khi họ không nhắc tới "Apps Script". Also use for English requests about event invitation emails with one-click RSVP tracked in a Google Sheet.
---

# Email mời sự kiện + xác nhận tham dự 1 lần bấm

Skill này đóng gói một hệ thống đã chạy thật cho sự kiện B2B (vài trăm khách, nhiều Sales gửi song song) thành
bộ code mẫu + quy trình. Đừng viết lại từ đầu: code trong `template/apps-script/` đã xử lý sẵn những chỗ dễ sai
(bộ quét link tự bấm nút, gửi trùng, khóa đồng thời, mã xác nhận bị sửa, Workspace chặn Web App công khai…).
Việc của bạn là **cấu hình cho đúng sự kiện, kiểm tra kỹ, rồi hướng dẫn người dùng qua các bước cần quyền Google**.

## Hệ thống hoạt động thế nào

```
Tick "Gửi Email" ──▶ onSheetEdit: "Chờ gửi" (hoặc "Lỗi: …" ngay nếu người gửi chưa sẵn sàng)
      │
      ▼  processQueue (mỗi 1 phút, chạy bằng tài khoản người gửi)
(Tạo thiệp JPG từ Slides mẫu) ─▶ MailApp gửi email HTML: thiệp inline + 2 nút ─▶ "Đã gửi", tick "đã mời"
      │
      ▼  khách bấm 1 nút = link .../formResponse?…&submit=Submit của Google Form (không có trang form, không bấm "Gửi")
onConfirmSubmit: kiểm chữ ký HMAC của mã + lọc bộ quét link ─▶ tick "xác nhận" / "không tham dự", ghi "KH phản hồi"
      │                                                         (nghi bộ quét → "Cần kiểm tra – …", không đổi kết quả)
      ▼
Mọi bước → tab LOG_EMAIL
```

Hai lựa chọn chính, đặt trong `event.json`:

| Lựa chọn | Giá trị | Khi nào |
|---|---|---|
| `settings.senderMode` | `sales` | Mỗi Sales gửi cho khách của mình từ **hộp thư của chính họ** (khách trả lời thẳng về Sales). Mỗi Sales kích hoạt 1 lần qua menu. |
| | `shared` | 1 hộp thư chung (vd. `events@…`) gửi mọi email. Chạy `setup()` bằng chính tài khoản đó. |
| `settings.cardEnabled` | `true` / `false` | Có / không chèn thiệp mời in tên khách. |

Chi tiết kỹ thuật và lý do thiết kế: [references/architecture.md](references/architecture.md).

## Nguyên tắc an toàn (đọc trước khi làm)

Hệ thống gửi email thật tới khách hàng bên ngoài — sai một lần là không rút lại được, và ảnh hưởng uy tín của
người dùng với khách. Vì vậy:

1. **Không bao giờ tự tắt chế độ TEST hay gửi email thật cho khách** khi người phụ trách chưa đồng ý rõ ràng trong
   cuộc trò chuyện này. `setup()` luôn để TEST bật; ở TEST mọi email chỉ về hộp thư người gửi.
2. **Hộp thư gửi là quyết định của người dùng.** Đừng tự chọn hộp thư cá nhân của ai (kể cả của người đang nhờ bạn)
   để gửi hay để giữ alias — hỏi rõ `sales` hay `shared`, và hộp thư chung là tài khoản nào.
3. **Sheet danh sách thường dùng chung với cả team**: chỉ ghi vào nhóm cột AUTO, 3 cột kết quả, tab `LOG_EMAIL`,
   `SALES_EMAIL`. Không đổi tên / chèn / xóa / sắp xếp cột có sẵn (công thức, bộ lọc của người khác sẽ hỏng).
4. **Danh sách khách là dữ liệu cá nhân**: không dán vào dịch vụ bên ngoài; test bằng dòng giả / địa chỉ của chính
   người dùng.
5. **Mỗi sự kiện một project riêng** (script gắn vào sheet của sự kiện đó, `SECRET`, Form, thư mục Drive riêng).
   Không tái dùng script / trigger / form của sự kiện khác hay của hệ thống khác trong tổ chức.
6. **Thiết kế Canva gốc của designer: chỉ làm trên bản sao.**
7. Người dùng hay sửa code thẳng trong Apps Script editor → **trước mỗi lần `clasp push --force`: `clasp pull` vào
   thư mục tạm, diff, gộp thay đổi của họ** (push --force ghi đè toàn bộ).

## Quy trình dựng cho sự kiện mới

Làm lần lượt; bước nào cần người dùng thao tác (cấp quyền Google, chọn tài khoản) thì nói rõ cần làm gì, ở đâu.

### Bước 1 — Thu thập đầu vào

Tự tìm trước (đọc sheet, đọc tài liệu được đưa), chỉ hỏi phần không suy ra được. Cần có:

| Đầu vào | Lấy từ đâu |
|---|---|
| Link Google Sheet + tên tab danh sách | Người dùng. Đọc **dòng header** (và dòng nhóm cột nếu có) bằng connector Google Sheets / Drive nếu có; không thì nhờ người dùng dán dòng header hoặc file CSV xuất ra. Tab câu trả lời Google Form: tên tab theo ngôn ngữ tài khoản ("Form Responses 1" / "Câu trả lời biểu mẫu 1") — hỏi lại tên đúng; dòng mới Form đổ về được script tự thêm ô tick. |
| Cột: họ tên, email, công ty, Sales phụ trách; cột "đã mời / xác nhận / không tham dự" (nếu sheet đã có) | Từ header thật — ghi **đúng nguyên văn** tên header. |
| Thông tin sự kiện: tên, tiêu đề, giờ bắt đầu–kết thúc, địa điểm, hotline, đơn vị tổ chức | Template email marketing / thiệp / người dùng. **Giờ trên email phải khớp giờ trên thiệp** — lệch thì hỏi lại. |
| Nội dung email (câu mở đầu, các điểm nổi bật, lưu ý, lời kết, chữ ký, tiêu đề email) | Template marketing (Google Doc / văn bản). Xem [references/email-content.md](references/email-content.md). |
| Người gửi: `sales` hay `shared` (+ hộp thư chung nào) | **Hỏi người dùng** (nguyên tắc 2). Hộp thư chung phải là tài khoản đăng nhập được (không phải Google Group / alias) và có quyền sửa sheet. |
| Thiệp: có / không; nguồn (Canva / Google Slides / PNG + PPTX) | Người dùng. Xem [references/card.md](references/card.md). |
| Tài khoản quản trị chạy `setup()` | Người dùng — cần quyền sửa sheet. |

### Bước 2 — Dựng project local + kiểm tra (không cần Google)

```bash
# 1. Tạo event.json từ mẫu rồi điền (xem bảng trường bên dưới)
cp <skill>/assets/event.example.json <project>/event.json
# 2. Dựng project: chép code mẫu, ghi khối CONFIG, cắt manifest, ghi README bàn giao, chạy selftest
python3 <skill>/scripts/scaffold.py --config <project>/event.json --out <project> --sample-csv <tab danh sách.csv>
#    (không có CSV: --headers "<header thật, phẩy ngăn cách>")
```

- `--sample-csv` = file CSV xuất từ tab danh sách (giữ nguyên bố cục dòng): selftest lấy header thật ở dòng `headerRow`,
  dựng sheet giả theo đúng header đó → bắt lỗi gõ sai tên cột trước khi đụng tới Google; và bản xem trước email hiện
  **5 khách đầu tiên của danh sách** (tên, lời chào, email thật). Dùng bản xem trước này, đừng tự viết trang xem trước.
  CSV chỉ đọc tại máy, không gửi đi đâu.
- Selftest giả lập toàn bộ luồng (≈100 kiểm tra): thêm cột, tick, gửi TEST, bấm nút bản thử, gửi thật, bộ quét link,
  xác nhận, đổi ý, mã giả. **Phải đạt 100%** trước khi sang bước 3. Trượt → đọc dòng `✘`, sửa `event.json` rồi chạy
  lại với `--config-only` (giữ `Email.html` đã sửa), hoặc sửa code rồi chạy `node <skill>/scripts/selftest.js <project>/apps-script`.
- Mở `<project>/email-preview.html` để xem email (hoặc gửi cho người dùng xem). Nút phản hồi trong bản xem trước trỏ
  tới form giả của selftest; thiệp là ảnh giữ chỗ. Cần thay bố cục email nhiều hơn
  các trường cấu hình cho phép → sửa `apps-script/Email.html` (giữ các `{{…}}` và khối `<!--TÊN-->…<!--/TÊN-->`).

Trường `event.json` (đủ ví dụ trong `assets/event.example.json`):

| Nhóm | Trường | Ghi chú |
|---|---|---|
| `event` | `code` | Tiền tố Mã KH, IN HOA/số 2–10 ký tự (`SUM26` → `SUM26-0001`) |
| | `name`, `title`, `subject`, `preheader` | Tên ngắn · tiêu đề đầy đủ · tiêu đề email · dòng xem trước trong hộp thư |
| | `timeText`, `start`, `end` | Chữ hiển thị · `yyyy-MM-ddTHH:mm` (cho link "Thêm vào lịch", múi giờ Asia/Ho_Chi_Minh) |
| | `place`, `mapQuery` | Địa điểm hiển thị · chuỗi tìm Google Maps |
| | `greeting`, `salutation` | Lời chào: mặc định `Kính gửi` + `Quý Anh/Chị` (thêm khi tên chưa có danh xưng). Sinh viên / khách trẻ: `Chào` + `bạn` |
| | `pronoun` | Đại từ gọi khách trong câu chữ cố định của email / form (mặc định `Anh/Chị`; sinh viên: `bạn`) — `intro`, `closing`… tự viết cho khớp |
| | `orgName`, `intro`, `highlightsTitle`, `highlights[{title,text}]`, `note`, `hotline`, `links[{label,url}]`, `closing`, `regards`, `signOff` | Nội dung email (cả bản HTML lẫn bản text thuần); trường rỗng → khối đó tự ẩn. `regards` = dòng trước chữ ký (mặc định `Trân trọng,`, `''` = bỏ) |
| | `colors{dark,accent,soft,border,page}` | Màu thương hiệu (hex) |
| `settings` | `dataTab`, `groupRow` (0 = không có), `headerRow`, `firstDataRow` | Bố cục sheet |
| | `senderMode`, `senderSuffix`, `sharedSender`, `sharedSenderName`, `replyTo` | Người gửi. Tên hiển thị: `sales` → `<Tên Sales> – <senderSuffix>`. `shared` bắt buộc `sharedSender` = email hộp thư chung — `setup()` từ chối chạy bằng tài khoản khác |
| | `cardEnabled`, `card{pageWidthPx,nameBox,fontSize,fitChars,font,color}` | Thiệp (ô tên theo pixel thiết kế gốc) |
| | `menuName` | Tên menu trên sheet |
| `columns` | `name`, `email`, `company`, `sales` | Header có sẵn; `''` = không có (`sales` bắt buộc khi `senderMode = sales`) |
| `resultColumns` | `invited`, `confirmed`, `declined` | Header có sẵn thì dùng, chưa có thì `setup()` tự thêm |

### Bước 3 — Tạo Apps Script gắn vào sheet + đẩy code

Cần: Node.js, `npx -y @google/clasp@3.4.1 login` bằng tài khoản quản trị, và Apps Script API đã bật
(https://script.google.com/home/usersettings). Rồi:

```bash
node <skill>/scripts/create_bound_script.js --parent <Sheet ID> --title "<Tên sự kiện> – Email mời" --out <project>
cd <project> && npx -y @google/clasp@3.4.1 push --force
```

`create_bound_script.js` gọi Apps Script API với `parentId` và từ chối nếu project không gắn vào đúng sheet (một số
bản `clasp create-script --parentId` lặng lẽ tạo sheet mới thay vì gắn). Sau khi push, mở sheet → Tiện ích mở rộng →
Apps Script phải thấy đúng các file.

### Bước 4 — `setup()` + quyền Google (người dùng làm, bạn hướng dẫn)

1. Mở Apps Script editor (link in ra ở bước 3) **bằng đúng tài khoản**: `sales` → tài khoản quản trị;
   `shared` → hộp thư chung (`setup()` báo lỗi nếu tài khoản khác `sharedSender`). Chọn file `Setup.gs`, hàm `setup`,
   bấm **Chạy**, cấp quyền khi Google hỏi.
   Có công cụ trình duyệt thì bạn mở editor và chọn hàm được; màn hình cấp quyền OAuth là của người dùng.
2. `setup()` tạo: nhóm cột AUTO, tab LOG_EMAIL (+ SALES_EMAIL), thư mục Drive, Google Form + link 1 lần bấm,
   khóa ký, trigger. Chạy lại bất cứ lúc nào cũng an toàn.
3. Có thiệp: chạy `createCardTemplate('<PNG>', '<PPTX>')` hoặc `useCardTemplate('<ID Slides>')`, rồi
   `previewCards()` và **xem ảnh thiệp** (tên dài, có danh xưng) trước khi gửi — [references/card.md](references/card.md).
4. Menu trên sheet (tên = `menuName`) hiện sau vài giây khi mở lại sheet → **Kiểm tra cài đặt** phải không còn "CHƯA".

### Bước 5 — Người gửi sẵn sàng

- `sales`: quản trị điền email Sales vào tab `SALES_EMAIL` (tên tự liệt kê từ cột Sales) → menu **Cập nhật danh sách
  Sales + chia sẻ thư mục** → từng Sales mở sheet → menu **Kích hoạt gửi bằng email của tôi** → cấp quyền.
  Tài liệu hướng dẫn cho Sales: [references/sales-guide-template.md](references/sales-guide-template.md).
- `shared`: không cần thêm — `setup()` chạy bằng hộp thư chung đã cài trigger gửi.

### Bước 6 — TEST đầu–cuối (chế độ TEST đang bật)

1. Menu **Gửi thử dòng đang chọn tới email của tôi** trên 1 dòng khách → kiểm tra email (Gmail + Outlook/điện thoại
   nếu được): tiêu đề, lời chào, giờ, địa điểm, thiệp, 2 nút, link lịch/bản đồ.
2. Tick **Gửi Email** trên 1–2 dòng → trong 1–2 phút trạng thái thành `TEST đã gửi → <hộp thư người gửi>`.
3. **Chờ hơn 30 giây** rồi bấm nút trong email thử → ô "KH phản hồi" ghi `[TEST] …`, tab LOG có `TEST_CONFIRMED` /
   `TEST_DECLINED`. (Bấm ngay trong 30 giây sẽ bị đánh dấu "Cần kiểm tra" — đó là bộ lọc bộ quét link, đúng như thiết kế.)
4. Mở 1 link nút trong **cửa sổ ẩn danh / tài khoản ngoài tổ chức**: phải hiện lời cảm ơn của form. Nếu bị đòi đăng
   nhập → admin Workspace đang giới hạn form trong tổ chức → khách ngoài không phản hồi được; xử lý trước khi gửi thật
   ([references/operations.md](references/operations.md)).

### Bước 7 — Gửi thật (chỉ khi người phụ trách đồng ý rõ ràng)

Checklist trước khi tắt TEST: selftest đạt · email thử đã được duyệt nội dung · thiệp đã xem · người gửi đã kích hoạt ·
form nhận được phản hồi từ ngoài tổ chức · **xóa ô "Trạng thái email" của các dòng "TEST đã gửi"** (dòng đó không tự
gửi thật) và bỏ tick những dòng chưa muốn gửi. Rồi người phụ trách vào menu **Bật / tắt chế độ TEST**. Theo dõi LOG
vài email thật đầu tiên.

### Bước 8 — Bàn giao

Điền bảng ID & link trong `<project>/README.md` (scaffold đã tạo khung), ghi lại các quyết định đã chốt với người
dùng (người gửi, nội dung email, giờ). Nếu người dùng muốn, soạn hướng dẫn cho Sales từ
[references/sales-guide-template.md](references/sales-guide-template.md).

## Vận hành, sửa lỗi, thay đổi giữa chừng

Đọc [references/operations.md](references/operations.md) khi người dùng hỏi về: trạng thái / lỗi trên sheet, "Cần kiểm
tra", gửi lại, đổi nội dung / giờ / thiệp khi đã gửi một phần, thêm Sales, hạn mức gửi, tắt hệ thống sau sự kiện.

Sửa code đang chạy: sửa local → `node <skill>/scripts/selftest.js <project>/apps-script` → `clasp pull` vào thư mục
tạm + diff (nguyên tắc 7) → `npx -y @google/clasp@3.4.1 push --force`. Sửa câu chữ / câu hỏi của form → chạy lại `setup()`.

## Tệp trong skill

| Tệp | Dùng khi |
|---|---|
| `template/apps-script/*` | Code mẫu (Config, Sheet, Mailer, Form, Sales, Setup, Card, Email.html, manifest) — scaffold chép ra |
| `scripts/scaffold.py` | Dựng / cập nhật cấu hình project từ `event.json` |
| `scripts/selftest.js` | Giả lập Google, chạy toàn bộ luồng, xuất bản xem trước email |
| `scripts/create_bound_script.js` | Tạo Apps Script gắn vào sheet qua Apps Script API |
| `assets/event.example.json` | Mẫu cấu hình đầy đủ |
| `assets/project-README.template.md` | Khung README bàn giao cho project |
| `references/architecture.md` | Thiết kế, lý do, Script Properties, giới hạn Google đã biết |
| `references/email-content.md` | Chuyển template marketing thành nội dung email; quy tắc HTML email |
| `references/card.md` | Thiệp in tên: Canva / Slides, căn ô tên, font |
| `references/operations.md` | Sổ tay vận hành + xử lý lỗi + checklist gửi thật |
| `references/sales-guide-template.md` | Khung tài liệu hướng dẫn cho người dùng sheet (Sales) |

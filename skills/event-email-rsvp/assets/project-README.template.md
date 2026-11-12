# {{EVENT_NAME}} – Email mời + xác nhận tham dự tự động

Project Apps Script độc lập, gắn vào Google Sheet danh sách khách (tab `{{DATA_TAB}}`). Dựng bằng skill `event-email-rsvp`.

## Sự kiện
- **{{EVENT_TITLE}}**
- Thời gian: {{TIME}}
- Địa điểm: {{PLACE}}
- Hotline: {{HOTLINE}}

## Luồng
```
Tick "Gửi Email" → "Chờ gửi" (onSheetEdit) → processQueue mỗi 1 phút: tạo thiệp (nếu có) + gửi email (2 nút)
→ khách bấm 1 nút = link gửi thẳng Google Form → onConfirmSubmit kiểm mã + lọc bộ quét link
→ tick "{{COL_CONFIRMED}}" / "{{COL_DECLINED}}", ghi "KH phản hồi". Mọi bước ghi tab LOG_EMAIL.
```
- Người gửi: {{SENDER}}
- Thiệp in tên khách: {{CARD}}
- Mã KH: `{{KEY_PREFIX}}0001`, `{{KEY_PREFIX}}0002`…

## Cột trên sheet (header ở dòng {{HEADER_ROW}}, khách từ dòng {{FIRST_DATA_ROW}})
| Vai trò | Header |
|---|---|
| Họ tên khách | {{COL_NAME}} |
| Email khách | {{COL_EMAIL}} |
| Công ty | {{COL_COMPANY}} |
| Sales phụ trách | {{COL_SALES}} |
| Đã gửi email mời / Xác nhận / Không tham dự | {{COL_INVITED}} / {{COL_CONFIRMED}} / {{COL_DECLINED}} |
| Nhóm AUTO (script thêm bên phải) | Gửi Email · Tên in thiệp/Tên gọi · Trạng thái email · Thời gian gửi · (Link thiệp) · KH phản hồi · Mã KH |

## ID & link (điền sau khi cài)
| Thứ | ID / link |
|---|---|
| Google Sheet | |
| Apps Script (bound) | |
| Google Form ghi nhận | (menu {{MENU}} → Kiểm tra cài đặt) |
| Thư mục Drive sự kiện | |
| Slides mẫu thiệp | |

## Trạng thái
- [ ] Code đã push (`clasp push`), `setup()` đã chạy, đã cấp quyền
- [ ] Thiệp: `createCardTemplate(...)` / `useCardTemplate(...)` + `previewCards()` đã xem (nếu có thiệp)
- [ ] Người gửi sẵn sàng (Sales kích hoạt / hộp thư chung chạy setup)
- [ ] TEST: gửi thử + bấm 2 nút (chờ > 30 giây) + xem LOG_EMAIL
- [ ] Form nhận phản hồi từ tài khoản NGOÀI tổ chức (cửa sổ ẩn danh)
- [ ] Trước khi gửi thật: xóa trạng thái "TEST đã gửi", người phụ trách đồng ý rõ ràng → menu {{MENU}} → Bật / tắt chế độ TEST

## Dành cho người dùng sheet (menu **{{MENU}}**)
- Tick **Gửi Email** → email đi trong 1–2 phút. Bỏ tick khi còn "Chờ gửi" = hủy.
- **Gửi lại**: xóa ô **Trạng thái email** (vẫn để tick).
- **Tên in thiệp / Tên gọi**: không bắt buộc, vd. `Chị Hường` — bỏ trống thì dùng họ tên.
- **KH phản hồi = "Cần kiểm tra – …"**: có thể do bộ quét link của công ty khách → gọi xác nhận rồi tick tay, hoặc nhờ khách bấm lại sau vài phút.

## Sửa code
Sửa trong `apps-script/` → `node <skill>/scripts/selftest.js apps-script` → `clasp pull` vào thư mục tạm + diff (giữ thay đổi sửa trong editor)
→ `npx -y @google/clasp@3.4.1 push --force`. Sửa câu chữ form → chạy lại `setup()`.

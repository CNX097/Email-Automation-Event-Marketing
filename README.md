# Email Automation – Event Marketing

Skill cho agent AI (**Claude Code, Codex, Antigravity**) để dựng và vận hành luồng **email mời sự kiện + xác nhận
tham dự 1 lần bấm** trên Google Sheets + Apps Script — không cần server, không cần phần mềm email marketing.

```
Tick "Gửi Email" trên sheet ─▶ email HTML theo template marketing (tùy chọn thiệp in tên khách)
   từ hộp thư của Sales hoặc hộp thư chung ─▶ khách bấm 1 nút "Xác nhận tham dự" / "Không thể tham dự"
   ─▶ sheet tự tick kết quả, mọi bước ghi tab LOG
```

## Skill làm được gì

- **Dựng mới cho từng sự kiện**: đọc header sheet + template email của marketing → `event.json` → project Apps Script
  gắn vào sheet (code mẫu đã chạy thật cho sự kiện B2B vài trăm khách, nhiều Sales gửi song song).
- **Người gửi**: mỗi Sales gửi từ hộp thư của chính mình (khách trả lời thẳng về Sales) hoặc 1 hộp thư chung.
- **Thiệp mời in tên khách** (tùy chọn): từ thiết kế Canva / Google Slides → ảnh JPG chèn trong email.
- **Xác nhận 1 lần bấm** qua Google Form (dùng được cả khi admin Workspace chặn Web App công khai), mã xác nhận ký HMAC,
  **lọc bộ quét link** (Outlook Safe Links, Mimecast… tự mở link), khóa chống gửi trùng.
- **Chế độ TEST mặc định**: email chỉ về hộp thư người gửi cho tới khi người phụ trách đồng ý gửi thật.
- **Bộ test giả lập Google** chạy offline (~100 kiểm tra: tick → gửi → bấm nút → bộ quét link → đổi ý → mã giả).
- **Vận hành**: sổ tay trạng thái / lỗi, thay đổi giữa chừng, checklist trước khi gửi thật, khung hướng dẫn cho Sales.

## Cài đặt

### macOS / Linux

```bash
git clone https://github.com/CNX097/Email-Automation-Event-Marketing.git
cd Email-Automation-Event-Marketing
./install.sh
```

`./install.sh` tự cài cho agent nào có trên máy. Tùy chọn:

| Lệnh | Tác dụng |
|---|---|
| `./install.sh --claude` / `--codex` / `--antigravity` | Chỉ cài cho agent được chọn |
| `./install.sh --project <thư mục dự án>` | Cài vào 1 dự án (chia sẻ cho cả team qua git của dự án) |
| `./install.sh --link` | Symlink tới repo → `git pull` là skill tự cập nhật |
| `./install.sh --uninstall` | Gỡ |

Cập nhật bản chép: `git pull && ./install.sh`.

### Thủ công / Windows

Chép thư mục `skills/event-email-rsvp` vào:

| Agent | Cá nhân (mọi dự án) | Trong 1 dự án |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `<dự án>/.claude/skills/` |
| Codex | `~/.agents/skills/` | `<dự án>/.agents/skills/` |
| Antigravity | `~/.gemini/config/skills/` | `<dự án>/.agents/skills/` |

Bản cũ của Codex / Antigravity còn đọc `~/.codex/skills/`, `~/.gemini/antigravity/skills/`, `<dự án>/.agent/skills/`.
Mở phiên agent mới sau khi cài (Claude Code: gõ `/skills` để kiểm tra).

## Dùng

Nói với agent, ví dụ:

> Dựng hệ thống gửi email mời + xác nhận tham dự cho sự kiện X. Danh sách khách ở tab `DSKH` của sheet này: <link>.
> Mỗi Sales gửi từ hộp thư của mình, có thiệp in tên khách. Nội dung email theo template: <link Google Doc>.

Agent sẽ: thu thập thông tin → dựng project + chạy bộ test offline → cho xem trước email → hướng dẫn bạn tạo Apps Script
gắn vào sheet, chạy `setup()`, cấp quyền → test đầu–cuối ở chế độ TEST → chỉ gửi thật khi bạn đồng ý.

Hỏi vận hành cũng được: *"dòng này kẹt Chờ gửi"*, *"KH phản hồi ghi Cần kiểm tra là sao"*, *"đổi giờ sự kiện khi đã gửi
một nửa"*.

**Cần có**: tài khoản Google Workspace / Gmail có quyền sửa sheet · Node.js 18+ · Python 3.8+ · `clasp`
(chạy qua `npx`, không cần cài) · Apps Script API bật tại https://script.google.com/home/usersettings.

## Cấu trúc

```
skills/event-email-rsvp/
├── SKILL.md                 quy trình 8 bước + nguyên tắc an toàn (agent đọc đầu tiên)
├── template/apps-script/    code Apps Script mẫu (Config, Sheet, Mailer, Form, Sales, Setup, Card, Email.html)
├── scripts/
│   ├── scaffold.py          event.json → project (chép code, ghi cấu hình, chạy selftest, xuất bản xem trước email)
│   ├── selftest.js          giả lập Google Sheets / Mail / Form, chạy toàn bộ luồng offline
│   └── create_bound_script.js  tạo Apps Script gắn vào sheet qua Apps Script API
├── assets/                  event.example.json, khung README bàn giao
├── references/              kiến trúc, nội dung email, thiệp, sổ tay vận hành, khung hướng dẫn Sales
└── evals/                   ca test của skill (không cần khi dùng)
```

Thử nhanh không cần Google:

```bash
python3 skills/event-email-rsvp/scripts/scaffold.py --config skills/event-email-rsvp/assets/event.example.json --out /tmp/demo-event
```

→ `/tmp/demo-event/email-preview.html` là email mẫu; selftest in kết quả từng kiểm tra.

## An toàn & dữ liệu

- Hệ thống gửi email thật cho khách: skill luôn để **TEST bật**, không tự chuyển sang gửi thật, không tự chọn hộp thư
  cá nhân của ai để gửi.
- Chỉ ghi vào cột do hệ thống thêm + 3 cột kết quả + tab LOG — không đổi cột của team.
- Danh sách khách là dữ liệu cá nhân: không đưa ra dịch vụ ngoài; test bằng dòng giả.
- Repo chỉ chứa **dữ liệu mẫu** (Công ty Mẫu, `example.com`, số 0900 000 000) — không có ID, email hay dữ liệu thật.

## English summary

An agent skill (Claude Code, Codex, Antigravity) that sets up and operates an **event invitation + one-click RSVP**
flow on Google Sheets + Apps Script: tick a checkbox → personalised HTML invitation (optional name-printed card) sent
from each salesperson's mailbox or a shared one → the guest clicks one button → the sheet updates itself. Includes
HMAC-signed response codes, link-scanner filtering, TEST mode by default, an offline Google-simulation test suite, and
an operations runbook. Install with `./install.sh` (see the table above for manual paths). Content is in Vietnamese.

## License

[MIT](LICENSE)

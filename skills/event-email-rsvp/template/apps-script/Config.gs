/**
 * Luồng email mời sự kiện + xác nhận tham dự 1 lần bấm — CẤU HÌNH
 * Project Apps Script độc lập, gắn (bound) vào Google Sheet danh sách khách.
 *
 * Mọi thông tin riêng của sự kiện nằm trong khối CONFIG bên dưới (scripts/scaffold.py ghi từ event.json,
 * sửa tay cũng được). Các file .gs khác không cần sửa khi đổi sự kiện.
 *
 * Script Properties (Project Settings → Script properties) — setup() tự tạo phần lớn:
 *   TEST_MODE         true → email thử chỉ gửi về chính hộp thư đang gửi; bấm nút trong bản thử chỉ ghi LOG
 *                     + ô "KH phản hồi" [TEST] (mặc định: true)
 *   SECRET            khóa ký Mã xác nhận — setup() tự sinh, không chia sẻ
 *   FORM_ID, FORM_SUBMIT_YES, FORM_SUBMIT_NO  Google Form ghi nhận phản hồi + mẫu link 1 lần bấm — setup() tự tạo
 *   FOLDER_ID         thư mục Drive chứa form, mẫu thiệp, ảnh thiệp — setup() tự tạo
 *   CARD_TEMPLATE_ID  Google Slides mẫu thiệp — createCardTemplate() / useCardTemplate() ghi
 *   SHARED_SENDER     (senderMode 'shared') hộp thư chung gửi email = tài khoản chạy setup() (phải trùng SETTINGS.sharedSender)
 *   SALES_ACTIVE_<email>  (senderMode 'sales') Sales đã kích hoạt gửi từ hộp thư của mình
 *   RSVP_*, KEY_COUNTER, SHEET_ID, CARD_WORK_*  script tự quản lý — không sửa
 *   DATA_TAB          (tùy chọn) đổi tab danh sách mà không sửa code
 */

// <<CONFIG — khối này do scripts/scaffold.py ghi từ event.json
const EVENT = {
  code: 'SUM26',
  name: 'SAMPLE SUMMIT 2026',
  title: 'SAMPLE SUMMIT 2026: THE FUTURE OF WORK',
  subject: '[Công ty Mẫu] Thư mời SAMPLE SUMMIT 2026 | 08:00 - 12:00 Thứ Sáu 23/10',
  preheader: 'Thư mời SAMPLE SUMMIT 2026 · 08:00 - 12:00 Thứ Sáu 23/10 · Khách sạn Mẫu, TP. Hồ Chí Minh',
  timeText: '08:00 - 12:00, Thứ Sáu, ngày 23/10/2026',
  start: '2026-10-23T08:00',
  end: '2026-10-23T12:00',
  place: 'Khách sạn Mẫu – Sảnh A, 1 Đường Mẫu, Quận 1, TP. Hồ Chí Minh',
  mapQuery: 'Khách sạn Mẫu 1 Đường Mẫu Quận 1 TP Hồ Chí Minh',
  orgName: 'Công ty Mẫu',
  greeting: 'Kính gửi',
  salutation: 'Quý Anh/Chị',
  pronoun: 'Anh/Chị',
  intro: 'Cảm ơn Anh/Chị đã dành thời gian trao đổi với Công ty Mẫu. Ban tổ chức trân trọng kính mời Anh/Chị tham dự',
  highlightsTitle: 'Chương trình hứa hẹn mang lại cho Anh/Chị những giá trị thiết thực:',
  highlights: [
    { title: 'Kiến thức thực chiến', text: 'Chia sẻ từ chuyên gia đầu ngành, áp dụng được ngay cho doanh nghiệp.' },
    { title: 'Mở rộng kết nối', text: 'Giao lưu cùng lãnh đạo và chuyên gia trong lĩnh vực.' },
  ],
  note: 'Vui lòng có mặt lúc 07:45 để check-in thuận tiện.',
  hotline: 'Ms Mẫu – 0900 000 000',
  links: [{ label: 'Fanpage', url: 'https://www.facebook.com/' }],
  closing: 'Rất mong được đón tiếp Anh/Chị tại sự kiện!',
  regards: 'Trân trọng,',
  signOff: 'Ban tổ chức SAMPLE SUMMIT 2026 – Công ty Mẫu',
  colors: { dark: '#1e3a8a', accent: '#2563eb', soft: '#eff6ff', border: '#bfdbfe', page: '#f1f5f9' },
}

const SETTINGS = {
  dataTab: 'DSKH',
  groupRow: 1,
  headerRow: 2,
  firstDataRow: 3,
  menuName: 'SỰ KIỆN',
  senderMode: 'sales',
  senderSuffix: 'Công ty Mẫu',
  sharedSender: '',
  sharedSenderName: 'Ban tổ chức SAMPLE SUMMIT 2026',
  replyTo: '',
  cardEnabled: true,
  card: {
    pageWidthPx: 1064,
    nameBox: { left: 62, top: 163, width: 940, height: 120 },
    fontSize: 80,
    fitChars: 22,
    font: 'Great Vibes',
    color: '#ffffff',
  },
}

// Cột có sẵn trên sheet — đúng tên header ở dòng SETTINGS.headerRow. '' = sheet không có cột này
const COL = {
  name: 'Họ tên KH',
  email: 'Email KH',
  company: 'Tên công ty',
  sales: 'Sales phụ trách',
}

// Cột kết quả: có sẵn trên sheet thì dùng, chưa có thì setup() thêm vào nhóm AUTO (ô tick)
const RESULT_COL = {
  invited: 'Đã gửi email mời',
  confirmed: 'KH xác nhận tham dự',
  declined: 'KH không tham dự',
}
// CONFIG>>

const TZ = 'Asia/Ho_Chi_Minh'
const DEFAULT_DATA_TAB = SETTINGS.dataTab
const LOG_TAB = 'LOG_EMAIL'
const GROUP_ROW = SETTINGS.groupRow
const HEADER_ROW = SETTINGS.headerRow
const FIRST_DATA_ROW = SETTINGS.firstDataRow
const MENU_NAME = SETTINGS.menuName
const AUTO_GROUP_LABEL = 'AUTO – Email xác nhận'
const WORK_FOLDER_NAME = EVENT.name + ' – Email tự động'
const KEY_PREFIX = EVENT.code + '-'
const MAX_RUN_MS = 4.5 * 60 * 1000

// Cột do setup() thêm vào bên phải (chỉ thêm cột còn thiếu)
const AUTO_COL = {
  send: 'Gửi Email',
  cardName: SETTINGS.cardEnabled ? 'Tên in thiệp' : 'Tên gọi trong email',
  status: 'Trạng thái email',
  sentAt: 'Thời gian gửi',
  reply: 'KH phản hồi',
  key: 'Mã KH',
}
if (SETTINGS.cardEnabled) AUTO_COL.cardLink = 'Link thiệp'

// Thứ tự cột trong nhóm AUTO (cột kết quả chưa có trên sheet cũng thêm theo thứ tự này)
const AUTO_ORDER = ['send', 'cardName', 'status', 'sentAt', 'cardLink', 'invited', 'confirmed', 'declined', 'reply', 'key']

const STATUS = {
  queued: 'Chờ gửi',
  sending: 'Đang gửi',
  sent: 'Đã gửi',
  testSent: 'TEST đã gửi',
  error: 'Lỗi: ',
}

function isSalesMode_() {
  return SETTINGS.senderMode !== 'shared'
}

function prop_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key)
  return v === null || v === '' ? (fallback === undefined ? null : fallback) : v
}

function requireProp_(key) {
  const v = prop_(key)
  if (!v) throw new Error('Thiếu Script Property: ' + key + ' — chạy setup() hoặc xem README')
  return v
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value))
}

function isTestMode_() {
  return String(prop_('TEST_MODE', 'true')).toLowerCase() !== 'false'
}

function nowText_() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss')
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function errMsg_(e) {
  return String((e && e.message) || e).slice(0, 300)
}

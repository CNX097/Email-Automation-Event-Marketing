#!/usr/bin/env node
/**
 * selftest.js — chạy thử project Apps Script "email mời + xác nhận tham dự" KHÔNG cần Google.
 *
 * Nạp mọi file .gs vào sandbox với dịch vụ Google giả lập (Sheet trong bộ nhớ, MailApp ghi lại email, Properties…),
 * rồi chạy đủ luồng: thêm cột AUTO → tick "Gửi Email" → gửi bản TEST → khách bấm nút bản thử → gửi thật →
 * bộ quét link bấm sớm → khách xác nhận → đổi ý → bấm cả 2 nút → mã giả.
 *
 * Dùng:
 *   node selftest.js <thư mục apps-script> [--headers "STT,Họ tên,Email,…"] [--sample-csv tab.csv] [--preview email.html] [--json kết-quả.json]
 *     --headers   header THẬT của tab danh sách (theo đúng thứ tự cột) — để kiểm COL trong Config.gs khớp sheet thật.
 *                 Bỏ trống: tự dựng header từ COL (không có cột kết quả → kiểm luôn việc setup() tự thêm cột).
 *     --sample-csv  file CSV xuất từ tab danh sách (giữ nguyên bố cục dòng): lấy header ở dòng headerRow (thay --headers)
 *                 và dựng bản xem trước cho tối đa 5 khách đầu tiên (tên, lời chào, email thật của danh sách)
 *     --preview   ghi email (bản gửi thật) ra file HTML để xem bằng trình duyệt
 *     --json      ghi kết quả kiểm tra ra file JSON
 * Mã thoát: 0 = mọi kiểm tra đạt, 1 = có kiểm tra trượt, 2 = lỗi nạp code.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const crypto = require('crypto')

// ------------------------------------------------------------------ tham số
const argv = process.argv.slice(2)
const dir = argv.find(function (a, i) { return !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')) })
function opt(name) {
  const i = argv.indexOf('--' + name)
  return i >= 0 ? argv[i + 1] : null
}
/** CSV (xuất từ Google Sheets): dấu phẩy, ô có ngoặc kép, "" = 1 dấu ", xuống dòng trong ô */
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  text = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}
if (!dir || !fs.existsSync(dir)) {
  console.error('Dùng: node selftest.js <thư mục apps-script> [--headers "A,B,C"] [--sample-csv tab.csv] [--preview out.html] [--json out.json]')
  process.exit(2)
}

// ------------------------------------------------------------------ kết quả
const results = []
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail === undefined ? '' : String(detail) })
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (ok || detail === undefined ? '' : '  →  ' + detail))
  return !!ok
}
function section(t) { console.log('\n▸ ' + t) }

// ------------------------------------------------------------------ Sheet giả lập
function FakeSheet(name, maxRows, maxCols) {
  this.name = name
  this.grid = []
  this.maxRows = maxRows || 40
  this.maxCols = maxCols || 26
  this.links = {}
  this.checkboxes = {}
  this.validated = {}
}
FakeSheet.prototype.cell = function (r, c) { const row = this.grid[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined || v === null ? '' : v }
FakeSheet.prototype.put = function (r, c, v) {
  while (this.grid.length < r) this.grid.push([])
  this.grid[r - 1][c - 1] = v
  if (c > this.maxCols) this.maxCols = c
  if (r > this.maxRows) this.maxRows = r
}
FakeSheet.prototype.getName = function () { return this.name }
FakeSheet.prototype.getLastRow = function () {
  for (let r = this.grid.length; r >= 1; r--) if ((this.grid[r - 1] || []).some(function (v) { return v !== undefined && v !== null && v !== '' })) return r
  return 0
}
FakeSheet.prototype.getLastColumn = function () {
  let m = 0
  this.grid.forEach(function (row) { for (let c = row.length; c >= 1; c--) if (row[c - 1] !== undefined && row[c - 1] !== null && row[c - 1] !== '') { m = Math.max(m, c); break } })
  return m
}
FakeSheet.prototype.getMaxRows = function () { return this.maxRows }
FakeSheet.prototype.getMaxColumns = function () { return this.maxCols }
FakeSheet.prototype.insertColumnsAfter = function (after, n) { this.maxCols += n; return this }
FakeSheet.prototype.setColumnWidth = function () { return this }
FakeSheet.prototype.setFrozenRows = function () { return this }
FakeSheet.prototype.appendRow = function (arr) { const r = this.getLastRow() + 1; const self = this; arr.forEach(function (v, i) { self.put(r, i + 1, v) }); return this }
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  if (typeof r !== 'number' || typeof c !== 'number') throw new Error('selftest: getRange chỉ hỗ trợ (row, col, numRows, numCols)')
  return new FakeRange(this, r, c, nr || 1, nc || 1)
}

function display(v) {
  if (v === true) return 'TRUE'
  if (v === false) return 'FALSE'
  return v === undefined || v === null ? '' : String(v)
}

function FakeRange(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc }
FakeRange.prototype.each = function (fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j) }
FakeRange.prototype.getValues = function () {
  const out = []
  for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.cell(this.r + i, this.c + j)); out.push(row) }
  return out
}
FakeRange.prototype.getDisplayValues = function () { return this.getValues().map(function (row) { return row.map(display) }) }
FakeRange.prototype.getValue = function () { return this.getValues()[0][0] }
FakeRange.prototype.getDisplayValue = function () { return this.getDisplayValues()[0][0] }
FakeRange.prototype.setValue = function (v) { const sh = this.sh; this.each(function (r, c) { sh.put(r, c, v) }); return this }
FakeRange.prototype.setValues = function (m) {
  if (m.length !== this.nr || m[0].length !== this.nc) throw new Error('selftest: setValues sai kích thước ' + m.length + 'x' + m[0].length + ' ≠ ' + this.nr + 'x' + this.nc)
  const sh = this.sh; this.each(function (r, c, i, j) { sh.put(r, c, m[i][j]) }); return this
}
FakeRange.prototype.getRow = function () { return this.r }
FakeRange.prototype.getColumn = function () { return this.c }
FakeRange.prototype.getLastRow = function () { return this.r + this.nr - 1 }
FakeRange.prototype.getLastColumn = function () { return this.c + this.nc - 1 }
FakeRange.prototype.getNumRows = function () { return this.nr }
FakeRange.prototype.getNumColumns = function () { return this.nc }
FakeRange.prototype.getSheet = function () { return this.sh }
FakeRange.prototype.getCell = function (i, j) { return new FakeRange(this.sh, this.r + i - 1, this.c + j - 1, 1, 1) }
FakeRange.prototype.setDataValidation = function (rule) {
  const sh = this.sh; if (rule && rule.checkbox) this.each(function (r, c) { sh.checkboxes[c] = true; sh.validated[r + ',' + c] = true }); return this
}
FakeRange.prototype.insertCheckboxes = function () {
  const sh = this.sh; this.each(function (r, c) { sh.checkboxes[c] = true; if (sh.cell(r, c) === '') sh.put(r, c, false) }); return this
}
;['merge', 'setFontWeight', 'setBackground', 'setWrap', 'setHorizontalAlignment', 'setNumberFormat'].forEach(function (m) {
  FakeRange.prototype[m] = function () { return this }
})
FakeRange.prototype.protect = function () { const p = { setDescription: function () { return p }, setWarningOnly: function () { return p } }; return p }
FakeRange.prototype.setRichTextValue = function (rt) { this.sh.put(this.r, this.c, rt.text); this.sh.links[this.r + ',' + this.c] = rt.url; return this }

function FakeSpreadsheet() { this.sheets = {} }
FakeSpreadsheet.prototype.getId = function () { return 'FAKE_SHEET_ID' }
FakeSpreadsheet.prototype.getSheetByName = function (n) { return this.sheets[n] || null }
FakeSpreadsheet.prototype.insertSheet = function (n) { this.sheets[n] = new FakeSheet(n, 200, 12); return this.sheets[n] }
FakeSpreadsheet.prototype.setActiveSheet = function (s) { return s }

// ------------------------------------------------------------------ dịch vụ Google giả lập
const state = { me: '', mails: [], props: {} }
const ss = new FakeSpreadsheet()

function unavailable(name) {
  return new Proxy({}, { get: function (t, k) { if (k === Symbol.toPrimitive || k === 'then') return undefined; throw new Error('selftest: ' + name + '.' + String(k) + ' không có trong sandbox (cần Google thật)') } })
}

const chain = new Proxy(function () {}, { get: function () { return chain }, apply: function () { return chain } })

const sandbox = {
  console: { log: function () {}, warn: function () {}, error: function () { state.errors = (state.errors || []).concat([Array.from(arguments).join(' ')]) }, info: function () {} },
  SpreadsheetApp: {
    getActive: function () { return ss },
    openById: function () { return ss },
    flush: function () {},
    getUi: function () { throw new Error('selftest: không có giao diện sheet') },
    newDataValidation: function () {
      const b = { requireCheckbox: function () { b.checkbox = true; return b }, build: function () { return { checkbox: !!b.checkbox } } }
      return b
    },
    newRichTextValue: function () {
      const v = { text: '', url: '' }
      const b = { setText: function (t) { v.text = t; return b }, setLinkUrl: function (u) { v.url = u; return b }, build: function () { return v } }
      return b
    },
  },
  PropertiesService: {
    getScriptProperties: function () {
      return {
        getProperty: function (k) { return Object.prototype.hasOwnProperty.call(state.props, k) ? state.props[k] : null },
        setProperty: function (k, v) { state.props[k] = String(v); return this },
        deleteProperty: function (k) { delete state.props[k]; return this },
        getProperties: function () { return Object.assign({}, state.props) },
      }
    },
  },
  Utilities: {
    computeHmacSha256Signature: function (value, key) {
      return Array.from(crypto.createHmac('sha256', key).update(String(value), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b })
    },
    base64EncodeWebSafe: function (bytes) {
      return Buffer.from(bytes.map(function (b) { return b & 255 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    getUuid: function () { return crypto.randomUUID() },
    formatDate: function (d, tz, fmt) {
      const parts = {}
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(+d).forEach(function (p) { parts[p.type] = p.value })
      return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, function (t) {
        return { yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second }[t]
      })
    },
  },
  Session: {
    getEffectiveUser: function () { return { getEmail: function () { return state.me } } },
    getActiveUser: function () { return { getEmail: function () { return state.me } } },
  },
  MailApp: {
    sendEmail: function (o) { state.mails.push(o) },
    getRemainingDailyQuota: function () { return 100 },
  },
  LockService: {
    getScriptLock: function () { return { tryLock: function () { return true }, waitLock: function () {}, releaseLock: function () {} } },
    getUserLock: function () { return { tryLock: function () { return true }, waitLock: function () {}, releaseLock: function () {} } },
  },
  ScriptApp: { getProjectTriggers: function () { return [] }, deleteTrigger: function () {}, newTrigger: function () { return chain } },
  HtmlService: {
    createHtmlOutputFromFile: function (n) {
      const p = path.join(dir, n + '.html')
      return { getContent: function () { return fs.readFileSync(p, 'utf8') } }
    },
    createHtmlOutput: function (h) { return { getContent: function () { return h }, setWidth: function () { return this }, setHeight: function () { return this } } },
  },
  MimeType: { JPEG: 'image/jpeg', PNG: 'image/png', GOOGLE_SLIDES: 'application/vnd.google-apps.presentation', MICROSOFT_POWERPOINT: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  DriveApp: unavailable('DriveApp'),
  Drive: unavailable('Drive'),
  SlidesApp: unavailable('SlidesApp'),
  Slides: unavailable('Slides'),
  FormApp: unavailable('FormApp'),
  UrlFetchApp: unavailable('UrlFetchApp'),
}
const ctx = vm.createContext(sandbox)

// ------------------------------------------------------------------ nạp code
section('Nạp code')
const files = fs.readdirSync(dir).filter(function (f) { return /\.(gs|js)$/.test(f) }).sort(function (a, b) {
  return a === 'Config.gs' ? -1 : b === 'Config.gs' ? 1 : a.localeCompare(b) // Config trước (khai báo const dùng chung)
})
try {
  files.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }) })
  check('Nạp ' + files.length + ' file .gs không lỗi cú pháp', true)
} catch (e) {
  check('Nạp file .gs', false, e.stack || e.message)
  finish(2)
}
const html = fs.existsSync(path.join(dir, 'Email.html')) ? fs.readFileSync(path.join(dir, 'Email.html'), 'utf8') : ''
check('Có Email.html', !!html)
let manifest = null
try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'appsscript.json'), 'utf8')) } catch (e) {}
check('appsscript.json đọc được', !!manifest)

const G = function (expr) { return vm.runInContext(expr, ctx) }
const EVENT = G('EVENT'), SETTINGS = G('SETTINGS'), COL = G('COL')
// Lời chào mong đợi theo cấu hình (mặc định "Kính gửi" + "Quý Anh/Chị")
const G_PREFIX = EVENT.greeting === undefined ? 'Kính gửi ' : (EVENT.greeting ? EVENT.greeting + ' ' : '')
const G_SAL = EVENT.salutation === undefined ? 'Quý Anh/Chị ' : (EVENT.salutation ? EVENT.salutation + ' ' : '')
const salesMode = SETTINGS.senderMode !== 'shared'
const card = !!SETTINGS.cardEnabled

// ------------------------------------------------------------------ cấu hình
section('Cấu hình (Config.gs)')
;['code', 'name', 'title', 'subject', 'timeText', 'start', 'end', 'place', 'orgName', 'intro', 'signOff'].forEach(function (k) {
  check('EVENT.' + k + ' có giá trị', String(EVENT[k] || '').trim() !== '', 'đang trống')
})
check('EVENT.code dạng chữ/số in hoa 2–10 ký tự', /^[A-Z0-9]{2,10}$/.test(EVENT.code || ''), EVENT.code)
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
check('EVENT.start / end dạng yyyy-MM-ddTHH:mm', iso.test(EVENT.start) && iso.test(EVENT.end), EVENT.start + ' / ' + EVENT.end)
check('EVENT.end sau EVENT.start', String(EVENT.end) > String(EVENT.start), EVENT.start + ' → ' + EVENT.end)
const colors = EVENT.colors || {}
check('Màu trong EVENT.colors là mã hex', Object.keys(colors).every(function (k) { return /^#[0-9a-fA-F]{6}$/.test(colors[k]) }), JSON.stringify(colors))
check('SETTINGS.senderMode là "sales" hoặc "shared"', ['sales', 'shared'].indexOf(SETTINGS.senderMode) >= 0, SETTINGS.senderMode)
check('Dòng nhóm < dòng header < dòng dữ liệu đầu', SETTINGS.groupRow < SETTINGS.headerRow && SETTINGS.headerRow < SETTINGS.firstDataRow,
  SETTINGS.groupRow + ' / ' + SETTINGS.headerRow + ' / ' + SETTINGS.firstDataRow)
check('COL.name và COL.email có tên header', !!COL.name && !!COL.email)
if (salesMode) check('senderMode "sales" cần COL.sales (cột tên Sales phụ trách)', !!COL.sales)
// Chữ của cấu hình mẫu (assets/event.example.json) còn sót trong sự kiện thật → báo (bỏ qua khi chạy chính bản mẫu SUM26)
const evText = JSON.stringify(EVENT)
const leftovers = (evText.match(/TODO|XXX|\{\{[A-Z_]+\}\}/g) || [])
  .concat(EVENT.code === 'SUM26' ? [] : (evText.match(/SAMPLE SUMMIT|Công ty Mẫu|Khách sạn Mẫu|Ms Mẫu|0900 000 000/g) || []))
check('Không còn chữ mẫu / TODO trong EVENT', !leftovers.length, leftovers.join(', '))
if (manifest) {
  const scopes = manifest.oauthScopes || []
  ;['spreadsheets', 'forms', 'drive', 'script.send_mail', 'script.scriptapp', 'script.container.ui'].forEach(function (s) {
    check('Manifest có scope ' + s, scopes.some(function (x) { return x.endsWith('/auth/' + s) }))
  })
  if (card) check('Có thiệp → manifest bật dịch vụ Slides + scope presentations',
    (manifest.dependencies && (manifest.dependencies.enabledAdvancedServices || []).some(function (s) { return s.serviceId === 'slides' })) &&
    scopes.some(function (x) { return x.endsWith('/auth/presentations') }))
}

// ------------------------------------------------------------------ dựng sheet
section('Sheet + setup (ensureColumns_)')
const HEADER_ROW = SETTINGS.headerRow, GROUP_ROW = SETTINGS.groupRow, FIRST = SETTINGS.firstDataRow
let headers
const custom = opt('headers')
const csvRows = opt('sample-csv') ? parseCsv(fs.readFileSync(opt('sample-csv'), 'utf8')) : null
if (custom) {
  headers = custom.split(',').map(function (s) { return s.trim() })
} else if (csvRows && csvRows[HEADER_ROW - 1]) {
  headers = csvRows[HEADER_ROW - 1].map(function (s) { return String(s).trim() })
} else {
  headers = ['STT']
  if (COL.sales) headers.push(COL.sales)
  if (COL.company) headers.push(COL.company)
  headers.push(COL.name, 'Chức vụ', COL.email, 'SĐT')
}
const data = ss.insertSheet(SETTINGS.dataTab)
data.maxCols = headers.length
headers.forEach(function (h, i) { data.put(HEADER_ROW, i + 1, h) })
if (GROUP_ROW > 0) data.put(GROUP_ROW, 1, 'THÔNG TIN KHÁCH')
const normH = function (s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase() }
const idx = function (h) { if (!h) return 0; const i = headers.findIndex(function (x) { return normH(x) === normH(h) }); return i < 0 ? 0 : i + 1 }
const mapped = { name: idx(COL.name), email: idx(COL.email), company: idx(COL.company), sales: idx(COL.sales) }
check('Header "' + COL.name + '" có trên sheet', mapped.name > 0, 'header sheet: ' + headers.join(' | '))
check('Header "' + COL.email + '" có trên sheet', mapped.email > 0, 'header sheet: ' + headers.join(' | '))
if (salesMode) check('Header "' + COL.sales + '" có trên sheet', mapped.sales > 0, 'header sheet: ' + headers.join(' | '))
if (COL.company) check('Header "' + COL.company + '" có trên sheet (không bắt buộc)', mapped.company > 0, 'không thấy → cột công ty sẽ để trống trong LOG')
if (!(mapped.name && mapped.email && (!salesMode || mapped.sales))) finish(1)

const guests = [
  { name: 'Nguyễn Văn An', email: 'an.nguyen@khach.example', company: 'Công ty Khách Một', sales: 'Sales A' },
  { name: 'Trần Thị Bình', email: 'binh.tran@khach.example', company: 'Công ty Khách Hai', sales: 'Sales B' },
  { name: 'Lê Văn Cường', email: 'khong-phai-email', company: 'Công ty Khách Ba', sales: 'Sales A' },
]
guests.forEach(function (g, i) {
  const r = FIRST + i
  data.put(r, 1, i + 1)
  data.put(r, mapped.name, g.name)
  data.put(r, mapped.email, g.email)
  if (mapped.company) data.put(r, mapped.company, g.company)
  if (mapped.sales) data.put(r, mapped.sales, g.sales)
})

state.props.SHEET_ID = 'FAKE_SHEET_ID'
state.props.SECRET = 'selftest-secret-' + crypto.randomBytes(8).toString('hex')
state.props.TEST_MODE = 'true'
state.props.FORM_ID = 'FAKE_FORM_ID'
state.props.FORM_SUBMIT_YES = 'https://docs.google.com/forms/d/e/FAKE/formResponse?entry.111=C%C3%B3%2C+t%C3%B4i+s%E1%BA%BD+tham+d%E1%BB%B1&entry.222=MAXACNHAN&submit=Submit'
state.props.FORM_SUBMIT_NO = 'https://docs.google.com/forms/d/e/FAKE/formResponse?entry.111=R%E1%BA%A5t+ti%E1%BA%BFc&entry.222=MAXACNHAN&submit=Submit'
if (card) state.props.CARD_TEMPLATE_ID = 'FAKE_SLIDES_ID'

let added = 0
try {
  added = ctx.ensureColumns_(data)
  check('ensureColumns_ thêm nhóm cột AUTO (' + added + ' cột)', added > 0)
} catch (e) {
  check('ensureColumns_ chạy được', false, e.message)
  finish(1)
}
let c
try {
  c = ctx.cols_(data)
  check('cols_ tìm đủ cột sau setup', true)
} catch (e) {
  check('cols_ tìm đủ cột sau setup', false, e.message)
  finish(1)
}
check('Có cột "Gửi Email" (ô tick)', !!c.send && !!data.checkboxes[c.send])
check('Có cột kết quả đã mời / xác nhận / không tham dự', !!c.invited && !!c.confirmed && !!c.declined)
check('Thiệp bật ↔ có cột "Link thiệp"', card ? !!c.cardLink : !c.cardLink)
const original = headers.length
check('Không ghi đè cột gốc (cột AUTO nằm sau cột ' + original + ')', c.send > original && c.status > original && c.key > original)
check('Chạy lại ensureColumns_ không thêm cột trùng', ctx.ensureColumns_(data) === 0)

// người gửi
let me
if (salesMode) {
  const s = ctx.salesSheet_()
  s.appendRow(['Sales A', 'sales.a@example.com'])
  s.appendRow(['Sales B', 'sales.b@example.com'])
  state.props['SALES_ACTIVE_sales.a@example.com'] = '01/01/2026 08:00:00'
  me = 'sales.a@example.com'
} else {
  const shared = String(SETTINGS.sharedSender || 'events@example.com').toLowerCase()
  state.props.SHARED_SENDER = shared
  me = shared
  if (SETTINGS.sharedSender) {
    check('setup() chặn tài khoản khác hộp thư chung', (function () { try { ctx.checkSharedSender_('nguoi-khac@example.com'); return false } catch (e) { return true } })())
    check('setup() nhận đúng hộp thư chung ' + shared, (function () { try { return ctx.checkSharedSender_(shared.toUpperCase()) === shared } catch (e) { return false } })())
  }
}
state.me = me

// thiệp giả (không gọi Slides/Drive)
const cardCalls = []
if (card) {
  ctx.renderCard_ = function (name) { cardCalls.push(name); return { fake: 'blob', name: name, copyBlob: function () { return this } } }
  ctx.saveCard_ = function () { return { getUrl: function () { return 'https://drive.google.com/file/d/FAKE_CARD/view' } } }
}

const row = function (i) { return FIRST + i }
const val = function (r, col) { return data.cell(r, col) }
const logEvents = function () { const l = ss.getSheetByName('LOG_EMAIL'); return l ? l.grid.slice(1).map(function (x) { return x[1] }) : [] }
const tick = function (r) {
  data.put(r, c.send, true)
  ctx.onSheetEdit({ range: data.getRange(r, c.send), user: { getEmail: function () { return me } } })
}

// ------------------------------------------------------------------ tick + gửi TEST
section('Tick "Gửi Email" + gửi bản TEST')
tick(row(0))
check('Tick dòng khách → "Chờ gửi"', val(row(0), c.status) === 'Chờ gửi', val(row(0), c.status))
tick(row(2))
if (salesMode) {
  tick(row(1))
  check('Dòng của Sales CHƯA kích hoạt → báo lỗi, không xếp hàng', /^Lỗi: .*chưa kích hoạt/.test(val(row(1), c.status)), val(row(1), c.status))
}
ctx.processQueue()
const testMail = state.mails[0]
check('processQueue gửi đúng 1 email bản thử', state.mails.length === 1, state.mails.length + ' email')
if (testMail) {
  check('Bản thử gửi về chính hộp thư đang gửi (' + me + ')', testMail.to === me, testMail.to)
  check('Tiêu đề bản thử = "[TEST] " + EVENT.subject', testMail.subject === '[TEST] ' + EVENT.subject, testMail.subject)
  const expectedName = salesMode ? 'Sales A' + (SETTINGS.senderSuffix ? ' – ' + SETTINGS.senderSuffix : '') : (SETTINGS.sharedSenderName || EVENT.orgName)
  check('Tên người gửi hiển thị "' + expectedName + '"', testMail.name === expectedName, testMail.name)
  check('Thiệp bật ↔ email có ảnh inline cid:thiep', card ? !!(testMail.inlineImages && testMail.inlineImages.thiep) && testMail.htmlBody.indexOf('cid:thiep') >= 0 : !testMail.inlineImages && testMail.htmlBody.indexOf('cid:thiep') < 0)
  check('Không đính kèm file', !testMail.attachments)
  check('Bản thử có dải "BẢN THỬ"', testMail.htmlBody.indexOf('BẢN THỬ') >= 0)
}
check('Dòng gửi thử → "TEST đã gửi → ' + me + '"', String(val(row(0), c.status)).indexOf('TEST đã gửi → ' + me) === 0, val(row(0), c.status))
check('Bản thử KHÔNG tick cột "đã mời"', val(row(0), c.invited) !== true)
const key = val(row(0), c.key)
check('Gán Mã KH dạng ' + EVENT.code + '-0001', new RegExp('^' + EVENT.code + '-\\d{4}$').test(key), key)
check('Email sai định dạng → "Lỗi: thiếu hoặc sai Email KH"', val(row(2), c.status) === 'Lỗi: thiếu hoặc sai Email KH', val(row(2), c.status))
if (card) check('Có thiệp → tạo thiệp theo tên khách + ghi "Link thiệp"', cardCalls[0] === guests[0].name && val(row(0), c.cardLink) === 'Xem thiệp', cardCalls.join(', '))

// ------------------------------------------------------------------ nội dung email
section('Nội dung email')
function unesc(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') }
function hrefs(h) { return (h.match(/href="([^"]+)"/g) || []).map(function (x) { return unesc(x.slice(6, -1)) }) }
function codeOf(url) { const m = String(url).match(/entry\.222=([^&]+)/); return m ? decodeURIComponent(m[1]) : '' }
function formLinks(h) { return hrefs(h).filter(function (u) { return u.indexOf('/formResponse?') >= 0 }) }
if (testMail) {
  const h = testMail.htmlBody
  check('Không còn {{…}} chưa điền', !/\{\{[A-Za-z_]+\}\}/.test(h), (h.match(/\{\{[A-Za-z_]+\}\}/g) || []).join(', '))
  check('Không còn đánh dấu khối <!--TÊN-->', !/<!--\/?[A-Z_]+-->/.test(h), (h.match(/<!--\/?[A-Z_]+-->/g) || []).join(', '))
  const forms = formLinks(h)
  check('Có đúng 2 nút 1 lần bấm (formResponse)', forms.length === 2, forms.length)
  check('2 nút khác nhau (xác nhận / không tham dự)', forms.length === 2 && forms[0] !== forms[1])
  check('Nút chứa Mã xác nhận bản thử ' + key + '.T.<chữ ký>', forms.length > 0 && forms.every(function (u) { return new RegExp('^' + key + '\\.T\\.[A-Za-z0-9]{6,}$').test(codeOf(u)) }), forms.map(codeOf).join(' | '))
  check('Có link "Thêm vào lịch" Google Calendar', hrefs(h).some(function (u) { return u.indexOf('calendar.google.com') >= 0 && u.indexOf('dates=') >= 0 }))
  check('Có link bản đồ', hrefs(h).some(function (u) { return u.indexOf('google.com/maps') >= 0 }))
  ;['title', 'timeText', 'place'].forEach(function (k) {
    check('Email có EVENT.' + k, h.indexOf(G('esc_')(EVENT[k])) >= 0)
  })
  check('Lời chào "' + G_PREFIX + G_SAL + guests[0].name + '"', h.indexOf(G('esc_')(G_PREFIX + G_SAL + guests[0].name) + ',') >= 0)
  check('Câu chữ cố định dùng đại từ "' + (EVENT.pronoun || 'Anh/Chị') + '"', h.indexOf('Muốn đổi lựa chọn, ' + G('esc_')(EVENT.pronoun || 'Anh/Chị') + ' bấm') >= 0)
  ;(EVENT.highlights || []).forEach(function (x, i) { check('Bản text thuần có điểm nổi bật #' + (i + 1), testMail.body.indexOf(x.title) >= 0) })
  ;(EVENT.links || []).forEach(function (l) { check('Bản text thuần có link "' + l.label + '"', testMail.body.indexOf(l.url) >= 0) })
  check('Bản text thuần có 2 link phản hồi', (testMail.body.match(/formResponse\?/g) || []).length === 2)
  ;(EVENT.highlights || []).forEach(function (x, i) { check('Có điểm nổi bật #' + (i + 1), h.indexOf(G('esc_')(x.title)) >= 0) })
}
check('greeting_: "Anh/Chị Hường" giữ danh xưng', G('greeting_')('Anh/Chị Hường') === G_PREFIX + 'Anh/Chị Hường')
check('greeting_: "Ms Vy" giữ danh xưng', G('greeting_')('Ms Vy') === G_PREFIX + 'Ms Vy')
check('greeting_: "Nguyễn Thị Hoa" → "' + G_PREFIX + G_SAL + 'Nguyễn Thị Hoa"', G('greeting_')('Nguyễn Thị Hoa') === G_PREFIX + G_SAL + 'Nguyễn Thị Hoa')

// ------------------------------------------------------------------ phản hồi
const CHOICE_TITLE = G('FORM_CHOICE_TITLE'), CODE_TITLE = G('FORM_CODE_TITLE'), YES = G('CHOICE_YES'), NO = G('CHOICE_NO')
function submit(code, choice, at) {
  const items = [
    { getItem: function () { return { getTitle: function () { return CHOICE_TITLE } } }, getResponse: function () { return choice === 'no' ? NO : YES } },
    { getItem: function () { return { getTitle: function () { return CODE_TITLE } } }, getResponse: function () { return code } },
  ]
  ctx.onConfirmSubmit({ response: { getItemResponses: function () { return items }, getTimestamp: function () { return new Date(at) } } })
}

section('Khách bấm nút trong bản THỬ')
const testCode = testMail ? codeOf(formLinks(testMail.htmlBody)[0] || '') : ''
const testSent = Number(state.props['RSVP_SENT_T_' + key] || 0)
check('Ghi mốc gửi bản thử (cho bộ lọc quét link)', testSent > 0)
submit(testCode, 'yes', testSent + 60 * 1000)
check('Bản thử: "KH phản hồi" ghi [TEST] …', String(val(row(0), c.reply)).indexOf('[TEST] Đã xác nhận') === 0, val(row(0), c.reply))
check('Bản thử: KHÔNG tick cột xác nhận', val(row(0), c.confirmed) !== true)
check('LOG có TEST_CONFIRMED', logEvents().indexOf('TEST_CONFIRMED') >= 0)

section('Gửi THẬT')
state.props.TEST_MODE = 'false'
data.put(row(0), c.status, '')
state.mails = []
ctx.processQueue()
const live = state.mails[0]
check('Gửi thật đúng 1 email', state.mails.length === 1, state.mails.length)
if (live) {
  check('Email thật tới đúng email khách', live.to === guests[0].email, live.to)
  check('Tiêu đề thật không có [TEST]', live.subject === EVENT.subject, live.subject)
  check('Email thật không có dải "BẢN THỬ"', live.htmlBody.indexOf('BẢN THỬ') < 0)
}
check('Trạng thái "Đã gửi"', val(row(0), c.status) === 'Đã gửi', val(row(0), c.status))
check('Tick cột "đã mời"', val(row(0), c.invited) === true)
check('Xóa kết quả [TEST] ở "KH phản hồi"', val(row(0), c.reply) === '', val(row(0), c.reply))
check('Giữ nguyên Mã KH khi gửi lại', val(row(0), c.key) === key)
check('Dòng "Đã gửi" không gửi lần 2', (function () { state.mails = []; ctx.processQueue(); return state.mails.length === 0 })())

section('Khách bấm nút trong email THẬT')
const liveCode = live ? codeOf(formLinks(live.htmlBody)[0] || '') : ''
check('Mã xác nhận thật dạng ' + key + '.<chữ ký> (không có .T.)', new RegExp('^' + key + '\\.[A-Za-z0-9]{6,}$').test(liveCode), liveCode)
const T0 = Date.now()
state.props['RSVP_SENT_L_' + key] = String(T0)
submit(liveCode, 'yes', T0 + 10 * 1000)
check('Bấm trong 30 giây đầu → "Cần kiểm tra", chưa tick xác nhận', String(val(row(0), c.reply)).indexOf('Cần kiểm tra') === 0 && val(row(0), c.confirmed) !== true, val(row(0), c.reply))
submit(liveCode, 'yes', T0 + 5 * 60 * 1000)
check('Bấm "Xác nhận" sau khoảng chờ → tick xác nhận, "Đã xác nhận – …"', val(row(0), c.confirmed) === true && String(val(row(0), c.reply)).indexOf('Đã xác nhận') === 0, val(row(0), c.reply))
submit(liveCode, 'no', T0 + 20 * 60 * 1000)
check('Đổi ý "Không thể tham dự" → tick không tham dự, bỏ tick xác nhận', val(row(0), c.declined) === true && val(row(0), c.confirmed) !== true, 'xác nhận=' + val(row(0), c.confirmed) + ', không=' + val(row(0), c.declined))
submit(liveCode, 'yes', T0 + 21 * 60 * 1000)
check('Bấm cả 2 nút trong 3 phút → "Cần kiểm tra", khôi phục như trước lượt nghi',
  String(val(row(0), c.reply)).indexOf('Cần kiểm tra') === 0 && val(row(0), c.confirmed) === true && val(row(0), c.declined) !== true,
  val(row(0), c.reply) + ' | xác nhận=' + val(row(0), c.confirmed) + ', không=' + val(row(0), c.declined))
const snapshot = function () { return JSON.stringify([val(row(0), c.confirmed), val(row(0), c.declined), val(row(0), c.reply)]) }
const before = snapshot()
submit(key + '.SAICHUKY123', 'no', T0 + 40 * 60 * 1000)
submit(liveCode.replace(key, EVENT.code + '-9999'), 'no', T0 + 41 * 60 * 1000)
check('Mã giả / sửa mã → không đổi sheet', before === snapshot(), snapshot())
submit(testCode, 'no', T0 + 50 * 60 * 1000)
check('Dùng mã bản thử không đổi kết quả thật', val(row(0), c.declined) !== true && val(row(0), c.confirmed) === true)
const ev = logEvents()
;['QUEUED', 'TEST_SENT', 'SENT', 'SEND_ERROR', 'SCANNER_SUSPECTED', 'CONFIRMED', 'DECLINED', 'INVALID_RESPONSE'].forEach(function (e) {
  check('LOG có ' + e, ev.indexOf(e) >= 0)
})
check('Không có lỗi console.error trong lúc chạy', !(state.errors || []).length, (state.errors || []).join(' | '))

section('Dòng mới thêm sau setup (vd. tab câu trả lời Google Form)')
check('Dòng mới được thêm ô tick "Gửi Email", ô đã tick giữ nguyên', (function () {
  const newRow = data.getLastRow() + 1
  data.put(newRow, mapped.name, 'Khách Mới Từ Form')
  data.put(newRow, mapped.email, 'moi@khach.example')
  const before = val(row(0), c.send)
  state.mails = []
  ctx.processQueue()
  return !!data.validated[newRow + ',' + c.send] && val(row(0), c.send) === before && state.mails.length === 0
})())

// ------------------------------------------------------------------ xem trước
const previewPath = opt('preview')
if (previewPath && live) {
  const ph = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="560" height="780"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="24" fill="#6b7280">Thiệp mời (ảnh tạo tự động)</text></svg>')
  const fix = function (h) { return String(h).split('cid:thiep').join(ph) }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  // Khách thật từ --sample-csv (tối đa 5) — xem lời chào / tên với dữ liệu thật; không có thì dùng email thật vừa gửi trong selftest
  const parts = []
  if (csvRows) {
    const hdr = (csvRows[HEADER_ROW - 1] || []).map(normH)
    const ci = function (h) { return h ? hdr.indexOf(normH(h)) : -1 }
    const iName = ci(COL.name), iEmail = ci(COL.email), iCard = ci(G('AUTO_COL').cardName)
    csvRows.slice(FIRST - 1).filter(function (r) { return iName >= 0 && String(r[iName] || '').trim() }).slice(0, 5).forEach(function (r, i) {
      const display = (iCard >= 0 && String(r[iCard] || '').trim()) || String(r[iName]).trim()
      const emails = iEmail >= 0 ? ctx.parseEmails_(r[iEmail]) : []
      const key = G('KEY_PREFIX') + String(i + 1).padStart(4, '0')
      parts.push({ title: display + ' — ' + (emails.join(', ') || '(chưa có email hợp lệ)'), html: fix(ctx.buildEmailHtml_(key, display, false, emails, { email: me, name: '' })) })
    })
  }
  if (!parts.length) parts.push({ title: guests[0].name + ' (khách giả của selftest) — ' + live.to, html: fix(live.htmlBody) })
  const page = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Xem trước email – ' + esc(EVENT.name) + '</title></head><body style="margin:0;background:#e5e7eb;font-family:Arial,sans-serif">' +
    '<div style="padding:12px 16px;background:#111827;color:#fff;font-size:14px;line-height:1.5"><b>Tiêu đề:</b> ' + esc(live.subject) +
    '<br><b>Người gửi:</b> ' + esc(live.name || '') + ' · bản xem trước — nút phản hồi trỏ tới form giả của selftest' + (card ? ', thiệp là ảnh giữ chỗ' : '') + '</div>' +
    parts.map(function (p) {
      return '<div style="max-width:720px;margin:0 auto;padding:12px 8px 4px;font-size:13px;color:#374151"><b>' + esc(p.title) + '</b></div>' +
        '<iframe title="' + esc(p.title) + '" style="display:block;width:100%;max-width:720px;height:1500px;border:0;margin:0 auto 16px;background:#fff" ' +
        'onload="this.style.height=(this.contentDocument.documentElement.scrollHeight+20)+\'px\'" srcdoc="' + esc(p.html) + '"></iframe>'
    }).join('') + '</body></html>'
  fs.writeFileSync(previewPath, page)
  console.log('\nĐã ghi bản xem trước email (' + parts.length + ' khách): ' + previewPath)
}
finish()

function finish(code) {
  const failed = results.filter(function (r) { return !r.ok })
  console.log('\n' + (failed.length ? '✘ ' + failed.length + '/' + results.length + ' kiểm tra TRƯỢT' : '✔ Đạt ' + results.length + '/' + results.length + ' kiểm tra'))
  const jsonPath = opt('json')
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify({ passed: results.length - failed.length, total: results.length, results: results }, null, 2))
  process.exit(code !== undefined ? code : failed.length ? 1 : 0)
}

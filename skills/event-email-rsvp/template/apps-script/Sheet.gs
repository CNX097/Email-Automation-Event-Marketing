/** Đọc / ghi tab danh sách khách và tab LOG */

const LOG_HEADERS = ['Thời gian', 'Sự kiện', 'Mã KH', 'Dòng', 'Họ tên KH', 'Email KH', 'Công ty', 'Sales', 'Chi tiết', 'Người thao tác']
const AUTO_COL_WIDTHS = { send: 90, cardName: 160, status: 190, sentAt: 140, cardLink: 110, invited: 110, confirmed: 120, declined: 120, reply: 210, key: 95 }
const SCRIPT_OWNED = ['status', 'sentAt', 'cardLink', 'reply', 'key']
const CHECKBOX_COLS = ['send', 'invited', 'confirmed', 'declined']

function ss_() {
  const id = prop_('SHEET_ID')
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive()
}

function dataTabName_() {
  return prop_('DATA_TAB', DEFAULT_DATA_TAB)
}

function dataSheet_() {
  const sh = ss_().getSheetByName(dataTabName_())
  if (!sh) throw new Error('Không tìm thấy tab "' + dataTabName_() + '"')
  return sh
}

function norm_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function clean_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim()
}

/** Tên header (đã chuẩn hóa) → số cột 1-based. Header trùng tên thì lấy cột đầu tiên */
function headerMap_(sh) {
  const headers = sh.getRange(HEADER_ROW, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0]
  const map = {}
  headers.forEach(function (h, i) {
    const k = norm_(h)
    if (k && !map[k]) map[k] = i + 1
  })
  return map
}

/** Cột gốc bắt buộc phải có trên sheet: Họ tên, Email (+ Sales phụ trách khi mỗi Sales tự gửi) */
function requiredBaseFields_() {
  return ['name', 'email'].concat(isSalesMode_() ? ['sales'] : [])
}

/** Header của 1 trường AUTO / kết quả ('' nếu không dùng) */
function autoHeader_(field) {
  return AUTO_COL[field] || RESULT_COL[field] || ''
}

/** Số cột của mọi trường đang dùng — báo lỗi rõ ràng nếu thiếu */
function cols_(sh) {
  const map = headerMap_(sh)
  const out = {}
  const missing = []
  Object.keys(COL).forEach(function (field) {
    const header = COL[field]
    const c = header ? map[norm_(header)] : 0
    if (c) out[field] = c
    else if (requiredBaseFields_().indexOf(field) >= 0) missing.push(header || '(chưa khai báo cột ' + field + ')')
  })
  AUTO_ORDER.forEach(function (field) {
    const header = autoHeader_(field)
    if (!header) return
    const c = map[norm_(header)]
    if (c) out[field] = c
    else missing.push(header)
  })
  if (missing.length) throw new Error('Tab "' + sh.getName() + '" thiếu cột: ' + missing.join(', ') + ' — chạy setup()')
  return out
}

function rowObj_(v, row, c) {
  const at = function (col) { return col ? v[col - 1] : '' }
  return {
    row: row,
    send: at(c.send) === true,
    cardName: clean_(at(c.cardName)),
    status: clean_(at(c.status)),
    key: clean_(at(c.key)),
    name: clean_(at(c.name)),
    email: String(at(c.email) || ''),
    company: clean_(at(c.company)),
    sales: clean_(at(c.sales)),
  }
}

function readRows_(sh, c) {
  const last = sh.getLastRow()
  if (last < FIRST_DATA_ROW) return []
  const values = sh.getRange(FIRST_DATA_ROW, 1, last - FIRST_DATA_ROW + 1, sh.getLastColumn()).getValues()
  return values.map(function (v, i) {
    return rowObj_(v, FIRST_DATA_ROW + i, c)
  })
}

function readRow_(sh, c, row) {
  return rowObj_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], row, c)
}

function setCell_(sh, row, col, value) {
  sh.getRange(row, col).setValue(value)
}

function findRowByKey_(sh, c, key) {
  const last = sh.getLastRow()
  if (!key || last < FIRST_DATA_ROW) return 0
  const keys = sh.getRange(FIRST_DATA_ROW, c.key, last - FIRST_DATA_ROW + 1, 1).getDisplayValues()
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) return FIRST_DATA_ROW + i
  }
  return 0
}

/** Gán Mã KH theo bộ đếm — chỉ gọi khi đang giữ ScriptLock */
function ensureKey_(sh, c, r) {
  if (r.key) return r.key
  const n = Number(prop_('KEY_COUNTER', 0)) + 1
  setProp_('KEY_COUNTER', n)
  r.key = KEY_PREFIX + ('000' + n).slice(-4)
  setCell_(sh, r.row, c.key, r.key)
  return r.key
}

/**
 * Thêm nhóm cột AUTO vào bên phải (chỉ thêm cột còn thiếu, không đụng cột cũ). Trả về số cột đã thêm.
 * Cột kết quả (RESULT_COL) đã có trên sheet thì dùng luôn, chưa có thì thêm vào nhóm AUTO.
 */
function ensureColumns_(sh) {
  const map = headerMap_(sh)
  const lacking = requiredBaseFields_().filter(function (f) { return !COL[f] || !map[norm_(COL[f])] })
  if (lacking.length) {
    throw new Error('Tab "' + sh.getName() + '" thiếu cột gốc: ' + lacking.map(function (f) { return COL[f] || f }).join(', ') +
      ' — sửa COL trong Config.gs cho đúng tên header ở dòng ' + HEADER_ROW)
  }
  const missing = AUTO_ORDER.filter(function (f) { return autoHeader_(f) && !map[norm_(autoHeader_(f))] })
  if (!missing.length) return 0

  const first = sh.getLastColumn() + 1
  const need = first + missing.length - 1 - sh.getMaxColumns()
  if (need > 0) sh.insertColumnsAfter(sh.getMaxColumns(), need)

  sh.getRange(HEADER_ROW, first, 1, missing.length)
    .setValues([missing.map(autoHeader_)])
    .setFontWeight('bold')
    .setBackground('#ede9fe')
    .setWrap(true)
  if (GROUP_ROW > 0 && GROUP_ROW < HEADER_ROW) {
    const group = sh.getRange(GROUP_ROW, first, 1, missing.length)
    if (missing.length > 1) group.merge()
    group.getCell(1, 1).setValue(AUTO_GROUP_LABEL)
    group.setFontWeight('bold').setBackground('#c4b5fd').setHorizontalAlignment('center')
  }

  const c = cols_(sh)
  const rows = sh.getMaxRows() - FIRST_DATA_ROW + 1
  missing.forEach(function (f) {
    sh.setColumnWidth(c[f], AUTO_COL_WIDTHS[f] || 120)
    if (CHECKBOX_COLS.indexOf(f) >= 0) sh.getRange(FIRST_DATA_ROW, c[f], rows, 1).insertCheckboxes()
    if (SCRIPT_OWNED.indexOf(f) >= 0) {
      sh.getRange(FIRST_DATA_ROW, c[f], rows, 1)
        .setBackground('#f8fafc')
        .protect()
        .setDescription('Cột do script email sự kiện ghi — không sửa tay (xóa ô "Trạng thái email" để gửi lại)')
        .setWarningOnly(true)
    }
  })
  return missing.length
}

function logSheet_() {
  const ss = ss_()
  let sh = ss.getSheetByName(LOG_TAB)
  if (!sh) {
    sh = ss.insertSheet(LOG_TAB)
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setBackground('#ede9fe')
    sh.setFrozenRows(1)
    sh.setColumnWidth(1, 150)
    sh.setColumnWidth(2, 130)
    sh.setColumnWidth(9, 360)
  }
  return sh
}

/** Ghi 1 dòng LOG — không bao giờ làm hỏng luồng chính nếu ghi lỗi */
function log_(event, r, detail, actor) {
  try {
    r = r || {}
    logSheet_().appendRow([
      nowText_(),
      event,
      r.key || '',
      r.row || '',
      r.name || '',
      clean_(r.email),
      r.company || '',
      r.sales || '',
      detail || '',
      actor || 'Hệ thống',
    ])
  } catch (e) {
    console.error('Ghi LOG lỗi: ' + errMsg_(e))
  }
}

/**
 * Dòng thêm vào sau setup() — nhất là tab câu trả lời Google Form (Form chèn dòng mới, không mang theo ô tick)
 * → đặt lại kiểu ô tick cho các cột tick của dòng mới. Chỉ đặt data validation, KHÔNG đổi giá trị
 * (insertCheckboxes() sẽ đặt mọi ô về false). processQueue gọi mỗi lượt; nhớ dòng cuối đã xử lý.
 */
function syncCheckboxes_(sh, c) {
  const last = sh.getLastRow()
  const done = Number(prop_('CHECKBOX_LAST_ROW', 0)) || 0
  if (last < FIRST_DATA_ROW || last <= done) return 0
  const from = Math.max(FIRST_DATA_ROW, done + 1)
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build()
  CHECKBOX_COLS.forEach(function (f) {
    if (c[f]) sh.getRange(from, c[f], last - from + 1, 1).setDataValidation(rule)
  })
  setProp_('CHECKBOX_LAST_ROW', String(last))
  return last - from + 1
}

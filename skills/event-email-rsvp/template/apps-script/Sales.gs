/**
 * Người gửi email.
 *
 * senderMode 'sales' — mỗi Sales gửi email cho khách của mình từ CHÍNH hộp thư của mình:
 *  - Tab SALES_EMAIL: tên Sales (cột COL.sales) → Email Sales. Quản trị chạy menu "Cập nhật danh sách Sales…" để liệt kê
 *    tên Sales từ tab danh sách + chia sẻ thư mục sự kiện (khi có thiệp; quyền sửa, không gửi thông báo).
 *  - Mỗi Sales làm 1 lần: menu → "Kích hoạt gửi bằng email của tôi" → cấp quyền. Script cài trigger processQueue
 *    chạy bằng tài khoản Sales đó và chỉ gửi các dòng của Sales đó.
 *  - Dòng của Sales chưa có email / chưa kích hoạt → báo lỗi, KHÔNG gửi.
 *
 * senderMode 'shared' — 1 hộp thư chung (vd. events@…) gửi mọi email: chạy setup() bằng chính tài khoản đó.
 */

const SALES_TAB = 'SALES_EMAIL'
const SALES_HEADERS = ['Tên Sales', 'Email Sales', 'Trạng thái', 'Cập nhật lúc']
const SALES_READY = '✅ Đã kích hoạt'

/** Người gửi của 1 dòng khách: { name, email, shared } — ném lỗi tiếng Việt rõ ràng nếu chưa gửi được */
function sender_(r) {
  if (!isSalesMode_()) {
    const email = String(prop_('SHARED_SENDER', '')).toLowerCase()
    if (!email) throw new Error('chưa cài hộp thư gửi chung — chạy setup() bằng tài khoản hộp thư chung')
    return { name: SETTINGS.sharedSenderName || EVENT.orgName, email: email, shared: true }
  }
  return salesSender_(r)
}

/** Tên hiển thị người gửi trong hộp thư khách */
function senderDisplayName_(s) {
  if (s.shared) return s.name
  return s.name + (SETTINGS.senderSuffix ? ' – ' + SETTINGS.senderSuffix : '')
}

function salesSheet_() {
  const ss = ss_()
  let sh = ss.getSheetByName(SALES_TAB)
  if (!sh) {
    sh = ss.insertSheet(SALES_TAB)
    sh.getRange(1, 1, 1, SALES_HEADERS.length).setValues([SALES_HEADERS]).setFontWeight('bold').setBackground('#ede9fe')
    sh.setFrozenRows(1)
    sh.setColumnWidth(1, 200)
    sh.setColumnWidth(2, 260)
    sh.setColumnWidth(3, 420)
    sh.setColumnWidth(4, 150)
  }
  return sh
}

function activeKey_(email) {
  return 'SALES_ACTIVE_' + String(email).toLowerCase()
}

function isActivated_(email) {
  return !!prop_(activeKey_(email))
}

/** Danh sách Sales trong tab SALES_EMAIL: [{ row, name, email }] */
function salesList_() {
  const sh = salesSheet_()
  const last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, 1, last - 1, 2).getValues().map(function (v, i) {
    return { row: i + 2, name: clean_(v[0]), email: clean_(v[1]).toLowerCase() }
  }).filter(function (s) { return s.name })
}

function salesByName_(name) {
  const key = norm_(name)
  return salesList_().filter(function (s) { return norm_(s.name) === key })[0] || null
}

function salesByEmail_(email) {
  const key = String(email || '').toLowerCase()
  return salesList_().filter(function (s) { return s.email === key })[0] || null
}

/** Sales phụ trách 1 dòng khách */
function salesSender_(r) {
  const name = clean_(r.sales)
  if (!name) throw new Error('dòng chưa có ' + COL.sales)
  const s = salesByName_(name)
  if (!s || !s.email) throw new Error('chưa có email Sales của "' + name + '" trong tab ' + SALES_TAB)
  if (parseEmails_(s.email).length !== 1) throw new Error('email Sales của "' + name + '" sai định dạng: ' + s.email)
  if (!isActivated_(s.email)) {
    throw new Error('Sales ' + s.name + ' (' + s.email + ') chưa kích hoạt gửi email — mở menu ' + MENU_NAME + ' → Kích hoạt gửi bằng email của tôi')
  }
  return s
}

function setSalesStatus_(row, text) {
  salesSheet_().getRange(row, 3, 1, 2).setValues([[text, text ? nowText_() : '']])
}

function salesStatusText_(s) {
  if (!s.email) return 'Chưa có email — điền cột B'
  if (parseEmails_(s.email).length !== 1) return 'Email sai định dạng'
  if (isActivated_(s.email)) return SALES_READY + ' (' + prop_(activeKey_(s.email)) + ')'
  return 'Chưa kích hoạt — Sales mở sheet → menu ' + MENU_NAME + ' → Kích hoạt gửi bằng email của tôi'
}

/**
 * (Quản trị, senderMode 'sales') Thêm tên Sales mới từ tab danh sách, chia sẻ thư mục sự kiện cho email Sales
 * (khi có thiệp), cập nhật trạng thái. Trả về { total, ready }
 */
function refreshSalesSheet_() {
  const sh = salesSheet_()
  const data = dataSheet_()
  const salesCol = cols_(data).sales
  const lastData = data.getLastRow()
  const names = {}
  if (lastData >= FIRST_DATA_ROW) {
    data.getRange(FIRST_DATA_ROW, salesCol, lastData - FIRST_DATA_ROW + 1, 1).getValues().forEach(function (v) {
      const name = clean_(v[0])
      if (name && !names[norm_(name)]) names[norm_(name)] = name
    })
  }
  const listed = {}
  salesList_().forEach(function (s) { listed[norm_(s.name)] = true })
  const added = Object.keys(names).filter(function (k) { return !listed[k] }).map(function (k) { return [names[k]] })
  if (added.length) sh.getRange(sh.getLastRow() + 1, 1, added.length, 1).setValues(added)

  const list = salesList_()
  if (SETTINGS.cardEnabled) {
    shareWorkFolder_(list.map(function (s) { return s.email }).filter(function (e) { return parseEmails_(e).length === 1 }))
  }
  let ready = 0
  list.forEach(function (s) {
    const text = salesStatusText_(s)
    if (text.indexOf(SALES_READY) === 0) ready++
    setSalesStatus_(s.row, text)
  })
  return { total: list.length, ready: ready }
}

/** Sales tạo thiệp dưới tài khoản của mình → cần quyền sửa thư mục sự kiện. Chia sẻ không gửi email thông báo */
function shareWorkFolder_(emails) {
  const folderId = workFolder_().getId()
  const has = {}
  const perms = Drive.Permissions.list(folderId, { fields: 'permissions(emailAddress,role)' }).permissions || []
  perms.forEach(function (p) { has[String(p.emailAddress || '').toLowerCase()] = p.role })
  emails.forEach(function (email) {
    if (has[email] === 'writer' || has[email] === 'owner') return
    try {
      Drive.Permissions.create({ role: 'writer', type: 'user', emailAddress: email }, folderId, { sendNotificationEmail: false })
      log_('FOLDER_SHARED', {}, 'Chia sẻ thư mục sự kiện cho ' + email)
    } catch (e) {
      log_('FOLDER_SHARE_ERROR', {}, email + ': ' + errMsg_(e))
    }
  })
}

/** Sales tự gắn tên của mình với email đang đăng nhập (khi quản trị chưa điền) */
function claimSalesName_(name, me) {
  const s = salesByName_(name)
  if (!s) {
    // Chỉ đọc tab danh sách (không gọi Drive — Sales có thể chưa được chia sẻ thư mục)
    const data = dataSheet_()
    const col = cols_(data).sales
    const last = data.getLastRow()
    const found = last < FIRST_DATA_ROW ? null : data.getRange(FIRST_DATA_ROW, col, last - FIRST_DATA_ROW + 1, 1).getValues()
      .map(function (v) { return clean_(v[0]) })
      .filter(function (n) { return n && norm_(n) === norm_(name) })[0]
    if (!found) throw new Error('Không tìm thấy "' + name + '" trong cột ' + COL.sales + ' của tab ' + dataTabName_())
    const sh = salesSheet_()
    sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setValues([[found, me]])
    return salesByName_(found)
  }
  if (s.email && s.email !== me) throw new Error('Tên "' + s.name + '" đang gắn với email ' + s.email + ' — liên hệ quản trị')
  salesSheet_().getRange(s.row, 2).setValue(me)
  s.email = me
  return s
}

/** Menu (chạy bằng tài khoản Sales đang mở sheet): bật gửi email cho khách của mình từ hộp thư của mình */
function menuActivateMySending() {
  const ui = SpreadsheetApp.getUi()
  try {
    if (!isSalesMode_()) throw new Error('Sự kiện này gửi từ hộp thư chung, Sales không cần kích hoạt')
    const me = String(Session.getActiveUser().getEmail() || '').toLowerCase()
    if (!me) throw new Error('Không xác định được email của bạn')
    let s = salesByEmail_(me)
    if (!s) {
      const res = ui.prompt('Kích hoạt gửi email', 'Nhập tên của bạn đúng như cột "' + COL.sales + '" trên sheet:', ui.ButtonSet.OK_CANCEL)
      if (res.getSelectedButton() !== ui.Button.OK) return
      s = claimSalesName_(clean_(res.getResponseText()), me)
    }
    if (SETTINGS.cardEnabled) {
      try {
        DriveApp.getFolderById(requireProp_('FOLDER_ID')).getName()
        DriveApp.getFileById(requireProp_('CARD_TEMPLATE_ID')).getName()
      } catch (e) {
        throw new Error('Bạn chưa có quyền vào thư mục thiệp mời — nhờ quản trị chạy menu "Cập nhật danh sách Sales + chia sẻ thư mục" rồi kích hoạt lại')
      }
    }
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'processQueue') ScriptApp.deleteTrigger(t)
    })
    ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(1).create()
    setProp_(activeKey_(me), nowText_())
    setSalesStatus_(s.row, salesStatusText_(s))
    log_('SALES_ACTIVATED', {}, s.name + ' – ' + me, me)
    ui.alert(
      'Đã kích hoạt. Email cho khách của ' + s.name + ' sẽ gửi từ hộp thư ' + me + ' (trong 1–2 phút sau khi tick "Gửi Email").' +
      (isTestMode_() ? '\n\nHệ thống đang ở chế độ TEST: email thử chỉ gửi về chính hộp thư của bạn.' : '')
    )
  } catch (e) {
    ui.alert('Lỗi: ' + errMsg_(e))
  }
}

/** Menu: Sales tắt gửi email từ hộp thư của mình */
function menuDeactivateMySending() {
  const ui = SpreadsheetApp.getUi()
  const me = String(Session.getActiveUser().getEmail() || '').toLowerCase()
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processQueue') ScriptApp.deleteTrigger(t)
  })
  PropertiesService.getScriptProperties().deleteProperty(activeKey_(me))
  const s = salesByEmail_(me)
  if (s) setSalesStatus_(s.row, salesStatusText_(s))
  log_('SALES_DEACTIVATED', {}, me, me)
  ui.alert('Đã tắt gửi email từ hộp thư ' + me + '. Các dòng của bạn tick "Gửi Email" sẽ báo lỗi cho tới khi kích hoạt lại.')
}

/**
 * senderMode 'shared': chỉ cho chạy setup() bằng đúng hộp thư đã chốt (SETTINGS.sharedSender).
 * Người chạy setup() trở thành người gửi — chạy nhầm tài khoản khác sẽ âm thầm đổi hộp thư gửi.
 */
function checkSharedSender_(me) {
  me = String(me || '').toLowerCase()
  const want = String(SETTINGS.sharedSender || '').toLowerCase()
  if (!me) throw new Error('Không đọc được email tài khoản đang chạy — chạy setup() trong Apps Script editor bằng ' + (want || 'hộp thư chung'))
  if (want && me !== want) {
    throw new Error('Chế độ hộp thư chung: phải chạy setup() khi đăng nhập ' + want + ' (đang là ' + me + '). ' +
      'Mở Apps Script editor bằng đúng tài khoản đó rồi chạy lại.')
  }
  return me
}

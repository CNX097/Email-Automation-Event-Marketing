/**
 * Chạy setup() MỘT LẦN trong Apps Script editor (chạy lại bất cứ lúc nào cũng an toàn — chỉ bổ sung phần còn thiếu):
 *  - senderMode 'sales' : chạy bằng tài khoản quản trị (KHÔNG gửi email); mỗi Sales tự kích hoạt gửi (Sales.gs)
 *  - senderMode 'shared': chạy bằng CHÍNH hộp thư chung sẽ gửi email
 * Việc setup() làm: nhóm cột "AUTO – Email xác nhận", tab LOG_EMAIL (+ SALES_EMAIL), thư mục Drive, khóa ký mã xác nhận,
 * Google Form ghi nhận phản hồi + link 1 lần bấm, trigger onSheetEdit / onConfirmSubmit (+ processQueue nếu tài khoản này gửi email).
 * Thiệp (nếu bật): chạy thêm createCardTemplate(...) hoặc useCardTemplate(...) — xem Card.gs.
 */

const HANDLERS = ['processQueue', 'onSheetEdit', 'onConfirmSubmit']

function setup() {
  // shared: chặn chạy nhầm tài khoản (người chạy setup() = người gửi) trước khi ghi bất cứ gì
  const sharedMe = isSalesMode_() ? null : checkSharedSender_(Session.getEffectiveUser().getEmail())
  setProp_('SHEET_ID', SpreadsheetApp.getActive().getId())
  if (!prop_('SECRET')) setProp_('SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''))
  if (prop_('TEST_MODE') === null) setProp_('TEST_MODE', 'true')
  if (sharedMe) setProp_('SHARED_SENDER', sharedMe)

  const added = ensureColumns_(dataSheet_())
  logSheet_()
  const sales = isSalesMode_() ? refreshSalesSheet_() : null
  workFolder_()
  ensureForm_()
  installTriggers()

  console.log('✅ Hoàn tất. Thêm ' + added + ' cột vào tab ' + dataTabName_() + '.' +
    (sales ? ' Sales đã kích hoạt: ' + sales.ready + '/' + sales.total + ' (tab ' + SALES_TAB + ')' : ' Gửi từ hộp thư chung: ' + prop_('SHARED_SENDER')))
  if (SETTINGS.cardEnabled && !prop_('CARD_TEMPLATE_ID')) {
    console.warn('⚠️ Chưa có mẫu thiệp — chạy createCardTemplate(<PNG>, <PPTX>) hoặc useCardTemplate(<ID Slides>) rồi previewCards()')
  }
  console.log(statusText_())
}

/**
 * Trigger xử lý sheet + phản hồi của tài khoản đang chạy. processQueue cũ bị xóa rồi cài lại nếu tài khoản này
 * là người gửi email (hộp thư chung, hoặc Sales đã kích hoạt) — để không mất trigger gửi của chính mình
 */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (HANDLERS.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss_()).onEdit().create()
  ScriptApp.newTrigger('onConfirmSubmit').forForm(requireProp_('FORM_ID')).onFormSubmit().create()
  const sends = canSendAs_(Session.getEffectiveUser().getEmail().toLowerCase())
  if (sends) ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(1).create()
  console.log('Đã cài trigger: onSheetEdit, onConfirmSubmit' + (sends ? ', processQueue (tài khoản này gửi email)' : ''))
}

/**
 * Trigger cài đặt (installable) khi sheet được sửa — chạy bằng tài khoản đã chạy setup.
 * Tick "Gửi Email" → ghi "Chờ gửi" để thấy ngay; processQueue của người gửi sẽ gửi trong 1–2 phút.
 * Bỏ tick khi chưa gửi → xóa "Chờ gửi".
 */
function onSheetEdit(e) {
  if (!e || !e.range) return
  const sh = e.range.getSheet()
  if (sh.getName() !== dataTabName_() || e.range.getLastRow() < FIRST_DATA_ROW) return
  try {
    const c = cols_(sh)
    if (c.send < e.range.getColumn() || c.send > e.range.getLastColumn()) return
    const from = Math.max(e.range.getRow(), FIRST_DATA_ROW)
    const n = e.range.getLastRow() - from + 1
    const sends = sh.getRange(from, c.send, n, 1).getValues()
    const statuses = sh.getRange(from, c.status, n, 1).getDisplayValues()
    const actor = (e.user && e.user.getEmail && e.user.getEmail()) || 'Người sửa sheet'
    for (let i = 0; i < n; i++) {
      const status = clean_(statuses[i][0])
      if (sends[i][0] === true && status === '') {
        const r = readRow_(sh, c, from + i)
        try {
          sender_(r) // báo ngay nếu Sales chưa có email / chưa kích hoạt gửi
        } catch (err) {
          setCell_(sh, from + i, c.status, STATUS.error + errMsg_(err))
          log_('SEND_ERROR', r, errMsg_(err), actor)
          continue
        }
        setCell_(sh, from + i, c.status, STATUS.queued)
        log_('QUEUED', r, 'Tick "Gửi Email"', actor)
      } else if (sends[i][0] !== true && status === STATUS.queued) {
        setCell_(sh, from + i, c.status, '')
        log_('UNQUEUED', readRow_(sh, c, from + i), 'Bỏ tick trước khi gửi', actor)
      }
    }
  } catch (err) {
    console.error('onSheetEdit lỗi: ' + errMsg_(err))
  }
}

// ---------------------------------------------------------------- Menu trên sheet

function onOpen() {
  const menu = SpreadsheetApp.getUi().createMenu(MENU_NAME)
  if (isSalesMode_()) {
    menu.addItem('Kích hoạt gửi bằng email của tôi (Sales)', 'menuActivateMySending')
      .addItem('Tắt gửi bằng email của tôi', 'menuDeactivateMySending')
      .addSeparator()
  }
  menu.addItem('Gửi thử dòng đang chọn tới email của tôi', 'menuTestSend')
  if (SETTINGS.cardEnabled) menu.addItem('Tạo / xem thiệp dòng đang chọn', 'menuRenderCard')
  menu.addSeparator()
  if (isSalesMode_()) menu.addItem('Cập nhật danh sách Sales + chia sẻ thư mục (quản trị)', 'menuRefreshSales')
  menu.addItem('Bật / tắt chế độ TEST', 'menuToggleTest')
    .addItem('Mở LOG', 'menuOpenLog')
    .addItem('Kiểm tra cài đặt', 'menuStatus')
    .addToUi()
}

function activeRow_() {
  const sh = SpreadsheetApp.getActiveSheet()
  if (sh.getName() !== dataTabName_()) throw new Error('Hãy chọn 1 dòng khách ở tab ' + dataTabName_())
  const row = sh.getActiveRange().getRow()
  if (row < FIRST_DATA_ROW) throw new Error('Hãy chọn 1 dòng khách (từ dòng ' + FIRST_DATA_ROW + ' trở xuống)')
  return { sh: sh, row: row }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) throw new Error('Hệ thống đang gửi email, thử lại sau 1–2 phút')
  try {
    return fn()
  } finally {
    lock.releaseLock()
  }
}

/** Gửi bản thử của dòng đang chọn từ hộp thư người bấm tới chính người đó (không đổi trạng thái dòng) */
function menuTestSend() {
  const ui = SpreadsheetApp.getUi()
  try {
    if (!ready_()) throw new Error('Chưa cài đặt xong — xem "Kiểm tra cài đặt"')
    const a = activeRow_()
    const me = Session.getActiveUser().getEmail()
    if (!me) throw new Error('Không xác định được email của bạn')
    const ok = withLock_(function () {
      const c = cols_(a.sh)
      const r = readRow_(a.sh, c, a.row)
      sender_(r) // báo lý do ngay nếu người gửi của dòng này chưa sẵn sàng
      return sendRow_(a.sh, c, r, me, { keepStatus: true, actor: me })
    })
    ui.alert(ok ? 'Đã gửi bản thử của dòng ' + a.row + ' tới ' + me : 'Gửi thử bị lỗi — xem tab ' + LOG_TAB)
  } catch (e) {
    ui.alert('Lỗi: ' + errMsg_(e))
  }
}

function menuRenderCard() {
  const ui = SpreadsheetApp.getUi()
  try {
    const a = activeRow_()
    const url = withLock_(function () {
      const c = cols_(a.sh)
      const r = readRow_(a.sh, c, a.row)
      const name = displayName_(r)
      if (!name) throw new Error('Dòng ' + a.row + ' chưa có Họ tên KH / Tên in thiệp')
      ensureKey_(a.sh, c, r)
      const file = saveCard_(renderCard_(name), r.key, name)
      a.sh.getRange(r.row, c.cardLink).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText('Xem thiệp').setLinkUrl(file.getUrl()).build()
      )
      log_('CARD_CREATED', r, file.getUrl(), Session.getActiveUser().getEmail())
      return file.getUrl()
    })
    ui.showModelessDialog(
      HtmlService.createHtmlOutput('<p style="font-family:Arial">Đã tạo thiệp: <a href="' + esc_(url) + '" target="_blank">mở ảnh</a></p>').setWidth(360).setHeight(90),
      'Thiệp mời'
    )
  } catch (e) {
    ui.alert('Lỗi: ' + errMsg_(e))
  }
}

function menuToggleTest() {
  const ui = SpreadsheetApp.getUi()
  const next = !isTestMode_()
  if (!next) {
    const ok = ui.alert('Tắt chế độ TEST?', 'Email sẽ gửi THẬT tới khách cho mọi dòng đã tick "Gửi Email" mà "Trạng thái email" đang trống / "Chờ gửi".', ui.ButtonSet.OK_CANCEL)
    if (ok !== ui.Button.OK) return
  }
  setProp_('TEST_MODE', next ? 'true' : 'false')
  log_(next ? 'TEST_MODE_ON' : 'TEST_MODE_OFF', {}, '', Session.getActiveUser().getEmail())
  ui.alert(
    next
      ? 'Đã BẬT chế độ TEST: email thử chỉ gửi về chính hộp thư đang gửi, bấm nút trong bản thử chỉ ghi LOG + ô "KH phản hồi" (kèm [TEST]).'
      : 'Đã TẮT chế độ TEST: email gửi THẬT tới khách. Dòng đang "TEST đã gửi" sẽ không tự gửi thật — xóa ô "Trạng thái email" của dòng đó để gửi.'
  )
}

function menuRefreshSales() {
  const ui = SpreadsheetApp.getUi()
  try {
    const res = refreshSalesSheet_()
    SpreadsheetApp.getActive().setActiveSheet(salesSheet_())
    ui.alert(
      'Sales đã kích hoạt: ' + res.ready + '/' + res.total + '.\n\n' +
      'Sales chưa sẵn sàng: điền email ở cột B rồi chạy lại menu này' + (SETTINGS.cardEnabled ? ' (để chia sẻ thư mục thiệp)' : '') +
      ', sau đó nhờ Sales mở sheet → menu ' + MENU_NAME + ' → "Kích hoạt gửi bằng email của tôi" và cấp quyền.'
    )
  } catch (e) {
    ui.alert('Lỗi: ' + errMsg_(e))
  }
}

function menuOpenLog() {
  SpreadsheetApp.getActive().setActiveSheet(logSheet_())
}

function menuStatus() {
  SpreadsheetApp.getUi().alert(statusText_())
}

function statusText_() {
  const triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction() })
  const lines = [
    'Sự kiện: ' + EVENT.name + ' — ' + EVENT.timeText,
    'Chế độ: ' + (isTestMode_() ? 'TEST (email thử về chính hộp thư đang gửi)' : 'GỬI THẬT'),
    'Tab danh sách: ' + dataTabName_(),
    'Người gửi: ' + (isSalesMode_()
      ? 'hộp thư của từng Sales phụ trách (tab ' + SALES_TAB + ', Sales tự kích hoạt)'
      : 'hộp thư chung ' + (prop_('SHARED_SENDER') || 'CHƯA CÀI — chạy setup() bằng hộp thư chung')),
    'Form ghi nhận phản hồi: ' + (prop_('FORM_ID') ? 'https://docs.google.com/forms/d/' + prop_('FORM_ID') + '/edit' : 'CHƯA CÓ'),
    'Link 1 lần bấm: ' + (prop_('FORM_SUBMIT_YES') && prop_('FORM_SUBMIT_NO') ? 'OK' : 'CHƯA CÓ — chạy setup()'),
    'Thư mục sự kiện: ' + (prop_('FOLDER_ID') ? 'https://drive.google.com/drive/folders/' + prop_('FOLDER_ID') : 'CHƯA CÓ'),
  ]
  if (SETTINGS.cardEnabled) {
    lines.push('Slides mẫu thiệp: ' + (prop_('CARD_TEMPLATE_ID') ? 'https://docs.google.com/presentation/d/' + prop_('CARD_TEMPLATE_ID') + '/edit' : 'CHƯA CÓ — chạy createCardTemplate / useCardTemplate'))
  }
  lines.push('Trigger của tài khoản này: ' + (triggers.join(', ') || 'CHƯA CÀI'))
  lines.push('Hạn mức email còn lại hôm nay (tài khoản này): ' + MailApp.getRemainingDailyQuota())
  return lines.join('\n')
}

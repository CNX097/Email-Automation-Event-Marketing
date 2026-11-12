/**
 * Xác nhận tham dự 1 lần bấm qua Google Form (Workspace chặn Web App công khai nên không dùng trang riêng).
 * Nút trong email là link gửi thẳng form: …/formResponse?entry.<lựa chọn>=…&entry.<mã>=<Mã xác nhận>&submit=Submit
 * → Google ghi nhận ngay và hiện lời cảm ơn của form, khách không phải điền hay bấm "Gửi".
 * Trigger onConfirmSubmit kiểm tra chữ ký Mã xác nhận, lọc lượt bấm nghi do bộ quét link rồi cập nhật sheet + LOG.
 *
 * Chống bộ quét link (Outlook Safe Links, Mimecast, Proofpoint… tự mở MỌI link trong email ngay khi nhận):
 *  - Mọi lượt bấm đều ghi LOG.
 *  - Lượt bấm trong SCAN_EARLY_MS đầu tiên sau khi gửi email → nghi bộ quét, không đổi cột xác nhận / không tham dự.
 *  - Bấm cả 2 nút trong vòng SCAN_PAIR_MS → nghi bộ quét, không đổi cột xác nhận / không tham dự (lượt trước đó đã ghi thì khôi phục như cũ).
 *  - Trường hợp nghi: "KH phản hồi" = "Cần kiểm tra – …" để Sales gọi xác nhận.
 *    Khách bấm lại 1 nút sau khoảng chờ → ghi nhận bình thường.
 */

const FORM_CHOICE_TITLE = 'Anh/Chị có tham dự sự kiện không?' // giữ cố định: script tìm câu hỏi theo tiêu đề
const FORM_NOTE_TITLE = 'Ghi chú cho Ban tổ chức (nếu có)'
const FORM_CODE_TITLE = 'Mã xác nhận'
const CHOICE_YES = 'Có, tôi sẽ tham dự'
const CHOICE_NO = 'Rất tiếc, tôi không thể tham dự'
const CODE_TOKEN = 'MAXACNHAN'
const BUTTON_LABEL = { yes: 'Xác nhận tham dự', no: 'Không thể tham dự' }
const REPLY_LABEL = { yes: 'Đã xác nhận', no: 'Không tham dự' }
const SCAN_EARLY_MS = 30 * 1000 // bộ quét thường mở link vài giây sau khi email tới; khách đang nghe máy Sales có thể bấm ngay sau đó
const SCAN_PAIR_MS = 3 * 60 * 1000 // bộ quét mở cả 2 nút gần như cùng lúc; người thật hiếm khi đổi ý trong 3 phút
const HITS_KEEP = 20
const RESPONSE_ACTOR = 'Khách (nút email)'
const TEST_REPLY_TAG = '[TEST]'

/** Tạo form (nếu chưa có) và lưu mẫu link 1 lần bấm */
function ensureForm_() {
  let form = null
  const id = prop_('FORM_ID')
  if (id) {
    try {
      form = FormApp.openById(id)
    } catch (e) {
      console.warn('Không mở được form cũ, tạo form mới: ' + errMsg_(e))
    }
  }
  if (!form) {
    form = FormApp.create(EVENT.name + ' – Xác nhận tham dự')
    form.addMultipleChoiceItem().setTitle(FORM_CHOICE_TITLE).setChoiceValues([CHOICE_YES, CHOICE_NO]).setRequired(true)
    form.addParagraphTextItem().setTitle(FORM_NOTE_TITLE).setHelpText('Ví dụ: người tham dự thay, số người đi cùng…')
    form.addTextItem().setTitle(FORM_CODE_TITLE).setHelpText('Đã điền sẵn — vui lòng không sửa.').setRequired(true)
    DriveApp.getFileById(form.getId()).moveTo(workFolder_())
    setProp_('FORM_ID', form.getId())
  }
  // Áp dụng lại mỗi lần chạy setup() để sửa nội dung form không cần tạo form mới.
  // Tiêu đề + lời cảm ơn là trang khách thấy sau khi bấm nút → viết chung cho cả 2 lựa chọn
  form
    .setTitle(EVENT.name + ' – Phản hồi thư mời')
    .setDescription(
      '📅 ' + EVENT.timeText + '\n📍 ' + EVENT.place +
      '\n\n' + pronoun_(true) + ' chỉ cần bấm nút "Xác nhận tham dự" hoặc "Không thể tham dự" trong email mời — phản hồi được ghi nhận ngay.'
    )
    .setCollectEmail(false)
    .setRequireLogin(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setConfirmationMessage(
      'Cảm ơn ' + pronoun_() + ' đã phản hồi! Ban tổ chức đã ghi nhận lựa chọn của ' + pronoun_() + '.\n\n' +
      'Thông tin chương trình: ' + EVENT.timeText + ' tại ' + EVENT.place + '.\n\n' +
      'Muốn đổi lựa chọn, ' + pronoun_() + ' chỉ cần bấm nút còn lại trong email mời. ' + (EVENT.hotline ? 'Hỗ trợ: ' + EVENT.hotline + '.' : '')
    )
  setProp_('FORM_SUBMIT_YES', oneClickTemplate_(form, CHOICE_YES))
  setProp_('FORM_SUBMIT_NO', oneClickTemplate_(form, CHOICE_NO))
  return form
}

function formItem_(form, title) {
  const items = form.getItems()
  for (let i = 0; i < items.length; i++) {
    if (items[i].getTitle() === title) return items[i]
  }
  throw new Error('Form thiếu câu hỏi "' + title + '"')
}

/**
 * Link gửi thẳng form với Mã xác nhận là CODE_TOKEN — mỗi email thay token bằng mã thật.
 * Lấy entry id từ link điền sẵn của Google, đổi /viewform → /formResponse và thêm submit=Submit.
 */
function oneClickTemplate_(form, choice) {
  const prefill = form.createResponse()
    .withItemResponse(formItem_(form, FORM_CHOICE_TITLE).asMultipleChoiceItem().createResponse(choice))
    .withItemResponse(formItem_(form, FORM_CODE_TITLE).asTextItem().createResponse(CODE_TOKEN))
    .toPrefilledUrl()
  const entries = String(prefill.split('?')[1] || '').split('&').filter(function (p) { return /^entry\.\d+=/.test(p) })
  const base = form.getPublishedUrl().replace(/\/viewform.*$/, '/formResponse')
  if (entries.length !== 2 || entries.join('&').indexOf(CODE_TOKEN) < 0 || base.indexOf('/formResponse') < 0) {
    throw new Error('Không dựng được link 1 lần bấm từ link điền sẵn: ' + prefill)
  }
  return base + '?' + entries.join('&') + '&submit=Submit'
}

/** Mã xác nhận: SUM26-0007.<chữ ký>, bản thử: SUM26-0007.T.<chữ ký> */
function makeCode_(key, test) {
  return key + (test ? '.T' : '') + '.' + sign_(key, test)
}

function parseCode_(code) {
  const parts = String(code || '').trim().split('.')
  const test = parts.length === 3 && parts[1] === 'T'
  if (parts.length !== (test ? 3 : 2)) return null
  const key = parts[0]
  return verify_(key, parts[parts.length - 1], test) ? { key: key, test: test } : null
}

function confirmUrl_(key, test, choice) {
  const tpl = requireProp_(choice === 'no' ? 'FORM_SUBMIT_NO' : 'FORM_SUBMIT_YES')
  return tpl.split(CODE_TOKEN).join(encodeURIComponent(makeCode_(key, test)))
}

/** Trigger cài đặt khi form nhận phản hồi (khách bấm nút trong email) */
function onConfirmSubmit(e) {
  // Khóa riêng của luồng phản hồi (processQueue giữ ScriptLock tới vài phút khi gửi hàng loạt)
  const lock = LockService.getUserLock()
  let locked = false
  try {
    const answers = {}
    e.response.getItemResponses().forEach(function (ir) {
      answers[ir.getItem().getTitle()] = ir.getResponse()
    })
    const code = clean_(answers[FORM_CODE_TITLE])
    const note = clean_(answers[FORM_NOTE_TITLE])
    const choice = answers[FORM_CHOICE_TITLE] === CHOICE_NO ? 'no' : 'yes'
    const at = e.response.getTimestamp().getTime()
    const parsed = parseCode_(code)
    if (!parsed) {
      log_('INVALID_RESPONSE', {}, 'Mã xác nhận không hợp lệ: "' + code + '" · Nút: ' + BUTTON_LABEL[choice] + (note ? ' · Ghi chú: ' + note : ''), RESPONSE_ACTOR)
      return
    }
    locked = lock.tryLock(60000)
    if (!locked) throw new Error('Không lấy được khóa xử lý phản hồi (' + parsed.key + ', ' + BUTTON_LABEL[choice] + ')')
    recordResponse_(parsed.key, parsed.test, choice, note, at)
  } catch (err) {
    console.error('onConfirmSubmit lỗi: ' + errMsg_(err))
    log_('RESPONSE_ERROR', {}, errMsg_(err), RESPONSE_ACTOR)
  } finally {
    if (locked) lock.releaseLock()
  }
}

/**
 * Ghi 1 lượt bấm vào sheet. Bản thử: chạy đúng logic trên bản mô phỏng (lưu trong Script Properties),
 * ghi kết quả "nếu là email thật" vào LOG + ô "KH phản hồi" (kèm [TEST]), không đổi cột xác nhận / không tham dự.
 */
function recordResponse_(key, test, choice, note, at) {
  at = at || Date.now()
  const sh = dataSheet_()
  const c = cols_(sh)
  const row = findRowByKey_(sh, c, key)
  if (!row) {
    log_('INVALID_RESPONSE', { key: key }, 'Không tìm thấy Mã KH trên sheet · Nút: ' + BUTTON_LABEL[choice] + (note ? ' · Ghi chú: ' + note : ''), RESPONSE_ACTOR)
    return
  }
  const r = readRow_(sh, c, row)
  const store = loadHits_(key, test)
  const sentAt = Number(prop_(sentPropKey_(key, test), 0)) || 0
  const hit = { at: at, choice: choice }
  const reason = scanReason_(hit, store.hits, sentAt)
  store.hits.push(hit)
  store.hits.sort(function (a, b) { return a.at - b.at })
  if (store.hits.length > HITS_KEEP) store.hits = store.hits.slice(-HITS_KEEP)

  const io = rsvpIo_(sh, c, row, test, store)
  const when = timeText_(at)
  const ago = sentAt && at >= sentAt ? ' ' + agoText_(at - sentAt) + ' sau khi gửi email' : ''
  const what = 'Bấm "' + BUTTON_LABEL[choice] + '"' + ago + (note ? ' · Ghi chú: ' + note : '')
  let event = ''
  let detail = ''

  if (!reason) {
    // Bấm lặp cùng nút trong khoảng chờ → giữ trạng thái gốc trước lượt đầu để còn khôi phục được
    const u = store.undo
    const repeat = !!u && u.choice === choice && at - u.at <= SCAN_PAIR_MS
    const before = repeat ? u : io.read()
    store.undo = { at: at, from: repeat ? u.from || u.at : at, choice: choice, n: before.n, r: before.r, label: repeat ? u.label : store.label || '' }
    store.label = REPLY_LABEL[choice] + ' – ' + when + (note ? ' · ' + note : '')
    io.write(choice === 'yes', choice === 'yes' ? '' : true, store.label)
    event = choice === 'yes' ? 'CONFIRMED' : 'DECLINED'
    detail = what
  } else {
    let action = 'không đổi cột xác nhận / không tham dự'
    const u = store.undo
    if (u && u.choice !== choice && Math.abs(at - u.at) <= SCAN_PAIR_MS) {
      // Lượt bấm vừa ghi trước đó cũng thành đáng ngờ → trả 2 cột xác nhận / không tham dự về như trước lượt đó
      store.label = u.label
      store.undo = null
      io.write(u.n, u.r, null)
      action = 'khôi phục cột xác nhận / không tham dự như trước lượt bấm "' + BUTTON_LABEL[u.choice] + '" lúc ' + timeText_(u.from || u.at)
    }
    io.write(null, null,
      'Cần kiểm tra – ' + reason + ' (lượt cuối: "' + BUTTON_LABEL[choice] + '" lúc ' + when + '), có thể do bộ quét link' +
      (store.label ? ' · Đang giữ: ' + store.label : '')
    )
    event = 'SCANNER_SUSPECTED'
    detail = what + ' — nghi bộ quét link (' + reason + ') → ' + action
  }
  saveHits_(key, test, store)

  if (test) {
    const s = store.sim
    const shown = writeTestReply_(sh, c, row, s.z + ' · nếu thật: ' + stateText_(s.n, s.r))
    log_('TEST_' + event, r, detail + '. Bản thử — không đổi cột xác nhận / không tham dự' +
      (shown ? ', ghi ' + TEST_REPLY_TAG + ' vào KH phản hồi' : ', KH phản hồi đang có phản hồi thật nên không ghi') +
      '; nếu là email thật: ' + stateText_(s.n, s.r) + ', KH phản hồi = "' + s.z + '"', RESPONSE_ACTOR)
  } else {
    log_(event, r, detail, RESPONSE_ACTOR)
  }
}

/** '' nếu lượt bấm hợp lệ, ngược lại là lý do nghi do bộ quét link */
function scanReason_(hit, prevHits, sentAt) {
  if (sentAt && hit.at >= sentAt && hit.at - sentAt < SCAN_EARLY_MS) {
    return 'bấm trong ' + agoText_(SCAN_EARLY_MS) + ' đầu sau khi gửi email'
  }
  const other = prevHits.filter(function (h) { return h.choice !== hit.choice && Math.abs(hit.at - h.at) <= SCAN_PAIR_MS })
  if (other.length) return 'bấm cả 2 nút trong vòng ' + Math.round(SCAN_PAIR_MS / 60000) + ' phút'
  return ''
}

/** Đọc / ghi N, R, "KH phản hồi" — bản thử ghi vào bản mô phỏng (khởi tạo từ giá trị thật của dòng) */
function rsvpIo_(sh, c, row, test, store) {
  if (test) {
    if (!store.sim) {
      store.sim = {
        n: sh.getRange(row, c.confirmed).getValue(),
        r: sh.getRange(row, c.declined).getValue(),
        z: sh.getRange(row, c.reply).getDisplayValue(),
      }
    }
    return {
      read: function () { return { n: store.sim.n, r: store.sim.r } },
      write: function (n, r, z) {
        if (n !== null) store.sim.n = n
        if (r !== null) store.sim.r = r
        if (z !== null) store.sim.z = z
      },
    }
  }
  return {
    read: function () {
      return { n: sh.getRange(row, c.confirmed).getValue(), r: sh.getRange(row, c.declined).getValue() }
    },
    write: function (n, r, z) {
      if (n !== null) setCell_(sh, row, c.confirmed, n)
      if (r !== null) setCell_(sh, row, c.declined, r)
      if (z !== null) setCell_(sh, row, c.reply, z)
    },
  }
}

/** Bản thử ghi vào "KH phản hồi" — chỉ khi ô trống hoặc đang là kết quả thử, không đè phản hồi thật */
function writeTestReply_(sh, c, row, text) {
  const cur = clean_(sh.getRange(row, c.reply).getDisplayValue())
  if (cur && cur.indexOf(TEST_REPLY_TAG) !== 0) return false
  setCell_(sh, row, c.reply, TEST_REPLY_TAG + ' ' + text)
  return true
}

/** Gửi email thật → xóa kết quả bản thử còn trong "KH phản hồi" */
function clearTestReply_(sh, c, row) {
  if (clean_(sh.getRange(row, c.reply).getDisplayValue()).indexOf(TEST_REPLY_TAG) === 0) setCell_(sh, row, c.reply, '')
}

// Lịch sử lượt bấm + thời điểm gửi lưu trong Script Properties, tách bản thử (T) và email thật (L)
function hitsPropKey_(key, test) {
  return 'RSVP_' + (test ? 'T_' : 'L_') + key
}

function sentPropKey_(key, test) {
  return 'RSVP_SENT_' + (test ? 'T_' : 'L_') + key
}

/** Gọi ngay trước khi gửi email — mốc tính "bấm quá sớm" */
function markSent_(key, test) {
  setProp_(sentPropKey_(key, test), Date.now())
}

function loadHits_(key, test) {
  try {
    const s = JSON.parse(prop_(hitsPropKey_(key, test), '{}'))
    s.hits = s.hits || []
    return s
  } catch (e) {
    return { hits: [] }
  }
}

function saveHits_(key, test, store) {
  setProp_(hitsPropKey_(key, test), JSON.stringify(store))
}

function timeText_(ms) {
  return Utilities.formatDate(new Date(ms), TZ, 'dd/MM/yyyy HH:mm:ss')
}

function agoText_(ms) {
  const s = Math.round(ms / 1000)
  if (s < 120) return s + ' giây'
  if (s < 2 * 3600) return Math.round(s / 60) + ' phút'
  if (s < 48 * 3600) return Math.round(s / 3600) + ' giờ'
  return Math.round(s / 86400) + ' ngày'
}

function stateText_(n, r) {
  return 'Xác nhận ' + (n === true ? '✓' : '☐') + ', Không tham dự ' + (r === true ? '✓' : '☐')
}

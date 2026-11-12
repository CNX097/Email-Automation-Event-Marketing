/** Hàng đợi gửi email mời + dựng nội dung email */

const SALUTATION_RE = /^(anh|chị|em|ông|bà|cô|chú|quý|bạn|thầy|mr\.?|ms\.?|mrs\.?|miss|dr\.?)[\s/]/i // "Anh/Chị Hường" cũng tính là có danh xưng

/**
 * Trigger mỗi 1 phút. Chạy bằng tài khoản gửi email:
 *  - senderMode 'sales'  : trigger cài riêng cho TỪNG Sales (menu "Kích hoạt gửi bằng email của tôi"), chỉ gửi dòng của Sales đó
 *  - senderMode 'shared' : trigger của hộp thư chung (tài khoản chạy setup()), gửi mọi dòng
 * Gửi các dòng đã tick "Gửi Email" mà "Trạng thái email" đang trống / "Chờ gửi".
 * Dòng "Đã gửi", "TEST đã gửi", "Lỗi: …" bị bỏ qua — xóa ô trạng thái để gửi lại.
 */
function processQueue() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(5000)) return
  const started = Date.now()
  try {
    if (!ready_()) return
    const me = Session.getEffectiveUser().getEmail().toLowerCase()
    if (!canSendAs_(me)) return // tài khoản này không phải người gửi đã kích hoạt → không gửi gì
    const sh = dataSheet_()
    const c = cols_(sh)
    syncCheckboxes_(sh, c)
    const rows = readRows_(sh, c).filter(function (r) {
      if (!r.send || !(r.status === '' || r.status === STATUS.queued || r.status === STATUS.sending)) return false
      if (!isSalesMode_()) return true
      const s = salesByName_(r.sales)
      return !!s && s.email === me
    })
    const testTo = isTestMode_() ? me : null // chế độ TEST: email thử về chính hộp thư đang gửi
    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started > MAX_RUN_MS) break
      const r = rows[i]
      if (r.status === STATUS.sending) {
        // Lần chạy trước dừng giữa chừng — không tự gửi lại để khách không nhận 2 email
        setCell_(sh, r.row, c.status, STATUS.error + 'không rõ đã gửi chưa, xem LOG rồi xóa ô này để gửi lại')
        log_('SEND_ERROR', r, 'Lần chạy trước dừng khi đang gửi')
        continue
      }
      if (MailApp.getRemainingDailyQuota() < 1) {
        console.warn('Hết hạn mức gửi email hôm nay — các dòng còn lại sẽ gửi vào ngày mai')
        break
      }
      sendRow_(sh, c, r, testTo)
    }
  } catch (e) {
    console.error('processQueue lỗi: ' + errMsg_(e) + (e && e.stack ? '\n' + e.stack : ''))
  } finally {
    lock.releaseLock()
  }
}

function ready_() {
  const need = ['SECRET', 'FORM_SUBMIT_YES', 'FORM_SUBMIT_NO'].concat(SETTINGS.cardEnabled ? ['CARD_TEMPLATE_ID'] : [])
  const missing = need.filter(function (k) { return !prop_(k) })
  if (missing.length) {
    console.warn('Chưa sẵn sàng gửi, thiếu Script Property: ' + missing.join(', '))
    return false
  }
  return true
}

/** Tài khoản đang chạy có được gửi email không */
function canSendAs_(me) {
  if (!isSalesMode_()) return !!me && me === String(prop_('SHARED_SENDER', '')).toLowerCase()
  return !!salesByEmail_(me) && isActivated_(me)
}

/**
 * Tạo thiệp (nếu bật) + gửi email cho 1 dòng từ hộp thư của tài khoản đang chạy. Gọi khi đang giữ ScriptLock.
 *   testTo            có giá trị → gửi bản thử tới địa chỉ này (nút phản hồi ở chế độ thử, không tick cột "đã mời")
 *   opts.keepStatus   true → không ghi gì vào dòng khách ngoài Mã KH (dùng cho "Gửi thử" từ menu)
 *   opts.actor        người thao tác ghi vào LOG
 */
function sendRow_(sh, c, r, testTo, opts) {
  opts = opts || {}
  const test = !!testTo
  const emails = parseEmails_(r.email)
  const display = displayName_(r)
  if (!emails.length || !display) {
    const why = !emails.length ? 'thiếu hoặc sai Email KH' : 'thiếu Họ tên KH'
    if (!opts.keepStatus) setCell_(sh, r.row, c.status, STATUS.error + why)
    log_('SEND_ERROR', r, why, opts.actor)
    return false
  }
  let sender
  try {
    sender = sender_(r)
    const me = Session.getEffectiveUser().getEmail().toLowerCase()
    if (!test && sender.email !== me) throw new Error('chỉ ' + sender.email + ' mới gửi được dòng này (đang chạy bằng ' + me + ')')
  } catch (e) {
    if (!opts.keepStatus) setCell_(sh, r.row, c.status, STATUS.error + errMsg_(e))
    log_('SEND_ERROR', r, errMsg_(e), opts.actor)
    return false
  }
  ensureKey_(sh, c, r)
  if (!opts.keepStatus) {
    setCell_(sh, r.row, c.status, STATUS.sending)
    SpreadsheetApp.flush()
  }
  try {
    let card = null
    if (SETTINGS.cardEnabled) {
      card = renderCard_(display)
      const file = saveCard_(card, r.key, display)
      if (!opts.keepStatus) {
        sh.getRange(r.row, c.cardLink).setRichTextValue(
          SpreadsheetApp.newRichTextValue().setText('Xem thiệp').setLinkUrl(file.getUrl()).build()
        )
      }
      log_('CARD_CREATED', r, file.getUrl(), opts.actor)
    }

    const to = test ? testTo : emails.join(',')
    markSent_(r.key, test) // mốc "bấm quá sớm" của bộ lọc quét link — ghi trước khi gửi để không lỡ lượt quét đầu tiên
    const mail = {
      to: to,
      subject: (test ? '[TEST] ' : '') + EVENT.subject,
      htmlBody: buildEmailHtml_(r.key, display, test, emails, sender),
      body: buildEmailText_(r.key, display, test),
      name: senderDisplayName_(sender),
    }
    if (card) mail.inlineImages = { thiep: card }
    if (SETTINGS.replyTo) mail.replyTo = SETTINGS.replyTo
    MailApp.sendEmail(mail)

    if (!opts.keepStatus) {
      setCell_(sh, r.row, c.status, test ? STATUS.testSent + ' → ' + to : STATUS.sent)
      setCell_(sh, r.row, c.sentAt, nowText_())
      if (!test) {
        setCell_(sh, r.row, c.invited, true)
        clearTestReply_(sh, c, r.row)
      }
    }
    log_(test ? 'TEST_SENT' : 'SENT', r, 'Từ ' + Session.getEffectiveUser().getEmail() + ' tới ' + to + (test ? ' (bản thử; email khách: ' + emails.join(', ') + ')' : ''), opts.actor)
    return true
  } catch (e) {
    if (!opts.keepStatus) setCell_(sh, r.row, c.status, STATUS.error + errMsg_(e))
    log_('SEND_ERROR', r, errMsg_(e), opts.actor)
    return false
  }
}

/** Ô email có thể chứa nhiều địa chỉ (cách nhau bởi dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng) */
function parseEmails_(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(function (s) { return s.trim() })
    .filter(function (s) { return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(s) })
}

function displayName_(r) {
  return r.cardName || r.name
}

/**
 * Lời chào = EVENT.greeting + tên. Tên đã có danh xưng ("Chị Hường", "Ms Vy") giữ nguyên;
 * chưa có → thêm EVENT.salutation ("Nguyễn Thị Thu Hường" → "Kính gửi Quý Anh/Chị Nguyễn Thị Thu Hường").
 * Sự kiện sinh viên: greeting 'Chào', salutation 'bạn' → "Chào bạn Nguyễn Văn A"
 */
function greeting_(name) {
  const prefix = EVENT.greeting === undefined ? 'Kính gửi' : EVENT.greeting
  const sal = EVENT.salutation === undefined ? 'Quý Anh/Chị' : EVENT.salutation
  const who = SALUTATION_RE.test(name) || !sal ? name : sal + ' ' + name
  return (prefix ? prefix + ' ' : '') + who
}

/** Chữ ký Mã xác nhận: HMAC(Mã KH | chế độ) — sửa Mã KH hoặc đổi thử ↔ thật đều không hợp lệ */
function sign_(key, test) {
  const raw = Utilities.computeHmacSha256Signature(key + '|' + (test ? 'T' : 'L'), requireProp_('SECRET'))
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '').replace(/[-_]/g, '').slice(0, 12)
}

function verify_(key, sig, test) {
  return !!key && !!sig && sign_(key, test) === String(sig)
}

/** Dòng trước chữ ký: mặc định 'Trân trọng,'; '' = bỏ */
function regards_() {
  return EVENT.regards === undefined ? 'Trân trọng,' : EVENT.regards
}

/** Đại từ gọi khách trong câu chữ cố định của email / form: 'Anh/Chị' (mặc định), 'bạn', 'Quý khách'… */
function pronoun_(capitalize) {
  const p = EVENT.pronoun || 'Anh/Chị'
  return capitalize ? p.charAt(0).toUpperCase() + p.slice(1) : p
}

function fill_(html, values) {
  return Object.keys(values).reduce(function (out, k) {
    return out.split('{{' + k + '}}').join(values[k])
  }, html)
}

/** Khối <!--TÊN-->…<!--/TÊN--> trong Email.html: giữ (keep = true) hoặc bỏ */
function section_(html, name, keep) {
  const re = new RegExp('<!--' + name + '-->([\\s\\S]*?)<!--/' + name + '-->', 'g')
  return html.replace(re, function (m, inner) { return keep ? inner : '' })
}

/** Khối <!--TÊN-->…<!--/TÊN--> lặp lại cho từng phần tử, điền {{…}} theo fn(phần tử) */
function repeat_(html, name, items, fn) {
  const re = new RegExp('<!--' + name + '-->([\\s\\S]*?)<!--/' + name + '-->', 'g')
  return html.replace(re, function (m, inner) {
    return items.map(function (it) { return fill_(inner, fn(it)) }).join('')
  })
}

function gcalDate_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) throw new Error('EVENT.start / EVENT.end phải dạng yyyy-MM-ddTHH:mm, đang là: ' + iso)
  return m[1] + m[2] + m[3] + 'T' + m[4] + m[5] + '00'
}

/** Link "Thêm vào lịch" Google Calendar */
function calendarUrl_() {
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(EVENT.title) +
    '&dates=' + gcalDate_(EVENT.start) + '%2F' + gcalDate_(EVENT.end) +
    '&ctz=' + encodeURIComponent(TZ) +
    '&location=' + encodeURIComponent(EVENT.place) +
    '&details=' + encodeURIComponent(EVENT.orgName + (EVENT.hotline ? ' · Hotline: ' + EVENT.hotline : ''))
}

function mapUrl_() {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(EVENT.mapQuery || EVENT.place)
}

function buildEmailHtml_(key, display, test, emails, sender) {
  const banner = test
    ? '<div style="max-width:640px;margin:0 auto 12px;background:#fef3c7;color:#92400e;border-radius:8px;padding:10px 14px;font-size:13px">' +
      '<b>BẢN THỬ</b> — email thật sẽ gửi từ ' + esc_(sender.email) + ' tới: ' + esc_(emails.join(', ')) +
      '. Bấm nút trong bản thử chỉ ghi LOG + ô "KH phản hồi" (kèm [TEST]), không đổi cột xác nhận / không tham dự.</div>'
    : ''
  const highlights = EVENT.highlights || []
  const links = EVENT.links || []
  let html = HtmlService.createHtmlOutputFromFile('Email').getContent()
  html = repeat_(html, 'HIGHLIGHT', highlights, function (h) { return { H_TITLE: esc_(h.title), H_TEXT: esc_(h.text) } })
  html = repeat_(html, 'LINK', links, function (l) { return { L_LABEL: esc_(l.label), L_URL: esc_(l.url) } })
  html = section_(html, 'HIGHLIGHTS', highlights.length > 0)
  html = section_(html, 'LINKS', links.length > 0)
  html = section_(html, 'CARD', !!SETTINGS.cardEnabled)
  html = section_(html, 'NOTE', !!EVENT.note)
  html = section_(html, 'REGARDS', !!regards_())
  html = section_(html, 'HOTLINE', !!EVENT.hotline)
  const colors = EVENT.colors || {}
  return fill_(html, {
    C_DARK: esc_(colors.dark || '#1e3a8a'),
    C_ACCENT: esc_(colors.accent || '#2563eb'),
    C_SOFT: esc_(colors.soft || '#eff6ff'),
    C_BORDER: esc_(colors.border || '#bfdbfe'),
    C_PAGE: esc_(colors.page || '#f1f5f9'),
    PREHEADER: esc_(EVENT.preheader || EVENT.subject),
    TEST_BANNER: banner,
    BRAND_LINE: esc_((EVENT.orgName + ' · ' + EVENT.name).toUpperCase()),
    EVENT_TITLE: esc_(EVENT.title),
    GREETING: esc_(greeting_(display)),
    PRONOUN: esc_(pronoun_()),
    INTRO: esc_(EVENT.intro),
    TIME: esc_(EVENT.timeText),
    CAL_URL: esc_(calendarUrl_()),
    PLACE: esc_(EVENT.place),
    MAP_URL: esc_(mapUrl_()),
    CONFIRM_URL: esc_(confirmUrl_(key, test, 'yes')),
    DECLINE_URL: esc_(confirmUrl_(key, test, 'no')),
    CARD_ALT: esc_('Thiệp mời ' + EVENT.name + ' dành cho ' + display),
    HIGHLIGHTS_TITLE: esc_(EVENT.highlightsTitle || ''),
    NOTE: esc_(EVENT.note || ''),
    HOTLINE: esc_(EVENT.hotline || ''),
    CLOSING: esc_(EVENT.closing || ''),
    REGARDS: esc_(regards_()),
    SIGN_OFF: esc_(EVENT.signOff),
  })
}

/** Bản text thuần (trình đọc không hiển thị HTML) — cùng nội dung với Email.html */
function buildEmailText_(key, display, test) {
  const lines = [
    greeting_(display) + ',',
    '',
    EVENT.intro + ' ' + EVENT.title + ':',
    'Thời gian: ' + EVENT.timeText,
    'Địa điểm: ' + EVENT.place,
    '',
  ]
  const highlights = EVENT.highlights || []
  if (highlights.length) {
    if (EVENT.highlightsTitle) lines.push(EVENT.highlightsTitle)
    highlights.forEach(function (h) { lines.push('- ' + h.title + ': ' + h.text) })
    lines.push('')
  }
  lines.push(
    'Vui lòng bấm 1 trong 2 link dưới đây để phản hồi (chỉ cần bấm 1 lần, Ban tổ chức ghi nhận ngay):',
    'Xác nhận tham dự: ' + confirmUrl_(key, test, 'yes'),
    'Không thể tham dự: ' + confirmUrl_(key, test, 'no'),
    ''
  )
  if (EVENT.note) lines.push('Lưu ý: ' + EVENT.note)
  if (EVENT.hotline) lines.push('Liên hệ: ' + EVENT.hotline)
  ;(EVENT.links || []).forEach(function (l) { lines.push(l.label + ': ' + l.url) })
  lines.push('', EVENT.closing || '', '')
  if (regards_()) lines.push(regards_())
  lines.push(EVENT.signOff)
  return lines.join('\n')
}

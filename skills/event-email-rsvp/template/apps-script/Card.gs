/**
 * Thiệp mời theo tên khách (chỉ dùng khi SETTINGS.cardEnabled = true):
 * Google Slides mẫu (ảnh nền + ô {{TEN_KH}}) → mỗi khách 1 ảnh JPG, chèn vào thân email.
 *
 * 2 cách có Slides mẫu:
 *  A. Thiết kế trên Canva (hoặc công cụ khác): xóa ô tên, export PNG (nền) + PPTX (chỉ để lấy đúng khổ trang)
 *     → chạy createCardTemplate('<link hoặc Drive ID ảnh PNG>', '<link hoặc Drive ID file PPTX>')
 *  B. Thiết kế thẳng trên Google Slides (File → Page setup → Custom), thêm 1 ô chữ {{TEN_KH}}
 *     → chạy useCardTemplate('<ID file Slides>')
 * Đổi font / vị trí / cỡ chữ tên: sửa trực tiếp ô {{TEN_KH}} trên Slides mẫu — lần gửi sau tự lấy bản mới.
 */

const NAME_PLACEHOLDER = '{{TEN_KH}}'

function cardCfg_() {
  const c = SETTINGS.card || {}
  return {
    pageWidthPx: c.pageWidthPx || 1000,
    nameBox: c.nameBox || { left: 50, top: 150, width: 900, height: 120 },
    fontSize: c.fontSize || 80,
    fitChars: c.fitChars || 22,
    font: c.font || 'Great Vibes',
    color: c.color || '#ffffff',
  }
}

/** Thư mục Drive của sự kiện: form ghi nhận phản hồi, Slides mẫu thiệp, ảnh thiệp */
function workFolder_() {
  const id = prop_('FOLDER_ID')
  if (id) {
    try {
      return DriveApp.getFolderById(id)
    } catch (e) {
      console.warn('Không mở được thư mục cũ, tạo thư mục mới: ' + errMsg_(e))
    }
  }
  const folder = DriveApp.createFolder(WORK_FOLDER_NAME)
  setProp_('FOLDER_ID', folder.getId())
  return folder
}

/**
 * Cách A — dựng Slides mẫu thiệp từ ảnh nền + file PPTX cùng thiết kế.
 *   bgPng   link tải (http…) hoặc Drive file ID của ảnh nền PNG (thiết kế đã xóa tên)
 *   pptx    link tải hoặc Drive file ID của file PPTX cùng thiết kế — chỉ dùng để Slides có đúng khổ trang,
 *           mọi phần tử trong đó bị xóa
 * Link export của Canva chỉ sống vài giờ → export xong chạy ngay.
 */
function createCardTemplate(bgPng, pptx) {
  if (!bgPng || !pptx) throw new Error('Thiếu ảnh nền PNG / file PPTX (link tải hoặc Drive file ID)')
  const cfg = cardCfg_()
  const folder = workFolder_()

  const bgFile = folder.createFile(fetchBlob_(bgPng, 'ảnh nền PNG').setName('Nền thiệp (không tên).png'))
  const pptxBlob = fetchBlob_(pptx, 'file PPTX').setContentType(MimeType.MICROSOFT_POWERPOINT)
  const created = Drive.Files.create(
    { name: EVENT.name + ' – Mẫu thiệp (sửa ô ' + NAME_PLACEHOLDER + ' tại đây)', mimeType: MimeType.GOOGLE_SLIDES, parents: [folder.getId()] },
    pptxBlob
  )

  const deck = SlidesApp.openById(created.id)
  const slides = deck.getSlides()
  for (let i = slides.length - 1; i > 0; i--) slides[i].remove()
  const slide = slides[0]
  slide.getPageElements().forEach(function (el) { el.remove() })
  slide.getBackground().setPictureFill(bgFile.getBlob())

  const k = deck.getPageWidth() / cfg.pageWidthPx
  const b = cfg.nameBox
  const box = slide.insertTextBox(NAME_PLACEHOLDER, b.left * k, b.top * k, b.width * k, b.height * k)
  box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE)
  box.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER)
  box.getText().getTextStyle()
    .setFontFamily(prop_('CARD_FONT', cfg.font))
    .setFontSize(Math.round(cfg.fontSize * k))
    .setForegroundColor(cfg.color)
  deck.saveAndClose()

  setProp_('CARD_TEMPLATE_ID', created.id)
  setProp_('CARD_BG_FILE_ID', bgFile.getId())
  PropertiesService.getScriptProperties().deleteProperty('CARD_WORK_ID')
  console.log('✅ Slides mẫu thiệp: https://docs.google.com/presentation/d/' + created.id + '/edit — chạy previewCards() để xem thử')
  return created.id
}

/** Cách B — dùng 1 file Google Slides có sẵn (slide đầu có ô chữ {{TEN_KH}}) làm mẫu thiệp */
function useCardTemplate(slidesId) {
  if (!slidesId) throw new Error('Thiếu ID file Google Slides mẫu')
  const deck = SlidesApp.openById(slidesId)
  nameShape_(deck.getSlides()[0]) // báo lỗi nếu chưa có ô {{TEN_KH}}
  const file = DriveApp.getFileById(slidesId)
  try {
    file.moveTo(workFolder_())
  } catch (e) {
    console.warn('Không chuyển được file mẫu vào thư mục sự kiện (giữ nguyên chỗ cũ): ' + errMsg_(e))
  }
  setProp_('CARD_TEMPLATE_ID', slidesId)
  PropertiesService.getScriptProperties().deleteProperty('CARD_WORK_ID')
  console.log('✅ Dùng Slides mẫu: https://docs.google.com/presentation/d/' + slidesId + '/edit — chạy previewCards() để xem thử')
  return slidesId
}

/** Link http(s) → tải về; còn lại coi là Drive file ID */
function fetchBlob_(src, label) {
  if (/^https?:\/\//i.test(String(src))) {
    const res = UrlFetchApp.fetch(src, { muteHttpExceptions: true })
    if (res.getResponseCode() !== 200) {
      throw new Error('Không tải được ' + label + ' (HTTP ' + res.getResponseCode() + ') — link export có thể đã hết hạn, cần export lại')
    }
    return res.getBlob()
  }
  return DriveApp.getFileById(String(src)).getBlob()
}

/** Đặt lại vị trí / kích thước ô {{TEN_KH}} trên Slides mẫu theo SETTINGS.card.nameBox (không cần export lại) */
function applyNameBoxLayout() {
  const cfg = cardCfg_()
  const deck = SlidesApp.openById(requireProp_('CARD_TEMPLATE_ID'))
  const k = deck.getPageWidth() / cfg.pageWidthPx
  nameShape_(deck.getSlides()[0])
    .setLeft(cfg.nameBox.left * k)
    .setTop(cfg.nameBox.top * k)
    .setWidth(cfg.nameBox.width * k)
    .setHeight(cfg.nameBox.height * k)
  deck.saveAndClose()
  console.log('✅ Đã cập nhật vị trí ô tên trên Slides mẫu — chạy previewCards() để xem lại')
}

/** Bản sao làm việc của Slides mẫu — tự sao lại khi mẫu được sửa, để không bao giờ đụng vào file mẫu */
function workDeckId_() {
  const tpl = DriveApp.getFileById(requireProp_('CARD_TEMPLATE_ID'))
  let workId = prop_('CARD_WORK_ID')
  if (workId && Number(prop_('CARD_WORK_SYNCED', 0)) >= tpl.getLastUpdated().getTime()) return workId
  if (workId) {
    try {
      DriveApp.getFileById(workId).setTrashed(true)
    } catch (e) {
      console.warn('Không bỏ được bản làm việc cũ: ' + errMsg_(e))
    }
  }
  workId = tpl.makeCopy(EVENT.name + ' – Thiệp (bản làm việc của script, đừng sửa)', workFolder_()).getId()
  setProp_('CARD_WORK_ID', workId)
  setProp_('CARD_WORK_SYNCED', Date.now())
  return workId
}

function nameShape_(slide) {
  const shapes = slide.getShapes()
  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i].getText().asString().indexOf(NAME_PLACEHOLDER) >= 0) return shapes[i]
  }
  throw new Error('Slides mẫu không còn ô ' + NAME_PLACEHOLDER)
}

/** Tên dài hơn fitChars ký tự → thu nhỏ chữ để vẫn nằm trên 1 dòng (tối thiểu 40% cỡ gốc) */
function fitFontSize_(name, base) {
  const fit = cardCfg_().fitChars
  if (name.length <= fit) return base
  return Math.max(Math.round(base * fit / name.length), Math.round(base * 0.4))
}

/** Ảnh JPG thiệp mời in tên khách */
function renderCard_(name) {
  const deckId = workDeckId_()
  let deck = SlidesApp.openById(deckId)
  deck.getSlides().slice(1).forEach(function (s) { s.remove() }) // slide tạm còn sót từ lần lỗi trước
  const slide = deck.getSlides()[0].duplicate()
  const text = nameShape_(slide).getText()
  const base = text.getTextStyle().getFontSize() || cardCfg_().fontSize
  text.setText(name)
  text.getTextStyle().setFontSize(fitFontSize_(name, base))
  const pageId = slide.getObjectId()
  deck.saveAndClose()
  try {
    // Thumbnail LARGE: cạnh dài tối đa 1600px
    const thumb = Slides.Presentations.Pages.getThumbnail(deckId, pageId, {
      'thumbnailProperties.thumbnailSize': 'LARGE',
      'thumbnailProperties.mimeType': 'PNG',
    })
    return UrlFetchApp.fetch(thumb.contentUrl).getBlob().getAs(MimeType.JPEG).setName('Thiep-moi_' + slug_(name) + '.jpg')
  } finally {
    deck = SlidesApp.openById(deckId)
    const tmp = deck.getSlideById(pageId)
    if (tmp) tmp.remove()
    deck.saveAndClose()
  }
}

/** Lưu thiệp vào thư mục Drive (thay file cũ cùng Mã KH) */
function saveCard_(blob, key, name) {
  const folder = workFolder_()
  const prefix = key + '_'
  const old = folder.searchFiles('title contains "' + prefix + '"')
  while (old.hasNext()) {
    const f = old.next()
    if (f.getName().indexOf(prefix) !== 0) continue
    try {
      f.setTrashed(true)
    } catch (e) {
      console.warn('Không bỏ được thiệp cũ ' + f.getName() + ' (file của người khác): ' + errMsg_(e))
    }
  }
  return folder.createFile(blob.copyBlob().setName(prefix + slug_(name) + '.jpg'))
}

function slug_(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Kiểm tra nhanh: tạo thiệp cho vài tên mẫu (ngắn, dài, có danh xưng) vào thư mục sự kiện */
function previewCards() {
  const names = ['Chị Hường', 'Anh/Chị Nguyễn Thị Thu Hường', 'Ms Vy', 'Trương Ngọc Biển']
  names.forEach(function (name, i) {
    const file = saveCard_(renderCard_(name), 'PREVIEW-' + (i + 1), name)
    console.log(name + ' → ' + file.getUrl())
  })
}

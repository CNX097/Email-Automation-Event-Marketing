#!/usr/bin/env node
/**
 * create_bound_script.js — tạo project Apps Script GẮN (bound) vào 1 Google Sheet bằng Apps Script API,
 * rồi ghi <out>/.clasp.json (rootDir apps-script) để `clasp push` được ngay.
 *
 * Dùng khi `clasp create-script --parentId <sheet>` không gắn được vào sheet (một số bản clasp bỏ qua parentId
 * và tạo sheet mới). Cần đã `clasp login` (đọc token trong ~/.clasprc.json) và đã bật Apps Script API cho tài khoản:
 * https://script.google.com/home/usersettings
 *
 *   node create_bound_script.js --parent <Sheet ID> --title "Tên project" --out <thư mục project>
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const argv = process.argv.slice(2)
const opt = function (n) { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null }
const parent = opt('parent'), title = opt('title'), out = opt('out')
if (!parent || !title || !out) {
  console.error('Dùng: node create_bound_script.js --parent <Sheet ID> --title "Tên" --out <thư mục project>')
  process.exit(2)
}
const claspJson = path.join(out, '.clasp.json')
if (fs.existsSync(claspJson)) {
  console.error(claspJson + ' đã có — project đã được tạo, không tạo thêm')
  process.exit(1)
}

;(async function () {
  const rc = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8'))
  const t = (rc.tokens && (rc.tokens.default || Object.values(rc.tokens)[0])) || rc.token || rc
  let at = t.access_token
  if (!at || !t.expiry_date || t.expiry_date < Date.now() + 60000) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
    })
    at = (await r.json()).access_token
    if (!at) throw new Error('Không làm mới được token — chạy lại `npx -y @google/clasp@3.4.1 login`')
  }
  const r = await fetch('https://script.googleapis.com/v1/projects', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, parentId: parent }),
  })
  const b = await r.json()
  if (!r.ok || !b.scriptId) throw new Error('Apps Script API lỗi ' + r.status + ': ' + JSON.stringify(b.error || b))
  if (b.parentId !== parent) throw new Error('Project tạo ra không gắn vào sheet (parentId = ' + b.parentId + ')')
  fs.mkdirSync(path.join(out, 'apps-script'), { recursive: true })
  fs.writeFileSync(claspJson, JSON.stringify({ scriptId: b.scriptId, rootDir: 'apps-script', parentId: parent }, null, 2) + '\n')
  console.log('✔ Đã tạo project gắn vào sheet: https://script.google.com/d/' + b.scriptId + '/edit')
  console.log('  Ghi ' + claspJson)
})().catch(function (e) {
  console.error('✘ ' + e.message)
  process.exit(1)
})

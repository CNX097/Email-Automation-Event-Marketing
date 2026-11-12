#!/usr/bin/env python3
"""
scaffold.py — dựng project Apps Script "email mời + xác nhận tham dự" cho 1 sự kiện từ event.json.

  python3 scaffold.py --config event.json --out <thư mục project>            # project mới
  python3 scaffold.py --config event.json --out <thư mục project> --config-only   # chỉ ghi lại khối CONFIG (giữ Email.html đã sửa)

Việc làm:
  1. Kiểm tra event.json (trường bắt buộc, ngày giờ, màu, chế độ gửi…)
  2. Chép template/apps-script → <out>/apps-script, ghi khối CONFIG trong Config.gs
  3. Thiệp tắt → bỏ dịch vụ Slides + scope presentations / external_request khỏi appsscript.json
  4. Ghi <out>/README.md (bàn giao: thông tin sự kiện, các bước còn lại) nếu chưa có
  5. Chạy selftest.js (nếu có node) → báo kết quả
Chỉ dùng thư viện chuẩn Python 3.8+.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
TEMPLATE = SKILL / 'template' / 'apps-script'
README_TPL = SKILL / 'assets' / 'project-README.template.md'

DEFAULT_COLORS = {'dark': '#1e3a8a', 'accent': '#2563eb', 'soft': '#eff6ff', 'border': '#bfdbfe', 'page': '#f1f5f9'}
DEFAULT_SETTINGS = {
    'dataTab': '',
    'groupRow': 0,
    'headerRow': 1,
    'firstDataRow': 2,
    'menuName': 'SỰ KIỆN',
    'senderMode': 'sales',
    'senderSuffix': '',
    'sharedSender': '',
    'sharedSenderName': '',
    'replyTo': '',
    'cardEnabled': False,
    'card': {
        'pageWidthPx': 1000,
        'nameBox': {'left': 50, 'top': 150, 'width': 900, 'height': 120},
        'fontSize': 80,
        'fitChars': 22,
        'font': 'Great Vibes',
        'color': '#ffffff',
    },
}
SETTING_NOTES = {
    'dataTab': 'tab danh sách khách',
    'groupRow': 'dòng nhóm cột phía trên header (0 = không có)',
    'headerRow': 'dòng tiêu đề cột',
    'firstDataRow': 'dòng khách đầu tiên',
    'menuName': 'tên menu trên sheet',
    'senderMode': "'sales' = mỗi Sales gửi từ hộp thư của mình · 'shared' = 1 hộp thư chung (tài khoản chạy setup)",
    'senderSuffix': "sales: tên hiển thị '<Tên Sales> – <senderSuffix>'",
    'sharedSender': 'shared: email hộp thư chung — setup() chỉ chạy được bằng đúng tài khoản này',
    'sharedSenderName': 'shared: tên hiển thị người gửi',
    'replyTo': "địa chỉ nhận trả lời ('' = trả lời về người gửi)",
    'cardEnabled': 'true = chèn thiệp in tên khách (Google Slides → JPG)',
    'card': 'vị trí ô tên theo pixel của thiết kế gốc (rộng pageWidthPx)',
}
REQUIRED_EVENT = ['code', 'name', 'title', 'subject', 'timeText', 'start', 'end', 'place', 'orgName', 'intro', 'signOff']
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$')
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
IDENT = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')


def js(value, indent=0, notes=None):
    """Python → JS literal (nháy đơn, không dấu ;) — dễ đọc như code viết tay"""
    pad = '  ' * indent
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if value is None:
        return 'null'
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return "'" + value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"
    if isinstance(value, list):
        if not value:
            return '[]'
        if all(not isinstance(v, (dict, list)) for v in value) and len(json.dumps(value, ensure_ascii=False)) < 90:
            return '[' + ', '.join(js(v) for v in value) + ']'
        return '[\n' + ''.join(pad + '  ' + js(v, indent + 1) + ',\n' for v in value) + pad + ']'
    if isinstance(value, dict):
        if not value:
            return '{}'
        inline = ', '.join((k if IDENT.match(k) else js(k)) + ': ' + js(v) for k, v in value.items())
        if not notes and all(not isinstance(v, (dict, list)) for v in value.values()) and len(inline) < 100:
            return '{ ' + inline + ' }'
        lines = []
        for k, v in value.items():
            key = k if IDENT.match(k) else js(k)
            note = ' // ' + notes[k] if notes and k in notes else ''
            lines.append(pad + '  ' + key + ': ' + js(v, indent + 1) + ',' + note)
        return '{\n' + '\n'.join(lines) + '\n' + pad + '}'
    raise TypeError('Không chuyển được sang JS: %r' % (value,))


def merged(defaults, given):
    out = dict(defaults)
    for k, v in (given or {}).items():
        out[k] = merged(defaults[k], v) if isinstance(v, dict) and isinstance(defaults.get(k), dict) else v
    return out


def load(path):
    cfg = json.loads(Path(path).read_text(encoding='utf-8'))
    errors = []
    ev = dict(cfg.get('event') or {})
    st = merged(DEFAULT_SETTINGS, cfg.get('settings'))
    cols = dict(cfg.get('columns') or {})
    res = dict(cfg.get('resultColumns') or {})

    for k in REQUIRED_EVENT:
        if not str(ev.get(k) or '').strip():
            errors.append('event.%s đang trống' % k)
    if ev.get('code') and not re.match(r'^[A-Z0-9]{2,10}$', ev['code']):
        errors.append('event.code phải là chữ in hoa / số, 2–10 ký tự (vd. SUM26, TD26): %s' % ev['code'])
    for k in ('start', 'end'):
        if ev.get(k) and not ISO.match(ev[k]):
            errors.append('event.%s phải dạng yyyy-MM-ddTHH:mm: %s' % (k, ev[k]))
    if ev.get('start') and ev.get('end') and ISO.match(ev['start']) and ISO.match(ev['end']) and ev['end'] <= ev['start']:
        errors.append('event.end phải sau event.start')
    ev['colors'] = merged(DEFAULT_COLORS, ev.get('colors'))
    for k, v in ev['colors'].items():
        if not HEX.match(str(v)):
            errors.append('event.colors.%s phải là mã hex #rrggbb: %s' % (k, v))
    ev.setdefault('preheader', '%s · %s · %s' % (ev.get('name', ''), ev.get('timeText', ''), ev.get('place', '')))
    ev.setdefault('mapQuery', ev.get('place', ''))
    for k, d in (('greeting', 'Kính gửi'), ('salutation', 'Quý Anh/Chị'), ('pronoun', 'Anh/Chị'), ('highlightsTitle', ''), ('highlights', []), ('note', ''), ('hotline', ''), ('links', []), ('closing', 'Rất mong được đón tiếp Anh/Chị tại sự kiện!'), ('regards', 'Trân trọng,')):
        ev.setdefault(k, d)
    for i, h in enumerate(ev['highlights']):
        if not isinstance(h, dict) or not h.get('title') or not h.get('text'):
            errors.append('event.highlights[%d] cần {title, text}' % i)
    for i, l in enumerate(ev['links']):
        if not isinstance(l, dict) or not l.get('label') or not str(l.get('url', '')).startswith('http'):
            errors.append('event.links[%d] cần {label, url http…}' % i)
    order = ['code', 'name', 'title', 'subject', 'preheader', 'timeText', 'start', 'end', 'place', 'mapQuery', 'orgName',
             'greeting', 'salutation', 'pronoun', 'intro',
             'highlightsTitle', 'highlights', 'note', 'hotline', 'links', 'closing', 'regards', 'signOff', 'colors']
    ev = {k: ev[k] for k in order if k in ev}

    if st['senderMode'] not in ('sales', 'shared'):
        errors.append("settings.senderMode phải là 'sales' hoặc 'shared': %s" % st['senderMode'])
    if not str(st['dataTab']).strip():
        errors.append('settings.dataTab (tên tab danh sách khách) đang trống')
    if not (st['groupRow'] < st['headerRow'] < st['firstDataRow']):
        errors.append('cần groupRow < headerRow < firstDataRow (groupRow = 0 nếu không có dòng nhóm)')
    if st['senderMode'] == 'shared' and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', str(st['sharedSender'] or '')):
        errors.append("senderMode 'shared' cần settings.sharedSender = email hộp thư chung (hỏi người dùng): %s" % (st['sharedSender'] or '(trống)'))
    if st['senderMode'] == 'shared' and not st['sharedSenderName']:
        st['sharedSenderName'] = 'Ban tổ chức ' + ev.get('name', '')
    if st['senderMode'] == 'sales' and not st['senderSuffix']:
        st['senderSuffix'] = ev.get('orgName', '')

    for k in ('name', 'email'):
        if not str(cols.get(k) or '').strip():
            errors.append('columns.%s (tên header trên sheet) đang trống' % k)
    if st['senderMode'] == 'sales' and not str(cols.get('sales') or '').strip():
        errors.append("senderMode 'sales' cần columns.sales = tên header cột Sales phụ trách")
    cols = {k: cols.get(k, '') for k in ('name', 'email', 'company', 'sales')}
    res = {
        'invited': res.get('invited') or 'Đã gửi email mời',
        'confirmed': res.get('confirmed') or 'KH xác nhận tham dự',
        'declined': res.get('declined') or 'KH không tham dự',
    }
    return {'event': ev, 'settings': st, 'columns': cols, 'resultColumns': res}, errors


def config_block(c):
    return '\n'.join([
        '// <<CONFIG — khối này do scripts/scaffold.py ghi từ event.json',
        'const EVENT = ' + js(c['event']),
        '',
        'const SETTINGS = ' + js(c['settings'], notes=SETTING_NOTES),
        '',
        "// Cột có sẵn trên sheet — đúng tên header ở dòng SETTINGS.headerRow. '' = sheet không có cột này",
        'const COL = ' + js(c['columns'], notes={'name': 'bắt buộc', 'email': 'bắt buộc (1 ô nhiều email: cách nhau bởi dấu phẩy)', 'company': 'không bắt buộc', 'sales': "bắt buộc khi senderMode = 'sales'"}),
        '',
        '// Cột kết quả: có sẵn trên sheet thì dùng, chưa có thì setup() thêm vào nhóm AUTO (ô tick)',
        'const RESULT_COL = ' + js(c['resultColumns'], notes={'invited': 'tick khi gửi email thật', 'confirmed': 'tick khi khách bấm "Xác nhận tham dự"', 'declined': 'tick khi khách bấm "Không thể tham dự"'}),
        '// CONFIG>>',
    ])


def write_config(gs_path, c):
    src = gs_path.read_text(encoding='utf-8')
    new, n = re.subn(r'// <<CONFIG.*?// CONFIG>>', lambda m: config_block(c), src, flags=re.S)
    if n != 1:
        raise SystemExit('Không tìm thấy khối // <<CONFIG … // CONFIG>> trong ' + str(gs_path))
    gs_path.write_text(new, encoding='utf-8')


def trim_manifest(path, card):
    """Manifest luôn dựng lại từ template (đổi cardEnabled qua --config-only vẫn đúng scope)"""
    m = json.loads((TEMPLATE / 'appsscript.json').read_text(encoding='utf-8'))
    if not card:
        deps = m.get('dependencies', {})
        deps['enabledAdvancedServices'] = [s for s in deps.get('enabledAdvancedServices', []) if s.get('serviceId') != 'slides']
        m['oauthScopes'] = [s for s in m.get('oauthScopes', []) if not s.endswith('/auth/presentations') and not s.endswith('/auth/script.external_request')]
    path.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def write_readme(out, c):
    target = out / 'README.md'
    if target.exists() or not README_TPL.exists():
        return False
    ev, st, cols = c['event'], c['settings'], c['columns']
    values = {
        'EVENT_NAME': ev['name'], 'EVENT_TITLE': ev['title'], 'TIME': ev['timeText'], 'PLACE': ev['place'],
        'HOTLINE': ev.get('hotline') or '—', 'DATA_TAB': st['dataTab'], 'HEADER_ROW': str(st['headerRow']),
        'FIRST_DATA_ROW': str(st['firstDataRow']), 'MENU': st['menuName'], 'KEY_PREFIX': ev['code'] + '-',
        'SENDER': ('Mỗi Sales gửi từ hộp thư của mình (cột "%s" → tab SALES_EMAIL, Sales tự kích hoạt qua menu)' % cols['sales'])
        if st['senderMode'] == 'sales' else 'Hộp thư chung — tài khoản chạy setup() (tên hiển thị "%s")' % st['sharedSenderName'],
        'CARD': 'Có — Google Slides mẫu (ô {{TEN_KH}}) → JPG chèn trong email' if st['cardEnabled'] else 'Không',
        'COL_NAME': cols['name'], 'COL_EMAIL': cols['email'], 'COL_COMPANY': cols['company'] or '—', 'COL_SALES': cols['sales'] or '—',
        'COL_INVITED': c['resultColumns']['invited'], 'COL_CONFIRMED': c['resultColumns']['confirmed'], 'COL_DECLINED': c['resultColumns']['declined'],
    }
    text = README_TPL.read_text(encoding='utf-8')
    for k, v in values.items():
        text = text.replace('{{' + k + '}}', v)
    target.write_text(text, encoding='utf-8')
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--config', required=True, help='file event.json')
    ap.add_argument('--out', required=True, help='thư mục project (tạo <out>/apps-script)')
    ap.add_argument('--config-only', action='store_true', help='chỉ ghi lại khối CONFIG + manifest của project đã có')
    ap.add_argument('--force', action='store_true', help='ghi đè apps-script/ đã có (MẤT Email.html đã sửa)')
    ap.add_argument('--headers', help='header thật của sheet (phẩy ngăn cách) để selftest kiểm COL')
    ap.add_argument('--sample-csv', help='CSV xuất từ tab danh sách: lấy header thật + xem trước email với vài khách đầu tiên')
    ap.add_argument('--no-test', action='store_true', help='không chạy selftest')
    a = ap.parse_args()

    c, errors = load(a.config)
    if errors:
        print('✘ event.json chưa hợp lệ:')
        for e in errors:
            print('   - ' + e)
        sys.exit(1)

    out = Path(a.out).resolve()
    dest = out / 'apps-script'
    if a.config_only:
        if not (dest / 'Config.gs').exists():
            sys.exit('Chưa có ' + str(dest / 'Config.gs') + ' — bỏ --config-only để dựng project mới')
    else:
        if dest.exists() and not a.force:
            sys.exit(str(dest) + ' đã có — dùng --config-only (giữ Email.html) hoặc --force (ghi đè)')
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(TEMPLATE, dest)
    write_config(dest / 'Config.gs', c)
    trim_manifest(dest / 'appsscript.json', c['settings']['cardEnabled'])
    wrote_readme = write_readme(out, c)
    (out / 'event.json').write_text(json.dumps(c, ensure_ascii=False, indent=2) + '\n', encoding='utf-8') if not (out / 'event.json').exists() else None

    print('✔ Project: ' + str(dest))
    print('  Sự kiện: %s · %s' % (c['event']['name'], c['event']['timeText']))
    print('  Người gửi: ' + c['settings']['senderMode'] + ' · Thiệp: ' + ('có' if c['settings']['cardEnabled'] else 'không'))
    if wrote_readme:
        print('  README bàn giao: ' + str(out / 'README.md'))

    if a.no_test:
        return
    if not shutil.which('node'):
        print('⚠ Không có node — bỏ qua selftest. Cài Node.js rồi chạy: node ' + str(HERE / 'selftest.js') + ' ' + str(dest))
        return
    cmd = ['node', str(HERE / 'selftest.js'), str(dest), '--preview', str(out / 'email-preview.html')]
    if a.headers:
        cmd += ['--headers', a.headers]
    if a.sample_csv:
        cmd += ['--sample-csv', str(Path(a.sample_csv).resolve())]
    r = subprocess.run(cmd, capture_output=True, text=True)
    lines = r.stdout.strip().splitlines()
    failed = [l for l in lines if l.strip().startswith('✘')]
    print('\nselftest: ' + (lines[-1] if lines else '(không có kết quả)'))
    for l in failed[:20]:
        print(l)
    if r.returncode:
        print(r.stderr.strip()[-2000:])
        sys.exit(1)
    print('  Xem trước email: ' + str(out / 'email-preview.html'))


if __name__ == '__main__':
    main()

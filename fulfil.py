#!/usr/bin/env python3
"""
Amphora fulfilment pack builder.

For each redemption order, produces everything needed to make and post one card:

    packs/order-0042/
        packing-slip.pdf     address, order details, a QR to the card's page,
                             and the physical checklist to work through
        coa.pdf              the signed certificate of authenticity
        card-front.webp      the print file for the card face
        nfc.txt              the exact URL to encode on the chip

Usage:
    python3 fulfil.py --queue                 # fetch open orders from the API
    python3 fulfil.py --order 42              # build one pack
    python3 fulfil.py --all                   # build packs for everything open

Environment:
    ADMIN_TOKEN   the fulfilment queue password
    API           default https://api.amphora.example
"""
import argparse, json, os, subprocess, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.environ.get('API', 'https://api.amphora.example')
PACKS = os.path.join(HERE, 'packs')
INK = (24, 22, 18)
RULE = (60, 60, 56)      # slip rules and headings (print-friendly grey)
STONE = (139, 130, 114)


def font(size, bold=False):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold
              else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/System/Library/Fonts/Helvetica.ttc'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def mono(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
              '/System/Library/Fonts/Menlo.ttc'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def fetch(path):
    req = urllib.request.Request(API + path)
    tok = os.environ.get('ADMIN_TOKEN')
    if tok:
        req.add_header('x-admin-token', tok)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def qr_code(url, size=260):
    """Tiny dependency-free QR-ish block: falls back to a URL box if qrcode
    isn't installed. The packer scans it to confirm the chip encodes correctly."""
    try:
        import qrcode
        q = qrcode.QRCode(box_size=6, border=2)
        q.add_data(url)
        q.make(fit=True)
        img = q.make_image(fill_color='black', back_color='white').convert('RGB')
        return img.resize((size, size), Image.NEAREST)
    except Exception:
        img = Image.new('RGB', (size, size), (255, 255, 255))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, size - 1, size - 1], outline=(0, 0, 0), width=2)
        d.text((10, size // 2 - 8), 'QR: pip install qrcode', font=mono(11), fill=(0, 0, 0))
        return img


def packing_slip(order, meta, out_path):
    W, H = 1654, 2339          # A4 at 200dpi
    img = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    m = 120
    y = m

    d.text((m, y), 'AMPHORA', font=font(46, bold=True), fill=INK); y += 58
    d.text((m, y), 'FULFILMENT SLIP', font=mono(20), fill=RULE); y += 50
    d.line([(m, y), (W - m, y)], fill=RULE, width=3); y += 46

    d.text((m, y), f"ORDER Nº {order['id']}", font=mono(26), fill=INK); y += 40
    d.text((m, y), f"placed {str(order.get('created_at', ''))[:19]}", font=mono(16), fill=STONE)
    y += 60

    # what to make
    d.text((m, y), 'THE CARD', font=mono(18), fill=RULE); y += 34
    rows = [
        ('WORK', meta.get('title', '—')),
        ('WORK ID', meta.get('workId', '—')),
        ('CLASS', f"{meta.get('class','—')}  ·  GRADE {meta.get('grade','—')}"),
        ('EDITION', f"Nº {order.get('serial','—')} of {meta.get('editionCap','—')}"),
        ('CERTIFICATE', f"token #{order['token_id']}"),
    ]
    for k, v in rows:
        d.text((m, y), k, font=mono(16), fill=STONE)
        d.text((m + 300, y), str(v), font=font(19), fill=INK)
        y += 34
    y += 30

    # where it goes
    d.text((m, y), 'SHIP TO', font=mono(18), fill=RULE); y += 34
    for line in [order['name'], order['line1'], order.get('line2') or '',
                 order['city'], order['postcode'], order['country'].upper()]:
        if line:
            d.text((m, y), str(line), font=font(24), fill=INK); y += 36
    y += 14
    d.text((m, y), order['email'], font=mono(16), fill=STONE); y += 56

    # the chip
    nfc_url = f"https://amphora.example/t/{order['token_id']}"
    d.text((m, y), 'NFC CHIP ENCODES', font=mono(18), fill=RULE); y += 32
    d.text((m, y), nfc_url, font=mono(20), fill=INK); y += 46
    img.paste(qr_code(nfc_url, 260), (W - m - 260, y - 150))

    # checklist
    y += 30
    d.text((m, y), 'BEFORE IT LEAVES', font=mono(18), fill=RULE); y += 40
    for step in [
        'Card printed on archival stock, colour checked against the master',
        'Card sealed in case, no dust between art and window',
        'Grading label reads the correct class and grade',
        'Holographic seal applied across the case seam',
        'NFC chip encoded with the URL above, then LOCKED',
        'Chip tested: tap opens the correct card page',
        'COA printed, signed, and enclosed',
        'Packed rigid, tracked postage, tracking recorded in the system',
    ]:
        d.rectangle([m, y, m + 22, y + 22], outline=INK, width=2)
        d.text((m + 40, y - 1), step, font=font(20), fill=INK)
        y += 40

    y = H - m - 60
    d.line([(m, y), (W - m, y)], fill=RULE, width=2); y += 20
    d.text((m, y), 'This certificate is locked soulbound on-chain. The card and the token cannot be separated.',
           font=mono(15), fill=STONE)

    img.save(out_path, 'PDF', resolution=200.0)


def build_pack(order):
    oid = order['id']
    token = order['token_id']
    out = os.path.join(PACKS, f'order-{oid:04d}')
    os.makedirs(out, exist_ok=True)

    try:
        meta = fetch(f'/work/{token}')
    except Exception:
        meta = {}

    packing_slip(order, meta, os.path.join(out, 'packing-slip.pdf'))

    # COA
    coa_script = os.path.join(HERE, 'render_coa.py')
    if os.path.exists(coa_script):
        subprocess.run([
            'python3', coa_script,
            '--work', meta.get('title', 'Amphora Fragment'),
            '--series', 'Season I - The Fractured Fresco',
            '--edition', f"{str(order.get('serial','')).zfill(3)} / {meta.get('editionCap', 300)}",
            '--chain-id', f"{meta.get('workId','')} - SHERD {token} - ELYSIUM 99901",
            '--serial', f"ARTE-{str(token).zfill(4)}",
            '--date', str(order.get('created_at', ''))[:10],
            '--signature', 'AF',
            '--out', os.path.join(out, 'coa'),
        ], capture_output=True)

    with open(os.path.join(out, 'nfc.txt'), 'w') as f:
        f.write(f"https://amphora.example/t/{token}\n")

    # card front, if the composed file is on this machine
    src = os.path.join(HERE, 'cards', f"{meta.get('workId','')}-front.webp")
    if os.path.exists(src):
        import shutil
        shutil.copy(src, os.path.join(out, 'card-front.webp'))

    print(f'pack ready: {out}')
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--queue', action='store_true', help='list open orders')
    p.add_argument('--order', type=int)
    p.add_argument('--all', action='store_true')
    a = p.parse_args()

    os.makedirs(PACKS, exist_ok=True)
    orders = fetch('/redeem/queue')
    if isinstance(orders, dict):
        orders = orders.get('rows', [])

    if a.queue:
        if not orders:
            print('no open orders')
        for o in orders:
            print(f"#{o['id']:>4}  token {o['token_id']:>4}  {o['status']:<14} {o['name']} — {o['country']}")
        return

    if a.order:
        match = [o for o in orders if o['id'] == a.order]
        if not match:
            print(f'order {a.order} not in the open queue'); sys.exit(1)
        build_pack(match[0]); return

    if a.all:
        for o in orders:
            build_pack(o)
        return

    p.print_help()


if __name__ == '__main__':
    main()

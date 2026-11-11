#!/usr/bin/env python3
"""
Amphora COA renderer — fills the certificate template per redemption.

  python3 render_coa.py \
    --work "The Gift of Fortune" --series "Season I - The Fractured Fresco" \
    --edition "001 / 300" --chain-id "S1-01 - SHERD 68 - ELYSIUM 99901" \
    --serial "AMPH-0068" --date "25 NOV 2026" --slab slabs/S1-01.webp --out coa-0068

The template (coa-template-clean.png) is BUILT from the same FIELDS table
below by brand/build_assets.py, so labels and values cannot drift apart: move a
field here, rebuild the template, done.

Signature: put your own signature.png (transparent; it is recoloured) beside
this script. Without it the --signature text is set in italic. The original
studio's autograph is deliberately NOT carried over.
"""
import argparse, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from brand import brand as B

TEMPLATE = os.path.join(HERE, 'coa-template-clean.png')
W, H = 1747, 2482                      # A5 @ 300dpi with bleed
CX = W // 2

# The work's title is the headline; the record is a ledger: label left, value right.
L, R = 300, W - 300                    # the text column
def _row(label, y, kind='mono', size=30, **kw):
    return {**dict(label=label, x=R, label_x=L, label_y=y - 22, y=y, kind=kind, size=size, maxw=760, track=0, anchor='r'), **kw}

FIELDS = {
    'work':    dict(label='This certifies a numbered fragment of', x=CX, label_x=CX, label_y=1196, y=1338, kind='display',
                    size=100, maxw=R - L, track=0.02, anchor='m'),
    'series':  dict(label='', x=CX, label_x=CX, label_y=0, y=1400, kind='sans', size=23, maxw=R - L, track=0.34, anchor='m'),
    'edition': _row('Edition Nº', 1560, kind='display', size=60, accent=True, track=0.03),
    'chain':   _row('On-chain ID', 1660, size=26),
    'serial':  _row('Sherd serial', 1760, size=28),
    'date':    _row('Date of issue', 1860, size=28),
}
ROW_RULE = 32                          # hairline this far under each row's baseline
SIG_BASELINE = (L, 2120)               # signature sits on this rule


def fit(d, text, kind, size, maxw, track):
    f = B.font(kind, size)
    while B.tracked_width(d, text, f, size * track) > maxw and size > 16:
        size -= 2; f = B.font(kind, size)
    return f, size


CARD_BOX = (CX, 724, 716)              # centre x, centre y, height: the open space over the mural


def hover_card(img, slab_path):
    """Float the certified work's own slab over the mural: lifted, with a soft
    cast shadow beneath it, so the certificate shows the card it answers for."""
    from PIL import ImageFilter
    cx, cy, h = CARD_BOX
    slab = Image.open(slab_path).convert('RGBA')
    slab = slab.crop(slab.getchannel('A').getbbox())
    slab = slab.resize((round(slab.width * h / slab.height), h), Image.LANCZOS)
    x, y = cx - slab.width // 2, cy - h // 2
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sil = Image.new('RGBA', slab.size, (0, 0, 0, 0))
    sil.putalpha(slab.getchannel('A').point(lambda p: p * 200 // 255))
    layer.alpha_composite(sil, (x + 10, y + 46))              # the drop: straight down, far, soft
    layer = layer.filter(ImageFilter.GaussianBlur(34))
    tight = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sil.putalpha(slab.getchannel('A').point(lambda p: p * 120 // 255))
    tight.alpha_composite(sil, (x + 3, y + 10))               # contact shadow: close and crisp
    layer.alpha_composite(tight.filter(ImageFilter.GaussianBlur(7)))
    layer.alpha_composite(slab, (x, y))
    img.paste(layer, (0, 0), layer)


def render(args):
    img = Image.open(TEMPLATE).convert('RGB')
    d = ImageDraw.Draw(img)
    values = {
        'work': args.work.upper(), 'series': args.series.upper().replace(' - ', '  ·  '),
        'edition': args.edition, 'chain': args.chain_id.upper(), 'serial': args.serial.upper(),
        'date': args.date.upper(),
    }
    for key, k in FIELDS.items():
        f, size = fit(d, values[key], k['kind'], k['size'], k['maxw'], k['track'])
        asc = f.getbbox('H')[3]
        fill = B.ACID if k.get('accent') else B.BONE
        B.tracked(d, (k['x'], k['y'] - asc), values[key], f, fill, size * k['track'], anchor=k['anchor'])

    if args.slab and os.path.exists(args.slab):
        hover_card(img, args.slab)

    sig_img = os.path.join(HERE, 'signature.png')
    if os.path.exists(sig_img):
        sig = Image.open(sig_img).convert('RGBA')
        tw = 460
        sig = sig.resize((tw, int(sig.height * tw / sig.width)), Image.LANCZOS)
        bone = Image.new('RGBA', sig.size, (*B.BONE, 0)); bone.putalpha(sig.getchannel('A'))
        img.paste(bone, (SIG_BASELINE[0], SIG_BASELINE[1] - sig.height + 26), bone)
    else:
        d.text(SIG_BASELINE, args.signature, font=B.font('italic', 76), fill=B.BONE, anchor='ls')

    base = os.path.splitext(args.out)[0]
    img.save(base + '.png')
    img.save(base + '.pdf', resolution=300.0)
    print('rendered:', base + '.pdf', 'and .png')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for k in ['work', 'series', 'edition', 'serial', 'date', 'out']:
        p.add_argument('--' + k, required=True)
    p.add_argument('--chain-id', required=True)
    p.add_argument('--signature', default='Amphora Studio')
    p.add_argument('--slab', default='', help="the work's composed slab (.webp); floated over the mural")
    render(p.parse_args())

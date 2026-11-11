#!/usr/bin/env python3
"""
Build every branded Amphora asset from code.

    python3 brand/build_assets.py                 # everything
    python3 brand/build_assets.py slab coa        # only those

Inputs it needs beside the repo root:
  slab-source.png   the neutral slab render (case, label plate, mat). The label
                    plate is repainted and the whole render is pulled to
                    monochrome, so any future re-render drops straight in.
  assets/art/*.png  a few of the studio's own frescos, used inside arch windows.

Outputs: slab-base.png, coa-template-clean.png (both read by the pipeline
scripts) and everything under assets/.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[0] = ROOT        # not brand/: `brand` must resolve to the package
from brand import brand as B

OUT = os.path.join(ROOT, 'assets')
ART = os.path.join(OUT, 'art')
os.makedirs(OUT, exist_ok=True)


def art(name):
    return Image.open(os.path.join(ART, name)).convert('RGB')


def grey(img, lift=1.0, contrast=1.15):
    g = ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=1)
    g = g.point(lambda p: max(0, min(255, int(((p / 255 - 0.5) * contrast + 0.5) * 255 * lift))))
    return Image.merge('RGB', (g, g, g))


def small_caps(d, xy, text, size=18, fill=B.BONE, track=0.22, kind='sans', anchor='l'):
    f = B.font(kind, size)
    return B.tracked(d, xy, text.upper(), f, fill, size * track, anchor)


def block_text(d, xy, text, size, width, fill=B.BONE, leading=1.18, kind='sans'):
    """Small uppercase copy set as a tight justified block."""
    f = B.font(kind, size)
    words, lines, cur = text.upper().split(), [], []
    for w in words:
        if d.textlength(' '.join(cur + [w]), font=f) <= width: cur.append(w)
        else: lines.append(cur); cur = [w]
    if cur: lines.append(cur)
    x, y = xy
    for i, ln in enumerate(lines):
        if i == len(lines) - 1 or len(ln) == 1:
            d.text((x, y), ' '.join(ln), font=f, fill=fill)
        else:
            tw = sum(d.textlength(w, font=f) for w in ln)
            gap = (width - tw) / (len(ln) - 1)
            cx = x
            for w in ln:
                d.text((cx, y), w, font=f, fill=fill); cx += d.textlength(w, font=f) + gap
        y += int(size * leading)
    return y


# ───────────────────────────────────────────────────────────────── logo, seals
def build_logo():
    for name, col in [('bone', B.BONE), ('ink', B.INK), ('acid', B.ACID)]:
        B.monogram(1024, col).save(f'{OUT}/logo-mark-{name}.png')
        lk = B.lockup(360, col, col)
        pad = Image.new('RGBA', (lk.width + 120, lk.height + 120), (0, 0, 0, 0))
        pad.alpha_composite(lk, (60, 60)); pad.save(f'{OUT}/logo-lockup-{name}.png')
        B.seal(1200, col).save(f'{OUT}/seal-{name}.png')
    open(f'{OUT}/logo-mark.svg', 'w').write(B.monogram_svg(B.HEX['bone']))
    open(f'{OUT}/logo-mark-ink.svg', 'w').write(B.monogram_svg('#111110'))
    open(f'{OUT}/logo-wordmark.svg', 'w').write(B.wordmark_svg(B.HEX['bone']))
    open(f'{OUT}/logo-wordmark-ink.svg', 'w').write(B.wordmark_svg('#111110'))
    # app icon / favicon: the mark on an acid tile
    tile = Image.new('RGBA', (512, 512), (*B.CARBON, 255))
    m = B.monogram(400, B.ACID); tile.alpha_composite(m, (56, 56)); tile.save(f'{OUT}/favicon-512.png')
    tile.resize((64, 64), Image.LANCZOS).save(f'{OUT}/favicon-64.png')
    print('logo, seals')


# ─────────────────────────────────────────────────────────────────── the slab
PANEL = (301, 291, 1492, 564)          # the label plate's printable face
GRADE = (1180, 342, 1442, 514)         # the grade block (filled by slab_compose)


def build_slab():
    src = os.path.join(ROOT, 'slab-source.png')
    base = Image.open(src).convert('RGB')
    a = np.asarray(base).astype('float32')

    # 1. Lift a clean "glare map" off the old cream plate. Anything that is not
    #    bare cream (the old wordmark, keylines) is masked out and filled by
    #    normalised convolution, so the diagonal reflection across the case
    #    survives onto the new plate instead of being painted flat.
    x0, y0, x1, y1 = PANEL
    reg = a[y0:y1, x0:x1]
    lum = reg.mean(axis=2)
    cream = (reg[..., 0] > 232) & (reg[..., 2] > 196) & ((reg[..., 0] - reg[..., 2]) < 40)
    cream = ndimage.binary_erosion(cream, iterations=3).astype('float32')
    den = ndimage.gaussian_filter(cream, 14) + 1e-4
    clean = ndimage.gaussian_filter(lum * cream, 14) / den
    glare = clean - np.median(clean)

    # 2. Pull the whole render to near-monochrome: brass becomes brushed steel,
    #    the mat becomes bone. The fresco then supplies the only colour.
    g = a.mean(axis=2, keepdims=True)
    a = g + (a - g) * 0.10
    a[..., 2] -= 2.0                      # the faintest warmth, so bone is not grey

    # 3. The new plate: carbon, with the reflection laid back over it.
    plate = np.empty_like(reg)
    for i in range(3):
        plate[..., i] = B.CARBON[i] + 5 + np.clip(glare, -6, 60) * 2.2
    a[y0:y1, x0:x1] = plate
    base = Image.fromarray(np.clip(a, 0, 255).astype('uint8'), 'RGB').convert('RGBA')

    d = ImageDraw.Draw(base)
    d.rectangle([x0 + 11, y0 + 11, x1 - 12, y1 - 12], outline=(*B.BONE, 120), width=2)
    # mark + wordmark
    cy = (y0 + y1) // 2
    f = B.font('display', 112)
    bb = f.getbbox('MPHOR')
    tx = x0 + 64
    B.tracked(d, (tx, cy - 22 - (bb[3] + bb[1]) / 2), B.WORDMARK, f, B.BONE, 112 * 0.2)
    small_caps(d, (tx + 4, cy + 50), 'Fragments of the fresco  ·  Elysium', 18, B.ASH, 0.34)
    # the grade sits right of a hairline; slab_compose sets it. No box.
    d.line([GRADE[0] - 34, y0 + 56, GRADE[0] - 34, y1 - 56], fill=(*B.BONE, 150), width=2)
    # lay the reflection back over the type and the block too
    gl = Image.fromarray(np.clip(glare * 2.2, 0, 70).astype('uint8'), 'L')
    white = Image.new('RGBA', (x1 - x0, y1 - y0), (255, 255, 255, 0)); white.putalpha(gl)
    base.alpha_composite(white, (x0, y0))
    base.convert('RGB').save(os.path.join(ROOT, 'slab-base.png'))
    print('slab-base.png')


# ───────────────────────────────────────────────────────────────── card back
def build_card_back():
    """Helios: a radiate sun in a meander frame, the Λ at its centre. Reads the
    same either way up, as a card back should."""
    import math
    W, H = 822, 1122                       # 63x88mm @ 300dpi + 3mm bleed
    c = B.carbon_ground(W, H, seed=15).convert('RGBA')
    d = ImageDraw.Draw(c)
    c.alpha_composite(B.meander_frame(W - 100, H - 100, 40, B.BONE), (50, 50))
    cx, cy = W // 2, H // 2
    for i in range(48):
        a = math.radians(i * 7.5); long = i % 2 == 0
        r0, r1, hw = 150, (372 if long else 250), math.radians(1.7 if long else 1.2)
        if long: r1 = min(r1, 300 / max(abs(math.cos(a)), .001))
        d.polygon([(cx + r0*math.cos(a-hw), cy + r0*math.sin(a-hw)), (cx + r1*math.cos(a), cy + r1*math.sin(a)),
                   (cx + r0*math.cos(a+hw), cy + r0*math.sin(a+hw))], fill=(*B.BONE, 255))
    d.ellipse([cx - 128, cy - 128, cx + 128, cy + 128], outline=(*B.ACID, 255), width=3)
    d.ellipse([cx - 114, cy - 114, cx + 114, cy + 114], outline=(*B.BONE, 140), width=1)
    lam = B.monogram(118, B.ACID)                              # Λ over its own reflection
    c.alpha_composite(lam, (cx - 59, cy - 108)); c.alpha_composite(lam.rotate(180), (cx - 59, cy - 10))
    mb = B.meander_band(420, 26, B.BONE, rules=False)
    c.alpha_composite(mb, (cx - 210, 206)); c.alpha_composite(mb.rotate(180), (cx - 210, H - 232))
    t = Image.new('RGBA', (W, 90), (0, 0, 0, 0))
    f = B.font('display', 46)
    B.tracked(ImageDraw.Draw(t), (W // 2, 8), B.WORDMARK, f, B.BONE, 46 * .3, anchor='m')
    c.alpha_composite(t, (0, 116)); c.alpha_composite(t.rotate(180), (0, H - 116 - 90))
    B.grain(c.convert('RGB'), 9).save(f'{OUT}/card-back-BLEED.png')
    print('card back')


# ─────────────────────────────────────────────────────────────── certificate
def build_coa():
    """The mural covers the whole sheet. Its upper half is left to be seen; from
    the middle down it sinks into the dark ground, where the record is set as a
    plain ledger. One hairline frame, nothing else."""
    import render_coa as R
    from PIL import ImageEnhance
    W, H, CX = R.W, R.H, R.CX
    # A generated antique-style mural (Higgsfield). Decorative ground only:
    # it is NOT a work in the collection and must never be presented as one.
    src = art('mural-procession.png')
    k = max(W / src.width, H / src.height)
    src = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
    x = (src.width - W) // 2
    bg = src.crop((x, 0, x + W, H))
    bg = ImageEnhance.Color(bg).enhance(0.85)
    bg = ImageEnhance.Brightness(bg).enhance(0.80)
    # scrim: a little at the head for the wordmark, then a long fade to solid
    ys = np.arange(H, dtype='float32')[:, None]
    head = np.clip(1 - ys / 420, 0, 1) * 0.55
    foot = np.clip((ys - 820) / 420, 0, 1) ** 0.9 * 0.93
    a = (np.maximum(head, foot) * 255).astype('uint8')
    scrim = Image.fromarray(np.repeat(a, W, axis=1), 'L')
    ground = B.carbon_ground(W, H, seed=21)
    c = Image.composite(ground, bg, scrim).convert('RGBA')
    d = ImageDraw.Draw(c)
    M = 96
    d.rectangle([M, M, W - M, H - M], outline=(*B.BONE, 230), width=3)

    lk = B.lockup(92, B.BONE, B.BONE); c.alpha_composite(lk, (CX - lk.width // 2, 176))
    B.tracked(d, (CX, 300), 'CERTIFICATE OF AUTHENTICITY', B.font('sans', 22), B.BONE, 22 * .5, anchor='m')

    d.line([CX - 60, 1140, CX + 60, 1140], fill=(*B.ACID, 255), width=2)
    first = True
    for key, k_ in R.FIELDS.items():
        if not k_['label']: continue
        small_caps(d, (k_['label_x'], k_['label_y']), k_['label'], 19, B.ASH, 0.34, anchor='m' if k_['anchor'] == 'm' else 'l')
        if k_['anchor'] == 'r':
            if first:
                d.line([R.L, k_['y'] - 78, R.R, k_['y'] - 78], fill=(*B.SMOKE, 255), width=2); first = False
            yy = k_['y'] + R.ROW_RULE
            d.line([R.L, yy, R.R, yy], fill=(*B.SMOKE, 255), width=2)

    sx, sy = R.SIG_BASELINE
    d.line([sx, sy + 20, sx + 500, sy + 20], fill=(*B.BONE, 255), width=2)
    small_caps(d, (sx, sy + 36), 'For Amphora studio', 16, B.ASH, 0.3)
    s = B.seal(240, B.BONE); c.alpha_composite(s, (R.R - 240, 1950))
    for i, line in enumerate(['The edition number is recorded on Elysium and cannot be issued twice.',
                              'Verify by tapping the chip sealed with this card.']):
        small_caps(d, (CX, H - M - 150 + i * 32), line, 14, B.ASH, 0.24, anchor='m')
    B.grain(c.convert('RGB'), 10).save(os.path.join(ROOT, 'coa-template-clean.png'))
    print('coa-template-clean.png')


# ──────────────────────────────────────────────────────────────── diagrams
def _card(title_a, title_b, kicker, seed):
    W, H = 1200, 760
    c = B.carbon_ground(W, H, seed=seed).convert('RGBA')
    d = ImageDraw.Draw(c)
    small_caps(d, (80, 70), kicker, 16, B.ASH, 0.34)
    f = B.font('display', 62)
    w = d.textlength(title_a, font=f)
    d.text((78, 104), title_a, font=f, fill=B.BONE)
    w2 = d.textlength(title_b, font=f)
    d.text((78 + w + 22, 104), title_b, font=f, fill=B.ACID)       # the jump phrase: colour, not a box
    d.line([78 + w + 22, 190, 78 + w + 22 + w2, 190], fill=(*B.ACID, 255), width=2)
    c.alpha_composite(B.sunburst(56, B.BONE), (W - 80 - 56, 62))
    c.alpha_composite(B.barcode(W - 160, 22, B.BONE, seed=seed), (80, H - 62))
    return c, d, W, H


def build_diagrams():
    box = B.BOX_PRICE_HYPE
    c, d, W, H = _card('EVERY BOX,', 'ONE FRAGMENT', 'N° 01 — The ladder', 31)
    cols = [80, 420, 650, 900, 1120]
    heads = ['Class', 'Edition', 'Mark', 'Ferryman pays', 'Chance']
    y = 250
    for x, h in zip(cols, heads):
        small_caps(d, (x, y), h, 14, B.ASH, 0.3, anchor='r' if x > 100 else 'l')
    d.line([80, y + 34, W - 80, y + 34], fill=(*B.SMOKE, 255), width=2)
    y += 62
    for key, k in B.CLASSES.items():
        top = key == 'OLYMPIAN'
        ink = B.ACID if top else B.BONE
        d.text((80, y - 4), k['label'].upper(), font=B.font('display', 40), fill=ink)
        if key != 'MORTAL':                      # rank shown by stars, not by boxes
            nx = 80 + d.textlength(k['label'].upper(), font=B.font('display', 40)) + 18
            for i in range(2 if top else 1):
                c.alpha_composite(B.sparkle(22, B.ACID), (int(nx + i * 26), y + 12))
        mono = B.font('mono', 28)
        chance = f"{k['ppm'] / 1e4:.2f}%" if not k['odds'] else k['odds']
        for x, t in zip(cols[1:], [str(k['edition']), f"{B.fmt_hype(B.mark_hype(key, box))} HYPE",
                                   f"{B.fmt_hype(B.desk_hype(key, box))} HYPE", chance]):
            d.text((x, y + 4), t, font=mono, fill=ink, anchor='ra')
        d.line([80, y + 64, W - 80, y + 64], fill=(*(B.ACID if top else B.SMOKE), 255), width=1 if not top else 2)
        y += 86
    ev = sum(B.mark_hype(k, box) * v['ppm'] / 1e6 for k, v in B.CLASSES.items())
    block_text(d, (80, y + 24), f'Odds are published on-chain before any box opens. Box {B.fmt_hype(box)} HYPE. '
               f'Expected value {ev:.2f} HYPE, {ev / box * 100:.0f} percent of the box. '
               'The Ferryman buys back any sherd at 80 percent of its mark, at once, always.', 15, 760, B.BONE, 1.5)
    B.grain(c.convert('RGB'), 8).save(f'{OUT}/ladder-table.png')

    c, d, W, H = _card('A FLOOR,', 'NOT A PROMISE', 'N° 02 — The Ferryman', 47)
    mk, dk = B.mark_hype('MORTAL', box), B.desk_hype('MORTAL', box)
    cells = [('You hold', f'{B.fmt_hype(mk)}', 'HYPE · stated mark', False),
             ('The Ferryman pays', f'{B.fmt_hype(dk)}', 'HYPE · 80% of mark', True),
             ('You wait', '0', 'seconds · no buyer needed', False)]
    x = 80
    for i, (lab, big, sub, hot) in enumerate(cells):
        w = 346
        small_caps(d, (x, 296), lab, 14, B.ACID if hot else B.ASH, 0.28)
        d.text((x - 4, 326), big, font=B.font('display', 118), fill=B.ACID if hot else B.BONE)
        small_caps(d, (x, 474), sub, 13, B.ASH, 0.22)
        if i < 2:
            d.line([x + w - 26, 300, x + w - 26, 490], fill=(*B.SMOKE, 255), width=2)
        x += w
    block_text(d, (80, 552), 'No listing. No counterparty. No waiting for someone to want it. Sell from your '
               'collection in one transaction, paid on-chain in HYPE, receipt and all. The float is a public '
               'wallet. Watch what it can pay.', 15, 760, B.BONE, 1.5)
    B.grain(c.convert('RGB'), 8).save(f'{OUT}/ferryman-desk.png')
    print('diagrams')


# ─────────────────────────────────────────────────────────────────── poster
def build_poster():
    W, H = 1440, 1920
    c = B.carbon_ground(W, H, seed=2, lift=1.2).convert('RGBA')
    d = ImageDraw.Draw(c)
    fresco = art('ceiling-fresco.png')
    aw, ah = 760, 1120
    ax, ay = 150, 250
    c.alpha_composite(B.arch_window(fresco, aw, ah, focus=(0.45, 0.1)), (ax, ay))
    c.alpha_composite(B.arch_stroke(aw, ah, B.ACID, 9), (ax, ay))
    # a greyscale sherd breaking the frame on the right
    shard = Image.open(os.path.join(ROOT, 'assets/art/S1-01-fortuna.png')).convert('RGB')
    try:
        sys.path.insert(0, ROOT)
        cut = _cut_fragment(shard)
        k = 780 / cut.height
        cut = cut.resize((int(cut.width * k), int(cut.height * k)), Image.LANCZOS)
        gm = grey(cut.convert('RGB'), 1.0, 1.25).convert('RGBA'); gm.putalpha(cut.getchannel('A'))
        sh = Image.new('RGBA', c.size, (0, 0, 0, 0))
        shadow = Image.new('RGBA', gm.size, (0, 0, 0, 0)); shadow.putalpha(gm.getchannel('A').point(lambda p: p * 150 // 255))
        fx, fy = W - gm.width - 70, 400
        sh.alpha_composite(shadow, (fx + 26, fy + 34)); sh = sh.filter(ImageFilter.GaussianBlur(26))
        c.alpha_composite(sh); c.alpha_composite(gm, (fx, fy))
    except Exception as e:
        print('  (poster: fragment cut skipped:', e, ')')
    d = ImageDraw.Draw(c)
    B.orbit(c, (60, 760, W - 90, 1250), B.BONE, 3, tilt=-9)
    c.alpha_composite(B.sparkle(92, B.BONE), (ax + aw // 2 - 46, ay - 70))
    c.alpha_composite(B.dot_grid(46, {(1, 0): '25', (0, 1): 'S1', (2, 2): 'hy'}), (110, 90))
    c.alpha_composite(B.sunburst(120, B.BONE), (W - 110 - 120, 80))
    # the headline sits across the foot of the arch: colour and a hairline, no box
    by = ay + ah - 150
    f = B.font('display', 270)
    d.text((ax - 8, by - 40), 'DRAW', font=f, fill=B.ACID)
    w = d.textlength('DRAW', font=f)
    d.text((ax + w + 30, by + 38), 'A', font=B.font('display', 78), fill=B.BONE)
    d.text((ax + w + 30, by + 128), 'FRAGMENT', font=B.font('display', 60), fill=B.BONE)
    d.line([ax, by + 252, W - 110, by + 252], fill=(*B.BONE, 255), width=2)
    block_text(d, (ax, by + 300), 'One box. One numbered fragment of a real work, graded and sealed. The odds '
               'are written on-chain before anyone opens anything, and the Ferryman will buy back whatever '
               'you draw at eighty percent of its mark. Publish what is usually hidden.', 23, 700, B.BONE, 1.22)
    small_caps(d, (W - 110, by + 300), f'{B.fmt_hype(B.BOX_PRICE_HYPE)} HYPE the box', 22, B.ACID, 0.26, anchor='r')  # noqa
    small_caps(d, (W - 110, by + 338), 'On Elysium', 22, B.BONE, 0.26, anchor='r')
    c.alpha_composite(B.barcode(W - 220, 46, B.BONE, seed=1), (110, H - 150))
    lk = B.lockup(64, B.BONE, B.BONE); c.alpha_composite(lk, (W // 2 - lk.width // 2, H - 88))
    B.grain(c.convert('RGB'), 12).save(f'{OUT}/poster-hero.png')
    print('poster')


def _cut_fragment(img, thresh=40):
    """Cut a fresco fragment off its paper ground (border flood on near-paper)."""
    a = np.asarray(img.convert('RGB')).astype(int)
    bg = np.median(np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3)]), axis=0)
    near = np.sqrt(((a - bg) ** 2).sum(axis=2)) < thresh
    lab, _ = ndimage.label(near)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1]); border.discard(0)
    solid = ~np.isin(lab, list(border))
    solid = ndimage.binary_opening(solid, iterations=3)
    lab2, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab2, range(1, n + 1)); solid = lab2 == (1 + int(np.argmax(sizes)))
    solid = ndimage.binary_fill_holes(solid)
    solid = ndimage.binary_erosion(solid, iterations=2)
    al = Image.fromarray((solid * 255).astype('uint8'), 'L').filter(ImageFilter.GaussianBlur(1.2))
    out = img.convert('RGBA'); out.putalpha(al)
    return out.crop(al.getbbox())


BUILDERS = dict(logo=build_logo, slab=build_slab, card=build_card_back, coa=build_coa,
                diagrams=build_diagrams, poster=build_poster)



# ─────────────────────────────────────────────────────────── brand sheet
def build_sheet():
    """One board showing the whole system together. Run last."""
    W, H = 3000, 2100
    c = B.carbon_ground(W, H, seed=77).convert('RGBA')
    d = ImageDraw.Draw(c)

    def put(path, box, xy):
        im = Image.open(os.path.join(ROOT, path)).convert('RGBA')
        im.thumbnail(box, Image.LANCZOS)
        c.alpha_composite(im, xy)
        return im.size

    M = 90
    small_caps(d, (M, 60), f'{B.NAME} — brand system  ·  built from brand/brand.py', 20, B.ASH, 0.3)
    put('assets/poster-hero.png', (760, 1010), (M, 120))
    x = M + 760 + 50
    for i, s in enumerate(['S1-01-fortuna', 'S1-R-muse', 'S1-R-pegasus']):
        put(f'assets/slabs/{s}.webp', (420, 560), (x + i * 440, 120))
    put('assets/social-card-olympian.png', (860, 484), (x, 700))
    put('assets/social-card-hero.png', (430, 242), (x + 880, 700))
    put('assets/social-card-mortal.png', (430, 242), (x + 880, 942))
    x2 = x + 3 * 440 + 30
    put('assets/coa-demo-0068.png', (650, 1010), (x2, 120))
    y = 1200
    put('assets/ladder-table.png', (860, 545), (M, y))
    put('assets/ferryman-desk.png', (860, 545), (M + 880, y))
    put('assets/card-back-BLEED.png', (400, 545), (M + 1760, y))
    # palette + type
    px, py = M + 2200, y
    for i, (name, col) in enumerate([('carbon', B.CARBON), ('graphite', B.GRAPHITE), ('ash', B.ASH), ('bone', B.BONE), ('acid', B.ACID)]):
        name_ = 'seafoam' if name == 'acid' else name
        yy = py + i * 78
        d.rectangle([px, yy, px + 120, yy + 62], fill=(*col, 255), outline=(*B.SMOKE, 255))
        small_caps(d, (px + 140, yy + 8), name_, 18, B.BONE, 0.26)
        d.text((px + 140, yy + 34), B.HEX[name], font=B.font('mono', 18), fill=B.ASH)
    ty = py + 5 * 78 + 20
    d.text((px, ty), 'GFS Didot', font=B.font('display', 54), fill=B.BONE)
    small_caps(d, (px, ty + 74), 'Montserrat  ·  small wide caps', 17, B.BONE, 0.26)
    d.text((px, ty + 106), 'JetBrains Mono 0.35 HYPE', font=B.font('mono', 20), fill=B.ASH)
    lk = B.lockup(110, B.BONE, B.BONE); c.alpha_composite(lk, (M, H - 210))
    s = B.seal(170, B.BONE); c.alpha_composite(s, (M + lk.width + 60, H - 240))
    tile = Image.open(f'{OUT}/favicon-512.png').resize((130, 130), Image.LANCZOS); c.alpha_composite(tile, (M + lk.width + 280, H - 220))
    c.alpha_composite(B.barcode(1500, 36, B.BONE, seed=12), (W - M - 1500, H - 150))
    B.grain(c.convert('RGB'), 7).save(f'{OUT}/brand-sheet.png')
    print('brand sheet')


BUILDERS['sheet'] = build_sheet

if __name__ == '__main__':
    # 'sheet' needs composed slabs and cards (see README); skip it when they are absent
    which = sys.argv[1:] or [k for k in BUILDERS if k != 'sheet']
    for k in which:
        BUILDERS[k]()

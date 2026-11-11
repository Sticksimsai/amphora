#!/usr/bin/env python3
"""Option boards: logo concepts, type pairings, card backs. Pick, then rebuild.
    python3 brand/explore_options.py   ->  assets/options/*.png
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageOps, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[0] = ROOT
from brand import brand as B
from PIL import ImageFont

FS = os.environ.get('FONTSOURCE', '/home/claude/work/fonts/node_modules/@fontsource')
OUT = os.path.join(ROOT, 'assets', 'options')
os.makedirs(OUT, exist_ok=True)


def F(pkg, name, size):
    return ImageFont.truetype(f'{FS}/{pkg}/files/{name}.woff', size)


GREEK = lambda s: F('gfs-didot', 'gfs-didot-greek-400-normal', s)
SS = 2


# ───────────────────────────────────────────────────────────── logo concepts
def _canvas(S):
    m = Image.new('L', (S * SS, S * SS), 0)
    return m, ImageDraw.Draw(m), S * SS


def _bez(p0, p1, p2, p3, n=60):
    return [tuple(((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d) for a, b, c, d in zip(p0, p1, p2, p3))
            for t in [i / n for i in range(n + 1)]]


def _stroke(d, pts, w, k):
    pts = [(x * k, y * k) for x, y in pts]
    d.line(pts, fill=255, width=int(w * k), joint='curve')
    r = w * k / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)


def temple(S):
    m, d, k = _canvas(S)
    d.polygon([(.10*k, .37*k), (.5*k, .11*k), (.90*k, .37*k)], fill=255)
    d.ellipse([.455*k, .225*k, .545*k, .315*k], fill=0)
    d.rectangle([.14*k, .40*k, .86*k, .445*k], fill=255)
    for cx in (.215, .405, .595, .785):
        d.rectangle([(cx-.04)*k, .475*k, (cx+.04)*k, .80*k], fill=255)
    d.rectangle([.12*k, .83*k, .88*k, .87*k], fill=255)
    d.rectangle([.06*k, .895*k, .94*k, .935*k], fill=255)
    return m


def eye(S):
    m, d, k = _canvas(S)
    ts = [i / 80 for i in range(81)]
    up = [(.07 + .86*t, .52 - .25*math.sin(math.pi*t)**.85) for t in ts]
    lo = [(.07 + .86*t, .52 + .21*math.sin(math.pi*t)**.85) for t in ts]
    _stroke(d, up + lo[::-1] + [up[0]], .042, k)
    d.ellipse([.36*k, .36*k, .64*k, .64*k], fill=255)
    d.ellipse([.405*k, .405*k, .595*k, .595*k], fill=0)
    d.ellipse([.45*k, .45*k, .55*k, .55*k], fill=255)
    _stroke(d, [(.12 + .76*t, .37 - .25*math.sin(math.pi*t)**.85) for t in ts], .036, k)
    return m


def sun(S):
    m, d, k = _canvas(S)
    cx, cy = .5, .66
    d.pieslice([(cx-.19)*k, (cy-.19)*k, (cx+.19)*k, (cy+.19)*k], 180, 360, fill=255)
    for i in range(9):
        a = math.radians(180 + i * 22.5)
        long = i % 2 == 0
        r0, r1, hw = .235, (.47 if long else .36), math.radians(4.2)
        d.polygon([((cx + r0*math.cos(a-hw))*k, (cy + r0*math.sin(a-hw))*k),
                   ((cx + r1*math.cos(a))*k, (cy + r1*math.sin(a))*k),
                   ((cx + r0*math.cos(a+hw))*k, (cy + r0*math.sin(a+hw))*k)], fill=255)
    for y, x0, x1 in ((.70, .06, .94), (.775, .22, .78), (.85, .36, .64)):
        d.rectangle([x0*k, y*k, x1*k, (y+.032)*k], fill=255)
    return m


def lyre(S):
    m, d, k = _canvas(S)
    arm = _bez((.40, .80), (.02, .74), (.12, .34), (.30, .12))
    _stroke(d, arm, .05, k); _stroke(d, [(1-x, y) for x, y in arm], .05, k)
    for a in (arm[-1], (1-arm[-1][0], arm[-1][1])):
        d.ellipse([(a[0]-.045)*k, (a[1]-.045)*k, (a[0]+.045)*k, (a[1]+.045)*k], fill=255)
    d.rectangle([.17*k, .245*k, .83*k, .29*k], fill=255)
    for x in (.41, .47, .53, .59):
        d.rectangle([(x-.007)*k, .29*k, (x+.007)*k, .74*k], fill=255)
    d.chord([.30*k, .56*k, .70*k, .94*k], 0, 180, fill=255)
    d.rectangle([.30*k, .72*k, .70*k, .755*k], fill=255)
    return m


def _leaf(d, cx, cy, ang, L, Wd, k):
    pts = []
    for i in range(21):
        t = i / 20; pts.append((t - .5, math.sin(math.pi * t) * .5))
    poly = [(x * L, y * Wd) for x, y in pts] + [(x * L, -y * Wd) for x, y in pts[::-1]]
    ca, sa = math.cos(ang), math.sin(ang)
    d.polygon([((cx + x*ca - y*sa)*k, (cy + x*sa + y*ca)*k) for x, y in poly], fill=255)


def wreath(d, k, cx=.5, cy=.5, r=.36, n=11, L=.15, Wd=.058, span=(14, 158)):
    for side in (1, -1):
        for i in range(n):
            th = math.radians(span[0] + (span[1] - span[0]) * i / (n - 1))
            x, y = cx + side * r * math.sin(th), cy + r * math.cos(th)
            tang = math.atan2(-math.sin(th), side * math.cos(th))
            for tilt in (.5, -.5):
                a = tang + side * tilt
                _leaf(d, x + math.cos(a)*L*.42, y + math.sin(a)*L*.42, a, L, Wd, k)


def laurel_lambda(S):
    m, d, k = _canvas(S)
    wreath(d, k)
    _stroke(d, [(.37, .67), (.5, .31), (.63, .67)], .052, k)
    return m


def meander(S):
    m, d, k = _canvas(S)
    u = .80 / 7; o = .10 + u / 2
    pts = [(0, 6), (0, 0), (6, 0), (6, 6), (2, 6), (2, 2), (4, 2), (4, 4)]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        x0, x1 = sorted((o + ax*u, o + bx*u)); y0, y1 = sorted((o + ay*u, o + by*u))
        d.rectangle([(x0 - u/2)*k, (y0 - u/2)*k, (x1 + u/2)*k, (y1 + u/2)*k], fill=255)
    return m


def bolt(S):
    m, d, k = _canvas(S)
    d.polygon([(x*k, y*k) for x, y in [(.60, .05), (.22, .53), (.45, .53), (.34, .95), (.78, .41), (.55, .41), (.70, .05)]], fill=255)
    return m


def ionic(S):
    m, d, k = _canvas(S)
    d.rectangle([.10*k, .17*k, .90*k, .215*k], fill=255)
    d.rectangle([.24*k, .215*k, .76*k, .262*k], fill=255)
    for sx, sgn in ((.235, -1), (.765, 1)):
        pts = []
        for i in range(181):
            t = i / 180; a = -math.pi/2 + sgn * t * 2.4 * 2 * math.pi; r = .135 * (1 - t) + .012
            pts.append((sx + r*math.cos(a), .35 + r*math.sin(a)))
        _stroke(d, pts, .03, k)
    for x in (.36, .43, .50, .57, .64):
        d.rectangle([(x-.022)*k, .47*k, (x+.022)*k, .88*k], fill=255)
    d.rectangle([.33*k, .40*k, .67*k, .44*k], fill=255)
    d.rectangle([.28*k, .905*k, .72*k, .945*k], fill=255)
    return m


def trident(S):
    m, d, k = _canvas(S)
    d.rectangle([.48*k, .22*k, .52*k, .96*k], fill=255)
    d.polygon([(.5*k, .04*k), (.445*k, .24*k), (.555*k, .24*k)], fill=255)
    side = _bez((.5, .50), (.16, .52), (.21, .34), (.21, .22))
    _stroke(d, side, .042, k); _stroke(d, [(1-x, y) for x, y in side], .042, k)
    for x in (.21, .79):
        d.polygon([(x*k, .07*k), ((x-.05)*k, .25*k), ((x+.05)*k, .25*k)], fill=255)
    d.rectangle([.41*k, .575*k, .59*k, .61*k], fill=255)
    return m


LOGOS = [('A', 'Temple', temple), ('B', 'Eye of the kylix', eye), ('C', 'Helios rising', sun),
         ('D', 'Lyre', lyre), ('E', 'Laurel + Lambda', laurel_lambda), ('F', 'Meander', meander),
         ('G', 'Thunderbolt', bolt), ('H', 'Ionic capital', ionic), ('I', 'Trident', trident)]


def mark(fn, size, color):
    m = fn(size).resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (*color, 0)); out.putalpha(m)
    return out


def caps(d, xy, text, size, fill, track=.28, anchor='l', kind='sans'):
    f = B.font(kind, size); return B.tracked(d, xy, text.upper(), f, fill, size * track, anchor)


def board_logos():
    W, H = 2400, 2500
    c = B.carbon_ground(W, H, seed=5).convert('RGBA'); d = ImageDraw.Draw(c)
    caps(d, (100, 70), 'Amphora — logo directions  ·  pick a letter', 22, B.ASH)
    cw, ch = 733, 760
    wf = F('bodoni-moda', 'bodoni-moda-latin-500-normal', 54)
    for i, (key, name, fn) in enumerate(LOGOS):
        x, y = 100 + (i % 3) * cw, 150 + (i // 3) * ch
        d.rectangle([x, y, x + cw - 40, y + ch - 40], outline=(*B.SMOKE, 255), width=2)
        d.rectangle([x, y, x + 70, y + 70], fill=(*B.ACID, 255))
        d.text((x + 35, y + 35), key, font=B.font('sansb', 34), fill=B.INK, anchor='mm')
        caps(d, (x + 92, y + 26), name, 18, B.BONE)
        c.alpha_composite(mark(fn, 380, B.BONE), (x + (cw - 40 - 380) // 2, y + 100))
        # lockup + tile
        sm = mark(fn, 84, B.BONE); lx = x + 40; ly = y + ch - 40 - 130
        c.alpha_composite(sm, (lx, ly))
        B.tracked(d, (lx + 104, ly + 12), 'AMPHORA', wf, B.BONE, 54 * .14)
        tx = x + cw - 40 - 40 - 96
        d.rectangle([tx, ly - 6, tx + 96, ly + 90], fill=(*B.ACID, 255))
        c.alpha_composite(mark(fn, 76, B.INK), (tx + 10, ly + 4))
    B.grain(c.convert('RGB'), 7).save(f'{OUT}/logo-options.png'); print('logos')


# ─────────────────────────────────────────────────────────────── type board
def mixed(d, xy, text, f_lat, f_grk, fill, track=0):
    x, y = xy
    for ch in text:
        f = f_grk if ord(ch) > 0x36F else f_lat
        d.text((x, y), ch, font=f, fill=fill); x += d.textlength(ch, font=f) + track
    return x


TYPE = [
    ('1', 'Bodoni Moda', 'High-contrast didone. Closest to the poster you sent.', ('bodoni-moda', 'bodoni-moda-latin-500-normal'), False),
    ('2', 'GFS Didot', 'From the Greek Font Society. Has real Greek letters.', ('gfs-didot', 'gfs-didot-latin-400-normal'), True),
    ('3', 'Cormorant Unicase', 'Mixed-case capitals; reads like an inscription.', ('cormorant-unicase', 'cormorant-unicase-latin-500-normal'), False),
    ('4', 'Marcellus', 'Flared Roman capitals. Calm, architectural.', ('marcellus', 'marcellus-latin-400-normal'), False),
    ('5', 'Italiana', 'Hairline elegance. Fashion-poster feel.', ('italiana', 'italiana-latin-400-normal'), False),
    ('6', 'Cinzel Decorative', 'The current face with swash capitals.', ('cinzel-decorative', 'cinzel-decorative-latin-400-normal'), False),
]


def board_type():
    W, rowh = 2400, 400
    H = 170 + rowh * len(TYPE) + 60
    c = B.carbon_ground(W, H, seed=9).convert('RGBA'); d = ImageDraw.Draw(c)
    caps(d, (100, 70), 'Amphora — display type  ·  pick a number  ·  small copy stays Montserrat, figures stay mono', 22, B.ASH)
    for i, (key, name, note, (pkg, file), greek) in enumerate(TYPE):
        y = 170 + i * rowh
        d.line([100, y, W - 100, y], fill=(*B.SMOKE, 255), width=2)
        d.rectangle([100, y + 34, 170, y + 104], fill=(*B.ACID, 255))
        d.text((135, y + 69), key, font=B.font('sansb', 34), fill=B.INK, anchor='mm')
        caps(d, (100, y + 130), name, 18, B.BONE); caps(d, (100, y + 164), note, 13, B.ASH, .12)
        big = F(pkg, file, 150)
        txt = 'AMPHORA' if name != 'Cormorant Unicase' else 'Amphora'
        B.tracked(d, (560, y + 26), txt, big, B.BONE, 150 * .06)
        if greek:
            mixed(d, (1560, y + 44), 'ΑΜΦΟΡΑ', big.font_variant(size=120), GREEK(120), B.ASH, 8)
        hf = F(pkg, file, 78)
        a = 'Draw a' if name == 'Cormorant Unicase' else 'DRAW A'
        b = 'Fragment' if name == 'Cormorant Unicase' else 'FRAGMENT'
        d.text((560, y + 232), a, font=hf, fill=B.BONE)
        wa = d.textlength(a, font=hf); wb = d.textlength(b, font=hf)
        d.rectangle([560 + wa + 24, y + 236, 560 + wa + 24 + wb + 36, y + 236 + 104], fill=(*B.ACID, 255))
        d.text((560 + wa + 42, y + 232), b, font=hf, fill=B.INK)
        sf = F(pkg, file, 46)
        x = 1560
        for cls in ('Mortal', 'Hero', 'Olympian'):
            t = cls if name == 'Cormorant Unicase' else cls.upper()
            d.text((x, y + 262), t, font=sf, fill=B.BONE); x += d.textlength(t, font=sf) + 46
    B.grain(c.convert('RGB'), 7).save(f'{OUT}/type-options.png'); print('type')


# ─────────────────────────────────────────────────────────────── card backs
CW, CH = 822, 1122


def _wordmark_both_ends(c, f, color=B.BONE, y=92):
    t = Image.new('RGBA', (CW, 90), (0, 0, 0, 0))
    B.tracked(ImageDraw.Draw(t), (CW // 2, 8), 'AMPHORA', f, color, f.size * .3, anchor='m')
    c.alpha_composite(t, (0, y)); c.alpha_composite(t.rotate(180), (0, CH - y - 90))


def back_constellation():
    import random
    rnd = random.Random(4)
    c = B.carbon_ground(CW, CH, seed=14).convert('RGBA'); d = ImageDraw.Draw(c)
    cx, cy = CW // 2, CH // 2
    for _ in range(170):
        x, y, r = rnd.uniform(40, CW - 40), rnd.uniform(40, CH - 40), rnd.choice([1, 1, 1, 2])
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*B.BONE, rnd.randint(70, 200)))
    for R, w in ((330, 2), (296, 1), (150, 1)):
        d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(*B.BONE, 255), width=w)
    for i in range(96):
        a = math.radians(i * 3.75); r0, r1 = 296, (318 if i % 4 == 0 else 306)
        d.line([cx + r0*math.cos(a), cy + r0*math.sin(a), cx + r1*math.cos(a), cy + r1*math.sin(a)], fill=(*B.BONE, 255), width=1)
    ring = B.ring_text(760, 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ', GREEK(30), (*B.BONE, 255), 262)
    c.alpha_composite(ring, (cx - 380, cy - 380))
    B.orbit(c, (cx - 400, cy - 120, cx + 400, cy + 120), B.BONE, 2, tilt=-24)
    # Pegasus, as star-map: the great square, neck and forelegs
    P = {'a': (-.05, -.30), 'b': (.36, -.22), 'c': (.30, .16), 'd': (-.12, .10), 'e': (-.42, -.06), 'f': (-.66, -.20),
         'g': (-.80, -.02), 'h': (.52, .40), 'i': (.74, .30), 'j': (.10, .46), 'k': (.02, .70)}
    pt = lambda n: (cx + P[n][0] * 215, cy + P[n][1] * 215)
    for a, b in ['ab', 'bc', 'cd', 'da', 'de', 'ef', 'fg', 'ch', 'hi', 'cj', 'jk']:
        d.line([pt(a), pt(b)], fill=(*B.ACID, 255), width=2)
    for n in P:
        x, y = pt(n); s = B.sparkle(34 if n in 'abcd' else 22, B.BONE); c.alpha_composite(s, (int(x - s.width/2), int(y - s.height/2)))
    caps(d, (cx, cy + 176), 'Pegasus', 13, B.ASH, .5, anchor='m')
    for (x, y) in ((70, 70), (CW - 70, 70), (70, CH - 70), (CW - 70, CH - 70)):
        s = B.sunburst(56, B.BONE); c.alpha_composite(s, (x - 28, y - 28))
    _wordmark_both_ends(c, F('gfs-didot', 'gfs-didot-latin-400-normal', 44))
    return B.grain(c.convert('RGB'), 9)


def back_helios():
    c = B.carbon_ground(CW, CH, seed=15).convert('RGBA'); d = ImageDraw.Draw(c)
    c.alpha_composite(B.meander_frame(CW - 100, CH - 100, 40, B.BONE), (50, 50))
    cx, cy = CW // 2, CH // 2
    for i in range(48):
        a = math.radians(i * 7.5); long = i % 2 == 0
        r0, r1, hw = 150, (372 if long else 250), math.radians(1.7 if long else 1.2)
        r1 = min(r1, 300 / max(abs(math.cos(a)), .001)) if long else r1
        d.polygon([(cx + r0*math.cos(a-hw), cy + r0*math.sin(a-hw)), (cx + r1*math.cos(a), cy + r1*math.sin(a)),
                   (cx + r0*math.cos(a+hw), cy + r0*math.sin(a+hw))], fill=(*B.BONE, 255))
    d.ellipse([cx - 128, cy - 128, cx + 128, cy + 128], fill=(*B.ACID, 255))
    d.ellipse([cx - 112, cy - 112, cx + 112, cy + 112], outline=(*B.INK, 255), width=2)
    c.alpha_composite(mark(eye, 170, B.INK), (cx - 85, cy - 85))
    mb = B.meander_band(420, 26, B.BONE, rules=False)
    c.alpha_composite(mb, (cx - 210, 206)); c.alpha_composite(mb.rotate(180), (cx - 210, CH - 232))
    _wordmark_both_ends(c, F('bodoni-moda', 'bodoni-moda-latin-500-normal', 46), y=116)
    return B.grain(c.convert('RGB'), 9)


def back_muse():
    c = B.carbon_ground(CW, CH, seed=16).convert('RGBA'); d = ImageDraw.Draw(c)
    d.rectangle([52, 52, CW - 52, CH - 52], outline=(*B.BONE, 255), width=2)
    d.rectangle([64, 64, CW - 64, CH - 64], outline=(*B.BONE, 255), width=1)
    cx, cy, R = CW // 2, CH // 2, 205
    art = Image.open(os.path.join(ROOT, 'assets/art/S1-R-muse.png')).convert('RGB').crop((176, 150, 796, 770))
    g = ImageOps.autocontrast(ImageOps.grayscale(art), cutoff=1)
    g = Image.merge('RGB', (g, g, g)).resize((2 * R, 2 * R), Image.LANCZOS).convert('RGBA')
    mk = Image.new('L', (4 * R, 4 * R), 0); ImageDraw.Draw(mk).ellipse([0, 0, 4 * R - 1, 4 * R - 1], fill=255)
    g.putalpha(mk.resize((2 * R, 2 * R), Image.LANCZOS)); c.alpha_composite(g, (cx - R, cy - R))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(*B.ACID, 255), width=6)
    S = 760; k = S * SS
    m = Image.new('L', (k, k), 0); wreath(ImageDraw.Draw(m), k, r=.385, n=15, L=.105, Wd=.04, span=(10, 166))
    lw = Image.new('RGBA', (S, S), (*B.BONE, 0)); lw.putalpha(m.resize((S, S), Image.LANCZOS))
    c.alpha_composite(lw, (cx - S // 2, cy - S // 2))
    c.alpha_composite(B.sparkle(46, B.BONE), (cx - 23, cy - 330))
    for yy, fn in ((150, lyre), (CH - 150 - 90, lyre)):
        pass
    cols = [(120, 300), (CW - 120, 300)]
    for x, _ in cols:
        for dx in (-18, -6, 6, 18):
            d.line([x + dx, 250, x + dx, CH - 250], fill=(*B.BONE, 150), width=3)
        d.rectangle([x - 34, 232, x + 34, 246], fill=(*B.BONE, 255)); d.rectangle([x - 34, CH - 246, x + 34, CH - 232], fill=(*B.BONE, 255))
    _wordmark_both_ends(c, F('marcellus', 'marcellus-latin-400-normal', 46), y=104)
    return B.grain(c.convert('RGB'), 9)


def board_backs():
    backs = [('X', 'Star map — Pegasus among the Greek alphabet', back_constellation()),
             ('Y', 'Helios — radiate sun in a meander frame', back_helios()),
             ('Z', 'The Muse — greyscale tondo in laurel, between columns', back_muse())]
    W, H = 3 * CW + 4 * 90, CH + 300
    c = B.carbon_ground(W, H, seed=3, lift=1.6).convert('RGBA'); d = ImageDraw.Draw(c)
    caps(d, (90, 60), 'Amphora — card back directions  ·  pick a letter', 22, B.ASH)
    for i, (key, name, im) in enumerate(backs):
        x = 90 + i * (CW + 90)
        im.save(f'{OUT}/card-back-{key}.png')
        c.paste(im, (x, 130)); d.rectangle([x, 130, x + CW, 130 + CH], outline=(*B.SMOKE, 255), width=2)
        d.rectangle([x, 130 + CH + 30, x + 70, 130 + CH + 100], fill=(*B.ACID, 255))
        d.text((x + 35, 130 + CH + 65), key, font=B.font('sansb', 34), fill=B.INK, anchor='mm')
        caps(d, (x + 92, 130 + CH + 54), name, 15, B.BONE, .16)
    c.convert('RGB').save(f'{OUT}/card-back-options.png'); print('backs')


if __name__ == '__main__':
    board_logos(); board_type(); board_backs()

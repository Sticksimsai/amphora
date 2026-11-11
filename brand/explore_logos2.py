#!/usr/bin/env python3
"""Logo round 2: typographic, hairline, restrained.  -> assets/options/logo-options-2.png"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); sys.path[0] = ROOT
from brand import brand as B
FS = os.environ.get('FONTSOURCE', '/home/claude/work/fonts/node_modules/@fontsource')
K = 2
def F(pkg, name, size): return ImageFont.truetype(f'{FS}/{pkg}/files/{name}.woff', int(size * K))
BOD = lambda s: F('bodoni-moda', 'bodoni-moda-latin-400-normal', s)
BODI = lambda s: F('bodoni-moda', 'bodoni-moda-latin-400-italic', s)
DID = lambda s: F('gfs-didot', 'gfs-didot-latin-400-normal', s)
GRK = lambda s: F('gfs-didot', 'gfs-didot-greek-400-normal', s)
SANS = lambda s: ImageFont.truetype(os.path.join(ROOT, 'fonts/Montserrat-Medium.ttf'), int(s * K))
BONE = (*B.BONE, 255)

def text(d, cx, y, s, lat, grk=None, track=0, fill=BONE, anchor='m'):
    """Tracked text at baseline y, centred on cx. Greek chars use grk."""
    fs = [(grk if (grk and ord(c) > 0x36F) else lat) for c in s]
    ws = [d.textlength(c, font=f) for c, f in zip(s, fs)]
    tr = track * lat.size
    tot = sum(ws) + tr * (len(s) - 1)
    x = cx * K - tot / 2 if anchor == 'm' else cx * K
    for c, f, w in zip(s, fs, ws):
        d.text((x, y * K), c, font=f, fill=fill, anchor='ls'); x += w + tr
    return tot / K

def line(d, pts, w=1.6, fill=BONE):
    d.line([(x * K, y * K) for x, y in pts], fill=fill, width=max(1, round(w * K)), joint='curve')

def ring(d, cx, cy, r, w=1.6, fill=BONE):
    d.ellipse([(cx - r) * K, (cy - r) * K, (cx + r) * K, (cy + r) * K], outline=fill, width=max(1, round(w * K)))

def bez(p0, p1, p2, p3, n=60):
    return [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*e for a, b, c, e in zip(p0, p1, p2, p3)) for t in [i/n for i in range(n+1)]]

def star(d, cx, cy, r, fill=BONE):
    pts = []
    for i in range(8):
        a = math.radians(i * 45 - 90); rr = r * (1 if i % 2 == 0 else .14)
        pts.append(((cx + rr * math.cos(a)) * K, (cy + rr * math.sin(a)) * K))
    d.polygon(pts, fill=fill)

def eye(d, cx, cy, w, sw=1.6):
    ts = [i / 80 for i in range(81)]
    up = [(cx - w/2 + w*t, cy - .27*w*math.sin(math.pi*t)**.9) for t in ts]
    lo = [(cx - w/2 + w*t, cy + .20*w*math.sin(math.pi*t)**.9) for t in ts]
    line(d, up, sw); line(d, lo, sw)
    ring(d, cx, cy - .03*w, .135*w, sw)
    r = .045 * w; d.ellipse([(cx - r)*K, (cy - .03*w - r)*K, (cx + r)*K, (cy - .03*w + r)*K], fill=BONE)

def small(d, cx, y, s, size=11, fill=(*B.ASH, 255), track=.42):
    text(d, cx, y, s, SANS(size), track=track, fill=fill)

# each concept draws around (cx, cy) in a 760x520 field
def c1(d, cx, cy):
    text(d, cx, cy + 24, 'ΛMPHORΛ', DID(78), GRK(78), .2)
    small(d, cx, cy + 74, 'FRAGMENTS OF THE FRESCO')

def c2(d, cx, cy):
    ring(d, cx, cy - 40, 96, 1.4)
    text(d, cx, cy + 18, 'Φ', GRK(150), GRK(150))
    text(d, cx, cy + 118, 'AMPHORA', DID(26), track=.5)

def c3(d, cx, cy):
    f = BOD(84); tr = .16 * f.size
    wa = sum(d.textlength(c, font=f) for c in 'AMPH') + tr * 4
    wb = sum(d.textlength(c, font=f) for c in 'RA') + tr
    R = 30 * K
    tot = wa + 2 * R + tr + wb; x = cx * K - tot / 2; y = (cy + 28) * K
    for c in 'AMPH':
        d.text((x, y), c, font=f, fill=BONE, anchor='ls'); x += d.textlength(c, font=f) + tr
    ocx, ocy = (x + R) / K, (cy + 28) - 30
    ring(d, ocx, ocy, 30, 1.5); star(d, ocx, ocy, 13)
    x += 2 * R + tr
    for c in 'RA':
        d.text((x, y), c, font=f, fill=BONE, anchor='ls'); x += d.textlength(c, font=f) + tr

def c4(d, cx, cy):
    w, h, top = 150, 215, cy - 150
    arc = [(cx - w/2 * math.cos(math.radians(a)), top + w/2 - w/2 * math.sin(math.radians(a))) for a in range(0, 181, 3)]
    line(d, [(cx - w/2, top + h)] + arc + [(cx + w/2, top + h)], 1.5)
    text(d, cx, top + h - 16, 'A', BOD(150))
    star(d, cx, top - 16, 9)
    text(d, cx, cy + 122, 'AMPHORA', BOD(24), track=.55)

def c5(d, cx, cy):
    prof = B._profile(160); H = 230; top = cy - 150
    R = [(cx + w * H, top + y * H) for y, w in prof]; L = [(cx - w * H, top + y * H) for y, w in reversed(prof)]
    line(d, R + L + [R[0]], 1.5)
    hr = [(cx + x * H, top + y * H) for x, y in bez((.092, .100), (.33, .03), (.345, .245), (.262, .352))]
    line(d, hr, 1.5); line(d, [(2 * cx - x, y) for x, y in hr], 1.5)
    import bisect
    ys = [p[0] for p in prof]
    for yy in (.40, .43, .62):
        w_ = prof[min(len(prof) - 1, bisect.bisect_left(ys, yy))][1]
        line(d, [(cx - w_ * H, top + yy * H), (cx + w_ * H, top + yy * H)], 1.1)
    text(d, cx, cy + 132, 'AMPHORA', DID(24), track=.55)

def c6(d, cx, cy):
    text(d, cx, cy + 6, 'Amphora', BODI(104))
    stem = bez((cx - 150, cy + 62), (cx - 60, cy + 84), (cx + 60, cy + 84), (cx + 150, cy + 62), 80)
    line(d, stem, 1.2)
    for i in list(range(4, 36, 7)) + list(range(48, 80, 7)):
        x, y = stem[i]; dx, dy = stem[i + 1][0] - x, stem[i + 1][1] - y; a = math.atan2(dy, dx)
        for s in (1, -1):
            b = a + math.pi + s * .55 if i < 40 else a - s * .55
            L_, Wd = 26, 4.2; pts = []
            for j in range(13):
                t = j / 12; pts.append((t * L_, math.sin(math.pi * t) * Wd))
            poly = pts + [(px, -py) for px, py in pts[::-1]]
            d.polygon([((x + px * math.cos(b) - py * math.sin(b)) * K, (y + px * math.sin(b) + py * math.cos(b)) * K) for px, py in poly], fill=BONE)

def c7(img, d, cx, cy):
    R = 132; cy -= 10
    ring(d, cx, cy, R, 1.5); ring(d, cx, cy, R - 34, 1.0)
    rt = B.ring_text(2 * R * K, 'AMPHORA  ·  FRAGMENTS OF THE FRESCO  ·  ', DID(15.5), BONE, (R - 17) * K)
    img.alpha_composite(rt, (int((cx - R) * K), int((cy - R) * K)))
    eye(d, cx, cy + 4, 120, 1.4)

def c8(d, cx, cy):
    eye(d, cx, cy - 50, 190, 1.6)
    text(d, cx, cy + 86, 'AMPHORA', BOD(40), track=.42)
    line(d, [(cx - 22, cy + 112), (cx + 22, cy + 112)], 1.0)

NAMES = ['Lambda wordmark', 'Phi monogram', 'Sun in the O', 'A under the arch',
         'Line-drawn amphora', 'Italic with laurel sprig', 'Seal with eye', 'Hairline eye']

def main():
    CW, CHh, M = 760, 640, 80
    W, H = 2 * M + 4 * CW, 150 + 2 * CHh + 60
    img = B.carbon_ground(W * K, H * K, seed=6).convert('RGBA'); d = ImageDraw.Draw(img)
    text(d, M, 84, 'AMPHORA — LOGO DIRECTIONS, ROUND 2  ·  PICK A NUMBER', SANS(15), track=.28, fill=(*B.ASH, 255), anchor='l')
    fns = [c1, c2, c3, c4, c5, c6, c7, c8]
    for i, fn in enumerate(fns):
        x, y = M + (i % 4) * CW, 150 + (i // 4) * CHh
        d.rectangle([x * K, y * K, (x + CW - 30) * K, (y + CHh - 30) * K], outline=(*B.SMOKE, 255), width=K)
        d.rectangle([x * K, y * K, (x + 52) * K, (y + 52) * K], fill=(*B.ACID, 255))
        d.text(((x + 26) * K, (y + 26) * K), str(i + 1), font=ImageFont.truetype(os.path.join(ROOT, 'fonts/Montserrat-SemiBold.ttf'), 26 * K), fill=B.INK, anchor='mm')
        text(d, x + 70, y + 32, NAMES[i].upper(), SANS(13), track=.28, anchor='l')
        cx, cy = x + (CW - 30) / 2, y + (CHh - 30) / 2 + 10
        if fn is c7: fn(img, d, cx, cy)
        else: fn(d, cx, cy)
    out = img.resize((W, H), Image.LANCZOS)
    os.makedirs(os.path.join(ROOT, 'assets/options'), exist_ok=True)
    B.grain(out.convert('RGB'), 6).save(os.path.join(ROOT, 'assets/options/logo-options-2.png'))

if __name__ == '__main__': main()

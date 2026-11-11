#!/usr/bin/env python3
"""
Amphora brand kit — one source of truth for palette, type and drawn marks.

Every branded asset (slab label, seals, card back, certificate, social cards,
diagrams) is drawn from the primitives here, so nothing is a traced or
photographed logo: the monogram, the meander and the laurel are all computed.
Change NAME / the palette here and rebuild; nothing else hardcodes them.

    from brand import brand as B
    B.lockup(120)                -> the ΛMPHORΛ wordmark, RGBA
    B.meander_band(1200, 36, B.BONE)
    B.seal(600, B.BONE)
"""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.join(ROOT, 'fonts')

# ── identity ────────────────────────────────────────────────────────────────
NAME = 'Amphora'
WORDMARK = 'ΛMPHORΛ'          # both A's set as the Greek lambda
WORDMARK_PLAIN = 'AMPHORA'    # where Greek glyphs are unavailable (mono, URLs, alt text)
TICKER = 'AMPH'
CERT_NOUN = 'Sherd'
DOMAIN = 'amphora.example'          # placeholder — set your real domain
CHAIN = 'Elysium'
CURRENCY = 'HYPE'

# ── palette ─────────────────────────────────────────────────────────────────
# A printed poster: grainy near-black, bone-white type and hairlines, and ONE
# colour, a pale seafoam in Hyperliquid's family. It appears as type and as
# hairlines. No filled blocks. (The variable is still called ACID.)
# The frescos supply all the other colour. Statues and stone go greyscale.
def _env_rgb(key, default):
    """Palette override for trying colourways: AMPHORA_ACCENT=#97FCE4 python3 brand/build_assets.py"""
    v = os.environ.get(key, '').lstrip('#')
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4)) if len(v) == 6 else default


CARBON   = _env_rgb('AMPHORA_GROUND', (16, 19, 18))       # #101312  page ground (a breath of green)
GRAPHITE = (30, 30, 28)       # #1E1E1C  raised surface
SMOKE    = (58, 58, 54)       # #3A3A36  rules on dark, disabled
ASH      = (150, 150, 144)    # #969690  secondary text, the dot grid
BONE     = (236, 233, 224)    # #ECE9E0  primary text, hairlines
ACID     = _env_rgb('AMPHORA_ACCENT', (200, 246, 231))    # #C8F6E7  SEAFOAM, the one accent. Line and type only, never a fill.
INK      = (17, 17, 16)       # type on acid / on bone
UP       = (93, 202, 165)     # #5DCAA5  positive figures only

HEX = {k: '#%02X%02X%02X' % v for k, v in dict(
    carbon=CARBON, graphite=GRAPHITE, smoke=SMOKE, ash=ASH, bone=BONE, acid=ACID, up=UP).items()}

# ── classes ─────────────────────────────────────────────────────────────────
# Ratios of the box price; the ladder survives any reprice unchanged.
CLASSES = {
    'MORTAL':   dict(label='Mortal',   grade='VII', edition=300, ppm=978_392, mark_x=0.7, odds='',         accent=BONE),
    'HERO':     dict(label='Hero',     grade='X',   edition=25,  ppm=19_608,  mark_x=2.1, odds='1 IN 51',  accent=ACID),
    'OLYMPIAN': dict(label='Olympian', grade='Ω',   edition=5,   ppm=2_000,   mark_x=7.0, odds='1 IN 500', accent=ACID),
}
BOX_PRICE_HYPE = float(os.environ.get('BOX_PRICE_HYPE', '0.5'))
DESK_RATE = 0.80


def mark_hype(cls, box=None):
    return round((box or BOX_PRICE_HYPE) * CLASSES[cls]['mark_x'], 6)


def desk_hype(cls, box=None):
    return round(mark_hype(cls, box) * DESK_RATE, 6)


def fmt_hype(v):
    s = f'{v:.4f}'.rstrip('0').rstrip('.')
    return s if '.' in s and len(s.split('.')[1]) >= 2 else f'{v:.2f}'


# ── type ────────────────────────────────────────────────────────────────────
_FALLBACK = {
    'display': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    'serif':   '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    'italic':  '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf',
    'mono':    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    'monob':   '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
}
_FILES = {
    # GFS Didot (Greek Font Society): one weight. Hierarchy comes from size only.
    'display':  'GFSDidot-Regular.ttf',
    'displaym': 'GFSDidot-Regular.ttf',
    'displayr': 'GFSDidot-Regular.ttf',
    'displayb': 'GFSDidot-Regular.ttf',
    'greek':    'GFSDidot-Greek.ttf',             # Λ in the wordmark, Ω on the Olympian grade
    'serif':    'CormorantGaramond-Regular.ttf',
    'italic':   'CormorantGaramond-Italic.ttf',   # signatures only
    'italicl':  'CormorantGaramond-LightItalic.ttf',
    'sans':     'Montserrat-Medium.ttf',          # small wide uppercase copy
    'sansb':    'Montserrat-SemiBold.ttf',
    'sansr':    'Montserrat-Regular.ttf',
    'mono':     'JetBrainsMono-Regular.ttf',      # labels, figures
    'monob':    'JetBrainsMono-Bold.ttf',
}

_GK = {}


def _cf(ch, f):
    """Font for one character: Greek letters fall back to the Greek cut at the same size."""
    if not (0x370 <= ord(ch) <= 0x3FF) or 'Greek' in str(getattr(f, 'path', '')):
        return f
    k = int(f.size)
    if k not in _GK:
        _GK[k] = font('greek', k)
    return _GK[k]


def font(kind, size):
    p = os.path.join(FONTS, _FILES.get(kind, ''))
    if os.path.exists(p):
        return ImageFont.truetype(p, size)
    fb = _FALLBACK.get(kind.rstrip('rbl') if kind not in _FALLBACK else kind, _FALLBACK['mono'])
    return ImageFont.truetype(fb, size) if os.path.exists(fb) else ImageFont.load_default()


def tracked(d, xy, text, f, fill, track=0, anchor='l'):
    """Letter-spaced text. anchor 'l' | 'm' | 'r' on x; y is the top."""
    w = tracked_width(d, text, f, track)
    x, y = xy
    if anchor == 'm': x -= w / 2
    elif anchor == 'r': x -= w
    for ch in text:
        cf = _cf(ch, f)
        d.text((x, y), ch, font=cf, fill=fill)
        x += d.textlength(ch, font=cf) + track
    return w


def tracked_width(d, text, f, track=0):
    return sum(d.textlength(ch, font=_cf(ch, f)) for ch in text) + track * (len(text) - 1)


# ── the monogram: a neck-amphora with one sherd lifted out ──────────────────
# Half-profile as (y, half-width) in a unit box, y down. The body is smoothed;
# lip and foot stay crisp.
_BODY = [(0.085, 0.100), (0.150, 0.088), (0.225, 0.094), (0.275, 0.135), (0.320, 0.215),
         (0.385, 0.300), (0.455, 0.338), (0.530, 0.325), (0.640, 0.262), (0.750, 0.180),
         (0.850, 0.105), (0.915, 0.066)]
_LIP = [(0.000, 0.165), (0.030, 0.178), (0.052, 0.150), (0.085, 0.100)]
_FOOT = [(0.915, 0.066), (0.935, 0.078), (0.958, 0.135), (1.000, 0.150)]


def _profile(n=120):
    from scipy.interpolate import PchipInterpolator
    ys = [p[0] for p in _BODY]; ws = [p[1] for p in _BODY]
    f = PchipInterpolator(ys, ws)
    body = [(y, float(f(y))) for y in [ys[0] + (ys[-1] - ys[0]) * i / n for i in range(n + 1)]]
    return _LIP[:-1] + body + _FOOT[1:]


def _bezier(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return out


_HANDLE = ((0.092, 0.100), (0.330, 0.030), (0.345, 0.245), (0.262, 0.352))   # right side, x from centre
_HANDLE_W = 0.034
# The lifted sherd: a wedge of the belly, cut on two jagged lines and nudged out.
_SHERD = [(0.02, 0.50), (0.11, 0.455), (0.19, 0.50), (0.40, 0.44), (0.40, 0.70), (0.13, 0.70), (0.06, 0.63)]
_SHERD_SHIFT = (0.045, -0.030)
_GAP = 0.016


def monogram_shapes():
    """Unit-space polygons: (body, [handle strokes], sherd polygon). x is centred on 0."""
    prof = _profile()
    body = [(w, y) for y, w in prof] + [(-w, y) for y, w in reversed(prof)]
    hr = _bezier(*_HANDLE)
    hl = [(-x, y) for x, y in hr]
    return body, [hr, hl]


def monogram(size, color=BONE, sherd=True, ss=2):
    """The short mark: the wordmark's Λ alone, on a transparent square."""
    S = size * ss
    m = Image.new('L', (S, S), 0)
    f = font('greek', int(S * 0.92))
    bb = f.getbbox('Λ')
    ImageDraw.Draw(m).text((S / 2 - (bb[0] + bb[2]) / 2, S / 2 - (bb[1] + bb[3]) / 2), 'Λ', font=f, fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (*color[:3], 0)); out.putalpha(m)
    return out


def _glyph_paths(text, track=0.2):
    """Outline `text` from the font files as one SVG path. Returns (d, width, height)."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    lat = TTFont(os.path.join(FONTS, _FILES['display'])); grk = TTFont(os.path.join(FONTS, _FILES['greek']))
    x, parts, cap = 0, [], 0
    for ch in text:
        ft = grk if ord(ch) > 0x36F else lat
        gs, name = ft.getGlyphSet(), ft.getBestCmap()[ord(ch)]
        upm = ft['head'].unitsPerEm; k = 1000 / upm
        capH = getattr(ft['OS/2'], 'sCapHeight', 0) or 700
        cap = max(cap, capH * k)
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        parts.append(pen.getCommands())
        x += gs[name].width * k + track * 1000
    return ' '.join(parts), x - track * 1000, cap


def wordmark_svg(color=None, text=None):
    color = color or HEX['bone']
    d, w, cap = _glyph_paths(text or WORDMARK)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {-cap:.0f} {w:.0f} {cap:.0f}" fill="{color}">'
            f'<title>{NAME}</title><path d="{d}"/></svg>')


def monogram_svg(color=None, sherd=True):
    return wordmark_svg(color, 'Λ')


# ── the meander (Greek key) ─────────────────────────────────────────────────
def meander_band(width, height, color=BONE, rules=True, ss=3):
    """A horizontal Greek-key frieze: square spirals standing on a rule.
    Returned as RGBA of exactly (width, height); units are whole so it never
    ends on a broken key."""
    W, H = width * ss, height * ss
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    rule = max(1, round(H * 0.07)) if rules else 0
    inner = H - 2 * rule - (2 * round(H * 0.13) if rules else 0)
    top = (H - inner) / 2
    u = inner / 5.0                       # key is 5 units tall, stroke 1 unit
    period = 7 * u
    n = max(1, int(W // period))
    x0 = (W - n * period + u) / 2         # centre the run
    for k in range(n):
        X = x0 + k * period
        P = lambda gx, gy: (X + gx * u, top + gy * u)
        # one key: up, across, down, back, up, in — a squared spiral
        segs = [((0, 5), (0, 0)), ((0, 0), (5, 0)), ((5, 0), (5, 4)), ((5, 4), (2, 4)),
                ((2, 4), (2, 2)), ((2, 2), (3.5, 2))]
        for a, b in segs:
            (ax, ay), (bx, by) = P(*a), P(*b)
            xa, xb = sorted((ax, bx)); ya, yb = sorted((ay, by))
            d.rectangle([xa, ya, xb + (u if ax == bx else 0) - 1, yb + (u if ay == by else 0) - 1], fill=255)
        # the foot that carries the line on to the next key
        fx0, fy = P(0, 5)[0], P(0, 5)[1]
        d.rectangle([fx0 - (2 * u if k else 0), fy, fx0 + u - 1, fy + u - 1], fill=255) if False else None
    # baseline joining the keys
    by = top + 5 * u
    d.rectangle([x0, by - u, x0 + (n - 1) * period + u - 1, by - 1], fill=0)  # keep the feet crisp
    for k in range(n):
        X = x0 + k * period
        d.rectangle([X, top, X + u - 1, by - 1], fill=255)
        if k < n - 1:
            d.rectangle([X + 5 * u, by - u, X + period + u - 1, by - 1], fill=255)
    if rules:
        d.rectangle([0, 0, W, rule - 1], fill=255)
        d.rectangle([0, H - rule, W, H], fill=255)
    img = img.resize((width, height), Image.LANCZOS)
    out = Image.new('RGBA', (width, height), (*color[:3], 0))
    out.putalpha(img)
    return out


def meander_frame(w, h, band, color=BONE, margin=0):
    """A rectangular meander border (four friezes) on a transparent canvas."""
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    hb = meander_band(w - 2 * margin - 2 * band, band, color)
    vb = meander_band(h - 2 * margin - 2 * band, band, color).rotate(90, expand=True)
    out.alpha_composite(hb, (margin + band, margin))
    out.alpha_composite(hb.transpose(Image.FLIP_TOP_BOTTOM), (margin + band, h - margin - band))
    out.alpha_composite(vb, (margin, margin + band))
    out.alpha_composite(vb.transpose(Image.FLIP_LEFT_RIGHT), (w - margin - band, margin + band))
    # plain corner blocks: a small square within a square
    d = ImageDraw.Draw(out)
    t = max(1, round(band * 0.07))
    for cx, cy in [(margin, margin), (w - margin - band, margin), (margin, h - margin - band), (w - margin - band, h - margin - band)]:
        d.rectangle([cx, cy, cx + band - 1, cy + band - 1], outline=(*color[:3], 255), width=t)
        q = band * 0.3
        d.rectangle([cx + q, cy + q, cx + band - q - 1, cy + band - q - 1], fill=(*color[:3], 255))
    return out


# ── laurel + seal ───────────────────────────────────────────────────────────
def laurel(size, color=BONE, r=0.40, leaves=13, leaf=(0.105, 0.036), span=(118, 262), ss=3):
    """Two branches of laurel, open at the top, meeting at the foot."""
    S = size * ss
    img = Image.new('L', (S, S), 0)
    c = S / 2
    lw, lh = leaf[0] * S, leaf[1] * S
    for side in (1, -1):
        for i in range(leaves):
            t = i / (leaves - 1)
            ang = math.radians(span[0] + (span[1] - span[0]) * t)      # 0 = up, clockwise
            for inner, tilt in ((1, 26), (-1, -26)):
                rr = (r + inner * -0.022) * S
                x = c + side * rr * math.sin(ang)
                y = c - rr * math.cos(ang)
                L = Image.new('L', (int(lw * 2), int(lw * 2)), 0)
                ld = ImageDraw.Draw(L)
                m = lw
                ld.polygon([(m - lw / 2, m), (m - lw * 0.1, m - lh / 2), (m + lw / 2, m),
                            (m - lw * 0.1, m + lh / 2)], fill=255)
                ld.ellipse([m - lw / 2, m - lh / 2, m + lw * 0.32, m + lh / 2], fill=255)
                # leaf points back toward the top of the wreath, splayed in/out
                deg = -math.degrees(ang) * side + 90 * side + side * tilt * inner
                L = L.rotate(deg, resample=Image.BICUBIC)
                img.paste(255, (int(x - m), int(y - m)), L)
    d = ImageDraw.Draw(img)
    # the tie
    d.ellipse([c - S * 0.014, c + r * S - S * 0.014, c + S * 0.014, c + r * S + S * 0.014], fill=255)
    img = img.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (*color[:3], 0))
    out.putalpha(img)
    return out


def ring_text(size, text, f, color, radius, start_deg=-90):
    """Text set on a circle, reading clockwise, centred at the top."""
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = size / 2
    tmp = ImageDraw.Draw(Image.new('L', (4, 4)))
    widths = [tmp.textlength(ch, font=_cf(ch, f)) for ch in text]
    total = sum(widths)
    track = (2 * math.pi * radius - total) / len(text)
    ang = math.radians(start_deg) - (total + track * len(text)) / (2 * radius) * 0  # full circle
    pos = 0.0
    box = int(f.size * 2.2)
    for ch, wch in zip(text, widths):
        a = math.radians(start_deg) + (pos + wch / 2) / radius
        rb = radius - f.size * 0.34      # glyphs sit on a common baseline
        x, y = c + rb * math.cos(a), c + rb * math.sin(a)
        g = Image.new('RGBA', (box, box), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((box / 2, box / 2), ch, font=_cf(ch, f), fill=color, anchor='ms')
        g = g.rotate(-math.degrees(a) - 90, resample=Image.BICUBIC)
        out.alpha_composite(g, (int(x - box / 2), int(y - box / 2)))
        pos += wch + track
    return out


def seal(diam, color=BONE, text=None, alpha=255):
    """The authenticity seal: ring text, the amphora, a sparkle at the head."""
    text = text or f'{WORDMARK} · AUTHENTIC · {CHAIN.upper()} · '
    S = diam * 2
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    col = (*color[:3], 255)
    w1, w2 = max(2, S // 120), max(1, S // 300)
    d.ellipse([w1, w1, S - w1, S - w1], outline=col, width=w1)
    d.ellipse([S * 0.19, S * 0.19, S * 0.81, S * 0.81], outline=col, width=w2)
    for i in range(72):                       # tick ring, like a dial
        a = math.radians(i * 5)
        r0, r1 = S * 0.455, S * (0.475 if i % 6 else 0.482)
        d.line([S / 2 + r0 * math.cos(a), S / 2 + r0 * math.sin(a),
                S / 2 + r1 * math.cos(a), S / 2 + r1 * math.sin(a)], fill=col, width=w2)
    out.alpha_composite(ring_text(S, text, font('displaym', int(S * 0.066)), col, S * 0.365))
    m = monogram(int(S * 0.36), color)
    out.alpha_composite(m, (int(S / 2 - m.width / 2), int(S / 2 - m.height / 2)))
    out = out.resize((diam, diam), Image.LANCZOS)
    if alpha < 255:
        out.putalpha(out.getchannel('A').point(lambda p: p * alpha // 255))
    return out


# ── lockups ─────────────────────────────────────────────────────────────────
def lockup(height, mark_color=BONE, text_color=BONE, track=0.2):
    """The logo: ΛMPHORΛ, letterspaced. Transparent, cropped to `height`."""
    f = font('display', int(height * 0.74))
    tmp = ImageDraw.Draw(Image.new('L', (4, 4)))
    tw = tracked_width(tmp, WORDMARK, f, f.size * track)
    out = Image.new('RGBA', (int(tw + 8), height), (0, 0, 0, 0))
    bb = f.getbbox('MPHOR')
    tracked(ImageDraw.Draw(out), (4, (height - (bb[3] - bb[1])) / 2 - bb[1]), WORDMARK, f, text_color, f.size * track)
    return out


# ── poster motifs ───────────────────────────────────────────────────────────
def sparkle(size, color=BONE, pinch=0.16, ss=4):
    """A four-point star with concave sides."""
    S = size * ss; c = S / 2
    pts = []
    for i in range(8):
        a = math.radians(i * 45 - 90)
        r = c * (0.98 if i % 2 == 0 else pinch)
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (*color[:3], 0)); out.putalpha(m)
    return out


def sunburst(size, color=BONE, rays=16, ss=3):
    """Thin radiating lines — a hand-drawn asterisk."""
    S = size * ss; c = S / 2
    m = Image.new('L', (S, S), 0); d = ImageDraw.Draw(m)
    for i in range(rays):
        a = math.radians(i * 360 / rays)
        r = c * (0.98 if i % 2 == 0 else 0.72)
        d.line([c, c, c + r * math.cos(a), c + r * math.sin(a)], fill=255, width=max(1, S // 110))
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (*color[:3], 0)); out.putalpha(m)
    return out


def orbit(canvas, box, color=BONE, width=2, tilt=-8, alpha=255):
    """A hairline ellipse drawn across the composition, slightly tilted."""
    x0, y0, x1, y1 = box
    w, h = int(x1 - x0), int(y1 - y0)
    pad = int(max(w, h) * 0.25)
    ss = 2
    L = Image.new('L', ((w + 2 * pad) * ss, (h + 2 * pad) * ss), 0)
    ImageDraw.Draw(L).ellipse([pad * ss, pad * ss, (pad + w) * ss, (pad + h) * ss], outline=alpha, width=width * ss)
    L = L.rotate(tilt, resample=Image.BICUBIC).resize((w + 2 * pad, h + 2 * pad), Image.LANCZOS)
    layer = Image.new('RGBA', L.size, (*color[:3], 0)); layer.putalpha(L)
    canvas.alpha_composite(layer, (int(x0) - pad, int(y0) - pad)) if canvas.mode == 'RGBA' else canvas.paste(layer, (int(x0) - pad, int(y0) - pad), layer)
    return canvas


def arch_mask(w, h, ss=2):
    """A round-headed window: a rectangle under a semicircle."""
    m = Image.new('L', (w * ss, h * ss), 0); d = ImageDraw.Draw(m)
    r = w * ss / 2
    d.ellipse([0, 0, w * ss - 1, 2 * r], fill=255)
    d.rectangle([0, r, w * ss - 1, h * ss], fill=255)
    return m.resize((w, h), Image.LANCZOS)


def arch_stroke(w, h, color=ACID, width=5, half=True):
    """The arch outline. half=True strokes only the left side and the crown,
    the way a poster frame catches light on one edge."""
    ss = 2
    W, H, t = w * ss, h * ss, width * ss
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    r = W / 2
    d.arc([t / 2, t / 2, W - t / 2, 2 * r - t / 2], 180, 360, fill=255, width=t)
    d.line([t / 2, r, t / 2, H], fill=255, width=t)
    d.line([W - t / 2 - 1, r, W - t / 2 - 1, H], fill=255, width=t)
    if half:
        d.rectangle([W * 0.62, 0, W, H], fill=0)
    m = m.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (*color[:3], 0)); out.putalpha(m)
    return out


def arch_window(art, w, h, focus=(0.5, 0.4)):
    """Cover-fit `art` into an arch of (w, h). Returns RGBA."""
    art = art.convert('RGB')
    s = max(w / art.width, h / art.height)
    art = art.resize((max(w, round(art.width * s)), max(h, round(art.height * s))), Image.LANCZOS)
    x = int((art.width - w) * focus[0]); y = int((art.height - h) * focus[1])
    out = art.crop((x, y, x + w, y + h)).convert('RGBA')
    out.putalpha(arch_mask(w, h))
    return out


def barcode(w, h, color=BONE, seed=11):
    """A strip of bars. Decorative — it encodes nothing."""
    import random
    rnd = random.Random(seed)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(out)
    x = 0
    while x < w:
        bw = rnd.choice([1, 1, 2, 2, 3, 4, 6])
        d.rectangle([x, 0, min(w, x + bw) - 1, h], fill=(*color[:3], 255))
        x += bw + rnd.choice([1, 2, 2, 3, 5])
    return out


def dot_grid(cell, labels=None, color=ASH, text=INK, cols=3, rows=3):
    """The corner counter: a 3x3 grid of discs, some carrying a figure."""
    labels = labels or {}
    gap = max(1, cell // 14)
    W, H = cols * cell + (cols - 1) * gap, rows * cell + (rows - 1) * gap
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(out)
    f = font('sansb', int(cell * 0.36))
    for r in range(rows):
        for c in range(cols):
            x, y = c * (cell + gap), r * (cell + gap)
            d.ellipse([x, y, x + cell - 1, y + cell - 1], fill=(*color[:3], 255))
            t = labels.get((c, r))
            if t:
                d.text((x + cell / 2, y + cell / 2), t, font=f, fill=text, anchor='mm')
    return out


def grain(img, amount=11, seed=5):
    """Film grain over the finished piece. This is what stops flat carbon
    looking like a default dark theme."""
    import numpy as np
    a = np.asarray(img.convert('RGB')).astype('int16')
    n = np.random.default_rng(seed).normal(0, amount, a.shape[:2])
    a = a + n[..., None]
    out = Image.fromarray(np.clip(a, 0, 255).astype('uint8'), 'RGB')
    if img.mode == 'RGBA':
        out = out.convert('RGBA'); out.putalpha(img.getchannel('A'))
    return out


def carbon_ground(w, h, seed=3, lift=1.0):
    """The page: near-black with a soft uneven light, as if photographed."""
    import numpy as np
    from scipy import ndimage
    rng = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(rng.normal(0, 1, (h // 16 + 2, w // 16 + 2)), 5)
    n = ndimage.zoom(n, (h / n.shape[0], w / n.shape[1]), order=3)[:h, :w]
    n = (n - n.min()) / (n.max() - n.min() + 1e-9)
    base = np.stack([CARBON[i] * (0.75 + 1.25 * lift * n) + 6 * lift * n for i in range(3)], -1)
    return Image.fromarray(np.clip(base, 0, 255).astype('uint8'), 'RGB')


def knockout_text(canvas, xy, text, f, art, track=0):
    """Type cut out of a block so the picture shows through the letters."""
    x, y = xy
    tmp = ImageDraw.Draw(Image.new('L', (4, 4)))
    w = int(tracked_width(tmp, text, f, track)) + 4
    bb = f.getbbox(text)
    h = bb[3] + 4
    m = Image.new('L', (w, h), 0)
    tracked(ImageDraw.Draw(m), (0, 0), text, f, 255, track)
    src = art.convert('RGB')
    s = max(w / src.width, h / src.height)
    src = src.resize((max(w, round(src.width * s)), max(h, round(src.height * s))), Image.LANCZOS).crop((0, 0, w, h))
    canvas.paste(src, (int(x), int(y)), m)
    return w


def marble_ground(w, h, tone=CARBON, veins=0.5, seed=3):
    """A dark veined-stone ground, generated: cloudy value noise plus a few
    wandering veins. Ours, so it carries no licensing question."""
    import random
    import numpy as np
    from scipy import ndimage
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (h // 8 + 2, w // 8 + 2))
    n = ndimage.gaussian_filter(n, 6)
    n = ndimage.zoom(n, (h / n.shape[0], w / n.shape[1]), order=3)[:h, :w]
    n = (n - n.min()) / (n.max() - n.min() + 1e-9)
    base = np.zeros((h, w, 3), 'float32')
    for i in range(3):
        base[..., i] = tone[i] * (0.72 + 0.62 * n)
    img = Image.fromarray(np.clip(base, 0, 255).astype('uint8'), 'RGB')
    if veins:
        random.seed(seed)
        v = Image.new('L', (w, h), 0)
        vd = ImageDraw.Draw(v)
        for _ in range(int(7 * veins * (w * h) / 1e6) + 3):
            x, y = random.uniform(0, w), random.uniform(0, h)
            a = random.uniform(0, math.tau)
            pts = [(x, y)]
            for _ in range(random.randint(30, 80)):
                a += random.gauss(0, 0.28)
                x += math.cos(a) * w * 0.012; y += math.sin(a) * w * 0.012
                pts.append((x, y))
            vd.line(pts, fill=random.randint(50, 120), width=random.choice([1, 1, 2]))
        v = v.filter(ImageFilter.GaussianBlur(1.3))
        light = Image.new('RGB', (w, h), tuple(min(255, int(c * 2.6 + 26)) for c in tone))
        img = Image.composite(light, img, v.point(lambda p: int(p * 0.55)))
    return img


def vignette(img, strength=0.55, tone=(4, 8, 14)):
    w, h = img.size
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).ellipse([-w * 0.25, -h * 0.25, w * 1.25, h * 1.25], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(min(w, h) * 0.22))
    dark = Image.blend(img, Image.new('RGB', (w, h), tone), strength)
    return Image.composite(img, dark, m)


def sprig(width, color=BONE, ss=3):
    """A laurel sprig: two short branches growing out from a centre gap. A divider."""
    W, H = width * ss, int(width * 0.16) * ss
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    cy = H * 0.42
    def stem(t):                       # t in 0..1 from centre outwards
        return t * W * 0.47, cy + math.sin(t * 1.3) * H * 0.22 - H * 0.10 * t
    for side in (1, -1):
        pts = [(W / 2 + side * (W * 0.035 + stem(i / 40)[0] * 0.93), stem(i / 40)[1]) for i in range(41)]
        d.line(pts, fill=255, width=max(1, int(W * 0.0035)))
        for i in range(4, 40, 6):
            x, y = pts[i]; a = math.atan2(pts[i + 1][1] - y, pts[i + 1][0] - x)
            for s in (1, -1):
                b = a - s * 0.55 * side
                L, Wd = W * 0.075, W * 0.011
                lens = [(j / 12 * L, math.sin(math.pi * j / 12) * Wd) for j in range(13)]
                poly = lens + [(px, -py) for px, py in lens[::-1]]
                d.polygon([(x + px * math.cos(b) - py * math.sin(b), y + px * math.sin(b) + py * math.cos(b)) for px, py in poly], fill=255)
    m = m.resize((width, H // ss), Image.LANCZOS)
    out = Image.new('RGBA', m.size, (*color[:3], 0)); out.putalpha(m)
    return out

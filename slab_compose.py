#!/usr/bin/env python3
"""
Amphora slab compositor — fills the master slab render with artwork, the
class and grade, and the authenticity seals.

  python3 slab_compose.py --art S1-01.png --tier MORTAL --grade VII --out slab-s1-01
Outputs <out>.webp (site-ready), cut to its silhouette on a 1800x2400 canvas.
Requires pillow, numpy, scipy. slab-base.png is built by brand/build_assets.py.

The slab is monochrome on purpose: dark plate, bone mat, the grade numeral in
the accent. The fresco is the only colour in the object.
"""
import argparse, os, sys, math
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from brand import brand as B

BASE = os.path.join(HERE, 'slab-base.png')
ART_BOX   = (411, 792, 1383, 2027)     # cover-fit window in the mat
GRADE_BOX = (1180, 342, 1442, 514)     # where the grade sits on the plate


def cut_background(img, thresh=46):
    """Remove the photographic backdrop cleanly: flood from the borders over
    background-coloured pixels, erode 1px so the feather never sits on dark
    background pixels (which caused a grey halo), feather, then crop to the
    silhouette so no stray rows remain."""
    import numpy as np
    from scipy import ndimage
    a = np.asarray(img.convert('RGB')).astype(int)
    bg = a[2, 2]
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    darkish = (dist < thresh) | (a.max(axis=2) < 34)
    lab, _ = ndimage.label(darkish)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    border.discard(0)
    bgmask = np.isin(lab, list(border))
    solid = ~bgmask
    solid = ndimage.binary_erosion(solid, iterations=1)
    solid = ndimage.binary_opening(solid, iterations=1)   # drop stray specks
    alpha = np.where(solid, 255, 0).astype('uint8')
    alpha_img = Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.9))
    out = img.convert('RGBA')
    out.putalpha(alpha_img)
    bbox = Image.fromarray((np.asarray(alpha_img) > 10).astype('uint8') * 255, 'L').getbbox()
    if bbox:
        out = out.crop(bbox)
    # pad back to a uniform 3:4 canvas so every slab shares one aspect ratio
    TW, TH = 1800, 2400
    scale = min(TW / out.width, TH / out.height) * 0.94
    out = out.resize((max(1, round(out.width * scale)), max(1, round(out.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (TW, TH), (0, 0, 0, 0))
    canvas.paste(out, ((TW - out.width) // 2, (TH - out.height) // 2), out)
    return canvas


def cover(img, w, h):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width*s), round(img.height*s)), Image.LANCZOS)
    x, y = (img.width - w)//2, (img.height - h)//2
    return img.crop((x, y, x+w, y+h))


def holo_seal(diam=170):
    """Iridescent silver security seal — angular rainbow over brushed silver.
    The one place colour other than acid is allowed: it is a security feature,
    and it should look like one."""
    import colorsys
    import numpy as np
    c = diam / 2
    yy, xx = np.mgrid[0:diam, 0:diam]
    dx, dy = xx - c, yy - c
    r = np.sqrt(dx*dx + dy*dy)
    ang = (np.arctan2(dy, dx) + math.pi) / (2 * math.pi)
    base = 208 - (r / c) * 42
    hue = (ang * 2.0 + r / c * 0.35) % 1.0
    rgb = np.zeros((diam, diam, 4), 'float32')
    hsv = np.vectorize(lambda h: colorsys.hsv_to_rgb(h, 0.16, 1.0))(hue)
    for i in range(3):
        rgb[..., i] = base * (0.82 + 0.36 * hsv[i])
    rgb[..., 3] = np.where(r <= c - 1, 246, 0)
    S = Image.fromarray(np.clip(rgb, 0, 255).astype('uint8'), 'RGBA')
    g = Image.new('RGBA', (diam, diam), (0, 0, 0, 0))
    ImageDraw.Draw(g).polygon([(diam*0.12, 0), (diam*0.34, 0), (diam*0.78, diam), (diam*0.56, diam)],
                              fill=(255, 255, 255, 68))
    g = g.filter(ImageFilter.GaussianBlur(7))
    g.putalpha(Image.composite(g.getchannel('A'), Image.new('L', g.size, 0), S.getchannel('A')))
    S = Image.alpha_composite(S, g)
    d = ImageDraw.Draw(S)
    d.ellipse([2, 2, diam-2, diam-2], outline=(120, 120, 126, 255), width=3)
    d.ellipse([13, 13, diam-13, diam-13], outline=(255, 255, 255, 150), width=2)
    S.alpha_composite(B.ring_text(diam, f'{B.WORDMARK_PLAIN} · AUTHENTIC · ', B.font('monob', int(diam * 0.088)),
                                  (84, 84, 92, 235), diam * 0.36))
    sp = B.sparkle(int(diam * 0.30), (90, 90, 98))
    S.alpha_composite(sp, (int(c - sp.width / 2), int(c - sp.height / 2)))
    sh = Image.new('RGBA', (diam + 24, diam + 24), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([12, 16, diam + 12, diam + 20], fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(8))
    out = Image.alpha_composite(Image.new('RGBA', sh.size, (0, 0, 0, 0)), sh)
    out.alpha_composite(S, (12, 8))
    return out


def grade_font(text, size):
    """GFS Didot; its Greek cut for Ω."""
    return B.font('greek', size) if any(ord(ch) > 0x2FF for ch in text) else B.font('display', size)


def compose(art_path, tier, grade, out):
    base = Image.open(BASE).convert('RGBA')
    art = Image.open(art_path)
    if art.mode in ('RGBA', 'LA', 'P'):
        art = art.convert('RGBA')
        paper = Image.new('RGB', art.size, (244, 242, 236))
        paper.paste(art, (0, 0), art)
        art = paper
    else:
        art = art.convert('RGB')
    x0, y0, x1, y1 = ART_BOX
    base.paste(cover(art, x1-x0, y1-y0), (x0, y0))
    # soft inner shadow so the art sits IN the mat
    sh = Image.new('L', base.size, 0)
    ImageDraw.Draw(sh).rectangle(ART_BOX, outline=80, width=10)
    sh = sh.filter(ImageFilter.GaussianBlur(8))
    dark = Image.new('RGBA', base.size, (0, 0, 0, 90))
    base = Image.composite(Image.alpha_composite(base, dark), base, sh)

    d = ImageDraw.Draw(base)
    gx0, gy0, gx1, gy1 = GRADE_BOX
    gcx = (gx0 + gx1) // 2
    # numeral in the accent, class beneath in small caps. No box.
    d.text((gcx, gy0 + 62), grade, font=grade_font(grade, 124), fill=B.ACID, anchor='mm')
    B.tracked(d, (gcx, gy1 - 34), tier.upper(), B.font('sansb', 21), B.BONE, 21 * 0.34, anchor='m')

    s = B.seal(230, (70, 70, 66), alpha=215)
    base.alpha_composite(s, (x1 - 150, y1 - 90))   # bottom-right, half on mat/art corner

    hs = holo_seal(170).rotate(-8, expand=True, resample=Image.BICUBIC)
    base.alpha_composite(hs, (1445, 168))          # over the case/label seam, top-right

    final = cut_background(base)
    final.save(out + '.webp', 'WEBP', quality=90)
    print('slab:', out + '.webp')
    return out + '.webp'


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--art', required=True)
    p.add_argument('--tier', required=True)
    p.add_argument('--grade', default='VII')
    p.add_argument('--out', required=True)
    a = p.parse_args()
    compose(a.art, a.tier, a.grade, a.out)

#!/usr/bin/env python3
"""
Generate the social card for a pull.

    python3 social_card.py --work GC-048 --title "The Hesitant Hand" \
        --class MORTAL --serial 47 --slab /path/to/slab.webp --out card.png

Classes escalate by how much of the accent they are allowed. MORTAL none.
HERO its class line. OLYMPIAN the title too, set between two hairlines.
The class should be legible before a word is read.
"""
import argparse, glob, os, random, sys, zlib
from PIL import Image, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand import brand as B

MASTERS_DIR = os.environ.get('MASTERS_DIR', os.path.join(os.path.expanduser('~'), 'amphora/series1/masters'))
FALLBACK_ART = os.path.join(os.path.dirname(HERE), 'assets', 'art')

LABEL = {'MORTAL': 'LIVE DRAW', 'HERO': 'A HERO SURFACES', 'OLYMPIAN': 'AN OLYMPIAN'}


def _stable_seed(work_id):
    # hash() is salted per process; a card must look the same every time it is made
    return zlib.crc32(work_id.encode()) % 9999


def _ground_art(seed):
    """One of the studio's own masters, in greyscale, for the arch behind the
    slab. Never a generated image presented as a vault work."""
    files = sorted(glob.glob(os.path.join(MASTERS_DIR, '*.png'))) or \
            sorted(glob.glob(os.path.join(FALLBACK_ART, '*.png')))
    if not files:
        return None
    src = Image.open(random.Random(seed).choice(files)).convert('RGB')
    g = ImageOps.autocontrast(ImageOps.grayscale(src), cutoff=1).point(lambda p: int(p * 0.62))
    return Image.merge('RGB', (g, g, g)).filter(ImageFilter.GaussianBlur(1.2))


def _wrap(d, text, f, max_width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if d.textlength(trial, font=f) <= max_width: cur = trial
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines[:2]


def build(work_id, title, cls, serial, slab_path, out_path, holder=None):
    cls = (cls or 'MORTAL').upper()
    k = B.CLASSES.get(cls, B.CLASSES['MORTAL'])
    seed = _stable_seed(work_id)

    W, H = 1200, 675
    card = B.carbon_ground(W, H, seed=seed).convert('RGBA')

    # the arch, behind the slab
    aw, ah = 400, 560
    ax, ay = 70, 76
    ground = _ground_art(seed)
    if ground is not None:
        card.alpha_composite(B.arch_window(ground, aw, ah, focus=(0.5, 0.3)), (ax, ay))
    card.alpha_composite(B.arch_stroke(aw, ah, B.ACID, 5), (ax, ay))
    B.orbit(card, (20, 250, 560, 500), B.BONE, 2, tilt=-9)
    card.alpha_composite(B.sparkle(40, B.BONE), (ax + aw // 2 - 20, ay - 30))

    if slab_path and os.path.exists(slab_path):
        slab = Image.open(slab_path).convert('RGBA')
        sw = 330
        slab = slab.resize((sw, int(slab.height * sw / slab.width)), Image.LANCZOS)
        sh = Image.new('RGBA', card.size, (0, 0, 0, 0))
        shadow = Image.new('RGBA', slab.size, (0, 0, 0, 0))
        shadow.putalpha(slab.getchannel('A').point(lambda p: p * 170 // 255))
        sx, sy = ax + (aw - sw) // 2, (H - slab.height) // 2 + 14
        sh.alpha_composite(shadow, (sx + 14, sy + 20))
        card.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
        card.alpha_composite(slab, (sx, sy))

    d = ImageDraw.Draw(card)
    x, R = 560, W - 70
    B.tracked(d, (x, 86), LABEL[cls], B.font('sansb', 15), B.ACID if cls != 'MORTAL' else B.ASH, 15 * 0.34)
    card.alpha_composite(B.sunburst(44, B.BONE), (R - 44, 70))
    d.text((x, 128), work_id, font=B.font('mono', 24), fill=B.ASH)

    size = 62
    tf = B.font('display', size)
    lines = _wrap(d, title.upper(), tf, R - x - 20)
    if len(lines) > 1 or d.textlength(lines[0], font=tf) > R - x - 20:
        size = 48; tf = B.font('display', size); lines = _wrap(d, title.upper(), tf, R - x - 20)
    y = 176
    hot = cls == 'OLYMPIAN'
    if hot: d.line([x, y - 16, R, y - 16], fill=(*B.ACID, 255), width=2)
    for line in lines:
        d.text((x, y), line, font=tf, fill=B.ACID if hot else B.BONE)
        y += int(size * 1.18)
    if hot: d.line([x, y + 10, R, y + 10], fill=(*B.ACID, 255), width=2)

    y = max(y + 44, 356)
    col = B.ASH if cls == 'MORTAL' else B.ACID
    card.alpha_composite(B.sparkle(22, col), (x, y + 5))
    cf = B.font('sansb', 16)
    cw = B.tracked(d, (x + 36, y + 6), cls, cf, col, 16 * 0.34)
    gf = B.font('greek', 36) if ord(k['grade'][0]) > 0x2FF else B.font('display', 36)
    d.text((x + 36 + cw + 28, y - 8), k['grade'], font=gf, fill=B.BONE)

    y += 70
    mono = B.font('mono', 19)
    ed = f"Nº {serial} OF {k['edition']}" if serial else f"EDITION OF {k['edition']}"
    if k['odds']: ed += '  ·  ' + k['odds']
    d.text((x, y), ed, font=mono, fill=B.BONE)
    d.text((x, y + 34), f"{B.fmt_hype(B.mark_hype(cls))} HYPE MARK  ·  THE FERRYMAN PAYS {B.fmt_hype(B.desk_hype(cls))}",
           font=mono, fill=B.ASH)
    if holder:
        B.tracked(d, (x, y + 78), 'DRAWN BY ' + holder[:6] + '…' + holder[-4:], B.font('mono', 15), B.ASH, 2)

    card.alpha_composite(B.barcode(R - x, 18, B.BONE, seed=seed), (x, H - 104))
    B.tracked(d, (x, H - 72), f'{B.DOMAIN}/w/{work_id}'.upper(), B.font('sansb', 14), B.BONE, 14 * 0.3)
    lk = B.lockup(30, B.BONE, B.BONE)
    card.alpha_composite(lk, (R - lk.width, H - 80))

    B.grain(card.convert('RGB'), 8, seed=seed).save(out_path)
    return out_path


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--work', required=True)
    p.add_argument('--title', required=True)
    p.add_argument('--class', dest='cls', default='MORTAL')
    p.add_argument('--serial', default='')
    p.add_argument('--slab', default='')
    p.add_argument('--out', required=True)
    p.add_argument('--holder', default='')
    a = p.parse_args()
    print(build(a.work, a.title, a.cls, a.serial, a.slab, a.out, a.holder or None))

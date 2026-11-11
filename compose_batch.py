#!/usr/bin/env python3
"""
Batch slab composition for Season I.
  python3 compose_batch.py                 # compose every master with a list row
  python3 compose_batch.py --limit 20      # first 20 only (verify by eye first)
  python3 compose_batch.py --only GC-022   # single work
Reads induction-list.csv (id,title,class,...,grade), masters/<id>.png,
writes slabs/<id>.webp and cards/<id>-front.webp.
"""
import argparse, csv, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MASTERS = os.path.join(HERE, 'masters')
SLABS   = os.path.join(HERE, 'slabs')
CARDS   = os.path.join(HERE, 'cards')

def card_front(src, dest):
    art = Image.open(src)
    if art.mode in ('RGBA', 'LA', 'P'):
        art = art.convert('RGBA')
        paper = Image.new('RGB', art.size, (248, 246, 242))
        paper.paste(art, (0, 0), art)
        art = paper
    else:
        art = art.convert('RGB')
    W, H, m = 750, 1050, 70
    card = Image.new('RGB', (W, H), (248, 246, 242))
    art.thumbnail((W - 2*m, H - 2*m), Image.LANCZOS)
    card.paste(art, ((W - art.width)//2, (H - art.height)//2))
    card.save(dest, 'WEBP', quality=88)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--limit', type=int)
    p.add_argument('--only')
    p.add_argument('--list', default=os.path.join(HERE, 'induction-list.csv'))
    a = p.parse_args()

    os.makedirs(SLABS, exist_ok=True); os.makedirs(CARDS, exist_ok=True)
    rows = list(csv.DictReader(open(a.list)))
    if a.only: rows = [r for r in rows if r['id'] == a.only]
    done = skipped = failed = 0
    for r in rows:
        wid = r['id']
        master = os.path.join(MASTERS, wid + '.png')
        if not os.path.exists(master):
            skipped += 1; continue
        slab_out = os.path.join(SLABS, wid)
        if os.path.exists(slab_out + '.webp'):
            done += 1; continue
        cmd = ['python3', os.path.join(HERE, 'slab_compose.py'),
               '--art', master, '--tier', r['class'], '--grade', r['grade'],
               '--out', slab_out]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f'FAIL {wid}: {res.stderr.strip()[-140:]}'); failed += 1; continue
        try:
            card_front(master, os.path.join(CARDS, wid + '-front.webp'))
        except Exception as e:
            print(f'card fail {wid}: {e}')
        done += 1
        if a.limit and done >= a.limit: break
        if done % 25 == 0: print(f'  … {done} composed', flush=True)
    print(f'composed {done} · missing master {skipped} · failed {failed}')

if __name__ == '__main__':
    main()

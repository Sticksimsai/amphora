#!/usr/bin/env python3
"""Emit the exact cast commands that make manifest.csv true on-chain.
Usage: python3 gen-register.py > register.sh   (then review, then run)
Env expected: FACTORY, VAULT, RPC, OPS_KEY, METADATA_BASE (e.g. ipfs://... or https://api…/meta/)"""
import csv
from decimal import Decimal

# class drives mark and prize-pool tier.
# Class drives mark (HYPE) and prize-pool tier. Marks are ratios of the box
# price: Mortal 0.7x, Hero 2.1x, Olympian 7.0x (box 0.5 HYPE shown).
CLASS_MARKS = {'MORTAL': '0.35', 'HERO': '1.05', 'OLYMPIAN': '3.5'}
CLASS_TIER  = {'MORTAL': 1, 'HERO': 2, 'OLYMPIAN': 3}

rows = list(csv.DictReader(open('manifest.csv')))
print("#!/usr/bin/env bash\nset -euo pipefail")
print(': "${FACTORY:?}" "${VAULT:?}" "${RPC:?}" "${OPS_KEY:?}" "${METADATA_BASE:?}"\n')
for r in rows:
    mark_wei = int(Decimal(r['mark_hype']) * 10**18)
    print(f"# ── {r['id']} · {r['title']} · edition {r['edition_cap']} @ {r['mark_hype']} HYPE")
    print(f"cast send $FACTORY \\\n  \"createEdition(string,string,uint256,uint256,string,string)\" \\")
    print(f"  \"{r['title']}\" \"{r['ticker']}\" {r['edition_cap']} {mark_wei} \\")
    print(f"  \"{r['series']}\" \"${{METADATA_BASE}}{r["id"]}.json\" \\")
    print(f"  --rpc-url $RPC --private-key $OPS_KEY")
    print(f"# then set NAV = mark (artworkId is in the EditionCreated event; 90-day expiry per vault policy):")
    print(f"# cast send $VAULT \"updateNav(uint256,uint128,uint40)\" <artworkId> {mark_wei} $(( $(date +%s) + 7776000 )) --rpc-url $RPC --private-key $OPS_KEY   # NAV = mark, expires in 90d\n")

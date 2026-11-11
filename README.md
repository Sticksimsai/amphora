# Amphora

A vending machine for fragments of art, on **Elysium** (Kinetiq's L2 for
Hyperliquid). One box, one graded and numbered **Sherd** of a real work. Odds on
chain before anyone opens anything. The Ferryman buys any Sherd back at 80% of
its mark. Everything is priced and paid in native **HYPE**.

Forked from Artefracts. **Read `REBUILD.md` first**; it maps every file and
lists what changed and what could not be verified.

```
REBUILD.md              the guide
MAINNET-RUNBOOK.md      ordered deployment, testnet first
LOVABLE-PROMPTS.md      frontend prompts, new design system
OVERVIEW.md  TERMS.md   public copy (TERMS is an unreviewed draft)
contracts/              Foundry. Native-HYPE machine, 36 tests
backend/                API, settler, indexer, scripts
bot/                    the Herald (pull bot) + social card
web/                    the static site (no build step); render.yaml deploys it
brand/                  brand kit + asset builder (everything is drawn in code)
assets/                 built logos, seals, slabs, cards, poster, brand sheet
fonts/                  GFS Didot, Montserrat, JetBrains Mono, Cormorant (OFL)
deploy/                 systemd, nginx, crontab
docs/KEYS.md            key separation and seed custody
docs/history-artefracts the predecessor's own record, untouched
```

## Quick start

```bash
# contracts
cd contracts
forge install foundry-rs/forge-std --no-git
git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
forge test

# backend
cd ../backend && npm install && cp .env.example .env
npm run env:check && npm run typecheck
npm run ladder            # the odds, marks and configureMachine command, in HYPE

# brand
cd .. && pip install pillow numpy scipy
python3 brand/build_assets.py
```

## Before anything is real

- Replace `amphora.example` everywhere.
- A paid randomised draw with a cash-out is gambling in many places. Changing
  chain and currency did not change that. Get the legal opinion first.
- Nothing here is audited and nothing has run against Elysium yet.

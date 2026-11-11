# Amphora — complete rebuild guide

Amphora is a fork of Artefracts: same machine, same collection, new name, new
look, new chain, new currency. Read this first. `docs/history-artefracts/` keeps
the predecessor's own record untouched; nothing in it is Amphora's history.

---

## What changed from Artefracts, in one table

| | Artefracts | Amphora |
|---|---|---|
| Chain | Robinhood Chain (4663 / 46630) | **Elysium** — Kinetiq's L2 for Hyperliquid (**99901** / **99801**) |
| Stack underneath | Arbitrum Orbit, settles to Ethereum | Arbitrum Orbit, settles to HyperEVM |
| Gas | ETH | **HYPE** |
| Box currency | USDG, an ERC-20 (approve, then pay) | **native HYPE** (`openBox` is `payable`, one transaction) |
| Box price | $25 | **0.5 HYPE** (configurable; everything else is a ratio of it) |
| Classes | Common · Rarity · Crown | **Mortal · Hero · Olympian** |
| Grades | 7 · 10 · X | **VII · X · Ω** |
| Certificate | Artefracts Certificate (`FRACT`) | **Amphora Sherd (`SHERD`)** |
| Desk | "the desk" | **the Ferryman** (code still says `desk`) |
| Token funding | 3% transfer tax via pons | creator share of LP fees from a locked V3 pool; **no transfer tax** |
| Look | ink, cream, brass; Mogilte | near-black, bone, one pale seafoam; GFS Didot + Montserrat |

**Why "Amphora".** The chain is already called Elysium, so a product of the same
name on it would be unsearchable and would sit on Kinetiq's brand. An amphora is
the vessel you draw from; a sherd is a fragment of painted pottery, which is
exactly what a certificate is. The name lives in `brand/brand.py` (`NAME`,
`WORDMARK`, `TICKER`, `DOMAIN`) and in two contract strings. To rename:
`grep -rn "mphora\|AMPH\|SHERD" --include=*.ts --include=*.py --include=*.sol`.

`amphora.example` is a placeholder domain everywhere. Replace it before launch.

---

## 1 · The economic model

Everything is a **ratio of the box price**, so the ladder survives a reprice.

| Class | Edition | Mark | Ferryman pays | Probability (ppm) |
|---|---|---|---|---|
| Mortal | 300 | 0.7 × box = **0.35 HYPE** | 0.28 | 978,392 (97.84%) |
| Hero | 25 | 2.1 × box = **1.05 HYPE** | 0.84 | 19,608 (1 in 51) |
| Olympian | 5 | 7.0 × box = **3.5 HYPE** | 2.80 | 2,000 (1 in 500) |

**Expected value 0.37 HYPE on a 0.5 HYPE box — 74%.** Publish it. A contract
test asserts it (`test_expectedValueIsSeventyFourPercent`).

```bash
cd backend && npx tsx scripts/solveOdds.ts 0.5    # prints the ladder and the exact cast command
```

### What paying in HYPE changes — decide these deliberately

- **Nothing is pegged.** Marks, the box and the Ferryman's bid are fixed in HYPE
  on-chain. In dollar terms they all move with HYPE. The EV *ratio* does not.
- **The Ferryman's float is exposed to HYPE's price**, and so is the treasury.
  A box sold at one price and bought back after a rally costs more in fiat than
  it earned. Size `DESK_TARGET_HYPE` and `TREASURY_FLOOR_HYPE` with that in mind.
- **Repricing is a three-step operation** and must be done as one:
  `solveOdds.ts <new>` → `configureMachine` → `scripts/reprice.ts <new>` (moves
  every mark) → `scripts/sync.ts`. A new box price against old marks silently
  changes the EV you published. Existing Sherds follow the mark, so a reprice
  changes what the Ferryman pays for certificates already held. Announce it.
- **Marks expire.** NAV is set with a 90-day expiry and a stale NAV bars a work
  from draws. `deploy/crontab.amphora` rolls them monthly.
- When Kinetiq ships the HyperCore market-data precompile (planned ArbOS upgrade
  about four weeks after mainnet) a USD-pegged box becomes possible on-chain.
  It is not built here; the hook is `hypeUsd()` in `backend/src/chain/elysium.ts`.

---

## 2 · Contracts (`contracts/`)

Foundry, solc 0.8.24, OpenZeppelin **v5.1.0** (newer OZ needs solc ≥ 0.8.31).

```bash
cd contracts
forge install foundry-rs/forge-std --no-git
git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
forge test -vv          # 36 tests
```

| File | Role |
|---|---|
| `src/ShareVault.sol` | Holds edition tokens, tracks marks in wei of HYPE, commits to prize pools. Now has **`removeFromTier`**. |
| `src/ShareCertificate721.sol` | The Sherds. `claimRedemption` locks soulbound; `deskAcquire` is the buyback path. |
| `src/GachaMachine.sol` | `openBox` (**payable**), `settleDraw`, `refundUnsettled`, **`sweepAbandoned`**, `flushTreasury`. |
| `src/EditionFactory.sol` | `createEdition` — one token contract per work. |
| `src/PrimarySale.sol` | Direct sale at mark, payable in HYPE. Not used by the machine. |

### What changed in the contracts

1. **Native payment.** No pay-token, no `approve`. `openBox` requires
   `msg.value == priceWei` exactly and reverts `WrongPayment` otherwise.
   `…Usd6` became `…Wei` everywhere (`priceWei`, `navPerShareWei`,
   `currentValueWei`, `expectedValueWei`).
2. **A treasury that reverts cannot block a settle.** The box price is pushed to
   the treasury with a gas cap; on failure it is booked to `treasuryOwed` and
   anyone can `flushTreasury()` later. A player's draw never depends on your Safe.
3. **`removeFromTier` exists.** It zeroes the commitment *and* removes the id
   from the tier array. The original could only zero shares, leaving a work a
   draw could still pick and revert on.
4. **`sweepAbandoned` exists**, admin-only, 30 days after open. The player's
   refund right is untouched right up to the sweep (there is a test for exactly
   that).
5. **The deploy script grants every role**, including `DESK_ROLE`, `REDEEM_ROLE`
   and `OPERATOR_ROLE` to their own addresses. Mis-granted roles caused three
   mainnet reverts on the original. It also grants `POOL_ROLE` to the
   certificate contract, which `unwrap` needs and the original never had.

### Constants

- `SETTLE_DEADLINE = 10 minutes` — after this **the player** reclaims the full
  price themselves. Still the most important line in the system.
- `SWEEP_DELAY = 30 days`.
- `DEFAULT_WEIGHT = 100`; weight 0 means default, not excluded. Use
  `removeFromTier` to exclude.

### Tests

| File | Defends |
|---|---|
| `Fairness.t.sol` | Wrong seed can't settle; commitment advances only on a valid reveal; no double settle. |
| `Ladder.t.sol` | ppm sums to 1,000,000; observed frequencies track the ladder over 400 draws; empty tier reverts. |
| `Solvency.t.sol` | Vault never commits what it doesn't hold; stale NAV blocks commitment. |
| `Certificate.t.sol` | Serials per artwork; value follows the mark; only the machine mints. |
| `Refund.t.sol` | Full refund after timeout; not before, not by strangers, not twice. |
| `Native.t.sol` *(new)* | Exact payment; machine holds the price until settle; reverting treasury can't block; `removeFromTier`; sweep timing; EV = 74%. |

Still owed, as before: desk buyback path, redemption/soulbound, band fuzzing, an
invariant suite. **None of this has been audited.**

---

## 3 · Backend (`backend/`)

Node + TypeScript, Fastify, Postgres, Redis/BullMQ, viem. `npx tsc --noEmit`
passes.

`src/chain/elysium.ts` is the one file that knows the network: chain
definitions, `assertChain()`, `LOG_CHUNK`, HYPE unit helpers, the HYPE/USD spot
(display only) and the token-pool config.

### Things that are different on Elysium — each is in the code

- **Do not import `elysium` from `viem/chains`.** That is Vulcan Forged's
  unrelated chain (1338/1339). The chain is defined by hand.
- **~10 blocks a second.** Block counts that were generous on a slower chain are
  minutes here. Catch-up scans 18,000 blocks (~30 min) in `LOG_CHUNK` pages.
- **`eth_getLogs` limits vary 200×** between providers (100 blocks on some free
  tiers). Set `LOG_CHUNK` to your plan. Every scanner uses it.
- **No public mempool.** Don't build anything on pending-transaction
  subscriptions; follow logs or poll receipts.
- **A keyed RPC is a prerequisite.** The public endpoint has no SLA.
- **Gas and payment are one asset.** The desk float pays sellers and its own gas;
  the settler needs only dust. One monitor replaces two.

### What was fixed while porting

The archive held pre-fix versions of several files. These are corrected here:

| Where | What |
|---|---|
| `workers/settler.ts` | `peekSeedAt` was called but never imported — the exact bug from the original's day-one outage. Already-settled detection and the `draws()` outcome fallback were described but absent; both are now in. Catch-up is paged. Settler logs its HYPE balance every heartbeat. |
| `api/desk.ts` | Checks the float covers the bid **before** taking the certificate (the original acquired first, paid second). Asserts `DESK_ROLE` at boot. Records `desk_trades`, which the buyback script read but nothing wrote. |
| `api/meta.ts`, `api/coa.ts` | Were hardcoded to one work. Now resolve certificate → artwork → work from the chain; image routes take an **artwork** id. |
| `api/server.ts` | `trustProxy` + rate-limit keyed on `x-forwarded-for`; `deploy/nginx-amphora.conf` now sends that header. Chain and desk role asserted at boot. |
| `scripts/daily-buyback.ts` | Sent `amountOutMinimum: 0`; now derives a floor from the pool price. Off unless `BUYBACK_ENABLED=true`. |
| `bot/pull-bot.ts` | Rotated refresh token is persisted; single multipart upload; running flag and claim-before-post. |
| network selection | Only `TESTNET=true` selects testnet. A stray `TESTNET_RPC_URL` no longer does. |

### Scripts

| Script | Purpose |
|---|---|
| `solveOdds.ts` | Prints the ladder in HYPE and the `configureMachine` command. |
| `induct.ts` | `createEdition` → `updateNav` → `commitToPrizePool` → DB → ledger. Marks are decimal HYPE strings parsed with `parseEther`. |
| `reprice.ts` *(new)* | Moves every mark to a new box price; also the NAV keep-alive. |
| `float-check.ts` *(new)* | Cron, 5 min. Refills desk / settler / curator / redeem wallets from the treasury hot key, never below its floor. Non-zero exit when anything is low. Replaces `desk-topup` + `gas-check`, which were not in the archive. |
| `watchdog.ts` | Cron, 2 min. Re-enqueues stuck draws; restarts the settler. |
| `sync.ts` | Chain → DB. Now reads the odds from the chain instead of a hardcoded array. |
| `reconcile-ledger.ts` | Rebuilds the registry from `EditionCreated`, paged from `FACTORY_START_BLOCK`. |
| `seed-root-setup.ts` | Generates the seed root and commitment. Prints the root once. |
| `daily-buyback.ts`, `sweep.ts` | Token layer; see §8. |

### Not in the archive, so not in the fork

`/work/:workId`, `/collection`, `/pool`, `/card/:workId` and the redemption
admin UI are referenced by the original guide but their code was not in the zip.
The pull bot calls `/work/:id`. Copy those routes over from your server and run
the same renames (`COMMON→MORTAL`, `…Usd→…Hype`, `chain/robinhood→chain/elysium`).

---

## 4 · Operational lessons — unchanged, still true

**Duplicate keys in `.env`.** dotenv takes the first occurrence.
`npm run env:check` fails on any duplicate. Run it after every edit.

**Five identities, never one** (`docs/KEYS.md`): ADMIN (hardware), CURATOR,
SETTLER, DESK, RESERVE (multisig).

**Everything silently drains.** `float-check.ts` and the settler heartbeat exist
for this. Install `deploy/crontab.amphora`.

**Nonce collisions kill long runs.** Nothing else from the curator key during an
induction batch.

**Certificate id ≠ artwork id.** Always resolve through `certificateOf`.

---

## 5 · Fairness — the commit-reveal

Unchanged. Hash a 32-byte secret 100,000 times; publish the last link; reveal
backwards. The result derives from server seed + client seed + user + draw id.
Elysium has one sequencer and no trustworthy on-chain entropy, so this remains
the right construction.

---

## 6 · The art pipeline

| File | What it does |
|---|---|
| `brand/brand.py` | The kit: palette, fonts, and every drawn mark (the ΛMPHORΛ wordmark, the Λ short mark, seal, meander, arch, orbit, sparkle, barcode, dot grid, grain). |
| `brand/build_assets.py` | Builds `slab-base.png`, `coa-template-clean.png`, the card back, logos, seals, diagrams, poster. `python3 brand/build_assets.py` |
| `slab_compose.py` | One artwork into the slab. `--art --tier MORTAL --grade VII --out` |
| `compose_batch.py` | Every row of `induction-list.csv` → `slabs/` and `cards/`. Needs your `masters/`. |
| `render_coa.py` | The certificate PDF. Its ground is `assets/art/mural-procession.png`, a **generated** antique-style mural: decoration only, never to be presented as a work in the collection. Its `FIELDS` table also drives the template, so labels and values cannot drift. |
| `bot/social_card.py` | The pull card. The accent escalates with class. |
| `fulfil.py`, `shipping_csv.py` | Fulfilment pack and Royal Mail export. Unchanged apart from names. |

`slab-source.png` is the neutral slab render. The build pulls it to monochrome
and repaints the label plate, keeping the reflection across it. A new render
drops straight in if the plate geometry (`PANEL`, `GRADE` in `build_assets.py`)
still matches.

To recompose all 541 slabs: put your masters in `masters/`, delete `slabs/`, run
`python3 compose_batch.py`.

---

## 7 · Collection data

`induction-list.csv`: `id,title,class,cap,markHype,tier,grade,series` — 541
rows, classes and marks converted (500 Mortal, 28 Hero, 13 Olympian). The
collection CSVs and both spreadsheets are converted the same way. Sub-tier names
(Sinopia → Buon Fresco → Ultramarine → Gilded Vault → Gold Ground → Mythic) are
fresco terms and are kept.

---

## 8 · The token (optional; parked until you set addresses)

**Launch on a launchpad that puts the whole supply in a locked Uniswap V3 pool
quoted in HYPE from block one.** Citadel and Supercolony both work this way; Kleos
publishes a 70% creator share. That model matches the indexer exactly, and with
no bonding curve there is no migration to track.

**No transfer tax.** The original's 3% tax would break here: Elysium's mirror
bridge to HyperEVM and HyperCore needs a plain ERC-20, so a taxed token cannot
follow the chain's own path to a HyperCore spot listing. The Reserve is funded
from the creator's share of pool fees instead: HYPE leg to the Reserve, token
leg burned, both by hand, both visible.

What is and isn't wired:

- **Wired:** `indexer/launchpadIndexer.ts` reads the pool itself (token side,
  fee) and ledgers volume → fee → creator share. `scripts/sweep.ts` prints the
  ledger next to the Reserve's balance. `daily-buyback.ts` swaps native HYPE
  through a V3 `SwapRouter02`.
- **Not wired, on purpose:** the fee *claim*. Every launchpad exposes it
  differently and the chain was two days old when this was written. Claim in the
  launchpad's UI. No launchpad, router or WHYPE address is hardcoded; all come
  from `.env` and must be read from the launchpad's docs and the pool.
- `CREATOR_SHARE_BPS` is your launchpad's number. If the ledger and your actual
  claims disagree, that setting is wrong.

**Say plainly that the allocation is studio policy, executed manually and
published for scrutiny — not an obligation to any holder.** A scheduled,
revenue-funded buyback sits close to the line between a product and a security.
Get advice before turning `BUYBACK_ENABLED` on.

---

## 9 · Frontend

`web/` is a static site with no build step: the landing page, the live ladder,
and wallet connect with the one-transaction purchase wired to `web/config.js`.
It is a preview until `GACHA` is set there. The reveal, collection, verify and
other app pages are not built; `LOVABLE-PROMPTS.md` describes them.

### Design system

- **Palette:** carbon `#101312`, graphite `#1E1E1C`, smoke `#3A3A36`,
  ash `#969690`, bone `#ECE9E0`, **seafoam `#C8F6E7`** (the accent; `ACID` in
  code), up `#5DCAA5`. Try another with
  `AMPHORA_ACCENT=#97FCE4 AMPHORA_GROUND=#0A1715 python3 brand/build_assets.py`.
- **Type:** GFS Didot (display, capitals, one weight; from the Greek Font Society), Montserrat (small
  wide uppercase copy), JetBrains Mono (every figure), Cormorant Garamond italic
  (signatures only). All OFL, in `fonts/` with web cuts in `fonts/web/`.
- **The accent is type and hairlines, never a fill.** No filled blocks, rows or
  buttons. Emphasis is an accent-coloured phrase over a hairline.
- **Frescos are the only colour.** Stone, slabs and backgrounds are greyscale.
- **Logo:** the wordmark **ΛMPHORΛ** (both A's as Greek lambda), no symbol.
  Short mark: Λ alone. SVGs are outlined from the font files.
- **Card back:** a radiate Helios sun in a meander frame.
- **Motifs:** the arch window with a half-stroke; one hairline orbit crossing
  the composition; a four-point sparkle at the crown; a barcode strip at the
  foot; the 3×3 dot counter top-left; film grain over everything.
- **Headlines:** a bone line, then the jump phrase in the accent, underlined by a hairline.
- **Class by quantity of accent:** Mortal none, Hero its class line and one
  star, Olympian the title too and two stars.
- **Grade on the slab:** the numeral (VII, X, Ω) in the accent beside a hairline,
  class beneath in small caps. No badge box.
- **Forbidden:** gradients, glass, rounded corners above 2px, a second accent
  colour, and any generated image presented as a real vault work.

### Non-negotiable frontend rules

- Purchase is **one payable transaction**: `openBox(machineId, clientSeed)` with
  `value = priceWei`. There is no approval step to design.
- Show prices in HYPE first; a fiat equivalent is secondary and labelled as
  approximate.
- Never advertise odds for a class with zero inventory.
- Reveal only when settled with a tier present; poll every 1500 ms.
- Preflight the wallet: request the switch, then **re-read the chain id** and
  block the button unless it is 99901. Add the chain by hand (name Elysium,
  currency HYPE); wallets' built-in lists may offer the wrong "Elysium".

---

## 10 · Deployment (`deploy/`)

systemd units for API, settler and indexer; nginx config; `crontab.amphora`.
`MAINNET-RUNBOOK.md` is the ordered sequence.

### The ten-point launch verification

Do all of these yourself, with a real wallet, before telling anyone:

1. Fresh wallet adds chain 99901 with HYPE as currency
2. Balance chip shows real HYPE
3. The amphora shows live odds and the published EV
4. Open one box — one transaction, settles in seconds, reveals a real work
5. `/c/` page renders, COA downloads
6. Sell it to the Ferryman — **the HYPE actually arrives**
7. Desk balance fell by the bid plus gas
8. The Floor shows the draw
9. `/verify/{drawId}` recomputes and matches
10. Treasury rose by the box price

Any failure stops the launch.

---

## 11 · What I could not verify from here

Stated so you check them rather than trust them:

- **Mainnet chain id 99901** is from Alchemy's network page; the public RPC URL
  (`rpc.elysium.kinetiq.xyz`) from a third-party launch guide. `assertChain()`
  will refuse to boot if either is wrong. Confirm both at
  `elysium.kinetiq.xyz/docs`.
- **No launchpad contract was inspected.** Fee split, locker and claim are from
  ecosystem-page descriptions.
- **Nothing was run against Elysium.** Contracts pass their tests locally;
  the backend typechecks. First real contact is your testnet deploy.
- The legal position of a paid randomised draw with a buyback has not improved
  by changing chain or currency. See the draft banner on `TERMS.md`.

---

## 12 · Build order

1. Settle the box price in HYPE. Run `solveOdds.ts`. Publish the EV.
2. Deploy to Elysium testnet (99801). `forge test`.
3. Put masters in place; `python3 brand/build_assets.py`; `compose_batch.py`.
4. Stand up the backend against testnet. Prove a settle end to end.
5. Build the frontend against live endpoints.
6. Separate the keys; put the seed root in real custody.
7. Mainnet: deploy, induct in tranches, single-tier first.
8. Walk the ten-point verification with your own HYPE.
9. Only then switch on the full ladder and tell people.

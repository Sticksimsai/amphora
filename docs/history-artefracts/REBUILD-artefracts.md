# Artefracts — complete rebuild guide

Everything needed to recreate the project from nothing. Read this first; it maps
every file in the archive to the part of the system it belongs to.

---

## What Artefracts is

A vending machine for fractional art. $25 a box, one graded and numbered
certificate of a fragment of a real work, odds published on-chain before anyone
opens anything, and a desk that buys any certificate back at 80% of its stated
value. Certificates can be redeemed as sealed physical cards with an NFC chip.

Built on **Robinhood Chain** (Arbitrum Orbit L2). Mainnet chain id `4663`,
testnet `46630`. Payments in **USDG** (Paxos Global Dollar, 6 decimals).

---

## 1 · The economic model

The thing to get right first — everything else is implementation.

| Class | Edition | Mark | Desk pays | Probability (ppm) |
|---|---|---|---|---|
| Common | 300 | $17.50 | $14.00 | 978,392 (97.84%) |
| Rarity | 25 | $52.50 | $42.00 | 19,608 (1 in 51) |
| Crown | 5 | $175.00 | $140.00 | 2,000 (1 in 500) |

**Expected value: $18.50 against a $25 box — 74%.** Publish this. The 26% margin
funds the studio, the vault, the physical programme and the desk's float.

Probabilities are stored on-chain as parts per million and the contract requires
them to sum to exactly 1,000,000.

**A work divides into an edition.** 500 common artworks × 300 fragments each =
150,000 common fragments. Each holder has a distinct number within the edition,
exactly like a print run.

---

## 2 · Contracts (`contracts/`)

Foundry project. Five contracts:

| File | Role |
|---|---|
| `src/ShareVault.sol` | Holds edition tokens, tracks NAV (marks), commits shares to machine prize pools. Roles: `CURATOR_ROLE`, `NAV_ROLE`, `POOL_ROLE`. |
| `src/ShareCertificate721.sol` | The certificates. Records artwork, shares, mint value, machine, serial. `claimRedemption` locks a certificate soulbound. `deskAcquire` is the buyback path. Roles: `MINTER_ROLE`, `DESK_ROLE`, `REDEEM_ROLE`. |
| `src/GachaMachine.sol` | `openBox`, `settleDraw`, `refundUnsettled`, `configureMachine`, `commitSeedChain`. Holds the odds ladder. Roles: `SETTLER_ROLE`, `OPERATOR_ROLE`. |
| `src/EditionFactory.sol` | `createEdition` — mints a token contract per artwork. Role: `SERIES_ROLE`. |
| `src/PrimarySale.sol` | Direct sales path (not used by the machine). |

`script/Deploy.s.sol` deploys all five and wires the roles.

### Critical constants

- `SETTLE_DEADLINE = 10 minutes` — after this, **the player** (and only the
  player) can call `refundUnsettled` and take their money back. This does not
  require the operator to be alive, awake or cooperative. It is the single most
  important safety property in the system.
- `DEFAULT_WEIGHT = 100` — per-artwork draw weight. Setting weight to 0 does
  *not* exclude a work (it falls back to default); use weight 1 to make
  something effectively unreachable.
- Certificate symbol — **change it before deploying.** It is set in the
  constructor and immutable. Don't collide it with your token's ticker.

### Known gaps to fix before a real deployment

- **No `removeFromTier`.** Once an artwork is committed to a prize pool it
  cannot be removed; `withdrawFromPool` zeroes the shares but leaves the id in
  the tier array, which makes any draw that picks it revert and **strand the
  player's draw permanently.** Add a proper removal function.
- **No sweep for stranded funds.** A draw that is never settled and never
  refunded leaves $25 in the contract forever. Add an admin sweep gated at, say,
  30 days — well past the refund window so nobody's rights are affected.

### Tests (`contracts/test/`, also in `test-suite/`)

27 tests across five files, all passing:

| File | What it defends |
|---|---|
| `Fairness.t.sol` | Wrong seed can't settle; commitment only advances on valid reveal; no double-settle; seeds published; only the settler settles. |
| `Ladder.t.sol` | ppm must sum to 1,000,000; bands sane; observed frequencies track the published ladder over 400 real draws; an empty tier reverts rather than silently downgrading. |
| `Solvency.t.sol` | Vault never commits shares it doesn't hold; no double-commit across machines; stale NAV blocks commitment; pools debit on mint. |
| `Certificate.t.sol` | Record is honest; serials increment per artwork; value follows the mark; only the machine mints. |
| `Refund.t.sol` | Refund after timeout returns the full price; not before; not by strangers; not twice; a refunded draw can never later settle. |

```bash
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test -vv
```

Still owed: desk buyback path, redemption/soulbound, band fuzzing, an invariant
suite.

---

## 3 · Backend (`backend/`)

Node + TypeScript, Fastify, Postgres, Redis/BullMQ, viem.

### API (`src/api/`)

| Route file | Serves |
|---|---|
| `server.ts` | `/public/machines` (live odds, EV, per-tier depth), `/public/draws/recent` (the Floor feed), rate limiting, CORS. |
| `meta.ts` | `/meta/:artworkId` (NFT metadata), `/meta/:id/image` (the slab), `/meta/:id/card-front`, `/work/:workId` (work page data + holders), `/slab/:id`, `/collection`, `/pool`, `/card/:workId` (social card download). |
| `desk.ts` | `/desk/quote/:certId`, `POST /desk/sell` — the 80% buyback. |
| `redeem.ts` | `/redeem/eligibility/:tokenId`, `POST /redeem/order`, `/redeem/orders/:address`, admin queue + pack endpoints. |
| `funds.ts` | `/public/funds` — acquisition funds, fill state from the Reserve wallet balance. |
| `stats.ts` | `/public/stats` (public transparency figures incl. observed vs published odds), `/stats/revenue` (admin only). |
| `coa.ts` | `/coa/:certId` — renders the signed certificate PDF. |

### Services and workers

- `services/fairness.ts` — commit-reveal: `peekSeed`, `confirmSeed`,
  `verifyReveal`. The cursor burns only after a receipt.
- `services/seedVault.ts` — **seed custody.** The chain is `s[i] =
  keccak(s[i-1])`, so 100,000 seeds derive from one 32-byte root. Only the root
  is stored, encrypted; the expanded chain is never written to disk. Providers:
  `aws-kms`, `systemd` (credentials), `env` (refuses to run in production).
- `services/oddsSolver.ts` — pool health, empty-tier alerts.
- `workers/settler.ts` — watches `BoxOpened`, settles draws. See hardening below.

### Scripts (`backend/scripts/`)

| Script | Purpose |
|---|---|
| `induct.ts` | Registers works on-chain: `createEdition` → `updateNav` → `commitToPrizePool` → DB row → ledger. Idempotent via `artwork_registry.csv`. Flags: `--dry`, `--limit`, `--class`. |
| `seed-root-setup.ts` | Generates the seed root and its on-chain commitment. Prints the root **once**. |
| `reconcile-ledger.ts` | Rebuilds the registry from chain truth (`EditionCreated` events). Run after any interrupted induction. |
| `sync.ts` | Reconciles DB inventory against chain. |
| `watchdog.ts` | Cron, every 2 min: re-enqueues draws pending > 3 min; restarts the settler if they persist; flags any near the refund deadline. |
| `desk-topup.ts` | Cron, every 10 min: refills the desk float from treasury when it drops below the trigger. Never takes treasury below its floor. |
| `gas-check.ts` | Cron, every 5 min: tops up the settler's gas wallet. |
| `daily-buyback.ts` | End-of-day: computes net after desk payouts, buys the token, (optionally) burns. |
| `backfill.ts`, `enqueue.ts`, `sweep.ts`, `solveOdds.ts` | Utilities. |

### The settler — four hardening layers

Every one of these exists because of a real outage:

1. **Cursor realignment.** If the local seed cursor drifts from the on-chain
   commitment, search ±50 links for the index the chain already proves and move
   there, rather than halting. Can only move to a position the chain proves, so
   it cannot fabricate a fairness record.
2. **Already-settled detection.** If the chain says a draw is settled, record
   that and stop retrying forever.
3. **Outcome fallback.** If the `DrawSettled` event parse misses, read tier and
   artwork straight from the contract's `draws()` mapping. Without this you get
   settled draws with null outcomes — blank cards in someone's vault.
4. **Heartbeat.** Log `alive · N pending · N queued` every minute and re-enqueue
   orphans. Silence in the journal then means *dead*, which is diagnosable;
   before, silence and idleness looked identical.

**Concurrency must be 1.** Seeds are consumed in strict order; parallel settles
desync the cursor.

---

## 4 · Operational lessons — read before deploying

These cost real customers real waiting time.

**Duplicate keys in `.env` caused three separate outages.** dotenv takes the
*first* occurrence, so an empty duplicate above a good value silently breaks
everything with no error. Check after every config change:

```bash
awk -F= '/^[A-Z_]+=/{if (seen[$1]++) print "DUPLICATE: "$1" line "NR}' .env
```

**Key separation (`docs/KEYS.md`).** Five identities, never one:

| Identity | Holds | Custody |
|---|---|---|
| ADMIN | `DEFAULT_ADMIN_ROLE` everywhere | Hardware wallet, offline between uses |
| CURATOR | curator/NAV/series roles | Hot key on the induction machine |
| SETTLER | settler role, **gas only, never USDG** | Hot key in the settler service |
| DESK | desk role, bounded USDG float | Hot key, top up in amounts you'd lose |
| RESERVE | no roles, holds acquisition money | Safe / multisig |

A settler leak is survivable — an attacker can settle draws but cannot change
outcomes, because the commitment already exists.

**Everything silently drains.** The desk float, the settler's gas, the deployer's
gas. All three ran dry in production without anyone noticing. The cron monitors
above are not optional.

**Nonce collisions kill long runs.** Never send a transaction from the same key
while an induction batch is running.

**Rate limiting behind a proxy.** `trustProxy: true` and key on
`x-forwarded-for`, otherwise every visitor shares one bucket keyed on
`127.0.0.1` and two people lock each other out.

**Certificate id ≠ artwork id.** Certificate 68 may be a fragment of artwork 5.
Requesting `/meta/{certificateId}/image` shows *someone else's artwork*, which is
worse than a blank. Always resolve via `certificateOf(tokenId)[0]`.

---

## 5 · Fairness — the commit-reveal

The whole trust model.

1. **Before any customer exists:** generate a 32-byte secret, hash it 100,000
   times. Publish the final link on-chain as a commitment.
2. **On open:** the browser generates a client seed and sends it with the
   transaction. The operator cannot know it in advance and cannot change the
   already-published commitment.
3. **On settle:** reveal the next seed. The contract verifies it hashes to the
   current commitment and rejects anything else — only the true preimage passes.
4. **The result** derives from the revealed seed + the client seed + the draw id.

Neither side controls it. Every revealed seed is public, so any draw can be
recomputed by anyone in a browser.

---

## 6 · The art pipeline

| File | What it does |
|---|---|
| `slab_compose.py` | Composites one artwork into the graded slab: alpha-flatten, drawn brass seal, holographic seal, background cut via colour-distance flood, feather, crop to silhouette, pad onto a uniform 1800×2400 RGBA canvas. Args: `--art --tier --grade --out`. Needs numpy + scipy. |
| `compose_batch.py` | Runs the compositor over every row in `induction-list.csv`. Writes `slabs/{id}.webp` and `cards/{id}-front.webp`. Skips existing. |
| `render_coa.py` | Renders the signed Certificate of Authenticity PDF. Needs `coa-template-clean.png` + `signature-AF.png`. |
| `bot/social_card.py` | The pull-announcement card: fresco master as background (blurred, darkened), Mogilte title, class-coloured escalation, holder line. |
| `fulfil.py` | Builds a fulfilment pack per redemption order: packing slip with address + QR of the NFC URL + physical checklist, the COA, the card print file, `nfc.txt`. |
| `shipping_csv.py` | Exports the order queue as a Royal Mail Click & Drop import; `--track` records tracking back to the order. |

Grade labels: **COMMON 7 · RARITY 10 · CROWN X**.

---

## 7 · Collection data

| File | Contents |
|---|---|
| `induction-list.csv` | 541 rows: `id,title,class,cap,mark6,tier,grade,series` — the induction input. |
| `season1-collection.csv` / `season1collection-classed.xlsx` | Full Season I: 500 commons (GC-001…500), 20 rare GC-R, 21 fauna (S1-F01…F21). |
| `collection-prompts-500.txt`, `rare-prompts-20.txt` | Generation prompts for the artwork. |
| `collection-manifest-seed.csv`, `artefracts-collection-tracker.xlsx` | Status tracking. |

Fauna sub-tiers escalate: Sinopia → Buon Fresco → Ultramarine → Gilded Vault →
Gold Ground → Mythic (1/1).

---

## 8 · The token (optional layer)

3% transfer tax: **1% to the launchpad** (their platform fee, not yours),
**2% to the Acquisition Reserve** — a public wallet whose only job is buying
artworks at auction into the vault. Operations are funded from box revenue, not
the token.

The Reserve fills four funds in sequence ($2k / $6k / $15k / $40k). Buyer's
premium runs 25–30%, so a $40k fund bids to about $30k.

**Say plainly that the allocation is studio policy, executed manually and
published for scrutiny — not a contractual obligation to any holder.** A
scheduled revenue-funded buyback sits close to the line between a product and a
security. Get advice before shipping it.

---

## 9 · Frontend

Not in this archive (it was built in Lovable). `LOVABLE-PROMPTS.md` holds the
prompts. Pages: landing, cabinet, `/pull/{drawId}` reveal, `/vault`,
`/c/{certId}`, `/w/{workId}`, `/t/{serial}` NFC tap page, `/floor`, `/gallery`,
`/funds`, `/transparency`, `/docs`, `/admin/redemptions`, legal pages.

### Design system

- **Palette:** ink `#14130F`, ink-2 `#1A1813`, cream `#EFE9DA`, brass `#9C8460`,
  brass-lit `#C9A96E`, stone `#8B8272`, crown `#E8C87A`, up `#5DCAA5`.
- **Type:** Mogilte (display serif, included as `.ttf` and `.woff2`), a light
  sans for body, a mono for labels at 9–11px with 0.2em+ tracking.
- **Headlines** are mixed-scale: a white serif line, a large gold italic jump
  word, a closing white line.
- **Section labels:** `N° 0X — THE THING` in mono brass.
- **Slabs are atmosphere** — bleed, parallax, below the text. Never furniture.
- **Forbidden:** glassmorphism, rounded-2xl, purple, and any generated artwork
  presented as a real vault work.

### Non-negotiable frontend rules

- Never advertise odds for a class with zero inventory. Drive the ladder from
  live `/public/machines` probabilities; probability 0 renders "NOT YET STOCKED".
- The reveal's data contract: render immediately, poll
  `/draws/{address}` every 1500ms, reveal **only** when settled with a tier
  present. 10s to find the row, 60s to settle, then a graceful exit. Never a
  label without its value.
- Preflight the wallet: after connecting, request the chain switch, then
  **re-read the chain id** — several wallets resolve the promise without
  switching. Block the purchase button if it isn't 4663. Use EIP-6963 provider
  discovery; Phantom overrides `window.ethereum` when installed alongside
  MetaMask.

---

## 10 · Deployment (`deploy/`)

systemd units for the API, settler and indexer, plus an nginx config.
`MAINNET-RUNBOOK.md` is the ordered deployment sequence with verification gates.

**Dedicated RPC is a hard prerequisite**, not an optimisation — the public
endpoint sits behind Cloudflare bot protection and will refuse a polling
settler outright.

### The ten-point launch verification

Do all of these yourself, with a real wallet, before telling anyone:

1. Fresh wallet prompts to add chain 4663 correctly
2. Balance chip shows real USDG
3. Cabinet shows live odds and the published EV
4. Open one box — it settles in seconds and reveals a real work
5. `/c/` page renders, COA downloads
6. Sell it to the desk — **the money actually arrives**
7. Desk balance fell by the right amount
8. The Floor shows the pull
9. `/verify/{drawId}` recomputes and matches
10. Treasury rose by the box price

Any failure stops the launch.

---

## 11 · Documents

| File | Contents |
|---|---|
| `OVERVIEW.md` | The full public explainer — problem, mechanism, how to buy, transferability, redemption, the acquisition programme. |
| `ARTICLE.md` | Long-form version. |
| `DAY-ONE-review.md` | Launch-day post including the outages, written honestly. |
| `TERMS.md` | Terms of service, 19 sections. |
| `MAINNET-RUNBOOK.md` | Deployment sequence. |
| `docs/KEYS.md` | Key separation and seed custody runbook. |
| `00-PLAN.md`, `01-FRACTIONAL-REVISION.md`, `02-TOKENOMICS-REVISION.md` | Design history. |

---

## 12 · Build order

1. Settle the economics — classes, editions, marks, odds, EV. Publish the EV.
2. Deploy contracts to a testnet. Run the test suite.
3. Generate the collection and compose the slabs.
4. Stand up the backend. Prove settlement end to end.
5. Build the frontend against live endpoints.
6. **Separate the keys and put the seed root in real custody.** Before mainnet.
7. Deploy mainnet, induct in tranches, configure single-tier first.
8. Walk the ten-point verification with your own money.
9. Only then switch on the full ladder and tell people.

The thing that made this work was publishing what is usually hidden: the odds,
the expected value, the observed-versus-published frequencies, and the failures.
A floor you can check beats a promise you can't.

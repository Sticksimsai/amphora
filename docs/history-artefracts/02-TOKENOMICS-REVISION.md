# Revision 02 — Tokenomics & Launch Architecture
### Supersedes: the FEES waterfall in 00-PLAN.md §Treasury; the three-machine launch config; adds wallet/relayer architecture. Everything not named here stands.

---

## 1 · Fee flywheel v2 — no buyback, no market operations

Pons V1 pools collect the 1% fee in **both** tokens of the pair. The creator share
therefore arrives as two streams with different natures, and the revision treats
them differently instead of blending them:

**$FRACT stream → 100% burn, automatic.**
feeRouter burns the token side in the same sweep transaction that claims it.
The protocol never sells its own token (no downward pressure from us), never buys
it (no market-making optics, one less securities argument), and supply falls
mechanically with volume. The burn is verifiable on-chain per sweep.
*Code change: feeRouter gains a burn step for the token leg. Small, but it is a
code change, not config.*

**Cash stream (WETH → USDG) → simplified waterfall:**

| Bucket | Share | Purpose |
|---|---|---|
| Acquisition | **70%** | Buys art shares for the vault. Was 55 — rises because buyback/burn no longer share the pot. The vault grows faster per dollar of volume than in v1. |
| Ops | **20%** | Infra, custody, appraisals, audits, relayer gas (new — see §4), legal. Was 10; doubled because the relayer makes gas a protocol expense. |
| Insurance | **10%** | Accumulating reserve backing the desk's standing offer and NAV-shock events. Was 5. |

The **GACHA-source waterfall and the `restockFloorBps = 8800` invariant are
unchanged** — that constraint governs box economics (a machine shipping 88% EV
must restock at least 88%), and nothing in this revision touches it.
*Config change only: `setPolicy(Source.FEES, [7000, 0, 0, 2000, 1000])` shape.*

---

## 2 · Launch config — one machine

One Studio-class machine at launch; Gallery and Vault open when inventory depth
justifies them (UI shows them as ghosts — roadmap, not absence).

**Solved configuration (float-aware, verified 88.00% EV, ppm sums to 1,000,000):**

| Tier | Odds (ppm) | Probability | 1-in | Band | Centre |
|---|---|---|---|---|---|
| Study | 690,020 | 69.0020% | 1.4 | $9–11 | $10 |
| Print | 215,535 | 21.5535% | 4.6 | $21–29 | $25 |
| Edition | 70,907 | 7.0907% | 14 | $48–72 | $60 |
| Original | 20,406 | 2.0406% | 49 | $120–200 | $160 |
| Grail | 3,132 | 0.3132% | **319** | $490–910 | $700 |

α = 1.2699 · ticket $25 · EV $22.00 · worst pull $9 (36% of ticket) · bands
centred (band-midpoint EV equals centre EV by construction).

**Float posture:** max Grail pull $910 = 13.9% of MURFLO's whole float, 4.7% of
KOODOG's. Survivable but chunky, so two guards:
- **Concentration cap (policy):** expected outflow per work per epoch ≤ 5% of
  that work's float; the oddsSolver pool-health alarms already compute the
  inputs. If a work breaches, it rotates out of the tier's draw list.
- **Grail eligibility (policy):** Grail draws only from works with float ≥ $15k
  OR from in-house tokenised Originals (§5), where float is ours to set.

configureMachine args = the ppm/band table above, exactly. Never hand-edit.

---

## 3 · The desk — 80% of NAV, and what it actually is

Buyback at **80% of live NAV**, paid in USDG, instant. Not "insured value" —
fractions have a mark; settle against the mark. (The certificate may *display*
insured-value language; settlement references NAV.)

What the desk really is: **the cheapest restock channel.** A re-roller sells
back at 80¢ on the dollar; those shares return to the prize pool at a 20%
discount, funded by that user's next box. The loop: open → dislike → sell 80% →
open again. Collector Crypt's engine, ours in USDG.

The rate is the biggest behavioural dial we own: 80% maximises churn and cheap
restock; 85% maximises goodwill. Launch at 80%, governance-adjustable, and the
insurance bucket (§1) is what makes "standing offer" a fact rather than a mood.

*Compliance note (unchanged in force):* instant cash-out of a random draw is
the fact pattern UK counsel must clear. The desk existing is why GB stays
geoblocked until Phase 0 completes.

---

## 4 · Accounts — embedded wallet + gas abstraction

Login (email / passkey / social) provisions a **non-custodial embedded EVM
wallet** on Robinhood Chain (Privy / Dynamic / Web3Auth class — decision open,
see Open Items). User funds it with USDG. USDG pays for boxes.

Hard consequence: **users hold zero ETH, gas is ETH → every transaction needs
gas abstraction.** Two viable shapes:
- **ERC-4337 paymaster** (verify Robinhood Chain 4337 infra maturity first), or
- **Protocol relayer**: backend service submits transactions against the user's
  signature (EIP-712 typed messages → relayer wraps and pays gas).

Either way it is a new backend service beside the settler: own funded key, own
rate limits, own alarms; its gas spend is the reason Ops rose to 20%. The
fairness flow is untouched — the client seed still comes from the user's
browser; the embedded wallet still signs; commit-reveal doesn't care who pays
gas.

**Custody line we do not cross:** embedded must be non-custodial (MPC or
passkey-secured user keys). Holding user keys makes us a custodian — a
regulatory category this project must not enter.

---

## 5 · Inventory strategy — two sources, and the tiers were built for it

**The problem:** a vault of five blue-chips makes every pull "some dollars of
Koons" — rarity collapses into slice size, and early Grails are cheap to hit.

**The answer is already in the tier names.**

| Tiers | Source | Mechanics |
|---|---|---|
| Study · Print · Edition | **In-house tokenisation**: editioned prints and studies by emerging/mid-career artists, physically acquired ($500–5k/work), vaulted, registered via `ShareVault.registerArtwork()` like any other asset | Cost fully under our control; a Study pull is *a study by a real artist*, not a crumb of a Koons. Float is ours to set — deep enough that low tiers never breach concentration caps. |
| Original · Grail | **Fractional platforms**: LiveArt open-market (KOODOG, MURFLO) and IAO offerings (BANGIR, KUSPUM, HOCPOOL, HARPLA); survey competing platforms before exclusivity | Blue-chip names carry the top of the ladder; scarcity is real because the asset class differs, not just the number. |

This gives: controllable acquisition cost, genuine tier identity, a curation
story ("the vault collects emerging artists"), and Grails that stay rare because
they are *different things*, not bigger slices. Acquisition's 70% (§1) funds
both channels; in-house works are also the escape valve whenever platform float
is too thin for a tier.

*Legal note:* in-house tokenisation makes us the issuer of those fractions —
the securities analysis for self-issued shares is part of the Phase 0 counsel
scope, not a new gate but a widened one.

---

## 6 · What changes in the codebase

| Component | Change | Class |
|---|---|---|
| feeRouter | burn the $FRACT leg on sweep | code |
| TreasuryVault policy | FEES split → 70/0/0/20/10 shape | config |
| Machine config | single machine, §2 table | config |
| Backend | new **relayer** service (or 4337 integration) | code |
| Backend | new **auth/wallet** integration (provider TBD) | code |
| API | desk quote/settle endpoints (cert exists: `deskAcquire`) | code |
| Frontend | one active machine chip + two ghosts; desk copy at 80% | config-ish |
| oddsSolver | concentration-cap check per work per epoch | code (inputs exist) |

DEPLOY.md remains valid; Phase 4's configureMachine step now uses §2's table,
and Phase 5 gains a relayer unit once the provider decision lands.

---

## 7 · Open items added by this revision

1. **Wallet provider decision** (Privy / Dynamic / Web3Auth) — blocks relayer
   design; wants: Robinhood Chain support, passkey UX, non-custodial MPC.
2. **4337 vs relayer** — check Robinhood Chain paymaster/bundler maturity.
3. **In-house tokenisation legal scope** — added to Phase 0 counsel brief.
4. **Platform survey** — LiveArt alternatives for Original/Grail inventory.
5. Unchanged and still gating: LiveArt transfer-restriction read; Foundry test
   suite; KMS; UK counsel.

---

# Addendum — Rev 02.1

## 8 · Machine v2 — four tiers, in-house floor (supersedes §2)

Study removed; Print re-banded to **$15–20** and sourced entirely from the
curated in-house Artefracts collection. Solved (88.00% EV, $25 ticket, α=2.0966):

| Tier | ppm | Probability | 1-in | Band | Source |
|---|---|---|---|---|---|
| Print | 921,128 | 92.1128% | 1.1 | $15–20 | **Artefracts in-house collection (curated)** |
| Edition | 69,570 | 6.9570% | 14 | $48–72 | in-house / whole redeemable multiples |
| Original | 8,899 | 0.8899% | 112 | $120–200 | fractional platforms + in-house |
| Grail | 403 | 0.0403% | **2,481** | $490–910 | fractional platforms, float-guarded |

Raising the floor hardened the top: Grail 1-in-2,481 (was 319), Original
1-in-112 — the early-rare-too-easy concern is closed by construction. Worst
pull $15 = **60% of ticket**. Inventory need ≈ $16.1k of Print per 1,000 boxes
→ the collection IS the product for 92% of pulls; curation quality is the
product quality.

**Code implication:** if Print pays items from an in-house collection rather
than NAV-marked ERC-20 shares, the prize path needs either (a) the collection
issued as fungible editions registered in ShareVault like any artwork
(preferred — desk, NAV, and certificates work unchanged; each edition carries
an assigned $15–20 mark), or (b) a new ERC-721 prize path in GachaMachine
(more code, desk needs a price oracle). Recommend (a).

## 9 · Buckets defined + Collection Fund (amends §1 cash waterfall)

**Ops = the monthly bills:** infra, RPC, indexing, audits, legal retainers,
appraisals/NAV re-marks, custody & physical-insurance premiums, and — now
explicit — **all sponsored user gas** (relayer/paymaster spend; Orbit L2 gas
is fractions of a cent per tx, so 20% is ample headroom).
**Insurance = the untouched reserve:** not premiums — an accumulating fund
drawn only on events: NAV-shock make-goods, desk runs, incident response.
Bills come from Ops; disasters come from Insurance.

**Cash waterfall v2.1** — Acquisition splits into two named funds:

| Bucket | Share | Purpose |
|---|---|---|
| Prize inventory | 45% | Restocks the machines (Print collection production, Edition multiples, Original/Grail fractions) |
| **Collection Fund** | 25% | Buys **whole works** — established names and viral emerging artists — held by the treasury, **shown on the site**, never gacha prizes. The path to full ownership. |
| Ops | 20% | as above, incl. user gas |
| Insurance | 10% | as above |

The Collection Fund is the restricted Treasury Portfolio from the split-vault
design, now with a funding line and a public face: a "The Collection" page
showing every whole work the protocol owns. It is the token's story
(protocol-owned art growing with volume) while holders retain **no claim on
it** — display, not dividend.

## 10 · Treasury pre-buy

The vault does not cold-start on fees: founder capital **pre-buys** launch
inventory (Print collection produced, Edition/Original/Grail stocked to
opening depth) and optionally the first Collection work. Fees then replenish
and grow both funds. Opening depth target: ≥ 3,000 boxes of coverage
(~$50k prize inventory at the §8 mix) before mainnet.

## 11 · Market context for the Collection Fund (April 2026 snapshot)

Under-$50k works were 61% of all US auction lots in 2025 (broadening,
low-price-led market); auction-tracked artist count widened to 3,315.
Blue-chip/secondary expected healthier in 2026 than emerging — a buyer's
market at the emerging end. Artnet's 2026 rising list includes names with
records still in the $6–13k range (e.g. Eva Helene Pade) — exactly the
Collection Fund's early acquisition zone. Deep target list = open research
item.

## 12 · Physical redemption — Print tier (Rev 02.1)

**Model: print-on-demand, user-pays shipping.** No pre-printed stock; the
certificate IS the edition — its serial is the edition number, assigned
on-chain at the pull. Redemption prints that number, once, ever.

Flow: certificate page → Redeem → address + live shipping quote from print
partner → user pays shipping at cost in USDG → `redeem(certId)` LOCKS the
certificate soulbound at claim (redeemed=true; the transfer hook reverts all
transfers permanently — marketplace listings die automatically, no escrow
needed, no in-flight sale window) → print order placed → Claimed / In print /
Shipped (tracking) / Delivered → slab converts to commemorative "REDEEMED
Nº 042/300" state; the certificate survives as the physical's on-chain twin
(NFC tap page stays live: provenance, history, REDEEMED · IN CIRCULATION).

Rules: redemption itself free; the lock is one-way (no unlock, no re-vaulting
shipped physicals — reversal is a fraud surface; delivery problems are ops
matters: reprint/reship, never on-chain undo); expectation set at 5–15
business days; ship-to list = print partner's coverage. Deflation claim
phrased as "removed from circulation": tradeable float shrinks by one per
redemption, permanently. Physical hand-to-hand resale is out of protocol; the
twin does not follow the paper. Signatures via artist-signed certificate
card packed with the print (signed in bulk at commission; no print-queue
hostage). Fulfilment: fine-art POD partner (archival giclée, dropship) —
near-zero internal ops; per-order cost sits in the $15–20 mark's margin.

Effects: each redemption is deflationary for the remaining edition (say so
on-site). Proof-of-reserve for this tier = on-chain edition cap + master-file
and agreement custody, framed as "printed to order within a capped edition"
(photography-edition precedent). Legal: deliverable physical prizes with
published values weigh toward the trading-card fact pattern — noted for the
Phase 0 brief; the cash desk still keeps GB blocked.

Contract additions: `redeem(certId)` burn + claim event; fulfilment webhook
→ status states. Frontend: claim screen (quote → pay → burn), status track,
REDEEMED slab state.


## 14 · Manual treasury operations (Rev 02.1 — supersedes automatic waterfalls)

No automatic claiming, routing, or on-chain splitting of fees, anywhere.
Rationale: money-movement logic in contracts is lockable; policy in a Safe is
not. The 45/25/20/10 split (prize / collection / ops / insurance) is PUBLISHED
POLICY, executed manually as visible transfers from the treasury Safe.

- Treasury = a Gnosis-Safe-class wallet, supplied to Deploy as TREASURY.
  GachaMachine ticket revenue and PrimarySale proceeds pay directly to it.
  TreasuryVault (auto-waterfall) is deprecated to contracts/deprecated/.
- Pons fees: claimed manually via scripts/sweep.ts (founder-run CLI, dry-run
  by default). Each sweep: $FRACT leg 100% to the burn address (the burn
  promise holds — executed per sweep, verifiable on-chain each time); cash
  leg 100% to the Safe. feeRouter daemon deprecated.
- The restock invariant (>=88% of GACHA revenue restocks) moves from contract
  enforcement to published policy + public reporting: a treasury page showing
  the Safe addresses, each allocation transfer, and running totals per bucket.
  Trust posture: draw FAIRNESS stays enforced on-chain (commit-reveal,
  verifiable); fund ALLOCATION is transparent-by-reporting.
- Desk float: the desk pays from a funded operational wallet, topped up
  manually from the Safe against the published reserve formula
  (80% of mark x outstanding certificates).

## 15 · Machine One — the in-house ladder (Rev 02.2)

One card per box, always. Tiers are RARITY CLASSES, each a degenerate
band at that class's mark; the desk pays 80% of mark for any class,
so rarer cards carry higher floors natively.

| Class  | Mark    | Desk floor | Edition | Odds     | ppm     |
|--------|---------|-----------|---------|----------|---------|
| COMMON | $17.50  | $14.00    | of 300  | ~97.84%  | 978,392 |
| RARITY | $52.50  | $42.00    | of 25   | 1 in 51  | 19,608  |
| CROWN  | $175.00 | $140.00   | of 5    | 1 in 500 | 2,000   |

Ticket $25 · EV $18.50 (74.0%) · ppm sums 1,000,000 · slot 0 and 4 dead.
configureMachine(1, 25000000, [0,978392,19608,2000,0],
  [0,17500000,52500000,175000000,0], [0,17500000,52500000,175000000,0])

STAGING RULE: this config goes live only when the first Rarities are
registered at the $52.50 mark and committed to tier 2 (Crowns to tier
3 likewise). Until then Machine One runs the flat single-tier config
(100% COMMON) — an empty rollable tier is never acceptable. Rarity
NAVs register at their class mark; COAs, desk quotes, and /c/ pages
inherit automatically. The scarcity premium above mark lives in the
market; the floor is the desk's.

Blue-chip machine (Machine Two) retains the original §8 value-band
ladder unchanged, activated at mainnet.

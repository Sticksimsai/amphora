# ARTEFRACTS — Tokenised Art Gacha on Robinhood Chain

*A Collector-Crypt-style randomised vault, where the prize pool is tokenised fine art rather than graded cards, and the vault is funded by Pons creator fees.*

---

## 1. The one-paragraph version

Launch a fixed-supply token on **pons** (Robinhood Chain's dominant launchpad). Pons pays the token creator **70% of a 1% pool fee** on every trade, denominated in ETH. That fee stream is routed — automatically, on-chain — into a **Treasury** contract that acquires tokenised artwork. Each acquired work is custodied and represented on Robinhood Chain as a **Vault NFT**. Users pay to open **gacha boxes** in three price tiers and receive a random Vault NFT, which they can hold, trade, sell back to the desk at a published floor, or burn to redeem the underlying asset. Draws are provably fair via a pre-committed server seed chain. The token's value proposition is that trading it literally buys art for the vault, and the vault's growth is verifiable on-chain.

---

## 2. Hard constraints I found — read this before anything else

These are not blockers to the idea, but each one *changes the design*. Ignoring them is how this project dies.

### 2.1 The fee flywheel cannot buy blue-chip art. Ever.

Pons pays the creator 0.7% of trade volume (70% of the 1% pool fee). Run the numbers:

| Cumulative trade volume | Creator fee accrued |
|---|---|
| $1,000,000 | $7,000 |
| $10,000,000 | $70,000 |
| $100,000,000 | $700,000 |

A single mid-market contemporary work at auction is $50k–$500k. **You would need $7M–$70M of trading volume per painting.** Collector Crypt works because a graded Pokémon card is $50–$5,000, not $500,000.

**Design consequence:** the vault holds **editioned and mid-market work** — photography editions, screenprints, digital editions, works on paper, emerging-artist originals in the $40–$5,000 band. One headline "Grail" piece at $25k is the ceiling, and it is acquired deliberately as marketing spend, not organically.

**Design consequence 2:** creator fees are the **seeding and growth** engine, not the operating engine. The gacha is self-funding at a 12% house margin once running. Fees buy the initial inventory and expand it. At $500k/day token volume you accrue ~$3,500/day, seeding a 200-piece, $60k starting vault in roughly 17 days.

### 2.2 Art has no TCGPlayer. This is the deepest problem.

Collector Crypt's entire model rests on a card having a public, daily-updating comparable-sales price. That is what makes gacha EV disclosable, buybacks priceable, and tiers constructible. Fine art has none of this — an appraisal is stale, wide, and contested.

**Design consequence:** restrict inventory to assets with *observable comps*:
- **Editions** (print runs of 50–250) where other copies trade publicly
- **Digital/NFT art** with on-chain floor prices from marketplace data
- Anything with a LiveArt Pricing & Analytics record (they claim 10M+ auction records, 345k+ artists)

Every Vault NFT carries a **signed appraisal attestation** with a source, a date, and a confidence band. Appraisals older than 90 days force the item out of active gacha pools. This is your equivalent of a PSA grade — do not skip it.

### 2.3 LiveArt is not on Robinhood Chain.

LiveArt's assets are Ethereum/multi-chain ERC-721s. There is no canonical bridge for arbitrary NFTs to Robinhood Chain. You cannot trustlessly move them.

**Design consequence — custody-and-wrap model** (identical in spirit to Collector Crypt vaulting physical cards):
1. Treasury acquires the asset on its native chain into a **named custody multisig** (Safe on Ethereum).
2. A **Vault NFT** is minted on Robinhood Chain recording `sourceChainId`, `sourceContract`, `sourceTokenId`, custody address, and appraisal.
3. **Proof-of-reserve**: an automated job reads balances on the source chain every hour and publishes a signed Merkle root on Robinhood Chain. Anyone can verify every Vault NFT is backed.
4. **Redemption**: burn the Vault NFT → operator transfers the source NFT to the redeemer's address on the source chain, against a 2% withdrawal fee.

This is a **trusted** bridge. Say so plainly in your docs. Collector Crypt is also trusted and it has not hurt them, but the honesty is what earns the trust.

### 2.4 Randomness on Robinhood Chain is weak.

Robinhood Chain is Arbitrum Orbit with a centralised sequencer. `blockhash` is sequencer-influenceable and there is no Chainlink VRF deployment to rely on. **Do not use blockhash as your primary entropy.**

**Design consequence:** hash-chain commit-reveal (spec in §6). The server pre-commits a terminal hash for 100,000 draws and reveals seeds in reverse order. The server cannot adaptively choose a seed after seeing a user's input, and the user cannot predict one. This is the standard provably-fair casino construction and is stronger than on-chain pseudo-randomness here.

### 2.5 This is legally a prize draw, and you are in England.

A paid randomised draw awarding items of real monetary value, with a cash-equivalent buyback, is **gambling** under the Gambling Act 2005 in the UK unless structured as a lawful prize competition or free draw. The Gambling Commission has been actively scrutinising loot boxes and "mystery box" sites. Collector Crypt geoblocks and runs KYC for a reason.

Practical structure, all of which is *architectural*, not cosmetic:
- **Geoblocking** at the API and RPC-proxy layer (UK, US states, and any jurisdiction your counsel flags)
- **KYC tier gate** above a spend threshold (Sumsub/Persona)
- **Published odds** on every machine, immutably on-chain — you have this for free from the design
- A **free entry route (AMOE)** if you want to run a lawful UK prize competition rather than gambling
- Spend limits, cooling-off, and self-exclusion in the product, not bolted on

Get a gambling/financial-promotions solicitor before mainnet. This costs a few thousand pounds and is the cheapest insurance in the whole build. I am not a lawyer and this is not legal advice.

### 2.6 Pons V2 is mid-flight.

V2 (ETH bonding curve, Uniswap V4 hooks, creator payouts in ETH, RWA pairs including USDG/NVDA/AAPL/HOOD) was announced for "next week" as of late July 2026, **with contracts still under audit**. V1 uses Uniswap V3 with a 70/30 creator/protocol split snapshotted at launch.

**Design consequence:** build the fee router against a **versioned adapter interface** so V1 and V2 are swappable. Do not hardcode the factory. Read the locker from the factory, as the pons docs instruct. If you can wait for V2, launching there gets you native ETH payouts and a **USDG-denominated creator payout** — which is enormously better for an art treasury than volatile ETH.

**Recommendation: wait for V2 and elect USDG payout.** Your liabilities (art prices) are dollar-denominated. Taking fees in ETH gives you a currency mismatch on a treasury that must buy dollar-priced assets.

---

## 3. Economic model

### 3.1 Verified reference data (pons, July 2026)

| Parameter | Value |
|---|---|
| Chain | Robinhood Chain, ID **4663** |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `robinhoodchain.blockscout.com` |
| Gas token | ETH |
| Active pons factory | `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB` (start block 8991118) |
| Active locker | `0x736D76699C26D0d966744cAe304C000d471f7F35` |
| WETH (quote) | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| Swap router | `0xCaf681a66D020601342297493863E78C959E5cb2` |
| Quoter V2 | `0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7` |
| Supply | 1,000,000,000 fixed |
| Pool fee | 10000 (1%) |
| Launch fee | 0.0005 ETH |
| Creator / protocol split | **70 / 30** (active factory) |
| Graduation threshold | 4.2 ETH paired |

### 3.2 Gacha machines — solved odds

Target expected value **88% of ticket price** (12% house margin). Floor tier is always ≥40% of ticket price, so no draw is worthless. Probabilities derived from a power-law rarity decay solved against the EV target.

**Studio Box — 25 USDG**  (EV $22.00)

| Tier | Appraisal floor | Probability | Odds | EV contribution |
|---|---|---|---|---|
| T1 Study | $10 | 69.1343% | 1 in 1.4 | $6.91 |
| T2 Print | $25 | 21.8162% | 1 in 5 | $5.45 |
| T3 Edition | $60 | 7.2474% | 1 in 14 | $4.35 |
| T4 Original | $200 | 1.5922% | 1 in 63 | $3.18 |
| T5 Grail | $1,000 | 0.2100% | 1 in 476 | $2.10 |

**Gallery Box — 100 USDG**  (EV $88.00)

| Tier | Appraisal floor | Probability | Odds | EV contribution |
|---|---|---|---|---|
| T1 Study | $40 | 69.4435% | 1 in 1.4 | $27.78 |
| T2 Print | $100 | 22.0142% | 1 in 5 | $22.01 |
| T3 Edition | $250 | 6.9787% | 1 in 14 | $17.45 |
| T4 Original | $900 | 1.4005% | 1 in 71 | $12.60 |
| T5 Grail | $5,000 | 0.1631% | 1 in 613 | $8.16 |

**Vault Box — 500 USDG**  (EV $440.00)

| Tier | Appraisal floor | Probability | Odds | EV contribution |
|---|---|---|---|---|
| T1 Study | $200 | 70.2505% | 1 in 1.4 | $140.50 |
| T2 Print | $500 | 22.2415% | 1 in 4 | $111.21 |
| T3 Edition | $1,400 | 6.1081% | 1 in 16 | $85.51 |
| T4 Original | $5,000 | 1.2359% | 1 in 81 | $61.80 |
| T5 Grail | $25,000 | 0.1639% | 1 in 610 | $40.98 |

Odds are stored on-chain in **parts per million** and are immutable per machine version. Changing odds requires deploying a new machine config, which emits an event and is visible in the UI as a version bump.

### 3.3 Buyback desk

Instant buyback at **85% of current appraisal**, paid in USDG from the Treasury's liquidity sleeve. This is the mechanism that makes EV meaningful — without a cash-out, "88% EV" is a claim about illiquid objects.

Spread economics per Gallery Box: user pays $100, receives $88 of appraised value, sells back at 85% → receives $74.80. House captures $25.20 gross, of which the vault retains an $88 asset for $74.80 outlay. **Only fund the buyback sleeve to a capped percentage of treasury** (start at 15%) or a bank-run drains you.

### 3.4 Treasury waterfall

Inflows are split by on-chain policy, and **the policy differs by source**. This is the single easiest thing to get wrong in the whole design.

Creator fees are free money — trading costs the treasury nothing, so most of it should buy art. Gacha revenue is not free: every $100 box ships ~$88 of inventory out of the prize pool. Apply the fee waterfall to gacha revenue and you restock $55 against $88 leaving, and the pool shrinks $33 per box until it is empty.

| Sleeve | Fees | Gacha | Purpose |
|---|---|---|---|
| Acquisition | 55% | 60% | Buy inventory |
| Buyback liquidity | 15% | 28% | Fund instant buybacks |
| Token buyback & burn | 15% | 4% | Buy $FRACT on pons, burn |
| Operations | 10% | 6% | Custody, NAV, infra |
| Insurance reserve | 5% | 2% | Loss and dispute cover |

**The invariant:** for gacha revenue, Acquisition + Buyback must be at least the EV shipped per box — 88% at an 88% EV machine. That leaves 12% of real margin for everything else. `TreasuryVault.setPolicy` enforces this and reverts on a policy that breaches it, because the failure is otherwise invisible until inventory runs out.

The split *between* those two sleeves should track the observed buyback rate. Buybacks acquire inventory at 85% of NAV, so every certificate sold back earns you the 15% spread and is the cheapest restocking channel you have. Low buyback rate, weight Acquisition. High buyback rate, weight Buyback. Their sum is what must not move.

**An 88% EV machine has 12% gross margin and you cannot spend it three times.** The gacha roughly funds itself. The real profit is the fee stream.

---

## 4. System architecture

```
                      ROBINHOOD CHAIN (4663)
   ┌─────────────────────────────────────────────────────────┐
   │                                                          │
   │   pons Locker ──creator fees(70%)──▶ FeeRouter          │
   │   (0x736D...)                            │               │
   │                                          ▼               │
   │                                    TreasuryVault         │
   │                            ┌──────┬─────┴────┬────────┐  │
   │                        acquire  buyback   burn      ops │
   │                            │       │                     │
   │                            ▼       ▼                     │
   │   ArtVault721 ◀───mint──  BuybackDesk                   │
   │   (Vault NFTs)                                           │
   │        │                                                 │
   │        ├──deposit──▶ GachaMachine ──settle──▶ user      │
   │        │             (commit-reveal)                     │
   │        └──burn──────▶ RedemptionEscrow                  │
   │                                                          │
   │   ProofOfReserve  (hourly signed Merkle root)           │
   └─────────────────────────────────────────────────────────┘
                              │
              custody attestation / redemption
                              ▼
   ┌─────────────────────────────────────────────────────────┐
   │  ETHEREUM — Custody Safe holding LiveArt & other ERC-721 │
   └─────────────────────────────────────────────────────────┘

   OFF-CHAIN
   ├── Pons Indexer      TokenLaunched + Swap events → fee accrual
   ├── Fee Claim Worker  claims creator fees, routes to Treasury
   ├── Draw Settler      reveals seeds, calls settleDraw()
   ├── Appraisal Oracle  signed price attestations, 90-day TTL
   ├── PoR Publisher     reads Ethereum custody → Merkle root
   └── API (Fastify)     REST for the Lovable frontend
```

---

## 5. Smart contracts

| Contract | Responsibility |
|---|---|
| `ArtVault721` | ERC-721 receipt for each custodied work. Stores source-chain provenance, appraisal, tier, custody reference. Only `MINTER_ROLE` mints; only owner or `RedemptionEscrow` burns. |
| `GachaMachine` | Machine configs (price, odds in ppm, tier pools). `openBox()` locks payment and emits a commitment; `settleDraw()` verifies the revealed seed against the committed chain, derives tier + item, transfers the NFT. |
| `TreasuryVault` | Receives all inflows, enforces the waterfall, holds sleeve balances, gates withdrawals by role and by per-epoch caps. |
| `BuybackDesk` | Quotes 85% of signed appraisal, buys the NFT back into the gacha pool, capped by the buyback sleeve. |
| `RedemptionEscrow` | Burn-to-redeem. Records a redemption request with a destination address on the source chain; operator fulfils and posts proof. |
| `ProofOfReserve` | Stores hourly Merkle roots of custodied assets, signed by the attestor key. |
| `AppraisalOracle` | Holds appraiser public keys; verifies EIP-712 signed appraisals with expiry. |

Full Solidity in `contracts/`.

---

## 6. Provable fairness — the spec you publish

**Setup (once per 100,000 draws):**
```
s[0]     = 32 random bytes (HSM / KMS, never leaves)
s[i]     = keccak256(s[i-1])          for i = 1..N
commit   = s[N]                        ← published on-chain BEFORE any draw
```
Seeds are consumed in **reverse**: draw 1 uses `s[N-1]`, draw 2 uses `s[N-2]`. Anyone can verify `keccak256(s[N-1]) == commit`, chaining forward forever. The server physically cannot substitute a seed after the fact.

**Per draw:**
```
User calls   openBox(machineId, clientSeed)
             → emits BoxOpened(drawId, user, machineId, clientSeed, seedIndex)

Settler calls settleDraw(drawId, serverSeed)
             → require(keccak256(serverSeed) == committedHash[seedIndex])
             → committedHash[seedIndex - 1] = serverSeed      (chain advances)

result = keccak256(abi.encode(serverSeed, clientSeed, user, drawId))

tier   = first tier where cumulative_ppm > (result % 1_000_000)
item   = tierPool[tier][ uint(keccak256(result, "ITEM")) % tierPool[tier].length ]
```

Publish a standalone verifier page. Users paste `serverSeed`, `clientSeed`, `drawId` and reproduce the result themselves. This is a marketing asset as much as a technical one — Collector Crypt's trust comes from exactly this kind of legibility.

**Two-transaction UX:** at ~250ms blocks, settle lands in under a second. Run a relayer that auto-settles so the user sees one action and a pack-opening animation covering the round trip.

---

## 7. Backend

**Stack:** TypeScript · Fastify · Postgres (Supabase) · Drizzle ORM · viem · BullMQ + Redis · Safe SDK

Supabase is the recommendation specifically because **Lovable has first-class Supabase integration** — auth, RLS, realtime, and generated types come free, and your Lovable prompts can reference tables directly.

Split of responsibility:
- **Supabase** — user accounts, KYC status, draw history reads, realtime feed, RLS
- **Node worker service** (Railway/Fly) — everything touching a private key: indexing, fee claiming, seed reveal, settlement, PoR. **Never put a signing key in a Supabase edge function.**

See `backend/` for the implementation.

---

## 8. Build phases

| Phase | Scope | Time |
|---|---|---|
| **0. Legal + entity** | Counsel opinion, entity, custody structure, geo policy | 2–4 wks (start now, parallel) |
| **1. Testnet contracts** | All contracts on chain 46630, Foundry tests incl. fuzzing the odds | 2 wks |
| **2. Indexer + fee router** | Index pons, prove fee claim works end to end | 1 wk |
| **3. Draw engine** | Seed chain, settler, verifier page | 1 wk |
| **4. Frontend (Lovable)** | Prompts in `LOVABLE-PROMPTS.md` | 1–2 wks |
| **5. Custody + PoR** | Safe, appraisal pipeline, hourly attestation | 1 wk |
| **6. Audit** | Two firms. Non-negotiable — you are holding user funds and prize inventory | 3–4 wks |
| **7. Token launch on pons** | V2, USDG creator payout elected | — |
| **8. Seed vault, soft launch** | Studio Box only, capped spend, invite list | 2 wks |

Do not launch the token before the vault has inventory. A gacha with an empty vault is the fastest possible way to destroy the narrative that makes the token worth trading.

---

## 9. Naming

**Artefracts** — artefact + fraction. It names both halves of the product: the collectible object and the fractional share behind it, and it carries an implied fracture that the visual identity is built on.

**Ticker: $FRACT.** Not $ARTE — that symbol is contested several times over (ethArt, Artemine, a Solana ARTE), and more importantly **artèQ trades as ARTEQ and is specifically an art fund doing fractional NFTs**. That is a direct semantic collision in your exact niche and it will cost you every time someone searches. $FRACT is the distinctive half of the name and it describes what the token's fees actually buy.

Check the symbol on pons before launch, and note the docs' warning: names and symbols can be copied freely, and only the contract address is canonical. Secure `artefracts.xyz`, the handle, and the pons page in that order.

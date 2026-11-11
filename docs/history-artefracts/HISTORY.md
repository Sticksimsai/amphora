# Artefracts — build history and decision record

A reconstruction of how the project was built: the decisions, the rejected
alternatives, the incidents, and the reasoning. Not a verbatim chat log — a
record of what was decided and why, which is the part worth keeping.

Covers roughly 28 July → 1 September 2026, testnet through mainnet launch.

---

## Phase 1 — Concept and economics

### The founding idea

A gacha machine for fractional art. The insight was not "fractionalise art" —
that had been tried and mostly failed because the fractions were shares in an
abstraction with no exit. The additions that made it work:

- **A published floor.** The desk buys anything back at 80% of mark, instantly.
  Fractional ownership without an exit is a trap; with a standing bid it's a
  market.
- **A physical endpoint.** The certificate can become an object you hold, with a
  chip that proves itself.
- **Published odds and published EV.** Most gacha operators hide both.

### Economics, settled early and never changed

| Class | Edition | Mark | Desk | Odds |
|---|---|---|---|---|
| Common | 300 | $17.50 | $14.00 | 97.84% |
| Rarity | 25 | $52.50 | $42.00 | 1 in 51 |
| Crown | 5 | $175.00 | $140.00 | 1 in 500 |

EV **$18.50 on a $25 box (74%)**. The decision to publish the EV was deliberate
and became the spine of the brand — every later honesty decision followed from
having already conceded the house edge.

### Rejected along the way

- **Whole-asset vaulting** (`contracts/deprecated/ArtVault721.whole-asset.sol`)
  — one token per artwork. Rejected: no fractions, no $25 entry point.
- **Auto-waterfall treasury** (`TreasuryVault.autowaterfall.sol`) — automatic
  on-chain revenue splits. Rejected as an immutable legal statement that would
  be hard to amend; replaced with manual transfers from a public wallet, which
  gives the same transparency with none of the rigidity.
- **Fee router worker** (`workers/feeRouter.deprecated.ts`) — same reasoning.
- **Second machine for blue chips.** Rejected in favour of acquired works
  entering the *same* machine, so a $25 box can contain a fragment of a Warhol.

---

## Phase 2 — Contracts

Five contracts, Foundry. The design points that mattered:

**`SETTLE_DEADLINE = 10 minutes`, player-callable only.** The most important line
in the system. If settlement never happens, the buyer reclaims their money
themselves by calling the contract. It cannot be blocked by the operator being
dead, asleep or unwilling. Everything else about trust follows from this
existing.

**Commit-reveal rather than on-chain randomness.** On a chain with a central
sequencer there is no trustworthy on-chain entropy, and block data would be
theatre. A committed hash chain is the construction that actually works.

**Soulbound on redemption.** Claiming the physical locks the certificate
permanently. Reasoning: provenance only means something if it can't fork into
one person holding the token and another holding the card.

### Test suite — written late, should have been first

27 tests across fairness, ladder, solvency, certificates and refunds. The
odds test runs 400 real draws through the deployed logic and checks observed
frequencies against the published ladder.

Two bugs surfaced while writing it, both in the tests rather than the contracts:
a seed-cursor underflow (the cursor decrements per box; starting it at 10 meant
the eleventh draw underflowed) and pool exhaustion (400 draws against an edition
of 300). Both taught something real about production: **the seed chain needs
enough links committed for expected volume**, and **a tier drains as
certificates mint**.

### Gaps knowingly left

- No `removeFromTier` — once committed, an artwork can't be withdrawn without
  stranding draws. Worked around on testnet by setting the weight of six mock
  artworks to 1 against a default of 100, making them ~0.07% of picks.
- No sweep for permanently stranded funds.

---

## Phase 3 — The art pipeline

**Slab compositor.** Several iterations to get the cut right: colour-distance
flood from the borders, erosion before feather, opening, crop to silhouette,
then pad onto a uniform canvas. Earlier versions left a visible halo.

**Grades:** COMMON 7 · RARITY 10 · CROWN X.

**Season I — The Fractured Fresco.** 542 works: 500 commons, 20 rare GC-R, 21
fauna in escalating sub-tiers (Sinopia → Buon Fresco → Ultramarine → Gilded
Vault → Gold Ground → Mythic 1/1). Starting with the studio's own work was
deliberate — every mechanism proven on art fully controlled before anything
acquired went near the machine.

516 masters composed in one clean pass, zero failures.

**A ruling taken and applied:** top fauna ranks → CROWN, lower ranks → RARITY.
The two Mythic 1/1s were flagged for possible withholding as season prizes
rather than induction; left undecided.

**Brand rule, enforced throughout:** never present generated or fabricated
artwork as a real vault work. The frontend tool invented lookalike assets once
when an import failed and had to be corrected.

---

## Phase 4 — Backend

Fastify + Postgres + Redis/BullMQ + viem. Routes grew organically: machines,
draws feed, metadata, desk, redemption, funds, stats, COA.

### Maiden trades

- **First desk buyback** on testnet: certificate #2, NAV $60, sold for $48.
  The initial revert was `AccessControlUnauthorizedAccount` — the desk route was
  signing with a key that no longer held the role. This exact failure recurred
  twice more, on mainnet, for the same reason.
- **First box settled end to end** after fixing an address-case mismatch (the DB
  stored checksummed addresses; the lookup didn't lower-case).

---

## Phase 5 — Mainnet migration (30–31 August)

Deliberate sequence: deploy → verify immutables → roles → seed chain →
single-tier config → backend cutover → induct in tranches → full ladder.

### What went wrong, in order

1. **Public RPC blocked by Cloudflare.** The mainnet endpoint sits behind bot
   protection and refused server-side polling. A dedicated RPC turned out to be
   a hard prerequisite, not an optimisation. The free tier then capped
   `eth_getLogs` at a 10-block range, breaking the settler's catch-up scan.

2. **`TESTNET_RPC_URL` present in `.env` forced testnet mode** regardless of
   every other setting. It had to be removed, not supplemented.

3. **Duplicate `.env` keys** — this caused three separate outages across two
   days. dotenv takes the first occurrence, so an empty `OPS_PRIVATE_KEY` above
   a populated one silently broke everything with no error. Also hit: a stale
   public `RPC_URL` above the Alchemy one, and a duplicated `GACHA_ADDRESS`.

4. **Roles granted to the wrong identities.** The deploy script granted
   `OPERATOR_ROLE` to the curator address, so the deployer couldn't commit the
   seed chain. Same class of problem recurred for `DESK_ROLE` and `REDEEM_ROLE`.

5. **`AlreadySettled` retry loops.** Draws settled on-chain but pending in the
   DB were retried forever, masking real failures.

6. **The certificate-id / artwork-id confusion.** The vault requested
   `/meta/{certificateId}/image` where the route expects an *artwork* id. Where
   the numbers happened to collide, people were shown **someone else's artwork**
   on their own certificate — worse than a blank, because it isn't obvious.

### Launch day figures

135 boxes · 18 collectors · 74 certificates · 2 rarities · 0 crowns ·
$434 paid out by the desk · 1 physical claim.

### Three outages on day one

- **Settler stalled twice.** First a cursor desync (halting rather than
  guessing — correct, but a poor experience). Second, a bug in the fix for the
  first: `realignCursor` was added without wiring its import, so the recovery
  path threw instead of recovering. That one is worth remembering — a patch
  applied by string replacement needs a restart-and-watch before being called
  done.
- **Settler ran out of gas.** Every settle failed for want of a fraction of a
  cent. Five customers waited, one for 87 minutes.
- **Desk float drained** from $476 to $2.66 while its auto-top-up crashed
  silently on the empty key.

### The hardening that followed

Four self-healing layers in the settler (realignment, already-settled
detection, outcome fallback, heartbeat) and three cron monitors (stuck draws
every 2 min, desk float every 10, settler gas every 5). Each exists because of a
specific failure that cost real customers real time.

---

## Phase 6 — Redemption

Contract support already existed (`claimRedemption`, soulbound `_update`, desk
refusal on redeemed). What was built: order capture, the fulfilment queue, pack
generation, and label export.

**Design decision: the certificate locks at order time, not at shipping.**
Otherwise someone could order a card and sell the certificate to the desk while
it was being printed, and you'd ship a card for a certificate they no longer own.

**Print-on-demand with next-day dispatch**, cards generic per work rather than
numbered per edition — the edition number lives on the COA and the chip. This
removed the need for a stock check and simplified fulfilment to: pick the work's
card, encode the chip, sign the COA, seal, post.

**The $25 covers everything** — card, case, chip, COA, worldwide postage. Only
import duty is excluded. At a redeemed common this is thin or negative margin; a
deliberate choice while volume is low.

First real claim: order Nº 1, certificate 68, locked on-chain.

---

## Phase 7 — The pull bot

Posts every settled draw to X with a generated card.

**Cost shaped the design.** X charges $0.015 per post but **$0.20 when it
contains a link** — a repricing that made per-pull posting with links roughly
$13/day at launch volume. Options weighed: rarity-gating, hourly batching,
link-free commons. Links on everything was chosen, with a daily cap as the
guardrail.

### Four bugs worth remembering

1. **OAuth 2.0 refresh tokens rotate on every use.** The bot refreshed but never
   wrote the new token back, so the first refresh worked and every one after
   failed — burning 2h18m of CPU and 2.6GB retrying.
2. **Media upload:** the chunked INIT/APPEND/FINALIZE flow was rejected; a
   single multipart request works for images. `media.write` scope is required
   and must be present at authorisation time.
3. **Overlapping polls posted everything twice.** A batch outlasted the 30s
   interval, so a second tick read the same unposted rows. Fixed with a running
   flag and by claiming each row *before* posting.
4. **Authorised as the wrong account.** Whichever account is signed in when the
   approval URL opens is the one that gets authorised.

### Card design

Fresco masters as the background (blurred, darkened, seeded by work id so each
work gets a stable but distinct ground), Mogilte title, class-coloured
escalation, holder line. The ember colour tried for BURN was pulled back to the
existing Crown gold — a new colour read as shouting.

---

## Phase 8 — Transparency and the token

**The transparency page** publishes: pulls, collectors, certificates, claims,
desk float, Reserve balance, and — the part nobody else does — **observed
frequencies against published odds**, with the caveat that small samples drift.

Deliberately *not* published: revenue as a headline number. "We don't publish
revenue because it invites being read as a yield. Artefracts is a studio, not a
fund."

**Token structure corrected mid-flight.** The original 3% split described as
2.4% Reserve / 0.6% operations was wrong: it's **1% to the pons launchpad**
(their fee, no discretion) and **2% to the Reserve**. Operations come from box
revenue. The token does one thing: it buys art.

**Daily buyback-and-burn** designed with the desk paid first, an operating
share, and a treasury floor the buy can never breach. The line held: *no profit,
no burn, and we'll publish the days there's nothing to burn.* First burn
executed at 1.75% of circulating supply.

A flag raised and left with the user: a scheduled revenue-funded buyback sits
close to the line their own terms draw about holders receiving no share of
earnings.

---

## Phase 9 — Acquisitions

Four funds filling in sequence — $2k / $6k / $15k / $40k. Sequential rather than
parallel because one filling bar tells a story and four half-full ones tell none.

Research established that at these budgets the famous names arrive as **prints,
editions and works on paper**, not unique canvases — and that this is the right
place to start rather than a compromise, since editions have transparent auction
histories and divide into fractions honestly.

Buyer's premium of 25–30% published explicitly: a $40,000 fund bids to about
$30,000.

**Every attempt published, including losses.** A ledger with OUTBID entries is
worth more than a spotless record nobody watched being made.

---

## Recurring lessons

**Verify before claiming.** The droplet is production truth; every patch mirrors
to canonical in the same turn.

**Silence is not health.** Three services drained or stalled silently. A
heartbeat that makes silence mean *dead* is worth more than any amount of error
handling.

**Config is the most dangerous surface.** More outages came from `.env`
duplicates than from contract bugs or logic errors combined.

**Publishing the unflattering number is cheap and compounds.** The EV, the
observed-versus-published odds, the outage post-mortem, the losses in the
acquisition ledger. Each one made the next claim more believable.

**A floor you can check beats a promise you can't.** The desk's float is a
public wallet; the refund path doesn't need the operator alive. Both are
structural, not reassurances.

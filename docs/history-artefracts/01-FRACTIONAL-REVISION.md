# Revision 01 — Fractional shares

**Supersedes §2.1, §2.2, §2.3, §5 and the redemption model of `00-PLAN.md`.** The odds tables in §3.2 survive unchanged — see §4 below for why.

---

## 1. What this fixes

Moving from whole works to fractional shares kills the worst problem in the original plan.

§2.1 said the fee flywheel could never buy blue-chip art: 0.7% of trade volume means $7M of volume per $50k painting. With fractions, the treasury buys **$500 of a $500k Basquiat** instead of a whole $5k print. The constraint that forced you into the low end of the market disappears. Your vault can hold positions in exactly the names that make people want to pull.

It also partly fixes §2.2. A fractional share has a **share price** — a NAV mark, and sometimes a traded price. That is far closer to the TCGPlayer feed I said was missing than any appraisal. Tier construction and buyback pricing both get a real number to work from.

Two genuine wins. But it introduces one constraint that is harder than anything in the original plan.

---

## 2. The new blocker: compliant shares cannot be transferred to strangers

A fractional interest in an artwork is, in nearly every serious jurisdiction, a **security**. Masterworks structures each painting as its own Delaware LLC and files each one as a separate Reg A+ Tier 2 offering. Shares are sold at ~$20 and holders own a security in the owning company, not the canvas.

Securities of this kind carry **enforced transfer restrictions**. The modern implementation is ERC-3643, which puts the eligibility check inside the token contract precisely so that off-chain whitelists cannot be bypassed by a secondary transfer. Issuers must maintain a KYC whitelist and remove wallets whose eligibility lapses.

**A gacha cannot distribute a token like that.** The winner's wallet is not on the whitelist, so the transfer reverts. There is no clever wrapper around this — the restriction is the entire point of the design, and routing around it is securities fraud rather than an integration challenge.

So the shares your gacha awards must fall into one of three buckets:

| Bucket | Transferable? | What it is | Legal posture |
|---|---|---|---|
| **A. Permissionless f-NFT shares** | Yes | ERC-20 fractions of an NFT you own outright, usually digital/NFT art | Grey. SEC/CFTC guidance from March 2026 indicates f-NFTs may be securities. No registration, no protection. |
| **B. Regulated SPV shares** | Only to whitelisted wallets | Reg A+ / MiCA shares in a physical work | Clean, but incompatible with random distribution |
| **C. Whole cheap works** | Yes | An entire piece under ~$5k | Clean. A collectible is not a security. |

### The recommended structure: split the vault in two

Do not pick one. The vault has two halves with different jobs:

**The Treasury Portfolio (bucket B).** Blue-chip fractional positions, held permanently by the treasury, never distributed. This is what makes the token narrative work — a published, growing NAV that fee income demonstrably built. Nobody's wallet ever has to be whitelisted because the shares never leave the treasury. This is also what Collector Crypt does with CARDS: revenue drives buybacks, holders get no direct claim on the vault. **Keep it that way.** The moment $FRACT holders have an enforceable claim on vault NAV, $FRACT is itself a fund interest and you have a much larger problem than the gacha.

**The Prize Pool (buckets A and C).** What the gacha actually awards. Permissionless f-NFT shares for tiers 1–3, and whole low-value works for tiers 4–5. Freely transferable, no whitelist, real on-chain prices.

This gives you the blue-chip story *and* a distributable prize pool, without pretending the second is the first.

### If you insist on awarding regulated shares

There is one workable path: the certificate is transferable, but **redemption is gated**. The winner holds and trades a numbered certificate freely; converting it into the underlying restricted shares requires completing KYC with the issuing platform and getting whitelisted. Rare high-value pulls are exactly the case where a user will tolerate a KYC flow, so gate it at tier 4+ only.

Be aware this is not free: a certificate whose sole value is a claim on a security starts to look like a security itself, and now **you** are the issuer. Take advice specifically on this point before building it. The contracts below support it via a compliance hook, but I would not ship it in v1.

---

## 3. Redemption changes meaning

You cannot ship someone 0.4% of a painting. Collector Crypt's strongest retention hook — over 30% of their users redeem the physical card — has no equivalent here. Do not plan around it.

What replaces it:

| Exit | Mechanism |
|---|---|
| **Unwrap** | Burn the certificate, receive the underlying ERC-20 shares in your wallet |
| **Sell to desk** | Instant buyback at 85% of NAV, paid in USDG from the buyback sleeve |
| **Trade the certificate** | Certificates are ERC-721s and trade on any marketplace, with the artwork identity as the collectible layer |
| **Realisation** | If the underlying work sells, proceeds distribute pro-rata to share holders |

The certificate existing at all is a deliberate choice, and it is the most important product decision in this revision. **A gacha that pays out "37.2 tokens" is a slot machine.** Gacha works because you pull a *thing* — an object with a name, an image, and a number. The certificate is that object: numbered, illustrated with the work, carrying a wall label. The fungible shares sit behind it. Losing this is losing the product.

---

## 4. Why the odds tables survive

Tiers stay banded by **dollar value**, so every number in §3.2 still holds — the EV solve, the ppm arrays, the `configureMachine` args. What changes is what a given value *represents*.

The new dimension is **prestige**, and it is the whole reason fractionalisation is a better product:

| Tier | Value band (Gallery Box) | Drawn from |
|---|---|---|
| T1 Study | $40 | Emerging artists, works $2k–8k |
| T2 Print | $100 | Established mid-market, $15k–60k |
| T3 Edition | $250 | Blue-chip secondary, $100k–500k |
| T4 Original | $900 | Major names, $1M+ |
| T5 Grail | $5,000 | The headline work |

A $40 pull is now *a piece of a real artwork by a named artist*, not a cheap print. Share count floats to hit the band — you might win 8 shares of one work or 0.4 of another. **The artwork's identity is the prize; the share count is the arithmetic.** Surface it that way in the UI: the artist name is the headline, the share count is fine print.

Pool depth also gets much easier. Inventory is now measured in **dollars of share balance per tier**, not item count, and you mint certificates on demand against it. A tier cannot run out mid-draw the way a fixed array of unique tokenIds can. The stockout-downgrade path in the old `GachaMachine` is gone.

---

## 5. New contracts

`ArtVault721.sol` is superseded. Replace with:

| Contract | Role |
|---|---|
| `ShareVault.sol` | Registry of artworks and the ERC-20 share balances the vault holds in each. Tracks NAV per share, prestige tier, and how much of each position is committed to prize pools versus held by the treasury. |
| `ShareCertificate721.sol` | The numbered collectible. Each certificate = N shares of artwork W. Burn to unwrap into the underlying ERC-20, subject to a compliance hook for restricted assets. |
| `GachaMachine.sol` | Rewritten inventory model: mints certificates on demand against tier share inventory. No fixed pools, no stockouts. |

`TreasuryVault.sol` is unchanged — the sleeve waterfall works identically.

---

## 6. What to change in the Lovable prompts

Small edits, not a rewrite:

- **Prompt 1** — `<WallLabel>` gains two props: `shareCount` and `sharePct`. Render as a second mono line beneath the medium: `142 shares · 0.28% of the work`. Keep it visually subordinate to the artist name.
- **Prompt 5** — the odds table gains a "drawn from" column naming the prestige band, not just the floor value. This is what makes a $40 tier feel worth pulling.
- **Prompt 6** — the reveal shows the **artwork and artist first**, and the share count second, after a beat. Pulling "a Basquiat" then learning it's 0.02% is a far better sequence than leading with the fraction.
- **Prompt 8** — treasury page splits into two tables: Portfolio (held, never distributed) and Prize Pool (committed to machines). Show NAV per artwork and the vault's ownership percentage of each.
- **New prompt** — a `/portfolio` page listing every artwork the treasury holds a position in, with the vault's percentage, cost basis, current NAV, and unrealised gain. This is the token's actual pitch and deserves its own page.

---

## 7. Legal, restated

Securities law now dominates gambling law in this project. Both apply.

1. **Never fractionalise a work yourself for distribution.** That makes you the issuer and triggers registration. Buy existing fractional tokens, or award whole cheap works.
2. **Never give $FRACT holders a claim on vault NAV.** Buybacks from revenue, as CARDS does. A claim makes the token a fund interest.
3. **Prize shares must be freely transferable.** If a share needs a whitelist, it cannot be a gacha prize. Verify this at the contract level for every asset before it enters a pool — `ShareVault` records a `restricted` flag and `GachaMachine` refuses to pool restricted assets.
4. **The certificate may itself be a security.** Take advice on this specifically. It is the single point I am least able to resolve for you.
5. Everything in §2.5 of the original plan about gambling still applies, unchanged.

I am not a lawyer and this is not legal advice. The structural choices above are the ones a solicitor will ask about first, so having answers ready will make that conversation shorter and cheaper.

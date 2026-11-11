# A machine for owning art

*Artefracts, explained properly: the mechanism, the money, the vault, and where
this goes.*

---

Nearly a trillion dollars of art will change hands in the next decade. Most of it
will never see a museum wall. It moves between estates, vaults and private sales,
priced by people you'll never meet, stored in places you'll never visit. The art
market's defining feature isn't expense — it's opacity. Prices are private,
provenance is paperwork, and liquidity is a phone call to a dealer who may or may
not call back.

Artefracts is a different arrangement. A vault holds artworks. A machine sells
sealed boxes at twenty-five dollars. Every box opens into a graded, numbered
certificate recording ownership of a fragment of a real work — published on a
public blockchain, in your name, verifiable by anyone. The odds are known before
you open anything. The house buys any certificate back at eighty percent of its
stated value, instantly.

This document explains all of it: how a draw is made provably fair, where your
money goes, what the token does, what happens when something breaks, and what the
vault becomes.

---

# Part one — the object

## What a certificate actually is

When a box settles, a token is minted to your wallet. It records:

- **the work** — which artwork your fragment belongs to
- **your edition number** — your position within a capped edition
- **your share** — how much of that work the fragment represents
- **the mint value** — what it was worth the moment it existed
- **the draw** — the specific, verifiable event that produced it

This is not a receipt pointing at a database we control. The record *is* the
ownership. It sits in your wallet, moves when you move it, and cannot be revoked,
edited, or quietly reissued by us. If Artefracts disappeared tomorrow, your
certificate would still exist and still say the same thing.

Editions are capped and enforced by the contract. A Common work has 300 fragments
and can never have 301. When an edition is exhausted, it's exhausted.

## Season I: The Fractured Fresco

The first collection is the studio's own work — not licensed, not borrowed.

A painted ceiling, fractured into hundreds of pieces. Some fragments are *sinopie*:
the red-earth underdrawings that sit beneath a fresco's surface and are normally
seen only when the plaster fails. Others are finished passages — a peacock against
lapis under a gold star, a fox with a gilded halo, a lion enthroned on gold ground.

Each is photographed as a conservation object: broken edges, exposed mortar,
hairline cracks, salt bloom in the corners. Then sealed in a graded case with its
class and grade on the label, a brass notary mark on the mat, and a holographic
security seal across the seam.

Starting with our own work was deliberate. The machine had to be proven on art we
control entirely before a single acquired piece went near it.

---

# Part two — the mechanism

## Paying with USDG

Boxes are bought in **USDG** — the Global Dollar, issued by Paxos, fully backed and
redeemable one-to-one for US dollars. Not a volatile token: a dollar that moves on
rails.

Artefracts runs on **Robinhood Chain**, an Ethereum layer-2 built on Arbitrum
technology and designed for tokenised real-world assets. USDG is its native
stablecoin.

Getting some takes one transaction. Send USDC from Ethereum, Arbitrum, Base,
Optimism, Polygon or several other chains, and it arrives as USDG on Robinhood
Chain — no separate swap, no wrapped placeholder. You'll want a small amount of ETH
alongside it for network fees, which on a layer-2 are cents rather than dollars.

Connect your wallet and the site reads your balance. That's the entire setup.

## The classes

Every box contains exactly one fragment. There are no empty boxes, no consolation
tiers, no variable lot sizes. What varies is which fragment, and how rare its class
is.

| Class | Edition | Mark | Desk pays | Probability |
|---|---|---|---|---|
| **Common** | of 300 | $17.50 | $14.00 | 97.84% |
| **Rarity** | of 25 | $52.50 | $42.00 | 1 in 51 |
| **Crown** | of 5 | $175.00 | $140.00 | 1 in 500 |

Those probabilities are stored on-chain as parts per million, and the contract
requires them to sum to exactly one million. They aren't a marketing description of
the odds — they *are* the odds, the same numbers the machine uses to resolve your
draw.

**The expected value of a $25 box is $18.50.** We publish that because you should
be able to price a box knowing it. The difference is our margin: it funds the
studio, the vault, the physical programme, and the desk's float.

The scarcity premium — what a Crown is worth beyond its $175 mark — lives in the
market. The floor beneath it is ours.

## How a draw is made provably fair

The hard question with any digital game of chance: how do you know the house didn't
choose your outcome after seeing your bet?

Blockchains don't answer this by themselves. On a chain with a central sequencer
there's no trustworthy on-chain randomness, and using block data would be theatre.
So we use the construction that genuinely works — a committed hash chain — and make
every step checkable.

**Before any customer exists.** We generate a 32-byte secret at random and hash it
a hundred thousand times, producing a chain where each link is the hash of the
next. The final link is published on-chain as a public commitment. This happens
before the machine opens, and it constrains every draw that follows.

**When you open a box.** Your browser generates a random client seed and sends it
with your transaction. We cannot know it in advance, and we cannot change our
commitment after seeing it — the commitment is already on-chain and permanent.

**At settlement.** We reveal the next secret seed from the chain. The contract
verifies that hashing it produces the current commitment. If it doesn't, the
contract rejects the settlement outright. There is no seed we could substitute,
because only the true preimage passes that check.

**The result.** Your outcome derives from the revealed seed, your client seed, and
the draw's id, combined and hashed. The class comes from the published ladder; the
specific work comes from those committed to that class.

Neither side controls it. We committed before knowing your input; you contributed
after we committed.

Every revealed seed is stored publicly. Anyone can take any draw — yours, a
stranger's, one from months ago — and recompute it in a browser. The check is one
line: the revealed seed, hashed, must equal the commitment that existed before the
draw.

## Where the seed secret lives

The scheme is only as strong as the secret behind it. Anyone holding the chain's
root could compute every future draw before it happened.

So the root never sits in plaintext on a server. It's held in encrypted custody and
loaded into memory only when needed, and the expanded chain is never written to
disk at all — every seed is derived on demand from the root. A stolen disk gives an
attacker nothing.

## When something goes wrong

Software fails. Servers stop. Providers rate-limit. The honest question isn't
whether that happens but what protects you when it does.

Your payment sits in the contract while a draw is pending — it doesn't reach us
until settlement. If settlement hasn't happened within **ten minutes**, you can
reclaim the full price yourself by calling the contract directly. Not by emailing
support. Not by waiting for our permission. **The refund path doesn't require us to
be alive, awake, or cooperative.**

Normal settlement takes seconds. The ten-minute window exists for the day nothing
is normal.

The contract enforces both directions: a refunded draw can never later settle, and
a settled draw can never be refunded. Both are covered by our test suite, along with
the odds behaving as published, the vault never committing shares it doesn't hold,
and the chain rejecting invalid reveals.

## The desk

Owning something illiquid is half an arrangement. So there's a desk making one
standing offer: **eighty percent of a certificate's mark, paid immediately.**

No listing, no waiting for a buyer, no counterparty. Sell from your vault in a
click; the payment arrives in the same minute with a transaction hash you can open
on a public explorer.

What that is, precisely: the **mark** is our published valuation of a work. We set
it, we publish it, and we change it only by publishing the change. If a mark falls,
the desk price falls with it. The desk holds a float topped up from revenue — if it
can't cover a sale, the site says so rather than failing your transaction.

It's a floor we choose to provide and honour while it's open. It isn't an infinite
guarantee, and we won't describe it as one.

---

# Part three — the physical

## Taking it home

A certificate can stay digital indefinitely. Or it can become an object.

When redemption opens, you claim the physical card for a fragment you hold. What
arrives is an archival print in a sealed collector case, carrying the grading label
— class and grade — the brass mark, and the holographic seal. With it comes a
signed **Certificate of Authenticity**: the work, the series, your edition number,
the on-chain id, the serial, the date, and the studio's hand.

## The chip

Inside every card is an **NFC chip**.

Tap any phone against it — no app, no login, no account — and the card opens its own
page: the artwork, its class and grade, its edition number, its full provenance,
and the verified draw that produced it. Hand the card to someone across a table and
they can confirm what it is in three seconds, with a device already in their pocket.

This is what provenance should have been all along. Not a folder of paperwork that
travels separately and can be forged, but an object that proves itself.

## What redemption costs you

**It's permanent.** The moment you claim, the on-chain certificate locks to the
physical card. It can no longer be sold to the desk or transferred separately. One
number, one card, for good.

That constraint is deliberate. It stops the story forking — one person holding the
token, another holding the card, both claiming the same edition number. Provenance
only means something if it can't split.

---

# Part four — the vault, and where this goes

## The goal

Simple to state, hard to do: **make owning real art as straightforward as buying
anything else, without lying about what ownership means.**

Not fractional shares of an idea. Not exposure to an index. Specific numbered
fragments of specific works, held in a vault, with a published value, a standing
buyback, a physical form you can hold, and provenance anyone can check.

Season I proves the machine on our own art. What follows is the harder version:
works we don't make, bought at auction, in public.

## How the tax funds acquisitions

$FRACTS is the studio token. **You don't need it to play** — boxes are bought in
USDG, always.

Every $FRACTS transfer carries a **3% tax**:

- **1% to the pons launchpad** as its platform fee. That share isn't ours and we
  have no discretion over it.
- **2% to the Acquisition Reserve** — a public wallet whose only job is buying
  artworks for the vault.

Operations — the studio, the vault, the physical programme — are funded from box
revenue, not from the token. The token does one thing: it buys art.

The Reserve's allocation is studio policy, executed manually and published for
scrutiny. It isn't a contractual obligation to any holder, and we say so plainly
rather than dressing a promise as a guarantee.

## How the funds work

The Reserve fills four funds in sequence, one at a time:

| Fund | Target | What it buys |
|---|---|---|
| I | $2,000 | A modest edition — Chagall, Miró, Dalí |
| II | $6,000 | A recognisable name — Picasso ceramics, Haring |
| III | $15,000 | A chase piece — Warhol plates, Kusama, Riley |
| IV | $40,000 | The headline — Warhol, Banksy, Hockney |

Sequential rather than parallel, because one filling bar tells a story and four
half-full ones tell none.

When a fund completes, we bid — Sotheby's and Bonhams in London, Venduehuis in The
Hague, Christie's and Bonhams in New York. Auction costs are real: buyer's premium
runs roughly 25–30%, so a $40,000 fund bids to about $30,000. We publish the full
cost breakdown of every acquisition.

At these budgets the famous names arrive as prints, editions and works on paper
rather than unique canvases — a Picasso etching, a Warhol plate, a Haring
screenprint. That's the right place to start, and not a compromise: editions have
transparent auction histories, genuine liquidity, and they divide into fractions
honestly. Each is a specific numbered impression with its own provenance, not a
share of an abstraction.

## What happens to an acquired work

It's photographed and graded. Its mark is published. It's committed to a machine's
prize pool at a class. From that moment it's drawable — meaning a $25 box can
contain a fragment of a Warhol.

Every acquisition is announced with its provenance before it enters a machine. And
every *attempt* is published, including the ones we lose. A ledger with OUTBID
entries in it is worth more than a spotless record nobody watched being made.

Works acquired by the Reserve are never sold quietly. Any disposal is announced,
with the reason and the price.

## Watch the wallet

The Reserve is a public address. You can watch it fill, watch it spend, and see
what it bought sitting in the vault. The desk's float is public. The treasury is
public.

That's the whole mechanism: trades become paintings, and the paintings go into the
machine.

---

## Plainly

This is a game of chance with a floor under it, not an investment.

Most boxes give common fragments. Expected value is below the box price and we
publish the number. Marks are our valuations, not market guarantees. Blockchain
transactions cannot be undone. Smart contracts can contain flaws — ours are tested
and their source is published, which reduces that risk without removing it. Holding
$FRACTS gives you no ownership of works the Reserve acquires; the vault holds them
and the certificates fractionalise them.

Play for the objects, within your means. 18+.

---

*The cabinet is open at artefracts.com. Full documentation — contract addresses,
the fairness method in detail, the glossary — is at artefracts.com/docs. Every pull
as it happens is at artefracts.com/floor.*

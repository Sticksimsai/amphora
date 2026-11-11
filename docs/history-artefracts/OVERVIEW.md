# Artefracts

*What it is, why it exists, and where it goes.*

---

## The problem

Fine art is the least accessible asset on earth, and not mainly because of price.

Prices are private. Provenance is paperwork in a folder that travels separately
from the work and can be forged. Liquidity is a phone call to a dealer who may
call back. Works sit in freeports and estates, seen by nobody, valued by people
you will never meet.

Nearly a trillion dollars of it will change hands over the next decade as
collections built over lifetimes pass to a generation that lives, trades and owns
differently. Most of that will never reach a wall anyone can stand in front of.

Artefracts is an attempt at a different arrangement.

---

## The idea

A vault holds artworks. A machine sells sealed boxes. Every box opens into one
graded, numbered certificate recording ownership of a fragment of a real work —
written to a public blockchain, in your name, verifiable by anyone.

Twenty-five dollars a box. The odds are published before you open anything. Any
certificate can be sold back to the desk instantly at eighty percent of its
stated value. And when you want the object rather than the record, the
certificate becomes a physical card with a chip in it that proves what it is to
any phone.

That is the whole mechanism. The rest is detail.

---

## Why it was built this way

Three decisions shaped everything.

**Chance, published.** A gacha machine is an honest structure for distributing
scarce things — provided the odds are real and public. So they live on-chain
before any box is sold, and every draw is independently recomputable. We publish
the expected value too: **$18.50 against a $25 box**. You should be able to price
a box knowing it.

**A floor, not a promise.** Owning something illiquid is half an arrangement. The
desk makes one standing offer — eighty percent of mark, paid immediately, no
listing, no counterparty. It is a floor we choose to provide and honour while
it's open, funded from a float you can watch.

**The object matters.** A certificate that can never become a thing you hold is a
receipt for an idea. So every fragment can be claimed as a sealed collector card,
with a signed certificate of authenticity, and an NFC chip that opens its own
provenance page when tapped.

---

## Season I: the proof

The first collection is ours. Not licensed, not borrowed — painted by the studio.

**The Fractured Fresco**: a painted ceiling, broken into hundreds of pieces. Some
are *sinopie*, the red-earth underdrawings beneath a fresco's surface, made to be
covered and never seen — the plaster failing is the only reason anyone ever looks
at them. Others are finished passages: a peacock against lapis under a gold star,
a fox with a gilded halo, a lion enthroned on gold ground.

Each is photographed as a conservation object — broken edges, exposed mortar,
salt bloom in the corners — then sealed in a graded case with its class, its
grade, a brass notary mark and a holographic seal.

Starting with our own work was deliberate. Every mechanism had to be proven on
art we controlled entirely before a single acquired piece went near the machine.
Season I is the proof of concept, and it is running with real money now.

---

## How to buy

Boxes are bought in **USDG** — the Global Dollar, issued by Paxos, redeemable
one-to-one for US dollars. Artefracts runs on **Robinhood Chain**, an Ethereum
layer-2 where USDG is native.

Getting some takes one transaction: send USDC from Ethereum, Arbitrum, Base,
Optimism, Polygon or several other chains and it arrives as USDG. You'll want a
small amount of ETH for network fees, which are cents.

Connect a wallet, and the site reads your balance. Open a box. It settles in
seconds and the certificate appears in your wallet.

---

## The classes

| Class | Edition | Mark | Desk pays | Chance |
|---|---|---|---|---|
| **Common** | of 300 | $17.50 | $14.00 | 97.84% |
| **Rarity** | of 25 | $52.50 | $42.00 | 1 in 51 |
| **Crown** | of 5 | $175.00 | $140.00 | 1 in 500 |

Every box contains exactly one fragment. No empty boxes, no consolation tiers.
What varies is which fragment, and how rare its class is.

A work divides into an edition — 300 fragments of a common work, say — and each
holder has a distinct number within it. Like a print run: one image, many
numbered impressions, each individually owned.

---

## Is it transferable?

Yes. A certificate is a token in your wallet. Send it, sell it, hold it — it
moves like anything else you own, and its record moves with it. Sell it to the
desk in a click, or to anyone else on your own terms.

**Until you claim the physical.** At that moment the certificate locks
permanently to the card: no more desk sales, no more transfers, one number and
one card for good. That constraint is the point — it stops the story forking into
one person holding the token and another holding the card, both claiming the same
edition number. Provenance only means something if it can't split.

---

## Redemption

Claim any fragment you hold and it ships as an archival print in a sealed
collector case, carrying the grading label, the brass mark, and the holographic
seal — with a signed Certificate of Authenticity naming the work, the series,
your edition number, the on-chain id and the date.

Inside every card is an **NFC chip**. Tap any phone against it and the card opens
its own page: the artwork, its class and grade, its edition number, its full
provenance, the verified draw that produced it. No app, no login, no account.
Hand it to someone across a table and they can confirm what it is in three
seconds.

This is what provenance should have been — not a folder of paperwork travelling
separately, but an object that proves itself.

Printed and dispatched within one working day. **The $25 covered it** — no
claiming fee, no shipping cost, worldwide. The only thing we can't absorb is your
country's import duty.

---

## What happens when it breaks

Your payment sits in the contract while a draw is pending; it doesn't reach us
until settlement. If settlement hasn't happened within ten minutes, you can
reclaim the full price yourself by calling the contract directly — not by
emailing support, not by waiting for our permission. **The refund path doesn't
require us to be alive, awake, or cooperative.**

Normal settlement takes seconds. That window exists for the day nothing is
normal.

---

## Day one, in full

The machine opened yesterday. Here is the whole of it, including the hours it
didn't work.

**135 boxes opened. 18 collectors. 74 certificates minted. Two rarities. No
crowns.**

Two rarities in 135 pulls is slightly ahead of the published 1-in-51. That is
what small samples do; it is not evidence of anything, and the drift closes as
volume grows. Every one of those draws can be recomputed by anyone.

The desk paid out **$434** across the day — people pulled fragments, looked at
them, and some sold them straight back at $14. That is exactly what the floor is
for. A market where you can only buy is not a market.

**One physical card was claimed**, and that certificate is now locked soulbound
to it.

### What went wrong

Three outages, all of them ours.

**The settler stopped, twice.** The component that resolves draws stalled, and
customers watched a settling screen with nothing behind it. The first time was a
cursor desynchronisation — our seed chain and the chain's commitment drifted
apart, and the settler halted rather than guess, which is correct behaviour and a
poor experience. The second time was a bug in the fix for the first: a function
added without wiring its import, so the recovery path threw instead of recovering.

**The settler ran out of gas.** Its wallet emptied and every settle failed for
want of a fraction of a cent. Five people waited, one for eighty-seven minutes.

**The desk ran dry.** Its float drained from $476 to $2.66 while the automatic
top-up failed silently — a configuration file had picked up an empty duplicate of
the key it needed to sign with, and the process crashed into a log nobody was
reading.

Nobody lost money. The contract holds a payment until settlement and releases it
back after ten minutes if settlement never comes. But people waited for something
that should take seconds, and a few saw a blank card where their fragment should
have been.

### What changed

The settler now heals itself: if its cursor drifts from the chain it realigns to
the position the chain already proves rather than halting; if a draw is already
settled on-chain it records that instead of retrying forever; if the event parse
misses, it reads the outcome from the contract directly.

It reports a heartbeat every minute, so silence in the log now means the process
is dead — a diagnosable state. Before, silence and idleness looked identical.

Three monitors run on a schedule: stuck draws re-queued every two minutes, the
desk float topped up when it drops below its threshold, and the settler's gas
checked every five. Each of day one's failures now corrects itself.

Day one was 135 boxes and three outages. The outages are fixed, and the machine
kept its promises: nobody lost money, every draw settled or was refundable, and
the desk paid everyone who asked.


---

## Where this goes: funding real acquisitions

Season I proves the machine on our own art. The next season is the harder
version — works we didn't make, bought at auction, in public.

**$FRACTS** is the studio token. You don't need it to play; boxes are bought in
USDG, always. Every transfer carries a 3% tax: one percent to the pons launchpad
as its platform fee, and **two percent to the Acquisition Reserve** — a public
wallet whose only job is buying artworks for the vault. Operations are funded
from box revenue. The token does one thing: it buys art.

The Reserve fills four funds in sequence:

| Fund | Target | What it buys |
|---|---|---|
| I | $2,000 | A modest edition — Chagall, Miró, Dalí |
| II | $6,000 | A recognisable name — Picasso ceramics, Haring |
| III | $15,000 | A chase piece — Warhol plates, Kusama, Riley |
| IV | $40,000 | The headline — Warhol, Banksy, Hockney |

When a fund completes, we bid — Sotheby's and Bonhams in London, Venduehuis in
The Hague, Christie's in New York. Auction costs are real: buyer's premium runs
roughly 25–30%, so a $40,000 fund bids to about $30,000. We publish the full cost
breakdown of every acquisition.

At these budgets the famous names arrive as prints, editions and works on paper
rather than unique canvases — a Picasso etching, a Warhol plate, a Haring
screenprint. That is the right place to start, and not a compromise: editions have
transparent auction histories, real liquidity, and they divide into fractions
honestly. Each is a specific numbered impression with its own provenance, not a
share of an abstraction.

**Then it goes into the machine.** Photographed, graded, its mark published,
committed to a prize pool at a class. From that moment a $25 box can contain a
fragment of a Warhol.

Every acquisition is announced with its provenance before it enters a machine.
Every attempt is published — including the ones we lose. A ledger with OUTBID
entries in it is worth more than a spotless record nobody watched being made.

---

## Watch the wallets

The Reserve is a public address. The desk's float is public. Every draw's inputs
and result are public. You can watch the Reserve fill, watch it spend, and see
what it bought sitting in the vault.

That's the whole thing: boxes become fragments, trades become paintings, and the
paintings go back into the machine.

---

## Plainly

This is a game of chance with a floor under it, not an investment.

Most boxes give common fragments. Expected value is below the box price and we
publish the number. Marks are our valuations, not market guarantees. Blockchain
transactions cannot be undone. Smart contracts can contain flaws — ours are
tested and their source published, which reduces that risk without removing it.
Holding $FRACTS gives you no ownership of works the Reserve acquires; the vault
holds them and the certificates fractionalise them.

Play for the objects, within your means. 18+.

---

*The cabinet is open at artefracts.com. Full documentation at
artefracts.com/docs. Every pull as it happens at artefracts.com/floor.*

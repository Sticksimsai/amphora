# A machine for owning art

*How Artefracts works, from the box to the wall.*

---

Nearly a trillion dollars of art will change hands in the next decade. Most of it
will never see a museum wall. It will move between estates, vaults, and private
sales — priced by people you'll never meet, stored in places you'll never visit.

Artefracts is a different arrangement. A vault holds artworks. A machine sells
sealed boxes. Every box opens into a graded, numbered certificate of a fragment of
a real work, recorded on a public blockchain in your name. The odds are published
before you open anything. The house buys any certificate back at 80% of its stated
value, instantly, no questions.

Twenty-five dollars a box. Here is exactly what happens.

---

## What you're buying

A box contains one fragment. Always one — there are no empty boxes and no
consolation tiers. What varies is *which* fragment, and how rare it is.

A fragment arrives as a **certificate**: a token in your wallet that records the
work, your edition number, your share, the value at the moment it was minted, and
the draw that produced it. It isn't a picture of ownership. It is the ownership
record itself — transferable, verifiable by anyone, and impossible to quietly
rewrite.

Later, when redemption opens, that certificate can become a physical object: a
sealed collector card of your fragment, with a signed certificate of authenticity
and an NFC chip inside it.

---

## Season I: The Fractured Fresco

The first collection is ours. Not borrowed, not licensed — made by the studio.

A painted ceiling, fractured into hundreds of fragments. Some are sinopie, the
red-earth underdrawings that sit beneath a fresco and are normally never seen.
Some are finished passages: a peacock against lapis, a fox with a gilded halo, a
lion enthroned in gold ground. Each fragment is photographed as a conservation
object — broken edges, exposed mortar, hairline cracks — and sealed in a graded
case with its class and grade on the label.

Beginning with our own work was deliberate. We wanted the machine proven on art we
control completely before a single acquired piece enters the vault.

---

## Paying: USDG

Boxes are bought in **USDG**, the Global Dollar issued by Paxos, redeemable
one-to-one for US dollars. Artefracts runs on Robinhood Chain, an Ethereum layer-2
where USDG is the native stablecoin.

Getting some is one transaction: send USDC from Ethereum, Arbitrum, Base, Optimism,
Polygon and others, and it arrives on Robinhood Chain as USDG. No separate swap, no
wrapped placeholder. You'll also want a small amount of ETH for network fees.

Connect a wallet, and the site shows your balance. That's the whole setup.

---

## The classes

Every box gives one fragment, and every fragment belongs to a class:

| Class | Edition | Value | The desk pays | Chance |
|---|---|---|---|---|
| **Common** | of 300 | $17.50 | $14.00 | 97.84% |
| **Rarity** | of 25 | $52.50 | $42.00 | 1 in 51 |
| **Crown** | of 5 | $175.00 | $140.00 | 1 in 500 |

Those probabilities live on-chain, published before you open anything. They are
not marketing figures — they are the numbers the contract uses.

We also publish what most operators won't: the **expected value of a box is
$18.50** against a $25 price. The difference funds the studio, the vault, and the
physical programme. You should price a box knowing that, which is why it's on the
site and in these words.

---

## How a draw is made fair

The hard problem with any digital game of chance is simple to state: how do you
know the house didn't choose your outcome after seeing your bet?

Blockchains don't solve this by themselves. There's no reliable randomness on a
chain with a central sequencer, and using block data would be theatre. So we use
the construction that actually works — the same one online casinos have used for a
decade — and we make every step public.

**Before any box exists**, we generate a secret seed and hash it a hundred thousand
times, producing a chain. The final link is published on-chain as a commitment.
This happens before you are a customer.

**When you open a box**, your browser generates a random number — your client seed
— and sends it with the transaction. We cannot know it in advance.

**To settle**, we reveal the next secret seed from the chain. The contract checks
that it hashes to the published commitment. If it doesn't, the contract rejects it.
We cannot substitute a different seed, because only the true preimage passes.

**Your result** is derived from the revealed seed, your seed, and the draw's id.
Neither party controls it alone: we committed before knowing your input, and you
contributed after we committed.

Everything needed to recheck this is public and permanent. Any draw, including
someone else's, can be recomputed in a browser. The verification is one line: the
revealed seed, hashed, must equal the commitment that existed before the draw.

---

## When something goes wrong

Software fails. Servers go down. The honest question isn't whether that happens,
but what protects you when it does.

The contract takes your payment and holds it until the draw settles. If settlement
hasn't happened within **ten minutes**, you can reclaim the full price yourself, by
calling the contract directly. Not by emailing us. Not by waiting for our
permission. The refund path doesn't require us to be alive, awake, or willing.

Normal settlement takes seconds. The ten-minute window exists for the day nothing
is normal.

A refunded draw can never later settle, and a settled draw can never be refunded.
Both directions are enforced by the contract and covered by our test suite.

---

## The desk

Owning something illiquid is only half an arrangement. So there is a desk, and it
makes one standing offer: **80% of a certificate's published value, paid
immediately.**

No listing. No waiting for a buyer. No counterparty to negotiate with. Sell from
your vault page in one click; the money arrives in the same minute, and the
transaction is on a public explorer you can check.

Some honesty about what that is and isn't. The value it pays from — the **mark** —
is our published valuation, set by us and changed only by publishing the change. If
the mark falls, the desk price falls. The desk holds a float we top up from
revenue; if it can't cover a sale, the site says so rather than failing your
transaction. It's a floor we choose to provide and honour while it's open, not an
infinite guarantee, and we won't pretend otherwise.

Anything above the mark is the market's opinion. The floor beneath it is ours.

---

## Everything is on-chain

Not as a slogan — as a list of things you can check without asking us:

- the odds, before you open anything
- the seed commitment, published before any draw existed
- your box purchase
- the revealed seed and its verification
- your certificate, its edition number, and its history
- every buyback the desk has ever paid
- the wallets: the desk's float, the Reserve's balance, the treasury

If we vanished tonight, all of it would still be there, and the refund path would
still work.

---

## Taking it home

A certificate can stay digital forever. Or it can become an object.

When redemption opens, you claim the physical card for a fragment you hold. What
arrives is an archival print of your fragment in a sealed collector case, with the
grading label — class and grade — and a holographic seal. With it comes a signed
**Certificate of Authenticity**: the work, the series, your edition number, the
on-chain id, the date, and the studio's hand.

Inside the card is an **NFC chip**. Tap any phone against it and the card opens its
own page: the artwork, its edition number, its full provenance, the verified draw
that produced it. No app. No login. The card carries its own certificate, and can
prove itself to anyone holding a phone.

One thing to understand before claiming: **redemption is permanent.** The moment
you claim, the on-chain certificate locks to the physical card. It can no longer be
sold to the desk or transferred separately. One number, one card, for good. That
constraint is the point — it's what stops the story forking into two owners of the
same thing.

---

## What comes next: the blue chips

Season I is our own work. The next season isn't.

Every $FRACTS trade carries a 3% tax. One percent goes to the pons launchpad as its
platform fee — that share isn't ours. The remaining **two percent goes to the
Acquisition Reserve**, a public wallet whose only job is buying artworks for the
vault.

The Reserve fills four funds in sequence, from $2,000 to $40,000. When a fund
completes, we bid at auction — Sotheby's and Bonhams in London, Venduehuis in the
Netherlands, Christie's and Bonhams in New York. At these budgets the famous names
come as prints, editions and works on paper rather than unique canvases: a Picasso
etching, a Warhol plate, a Haring screenprint. We think that's the right place to
start. Editions have transparent auction histories, real liquidity, and they divide
into fractions honestly.

Every acquisition is announced with its provenance before it enters a machine. And
every attempt is published — including the ones we lose. A ledger with OUTBID
entries in it is worth more than a clean record nobody watched being made.

Watch the wallet fill. Watch what it buys. That's the whole mechanism: trades
become paintings, and the paintings go into the machine.

---

## Plainly

This is a game of chance with a floor under it. Most boxes give common fragments.
Expected value is below the box price and we publish the number. Marks are our
valuations, not market guarantees. Blockchain transactions can't be undone. Smart
contracts can contain flaws — ours are tested and published, which reduces the risk
without removing it.

Play for the objects, within your means. 18+.

---

*The cabinet is open at artefracts.com. The full documentation, including the
contract addresses and the fairness method in detail, is at artefracts.com/docs.*

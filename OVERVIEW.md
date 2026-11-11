# Amphora

*Draw a fragment.*

Amphora is a vending machine for fragments of art. You pay for a box. You
receive a **Sherd**: a graded, numbered certificate of one fragment of a real
work held in the Amphora treasury. The odds were written on-chain before you
opened anything, the expected value is published, and a standing desk — the
Ferryman — will buy back whatever you draw at eighty percent of its mark.

It runs on **Elysium**, the layer-2 Kinetiq built for Hyperliquid, and it is
priced and paid in **HYPE**.

## The problem it answers

Fractional art has mostly failed for one reason: a fraction with no exit is a
trap. You own a sliver of something and nobody is obliged to take it off you.
Amphora adds three things.

**A floor you can check.** The Ferryman pays 80% of mark, at once, for any
unredeemed Sherd. Its float is a public wallet. You can see what it can pay
before you ask it to.

**A physical end.** A Sherd can be redeemed as a sealed card with a chip that
answers for itself. Redeeming locks the certificate to the card for good: one
number, one object.

**The numbers most machines hide.** The odds, the expected value, and the
frequencies actually observed against the odds published.

## The ladder

Everything is a multiple of the box price. At a 0.5 HYPE box:

| Class | Edition | Mark | The Ferryman pays | Chance |
|---|---|---|---|---|
| **Mortal** | of 300 | 0.35 HYPE | 0.28 HYPE | 97.84% |
| **Hero** | of 25 | 1.05 HYPE | 0.84 HYPE | 1 in 51 |
| **Olympian** | of 5 | 3.50 HYPE | 2.80 HYPE | 1 in 500 |

**Expected value: 0.37 HYPE on a 0.5 HYPE box. Seventy-four percent.** The
difference pays for the studio, the treasury, the physical programme and the
Ferryman's float. Buy a box because you want the object.

HYPE is not a stablecoin. Marks and the Ferryman's price are fixed in HYPE, so
in your own currency they move when HYPE moves. The seventy-four percent does
not.

## How to buy

1. Get HYPE onto Elysium. The official bridge moves it one-to-one from HyperEVM.
2. Connect a wallet on Elysium (chain 99901).
3. Open a box. It is a single transaction: there is nothing to approve first.
4. A few seconds later the draw settles and the Sherd is yours.

If a draw is ever not settled within ten minutes, you can take your HYPE back
from the contract yourself. That path does not need us to be awake, willing or
alive.

## Why you can trust the draw

Before any customer existed we hashed a secret a hundred thousand times and
published the last link. Each draw reveals the next link backwards. The
contract accepts only the true one. Your browser adds its own seed, which we
cannot know in advance. The result comes from both, plus your address and the
draw number. Every revealed seed is public, so any draw can be recomputed by
anyone.

## What a Sherd is

A numbered place in an edition, exactly like a print run. Until you redeem it
you can keep it, send it, sell it to the Ferryman, or sell it to anyone else on
your own terms. Its record on-chain says which work, which number, when, and
from which machine.

## The collection

Season I is *The Fractured Fresco*: the studio's own work, 541 pieces, divided
into editions. Starting with work we fully control was deliberate. Works bought
at auction enter the same machine later, so an ordinary box can hold a fragment
of something famous.

## What we publish

Draws, collectors, Sherds issued, claims, the Ferryman's float, the Reserve's
balance, and observed frequencies against published odds, with the caveat that
small samples drift. Failures too.

*A floor you can check beats a promise you can't.*

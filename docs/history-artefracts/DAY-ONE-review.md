# Day one

*What happened when we opened the machine, including the parts that broke.*

---

Artefracts went live on Robinhood Chain mainnet yesterday. A vending machine for
fine art: twenty-five dollars a box, one graded and numbered fragment of a real
work, odds published on-chain before you open anything, and a desk that buys any
certificate back at eighty percent of its mark.

Here is the whole of day one, including the hours it didn't work.

---

## The numbers

**135 boxes opened. 18 collectors. 74 certificates minted. Two rarities. No
crowns.**

At the published odds — 97.84% common, 1 in 51 a rarity, 1 in 500 a crown — two
rarities in 135 pulls is slightly ahead of expectation. That is what small
samples do. It is not evidence of anything, and the drift will close as volume
grows. Every one of those draws can be recomputed by anyone who wants to check.

The desk paid out **$434** in buybacks across the day. People pulled fragments,
looked at them, and some sold them straight back at $14 — which is exactly what
the floor is for. A market where you can only buy is not a market.

**One physical card was claimed.** The certificate is now locked soulbound to
that card: it can never be sold to the desk or transferred separately again. One
number, one card, for good.

---

## What went wrong

Three separate outages, all of them ours.

**The settler stopped, twice.** The component that resolves draws stalled and
left customers watching a settling screen with nothing behind it. The first time
it was a cursor desynchronisation — our seed chain and the chain's commitment
drifted apart, and the settler halted rather than guess, which is the correct
behaviour but a poor experience. The second time was a bug in the fix for the
first: a function was added without wiring its import, so the recovery path threw
instead of recovering.

**The settler ran out of gas.** Its wallet emptied and every settle failed for
lack of a fraction of a cent. Five people waited, one for eighty-seven minutes.

**The desk ran dry.** Its float drained from $476 to $2.66 while the automatic
top-up failed silently — a configuration file had picked up an empty duplicate of
the key it needed to sign with, and the process crashed into a log nobody was
reading.

Nobody lost money. The contract holds a player's payment until settlement and
releases it back to them after ten minutes if settlement never comes, without
needing us to be awake or willing. But several people waited for something that
should take seconds, and a few saw a blank card where their fragment should have
been.

---

## What we changed

The settler now heals itself. If its cursor drifts from the chain, it searches
for the position the chain already proves and realigns rather than halting. If a
draw is already settled on-chain, it records that instead of retrying forever. If
the event parse misses, it reads the outcome from the contract directly.

It also reports a heartbeat every minute. Silence in the log now means the
process is dead, which is a diagnosable state — before, silence and idleness
looked identical.

Three monitors run on a schedule: stuck draws are re-queued every two minutes,
the desk float is topped up when it drops below its threshold, and the settler's
gas is checked every five. Each of yesterday's failures now corrects itself
without anyone noticing.

---

## What's live

**The machine.** Three classes, seventy-four works inducted, odds and marks
published on-chain before any box opens.

**The desk.** Eighty percent of mark, paid instantly, no listing and no
counterparty. Sell from your vault in a click.

**Redemption.** Claim any fragment as a sealed physical card with a signed
certificate of authenticity and an NFC chip inside it. Tap any phone against the
card and it opens its own provenance page — no app, no login. Cards are printed
and dispatched within one working day, shipping included worldwide. The only cost
we can't absorb is your country's import duty.

**The Floor.** Every pull, live, as it settles. Three columns. The crown column
still reads: *no crown has ever been pulled.*

---

## What we publish

Odds, before you open anything. The seed commitment, before any draw exists. The
expected value of a box — $18.50 against a $25 price — because you should be able
to price a box knowing it. The desk's float. The Reserve's balance. Every draw's
inputs and its result.

We do not publish revenue as a headline number, because it invites being read as
a yield. Artefracts is a studio, not a fund.

---

## Next

More of Season I inducted — the collection is 542 works and only seventy-four are
in the machine so far.

The Acquisition Reserve begins filling. Two percent of every $FRACTS trade goes
to a public wallet whose only job is buying artworks at auction — Sotheby's,
Bonhams, Venduehuis — into the vault, where they become drawable from the same
machine. Every acquisition announced with its provenance beforehand, and every
attempt published including the ones we lose.

---

Day one was 135 boxes and three outages. The outages are fixed and the machine
kept its promises: nobody lost money, every draw settled or was refundable, and
the desk paid everyone who asked.

The cabinet is open at artefracts.com.

*Chance-based. 18+. Expected value is below the box price and we publish it. Play
for the objects, within your means.*

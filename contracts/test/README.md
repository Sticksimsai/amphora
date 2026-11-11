# Amphora contract tests

Run:
    forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
    forge test -vv
    forge coverage            # aim: 90%+ on GachaMachine, ShareVault, ShareCertificate721

## What each file defends

| File | The claim it protects |
|---|---|
| `Fairness.t.sol` | Commit-reveal is real: a wrong seed can't settle, the chain only advances on a valid reveal, seeds are published, no double-settle, only the settler settles. |
| `Ladder.t.sol` | The published odds are the actual odds: ppm must sum to 1,000,000, bands must be sane, observed frequencies track the ladder over 400 draws, an empty tier reverts instead of silently downgrading. |
| `Solvency.t.sol` | The vault never promises shares it doesn't hold: no over-commit, no double-commit across machines, stale NAV blocks commitment, pools debit on mint, only the machine can debit. |
| `Certificate.t.sol` | The certificate is an honest record: it stores the artwork, shares, machine and serial; serials increment per artwork; value follows the mark; only the machine can mint. |
| `Refund.t.sol` | A player's money is never trapped: refund after timeout returns the full price, not before, not by strangers, not twice, and a refunded draw can't later settle. |

## Known gaps (write before mainnet)

- Desk buyback path (`deskAcquire` + payment) — currently exercised only on testnet by hand.
- Redemption / soulbound locking once that contract lands.
- Fuzz the value sampler across non-degenerate bands (Machine Two's ladder).
- Invariant suite: total committed shares per artwork must never exceed held balance, across arbitrary sequences of commits, draws and refunds.

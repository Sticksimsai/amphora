# Deprecated — whole-asset design

Superseded by Revision 01 (fractional shares). Kept for reference only.

- `ArtVault721.whole-asset.sol` → replaced by `ShareVault.sol` + `ShareCertificate721.sol`
- `GachaMachine.whole-asset.sol` → replaced by `src/GachaMachine.sol`

The substantive difference is the inventory model. The old machine held fixed
arrays of unique tokenIds and swap-removed one per draw, so a tier could empty
mid-session and silently downgrade a winner. Fractional inventory is measured in
dollars and cannot run out that way, so the stockout-downgrade path is gone.

# Key separation & seed custody — mainnet runbook

Testnet ran everything from one key. That key deployed contracts, settled draws,
paid the desk, and moved funds. It is a nonce bottleneck, a single point of total
loss, and it makes every compromise maximal. Mainnet separates by role.

## The five identities

| Identity | Holds | Does | Custody |
|---|---|---|---|
| **ADMIN** | `DEFAULT_ADMIN_ROLE` on every contract | Grants and revokes roles. Nothing else, ever. | Hardware wallet, offline between uses. Ideally a Safe. |
| **CURATOR** | `CURATOR_ROLE`, `NAV_ROLE`, `SERIES_ROLE`, `OPERATOR_ROLE` | Registers works, sets marks, commits to pools. | Hot key on the induction machine. Rotatable. |
| **SETTLER** | `SETTLER_ROLE` on the machine | Settles draws. Nothing else. | Hot key in the settler service only. Holds a small HYPE balance for gas and nothing more. On Elysium gas and payment are the same asset, so the cap on this wallet is a number you choose, not a property of the token: keep SETTLER_TARGET_HYPE small. |
| **DESK** | `DESK_ROLE` on certificates | Acquires certificates, pays sellers. | Hot key with a *bounded* HYPE float (pays sellers and its own gas), refilled by `scripts/float-check.ts` up to DESK_TARGET_HYPE. |
| **RESERVE** | no roles | Holds acquisition money. | Safe / multisig. Never a service key. |

Rules that make the separation worth having:
- No service ever holds a key with more power than its job needs.
- The settler key holds gas only. If it leaks, an attacker can settle draws —
  which they cannot profit from, because outcomes are already committed.
- The desk key's exposure is capped by its float. Top it up in increments you
  would be willing to lose.
- ADMIN never runs in a service. It signs from a wallet, by a human, rarely.

## Generating the keys

```bash
for role in curator settler desk; do
  echo "=== $role ==="
  cast wallet new
done
```

Record each address. Store each private key in your password manager under its
role name. Never paste a key into a shell that has history enabled — use a file
with `0400` permissions, or systemd credentials (below).

## Granting the roles

```bash
# from ADMIN
cast send $VAULT "grantRole(bytes32,address)" $(cast keccak "CURATOR_ROLE") $CURATOR --rpc-url $RPC --private-key $ADMIN_KEY
cast send $VAULT "grantRole(bytes32,address)" $(cast keccak "NAV_ROLE")     $CURATOR --rpc-url $RPC --private-key $ADMIN_KEY
cast send $FACTORY "grantRole(bytes32,address)" $(cast keccak "SERIES_ROLE") $CURATOR --rpc-url $RPC --private-key $ADMIN_KEY
cast send $GACHA "grantRole(bytes32,address)" $(cast keccak "SETTLER_ROLE") $SETTLER --rpc-url $RPC --private-key $ADMIN_KEY
cast send $CERT  "grantRole(bytes32,address)" $(cast keccak "DESK_ROLE")    $DESK    --rpc-url $RPC --private-key $ADMIN_KEY
cast send $VAULT "grantRole(bytes32,address)" $(cast keccak "POOL_ROLE")    $GACHA   --rpc-url $RPC --private-key $ADMIN_KEY
cast send $CERT  "grantRole(bytes32,address)" $(cast keccak "MINTER_ROLE")  $GACHA   --rpc-url $RPC --private-key $ADMIN_KEY
```

Then **revoke the deployer's operational roles** so it is admin-only:

```bash
cast send $VAULT "revokeRole(bytes32,address)" $(cast keccak "CURATOR_ROLE") $DEPLOYER --rpc-url $RPC --private-key $ADMIN_KEY
cast send $GACHA "revokeRole(bytes32,address)" $(cast keccak "SETTLER_ROLE") $DEPLOYER --rpc-url $RPC --private-key $ADMIN_KEY
```

Verify every grant with `hasRole` before trusting it.

## Delivering keys to services (no keys in .env)

systemd credentials keep the key out of the service user's reach:

```ini
# /etc/systemd/system/amphora-settler.service
[Service]
LoadCredential=settler-key:/etc/amphora/settler.key
LoadCredential=seed-root:/etc/amphora/seed-root
Environment=SEED_PROVIDER=systemd
Environment=NODE_ENV=production
```

```bash
sudo mkdir -p /etc/amphora
sudo install -m 0400 -o root -g root settler.key /etc/amphora/settler.key
sudo install -m 0400 -o root -g root seed-root   /etc/amphora/seed-root
sudo systemctl daemon-reload && sudo systemctl restart amphora-settler
```

The service reads them from `$CREDENTIALS_DIRECTORY`. The `amphora` user cannot
read `/etc/amphora` at all. Remove `OPS_PRIVATE_KEY` from `.env` entirely.

## Seed custody

The chain is `s[i] = keccak(s[i-1])`, so **only the root is secret** — the rest is
derived. `src/services/seedVault.ts` derives on demand and never writes a seed to
disk. The old plaintext chain file must be deleted:

```bash
shred -u ~/amphora/backend/.chains/*.json 2>/dev/null || rm -f ~/amphora/backend/.chains/*.json
```

Create the mainnet chain with `npx tsx scripts/seed-root-setup.ts --length 100000`,
encrypt the root immediately, commit the printed hash on-chain, and destroy every
plaintext copy.

## If a key is compromised

| Key | Blast radius | Response |
|---|---|---|
| SETTLER | Can settle draws; cannot change outcomes (already committed) | Revoke, grant a new settler, restart service. |
| DESK | Can drain the desk float | Revoke, move remaining float, re-grant to a fresh key. |
| CURATOR | Can register works and set marks | Revoke immediately; audit every mark and pool commitment since the leak. |
| ADMIN | Total | There is no recovery. This is why it is a hardware wallet held offline. |
| SEED ROOT | Every pending draw is predictable | Commit a new chain immediately; the old chain's remaining seeds are worthless once superseded. Disclose it. |

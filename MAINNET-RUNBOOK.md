# Amphora — Elysium deployment runbook

Elysium mainnet **99901** · testnet **99801** · gas and payment both native **HYPE**

Do the whole thing on testnet first, with `TESTNET=true` and `$RPC` pointed at
99801. Then repeat on mainnet. Work top to bottom and do not skip the
verification steps.

Nothing here has been run against Elysium yet. Treat the first testnet pass as
the real test of this document.

---

## 0 · Before you start

**A keyed RPC is a prerequisite.** Alchemy is the chain's primary provider;
Chainstack, Goldsky, QuickNode and dRPC also serve it. Note your plan's
`eth_getLogs` block-range limit: it becomes `LOG_CHUNK`.

```bash
export RPC="<your keyed Elysium URL>"
cast chain-id --rpc-url $RPC          # must print 99901 (or 99801 on testnet)
```

If it prints 1338 or 1339 you have Vulcan Forged's unrelated "Elysium". Stop.

**Decide the names now.** The certificate is `Amphora Sherd` / `SHERD`, set in
`src/ShareCertificate721.sol` and immutable after deploy. Don't let it collide
with the token ticker (`AMPH`).

**Decide the box price in HYPE now.** Everything else is a ratio of it.

```bash
cd ~/amphora/backend && npx tsx scripts/solveOdds.ts 0.5
```

**Generate five separate keys** (`docs/KEYS.md`) and fund them. HYPE reaches
Elysium through the official bridge at `elysium.kinetiq.xyz/bridge`, 1:1 from
HyperEVM. Use only that bridge; wallets flagged lookalikes around launch.

```bash
export ADMIN=0x…  CURATOR=0x…  SETTLER=0x…  DESK=0x…  REDEEMER=0x…  TREASURY=0x…
for a in $ADMIN $CURATOR $SETTLER $DESK $REDEEMER; do echo -n "$a "; cast balance $a --ether --rpc-url $RPC; done
```

ADMIN and CURATOR need gas for deployment and induction (~1,700 transactions for
the full collection). SETTLER needs a fraction of a HYPE. DESK needs its float.

---

## 1 · Seed root and commitment

**This prints a secret once.**

```bash
cd ~/amphora/backend
npx tsx scripts/seed-root-setup.ts --length 100000
sudo mkdir -p /etc/amphora
sudo nano /etc/amphora/seed-root      # paste the root, nothing else
sudo chmod 0400 /etc/amphora/seed-root && sudo chown root:root /etc/amphora/seed-root
```

Clear your scrollback. Record the **commitment** (not the root) for step 3.

Size the chain for volume: one link per box, 100,000 links. At ~10 blocks a
second nothing about the chain limits you; the seed chain does.

---

## 2 · Deploy

The broadcaster must be ADMIN, because the script grants roles.

```bash
cd ~/amphora/contracts
forge test                                   # 36 passing, or stop
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $RPC --private-key $ADMIN_KEY --broadcast -vvv | tee ~/deploy.log
```

Export the printed addresses as `VAULT CERT GACHA FACTORY MINT`, and note the
block of the factory deployment for `FACTORY_START_BLOCK`.

Verify what is immutable before anything else:

```bash
cast call $GACHA "vault()(address)" --rpc-url $RPC          # = $VAULT
cast call $GACHA "certificate()(address)" --rpc-url $RPC    # = $CERT
cast call $GACHA "treasury()(address)" --rpc-url $RPC       # = $TREASURY
cast call $CERT  "symbol()(string)" --rpc-url $RPC          # SHERD
```

There is no pay token to check: payment is native HYPE.

Verify source on the explorer (Blockscout API at `https://elysium.kinetiq.xyz/api`).

---

## 3 · Roles and seed chain

The deploy script grants every role. Verify all of them — this is the step that
failed three times on the predecessor:

```bash
h() { cast call $1 "hasRole(bytes32,address)(bool)" $(cast keccak "$2") $3 --rpc-url $RPC; }
h $VAULT   CURATOR_ROLE  $CURATOR
h $VAULT   NAV_ROLE      $CURATOR
h $VAULT   POOL_ROLE     $GACHA
h $VAULT   POOL_ROLE     $CERT
h $FACTORY SERIES_ROLE   $CURATOR
h $GACHA   OPERATOR_ROLE $CURATOR
h $GACHA   SETTLER_ROLE  $SETTLER
h $CERT    MINTER_ROLE   $GACHA
h $CERT    DESK_ROLE     $DESK
h $CERT    REDEEM_ROLE   $REDEEMER
```

Ten `true`s. Then commit the seed chain from CURATOR (it holds `OPERATOR_ROLE`):

```bash
cast send $GACHA "commitSeedChain(bytes32,uint64)" <COMMITMENT> 100000 --rpc-url $RPC --private-key $CURATOR_KEY
cast call $GACHA "committedHash()(bytes32)" --rpc-url $RPC
```

---

## 4 · Configure the machine — single tier first

100% Mortal until the rarer classes are genuinely stocked. An empty rollable
tier reverts settlement (the player can refund after ten minutes, but don't
make them).

```bash
BOX=500000000000000000        # 0.5 HYPE
MORTAL=350000000000000000     # 0.35
cast send $GACHA "configureMachine(uint32,uint128,uint32[5],uint128[5],uint128[5])" \
  1 $BOX "[0,1000000,0,0,0]" "[0,$MORTAL,0,0,0]" "[0,$MORTAL,0,0,0]" \
  --rpc-url $RPC --private-key $CURATOR_KEY
```

---

## 5 · Backend

```bash
cd ~/amphora/backend
cp .env.example .env && nano .env
npm run env:check            # MUST print nothing. Duplicate keys caused three outages.
```

Set at least: `TESTNET`, `RPC_URL`, `LOG_CHUNK`, the five contract addresses,
`FACTORY_START_BLOCK`, every `*_ADDRESS`, `BOX_PRICE_HYPE`, `SEED_PROVIDER`.

Keys arrive by systemd credential, not `.env`:

```bash
sudo nano /etc/amphora/settler.key /etc/amphora/desk.key /etc/amphora/treasury.key
sudo chmod 0400 /etc/amphora/*.key && sudo chown root:root /etc/amphora/*.key
```

Add to the units (`deploy/amphora-{api,settler}.service`):

```ini
LoadCredential=seed-root:/etc/amphora/seed-root
LoadCredential=settler-key:/etc/amphora/settler.key
LoadCredential=desk-key:/etc/amphora/desk.key
Environment=SEED_PROVIDER=systemd
Environment=NODE_ENV=production
```

```bash
npm run db:push
sudo cp ../deploy/amphora-*.service /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now amphora-api amphora-settler
sudo journalctl -u amphora-settler -n 12 --no-pager
```

The settler must log, in order: the chain name and id, its signer and HYPE
balance, then `alive · 0 pending · 0 queued · gas …` within a minute. The API
must log the chain and the desk address. If either refuses to start, read the
message: both assert the chain id, and the API asserts the desk key holds
`DESK_ROLE`.

Install the monitors:

```bash
mkdir -p ~/logs && crontab ../deploy/crontab.amphora
npx tsx scripts/float-check.ts --dry
```

---

## 6 · Induct the collection

```bash
npx tsx scripts/induct.ts --dry --limit 3
npx tsx scripts/induct.ts --class MORTAL --limit 20
cast call $VAULT "tierArtworks(uint32,uint8)(uint256[])" 1 1 --rpc-url $RPC
```

Once 20 look right, run the rest under `nohup`. **Send nothing else from the
curator key while it runs.** If it is interrupted: `npx tsx scripts/reconcile-ledger.ts`,
then run it again; it skips what is done.

Then the rarer classes, and only then the full ladder:

```bash
npx tsx scripts/induct.ts --class HERO
npx tsx scripts/induct.ts --class OLYMPIAN
npx tsx scripts/solveOdds.ts 0.5        # copy the cast command it prints, sign as CURATOR
npx tsx scripts/sync.ts
curl -s https://api.amphora.example/public/machines | grep -o '"evRatio":[0-9.]*'
```

Expect **0.74**.

---

## 7 · Frontend cutover

Give the frontend: chain id 99901, name `Elysium`, currency `HYPE` (18), your RPC,
explorer `https://elysium.kinetiq.xyz/explorer`, and the contract addresses.
Define the chain by hand; do not pick "Elysium" from a wallet or library list.
Search the project for `99801` and any testnet address before going live.

---

## 8 · Verification before announcing

With a fresh wallet and your own HYPE:

1. Wallet adds chain 99901, currency HYPE.
2. Balance chip shows real HYPE.
3. The amphora shows live odds and EV 74%.
4. Open one box: **one** transaction, no approval. Settles in seconds.
5. `/c/` page renders the right work; COA downloads with the right title.
6. Sell it to the Ferryman. The HYPE arrives.
7. `cast balance $DESK` fell by the bid plus gas.
8. The Floor shows the draw.
9. `/verify/{drawId}` recomputes and matches.
10. `cast balance $TREASURY` rose by the box price; `treasuryOwed()` is 0.

Then the failure drills, on testnet only:

- Stop the settler, open a box, wait ten minutes, call `refundUnsettled`. Full
  price back.
- Restart the settler mid-settle. It must realign and carry on.
- Empty the desk. `/desk/sell` must refuse with `desk_float_low` and the
  certificate must not move.

Any failure stops the launch.

---

## 9 · After launch

- Watch `~/logs/float.log`. A non-zero exit from `float-check` is a page.
- Silence from the settler for more than a minute means it is dead.
- Withdrawals from Elysium to HyperEVM go through the rollup's challenge period.
  Treasury HYPE you intend to move off-chain is not instant; plan around it.
- Kinetiq says parameters may still change after launch. Re-read their docs
  before every upgrade window.

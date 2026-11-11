# Artefract — backend deployment runbook

Order matters. Testnet end-to-end first; mainnet is gated behind Phase 0 (counsel) and the
LiveArt transfer-restriction check. Every command is copy-paste; `# ←` marks values you supply.

---

## Phase 1 — local sanity (your laptop, 15 min)

Prove the code runs before paying for a server.

```bash
git init artefract && cd artefract          # put outputs/backend + outputs/contracts in here
# copy the delivered folders in, then:
cd backend
cp .env.example .env
npm install
npm run solve:odds                          # must print 3 machines, ppm summing to 1,000,000
npx tsc --noEmit                            # typecheck must pass
```

Contracts:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cd ../contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit
forge build                                 # must compile clean
forge test                                  # test suite still to be written — see §Open items
```

---

## Phase 2 — droplet provision (DigitalOcean, 20 min)

4GB / 2vCPU Ubuntu 24.04 is enough for testnet and early mainnet. Region: FRA or AMS
(good peering, and you're geoblocking GB at the app layer anyway).

```bash
# on the droplet as root, first login
adduser artefract && usermod -aG sudo artefract
rsync --archive --chown=artefract:artefract ~/.ssh /home/artefract
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# harden ssh
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Log back in as `artefract`, install the stack:

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# Docker + compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker artefract && newgrp docker

# Foundry (for deploys and cast debugging from the box)
curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
echo 'export PATH=$PATH:~/.foundry/bin' >> ~/.bashrc
```

---

## Phase 3 — services (5 min)

```bash
mkdir -p ~/artefract && cd ~/artefract
# get the code up (git clone your repo, or scp the folders)
cd backend
sed -i 's/CHANGE_ME/'"$(openssl rand -hex 24)"'/' docker-compose.yml   # random pg password
docker compose up -d
docker compose ps        # db + redis healthy
```

Put the same password into `.env` → `DATABASE_URL`, then:

```bash
cp .env.example .env && nano .env       # fill everything marked below
npm install
npx drizzle-kit push                    # create schema
```

`.env` fill order:
1. `TESTNET_RPC_URL` — **TO VERIFY** from Robinhood Chain docs / robinhoodchain.blockscout.com
   (chain id 46630). Do not guess this.
2. `OPS_PRIVATE_KEY`, `SETTLER_PRIVATE_KEY` — two FRESH keys (`cast wallet new` twice).
   Ops = seed commits + machine config. Settler = settleDraw only. Never the same key,
   never a key holding real funds.
3. Contract addresses — come out of Phase 4.

---

## Phase 4 — contracts to testnet (15 min)

Fund the deployer + both bot addresses with testnet ETH (Robinhood Chain faucet — check
their docs; if none, bridge from an L1 testnet per their guide).

```bash
cd ~/artefract/contracts
export TESTNET_RPC_URL=...                       # ← verified URL
export ADMIN=0x...                               # ← your deployer address
export OPS_BOT=0x...                             # ← address of OPS_PRIVATE_KEY
export SETTLER_BOT=0x...                         # ← address of SETTLER_PRIVATE_KEY
export TESTNET=true

forge script script/Deploy.s.sol:Deploy \
  --rpc-url $TESTNET_RPC_URL \
  --private-key $DEPLOYER_KEY \
  --broadcast -vv
```

Copy the five printed addresses into `backend/.env` (`GACHA_ADDRESS`, `TREASURY_ADDRESS`,
`PAY_TOKEN` = the MockUSDG address).

Register Series I + configure the launch machine (ops key):

```bash
# Series I in-house editions — the manifest IS the deployment:
cd ../series1
export FACTORY=0x... VAULT=0x... RPC=$TESTNET_RPC_URL OPS_KEY=$OPS_PRIVATE_KEY
export METADATA_BASE=https://api.yourdomain.com/meta/     # or ipfs://<cid>/
python3 gen-register.py > register.sh && less register.sh  # review, always
./register.sh
# for each EditionCreated event, run the paired updateNav line (NAV = mark, 90d)

# The ONE launch machine. The contract is 5-tier; a 4-tier machine is a
# 5-tier machine with slot 0 (Study) at zero probability — no code change:
cd ../backend
cast send $GACHA_ADDRESS \
  "configureMachine(uint32,uint128,uint32[5],uint128[5],uint128[5])" \
  1 25000000 \
  "[0,921128,69570,8899,403]" \
  "[0,17500000,48000000,120000000,490000000]" \
  "[0,17500000,72000000,200000000,910000000]" \
  --rpc-url $TESTNET_RPC_URL --private-key $OPS_PRIVATE_KEY
# Print band is degenerate (lo=hi=$17.50): flat mark, one unit per pull.
# These numbers ARE Rev 02.1 §8 — never hand-edit; re-run the solver if
# anything about tiers changes.
```

Seed the fairness chain:

```bash
node --import tsx -e "import('./src/services/fairness.ts').then(async m=>{
  const c=await m.generateSeedChain(10000); console.log('commit:',c.commitment)})"
cast send $GACHA_ADDRESS "commitSeedChain(bytes32,uint64)" 0x<commit> 10000 \
  --rpc-url $TESTNET_RPC_URL --private-key $OPS_PRIVATE_KEY
```

> The fairness KMS stub **throws by design** — that's your reminder that seed material
> must not live in plaintext env for mainnet. For testnet a dev flag / local key is fine;
> for mainnet, AWS KMS or equivalent before launch. Do not delete the throw; implement past it.

---

## Phase 5 — run the backend (10 min)

```bash
sudo cp ~/artefract/deploy/artefract-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now artefract-api artefract-settler
# indexer + feerouter are POST-token-launch (they watch the pons pool):
# sudo systemctl enable --now artefract-indexer artefract-feerouter

systemctl status artefract-api            # green
curl -s localhost:3001/health             # {"ok":true}
curl -s localhost:3001/machines | head    # odds + live EV from inventory
journalctl -u artefract-settler -f        # watch it idle politely
```

Notes wired into the code you should know about:
- **feeRouter refuses to boot** unless the pons locker's `feeRedirects` points at your
  TreasuryVault. That's the launch-day step: set the creator fee wallet to the
  TreasuryVault address when you create the $FRACT token on pons. The assert is the guard
  that the flywheel is protocol-enforced, not a promise.
- **Settler runs BullMQ concurrency=1** and halts on seed-chain desync. If it halts, that's
  it doing its job — investigate, never bump concurrency to "fix" it.
- Draws unsettled for 10 min are refundable on-chain by the user (`refundUnsettled`), so a
  dead settler costs you goodwill, not user funds.

---

## Phase 6 — edge: nginx, TLS, Cloudflare (15 min)

The API's geoblock reads `CF-IPCountry`, so Cloudflare (free tier) sits in front:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp ~/artefract/deploy/nginx-artefract.conf /etc/nginx/sites-available/artefract
sudo sed -i 's/api.artefract.example/api.yourdomain.com/' /etc/nginx/sites-available/artefract  # ←
sudo ln -s /etc/nginx/sites-available/artefract /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.yourdomain.com
```

Then in Cloudflare: DNS A record → droplet IP, proxy ON. Verify the block works:

```bash
curl -s -H "CF-IPCountry: GB" https://api.yourdomain.com/machines -o /dev/null -w "%{http_code}\n"
# → 451
```

Without Cloudflare the header is absent — the API's default posture on a missing header is
the thing to test explicitly (fail-open vs fail-closed). For mainnet with GB blocked, it
must fail closed.

---

## Phase 7 — end-to-end testnet draw (the acceptance test)

```bash
# mint yourself mock USDG (deployer holds 10M), approve, open, watch settler settle:
cast send $PAY_TOKEN "transfer(address,uint256)" $YOUR_WALLET 1000e18 --private-key $DEPLOYER_KEY --rpc-url $TESTNET_RPC_URL
cast send $PAY_TOKEN "approve(address,uint256)" $GACHA_ADDRESS 1000e18 --private-key $YOUR_KEY --rpc-url $TESTNET_RPC_URL
cast send $GACHA_ADDRESS "openBox(uint32,bytes32)" 2 0x<your_client_seed> --private-key $YOUR_KEY --rpc-url $TESTNET_RPC_URL
journalctl -u artefract-settler -f        # settleDraw fires within seconds
curl -s localhost:3001/draws/latest       # fairness record: verify hash chain locally
```

Pass criteria: draw settles < 30s, fairness record verifies, certificate ERC-721 minted,
pool depth decremented in `/machines`, and a second identical clientSeed produces a
different result (drawId is in the hash).

---

## Phase 8 — Lovable handoff (when frontend starts)

- Lovable env: `VITE_API_URL=https://api.yourdomain.com`
- Add the Lovable preview + prod domains to `FRONTEND_ORIGINS` in `.env`, restart api.
- The endpoints the prompts doc already assumes: `GET /machines`, `GET /inventory`,
  `POST /draws` (server-relayed variant), `GET /draws/:id`, `GET /fairness/:drawId`,
  `GET /limits/me`.
- The gacha-preview.html you have is the visual contract — hand it to Lovable alongside
  LOVABLE-PROMPTS.md as the reference implementation of the reveal, slabs, and machine panel.

---

## New backend work owed by Rev 02/02.1 (build during/after Phase 5)
- feeRouter: burn the $FRACT leg on sweep (code, small)
- Relayer OR 4337 paymaster — **blocked on wallet-provider decision**; for
  testnet, test with ETH-funded wallets and defer this
- Desk endpoints: quote + settle at 80% of NAV (cert `deskAcquire` exists)
- Metadata endpoint `/meta/S1-xx.json` + per-serial slab render for tokenURI
- Redemption: `redeem(certId)` + POD webhook + status states (Rev 02.1 §12)

## Open items (tracked, not optional)

| # | Item | Gate |
|---|------|------|
| 1 | Foundry test suite (fairness math, EV bounds, refund path, role separation) | before ANY real funds |
| 2 | LiveArt ERC-20 transfer-restriction check (read contracts via their Dune page) | decides prize-pool legal structure |
| 3 | ~~Float-aware re-solve~~ DONE — Rev 02.1 §8 single-machine config | — |
| 4 | KMS for seed chain | mainnet |
| 5 | UK counsel (Gambling Act) + securities counsel (certificate itself) | mainnet, GB unblock |
| 6 | pons V2: create $FRACT with creator-fee wallet = TreasuryVault, elect USDG payout | token launch day |

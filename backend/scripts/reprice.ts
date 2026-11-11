/**
 * Move every mark to match a new box price. Run AFTER configureMachine.
 *
 *   npx tsx scripts/reprice.ts 0.4 --dry
 *   npx tsx scripts/reprice.ts 0.4
 *
 * Marks are ratios of the box price (Mortal 0.7x · Hero 2.1x · Olympian 7.0x).
 * This also refreshes NAV expiry, so it doubles as the periodic NAV keep-alive:
 * a stale NAV bars a work from draws, and marks expire 90 days after they are
 * set. Run it with the CURRENT box price before that to roll the expiry.
 *
 * Existing Sherds follow the mark (currentValueWei = shares x NAV), so a
 * reprice changes what the desk pays for certificates already in the wild.
 * Announce it before you do it.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parseAbi, parseEther, formatEther } from 'viem';
import { publicClient, walletClient, assertChain } from '../src/chain/elysium';

const VAULT = process.env.VAULT_ADDRESS as `0x${string}`;
const KEY = (process.env.CURATOR_PRIVATE_KEY ?? process.env.OPS_PRIVATE_KEY) as `0x${string}`;
const LEDGER = path.join(process.env.HOME!, 'amphora/series1/artwork_registry.csv');
const BPS: Record<string, bigint> = { MORTAL: 7_000n, HERO: 21_000n, OLYMPIAN: 70_000n };

const boxArg = process.argv[2];
if (!boxArg || boxArg.startsWith('--')) { console.error('usage: reprice.ts <boxPriceHype> [--dry]'); process.exit(1); }
const DRY = process.argv.includes('--dry');
const box = parseEther(boxArg);
const vaultAbi = parseAbi(['function updateNav(uint256 artworkId, uint128 navWei, uint40 expiresAt)']);

await assertChain();
const wc = walletClient(KEY);
const expires = Math.floor(Date.now() / 1000) + 90 * 86400;
const rows = fs.readFileSync(LEDGER, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

let n = 0;
for (const [id, artworkId, cls] of rows) {
  const bps = BPS[cls];
  if (!bps) { console.log(`!! ${id}: unknown class "${cls}" — skipped`); continue; }
  const mark = (box * bps) / 10_000n;
  if (DRY) { console.log(`[dry] ${id} (artwork ${artworkId}) ${cls} -> ${formatEther(mark)} HYPE`); n++; continue; }
  const hash = await wc.writeContract({ address: VAULT, abi: vaultAbi, functionName: 'updateNav',
    args: [BigInt(artworkId), mark, expires] });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✓ ${id} -> ${formatEther(mark)} HYPE`);
  n++;
}
console.log(`\n${DRY ? 'would reprice' : 'repriced'} ${n} works at box ${boxArg} HYPE. Now run scripts/sync.ts.`);
process.exit(0);

/**
 * Induct Season I works on-chain, in tranches.
 *   npx tsx scripts/induct.ts --dry --limit 5
 *   npx tsx scripts/induct.ts --limit 20            # register 20 works
 *   npx tsx scripts/induct.ts --class HERO        # only that class
 * Marks in induction-list.csv are decimal HYPE strings (0.35, 1.05, 3.5) and
 * are parsed with parseEther — no float ever touches a price.
 * NEVER send another transaction from the curator key while a batch runs:
 * a nonce collision kills the run.
 * For each work: createEdition → updateNav(mark) → commitToPrizePool(tier)
 * → DB vault_items row. Idempotent: skips ids already in artwork_registry.csv.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parseAbi, decodeEventLog, parseEther } from 'viem';
import { publicClient, walletClient } from '../src/chain/elysium';
import { db } from '../src/db/client';
import { vaultItems } from '../src/db/schema';

const FACTORY = process.env.FACTORY_ADDRESS as `0x${string}`;
const VAULT   = process.env.VAULT_ADDRESS as `0x${string}`;
const KEY     = (process.env.CURATOR_PRIVATE_KEY ?? process.env.OPS_PRIVATE_KEY) as `0x${string}`;
const META    = 'https://api.amphora.example/meta/';
const LIST    = path.join(process.env.HOME!, 'amphora/series1/induction-list.csv');
const LEDGER  = path.join(process.env.HOME!, 'amphora/series1/artwork_registry.csv');
const MASTERS = path.join(process.env.HOME!, 'amphora/series1/masters');

const factoryAbi = parseAbi([
  'function createEdition(string title, string ticker, uint256 editionCap, uint256 markWei, string seriesName, string metadataUri) returns (uint256 artworkId, address token)',
  'event EditionCreated(uint256 indexed artworkId, address token, string ticker, uint256 editionCap, uint256 markWei)',
]);
const vaultAbi = parseAbi([
  'function updateNav(uint256 artworkId, uint128 navWei, uint40 expiresAt)',
  'function commitToPrizePool(uint256 artworkId, uint32 machineId, uint8 tier, uint256 units)',
]);

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val  = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag('--dry');
const LIMIT = Number(val('--limit') ?? 0);
const ONLY_CLASS = val('--class');

const rows = fs.readFileSync(LIST, 'utf8').trim().split('\n').slice(1)
  .map((l) => { const c = l.split(','); return { id: c[0], title: c[1], cls: c[2], cap: c[3], markHype: c[4], tier: c[5], grade: c[6], series: c[7] }; });

const doneIds = new Set(
  fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0]) : []
);
if (!fs.existsSync(LEDGER)) fs.writeFileSync(LEDGER, 'id,artworkId,class,markHype,tier,txHash\n');

const wc = walletClient(KEY);
const expires = Math.floor(Date.now() / 1000) + 90 * 86400;
let n = 0, skipped = 0;

for (const r of rows) {
  if (doneIds.has(r.id)) { skipped++; continue; }
  if (ONLY_CLASS && r.cls !== ONLY_CLASS) continue;
  if (!fs.existsSync(path.join(MASTERS, r.id + '.png'))) { skipped++; continue; }
  if (LIMIT && n >= LIMIT) break;

  if (DRY) { console.log(`[dry] ${r.id} · ${r.cls} · cap ${r.cap} · mark ${r.markHype} HYPE · tier ${r.tier}`); n++; continue; }

  const hash = await wc.writeContract({
    address: FACTORY, abi: factoryAbi, functionName: 'createEdition',
    args: [r.title, r.id, BigInt(r.cap), parseEther(r.markHype), r.series, META + '{id}'],
  });
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  let artworkId = 0n;
  for (const log of rc.logs) {
    try {
      const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'EditionCreated') { artworkId = (ev.args as any).artworkId; break; }
    } catch {}
  }
  if (!artworkId) { console.log(`!! ${r.id}: no EditionCreated in receipt`); continue; }

  const navTx = await wc.writeContract({ address: VAULT, abi: vaultAbi, functionName: 'updateNav',
    args: [artworkId, parseEther(r.markHype), expires] });
  await publicClient.waitForTransactionReceipt({ hash: navTx });

  const poolTx = await wc.writeContract({ address: VAULT, abi: vaultAbi, functionName: 'commitToPrizePool',
    args: [artworkId, 1, Number(r.tier), BigInt(r.cap)] });
  await publicClient.waitForTransactionReceipt({ hash: poolTx });

  fs.appendFileSync(LEDGER, `${r.id},${artworkId},${r.cls},${r.markHype},${r.tier},${hash}\n`);

  try {
  await db.insert(vaultItems).values({
    tokenId: Number(artworkId), tier: r.cls as 'MORTAL' | 'HERO' | 'OLYMPIAN', appraisedHype: Number(r.markHype),
    appraisedAt: new Date(), appraisalExpiresAt: new Date(expires * 1000),
    appraisalSource: 'studio-mark', metadataUri: META + artworkId,
    inPool: true, machineId: 1,
  }).onConflictDoNothing();
  } catch (e: any) {
    console.log(`   (db row deferred for ${r.id}: ${e.message?.slice(0, 60)}) — sync.ts will backfill`);
  }
  console.log(`✓ ${r.id} → artwork ${artworkId} · ${r.cls} · ${r.markHype} HYPE`);
  n++;
}
console.log(`\ninducted ${n} · skipped ${skipped}`);
process.exit(0);

/**
 * Chain → DB reconciliation. Run after ANY on-chain configuration change:
 *   npx tsx scripts/sync.ts
 * Reads the machine config (price, odds) and per-tier inventory from the chain
 * and upserts the DB rows the API serves. The chain is truth; the DB is a cache.
 */
import 'dotenv/config';
import { parseAbi } from 'viem';
import { publicClient, toHype, assertChain } from '../src/chain/elysium';
import { db } from '../src/db/client';
import { machines, vaultItems } from '../src/db/schema';

const VAULT = process.env.VAULT_ADDRESS as `0x${string}`;
const GACHA = process.env.GACHA_ADDRESS as `0x${string}`;
const TIERS = ['', 'MORTAL', 'HERO', 'OLYMPIAN', ''] as const;

const vaultAbi = parseAbi([
  'function tierArtworks(uint32,uint8) view returns (uint256[])',
  'function valueOfShares(uint256,uint256) view returns (uint256)',
]);
const gachaAbi = parseAbi([
  // public getter of a struct skips its array members: (priceWei, active, version)
  'function machines(uint32) view returns (uint128,bool,uint32)',
  'function machineOdds(uint32) view returns (uint32[5])',
]);

await assertChain();

const [priceWei, active, version] = await publicClient.readContract({
  address: GACHA, abi: gachaAbi, functionName: 'machines', args: [1],
});
const odds = [...await publicClient.readContract({
  address: GACHA, abi: gachaAbi, functionName: 'machineOdds', args: [1],
})].map(Number);

const row = { priceHype: toHype(priceWei), oddsPpm: odds, version, active };
await db.insert(machines).values({ machineId: 1, name: 'The Amphora', ...row })
  .onConflictDoUpdate({ target: machines.machineId, set: row });
console.log(`machine 1: ${row.priceHype} HYPE active=${active} v${version} odds=${JSON.stringify(odds)}`);

const seen = new Set<number>();
for (let tier = 1; tier <= 3; tier++) {
  if (!odds[tier]) continue;   // dead tier: never import its inventory
  const ids = await publicClient.readContract({
    address: VAULT, abi: vaultAbi, functionName: 'tierArtworks', args: [1, tier],
  });
  for (const idB of ids) {
    const id = Number(idB);
    if (seen.has(id)) continue;   // first (lowest) tier wins as the item's shelf
    seen.add(id);
    const markWei = await publicClient.readContract({
      address: VAULT, abi: vaultAbi, functionName: 'valueOfShares', args: [idB, 1n],
    });
    const cls = TIERS[tier] as 'MORTAL' | 'HERO' | 'OLYMPIAN';
    await db.insert(vaultItems).values({
      tokenId: id, tier: cls, appraisedHype: toHype(markWei),
      appraisedAt: new Date(), appraisalExpiresAt: new Date(Date.now() + 90 * 864e5),
      appraisalSource: 'chain-sync', metadataUri: `https://api.amphora.example/meta/${id}`,
      inPool: true, machineId: 1,
    }).onConflictDoUpdate({ target: vaultItems.tokenId, set: {
      appraisedHype: toHype(markWei), inPool: true,
    }});
    console.log(`artwork ${id}: ${cls} @ ${toHype(markWei)} HYPE`);
  }
}
console.log('sync complete');
process.exit(0);

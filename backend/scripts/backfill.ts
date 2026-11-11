/** Backfill wonTier/wonTokenId for settled rows missing them (reads chain truth). */
import 'dotenv/config';
import { parseAbi } from 'viem';
import { publicClient } from '../src/chain/elysium';
import { db } from '../src/db/client';
import { draws } from '../src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

const GACHA = process.env.GACHA_ADDRESS as `0x${string}`;
const abi = parseAbi(['function draws(uint256) view returns (address,uint32,uint64,bytes32,uint128,uint40,bool,uint256,uint256,uint256,uint8)']);

const rows = await db.select().from(draws).where(and(eq(draws.status, 'settled'), isNull(draws.wonTier)));
for (const r of rows) {
  const d = await publicClient.readContract({ address: GACHA, abi, functionName: 'draws', args: [BigInt(r.drawId)] }) as unknown as any[];
  if (!d[6]) continue;
  await db.update(draws).set({ wonTier: Number(d[10]), wonTokenId: Number(d[8]) }).where(eq(draws.drawId, r.drawId));
  console.log(`draw ${r.drawId}: tier ${d[10]} artwork ${d[8]}`);
}
console.log('backfill done:', rows.length, 'rows examined');
process.exit(0);

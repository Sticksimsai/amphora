/** Rebuild artwork_registry.csv from chain truth (EditionCreated events).
 *  Run after any interrupted induction: npx tsx scripts/reconcile-ledger.ts */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parseAbiItem, formatEther } from 'viem';
import { publicClient, LOG_CHUNK } from '../src/chain/elysium';

const FACTORY = process.env.FACTORY_ADDRESS as `0x${string}`;
const LEDGER = path.join(process.env.HOME!, 'amphora/series1/artwork_registry.csv');
const LIST = path.join(process.env.HOME!, 'amphora/series1/induction-list.csv');

const meta = new Map<string, { cls: string; markHype: string; tier: string }>();
for (const l of fs.readFileSync(LIST, 'utf8').trim().split('\n').slice(1)) {
  const c = l.split(',');
  meta.set(c[0], { cls: c[2], markHype: c[4], tier: c[5] });
}

const ev = parseAbiItem('event EditionCreated(uint256 indexed artworkId, address token, string ticker, uint256 editionCap, uint256 markWei)');
const latest = await publicClient.getBlockNumber();
// Page from the factory's deploy block. At ~10 blocks/s a 0..latest getLogs is
// refused by every provider; set FACTORY_START_BLOCK from the deploy receipt.
const start = BigInt(process.env.FACTORY_START_BLOCK ?? 0);
const logs: any[] = [];
for (let from = start; from <= latest; from += LOG_CHUNK + 1n) {
  const to = from + LOG_CHUNK > latest ? latest : from + LOG_CHUNK;
  logs.push(...await publicClient.getLogs({ address: FACTORY, event: ev, fromBlock: from, toBlock: to }));
}

const lines = ['id,artworkId,class,markHype,tier,txHash'];
for (const log of logs) {
  const a = log.args as any;
  const id = String(a.ticker);
  const m = meta.get(id);
  lines.push(`${id},${a.artworkId},${m?.cls ?? ''},${formatEther(a.markWei)},${m?.tier ?? ''},${log.transactionHash}`);
}
fs.writeFileSync(LEDGER, lines.join('\n') + '\n');
console.log(`ledger rebuilt from chain: ${logs.length} editions`);
process.exit(0);

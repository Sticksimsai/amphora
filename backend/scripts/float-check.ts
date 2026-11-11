/**
 * Float monitor. Cron, every 5 minutes. Replaces the original's separate
 * desk-topup and gas-check jobs: on Elysium gas and payment are both native
 * HYPE, so every hot wallet is one balance and one rule.
 *
 *   npx tsx scripts/float-check.ts          top up anything below its trigger
 *   npx tsx scripts/float-check.ts --dry    report only
 *
 * Each hot wallet has a TRIGGER and a TARGET. Below the trigger it is refilled
 * to the target from the treasury hot key — but never if that would take the
 * treasury below TREASURY_FLOOR_HYPE. Everything that silently drained in
 * production (desk float, settler gas, deployer gas) is a row in this table.
 *
 * Exit code is non-zero if any wallet is below its trigger after the run, so
 * cron mail / a wrapper can page on it.
 */
import 'dotenv/config';
import { parseEther } from 'viem';
import { publicClient, walletClient, toHype, assertChain } from '../src/chain/elysium';

const DRY = process.argv.includes('--dry');
const KEY = (process.env.TREASURY_PRIVATE_KEY ?? process.env.OPS_PRIVATE_KEY) as `0x${string}`;
if (!KEY || KEY.length !== 66) {
  // The original's top-up job crashed silently on an empty key while the desk
  // drained from 476 to 2.66. An empty key is a loud, non-zero exit here.
  console.error('[float] FATAL: TREASURY_PRIVATE_KEY missing or malformed (check .env for a duplicate empty key)');
  process.exit(2);
}
const FLOOR = Number(process.env.TREASURY_FLOOR_HYPE ?? 20);

const num = (k: string, d: number) => Number(process.env[k] ?? d);
const WALLETS = [
  { name: 'desk',    addr: process.env.DESK_ADDRESS,    trigger: num('DESK_TRIGGER_HYPE', 3),      target: num('DESK_TARGET_HYPE', 10) },
  { name: 'settler', addr: process.env.SETTLER_ADDRESS, trigger: num('SETTLER_TRIGGER_HYPE', 0.05), target: num('SETTLER_TARGET_HYPE', 0.25) },
  { name: 'curator', addr: process.env.CURATOR_ADDRESS, trigger: num('CURATOR_TRIGGER_HYPE', 0.02), target: num('CURATOR_TARGET_HYPE', 0.1) },
  { name: 'redeem',  addr: process.env.REDEEM_ADDRESS,  trigger: num('REDEEM_TRIGGER_HYPE', 0.02),  target: num('REDEEM_TARGET_HYPE', 0.1) },
].filter((w) => !!w.addr) as { name: string; addr: `0x${string}`; trigger: number; target: number }[];

await assertChain();
const wc = walletClient(KEY);
let treasury = toHype(await publicClient.getBalance({ address: wc.account.address }));
let failing = 0;

for (const w of WALLETS) {
  const bal = toHype(await publicClient.getBalance({ address: w.addr }));
  if (bal >= w.trigger) { console.log(`[float] ${w.name.padEnd(8)} ${bal.toFixed(4)} HYPE  ok`); continue; }

  const need = w.target - bal;
  if (treasury - need < FLOOR) {
    console.error(`[float] ${w.name.padEnd(8)} ${bal.toFixed(4)} HYPE  LOW — treasury ${treasury.toFixed(2)} cannot give ${need.toFixed(4)} without breaching its ${FLOOR} floor`);
    failing++; continue;
  }
  if (DRY) { console.log(`[float] ${w.name.padEnd(8)} ${bal.toFixed(4)} HYPE  LOW — would send ${need.toFixed(4)}`); failing++; continue; }

  const hash = await wc.sendTransaction({ to: w.addr, value: parseEther(need.toFixed(6)) });
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') { console.error(`[float] ${w.name} top-up REVERTED ${hash}`); failing++; continue; }
  treasury -= need;
  console.log(`[float] ${w.name.padEnd(8)} ${bal.toFixed(4)} -> ${w.target} HYPE  (${hash})`);
}

console.log(`[float] treasury ${treasury.toFixed(4)} HYPE (floor ${FLOOR})`);
if (treasury < FLOOR) { console.error('[float] TREASURY BELOW FLOOR'); failing++; }
process.exit(failing ? 1 : 0);

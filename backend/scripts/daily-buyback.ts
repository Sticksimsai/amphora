/**
 * End-of-day buyback. Everything is in HYPE.
 *
 * Computes the amphora's net for the day and converts the allocated share
 * into $AMPH on the open market. Runs once daily from cron.
 *
 *   npx tsx scripts/daily-buyback.ts --dry     compute and report only
 *   npx tsx scripts/daily-buyback.ts           compute and execute
 *   npx tsx scripts/daily-buyback.ts --burn    ...and send what was bought to 0x…dEaD
 *
 * THE FORMULA — published, fixed, and applied whatever the number says:
 *
 *   gross        = sum of pricePaid for boxes settled that day   (HYPE)
 *   buybacks     = HYPE the desk paid out that day
 *   net          = gross - buybacks
 *   operating    = net x OPERATING_SHARE      (studio, treasury, physical)
 *   allocation   = (net - operating) x BUYBACK_SHARE
 *
 * The allocation is skipped entirely if it would take treasury below
 * TREASURY_FLOOR_HYPE — the desk's obligations come first, always. No profit,
 * no burn; the days there is nothing to burn are recorded and published too.
 *
 * NOTE FOR WHOEVER SHIPS THIS: a scheduled, revenue-funded buyback sits close
 * to the line between a product and a security. It is OFF unless
 * BUYBACK_ENABLED=true. Get advice before you set that.
 */
import 'dotenv/config';
import { parseAbi, parseEther } from 'viem';
import { publicClient, walletClient, LAUNCHPAD, uniV3PoolAbi, priceFromSqrtX96, toHype, assertChain } from '../src/chain/elysium';
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

const TOKEN = LAUNCHPAD.token;
const POOL = LAUNCHPAD.pool;
const WHYPE = LAUNCHPAD.whype;
const ROUTER = LAUNCHPAD.swapRouter;
const TREASURY_KEY = (process.env.TREASURY_PRIVATE_KEY ?? process.env.OPS_PRIVATE_KEY) as `0x${string}`;
const BOX_PRICE = Number(process.env.BOX_PRICE_HYPE ?? 0.5);

const ENABLED = process.env.BUYBACK_ENABLED === 'true';
const OPERATING_SHARE = Number(process.env.OPERATING_SHARE ?? 0.5);
const BUYBACK_SHARE = Number(process.env.BUYBACK_SHARE ?? 1.0);
const TREASURY_FLOOR = Number(process.env.TREASURY_FLOOR_HYPE ?? 20);
const MAX_BUY = Number(process.env.MAX_DAILY_BUY_HYPE ?? 25);
const SLIPPAGE_BPS = BigInt(process.env.BUYBACK_SLIPPAGE_BPS ?? 300);

const DRY = process.argv.includes('--dry');
const BURN = process.argv.includes('--burn');
const DEAD = '0x000000000000000000000000000000000000dEaD' as const;

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);
// Uniswap V3 SwapRouter02-style. With tokenIn = wrapped HYPE and msg.value set,
// the router wraps native HYPE itself: no approve, no separate wrap tx.
// CHECK THE ROUTER YOU POINT AT: the original SwapRouter takes `deadline`
// inside the struct; SwapRouter02 does not. This ABI is the 02 form.
const routerAbi = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

if (!TREASURY_KEY || TREASURY_KEY.length !== 66) {
  console.error('[buyback] FATAL: TREASURY_PRIVATE_KEY missing'); process.exit(1);
}
await assertChain();

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS token_buybacks (
    day date PRIMARY KEY,
    boxes integer NOT NULL,
    gross_hype numeric NOT NULL,
    desk_paid_hype numeric NOT NULL,
    net_hype numeric NOT NULL,
    operating_hype numeric NOT NULL,
    allocated_hype numeric NOT NULL,
    executed_hype numeric,
    tokens_bought numeric,
    burned boolean NOT NULL DEFAULT false,
    tx_hash text,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

const first = (r: any) => r?.rows?.[0] ?? r?.[0] ?? {};

const boxes = Number(first(await db.execute(sql`
  SELECT count(*) AS boxes FROM draws
  WHERE status = 'settled'
    AND opened_at >= date_trunc('day', now() - interval '1 day')
    AND opened_at <  date_trunc('day', now())`)).boxes ?? 0);

const deskPaid = Number(first(await db.execute(sql`
  SELECT coalesce(sum(bid_hype), 0) AS paid FROM desk_trades
  WHERE created_at >= date_trunc('day', now() - interval '1 day')
    AND created_at <  date_trunc('day', now())`)).paid ?? 0);

const gross = boxes * BOX_PRICE;
const net = gross - deskPaid;
const operating = Math.max(0, net * OPERATING_SHARE);
let allocation = Math.min(Math.max(0, (net - operating) * BUYBACK_SHARE), MAX_BUY);

const wc = walletClient(TREASURY_KEY);
const treasury = toHype(await publicClient.getBalance({ address: wc.account.address }));
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

console.log(`[buyback] ${yesterday}`);
console.log(`  boxes ${boxes} · gross ${gross.toFixed(4)} · desk paid ${deskPaid.toFixed(4)}  (HYPE)`);
console.log(`  net ${net.toFixed(4)} · operating ${operating.toFixed(4)} · allocation ${allocation.toFixed(4)}`);
console.log(`  treasury ${treasury.toFixed(4)} (floor ${TREASURY_FLOOR})`);

let note: string | null = null;
if (allocation <= 0) note = 'no allocation — the day was flat or negative';
else if (treasury - allocation < TREASURY_FLOOR) {
  note = `skipped — buying would take treasury below its ${TREASURY_FLOOR} HYPE floor`;
  allocation = 0;
} else if (!ENABLED) note = 'BUYBACK_ENABLED is not true — computed only';
else if (!ROUTER || !TOKEN || !POOL || !WHYPE) note = 'SWAP_ROUTER / TOKEN_ADDRESS / POOL_ADDRESS / WHYPE_ADDRESS not configured — computed only';
if (note) console.log(`  ${note}`);

async function record(executed: number | null, tokens: string | null, burned: boolean, tx: string | null) {
  await db.execute(sql`
    INSERT INTO token_buybacks (day, boxes, gross_hype, desk_paid_hype, net_hype,
                                operating_hype, allocated_hype, executed_hype, tokens_bought, burned, tx_hash, note)
    VALUES (${yesterday}, ${boxes}, ${gross}, ${deskPaid}, ${net},
            ${operating}, ${allocation}, ${executed}, ${tokens}, ${burned}, ${tx}, ${note})
    ON CONFLICT (day) DO UPDATE SET
      boxes = EXCLUDED.boxes, gross_hype = EXCLUDED.gross_hype,
      desk_paid_hype = EXCLUDED.desk_paid_hype, net_hype = EXCLUDED.net_hype,
      operating_hype = EXCLUDED.operating_hype, allocated_hype = EXCLUDED.allocated_hype,
      executed_hype = EXCLUDED.executed_hype, tokens_bought = EXCLUDED.tokens_bought,
      burned = EXCLUDED.burned, tx_hash = EXCLUDED.tx_hash, note = EXCLUDED.note`);
}

if (DRY || note) {
  await record(null, null, false, null);
  console.log(DRY ? '  dry run — nothing executed' : '  recorded, nothing executed');
  process.exit(0);
}

const amountIn = parseEther(allocation.toFixed(6));

// Minimum out from the pool's own spot price, less slippage. The original sent
// amountOutMinimum = 0 and never used its slippage setting; a zero floor on a
// thin launch pool is an open invitation, mempool or no mempool.
const [slot0, token0] = await Promise.all([
  publicClient.readContract({ address: POOL!, abi: uniV3PoolAbi, functionName: 'slot0' }),
  publicClient.readContract({ address: POOL!, abi: uniV3PoolAbi, functionName: 'token0' }),
]);
const isToken0 = token0.toLowerCase() === TOKEN!.toLowerCase();
const priceHype = priceFromSqrtX96(slot0[0], isToken0);          // HYPE per token
const expectedOut = BigInt(Math.floor((allocation / priceHype) * 1e6)) * 10n ** 12n;
const feeAdj = 1_000_000n - BigInt(LAUNCHPAD.poolFee);
const minOut = (expectedOut * feeAdj / 1_000_000n) * (10_000n - SLIPPAGE_BPS) / 10_000n;

const before = await publicClient.readContract({ address: TOKEN!, abi: erc20, functionName: 'balanceOf', args: [wc.account.address] });
const hash = await wc.writeContract({
  address: ROUTER!, abi: routerAbi, functionName: 'exactInputSingle', value: amountIn,
  args: [{
    tokenIn: WHYPE!, tokenOut: TOKEN!, fee: LAUNCHPAD.poolFee,
    recipient: wc.account.address, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n,
  }],
});
const rc = await publicClient.waitForTransactionReceipt({ hash });
if (rc.status !== 'success') { console.error(`  swap reverted ${hash}`); note = 'swap reverted'; await record(null, null, false, hash); process.exit(1); }

const after = await publicClient.readContract({ address: TOKEN!, abi: erc20, functionName: 'balanceOf', args: [wc.account.address] });
const bought = after - before;
console.log(`  bought ${toHype(bought).toFixed(2)} $AMPH for ${allocation.toFixed(4)} HYPE · ${hash}`);

let burned = false;
if (BURN && bought > 0n) {
  const b = await wc.writeContract({ address: TOKEN!, abi: erc20, functionName: 'transfer', args: [DEAD, bought] });
  await publicClient.waitForTransactionReceipt({ hash: b });
  burned = true;
  console.log(`  burned · ${b}`);
}
await record(allocation, bought.toString(), burned, hash);
process.exit(0);

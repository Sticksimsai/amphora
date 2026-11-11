import { db } from '../db/client';
import { swaps, tokenState, indexerCursor } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  publicClient, LAUNCHPAD, LOG_CHUNK, swapEvent, uniV3PoolAbi,
  priceFromSqrtX96, swapSide, hypeUsd,
} from '../chain/elysium';

/**
 * Indexes the $AMPH pool — a locked Uniswap V3 pool quoted in HYPE.
 *
 * WHY THIS EXISTS: a launchpad UI shows creator fees but gives no programmatic
 * accrual history. To say "trading this token has bought X HYPE of art" you
 * need your own ledger of volume -> fee -> Reserve, reconstructible by anyone
 * from chain data. That claim is the whole point of the token.
 *
 * Launchpad-agnostic on purpose. It needs three facts — the pool, which side
 * the token is on, and the creator's share of the fee — and reads the first two
 * from the pool itself. The third comes from CREATOR_SHARE_BPS because every
 * Elysium launchpad splits differently and none of them exposes it the same way.
 * Reconcile the ledger against what you actually claim (see scripts/sweep.ts);
 * if they disagree, the env var is wrong, not the chain.
 */

export interface IndexerConfig {
  token: `0x${string}`;
  pool: `0x${string}`;
  startBlock: bigint;
  isToken0: boolean;
  poolFee: number;         // hundredths of a bip, from pool.fee()
  creatorShareBps: number; // e.g. 7000 for 70%
}

export async function loadTokenConfig(): Promise<IndexerConfig> {
  const { token, pool } = LAUNCHPAD;
  if (!token || !pool) throw new Error('TOKEN_ADDRESS and POOL_ADDRESS must be set to index the token');

  const [token0, token1, fee] = await Promise.all([
    publicClient.readContract({ address: pool, abi: uniV3PoolAbi, functionName: 'token0' }),
    publicClient.readContract({ address: pool, abi: uniV3PoolAbi, functionName: 'token1' }),
    publicClient.readContract({ address: pool, abi: uniV3PoolAbi, functionName: 'fee' }),
  ]);
  const isToken0 = token0.toLowerCase() === token.toLowerCase();
  if (!isToken0 && token1.toLowerCase() !== token.toLowerCase()) {
    throw new Error(`POOL_ADDRESS ${pool} does not contain TOKEN_ADDRESS ${token}`);
  }
  const quote = isToken0 ? token1 : token0;
  if (LAUNCHPAD.whype && quote.toLowerCase() !== LAUNCHPAD.whype.toLowerCase()) {
    throw new Error(`pool is quoted in ${quote}, not WHYPE_ADDRESS ${LAUNCHPAD.whype}`);
  }
  return {
    token, pool, isToken0,
    startBlock: LAUNCHPAD.startBlock,
    poolFee: Number(fee),
    creatorShareBps: LAUNCHPAD.creatorShareBps,
  };
}

export async function backfill(cfg: IndexerConfig) {
  const px = (await hypeUsd()) ?? 0;
  const cursorRow = await db.query.indexerCursor.findFirst({ where: eq(indexerCursor.pool, cfg.pool) });
  let from = cursorRow ? BigInt(cursorRow.lastBlock) + 1n : cfg.startBlock;
  const head = await publicClient.getBlockNumber();

  while (from <= head) {
    const to = from + LOG_CHUNK > head ? head : from + LOG_CHUNK;
    const logs = await publicClient.getLogs({ address: cfg.pool, event: swapEvent, fromBlock: from, toBlock: to });

    if (logs.length) {
      const rows = logs.map((log) => {
        const { amount0, amount1, sqrtPriceX96 } = log.args as {
          amount0: bigint; amount1: bigint; sqrtPriceX96: bigint;
        };
        const quoteDelta = cfg.isToken0 ? amount1 : amount0;
        const volumeWei = quoteDelta < 0n ? -quoteDelta : quoteDelta;
        const poolFeeWei = (volumeWei * BigInt(cfg.poolFee)) / 1_000_000n;
        const creatorFeeWei = (poolFeeWei * BigInt(cfg.creatorShareBps)) / 10_000n;
        return {
          txHash: log.transactionHash!,
          logIndex: log.logIndex!,
          blockNumber: Number(log.blockNumber),
          pool: cfg.pool,
          token: cfg.token,
          side: swapSide(cfg.isToken0, amount0, amount1),
          volumeWei: volumeWei.toString(),
          poolFeeWei: poolFeeWei.toString(),
          creatorFeeWei: creatorFeeWei.toString(),
          priceHype: priceFromSqrtX96(sqrtPriceX96, cfg.isToken0),
          hypeUsd: px,
        };
      });
      await db.insert(swaps).values(rows).onConflictDoNothing();
    }

    await db.insert(indexerCursor)
      .values({ pool: cfg.pool, lastBlock: Number(to) })
      .onConflictDoUpdate({ target: indexerCursor.pool, set: { lastBlock: Number(to) } });
    from = to + 1n;
  }
}

/** Cumulative creator fee accrued, in wei of HYPE. The "art budget" number. */
export async function totalCreatorFeeWei(pool: `0x${string}`): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${swaps.creatorFeeWei}::numeric), 0)::text` })
    .from(swaps)
    .where(eq(swaps.pool, pool));
  return BigInt(row?.total ?? '0');
}

/** Refresh live pool state: price in HYPE and USD, market cap. */
export async function refreshTokenState(cfg: IndexerConfig) {
  const slot0 = await publicClient.readContract({ address: cfg.pool, abi: uniV3PoolAbi, functionName: 'slot0' });
  const priceHype = priceFromSqrtX96(slot0[0], cfg.isToken0);
  const px = (await hypeUsd()) ?? 0;
  const priceUsd = priceHype * px;
  const supply = Number(LAUNCHPAD.supply);
  const row = { priceHype, priceUsd, marketCapUsd: priceUsd * supply, updatedAt: new Date() };

  await db.insert(tokenState).values({ token: cfg.token, ...row })
    .onConflictDoUpdate({ target: tokenState.token, set: row });
}

import { Worker, Queue } from 'bullmq';
import { parseAbi, parseAbiItem, parseEventLogs } from 'viem';
import { publicClient, walletClient, assertChain, activeChain, LOG_CHUNK, toHype } from '../chain/elysium';
import { peekSeed, peekSeedAt, confirmSeed, verifyReveal } from '../services/fairness';
import { db } from '../db/client';
import { draws, seedChains } from '../db/schema';
import { eq } from 'drizzle-orm';
import { gachaAbi } from '../chain/gacha';

/**
 * Settler worker.
 *
 * The gacha is two transactions by necessity: the user commits, then the operator
 * reveals. A single-transaction draw would require the seed to be known at open
 * time, which destroys the fairness guarantee.
 *
 * At ~100ms blocks the round trip is sub-second, so the frontend can cover it with
 * a pack-opening animation and the user never perceives two steps.
 *
 * FAILURE MODE THAT MATTERS: if this worker dies, users have paid and received
 * nothing. GachaMachine.refundUnsettled lets them self-serve a refund after 10
 * minutes, but you should page on settle latency > 5s, not wait for the deadline.
 */

const connection = { host: process.env.REDIS_HOST!, port: Number(process.env.REDIS_PORT ?? 6379) };
export const settleQueue = new Queue('settle', { connection });

const GACHA = process.env.GACHA_ADDRESS as `0x${string}`;
/** The contract's own record of a draw — the source of truth for outcomes. */
const drawsAbi = parseAbi([
  'function draws(uint256) view returns (address user, uint32 machineId, uint64 seedIndex, bytes32 clientSeed, uint128 pricePaid, uint40 openedAt, bool settled, uint256 certificateId, uint256 artworkId, uint256 shares, uint8 tier)',
]);
async function chainDraw(drawId: bigint) {
  const d = await publicClient.readContract({ address: GACHA, abi: drawsAbi, functionName: 'draws', args: [drawId] });
  return { settled: d[6], certificateId: d[7], artworkId: d[8], tier: d[10] };
}

const boxOpened = parseAbiItem(
  'event BoxOpened(uint256 indexed drawId, address indexed user, uint32 indexed machineId, bytes32 clientSeed, uint64 seedIndex)',
);

/** Watch for openings and enqueue settlements. */
export function watchOpenings() {
  return publicClient.watchEvent({
    address: GACHA,
    event: boxOpened,
    poll: true,
    pollingInterval: 1500,
    onLogs: async (logs) => {
      for (const log of logs) {
        const { drawId, user, machineId, clientSeed, seedIndex } = log.args as {
          drawId: bigint; user: `0x${string}`; machineId: number;
          clientSeed: `0x${string}`; seedIndex: bigint;
        };

        await db.insert(draws).values({
          drawId: Number(drawId),
          user,
          machineId: Number(machineId),
          clientSeed,
          seedIndex: Number(seedIndex),
          openedAt: new Date(),
          status: 'pending',
        }).onConflictDoNothing();

        await settleQueue.add(
          'settle',
          { drawId: drawId.toString() },
          {
            jobId: `settle-${drawId}`,     // idempotent: never settle the same draw twice
            attempts: 8,
            backoff: { type: 'exponential', delay: 300 },
            removeOnComplete: 1000,
          },
        );
      }
    },
    onError: (err) => console.error('[settler] watch error', err),
  });
}

/**
 * Cursor self-healing.
 *
 * The cursor can fall behind the chain if a settle transaction confirms but the
 * process dies before confirmSeed runs — which is exactly what happens when the
 * watchdog restarts the settler mid-settle. Previously that halted everything
 * until a human reconciled it, turning a one-draw hiccup into an outage.
 *
 * Rather than halting, we search a window around the current cursor for the index
 * whose seed hashes to the live on-chain commitment, and move the cursor there.
 * This can only ever move the cursor to a position the chain already proves, so
 * it cannot fabricate a fairness record — if no index in the window matches, we
 * still halt, because that means something genuinely wrong.
 */
async function realignCursor(chainId: string, committed: `0x${string}`): Promise<number | null> {
  const [chain] = await db.select().from(seedChains).where(eq(seedChains.chainId, chainId));
  if (!chain) return null;
  const start = chain.cursor;
  for (let i = Math.max(0, start - 50); i <= start + 50; i++) {
    const s = await peekSeedAt(chainId, i);
    if (s && verifyReveal(s, committed)) {
      await db.update(seedChains).set({ cursor: i + 1 }).where(eq(seedChains.chainId, chainId));
      console.log(`[settler] cursor realigned: ${start} -> ${i + 1} (chain commit matches seed ${i})`);
      return i + 1;
    }
  }
  return null;
}

export const settleWorker = new Worker(
  'settle',
  async (job) => {
    const drawId = BigInt(job.data.drawId);

    const [row] = await db.select().from(draws).where(eq(draws.drawId, Number(drawId)));
    if (!row) throw new Error(`draw ${drawId} not indexed yet`);
    if (row.status === 'settled') return { skipped: true };

    // Layer 2 — already-settled detection. If the chain says this draw is
    // done (settled by an earlier attempt, or refunded by the player), record
    // that and stop. Without this an AlreadySettled revert retries forever and
    // buries real failures in the log.
    const onChain = await chainDraw(drawId);
    if (onChain.settled) {
      const refunded = onChain.certificateId === 0n;
      await db.update(draws).set({
        status: refunded ? 'refunded' : 'settled',
        wonTier: refunded ? null : Number(onChain.tier),
        wonTokenId: refunded ? null : Number(onChain.artworkId),
        settledAt: new Date(),
      }).where(eq(draws.drawId, Number(drawId)));
      console.log(`[settler] draw ${drawId} already ${refunded ? 'refunded' : 'settled'} on-chain — recorded`);
      return { skipped: true, onChain: true };
    }

    const chainId = process.env.ACTIVE_SEED_CHAIN_ID!;
    const { index, seed } = await peekSeed(chainId);

    // Sanity check against the contract's live commitment before we spend gas.
    const committed = await publicClient.readContract({
      address: GACHA,
      abi: gachaAbi,
      functionName: 'committedHash',
    });
    let useIndex = index;
    let useSeed = seed;
    if (!verifyReveal(seed, committed)) {
      console.warn(`[settler] cursor desync at index ${index}; attempting realignment`);
      const fixed = await realignCursor(chainId, committed);
      if (fixed === null) {
        throw new Error(
          `[settler] SEED DESYNC: no seed within 50 of cursor ${index} hashes to on-chain commit ${committed}. ` +
            'Halting — this needs a human.',
        );
      }
      const next = await peekSeed(chainId);
      useIndex = next.index;
      useSeed = next.seed;
      if (!verifyReveal(useSeed, committed)) {
        throw new Error('[settler] realignment failed verification. Halting.');
      }
    }

    const wc = walletClient(process.env.SETTLER_PRIVATE_KEY as `0x${string}`);
    const hash = await wc.writeContract({
      address: GACHA,
      abi: gachaAbi,
      functionName: 'settleDraw',
      args: [drawId, useSeed],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== 'success') throw new Error(`settle tx reverted: ${hash}`);

    // Settle confirmed on-chain: NOW burn the seed cursor.
    await confirmSeed(chainId, useIndex);

    const settledLogs = parseEventLogs({ abi: gachaAbi, logs: receipt.logs, eventName: 'DrawSettled' });
    let outcome = settledLogs[0]?.args as any;
    // Layer 3 — outcome fallback. If the event parse misses, read tier and
    // artwork straight from draws(). A settled draw with a null outcome is a
    // blank card in someone's collection.
    if (!outcome) {
      const d = await chainDraw(drawId);
      if (d.settled) outcome = { tier: d.tier, artworkId: d.artworkId };
      console.warn(`[settler] draw ${drawId}: DrawSettled not parsed; outcome read from draws()`);
    }

    await db.update(draws)
      .set({
        status: 'settled',
        wonTier: outcome ? Number(outcome.tier) : null,
        wonTokenId: outcome ? Number(outcome.artworkId) : null,
        serverSeed: useSeed,
        priorCommit: committed,
        settleTx: hash,
        settledAt: new Date(),
      })
      .where(eq(draws.drawId, Number(drawId)));

    return { drawId: drawId.toString(), hash };
  },
  { connection, concurrency: 1 }, // MUST be 1: seeds are consumed in strict order
);

settleWorker.on('failed', (job, err) => {
  console.error(`[settler] draw ${job?.data?.drawId} failed:`, err.message);
});

/** Boot catch-up: scan recent history for opens the watcher missed while
 *  down, insert any unknown draws, and (re)enqueue every unsettled one whose
 *  job may have died with a previous process. Makes orphaned pending draws
 *  structurally impossible. */
async function catchup() {
  // Elysium makes ~10 blocks a second, so block counts that were generous on a
  // slower chain are minutes here. Look back 30 minutes (3x the refund window)
  // and page through it in provider-sized chunks: one wide getLogs is exactly
  // what broke catch-up on the original deployment.
  const latest = await publicClient.getBlockNumber();
  const span = BigInt(process.env.CATCHUP_BLOCKS ?? 18_000);
  const logs: any[] = [];
  for (let from = latest > span ? latest - span : 0n; from <= latest; from += LOG_CHUNK + 1n) {
    const to = from + LOG_CHUNK > latest ? latest : from + LOG_CHUNK;
    logs.push(...await publicClient.getLogs({ address: GACHA, event: boxOpened, fromBlock: from, toBlock: to }));
  }
  for (const log of logs) {
    const a = log.args as any;
    const drawId = Number(a.drawId);
    const [row] = await db.select().from(draws).where(eq(draws.drawId, drawId));
    if (!row) {
      await db.insert(draws).values({
        drawId, user: a.user, machineId: Number(a.machineId),
        clientSeed: a.clientSeed, seedIndex: Number(a.seedIndex),
        status: 'pending', openedAt: new Date(),
      }).onConflictDoNothing();
    }
    if (!row || row.status === 'pending') {
      await settleQueue.add('settle', { drawId }, { jobId: `settle-${drawId}-r${Date.now()}` });
      console.log(`[settler] catchup: enqueued draw ${drawId}`);
    }
  }
  console.log(`[settler] catchup complete (${logs.length} opens scanned)`);
}

// ─── entrypoint ───
await assertChain();
console.log('[settler] starting: watching', GACHA, 'on', activeChain.name, activeChain.id);
watchOpenings();

// Payment and gas are the same asset now. Say the balance out loud at boot and
// on every heartbeat: the original settler died for want of a fraction of a cent.
const SETTLER_ADDR = walletClient(process.env.SETTLER_PRIVATE_KEY as `0x${string}`).account.address;
const GAS_WARN_HYPE = Number(process.env.SETTLER_GAS_WARN_HYPE ?? 0.05);
async function gasLine() {
  const b = toHype(await publicClient.getBalance({ address: SETTLER_ADDR }));
  if (b < GAS_WARN_HYPE) console.error(`[settler] LOW GAS: ${b.toFixed(5)} HYPE at ${SETTLER_ADDR}`);
  return b;
}
console.log(`[settler] signer ${SETTLER_ADDR} · ${(await gasLine()).toFixed(5)} HYPE`);

// Heartbeat: silence in the journal now means the process is dead, not idle.
setInterval(async () => {
  try {
    const pending = await db.select().from(draws).where(eq(draws.status, 'pending'));
    const waiting = await settleQueue.getWaitingCount();
    console.log(`[settler] alive · ${pending.length} pending · ${waiting} queued · gas ${(await gasLine()).toFixed(5)} HYPE`);
    if (pending.length > 0 && waiting === 0) {
      console.warn('[settler] pending draws with an empty queue — re-enqueueing');
      for (const p of pending) {
        await settleQueue.add('settle', { drawId: p.drawId }, { jobId: `hb-${p.drawId}-${Date.now()}` });
      }
    }
  } catch (e: any) {
    console.error('[settler] heartbeat failed:', e.message);
  }
}, 60_000);
catchup().catch((e) => console.error('[settler] catchup failed', e));

/**
 * Token indexer entrypoint. Optional: the machine runs without it.
 * Does nothing (and says so) until TOKEN_ADDRESS and POOL_ADDRESS are set, so
 * the unit can be enabled before the token exists.
 */
import { assertChain, LAUNCHPAD } from '../chain/elysium';
import { loadTokenConfig, backfill, refreshTokenState } from '../indexer/launchpadIndexer';

await assertChain();
if (!LAUNCHPAD.token || !LAUNCHPAD.pool) {
  console.log('[indexer] TOKEN_ADDRESS / POOL_ADDRESS not set — token layer is parked. Idling.');
  setInterval(() => console.log('[indexer] alive · parked'), 300_000);
} else {
  const cfg = await loadTokenConfig();
  console.log(`[indexer] ${LAUNCHPAD.name} pool ${cfg.pool} · fee ${cfg.poolFee / 10_000}% · creator ${cfg.creatorShareBps / 100}%`);
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await backfill(cfg); await refreshTokenState(cfg); console.log('[indexer] alive · caught up'); }
    catch (e: any) { console.error('[indexer] pass failed:', e.message); }
    finally { busy = false; }
  };
  await run();
  setInterval(run, 15_000);
}

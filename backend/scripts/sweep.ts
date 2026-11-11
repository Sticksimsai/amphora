/**
 * MANUAL creator-fee sweep — run by the founder, never as a service.
 *   npx tsx scripts/sweep.ts            report: what the ledger says has accrued
 *
 * $AMPH lives in a locked Uniswap V3 pool quoted in HYPE. The launchpad's
 * locker holds the LP position and lets the creator claim their share of the
 * fees. Every Elysium launchpad exposes that claim differently (and the chain
 * is days old), so the claim itself is deliberately NOT automated here: claim
 * in the launchpad's own UI, then forward by hand.
 *
 * Policy, published and executed as plain visible transactions:
 *   1. Claim accrued creator fees from the launchpad (HYPE leg + $AMPH leg).
 *   2. $AMPH leg -> 0x…dEaD.
 *   3. HYPE leg  -> RESERVE_ADDRESS (the Acquisition Reserve), 100%.
 * Operations are funded from box revenue, not from the token.
 *
 * What this script does is the part that makes the claim checkable: it prints
 * what the swap ledger says the creator share SHOULD be, next to what the
 * Reserve has actually received, so a mismatch is visible the day it appears.
 * If they disagree by more than rounding, CREATOR_SHARE_BPS is wrong for your
 * launchpad — fix the setting, not the story.
 */
import 'dotenv/config';
import { LAUNCHPAD, hypeBalance, toHype, assertChain } from '../src/chain/elysium';
import { totalCreatorFeeWei } from '../src/indexer/launchpadIndexer';

await assertChain();
if (!LAUNCHPAD.pool) { console.error('POOL_ADDRESS not set'); process.exit(1); }

const accrued = toHype(await totalCreatorFeeWei(LAUNCHPAD.pool));
const reserve = await hypeBalance(process.env.RESERVE_ADDRESS);
console.log(`launchpad            ${LAUNCHPAD.name}`);
console.log(`creator share        ${LAUNCHPAD.creatorShareBps / 100}% of a ${LAUNCHPAD.poolFee / 10_000}% pool fee`);
console.log(`ledger: HYPE accrued ${accrued.toFixed(4)}   (HYPE-side fees only; the $AMPH leg is burned)`);
console.log(`reserve balance      ${reserve == null ? 'unreachable' : reserve.toFixed(4)} HYPE`);
console.log('\nClaim in the launchpad UI, burn the $AMPH leg, send the HYPE leg to the Reserve.');
process.exit(0);

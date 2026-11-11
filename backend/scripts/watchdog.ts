/**
 * Settle watchdog. Runs from cron every 2 minutes.
 *
 * A draw that stays pending is money the customer paid with nothing to show for
 * it, and after SETTLE_DEADLINE (10 min) they can take it back — so the window
 * to fix a stall is short. This re-enqueues anything stuck, and if draws remain
 * stuck across consecutive runs it restarts the settler, which is what actually
 * cleared the outage by hand.
 *
 *   npx tsx scripts/watchdog.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { Queue } from 'bullmq';
import { db } from '../src/db/client';
import { draws } from '../src/db/schema';
import { eq, and, lt } from 'drizzle-orm';

const STALE_SECONDS = 180;        // re-enqueue after 3 minutes pending
const RESTART_AFTER = 2;          // consecutive runs with stalls before restarting
const STATE = '/tmp/amphora-watchdog.json';

const q = new Queue('settle', {
  connection: { host: process.env.REDIS_HOST!, port: Number(process.env.REDIS_PORT!) },
});

const cutoff = new Date(Date.now() - STALE_SECONDS * 1000);
const stuck = await db.select().from(draws)
  .where(and(eq(draws.status, 'pending'), lt(draws.openedAt, cutoff)));

let state = { consecutive: 0 };
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}

if (stuck.length === 0) {
  if (state.consecutive > 0) console.log('[watchdog] clear');
  fs.writeFileSync(STATE, JSON.stringify({ consecutive: 0 }));
  process.exit(0);
}

console.log(`[watchdog] ${stuck.length} stuck draw(s): ${stuck.map((d) => d.drawId).join(', ')}`);
for (const d of stuck) {
  await q.add('settle', { drawId: d.drawId }, { jobId: `wd-${d.drawId}-${Date.now()}` });
}

state.consecutive += 1;
fs.writeFileSync(STATE, JSON.stringify(state));

if (state.consecutive >= RESTART_AFTER) {
  console.log('[watchdog] draws still stuck after re-enqueue — restarting settler');
  try {
    execSync('sudo systemctl restart amphora-settler');
    fs.writeFileSync(STATE, JSON.stringify({ consecutive: 0 }));
  } catch (e: any) {
    console.error('[watchdog] restart failed:', e.message);
  }
}

// Anything past the refund deadline is a customer-visible failure.
const critical = stuck.filter((d) => Date.now() - new Date(d.openedAt).getTime() > 9 * 60 * 1000);
if (critical.length) {
  console.error(`[watchdog] CRITICAL: ${critical.length} draw(s) near or past the refund deadline: ${critical.map((d) => d.drawId).join(', ')}`);
}
process.exit(0);

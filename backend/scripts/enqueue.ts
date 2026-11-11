/** Manually enqueue settle jobs: npx tsx scripts/enqueue.ts 16 17 */
import 'dotenv/config';
import { Queue } from 'bullmq';
const q = new Queue('settle', { connection: { host: process.env.REDIS_HOST!, port: Number(process.env.REDIS_PORT!) } });
for (const id of process.argv.slice(2)) {
  await q.add('settle', { drawId: Number(id) }, { jobId: `settle-${id}-m${Date.now()}` });
  console.log('enqueued draw', id);
}
process.exit(0);

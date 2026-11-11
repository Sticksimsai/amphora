import type { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { sql, eq } from 'drizzle-orm';
import { parseAbi } from 'viem';
import { publicClient, hypeBalance } from '../chain/elysium';
import { machines } from '../db/schema';

const CERT = process.env.CERT_ADDRESS as `0x${string}`;
const TREASURY = process.env.TREASURY_ADDRESS as `0x${string}`;
const DESK = process.env.DESK_ADDRESS as `0x${string}`;
const RESERVE = process.env.RESERVE_ADDRESS as `0x${string}`;
const certAbi = parseAbi(['function totalSupply() view returns (uint256)']);
const bal = hypeBalance;

/** Box price and EV in HYPE, from the DB row sync.ts mirrors off the chain. */
async function machineOne() {
  const [m] = await db.select().from(machines).where(eq(machines.machineId, 1));
  const price = m?.priceHype ?? Number(process.env.BOX_PRICE_HYPE ?? 0.5);
  return { price, ev: price * 0.74 };
}

export async function statsRoutes(app: FastifyInstance) {
  /** Public: the numbers we're happy for anyone to check. */
  app.get('/public/stats', async () => {
    const [totals]: any = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'settled')                AS pulls,
        count(*) FILTER (WHERE status = 'pending')                AS pending,
        count(DISTINCT lower("user"))                             AS collectors,
        count(*) FILTER (WHERE status='settled' AND won_tier = 1) AS commons,
        count(*) FILTER (WHERE status='settled' AND won_tier = 2) AS rarities,
        count(*) FILTER (WHERE status='settled' AND won_tier = 3) AS crowns
      FROM draws`);
    const t = totals?.[0] ?? totals ?? {};

    const daily: any = await db.execute(sql`
      SELECT date_trunc('day', opened_at)::date AS day,
             count(*) AS pulls,
             count(*) FILTER (WHERE won_tier >= 2) AS rare
      FROM draws WHERE status='settled' AND opened_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`);

    const claims: any = await db.execute(sql`
      SELECT count(*) AS claimed FROM redemption_orders`);

    let certs = null;
    try {
      certs = Number(await publicClient.readContract({
        address: CERT, abi: certAbi, functionName: 'totalSupply' }) as bigint);
    } catch {}

    const pulls = Number(t.pulls ?? 0);
    return {
      pulls,
      pending: Number(t.pending ?? 0),
      collectors: Number(t.collectors ?? 0),
      certificates: certs,
      byClass: {
        MORTAL: Number(t.commons ?? 0),
        HERO: Number(t.rarities ?? 0),
        OLYMPIAN: Number(t.crowns ?? 0),
      },
      // Observed frequencies against the published ladder — the fairness claim,
      // measured rather than asserted.
      observedOdds: pulls > 0 ? {
        MORTAL: +(Number(t.commons ?? 0) / pulls * 100).toFixed(2),
        HERO: +(Number(t.rarities ?? 0) / pulls * 100).toFixed(2),
        OLYMPIAN: +(Number(t.crowns ?? 0) / pulls * 100).toFixed(2),
      } : null,
      publishedOdds: { MORTAL: 97.84, HERO: 1.96, OLYMPIAN: 0.20 },
      claimed: Number((claims?.[0] ?? claims)?.claimed ?? 0),
      currency: 'HYPE',
      deskFloat: await bal(DESK),
      reserve: await bal(RESERVE),
      daily,
      updatedAt: new Date().toISOString(),
    };
  });

  /** Private: money. Requires the admin token. */
  app.get('/stats/revenue', async (req, reply) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return reply.code(401).send();

    const [rows]: any = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status='settled') AS boxes,
        count(*) FILTER (WHERE status='settled' AND opened_at > now() - interval '1 day')  AS boxes_24h,
        count(*) FILTER (WHERE status='settled' AND opened_at > now() - interval '7 days') AS boxes_7d
      FROM draws`);
    const r = rows?.[0] ?? rows ?? {};
    const { price: box, ev } = await machineOne();

    const daily: any = await db.execute(sql`
      SELECT date_trunc('day', opened_at)::date AS day, count(*) AS boxes
      FROM draws WHERE status='settled' AND opened_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1 DESC`);

    const boxes = Number(r.boxes ?? 0);
    // Expected payout is the published EV; actual liability depends on what people sell back.
    const expectedPayout = boxes * ev;

    return {
      boxes,
      boxes24h: Number(r.boxes_24h ?? 0),
      boxes7d: Number(r.boxes_7d ?? 0),
      grossHype: boxes * box,
      gross24hHype: Number(r.boxes_24h ?? 0) * box,
      gross7dHype: Number(r.boxes_7d ?? 0) * box,
      expectedValueIssuedHype: +expectedPayout.toFixed(4),
      theoreticalMarginHype: +(boxes * box - expectedPayout).toFixed(4),
      treasuryHype: await bal(TREASURY),
      deskFloatHype: await bal(DESK),
      reserveHype: await bal(RESERVE),
      daily,
      currency: 'HYPE',
      boxPriceHype: box,
      note: 'All figures in HYPE. Gross assumes the CURRENT box price for every settled box — if the box was repriced, sum draws.pricePaid from chain instead. Margin is theoretical — it assumes every fragment issued is eventually redeemed at its mark, which is the conservative view.',
    };
  });
}

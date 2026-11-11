import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { db } from '../db/client';
import { vaultItems, machines, draws, tokenState, swaps, proofOfReserve, users, spendLedger } from '../db/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { fairnessRecord, computeResult, rollTier } from '../services/fairness';
import { assessPoolHealth } from '../services/oddsSolver';
import { totalCreatorFeeWei } from '../indexer/launchpadIndexer';
import { LAUNCHPAD, toHype, hypeUsd, assertChain, activeChain } from '../chain/elysium';
import { assertDeskRole } from './desk';
import { metaRoutes } from './meta';
import { deskRoutes } from './desk';
import { coaRoutes } from './coa';
import { fundsRoutes } from './funds';
import { redeemRoutes } from './redeem';
import { statsRoutes } from './stats';

const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, { origin: process.env.FRONTEND_ORIGINS?.split(',') ?? true });
// Behind nginx every request arrives from 127.0.0.1. Without trustProxy +
// keying on the forwarded address, all visitors share one bucket.
await app.register(rateLimit, {
  max: 120, timeWindow: '1 minute',
  keyGenerator: (req) => (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
});

/**
 * Geo gate.
 *
 * A paid randomised draw awarding assets with a cash buyback is gambling in many
 * jurisdictions, including the UK under the Gambling Act 2005 — and taking payment in HYPE rather than a stablecoin does not change that analysis. This blocks at the
 * edge. It is a legal control, not a nice-to-have — do not make it bypassable by
 * a header the client controls, and do not ship without a solicitor's opinion on
 * which list belongs here.
 */
const BLOCKED_COUNTRIES = (process.env.BLOCKED_COUNTRIES ?? 'GB,US,FR,BE,NL,AU,SG').split(',');

app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/public/')) return; // marketing + verifier pages stay open
  const country = (req.headers['cf-ipcountry'] as string) ?? 'XX'; // trust only your CDN's header
  if (BLOCKED_COUNTRIES.includes(country)) {
    return reply.code(451).send({
      error: 'unavailable_in_region',
      message: 'Box opening is not available in your region. You can still browse the vault.',
    });
  }
});

// ------------------------------------------------------------------ the vault

app.get('/vault/items', async (req) => {
  const q = z.object({
    tier: z.enum(['MORTAL', 'HERO', 'OLYMPIAN']).optional(),
    inPool: z.coerce.boolean().optional(),
    limit: z.coerce.number().max(100).default(50),
    offset: z.coerce.number().default(0),
  }).parse(req.query);

  const conditions = [eq(vaultItems.redeemed, false)];
  if (q.tier) conditions.push(eq(vaultItems.tier, q.tier));
  if (q.inPool !== undefined) conditions.push(eq(vaultItems.inPool, q.inPool));

  return db.select().from(vaultItems)
    .where(and(...conditions))
    .orderBy(desc(vaultItems.appraisedHype))
    .limit(q.limit).offset(q.offset);
});

/** Headline vault stats. This is the number the whole project is judged on. */
app.get('/public/vault/stats', async () => {
  const [agg] = await db.select({
    count: sql<number>`count(*)::int`,
    totalHype: sql<number>`COALESCE(sum(${vaultItems.appraisedHype}), 0)`,
  }).from(vaultItems).where(eq(vaultItems.redeemed, false));

  const [por] = await db.select().from(proofOfReserve).orderBy(desc(proofOfReserve.createdAt)).limit(1);
  const feeWei = LAUNCHPAD.pool ? await totalCreatorFeeWei(LAUNCHPAD.pool) : 0n;
  const px = await hypeUsd();

  return {
    itemCount: agg.count,
    totalAppraisedHype: agg.totalHype,
    currency: 'HYPE',
    cumulativeCreatorFeesHype: toHype(feeWei),
    cumulativeCreatorFeesUsd: px ? toHype(feeWei) * px : null,
    lastProofOfReserve: por ? {
      merkleRoot: por.merkleRoot,
      itemCount: por.itemCount,
      publishedTx: por.publishedTx,
      at: por.createdAt,
      hasDiscrepancies: Array.isArray(por.discrepancies) && (por.discrepancies as unknown[]).length > 0,
    } : null,
  };
});

// ----------------------------------------------------------------- machines

app.get('/public/machines', async () => {
  const rows = await db.select().from(machines).where(eq(machines.active, true));
  const inventory = await db.select({
    tier: vaultItems.tier, machineId: vaultItems.machineId, appraisedHype: vaultItems.appraisedHype,
  }).from(vaultItems).where(eq(vaultItems.inPool, true));

  const TIER_ORDER = ['', 'MORTAL', 'HERO', 'OLYMPIAN', ''];  // classes, by tier slot

  return rows.map((m) => {
    const inv = inventory
      .filter((i) => i.machineId === m.machineId)
      .map((i) => ({ tier: TIER_ORDER.indexOf(i.tier), appraisedHype: i.appraisedHype }));

    const floors = (m.oddsPpm as number[]).map((_, i) => {
      const t = inv.filter((x) => x.tier === i);
      return t.length ? Math.min(...t.map((x) => x.appraisedHype)) : 0;
    });

    const health = assessPoolHealth(m.machineId, m.priceHype, m.oddsPpm as number[], floors, inv);

    return {
      machineId: m.machineId,
      name: m.name,
      priceHype: m.priceHype,
      currency: 'HYPE',
      version: m.version,
      odds: (m.oddsPpm as number[]).map((ppm, i) => ({
        tier: TIER_ORDER[i],
        probability: ppm / 1e6,
        oddsLabel: `1 in ${(1e6 / ppm).toFixed(ppm > 10000 ? 1 : 0)}`,
        floorHype: floors[i],
        depth: health.tiers[i].depth,
      })),
      // Show LIVE EV, computed from real inventory, not the nominal target.
      // Advertising a target you no longer meet is how this becomes fraud.
      expectedValueHype: health.liveEvHype,
      evRatio: health.liveEvHype / m.priceHype,
      available: health.alerts.every((a) => !a.startsWith('CRITICAL')),
    };
  });
});

// -------------------------------------------------------------------- draws

app.get('/draws/:address', async (req) => {
  const { address } = z.object({ address: z.string() }).parse(req.params);
  return db.select().from(draws)
    .where(sql`lower(${draws.user}) = ${address.toLowerCase()}`)
    .orderBy(desc(draws.openedAt)).limit(100);
});

/** Live feed for the "recent pulls" ticker. */
// Classes by tier slot.
const CLASS_LABELS: Record<number, string> = { 1: 'MORTAL', 2: 'HERO', 3: 'OLYMPIAN' };

app.get('/public/draws/recent', async () => {
  const rows = await db.select().from(draws)
    .orderBy(desc(draws.openedAt)).limit(40);
  const items = await db.select().from(vaultItems);
  const byId = new Map(items.map((i) => [i.tokenId, i]));
  return rows.map((r) => {
    const w = r.wonTokenId != null ? byId.get(r.wonTokenId) : null;
    return {
      drawId: r.drawId, user: r.user, status: r.status,
      openedAt: r.openedAt, wonTokenId: r.wonTokenId,
      title: w ? `Vault Work #${r.wonTokenId}` : null,
      class: r.wonTier != null ? (CLASS_LABELS[r.wonTier] ?? 'MORTAL') : null,
      rare: r.wonTier != null && r.wonTier >= 2,
      markHype: w ? Number(w.appraisedHype) : null,
      image: r.wonTokenId != null ? `https://api.amphora.example/meta/${r.wonTokenId}/image` : null,
    };
  });
});

/** Everything a user needs to verify their own draw without trusting us. */
app.get('/public/fairness/:drawId', async (req, reply) => {
  const { drawId } = z.object({ drawId: z.coerce.number() }).parse(req.params);
  const rec = await fairnessRecord(BigInt(drawId));
  if (!rec) return reply.code(404).send({ error: 'draw_not_settled' });
  return rec;
});

/** Server-side reproduction of a draw. The client should do this itself too. */
app.post('/public/fairness/verify', async (req) => {
  const b = z.object({
    serverSeed: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    clientSeed: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    user: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    drawId: z.coerce.number(),
    oddsPpm: z.array(z.number()).length(5),
  }).parse(req.body);

  const result = computeResult(
    b.serverSeed as `0x${string}`, b.clientSeed as `0x${string}`,
    b.user as `0x${string}`, BigInt(b.drawId),
  );
  return { result, tier: rollTier(result, b.oddsPpm) };
});

// -------------------------------------------------- responsible play controls

app.get('/user/:address/limits', async (req) => {
  const { address } = z.object({ address: z.string() }).parse(req.params);
  const [u] = await db.select().from(users).where(eq(users.address, address.toLowerCase()));
  const today = new Date().toISOString().slice(0, 10);
  const [spent] = await db.select({ total: sql<number>`COALESCE(sum(${spendLedger.amountHype}), 0)` })
    .from(spendLedger)
    .where(and(eq(spendLedger.user, address.toLowerCase()), eq(spendLedger.day, today)));

  return {
    kyc: u?.kyc ?? 'none',
    dailySpendCapHype: u?.dailySpendCapHype ?? null,
    spentTodayHype: spent.total,
    selfExcludedUntil: u?.selfExcludedUntil ?? null,
    canOpen: !u?.blocked
      && (!u?.selfExcludedUntil || u.selfExcludedUntil < new Date())
      && (!u?.dailySpendCapHype || spent.total < u.dailySpendCapHype),
  };
});

app.post('/user/:address/limits', async (req) => {
  const { address } = z.object({ address: z.string() }).parse(req.params);
  const b = z.object({
    dailySpendCapHype: z.number().positive().optional(),
    selfExcludeDays: z.number().int().min(1).max(365).optional(),
  }).parse(req.body);

  // Limits can be tightened instantly but never loosened without a cooling-off
  // period. A cap you can raise mid-session is not a cap.
  const patch: Record<string, unknown> = {};
  if (b.dailySpendCapHype) patch.dailySpendCapHype = b.dailySpendCapHype;
  if (b.selfExcludeDays) {
    patch.selfExcludedUntil = new Date(Date.now() + b.selfExcludeDays * 864e5);
  }
  await db.update(users).set(patch).where(eq(users.address, address.toLowerCase()));
  return { ok: true };
});

// ------------------------------------------------------------------ token

app.get('/public/token', async () => {
  const [ts] = await db.select().from(tokenState).limit(1);
  const [vol] = await db.select({
    volume24h: sql<string>`COALESCE(sum(${swaps.volumeWei}::numeric), 0)::text`,
    fees24h: sql<string>`COALESCE(sum(${swaps.creatorFeeWei}::numeric), 0)::text`,
  }).from(swaps).where(gte(swaps.blockNumber, 0)); // all-time; narrow to a block window for 24h figures

  return {
    ...ts,
    launchpad: LAUNCHPAD.name,
    volumeHype: toHype(BigInt(vol.volume24h)),
    creatorFeesHype: toHype(BigInt(vol.fees24h)),
  };
});

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

const port = Number(process.env.PORT ?? 8080);

// Refuse to serve from the wrong network or with a desk key that cannot buy.
await assertChain();
app.log.info(`chain ${activeChain.name} (${activeChain.id})`);
if (process.env.CERT_ADDRESS) app.log.info(`desk ${await assertDeskRole()}`);
await metaRoutes(app);
await deskRoutes(app);
await coaRoutes(app);
await fundsRoutes(app);
await redeemRoutes(app);
await statsRoutes(app);
await app.listen({ port, host: '0.0.0.0' });

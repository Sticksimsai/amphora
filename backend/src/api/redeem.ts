import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseAbi, getAddress } from 'viem';
import { publicClient, walletClient } from '../chain/elysium';
import { db } from '../db/client';
import { sql } from 'drizzle-orm';

const CERT = process.env.CERT_ADDRESS as `0x${string}`;
const REDEEM_KEY = (process.env.REDEEM_PRIVATE_KEY ?? process.env.OPS_PRIVATE_KEY) as `0x${string}`;
const OPEN = process.env.REDEMPTION_OPEN === 'true';

const certAbi = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function redeemed(uint256) view returns (bool)',
  'function certificateOf(uint256) view returns ((uint256,uint256,uint128,uint40,uint32,uint32))',
  'function claimRedemption(uint256 tokenId, address owner_)',
]);

const addressSchema = z.object({
  name: z.string().min(2).max(80),
  line1: z.string().min(3).max(120),
  line2: z.string().max(120).optional().default(''),
  city: z.string().min(1).max(80),
  postcode: z.string().min(2).max(20),
  country: z.string().min(2).max(60),
  email: z.string().email(),
});

export async function redeemRoutes(app: FastifyInstance) {
  /** Is this certificate claimable, and by whom? */
  app.get('/redeem/eligibility/:tokenId', async (req, reply) => {
    const tokenId = BigInt(String((req.params as any).tokenId));
    try {
      const owner = await publicClient.readContract({
        address: CERT, abi: certAbi, functionName: 'ownerOf', args: [tokenId] });
      const already = await publicClient.readContract({
        address: CERT, abi: certAbi, functionName: 'redeemed', args: [tokenId] });
      const c = await publicClient.readContract({
        address: CERT, abi: certAbi, functionName: 'certificateOf', args: [tokenId] }) as any;
      return {
        tokenId: String(tokenId),
        owner,
        redeemed: already,
        open: OPEN,
        eligible: OPEN && !already,
        reason: !OPEN ? 'Redemption is not open yet.' : already ? 'Already redeemed.' : null,
        serial: Number(c[5]),
        artworkId: Number(c[0]),
      };
    } catch {
      return reply.code(404).send({ error: 'unknown certificate' });
    }
  });

  /** Place a redemption order. Locks the certificate immediately. */
  app.post('/redeem/order', async (req, reply) => {
    if (!OPEN) return reply.code(403).send({ error: 'Redemption is not open yet.' });

    const body = z.object({
      tokenId: z.string(),
      holder: z.string(),
      shipping: addressSchema,
    }).parse(req.body);

    const tokenId = BigInt(body.tokenId);
    const holder = getAddress(body.holder);

    const owner = await publicClient.readContract({
      address: CERT, abi: certAbi, functionName: 'ownerOf', args: [tokenId] });
    if (getAddress(owner) !== holder) return reply.code(400).send({ error: 'not the holder' });

    const already = await publicClient.readContract({
      address: CERT, abi: certAbi, functionName: 'redeemed', args: [tokenId] });
    if (already) return reply.code(400).send({ error: 'already redeemed' });

    // Lock first: from this moment the certificate cannot be sold or moved.
    const wc = walletClient(REDEEM_KEY);
    const lockTx = await wc.writeContract({
      address: CERT, abi: certAbi, functionName: 'claimRedemption', args: [tokenId, holder] });
    await publicClient.waitForTransactionReceipt({ hash: lockTx });

    const s = body.shipping;
    const [row] = await db.execute(sql`
      INSERT INTO redemption_orders
        (token_id, holder, name, line1, line2, city, postcode, country, email, lock_tx, status)
      VALUES (${Number(tokenId)}, ${holder}, ${s.name}, ${s.line1}, ${s.line2}, ${s.city},
              ${s.postcode}, ${s.country}, ${s.email}, ${lockTx}, 'PLACED')
      RETURNING id, token_id, status, created_at
    `) as any;

    return { ordered: true, orderId: row?.id, tokenId: String(tokenId), lockTx, status: 'PLACED' };
  });

  /** A holder's own orders. */
  app.get('/redeem/orders/:address', async (req) => {
    const address = String((req.params as any).address).toLowerCase();
    const rows = await db.execute(sql`
      SELECT id, token_id, status, tracking, carrier, created_at, shipped_at
      FROM redemption_orders WHERE lower(holder) = ${address}
      ORDER BY created_at DESC
    `);
    return rows;
  });

  /** Fulfilment queue. Requires the admin token. */
  app.get('/redeem/queue', async (req, reply) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return reply.code(401).send();
    const rows = await db.execute(sql`
      SELECT * FROM redemption_orders WHERE status IN ('PLACED','IN_PRODUCTION')
      ORDER BY created_at ASC
    `);
    return rows;
  });

  /** Advance an order's status. */
  app.post('/redeem/fulfil', async (req, reply) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return reply.code(401).send();
    const b = z.object({
      orderId: z.number(),
      status: z.enum(['IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
      tracking: z.string().optional(),
      carrier: z.string().optional(),
    }).parse(req.body);

    await db.execute(sql`
      UPDATE redemption_orders
      SET status = ${b.status},
          tracking = COALESCE(${b.tracking ?? null}, tracking),
          carrier = COALESCE(${b.carrier ?? null}, carrier),
          shipped_at = CASE WHEN ${b.status} = 'SHIPPED' THEN now() ELSE shipped_at END
      WHERE id = ${b.orderId}
    `);
    return { updated: true, orderId: b.orderId, status: b.status };
  });
}

import type { FastifyInstance } from 'fastify';
import { parseAbi, getAddress, keccak256, toBytes } from 'viem';
import { publicClient, walletClient, toHype, explorerTx } from '../chain/elysium';
import { db } from '../db/client';
import { deskTrades } from '../db/schema';

/**
 * The Ferryman — the standing bid. Any Sherd, 80% of its mark, paid in HYPE.
 *
 * The desk key holds DESK_ROLE and a bounded HYPE float. Because payment is the
 * chain's native asset, the same balance pays the sellers AND the gas — one
 * number to watch instead of two (scripts/float-check.ts watches it).
 */
const CERT = process.env.CERT_ADDRESS as `0x${string}`;
const DESK_KEY = (process.env.DESK_PRIVATE_KEY ?? process.env.OPS_PRIVATE_KEY) as `0x${string}`;
const certAbi = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function currentValueWei(uint256) view returns (uint256)',
  'function redeemed(uint256) view returns (bool)',
  'function deskAcquire(uint256 tokenId, address from)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
]);
const BID_BPS = 8000n;
const DESK_ROLE = keccak256(toBytes('DESK_ROLE'));
/** Kept back for gas so a payout can never leave the desk unable to transact. */
const GAS_RESERVE_WEI = 10n ** 16n; // 0.01 HYPE

/**
 * The single failure that hit the original three times: the desk route signing
 * with a key that does not hold DESK_ROLE. Checked once at boot, loudly.
 */
export async function assertDeskRole() {
  if (!DESK_KEY || DESK_KEY.length !== 66) throw new Error('DESK_PRIVATE_KEY missing or malformed');
  const addr = walletClient(DESK_KEY).account.address;
  const ok = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'hasRole', args: [DESK_ROLE, addr] });
  if (!ok) throw new Error(`desk key ${addr} does not hold DESK_ROLE on ${CERT}`);
  return addr;
}

export async function deskRoutes(app: FastifyInstance) {
  app.get('/desk/quote/:certId', async (req) => {
    const certId = BigInt((req.params as any).certId);
    const nav = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'currentValueWei', args: [certId] });
    const bid = (nav * BID_BPS) / 10000n;
    return {
      certId: String(certId),
      navWei: String(nav), bidWei: String(bid),
      navHype: toHype(nav), bidHype: toHype(bid),
      currency: 'HYPE', standing: true,
    };
  });

  app.post('/desk/sell', async (req, reply) => {
    const { certId, holder } = req.body as { certId: string; holder: string };
    const id = BigInt(certId);
    const seller = getAddress(holder);

    const owner = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'ownerOf', args: [id] });
    if (getAddress(owner) !== seller) return reply.code(400).send({ error: 'not the holder' });
    const isRedeemed = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'redeemed', args: [id] });
    if (isRedeemed) return reply.code(400).send({ error: 'certificate is redeemed — soulbound' });

    const nav = await publicClient.readContract({ address: CERT, abi: certAbi, functionName: 'currentValueWei', args: [id] });
    const bid = (nav * BID_BPS) / 10000n;

    const wc = walletClient(DESK_KEY);
    // Solvency BEFORE taking the certificate. The original acquired first and
    // paid second; with an empty float that takes someone's certificate and
    // pays them nothing. Refuse up front instead.
    const float = await publicClient.getBalance({ address: wc.account.address });
    if (float < bid + GAS_RESERVE_WEI) {
      req.log.error({ float: String(float), bid: String(bid) }, 'desk float cannot cover bid');
      return reply.code(503).send({ error: 'desk_float_low', message: 'The desk is being refilled. Your Sherd has not moved. Try again in a few minutes.' });
    }

    const acquireTx = await wc.writeContract({ address: CERT, abi: certAbi, functionName: 'deskAcquire', args: [id, seller] });
    await publicClient.waitForTransactionReceipt({ hash: acquireTx });

    const payTx = await wc.sendTransaction({ to: seller, value: bid });
    const rc = await publicClient.waitForTransactionReceipt({ hash: payTx });
    if (rc.status !== 'success') {
      // The certificate has moved and the payment did not land (a seller
      // contract that rejects HYPE). This must page a human, not disappear.
      req.log.fatal({ certId, seller, acquireTx, payTx }, 'DESK PAYOUT FAILED AFTER ACQUIRE');
      return reply.code(500).send({ error: 'payout_failed', acquireTx, payTx });
    }

    await db.insert(deskTrades).values({
      certId: Number(id), seller, navHype: toHype(nav), bidHype: toHype(bid), acquireTx, payTx,
    }).onConflictDoNothing();

    return { sold: true, bidWei: String(bid), bidHype: toHype(bid), acquireTx, payTx, explorer: explorerTx(payTx) };
  });
}

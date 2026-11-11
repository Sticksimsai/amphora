import { keccak256, encodePacked, encodeAbiParameters, toHex, hexToBigInt } from 'viem';
import { randomBytes } from 'node:crypto';
import { db } from '../db/client';
import { seedChains, draws } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * PROVABLE FAIRNESS — reverse hash chain
 * ======================================
 *
 * Elysium has a single sequencer (Conduit) and no public mempool, so blockhash is influenceable and
 * there is no VRF to lean on. On-chain pseudo-randomness here would be theatre.
 * Instead we use the construction online casinos have used for a decade, which
 * does not depend on chain entropy at all:
 *
 *     s[0]   = 32 cryptographically random bytes   (generated in KMS, never logged)
 *     s[i]   = keccak256(s[i-1])                   for i = 1..N
 *     commit = s[N]                                published on-chain BEFORE any draw
 *
 * Seeds are consumed in REVERSE: the first draw uses s[N-1], the second s[N-2].
 * Anyone can check keccak256(s[N-1]) == commit, and chain that check forward
 * indefinitely. The operator cannot swap in a different seed after seeing a user's
 * input, because only the true preimage hashes to the committed value.
 *
 * The user's clientSeed is mixed in, so the operator cannot precompute outcomes
 * for a known user either. Neither party controls the result alone.
 *
 * SECURITY NOTE: s[0] is the crown jewel. Generate it in an HSM or KMS, hold the
 * derived chain in encrypted storage, and never log a seed before it is revealed.
 * Leaking the chain ahead of the cursor lets anyone predict every pending draw.
 */

export const CHAIN_LENGTH = 100_000;

export interface GeneratedChain {
  chainId: string;
  commit: `0x${string}`;
  startIndex: number;
  seeds: `0x${string}`[]; // seeds[i] === s[i]; store encrypted, reveal in reverse
}

/** Generate a fresh chain. Run this offline, on the machine holding the KMS key. */
export function generateSeedChain(length = CHAIN_LENGTH): GeneratedChain {
  const seeds: `0x${string}`[] = new Array(length + 1);
  seeds[0] = toHex(randomBytes(32));

  for (let i = 1; i <= length; i++) {
    seeds[i] = keccak256(encodePacked(['bytes32'], [seeds[i - 1]]));
  }

  return {
    chainId: keccak256(encodePacked(['bytes32'], [seeds[length]])).slice(0, 18),
    commit: seeds[length],
    startIndex: length,
    seeds,
  };
}

/**
 * Reproduce a draw result. This exact function is what the public verifier page
 * runs client-side — publish it as a standalone snippet so users can check their
 * own draws without trusting your server or even your website.
 */
export function computeResult(
  serverSeed: `0x${string}`,
  clientSeed: `0x${string}`,
  user: `0x${string}`,
  drawId: bigint,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
      [serverSeed, clientSeed, user, drawId],
    ),
  );
}

/** Tier selection from cumulative odds in parts per million. Mirrors the contract. */
export function rollTier(result: `0x${string}`, oddsPpm: number[]): number {
  const roll = Number(hexToBigInt(result) % 1_000_000n);
  let cumulative = 0;
  for (let i = 0; i < oddsPpm.length; i++) {
    cumulative += oddsPpm[i];
    if (roll < cumulative) return i;
  }
  return oddsPpm.length - 1;
}

/** Item index within a tier pool. Mirrors the contract's second derivation. */
export function pickIndex(result: `0x${string}`, poolSize: number): number {
  const h = keccak256(encodePacked(['bytes32', 'string'], [result, 'ITEM']));
  return Number(hexToBigInt(h) % BigInt(poolSize));
}

/** Verify a revealed seed against the commitment it should reproduce. */
export function verifyReveal(serverSeed: `0x${string}`, expectedCommit: `0x${string}`): boolean {
  return keccak256(encodePacked(['bytes32'], [serverSeed])).toLowerCase() === expectedCommit.toLowerCase();
}

/**
 * Take the next seed for a draw. Decrements the cursor atomically so two
 * concurrent settlements can never consume the same seed — reusing a seed would
 * let an observer who saw one result predict the other.
 */
/** Read the next seed WITHOUT burning the cursor. Pair with confirmSeed after
 *  the settle transaction is CONFIRMED on-chain. Retries after failed attempts
 *  reuse the same seed — correct, since the contract's commitment only advances
 *  on successful settles. (Replaces burn-on-attempt, which desynced the cursor
 *  every time a settle reverted.) */
/** Read a specific seed index without touching the cursor. Used by the settler's
 *  realignment search. */
export async function peekSeedAt(chainId: string, index: number): Promise<`0x${string}` | null> {
  try { return await decryptSeedAt(chainId, index); } catch { return null; }
}

export async function peekSeed(chainId: string): Promise<{ index: number; seed: `0x${string}` }> {
  const [chain] = await db.select().from(seedChains).where(eq(seedChains.chainId, chainId));
  if (!chain) throw new Error(`Unknown seed chain ${chainId}`);
  if (chain.cursor <= 0) throw new Error(`Seed chain ${chainId} exhausted — commit a new one`);
  const index = chain.cursor - 1;
  const seed = await decryptSeedAt(chainId, index);
  return { index, seed };
}

/** Burn the cursor for a seed whose settle CONFIRMED. Guarded: only moves the
 *  cursor if it still sits exactly one above the confirmed index. */
export async function confirmSeed(chainId: string, index: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [chain] = await tx.select().from(seedChains)
      .where(eq(seedChains.chainId, chainId)).for('update');
    if (!chain) throw new Error(`Unknown seed chain ${chainId}`);
    if (chain.cursor !== index + 1)
      throw new Error(`confirmSeed race: cursor ${chain.cursor}, confirming ${index}`);
    await tx.update(seedChains).set({ cursor: index }).where(eq(seedChains.chainId, chainId));
  });
}

/** @deprecated burn-on-attempt; kept for reference. Use peekSeed + confirmSeed. */
export async function consumeSeed(chainId: string): Promise<{ index: number; seed: `0x${string}` }> {
  return db.transaction(async (tx) => {
    const [chain] = await tx
      .select()
      .from(seedChains)
      .where(eq(seedChains.chainId, chainId))
      .for('update'); // row lock

    if (!chain) throw new Error(`Unknown seed chain ${chainId}`);
    if (chain.cursor <= 0) throw new Error(`Seed chain ${chainId} exhausted — commit a new one`);

    const index = chain.cursor - 1;
    const seed = await decryptSeedAt(chainId, index);

    await tx.update(seedChains).set({ cursor: index }).where(eq(seedChains.chainId, chainId));
    return { index, seed };
  });
}

/**
 * Fetch and decrypt a single seed. Backed by KMS envelope encryption in production.
 * Stubbed here — wire to AWS KMS / GCP KMS / Vault before touching real money.
 */
async function decryptSeedAt(chainId: string, index: number): Promise<`0x${string}`> {
  const [row] = await db.select().from(seedChains).where(eq(seedChains.chainId, chainId));
  if (row?.encryptedBlobRef?.startsWith('file://')) {
    // TESTNET-ONLY dev store: plaintext seeds on local disk. The mainnet
    // path below still throws until a real KMS is wired. Do not ship this.
    const fs = await import('node:fs');
    const seeds = JSON.parse(fs.readFileSync(row.encryptedBlobRef.slice(7), 'utf8'));
    return seeds[index];
  }
  throw new Error(
    'decryptSeedAt is intentionally unimplemented. Wire this to your KMS before mainnet. ' +
      'Storing the seed chain in plaintext lets anyone with DB read access predict every draw.',
  );
}

/**
 * Publish the fairness record for a settled draw. Users need all four inputs to
 * verify independently, so expose them the moment the draw settles — not on request.
 */
export async function fairnessRecord(drawId: bigint) {
  const [d] = await db.select().from(draws).where(eq(draws.drawId, Number(drawId)));
  if (!d || !d.serverSeed) return null;

  return {
    drawId: d.drawId,
    user: d.user,
    clientSeed: d.clientSeed,
    serverSeed: d.serverSeed,
    seedIndex: d.seedIndex,
    priorCommit: d.priorCommit,
    result: computeResult(
      d.serverSeed as `0x${string}`,
      d.clientSeed as `0x${string}`,
      d.user as `0x${string}`,
      BigInt(d.drawId),
    ),
    tier: d.wonTier,
    tokenId: d.wonTokenId,
    verifyWith: 'keccak256(serverSeed) must equal priorCommit',
  };
}

/**
 * SEED ROOT CUSTODY
 * =================
 * The fairness chain is s[i] = keccak256(s[i-1]), so every seed in a 100,000-link
 * chain is derivable from one 32-byte root. Storing the expanded chain — as the
 * testnet dev-store did — means a single file read hands an attacker every future
 * draw. So we store nothing but the root, encrypted, and derive on demand.
 *
 * Providers, in descending order of how much you should trust them:
 *
 *   aws-kms   The root is stored as a KMS-encrypted blob. The plaintext exists
 *             only in process memory, only after a KMS Decrypt call made with an
 *             instance role. Disk compromise alone reveals nothing.
 *
 *   systemd   The root lives in a root-owned 0400 file delivered to the service
 *             via systemd LoadCredential. The service user cannot read the source
 *             file; the credential appears at $CREDENTIALS_DIRECTORY. Meaningful
 *             separation on a single box, no cloud dependency.
 *
 *   env       Development only. Refuses to run when NODE_ENV=production.
 *
 * Derivation cost: index 99,999 is ~100k keccak calls (~100ms). We memoise
 * checkpoints every 1,000 links so repeated settles are near-instant.
 */
import { keccak256, encodePacked, toHex } from 'viem';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Provider = 'aws-kms' | 'systemd' | 'env';
const PROVIDER = (process.env.SEED_PROVIDER ?? 'env') as Provider;
const CHECKPOINT = 1_000;

let _root: `0x${string}` | null = null;
const _checkpoints = new Map<number, `0x${string}`>();

async function loadRoot(): Promise<`0x${string}`> {
  if (_root) return _root;

  if (PROVIDER === 'aws-kms') {
    const blobPath = process.env.SEED_ROOT_BLOB;
    if (!blobPath || !fs.existsSync(blobPath)) throw new Error('SEED_ROOT_BLOB missing');
    const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
    const kms = new KMSClient({ region: process.env.AWS_REGION });
    const out = await kms.send(new DecryptCommand({
      CiphertextBlob: fs.readFileSync(blobPath),
      KeyId: process.env.KMS_KEY_ID,
    }));
    _root = toHex(Buffer.from(out.Plaintext as Uint8Array)) as `0x${string}`;
  } else if (PROVIDER === 'systemd') {
    const dir = process.env.CREDENTIALS_DIRECTORY;
    if (!dir) throw new Error('CREDENTIALS_DIRECTORY unset — is LoadCredential configured?');
    const raw = fs.readFileSync(path.join(dir, 'seed-root'), 'utf8').trim();
    _root = (raw.startsWith('0x') ? raw : '0x' + raw) as `0x${string}`;
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SEED_PROVIDER=env is forbidden in production. Use aws-kms or systemd.');
    }
    const raw = process.env.SEED_ROOT;
    if (!raw) throw new Error('SEED_ROOT unset (development provider)');
    console.warn('[seedVault] DEVELOPMENT provider in use — the root is in an env var.');
    _root = (raw.startsWith('0x') ? raw : '0x' + raw) as `0x${string}`;
  }
  return _root!;
}

/** s[index], derived from the root. Never logged, never persisted. */
export async function deriveSeedAt(index: number): Promise<`0x${string}`> {
  const root = await loadRoot();
  let base = root;
  let i = 0;
  const cpIdx = Math.floor(index / CHECKPOINT) * CHECKPOINT;
  const cp = _checkpoints.get(cpIdx);
  if (cp) { base = cp; i = cpIdx; }

  let s = base;
  for (; i < index; i++) {
    s = keccak256(encodePacked(['bytes32'], [s]));
    if ((i + 1) % CHECKPOINT === 0) _checkpoints.set(i + 1, s);
  }
  return s;
}

/** The value published on-chain before any draw: s[length]. */
export async function commitmentFor(length: number): Promise<`0x${string}`> {
  return deriveSeedAt(length);
}

/** Generate a fresh root. Print once, encrypt immediately, never store plaintext. */
export function generateRoot(): `0x${string}` {
  return toHex(randomBytes(32)) as `0x${string}`;
}

export function providerName(): string { return PROVIDER; }

import 'dotenv/config';
import {
  createPublicClient, createWalletClient, http, defineChain, parseAbi, parseAbiItem,
  formatEther, parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Elysium — Kinetiq's Arbitrum Orbit L2 for Hyperliquid.
 * Settles to HyperEVM (999 / 998). Gas is native HYPE, 18 decimals, bridged 1:1
 * from HyperEVM. ~100 ms blocks, single sequencer, NO public mempool.
 *
 *   mainnet 99901   (live since 9 Nov 2026)
 *   testnet 99801
 *
 * DO NOT import `elysium` / `elysiumTestnet` from viem/chains. Those are Vulcan
 * Forged's unrelated chain (1338 / 1339, LAVA gas). Using them gives you the
 * wrong currency, the wrong explorer and — with a bare http() — the wrong RPC.
 *
 * Everything in Amphora is priced in native HYPE. There is no stablecoin and
 * no ERC-20 approval anywhere in the purchase path.
 */
export const elysium = defineChain({
  id: 99901,
  name: 'Elysium',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    // The public endpoint is shared and has no SLA. Production MUST set RPC_URL
    // to a keyed provider (Alchemy is the chain's primary; Chainstack, Goldsky,
    // QuickNode and dRPC also serve it).
    default: { http: [process.env.RPC_URL ?? 'https://rpc.elysium.kinetiq.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Elysium Explorer', url: 'https://elysium.kinetiq.xyz/explorer' },
  },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});

export const elysiumTestnet = defineChain({
  ...elysium,
  id: 99801,
  name: 'Elysium Testnet',
  testnet: true,
  rpcUrls: {
    default: { http: [process.env.TESTNET_RPC_URL ?? 'https://testnet-rpc.elysium.kinetiq.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Elysium Testnet Explorer', url: 'https://elysium.kinetiq.xyz/testnet-explorer' },
  },
});

/**
 * Network selection is ONE explicit switch. On the original deployment the mere
 * presence of TESTNET_RPC_URL in .env forced testnet mode and cost an outage;
 * here only TESTNET=true selects testnet, whatever else is set.
 */
export const IS_TESTNET = process.env.TESTNET === 'true';
export const activeChain = IS_TESTNET ? elysiumTestnet : elysium;
const ACTIVE_RPC = activeChain.rpcUrls.default.http[0];

/**
 * eth_getLogs range. Providers differ by two orders of magnitude on this chain
 * (free tiers as low as 100 blocks; 2,000 on the public endpoint; 10–20k paid),
 * and at ~100 ms blocks even 2,000 blocks is only ~3 minutes of history. Set
 * LOG_CHUNK to what your plan allows and keep every scanner on this constant.
 */
export const LOG_CHUNK = BigInt(process.env.LOG_CHUNK ?? 2_000);

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(ACTIVE_RPC, { batch: true, retryCount: 3, timeout: 20_000 }),
  // 100 ms blocks: polling every block is pointless load. 1 s is plenty for a
  // settle path whose refund window is ten minutes.
  pollingInterval: 1_000,
});

export function walletClient(pk: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: activeChain,
    transport: http(ACTIVE_RPC),
  });
}

/** Call at boot. A service pointed at the wrong network must refuse to start. */
export async function assertChain() {
  const got = await publicClient.getChainId();
  if (got !== activeChain.id) {
    throw new Error(
      `RPC answers chain ${got} but ${activeChain.name} is ${activeChain.id}. ` +
      `Check RPC_URL / TESTNET_RPC_URL / TESTNET in .env (and check for duplicate keys).`,
    );
  }
  return got;
}

export const explorerAddress = (a: string) => `${activeChain.blockExplorers.default.url}/address/${a}`;
export const explorerTx = (h: string) => `${activeChain.blockExplorers.default.url}/tx/${h}`;

// ------------------------------------------------------------------ HYPE units

/** wei -> HYPE as a JS number. Display and DB only; never do money math on it. */
export const toHype = (wei: bigint): number => Number(formatEther(wei));
/** "0.35" -> wei. Takes a string on purpose so no float ever touches a price. */
export const hypeToWei = (hype: string | number): bigint => parseEther(String(hype));

/** Native HYPE balance of an address, as a number of HYPE (null if unreachable). */
export async function hypeBalance(addr?: string): Promise<number | null> {
  if (!addr) return null;
  try { return toHype(await publicClient.getBalance({ address: addr as `0x${string}` })); }
  catch { return null; }
}

/**
 * HYPE/USD spot, for DISPLAY and for sizing the acquisition funds (auctions are
 * invoiced in fiat). Never used to price a box, a mark or a desk bid — those
 * are fixed in HYPE on-chain. Once Kinetiq ships the HyperCore market-data
 * precompile (planned ArbOS upgrade, ~4 weeks after mainnet) this can read the
 * HyperCore oracle directly instead of an HTTP API.
 */
let _px: { v: number; at: number } | null = null;
export async function hypeUsd(): Promise<number | null> {
  if (_px && Date.now() - _px.at < 60_000) return _px.v;
  try {
    const res = await fetch('https://coins.llama.fi/prices/current/coingecko:hyperliquid');
    const j = (await res.json()) as { coins: Record<string, { price: number }> };
    const v = j.coins['coingecko:hyperliquid']?.price;
    if (!v) return _px?.v ?? null;
    _px = { v, at: Date.now() };
    return v;
  } catch { return _px?.v ?? null; }
}

// ------------------------------------------------------- token / launchpad layer

/**
 * The $AMPH token launches on an Elysium launchpad that puts the whole supply
 * into a locked Uniswap V3 pool quoted in HYPE from block one (Citadel's model;
 * Supercolony and PerpMe do the same). No bonding curve, no graduation, so the
 * pool that exists at launch is the pool forever — which is why the indexer
 * below needs nothing launchpad-specific beyond the pool address and the fee
 * split. Everything here is configuration, not hardcoded addresses: the chain
 * is days old and none of these are worth baking into source.
 *
 * The token MUST be a plain ERC-20 with no fee-on-transfer. Elysium's mirror
 * bridge to HyperEVM/HyperCore requires it, so a transfer tax (the original
 * design's 3%) would close the path to a HyperCore spot listing. The Reserve is
 * funded from the creator's share of LP fees instead.
 */
export const LAUNCHPAD = {
  name: process.env.LAUNCHPAD_NAME ?? 'citadel',
  token: process.env.TOKEN_ADDRESS as `0x${string}` | undefined,
  pool: process.env.POOL_ADDRESS as `0x${string}` | undefined,
  /** Wrapped HYPE — the pool's quote asset. Read it off the pool; do not guess. */
  whype: process.env.WHYPE_ADDRESS as `0x${string}` | undefined,
  startBlock: BigInt(process.env.POOL_START_BLOCK ?? 0),
  /** Pool fee in hundredths of a bip (10000 = 1%). Read from pool.fee() at boot. */
  poolFee: Number(process.env.POOL_FEE ?? 10_000),
  /** Creator's share of the pool fee, in bps. Kleos publishes 7000; confirm yours. */
  creatorShareBps: Number(process.env.CREATOR_SHARE_BPS ?? 7_000),
  supply: BigInt(process.env.TOKEN_SUPPLY ?? 1_000_000_000),
  swapRouter: process.env.SWAP_ROUTER as `0x${string}` | undefined,
} as const;

export const swapEvent = parseAbiItem(
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
);

export const uniV3PoolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
]);

/** Price of token in HYPE from a V3 pool. Token and WHYPE are both 18dp. */
export function priceFromSqrtX96(sqrtPriceX96: bigint, isToken0: boolean): number {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const token1PerToken0 = ratio * ratio;
  return isToken0 ? token1PerToken0 : 1 / token1PerToken0;
}

/** Trade direction: the sign of the quote-asset delta tells you the side. */
export function swapSide(tokenIsToken0: boolean, amount0: bigint, amount1: bigint): 'buy' | 'sell' {
  const quoteSigned = tokenIsToken0 ? amount1 : amount0;
  return quoteSigned > 0n ? 'buy' : 'sell';
}

import {
  pgTable, text, integer, bigint, boolean, timestamp, doublePrecision,
  numeric, primaryKey, index, uniqueIndex, jsonb, pgEnum,
} from 'drizzle-orm/pg-core';

export const drawStatus = pgEnum('draw_status', ['pending', 'settled', 'refunded', 'failed']);
export const tierEnum = pgEnum('tier', ['MORTAL', 'HERO', 'OLYMPIAN']);
export const kycStatus = pgEnum('kyc_status', ['none', 'pending', 'approved', 'rejected']);

// ---------------------------------------------------------------- token pool indexing (launchpad-agnostic: a locked Uniswap V3 pool quoted in HYPE)

export const swaps = pgTable('swaps', {
  txHash: text('tx_hash').notNull(),
  logIndex: integer('log_index').notNull(),
  blockNumber: integer('block_number').notNull(),
  pool: text('pool').notNull(),
  token: text('token').notNull(),
  side: text('side').notNull(),                       // 'buy' | 'sell'
  volumeWei: numeric('volume_wei', { precision: 78, scale: 0 }).notNull(),
  poolFeeWei: numeric('pool_fee_wei', { precision: 78, scale: 0 }).notNull(),
  creatorFeeWei: numeric('creator_fee_wei', { precision: 78, scale: 0 }).notNull(),
  priceHype: doublePrecision('price_hype').notNull(),   // token price in HYPE at the swap
  hypeUsd: doublePrecision('hype_usd').notNull(),       // HYPE/USD spot when indexed (display only)
}, (t) => ({
  pk: primaryKey({ columns: [t.txHash, t.logIndex] }),
  byPool: index('swaps_pool_block_idx').on(t.pool, t.blockNumber),
}));

export const indexerCursor = pgTable('indexer_cursor', {
  pool: text('pool').primaryKey(),
  lastBlock: integer('last_block').notNull(),
});

export const tokenState = pgTable('token_state', {
  token: text('token').primaryKey(),
  priceHype: doublePrecision('price_hype').notNull(),
  priceUsd: doublePrecision('price_usd').notNull(),
  marketCapUsd: doublePrecision('market_cap_usd').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------------------- treasury

export const feeClaims = pgTable('fee_claims', {
  id: text('id').primaryKey(),
  claimedAtBlock: integer('claimed_at_block').notNull(),
  txHash: text('tx_hash').notNull(),
  amountWei: numeric('amount_wei', { precision: 78, scale: 0 }).notNull(),
  amountUsd: doublePrecision('amount_usd').notNull(),
  routedToTreasury: boolean('routed_to_treasury').notNull().default(false),
  routeTx: text('route_tx'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const acquisitions = pgTable('acquisitions', {
  id: text('id').primaryKey(),
  sourceChainId: integer('source_chain_id').notNull(),
  sourceContract: text('source_contract').notNull(),
  sourceTokenId: text('source_token_id').notNull(),
  artist: text('artist'),
  title: text('title'),
  editionOf: integer('edition_of'),                    // null = unique work
  paidUsd: doublePrecision('paid_usd').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
  custodyAddress: text('custody_address').notNull(),
  vaultTokenId: integer('vault_token_id'),             // ArtVault721 id once minted
  sourceUrl: text('source_url'),                       // LiveArt listing, auction record
});

// --------------------------------------------------------------------- vault

export const vaultItems = pgTable('vault_items', {
  tokenId: integer('token_id').primaryKey(),
  tier: tierEnum('tier').notNull(),
  appraisedHype: doublePrecision('appraised_hype').notNull(),
  appraisedAt: timestamp('appraised_at', { withTimezone: true }).notNull(),
  appraisalExpiresAt: timestamp('appraisal_expires_at', { withTimezone: true }).notNull(),
  appraisalSource: text('appraisal_source').notNull(), // 'studio-mark' | 'chain-sync' | 'auction-comp'
  appraisalConfidence: doublePrecision('appraisal_confidence'), // 0-1; drives the displayed band
  metadataUri: text('metadata_uri').notNull(),
  imageUrl: text('image_url'),
  inPool: boolean('in_pool').notNull().default(false),
  machineId: integer('machine_id'),
  redeemed: boolean('redeemed').notNull().default(false),
  attributes: jsonb('attributes'),
}, (t) => ({
  byTier: index('vault_tier_pool_idx').on(t.tier, t.inPool),
}));

export const proofOfReserve = pgTable('proof_of_reserve', {
  id: text('id').primaryKey(),
  merkleRoot: text('merkle_root').notNull(),
  itemCount: integer('item_count').notNull(),
  totalAppraisedHype: doublePrecision('total_appraised_hype').notNull(),
  publishedTx: text('published_tx'),
  discrepancies: jsonb('discrepancies'),               // any Vault NFT without verified backing
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --------------------------------------------------------------------- gacha

export const machines = pgTable('machines', {
  machineId: integer('machine_id').primaryKey(),
  name: text('name').notNull(),
  priceHype: doublePrecision('price_hype').notNull(),   // box price in HYPE (mirror of chain priceWei)
  oddsPpm: jsonb('odds_ppm').notNull().$type<number[]>(),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  targetEvRatio: doublePrecision('target_ev_ratio').notNull().default(0.74),
});

export const seedChains = pgTable('seed_chains', {
  chainId: text('chain_id').primaryKey(),
  commit: text('commit').notNull(),
  startIndex: integer('start_index').notNull(),
  cursor: integer('cursor').notNull(),
  committedTx: text('committed_tx'),
  encryptedBlobRef: text('encrypted_blob_ref').notNull(), // KMS-wrapped chain location
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const draws = pgTable('draws', {
  drawId: integer('draw_id').primaryKey(),
  user: text('user').notNull(),
  machineId: integer('machine_id').notNull(),
  clientSeed: text('client_seed').notNull(),
  seedIndex: integer('seed_index').notNull(),
  serverSeed: text('server_seed'),                     // null until settled
  priorCommit: text('prior_commit'),
  status: drawStatus('status').notNull().default('pending'),
  wonTier: integer('won_tier'),
  wonTokenId: integer('won_token_id'),
  settleTx: text('settle_tx'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (t) => ({
  byUser: index('draws_user_idx').on(t.user, t.openedAt),
  byStatus: index('draws_status_idx').on(t.status),
}));

/** Every desk purchase. daily-buyback.ts nets these against the day's gross. */
export const deskTrades = pgTable('desk_trades', {
  certId: integer('cert_id').notNull(),
  seller: text('seller').notNull(),
  navHype: doublePrecision('nav_hype').notNull(),
  bidHype: doublePrecision('bid_hype').notNull(),
  acquireTx: text('acquire_tx').primaryKey(),
  payTx: text('pay_tx').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deskBuybacksLegacy = pgTable('desk_buybacks_legacy', {
  id: text('id').primaryKey(),
  tokenId: integer('token_id').notNull(),
  seller: text('seller').notNull(),
  appraisedHype: doublePrecision('appraised_hype').notNull(),
  paidHype: doublePrecision('paid_hype').notNull(),    // 80% of mark
  txHash: text('tx_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------- users and compliance

export const users = pgTable('users', {
  address: text('address').primaryKey(),
  kyc: kycStatus('kyc').notNull().default('none'),
  kycProviderRef: text('kyc_provider_ref'),
  countryCode: text('country_code'),
  blocked: boolean('blocked').notNull().default(false),
  blockReason: text('block_reason'),
  // Responsible-play controls. These are product requirements, not decoration —
  // a paid randomised draw with a cash-out needs them in any regulated market.
  dailySpendCapHype: doublePrecision('daily_spend_cap_hype'),
  selfExcludedUntil: timestamp('self_excluded_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const spendLedger = pgTable('spend_ledger', {
  id: text('id').primaryKey(),
  user: text('user').notNull(),
  amountHype: doublePrecision('amount_hype').notNull(),
  day: text('day').notNull(),                          // YYYY-MM-DD, for cap enforcement
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserDay: index('spend_user_day_idx').on(t.user, t.day),
}));

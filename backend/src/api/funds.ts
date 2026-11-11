import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { hypeBalance, hypeUsd, explorerAddress } from '../chain/elysium';

const FUNDS_FILE = path.join(process.env.HOME ?? '/home/amphora', 'amphora/series1/funds.json');

export async function fundsRoutes(app: FastifyInstance) {
  app.get('/public/funds', async () => {
    if (!fs.existsSync(FUNDS_FILE)) return { funds: [], reserveWallet: null };
    const cfg = JSON.parse(fs.readFileSync(FUNDS_FILE, 'utf8'));

    // The Reserve holds native HYPE. Auction houses invoice in fiat, so fund
    // targets stay in USD and the Reserve is valued at spot. That means a bar
    // can move DOWN when HYPE falls with no money having left — say so on the
    // page (policyNote) rather than letting it look like a withdrawal.
    const reserveHype = (await hypeBalance(cfg.reserveWallet)) ?? 0;
    const px = await hypeUsd();
    const reserveUsd = px ? reserveHype * px : 0;

    // Funds fill in sequence: the whole reserve pours into the lowest unfilled
    // fund, then overflows to the next.
    let remaining = reserveUsd;
    const funds = cfg.funds.map((f: any) => {
      const raised = Math.min(remaining, f.targetUsd);
      remaining = Math.max(0, remaining - f.targetUsd);
      const pct = f.targetUsd ? Math.min(100, (raised / f.targetUsd) * 100) : 0;
      const derived = f.status === 'WON' || f.status === 'OUTBID' || f.status === 'BIDDING'
        ? f.status
        : (pct >= 100 ? 'FUNDED' : (raised > 0 ? 'FILLING' : 'QUEUED'));
      return { ...f, raisedUsd: Number(raised.toFixed(2)), pct: Number(pct.toFixed(1)), status: derived };
    });

    return {
      reserveWallet: cfg.reserveWallet,
      reserveHype,
      hypeUsd: px,
      reserveUsd: Number(reserveUsd.toFixed(2)),
      priceStale: px == null,
      policyNote: cfg.policyNote,
      explorerUrl: explorerAddress(cfg.reserveWallet),
      funds,
      ledger: cfg.ledger ?? [],
      updatedAt: new Date().toISOString(),
    };
  });
}

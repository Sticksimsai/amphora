/**
 * Odds solver and pool health monitor.
 *
 * The published odds are fixed on-chain, but the ACTUAL expected value drifts as
 * inventory changes — if the Original tier empties out and refills with items at
 * the bottom of its band, real EV falls below what you advertised. That is the
 * failure mode that gets a gacha operator accused of fraud, and it happens through
 * neglect rather than malice.
 *
 * These functions (a) derive odds for a target EV when configuring a machine, and
 * (b) continuously check that live inventory still delivers the advertised EV.
 */

export interface TierSpec {
  name: string;
  floorHype: number;   // nominal floor value for the tier
}

export interface SolvedMachine {
  priceHype: number;
  targetEvRatio: number;
  alpha: number;
  tiers: Array<{ name: string; floorHype: number; probability: number; oddsPpm: number; evContribution: number }>;
  expectedValueHype: number;
  actualEvRatio: number;
}

/**
 * Solve tier probabilities for a target EV using a power-law rarity decay:
 *
 *     p_i ∝ v_i^(-alpha)
 *
 * A single scalar `alpha` controls how steeply rarity falls with value, and we
 * bisect on it to hit the EV target exactly. This produces odds that feel natural
 * to players (commons common, grails vanishingly rare) rather than a set of
 * arbitrary numbers reverse-engineered to a spreadsheet.
 */
export function solveOdds(
  priceHype: number,
  tiers: TierSpec[],
  targetEvRatio = 0.88,
): SolvedMachine {
  const target = priceHype * targetEvRatio;
  const values = tiers.map((t) => t.floorHype);

  const evAt = (alpha: number) => {
    const w = values.map((v) => Math.pow(v, -alpha));
    const s = w.reduce((a, b) => a + b, 0);
    return values.reduce((acc, v, i) => acc + (w[i] / s) * v, 0);
  };

  // Bisection. alpha=0 gives uniform odds (max EV); large alpha concentrates on
  // the cheapest tier (min EV). The target must lie between them.
  let lo = 0.001, hi = 12;
  if (evAt(hi) > target) throw new Error(`Target EV $${target} unreachable — lowest tier floor is too high`);
  if (evAt(lo) < target) throw new Error(`Target EV $${target} unreachable — even uniform odds fall short`);

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (evAt(mid) > target) lo = mid; else hi = mid;
  }
  const alpha = (lo + hi) / 2;

  const w = values.map((v) => Math.pow(v, -alpha));
  const s = w.reduce((a, b) => a + b, 0);
  const probs = w.map((x) => x / s);

  // Convert to ppm and force the sum to exactly 1_000_000 — the contract rejects
  // anything else. Absorb rounding into the largest tier so the rare tiers keep
  // their exact advertised odds.
  const ppm = probs.map((p) => Math.round(p * 1_000_000));
  const drift = 1_000_000 - ppm.reduce((a, b) => a + b, 0);
  const largest = ppm.indexOf(Math.max(...ppm));
  ppm[largest] += drift;

  const ev = ppm.reduce((acc, p, i) => acc + (p / 1_000_000) * values[i], 0);

  return {
    priceHype,
    targetEvRatio,
    alpha,
    tiers: tiers.map((t, i) => ({
      name: t.name,
      floorHype: t.floorHype,
      probability: ppm[i] / 1_000_000,
      oddsPpm: ppm[i],
      evContribution: (ppm[i] / 1_000_000) * t.floorHype,
    })),
    expectedValueHype: ev,
    actualEvRatio: ev / priceHype,
  };
}

export interface PoolHealth {
  machineId: number;
  advertisedEvHype: number;
  liveEvHype: number;
  evDeltaRatio: number;
  tiers: Array<{ tier: number; depth: number; meanValueHype: number; floorHype: number; healthy: boolean }>;
  alerts: string[];
}

/**
 * Compare advertised EV against what the inventory actually delivers.
 *
 * Two independent alarms:
 *   - DEPTH: a tier below 5 items means the next draw into it is nearly
 *     deterministic, and an empty tier silently downgrades the winner.
 *   - VALUE: a tier whose mean appraisal has drifted below its advertised floor
 *     means you are shipping less than you promised, regardless of odds.
 */
export function assessPoolHealth(
  machineId: number,
  priceHype: number,
  oddsPpm: number[],
  tierFloors: number[],
  inventory: Array<{ tier: number; appraisedHype: number }>,
  minDepth = 5,
): PoolHealth {
  const alerts: string[] = [];
  const tiers = oddsPpm.map((_, t) => {
    const items = inventory.filter((i) => i.tier === t);
    const depth = items.length;
    const meanValueHype = depth ? items.reduce((a, i) => a + i.appraisedHype, 0) / depth : 0;
    const healthy = depth >= minDepth && meanValueHype >= tierFloors[t];

    if (depth === 0 && oddsPpm[t] > 0) {
      alerts.push(`CRITICAL: tier ${t} is empty — draws will silently downgrade to a lower tier`);
    } else if (depth < minDepth && oddsPpm[t] > 0) {
      alerts.push(`WARN: tier ${t} depth is ${depth}, below the minimum of ${minDepth}`);
    }
    if (depth && meanValueHype < tierFloors[t]) {
      alerts.push(
        `WARN: tier ${t} mean appraisal $${meanValueHype.toFixed(0)} is below its advertised floor $${tierFloors[t]}`,
      );
    }
    return { tier: t, depth, meanValueHype, floorHype: tierFloors[t], healthy };
  });

  const advertisedEvHype = oddsPpm.reduce((a, p, i) => a + (p / 1e6) * tierFloors[i], 0);
  const liveEvHype = tiers.reduce((a, t, i) => a + (oddsPpm[i] / 1e6) * (t.depth ? t.meanValueHype : 0), 0);
  const evDeltaRatio = advertisedEvHype ? (liveEvHype - advertisedEvHype) / advertisedEvHype : 0;

  if (evDeltaRatio < -0.05) {
    alerts.push(
      `CRITICAL: live EV is ${(evDeltaRatio * 100).toFixed(1)}% below advertised. ` +
        'Pause the machine and restock before taking further draws.',
    );
  }

  return { machineId, advertisedEvHype, liveEvHype, evDeltaRatio, tiers, alerts };
}

/** The three launch machines, as specified in the plan. */
export const DEFAULT_MACHINES = [
  { machineId: 1, name: 'Studio Box', priceHype: 25,
    tiers: [ { name: 'Study', floorHype: 10 }, { name: 'Print', floorHype: 25 },
             { name: 'Edition', floorHype: 60 }, { name: 'Original', floorHype: 200 },
             { name: 'Grail', floorHype: 1000 } ] },
  { machineId: 2, name: 'Gallery Box', priceHype: 100,
    tiers: [ { name: 'Study', floorHype: 40 }, { name: 'Print', floorHype: 100 },
             { name: 'Edition', floorHype: 250 }, { name: 'Original', floorHype: 900 },
             { name: 'Grail', floorHype: 5000 } ] },
  { machineId: 3, name: 'Vault Box', priceHype: 500,
    tiers: [ { name: 'Study', floorHype: 200 }, { name: 'Print', floorHype: 500 },
             { name: 'Edition', floorHype: 1400 }, { name: 'Original', floorHype: 5000 },
             { name: 'Grail', floorHype: 25000 } ] },
] as const;

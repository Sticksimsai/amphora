/**
 * The published ladder, in HYPE. One source of truth.
 *
 *   npx tsx scripts/solveOdds.ts              uses BOX_PRICE_HYPE (default 0.5)
 *   npx tsx scripts/solveOdds.ts 0.4          a different box price
 *
 * The economics are RATIOS of the box price, so the ladder survives a reprice
 * unchanged: box 1.0x · Mortal 0.7x · Hero 2.1x · Olympian 7.0x, desk at 80%
 * of mark, EV 74%. Bands are degenerate (floor = cap = the mark): one numbered
 * unit of an edition per pull, no value roll.
 *
 * Prices are fixed in HYPE on-chain. If HYPE moves far enough that the box is
 * mispriced in fiat terms, reprice deliberately: run this, then
 * configureMachine, then scripts/reprice.ts to move every mark. Do all three or
 * none — a new box price against old marks changes the EV you have published.
 */
import 'dotenv/config';
import { parseEther, formatEther } from 'viem';

const BOX = String(process.argv[2] ?? process.env.BOX_PRICE_HYPE ?? '0.5');
const box = parseEther(BOX);

const CLASSES = [
  { name: 'Mortal',   slot: 1, ppm: 978_392, markBps: 7_000n,  edition: 300 },
  { name: 'Hero',     slot: 2, ppm: 19_608,  markBps: 21_000n, edition: 25 },
  { name: 'Olympian', slot: 3, ppm: 2_000,   markBps: 70_000n, edition: 5 },
];
const mark = (bps: bigint) => (box * bps) / 10_000n;
const desk = (m: bigint) => (m * 8_000n) / 10_000n;

const ppmSum = CLASSES.reduce((s, c) => s + c.ppm, 0);
if (ppmSum !== 1_000_000) throw new Error(`ppm sums to ${ppmSum}, contract requires exactly 1,000,000`);

const evWei = CLASSES.reduce((s, c) => s + (mark(c.markBps) * BigInt(c.ppm)) / 1_000_000n, 0n);
const h = (w: bigint) => Number(formatEther(w));

console.log(`\n=== The Amphora — box ${BOX} HYPE · EV ${h(evWei).toFixed(4)} HYPE (${((h(evWei) / h(box)) * 100).toFixed(2)}%)\n`);
for (const c of CLASSES) {
  const m = mark(c.markBps);
  console.log(
    `    ${c.name.padEnd(9)} edition ${String(c.edition).padStart(3)}   mark ${h(m).toFixed(4).padStart(8)}   desk ${h(desk(m)).toFixed(4).padStart(8)}` +
    `   ${(c.ppm / 1e4).toFixed(4).padStart(8)}%   ${c.ppm > 500_000 ? 'most pulls' : '1 in ' + Math.round(1e6 / c.ppm).toLocaleString()}`,
  );
}
const slots = (f: (c: (typeof CLASSES)[number]) => string) =>
  `[0,${CLASSES.map(f).join(',')},0]`;
console.log(`\n    cast send $GACHA_ADDRESS \\`);
console.log(`      "configureMachine(uint32,uint128,uint32[5],uint128[5],uint128[5])" \\`);
console.log(`      1 ${box} \\`);
console.log(`      "${slots((c) => String(c.ppm))}" \\`);
console.log(`      "${slots((c) => String(mark(c.markBps)))}" \\`);
console.log(`      "${slots((c) => String(mark(c.markBps)))}"`);
console.log(`\n    induction-list.csv marks (HYPE): ${CLASSES.map((c) => `${c.name} ${formatEther(mark(c.markBps))}`).join(' · ')}\n`);

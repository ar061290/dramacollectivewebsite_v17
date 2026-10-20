// Which pixels differ between two screenshots, and by how much: the worst 12, with their colours.
import { readFileSync } from 'node:fs';
import { decode } from '../lib/png.mjs';
import { DIST } from './_args.mjs';

const [a, b] = process.argv.slice(2).map((f) => decode(readFileSync(f)));
const n = a.width * a.height;
const hist = new Array(26).fill(0); // deltas in steps of 10
const worst = [];
for (let i = 0; i < n; i++) {
  const o = i * 4;
  const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
  if (d > 8) { hist[Math.min(25, Math.floor(d / 10))]++; worst.push([d, i % a.width, (i / a.width) | 0, [a.data[o], a.data[o + 1], a.data[o + 2]], [b.data[o], b.data[o + 1], b.data[o + 2]]]); }
}
worst.sort((x, y) => y[0] - x[0]);
console.log('differing pixels (>8):', worst.length, 'of', n);
console.log('delta histogram (10-wide bins):', hist.map((c, i) => (c ? `${i * 10}-${i * 10 + 9}:${c}` : null)).filter(Boolean).join('  '));
for (const [d, x, y, pa, pb] of worst.slice(0, 12)) console.log(`  Δ${String(d).padStart(3)} at (${x},${y})  before rgb(${pa})  after rgb(${pb})`);
// the neighbourhood of the worst pixel, before and after
const [, wx, wy] = worst[0] || [0, 0, 0];
const show = (img) => { let s = ''; for (let y = wy - 2; y <= wy + 2; y++) { for (let x = wx - 2; x <= wx + 2; x++) { const o = (y * img.width + x) * 4; s += String(img.data[o]).padStart(4); } s += '\n'; } return s; };
console.log('red channel around the worst pixel, before:\n' + show(a) + 'after:\n' + show(b));

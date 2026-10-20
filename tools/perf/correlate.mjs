#!/usr/bin/env node
// Does a deterministic counter track what the visitor feels? Takes every results file given and,
// for each bench and page, pairs each counter with each wall-clock measure across all the points
// (devices, CPU rates, networks, versions of the site) and reports Spearman's rank correlation.
// A counter that does not correlate with wall-clock time is a hill not worth climbing: drop it from
// the gate (tools/perf/gate.mjs) rather than optimise for it.
//
//   node tools/perf/correlate.mjs tools/perf/results/*-laptop*.json tools/perf/results/*-phone*.json
//   node tools/perf/correlate.mjs --bench idle,scroll tools/perf/results/*.json
import { readFileSync } from 'node:fs';

const files = []; const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { opts[argv[i].slice(2)] = argv[i + 1]; i++; } else files.push(argv[i]); }
if (!files.length) { console.error('usage: correlate.mjs [--bench a,b] <results.json...>'); process.exit(2); }
const benchFilter = opts.bench ? new Set(opts.bench.split(',')) : null;

const COUNTERS = ['calls', 'recalcStyleCount', 'layoutCount', 'mutations', 'requests', 'bytesKB', 'recalcsPerSec', 'layoutsPerSec', 'mutationsPerSec', 'recalcsPerScreen', 'layoutsPerScreen', 'mutationsPerScreen', 'longTasks', 'domNodes', 'scriptMs', 'taskMs'];
const WALL = ['curtainUpMs', 'readyMs', 'introDoneMs', 'frameAvgMs', 'frameP95Ms', 'busyPct', 'blockingMs', 'longTaskMs', 'clickToPartedMs', 'flipMs', 'scriptMsPerSec'];

const points = new Map(); // bench|page -> [{label, device, cpu, net, values}]
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  for (const e of r.benches) {
    if (benchFilter && !benchFilter.has(e.bench)) continue;
    const k = `${e.bench}|${e.page}`;
    if (!points.has(k)) points.set(k, []);
    const values = { ...e.agg };
    const calls = e.samples.find((s) => s.calls)?.calls.total; if (calls) values.calls = calls;
    points.get(k).push({ label: r.label, device: e.device, net: e.net, values });
  }
}

function spearman(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(n); let i = 0; while (i < n) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

for (const [k, pts] of points) {
  if (pts.length < 4) { console.log(`${k}: only ${pts.length} points (need 4+; add CPU rates, devices or versions)`); continue; }
  console.log(`\n${k}  (${pts.length} points: ${[...new Set(pts.map((p) => `${p.label}/${p.device}/${p.net}`))].join(', ')})`);
  const rows = [];
  for (const c of COUNTERS) {
    const have = pts.filter((p) => Number.isFinite(p.values[c]));
    if (have.length < 4 || new Set(have.map((p) => p.values[c])).size < 3) continue;
    for (const w of WALL) {
      const both = have.filter((p) => Number.isFinite(p.values[w]));
      if (both.length < 4 || new Set(both.map((p) => p.values[w])).size < 3) continue;
      const rho = spearman(both.map((p) => p.values[c]), both.map((p) => p.values[w]));
      if (rho === null) continue;
      rows.push([c, w, rho, both.length]);
    }
  }
  rows.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
  for (const [c, w, rho, n] of rows) console.log(`  ${c.padEnd(20)} vs ${w.padEnd(16)} ρ = ${rho >= 0 ? ' ' : ''}${rho.toFixed(2)}  (n=${n})  ${Math.abs(rho) >= 0.8 ? 'tracks' : Math.abs(rho) >= 0.5 ? 'weak' : 'does not track'}`);
}

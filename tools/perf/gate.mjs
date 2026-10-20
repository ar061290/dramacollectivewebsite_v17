#!/usr/bin/env node
// The gate: compares the latest results against the ratcheted baselines on the deterministic
// counters only (requests, bytes, style recalcs, layouts, DOM mutations, V8 call counts, WebGL
// contexts). Wall-clock numbers are printed for the reader but never fail the gate.
//
//   node tools/perf/gate.mjs                       # latest.json against tools/perf/baselines/gate.json
//   node tools/perf/gate.mjs --results <file>      # a specific results file
//   node tools/perf/gate.mjs --ratchet             # write the current counters as the new baseline
//                                                  # (after a win has shipped and the field agrees)
//
// Each baseline entry is { bench, page, device, net, counters: { name: max } }. A counter over its
// baseline by more than the tolerance fails. Counters that are zero in the baseline must stay zero.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((x) => x.length));
const resultsFile = typeof args.results === 'string' ? args.results : join(HERE, 'results', 'latest.json');
const baselineFile = join(HERE, 'baselines', 'gate.json');

/** The counters that gate, per bench, and the tolerance (a share of the baseline, plus an absolute slack). */
const GATES = {
  'home-load': { requests: [0, 0], bytesKB: [0.02, 8], recalcStyleCount: [0.1, 20], layoutCount: [0.1, 20], mutations: [0.1, 50], longTasks: [0, 2], contexts: [0, 0], calls: [0.05, 0] },
  'page-boot': { requests: [0, 0], bytesKB: [0.02, 8], recalcStyleCount: [0.1, 20], layoutCount: [0.1, 20], mutations: [0.1, 50], contexts: [0, 0], calls: [0.05, 0] },
  idle: { recalcsPerSec: [0.1, 2], layoutsPerSec: [0.1, 2], mutationsPerSec: [0.1, 2], longTasks: [0, 0], calls: [0.05, 0] },
  scroll: { recalcsPerScreen: [0.15, 5], layoutsPerScreen: [0.15, 5], mutationsPerScreen: [0.15, 10], longTasks: [0, 1], calls: [0.05, 0] },
  pointer: { recalcsPerSec: [0.15, 5], layoutsPerSec: [0.15, 5], mutationsPerSec: [0.15, 10], longTasks: [0, 1], calls: [0.05, 0] },
  theme: { requestsAfter: [0, 0], kbAfter: [0.02, 8], recalcStyleCount: [0.15, 10], layoutCount: [0.15, 10], longTasks: [0, 1] },
  nav: { requests: [0, 0], bytesKB: [0.02, 8] },
  recalc: { recalcsPerToggle: [0, 0.1], domNodes: [0.05, 20] },
  memory: { webglContexts: [0, 0], canvases: [0, 1], domNodes: [0.05, 20], listeners: [0.05, 10], geometries: [0, 0], textures: [0, 0], programs: [0, 0] },
};
const WALL = ['curtainUpMs', 'readyMs', 'introDoneMs', 'frameAvgMs', 'frameP95Ms', 'busyPct', 'scriptMsPerSec', 'clickToPartedMs', 'flipMs', 'longTaskMs'];

const results = JSON.parse(readFileSync(resultsFile, 'utf8'));
const key = (e) => `${e.bench}|${e.page}|${e.device}|${e.net}`;
const counterValue = (e, name) => (name === 'calls' ? (e.samples.find((s) => s.calls)?.calls.total ?? undefined) : e.agg[name]);

if (args.ratchet) {
  const baseline = { from: resultsFile, label: results.label, stamp: results.stamp, entries: [] };
  for (const e of results.benches) {
    const gates = GATES[e.bench]; if (!gates) continue;
    const counters = {};
    for (const name of Object.keys(gates)) { const v = counterValue(e, name); if (Number.isFinite(v)) counters[name] = v; }
    const wall = {}; for (const w of WALL) if (Number.isFinite(e.agg[w])) wall[w] = e.agg[w];
    baseline.entries.push({ bench: e.bench, page: e.page, device: e.device, net: e.net, counters, wall });
  }
  mkdirSync(dirname(baselineFile), { recursive: true });
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 1));
  console.log(`ratcheted ${baseline.entries.length} entries into ${baselineFile} from ${results.label} (${results.stamp})`);
  process.exit(0);
}

if (!existsSync(baselineFile)) { console.error(`no baseline yet: run with --ratchet after a baseline run`); process.exit(2); }
const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
const B = new Map(baseline.entries.map((e) => [key(e), e]));
let failures = 0, checks = 0;
console.log(`gate: ${results.label} (${results.stamp}) against baseline ${baseline.label} (${baseline.stamp})\n`);
for (const e of results.benches) {
  const b = B.get(key(e)); const gates = GATES[e.bench];
  if (!b || !gates) continue;
  const lines = [];
  for (const [name, [share, slack]] of Object.entries(gates)) {
    const was = b.counters[name]; const now = counterValue(e, name);
    if (!Number.isFinite(was) || !Number.isFinite(now)) continue;
    checks++;
    const limit = was + Math.max(was * share, slack);
    const ok = now <= limit;
    if (!ok) failures++;
    lines.push(`    ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(18)} ${String(was).padStart(9)} → ${String(now).padStart(9)}  (limit ${Math.round(limit * 100) / 100})`);
  }
  const wall = WALL.filter((w) => Number.isFinite(e.agg[w]) && Number.isFinite(b.wall?.[w])).map((w) => `${w} ${b.wall[w]}→${e.agg[w]}`).join(', ');
  console.log(`${e.bench}  ${e.page}  ${e.device}  ${e.net}${wall ? `   [wall: ${wall}]` : ''}`);
  console.log(lines.join('\n'));
}
console.log(`\n${checks} checks, ${failures} over the baseline`);
process.exit(failures ? 1 : 0);

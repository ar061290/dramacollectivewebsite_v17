#!/usr/bin/env node
// Compare two result files from run.mjs: medians side by side, the change, and whether it is
// outside the spread (median absolute deviation) of both runs.
//
//   node tools/perf/compare.mjs tools/perf/results/<before>.json tools/perf/results/<after>.json [--bench idle] [--metric busyPct,scriptMsPerSec]
import { readFileSync } from 'node:fs';

const [a, b, ...rest] = process.argv.slice(2);
if (!a || !b) { console.error('usage: compare.mjs before.json after.json [--bench x,y] [--metric m1,m2] [--page p1,p2]'); process.exit(2); }
const opts = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { opts[rest[i].slice(2)] = rest[i + 1]; i++; }
const only = (k) => (opts[k] ? new Set(opts[k].split(',')) : null);
const benches = only('bench'); const metrics = only('metric'); const pages = only('page');

const before = JSON.parse(readFileSync(a, 'utf8'));
const after = JSON.parse(readFileSync(b, 'utf8'));
const key = (e) => `${e.bench}|${e.page}|${e.device}|${e.net}`;
const A = new Map(before.benches.map((e) => [key(e), e]));

/** The metrics worth reading per bench, in order; everything else is in the files. */
const HEADLINE = {
  'home-load': ['curtainUpMs', 'bootMs', 'stageCodeMs', 'statueLoadedMs', 'fontsShadersMs', 'introDoneMs', 'morphReadyMs', 'fcpMs', 'longTasks', 'longTaskMs', 'longestTaskMs', 'blockingMs', 'requests', 'bytesKB', 'recalcStyleCount', 'layoutCount', 'mutations', 'scriptMs'],
  'page-boot': ['readyMs', 'bootMs', 'fontsMs', 'fcpMs', 'longTasks', 'longTaskMs', 'blockingMs', 'requests', 'bytesKB', 'recalcStyleCount', 'layoutCount', 'mutations', 'scriptMs', 'domNodes', 'contexts'],
  idle: ['busyPct', 'scriptMsPerSec', 'recalcsPerSec', 'layoutsPerSec', 'mutationsPerSec', 'longTasks', 'longFrames', 'frames', 'frameAvgMs'],
  scroll: ['screens', 'frames', 'frameAvgMs', 'frameP95Ms', 'frameMaxMs', 'framesOver33', 'framesOver100', 'busyPct', 'recalcsPerScreen', 'layoutsPerScreen', 'mutationsPerScreen', 'longTasks', 'longTaskMs', 'scriptMs'],
  pointer: ['frames', 'frameAvgMs', 'frameP95Ms', 'framesOver33', 'busyPct', 'recalcsPerSec', 'layoutsPerSec', 'mutationsPerSec', 'longTasks', 'scriptMs'],
  theme: ['flipMs', 'frameAvgMs', 'frameP95Ms', 'frameMaxMs', 'framesOver33', 'longTasks', 'longTaskMs', 'requestsAfter', 'kbAfter', 'recalcStyleCount', 'layoutCount'],
  nav: ['clickToNavMs', 'clickToPartedMs', 'nextReadyMs', 'nextFcpMs', 'requests', 'bytesKB', 'cachedRequests'],
  recalc: ['leafToggleMs', 'htmlToggleMs', 'bodyToggleMs', 'linkToggleMs', 'recalcsPerToggle', 'domNodes', 'layoutObjects'],
  memory: ['heapMB', 'domNodes', 'listeners', 'canvases', 'webglContexts', 'geometries', 'textures', 'programs'],
};

console.log(`before: ${before.label} (${before.stamp}, ${before.runs} runs)   after: ${after.label} (${after.stamp}, ${after.runs} runs)\n`);
let shown = 0;
for (const e of after.benches) {
  if (benches && !benches.has(e.bench)) continue;
  if (pages && !pages.has(e.page)) continue;
  const prev = A.get(key(e));
  if (!prev) continue;
  const names = (metrics ? [...metrics] : HEADLINE[e.bench] || Object.keys(e.agg).filter((k) => !k.endsWith('~') && !['runs', 'failed'].includes(k)));
  const rows = [];
  for (const m of names) {
    const x = prev.agg[m], y = e.agg[m];
    if (x === undefined && y === undefined) continue;
    const dx = prev.agg[`${m}~`] || 0, dy = e.agg[`${m}~`] || 0;
    const d = (y ?? 0) - (x ?? 0);
    const pct = x ? Math.round((d / Math.abs(x)) * 100) : null;
    const sig = Math.abs(d) > Math.max(dx, dy) * 1.5 && Math.abs(d) > 0 ? (d < 0 ? '▼' : '▲') : ' ';
    rows.push(`    ${m.padEnd(18)} ${String(x ?? '-').padStart(8)} ±${String(dx).padEnd(5)} → ${String(y ?? '-').padStart(8)} ±${String(dy).padEnd(5)}  ${sig} ${d > 0 ? '+' : ''}${Number.isFinite(d) ? Math.round(d * 100) / 100 : '-'}${pct !== null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`);
  }
  if (!rows.length) continue;
  console.log(`${e.bench}  ${e.page}  ${e.device}  ${e.net}`);
  console.log(rows.join('\n'));
  shown++;
}
if (!shown) console.log('nothing to compare (no matching bench/page/device/net in both files)');

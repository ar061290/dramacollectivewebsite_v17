#!/usr/bin/env node
// The Drama Collective's performance lab: benchmarks of the site's own user journeys, run in the
// installed Chrome (headless, real GPU) against the built site served the way GitHub Pages serves it.
//
//   node tools/perf/run.mjs                         # the default set on the laptop profile
//   node tools/perf/run.mjs --bench home-load --device phone --net 4g --runs 5
//   node tools/perf/run.mjs --bench idle,scroll --page publication,writers --device laptop-slow
//   node tools/perf/run.mjs --bench page-boot --page all --calls      # with V8 call counts (slower)
//   node tools/perf/run.mjs --root dist --base /dramacollectivewebsite_v18/   # as a project Pages site
//   node tools/perf/run.mjs --src                    # the unbundled source tree, as the live site is served today
//   node tools/perf/run.mjs --label before-sky-fix   # names the results file
//   node tools/perf/run.mjs --bench home-load --net 4g --h2  # HTTP/2 like GitHub Pages: use it for every network run
//
// Wall-clock numbers are reported as the median of --runs with their spread, and are never a gate:
// the deterministic counters (requests, bytes, style recalcs, layouts, DOM mutations, V8 call
// counts) are what tools/perf/gate.mjs compares against the baselines in tools/perf/baselines/.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, DEVICES } from './lib/chrome.mjs';
import { serve } from './lib/server.mjs';
import { BENCHES, PAGES } from './benches.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs || 3);
const devices = (args.device || 'laptop').split(',');
const nets = (args.net || 'none').split(',');
const benchNames = (args.bench || 'home-load,page-boot,idle,scroll,pointer,theme,nav,recalc,memory').split(',');
const pageKeys = args.page === 'all' ? Object.keys(PAGES) : (args.page || '').split(',').filter(Boolean);
const root = args.src ? REPO : isAbsolute(args.root || '') ? args.root : join(REPO, args.root || 'dist');
const base = args.base || '/';
const label = args.label || (args.src ? 'src' : 'dist');
const withCalls = !!args.calls;
const headless = !args.headed;
const h2 = !!args.h2; // HTTP/2 like GitHub Pages (recommended for any --net run)

if (!existsSync(join(root, 'index.html'))) { console.error(`no index.html under ${root}; run the build first (npm run build)`); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'results');
mkdirSync(outDir, { recursive: true });

const srv = await serve({ root, base, h2 });
const browser = await launch({ headless });
const results = { stamp, label, root, base, h2, chrome: browser.exe, runs, withCalls, benches: [] };
console.log(`lab: ${srv.url}  chrome: ${browser.exe}  runs: ${runs}  label: ${label}${withCalls ? '  (+V8 call counts)' : ''}`);

try {
  for (const device of devices) for (const net of nets) {
    // one warm-up page per device so the first measured load does not pay for the GPU process
    const warm = await browser.newPage();
    await warm.emulate({ device, network: 'none' });
    await warm.goto(`${srv.url}contact.html`, { timeout: 60000 });
    await warm.waitForMark('parted', { timeout: 20000 });
    await warm.close();

    for (const name of benchNames) {
      const bench = BENCHES[name];
      if (!bench) { console.error(`unknown bench ${name}; known: ${Object.keys(BENCHES).join(', ')}`); continue; }
      const pages = pageKeys.length ? pageKeys : bench.pages;
      for (const pageKey of pages) {
        const pageDef = PAGES[pageKey];
        if (!pageDef) { console.error(`unknown page ${pageKey}`); continue; }
        if (bench.skip?.(pageDef, device)) continue;
        const samples = [];
        for (let i = 0; i < runs; i++) {
          const page = await browser.newPage();
          try {
            await page.emulate({ device, network: net });
            await page.clearCache();
            if (withCalls) await page.callsStart();
            const sample = await bench.run({ page, url: `${srv.url}${pageDef.file}`, pageDef, device, net, withCalls, lab: { srv, browser } });
            if (withCalls) { sample.calls = await page.callsTake(); await page.callsStop(); }
            sample.consoleErrors = page.console.filter((c) => c.type === 'error').map((c) => c.text.slice(0, 200));
            sample.exceptions = page.errors.map((e) => e.slice(0, 200));
            samples.push(sample);
          } catch (err) {
            console.error(`  ${name}:${pageKey} run ${i + 1} failed: ${err.message}`);
            samples.push({ error: err.message });
          } finally {
            await page.close();
          }
        }
        const agg = aggregate(samples);
        const entry = { bench: name, page: pageKey, device, net, samples, agg };
        results.benches.push(entry);
        console.log(`${name.padEnd(10)} ${pageKey.padEnd(26)} ${device.padEnd(11)} ${net.padEnd(6)} ${bench.summarize ? bench.summarize(agg, samples) : JSON.stringify(agg)}`);
      }
    }
  }
} finally {
  await browser.close();
  await srv.close();
}

const file = join(outDir, `${stamp}-${label}.json`);
writeFileSync(file, JSON.stringify(results, null, 1));
writeFileSync(join(outDir, 'latest.json'), JSON.stringify(results, null, 1));
console.log(`\nwritten ${file}`);

// --- helpers ------------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; }
  }
  return o;
}

/** Median and spread (median absolute deviation) of every numeric field across the runs. */
function aggregate(samples) {
  const ok = samples.filter((s) => !s.error);
  const keys = new Set();
  for (const s of ok) for (const k of Object.keys(s)) if (typeof s[k] === 'number') keys.add(k);
  const agg = { runs: ok.length, failed: samples.length - ok.length };
  for (const k of keys) {
    const v = ok.map((s) => s[k]).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) continue;
    const med = v[Math.floor(v.length / 2)];
    const mad = v.map((x) => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(v.length / 2)];
    agg[k] = med;
    agg[`${k}~`] = mad;
  }
  return agg;
}

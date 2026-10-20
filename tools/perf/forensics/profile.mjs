// Where does a journey's main-thread time go, by function? Samples the page's JavaScript with the CPU
// profiler (every 200 us) through the boot or through the scroll bench's own scroll, and lists the
// functions by self time and by total time (their callees included), with their source.
//
//   node tools/perf/forensics/profile.mjs about.html --scroll [--device phone] [--dist <dir>] [--top 25] [--from 0.5]
//   node tools/perf/forensics/profile.mjs writers.html --boot [--device phone]
//   --from: start sampling once the page has been scrolled this many screens (to profile one section)
//   --save <file>: also write the raw profile (Chrome's .cpuprofile format: DevTools opens it)
//   --mark <name> [--settle <secs>]: wait for that dc: mark (and that long) before sampling a still page (the home page: --mark intro-done --settle 4)
//   --boot: sample from the navigation to the curtain parting (and --secs after it, half a second if not given), a warm-up load first
import { launch, sleep, DEVICES } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'about.html';
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const top = Number(flags.top || 25);
const from = Number(flags.from || 0);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  await page.send('Profiler.enable');
  await page.send('Profiler.setSamplingInterval', { interval: 200 });
  let t0 = Date.now();
  if (flags.boot) {
    // a warm-up load (the process, the HTTP cache and the GPU's shader cache as a visitor's second page has them)
    await page.goto(srv.url + file, { timeout: 60000 });
    await page.waitForMark(file.startsWith('index') ? 'curtain-up' : 'parted', { timeout: 60000 });
    await page.goto('about:blank');
    await page.send('Profiler.start');
    t0 = Date.now();
  }
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(String(flags.mark || (file.startsWith('index') ? 'curtain-up' : 'parted')), { timeout: 90000 });
  await sleep(flags.boot ? Number(flags.secs || 0.5) * 1000 : Number(flags.settle || 0.6) * 1000);
  const { width, height, touch } = DEVICES[device];
  const step = Math.round(height * 0.5);
  const drag = async () => { if (touch) await page.touchDrag({ x: Math.round(width / 2), y: Math.round(height * 0.75), distance: step }); else await page.wheel(width / 2, height / 2, step); await sleep(250); };
  if (flags.scroll && from > 0) while ((await page.evaluate('scrollY / innerHeight')) < from) await drag();
  if (!flags.boot) { await page.send('Profiler.start'); t0 = Date.now(); }
  if (flags.boot) { /* sampled already: the load itself */ } else if (flags.scroll) {
    const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
    for (let i = 0; i < Math.ceil(total / step) && (await page.evaluate('scrollY')) < total - 2; i++) await drag();
    await sleep(1500);
  } else await sleep(Number(flags.secs || 4) * 1000);
  const { profile } = await page.send('Profiler.stop');
  if (flags.save) { (await import('node:fs')).writeFileSync(String(flags.save), JSON.stringify(profile)); console.log(`profile saved to ${flags.save}`); }
  const wall = Date.now() - t0;
  // self time per node from the samples, then folded by function and source position
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (profile.timeDeltas[i + 1] ?? 0));
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => { const f = n.callFrame; return `${f.functionName || '(anonymous)'} ${String(f.url || '').replace(/^.*\//, '') || `(${f.url ? 'script' : 'native'})`}:${f.lineNumber + 1}:${f.columnNumber + 1}`; };
  const self = new Map(), total = new Map();
  for (const n of profile.nodes) {
    const us = dt.get(n.id) || 0;
    if (!us) continue;
    const k = key(n);
    self.set(k, (self.get(k) || 0) + us);
    // total: this node's self time counts once for every distinct function on its stack
    const seen = new Set();
    for (let id = n.id; id != null; id = parent.get(id)) { const kk = key(byId.get(id)); if (seen.has(kk)) continue; seen.add(kk); total.set(kk, (total.get(kk) || 0) + us); }
  }
  const ms = (us) => (us / 1000).toFixed(1).padStart(8);
  const sum = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`${file} (${device}${flags.boot ? ', its boot' : flags.scroll ? ', scrolled' + (from ? ` from ${from} screens` : '') : ', still'}): ${(sum / 1000).toFixed(0)} ms of samples in ${wall} ms`);
  console.log('  by self time:');
  for (const [k, us] of [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)|^\(garbage collector\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${ms(us)} ms  ${k}`);
  for (const k of ['(program)', '(garbage collector)']) { const us = [...self.entries()].filter(([kk]) => kk.startsWith(k)).reduce((a, [, v]) => a + v, 0); if (us) console.log(`  ${ms(us)} ms  ${k}`); }
  console.log('  by total time (with callees):');
  for (const [k, us] of [...total.entries()].filter(([k]) => !/^\(root\)|^\(idle\)|^\(program\)|^\(garbage collector\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${ms(us)} ms  ${k}`);
} finally {
  await browser.close();
  await srv.close();
}

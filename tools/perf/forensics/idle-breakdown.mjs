// Where does a still page's main thread go, by the browser's own steps? Traces a few seconds of a page
// standing still (the home page once its intro is done and it has settled) and sums the main thread's
// time by trace event, as self time (an event's time less the events inside it): script, style, layout,
// paint, the commit to the compositor, and so on; with how many of each and the average.
//
//   node tools/perf/forensics/idle-breakdown.mjs index.html [--device phone] [--dist <dir>] [--secs 2] [--js "<override>"]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'index.html';
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const secs = Number(flags.secs || 2);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file.startsWith('index') ? 'intro-done' : 'parted', { timeout: 90000 });
  await sleep(file.startsWith('index') ? 4000 : 2000);
  if (flags.js) { await page.evaluate(String(flags.js)); await sleep(500); }
  const events = [];
  page.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
  const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu', 'v8', 'toplevel', '__metadata'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  await sleep(secs * 1000);
  await page.send('Tracing.end');
  await done;

  const names = new Set();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.add(`${e.pid}:${e.tid}`);
  const count = new Map();
  for (const e of events) if (names.has(`${e.pid}:${e.tid}`) && e.ph === 'X') count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) || 0) + (e.dur || 0));
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const xs = events.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X' && e.dur > 0).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // self time: each event's duration less its direct children's (events nest as a stack on one thread)
  const self = new Map();
  const stack = [];
  const close = (until) => { while (stack.length && stack[stack.length - 1].end <= until) { const s = stack.pop(); const g = self.get(s.e.name) || { n: 0, us: 0 }; g.n++; g.us += s.e.dur - s.kids; self.set(s.e.name, g); } };
  let top = 0;
  for (const e of xs) {
    close(e.ts);
    if (stack.length) stack[stack.length - 1].kids += e.dur; else top += e.dur;
    stack.push({ e, end: e.ts + e.dur, kids: 0 });
  }
  close(Infinity);
  const wall = secs * 1000;
  console.log(`${file} (${device}), ${secs} s still${flags.js ? ', with an override' : ''}: the main thread busy ${(top / 1000).toFixed(0)} ms (${Math.round(top / 1000 / wall * 100)}%), by self time:`);
  for (const [k, g] of [...self.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, Number(flags.top || 22))) {
    console.log(`  ${(g.us / 1000).toFixed(1).padStart(8)} ms ${String(g.n).padStart(6)}x ${(g.us / g.n / 1000).toFixed(2).padStart(7)} ms each  ${k}`);
  }
} finally {
  await browser.close();
  await srv.close();
}

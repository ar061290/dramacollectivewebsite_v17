// What makes style dirty while a page scrolls, and when? Traces the scroll bench's own scroll with
// invalidation tracking and groups every style and layout invalidation by when it happened (in an
// animation-frame callback, in a scroll listener, or elsewhere: between frames, in input handling or
// the engine's own scroll steps), by its reason and element, and by the script that caused it.
// A recalculation forced in a scroll listener (ScrollTrigger reads the scroll position there) only
// costs anything when something dirtied style before it; this says what.
//
//   node tools/perf/forensics/scroll-invalidations.mjs about.html [--device phone] [--dist <dir>] [--top 14]
import { launch, sleep, DEVICES } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'about.html';
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const top = Number(flags.top || 14);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file.startsWith('index') ? 'intro-done' : 'parted', { timeout: 90000 });
  await sleep(1500);
  const events = [];
  page.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
  const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline.invalidationTracking', '__metadata'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  const { width, height, touch } = DEVICES[device];
  const step = Math.round(height * 0.5);
  const screens = Number(flags.screens || 6); // a few screens: invalidation tracking is heavy
  for (let i = 0; i < screens * 2; i++) {
    if (touch) await page.touchDrag({ x: Math.round(width / 2), y: Math.round(height * 0.75), distance: step });
    else await page.wheel(width / 2, height / 2, step);
    await sleep(250);
  }
  await sleep(500);
  await page.send('Tracing.end');
  await done;

  const names = new Set();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.add(`${e.pid}:${e.tid}`);
  const count = new Map();
  for (const e of events) if (e.name === 'FireAnimationFrame' && names.has(`${e.pid}:${e.tid}`)) count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) || 0) + 1);
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ev = events.filter((e) => `${e.pid}:${e.tid}` === main).sort((a, b) => a.ts - b.ts);
  const spans = ev.filter((e) => e.ph === 'X' && (e.name === 'FireAnimationFrame' || e.name === 'EventDispatch'));
  const fn = (f) => `${f.functionName || '(anonymous)'} ${String(f.url || '').replace(/^.*\//, '')}:${f.lineNumber}:${f.columnNumber}`;
  const where = (e) => {
    const s = spans.find((x) => e.ts >= x.ts && e.ts <= x.ts + (x.dur || 0));
    if (!s) return 'outside callbacks and events';
    return s.name === 'FireAnimationFrame' ? 'in an animation frame' : `in a ${s.args?.data?.type || '?'} event`;
  };
  const groups = new Map();
  let n = 0;
  for (const e of ev) {
    if (!e.name.endsWith('InvalidationTracking')) continue;
    n++;
    const d = e.args?.data || {};
    const what = d.reason || (d.changedClass && `class ${d.changedClass}`) || (d.changedAttribute && `attribute ${d.changedAttribute}`) || (d.changedPseudo && `pseudo ${d.changedPseudo}`) || (d.changedId && `id ${d.changedId}`) || '';
    const st = d.stackTrace?.length ? d.stackTrace.slice(0, 2).map(fn).join(' < ') : '(no script)';
    const k = `${where(e).padEnd(29)} ${e.name.replace('InvalidationTracking', '').padEnd(22)} ${String(d.nodeName || '').slice(0, 34).padEnd(34)} ${String(what).slice(0, 34).padEnd(34)} ${st}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  console.log(`${file} (${device}), ${screens} screens scrolled: ${n} invalidations`);
  for (const [k, c] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${String(c).padStart(5)}  ${k}`);
} finally {
  await browser.close();
  await srv.close();
}

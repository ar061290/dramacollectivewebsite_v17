// What does one piece of per-frame work cost a scroll? Scrolls a page the scroll bench's way twice in one
// browser, as it is and with an override applied in the page right after it is up (JavaScript, evaluated
// once), and compares main-thread time, style, layout, script and long tasks. The override may well look
// wrong: it prices the work, it is not a fix.
//
//   node tools/perf/forensics/scroll-ab.mjs about.html --device phone --js "window.dramaCollective.sky._collectMasks = () => {}" [--runs 2]
import { launch, sleep, DEVICES } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'about.html';
// --file-b <path>: the second arm loads another page from the same server (two builds under one root, a/ and b/: one origin, no bias between them)
const fileB = flags['file-b'] ? String(flags['file-b']) : file;
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const js = String(flags.js || '');
const runs = Number(flags.runs || 2);
const query = flags.query ? String(flags.query) : ''; // the page's address query for both arms (?flags=full)
const queryB = flags['query-b'] !== undefined ? String(flags['query-b']) : query; // or another for the second

const srv = await serve({ root, base: '/' });
// --dist-b <dir>: the second arm is another build (alternating with the first), its override applied too if given
const srvB = flags['dist-b'] ? await serve({ root: String(flags['dist-b']), base: '/' }) : srv;
const browser = await launch({ headless: true });
const one = async (override, q, server = srv, f = file) => {
  const page = await browser.newPage();
  try {
    await page.emulate({ device, network: 'none' });
    await page.goto(server.url + f + q, { timeout: 60000 });
    await page.waitForMark(/(^|\/)index/.test(f) ? 'intro-done' : 'parted', { timeout: 90000 });
    await sleep(1500);
    if (override && js) await page.evaluate(js);
    const { width, height, touch } = DEVICES[device];
    const step = Math.round(height * 0.5);
    const p0 = await page.probe();
    const m0 = await page.metrics();
    await page.frameStart();
    const t0 = Date.now();
    const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
    for (let i = 0; i < Math.ceil(total / step); i++) {
      if (touch) await page.touchDrag({ x: Math.round(width / 2), y: Math.round(height * 0.75), distance: step });
      else await page.wheel(width / 2, height / 2, step);
      await sleep(250);
    }
    await sleep(1500);
    const frames = await page.frameStop();
    const m1 = await page.metrics();
    const p1 = await page.probe();
    const wall = Date.now() - t0;
    const fs = frames.slice().sort((a, b) => a - b);
    return { avg: fs.reduce((a, b) => a + b, 0) / Math.max(1, fs.length), p95: fs[Math.floor(fs.length * 0.95)] || 0, slow: fs.filter((x) => x > 33.4).length, busy: (m1.taskMs - m0.taskMs) / wall * 100, script: m1.scriptMs - m0.scriptMs, style: m1.recalcStyleMs - m0.recalcStyleMs, layout: m1.layoutMs - m0.layoutMs, recalcs: m1.recalcStyleCount - m0.recalcStyleCount, layouts: m1.layoutCount - m0.layoutCount, long: p1.longTaskMs - p0.longTaskMs };
  } finally {
    await page.close();
  }
};
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
try {
  const res = { as: [], over: [] };
  for (let i = 0; i < runs; i++) {
    // alternately first, so that neither arm is always the one that runs on a warmer machine
    if (i % 2) { res.over.push(await one(true, queryB, srvB, fileB)); res.as.push(await one(false, query)); }
    else { res.as.push(await one(false, query)); res.over.push(await one(true, queryB, srvB, fileB)); }
  }
  const row = (name, list) => {
    const k = (f) => Math.round(med(list.map(f)));
    console.log(`  ${name.padEnd(15)} frames avg ${k((r) => r.avg)} ms, p95 ${k((r) => r.p95)}, over 33 ms ${k((r) => r.slow)} | busy ${k((r) => r.busy)}% | script ${k((r) => r.script)} ms | style ${k((r) => r.style)} ms (${k((r) => r.recalcs)}) | layout ${k((r) => r.layout)} ms (${k((r) => r.layouts)}) | long tasks ${k((r) => r.long)} ms`);
  };
  console.log(`${file}${query} (${device}), scrolled to the foot, median of ${runs}; second arm: ${fileB !== file ? fileB + ' ' : ''}${flags['dist-b'] ? 'build ' + flags['dist-b'] + ' ' : ''}${queryB !== query ? queryB + ' ' : ''}${js}`);
  row('as it is', res.as);
  row('second arm', res.over);
} finally {
  await browser.close();
  await srv.close();
  if (srvB !== srv) await srvB.close();
}

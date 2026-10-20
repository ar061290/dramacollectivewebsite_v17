// Who makes a page's boot lay the page out, and what does each layout cost? Traces a load (after a
// warm-up load, as a visitor's second page) from navigation to the curtain parting and a few seconds
// after, and groups every style recalculation and layout by what caused it: a script reading layout
// (with the functions on its stack) or the frame's own rendering. With the number of elements each
// recalculation restyled and the number of objects each layout laid out.
//
//   node tools/perf/forensics/boot-layout.mjs writers.html [--device phone] [--dist <dir>] [--after 3] [--top 16]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'writers.html';
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const after = Number(flags.after || 3);
const top = Number(flags.top || 16);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file.startsWith('index') ? 'curtain-up' : 'parted', { timeout: 60000 });
  await page.goto('about:blank');
  const events = [];
  page.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
  const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', '__metadata'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file.startsWith('index') ? 'curtain-up' : 'parted', { timeout: 60000 });
  const marks = await page.marks();
  await sleep(after * 1000);
  await page.send('Tracing.end');
  await done;

  const names = new Set();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.add(`${e.pid}:${e.tid}`);
  const count = new Map();
  for (const e of events) if ((e.name === 'Layout' || e.name === 'UpdateLayoutTree') && names.has(`${e.pid}:${e.tid}`)) count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) || 0) + 1);
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ev = events.filter((e) => `${e.pid}:${e.tid}` === main).sort((a, b) => a.ts - b.ts);
  const open = new Map();
  const xs = [];
  for (const e of ev) {
    if (e.ph === 'X') xs.push(e);
    else if (e.ph === 'B') { if (!open.has(e.name)) open.set(e.name, []); open.get(e.name).push(e); }
    else if (e.ph === 'E') { const st = open.get(e.name)?.pop(); if (st) xs.push({ ...st, ph: 'X', dur: e.ts - st.ts, args: { ...st.args, endData: e.args?.endData } }); }
  }
  const fn = (f) => `${f.functionName || '(anonymous)'} ${String(f.url || '').replace(/^.*\//, '')}:${f.lineNumber}:${f.columnNumber}`;
  const groups = new Map();
  const tot = { UpdateLayoutTree: [0, 0], Layout: [0, 0] };
  for (const e of xs) {
    if (e.name !== 'Layout' && e.name !== 'UpdateLayoutTree') continue;
    const ms = (e.dur || 0) / 1000;
    tot[e.name][0]++; tot[e.name][1] += ms;
    const st = e.args?.beginData?.stackTrace;
    const who = st?.length ? st.slice(0, Number(flags.depth || 3)).map(fn).join(' < ') : '(the frame’s own rendering)';
    const k = `${e.name.padEnd(16)} ${who}`;
    const g = groups.get(k) || { n: 0, ms: 0, size: 0 };
    g.n++; g.ms += ms;
    g.size += e.name === 'Layout' ? (e.args?.beginData?.dirtyObjects || 0) : (e.args?.elementCount || 0);
    groups.set(k, g);
  }
  console.log(`${file} (${device}), boot to ${after} s after the curtain: marks ${JSON.stringify(marks)}`);
  console.log(`  style ${tot.UpdateLayoutTree[0]}x ${tot.UpdateLayoutTree[1].toFixed(0)} ms, layout ${tot.Layout[0]}x ${tot.Layout[1].toFixed(0)} ms`);
  for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, top)) console.log(`  ${g.ms.toFixed(0).padStart(6)} ms ${String(g.n).padStart(4)}x (${Math.round(g.size / g.n)} each)  ${k}`);
} finally {
  await browser.close();
  await srv.close();
}

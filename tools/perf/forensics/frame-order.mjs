// In what order do a page's animation-frame callbacks run while it scrolls, and who forces style and
// layout? Traces the scroll bench's own scroll and, frame by frame, lists the requestAnimationFrame
// callbacks in the order they ran (by function and source), the scroll events dispatched before them,
// the style recalculations and layouts each one forced, and the recalculation the frame's own
// rendering still needed after them. A forced recalculation followed by more writes in the same frame
// is work done twice; one in the last callback is only work done early.
//
//   node tools/perf/forensics/frame-order.mjs about.html [--device phone] [--dist <dir>] [--frames 6] [--js "<override>"]
import { launch, sleep, DEVICES } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'about.html';
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const show = Number(flags.frames || 6);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file.startsWith('index') ? 'intro-done' : 'parted', { timeout: 90000 });
  await sleep(1500);
  if (flags.js) await page.evaluate(String(flags.js));
  const events = [];
  page.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
  const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', '__metadata'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  const { width, height, touch } = DEVICES[device];
  const step = Math.round(height * 0.5);
  const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
  for (let i = 0; i < Math.ceil(total / step); i++) {
    if (touch) await page.touchDrag({ x: Math.round(width / 2), y: Math.round(height * 0.75), distance: step });
    else await page.wheel(width / 2, height / 2, step);
    await sleep(250);
  }
  await sleep(800);
  await page.send('Tracing.end');
  await done;

  // the renderer's main thread: the one named CrRendererMain with the most animation frames
  const names = new Set();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') names.add(`${e.pid}:${e.tid}`);
  const count = new Map();
  for (const e of events) if (e.name === 'FireAnimationFrame' && names.has(`${e.pid}:${e.tid}`)) count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) || 0) + 1);
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) throw new Error('no animation frames on a renderer main thread');
  const ev = events.filter((e) => `${e.pid}:${e.tid}` === main && (e.ph === 'X' || e.ph === 'B' || e.ph === 'E')).sort((a, b) => a.ts - b.ts);
  // B/E pairs to complete events
  const open = new Map();
  const xs = [];
  for (const e of ev) {
    if (e.ph === 'X') xs.push(e);
    else if (e.ph === 'B') { if (!open.has(e.name)) open.set(e.name, []); open.get(e.name).push(e); }
    else { const st = open.get(e.name)?.pop(); if (st) xs.push({ ...st, ph: 'X', dur: e.ts - st.ts }); }
  }
  xs.sort((a, b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0));
  const fn = (d) => (d ? `${d.functionName || '(anonymous)'} ${String(d.url || '').replace(/^.*\//, '')}:${(d.lineNumber ?? -1) + 1}:${(d.columnNumber ?? -1) + 1}` : '?');
  const inside = (outer, e) => e.ts >= outer.ts && e.ts + (e.dur || 0) <= outer.ts + (outer.dur || 0) + 1;

  // walk the events: a frame ends with its paint
  const frames = [];
  const forcers = new Map();
  const fresh = () => ({ items: [], render: { style: 0, layout: 0 } });
  let cur = fresh();
  let encl = null; // the callback or event the walk is inside
  for (let i = 0; i < xs.length; i++) {
    const e = xs[i];
    if (encl && e.ts >= encl.ts + encl.dur) encl = null;
    // everything a callback did inside, by event name (nested events counted in each of their parents)
    if (encl && e.name !== 'FunctionCall' && inside(encl, e)) { const n = encl.nested.get(e.name) || { n: 0, ms: 0 }; n.n++; n.ms += (e.dur || 0) / 1000; encl.nested.set(e.name, n); if (e.name !== 'UpdateLayoutTree' && e.name !== 'Layout') continue; }
    // a script called outside the frame's callbacks and scroll events: a ResizeObserver's callback, a timer, another event
    if (e.name === 'FunctionCall' && !encl) {
      encl = { ts: e.ts, dur: e.dur || 0, kind: 'call', who: `other: ${fn(e.args?.data)}`, ms: (e.dur || 0) / 1000, style: 0, layout: 0, styleN: 0, layoutN: 0, nested: new Map() };
      cur.items.push(encl);
      continue;
    }
    if (e.name === 'FireAnimationFrame' || (e.name === 'EventDispatch' && e.args?.data?.type === 'scroll')) {
      let call = null;
      for (let j = i + 1; j < xs.length && xs[j].ts <= e.ts + (e.dur || 0); j++) if (xs[j].name === 'FunctionCall') { call = xs[j]; break; }
      encl = { ts: e.ts, dur: e.dur || 0, kind: e.name === 'FireAnimationFrame' ? 'raf' : 'scroll', who: e.name === 'FireAnimationFrame' ? fn(call?.args?.data) : 'scroll listeners', ms: (e.dur || 0) / 1000, style: 0, layout: 0, styleN: 0, layoutN: 0, nested: new Map() };
      cur.items.push(encl);
      continue;
    }
    if (e.name === 'UpdateLayoutTree' || e.name === 'Layout') {
      const ms = (e.dur || 0) / 1000;
      if (encl && inside(encl, e)) {
        if (e.name === 'Layout') { encl.layout += ms; encl.layoutN++; } else { encl.style += ms; encl.styleN++; }
        // who forced it, from the trace's stack
        const st = e.args?.beginData?.stackTrace;
        if (st?.length) { const k = `${encl.who.split(' ')[0]}: ${e.name} < ${st.slice(0, 3).map((f) => fn(f)).join(' < ')}`; const g = forcers.get(k) || { n: 0, ms: 0, els: 0 }; g.n++; g.ms += ms; g.els += e.args?.elementCount || 0; forcers.set(k, g); }
      } else if (e.name === 'Layout') cur.render.layout += ms;
      else cur.render.style += ms;
      continue;
    }
    if (e.name === 'Paint' || e.name === 'PrePaint') {
      if (cur.items.length || cur.render.style) { frames.push(cur); cur = fresh(); }
    }
  }
  const real = frames.filter((f) => f.items.some((it) => it.kind === 'raf'));

  // per callback: how many frames, its position, its time and what it forced
  const per = new Map();
  for (const f of real) {
    const rafs = f.items.filter((it) => it.kind === 'raf');
    for (const it of f.items) {
      const g = per.get(it.who) || { n: 0, ms: 0, style: 0, styleN: 0, layout: 0, layoutN: 0, pos: 0, last: 0, dupe: 0, dupeMs: 0, nested: new Map() };
      for (const [k, v] of it.nested) { const x = g.nested.get(k) || { n: 0, ms: 0 }; x.n += v.n; x.ms += v.ms; g.nested.set(k, x); }
      g.n++; g.ms += it.ms; g.style += it.style; g.styleN += it.styleN; g.layout += it.layout; g.layoutN += it.layoutN;
      if (it.kind === 'raf') { const at = rafs.indexOf(it); g.pos += at; if (at === rafs.length - 1) g.last++; }
      // forced here, and the frame's rendering still had style to do afterwards: written again after it
      if (it.styleN && f.render.style > 0.05) { g.dupe++; g.dupeMs += f.render.style; }
      per.set(it.who, g);
    }
  }
  console.log(`${file} (${device}), scrolled to the foot${flags.js ? `, with ${flags.js}` : ''}: ${real.length} frames with callbacks`);
  console.log(`  ${'callback (by mean position in the frame)'.padEnd(56)} frames  pos  last  time ms  forced style ms (n)  forced layout ms (n)  restyled after (frames, ms)`);
  for (const [k, g] of [...per.entries()].sort((a, b) => a[1].pos / a[1].n - b[1].pos / b[1].n)) {
    console.log(`  ${k.slice(0, 56).padEnd(56)} ${String(g.n).padStart(6)} ${(g.pos / g.n).toFixed(1).padStart(4)} ${String(g.last).padStart(5)} ${g.ms.toFixed(0).padStart(8)} ${`${g.style.toFixed(0)} (${g.styleN})`.padStart(20)} ${`${g.layout.toFixed(0)} (${g.layoutN})`.padStart(21)}  ${g.dupe}, ${g.dupeMs.toFixed(0)}`);
  }
  for (const [k, g] of per) if (g.ms > 500) console.log(`  inside ${k.split(' ')[0]}: ` + [...g.nested.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10).map(([n, v]) => `${n} ${v.ms.toFixed(0)} ms (${v.n})`).join(', '));
  console.log('  forced by (top of the stack):');
  for (const [k, g] of [...forcers.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) console.log(`   ${g.ms.toFixed(0).padStart(6)} ms (${g.n}, ${(g.ms / g.n).toFixed(2)} ms and ${Math.round(g.els / g.n)} elements each)  ${k}`);
  const rs = real.reduce((a, f) => a + f.render.style, 0);
  const rl = real.reduce((a, f) => a + f.render.layout, 0);
  const weight = (f) => f.items.reduce((s, it) => s + it.ms, 0) + f.render.style + f.render.layout;
  const all = real.reduce((a, f) => a + weight(f), 0);
  const styleAll = rs + [...per.values()].reduce((a, g) => a + g.style, 0);
  console.log(`  the frames' own rendering: style ${rs.toFixed(0)} ms, layout ${rl.toFixed(0)} ms`);
  console.log(`  in all: callbacks and rendering style and layout ${all.toFixed(0)} ms (${(all / real.length).toFixed(2)} ms a frame); all style ${styleAll.toFixed(0)} ms`);
  console.log(`  the ${show} heaviest frames:`);
  for (const f of real.slice().sort((a, b) => weight(b) - weight(a)).slice(0, show)) {
    console.log('   ' + f.items.map((it) => `${it.who.split(' ')[0]} ${it.ms.toFixed(1)}${it.styleN ? ` [style ${it.style.toFixed(1)}]` : ''}${it.layoutN ? ` [layout ${it.layout.toFixed(1)}]` : ''}`).join(' > ') + ` | render style ${f.render.style.toFixed(1)} layout ${f.render.layout.toFixed(1)}`);
  }
} finally {
  await browser.close();
  await srv.close();
}

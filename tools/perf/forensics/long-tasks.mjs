// What are a page's long tasks during a journey? Traces the page from the curtain parting through the
// scroll bench's own scroll (touch drags on the phone) and lists every main-thread task over 50 ms with
// the script that ran in it (the top-level function and its source line) and what else it spent its
// time on (style, layout, paint, compile, GC), in time order.
//
//   node tools/perf/forensics/long-tasks.mjs about.html [--device phone] [--dist <dir>] [--scroll] [--min 50]
import { launch, sleep, DEVICES } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const file = positional[0] || 'about.html';
const device = String(flags.device || 'phone');
const root = String(flags.dist || DIST);
const min = Number(flags.min || 50);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  const events = [];
  const names = new Map(); // pid:tid -> thread name
  page.on('Tracing.dataCollected', (p) => { for (const e of p.value) { if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name); else if (e.ph === 'X' && (e.dur || 0) >= 1000 && e.tid) events.push(e); } });
  const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  await page.goto(srv.url + file, { timeout: 60000 });
  await page.waitForMark(file.startsWith('index') ? 'curtain-up' : 'parted', { timeout: 60000 });
  const parted = await page.evaluate(`(performance.getEntriesByName('dc:parted')[0] || performance.getEntriesByName('dc:curtain-up')[0] || { startTime: 0 }).startTime`);
  await sleep(600);
  const scrollFrom = await page.evaluate('performance.now()');
  if (flags.scroll) {
    const { width, height, touch } = DEVICES[device];
    const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
    const step = Math.round(height * 0.5);
    for (let i = 0; i < Math.ceil(total / step); i++) {
      if (touch) await page.touchDrag({ x: Math.round(width / 2), y: Math.round(height * 0.75), distance: step });
      else await page.wheel(width / 2, height / 2, step);
      await sleep(250);
    }
  } else await sleep(6000);
  const scrollTo = await page.evaluate('performance.now()');
  await sleep(1500);
  await page.send('Tracing.end');
  await done;
  // the page's main thread: the thread of its RunTask events that carry the most time
  const tasks = events.filter((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask');
  // the page's main thread: the renderer main thread that ran the most of this page's own scripts
  const ours = new Map();
  for (const e of events) if (e.name === 'FunctionCall' && String(e.args?.data?.url || '').startsWith(srv.url.replace(/\/$/, ''))) ours.set(`${e.pid}:${e.tid}`, (ours.get(`${e.pid}:${e.tid}`) || 0) + 1);
  const main = [...ours.entries()].filter(([k]) => /CrRendererMain/.test(names.get(k) || 'CrRendererMain')).sort((a, b) => b[1] - a[1])[0]?.[0];
  const navStart = events.find((e) => e.name === 'navigationStart' || e.name === 'NavigationTiming')?.ts;
  const inMain = (e) => `${e.pid}:${e.tid}` === main;
  // the outer of two nested task events only (Chrome records RunTask inside ThreadControllerImpl::RunTask)
  const long = tasks.filter((t) => inMain(t) && t.dur >= min * 1000).sort((a, b) => a.ts - b.ts || b.dur - a.dur)
    .filter((t, i, all) => !all.slice(0, i).some((o) => o.ts <= t.ts && t.ts + t.dur <= o.ts + o.dur));
  const totals = new Map();
  const t0 = long.length ? Math.min(...events.filter(inMain).map((e) => e.ts)) : 0;
  console.log(`${file} (${device}${flags.scroll ? ', scrolled' : ', still'}): ${long.length} tasks over ${min} ms on the page's thread; parted @${Math.round(parted)} ms, the journey from @${Math.round(scrollFrom)} to @${Math.round(scrollTo)} ms (page clock)`);
  for (const t of long) {
    const inside = events.filter((e) => inMain(e) && e !== t && e.ts >= t.ts && e.ts + (e.dur || 0) <= t.ts + t.dur);
    const calls = inside.filter((e) => e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.compile' || e.name === 'TimerFire' || e.name === 'FireAnimationFrame' || e.name === 'EventDispatch');
    const fn = calls.filter((e) => e.name === 'FunctionCall').sort((a, b) => b.dur - a.dur)[0];
    const what = fn ? `${fn.args?.data?.functionName || '(anonymous)'} ${String(fn.args?.data?.url || '').replace(/^.*\//, '')}:${(fn.args?.data?.lineNumber ?? 0)}` : (calls[0] ? calls[0].name : '(no script)');
    const kinds = {};
    for (const e of inside) if (['UpdateLayoutTree', 'Layout', 'Paint', 'v8.compile', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'Decode Image', 'ParseHTML', 'EvaluateScript', 'v8.run'].includes(e.name)) kinds[e.name] = (kinds[e.name] || 0) + e.dur / 1000;
    const g = totals.get(what) || { n: 0, ms: 0 }; g.n++; g.ms += t.dur / 1000; totals.set(what, g);
    const at = Math.round((t.ts - t0) / 1000);
    if (!flags.quiet) console.log(`  @${String(at).padStart(6)} ms  ${String(Math.round(t.dur / 1000)).padStart(5)} ms  ${what.slice(0, 70).padEnd(70)}  ${Object.entries(kinds).filter(([, v]) => v >= 5).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  }
  console.log(`  by what ran (${long.length} tasks, ${Math.round(long.reduce((a, t) => a + t.dur, 0) / 1000)} ms):`);
  for (const [w, g] of [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) console.log(`    ${String(Math.round(g.ms)).padStart(6)} ms in ${String(g.n).padStart(3)}  ${w}`);
} finally {
  await browser.close();
  await srv.close();
}

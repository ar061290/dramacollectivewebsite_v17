// Who forces style and layout while a page stands still? Traces a few seconds of stillness and groups
// every style recalculation (UpdateLayoutTree) and layout by what triggered it: a script reading
// layout or style synchronously (with the function that did, from the trace's stack) or the frame's
// own rendering (no stack). With --why, also which elements were invalidated and why.
//
//   node tools/perf/forensics/forced-style.mjs contact.html [--device phone] [--dist <dir>] [--secs 2]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const pages = (positional[0] || 'contact.html').split(',');
const device = String(flags.device || 'laptop');
const root = String(flags.dist || DIST);
const secs = Number(flags.secs || 2);

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  for (const file of pages) {
    const page = await browser.newPage();
    try {
      await page.emulate({ device, network: 'none' });
      await page.goto(srv.url + file, { timeout: 60000 });
      if (file === 'index.html') await page.waitForMark('intro-done', { timeout: 90000 });
      else await page.waitForMark('parted', { timeout: 60000 });
      await sleep(1500);
      const events = [];
      const off = page.on('Tracing.dataCollected', (p) => { for (const e of p.value) if (e.name === 'UpdateLayoutTree' || e.name === 'Layout' || e.name === 'Animation' || e.name.endsWith('InvalidationTracking')) events.push(e); });
      const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
      await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'blink.animations', ...(flags.why ? ['disabled-by-default-devtools.timeline.invalidationTracking'] : [])], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
      await sleep(secs * 1000);
      await page.send('Tracing.end');
      await done;
      off?.();
      const groups = new Map();
      let total = { UpdateLayoutTree: 0, Layout: 0 };
      for (const e of events) {
        if (e.name === 'Animation') continue;
        if (e.name.endsWith('InvalidationTracking')) { const d = e.args?.data || {}; const k = `invalidated ${String(d.nodeName || '?').slice(0, 40)} : ${d.reason || d.invalidationList?.map((x) => x.classes || x.id || x.tagName || x.attribute).join('/') || e.name}`; const g = groups.get(k) || { n: 0, ms: 0 }; g.n++; groups.set(k, g); continue; }
        if (e.ph !== 'X' && e.ph !== 'B') continue;
        total[e.name]++;
        const stack = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace || null;
        const top = stack && stack.length ? stack.slice(0, 3).map((f) => `${f.functionName || '(anonymous)'} ${String(f.url || '').replace(/^.*\//, '')}:${f.lineNumber + 1}`).join(' < ') : '(the frame’s own rendering, no script)';
        const k = `${e.name.padEnd(16)} ${top}`;
        const g = groups.get(k) || { n: 0, ms: 0 };
        g.n++; g.ms += (e.dur || 0) / 1000;
        groups.set(k, g);
      }
      console.log(`== ${file} (${device}), ${secs} s still: ${total.UpdateLayoutTree} style recalcs, ${total.Layout} layouts`);
      for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) console.log(`   ${String(g.n).padStart(4)}x ${g.ms.toFixed(1).padStart(6)} ms  ${k}`);
    } catch (err) {
      console.log(`== ${file}: FAILED ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await srv.close();
}

// What keeps a still page's thread awake? Any requestAnimationFrame loop makes the page produce a frame,
// and in every such frame Chrome refreshes the style of every running animation, composited or not
// (a transform animation that would otherwise cost the page's thread nothing). Traces a few seconds
// of stillness and lists the callbacks that ran (animation frames, timers, events) by function and
// source line, with how often and how long, plus the animations running.
//
//   node tools/perf/forensics/idle-loops.mjs pieces.html,contact.html [--device phone] [--dist <dir>] [--secs 2]
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
      const anims = await page.evaluate(`document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const t = a.effect && a.effect.target; return (t ? t.tagName.toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(' ')[0] : '?') + ' ' + (a.animationName || a.transitionProperty || 'web-animation'); })`);
      const events = [];
      const off = page.on('Tracing.dataCollected', (p) => { for (const e of p.value) if (e.name === 'FunctionCall' || e.name === 'FireAnimationFrame' || e.name === 'TimerFire' || e.name === 'EventDispatch') events.push(e); });
      const done = new Promise((res) => { page.on('Tracing.tracingComplete', () => res()); });
      await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
      await sleep(secs * 1000);
      await page.send('Tracing.end');
      await done;
      off?.();
      // each FunctionCall nested in a FireAnimationFrame / TimerFire / EventDispatch takes that kind
      const spans = events.filter((e) => e.name !== 'FunctionCall' && e.ph === 'X').map((e) => ({ kind: e.name, ts: e.ts, end: e.ts + (e.dur || 0), type: e.args?.data?.type }));
      const groups = new Map();
      let rafs = 0;
      for (const e of events) if (e.name === 'FireAnimationFrame' && e.ph === 'X') rafs++;
      for (const e of events) {
        if (e.name !== 'FunctionCall' || e.ph !== 'X') continue;
        const d = e.args?.data || {};
        const host = spans.find((s) => s.ts <= e.ts && e.ts <= s.end);
        const kind = host ? (host.kind === 'FireAnimationFrame' ? 'rAF' : host.kind === 'TimerFire' ? 'timer' : `event ${host.type || ''}`) : 'other';
        const k = `${kind.padEnd(12)} ${d.functionName || '(anonymous)'} ${String(d.url || '').replace(/^.*\//, '')}:${(d.lineNumber ?? -1) + 1}:${(d.columnNumber ?? -1) + 1}`;
        const g = groups.get(k) || { n: 0, ms: 0 };
        g.n++; g.ms += (e.dur || 0) / 1000;
        groups.set(k, g);
      }
      console.log(`== ${file} (${device}), ${secs} s still: ${rafs} animation-frame callbacks fired; ${anims.length} animations running${anims.length ? ': ' + anims.join(' | ') : ''}`);
      for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) console.log(`   ${String(g.n).padStart(4)}x ${g.ms.toFixed(1).padStart(6)} ms  ${k}`);
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

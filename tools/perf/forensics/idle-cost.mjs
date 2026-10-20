// What does one thing cost a page while it stands still? Measures a few seconds of stillness, then
// applies a CSS override (e.g. one element's animation switched off) and measures again, in the same
// page, so the difference is that thing's cost. Also lists the animations running on the page.
//
//   node tools/perf/forensics/idle-cost.mjs pieces.html,contact.html --device phone \
//     --css ".music-toggle .bar { animation: none !important; transition: none !important; }" [--dist <dir>] [--secs 3] [--query ?flags=x]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, parse } from './_args.mjs';

const { flags, positional } = parse();
const pages = (positional[0] || 'pieces.html').split(',');
const device = String(flags.device || 'laptop');
const css = String(flags.css || '.music-toggle .bar, .music-toggle .bar rect { animation: none !important; transition: none !important; }');
const secs = Number(flags.secs || 3);
const root = String(flags.dist || DIST);
const query = flags.query ? String(flags.query) : ''; // e.g. ?flags=compositor-bars

const ANIMS = `(() => document.getAnimations().map((a) => {
  const t = a.effect && a.effect.target;
  const where = t ? (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\\s+/).slice(0, 2).join('.') : (t.className && t.className.baseVal ? '.' + t.className.baseVal.split(' ')[0] : ''))) : '?';
  return where + ' ' + (a.animationName || a.transitionProperty || a.constructor.name) + ' ' + a.playState;
}))()`;

async function still(page) {
  // no in-page frame counter: its requestAnimationFrame loop would keep the page producing frames
  // and so refresh every running animation's style, the very cost being measured
  const p0 = await page.probe();
  const m0 = await page.metrics();
  const t0 = Date.now();
  await sleep(secs * 1000);
  const m1 = await page.metrics();
  const p1 = await page.probe();
  const wall = (Date.now() - t0) / 1000;
  return {
    busyPct: Math.round(((m1.taskMs - m0.taskMs) / (wall * 1000)) * 100),
    scriptMsPerSec: Math.round((m1.scriptMs - m0.scriptMs) / wall),
    recalcsPerSec: Math.round((m1.recalcStyleCount - m0.recalcStyleCount) / wall),
    recalcMsPerSec: Math.round((m1.recalcStyleMs - m0.recalcStyleMs) / wall),
    layoutsPerSec: Math.round((m1.layoutCount - m0.layoutCount) / wall),
    layoutMsPerSec: Math.round((m1.layoutMs - m0.layoutMs) / wall),
    longFrames: p1.longFrames.length - p0.longFrames.length,
  };
}
const line = (r) => `busy ${String(r.busyPct).padStart(3)}% | script ${String(r.scriptMsPerSec).padStart(4)} ms/s | recalcs ${String(r.recalcsPerSec).padStart(3)}/s (${r.recalcMsPerSec} ms/s) | layouts ${String(r.layoutsPerSec).padStart(3)}/s (${r.layoutMsPerSec} ms/s) | long frames ${r.longFrames}`;

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  console.log(`device ${device}, ${secs} s still each; override: ${css}`);
  for (const file of pages) {
    const page = await browser.newPage();
    try {
      await page.emulate({ device, network: 'none' });
      await page.goto(srv.url + file + query, { timeout: 60000 });
      if (file === 'index.html' || file === '') await page.waitForMark('intro-done', { timeout: 90000 });
      else await page.waitForMark('parted', { timeout: 60000 });
      await sleep(1500);
      const button = await page.evaluate(`(() => { const b = document.querySelector('[data-music-toggle]'); return b ? b.className + ' aria-pressed=' + b.getAttribute('aria-pressed') : '(no music button)'; })()`);
      const anims = await page.evaluate(ANIMS);
      const before = await still(page);
      await page.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s); })()`);
      await sleep(500);
      const after = await still(page);
      console.log(`== ${file}`);
      console.log(`   music button: ${button}`);
      console.log(`   running animations (${anims.length}): ${anims.slice(0, 14).join(' | ')}`);
      console.log(`   as it is:      ${line(before)}`);
      console.log(`   with override: ${line(after)}`);
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

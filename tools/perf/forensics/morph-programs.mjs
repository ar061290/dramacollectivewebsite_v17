// Does the morph's first frame on screen compile anything after warmMorph? Programs at 'morph warm'
// versus after the morph has been scrolled onto the screen. Usage: node tools/perf/forensics/morph-programs.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';
const root = process.argv[2] || DIST;
const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
const LIST = `(() => { const r = window.dramaCollective.stage.renderer; return r.info.programs.map((p) => p.id + ':' + p.name + ':' + p.usedTimes); })()`;
try {
  const page = await browser.newPage();
  await page.emulate({ device: 'laptop', network: 'none' });
  await page.goto(`${srv.url}index.html`, { timeout: 60000 });
  await page.waitForMark('morph-warm', { timeout: 90000 });
  await sleep(500);
  const atWarm = await page.evaluate(LIST);
  const marks = await page.marks();
  console.log(`marks: ${Object.entries(marks).map(([k, v]) => `${k}@${Math.round(v)}`).join(' ')}`);
  console.log(`${atWarm.length} programs at morph warm: ${atWarm.join(' ')}`);
  // through the sequence to the morph and the logo, as the scroll would
  const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
  for (const f of [0.3, 0.5, 0.65, 0.8, 0.9, 1]) { await page.evaluate(`scrollTo(0, ${Math.round(total * f)})`); await sleep(700); }
  await sleep(1500);
  const p1 = await page.probe();
  const atEnd = await page.evaluate(LIST);
  const fresh = atEnd.filter((p) => !atWarm.some((q) => q.split(':')[0] === p.split(':')[0]));
  console.log(`${atEnd.length} programs after the scroll; compiled since the warm: ${fresh.length ? fresh.join(' ') : 'none'}`);
  console.log(`long tasks during the whole visit: ${p1.longTasks.map(([t, d]) => `${t}+${d}`).join(' ')}`);
  await page.close();
} finally {
  await browser.close();
  await srv.close();
}

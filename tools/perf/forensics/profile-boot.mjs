// Where does the home page's boot spend its time? A warm-up navigation first (cold-process costs
// out of the way), then a profiled load: sampling profile from navigation to curtain-up, the marks,
// then 3 s of idle frames after the intro to see what a frame costs while the visitor just looks.
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const device = process.argv[2] || 'laptop';
const srv = await serve({ root: process.argv[3] || DIST, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device, network: 'none' });
  // warm-up: a first load in this fresh profile pays for the GPU process, the shader cache and the font enumeration
  await page.goto(`${srv.url}contact.html`, { timeout: 60000 });
  await page.waitForMark('parted', { timeout: 30000 });
  const warm = await page.marks();
  console.log('warm-up contact.html marks:', JSON.stringify(warm));

  // the cold-cache home load, profiled
  await page.clearCache();
  await page.profileStart();
  const m0 = await page.metrics();
  const loadMs = await page.goto(`${srv.url}index.html`, { timeout: 90000 });
  const curtain = await page.waitForMark('curtain-up', { timeout: 90000 });
  const prof = await page.profileStop();
  const marks = await page.marks();
  const m1 = await page.metrics();
  console.log(`\n== home load (${device}) == load event ${loadMs} ms, curtain up ${curtain} ms`);
  console.log('marks:', JSON.stringify(marks));
  console.log('main-thread to curtain: task', m1.taskMs - m0.taskMs, 'ms, script', m1.scriptMs - m0.scriptMs, 'ms, layout', m1.layoutMs - m0.layoutMs, 'ms, style', m1.recalcStyleMs - m0.recalcStyleMs, 'ms, recalcs', m1.recalcStyleCount - m0.recalcStyleCount, 'layouts', m1.layoutCount - m0.layoutCount);
  console.log(`profile: ${prof.totalMs} ms sampled; top self-time:`);
  for (const [k, ms] of prof.top.slice(0, 30)) console.log(`  ${String(ms).padStart(6)} ms  ${k}`);

  // the intro, then idle
  const intro = await page.waitForMark('intro-done', { timeout: 20000 });
  const morph = await page.waitForMark('morph-ready', { timeout: 20000 });
  console.log(`intro done ${intro} ms, morph ready ${morph} ms`);
  const probe0 = await page.probe();
  console.log('long tasks so far:', probe0.longTasks.length, 'total', probe0.longTaskMs, 'ms; the longest:', JSON.stringify(probe0.longTasks.sort((a, b) => b[1] - a[1]).slice(0, 8)));
  await sleep(500);
  const i0 = await page.metrics();
  await page.frameStart();
  await page.profileStart();
  await sleep(3000);
  const idleProf = await page.profileStop();
  const frames = await page.frameStop();
  const i1 = await page.metrics();
  const long = frames.filter((f) => f > 20).length;
  const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  console.log(`\n== idle 3 s after the intro (${device}) == frames ${frames.length} (avg ${avg.toFixed(1)} ms, >20 ms: ${long}), main-thread task ${i1.taskMs - i0.taskMs} ms (${Math.round((i1.taskMs - i0.taskMs) / 30)}% busy), script ${i1.scriptMs - i0.scriptMs} ms, recalcs ${i1.recalcStyleCount - i0.recalcStyleCount}, layouts ${i1.layoutCount - i0.layoutCount}`);
  console.log('idle profile top self-time:');
  for (const [k, ms] of idleProf.top.slice(0, 16)) console.log(`  ${String(ms).padStart(6)} ms  ${k}`);
  await page.send('HeapProfiler.enable'); await page.send('HeapProfiler.collectGarbage');
  const after = await page.metrics();
  console.log('heap after GC:', after.heapMB, 'MB; nodes', after.nodes, 'listeners', after.listeners);
} finally {
  await browser.close();
  await srv.close();
}

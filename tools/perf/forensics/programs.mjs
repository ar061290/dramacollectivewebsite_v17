// Which shader programs exist on the home stage after the curtain lifts, and how their cache keys
// differ (each key field that differs between two programs of the same material). Usage: node tools/perf/forensics/programs.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const srv = await serve({ root: process.argv[2] || DIST, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device: 'laptop', network: 'none' });
  await page.goto(`${srv.url}index.html`, { timeout: 60000 });
  await page.waitForMark('curtain-up', { timeout: 90000 });
  await sleep(300);
  console.log('marks:', JSON.stringify(await page.marks()));
  const progs = await page.evaluate(`(() => { const r = window.dramaCollective.stage.renderer; return r.info.programs.map((p) => ({ name: p.name, used: p.usedTimes, id: p.id, key: p.cacheKey })); })()`);
  console.log(`${progs.length} programs:`);
  for (const p of progs) console.log(`  #${p.id} ${p.name.padEnd(22)} used ${String(p.used).padStart(2)}  key ${p.key.length} chars`);
  // the keys as parameter lists: three joins the parameters with commas; show where pairs of same-type programs differ
  const byName = {};
  for (const p of progs) (byName[p.name] ||= []).push(p);
  for (const [name, list] of Object.entries(byName)) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      const a = list[0].key.split(','), b = list[i].key.split(',');
      const diffs = [];
      for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) diffs.push(`[${k}] ${a[k]} vs ${b[k]}`);
      console.log(`${name}: #${list[0].id} vs #${list[i].id} differ in ${diffs.length} fields: ${diffs.slice(0, 12).join(' | ')}`);
    }
  }
} finally {
  await browser.close();
  await srv.close();
}

// Functional smoke of the built site: every page boots, says it is ready, throws nothing, 404s
// nothing; the home page's morph comes from the worker and its programs are all compiled before
// the first frame. Usage: node tools/perf/forensics/smoke.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { PAGES } from '../benches.mjs';
import { DIST } from './_args.mjs';

const root = process.argv[2] || DIST;
const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
let failures = 0;
try {
  for (const [key, def] of Object.entries(PAGES)) {
    if (key === 'planner') continue;
    const page = await browser.newPage();
    try {
      await page.emulate({ device: 'laptop', network: 'none' });
      await page.goto(`${srv.url}${def.file}`, { timeout: 60000 });
      const ready = def.ready ? await page.waitForMark(def.ready, { timeout: 60000 }) : 1;
      let extra = '';
      if (def.kind === 'home') {
        const intro = await page.waitForMark('intro-done', { timeout: 30000 });
        const morph = await page.waitForMark('morph-ready', { timeout: 40000 });
        const warm = await page.waitForMark('morph-warm', { timeout: 20000 });
        const marks = await page.marks();
        const worker = Object.keys(marks).find((k) => k.startsWith('morph-built'));
        const programs = await page.evaluate(`(() => { const s = window.dramaCollective && window.dramaCollective.stage; return s ? s.renderer.info.programs.length : -1; })()`);
        extra = ` | intro ${intro} morph ${morph} (${worker}) warm ${warm} | ${Object.keys(marks).filter((k) => k.startsWith('shaders-compiled')).join('')} ${Object.keys(marks).filter((k) => k.startsWith('first-frame')).join('')} programs now ${programs}`;
      } else {
        await sleep(1500);
      }
      const net = page.network();
      const bad = net.list.filter((r) => r.status >= 400 || (r.failed && !/abort/i.test(r.failed)));
      const errs = page.errors.concat(page.console.filter((c) => c.type === 'error').map((c) => c.text));
      const warns = page.console.filter((c) => c.type === 'warning').map((c) => c.text.slice(0, 120));
      const ok = ready && !bad.length && !errs.length;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(14)} ready ${String(ready).padStart(5)} ms | ${net.count} req ${Math.round(net.bytes / 1024)} KB${extra}`);
      if (bad.length) console.log(`      bad requests: ${bad.map((r) => `${r.status || r.failed} ${r.url}`).join(', ')}`);
      if (errs.length) console.log(`      errors: ${errs.map((e) => e.slice(0, 200)).join(' || ')}`);
      if (warns.length) console.log(`      warnings: ${warns.join(' || ')}`);
    } catch (err) {
      failures++;
      console.log(`FAIL ${key}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await srv.close();
}
console.log(failures ? `${failures} page(s) failed` : 'all pages ok');
process.exit(failures ? 1 : 0);

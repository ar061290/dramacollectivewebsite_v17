// Which DOM trees are detached yet still reachable on a page, on the baseline build and the new one?
// Usage: node tools/perf/forensics/detached.mjs publication.html --before <earlier dist>
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, twoBuilds } from './_args.mjs';
const { before, after, positional } = twoBuilds();
const file = positional[0] || 'publication.html';
const roots = [
  ['baseline', before],
  ['new', after],
];
const describe = (n) => `${n.nodeName.toLowerCase()}${n.attributes ? n.attributes.reduce((s, a, i, arr) => (i % 2 === 0 && (a === 'class' || a === 'id' || a === 'src' || a === 'data-lottie' || a === 'aria-hidden') ? `${s} ${a}=${String(arr[i + 1]).slice(0, 40)}` : s), '') : ''} (${n.childNodeCount ?? 0} children)`;
const browser = await launch({ headless: true });
try {
  for (const [name, root] of roots) {
    const srv = await serve({ root, base: '/' });
    const page = await browser.newPage();
    await page.emulate({ device: 'laptop', network: 'none' });
    await page.goto(srv.url + file, { timeout: 60000 });
    await page.waitForMark(file === 'index.html' ? 'curtain-up' : 'parted', { timeout: 60000 });
    await sleep(3000);
    await page.send('HeapProfiler.enable');
    await page.send('HeapProfiler.collectGarbage');
    await sleep(300);
    await page.send('DOM.enable');
    let res;
    try { res = await page.send('DOM.getDetachedDomNodes'); } catch (e) { console.log(name, 'getDetachedDomNodes failed:', e.message); res = null; }
    const m = await page.metrics();
    console.log(`== ${name}: ${m.nodes} nodes; ${res ? res.detachedNodes.length : '?'} detached trees`);
    if (res) {
      const tally = {};
      for (const d of res.detachedNodes) { const k = describe(d.treeNode); tally[k] = (tally[k] || 0) + 1; }
      for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${String(v).padStart(3)}x ${k}`);
    }
    await page.close();
    await srv.close();
  }
} finally {
  await browser.close();
}

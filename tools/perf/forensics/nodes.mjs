// Where do a page's DOM nodes come from, and how many survive a garbage collection? Compares the
// baseline build with the new one. Usage: node tools/perf/forensics/nodes.mjs publication.html --before <earlier dist>
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, twoBuilds } from './_args.mjs';
const { before, after, positional } = twoBuilds();
const file = positional[0] || 'publication.html';
const roots = [
  ['baseline', before],
  ['new', after],
];
const COUNT = `(() => {
  const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
  const by = {}; let n = 0, shadow = 0, tpl = 0;
  while (w.nextNode()) { const node = w.currentNode; n++; by[node.nodeType] = (by[node.nodeType] || 0) + 1; if (node.shadowRoot) shadow++; if (node.tagName === 'TEMPLATE') tpl += node.content.querySelectorAll('*').length; }
  return { inDocument: n, byType: by, shadowHosts: shadow, templateNodes: tpl, iframes: document.querySelectorAll('iframe').length, svgs: document.querySelectorAll('svg').length, svgChildren: document.querySelectorAll('svg *').length };
})()`;
const browser = await launch({ headless: true });
try {
  for (const [name, root] of roots) {
    const srv = await serve({ root, base: '/' });
    const page = await browser.newPage();
    await page.emulate({ device: 'laptop', network: 'none' });
    await page.goto(srv.url + file, { timeout: 60000 });
    await page.waitForMark(file === 'index.html' ? 'curtain-up' : 'parted', { timeout: 60000 });
    const m0 = await page.metrics();
    await sleep(3000);
    const m1 = await page.metrics();
    const c = await page.evaluate(COUNT);
    await page.send('HeapProfiler.enable');
    await page.send('HeapProfiler.collectGarbage');
    await sleep(500);
    const m2 = await page.metrics();
    console.log(`${name.padEnd(9)} nodes at parted ${m0.nodes}, +3 s ${m1.nodes}, after GC ${m2.nodes} | documents ${m2.documents} frames ${m2.frames} | in document: ${c.inDocument} (types ${JSON.stringify(c.byType)}) shadow hosts ${c.shadowHosts} template ${c.templateNodes} iframes ${c.iframes} svg ${c.svgs}/${c.svgChildren}`);
    await page.close();
    await srv.close();
  }
} finally {
  await browser.close();
}

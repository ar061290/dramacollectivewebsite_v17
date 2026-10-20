// Every live Document object in the page's renderer after boot and a GC: its URL, type and size.
// Usage: node tools/perf/forensics/documents.mjs publication.html --before <earlier dist>
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, twoBuilds } from './_args.mjs';
const { before, after, positional } = twoBuilds();
const file = positional[0] || 'publication.html';
const roots = [
  ['baseline', before],
  ['new', after],
];
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
    const m = await page.metrics();
    const proto = await page.send('Runtime.evaluate', { expression: 'Document.prototype' });
    const list = await page.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
    const info = await page.send('Runtime.callFunctionOn', { objectId: list.objects.objectId, returnByValue: true, functionDeclaration: `function () {
      return this.map((d) => { try {
        const w = d.createTreeWalker(d, NodeFilter.SHOW_ALL); let n = 0; while (w.nextNode()) n++;
        const root = d.documentElement; const first = root ? root.outerHTML.replace(/\s+/g, ' ').slice(0, 140) : '(no root)';
        return { url: d.URL.slice(0, 80), type: d.contentType, nodes: n, main: d === document, title: d.title, first };
      } catch (e) { return { error: String(e).slice(0, 80) }; } });
    }` });
    console.log(`== ${name}: metric nodes ${m.nodes}, documents ${m.documents}; ${info.result.value.length} Document objects:`);
    for (const d of info.result.value) console.log(`   ${d.error ? d.error : `${d.main ? '* ' : '  '}${String(d.nodes).padStart(5)} nodes  ${d.type.padEnd(15)} ${d.url || '(no url)'}  ${d.title ? 'title=' + d.title.slice(0, 30) + ' ' : ''}${d.first}`}`);
    await page.close();
    await srv.close();
  }
} finally {
  await browser.close();
}

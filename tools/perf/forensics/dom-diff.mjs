// Which elements differ in number between the baseline build and the new one, on a page, once it
// has settled? Usage: node tools/perf/forensics/dom-diff.mjs publication.html --before <earlier dist>
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST, twoBuilds } from './_args.mjs';
const { before, after, positional } = twoBuilds();
const file = positional[0] || 'publication.html';
const roots = [
  before,
  after,
];
const browser = await launch({ headless: true });
const counts = [];
try {
  for (const root of roots) {
    const srv = await serve({ root, base: '/' });
    const page = await browser.newPage();
    await page.emulate({ device: 'laptop', network: 'none' });
    await page.goto(srv.url + file, { timeout: 60000 });
    await page.waitForMark(file === 'index.html' ? 'curtain-up' : 'parted', { timeout: 60000 });
    await sleep(3000);
    const c = await page.evaluate(`(() => { const m = {}; const all = document.querySelectorAll('*'); for (const el of all) { const k = el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : ''); m[k] = (m[k] || 0) + 1; } m['#elements'] = all.length; return m; })()`);
    const metrics = await page.metrics();
    c['#metrics.nodes'] = metrics.nodes;
    counts.push(c);
    await page.close();
    await srv.close();
  }
} finally {
  await browser.close();
}
const keys = new Set([...Object.keys(counts[0]), ...Object.keys(counts[1])]);
for (const k of [...keys].sort()) {
  const a = counts[0][k] || 0, b = counts[1][k] || 0;
  if (a !== b) console.log(`${k.padEnd(44)} ${String(a).padStart(5)} -> ${String(b).padStart(5)}`);
}
console.log('(only the counts that differ are listed)');

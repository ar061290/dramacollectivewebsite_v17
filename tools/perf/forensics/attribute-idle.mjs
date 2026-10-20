// Who mutates the DOM and forces style/layout every frame on an idle page? Records the mutation
// targets and a CPU profile over 2 s of stillness. Usage: node tools/perf/forensics/attribute-idle.mjs contact.html,piece.html [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const pages = (process.argv[2] || 'contact.html,piece-everything-changes.html,publication.html').split(',');
const srv = await serve({ root: process.argv[3] || DIST, base: '/' });
const browser = await launch({ headless: true });
try {
  for (const file of pages) {
    const page = await browser.newPage();
    await page.emulate({ device: 'laptop', network: 'none' });
    await page.goto(`${srv.url}${file}`, { timeout: 60000 });
    await page.waitForMark(file === 'index.html' ? 'curtain-up' : 'parted', { timeout: 60000 });
    await sleep(1500);
    await page.evaluate(`(() => { window.__mut = new Map(); window.__mo = new MutationObserver((rs) => { for (const r of rs) { const t = r.target; const k = (t.nodeType === 1 ? t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ').slice(0, 2).join('.') : '') : '#text in ' + (t.parentElement && t.parentElement.tagName)) + ' [' + r.type + (r.attributeName ? ':' + r.attributeName : '') + ']'; window.__mut.set(k, (window.__mut.get(k) || 0) + 1); } }); window.__mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: false }); })()`);
    const m0 = await page.metrics();
    await page.profileStart();
    await sleep(2000);
    const prof = await page.profileStop();
    const m1 = await page.metrics();
    const muts = await page.evaluate(`[...window.__mut.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)`);
    console.log(`\n==== ${file}: 2 s idle: recalcs ${m1.recalcStyleCount - m0.recalcStyleCount}, layouts ${m1.layoutCount - m0.layoutCount}, style ${m1.recalcStyleMs - m0.recalcStyleMs} ms, layout ${m1.layoutMs - m0.layoutMs} ms, script ${m1.scriptMs - m0.scriptMs} ms, task ${m1.taskMs - m0.taskMs} ms`);
    console.log('mutation targets:', muts.map(([k, n]) => `${n}× ${k}`).join(' | ') || '(none)');
    console.log('profile top self-time:');
    for (const [k, ms] of prof.top.slice(0, 18)) if (ms >= 2) console.log(`  ${String(ms).padStart(5)} ms  ${k}`);
    await page.close();
  }
} finally {
  await browser.close();
  await srv.close();
}

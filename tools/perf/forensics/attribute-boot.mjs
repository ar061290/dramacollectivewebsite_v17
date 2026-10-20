// Who mutates the DOM between navigation start and the curtain parting (+300 ms)? Records the
// mutation targets from document start. Usage: node tools/perf/forensics/attribute-boot.mjs apply.html,team.html [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const pages = (process.argv[2] || 'apply.html').split(',');
const root = process.argv[3] || DIST;
const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
const RECORD = `(() => { window.__bootMut = new Map(); const mo = new MutationObserver((rs) => { for (const r of rs) { const t = r.target; const k = (t.nodeType === 1 ? t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (typeof t.className === 'string' && t.className ? '.' + t.className.split(' ').slice(0, 2).join('.') : '') : '#text in ' + (t.parentElement && t.parentElement.tagName)) + ' [' + r.type + (r.attributeName ? ':' + r.attributeName : '') + ']'; window.__bootMut.set(k, (window.__bootMut.get(k) || 0) + 1); } }); const go = () => { try { mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {} }; if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go); })();`;
try {
  for (const file of pages) {
    const page = await browser.newPage();
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORD });
    await page.emulate({ device: 'laptop', network: 'none' });
    const m0 = await page.metrics();
    await page.goto(`${srv.url}${file}`, { timeout: 60000 });
    await page.waitForMark('parted', { timeout: 60000 });
    await sleep(300);
    const m1 = await page.metrics();
    const muts = await page.evaluate(`[...window.__bootMut.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)`);
    const anims = await page.evaluate(`document.getAnimations().map((a) => (a.effect && a.effect.target ? a.effect.target.tagName.toLowerCase() + '.' + (a.effect.target.className || '') : '?') + ':' + a.playState + ':' + (a.animationName || a.constructor.name)).slice(0, 12)`);
    console.log(`==== ${file}: to parted+300ms: recalcs ${m1.recalcStyleCount - m0.recalcStyleCount}, layouts ${m1.layoutCount - m0.layoutCount}`);
    console.log('mutation targets:', muts.map(([k, n]) => `${n}× ${k}`).join(' | ') || '(none)');
    console.log('running animations:', anims.join(' | ') || '(none)');
    await page.close();
  }
} finally {
  await browser.close();
  await srv.close();
}

// The phone tier (trial switch phone-tier), tried: off by default and on a laptop; on a touch tablet its
// pixel budget, the morph waiting for a scroll, and the stage's GPU memory let go in a hidden tab and
// taken back. Usage: node tools/perf/forensics/phone-tier.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const root = process.argv[2] || DIST;
const tablet = { width: 1024, height: 1366, dpr: 2, mobile: true, touch: true, cpu: 1 };
const READ = `(() => { const dc = window.dramaCollective || {}, st = dc.stage; return {
  tier: document.documentElement.classList.contains('flag-phone-tier'), stageRatio: st ? Math.round(st.renderer.getPixelRatio() * 100) / 100 : null,
  skyRatio: dc.sky ? Math.round(dc.sky.dpr * 100) / 100 : null, morph: !!performance.getEntriesByName('dc:morph-ready').length,
  lost: st ? st.lost : null, still: (() => { const s = document.querySelector('.stage__fallback'); return !!s && !s.hidden; })() }; })()`;
const HIDE = `(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); })()`;
const SHOW = `(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); })()`;
const line = (r) => `tier ${r.tier} | stage ratio ${r.stageRatio} | sky ratio ${r.skyRatio} | morph ready ${r.morph} | lost ${r.lost} | still shown ${r.still}`;

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  for (const [name, device, query] of [['phone, switch off', 'phone', '?flags='], ['laptop, switch on (not a touch screen)', 'laptop', '?flags=phone-tier'], ['touch tablet, switch off', tablet, '?flags=']]) {
    const page = await browser.newPage();
    await page.emulate({ device, network: 'none' });
    await page.goto(`${srv.url}index.html${query}`, { timeout: 60000 });
    await page.waitForMark('intro-done', { timeout: 90000 });
    await page.waitForMark('morph-ready', { timeout: 30000 });
    console.log(`== ${name}: ${line(await page.evaluate(READ))}`);
    await page.close();
  }
  const page = await browser.newPage();
  await page.emulate({ device: tablet, network: 'none' });
  await page.goto(`${srv.url}index.html?flags=phone-tier`, { timeout: 60000 });
  await page.waitForMark('intro-done', { timeout: 90000 });
  await sleep(6000);
  console.log(`== touch tablet, switch on, 6 s after the intro, not scrolled: ${line(await page.evaluate(READ))}`);
  await page.evaluate('scrollTo(0, innerHeight * 0.6)');
  const built = await page.waitForMark('morph-ready', { timeout: 30000 });
  console.log(`   scrolled 0.6 screens: morph ready ${!!built}`);
  await page.evaluate(HIDE);
  await sleep(31500);
  console.log(`   hidden for 31 s: ${line(await page.evaluate(READ))}`);
  await page.evaluate(SHOW);
  await sleep(4000);
  console.log(`   shown again, 4 s later: ${line(await page.evaluate(READ))}; errors: ${page.errors.length ? page.errors.join(' | ').slice(0, 200) : 'none'}`);
  await page.close();
} finally {
  await browser.close();
  await srv.close();
}

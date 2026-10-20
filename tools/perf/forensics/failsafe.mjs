// The failsafe, tried: each way a page can fail to start is caused on purpose, and what the visitor would
// see is read back (the failsafe class, the loader's display, the curtain, the scroll lock, the still).
//   node tools/perf/forensics/failsafe.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const root = process.argv[2] || DIST;
const STATE = `(() => { const h = document.documentElement, l = document.querySelector('.loader'), s = document.querySelector('.stage__fallback');
  return { failsafe: h.classList.contains('is-failsafe'), hasJs: h.classList.contains('has-js'), veiled: h.classList.contains('is-veiled'), locked: h.classList.contains('is-loading'),
    loader: l ? getComputedStyle(l).display + (l.classList.contains('is-done') ? ' (done)' : '') : '-', still: s ? (!s.hidden && !!s.getAttribute('src')) : '-',
    curtain: (() => { const h = document.querySelector('.veil__half'); if (!h) return '-'; const r = h.getBoundingClientRect(); return r.right <= 1 || r.left >= innerWidth - 1 ? 'open' : 'CLOSED'; })(),
    booted: !!window.dcBooted, up: !!window.dcUp,
    marks: performance.getEntriesByType('mark').map((m) => m.name.replace('dc:', '')).filter((n) => /boot|parted|curtain-up|still/.test(n)).join(',') }; })()`;

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
const cases = [
  { name: 'home, as it is', file: 'index.html', wait: 9000 },
  { name: 'contact, as it is', file: 'contact.html', wait: 9500 },
  { name: 'home, its script never arrives', file: 'index.html', block: ['*home-*.js'], wait: 10000 },
  { name: 'contact, arriving through the curtain, its script never arrives', file: 'contact.html', block: ['*contact-*.js'], veil: true, wait: 10000 },
  { name: 'contact, arriving through the curtain, its start throws', file: 'contact.html', veil: true, inject: `const mm = window.matchMedia; window.matchMedia = function (q) { if (performance.getEntriesByName('dc:boot').length) throw new Error('a start that throws (the lab)'); return mm.call(window, q); };`, wait: 3000 },
  { name: 'home, its start throws before the curtain', file: 'index.html', inject: `const mm = window.matchMedia; window.matchMedia = function (q) { if (performance.getEntriesByName('dc:boot').length) throw new Error('a start that throws (the lab)'); return mm.call(window, q); };`, wait: 4000 },
  { name: 'contact, arriving through the curtain, its script throws as it loads', file: 'contact.html', veil: true, inject: `Object.defineProperty(document, 'fonts', { configurable: true, get() { throw new Error('a script that throws as it loads (the lab)'); } });`, wait: 10000 },
  { name: 'home, the statue stops arriving', file: 'index.html', stall: '*statue-rig*', wait: 30000 },
];
try {
  for (const c of cases) {
    const page = await browser.newPage();
    try {
      await page.emulate({ device: 'laptop', network: 'none' });
      if (c.block) { await page.send('Network.setBlockedURLs', { urls: c.block }); }
      if (c.veil) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('dc-veil', '1'); } catch (e) {}` });
      if (c.inject) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: c.inject });
      if (c.stall) {
        await page.send('Fetch.enable', { patterns: [{ urlPattern: c.stall }] });
        page.on('Fetch.requestPaused', () => { /* held: never answered */ });
      }
      await page.goto(srv.url + c.file, { timeout: 60000 });
      const t0 = Date.now();
      await sleep(c.wait);
      const s = await page.evaluate(STATE);
      const errors = [...page.errors, ...page.console.filter((m) => m.type === 'error').map((m) => m.text)].map((e) => e.slice(0, 90));
      console.log(`== ${c.name} (after ${Math.round((Date.now() - t0) / 1000)} s)`);
      console.log(`   failsafe ${s.failsafe} | has-js ${s.hasJs} | curtain ${s.curtain} | scroll locked ${s.locked} | loader ${s.loader} | still ${s.still} | booted ${s.booted} up ${s.up}`);
      if (errors.length) console.log(`   errors: ${errors.slice(0, 3).join(' || ')}`);
    } catch (err) {
      console.log(`== ${c.name}: FAILED ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await srv.close();
}

// The music's start, tried where the browser lets it start by itself and where it refuses: when its file and
// the media controls' artwork are fetched (against the curtain), what the button shows before the curtain,
// and whether a tap starts it where autoplay is refused. Usage: node tools/perf/forensics/music.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';

const root = process.argv[2] || DIST;
const BUTTON = `(() => { const b = document.querySelector('[data-music-toggle]'); return (b.className.replace('icon-btn music-toggle', '').trim() || 'resting') + ', pressed ' + b.getAttribute('aria-pressed'); })()`;
const srv = await serve({ root, base: '/' });
try {
  for (const [policy, flags] of [['allowed', []], ['refused', ['--autoplay-policy=document-user-activation-required']]]) {
    const browser = await launch({ headless: true, flags });
    try {
      for (const [file, up] of [['index.html', 'curtain-up'], ['contact.html', 'parted']]) {
        const page = await browser.newPage();
        await page.emulate({ device: 'laptop', network: 'none' });
        await page.goto(srv.url + file, { timeout: 60000 });
        await page.waitForMark('boot', { timeout: 30000 });
        await sleep(150);
        const early = await page.evaluate(BUTTON);
        await page.waitForMark(up, { timeout: 60000 });
        await sleep(2500);
        const marks = await page.marks();
        const net = page.network().list;
        const at = (re) => net.filter((r) => re.test(r.url)).map((r) => r.at).join(', ') || 'never';
        let after = await page.evaluate(BUTTON);
        let tapped = '';
        if (policy === 'refused') {
          await page.click(40, 400); // a tap on the page, not on the button
          await sleep(2000);
          tapped = ` | after a tap on the page: ${await page.evaluate(BUTTON)}`;
        }
        console.log(`${policy.padEnd(8)} ${file.padEnd(13)} ${up} @${Math.round(marks[up] ?? -1)} | file requested at ${at(/\.mp3/)} | artwork at ${at(/mark-gold-[^1]/)}`);
        console.log(`         button just after boot: ${early} | after the curtain: ${after}${tapped}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await srv.close();
}

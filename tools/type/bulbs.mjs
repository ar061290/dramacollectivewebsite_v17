// The marquee board's words in bulbs, for the still that soon.css draws before the live curtain has
// loaded (src/scene/curtain/CurtainStage.js puts a bulb on every lit cell of a grid of 13 canvas
// pixels over the words in Lato Black at 180px, alternate rows offset by half). This sets the words
// the same way, in Chrome with the site's own Lato Black, and prints the two masks soon.css wants
// (one line, and two lines for a tall screen) as SVG paths, a run of bulbs per stroke. Run once after
// changing a sign's words:
//
//   node tools/type/bulbs.mjs "NOT FOUND"
//
// With no words it sets COMING SOON, which should print the masks soon.css already has.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../perf/lib/chrome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const words = (process.argv[2] || 'COMING SOON').toUpperCase().trim().split(/\s+/);
const font = readFileSync(join(ROOT, 'assets/fonts/Lato-900.woff2')).toString('base64');

// CurtainStage.js _buildSign(), as far as the bulbs' places (keep the two in step)
const SET = String.raw`async (font, words) => {
  const face = new FontFace('Lato', Uint8Array.from(atob(font), (c) => c.charCodeAt(0)), { weight: '900' });
  document.fonts.add(await face.load());
  const SIGN_TEXT = { one: 1420, two: 814 };
  const set = (lines, setW) => {
    const step = 13;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const type = (px) => {
      ctx.font = '900 ' + px + 'px Lato, "Helvetica Neue", Arial, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = (px / 18) + 'px';
    };
    type(180);
    const fontPx = Math.min(180, 180 * (setW / Math.max(...lines.map((l) => ctx.measureText(l).width))));
    cv.width = setW + 40;
    cv.height = Math.ceil(180 * 1.05 * lines.length) + 20;
    type(fontPx);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, 10 + 180 * 1.05 * (i + 0.5)));
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const runs = [];
    for (let y = step / 2; y < cv.height; y += step) {
      const row = Math.floor(y / step) % 2 ? step / 2 : 0;
      let start = null, n = 0;
      for (let x = step / 2 + row; x < cv.width + step; x += step) {
        const lit = x < cv.width && data[(Math.floor(y) * cv.width + Math.floor(x)) * 4 + 3] > 140;
        if (lit) { if (start === null) start = x; n++; }
        else if (start !== null) { runs.push('M' + start + ' ' + y + 'h' + (Math.round(((n - 1) * step + 0.1) * 10) / 10)); start = null; n = 0; }
      }
    }
    return { w: cv.width, h: cv.height, d: runs.join('') };
  };
  return [set([words.join(' ')], SIGN_TEXT.one), set(words, SIGN_TEXT.two)];
}`;

const browser = await launch();
try {
  const page = await browser.newPage();
  const masks = await page.evaluate(`(${SET})(${JSON.stringify(font)}, ${JSON.stringify(words)})`);
  for (const [i, m] of masks.entries()) {
    const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${m.w} ${m.h}'%3E%3Cpath d='${m.d}' fill='none' stroke='%23000' stroke-width='8.84' stroke-linecap='round' stroke-dasharray='0 13'/%3E%3C/svg%3E`;
    console.log(`/* ${i ? 'two lines' : 'one line'}: ${i ? words.join(' / ') : words.join(' ')} */`);
    console.log(`--bulbs: url("data:image/svg+xml,${svg}");`);
  }
} finally {
  await browser.close();
}

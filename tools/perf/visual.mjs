#!/usr/bin/env node
// Visual guardrail: screenshots of every page at several viewports, with time held still (the sky
// drawn at one fixed instant, the statues and the curtain held, every CSS and Web Animation paused at
// one fixed time, the pointer off the page), and a pixel-by-pixel comparison against an earlier set.
//
//   node tools/perf/visual.mjs --out tools/perf/shots/before            # take a set
//   node tools/perf/visual.mjs --out tools/perf/shots/after --compare tools/perf/shots/before
//   node tools/perf/visual.mjs --page home,piece --viewport 1366x768     # a subset
//
// A difference is reported with its pixel count, its share of the image, the largest channel
// delta and the box it lies in; a diff image is written next to the screenshot.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './lib/chrome.mjs';
import { serve } from './lib/server.mjs';
import { decode, encode, diff } from './lib/png.mjs';
import { PAGES } from './benches.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) { const k = process.argv[i].slice(2); const v = process.argv[i + 1]; if (v && !v.startsWith('--')) { args[k] = v; i++; } else args[k] = true; }

const out = args.out || join(HERE, 'shots', 'latest');
const compare = args.compare || null;
const pages = args.page ? args.page.split(',') : Object.keys(PAGES).filter((k) => k !== 'planner');
const viewports = (args.viewport || '1366x768,390x844,1024x1366,1920x1080').split(',').map((v) => v.split('x').map(Number));
const root = args.src ? REPO : isAbsolute(args.root || '') ? args.root : join(REPO, args.root || 'dist');
const threshold = Number(args.threshold || 8);
mkdirSync(out, { recursive: true });

const FREEZE = `(async () => {
  const dc = window.dramaCollective || {};
  // the sky at one instant
  if (dc.sky) { dc.sky.stop(); dc.sky.pointer = null; dc.sky.constellations = []; for (const s of dc.sky.stars) { s.boost = 0; s.lit = 0; } dc.sky._collectMasks && dc.sky._collectMasks(1e6); dc.sky._draw(1e6); }
  // the stage: one more frame with the pointer gone, then still
  if (dc.stage) { try { dc.stage.setPointer && dc.stage.setPointer(0, 0); dc.stage.renderOnce && dc.stage.renderOnce(); dc.stage.stop && dc.stage.stop(); } catch (e) {} }
  // the Lotties (the nav mark, the scroll cue, the spark) run on their own clock: out of the picture
  for (const el of document.querySelectorAll('[data-lottie]')) el.style.visibility = 'hidden';
  // the publication banner's rolling line keeps its own time (a Web Animation now, a GSAP tween in
  // earlier builds): out of the picture, the rest of the banner stays in it
  for (const el of document.querySelectorAll('.pub-ticker__track')) el.style.visibility = 'hidden';
  // the coming-soon curtain (exposed as window.__stage with ?debug): its clock held at one instant, its
  // board still, one frame drawn
  const st = window.__stage;
  if (st && st.renderer && st.u) { try { st.renderer.setAnimationLoop(null); st.running = false; st.u.uTime.value = 1000; st.swing.a = 0; st.swing.v = 0; st.state.push = 0; st.state.x = 0; st.state.y = 0; st.flash = 0; st.chase = -1; if (st.sign) st.sign.rotation.z = 0; st._applyLit && st._applyLit(); st._lightBulbs && st._lightBulbs(); st._render(); } catch (e) {} }
  // the writer statue (the write page, exposed as window.__writeStatue with ?debug): its eased view, lamp
  // and glow brought to where they were going, its resolution at its own (not lowered for a slow
  // frame), its loop stopped, one frame drawn
  const ws = window.__writeStatue;
  if (ws && ws.renderer && ws.ready) { try { ws.renderer.setAnimationLoop(null); ws.running = false; ws.yaw.now = ws.yaw.to; ws.pitch.now = ws.pitch.to; ws.pointer.on = ws.pointer.to; ws.glowAt.copy(ws.glowTo); if (ws.res.low) ws._setRes({ low: false }); ws._draw(true); } catch (e) {} }
  // every running animation held at the same moment
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
})()`;

const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
const report = [];
try {
  for (const [w, h] of viewports) {
    for (const key of pages) {
      const def = PAGES[key];
      const page = await browser.newPage();
      try {
        await page.emulate({ device: { width: w, height: h, dpr: 1, mobile: w < 800, touch: w < 800, cpu: 1 }, network: 'none' });
        // ?debug exposes what the freeze holds still (the coming-soon curtain, the writer statue) and changes nothing on the page
        await page.goto(`${srv.url}${def.file}${def.kind === 'soon' || key === 'write' ? '?debug' : ''}`, { timeout: 60000 });
        if (def.ready) await page.waitForMark(def.ready, { timeout: 60000 });
        if (def.kind === 'home') { await page.waitForMark('intro-done', { timeout: 30000 }); await page.waitForMark('morph-ready', { timeout: 30000 }); }
        await sleep(def.kind === 'home' ? 800 : def.kind === 'soon' ? 4500 : 1200); // the curtain's light cue (0.3 s + 1.8 s) has played out
        // settled: no long task for a second and no embedded form still loading (at most 15 s), so that both builds
        // are shot with their statues, rings and forms arrived, not at whatever moment of their arrival; an embedded
        // form (Fillout's page, in a frame) goes on fading in and resizing its frame once it says it is ready, so its
        // frame's height must also have held for a second and a half
        let formH = null, formSince = Date.now();
        for (const t0 = Date.now(); Date.now() - t0 < 15000; await sleep(250)) {
          const s = await page.evaluate(`(() => { const P = window.__dcPerf; const last = P && P.longTasks.length ? P.longTasks[P.longTasks.length - 1] : null;
            const quiet = last ? performance.now() - (last[0] + last[1]) : performance.now();
            const frame = document.querySelector('.form-box iframe');
            return { quiet: quiet > 1000, loading: !!document.querySelector('.form-box.is-loading'), formH: frame ? frame.getBoundingClientRect().height : null }; })()`);
          if (s.formH !== formH) { formH = s.formH; formSince = Date.now(); }
          if (s.quiet && !s.loading && (formH === null || Date.now() - formSince >= 1500)) break;
        }
        await sleep(500);
        await page.evaluate(FREEZE);
        await sleep(150);
        const name = `${key}-${w}x${h}.png`;
        const file = join(out, name);
        await page.screenshot(file);
        let line = `${name.padEnd(34)} shot`;
        if (compare) {
          const before = join(compare, name);
          if (!existsSync(before)) line += '  (no earlier shot)';
          else {
            const d = diff(decode(readFileSync(before)), decode(readFileSync(file)), { threshold });
            if (d.sizeMismatch) line += `  SIZE ${d.a} vs ${d.b}`;
            else if (d.same) line += '  identical';
            else { writeFileSync(join(out, name.replace('.png', '.diff.png')), encode(d.image)); line += `  DIFF ${d.different} px (${(d.share * 100).toFixed(3)}%), max delta ${d.maxDelta}, mean ${d.meanDelta.toFixed(3)}, box ${d.box.join(',')}`; }
            report.push({ name, ...d, image: undefined });
          }
        }
        console.log(line);
      } catch (err) {
        console.log(`${key}-${w}x${h}: FAILED ${err.message}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await srv.close();
}
if (compare) writeFileSync(join(out, 'diff-report.json'), JSON.stringify(report, null, 1));

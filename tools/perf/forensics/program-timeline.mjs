// When does each shader program appear on the home stage (relative to the site's marks), which
// object and material owns it, and in which cache-key fields does it differ from the earlier
// program of the same shader? Usage: node tools/perf/forensics/program-timeline.mjs [dist]
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';
const root = process.argv[2] || DIST;
const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
const LIST = `(() => { const r = window.dramaCollective.stage.renderer; return r.info.programs.map((p) => ({ id: p.id, name: p.name, used: p.usedTimes, key: p.cacheKey })); })()`;
const WATCH = `(() => { const st = window.dramaCollective.stage; const r = st.renderer; window.__progLog = []; let n = r.info.programs.length;
  const tick = () => { if (r.info.programs.length !== n) { const fresh = r.info.programs.slice(n).map((p) => '#' + p.id + (p.name ? ' ' + p.name : '')); n = r.info.programs.length; window.__progLog.push([Math.round(performance.now()), n, fresh.join(' ')]); } requestAnimationFrame(tick); }; tick(); return true; })()`;
const OWNERS = `(() => { const st = window.dramaCollective.stage; const r = st.renderer; const out = [];
  const add = (owner, m) => { if (!m) return; const p = r.properties.get(m); out.push(owner + ' / ' + (m.name || m.type) + ' -> #' + (p && p.currentProgram ? p.currentProgram.id : '?')); };
  st.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) add((o.name || o.type), m); if (o.customDepthMaterial) add((o.name || o.type) + ' depth', o.customDepthMaterial); });
  if (st.mask) { add('silhouette', st.mask.material); for (const k of Object.keys(st.mask)) if (st.mask[k] && st.mask[k].isMaterial && st.mask[k] !== st.mask.material) add('silhouette.' + k, st.mask[k]); }
  if (st.morph) for (const k of Object.keys(st.morph)) { const v = st.morph[k]; if (v && v.isMaterial) add('morph.' + k, v); if (v && v.isObject3D && v.material) add('morph.' + k + ' (' + v.type + ')', v.material); }
  return out; })()`;
const diffKeys = (a, b) => { const x = a.split(','), y = b.split(','); const out = []; for (let k = 0; k < Math.max(x.length, y.length); k++) if (x[k] !== y[k]) out.push(`[${k}] ${x[k]} -> ${y[k]}`); return out; };
const report = (label, before, after) => {
  const fresh = after.filter((p) => !before.some((q) => q.id === p.id));
  console.log(`== ${label}: ${after.length} programs, ${fresh.length} new: ${fresh.map((p) => `#${p.id} ${p.name || '(unnamed)'} used ${p.used}`).join(' | ')}`);
  for (const p of fresh) {
    const shader = p.key.split(',')[0];
    const twin = before.filter((q) => q.key.split(',')[0] === shader).pop();
    if (twin) { const d = diffKeys(twin.key, p.key); console.log(`   #${p.id} ${p.name || '(unnamed)'} [${shader}] vs earlier #${twin.id} ${twin.name || '(unnamed)'}: ${d.length} fields differ: ${d.slice(0, 12).join(' ; ')}`); }
    else console.log(`   #${p.id} ${p.name || '(unnamed)'} [${shader}]: no earlier program of that shader; key starts ${p.key.slice(0, 80)}`);
  }
};
try {
  const page = await browser.newPage();
  await page.emulate({ device: 'laptop', network: 'none' });
  await page.goto(`${srv.url}index.html`, { timeout: 60000 });
  await page.waitForMark('statue-loaded', { timeout: 90000 });
  const atLoaded = await page.evaluate(LIST);
  await page.evaluate(WATCH);
  console.log(`at statue loaded: ${atLoaded.map((p) => `#${p.id} ${p.name || '(unnamed)'}`).join(' | ')}`);
  await page.waitForMark('curtain-up', { timeout: 60000 });
  const atCurtain = await page.evaluate(LIST);
  report('curtain up', atLoaded, atCurtain);
  await page.waitForMark('intro-done', { timeout: 60000 });
  const atIntro = await page.evaluate(LIST);
  report('intro done', atCurtain, atIntro);
  await page.waitForMark('morph-warm', { timeout: 60000 });
  await sleep(300);
  const atWarm = await page.evaluate(LIST);
  report('morph warm', atIntro, atWarm);
  const total = await page.evaluate('document.documentElement.scrollHeight - innerHeight');
  for (const f of [0.3, 0.5, 0.65, 0.8, 0.9, 1]) { await page.evaluate(`scrollTo(0, ${Math.round(total * f)})`); await sleep(600); }
  await sleep(1200);
  const atEnd = await page.evaluate(LIST);
  report('after the scroll to the foot', atWarm, atEnd);
  const marks = await page.marks();
  console.log(`marks: ${Object.entries(marks).filter(([k]) => /statue-loaded|shaders|first-frame|curtain-up|intro-done|morph/.test(k)).map(([k, v]) => `${k}@${Math.round(v)}`).join(' ')}`);
  console.log(`program count changes [ms: count, new]: ${(await page.evaluate('window.__progLog')).map((l) => `${l[0]}: ${l[1]} (+${l[2]})`).join(' | ')}`);
  console.log('owners:'); for (const o of await page.evaluate(OWNERS)) console.log('   ' + o);
  await page.close();
} finally {
  await browser.close();
  await srv.close();
}

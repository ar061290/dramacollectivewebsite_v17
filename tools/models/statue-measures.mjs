// The home statue's measures (src/scene/statue.js prepareStatue, and the stage's radius at the end pose), made
// by the site's own code in the lab's Chrome and saved to assets/models/statue-rig.measures.json, which the
// stage then uses instead of walking every vertex five times more on every visit (only while the model is the
// one they were made from: their key). Run after changing the model, then build again:
//
//   npm run build && node tools/models/statue-measures.mjs [dist] && npm run build
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from '../perf/lib/chrome.mjs';
import { serve } from '../perf/lib/server.mjs';

const root = process.argv[2] || fileURLToPath(new URL('../../dist', import.meta.url));
const out = fileURLToPath(new URL('../../assets/models/statue-rig.measures.json', import.meta.url));
const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device: 'laptop', network: 'none' });
  await page.goto(`${srv.url}index.html?live&measure`, { timeout: 60000 });
  await page.waitForMark('stage-built', { timeout: 120000 });
  await sleep(500);
  const m = JSON.parse(await page.evaluate('JSON.stringify(window.dramaCollective.stage.statue.measured)'));
  if (!m || m.saved) throw new Error('the statue was not measured afresh');
  const saved = {
    about: 'The home statue (statue-rig.glb, and statue-rig-lite.glb: the same meshes) as src/scene/statue.js measures it: its scale, its place, its turning sphere, and its radius at the end pose. Made by tools/models/statue-measures.mjs; used only for the model of this key.',
    key: m.key, scale: m.scale, position: m.position, center: m.center, radius: m.radius, radiusEnd: m.radiusEnd,
  };
  writeFileSync(out, JSON.stringify(saved, null, 2) + '\n');
  console.log(`saved: scale ${m.scale}, position ${m.position}, centre ${m.center}, radius ${m.radius}, at the end pose ${m.radiusEnd}`);
} finally { await browser.close(); await srv.close(); }

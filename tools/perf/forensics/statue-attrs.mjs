// What the statue's programs depend on: geometry attributes, material settings, lights, shadows,
// and the program cache keys after warm(). For a stand-in that compiles the same programs early.
import { launch, sleep } from '../lib/chrome.mjs';
import { serve } from '../lib/server.mjs';
import { DIST } from './_args.mjs';
const root = process.argv[2] || DIST;
const srv = await serve({ root, base: '/' });
const browser = await launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulate({ device: 'laptop', network: 'none' });
  await page.goto(`${srv.url}index.html`, { timeout: 60000 });
  await page.waitForMark('curtain-up', { timeout: 90000 });
  await sleep(300);
  const info = await page.evaluate(`(() => {
    const st = window.dramaCollective.stage; const r = st.renderer;
    const out = { programs: r.info.programs.map((p) => p.name + '#' + p.id + ' used ' + p.usedTimes), keys: r.info.programs.map((p) => ({ name: p.name, id: p.id, key: p.cacheKey })), meshes: [], lights: [], shadow: { enabled: r.shadowMap.enabled, type: r.shadowMap.type }, fog: !!st.scene.fog, env: !!st.scene.environment, pixelRatio: r.getPixelRatio(), toneMapping: r.toneMapping, colorSpace: r.outputColorSpace };
    st.scene.traverse((o) => {
      if (o.isLight) out.lights.push({ type: o.type, castShadow: o.castShadow, mapSize: o.shadow && o.shadow.mapSize && [o.shadow.mapSize.x, o.shadow.mapSize.y], shadowType: o.shadow && o.shadow.constructor.name });
      if (o.isMesh) { const ms = [].concat(o.material); out.meshes.push({ name: o.name, type: o.type, visible: o.visible, cast: o.castShadow, receive: o.receiveShadow, attrs: Object.keys(o.geometry.attributes), index: !!o.geometry.index, bones: o.skeleton ? o.skeleton.bones.length : 0, materials: ms.map((m) => ({ type: m.type, name: m.name, map: !!m.map, normalMap: !!m.normalMap, normalScale: m.normalScale && [m.normalScale.x, m.normalScale.y], roughnessMap: !!m.roughnessMap, metalnessMap: !!m.metalnessMap, aoMap: !!m.aoMap, emissiveMap: !!m.emissiveMap, envMap: !!m.envMap, alphaMap: !!m.alphaMap, vertexColors: m.vertexColors, side: m.side, shadowSide: m.shadowSide, transparent: m.transparent, alphaTest: m.alphaTest, flatShading: m.flatShading, toneMapped: m.toneMapped, fog: m.fog, dithering: m.dithering, premultipliedAlpha: m.premultipliedAlpha, depthPacking: m.depthPacking, mapColorSpace: m.map && m.map.colorSpace, mapChannel: m.map && m.map.channel, normalMapType: m.normalMapType, onBeforeCompile: m.onBeforeCompile && m.onBeforeCompile.toString().length, defines: m.defines && Object.keys(m.defines), customProgramCacheKey: m.customProgramCacheKey && m.customProgramCacheKey() })) }); }
    });
    out.maskMaterial = st.mask && st.mask.material && { type: st.mask.material.type, side: st.mask.material.side, color: st.mask.material.color && st.mask.material.color.getHexString() };
    return out;
  })()`);
  console.log(JSON.stringify(info, null, 1).replace(/"key": "([^"]{0,60})[^"]*"/g, '"key": "$1…"'));
} finally {
  await browser.close();
  await srv.close();
}

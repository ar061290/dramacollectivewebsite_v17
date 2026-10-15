// Drama Collective Stage Planner: renderer, render loop, modes, camera views and file export.
// main.js loads this module only once the visitor has confirmed the conditions, so neither three.js
// nor the hall is fetched or built before then; main.js also owns the curtain and the loading screen.
// Ported from the stand-alone planner (github.com/ar061290/dramacollective_stagerenders_v1).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initMaterials } from './materials.js';
import { buildHall, HALL } from './hall.js';
import { buildLedWall } from './ledwall.js';
import { buildRig } from './rig.js';
import { buildSeating } from './seating.js';
import { createItems } from './items.js';
import { createStore, serialise, parseDesign, loadSaved, normalise } from './state.js';
import { defaultState, baseState, PRESETS } from './presets.js';
import { createUI } from './ui.js';
import { createInteraction } from './interact.js';
import { createWalk } from './walk.js';
import { saveFile } from './download.js';
import { keepQuality } from './quality.js';

// What each level costs (the conditions page in stage-planner.html describes these in plain words):
// pixel ratio cap, bloom, how many spotlights cast shadows, shadow map size and MSAA samples.
const QUALITY = {
  low: { pr: 1, bloom: false, shadows: 0, map: 512, samples: 0 },
  medium: { pr: 1.5, bloom: true, shadows: 4, map: 1024, samples: 4 },
  high: { pr: 2, bloom: true, shadows: 8, map: 1024, samples: 4 },
};

const VIEWS = {
  audience: { p: [8.6, 7.2, 15.5], t: [0, 1.4, -0.6] },
  front: { p: [0, 2.7, 15], t: [0, 2.2, -2] },
  stage: { p: [5.2, 3.2, 4.8], t: [0, 1.5, -2] },
  side: { p: [-8.2, 4.4, 2.5], t: [0, 1.6, -1.5] },
  top: { p: [0, 34, 7.02], t: [0, 0, 7] },
};

const app = document.getElementById('app');
const container = document.getElementById('viewport');
const loading = document.getElementById('loading');

/**
 * Build the hall and start drawing it. Throws if three.js cannot set up (main.js shows the message).
 * @param {{ quality: 'low'|'medium'|'high', onReady: (ui: object) => void }} opts  onReady: the first
 *   frame is drawn; it is handed the panels (ui.js), so main.js can see the visitor into the hall
 */
export function startPlanner({ quality, onReady }) {
  const params = new URLSearchParams(location.search);
  if (!QUALITY[quality]) quality = 'low';

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].pr));
  renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  // A lost context (the browser or the graphics driver gave up the hall's 3D, most likely while a
  // big picture is drawn on built-in graphics) does not come back whole here, so the hall is covered
  // with the way out: a reload. The design is not lost with it (state.js keeps it in this browser
  // as it changes).
  const contextLost = new Promise((resolve) => {
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      loading.textContent = 'The browser has stopped drawing the hall. Reload the page to carry on: your design is kept in this browser.';
      loading.hidden = false;
      resolve();
    }, { once: true });
  });
  const isLost = () => renderer.getContext().isContextLost();
  RectAreaLightUniformsLib.init();
  initMaterials(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040404);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.1;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

  let dirty = true;
  const invalidate = (shadows) => {
    dirty = true;
    if (shadows) renderer.shadowMap.needsUpdate = true;
  };

  const ctx = { renderer, scene, camera, mode: 'design', quality, snapMode: 'auto', selectedId: null, invalidate };
  ctx.hall = buildHall();
  ctx.led = buildLedWall();
  ctx.rig = buildRig();
  ctx.seating = buildSeating(ctx);
  ctx.items = createItems(ctx);
  scene.add(ctx.hall.group, ctx.led.group, ctx.rig.group, ctx.seating.group, ctx.items.root);
  ctx.solidMeshes = () => [...ctx.hall.solids, ...ctx.led.solids, ...ctx.items.solidMeshes()];

  // Starting design: ?scene=<preset>, else the last design in this browser, else the default scene.
  let initial = null;
  const sceneParam = params.get('scene');
  const preset = PRESETS.scenes.find((p) => p.id === sceneParam);
  if (preset) {
    initial = baseState();
    preset.apply(initial);
  } else if (!params.has('fresh')) initial = loadSaved();
  if (!initial) initial = defaultState();
  const store = createStore(initial);
  ctx.store = store;

  const selBox = new THREE.Box3Helper(new THREE.Box3(), 0xc185ac); // plum-300: the selection
  selBox.material.depthTest = false;
  selBox.material.toneMapped = false;
  selBox.renderOrder = 30;
  selBox.visible = false;
  scene.add(selBox);
  const tmpBox = new THREE.Box3();
  function updateSelBox() {
    const obj = ctx.selectedId && ctx.items.get(ctx.selectedId);
    if (!obj || ctx.mode !== 'design' || !obj.visible) {
      selBox.visible = false;
      return;
    }
    const b = selBox.box.makeEmpty();
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!o.isMesh || o.userData.isBeam) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      b.union(tmpBox);
    });
    b.expandByScalar(0.03);
    selBox.visible = !b.isEmpty();
    invalidate();
  }

  // ----- post-processing -----
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: QUALITY[quality].samples });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 1.05);
  bloom.enabled = QUALITY[quality].bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());

  // ----- shadows: only the brightest few spotlights cast shadows, to keep it fast -----
  let shadowStats = { on: 0, total: 0 };
  function updateShadows(mapSize, budgetOverride) {
    const all = ctx.items.spotLights();
    const Q = QUALITY[ctx.quality];
    const budget = Math.max(0, Math.min(budgetOverride ?? Q.shadows, renderer.capabilities.maxTextures - 8));
    const size = mapSize || Q.map;
    const ranked = all.filter((l) => l.intensity > 0).sort((a, b) => b.intensity - a.intensity).slice(0, budget);
    const on = new Set(ranked);
    for (const l of all) {
      const want = on.has(l);
      l.castShadow = want;
      if (want && l.shadow.mapSize.x !== size) {
        l.shadow.mapSize.set(size, size);
        if (l.shadow.map) {
          l.shadow.map.dispose();
          l.shadow.map = null;
        }
      }
    }
    shadowStats = { on: on.size, total: all.length };
    renderer.shadowMap.needsUpdate = true;
  }
  ctx.shadowInfo = () =>
    shadowStats.total
      ? `${shadowStats.on} of ${shadowStats.total} spotlights cast shadows at this quality. Every spotlight still lights the scene.`
      : null;

  // ----- apply state to the scene -----
  function apply() {
    const s = store.state;
    const lv = ctx.hall.setHouseLights(s.house);
    scene.environmentIntensity = 0.035 + lv * 0.2;
    ctx.led.setState(s.led, () => invalidate(true));
    ctx.rig.setState(s.rig);
    ctx.seating.setState(s.seating);
    scene.updateMatrixWorld();
    ctx.items.sync(s.items, { haze: s.haze, rigOn: s.rig.on });
    updateShadows();
    updateSelBox();
    if (ctx.walk?.active) ctx.walk.refreshColliders();
    invalidate(true);
  }

  // ----- controls -----
  ctx.select = (id) => {
    ctx.selectedId = id;
    updateSelBox();
    ctx.ui?.renderInspector();
    invalidate();
  };

  const ui = createUI(ctx);
  ctx.ui = ui;
  ctx.interact = createInteraction(ctx);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * 0.497;
  controls.minDistance = 0.8;
  controls.maxDistance = 48;
  controls.screenSpacePanning = true;
  controls.addEventListener('change', () => invalidate());
  ctx.controls = controls;
  ctx.walk = createWalk(ctx);

  function setCam(c) {
    camera.position.set(...c.p);
    controls.target.set(...c.t);
    controls.update();
    invalidate();
  }
  const camState = () => ({ p: camera.position.toArray().map((v) => +v.toFixed(3)), t: controls.target.toArray().map((v) => +v.toFixed(3)) });

  let anim = null;
  ctx.setView = (name) => {
    const v = VIEWS[name];
    if (!v) return;
    if (ctx.mode !== 'design') ctx.setMode('design');
    anim = { k: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...v.p), t1: new THREE.Vector3(...v.t) };
  };
  ctx.focusSelection = () => {
    if (!selBox.visible) return;
    const c = selBox.box.getCenter(new THREE.Vector3());
    const size = selBox.box.getSize(new THREE.Vector3()).length();
    const dir = camera.position.clone().sub(controls.target).normalize();
    anim = { k: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: c.clone().addScaledVector(dir, Math.max(2.5, size * 1.8)), t1: c };
  };

  let orbitSaved = null;
  ctx.setMode = (m) => {
    if (m === ctx.mode) return;
    if (m === 'walk') {
      ctx.interact.reset();
      orbitSaved = camState();
      controls.enabled = false;
      anim = null;
      ctx.mode = 'walk';
      app.dataset.mode = 'walk';
      ui.render();
      ctx.walk.enter();
    } else {
      ctx.walk.exit();
      ctx.mode = 'design';
      app.dataset.mode = 'design';
      camera.rotation.order = 'XYZ';
      if (orbitSaved) setCam(orbitSaved);
      controls.enabled = true;
      ui.render();
    }
    updateSelBox();
    invalidate();
  };

  ctx.setQuality = (q) => {
    if (!QUALITY[q]) return;
    ctx.quality = q;
    keepQuality(q);
    const Q = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pr));
    composer.setPixelRatio(renderer.getPixelRatio());
    for (const t of [composer.renderTarget1, composer.renderTarget2]) {
      if (t.samples !== Q.samples) {
        t.samples = Q.samples;
        t.dispose();
      }
    }
    bloom.enabled = Q.bloom;
    resize();
    updateShadows();
    ui.render();
    invalidate(true);
  };

  // ----- files -----
  const saved = (result, what) => {
    if (result === 'saved') ui.toast(what + ' saved');
    else if (result === 'failed') ui.toast(what + ' could not be saved here.');
  };
  ctx.io = {
    async saveDesign() {
      const blob = new Blob([serialise({ ...store.state, camera: camState() })], { type: 'application/json' });
      saved(await saveFile(blob, 'stage-design.json'), 'Design');
    },
    openDesign(text) {
      try {
        const s = parseDesign(text);
        ctx.select(null);
        store.replace(s);
        if (s.camera) setCam(s.camera);
        ui.toast('Design opened');
      } catch {
        ui.toast('That file is not a saved stage design.');
      }
    },
    async exportGLB() {
      ui.toast('Preparing the 3D model…');
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const hidden = [];
      scene.traverse((o) => {
        if ((o.userData.isBeam || o === selBox) && o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      });
      let glb = null;
      try {
        glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
      } catch (e) {
        console.error(e);
        ui.toast('The 3D model could not be exported.');
      } finally {
        hidden.forEach((o) => { o.visible = true; });
        updateSelBox();
      }
      if (glb) saved(await saveFile(new Blob([glb], { type: 'model/gltf-binary' }), 'stage-design.glb'), '3D model');
    },
    async snapshot(w, h) {
      ui.toast('Rendering the picture…');
      const blob = await renderImage(w, h, (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png')));
      if (blob) saved(await saveFile(blob, `stage-render-${w}x${h}.png`), 'Picture');
      // a lost context has its own message over the hall (above); a smaller size would not help it
      else if (!isLost()) ui.toast('This device could not render that size. Try a smaller one.');
    },
  };

  // Render one frame at a fixed size with the best shadows (best's: the 8 brightest spotlights, at
  // its map size), read it back, then restore the view. Shadows the current level does not draw
  // need new shaders for every material; on built-in graphics, compiled as they are first drawn,
  // they held the page for over a minute (Intel UHD 620, from fast). So they are compiled first, off
  // the page where the browser can (compileAsync: about 20 seconds there, with the page answering
  // for most of it), while the hall keeps its last frame (frame() waits); later pictures reuse them.
  let picturing = false;
  async function renderImage(w, h, read) {
    if (picturing || isLost()) return null;
    picturing = true;
    const size = renderer.getSize(new THREE.Vector2());
    const selVis = selBox.visible;
    selBox.visible = false;
    const best = () => updateShadows(QUALITY.high.map, QUALITY.high.shadows);
    best();
    try {
      syncCeiling();
      // compiled for a render target, as the composer draws the scene (no tone mapping there), so
      // the programs are the ones the picture uses
      renderer.setRenderTarget(composer.readBuffer);
      const compiled = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(null);
      await Promise.race([compiled, contextLost]);
      if (isLost()) return null;
      // the design may have changed meanwhile (and with it the shadows: apply() sets the level's)
      best();
      syncCeiling();
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(1);
      composer.setSize(w, h);
      bloom.enabled = true;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
      composer.render();
      // a context lost in the drawing reads back as a blank picture: no picture instead
      if (isLost()) return null;
      return await read(renderer.domElement);
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      picturing = false;
      selBox.visible = selVis;
      // the level's own pixel ratio (it may have been changed while the shaders were compiled)
      const pr = Math.min(window.devicePixelRatio, QUALITY[ctx.quality].pr);
      renderer.setPixelRatio(pr);
      renderer.setSize(size.x, size.y);
      composer.setPixelRatio(pr);
      composer.setSize(size.x, size.y);
      bloom.enabled = QUALITY[ctx.quality].bloom;
      camera.aspect = size.x / size.y;
      camera.updateProjectionMatrix();
      resize(); // and the window's size now, should it have changed meanwhile
      updateShadows();
      invalidate(true);
    }
  }

  // ----- events -----
  store.on('change', apply);
  store.on('commit', () => {
    if (ctx.selectedId && !store.state.items.some((i) => i.id === ctx.selectedId)) ctx.selectedId = null;
    ui.render();
    updateSelBox();
  });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(resize).observe(container);

  // ----- render loop -----
  const clock = new THREE.Clock();
  const panels = ctx.hall.group.getObjectByName('Ceiling lights');
  // From above the ceiling (the cut-away design view) the ceiling fittings would float in mid-air.
  function syncCeiling() {
    const inside = camera.position.y < HALL.H - 0.05;
    if (panels.visible !== inside) panels.visible = inside;
  }
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (anim) {
      anim.k = Math.min(1, anim.k + dt / 0.7);
      const e = anim.k < 0.5 ? 4 * anim.k ** 3 : 1 - (-2 * anim.k + 2) ** 3 / 2;
      camera.position.lerpVectors(anim.p0, anim.p1, e);
      controls.target.lerpVectors(anim.t0, anim.t1, e);
      if (anim.k >= 1) anim = null;
      dirty = true;
    }
    if (ctx.mode === 'design') {
      if (controls.update()) dirty = true;
    } else if (ctx.walk.update(dt)) dirty = true;
    // while a picture's shaders compile, drawing would wait on them and hold the page: the hall
    // keeps its last frame until the picture is taken
    if (!dirty || picturing) return;
    dirty = false;
    syncCeiling();
    composer.render(dt);
  }

  // ----- boot -----
  apply();
  setCam(store.state.camera || VIEWS.audience);
  ui.render();
  resize();
  requestAnimationFrame(() => {
    frame();
    onReady?.(ui);
  });

  const design = params.get('design');
  if (design) {
    fetch(design).then((r) => r.text()).then((t) => ctx.io.openDesign(t)).catch(() => ui.toast('The linked design could not be loaded.'));
  }
  if (params.get('mode') === 'walk' || location.hash === '#walk') ctx.setMode('walk');
  if (params.has('embed')) app.classList.remove('show-library');

  // Small hook for embedding pages and automated checks.
  window.stagePlanner = {
    ctx,
    normalise,
    capture: (w = 1280, h = 720) => renderImage(w, h, (c) => c.toDataURL('image/png')),
    setCamera: (p, t) => setCam({ p, t }),
    loadScene: (id) => {
      const p = PRESETS.scenes.find((x) => x.id === id);
      if (!p) return false;
      ctx.select(null);
      store.commit((s) => p.apply(s));
      return true;
    },
  };
}

// The house curtain of the coming-soon pages, down. Two velvet panels with real folds (a vertex
// shader on a physical material with sheen), a pelmet carrying the Collective's mark, and a
// marquee board hung in front whose bulbs spell COMING SOON. A follow-spot tracks the pointer (or
// the finger), footlights warm the hem, and only the bulbs and the light behind the curtain bloom.
// Touch it and the cloth ripples from that point; drag across it and it parts a sliver, showing
// the lit stage behind, then falls closed again. The cloth sways slowly; nothing else moves on its
// own. Reduced motion: no sway and no ripples, and frames are drawn only when something changes.
//
// The page shows the same set as a still before three.js has loaded (soon.css draws it, in the
// same place and the same light), so this one starts at the still's light, hidden: load() builds
// it and compiles its shaders while the still is up, and reveal() brings the rig up once the page
// has faded it in: the bulbs warm up across the board, the glow grows and the follow-spot rises.
// The board's size and place are mirrored in soon.css; keep the two in step.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { frameGate } from '../../util/env.js';

// velvet and light per page, from the plum palette (tokens.css) and the gold of the stage lamps;
// `day` is the light theme's curtain (house lights up): a pale rose velvet in a lit house
const VARIANTS = {
  'flash-plays': { velvet: '#5a1f3c', sheen: '#c185ac', spot: '#fff3dc', flash: 2.2, day: { velvet: '#c99ab6', sheen: '#faf3f4' } },
  workshops: { velvet: '#4a1733', sheen: '#ddb8cf', spot: '#f3e7b8', flash: 1.4, day: { velvet: '#c492b0', sheen: '#faf3f4' } },
  outreach: { velvet: '#40142a', sheen: '#c185ac', spot: '#faf4de', flash: 1.4, day: { velvet: '#bd8aa9', sheen: '#faf3f4' } },
};
// the house around the curtain in each theme: the background, the fill from above and below, the
// exposure, the vignette and the marquee board
const HOUSE = {
  night: { bg: '#150408', sky: '#3a1a2a', ground: '#120408', hemi: 0.5, foot: 0.9, exposure: 1.05, vignette: 0.5, env: 0.22, board: '#2a0d1c', behind: '#f3e7b8' },
  day: { bg: '#f3e7e9', sky: '#faf3f4', ground: '#ddb8cf', hemi: 1.6, foot: 0.7, exposure: 1.0, vignette: 0.86, env: 0.55, board: '#40142a', behind: '#faf4de' },
};
const GOLD = '#ebd88c';
const FOV = 35;
const CAM_Z = 6;
const MAX_PART = 0.24; // how far a drag can part the curtain (fraction of a panel)
const PLEAT = 0.3; // world units between pleats
// the words' set width in canvas pixels (Lato Black at 180px, 10px tracking), for one line and for
// two: fixed, so the board has the same size here as in the still that soon.css draws
const SIGN_TEXT = { one: 1420, two: 814 };
// the still's light (what soon.css draws), as a share of the full rig: the follow-spot and the
// bulbs are low and nothing glows yet; reveal() raises them to 1 over LIGHT_UP seconds
const STILL = { spot: 0.4, bulbs: 0.42 };
const LIGHT_UP = 1.8;
const LIGHT_DELAY = 0.3; // after reveal(): the page's fade lands on the still's light first
const BLOOM = 0.75;

const DRAPE = /* glsl */ `
uniform float uTime, uPart, uSide, uPush, uSway, uWidth, uHeight, uPleats;
uniform vec3 uPointer;
uniform vec4 uRipples[4];
varying float vShade;
float gFold;

// the cloth at local point p: parted, pleated, swaying, pressed by the pointer, rippled by touches
vec3 drape(vec3 p) {
  float u = clamp(0.5 + uSide * p.x / uWidth, 0.0, 1.0); // 0 at the gap, 1 at the outer edge
  float v = clamp(p.y / uHeight + 0.5, 0.0, 1.0);        // 0 at the hem, 1 at the rod
  float pull = uPart * pow(1.0 - u, 1.6) * (0.35 + 0.65 * (1.0 - v));
  vec3 q = p;
  q.x += uSide * pull * uWidth;
  float k = 6.2831853 * uPleats;
  float n = sin(v * 3.1 + uTime * 0.21) * 0.35;
  float fold = sin(u * k + n) * 0.075 + sin(u * k * 2.17 + 1.3 + n) * 0.017;
  fold *= mix(1.15, 0.7, v) * (1.0 + pull * 3.0);
  gFold = fold;
  float sway = sin(uTime * 0.55 + u * 2.6 + v * 1.2) * 0.03 * uSway * (1.0 - 0.75 * v);
  q.z += fold + sway;
  vec2 w = (modelMatrix * vec4(q.x, q.y, 0.0, 1.0)).xy;
  float dp = distance(w, uPointer.xy);
  q.z -= uPush * 0.12 * exp(-dp * dp * 6.0);
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 2.6 || r.w <= 0.0) continue;
    float d = distance(w, r.xy);
    float front = age * 1.6;
    float band = exp(-pow((d - front) * 3.2, 2.0));
    q.z += band * sin((d - front) * 18.0) * 0.06 * r.w * exp(-age * 1.4);
  }
  return q;
}
`;

export class CurtainStage {
  /**
   * @param {HTMLElement} container
   * @param {object} o
   * @param {string} o.variant    the page ('flash-plays' | 'workshops' | 'outreach')
   * @param {string} o.markUrl    the gold mark (PNG with alpha) for the pelmet
   * @param {boolean} [o.reduced]
   * @param {'dark'|'light'} [o.theme]  the site theme (setTheme changes it)
   */
  constructor(container, { variant, markUrl, reduced = false, theme = 'dark' }) {
    this.container = container;
    this.reduced = reduced;
    this.v = VARIANTS[variant] ?? VARIANTS.workshops;
    this.markUrl = markUrl;
    this.running = false;
    this.visible = true;
    this.dirty = true;
    this.disposed = false;
    // the theme: 0 the dark theatre, 1 house lights up; eased toward its target in the frame loop
    this.day = theme === 'light' ? 1 : 0;
    this.dayTarget = this.day;
    this.velvetMats = [];
    // the light cue: 0 the still's light, 1 the full rig (reveal() starts it; -1 not yet)
    this.lit = 0;
    this.litFrom = -1;
    this.spotLevel = STILL.spot;
    this.ready = false;

    // no multisampling on the canvas: the set is drawn into the composer's own targets (which have
    // none), and the only thing drawn to the canvas is the output pass's full-screen quad, so the
    // pixels are the same without the 4x buffer (66 MB at 1080p) and its resolve every frame
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    // the canvas stays hidden until the page fades it in over the still (soon.css)
    container.append(r.domElement);
    // the browser can take the context away while the page is open (its GPU process crashed): the
    // loop stops and the page shows its still velvet (onLost, src/pages/soon.js); when it is given
    // back, three restores its programs, buffers and maps, the room's light (drawn into a target) is
    // made again, and the curtain carries on (onRestored)
    this.lost = false;
    this.onLost = null;
    this.onRestored = null;
    this._onLost = (e) => {
      e.preventDefault(); // so the browser may give it back
      if (this.lost) return;
      this.lost = true;
      this._sync();
      this.onLost?.();
    };
    this._onRestored = () => {
      if (this.disposed || !this.lost) return;
      this.lost = false;
      if (this.ready) {
        this._makeEnv();
        this._wake();
        this._render();
      }
      this._sync();
      this.onRestored?.();
    };
    r.domElement.addEventListener('webglcontextlost', this._onLost);
    r.domElement.addEventListener('webglcontextrestored', this._onRestored);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#150408');
    this.scene.environmentIntensity = 0.22; // the room's light itself is made in load()

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    this.camera.position.set(0, 0, CAM_Z);
    this.clock = new THREE.Clock();

    // shared by both panels (the side is each panel's own)
    this.u = {
      uTime: { value: 0 },
      uPart: { value: 0 },
      uPush: { value: 0 },
      uSway: { value: reduced ? 0 : 1 },
      uWidth: { value: 1 },
      uHeight: { value: 1 },
      uPleats: { value: 8 },
      uPointer: { value: new THREE.Vector3(0, 0, 0) },
      uRipples: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
    };
    this.ripple = 0;

    // interaction state, eased toward its targets in the frame loop
    this.target = { part: 0, push: 0, x: 0, y: 0 };
    this.state = { part: 0, push: 0, x: 0, y: 0 };
    this.swing = { a: 0, v: 0 }; // the board's swing, a damped spring
    this.chase = -1; // the bulbs' sweep after a touch (0..1.3), -1 idle
    this.flash = 0;
    this.drag = null;

    this._buildLights();
    this._buildComposer();
    this._onPointer = this._onPointer.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._tick = this._tick.bind(this);
    this._gate = frameGate(); // under the phone tier, at most 60 frames a second
    container.addEventListener('pointermove', this._onPointer, { passive: true });
    container.addEventListener('pointerdown', this._onDown, { passive: true });
    container.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    let resizeTimer = 0;
    this.ro = new ResizeObserver(() => {
      // (its first call, as it starts observing, finds the set already built for this size)
      const v = this.view;
      if (v && v.px === this.container.clientWidth && v.py === this.container.clientHeight) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this._layout(), 120);
    });
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._sync(); });
    this._onVisibility = () => this._sync();
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  /**
   * Load the mark and the type, build the set, compile it and start drawing, still hidden and at
   * the still's light. Resolves once frames are being drawn, ready to be faded in (then reveal()).
   * The heavy steps are spread over separate frames so the page never stalls for long.
   */
  async load() {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const manager = new THREE.LoadingManager();
    const loaded = new Promise((resolve) => { manager.onLoad = resolve; manager.onError = resolve; });
    this.markTex = new THREE.TextureLoader(manager).load(this.markUrl, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
    await Promise.all([loaded, document.fonts.load('900 200px Lato').catch(() => {})]);
    if (this.disposed) return;
    const r = this.renderer;
    // shaders are compiled for a render target (no tone mapping there, so the programs match the
    // ones drawn into the composer's targets), in parallel where the browser can, so building the
    // set never stalls the page for long
    const compile = (scene) => {
      r.setRenderTarget(this.composer.readBuffer);
      const done = r.compileAsync(scene, this.camera);
      r.setRenderTarget(null);
      return done.catch(() => {});
    };
    // the room's soft light for the sheen and the gold
    const room = new RoomEnvironment();
    await compile(room);
    await frame();
    if (this.disposed) return;
    this._makeEnv(room);
    await frame();
    if (this.disposed) return;
    this._layout();
    this._applyLit();
    // the set, and the glow's and the vignette's own passes (on stand-in quads)
    const passes = new THREE.Scene();
    const quad = new THREE.PlaneGeometry(2, 2);
    const b = this.bloom;
    for (const m of [b.materialHighPassFilter, ...(b.separableBlurMaterials ?? []), b.compositeMaterial, b.blendMaterial, this.vignette.material]) {
      if (m?.isMaterial) passes.add(new THREE.Mesh(quad, m));
    }
    await Promise.all([compile(this.scene), compile(passes)]);
    quad.dispose();
    if (this.disposed) return;
    await frame();
    if (this.disposed) return;
    this.ready = true;
    this._render(); // the first frame, hidden
    this.ro.observe(this.container);
    this.io.observe(this.container);
    this._sync();
    // two frames drawn by the loop before the page shows it
    await frame();
    await frame();
  }

  /** The room's soft light for the sheen and the gold, pre-filtered. */
  _makeEnv(room = new RoomEnvironment()) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment?.dispose();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.dispose?.();
  }

  /** Bring the rig up from the still's light (the page fades the canvas in as this starts). */
  reveal() {
    if (this.litFrom >= 0) return;
    this.litFrom = performance.now() + (this.reduced ? 0 : LIGHT_DELAY * 1000);
    if (!this.running) this._pausedAt = performance.now();
    this._wake();
  }

  // ---- the set ----

  _buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#3a1a2a', '#120408', 0.5);
    s.add(this.hemi);
    // footlights: warm, from below the front edge of the stage
    const foot = (this.foot = new THREE.DirectionalLight('#ffb36b', 0.9));
    foot.position.set(0, -3, 4);
    s.add(foot);
    // the follow-spot, from the front of house
    this.spot = new THREE.SpotLight(this.v.spot, 95, 0, 0.27, 0.55, 2);
    this.spot.position.set(0, 4.2, CAM_Z + 1.5);
    s.add(this.spot, this.spot.target);
    this.spotBase = 95;
  }

  _buildComposer() {
    const c = (this.composer = new EffectComposer(this.renderer));
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM, 0.5, 1.05);
    c.addPass(this.bloom);
    // the house is dark at the edges: a soft vignette (no grain, no other screen effect)
    c.addPass((this.vignette = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uEdge: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uEdge; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 q = (vUv - 0.5) * vec2(1.15, 1.0);
          c.rgb *= mix(uEdge, 1.0, smoothstep(0.85, 0.2, length(q)));
          gl_FragColor = c;
        }`,
    })));
    c.addPass(new OutputPass());
  }

  _velvet(side) {
    const m = new THREE.MeshPhysicalMaterial({
      color: this.v.velvet,
      roughness: 0.82,
      sheen: 1,
      sheenColor: new THREE.Color(this.v.sheen),
      sheenRoughness: 0.38,
      side: THREE.DoubleSide,
      envMapIntensity: 0.6,
    });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u, { uSide: { value: side } });
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${DRAPE}\nvoid main() {`)
        .replace('#include <beginnormal_vertex>', `
          vec3 dA = drape(position + vec3(0.004, 0.0, 0.0));
          vec3 dB = drape(position + vec3(0.0, 0.004, 0.0));
          vec3 d0 = drape(position);
          vec3 objectNormal = normalize(cross(dA - d0, dB - d0));
          vShade = 0.62 + 0.38 * smoothstep(-0.075, 0.075, gFold);`)
        .replace('#include <begin_vertex>', 'vec3 transformed = d0;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying float vShade;\nvoid main() {')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vShade;');
    };
    m.customProgramCacheKey = () => 'curtain-velvet';
    this.velvetMats.push(m);
    return m;
  }

  _clearSet() {
    this.velvetMats = [];
    if (!this.set) return;
    this.set.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.bulbMat) o.material.dispose?.();
    });
    this.scene.remove(this.set);
    this.set = null;
  }

  _layout() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const viewH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const viewW = viewH * this.camera.aspect;
    this.view = { w: viewW, h: viewH, px: w, py: h };
    this._clearSet();
    const set = (this.set = new THREE.Group());

    // behind the curtain: the lit stage, seen only through the gap
    this.behind = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#f3e7b8') }, uGlow: { value: 0.5 } }, // gold-300: the stage lamps
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uGlow; varying vec2 vUv;
        void main() {
          float x = abs(vUv.x - 0.5) * 2.0;
          float beam = exp(-x * x * 16.0) * (0.45 + 0.55 * vUv.y);
          gl_FragColor = vec4(uColor * beam * uGlow + vec3(0.03, 0.01, 0.02), 1.0);
        }`,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(viewW * 1.4, viewH * 1.3), this.behind);
    back.position.z = -0.9;
    set.add(back);

    // the two panels, meeting at the middle (the right one a hair in front)
    const panelW = (viewW * 1.14) / 2;
    const panelH = viewH * 1.16;
    this.u.uWidth.value = panelW;
    this.u.uHeight.value = panelH;
    this.u.uPleats.value = Math.max(3, panelW / PLEAT);
    const segX = Math.min(220, Math.round(panelW * 70));
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH, segX, 90), this._velvet(side));
      mesh.position.set(side * (panelW / 2 - 0.05), viewH * 0.05, side > 0 ? 0.04 : 0);
      mesh.frustumCulled = false;
      set.add(mesh);
    }

    // the pelmet across the top, with a gold trim and the mark
    // the pelmet hangs below the top bar (which covers the top of the stage)
    const bar = Math.min(0.2, 64 / h); // --topbar-h
    const valH = viewH * ((this.camera.aspect < 0.8 ? 0.08 : 0.1) + bar);
    const valY = viewH / 2 - valH / 2 + 0.01;
    const valanceMat = new THREE.MeshPhysicalMaterial({ color: this.v.velvet, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(this.v.sheen), sheenRoughness: 0.4, envMapIntensity: 0.4 });
    this.velvetMats.push(valanceMat);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(viewW * 1.3, valH, 0.14), valanceMat);
    valance.position.set(0, valY, 0.32);
    set.add(valance);
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.8, roughness: 0.42, envMapIntensity: 0.8 });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(viewW * 1.3, 0.03, 0.16), goldMat);
    trim.position.set(0, valY - valH / 2, 0.33);
    set.add(trim);
    if (this.markTex?.image) {
      const img = this.markTex.image;
      const mh = (valH - viewH * bar) * 0.8;
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(mh * (img.width / img.height), mh),
        new THREE.MeshStandardMaterial({ map: this.markTex, transparent: true, alphaTest: 0.4, metalness: 0.3, roughness: 0.5, envMapIntensity: 0.7 }),
      );
      mark.position.set(0, valY - (viewH * bar) / 2, 0.32 + 0.071);
      set.add(mark);
    }

    // the marquee board, hung from the pelmet on two cables
    this._buildSign(set, viewW, viewH, valY - valH / 2, goldMat);

    this.scene.add(set);
    this._applyDay();
    // the spot keeps its place in the new frame (the first one waits for the shaders: load())
    this.dirty = true;
    if (this.ready) this._render();
  }

  _buildSign(set, viewW, viewH, hangY, goldMat) {
    const twoLines = this.camera.aspect < 0.85;
    const lines = twoLines ? ['COMING', 'SOON'] : ['COMING SOON'];
    // rasterise the words in Lato Black and put a bulb on every lit cell of a grid
    const step = 13;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const type = (px) => {
      ctx.font = `900 ${px}px Lato, "Helvetica Neue", Arial, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${px / 18}px`;
    };
    // the words fill their set width: a fallback face, or no tracking, is scaled to it
    const setW = twoLines ? SIGN_TEXT.two : SIGN_TEXT.one;
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
    const pts = [];
    for (let y = step / 2; y < cv.height; y += step) {
      const row = Math.floor((y / step)) % 2 ? step / 2 : 0; // offset alternate rows: a denser, rounder fill
      for (let x = step / 2 + row; x < cv.width; x += step) {
        if (data[(Math.floor(y) * cv.width + Math.floor(x)) * 4 + 3] > 140) pts.push([x, y]);
      }
    }
    const signW = Math.min(viewW * (twoLines ? 0.6 : 0.64), 3.6);
    const scale = signW / cv.width;
    const signH = cv.height * scale;
    const pad = signH * (twoLines ? 0.14 : 0.24);
    const top = hangY - viewH * (twoLines ? 0.08 : 0.07); // the board's top edge, below the pelmet

    const sign = (this.sign = new THREE.Group());
    sign.position.set(0, top, 0.62); // the pivot is the top edge, where it hangs
    set.add(sign);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(signW + pad * 2, signH + pad * 2, 0.05),
      (this.boardMat = new THREE.MeshStandardMaterial({ color: '#2a0d1c', roughness: 0.55, metalness: 0.1, envMapIntensity: 0.5 })),
    );
    board.position.y = -(signH / 2 + pad);
    sign.add(board);
    const fw = signW + pad * 2, fh = signH + pad * 2, t = 0.035;
    for (const [x, y, sx, sy] of [[0, fh / 2, fw + t, t], [0, -fh / 2, fw + t, t], [-fw / 2, 0, t, fh], [fw / 2, 0, t, fh]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.07), goldMat);
      bar.position.set(x, board.position.y + y, 0.01);
      sign.add(bar);
    }
    // cables up to the pelmet
    const cableLen = Math.max(0.05, hangY - sign.position.y);
    for (const x of [-fw * 0.38, fw * 0.38]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cableLen, 6), goldMat);
      cable.position.set(x, cableLen / 2, -0.01);
      sign.add(cable);
    }

    // the bulbs: instanced, unlit, brighter than white so the bloom takes them
    const radius = step * scale * 0.34;
    const geo = new THREE.SphereGeometry(radius, 10, 8);
    this.bulbMat ??= new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const bulbs = (this.bulbs = new THREE.InstancedMesh(geo, this.bulbMat, pts.length));
    const m = new THREE.Matrix4();
    this.bulbX = new Float32Array(pts.length); // 0..1 across the board, for the sweep
    this.bulbPos = [];
    pts.forEach(([x, y], i) => {
      const wx = (x - cv.width / 2) * scale;
      const wy = -(signH / 2 + pad) - (y - cv.height / 2) * scale;
      m.makeTranslation(wx, wy, 0.04);
      bulbs.setMatrixAt(i, m);
      this.bulbX[i] = x / cv.width;
      this.bulbPos.push(wx, wy);
    });
    bulbs.instanceMatrix.needsUpdate = true;
    sign.add(bulbs);
    this.bulbBase = new THREE.Color(1.0, 0.8, 0.5).multiplyScalar(2.2);
    this._lightBulbs(true);
  }

  /**
   * Bulb brightness: warmed up across the board by the light cue, then steady, brighter near the
   * pointer, and swept once after a touch.
   */
  _lightBulbs(force = false) {
    const b = this.bulbs;
    if (!b) return;
    const near = this.state.push > 0.02;
    const lit = this.lit;
    if (!force && !near && this.chase < 0 && !this._bulbsHot && this._bulbsLit === lit) return;
    const c = this._c ??= new THREE.Color();
    // the pointer in the board's space
    const local = this.sign.worldToLocal((this._v ??= new THREE.Vector3()).set(this.state.x, this.state.y, this.sign.position.z));
    let hot = false;
    for (let i = 0; i < b.count; i++) {
      let k = 1;
      if (lit < 1) {
        // each bulb warms up in turn from the left, over half the cue
        const q = Math.min(1, Math.max(0, (lit - this.bulbX[i] * 0.5) / 0.5));
        k = STILL.bulbs + (1 - STILL.bulbs) * q * q * (3 - 2 * q);
      }
      if (near) {
        const dx = this.bulbPos[i * 2] - local.x, dy = this.bulbPos[i * 2 + 1] - local.y;
        k += 0.9 * this.state.push * Math.exp(-(dx * dx + dy * dy) * 9);
      }
      if (this.chase >= 0) k += 1.4 * Math.exp(-(((this.bulbX[i] - this.chase) * 7) ** 2));
      if (k > 1.001) hot = true;
      b.setColorAt(i, c.copy(this.bulbBase).multiplyScalar(k));
    }
    this._bulbsHot = hot;
    this._bulbsLit = lit;
    b.instanceColor.needsUpdate = true;
  }

  // ---- interaction ----

  _toWorld(e) {
    const r = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit) ? hit : null;
  }

  _onPointer(e) {
    const p = this._toWorld(e);
    if (p && (e.pointerType === 'mouse' || this.drag)) {
      this.target.x = p.x;
      this.target.y = p.y;
      this.target.push = 1;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return this._wake();
    const dx = e.clientX - d.x0;
    if (!d.mode) {
      if (Math.hypot(dx, e.clientY - d.y0) < 8) return this._wake();
      d.mode = Math.abs(dx) > Math.abs(e.clientY - d.y0) ? 'part' : 'scroll';
    }
    if (d.mode !== 'part') return this._wake();
    const w = this.container.clientWidth;
    this.target.part = Math.min(1, Math.abs(dx) / (w * 0.4)) * MAX_PART;
    // the board swings with the hand
    const now = performance.now();
    const vx = (e.clientX - d.lx) / Math.max(1, now - d.lt);
    this.swing.v += THREE.MathUtils.clamp(vx, -3, 3) * 0.004;
    d.lx = e.clientX;
    d.lt = now;
    this._wake();
  }

  _onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, lt: performance.now(), mode: null };
    const p = this._toWorld(e);
    if (p) { this.target.x = p.x; this.target.y = p.y; }
    if (e.pointerType !== 'mouse') this.target.push = 0.6;
    this._wake();
  }

  _onUp(e) {
    const d = this.drag;
    if (!d || (e && e.pointerId !== d.id)) return;
    this.drag = null;
    if (!d.mode && e?.type === 'pointerup') this._touch(this.target.x, this.target.y);
    this.target.part = 0;
    if (e?.pointerType !== 'mouse') this.target.push = 0;
    this._wake();
  }

  _onLeave(e) {
    if (e.pointerType === 'mouse' && !this.drag) { this.target.push = 0; this._wake(); }
  }

  /** A touch: the cloth ripples from it, the bulbs sweep, the spot flares. */
  _touch(x, y) {
    if (!this.reduced) {
      const r = this.u.uRipples.value[this.ripple++ % 4];
      r.set(x, y, this.u.uTime.value, 1);
    }
    this.chase = 0;
    this.flash = 1;
    this.swing.v += (Math.random() - 0.5) * 0.01;
  }

  // ---- frame loop ----

  _sync() {
    const go = this.visible && !document.hidden && !this.disposed && !this.lost;
    if (go && !this.running) {
      this.running = true;
      // a light cue not yet seen, or cut short, plays on from where it was when it comes into view
      if (this._pausedAt !== undefined && this.litFrom >= 0) this.litFrom += performance.now() - this._pausedAt;
      this._pausedAt = undefined;
      this.clock.getDelta();
      this.renderer.setAnimationLoop(this._tick);
    } else if (!go && this.running) {
      this.running = false;
      if (this.lit < 1) this._pausedAt = performance.now();
      this.renderer.setAnimationLoop(null);
    }
  }

  _wake() { this.dirty = true; }

  /** Nothing but the slow sway is going on: no input easing, no chase or flash, no light or theme cue, no ripple. */
  _calm() {
    if (this.reduced || this.dirty || this._wasMoving) return false;
    if (this.litFrom >= 0 && this.lit < 1) return false;
    if (this.day !== this.dayTarget) return false;
    const now = this.u.uTime.value;
    for (const r of this.u.uRipples.value) if (r.w > 0 && now - r.z < 2.6) return false;
    return true;
  }

  _tick(time) {
    if (!this._gate(time ?? performance.now())) return; // the frame's own time, not when this callback began
    // at rest, every other frame is enough: the sway (amplitude 0.03, 0.55 rad/s) and the pleats'
    // drift move under one shade between frames, so the skipped frame would look the same, and the
    // GPU does half the work (this page's whole chain: velvet, glow, vignette) while the visitor reads
    if (this._calm()) { this._skipped = !this._skipped; if (this._skipped) return; } else this._skipped = false;
    const dt = Math.min(0.05, this.clock.getDelta());
    const s = this.state, t = this.target;
    const ease = (k) => 1 - Math.exp(-dt * k);
    const before = s.part + s.push + s.x + s.y + this.swing.a;
    s.part += (t.part - s.part) * ease(this.drag?.mode === 'part' ? 12 : 2.4);
    s.push += (t.push - s.push) * ease(6);
    s.x += (t.x - s.x) * ease(7);
    s.y += (t.y - s.y) * ease(7);
    // the board: a damped pendulum
    this.swing.v += (-this.swing.a * 26 - this.swing.v * 4.2) * dt;
    this.swing.a += this.swing.v * dt * 10;
    if (this.sign) this.sign.rotation.z = this.reduced ? 0 : this.swing.a;
    if (this.chase >= 0) { this.chase += dt * 1.5; if (this.chase > 1.3) this.chase = -1; }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.litFrom >= 0 && this.lit < 1) {
      // the light cue, by the wall clock too; reduced motion: at once (the page's fade is the change)
      const p = (performance.now() - this.litFrom) / (LIGHT_UP * 1000);
      this.lit = this.reduced ? 1 : Math.min(1, Math.max(0, p));
      this._applyLit();
      this.dirty = true;
    }
    if (this.day !== this.dayTarget) {
      // by the wall clock (a slow frame must not stretch the change): 0.7 s from end to end
      const now = performance.now();
      const step = this.reduced ? 1 : (now - (this._dayAt ?? now - 16)) / 700;
      this._dayAt = now;
      this.day = this.dayTarget > this.day ? Math.min(this.dayTarget, this.day + step) : Math.max(this.dayTarget, this.day - step);
      this._applyDay();
      this.dirty = true;
    }

    const moving = Math.abs(s.part + s.push + s.x + s.y + this.swing.a - before) > 1e-5 || this.chase >= 0 || this.flash > 0;
    this._wasMoving = moving;
    if (this.reduced && !moving && !this.dirty) return; // nothing changed: keep the last frame
    this.dirty = false;

    this.u.uTime.value += this.reduced ? 0 : dt;
    this.u.uPart.value = s.part;
    this.u.uPush.value = s.push;
    this.u.uPointer.value.set(s.x, s.y, 0);
    this.spot.target.position.set(s.x * 0.85, s.y * 0.85, 0);
    this.spot.intensity = this.spotBase * this.spotLevel * (0.75 + 0.25 * Math.max(s.push, 0.5)) * (1 + this.flash * (this.v.flash - 1));
    this.behind.uniforms.uGlow.value = 0.12 + (s.part / MAX_PART) * 1.9;
    this._lightBulbs();
    this._render();
  }

  _render() { this.composer.render(); }

  /** The rig at the light cue's level: the follow-spot rises and the glow grows (bulbs: above). */
  _applyLit() {
    const rise = (a, b) => {
      const t = Math.min(1, Math.max(0, (this.lit - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    this.spotLevel = STILL.spot + (1 - STILL.spot) * rise(0.1, 1);
    this.bloom.strength = BLOOM * rise(0, 0.85);
    // at zero the glow adds nothing: its passes are skipped (its programs were compiled all the same)
    this.bloom.enabled = this.bloom.strength > 0;
  }

  /**
   * Follow the site theme: 'light' raises the house lights and hangs the pale curtain. It eases
   * there, unless `instant` (the switch is being pictured for its reveal, src/ui/theme.js).
   */
  setTheme(theme, { instant = false } = {}) {
    this.dayTarget = theme === 'light' ? 1 : 0;
    this._dayAt = performance.now();
    // and before it is shown at all: the still has changed at once, and this one must land on the
    // still's picture when it fades in
    if ((instant || this.litFrom < 0) && this.day !== this.dayTarget) {
      this.day = this.dayTarget;
      this._applyDay();
      if (instant && this.ready) this._render(); // drawn now, in time for the picture
    }
    this._wake();
  }

  /** The theme's colours and light, blended by `day` (eased 0..1). */
  _applyDay() {
    const k = this.day * this.day * (3 - 2 * this.day);
    const N = HOUSE.night, D = HOUSE.day;
    const mix = (a, b, out = new THREE.Color()) => out.set(a).lerp(this._dayTmp.set(b), k);
    const num = (a, b) => a + (b - a) * k;
    this._dayTmp ??= new THREE.Color();
    mix(N.bg, D.bg, this.scene.background);
    mix(N.sky, D.sky, this.hemi.color);
    mix(N.ground, D.ground, this.hemi.groundColor);
    this.hemi.intensity = num(N.hemi, D.hemi);
    this.foot.intensity = num(N.foot, D.foot);
    this.renderer.toneMappingExposure = num(N.exposure, D.exposure);
    this.scene.environmentIntensity = num(N.env, D.env);
    this.vignette.uniforms.uEdge.value = num(N.vignette, D.vignette);
    const velvet = mix(this.v.velvet, this.v.day.velvet), sheen = mix(this.v.sheen, this.v.day.sheen);
    for (const m of this.velvetMats) { m.color.copy(velvet); m.sheenColor.copy(sheen); }
    if (this.boardMat) mix(N.board, D.board, this.boardMat.color);
    if (this.behind) mix(N.behind, D.behind, this.behind.uniforms.uColor.value);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.container.removeEventListener('pointermove', this._onPointer);
    this.container.removeEventListener('pointerdown', this._onDown);
    this.container.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this._clearSet();
    this.bulbMat?.dispose();
    this.markTex?.dispose();
    this.behind?.dispose();
    this.scene.environment?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

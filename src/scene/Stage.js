// The stage: renderer, lights, statue, camera rig and the camera-locked Penrose ring.
//
// Camera rig: the camera orbits the statue (scroll arc + cursor parallax) and dollies in slightly.
// The ring rides on the camera, so its impossible-shape illusion is exact at every frame; it only
// ever turns about the camera's viewing axis. The statue stands on a turntable of its own,
// independent of the ring, and plays the scroll sequence (src/scene/sequence.js): it turns 180
// degrees to face the viewer while its skeleton brings the mask beside the face and turns the head
// away, then its surface flows into the 3D logo (src/scene/morph.js): mask, hand and face into the
// logo's own, at her head, before the logo grows out to its place. Its bounding sphere is
// centred on the turning axis and covers every frame of that sequence (rest pose, end pose, logo,
// and the morph's mid-flight lift), and it stays inside the ring's hole, so the two never overlap.
//
// GSAP writes plain numbers into `stage.state` (including `seq`, the page progress); the render
// loop reads them.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRing, placeRing } from './ringStone.js';
import { loadStatue, prepareStatue, forEachVertex, STATUE_LAYER } from './statue.js';
import { SilhouetteMask } from './silhouette.js';
import { evaluate, TURN } from './sequence.js';
import { growAt, MORPH, morphJob, buildInWorker, buildHere, assembleMorph } from './morph.js';
import { mark } from '../util/perf.js';
import { VectorLogo } from './vectorLogo.js';
import { LogoStar } from './star.js';
import { hexToVec3, flattenStar } from './flat.js';

const DEG = Math.PI / 180;
const DRAG_RAD_PER_PX = Math.PI / 420; // a 420 px drag turns the statue half way round
const MAX_FLING = 8; // rad/s; a hard flick coasts about half a turn
const FOLLOW = 10 * DEG; // how far the statue leans toward the cursor
const LOGO_SWAY = 0.35; // radians: the logo turns away and back over the logo phase
const LOGO_DRIFT = 0.08; // radians: the slow idle sway while the logo holds
// the close-up (zoom phase): her head, hand and mask, with the logo's forming on them, fill at
// most this share of the view's height and width (on a phone the width decides)
const CLOSE_UP = { height: 0.45, width: 0.7 };
const CLOSE_UP_SIZE = { width: 0.42, height: 0.4 }; // statue units, about her head, hand and mask, until the morph is built
const UP = new THREE.Vector3(0, 1, 0);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the vector track: the 3D logo goes flat over its first FLAT_BY; there the vector, by then the same
// picture, replaces it in one frame, and over the rest it may start on its way into the footer
const FLAT_BY = 0.8;
const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (n) => Math.round(((pa >> n) & 255) + (((pb >> n) & 255) - ((pa >> n) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

export class Stage {
  /**
   * @param {object} o
   * @param {HTMLElement} o.container  element that receives the canvas (sized by CSS)
   * @param {object} o.colors          { warm, cool, rim, floor } CSS colour strings from the design tokens
   * @param {boolean} o.reducedMotion
   */
  constructor({ container, colors, reducedMotion }) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    const white = new THREE.Color(1, 1, 1);
    this.colors = {
      // stage light = the token colour carried toward white, so marble stays white rather than khaki
      warm: new THREE.Color(colors.warm).lerp(white, 0.35),
      cool: new THREE.Color(colors.cool).lerp(white, 0.2),
      rim: new THREE.Color(colors.rim),
      floor: new THREE.Color(colors.floor),
    };
    this.state = {
      stageLight: 0, // intro: 0 = darkness, 1 = lit
      ringReveal: 0, // intro: ring opacity
      lightMix: 0, // 0 warm, 1 cool
      keyLevel: 1, // per-scene key light level
      ringLevel: 1, // per-scene ring brightness (eased back behind text)
      frameX: 0, frameY: 0, // composition offset, fractions of the viewport (right / up)
      spin: 0, // ring turn about the viewing axis (radians)
      seq: 0, // the statue's sequence: page progress 0..1 (src/scene/sequence.js)
      arc: 0, // camera orbit around the statue (radians)
      dolly: 1, // camera distance multiplier (1 = hero, < 1 = closer)
      parX: 0, parY: 0, // smoothed cursor parallax, -1..1
      daylight: 0, // 0 = the dark theatre, 1 = house lights up (light theme)
    };
    // the statue's own turn on top of the scroll: drag (with fling), lean toward the cursor, hover
    this.turn = { drag: 0, vel: 0, held: false, follow: 0, hover: 0, hoverTarget: 0 };
    this.pointer = { x: 0, y: 0 };
    this.fill = 0.68; // statue height as a fraction of the viewport (hero, desktop)
    this.running = false;
    this.disposed = false;
    // the browser has dropped the WebGL context (a GPU crash): nothing is drawn until it is given
    // back; `onLost` and `onRestored` let the page show its still picture meanwhile (src/main.js)
    this.lost = false;
    this.onLost = null;
    this.onRestored = null;
    this._resume = false; // asked to run while lost: runs again once restored
    this._lastSig = '';
    this._maskDue = 0;
    this._shadowYaw = NaN;
    this._shapeSig = '';
    this.seqOverride = null; // ?debug: a number here replaces the scroll
    this.tracks = evaluate(0);
    this.time = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // three.js otherwise asks the driver for every program's info log on its first use, which
    // waits for the link to finish; the logs are only read with ?debug
    renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // lights never move; the map is redrawn only when the statue turns
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this._onLost = this._onLost.bind(this);
    this._onRestored = this._onRestored.bind(this);
    renderer.domElement.addEventListener('webglcontextlost', this._onLost);
    renderer.domElement.addEventListener('webglcontextrestored', this._onRestored);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(14, 1, 0.1, 400);
    this.scene.add(this.camera); // the ring is the camera's child

    this._makeEnv();
    this.scene.environmentIntensity = 0;

    this._buildLights();
    this._resize = this._resize.bind(this);
    this.resizeObserver = new ResizeObserver(this._resize);
    this.resizeObserver.observe(container);
    this._tick = this._tick.bind(this);
    this.clock = new THREE.Clock(false);
  }

  /**
   * The room the marble reflects (three's RoomEnvironment), pre-filtered. After a lost context the
   * old one is let go rather than disposed: its GPU objects went with the context.
   */
  _makeEnv({ restored = false } = {}) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    if (!restored) this.envTarget?.dispose();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    room.dispose();
    pmrem.dispose();
  }

  // ---- a lost WebGL context ----
  // The browser can take the context away while the page is open (its GPU process crashed). The
  // loop stops, the footer's own mark comes back (the stage's logo was bringing it in) and the page
  // shows its still picture (onLost); the vector stand-in is put away. When the browser gives the
  // context back, three restores its own programs, buffers and textures; what was drawn into a
  // target (the room the marble reflects, the shadow) is made again, and the stage carries on
  // where the scroll has got to.

  _onLost(e) {
    e.preventDefault(); // so the browser may give it back
    if (this.lost) return;
    this.lost = true;
    const was = this.running;
    this.stop();
    this._resume = was;
    this.vector?.setOpacity(0);
    if (this.emblem) { this.emblem.style.opacity = ''; this._emblemO = undefined; }
    this.onLost?.();
  }

  _onRestored() {
    if (this.disposed || !this.lost) return;
    this._makeEnv({ restored: true });
    this.renderer.shadowMap.needsUpdate = true;
    this.lost = false;
    this._lastSig = '';
    this._maskDue = 0;
    this._vectorKey = null; // the vector's colours are read from the canvas again
    this.onRestored?.();
    this.renderOnce();
    if (this._resume) this.start();
    this._resume = false;
  }

  _buildLights() {
    // warm key spotlight from above right of the audience, soft shadows
    const key = new THREE.SpotLight(this.colors.warm, 0, 0, 0.36, 0.85, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    // a cool, faint rim from behind
    const rim = new THREE.SpotLight(this.colors.rim, 0, 0, 0.5, 1, 2);
    const hemi = new THREE.HemisphereLight(this.colors.rim, 0x000000, 0);
    this.lights = { key, rim, hemi };
    this.scene.add(key, key.target, rim, rim.target, hemi);
  }

  /** Load textures and the statue through one LoadingManager. onProgress(0..1). */
  async load({ statueUrl, textureUrls, yaw = Math.PI, onProgress = () => {} }) {
    const manager = new THREE.LoadingManager();
    let bytes = 0, items = 0, itemsTotal = 1;
    const report = () => onProgress(Math.min(0.99, 0.15 * (items / itemsTotal) + 0.85 * bytes));
    manager.onProgress = (_url, loaded, total) => { items = loaded; itemsTotal = total; report(); };
    const texLoader = new THREE.TextureLoader(manager);
    const loadTex = (url, srgb) => texLoader.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return t;
    });
    const [albedo, normal, statue] = await Promise.all([
      loadTex(textureUrls.albedo, true),
      loadTex(textureUrls.normal, false),
      loadStatue(statueUrl, {
        manager,
        // every chunk is reported, its share only when the length is known: a caller watching for a stall
        // (src/main.js) hears that bytes are still arriving either way
        onBytes: (e) => { if (e.lengthComputable) bytes = e.loaded / e.total; report(); },
      }),
    ]);
    mark('statue decoded');
    if (this.disposed) return;

    this.statue = prepareStatue(statue.object, { kind: statue.kind, yaw });
    this.skinned = null;
    this.statue.root.traverse((o) => { if (o.isSkinnedMesh && !this.skinned) this.skinned = o; });
    this._readPose(statue.animations);
    if (this.pose.length) {
      // the ring clearance must hold at the end pose too (the arm moves outward)
      this._applyPose(1, 1);
      let r = this.statue.radius;
      forEachVertex(this.statue.root, (p) => { r = Math.max(r, p.distanceTo(this.statue.center)); });
      this.statue.radiusRest = this.statue.radius;
      this.statue.radius = r;
      this._applyPose(0, 0);
    }
    // the turntable turns about the statue's vertical axis (x = z = 0, through the plinth)
    this.turntable = new THREE.Group();
    this.turntable.name = 'Turntable';
    this.turntable.add(this.statue.root);
    this.scene.add(this.turntable);

    this.ring = createRing({ albedo, normal });
    this.camera.add(this.ring.root);
    this.ringTint = this.statue.averageColor ?? new THREE.Color(0xe9e5de);

    this._buildFloor();
    this._aimLights();
    this._frameStatue();
    this.mask = new SilhouetteMask(this.renderer);
    this.renderer.shadowMap.needsUpdate = true;
    mark('stage built');
    // size the view without drawing: the first frame waits for warm(), which compiles the shaders
    this._sizing = true;
    this._resize();
    this._sizing = false;
    onProgress(1);
  }

  _buildFloor() {
    // No visible floor: only what the spotlight puts on it. A shadow-catcher gives the soft
    // contact shadow under the plinth, and an additive pool of warm light falls off into the
    // page ground, so nothing here can darken the background.
    const H = this.statue.height;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(H * 1.4, 48),
      new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.receiveShadow = true;

    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const poolTex = new THREE.CanvasTexture(c);
    poolTex.colorSpace = THREE.SRGBColorSpace;
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(H * 1.5, H * 1.5),
      new THREE.MeshBasicMaterial({ map: poolTex, color: this.colors.warm, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.001;
    this.floor = { shadow, pool };
    this.scene.add(shadow, pool);
  }

  _aimLights() {
    const { key, rim, hemi } = this.lights;
    const H = this.statue.height;
    const c = this.statue.center;
    key.position.set(1.35 * H, 2.9 * H, 1.6 * H);
    key.target.position.set(c.x, c.y * 0.9, c.z);
    key.shadow.camera.far = 6 * H;
    rim.position.set(-1.4 * H, 2.1 * H, -1.8 * H);
    rim.target.position.copy(c);
    hemi.position.set(0, 4 * H, 0);
    this.keyPower = 26 * H * H; // candela-ish, tuned for decay 2 at ~3.5H
    this.rimPower = 9 * H * H;
  }

  /**
   * Choose the camera distance and field of view.
   * The statue's bounding sphere (seen from the closest camera position) must fit inside the ring's
   * hole with a margin, at any spin; the field of view then sets the statue to `fill` of the height.
   */
  _frameStatue() {
    const { radius, height } = this.statue;
    const tanMax = this.ring.innerRadius * 0.95;
    const closest = radius * Math.sqrt(1 + 1 / (tanMax * tanMax));
    this.dollyMin = 0.93; // the camera ends 7% closer than in the hero
    this.distance = closest / this.dollyMin;
    this.pitch = -3 * DEG;
    this.statueTan = height / this.distance; // projected height (tan units) at the hero distance
    this._applyFov();
  }

  _applyFov() {
    if (!this.statue) return;
    const tanHalf = this.statueTan / (2 * this.fill);
    this.camera.fov = 2 * Math.atan(tanHalf) / DEG;
    this.camera.updateProjectionMatrix();
  }

  /** Statue fill for the current layout (smaller on phones, where text sits below it). */
  setFill(fill) {
    this.fill = fill;
    this._applyFov();
    this._lastSig = '';
  }

  _resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._lastSig = '';
    this._maskDue = 0;
    if (!this.running && this.statue && !this._sizing) this.renderOnce();
  }

  /** Rest and end rotations per bone, from the GLB's "Pose" clip (frame 0 = rest, last = end). */
  _readPose(animations = []) {
    this.pose = [];
    const clip = animations.find((a) => a.name === 'Pose') ?? animations[0];
    if (!clip || !this.skinned) return;
    const bones = new Map(this.skinned.skeleton.bones.map((b) => [b.name, b]));
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const bone = bones.get(track.name.slice(0, -'.quaternion'.length));
      if (!bone) continue;
      // sample through the track's own interpolant: right for LINEAR and CUBICSPLINE alike
      const interp = track.createInterpolant();
      const at = (t) => new THREE.Quaternion().fromArray(interp.evaluate(t)).normalize();
      const rest = at(track.times[0]);
      const end = at(track.times[track.times.length - 1]);
      if (rest.angleTo(end) < 1e-4) continue; // a bone that does not move
      const group = /^(neck|head)$/.test(bone.name) ? 'head' : 'arm';
      this.pose.push({ bone, rest, end, group });
    }
  }

  /** Blend the skeleton: `arm` and `head` are 0 (rest) .. 1 (end pose). */
  _applyPose(arm, head) {
    for (const { bone, rest, end, group } of this.pose) {
      bone.quaternion.slerpQuaternions(rest, end, group === 'head' ? head : arm);
    }
    this.statue.root.updateMatrixWorld(true);
  }

  /**
   * Build the morph from the logo's SVG (in a worker; call it once the hero is up). Until it is
   * ready the statue simply holds its end pose through the morph section (the close-up still opens
   * out on the morph's schedule).
   */
  async prepareMorph(svgText, regions = null) {
    if (!this.skinned || this.morph || this._morphPending || this.disposed) return null;
    this._morphPending = true;
    const c = this.statue.center;
    const triangles = this.skinned.geometry.index.count / 3;
    // the job: the rig's arrays and its bone matrices at the end pose (a few milliseconds here), the
    // logo's inputs (its base triangles must fit every part's budget; the curves are sampled to
    // suit), and where the change starts: at the mask, a little above the hand
    const job = () => {
      const { arm, head } = this.tracks;
      this._applyPose(1, 1);
      const hand = this.skinned.skeleton.bones.find((b) => /^hand/.test(b.name));
      const origin = this.turntable.worldToLocal(hand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.13, 0)));
      const j = morphJob(this.skinned, this.turntable, { svgText, regions, center: c.toArray(), radius: this.statue.radius - MORPH.lift - 0.02, maxTriangles: triangles * 0.6, origin: origin.toArray() });
      this._applyPose(arm, head);
      return j;
    };
    let r;
    try {
      const j = job();
      mark('morph job');
      // the soup is cooked in a worker: the page's thread, and the visitor's scrolling, go on meanwhile
      r = await buildInWorker(j);
      mark('morph built (worker)');
    } catch (err) {
      if (this.disposed) { this._morphPending = false; return null; }
      console.warn('Morph worker unavailable; building on the page instead.', err);
      r = buildHere(job()); // the first job's buffers went to the worker: gather them again
      mark('morph built (page)');
    }
    this._morphPending = false;
    if (this.disposed || this.morph) return null;
    this.logoWidth = r.logoWidth;
    this.morph = assembleMorph(r, { material: this.skinned.material, space: this.turntable, center: c });
    // the logo is the statue's own stone: its average colour (texture times tint)
    if (this.statue.averageColor) this.morph.uniforms.uStone.value.copy(this.statue.averageColor);
    this.morph.mesh.layers.enable(STATUE_LAYER);
    // the star beside the mask is not made from her: it flies in from the sky (src/scene/star.js)
    if (r.star) {
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(r.star.position, 3));
      starGeo.setAttribute('normal', new THREE.BufferAttribute(r.star.normal, 3));
      this.star = new LogoStar({ geometry: starGeo, space: this.turntable, scene: this.scene, stone: this.statue.averageColor });
    }
    // the vector stand-in it hands over to at the end, laid exactly over it
    const flat = { svgToLocal: new THREE.Matrix4().fromArray(r.flat.svgToLocal), z: r.flat.z, outline: r.flat.outline };
    this.logoFlat = flat;
    this.vector = new VectorLogo(svgText, { after: this.container, outline: flat.outline });
    this.vector.setBehind(this.logoInFront === false);
    // before it hands over, the 3D logo goes flat (src/scene/flat.js): into the plane of its front
    // face, in the vector's gradient, which runs from the top of the SVG's box to its foot
    const f = flat, S = this.vector.size;
    const top = new THREE.Vector3(S.w / 2, 0, f.z).applyMatrix4(f.svgToLocal);
    const foot = new THREE.Vector3(S.w / 2, S.h, f.z).applyMatrix4(f.svgToLocal);
    this.morph.uniforms.uFlatY.value.set(top.y, foot.y);
    this.morph.uniforms.uFlatZ.value = top.z;
    if (this.star) flattenStar(this.star.material, this.morph.uniforms, this.star.home);
    this._setEmblem(0); // from now on the stage's logo brings the footer's mark in
    // arriving in the middle of the close-up, its framing eases over from the stand-in's
    this._focusBlend = this.tracks.zoom > 0 ? 0 : 1;
    this._lastSig = '';
    return this.morph;
  }

  /**
   * The morph's first frame on screen used to upload its 40 MB of vertices and compile its three
   * programs there and then, mid-scroll. Done here instead, in a quiet moment after the build, into
   * a one-pixel target nobody sees.
   */
  async warmMorph() {
    const m = this.morph;
    if (!m || this.lost || this.disposed || !this.skinned) return;
    const r = this.renderer;
    const star = this.star;
    const was = { mesh: m.mesh.visible, statue: this.skinned.visible, star: star?.mesh.visible, glow: star?.glow.visible };
    // what the morph's act shows: the morph in the statue's place, the logo star and its glow
    const show = () => { m.mesh.visible = true; this.skinned.visible = false; if (star) { star.mesh.visible = true; star.glow.visible = true; } };
    const restore = () => { m.mesh.visible = was.mesh; this.skinned.visible = was.statue; if (star) { star.mesh.visible = was.star; star.glow.visible = was.glow; } };
    show();
    try {
      // the morph's and the star's own programs; and, as stand-ins keyed like the real passes
      // (targets bound; the stage's lights for the shadow pass, none for the silhouette's), the
      // shadow pass's depth programs and the silhouette's, so the one draw below links nothing
      const shadowed = new THREE.Scene();
      const unlit = new THREE.Scene();
      const flip = (side) => (side === THREE.FrontSide ? THREE.BackSide : side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
      const depthFor = (mesh) => {
        const own = mesh.material;
        const d = mesh.customDepthMaterial ?? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        // as the shadow pass sets them on the depth material before each draw
        d.side = own.shadowSide ?? flip(own.side);
        d.map = own.map ?? null;
        d.alphaMap = own.alphaMap ?? null;
        d.alphaTest = own.alphaTest;
        return d;
      };
      for (const mesh of [m.mesh, star?.mesh].filter(Boolean)) {
        shadowed.add(new THREE.Mesh(mesh.geometry, depthFor(mesh)));
        unlit.add(new THREE.Mesh(mesh.geometry, mesh.userData.maskMaterial ?? this.mask?.material ?? new THREE.MeshBasicMaterial({ color: 0xffffff })));
      }
      const target = new THREE.WebGLRenderTarget(1, 1);
      const onStage = r.compileAsync(this.scene, this.camera);
      r.setRenderTarget(target);
      const offStage = [r.compileAsync(shadowed, this.camera, this.scene), r.compileAsync(unlit, this.camera)];
      r.setRenderTarget(null);
      await Promise.all([onStage, ...offStage]);
      target.dispose();
    } catch { /* compiled on first draw instead */ }
    if (this.disposed || this.lost) return;
    // the stage's own frame may have run during that compile and put the statue back (_updateRig
    // shows the morph only while the scroll is in its act): shown again, and drawn at once
    show();
    // keyed like the screen: three.js gives an 'XR' target its own colour space and the renderer's tone
    // mapping (any other target gets linear and none), so this one-pixel draw compiles the very programs
    // the first frame on screen will use, and not a second set that nothing would ever draw with
    const target = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
    target.isXRRenderTarget = true;
    const prev = r.getRenderTarget();
    r.shadowMap.needsUpdate = true; // the shadow pass too: its depth programs
    r.setRenderTarget(target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    target.dispose();
    this.mask?.update(this.scene, this.camera, this.width, this.height); // and the silhouette's
    restore();
    r.shadowMap.needsUpdate = true; // the statue's own shadow again on the next frame
    this._lastSig = '';
    mark('morph warm');
  }

  /** ?debug: drive the sequence directly (null hands it back to the scroll). */
  setSequenceOverride(p) {
    this.seqOverride = p;
    this._lastSig = '';
  }

  setPointer(nx, ny) {
    this.pointer.x = nx;
    this.pointer.y = ny;
  }

  // ---- statue interaction (see src/scene/interaction.js) ----

  /** The cursor is over the statue: the key light leans in a little. */
  setHover(on) {
    this.turn.hoverTarget = on ? 1 : 0;
  }

  /** Start a drag: any fling still running stops under the hand. */
  grab() {
    this.turn.held = true;
    this.turn.vel = 0;
  }

  /** Turn the statue by a horizontal drag of `dx` CSS pixels. */
  dragBy(dx) {
    this.turn.drag += dx * DRAG_RAD_PER_PX;
  }

  /** End a drag; `pxPerSec` is the release speed, carried on as a fling that slows to rest. */
  release(pxPerSec = 0) {
    this.turn.held = false;
    const v = pxPerSec * DRAG_RAD_PER_PX;
    this.turn.vel = this.reducedMotion ? 0 : Math.max(-MAX_FLING, Math.min(MAX_FLING, v));
  }

  _updateRig(dt) {
    const s = this.state;
    const t = this.turn;
    if (!this.reducedMotion) {
      const k = 1 - Math.exp(-dt * 1.6); // heavy damping
      s.parX += (this.pointer.x - s.parX) * k;
      s.parY += (this.pointer.y - s.parY) * k;
      if (!t.held) {
        if (t.vel) {
          t.drag += t.vel * dt;
          t.vel *= Math.exp(-dt * 2.6);
          if (Math.abs(t.vel) < 0.01) t.vel = 0;
        }
        // a drag is a gesture, not a new pose: it eases back to the choreography
        t.drag *= Math.exp(-dt * 0.9);
        if (Math.abs(t.drag) < 1e-4) t.drag = 0;
      }
      // the statue turns its head toward the cursor, a little more slowly than the camera follows
      t.follow += (this.pointer.x * FOLLOW - t.follow) * (1 - Math.exp(-dt * 1.2));
    } else {
      s.parX = s.parY = 0;
      t.follow = 0;
      if (!t.held) t.drag = 0;
    }
    t.hover += (t.hoverTarget - t.hover) * (dt ? 1 - Math.exp(-dt * 6) : 1);

    // the sequence: pose, turn, morph, logo
    const tr = (this.tracks = evaluate(this.seqOverride ?? s.seq));
    if (this.pose.length) this._applyPose(tr.arm, tr.head);
    this.time += dt;
    const drift = this.reducedMotion ? 0 : LOGO_DRIFT * Math.sin(this.time * 0.45) * Math.min(1, tr.logo * 4);
    // through the morph the turntable takes up the camera's scroll arc, so the logo ends square on
    // as the vector takes over, the logo settles square on: the drift and the gestures fade out
    const settle = 1 - (this.vector ? tr.vector : 0);
    const statueYaw = 2 * Math.PI * TURN.revolutions * tr.turn + s.arc * tr.morph + LOGO_SWAY * Math.sin(Math.PI * tr.logo) + (drift + t.drag + t.follow) * settle;
    this.turntable.rotation.y = statueYaw;
    // the morph: the logo forms at her head, then grows out to its place in the ring
    const m = this.morph;
    const morphing = !!m && tr.morph > 0;
    let grow = 0;
    if (m) {
      m.mesh.visible = morphing;
      grow = m.update(tr.morph);
      // once the vector is fully in, the 3D logo stops drawing colour; it still casts its shadow
      // and keeps the stars clear of the mark
      const solid = !(this.vector && tr.vector >= FLAT_BY);
      m.mesh.material.colorWrite = solid;
      m.mesh.material.depthWrite = solid;
      // first it goes flat, exactly into the vector's look (src/scene/flat.js); only then does the
      // vector come in over it (_draw), so the change is a morph, not one picture fading over another
      m.uniforms.uFlat.value = this.vector ? smoothstep(0, FLAT_BY, tr.vector) : 0;
    }
    tr.grow = grow; // for the ?debug readout
    // the logo is far wider than the statue: on a narrow (portrait) screen it shrinks into the
    // width as it grows, about the clearance sphere's centre, where it ends (smaller only helps the
    // ring clearance)
    let k = 1;
    if (this.logoWidth) {
      const d = this.distance * s.dolly;
      const visibleWidth = 2 * Math.tan((this.camera.fov * DEG) / 2) * d * this.camera.aspect;
      k = 1 + (Math.min(1, (0.86 * visibleWidth) / this.logoWidth) - 1) * grow;
    }
    this.turntable.scale.setScalar(k);
    this.turntable.position.y = this.statue.center.y * (1 - k);
    if (this.skinned) this.skinned.visible = !morphing;
    // the shadow map follows the shape and the turn
    const shape = `${statueYaw.toFixed(4)},${k.toFixed(4)},${tr.arm.toFixed(4)},${tr.head.toFixed(4)},${morphing ? tr.morph.toFixed(4) : 'statue'}`;
    if (shape !== this._shapeSig) {
      this._shapeSig = shape;
      this.renderer.shadowMap.needsUpdate = true;
    }

    const c = this.statue.center;
    const d = this.distance * s.dolly;
    const cam = this.camera;
    const w = this.width, h = this.height;
    // the close-up: after the turn the view closes in on her head, hand and mask, where the logo
    // forms, so its mask, hand and face change large; as the logo grows to its place the view opens
    // out again (on the morph's schedule, built or not). It is a zoom of the picture itself, a
    // smaller window on the same view: the ring, which rides on the camera, magnifies with the
    // statue, so the two still never cross, and the light is unchanged.
    const closeIn = tr.zoom * (1 - (m ? grow : growAt(tr.morph)));
    let zoom = 1, fx = s.frameX, fy = s.frameY;
    const focus = this._focus;
    if (closeIn > 0) {
      // what it frames: her head, hand and mask, and the logo's forming on them; before the
      // morph is built, a stand-in between her head and her hand (a statue without a rig: its centre)
      const bones = this.skinned?.skeleton.bones ?? [];
      const head = bones.find((b) => b.name === 'head'), hand = bones.find((b) => /^hand/.test(b.name));
      if (head && hand) focus.copy(head.getWorldPosition(focus)).add(hand.getWorldPosition(this._tmpV)).multiplyScalar(0.5);
      else focus.copy(c);
      let width = CLOSE_UP_SIZE.width, height = CLOSE_UP_SIZE.height;
      if (m) {
        // a morph that arrives mid-close-up takes over from the stand-in smoothly
        this._focusBlend = Math.min(1, (this._focusBlend ?? 1) + dt / 0.5);
        const e = this._focusBlend * this._focusBlend * (3 - 2 * this._focusBlend);
        this.turntable.updateMatrixWorld();
        focus.lerp(this.turntable.localToWorld(this._tmpV.copy(m.closeUp.centre)), e);
        width += (m.closeUp.width - width) * e;
        height += (m.closeUp.height - height) * e;
      }
      // the frame follows the choreography, not a gesture: a drag or the lean toward the cursor
      // turns her about her axis (x = z = 0) inside a steady frame
      focus.applyAxisAngle(UP, -(t.drag + t.follow));
      const viewH = 2 * Math.tan((cam.fov * DEG) / 2) * d, viewW = viewH * cam.aspect;
      const full = Math.max(1, Math.min((CLOSE_UP.height * viewH) / height, (CLOSE_UP.width * viewW) / width));
      zoom = full ** closeIn;
      // the composition's offset (text beside the stage) leaves less room on one side: bring the
      // frame in from it as far as the close-up needs, with a margin
      const roomX = Math.max(0, 0.47 - (zoom * width) / (2 * viewW)), roomY = Math.max(0, 0.47 - (zoom * height) / (2 * viewH));
      fx = Math.sign(fx) * Math.min(Math.abs(fx), roomX);
      fy = Math.sign(fy) * Math.min(Math.abs(fy), roomY);
    }
    // the cursor parallax moves the picture as much in the close-up as out of it
    const yaw = s.arc + (s.parX * 3 * DEG) / zoom;
    const pitch = this.pitch - (s.parY * 2 * DEG) / zoom;
    cam.position.set(
      c.x + d * Math.sin(yaw) * Math.cos(pitch),
      c.y - d * Math.sin(pitch),
      c.z + d * Math.cos(yaw) * Math.cos(pitch),
    );
    cam.lookAt(c);
    // composition: shift the whole picture (the centre of projection does not move); in the
    // close-up, magnify it about the focus, which settles where the statue's centre would be
    let nx = 0, ny = 0;
    if (closeIn > 0) {
      cam.clearViewOffset(); // the focus, as the plain view sees it
      cam.updateMatrixWorld();
      this._tmpV.copy(focus).project(cam);
      nx = this._tmpV.x * closeIn;
      ny = this._tmpV.y * closeIn;
    }
    const fw = w * zoom, fh = h * zoom;
    cam.setViewOffset(fw, fh, ((nx + 1) / 2) * fw - (w / 2 + fx * w), ((1 - ny) / 2) * fh - (h / 2 - fy * h), w, h);
    // ring: behind the statue, turned only about the viewing axis
    placeRing(this.ring, d + this.statue.radius * 1.4);
    this.ring.spinner.rotation.z = s.spin;
    // the logo's star, on its way in from the sky (it needs this frame's camera)
    if (this.star && m) {
      cam.updateMatrixWorld();
      this.star.update(tr.morph, {
        fit: m.current, center: c, camera: cam, height: h, time: this.time,
        day: s.daylight, solid: !(this.vector && tr.vector >= FLAT_BY),
      });
    }
  }

  _updateLights() {
    const s = this.state;
    const { key, rim, hemi } = this.lights;
    const lit = s.stageLight;
    const day = s.daylight;
    const hover = this.turn.hover;
    key.color.copy(this.colors.warm).lerp(this.colors.cool, s.lightMix);
    key.intensity = this.keyPower * s.keyLevel * lit * (1 + 0.22 * hover) * (1 - 0.25 * day);
    rim.intensity = this.rimPower * (0.6 + 0.4 * s.lightMix) * lit * (1 + 0.8 * hover);
    // house lights: an even sky fill that does not depend on the spotlight, so the statue reads as
    // stone in daylight rather than a silhouette on a pale ground
    hemi.intensity = 0.06 * lit + 1.1 * day;
    this.scene.environmentIntensity = 0.16 * lit + 0.3 * day;
    this.renderer.toneMappingExposure = 1 - 0.12 * day;
    const pool = this.floor.pool.material;
    pool.color.copy(key.color);
    pool.opacity = 0.16 * lit * s.keyLevel * (1 - day);
    this.floor.shadow.material.opacity = 0.5 - 0.2 * day;
    const m = this.ring.material;
    m.opacity = s.ringReveal;
    m.transparent = s.ringReveal < 0.999;
    m.depthWrite = !m.transparent;
    // the ring is a supporting frame: lit, but kept below the statue's brightness; in daylight it
    // turns to pale stone under the softer matcap
    m.matcap = day > 0.5 ? this.ring.dayMatcap : this.ring.matcap;
    const stageRing = 0.56 * s.ringLevel * (0.55 + 0.45 * lit);
    const ringLight = stageRing + (0.86 + 0.1 * s.ringLevel - stageRing) * day;
    m.color.copy(this.ringTint).multiplyScalar(ringLight).multiply(
      this._tmpColor.copy(key.color).lerp(this._white, 0.6 + 0.4 * day),
    );
  }

  _signature() {
    const s = this.state;
    const t = this.turn;
    const r = (v) => Math.round(v * 1e4);
    return [s.stageLight, s.ringReveal, s.lightMix, s.keyLevel, s.ringLevel, s.frameX, s.frameY, s.spin, this.turntable.rotation.y, s.arc, s.dolly,
      s.parX, s.parY, s.daylight, this.seqOverride ?? s.seq, t.hover, this.width, this.height, this.camera.fov, this.morph ? 1 : 0,
      this._focusBlend ?? 1, Math.min(this.height + 1, this._occluderTop()),
      this.star?.twinkling ? Math.round(this.time * 30) : 0].map(r).join(',');
  }

  _tick() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this._updateRig(dt);
    if (this._settling) {
      // stopWhenSettled(): stop once the sequence and the footer have held still for a moment (the
      // cursor's parallax does not count: nothing it moves is in view by then)
      const still = `${this.seqOverride ?? this.state.seq},${this._occluderTop()},${this.state.spin}`;
      this._still = still === this._stillSig ? this._still + 1 : 0;
      this._stillSig = still;
      if (this._still > 20) { this.stop(); return; }
    }
    const sig = this._signature();
    if (sig === this._lastSig) return; // nothing moved: skip the frame
    this._lastSig = sig;
    this._updateLights();
    this._draw();
    const now = performance.now();
    if (now >= this._maskDue) {
      this._maskDue = now + 140;
      this.mask.update(this.scene, this.camera, this.width, this.height);
    }
  }

  /**
   * Compile the stage's programs before the statue has arrived, so the compile (a fifth to a third
   * of a second on an integrated GPU, more on a phone) overlaps the download instead of following
   * it. three.js keys a program by what a material is (which maps it has, its side, the kind of mesh,
   * the lights on hand, where it is drawn into), not by the pixels of its textures, so stand-ins made
   * of one-pixel textures on three-vertex meshes compile the very programs the statue, the ring, the
   * floor, the shadow pass and the silhouette will ask for; warm() then finds each in the cache and
   * has only the real textures to upload. Where anything differs, that program compiles in warm() as
   * before: nothing is lost. The stand-ins' materials are kept for the page's life (a few small
   * objects): disposing one releases its program when nothing else holds it yet, and the ring's
   * opaque program has no other holder until its reveal has ended.
   */
  async preWarm() {
    if (this._standIns || this.disposed || this.lost) return;
    const r = this.renderer;
    const made = { materials: [], textures: [], geometries: [], meshes: [] };
    this._standIns = made;
    try {
      const pixel = (srgb) => {
        const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        made.textures.push(t);
        return t;
      };
      const triangle = (skinned) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
        if (skinned) {
          g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
          g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
        }
        g.setIndex([0, 1, 2]);
        made.geometries.push(g);
        return g;
      };
      const keep = (m) => { made.materials.push(m); return m; };
      const skeleton = new THREE.Skeleton([new THREE.Bone()]);
      const skinnedWith = (material, scene) => {
        const mesh = new THREE.SkinnedMesh(triangle(true), material);
        mesh.bind(skeleton);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        made.meshes.push(mesh);
        return mesh;
      };
      // on stage, as the GLTF loader, createRing and _buildFloor make them
      const statue = keep(new THREE.MeshStandardMaterial({ map: pixel(true), normalMap: pixel(false), roughnessMap: pixel(false), metalnessMap: pixel(false), side: THREE.DoubleSide }));
      const stone = keep(new THREE.MeshMatcapMaterial({ matcap: pixel(false), map: pixel(true), normalMap: pixel(false), transparent: true, opacity: 0 }));
      // the ring once revealed: _updateLights makes it opaque at the end of its reveal, which is a
      // different program (three.js forces alpha to one in an opaque material's shader)
      const stoneSolid = keep(new THREE.MeshMatcapMaterial({ matcap: pixel(false), map: pixel(true), normalMap: pixel(false) }));
      const catcher = keep(new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }));
      const pool = keep(new THREE.MeshBasicMaterial({ map: pixel(true), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const onStage = [skinnedWith(statue, this.scene)];
      for (const [material, receive] of [[stone, false], [stoneSolid, false], [catcher, true], [pool, false]]) {
        const mesh = new THREE.Mesh(triangle(false), material);
        mesh.receiveShadow = receive;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        onStage.push(mesh);
        made.meshes.push(mesh);
      }
      // off stage: the shadow pass's depth material (the statue's map, faces inward) under the stage's
      // lights, and the silhouette's flat white under none, both drawn into targets
      const depth = keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      depth.map = statue.map;
      depth.side = THREE.DoubleSide;
      const white = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const shadowed = new THREE.Scene();
      const unlit = new THREE.Scene();
      skinnedWith(depth, shadowed);
      skinnedWith(white, unlit);
      const target = new THREE.WebGLRenderTarget(1, 1);
      const compiling = [r.compileAsync(this.scene, this.camera)];
      r.setRenderTarget(target);
      compiling.push(r.compileAsync(shadowed, this.camera, this.scene), r.compileAsync(unlit, this.camera));
      r.setRenderTarget(null);
      await Promise.all(compiling);
      target.dispose();
      for (const m of onStage) m.removeFromParent();
    } catch { /* compiled in warm() instead */ }
    mark(`programs pre-warmed (${this.renderer.info.programs?.length ?? 0} programs)`);
  }

  _dropStandIns() {
    const made = this._standIns;
    if (!made) return;
    this._standIns = { materials: made.materials }; // the materials stay (see preWarm); the rest goes
    for (const m of made.meshes) m.removeFromParent();
    for (const t of made.textures) t.dispose();
    for (const g of made.geometries) g.dispose();
  }

  /**
   * Compile every shader on stage (in parallel where the driver allows) and draw the first frame,
   * so the first frame the visitor sees is not the one that stalls on compiling.
   */
  async warm() {
    if (!this.statue) return;
    this._updateRig(0);
    this._updateLights();
    try {
      // the stage's own materials, and the two the first frame would otherwise compile on the
      // spot (about 0.85 s on an integrated GPU): the shadow pass's depth material, skinned for
      // the statue and plain for the rest, and the silhouette's flat white (src/scene/silhouette.js).
      // Stand-ins with the same materials on the same kinds of mesh make three.js build the same
      // programs, which it then finds in its cache when the real passes ask for them.
      // (three.js keys its program cache by the material, the kind of mesh, the lights on hand and the
      // colour space and tone mapping of what is being drawn into: the two passes draw into targets,
      // in linear colour and untouched by tone mapping; the shadow pass sees the stage's lights, the
      // silhouette none; the shadow's depth material carries the statue's own map and faces inward)
      const r = this.renderer;
      const shadowed = new THREE.Scene(); // for the shadow pass: compiled against the stage's lights
      const unlit = new THREE.Scene(); // for the silhouette pass: no lights at all
      const standIns = [];
      if (this.skinned) {
        const own = this.skinned.material;
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        depth.map = own.map ?? null;
        depth.alphaMap = own.alphaMap ?? null;
        depth.alphaTest = own.alphaTest;
        depth.side = own.shadowSide ?? (own.side === THREE.FrontSide ? THREE.BackSide : own.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
        const white = this.mask?.material ?? new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (const [scene, material] of [[shadowed, depth], [unlit, white]]) {
          const standIn = new THREE.SkinnedMesh(this.skinned.geometry, material);
          standIn.bind(this.skinned.skeleton, this.skinned.bindMatrix);
          standIn.castShadow = true;
          scene.add(standIn);
          standIns.push(standIn);
        }
      }
      const target = new THREE.WebGLRenderTarget(1, 1);
      const onStage = r.compileAsync(this.scene, this.camera); // its programs are gathered at once, before the target is bound
      r.setRenderTarget(target);
      const offStage = [r.compileAsync(shadowed, this.camera, this.scene), r.compileAsync(unlit, this.camera)];
      r.setRenderTarget(null);
      // the textures go to the GPU now, while the driver is compiling (a quarter of a second for
      // three 2048 px images on an integrated GPU), rather than on the first frame
      this.scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          for (const tex of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap, m.alphaMap]) if (tex?.isTexture) r.initTexture(tex);
        }
      });
      await Promise.all([onStage, ...offStage]);
      target.dispose();
      for (const s of standIns) s.removeFromParent();
    } catch { /* compiled on first draw instead */ }
    this._dropStandIns(); // preWarm()'s meshes, textures and geometries
    mark(`shaders compiled (${this.renderer.info.programs?.length ?? 0} programs)`);
    this.renderOnce();
    mark(`first frame (${this.renderer.info.programs?.length ?? 0} programs)`);
  }

  renderOnce() {
    if (!this.statue || this.lost) return;
    this._updateRig(0);
    this._updateLights();
    this._draw();
    this.mask?.update(this.scene, this.camera, this.width, this.height);
  }

  /**
   * The element that rises over the stage at the end (the curtain-call footer). It is layered above
   * the WebGL canvas (--z-footer), an opaque layer the browser moves with the scroll itself, so it
   * cuts the ring, the floor and the shadows exactly at its edge however fast the page moves; the
   * stage need not clip its frame to it (which ran a frame behind a fast scroll). The logo meets the
   * footer as its flat vector, which is layered above the footer (--z-vector) and docks into its
   * slot. With `logoInFront` false (phones, where the copy above it sits on a solid scrim) the vector
   * stays behind the footer until it starts to dock.
   */
  setOccluder(el, { logoInFront = true } = {}) {
    this.occluder = el;
    this._occKey = '';
    this._occRO?.disconnect();
    if (el) {
      // the page above the footer changes height (text split into lines, a form arriving, a resize): read again
      this._occRO = new ResizeObserver(() => { this._occKey = ''; });
      this._occRO.observe(document.body);
      this._occRO.observe(el);
    }
    this.logoInFront = logoInFront;
    this.dockSlot = el?.querySelector('.curtain__mark') ?? null;
    this.emblem = el?.querySelector('.curtain__emblem') ?? null;
    if (this.vector) this._setEmblem(0);
    this.vector?.setBehind(!logoInFront);
    this._lastSig = '';
  }

  /**
   * How far the vector has docked into the footer's slot: 0 while the footer is below the screen,
   * 1 once it has risen as far as it will (all of it on screen at the end of the page, or its top at
   * the top of the screen if it is taller than that), eased. src/sections/dock.js carries the last
   * act's columns into the footer on exactly this measure, so the two arrive together.
   */
  _dock() {
    if (!this.dockSlot) return 0;
    const top = this._occluderTop();
    const end = Math.max(0, this.height - this.occluder.offsetHeight);
    const t = Math.min(1, Math.max(0, (this.height - top) / Math.max(1, this.height - end)));
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  _occluderTop() {
    if (!this.occluder) return Infinity;
    // read once per scroll position and viewport height (every tick asked the layout for it, before
    // the 'nothing moved' return); a change of layout (the observer below) reads it again
    const key = `${scrollY},${innerHeight}`;
    if (this._occKey !== key) {
      this._occKey = key;
      this._occTop = Math.round(this.occluder.getBoundingClientRect().top);
    }
    return this._occTop;
  }

  _draw() {
    const v = this.vector && this.morph?.mesh.visible ? this.tracks.vector : 0;
    if (v > 0) this._sampleVectorColors();
    this._drawStage();
    if (this.vector) {
      // the vector comes in only once the 3D logo has gone flat into its exact look (uFlat), and then
      // in the same frame as the 3D logo stops drawing, so it replaces it rather than fading over it
      // (or leaving it behind if the footer is already rising); docked in the footer, it hands over
      // to the footer's own mark (the same as every other page's), which by then it matches exactly
      const hand = v > 0 ? this._placeVector(v) : 0;
      this.vector.setOpacity((v >= FLAT_BY ? 1 : 0) * (1 - hand));
      this._setEmblem(hand);
    }
  }

  /** Where the SVG's origin and its x and y edges land on screen (CSS pixels). */
  _vectorCorners() {
    const f = this.logoFlat, S = this.vector.size, cam = this.camera;
    this.turntable.updateMatrixWorld();
    cam.updateMatrixWorld();
    const M = this._tmpM.multiplyMatrices(this.turntable.matrixWorld, f.svgToLocal);
    const at = (x, y) => {
      const p = this._tmpV.set(x, y, f.z).applyMatrix4(M).project(cam);
      return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
    };
    return { o: at(0, 0), x: at(S.w, 0), y: at(0, S.h) };
  }

  /**
   * Lay the vector over the 3D logo; as the footer rises, carry it from there into the footer's
   * slot (fitted, centred), where it then scrolls with the footer. `v` is how far the vector has
   * taken over: the move waits for it, so it never leaves a fading 3D logo behind.
   */
  _placeVector(v) {
    const { o, x, y } = this._vectorCorners();
    const S = this.vector.size;
    const m = [(x.x - o.x) / S.w, (x.y - o.y) / S.w, (y.x - o.x) / S.h, (y.y - o.y) / S.h, o.x, o.y];
    const k = this._dock() * smoothstep(FLAT_BY, 1, v);
    this.vector.setBehind(!this.logoInFront && k <= 0);
    if (k > 0) {
      const r = this.dockSlot.getBoundingClientRect();
      const s = Math.min(r.width / S.w, r.height / S.h);
      const to = [s, 0, 0, s, r.left + (r.width - S.w * s) / 2, r.top + (r.height - S.h * s) / 2];
      for (let i = 0; i < 6; i++) m[i] += (to[i] - m[i]) * k;
    }
    this.vector.setTransform(...m);
    // on its way down it takes on the footer mark's colours and loses the bevel's flare (the
    // footer's mark has neither), so that once in the slot the two are the same picture
    const emblem = this._emblemColors();
    const base = this._vectorBase;
    if (base && emblem) this.vector.setColors(mixHex(base[0], emblem[0], k), mixHex(base[1], emblem[1], k));
    this.vector.setOutline(1 - k);
    return k > 0 ? smoothstep(0.96, 1, k) : 0;
  }

  /** The footer mark's gradient (its CSS custom properties), per theme. */
  _emblemColors() {
    if (!this.emblem) return null;
    const key = Math.round(this.state.daylight);
    if (this._emblemKey !== key) {
      const css = getComputedStyle(this.emblem);
      const top = css.getPropertyValue('--emblem-top').trim(), foot = css.getPropertyValue('--emblem-foot').trim();
      this._emblemRGB = /^#[0-9a-f]{6}$/i.test(top) && /^#[0-9a-f]{6}$/i.test(foot) ? [top, foot] : null;
      this._emblemKey = key;
    }
    return this._emblemRGB;
  }

  /** The footer's own mark: shown as the stage's logo settles into its slot. */
  _setEmblem(o) {
    if (!this.emblem) return;
    const v = Math.round(o * 1000) / 1000;
    if (v === this._emblemO) return;
    this._emblemO = v;
    this.emblem.style.opacity = String(v);
  }

  /**
   * The vector's colours: the 3D logo as the stage lights it, its top third and its foot. Read once
   * from the canvas (after a solid render of the logo), and again after the theme changes.
   */
  _sampleVectorColors() {
    const day = this.state.daylight;
    if (Math.abs(day - Math.round(day)) > 0.01) return; // mid theme change: wait for it to settle
    const key = `${Math.round(day)},${this.width}x${this.height}`;
    if (this._vectorKey === key) return;
    this._vectorKey = key;
    const r = this.renderer, mat = this.morph.mesh.material, flat = this.morph.uniforms.uFlat;
    const cw = mat.colorWrite, dw = mat.depthWrite, shadows = r.shadowMap.needsUpdate, fv = flat.value;
    mat.colorWrite = mat.depthWrite = true;
    flat.value = 0; // the lit stone, not its flat stand-in
    r.render(this.scene, this.camera);
    r.shadowMap.needsUpdate = shadows;
    mat.colorWrite = cw; mat.depthWrite = dw; flat.value = fv;
    // the mark's box on screen, in drawing-buffer pixels
    const { o, x, y } = this._vectorCorners();
    const xs = [o.x, x.x, y.x, x.x + y.x - o.x], ys = [o.y, x.y, y.y, x.y + y.y - o.y];
    const pr = r.getPixelRatio();
    const x0 = Math.max(0, Math.floor(Math.min(...xs) * pr)), x1 = Math.min(r.domElement.width, Math.ceil(Math.max(...xs) * pr));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) * pr)), y1 = Math.min(r.domElement.height, Math.ceil(Math.max(...ys) * pr));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const gl = r.getContext();
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(x0, r.domElement.height - y1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // logo pixels only (the silhouette mask): average the top third and the bottom third
    const sum = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let j = 0; j < h; j += 3) {
      const cssY = (y1 - 1 - j) / pr; // readPixels rows run bottom up
      const band = cssY < y0 / pr + (h / pr) / 3 ? 0 : cssY > y0 / pr + (2 * h / pr) / 3 ? 1 : -1;
      if (band < 0) continue;
      for (let i = 0; i < w; i += 3) {
        const k = (j * w + i) * 4;
        if (px[k + 3] < 250 || !this.covers((x0 + i) / pr, cssY)) continue;
        const s = sum[band];
        s[0] += px[k]; s[1] += px[k + 1]; s[2] += px[k + 2]; s[3]++;
      }
    }
    // lifted a little: the flat mark loses the bevel's bright edges, which make the 3D one read lighter
    const hex = (s) => '#' + s.slice(0, 3).map((c) => Math.min(255, Math.round((c / s[3]) * 1.08)).toString(16).padStart(2, '0')).join('');
    if (sum[0][3] && sum[1][3]) {
      this._vectorBase = [hex(sum[0]), hex(sum[1])];
      this.vector.setColors(...this._vectorBase);
      // the colours the 3D logo goes flat in are the vector's, to the value
      hexToVec3(this._vectorBase[0], this.morph.uniforms.uFlatTop.value);
      hexToVec3(this._vectorBase[1], this.morph.uniforms.uFlatFoot.value);
    } else this._vectorKey = null; // nothing to see yet: try again next frame
  }

  _drawStage() {
    // the whole stage; the footer, layered above the canvas, covers what it should (setOccluder)
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    this._settling = false;
    if (this.lost) { this._resume = true; return; } // (once the context is back)
    if (this.running || this.disposed || !this.statue) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this._settling = false;
    if (this.lost) this._resume = false;
    if (!this.running) return;
    this.running = false;
    this.clock.stop();
    this.renderer.setAnimationLoop(null);
  }

  /**
   * Stop, but only once the sequence has caught up with the scroll and the footer is still: the
   * footer covers the stage, and a fast scroll to the end leaves the scrubbed sequence (and the
   * logo's hand-over to the footer's mark) still on its way there.
   */
  stopWhenSettled() {
    // stopped already (the tab was hidden mid-way), it must run again to finish: start() first, as it
    // clears _settling
    if (this.disposed || !this.statue) return;
    this.start();
    this._settling = true;
    this._still = 0;
    this._stillSig = '';
  }

  /** True if the CSS pixel (x, y) is covered by the statue. */
  covers(x, y) {
    return this.mask && !this.lost ? this.mask.covers(x, y) : false;
  }

  /** PNG of the current frame (transparent background). */
  capture() {
    this.renderOnce();
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored);
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) {
        for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
        m.dispose();
      }
    });
    for (const l of Object.values(this.lights)) l.dispose?.();
    this.mask?.dispose();
    this._occRO?.disconnect();
    this.morph?.dispose();
    this.star?.dispose();
    this.vector?.dispose();
    this.ring?.matcap.dispose();
    this.ring?.dayMatcap.dispose();
    this.scene.environment = null;
    this.envTarget.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

Stage.prototype._tmpColor = new THREE.Color();
Stage.prototype._tmpM = new THREE.Matrix4();
Stage.prototype._tmpV = new THREE.Vector3();
Stage.prototype._focus = new THREE.Vector3();
Stage.prototype._white = new THREE.Color(1, 1, 1);

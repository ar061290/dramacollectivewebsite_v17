// The two marble theatre masks either side of a piece on its reading page: tragedy on the left,
// comedy on the right, each cut in half by the edge of the screen and turned a little toward the
// text, as if the page were the stage between them. The model is the publication's pair of masks
// (assets/models/masks.glb, made by tools/masks/build-masks.mjs: two meshes, "tragedy" and
// "comedy", each a height of 1). They stand in full light as plain stone, as the home page's
// sculpture does: a soft room light and a key from the upper left, never left in shadow. The light
// that moves is the cursor's: the page's gold glow (src/animations/cursor.js) as a small warm lamp
// held just in front of the stone under the pointer, a pool of gold there and nowhere else, as on
// the publication's statue (src/scene/thinker.js). One fixed canvas behind the text, under the
// footer, holding still while the page scrolls; it draws only when something changes (the lamp
// moving, the window's size, the theme). A click on a mask puts it away (it fades); a click in the
// same place brings it back.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { readToken } from '../util/env.js';

// the Draco decoder served with the site (as for the statues)
const DRACO_PATH = import.meta.env ? new URL('draco/', document.baseURI).href : new URL('../../public/draco/', import.meta.url).href;

const TURN = 0.26; // how far each turns toward the text (radians)
// the room's light in each theme (the soft light from all round, the key, the exposure) and the
// cursor's lamp (its gold, its strength where it is held)
const STAGE = {
  dark: { hemi: 1.6, key: 1.6, exposure: 1.15, glow: '--gold-300', glowPower: 6 },
  light: { hemi: 1.8, key: 1.8, exposure: 1.15, glow: '--gold-600', glowPower: 5 },
};
// how far in front of the stone the lamp is held and how far its light reaches (in mask heights),
// and how quickly it eases after the pointer
const GLOW = { ahead: 0.1, reach: 0.4, ease: 9 };

const tokenColor = (name) => new THREE.Color(readToken(name) || '#ebd88c');

/**
 * The front of a mask, seen straight on: for a grid over its face, how far forward its stone comes
 * (in its own units), so the cursor's lamp can be held just in front of whatever is under the
 * pointer. Empty cells (the eyes, the mouth, around the outline) take their neighbours' depth.
 */
function frontOf(geometry) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  const cell = 0.012;
  const nx = Math.ceil((b.max.x - b.min.x) / cell) + 1, ny = Math.ceil((b.max.y - b.min.y) / cell) + 1;
  const z = new Float32Array(nx * ny).fill(-Infinity);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const gx = Math.round((p.getX(i) - b.min.x) / cell), gy = Math.round((p.getY(i) - b.min.y) / cell);
    const k = gy * nx + gx;
    if (p.getZ(i) > z[k]) z[k] = p.getZ(i);
  }
  for (let pass = 0; pass < 60; pass++) {
    let empty = 0;
    const next = z.slice();
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const k = y * nx + x;
      if (z[k] > -Infinity) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
        const v = z[yy * nx + xx];
        if (v > -Infinity) { s += v; n++; }
      }
      if (n) next[k] = s / n; else empty++;
    }
    z.set(next);
    if (!empty) break;
  }
  for (let k = 0; k < z.length; k++) if (z[k] === -Infinity) z[k] = b.min.z;
  return { x0: b.min.x, y0: b.min.y, cell, nx, ny, z };
}
function frontAt(f, x, y) {
  const u = Math.min(Math.max((x - f.x0) / f.cell, 0), f.nx - 1.001);
  const v = Math.min(Math.max((y - f.y0) / f.cell, 0), f.ny - 1.001);
  const i = Math.floor(u), j = Math.floor(v), a = u - i, c = v - j, k = j * f.nx + i, z = f.z;
  return (z[k] * (1 - a) + z[k + 1] * a) * (1 - c) + (z[k + f.nx] * (1 - a) + z[k + f.nx + 1] * a) * c;
}

export class Masks {
  /**
   * Fetch the model, then make the masks.
   * @param {HTMLElement} host  a fixed box covering the viewport (the canvas goes in it)
   * @param {string} url        assets/models/masks.glb
   * @param {object} o          see the constructor
   */
  static async create(host, url, o) {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH).setDecoderConfig({ type: 'wasm' });
    try {
      const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url);
      const meshes = ['tragedy', 'comedy'].map((n) => {
        let mesh = null;
        gltf.scene.getObjectByName(n)?.traverse((c) => { if (!mesh && c.isMesh) mesh = c; });
        if (!mesh) throw new Error(`masks: no ${n}`);
        return mesh;
      });
      return new Masks(host, meshes, o);
    } finally {
      draco.dispose();
    }
  }

  /**
   * @param {HTMLElement} host
   * @param {THREE.Mesh[]} meshes      tragedy, comedy (from the model)
   * @param {object} o
   * @param {string} o.theme           'dark' or 'light'
   * @param {boolean} o.reduced        the lamp jumps to the pointer instead of easing after it
   * @param {number} [o.textColumn]    the text column's width (px): the masks keep out of it
   */
  constructor(host, meshes, { theme = 'dark', reduced = false, textColumn = 680 } = {}) {
    this.host = host;
    this.reduced = reduced;
    this.textColumn = textColumn;
    const dpr = Math.min(devicePixelRatio, 1.75);
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, alpha: true }));
    r.setPixelRatio(dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setClearColor(0x000000, 0);
    r.domElement.setAttribute('aria-hidden', 'true');
    r.domElement.style.opacity = '0';
    r.domElement.style.transition = 'opacity 1.2s cubic-bezier(.22,.61,.36,1)';
    host.append(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(20, 1, 1, 100000);

    // the stone: the model's marble, matte with a soft sheen
    // (each its own copy of the marble, so each can fade on its own; the textures are shared)
    this.masks = meshes.map((src) => {
      const m = new THREE.Mesh(src.geometry, src.material.clone());
      const mat = m.material;
      m.userData.shown = 1; // 1 out, 0 put away (a click turns it)
      m.userData.fade = 1;
      mat.roughness = 0.55;
      mat.metalness = 0;
      if (mat.normalScale) mat.normalScale.set(0.8, 0.8);
      m.userData.front = frontOf(m.geometry);
      const bb = m.geometry.boundingBox;
      m.userData.aspect = (bb.max.x - bb.min.x) / (bb.max.y - bb.min.y);
      this.scene.add(m);
      return m;
    });

    // the room's light: soft from all round (warm from above, the page's plum below) and a key from
    // the upper left, as the home page's stone sculpture is lit; then the cursor's lamp
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
    this.key = new THREE.DirectionalLight(0xffffff, 0);
    this.glow = new THREE.PointLight(0xffffff, 0, 1, 2);
    this.scene.add(this.hemi, this.key, this.key.target, this.glow);

    this.pointer = { x: -1e4, y: -1e4, on: 0, to: 0, seen: false };
    this.glowAt = new THREE.Vector3();
    this.glowTo = new THREE.Vector3();
    this.frame = 0;
    this._tick = this._tick.bind(this);
    this._onMove = (e) => {
      if (e.pointerType === 'touch' && e.buttons === 0) return; // a finger lights only while it is down
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.to = 1;
      const snap = !this.pointer.seen;
      this.pointer.seen = true;
      this._placeGlow(snap);
      this._wake();
    };
    this._onLeave = () => { this.pointer.to = 0; this._wake(); };
    this._onResize = () => { this._layout(); this._wake(); };
    this._onClick = (e) => {
      if (e.button !== 0 || e.defaultPrevented || String(getSelection?.() ?? '')) return;
      // a click on the page beside the text, not on anything of its own
      if (e.target.closest?.('a, button, input, select, textarea, label, summary, [tabindex], [data-topbar], .pub-ticker, footer, .read__head, .read__body, .read__end')) return;
      const m = this.masks.find((k) => { const r = k.userData.rect; return r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      if (!m) return;
      m.userData.shown = m.userData.shown ? 0 : 1;
      this._wake();
    };
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('click', this._onClick);
    window.addEventListener('pointerdown', this._onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('resize', this._onResize);
    this.setTheme(theme);
    this._layout();
    this._draw();
    requestAnimationFrame(() => { r.domElement.style.opacity = '1'; });
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    const s = STAGE[this.theme];
    const white = new THREE.Color(1, 1, 1);
    this.hemi.color.copy(tokenColor('--gold-100').lerp(white, 0.6));
    this.hemi.groundColor.copy(tokenColor(this.theme === 'light' ? '--plum-100' : '--plum-700').lerp(white, 0.25));
    this.hemi.intensity = s.hemi;
    this.key.color.copy(tokenColor('--gold-300').lerp(white, 0.55));
    this.key.intensity = s.key;
    this.glow.color.copy(tokenColor(s.glow));
    this.renderer.toneMappingExposure = s.exposure;
    this._wake();
  }

  /** Where the masks stand: their middles on the screen's edges, as tall as there is room for. */
  _layout() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    // the camera sees exactly the viewport, in CSS pixels, on the plane z = 0
    const cam = this.camera;
    cam.aspect = w / h;
    cam.position.set(0, 0, h / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    cam.near = cam.position.z * 0.2;
    cam.far = cam.position.z * 4;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // the room either side of the text column, less a gutter: half a mask fits in it
    const side = (w - this.textColumn) / 2 - 40;
    let scale = h * 0.84;
    for (const m of this.masks) scale = Math.min(scale, (side * 2) / m.userData.aspect);
    this.scale = Math.max(0, scale);
    const [tragedy, comedy] = this.masks;
    tragedy.scale.setScalar(this.scale);
    tragedy.position.set(-w / 2, 0, 0);
    tragedy.rotation.set(0, TURN, 0);
    comedy.scale.setScalar(this.scale);
    comedy.position.set(w / 2, 0, 0);
    comedy.rotation.set(0, -TURN, 0);
    // where each lies on the screen (what a click there turns), from its box
    for (const m of this.masks) {
      m.updateMatrixWorld(true);
      const bb = m.geometry.boundingBox, v = new THREE.Vector3();
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld).project(cam);
        const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
        l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
      }
      m.userData.rect = { left: Math.max(0, l), right: Math.min(w, r), top: t, bottom: b };
    }
    // the key from the upper left, in front
    this.key.position.set(-0.55 * w, 0.6 * h, cam.position.z * 0.6);
    this.glow.distance = this.scale * GLOW.reach;
    if (this.pointer.seen) this._placeGlow(true);
  }

  /**
   * The lamp: on the line from the camera through the pointer, held GLOW.ahead in front of the
   * stone that line meets (the nearer mask's front, frontOf); beside the masks, at the depth of the
   * nearer one's edge, where its light reaches nothing. Settled in three rounds.
   */
  _placeGlow(snap) {
    const w = innerWidth, h = innerHeight, cam = this.camera;
    const m = this.pointer.x < w / 2 ? this.masks[0] : this.masks[1];
    const dir = new THREE.Vector3((this.pointer.x / w) * 2 - 1, -(this.pointer.y / h) * 2 + 1, 0.5)
      .unproject(cam).sub(cam.position).normalize();
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
    const local = new THREE.Vector3(), world = new THREE.Vector3();
    let zw = 0;
    for (let k = 0; k < 3; k++) {
      world.copy(cam.position).addScaledVector(dir, (zw - cam.position.z) / dir.z);
      local.copy(world).applyMatrix4(inv);
      local.z = frontAt(m.userData.front, local.x, local.y);
      zw = world.copy(local).applyMatrix4(m.matrixWorld).z;
    }
    // then back toward the camera along the same line, so the pool is centred on the pointer
    const t = (zw - cam.position.z) / dir.z - (this.scale * GLOW.ahead) / Math.abs(dir.z);
    this.glowTo.copy(cam.position).addScaledVector(dir, t);
    if (snap) this.glowAt.copy(this.glowTo);
  }

  _wake() { if (!this.frame) this.frame = requestAnimationFrame(this._tick); }

  _tick(now) {
    this.frame = 0;
    const dt = this.last === undefined ? 1 / 60 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const p = this.pointer;
    const k = this.reduced ? 1 : 1 - Math.exp(-GLOW.ease * dt);
    const before = this.glowAt.clone();
    this.glowAt.lerp(this.glowTo, k);
    const was = p.on;
    p.on += (p.to - p.on) * (this.reduced ? 1 : 1 - Math.exp(-6 * dt));
    this.glow.position.copy(this.glowAt);
    const held = this.scale * GLOW.ahead;
    this.glow.intensity = p.on * STAGE[this.theme].glowPower * held * held;
    // a mask put away fades out, and back in when it is brought back
    let fading = false;
    for (const m of this.masks) {
      const u = m.userData, mat = m.material;
      u.fade += (u.shown - u.fade) * (this.reduced ? 1 : 1 - Math.exp(-9 * dt));
      if (Math.abs(u.shown - u.fade) < 0.004) u.fade = u.shown; else fading = true;
      const see = u.fade < 0.999;
      if (mat.transparent !== see) { mat.transparent = see; mat.depthWrite = !see; mat.needsUpdate = true; }
      mat.opacity = u.fade;
      m.visible = u.fade > 0;
    }
    this._draw();
    if (fading || before.distanceTo(this.glowAt) > 0.05 || Math.abs(p.on - was) > 0.001) this._wake();
    else this.last = undefined;
  }

  _draw() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerdown', this._onMove);
    window.removeEventListener('click', this._onClick);
    document.documentElement.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('resize', this._onResize);
    for (const m of this.masks) {
      m.geometry.dispose();
      for (const k of ['map', 'normalMap']) m.material[k]?.dispose();
      m.material.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

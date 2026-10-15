// About us: the home page's Penrose ring, alone, around the five words (src/sections/lexicon.js),
// cut in the statue's own white marble instead of the ring's darker stone. It turns about the
// viewing axis and draws back as the page scrolls (the only ways it may move: its impossible shape
// holds from one eye, on its axis), and draws only when it moves or the theme changes.
//
// The stone is the statue's: a standard (lit) surface at the statue's roughness and reflectance,
// the ring's own white-marble maps tinted to the statue's average colour, under the stage's lights
// (src/scene/Stage.js): the warm key from above right and in front, a cool rim from behind, the
// even sky fill of the house lights in the light theme, a faint fill for the room around it and
// the same filmic tone curve. The lights are directional, so a face is lit by its direction alone
// and the two ends of the false joint, one behind the other on the same rays with the same
// normals, always match.
//
// Nothing here may hold the page up. The room was once a reflection rendered at start-up (a
// RoomEnvironment through a PMREM: a cube drawn and blurred, its shaders compiled on the spot,
// about half a second on built-in graphics just as the curtain parts); a soft light from above and
// around now lights the stone as brightly, at no cost. The stone's shader is compiled off the page
// where the browser can (compileAsync) before the first frame is drawn.
import * as THREE from 'three';
import { createRing, placeRing } from './ringStone.js';

// the statue's average stone colour (its Meshy base colour map, sRGB, as statue.js measures it on
// the home page), so the marble matches without loading the statue here
const STATUE_STONE = '#99958c';
const ROUGHNESS = 0.45; // prepareStatue's
// the stage's lights, set by eye against the statue on the home page (Stage.js gives the statue
// about 2.5 from its key and 0.56 from its rim; a ring this thin, seen mostly edge-on, needs a
// brighter key and a little fill from the eye for its faces to read as the same lit marble).
// room: the soft light from above and around that stands in for the room's reflection, set so the
// ring's stone reads as bright as it did with it (its mean and its shadows within a few levels
// of 255, measured on the rendered ring in each theme)
const LEVELS = {
  night: { key: 3.2, rim: 0.56, sky: 0.05, room: 1.35, exposure: 1 },
  day: { key: 2.8, rim: 0.56, sky: 1.7, room: 2.7, exposure: 0.88 },
};
// the fill from the eye in the dark: the statue's far side may fall to black on the stage, but the
// ring's shaded faces have to read as stone (in daylight the sky does this)
const NIGHT_FILL = 0.3;

/** A quiet moment on the page (or a short wait where the browser cannot say). */
const quiet = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 600 }) : setTimeout(r, 30)));

export class AboutRing {
  /**
   * @param {HTMLElement} container  the stage the canvas fills (sized by CSS)
   * @param {{ theme?: 'dark'|'light', colors: { warm: string, rim: string } }} o
   */
  constructor(container, { theme = 'dark', colors }) {
    this.container = container;
    this.day = theme === 'light';
    // low-power: on a laptop with two graphics chips the built-in one is plenty for one ring
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'lexicon__canvas';
    container.append(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.scene.add(this.camera); // the ring rides on the camera, as on the stage

    // the camera never moves and the ring sits on its axis, so these directions are the stage's
    // as the audience sees them
    const white = new THREE.Color(1, 1, 1);
    const warm = new THREE.Color(colors.warm).lerp(white, 0.35); // Stage.js: marble stays white, not khaki
    const rim = new THREE.Color(colors.rim);
    this.key = new THREE.DirectionalLight(warm, 0);
    this.key.position.set(1.35, 2.45, 1.6);
    this.rim = new THREE.DirectionalLight(rim, 0);
    this.rim.position.set(-1.4, 1.6, -1.8);
    this.fill = new THREE.DirectionalLight(warm, 0); // from the eye, a little high
    this.fill.position.set(0, 0.6, 1);
    this.sky = new THREE.HemisphereLight(rim, 0x000000, 0);
    // the room: white from above, half as bright from the floor, as a lit room's walls would give
    this.room = new THREE.HemisphereLight(white, new THREE.Color(0.5, 0.5, 0.5), 0);
    this.scene.add(this.key, this.rim, this.fill, this.sky, this.room);

    this.view = { spin: 0, scale: 1, ppu: 1000, cx: 0, cy: 0 };
    this.ro = new ResizeObserver(() => this._resize());
  }

  async load({ albedo, normal }) {
    const loader = new THREE.TextureLoader();
    const tex = async (url, srgb) => {
      const t = await loader.loadAsync(url);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    const [a, n] = await Promise.all([tex(albedo, true), tex(normal, false)]);
    // each step below waits for its own quiet moment (the ring's geometry, the shader, each map,
    // the first frame), so none of them stands in the way of a scroll or a tap
    await quiet();
    if (this.disposed) { a.dispose(); n.dispose(); return; }
    this.ring = createRing({ albedo: a, normal: n });
    // the same geometry, in the statue's material in place of the matcap stone
    this.ring.material.dispose();
    this.material = new THREE.MeshStandardMaterial({
      name: 'RingMarble',
      map: a,
      normalMap: n,
      normalScale: new THREE.Vector2(0.35, 0.35),
      color: new THREE.Color(STATUE_STONE),
      roughness: ROUGHNESS,
      metalness: 0,
    });
    for (const mesh of this.ring.frame.children) mesh.material = this.material;
    this.camera.add(this.ring.root);
    placeRing(this.ring, 10);
    this._applyTheme();
    // the stone's shader, compiled before anything is drawn (where the browser compiles in
    // parallel the page keeps answering meanwhile); the first frame then has nothing left to build
    await this.renderer.compileAsync(this.scene, this.camera);
    // and the two maps sent to the graphics chip one at a time, each in a quiet moment, rather than
    // both inside the first frame
    for (const t of [a, n]) {
      await quiet();
      if (this.disposed) return;
      this.renderer.initTexture(t);
    }
    await quiet();
    if (this.disposed) return;
    this._resize();
    this.ro.observe(this.container);
  }

  /**
   * Where the ring stands: `spin` about the viewing axis (radians), `scale` of its image, `ppu` the
   * pixels per unit of tan(angle) at scale 1, and (cx, cy) the point of the ring's image (tan units,
   * y up) that is kept on the middle of the stage as it turns: the middle of its hole.
   */
  set({ spin = this.view.spin, scale = this.view.scale, ppu = this.view.ppu, cx = this.view.cx, cy = this.view.cy }) {
    const v = this.view;
    if (spin === v.spin && scale === v.scale && ppu === v.ppu && cx === v.cx && cy === v.cy) return;
    Object.assign(v, { spin, scale, ppu, cx, cy });
    this._frame();
    this.render();
  }

  setTheme(theme) {
    this.day = theme === 'light';
    this._applyTheme();
    this.render();
  }

  _applyTheme() {
    const L = this.day ? LEVELS.day : LEVELS.night;
    this.key.intensity = L.key;
    this.rim.intensity = L.rim;
    this.sky.intensity = L.sky;
    this.fill.intensity = this.day ? 0 : NIGHT_FILL;
    this.room.intensity = L.room;
    this.renderer.toneMappingExposure = L.exposure;
  }

  // the field of view that gives `ppu * scale` pixels per tan unit, and the view offset that keeps
  // the hole's middle, turned with the ring, on the middle of the stage
  _frame() {
    const { spin, scale, ppu, cx, cy } = this.view;
    const w = this.width, h = this.height;
    if (!w || !h) return;
    const k = ppu * scale;
    this.camera.fov = (2 * Math.atan(h / 2 / k) * 180) / Math.PI;
    const c = Math.cos(spin), s = Math.sin(spin);
    const x = (cx * c - cy * s) * k, y = (cx * s + cy * c) * k;
    this.camera.setViewOffset(w, h, x, -y, w, h);
    this.camera.updateProjectionMatrix();
  }

  _resize() {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this._frame();
    this.render();
  }

  render() {
    if (!this.ring || this.disposed) return;
    this.ring.spinner.rotation.z = this.view.spin;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.ro.disconnect();
    if (this.ring) {
      this.ring.frame.children.forEach((c) => c.geometry.dispose());
      this.material.map?.dispose();
      this.material.normalMap?.dispose();
      this.material.dispose();
      this.ring.matcap.dispose();
      this.ring.dayMatcap.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

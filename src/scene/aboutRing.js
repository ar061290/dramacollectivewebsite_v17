// About us: the home page's stone Penrose ring, on its own, standing half off the right edge of the
// screen while the page scrolls past it, and turning about its own centre as it does (the only way
// it may turn: its impossible shape holds from one eye, on its axis). The same carved stone and the
// same matcap shading as on the home page's stage (src/scene/ringStone.js), in the dark theatre or
// with the house lights up. It draws only when it turns or the theme changes.
import * as THREE from 'three';
import { createRing, placeRing, RING_EYE } from './ringStone.js';

const STONE = new THREE.Color(0xe9e5de); // the stage's ring tint without a statue to take it from
const LAMP = new THREE.Color('#f6e7c8'); // the warm stage lamp it is lit by in the dark theatre (gold-300, softened)
const LEVEL = { night: 0.62, day: 0.92 }; // its brightness in each theme

export class AboutRing {
  /**
   * @param {HTMLElement} container  square, sized by CSS
   * @param {{ theme?: 'dark'|'light' }} o
   */
  constructor(container, { theme = 'dark' } = {}) {
    this.container = container;
    this.day = theme === 'light';
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    r.domElement.style.opacity = '0';
    r.domElement.style.transition = 'opacity .9s cubic-bezier(.22,.61,.36,1)';
    container.append(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.scene.add(this.camera); // the ring rides on the camera, as on the stage
    this.spin = 0;
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
    if (this.disposed) return;
    this.ring = createRing({ albedo: a, normal: n });
    const m = this.ring.material;
    m.opacity = 1;
    m.transparent = false;
    this.camera.add(this.ring.root);
    placeRing(this.ring, 10);
    // the field of view that just holds the whole ring (its farthest point from the axis, as the
    // eye sees it), with a small margin
    let reach = 0;
    for (const mesh of this.ring.frame.children) {
      const p = mesh.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) reach = Math.max(reach, Math.hypot(p[i], p[i + 1]) / (RING_EYE - p[i + 2]));
    }
    this.camera.fov = (2 * Math.atan(reach * 1.03) * 180) / Math.PI;
    this._applyTheme();
    this._resize();
    this.ro.observe(this.container);
    requestAnimationFrame(() => { this.renderer.domElement.style.opacity = '1'; });
  }

  /** Turn about the viewing axis (radians). */
  setSpin(rad) {
    if (rad === this.spin) return;
    this.spin = rad;
    this.render();
  }

  setTheme(theme) {
    this.day = theme === 'light';
    this._applyTheme();
    this.render();
  }

  _applyTheme() {
    if (!this.ring) return;
    const m = this.ring.material;
    m.matcap = this.day ? this.ring.dayMatcap : this.ring.matcap;
    m.color.copy(STONE).multiplyScalar(this.day ? LEVEL.day : LEVEL.night);
    if (!this.day) m.color.multiply(LAMP);
    m.needsUpdate = true;
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    if (!this.ring || this.disposed) return;
    this.ring.spinner.rotation.z = this.spin;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.ro.disconnect();
    if (this.ring) {
      this.ring.frame.children.forEach((c) => c.geometry.dispose());
      const m = this.ring.material;
      m.map?.dispose(); m.normalMap?.dispose(); m.dispose();
      this.ring.matcap.dispose(); this.ring.dayMatcap.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

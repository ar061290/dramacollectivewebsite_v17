// The sponsor page's medallion: the Collective's mark in metal (the same extrusion as the home
// page's logo, src/scene/logo.js) inside a thin ring, lit by a key light that leans toward the
// pointer. It starts in the statue's stone; picking a tier turns it to bronze, silver or gold with
// one full turn. Drag it (or swipe it) to spin it; it settles back to face you. Frames are drawn
// only while something moves. Transparent, so the page and its stars show around it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { antialias } from '../util/env.js';
import { stopLoop } from './loop.js';
import { buildLogoGeometry } from './logo.js';

// albedo of each finish (metals: their reflectance colour)
const FINISH = {
  stone: { color: '#8d8675', metalness: 0, roughness: 0.62, clearcoat: 0 },
  bronze: { color: '#c58a5a', metalness: 1, roughness: 0.34, clearcoat: 0.3 },
  silver: { color: '#dfe2e6', metalness: 1, roughness: 0.26, clearcoat: 0.4 },
  gold: { color: '#f0cf7e', metalness: 1, roughness: 0.28, clearcoat: 0.4 },
};
const TAU = Math.PI * 2;

export class Medallion {
  constructor(container, { reduced = false } = {}) {
    this.container = container;
    this.reduced = reduced;
    this.visible = true;
    this.dirty = true;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: antialias(true), alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.setClearColor(0x000000, 0);
    r.domElement.style.opacity = '0';
    r.domElement.style.transition = 'opacity .8s cubic-bezier(.22,.61,.36,1)';
    container.append(r.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    this.camera.position.set(0, 0, 5.2);

    this.scene.add(new THREE.HemisphereLight('#f3e7e9', '#2a0d1c', 0.5));
    this.key = new THREE.SpotLight('#fff3dc', 60, 0, 0.5, 0.6, 2);
    this.key.position.set(-2.2, 2.6, 4.2);
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight('#ebd88c', 1.6);
    rim.position.set(2, 2.5, -3);
    this.scene.add(rim);

    this.pivot = new THREE.Group(); // spun by drags and tier changes
    this.tiltGroup = new THREE.Group(); // leans toward the pointer
    this.tiltGroup.add(this.pivot);
    this.scene.add(this.tiltGroup);

    this.spin = { angle: 0, vel: 0 };
    this.lean = { x: 0, y: 0, tx: 0, ty: 0 };
    this.drag = null;
    this._tick = this._tick.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onLeave = this._onLeave.bind(this);
    container.addEventListener('pointerdown', this._onDown);
    container.addEventListener('pointermove', this._onMove, { passive: true });
    container.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    this.ro = new ResizeObserver(() => this._resize());
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._sync(); });
  }

  async load(svgUrl) {
    const svg = await (await fetch(svgUrl)).text();
    const { geometry } = buildLogoGeometry(svg, { center: new THREE.Vector3(), radius: 0.92, depth: 0.1, maxTriangles: 60000 });
    const f = FINISH.stone;
    this.material = new THREE.MeshPhysicalMaterial({ color: f.color, metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: 0.25, envMapIntensity: 1.2 });
    this.mark = new THREE.Mesh(geometry, this.material);
    this.mark.rotation.y = Math.PI; // the extrusion reads from -z; turn it to face the camera
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.03, 20, 180), this.material);
    this.pivot.add(this.mark, this.ring);
    this._resize();
    this.ro.observe(this.container);
    this.io.observe(this.container);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => { this.renderer.domElement.style.opacity = '1'; });
    this._sync();
  }

  /** Turn to a finish ('bronze' | 'silver' | 'gold' | 'stone'); `turn` adds one full revolution. */
  setFinish(name, { turn = true } = {}) {
    const f = FINISH[name] ?? FINISH.stone;
    if (!this.material) return;
    const m = this.material;
    const to = new THREE.Color(f.color);
    const d = this.reduced ? 0 : 0.7;
    gsap.to(m.color, { r: to.r, g: to.g, b: to.b, duration: d, ease: 'power2.inOut', onUpdate: () => this._wake() });
    gsap.to(m, { metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat, duration: d, ease: 'power2.inOut', onUpdate: () => this._wake() });
    if (turn && !this.reduced) {
      const target = Math.round(this.spin.angle / TAU) * TAU + TAU;
      this.spin.vel = 0;
      gsap.to(this.spin, { angle: target, duration: 1.3, ease: 'curtain', overwrite: true, onUpdate: () => this._wake() });
    }
  }

  // ---- interaction ----

  _onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gsap.killTweensOf(this.spin);
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), mode: null };
  }

  _onMove(e) {
    // the lean: toward the pointer while it is over the medallion
    if (e.currentTarget === this.container && e.pointerType === 'mouse') {
      const r = this.container.getBoundingClientRect();
      this.lean.ty = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
      this.lean.tx = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
      this._wake();
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.id || e.currentTarget !== window) return;
    const dx = e.clientX - d.lx;
    if (!d.mode) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.mode = Math.abs(e.clientX - d.x) > Math.abs(e.clientY - d.y) ? 'spin' : 'scroll';
    }
    if (d.mode !== 'spin') return;
    const now = performance.now();
    const w = this.container.clientWidth;
    const delta = (dx / w) * Math.PI * 1.6;
    this.spin.angle += delta;
    this.spin.vel = delta / Math.max(0.008, (now - d.lt) / 1000);
    d.lx = e.clientX;
    d.lt = now;
    this._wake();
  }

  _onUp(e) {
    if (!this.drag || (e && e.pointerId !== this.drag.id)) return;
    const spun = this.drag.mode === 'spin';
    this.drag = null;
    if (!spun) return;
    // fling, then come to rest facing front
    this.spin.vel = THREE.MathUtils.clamp(this.spin.vel, -14, 14);
    this.settling = true;
    this._wake();
  }

  _onLeave(e) {
    if (e.pointerType === 'mouse') { this.lean.tx = 0; this.lean.ty = 0; this._wake(); }
  }

  // ---- frames ----

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._wake();
  }

  _sync() {
    const go = this.visible && !document.hidden;
    if (go && !this.running) { this.running = true; this.last = performance.now(); this.renderer.setAnimationLoop(this._tick); }
    else if (!go && this.running) { this.running = false; stopLoop(this.renderer, () => !this.running); }
  }

  _wake() { this.dirty = true; }

  _tick(now) {
    const dt = Math.min(0.05, (now - (this.last ?? now)) / 1000);
    this.last = now;
    let moving = false;
    if (this.settling && !this.drag) {
      // friction, then a spring to the nearest front-facing angle
      this.spin.vel *= Math.exp(-dt * 2.4);
      this.spin.angle += this.spin.vel * dt;
      if (Math.abs(this.spin.vel) < 2.2) {
        const rest = Math.round(this.spin.angle / TAU) * TAU;
        this.spin.vel += (rest - this.spin.angle) * 30 * dt;
        this.spin.vel *= Math.exp(-dt * 6);
        if (Math.abs(rest - this.spin.angle) < 1e-3 && Math.abs(this.spin.vel) < 1e-2) { this.spin.angle = rest; this.spin.vel = 0; this.settling = false; }
      }
      moving = true;
    }
    const k = 1 - Math.exp(-dt * 6);
    const lx = this.lean.x, ly = this.lean.y;
    this.lean.x += (this.lean.tx - this.lean.x) * k;
    this.lean.y += (this.lean.ty - this.lean.y) * k;
    if (Math.abs(this.lean.x - lx) + Math.abs(this.lean.y - ly) > 1e-5) moving = true;
    if (!moving && !this.dirty) return;
    this.dirty = false;
    this.pivot.rotation.y = this.spin.angle;
    this.tiltGroup.rotation.set(this.reduced ? 0 : this.lean.x, this.reduced ? 0 : this.lean.y, 0);
    this.key.target.position.set(this.lean.y * 2, -this.lean.x * 2, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.io.disconnect();
    this.container.removeEventListener('pointerdown', this._onDown);
    this.container.removeEventListener('pointermove', this._onMove);
    this.container.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.mark?.geometry.dispose();
    this.ring?.geometry.dispose();
    this.material?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

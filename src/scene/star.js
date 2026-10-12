// The logo's star, from the sky. The four-pointed star beside the mask is the one part of the mark
// that is not made from the statue: as her robes stream into the rest of the logo, one more star
// shows in the sky behind the stage, twinkling like the others; then it comes forward, turning as it
// nears, through the ring's opening, and settles into its place on the logo as the logo reaches its
// own, the same stone as the rest, with a glint as it lands. Scrolling back sends it home again.
//
// It is one extruded star (src/scene/logo.js: the same depth and bevel as the mark) on the
// turntable, so once it has landed it turns with the logo, and a glow sprite that is the sky star
// while it is far away. Everything is driven by the morph's progress (MORPH in morph.js).

import * as THREE from 'three';
import { STATUE_LAYER } from './statue.js';

export const STAR = {
  appear: [0.36, 0.44], // morph progress: it shows in the sky, a star among the others
  flight: [0.44, 0.95], // it comes forward to its place on the logo (the logo grows 0.55-1)
  flash: [0.9, 1], // the glint as it lands
  depth: 3.2, // it starts this many times the camera's distance from its place, far behind the ring
  offset: [0.16, 0.34], // and on screen, up and to the right of its place, in open sky (view half-sizes)
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const span = ([a, b], t) => clamp01((t - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A sky star's glow: a warm core, a soft halo and four thin rays. */
function glowTexture() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const halo = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.12, 'rgba(255,255,255,0.85)');
  halo.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[n, 3], [3, n]]) {
    const ray = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    ray.addColorStop(0, 'rgba(255,255,255,0.9)');
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ray;
    g.fillRect((n - w) / 2, (n - h) / 2, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LogoStar {
  /**
   * @param {object} o
   * @param {THREE.BufferGeometry} o.geometry  the star, at its full-size place (turntable space)
   * @param {THREE.Object3D} o.space           the turntable
   * @param {THREE.Scene} o.scene              for the glow (world space)
   * @param {THREE.Color} [o.stone]            the statue's stone colour
   */
  constructor({ geometry, space, scene, stone }) {
    geometry.computeBoundingBox();
    this.home = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-this.home.x, -this.home.y, -this.home.z);
    this.space = space;
    this.material = new THREE.MeshStandardMaterial({
      color: stone ?? new THREE.Color(0xd8d3ca),
      roughness: 0.45,
      metalness: 0,
      envMapIntensity: 0.45,
      emissive: new THREE.Color('#ebd88c'), // gold-500: it burns like a star while it is far away
      emissiveIntensity: 0,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'LogoStar';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.layers.enable(STATUE_LAYER); // the sky's stars keep clear of it, as of the logo
    this.mesh.visible = false;
    space.add(this.mesh);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color('#ebd88c'),
      transparent: true,
      depthWrite: false,
      depthTest: true, // like the sky's stars, it is hidden by the figure while it is behind her
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.glow.renderOrder = 10;
    this.glow.visible = false;
    scene.add(this.glow);

    this.twinkling = false;
    this._v = { target: new THREE.Vector3(), world: new THREE.Vector3(), start: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
  }

  /**
   * @param {number} t   the morph's progress (0..1)
   * @param {object} o
   * @param {{ at: THREE.Vector3, scale: number }} o.fit  where the logo stands now (morph.current)
   * @param {THREE.Vector3} o.center   the full-size logo's centre (turntable space)
   * @param {THREE.PerspectiveCamera} o.camera  placed for this frame
   * @param {number} o.height          the view's height in CSS pixels
   * @param {number} o.time            seconds, for the twinkle
   * @param {number} o.day             0 the dark theatre .. 1 house lights up
   * @param {boolean} o.solid          false once the flat vector has taken over the logo
   */
  update(t, { fit, center, camera, height, time, day, solid }) {
    const appear = smooth(span(STAR.appear, t));
    const showing = appear > 0;
    this.mesh.visible = showing && t >= STAR.flight[0];
    this.glow.visible = showing;
    this.twinkling = showing && t < STAR.flight[0] + 0.02;
    if (!showing) return;
    const v = this._v;

    // its place on the logo as it stands now, in the world
    this.space.updateMatrixWorld();
    const local = v.target.copy(this.home).sub(center).multiplyScalar(fit.scale).add(fit.at);
    const home = this.space.localToWorld(v.world.copy(local));
    // where it starts: far behind the stage, in the open sky up and to the right of its place on
    // screen (inside the ring's opening, which the close-up and the logo leave wide)
    const ndc = v.a.copy(home).project(camera);
    ndc.x = Math.min(0.85, ndc.x + STAR.offset[0]);
    ndc.y = Math.min(0.8, ndc.y + STAR.offset[1]);
    const near = v.b.set(ndc.x, ndc.y, -1).unproject(camera);
    const far = v.c.set(ndc.x, ndc.y, 1).unproject(camera);
    const dir = far.sub(near).normalize();
    const start = v.start.copy(camera.position).addScaledVector(dir, STAR.depth * camera.position.distanceTo(home));

    const u = span(STAR.flight, t);
    const e = inOutCubic(u);
    const pos = v.a.copy(start).lerp(home, e);
    // the stone star: small and burning while far, turning as it comes, cooling as it lands
    this.mesh.position.copy(this.space.worldToLocal(v.b.copy(pos)));
    this.mesh.scale.setScalar(fit.scale * (0.4 + 0.6 * e));
    this.mesh.rotation.set(0, (1 - e) * 0.9, (1 - e) * Math.PI * 2.5);
    const flash = Math.sin(Math.PI * span(STAR.flash, t));
    this.material.emissiveIntensity = (1 - day * 0.6) * (2.2 * Math.pow(1 - e, 1.4) + 0.5 * flash);
    this.material.colorWrite = this.material.depthWrite = solid;

    // the glow: a star in the sky at first (a few pixels, twinkling), brightest mid-flight, gone
    // once the stone has it, but for the glint as it lands
    const twinkle = this.twinkling ? 0.8 + 0.2 * Math.sin(time * 7.3) * Math.sin(time * 3.1) : 1;
    const px = (10 + 46 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u)) * twinkle + 120 * flash;
    const dist = camera.position.distanceTo(pos);
    const zoom = camera.view?.enabled ? camera.view.fullHeight / camera.view.height : 1;
    const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist) / (height * zoom);
    this.glow.position.copy(pos).addScaledVector(dir.copy(camera.position).sub(pos).normalize(), 0.05);
    this.glow.scale.setScalar(px * perPx);
    const m = this.glow.material;
    m.opacity = appear * (u < 1 ? 1 - 0.75 * smooth(clamp01((u - 0.7) / 0.3)) : 0) + flash * 0.9;
    m.opacity *= solid ? 1 : 0;
    // on the light page an additive glow would vanish: a gold-700 star in normal blending
    const light = day > 0.5;
    if (m.blending !== (light ? THREE.NormalBlending : THREE.AdditiveBlending)) {
      m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      m.needsUpdate = true;
    }
    m.color.set(light ? '#a98f38' : '#ebd88c');
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glow.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.glow.material.map.dispose();
    this.glow.material.dispose();
  }
}

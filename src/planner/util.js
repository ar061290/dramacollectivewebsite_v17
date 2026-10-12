// Shared helpers: geometry builders, procedural noise, canvas textures, colour maths.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = (p = 'it') => p + '_' + Math.random().toString(36).slice(2, 9);
export const snapTo = (v, s) => (s ? Math.round(v / s) * s : v);
export const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString();

// ---------- geometry ----------
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)));
  if (x || y || z) g.translate(x, y, z);
  return g;
}

export const boxG = (w, h, d, x, y, z, rx, ry, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
export const cylG = (r1, r2, h, seg, x, y, z, rx, ry, rz) =>
  place(new THREE.CylinderGeometry(r1, r2, h, seg), x, y, z, rx, ry, rz);
export const rboxG = (w, h, d, r, x, y, z, rx, ry, rz) =>
  place(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), x, y, z, rx, ry, rz);
export const torusG = (r, t, x, y, z, rx, ry, rz) => place(new THREE.TorusGeometry(r, t, 8, 32), x, y, z, rx, ry, rz);
export const discG = (r, seg, x, y, z, rx, ry, rz) => place(new THREE.CylinderGeometry(r, r, 0.004, seg), x, y, z, rx, ry, rz);

// Cylinder spanning two points.
export function rodG(a, b, r, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Merge many geometries (indexed or not) into one non-indexed geometry.
export function merge(list) {
  const flat = list.map((g) => {
    if (!g.index) return g;
    const n = g.toNonIndexed();
    g.dispose();
    return n;
  });
  for (const g of flat) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
  }
  const out = mergeGeometries(flat, false);
  flat.forEach((g) => g.dispose());
  return out;
}

export function shared(g) {
  g.userData.shared = true;
  return g;
}

export function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}

// Pleated fabric (curtains, stage skirts): a plane with a sine fold along its width.
export function pleatG(width, height, period = 0.3, depth = 0.07) {
  const segs = Math.max(8, Math.ceil(width / period) * 6);
  const g = new THREE.PlaneGeometry(width, height, segs, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / period) * Math.PI * 2) * depth * 0.5);
  g.computeVertexNormals();
  return g;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (!m.userData.own) continue;
      for (const k of ['map', 'emissiveMap']) if (m[k] && m[k].userData.own) m[k].dispose();
      m.dispose();
    }
    if (o.isLight && o.shadow && o.shadow.map) {
      o.shadow.map.dispose();
      o.shadow.map = null;
    }
  });
}

// ---------- noise ----------
function hash(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Tileable value noise with integer period p.
export function vnoise(x, y, p, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % p) + p) % p;
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed);
  const c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, p, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, p * f, seed + i * 17);
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / n;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- canvas textures ----------
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(c, { srgb = true, repeat = [1, 1], aniso = 8, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.userData.own = true;
  return t;
}

// Build a grey-scale canvas from a height function h(x,y) in [0,1].
export function greyCanvas(size, fn) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = clamp(fn(x, y), 0, 1) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Normal map from a height function, wrapping at the edges.
export function normalCanvas(size, heightFn, strength = 2) {
  const hts = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hts[y * size + x] = heightFn(x, y);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => hts[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- colour ----------
export function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

// Pan/tilt (degrees) that point a fixture head at `from` toward `to`. Head faces +z at pan 0.
export function aimAngles(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return {
    pan: Math.round(Math.atan2(dx, dz) / DEG),
    tilt: Math.round(Math.atan2(dy, Math.hypot(dx, dz)) / DEG),
  };
}

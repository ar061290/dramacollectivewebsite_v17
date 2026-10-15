// The morph: the statue's own surface becomes the 3D logo, part for part.
//
// One mesh, two shapes, the same triangles. At the start every triangle is exactly one of the
// statue's triangles, posed as it is at the end of the pose phase (computed from the same skeleton
// the GPU skins with), so swapping the skinned statue for this mesh cannot be seen. At the end every
// triangle is exactly one triangle of the extruded logo.
//
// Each part of the statue becomes the matching part of the logo:
//   mask  the mask in her hand        -> the logo's mask (its frame, eye, nose and lips)
//   hand  her hand and forearm        -> the hand holding it, down its long wrist
//   face  her head and neck           -> the profile face
//   body  torso, robes, arms, plinth  -> the brush strokes, the flames and the crescent
// (the star beside the mask is not made from her: it flies in from the sky, src/scene/star.js)
// The statue's parts come from the rig (which bone moves each vertex); the logo's from
// assets/brand/mark-regions.json. Within each part:
//   1. the logo part is tessellated (longest-edge splits) to the statue part's triangle count (or
//      the statue part is padded with copies of its own triangles, if the logo part is the larger);
//   2. triangles are paired by balanced recursive median splits of their centroids, each set
//      normalised to its own bounds: her nose becomes the profile's nose, the mask's eyes its eye;
//   3. each pair's corners are rotated to the best match, so triangles do not flip on the way.
//
// The logo is far larger than her head, so it does not form at its full size. It forms at her head
// first, scaled and placed so that its mask, hand and face lie on hers (a least-squares fit of the
// three parts' bounds, then a small shift per part for what one fit cannot place), just in front of
// her: each part changes where it is, into its counterpart at about its own size. The mask changes
// first, then the hand (her upper arm goes with it), then the face; the three new parts hold for a
// moment on the marble figure; then, as the robes stream on a wide swirl into the brush strokes,
// flames and crescent, the parts close up into the logo's own layout and the logo grows out to its
// place in the ring. It stays the statue's own stone throughout.
// Everything here runs once, in well under a second for 160k triangles.
//
// At the very end (the stage's vector track) the logo goes flat before its vector stand-in takes
// over (src/scene/flat.js): its relief sinks into the plane of its front face and its light settles
// into the vector's own two colours, sweeping down from the top, so that when the vector appears it
// is already exactly what is on screen and nothing fades over anything.

import * as THREE from 'three';
import { PARTS } from './logo.js';
import { FLAT_HEAD, FLAT_FRAGMENT, flatUniforms } from './flat.js';

export const MORPH = {
  swirl: 1, // radians of turn about the axis at mid-flight, scaled per part and by smooth noise
  lift: 0.06, // rise at mid-flight, statue units (counted in the ring clearance); the mask, hand and
  // face, changing in place at the logo's small size, rise in proportion
  // per part, as shares of the morph: when its first triangles set off (start), how much later its
  // last ones do (spread), how long each takes to arrive (travel), and how much they swirl. A part
  // is complete at start + spread + travel.
  parts: {
    // the mask, the hand and the face each change almost as one piece, in turn, where they are
    // (0-0.18, 0.08-0.26, 0.16-0.38); the three hold on the marble figure; the body flows after
    // them (0.46-1)
    mask: { start: 0.0, spread: 0.04, travel: 0.14, swirl: 0.05 },
    hand: { start: 0.08, spread: 0.04, travel: 0.14, swirl: 0.05 },
    face: { start: 0.16, spread: 0.06, travel: 0.16, swirl: 0.05 },
    body: { start: 0.46, spread: 0.26, travel: 0.28, swirl: 0.8 },
  },
  // her upper arm belongs to the body (the logo's hand is the hand and the wrist), but it leaves
  // with the hand, from the elbow up, so no stump is left at the elbow (0.14-0.42)
  upperArm: { start: 0.14, spread: 0.08, travel: 0.2, swirl: 0.1 },
  // the mask, hand and face, formed on hers, close up into the logo's own layout as the robes set off
  settle: { from: 0.46, to: 0.62 },
  // the logo forms at her head, then grows to its place in the ring
  grow: { from: 0.55, to: 1 },
  maskFrom: 0.893, // on the hand bone, the mask is what lies above the grip (fraction of the statue's height)
};

const smooth = (t) => t * t * (3 - 2 * t);
const window01 = ({ from, to }, t) => smooth(Math.min(1, Math.max(0, (t - from) / (to - from))));

/** How far the logo has grown from its place at her head (0) to its place in the ring (1), at morph `t`. */
export function growAt(t) {
  return window01(MORPH.grow, t);
}

/**
 * Posed positions and normals of a skinned mesh, in the space of `space` (an ancestor), computed
 * on the CPU from the current bone matrices: v' = sum_k w_k (bone_k . boneInverse_k . bindMatrix) v.
 */
export function posedVertices(skinned, space) {
  space.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const { bones, boneInverses } = skinned.skeleton;
  const M = bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld).multiply(boneInverses[k]).multiply(skinned.bindMatrix).elements);
  const g = skinned.geometry;
  const P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const n = P.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const m = new Float32Array(16);
  for (let i = 0; i < n; i++) {
    m.fill(0);
    for (let j = 0; j < 4; j++) {
      const w = SW.getComponent(i, j);
      if (!w) continue;
      const e = M[SI.getComponent(i, j)];
      for (let q = 0; q < 16; q++) m[q] += w * e[q];
    }
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    pos[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    pos[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    pos[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const a = N.getX(i), b = N.getY(i), c = N.getZ(i);
    let nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
  }
  return { pos, nor };
}

/**
 * Which part of the statue each triangle belongs to (indices into PARTS), from the rig: the hand
 * bone carries the hand and, above the grip, the mask; the forearm bones join the hand, as the
 * logo's hand runs down into a long wrist (in the end pose her forearm runs down from the wrist to
 * the elbow); the head and neck bones are the face; everything else, the upper arm included, is
 * the body. `upperArm` marks the upper arm's triangles, which leave early (MORPH.upperArm).
 */
export function statueParts(skinned) {
  const g = skinned.geometry;
  const index = g.index.array;
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const role = skinned.skeleton.bones.map((b) => (/^hand/.test(b.name) ? 'hand' : /^forearm/.test(b.name) ? 'arm' : /^upper_arm/.test(b.name) ? 'upper' : /^(head|neck)$/.test(b.name) ? 'face' : 'body'));
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
  const MASK = PARTS.indexOf('mask'), HAND = PARTS.indexOf('hand'), FACE = PARTS.indexOf('face'), BODY = PARTS.indexOf('body');
  const vpart = new Uint8Array(P.count), vupper = new Uint8Array(P.count);
  for (let i = 0; i < P.count; i++) {
    let j = 0;
    for (let k = 1; k < 4; k++) if (SW.getComponent(i, k) > SW.getComponent(i, j)) j = k;
    const r = role[SI.getComponent(i, j)];
    vpart[i] = r === 'hand' ? ((P.getY(i) - lo) / (hi - lo) >= MORPH.maskFrom ? MASK : HAND)
      : r === 'arm' ? HAND : r === 'face' ? FACE : BODY;
    vupper[i] = r === 'upper' ? 1 : 0;
  }
  const n = index.length / 3;
  const part = new Uint8Array(n), upperArm = new Uint8Array(n);
  for (let t = 0; t < n; t++) {
    const i0 = index[t * 3], i1 = index[t * 3 + 1], i2 = index[t * 3 + 2];
    const a = vpart[i0], b = vpart[i1], c = vpart[i2];
    part[t] = a === b || a === c ? a : b === c ? b : a; // the majority, else the first corner
    upperArm[t] = part[t] === BODY && vupper[i0] + vupper[i1] + vupper[i2] >= 2 ? 1 : 0;
  }
  return { part, upperArm };
}

// ---- 1. tessellate a set of logo triangles to exactly `target` (split the longest edge first) ----
function tessellate(P0, N0, target) {
  let count = P0.length / 9;
  if (count > target) throw new Error(`a logo part has ${count} triangles, more than its ${target}`);
  const P = new Float32Array(target * 9), N = new Float32Array(target * 9);
  P.set(P0); N.set(N0);
  const key = new Float32Array(target); // squared longest edge
  const heap = new Uint32Array(target);
  let size = 0;
  const longest = (t) => {
    const o = t * 9;
    const ab = (P[o] - P[o + 3]) ** 2 + (P[o + 1] - P[o + 4]) ** 2 + (P[o + 2] - P[o + 5]) ** 2;
    const bc = (P[o + 3] - P[o + 6]) ** 2 + (P[o + 4] - P[o + 7]) ** 2 + (P[o + 5] - P[o + 8]) ** 2;
    const ca = (P[o + 6] - P[o]) ** 2 + (P[o + 7] - P[o + 1]) ** 2 + (P[o + 8] - P[o + 2]) ** 2;
    return Math.max(ab, bc, ca);
  };
  const up = (i) => { const t = heap[i]; while (i > 0) { const p = (i - 1) >> 1; if (key[heap[p]] >= key[t]) break; heap[i] = heap[p]; i = p; } heap[i] = t; };
  const down = (i) => { const t = heap[i]; for (;;) { let c = 2 * i + 1; if (c >= size) break; if (c + 1 < size && key[heap[c + 1]] > key[heap[c]]) c++; if (key[heap[c]] <= key[t]) break; heap[i] = heap[c]; i = c; } heap[i] = t; };
  const push = (t) => { key[t] = longest(t); heap[size] = t; up(size++); };
  for (let t = 0; t < count; t++) push(t);
  const v = new Float32Array(9), w = new Float32Array(9);
  while (count < target) {
    const t = heap[0]; heap[0] = heap[--size]; down(0);
    const o = t * 9;
    // rotate the corners so the longest edge is 0-1 (winding kept)
    const ab = (P[o] - P[o + 3]) ** 2 + (P[o + 1] - P[o + 4]) ** 2 + (P[o + 2] - P[o + 5]) ** 2;
    const bc = (P[o + 3] - P[o + 6]) ** 2 + (P[o + 4] - P[o + 7]) ** 2 + (P[o + 5] - P[o + 8]) ** 2;
    const ca = (P[o + 6] - P[o]) ** 2 + (P[o + 7] - P[o + 1]) ** 2 + (P[o + 8] - P[o + 2]) ** 2;
    const r = ab >= bc && ab >= ca ? 0 : bc >= ca ? 1 : 2;
    for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) { v[k * 3 + q] = P[o + ((k + r) % 3) * 3 + q]; w[k * 3 + q] = N[o + ((k + r) % 3) * 3 + q]; }
    const mid = [0, 0, 0], mn = [0, 0, 0];
    for (let q = 0; q < 3; q++) { mid[q] = (v[q] + v[3 + q]) / 2; mn[q] = w[q] + w[3 + q]; }
    const l = Math.hypot(mn[0], mn[1], mn[2]) || 1;
    for (let q = 0; q < 3; q++) mn[q] /= l;
    const u = count++, ou = u * 9;
    for (let q = 0; q < 3; q++) {
      // t: (v0, mid, v2)   u: (mid, v1, v2)
      P[o + q] = v[q]; P[o + 3 + q] = mid[q]; P[o + 6 + q] = v[6 + q];
      N[o + q] = w[q]; N[o + 3 + q] = mn[q]; N[o + 6 + q] = w[6 + q];
      P[ou + q] = mid[q]; P[ou + 3 + q] = v[3 + q]; P[ou + 6 + q] = v[6 + q];
      N[ou + q] = mn[q]; N[ou + 3 + q] = w[3 + q]; N[ou + 6 + q] = w[6 + q];
    }
    push(t); push(u);
  }
  return { P, N };
}

// ---- 2. balanced matching of two equal-size point sets ----
function select(idx, lo, hi, k, keys, axis) {
  // in-place nth_element on idx[lo, hi) by keys[3 * idx + axis]
  const K = (i) => keys[idx[i] * 3 + axis];
  hi--;
  while (hi > lo) {
    const m = (lo + hi) >> 1;
    // median of three as the pivot
    if (K(m) < K(lo)) [idx[m], idx[lo]] = [idx[lo], idx[m]];
    if (K(hi) < K(lo)) [idx[hi], idx[lo]] = [idx[lo], idx[hi]];
    if (K(hi) < K(m)) [idx[hi], idx[m]] = [idx[m], idx[hi]];
    const pivot = K(m);
    let i = lo, j = hi;
    while (i <= j) {
      while (K(i) < pivot) i++;
      while (K(j) > pivot) j--;
      if (i <= j) { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else return;
  }
}

function normalise(c, n) {
  const out = new Float32Array(n * 3);
  for (let a = 0; a < 3; a++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const v = c[i * 3 + a]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const s = 1 / Math.max(1e-9, hi - lo);
    for (let i = 0; i < n; i++) out[i * 3 + a] = (c[i * 3 + a] - lo) * s;
  }
  return out;
}

/** pair[i] = index of the logo triangle that statue triangle i becomes. */
function match(ca, cb, n) {
  const A = normalise(ca, n), B = normalise(cb, n);
  const ia = new Uint32Array(n), ib = new Uint32Array(n);
  for (let i = 0; i < n; i++) { ia[i] = i; ib[i] = i; }
  const pair = new Uint32Array(n);
  const stack = [0, n];
  const DEPTH_WEIGHT = 0.5; // split across the thin depth axis late, so fronts stay fronts
  while (stack.length) {
    const hi = stack.pop(), lo = stack.pop();
    const len = hi - lo;
    if (len === 1) { pair[ia[lo]] = ib[lo]; continue; }
    let axis = 0, best = -1;
    for (let a = 0; a < 3; a++) {
      let mn = Infinity, mx = -Infinity;
      for (let i = lo; i < hi; i++) { const v = A[ia[i] * 3 + a]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const ext = (mx - mn) * (a === 2 ? DEPTH_WEIGHT : 1);
      if (ext > best) { best = ext; axis = a; }
    }
    const mid = lo + (len >> 1);
    select(ia, lo, hi, mid, A, axis);
    select(ib, lo, hi, mid, B, axis);
    stack.push(lo, mid, mid, hi);
  }
  return pair;
}

// ---- 3. where the logo forms: at her head, its mask, hand and face on hers ----
/**
 * Lay the logo's mask, hand and face over the statue's: the uniform scale and shift (no turn) that
 * best carry the bounds of each logo part onto the bounds of the matching statue part, as the viewer
 * sees them (x, y; least squares over each box's centre and corners). One fit cannot place all three
 * (in the logo the hand lies between the mask and the face; on her it lies under the mask), so each
 * part also gets the small shift that puts its centre on hers, for while it forms. The logo stands
 * just in front of her three parts (-z faces the viewer), so her marble chest does not cover it.
 * Shifted or not, it stays inside the logo's own radius about `center`, so the ring clearance holds
 * while it forms and grows.
 * @param {{ p: number, a: THREE.Box3, b: THREE.Box3 }[]} boxes  per part (index into PARTS): the
 *        statue part's bounds (a) and the logo part's (b), turntable space
 * @param {THREE.Vector3} center  the full-size logo's centre (on the turning axis)
 * @param {number} radius         the full-size logo's reach from `center` (its farthest vertex)
 * @returns {{ at: THREE.Vector3, scale: number, shift: THREE.Vector3[] } | null}  where the logo's
 *          centre sits and its scale, and the shift per part (zero for the body)
 */
function fitOverHead(boxes, center, radius) {
  if (!boxes.length) return null;
  const A = [], B = [];
  for (const { a, b } of boxes) {
    for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
      A.push([a.min.x + (a.max.x - a.min.x) * u, a.min.y + (a.max.y - a.min.y) * v]);
      B.push([b.min.x + (b.max.x - b.min.x) * u, b.min.y + (b.max.y - b.min.y) * v]);
    }
  }
  const mean = (S) => [0, 1].map((q) => S.reduce((sum, p) => sum + p[q], 0) / S.length);
  const ma = mean(A), mb = mean(B);
  let num = 0, den = 0;
  for (let i = 0; i < A.length; i++) {
    for (let q = 0; q < 2; q++) {
      num += (A[i][q] - ma[q]) * (B[i][q] - mb[q]);
      den += (B[i][q] - mb[q]) ** 2;
    }
  }
  const scale = Math.min(1, Math.max(0.05, num / Math.max(1e-9, den)));
  // the logo's centre goes where the fit carries it, level with the front of her three parts
  const at = new THREE.Vector3(
    ma[0] + scale * (center.x - mb[0]),
    ma[1] + scale * (center.y - mb[1]),
    Math.min(...boxes.map(({ a }) => a.min.z)),
  );
  // what the fit leaves over: each logo part's centre onto hers (x, y)
  const shift = PARTS.map(() => new THREE.Vector3());
  const ca = new THREE.Vector3(), cb = new THREE.Vector3();
  let most = 0;
  for (const { p, a, b } of boxes) {
    a.getCenter(ca); b.getCenter(cb);
    shift[p].set(ca.x - (at.x + scale * (cb.x - center.x)), ca.y - (at.y + scale * (cb.y - center.y)), 0);
    most = Math.max(most, shift[p].length());
  }
  // every point of the logo lies within `radius` of `center`; keep it so at this scale, place and shift
  const off = at.clone().sub(center);
  const room = Math.max(0, radius * (1 - scale) - most);
  if (off.length() > room) at.copy(center).addScaledVector(off, room / off.length());
  return { at, scale, shift };
}

// ---- 4. smooth noise for the stagger ----
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

// ---- shaders: the same vertex path for the colour, shadow and silhouette passes ----
const VERTEX_HEAD = /* glsl */`
  attribute vec3 aPosB;
  attribute vec3 aNormB;
  attribute vec3 aParams; // x: start delay, y: travel time, z: swirl strength
  attribute float aPart;
  varying float vPart;
  uniform float uMorph;
  uniform vec3 uCenter;
  uniform vec4 uFit; // the logo's centre (xyz) and scale (w): at her head, growing to its place
  uniform vec3 uShift[4]; // per part: from where the fit puts it onto hers, while it forms there
  uniform float uSettle; // 1 while the parts lie on hers, 0 once they have closed up into the logo
  uniform float uSwirl;
  uniform float uLift;
  varying float vMorph;
  uniform float uFlatZ; // the front face's depth (logo space): the relief sinks into it
  ${FLAT_HEAD}
  float morphS() {
    float s = clamp((uMorph - aParams.x) / aParams.y, 0.0, 1.0);
    return s * s * (3.0 - 2.0 * s);
  }
  vec3 swirl(vec3 v, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
  }
`;
const BEGIN_VERTEX = /* glsl */`
  float mS = morphS();
  vMorph = mS;
  vPart = aPart;
  float bump = sin(3.14159265 * mS);
  float turn = uSwirl * bump * aParams.z;
  // flattening at the end: the relief sinks into the front face, from the top down
  vFlatT = flatT(aPosB.y);
  vec3 posB = vec3(aPosB.xy, mix(aPosB.z, uFlatZ, flatK(vFlatT)));
  // the logo as it stands now: a uniform scale and shift, so its normals (aNormB) need no transform
  vec3 target = uFit.xyz + uFit.w * (posB - uCenter) + uSettle * uShift[int(aPart + 0.5)];
  // the mask, hand and face change in place at the logo's small size: they rise in proportion
  float lift = uLift * (aPart < 0.5 ? 1.0 : uFit.w) * bump;
  vec3 transformed = uCenter + swirl(mix(position, target, mS) - uCenter, turn) + vec3(0.0, lift, 0.0);
`;
const BEGIN_NORMAL = /* glsl */`
  float nS = morphS();
  vec3 objectNormal = swirl(normalize(mix(normal, aNormB, nS)), uSwirl * sin(3.14159265 * nS) * aParams.z);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif
`;

const FRAGMENT_HEAD = /* glsl */`
  ${FLAT_HEAD}
  uniform vec3 uStone;
  uniform float uShowParts;
  varying float vMorph;
  varying float vPart;
  vec3 partColor(float p) {
    return p < 0.5 ? vec3(0.45) : p < 1.5 ? vec3(0.95, 0.72, 0.15) : p < 2.5 ? vec3(0.25, 0.8, 0.35) : vec3(0.25, 0.45, 0.95);
  }
`;

function injectVertex(shader, uniforms, { normals }) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', BEGIN_VERTEX);
  if (normals) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', BEGIN_NORMAL);
}

/**
 * Build the morph mesh.
 * @param {object} o
 * @param {THREE.SkinnedMesh} o.skinned     the statue, posed at the end of the pose phase
 * @param {THREE.Object3D} o.space          the turntable: the morph mesh is its child
 * @param {{ geometry: THREE.BufferGeometry, part: Uint8Array }} o.logo  from buildLogoGeometry
 * @param {THREE.Vector3} o.center          the turning axis' centre (for the swirl)
 * @param {THREE.Vector3} o.origin          where the change starts (the mask), turntable space
 */
export function buildMorph({ skinned, space, logo, center, origin }) {
  const t0 = performance.now();
  const g = skinned.geometry;
  const index = g.index.array;
  const { pos, nor } = posedVertices(skinned, space);
  const uv = g.attributes.uv;
  const { part: sPart, upperArm } = statueParts(skinned);
  const LPall = logo.geometry.attributes.position.array, LNall = logo.geometry.attributes.normal.array;

  // triangles of each part, on both sides; a part missing on either side joins the body
  const BODY = PARTS.indexOf('body');
  const sets = PARTS.map(() => ({ a: [], b: [] }));
  for (let t = 0; t < sPart.length; t++) sets[sPart[t]].a.push(t);
  for (let t = 0; t < logo.part.length; t++) sets[logo.part[t]].b.push(t);
  for (let p = 0; p < PARTS.length; p++) {
    if (p === BODY || (sets[p].a.length && sets[p].b.length)) continue;
    sets[BODY].a.push(...sets[p].a); sets[BODY].b.push(...sets[p].b);
    sets[p].a = []; sets[p].b = [];
  }
  // without a hand of its own (no regions), the upper arm goes with the rest of the body
  if (!sets[PARTS.indexOf('hand')].a.length) upperArm.fill(0);

  const report = {};
  const chunks = [];
  const boxes = []; // the mask, hand and face on both sides, for the fit at her head
  let total = 0;
  for (let p = 0; p < PARTS.length; p++) {
    const { a, b } = sets[p];
    if (!a.length) continue;
    const N = Math.max(a.length, b.length);
    // logo side: gather this part's triangles and tessellate them up to N
    const P0 = new Float32Array(b.length * 9), N0 = new Float32Array(b.length * 9);
    b.forEach((t, i) => { P0.set(LPall.subarray(t * 9, t * 9 + 9), i * 9); N0.set(LNall.subarray(t * 9, t * 9 + 9), i * 9); });
    const { P: LP, N: LN } = tessellate(P0, N0, N);
    // statue side: this part's triangles, padded with copies of themselves if the logo part is larger
    const A = new Uint32Array(N);
    for (let i = 0; i < N; i++) A[i] = a[i % a.length];
    const ca = new Float32Array(N * 3), cb = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = A[i];
      for (let q = 0; q < 3; q++) {
        ca[i * 3 + q] = (pos[index[t * 3] * 3 + q] + pos[index[t * 3 + 1] * 3 + q] + pos[index[t * 3 + 2] * 3 + q]) / 3;
        cb[i * 3 + q] = (LP[i * 9 + q] + LP[i * 9 + 3 + q] + LP[i * 9 + 6 + q]) / 3;
      }
    }
    if (p !== BODY) {
      const box = { p, a: new THREE.Box3(), b: new THREE.Box3() };
      const v = new THREE.Vector3();
      for (const t of a) for (let k = 0; k < 3; k++) box.a.expandByPoint(v.fromArray(pos, index[t * 3 + k] * 3));
      for (let i = 0; i < b.length * 3; i++) box.b.expandByPoint(v.fromArray(P0, i * 3));
      boxes.push(box);
    }
    chunks.push({ p, N, A, LP, LN, ca, cb, pair: match(ca, cb, N) });
    report[PARTS[p]] = { statue: a.length, logo: b.length, triangles: N };
    total += N;
  }

  // where the logo forms: fitted to her mask, hand and face (with none of those parts, as when
  // mark-regions.json fails to load, at its own place and size: a whole-figure morph)
  let radius = 0;
  const logoBox = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < LPall.length; i += 3) {
    radius = Math.max(radius, Math.hypot(LPall[i] - center.x, LPall[i + 1] - center.y, LPall[i + 2] - center.z));
    logoBox.expandByPoint(v.fromArray(LPall, i));
  }
  const fit = fitOverHead(boxes, center, radius) ?? { at: center.clone(), scale: 1, shift: PARTS.map(() => new THREE.Vector3()) };
  // what the stage's close-up frames: her mask, hand and face, and the logo's forming on them
  // (without parts, the logo where it forms)
  const closeUp = new THREE.Box3();
  for (const { p, a, b } of boxes) {
    closeUp.union(a);
    for (const end of [b.min, b.max]) closeUp.expandByPoint(v.copy(end).sub(center).multiplyScalar(fit.scale).add(fit.at).add(fit.shift[p]));
  }
  if (closeUp.isEmpty()) closeUp.copy(logoBox).translate(v.copy(fit.at).sub(center));

  // the soup
  const V = total * 3;
  const aPos = new Float32Array(V * 3), aNor = new Float32Array(V * 3), aUv = new Float32Array(V * 2);
  const aPosB = new Float32Array(V * 3), aNormB = new Float32Array(V * 3), aParams = new Float32Array(V * 3);
  const aPart = new Float32Array(V);
  let out = 0;
  for (const { p, N, A, LP, LN, ca, cb, pair } of chunks) {
    // stagger within the part: distance from the mask (the upper arm: height, from the elbow up),
    // plus smooth noise, stretched so that its first triangles set off at `start` and its last at
    // `start + spread` (group 0: the part; group 1: the upper arm, within the body)
    const dist = new Float32Array(N), raw = new Float32Array(N);
    let near = Infinity, far = -Infinity, armLo = Infinity, armHi = -Infinity;
    for (let i = 0; i < N; i++) {
      dist[i] = Math.hypot(ca[i * 3] - origin.x, ca[i * 3 + 1] - origin.y, ca[i * 3 + 2] - origin.z);
      if (upperArm[A[i]]) { armLo = Math.min(armLo, ca[i * 3 + 1]); armHi = Math.max(armHi, ca[i * 3 + 1]); }
      else { near = Math.min(near, dist[i]); far = Math.max(far, dist[i]); }
    }
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (let i = 0; i < N; i++) {
      const g = upperArm[A[i]];
      const order = g ? (ca[i * 3 + 1] - armLo) / Math.max(1e-6, armHi - armLo) : (dist[i] - near) / Math.max(1e-6, far - near);
      raw[i] = 0.75 * order + 0.3 * (valueNoise(ca[i * 3] * 5, ca[i * 3 + 1] * 5, ca[i * 3 + 2] * 5) - 0.5);
      lo[g] = Math.min(lo[g], raw[i]); hi[g] = Math.max(hi[g], raw[i]);
    }
    for (let i = 0; i < N; i++, out++) {
      const t = A[i], bb = pair[i], g = upperArm[t];
      const cfg = g ? MORPH.upperArm : MORPH.parts[PARTS[p]];
      const delay = cfg.start + (cfg.spread * (raw[i] - lo[g])) / Math.max(1e-6, hi[g] - lo[g]);
      const swirl = MORPH.swirl * cfg.swirl * (0.55 + 0.9 * valueNoise(ca[i * 3] * 2.5 + 17.3, ca[i * 3 + 1] * 2.5, ca[i * 3 + 2] * 2.5 - 4.1));
      // corner rotation: line the logo triangle's corners up with the statue triangle's
      let best = 0, bestErr = Infinity;
      for (let r = 0; r < 3; r++) {
        let err = 0;
        for (let k = 0; k < 3; k++) {
          const ia = index[t * 3 + k] * 3, ib = bb * 9 + ((k + r) % 3) * 3;
          for (let q = 0; q < 3; q++) {
            const e = (pos[ia + q] - ca[i * 3 + q]) - (LP[ib + q] - cb[bb * 3 + q]);
            err += e * e;
          }
        }
        if (err < bestErr) { bestErr = err; best = r; }
      }
      for (let k = 0; k < 3; k++) {
        const vtx = out * 3 + k, vi = index[t * 3 + k], ib = bb * 9 + ((k + best) % 3) * 3;
        for (let q = 0; q < 3; q++) {
          aPos[vtx * 3 + q] = pos[vi * 3 + q];
          aNor[vtx * 3 + q] = nor[vi * 3 + q];
          aPosB[vtx * 3 + q] = LP[ib + q];
          aNormB[vtx * 3 + q] = LN[ib + q];
        }
        aUv[vtx * 2] = uv.getX(vi); aUv[vtx * 2 + 1] = uv.getY(vi);
        aParams[vtx * 3] = delay; aParams[vtx * 3 + 1] = cfg.travel; aParams[vtx * 3 + 2] = swirl;
        aPart[vtx] = p;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(aNor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(aUv, 2));
  geo.setAttribute('aPosB', new THREE.BufferAttribute(aPosB, 3));
  geo.setAttribute('aNormB', new THREE.BufferAttribute(aNormB, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(aPart, 1));

  const uniforms = {
    uMorph: { value: 0 },
    uCenter: { value: center.clone() },
    uFit: { value: new THREE.Vector4(fit.at.x, fit.at.y, fit.at.z, fit.scale) },
    uShift: { value: fit.shift },
    uSettle: { value: 1 },
    uSwirl: { value: MORPH.swirl },
    uLift: { value: MORPH.lift },
    uStone: { value: new THREE.Color(0xd8d3ca) }, // set by the stage: the statue's average stone colour
    uShowParts: { value: 0 }, // ?debug: tint each part (mask gold, hand green, face blue, body grey)
    uFlatZ: { value: center.z }, // set by the stage, from the logo's flat outline
    ...flatUniforms(),
  };

  // colour pass: the statue's own material all the way. The logo is carved from the same stone:
  // same roughness, no metal, the stage's own reflections; only the texture evens out to the
  // stone's average colour, since each logo triangle carries a stray patch of the statue's texture
  const material = skinned.material.clone();
  material.onBeforeCompile = (shader) => {
    injectVertex(shader, uniforms, { normals: true });
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uStone, vMorph);\n  if (uShowParts > 0.5) diffuseColor.rgb = partColor(vPart);')
      // the statue's normal map belongs to the statue; the logo's faces are smooth stone
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(mix(normal, nonPerturbedNormal, vMorph));')
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${FLAT_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'dc-morph';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => injectVertex(shader, uniforms, { normals: false });
  depth.customProgramCacheKey = () => 'dc-morph-depth';

  const silhouette = new THREE.MeshBasicMaterial({ color: 0xffffff });
  silhouette.onBeforeCompile = (shader) => injectVertex(shader, uniforms, { normals: false });
  silhouette.customProgramCacheKey = () => 'dc-morph-mask';

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'StatueMorph';
  mesh.customDepthMaterial = depth;
  mesh.userData.maskMaterial = silhouette;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.visible = false;
  space.add(mesh);

  const at = new THREE.Vector3().copy(fit.at);
  const size = closeUp.getSize(new THREE.Vector3());
  const current = { at, scale: fit.scale }; // where the logo stands now (for the star, src/scene/star.js)
  return {
    current,
    mesh,
    uniforms,
    triangles: total,
    parts: report,
    fit: { at: fit.at.toArray().map((x) => +x.toFixed(3)), scale: +fit.scale.toFixed(3), shift: Object.fromEntries(PARTS.map((name, p) => [name, fit.shift[p].toArray().slice(0, 2).map((x) => +x.toFixed(3))])) },
    // for the stage's close-up: what it frames, turntable space
    closeUp: { centre: closeUp.getCenter(new THREE.Vector3()), width: size.x, height: size.y },
    ms: Math.round(performance.now() - t0),
    /** Set the morph to `t` (0..1); returns how far the logo has grown into its place (0..1). */
    update(t) {
      const grow = growAt(t);
      uniforms.uMorph.value = t;
      // the centre moves straight to its place; the scale grows evenly (geometrically)
      at.lerpVectors(fit.at, center, grow);
      current.scale = fit.scale ** (1 - grow);
      uniforms.uFit.value.set(at.x, at.y, at.z, current.scale);
      // the parts close up into the logo's layout before it has grown much (never slower than it
      // grows, which keeps the shifted parts inside the ring clearance)
      uniforms.uSettle.value = Math.min(1 - window01(MORPH.settle, t), 1 - grow);
      return grow;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose(); material.dispose(); depth.dispose(); silhouette.dispose();
    },
  };
}

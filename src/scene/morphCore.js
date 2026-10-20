// The morph's arithmetic (src/scene/morph.js has the account of it): from the statue's posed
// triangles and the logo's to one soup of paired triangles. Nothing here touches the DOM or the
// GPU, and the statue's side needs no three.js, so it runs in a worker (src/scene/morphWorker.js)
// and the page's own thread never stops for it; the logo's extrusion (src/scene/logo.js, three.js)
// runs there too. Should the worker fail to start (no module workers, or the unbundled source
// served with an import map, which workers cannot read), the same functions run on the page's
// thread as they used to.
import { buildLogoGeometry, PARTS } from './logo.js';

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

/**
 * Posed positions and normals of a skinned mesh from its bone matrices (each already
 * space⁻¹ · bone · boneInverse · bindMatrix, 16 floats): v' = Σ w_k M_k v.
 * @param {{ position: Float32Array, normal: Float32Array, skinIndex: Uint16Array, skinWeight: Float32Array }} g
 * @param {Float32Array} M  the bone matrices, 16 per bone
 */
export function posedFromMatrices(g, M) {
  const { position: P, normal: N, skinIndex: SI, skinWeight: SW } = g;
  const n = P.length / 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const m = new Float32Array(16);
  for (let i = 0; i < n; i++) {
    m.fill(0);
    for (let j = 0; j < 4; j++) {
      const w = SW[i * 4 + j];
      if (!w) continue;
      const o = SI[i * 4 + j] * 16;
      for (let q = 0; q < 16; q++) m[q] += w * M[o + q];
    }
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    pos[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    pos[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    pos[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const a = N[i * 3], b = N[i * 3 + 1], c = N[i * 3 + 2];
    let nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
  }
  return { pos, nor };
}

/** A bone's role in the morph, from its name (the rig's: tools/blender/rig.json). */
export const boneRole = (name) => (/^hand/.test(name) ? 'hand' : /^forearm/.test(name) ? 'arm' : /^upper_arm/.test(name) ? 'upper' : /^(head|neck)$/.test(name) ? 'face' : 'body');

/**
 * Which part of the statue each triangle belongs to (indices into PARTS), from the rig: the hand
 * bone carries the hand and, above the grip, the mask; the forearm bones join the hand, as the
 * logo's hand runs down into a long wrist (in the end pose her forearm runs down from the wrist to
 * the elbow); the head and neck bones are the face; everything else, the upper arm included, is
 * the body. `upperArm` marks the upper arm's triangles, which leave early (MORPH.upperArm).
 */
export function statueParts(g, boneNames) {
  const { position: P, skinIndex: SI, skinWeight: SW, index } = g;
  const n = P.length / 3;
  const role = boneNames.map(boneRole);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
  const MASK = PARTS.indexOf('mask'), HAND = PARTS.indexOf('hand'), FACE = PARTS.indexOf('face'), BODY = PARTS.indexOf('body');
  const vpart = new Uint8Array(n), vupper = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let j = 0;
    for (let k = 1; k < 4; k++) if (SW[i * 4 + k] > SW[i * 4 + j]) j = k;
    const r = role[SI[i * 4 + j]];
    vpart[i] = r === 'hand' ? ((P[i * 3 + 1] - lo) / (hi - lo) >= MORPH.maskFrom ? MASK : HAND)
      : r === 'arm' ? HAND : r === 'face' ? FACE : BODY;
    vupper[i] = r === 'upper' ? 1 : 0;
  }
  const t = index.length / 3;
  const part = new Uint8Array(t), upperArm = new Uint8Array(t);
  for (let k = 0; k < t; k++) {
    const i0 = index[k * 3], i1 = index[k * 3 + 1], i2 = index[k * 3 + 2];
    const a = vpart[i0], b = vpart[i1], c = vpart[i2];
    part[k] = a === b || a === c ? a : b === c ? b : a; // the majority, else the first corner
    upperArm[k] = part[k] === BODY && vupper[i0] + vupper[i1] + vupper[i2] >= 2 ? 1 : 0;
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
const box = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const expand = (b, x, y, z) => { if (x < b.min[0]) b.min[0] = x; if (x > b.max[0]) b.max[0] = x; if (y < b.min[1]) b.min[1] = y; if (y > b.max[1]) b.max[1] = y; if (z < b.min[2]) b.min[2] = z; if (z > b.max[2]) b.max[2] = z; };
const centre = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
const union = (a, b) => { for (let q = 0; q < 3; q++) { a.min[q] = Math.min(a.min[q], b.min[q]); a.max[q] = Math.max(a.max[q], b.max[q]); } };
const isEmpty = (b) => b.min[0] > b.max[0];

/**
 * Lay the logo's mask, hand and face over the statue's: the uniform scale and shift (no turn) that
 * best carry the bounds of each logo part onto the bounds of the matching statue part, as the viewer
 * sees them (x, y; least squares over each box's centre and corners). One fit cannot place all three
 * (in the logo the hand lies between the mask and the face; on her it lies under the mask), so each
 * part also gets the small shift that puts its centre on hers, for while it forms. The logo stands
 * just in front of her three parts (-z faces the viewer), so her marble chest does not cover it.
 * Shifted or not, it stays inside the logo's own radius about `center`, so the ring clearance holds
 * while it forms and grows.
 */
function fitOverHead(boxes, center, radius) {
  if (!boxes.length) return null;
  const A = [], B = [];
  for (const { a, b } of boxes) {
    for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
      A.push([a.min[0] + (a.max[0] - a.min[0]) * u, a.min[1] + (a.max[1] - a.min[1]) * v]);
      B.push([b.min[0] + (b.max[0] - b.min[0]) * u, b.min[1] + (b.max[1] - b.min[1]) * v]);
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
  const at = [
    ma[0] + scale * (center[0] - mb[0]),
    ma[1] + scale * (center[1] - mb[1]),
    Math.min(...boxes.map(({ a }) => a.min[2])),
  ];
  // what the fit leaves over: each logo part's centre onto hers (x, y)
  const shift = PARTS.map(() => [0, 0, 0]);
  let most = 0;
  for (const { p, a, b } of boxes) {
    const ca = centre(a), cb = centre(b);
    shift[p] = [ca[0] - (at[0] + scale * (cb[0] - center[0])), ca[1] - (at[1] + scale * (cb[1] - center[1])), 0];
    most = Math.max(most, Math.hypot(shift[p][0], shift[p][1]));
  }
  // every point of the logo lies within `radius` of `center`; keep it so at this scale, place and shift
  const off = [at[0] - center[0], at[1] - center[1], at[2] - center[2]];
  const offLen = Math.hypot(off[0], off[1], off[2]);
  const room = Math.max(0, radius * (1 - scale) - most);
  if (offLen > room) for (let q = 0; q < 3; q++) at[q] = center[q] + off[q] * (room / offLen);
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

/**
 * The soup: every statue triangle paired with its logo triangle, with the timings of its flight.
 * @param {object} o
 * @param {{ position, normal, uv, skinIndex, skinWeight, index }} o.statue  the rig's arrays
 * @param {Float32Array} o.M                 the bone matrices at the end pose (posedFromMatrices)
 * @param {string[]} o.boneNames
 * @param {{ position: Float32Array, normal: Float32Array, part: Uint8Array }} o.logo  non-indexed
 * @param {number[]} o.center  the turning axis' centre (for the swirl)
 * @param {number[]} o.origin  where the change starts (the mask), turntable space
 */
export function computeMorph({ statue, M, boneNames, logo, center, origin }) {
  const index = statue.index;
  const uv = statue.uv;
  const { pos, nor } = posedFromMatrices(statue, M);
  const { part: sPart, upperArm } = statueParts(statue, boneNames);
  const LPall = logo.position, LNall = logo.normal;

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
      const bx = { p, a: box(), b: box() };
      for (const t of a) for (let k = 0; k < 3; k++) { const o = index[t * 3 + k] * 3; expand(bx.a, pos[o], pos[o + 1], pos[o + 2]); }
      for (let i = 0; i < b.length * 3; i++) expand(bx.b, P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]);
      boxes.push(bx);
    }
    chunks.push({ p, N, A, LP, LN, ca, cb, pair: match(ca, cb, N) });
    report[PARTS[p]] = { statue: a.length, logo: b.length, triangles: N };
    total += N;
  }

  // where the logo forms: fitted to her mask, hand and face (with none of those parts, as when
  // mark-regions.json fails to load, at its own place and size: a whole-figure morph)
  let radius = 0;
  const logoBox = box();
  for (let i = 0; i < LPall.length; i += 3) {
    radius = Math.max(radius, Math.hypot(LPall[i] - center[0], LPall[i + 1] - center[1], LPall[i + 2] - center[2]));
    expand(logoBox, LPall[i], LPall[i + 1], LPall[i + 2]);
  }
  const fit = fitOverHead(boxes, center, radius) ?? { at: center.slice(), scale: 1, shift: PARTS.map(() => [0, 0, 0]) };
  // what the stage's close-up frames: her mask, hand and face, and the logo's forming on them
  // (without parts, the logo where it forms)
  const closeUp = box();
  for (const { p, a, b } of boxes) {
    union(closeUp, a);
    for (const end of [b.min, b.max]) {
      expand(closeUp, (end[0] - center[0]) * fit.scale + fit.at[0] + fit.shift[p][0], (end[1] - center[1]) * fit.scale + fit.at[1] + fit.shift[p][1], (end[2] - center[2]) * fit.scale + fit.at[2] + fit.shift[p][2]);
    }
  }
  if (isEmpty(closeUp)) for (let q = 0; q < 3; q++) { closeUp.min[q] = logoBox.min[q] + fit.at[q] - center[q]; closeUp.max[q] = logoBox.max[q] + fit.at[q] - center[q]; }

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
      dist[i] = Math.hypot(ca[i * 3] - origin[0], ca[i * 3 + 1] - origin[1], ca[i * 3 + 2] - origin[2]);
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
        aUv[vtx * 2] = uv[vi * 2]; aUv[vtx * 2 + 1] = uv[vi * 2 + 1];
        aParams[vtx * 3] = delay; aParams[vtx * 3 + 1] = cfg.travel; aParams[vtx * 3 + 2] = swirl;
        aPart[vtx] = p;
      }
    }
  }
  return { aPos, aNor, aUv, aPosB, aNormB, aParams, aPart, total, report, fit, closeUp };
}

/**
 * Everything the morph needs computed, from plain data: the logo's extrusion (three.js, in whatever
 * thread this runs) and the soup. Returns plain arrays, ready to be transferred.
 * @param {object} job
 * @param {object[]} job.shapes                     the mark's shapes (logo.js logoShapes: parsed on the page)
 * @param {object|null} job.regions                 assets/brand/mark-regions.json, parsed
 * @param {number[]} job.center                     the statue's centre (turntable space)
 * @param {number} job.radius                       the logo's reach from it
 * @param {number} job.maxTriangles                 the logo's triangle budget
 * @param {object} job.statue                       the rig's arrays (see computeMorph)
 * @param {Float32Array} job.M
 * @param {string[]} job.boneNames
 * @param {number[]} job.origin
 */
export function buildAll(job) {
  const t0 = performance.now();
  const center = job.center;
  const logo = buildLogoGeometry(job.shapes, {
    center: { x: center[0], y: center[1], z: center[2] },
    radius: job.radius,
    regions: job.regions,
    maxTriangles: job.maxTriangles,
  });
  logo.geometry.computeBoundingBox();
  const bb = logo.geometry.boundingBox;
  const logoMs = Math.round(performance.now() - t0);
  const soup = computeMorph({
    statue: job.statue, M: job.M, boneNames: job.boneNames, center, origin: job.origin,
    logo: { position: logo.geometry.attributes.position.array, normal: logo.geometry.attributes.normal.array, part: logo.part },
  });
  const star = logo.star ? { position: logo.star.attributes.position.array, normal: logo.star.attributes.normal.array } : null;
  const flat = { svgToLocal: Array.from(logo.flat.svgToLocal.elements), z: logo.flat.z, outline: logo.flat.outline };
  logo.geometry.dispose();
  logo.star?.dispose();
  return { ...soup, logoWidth: bb.max.x - bb.min.x, star, flat, logoMs, ms: Math.round(performance.now() - t0) };
}

/** The transferable buffers of a buildAll result (so a worker hands them over without copying). */
export function transferables(r) {
  const list = [r.aPos, r.aNor, r.aUv, r.aPosB, r.aNormB, r.aParams, r.aPart].map((a) => a.buffer);
  if (r.star) list.push(r.star.position.buffer, r.star.normal.buffer);
  return [...new Set(list)];
}

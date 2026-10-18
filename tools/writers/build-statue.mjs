// Prepare the writer statue for Meet our writers: assets/models/writer-statue.glb and writer-statue.json
//
//   node tools/writers/build-statue.mjs <writer-statue.glb> [tris=250000] [error=0.00025] [mr=1024]
//        [out=assets/models/writer-statue.glb] [manifest=assets/models/writer-statue.json] [measure=0] [debug=<dir>]
//
// (glTF-Transform 4, meshoptimizer, draco3dgltf and sharp must be installed where it runs:
//  npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer draco3dgltf sharp
//  Node resolves those from the script's own folder, so copy the script next to that node_modules and give it
//  absolute paths. The default outputs are found from the source's folder, tools/writers/source/, so they
//  land in the repo wherever the script runs. measure=1 writes the manifest only.)
//
// The source is a Meshy model (tools/writers/source/writer-statue.glb, not committed): a robed figure in
// the pose of the Statue of Liberty, the comedy and tragedy masks for a face, a fountain pen raised like a
// torch and the publication held at her side, on a stepped round plinth. It is one mesh of about 909k
// triangles, gltfpack-quantized, with base colour, metallic-roughness and normal maps (WebP). This
//   1. unpacks it (dequantize; the node's transform and the textures' uv transform baked in) and stands it
//      in the site's statue space, as thinker.glb: its base on y = 0, 2 high, centred on its plinth (the
//      middle of its bounds in x and z), the front facing +z,
//   2. measures, on the full mesh, what the page needs (writer-statue.json): the book's front cover (its
//      corners, its spine, its normal and the book's thickness), boxes around the book and the nib for the
//      stone's masks, the masks' centre, and the bounds,
//   3. welds and simplifies it (meshoptimizer) to about `tris` triangles: the book, the pen and the masks,
//      with the hands at the book and the pen, only as far as `error` (in statue units) from the source;
//      the rest takes what is left. Each part is simplified on its own, the vertices it shares with
//      another part locked, so the parts still meet,
//   4. keeps the base colour and the normal map as they come (2048 px WebP: the book's lettering stays
//      legible up close) and brings the metallic-roughness map down to `mr` px, WebP,
//   5. Draco-compresses the geometry (the site's decoder: public/draco/).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, prune, dedup, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [src, ...rest] = process.argv.slice(2);
if (!src) throw new Error('usage: build-statue.mjs <writer-statue.glb> [options]');
const opts = Object.fromEntries(rest.map((a) => a.split('=')));
const REPO = resolve(dirname(src), '../../..');
const TRIS = Number(opts.tris ?? 250000);
const ERROR = Number(opts.error ?? 0.00025);
const MR = Number(opts.mr ?? 1024);
const OUT = opts.out ?? join(REPO, 'assets/models/writer-statue.glb');
const MANIFEST = opts.manifest ?? join(REPO, 'assets/models/writer-statue.json');
const MEASURE_ONLY = opts.measure === '1';
const DEBUG = opts.debug; // a folder for a picture of the cover's outline, to check it
const HEIGHT = 2; // the site's statue height

// Where the detail is, in statue space (boxes [min, max], found from renders of the source): kept within
// ERROR of the source. A triangle belongs to the first box that holds its middle.
const DETAIL = {
  book: [[0.22, 0.93, -0.16], [0.53, 1.38, 0.2]], // the book and the hand holding it
  pen: [[-0.31, 1.4, 0.08], [-0.1, 2.01, 0.46]], // the pen, its nib and the hand raising it
  masks: [[-0.14, 1.4, -0.12], [0.25, 1.75, 0.32]], // the comedy and tragedy masks
};

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(src);
await doc.transform(dequantize());

const root = doc.getRoot();
const scene = root.listScenes()[0];
const srcNode = root.listNodes().find((n) => n.getMesh());
const prim = srcNode.getMesh().listPrimitives()[0];
const material = prim.getMaterial();
const M = srcNode.getWorldMatrix();

// the uv transform the packer put on the textures (the same on each): baked into the uvs
let uvScale = [1, 1], uvOffset = [0, 0];
for (const info of [material.getBaseColorTextureInfo(), material.getNormalTextureInfo(), material.getMetallicRoughnessTextureInfo()]) {
  const t = info?.getExtension('KHR_texture_transform');
  if (t) { uvScale = t.getScale(); uvOffset = t.getOffset(); info.setExtension('KHR_texture_transform', null); }
}

// ---------------------------------------------------------------- 1. statue space
{
  const P = prim.getAttribute('POSITION').getArray();
  const N = prim.getAttribute('NORMAL').getArray();
  const T = prim.getAttribute('TEXCOORD_0').getArray();
  const nv = P.length / 3;
  const W = new Float32Array(P.length), WN = new Float32Array(N.length), UV = new Float32Array(T.length);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) {
    const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
    const w = [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
    for (let k = 0; k < 3; k++) { W[3 * v + k] = w[k]; lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
    // the normals turn with the node (its scale is uniform)
    const a = N[3 * v], b = N[3 * v + 1], c = N[3 * v + 2];
    const nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    WN[3 * v] = nx / l; WN[3 * v + 1] = ny / l; WN[3 * v + 2] = nz / l;
    UV[2 * v] = T[2 * v] * uvScale[0] + uvOffset[0];
    UV[2 * v + 1] = T[2 * v + 1] * uvScale[1] + uvOffset[1];
  }
  const s = HEIGHT / (hi[1] - lo[1]);
  const c = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) W[3 * v + k] = (W[3 * v + k] - c[k]) * s;
  console.log(`source: ${nv} vertices, ${prim.getIndices().getCount() / 3} triangles, ${(hi[1] - lo[1]).toFixed(4)} high; scaled by ${s.toFixed(5)}`);
  const buffer = root.listBuffers()[0];
  prim
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(W).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(WN).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(UV).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(prim.getIndices().getArray())).setBuffer(buffer));
  const mesh = srcNode.getMesh().setName('writer-statue');
  for (const n of root.listNodes()) n.dispose();
  scene.addChild(doc.createNode('writer-statue').setMesh(mesh));
}
await doc.transform(prune(), weld());

const P = prim.getAttribute('POSITION').getArray();
const N = prim.getAttribute('NORMAL').getArray();
const UV = prim.getAttribute('TEXCOORD_0').getArray();
const I = Uint32Array.from(prim.getIndices().getArray());
const nv = P.length / 3, nt = I.length / 3;
console.log(`welded: ${nv} vertices, ${nt} triangles`);
// the vertices that share a place (a seam in the uvs or the normals splits a vertex), as one
const remap = MeshoptSimplifier.generatePositionRemap(P, 3);

// ---------------------------------------------------------------- 2. measuring
const round = (v, d = 5) => (Array.isArray(v) ? v.map((x) => round(x, d)) : Number(v.toFixed(d)));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const vert = (v) => [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
const inBox = (p, [lo, hi], m = 0) => p[0] >= lo[0] - m && p[0] <= hi[0] + m && p[1] >= lo[1] - m && p[1] <= hi[1] + m && p[2] >= lo[2] - m && p[2] <= hi[2] + m;

// each triangle's middle, unit normal (from its corners) and area
const TC = new Float32Array(nt * 3), TN = new Float32Array(nt * 3), TA = new Float32Array(nt);
for (let t = 0; t < nt; t++) {
  const a = vert(I[3 * t]), b = vert(I[3 * t + 1]), c = vert(I[3 * t + 2]);
  const n = cross(sub(b, a), sub(c, a));
  const l = Math.hypot(n[0], n[1], n[2]);
  TA[t] = l / 2;
  for (let k = 0; k < 3; k++) { TC[3 * t + k] = (a[k] + b[k] + c[k]) / 3; TN[3 * t + k] = l ? n[k] / l : 0; }
}
const tc = (t) => [TC[3 * t], TC[3 * t + 1], TC[3 * t + 2]];
const tn = (t) => [TN[3 * t], TN[3 * t + 1], TN[3 * t + 2]];

// The smallest-area rectangle around points in a plane (their convex hull, tried along each of its
// edges): { c: [u, v], axis: [u, v] (unit, its first side), size: [along axis, across] }.
function minRect(pts) {
  pts = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length > 1 && turn(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length > 1 && turn(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!l) continue;
    const ax = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], ay = [-ax[1], ax[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hull) {
      const u = p[0] * ax[0] + p[1] * ax[1], v = p[0] * ay[0] + p[1] * ay[1];
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      best = { area, axis: ax, size: [u1 - u0, v1 - v0], c: [cu * ax[0] + cv * ay[0], cu * ax[1] + cv * ay[1]] };
    }
  }
  return best;
}

// The plane through points (area-weighted): their middle and the direction they spread least in
// (the covariance's smallest eigenvector, by inverse iteration from a first guess).
function fitPlane(points, weights, guess) {
  let W = 0; const c = [0, 0, 0];
  points.forEach((p, i) => { W += weights[i]; for (let k = 0; k < 3; k++) c[k] += p[k] * weights[i]; });
  for (let k = 0; k < 3; k++) c[k] /= W;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach((p, i) => { const d = sub(p, c); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r][k] += d[r] * d[k] * weights[i] / W; });
  // inverse iteration: solve C x = n repeatedly (Cramer's rule; C is small and well conditioned)
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(C);
  let n = norm(guess);
  for (let it = 0; it < 30; it++) {
    const x = [0, 1, 2].map((k) => det3(C.map((row, r) => row.map((v, j) => (j === k ? n[r] : v)))) / D);
    n = norm(x);
  }
  if (dot(n, guess) < 0) n = mul(n, -1);
  return { c, n };
}

// The book's front cover: the front-most broad flat surface in the book's box.
async function measureBook() {
  const box = DETAIL.book;
  const cand = [];
  for (let t = 0; t < nt; t++) if (TN[3 * t + 2] > 0.5 && inBox(tc(t), box)) cand.push(t);
  // its normal: the area-weighted mean of the candidates' normals, narrowed to those near it
  let n = [0, 0, 1];
  for (const cos of [0.7, 0.85, 0.93, 0.97, 0.97]) {
    const m = [0, 0, 0];
    for (const t of cand) if (dot(tn(t), n) > cos) for (let k = 0; k < 3; k++) m[k] += TN[3 * t + k] * TA[t];
    n = norm(m);
  }
  // its depth along the normal: the largest peak of an area histogram (the cover is flat; the robe
  // behind it and the fingers in front of it are curved and spread over many depths)
  const BIN = 0.002, hist = new Map();
  for (const t of cand) if (dot(tn(t), n) > 0.97) { const b = Math.round(dot(tc(t), n) / BIN); hist.set(b, (hist.get(b) ?? 0) + TA[t]); }
  const peaks = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  let d0 = peaks[0][0] * BIN;
  console.log('book: depth peaks', peaks.slice(0, 6).map(([b, a]) => `${(b * BIN).toFixed(3)}:${(a * 1e4).toFixed(2)}`).join(' '));
  // the plane through the cover's flat triangles, fitted twice
  let plane = { c: null, n };
  let flat = [];
  for (const band of [0.006, 0.003]) {
    flat = cand.filter((t) => dot(tn(t), plane.n) > 0.95 && Math.abs(dot(tc(t), plane.n) - d0) < band);
    plane = fitPlane(flat.map(tc), flat.map((t) => TA[t]), plane.n);
    d0 = dot(plane.c, plane.n);
  }
  n = plane.n;
  // Only the flat triangles joined to the largest piece of them: the cover's raised frame and its field
  // (the lettering stands above the plane and leaves holes; a fingertip on the plane is cut off).
  const flatSet = new Set(flat);
  const owner = new Map(); // canonical vertex -> a flat triangle on it
  const parent = new Map(flat.map((t) => [t, t]));
  const find = (t) => { while (parent.get(t) !== t) { parent.set(t, parent.get(parent.get(t))); t = parent.get(t); } return t; };
  for (const t of flat) for (let j = 0; j < 3; j++) {
    const v = remap[I[3 * t + j]];
    if (owner.has(v)) parent.set(find(t), find(owner.get(v))); else owner.set(v, t);
  }
  const area = new Map();
  for (const t of flat) area.set(find(t), (area.get(find(t)) ?? 0) + TA[t]);
  const main = [...area.entries()].sort((a, b) => b[1] - a[1])[0][0];
  flat = flat.filter((t) => flatSet.has(t) && find(t) === main);
  // The cover's outline, as seen straight on (along its normal): the book's front-facing surface near
  // the plane, drawn into a depth buffer so that whatever lies in front of it (the fingers) hides it.
  // The cover's border slopes back a little on the spine's side, so the band reaches behind the plane.
  const e1 = norm(cross([0, 1, 0], n)), e2 = cross(n, e1); // in-plane axes (e1 about +x, e2 about +y)
  const RES = 0.0004, PAD = 0.04;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const t of flat) for (let j = 0; j < 3; j++) {
    const p = sub(vert(I[3 * t + j]), plane.c), u = dot(p, e1), v = dot(p, e2);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  u0 -= PAD; v0 -= PAD;
  const GW = Math.ceil((u1 + PAD - u0) / RES), GH = Math.ceil((v1 + PAD - v0) / RES);
  const depth = new Float32Array(GW * GH).fill(-Infinity), facing = new Float32Array(GW * GH);
  for (let t = 0; t < nt; t++) {
    const q = [0, 1, 2].map((j) => { const p = sub(vert(I[3 * t + j]), plane.c); return [(dot(p, e1) - u0) / RES, (dot(p, e2) - v0) / RES, dot(p, n)]; });
    const xa = Math.max(0, Math.ceil(Math.min(q[0][0], q[1][0], q[2][0]) - 0.5)), xb = Math.min(GW - 1, Math.floor(Math.max(q[0][0], q[1][0], q[2][0]) - 0.5));
    const ya = Math.max(0, Math.ceil(Math.min(q[0][1], q[1][1], q[2][1]) - 0.5)), yb = Math.min(GH - 1, Math.floor(Math.max(q[0][1], q[1][1], q[2][1]) - 0.5));
    if (xa > xb || ya > yb || Math.max(q[0][2], q[1][2], q[2][2]) < -0.1) continue;
    const den = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
    if (Math.abs(den) < 1e-12) continue;
    const f = dot(tn(t), n);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((q[1][1] - q[2][1]) * (px - q[2][0]) + (q[2][0] - q[1][0]) * (py - q[2][1])) / den;
      const b = ((q[2][1] - q[0][1]) * (px - q[2][0]) + (q[0][0] - q[2][0]) * (py - q[2][1])) / den;
      const c = 1 - a - b;
      if (a < 0 || b < 0 || c < 0) continue;
      const d = a * q[0][2] + b * q[1][2] + c * q[2][2], i = y * GW + x;
      if (d > depth[i]) { depth[i] = d; facing[i] = f; }
    }
  }
  // the cover: the front-most surface within the band and facing out, joined to the middle
  const inBand = (i) => depth[i] > -0.015 && depth[i] < 0.008 && facing[i] > 0.2;
  const cover = new Uint8Array(GW * GH);
  {
    const mid = (() => { const x = Math.round((-u0) / RES), y = Math.round((-v0) / RES); return y * GW + x; })();
    let start = mid;
    for (let rr = 0; !inBand(start) && rr < 200; rr++) start = mid + rr; // the middle may fall on a letter's edge
    const stack = [start]; cover[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % GW, y = (i / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * GW + X;
        if (X < 0 || Y < 0 || X >= GW || Y >= GH || cover[j] || !inBand(j)) continue;
        cover[j] = 1; stack.push(j);
      }
    }
  }
  // its outline: the cover's pixels with a neighbour outside it, as points in the plane (with their depth)
  const pts = [];
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x;
    if (cover[i] && !(cover[i - 1] && cover[i + 1] && cover[i - GW] && cover[i + GW])) pts.push([u0 + (x + 0.5) * RES, v0 + (y + 0.5) * RES, depth[i]]);
  }
  // Its four edges, one by one (the modelled book is not quite a rectangle). The first guess is the
  // smallest rectangle around the outline. Along each edge of the guess, the outline's outermost point
  // in each of a row of short stretches marks the edge (where the fingers stand out from the cover, or
  // the robe hides it, the marks stray); a robust line through those is the edge, and the corners are
  // where the lines meet. Twice, the second time from the first's quad.
  const r = minRect(pts);
  // the rectangle's sides: `ra` its right, `ua` its up (the side nearest the world's up, e2)
  let ra = r.axis, ua = [-r.axis[1], r.axis[0]], [w, h] = r.size;
  if (Math.abs(ra[1]) > Math.abs(ua[1])) { [ra, ua] = [ua, [-ua[1], ua[0]]]; [w, h] = [h, w]; }
  if (ua[1] < 0) ua = [-ua[0], -ua[1]];
  ra = [ua[1], -ua[0]]; // so that (ra, ua) turn as (x, y) do, seen from the front
  // corners in order: top-left, top-right, bottom-right, bottom-left (clockwise, seen from the front)
  let quad = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => [
    r.c[0] + (ra[0] * sx * w) / 2 + (ua[0] * sy * h) / 2,
    r.c[1] + (ra[1] * sx * w) / 2 + (ua[1] * sy * h) / 2,
  ]);
  const BINS = 30;
  const edgeLine = (a, b, reach) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], out = [-d[1], d[0]]; // out: away from the cover
    const top = new Array(BINS).fill(-Infinity), deep = new Array(BINS).fill(0);
    for (const p of pts) {
      const q = [p[0] - a[0], p[1] - a[1]], s = (q[0] * d[0] + q[1] * d[1]) / l, o = q[0] * out[0] + q[1] * out[1];
      if (s < 0.06 || s > 0.94 || o < -reach) continue;
      const k = Math.min(BINS - 1, Math.floor(((s - 0.06) / 0.88) * BINS));
      if (o > top[k]) { top[k] = o; deep[k] = p[2]; }
    }
    const marks = top.map((o, k) => [(0.06 + ((k + 0.5) / BINS) * 0.88) * l, o, deep[k]]).filter(([, o]) => o > -Infinity);
    // o = c0 + c1 s: the line through two of the marks that the most of the others lie close to (the
    // least median of the misses), then by least squares through the marks within 1.2 mm of it
    const miss = (c, [s, o]) => Math.abs(o - c[0] - c[1] * s);
    let c = null, best = Infinity;
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
      const [s1, o1] = marks[i], [s2, o2] = marks[j];
      if (s2 - s1 < 0.2 * l) continue;
      const cc = [o1 - ((o2 - o1) / (s2 - s1)) * s1, (o2 - o1) / (s2 - s1)];
      const m = marks.map((k) => miss(cc, k)).sort((x, y) => x - y)[marks.length >> 1];
      if (m < best) { best = m; c = cc; }
    }
    const kept = marks.filter((k) => miss(c, k) <= 0.0012);
    const n = kept.length, sx = kept.reduce((t, k) => t + k[0], 0), sy = kept.reduce((t, k) => t + k[1], 0);
    const sxx = kept.reduce((t, k) => t + k[0] * k[0], 0), sxy = kept.reduce((t, k) => t + k[0] * k[1], 0);
    if (n >= 3) { const c1 = (n * sxy - sx * sy) / (n * sxx - sx * sx); c = [(sy - c1 * sx) / n, c1]; }
    const p = [a[0] + out[0] * c[0], a[1] + out[1] * c[0]];
    const dir = [d[0] + out[0] * c[1], d[1] + out[1] * c[1]];
    // the edge's depth along it, by least squares (the spine's side of the cover slopes back)
    const sd = kept.reduce((t, k) => t + k[2], 0), ssd = kept.reduce((t, k) => t + k[0] * k[2], 0);
    const g1 = n >= 3 ? (n * ssd - sx * sd) / (n * sxx - sx * sx) : 0, g0 = n ? (sd - g1 * sx) / n : 0;
    const depthAt = (q) => g0 + g1 * ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]);
    return { p, d: dir, n, out, depthAt };
  };
  const meet = (A, B) => {
    const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
    return [A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t];
  };
  let lines;
  for (const reach of [0.05, 0.015]) {
    lines = quad.map((a, i) => edgeLine(a, quad[(i + 1) % 4], reach));
    // corner i is where edge i-1 (coming in) meets edge i (going out)
    quad = [0, 1, 2, 3].map((i) => meet(lines[(i + 3) % 4], lines[i]));
  }
  // The book is a little out of true: where the outline's own corner lies clearly inside the meeting of
  // the lines (more than 3 mm in, along the corner's bisector; but within 16 mm, so not where the robe
  // or the fingers hide the corner), the corner is the outline's.
  const snapped = quad.map((q, i) => {
    const g = norm([lines[(i + 3) % 4].out[0] + lines[i].out[0], lines[(i + 3) % 4].out[1] + lines[i].out[1], 0]);
    let bestP = null, bestS = -Infinity;
    for (const p of pts) {
      const dx = p[0] - q[0], dy = p[1] - q[1];
      if (dx * dx + dy * dy > 0.016 ** 2) continue;
      const s = dx * g[0] + dy * g[1];
      if (s > bestS) { bestS = s; bestP = p; }
    }
    if (bestP && bestS < -0.003) { quad[i] = bestP; return true; }
    quad[i] = [q[0], q[1], (lines[(i + 3) % 4].depthAt(q) + lines[i].depthAt(q)) / 2];
    return false;
  });
  console.log(`book: corners snapped to the outline: ${snapped.map((s) => (s ? 'yes' : 'no')).join(', ')}`);
  if (DEBUG) {
    // the depth buffer (grey: in front of the band or behind it; the cover pale) and the quad
    const img = Buffer.alloc(GW * GH * 3);
    for (let i = 0; i < GW * GH; i++) {
      const y = GH - 1 - ((i / GW) | 0), o = 3 * (y * GW + (i % GW));
      if (cover[i]) { img[o] = 230; img[o + 1] = 200; img[o + 2] = 150; } else if (depth[i] > -Infinity) img[o] = img[o + 1] = img[o + 2] = 70;
    }
    const X = (u) => ((u - u0) / RES).toFixed(1), Y = (v) => (GH - (v - v0) / RES).toFixed(1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}"><polygon points="${quad.map((q) => `${X(q[0])},${Y(q[1])}`).join(' ')}" fill="none" stroke="cyan" stroke-width="2"/></svg>`;
    await sharp(img, { raw: { width: GW, height: GH, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toFile(join(DEBUG, 'cover-outline.jpg'));
  }
  // each corner at its depth: the outline's own where it was taken from the outline, else the two edges'
  const to3 = (q) => add(plane.c, add(mul(e1, q[0]), add(mul(e2, q[1]), mul(n, q[2]))));
  const corners = quad.map(to3);
  const centre = mul(corners.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / 4);
  // its up, from the foot's middle to the head's; its right, from the spine to the fore-edge
  const up = norm(sub(add(corners[0], corners[1]), add(corners[3], corners[2])));
  const right = norm(cross(up, n));
  const dist = (a, b) => Math.hypot(...sub(a, b));
  w = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2;
  h = (dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2;
  console.log(`book: edges from ${lines.map((l) => l.n).join(', ')} points; corner angles ${quad.map((q, i) => {
    const a = quad[(i + 3) % 4], b = quad[(i + 1) % 4];
    const u = [a[0] - q[0], a[1] - q[1]], v = [b[0] - q[0], b[1] - q[1]];
    return ((Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180) / Math.PI).toFixed(1);
  }).join(', ')}`);
  // the book's thickness: how far behind the cover its top face reaches
  const back = [];
  for (let t = 0; t < nt; t++) {
    if (dot(tn(t), up) < 0.8) continue;
    const p = sub(tc(t), centre);
    const u = dot(p, right), v = dot(p, up), d = dot(p, n);
    if (Math.abs(u) < w / 2 - 0.01 && Math.abs(v - h / 2) < 0.015 && d < 0.005 && d > -0.15) back.push(d);
  }
  back.sort((a, b) => a - b);
  const thickness = back.length ? -back[Math.floor(back.length * 0.02)] : 0;
  // the flat triangles' spread about the plane, as a check
  let spread = 0;
  for (const t of flat) spread = Math.max(spread, Math.abs(dot(tc(t), n) - d0));
  console.log(`book: ${flat.length} flat triangles on the cover (within ${spread.toFixed(4)} of its plane), ${w.toFixed(4)} x ${h.toFixed(4)}, ${back.length} on its top face, ${thickness.toFixed(4)} thick`);
  return { centre, n, up, right, w, h, corners, thickness };
}

// The nib: the pale, unsaturated (silver) part of the base colour at the pen's top, measured along the
// pen's axis.
async function measureNib() {
  const tex = material.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colour = (v) => {
    const x = Math.min(info.width - 1, Math.max(0, Math.round(UV[2 * v] * info.width - 0.5)));
    const y = Math.min(info.height - 1, Math.max(0, Math.round(UV[2 * v + 1] * info.height - 0.5)));
    const i = 4 * (y * info.width + x);
    return [data[i], data[i + 1], data[i + 2]];
  };
  // the pen above the hand
  const box = [[-0.3, 1.78, 0.1], [-0.1, 2.01, 0.45]];
  const pen = [];
  for (let v = 0; v < nv; v++) if (inBox(vert(v), box)) pen.push(v);
  // its axis: the direction it spreads most (power iteration on the covariance)
  const c = [0, 0, 0];
  for (const v of pen) for (let k = 0; k < 3; k++) c[k] += P[3 * v + k] / pen.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const v of pen) { const d = sub(vert(v), c); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r][k] += d[r] * d[k]; }
  let axis = [0, 1, 0];
  for (let it = 0; it < 50; it++) axis = norm([0, 1, 2].map((r) => dot(C[r], axis)));
  if (axis[1] < 0) axis = mul(axis, -1);
  // silver: low in saturation (or near black, the engraving), along the axis in slices (the bronze is
  // about 0.45 in saturation, the silver 0.25 to 0.33)
  const silver = (v) => { const [r, g, b] = colour(v); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 40 || (mx - mn) / mx < 0.38; };
  const SLICE = 0.004, slices = new Map();
  let top = -Infinity;
  for (const v of pen) {
    const a = dot(sub(vert(v), c), axis);
    top = Math.max(top, a);
    const k = Math.floor(a / SLICE), s = slices.get(k) ?? [0, 0];
    s[0]++; if (silver(v)) s[1]++;
    slices.set(k, s);
  }
  // the nib: the slices down from the tip that are mostly silver (one slice that is not, an engraved
  // line, does not end it)
  const silvery = (j) => slices.has(j) && slices.get(j)[1] / slices.get(j)[0] > 0.5;
  let k = Math.floor(top / SLICE);
  while (silvery(k - 1) || silvery(k - 2)) k -= silvery(k - 1) ? 1 : 2;
  const base = k * SLICE;
  const nib = pen.filter((v) => dot(sub(vert(v), c), axis) >= base && silver(v)); // (not the bronze collar it stands in)
  // its oriented box: the axis, and the two directions across it
  const e1 = norm(cross(axis, [0, 0, 1])), e2 = cross(e1, axis);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const blo = [Infinity, Infinity, Infinity], bhi = [-Infinity, -Infinity, -Infinity];
  let tip = null, tipA = -Infinity;
  for (const v of nib) {
    const p = vert(v), d = sub(p, c);
    const q = [dot(d, e1), dot(d, axis), dot(d, e2)];
    for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], q[j]); hi[j] = Math.max(hi[j], q[j]); blo[j] = Math.min(blo[j], p[j]); bhi[j] = Math.max(bhi[j], p[j]); }
    if (q[1] > tipA) { tipA = q[1]; tip = p; }
  }
  const mid = lo.map((l, j) => (l + hi[j]) / 2);
  const centre = add(c, add(mul(e1, mid[0]), add(mul(axis, mid[1]), mul(e2, mid[2]))));
  console.log(`nib: ${nib.length} of ${pen.length} pen vertices, ${(hi[1] - lo[1]).toFixed(4)} long, axis ${round(axis, 3)}`);
  return { centre, axes: [e1, axis, e2], half: hi.map((h, j) => (h - lo[j]) / 2), box: [blo, bhi], tip };
}

// The masks' centre: the middle of their front-most surface as seen from the front (+z), the faces the
// words would come from.
function measureMasks() {
  const box = [[-0.11, 1.44, -0.12], [0.22, 1.72, 0.32]];
  const CELL = 0.004, front = new Map();
  for (let v = 0; v < nv; v++) {
    const p = vert(v);
    if (!inBox(p, box)) continue;
    const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
    const f = front.get(key);
    if (!f || p[2] > f[2]) front.set(key, p);
  }
  const c = [0, 0, 0];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of front.values()) for (let k = 0; k < 3; k++) { c[k] += p[k] / front.size; lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { centre: c, box: [lo, hi] };
}

const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) { bounds[0][k] = Math.min(bounds[0][k], P[3 * v + k]); bounds[1][k] = Math.max(bounds[1][k], P[3 * v + k]); }
let plinth = 0;
for (let v = 0; v < nv; v++) if (P[3 * v + 1] < 0.02) plinth = Math.max(plinth, Math.hypot(P[3 * v], P[3 * v + 2]));

const book = await measureBook();
const nib = await measureNib();
const masks = measureMasks();

const MARGIN = 0.004; // around the book's box, so the mask holds its edges
// the book's box: along the cover's right, up and normal, around its corners and the same behind it
const bookObb = (() => {
  const axes = [book.right, book.up, book.n];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of book.corners) for (const p of [c, add(c, mul(book.n, -book.thickness))]) {
    axes.forEach((ax, k) => { const q = dot(p, ax); lo[k] = Math.min(lo[k], q); hi[k] = Math.max(hi[k], q); });
  }
  const mid = lo.map((l, k) => (l + hi[k]) / 2);
  return { centre: add(mul(axes[0], mid[0]), add(mul(axes[1], mid[1]), mul(axes[2], mid[2]))), axes, half: hi.map((h, k) => (h - lo[k]) / 2 + MARGIN) };
})();
const obbBox = (o) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = add(o.centre, add(mul(o.axes[0], sx * o.half[0]), add(mul(o.axes[1], sy * o.half[1]), mul(o.axes[2], sz * o.half[2]))));
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return { min: round(lo), max: round(hi) };
};
const nibObb = { centre: nib.centre, axes: nib.axes, half: nib.half.map((h) => h + 0.003) };
const roundObb = (o) => ({ centre: round(o.centre), axes: o.axes.map((a) => round(a)), half: round(o.half) });

const manifest = {
  about: 'The writer statue (assets/models/writer-statue.glb), measured by tools/writers/build-statue.mjs on the full source mesh.',
  space: "Statue space, the model's own: y up, its base on y = 0, 2 high, centred on its plinth in x and z, the front facing +z (seen by a camera on +z looking along -z). Lengths are in these units.",
  boxes: 'A box is { min, max } in statue space. An oriented box (obb) is { centre, axes, half }: three unit axes, and its half size along each; a point p is inside when |dot(p - centre, axes[i])| <= half[i] for each i.',
  bounds: { min: round(bounds[0]), max: round(bounds[1]) },
  plinth: { centre: [0, 0, 0], radius: round(plinth) },
  book: {
    cover: {
      about: "The book's front cover, the face with the title and the logo. corners are top-left, top-right, bottom-right, bottom-left as seen from the front; the spine is its left edge (top, bottom), where it opens; normal points out of the cover, up from its foot to its head, right from the spine to the fore-edge; size is [width, height]; thickness is the book's, behind the cover. The modelled book is a little out of true: the corners are where its edges meet, each at the cover's depth there (not quite in one plane), and the bottom-left one lies behind a fold of the robe.",
      corners: round([...book.corners]),
      spine: round([book.corners[0], book.corners[3]]),
      centre: round(book.centre),
      normal: round(book.n),
      up: round(book.up),
      right: round(book.right),
      size: round([book.w, book.h]),
      thickness: round(book.thickness),
    },
    box: obbBox(bookObb),
    obb: roundObb(bookObb),
  },
  nib: {
    about: "The pen's silver nib: axes[1] runs along the pen to its tip.",
    tip: round(nib.tip),
    box: obbBox(nibObb),
    obb: roundObb(nibObb),
  },
  masks: {
    about: 'The middle of the masks as seen from the front (their front-most surface), and the box of that surface.',
    centre: round(masks.centre),
    box: { min: round(masks.box[0]), max: round(masks.box[1]) },
  },
};

if (MEASURE_ONLY) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${MANIFEST}`);
  process.exit(0);
}

// ---------------------------------------------------------------- 3. simplifying, by parts
const PARTS = ['rest', ...Object.keys(DETAIL)];
const part = new Uint8Array(nt);
for (let t = 0; t < nt; t++) {
  const p = tc(t);
  const k = Object.values(DETAIL).findIndex((b) => inBox(p, b));
  part[t] = k + 1;
}
// a vertex is shared when its place (whatever its uv or normal) is in triangles of two parts
const parts = new Uint8Array(nv);
for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) parts[remap[I[3 * t + j]]] |= 1 << part[t];
const lock = new Uint8Array(nv);
for (let v = 0; v < nv; v++) { const m = parts[remap[v]]; lock[v] = m & (m - 1) ? 1 : 0; }
// the attributes the simplifier keeps close: the normal, and the uv (a texel is about 0.0005)
const attrs = new Float32Array(nv * 5);
for (let v = 0; v < nv; v++) { attrs.set(N.subarray(3 * v, 3 * v + 3), 5 * v); attrs.set(UV.subarray(2 * v, 2 * v + 2), 5 * v + 3); }
const WEIGHTS = [0.25, 0.25, 0.25, 1, 1];
const indexOf = (k) => { const out = []; for (let t = 0; t < nt; t++) if (part[t] === k) out.push(I[3 * t], I[3 * t + 1], I[3 * t + 2]); return Uint32Array.from(out); };
const kept = [];
let detailTris = 0;
for (let k = 1; k < PARTS.length; k++) {
  const idx = indexOf(k);
  const [out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, attrs, 5, WEIGHTS, lock, 0, ERROR, ['ErrorAbsolute', 'Sparse']);
  kept.push(out);
  detailTris += out.length / 3;
  console.log(`${PARTS[k]}: ${idx.length / 3} -> ${out.length / 3} triangles (error ${err.toFixed(5)})`);
}
{
  const idx = indexOf(0);
  const target = Math.max(0, TRIS - detailTris) * 3;
  const [out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, attrs, 5, WEIGHTS, lock, target, 1, ['ErrorAbsolute', 'Sparse']);
  kept.push(out);
  console.log(`rest: ${idx.length / 3} -> ${out.length / 3} triangles (error ${err.toFixed(5)})`);
}
// the kept vertices, packed
{
  const all = new Uint32Array(kept.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of kept) { all.set(a, o); o += a.length; }
  const to = new Int32Array(nv).fill(-1);
  let n = 0;
  for (let i = 0; i < all.length; i++) { if (to[all[i]] < 0) to[all[i]] = n++; all[i] = to[all[i]]; }
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let v = 0; v < nv; v++) {
    const w = to[v];
    if (w < 0) continue;
    pos.set(P.subarray(3 * v, 3 * v + 3), 3 * w); nrm.set(N.subarray(3 * v, 3 * v + 3), 3 * w); uv.set(UV.subarray(2 * v, 2 * v + 2), 2 * w);
  }
  prim.getAttribute('POSITION').setArray(pos);
  prim.getAttribute('NORMAL').setArray(nrm);
  prim.getAttribute('TEXCOORD_0').setArray(uv);
  prim.getIndices().setArray(all);
  manifest.triangles = all.length / 3;
  manifest.vertices = n;
  console.log(`simplified: ${n} vertices, ${all.length / 3} triangles`);
}

// ---------------------------------------------------------------- 4, 5. textures, compression
// the base colour and the normal map stay as they come (2048 px WebP); the metallic-roughness map is
// brought down. The material keeps its factors (the page sets the stone's finish in code).
material.setName('writer-statue');
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^metallicRoughnessTexture$/, resize: [MR, MR], quality: 90 }),
  prune(),
  dedup(),
  draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }),
);
await io.write(OUT, doc);
manifest.bytes = statSync(OUT).size;
for (const t of root.listTextures()) console.log(`texture ${t.getSize()?.join('x')} ${t.getMimeType()} ${(t.getImage().byteLength / 1024).toFixed(0)} KB (${t.listParents().map((p) => p.propertyType).join(',')})`);
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${OUT} (${(manifest.bytes / 1024).toFixed(0)} KB) and ${MANIFEST}`);

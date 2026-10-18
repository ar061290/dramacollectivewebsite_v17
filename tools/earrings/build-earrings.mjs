// Prepare the sun and moon earrings for the theme switch: assets/models/earrings.glb and earrings.json
//
//   node tools/earrings/build-earrings.mjs <earring-moon.glb> <earring-sun.glb> [tris=45000] [tex=1024]
//        [out=assets/models/earrings.glb] [manifest=assets/models/earrings.json] [textures=1] [simplify=1] [only=moon|sun]
//
// (glTF-Transform 4, meshoptimizer, draco3dgltf and sharp must be installed where it runs:
//  npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer draco3dgltf sharp
//  Node resolves those from the script's own folder, so copy the script next to that node_modules and give it
//  absolute paths. The part maps and the default outputs are found from the sources' folder,
//  tools/earrings/source/, so they land in the repo wherever the script runs.)
//
// The sources are Meshy models (tools/earrings/source/, not committed): each earring is one fused mesh,
// gltfpack-quantized, with base colour, metallic-roughness and normal maps. This
//   1. unpacks each (dequantize; the node's transform and the textures' uv transform baked in),
//   2. cuts it into rigid parts by its part map, tools/earrings/parts-<earring>.json:
//      - each part has polygons in the front (x, y) plane; a triangle goes to the first part with a
//        polygon holding its centroid. A polygon may also ask for a z range, for the triangle to face
//        a way, or for it to lie in a sphere (a bead), for loops that overlap in the front view, and
//        polygons marked "first" are looked at before the contested places;
//      - "contested" polygons cover the places where two loops touch. Each is split between its two
//        parts by the cheapest closed seam between what each has claimed around it (a minimum cut
//        over the triangles' adjacency). A seam costs its length, and far less along a concave
//        crease; two loops that touch are fused along such a crease, so the cut falls where loop
//        meets loop, as long as each part has claimed its own loop right up to the contested place;
//      - any triangle still unclaimed goes to whichever part reaches it first across the surface
//        (a walk in which a step into a concave crease costs `crease` times more),
//      - islands of a few triangles left in the wrong part go to the part around them,
//   3. measures each part: the pivot it hangs from (the middle of the seam where it was cut from its
//      parent, unless the map gives one), the hook's anchor (inside the ear wire's bend), its volume
//      and mass, centre of mass, bounds, a capsule and spheres for collisions, and its swing limits,
//   4. welds and simplifies each part (meshoptimizer), gentler on the small ones so their loops stay
//      round, with the cut edges locked so parent and child still meet; ≤ `tris` per earring,
//   5. writes a group per earring ("moon", "sun") with a mesh per part ("moon.hook", "moon.star", ...),
//      each with its geometry's origin at its pivot, so a node's position is its pivot in earring
//      space; the joint data is in each node's extras and in the manifest,
//   6. keeps one material per earring: base colour, normal and metallic-roughness maps at `tex` px,
//      WebP, and Draco-compresses the geometry (the site's decoder: public/draco/).
//
// Earring space is the sources' own: y up, the front facing +z, about 1.9 units tall, hook at the top.
// three.js's GLTFLoader drops the dots from node names ("moon.hook" becomes "moonhook"), so the
// runtime should find parts by userData.part, which keeps the full name.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune, dedup, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const sources = args.filter((a) => !a.includes('='));
const opts = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (sources.length !== 2) throw new Error('usage: build-earrings.mjs <earring-moon.glb> <earring-sun.glb> [options]');
const TOOLS = resolve(dirname(sources[0]), '..');
const REPO = resolve(TOOLS, '../..');
const TRIS = Number(opts.tris ?? 45000);
const TEX = Number(opts.tex ?? 1024);
const OUT = opts.out ?? join(REPO, 'assets/models/earrings.glb');
const MANIFEST = opts.manifest ?? join(REPO, 'assets/models/earrings.json');
const TEXTURES = opts.textures !== '0';
const SIMPLIFY = opts.simplify !== '0';

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const out = new Document();
const buffer = out.createBuffer();
const scene = out.createScene('earrings');
out.getRoot().setDefaultScene(scene);
const manifest = {
  about: 'The sun and moon earrings (assets/models/earrings.glb), written by tools/earrings/build-earrings.mjs.',
  space: "Earring space is the sources' own: y up, the front facing +z, in source units (about 1.9 tall: scale by the height). Each part node sits at its pivot, and its geometry is about that point. attach is the pivot in the parent's frame at rest (the pivot minus the parent's pivot), where the parent carries it. comLocal and bounds are about the part's own pivot. mass is the part's share of the earring's volume. swing is in degrees from the rest pose: inPlane about z, outOfPlane about x and y.",
  names: 'GLTFLoader drops the dots from node names (moon.hook becomes moonhook); userData.part keeps the full name.',
  earrings: {},
};
const round = (v, d = 5) => (Array.isArray(v) ? v.map((x) => round(x, d)) : Number(v.toFixed(d)));

// ---------------------------------------------------------------- geometry helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polyOf = (p) => (Array.isArray(p) ? { pts: p } : p);
// a polygon may also ask for a z range, or for the triangle to face a way (n: a direction, dot: the least cosine);
// a "sphere" [x, y, z, r] (a bead or a pearl) holds what lies inside it, with or without a polygon
const holds = (p, x, y, z, n) => (!p.z || (z >= p.z[0] && z <= p.z[1])) && (!p.n || p.n[0] * n[0] + p.n[1] * n[1] + p.n[2] * n[2] >= (p.dot ?? 0.9)) &&
  (!p.sphere || (x - p.sphere[0]) ** 2 + (y - p.sphere[1]) ** 2 + (z - p.sphere[2]) ** 2 <= p.sphere[3] ** 2) && (!p.pts || inPoly(x, y, p.pts));

// A binary min-heap of (cost, triangle) pairs, for the walk across the surface.
class Heap {
  constructor(n) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(k, v) {
    if (this.n === this.k.length) { const k2 = new Float64Array(this.n * 2); k2.set(this.k); this.k = k2; const v2 = new Int32Array(this.n * 2); v2.set(this.v); this.v = v2; }
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= k) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = k; this.v[i] = v;
  }
  pop() {
    const k = this.k[0], v = this.v[0], lk = this.k[--this.n], lv = this.v[this.n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= lk) break; this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c; }
    this.k[i] = lk; this.v[i] = lv;
    return [k, v];
  }
}

// A maximum flow (Dinic's algorithm), for the cheapest seam between two parts in a contested place.
// add(a, b, cap, back) adds an edge each way; solve gives the flow, which is the cut's cost;
// reach(s, reverse) marks what the source reaches (or what reaches the sink) with flow to spare.
class MaxFlow {
  constructor(n) { this.n = n; this.head = new Int32Array(n).fill(-1); this.to = []; this.cap = []; this.next = []; }
  add(a, b, c, back) {
    this.to.push(b, a); this.cap.push(c, back);
    this.next.push(this.head[a], this.head[b]);
    this.head[a] = this.to.length - 2; this.head[b] = this.to.length - 1;
  }
  solve(s, t) {
    const to = Int32Array.from(this.to), next = Int32Array.from(this.next), cap = Float64Array.from(this.cap);
    const level = new Int32Array(this.n), it = new Int32Array(this.n), queue = new Int32Array(this.n);
    let total = 0;
    const bfs = () => {
      level.fill(-1); level[s] = 0; let qh = 0, qt = 0; queue[qt++] = s;
      while (qh < qt) { const v = queue[qh++]; for (let e = this.head[v]; e >= 0; e = next[e]) if (cap[e] > 1e-12 && level[to[e]] < 0) { level[to[e]] = level[v] + 1; queue[qt++] = to[e]; } }
      return level[t] >= 0;
    };
    // an iterative depth-first push along the levels (the paths can be thousands of triangles long)
    const stack = new Int32Array(this.n), edges = new Int32Array(this.n);
    const dfs = () => {
      let depth = 0; stack[0] = s;
      for (;;) {
        const v = stack[depth];
        if (v === t) {
          let f = Infinity; for (let i = 0; i < depth; i++) f = Math.min(f, cap[edges[i]]);
          for (let i = 0; i < depth; i++) { cap[edges[i]] -= f; cap[edges[i] ^ 1] += f; }
          return f;
        }
        let e = it[v];
        while (e >= 0 && !(cap[e] > 1e-12 && level[to[e]] === level[v] + 1)) e = next[e];
        it[v] = e;
        if (e < 0) { if (depth === 0) return 0; level[v] = -1; depth--; it[stack[depth]] = next[it[stack[depth]]]; continue; }
        edges[depth] = e; stack[++depth] = to[e];
      }
    };
    while (bfs()) { for (let v = 0; v < this.n; v++) it[v] = this.head[v]; let f; while ((f = dfs()) > 0) total += f; }
    this.capLeft = cap; this.toA = to; this.nextA = next;
    return total;
  }
  reach(from, reverse) {
    const seen = new Uint8Array(this.n), queue = [from]; seen[from] = 1;
    while (queue.length) {
      const v = queue.pop();
      for (let e = this.head[v]; e >= 0; e = this.nextA[e]) {
        const u = this.toA[e];
        // forward: the edge v→u has room; reverse: the edge u→v (e ^ 1) has room
        if (!seen[u] && this.capLeft[reverse ? e ^ 1 : e] > 1e-12) { seen[u] = 1; queue.push(u); }
      }
    }
    return seen;
  }
}

// ---------------------------------------------------------------- one earring
async function buildEarring(src, name) {
  const map = JSON.parse(readFileSync(join(TOOLS, `parts-${name}.json`), 'utf8'));
  const doc = await io.read(src);
  await doc.transform(dequantize());
  const root = doc.getRoot();
  const srcNode = root.listNodes().find((n) => n.getMesh());
  const srcPrim = srcNode.getMesh().listPrimitives()[0];
  const srcMat = srcPrim.getMaterial();
  const M = srcNode.getWorldMatrix();

  // the uv transform the packer put on the textures (the same on each): baked into the uvs
  let uvScale = [1, 1], uvOffset = [0, 0];
  for (const info of [srcMat.getBaseColorTextureInfo(), srcMat.getNormalTextureInfo(), srcMat.getMetallicRoughnessTextureInfo()]) {
    const t = info?.getExtension('KHR_texture_transform');
    if (t) { uvScale = t.getScale(); uvOffset = t.getOffset(); }
  }
  const P = srcPrim.getAttribute('POSITION').getArray();
  const N = srcPrim.getAttribute('NORMAL').getArray();
  const T = srcPrim.getAttribute('TEXCOORD_0').getArray();
  const I = srcPrim.getIndices().getArray();
  const nv = P.length / 3, nt = I.length / 3;
  // world positions (the node's matrix) and normals (its rotation and scale; uniform here), and uvs
  const W = new Float32Array(nv * 3), WN = new Float32Array(nv * 3), UV = new Float32Array(nv * 2);
  for (let v = 0; v < nv; v++) {
    const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
    W[3 * v] = M[0] * x + M[4] * y + M[8] * z + M[12];
    W[3 * v + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    W[3 * v + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    const a = N[3 * v], b = N[3 * v + 1], c = N[3 * v + 2];
    const nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    WN[3 * v] = nx / l; WN[3 * v + 1] = ny / l; WN[3 * v + 2] = nz / l;
    UV[2 * v] = T[2 * v] * uvScale[0] + uvOffset[0];
    UV[2 * v + 1] = T[2 * v + 1] * uvScale[1] + uvOffset[1];
  }
  const vp = (v) => [W[3 * v], W[3 * v + 1], W[3 * v + 2]];

  // the vertices welded by position (the uv seams split them), for the surface's connectivity
  const weldOf = new Int32Array(nv);
  let nWeld = 0;
  { const seen = new Map(); for (let v = 0; v < nv; v++) { const k = `${W[3 * v]},${W[3 * v + 1]},${W[3 * v + 2]}`; let w = seen.get(k); if (w === undefined) seen.set(k, (w = seen.size)); weldOf[v] = w; } nWeld = seen.size; }
  // each triangle's centroid, unit normal and area
  const C = new Float64Array(nt * 3), FN = new Float64Array(nt * 3), AREA = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = vp(I[3 * t]), b = vp(I[3 * t + 1]), c = vp(I[3 * t + 2]);
    for (let k = 0; k < 3; k++) C[3 * t + k] = (a[k] + b[k] + c[k]) / 3;
    const u = sub(b, a), w = sub(c, a);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = len(n); AREA[t] = l / 2;
    for (let k = 0; k < 3; k++) FN[3 * t + k] = l > 0 ? n[k] / l : 0;
  }
  // triangles that share an edge (all pairs, where an edge is shared by more than two)
  const edgeTris = new Map();
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = weldOf[I[3 * t + e]], b = weldOf[I[3 * t + ((e + 1) % 3)]];
    if (a === b) continue;
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    const l = edgeTris.get(key); if (l) l.push(t); else edgeTris.set(key, [t]);
  }
  const deg = new Int32Array(nt + 1);
  for (const l of edgeTris.values()) for (let i = 0; i < l.length; i++) for (let j = 0; j < l.length; j++) if (i !== j) deg[l[i] + 1]++;
  for (let t = 0; t < nt; t++) deg[t + 1] += deg[t];
  const adj = new Int32Array(deg[nt]), adjEdge = new Float64Array(deg[nt]), fill = deg.slice(0, nt);
  for (const [key, l] of edgeTris) {
    const a = Math.floor(key / 4194304), b = key % 4194304;
    for (let i = 0; i < l.length; i++) for (let j = 0; j < l.length; j++) if (i !== j) { adj[fill[l[i]]] = l[j]; adjEdge[fill[l[i]]++] = key; }
  }
  edgeTris.clear();

  // 1. claim triangles by the polygons
  const parts = map.parts.map((p) => ({ ...p, polys: p.polys.map(polyOf) }));
  const index = new Map(parts.map((p, i) => [p.name, i]));
  const contested = (map.contested ?? []).map((c) => ({ ...c, allow: new Set(c.parts.map((n) => { if (!index.has(n)) throw new Error(`${name}: contested names unknown part ${n}`); return index.get(n); })) }));
  const label = new Int32Array(nt).fill(-1);
  const zone = new Int32Array(nt).fill(-1);
  let unclaimed = 0;
  for (let t = 0; t < nt; t++) {
    const x = C[3 * t], y = C[3 * t + 1], z = C[3 * t + 2], n = [FN[3 * t], FN[3 * t + 1], FN[3 * t + 2]];
    // polygons marked "first" (a loop's arcs right beside a contested place) come before the contested places
    for (let i = 0; i < parts.length && label[t] < 0; i++) if (parts[i].polys.some((p) => p.first && holds(p, x, y, z, n))) label[t] = i;
    if (label[t] >= 0) continue;
    const ci = contested.findIndex((c) => holds(c, x, y, z, n));
    if (ci >= 0) { zone[t] = ci; continue; }
    for (let i = 0; i < parts.length && label[t] < 0; i++) if (parts[i].polys.some((p) => holds(p, x, y, z, n))) label[t] = i;
    if (label[t] < 0) unclaimed++;
  }
  // where two parts' polygons meet on the surface itself, the cut is the polygon's edge: report it
  const straight = new Map();
  for (let t = 0; t < nt; t++) if (label[t] >= 0) for (let k = deg[t]; k < deg[t + 1]; k++) {
    const u = adj[k]; if (u < t || label[u] < 0 || label[u] === label[t]) continue;
    const key = Math.min(label[t], label[u]) * 1000 + Math.max(label[t], label[u]);
    let r = straight.get(key); if (!r) straight.set(key, (r = { n: 0, lo: [9, 9], hi: [-9, -9] }));
    r.n++; for (let d = 0; d < 2; d++) { r.lo[d] = Math.min(r.lo[d], C[3 * t + d]); r.hi[d] = Math.max(r.hi[d], C[3 * t + d]); }
  }
  for (const [key, r] of straight) console.log(`  ${name}: the polygons of ${parts[Math.floor(key / 1000)].name} and ${parts[key % 1000].name} meet on the surface (${r.n} edges, x ${r.lo[0].toFixed(3)}..${r.hi[0].toFixed(3)} y ${r.lo[1].toFixed(3)}..${r.hi[1].toFixed(3)})`);
  // the welded vertex ids back to positions, and how much a step between two triangles turns into a
  // concave crease (0 flat or convex, 1 at a right angle)
  const weldPos = new Float64Array(nWeld * 3);
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) weldPos[3 * weldOf[v] + k] = W[3 * v + k];
  const creaseOf = (t, u) => {
    const dx = C[3 * u] - C[3 * t], dy = C[3 * u + 1] - C[3 * t + 1], dz = C[3 * u + 2] - C[3 * t + 2];
    const nd = FN[3 * t] * FN[3 * u] + FN[3 * t + 1] * FN[3 * u + 1] + FN[3 * t + 2] * FN[3 * u + 2];
    const concave = (FN[3 * t] * dx + FN[3 * t + 1] * dy + FN[3 * t + 2] * dz) - (FN[3 * u] * dx + FN[3 * u + 1] * dy + FN[3 * u + 2] * dz) > 0;
    return concave ? Math.min(1, 1 - nd) : 0;
  };
  const edgeLength = (key) => { const a = Math.floor(key / 4194304), b = key % 4194304; return Math.hypot(weldPos[3 * a] - weldPos[3 * b], weldPos[3 * a + 1] - weldPos[3 * b + 1], weldPos[3 * a + 2] - weldPos[3 * b + 2]); };
  // 2. each contested place is split between its two parts by the cheapest closed seam (a minimum
  //    cut between the triangles each has claimed around it). A seam costs its length, and much less
  //    along a concave crease, so it falls on the crease where the two loops are fused.
  const grown = new Int32Array(nt).fill(-1);
  for (let t = 0; t < nt; t++) grown[t] = label[t];
  let undecided = 0;
  // a fused contact is blended over a few triangles, so a turn of 20-30 degrees already counts as a crease
  const SHARP = Number(opts.sharp ?? map.sharp ?? 8);
  contested.forEach((zc, ci) => {
    if (zc.parts.length !== 2) throw new Error(`${name}: a contested place names two parts`);
    const [A, B] = zc.parts.map((n) => index.get(n));
    const nodes = []; const id = new Map();
    for (let t = 0; t < nt; t++) if (zone[t] === ci) { id.set(t, nodes.length); nodes.push(t); }
    const n = nodes.length, S = n, Tn = n + 1;
    const flow = new MaxFlow(n + 2);
    let toA = 0, toB = 0;
    for (const t of nodes) {
      const i = id.get(t);
      for (let k = deg[t]; k < deg[t + 1]; k++) {
        const u = adj[k];
        if (zone[u] === ci) { if (u > t) { const c = edgeLength(adjEdge[k]) * Math.max(0.02, Math.max(0, 1 - SHARP * creaseOf(t, u)) ** 2); flow.add(i, id.get(u), c, c); } }
        else if (label[u] === A) { flow.add(S, i, 20 * edgeLength(adjEdge[k]), 0); toA++; }
        else if (label[u] === B) { flow.add(i, Tn, 20 * edgeLength(adjEdge[k]), 0); toB++; }
      }
    }
    if (!toA || !toB) { console.warn(`  ${name}: the contested place ${ci} (${zc.parts}) touches only one of its parts' polygons; the walk decides it`); return; }
    flow.solve(S, Tn);
    const sideA = flow.reach(S, false), sideB = flow.reach(Tn, true);
    let left = 0;
    for (const t of nodes) { const i = id.get(t); if (sideA[i]) grown[t] = A; else if (sideB[i]) grown[t] = B; else left++; }
    undecided += left;
  });
  // 3. the rest goes to whichever part reaches it first across the surface; turning into a concave
  //    crease (where two loops are fused) costs `crease` times more
  const CREASE = Number(opts.crease ?? map.crease ?? 40);
  const cost = new Float64Array(nt).fill(Infinity);
  const heap = new Heap(nt);
  for (let t = 0; t < nt; t++) label[t] = grown[t];
  for (let t = 0; t < nt; t++) if (label[t] >= 0) {
    for (let k = deg[t]; k < deg[t + 1]; k++) if (label[adj[k]] < 0) { cost[t] = 0; heap.push(0, t); break; }
  }
  while (heap.n) {
    const [d, t] = heap.pop();
    if (d > cost[t]) continue;
    const L = grown[t];
    for (let k = deg[t]; k < deg[t + 1]; k++) {
      const u = adj[k]; if (label[u] >= 0) continue;
      if (zone[u] >= 0 && !contested[zone[u]].allow.has(L)) continue;
      const dist = Math.hypot(C[3 * u] - C[3 * t], C[3 * u + 1] - C[3 * t + 1], C[3 * u + 2] - C[3 * t + 2]);
      const step = dist * (1 + CREASE * creaseOf(t, u));
      if (d + step < cost[u]) { cost[u] = d + step; grown[u] = L; heap.push(d + step, u); }
    }
  }
  // anything the walk could not reach (a piece joined to the rest only at a vertex) goes with the nearest claimed triangle
  const lostList = [];
  for (let t = 0; t < nt; t++) if (grown[t] < 0) lostList.push(t);
  const lost = lostList.length;
  for (const t of lostList) {
    let best = 0, bd = Infinity;
    for (let u = 0; u < nt; u++) { if (grown[u] < 0) continue; const d = (C[3 * u] - C[3 * t]) ** 2 + (C[3 * u + 1] - C[3 * t + 1]) ** 2 + (C[3 * u + 2] - C[3 * t + 2]) ** 2; if (d < bd) { bd = d; best = grown[u]; } }
    grown[t] = best;
  }
  // 4. small islands go to the part around them
  const ISLAND = map.island ?? 60;
  let moved = 0;
  for (let pass = 0; pass < 4; pass++) {
    const comp = new Int32Array(nt).fill(-1); let changed = 0;
    for (let s = 0; s < nt; s++) {
      if (comp[s] >= 0) continue;
      const L = grown[s], list = [s]; comp[s] = s;
      for (let i = 0; i < list.length; i++) { const t = list[i]; for (let k = deg[t]; k < deg[t + 1]; k++) { const u = adj[k]; if (comp[u] < 0 && grown[u] === L) { comp[u] = s; list.push(u); } } }
      if (list.length >= ISLAND) continue;
      const votes = new Map();
      for (const t of list) for (let k = deg[t]; k < deg[t + 1]; k++) { const u = adj[k]; if (grown[u] !== L) votes.set(grown[u], (votes.get(grown[u]) ?? 0) + 1); }
      if (!votes.size) continue;
      const to = [...votes].sort((a, b) => b[1] - a[1])[0][0];
      for (const t of list) grown[t] = to;
      changed += list.length;
    }
    moved += changed;
    if (!changed) break;
  }
  // what is left: each part's pieces (a part may be several loops that only touch through another)
  const pieces = parts.map(() => []);
  { const comp = new Int32Array(nt).fill(-1);
    for (let s = 0; s < nt; s++) { if (comp[s] >= 0) continue; const L = grown[s], list = [s]; comp[s] = s;
      for (let i = 0; i < list.length; i++) { const t = list[i]; for (let k = deg[t]; k < deg[t + 1]; k++) { const u = adj[k]; if (comp[u] < 0 && grown[u] === L) { comp[u] = s; list.push(u); } } }
      pieces[L].push(list.length); } }

  // the seams: edges between triangles of two parts, by pair (length and length-weighted middle)
  const seams = new Map();
  for (let t = 0; t < nt; t++) for (let k = deg[t]; k < deg[t + 1]; k++) {
    const u = adj[k]; if (u <= t || grown[u] === grown[t]) continue;
    const a = Math.min(grown[t], grown[u]), b = Math.max(grown[t], grown[u]);
    const key = adjEdge[k], v0 = Math.floor(key / 4194304), v1 = key % 4194304;
    let s = seams.get(a * 1000 + b); if (!s) seams.set(a * 1000 + b, (s = { a, b, len: 0, sum: [0, 0, 0], pts: [] }));
    s.pts.push([v0, v1]);
  }
  for (const s of seams.values()) {
    for (const [v0, v1] of s.pts) {
      const a = [weldPos[3 * v0], weldPos[3 * v0 + 1], weldPos[3 * v0 + 2]], b = [weldPos[3 * v1], weldPos[3 * v1 + 1], weldPos[3 * v1 + 2]];
      const l = len(sub(b, a)); s.len += l; for (let k = 0; k < 3; k++) s.sum[k] += l * (a[k] + b[k]) / 2;
    }
    s.mid = s.sum.map((x) => x / s.len);
    s.spread = Math.max(...s.pts.map(([v0]) => len(sub([weldPos[3 * v0], weldPos[3 * v0 + 1], weldPos[3 * v0 + 2]], s.mid))));
  }
  const seamOf = (a, b) => seams.get(Math.min(a, b) * 1000 + Math.max(a, b));

  console.log(`\n== ${name}: ${nt} triangles, ${unclaimed} claimed by no polygon, ${undecided} left undecided by the cuts, ${lost} reached by no part, ${moved} in small islands moved`);

  // 5. each part: its triangles, joint, mass, collider
  const info = parts.map((p, i) => {
    const tris = [];
    for (let t = 0; t < nt; t++) if (grown[t] === i) tris.push(t);
    if (!tris.length) throw new Error(`${name}.${p.name} has no triangles`);
    const used = new Map(); const order = [];
    for (const t of tris) for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; if (!used.has(v)) { used.set(v, order.length); order.push(v); } }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of order) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], W[3 * v + k]); hi[k] = Math.max(hi[k], W[3 * v + k]); }
    // area-weighted centroid, then the volume (signed tetrahedra from it) and the centre of mass
    let area = 0; const ac = [0, 0, 0];
    for (const t of tris) { area += AREA[t]; for (let k = 0; k < 3; k++) ac[k] += AREA[t] * C[3 * t + k]; }
    for (let k = 0; k < 3; k++) ac[k] /= area;
    let vol = 0; const vc = [0, 0, 0];
    for (const t of tris) {
      const a = sub(vp(I[3 * t]), ac), b = sub(vp(I[3 * t + 1]), ac), c = sub(vp(I[3 * t + 2]), ac);
      const v6 = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      vol += v6 / 6; for (let k = 0; k < 3; k++) vc[k] += (v6 / 6) * (a[k] + b[k] + c[k]) / 4;
    }
    let com = ac;
    if (Math.abs(vol) > 1e-9) { const cand = vc.map((x, k) => x / vol + ac[k]); if (cand.every((x, k) => x >= lo[k] && x <= hi[k])) com = cand; }
    return { ...p, i, tris, order, lo, hi, area, volume: Math.abs(vol), com };
  });
  const totalVolume = info.reduce((a, p) => a + p.volume, 0);
  for (const p of info) {
    p.parentIndex = p.parent ? index.get(p.parent) : -1;
    if (p.parent && p.parentIndex === undefined) throw new Error(`${name}.${p.name}: unknown parent ${p.parent}`);
    if (!p.parent) {
      // the hook: the anchor is the inside of the ear wire's bend, unless the map gives it
      if (!p.anchor) {
        let top = -1, ty = -Infinity; for (const v of p.order) if (W[3 * v + 1] > ty) { ty = W[3 * v + 1]; top = v; }
        const tx = W[3 * top]; let inner = Infinity, zs = 0, zn = 0;
        for (const v of p.order) { if (Math.abs(W[3 * v] - tx) < 0.004 && W[3 * v + 1] > ty - 0.04) { inner = Math.min(inner, W[3 * v + 1]); zs += W[3 * v + 2]; zn++; } }
        p.anchor = [tx, inner, zs / zn];
      }
      p.pivot = p.anchor;
      p.seam = null;
    } else {
      const s = seamOf(p.i, p.parentIndex);
      p.seam = s ? { length: s.len, spread: s.spread, mid: s.mid } : null;
      if (!p.pivot) { if (!s) throw new Error(`${name}.${p.name} does not touch ${p.parent}: give it a pivot`); p.pivot = s.mid; }
    }
    p.mass = p.volume / totalVolume;
    // a capsule along the part's longest axis (its vertices' principal direction)
    const pts = p.order.map((v) => vp(v));
    const c = pts.reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]], [0, 0, 0]).map((x) => x / pts.length);
    const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const q of pts) { const d = sub(q, c); for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) cov[r][s] += d[r] * d[s]; }
    let axis = [0, 1, 0];
    for (let it = 0; it < 50; it++) { const n = [dot(cov[0], axis), dot(cov[1], axis), dot(cov[2], axis)]; const l = len(n) || 1; axis = n.map((x) => x / l); }
    const ts = pts.map((q) => dot(sub(q, c), axis)).sort((a, b) => a - b);
    const radial = pts.map((q) => { const d = sub(q, c); const t = dot(d, axis); return len(d.map((x, k) => x - t * axis[k])); }).sort((a, b) => a - b);
    const r = radial[Math.floor(radial.length * 0.9)];
    let t0 = ts[0] + r, t1 = ts[ts.length - 1] - r; if (t1 < t0) t0 = t1 = (ts[0] + ts[ts.length - 1]) / 2;
    p.capsule = { a: c.map((x, k) => x + t0 * axis[k]), b: c.map((x, k) => x + t1 * axis[k]), r };
    const dists = pts.map((q) => len(sub(q, p.com))).sort((a, b) => a - b);
    p.sphere = { c: p.com, r: dists[dists.length - 1] };
    // a few spheres over the part (k-means on its vertices), for parts too broad for one capsule
    const extent = Math.max(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1]);
    const k = p.spheres ?? Math.max(1, Math.min(10, Math.round(extent / 0.07)));
    p.spheresOut = kspheres(pts, k);
  }

  // report the cut
  for (const p of info) {
    const s = p.seam;
    console.log(`  ${(name + '.' + p.name).padEnd(14)} ${String(p.tris.length).padStart(6)} tris, pieces [${pieces[p.i].sort((a, b) => b - a).slice(0, 6).join(', ')}${pieces[p.i].length > 6 ? ', ...' : ''}]` +
      ` pivot ${round(p.pivot, 4)}${s ? ` (seam ${s.length.toFixed(3)} long, spread ${s.spread.toFixed(3)})` : ''} mass ${p.mass.toFixed(3)}`);
  }
  for (const s of seams.values()) {
    const A = parts[s.a], B = parts[s.b];
    if (A.parent !== B.name && B.parent !== A.name) console.log(`  also cut between ${A.name} and ${B.name}: ${s.len.toFixed(3)} long at ${round(s.mid, 3)} (spread ${s.spread.toFixed(3)})`);
  }

  // 6. simplify each part: a share of the budget by its size, gentler on the small ones
  const budget = TRIS * 0.97;
  const weights = info.map((p) => Math.pow(p.tris.length, 0.6));
  let scale = budget / weights.reduce((a, b) => a + b, 0);
  let meshes;
  for (let attempt = 0; attempt < 4; attempt++) {
    meshes = info.map((p, i) => simplifyPart(p, SIMPLIFY ? Math.min(p.tris.length, Math.max(300, weights[i] * scale)) : p.tris.length));
    const total = meshes.reduce((a, m) => a + m.idx.length / 3, 0);
    if (total <= TRIS) break;
    scale *= (budget / total) * 0.97;
  }
  function simplifyPart(p, target) {
    const nvp = p.order.length;
    const pos = new Float32Array(nvp * 3), attr = new Float32Array(nvp * 5), nrm = new Float32Array(nvp * 3), uv = new Float32Array(nvp * 2);
    p.order.forEach((v, j) => {
      for (let k = 0; k < 3; k++) { pos[3 * j + k] = W[3 * v + k] - p.pivot[k]; nrm[3 * j + k] = WN[3 * v + k]; attr[5 * j + k] = WN[3 * v + k]; }
      uv[2 * j] = UV[2 * v]; uv[2 * j + 1] = UV[2 * v + 1]; attr[5 * j + 3] = UV[2 * v]; attr[5 * j + 4] = UV[2 * v + 1];
    });
    const local = new Map(p.order.map((v, j) => [v, j]));
    let idx = new Uint32Array(p.tris.length * 3);
    p.tris.forEach((t, j) => { for (let k = 0; k < 3; k++) idx[3 * j + k] = local.get(I[3 * t + k]); });
    if (target < p.tris.length) {
      [idx] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 5, [0.25, 0.25, 0.25, 0.5, 0.5], null, Math.floor(target) * 3, 0.05, ['LockBorder']);
    }
    // keep only the vertices still used
    const remap = new Int32Array(nvp).fill(-1); let n = 0;
    for (const v of idx) if (remap[v] < 0) remap[v] = n++;
    const P2 = new Float32Array(n * 3), N2 = new Float32Array(n * 3), U2 = new Float32Array(n * 2);
    for (let v = 0; v < nvp; v++) { const j = remap[v]; if (j < 0) continue; for (let k = 0; k < 3; k++) { P2[3 * j + k] = pos[3 * v + k]; N2[3 * j + k] = nrm[3 * v + k]; } U2[2 * j] = uv[2 * v]; U2[2 * j + 1] = uv[2 * v + 1]; }
    return { pos: P2, nrm: N2, uv: U2, idx: new Uint32Array(idx.map((v) => remap[v])) };
  }

  // 7. the material, one for the earring: its maps, without the uv transform (it is in the uvs now)
  const mat = out.createMaterial(name).setBaseColorFactor(srcMat.getBaseColorFactor()).setMetallicFactor(srcMat.getMetallicFactor()).setRoughnessFactor(srcMat.getRoughnessFactor());
  const copyTex = (t, slot) => t && out.createTexture(`${name}-${slot}`).setImage(t.getImage()).setMimeType(t.getMimeType());
  if (TEXTURES) {
    mat.setBaseColorTexture(copyTex(srcMat.getBaseColorTexture(), 'color'));
    mat.setNormalTexture(copyTex(srcMat.getNormalTexture(), 'normal')).setNormalScale(srcMat.getNormalScale());
    mat.setMetallicRoughnessTexture(copyTex(srcMat.getMetallicRoughnessTexture(), 'mr'));
  }
  const group = out.createNode(name);
  scene.addChild(group);
  const allLo = [Infinity, Infinity, Infinity], allHi = [-Infinity, -Infinity, -Infinity];
  for (const p of info) for (let k = 0; k < 3; k++) { allLo[k] = Math.min(allLo[k], p.lo[k]); allHi[k] = Math.max(allHi[k], p.hi[k]); }
  const hook = info.find((p) => !p.parent);
  const rec = [];
  // parents before their children, in the map's order otherwise
  const order = [];
  const visit = (p) => { if (order.includes(p)) return; if (p.parentIndex >= 0) visit(info[p.parentIndex]); order.push(p); };
  info.forEach(visit);
  order.forEach((p) => {
    const i = p.i;
    const m = meshes[i];
    const full = `${name}.${p.name}`;
    const prim = out.createPrimitive()
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buffer))
      .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(m.nrm).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(m.uv).setBuffer(buffer))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(m.idx).setBuffer(buffer))
      .setMaterial(mat);
    const local = (q) => q.map((x, k) => x - p.pivot[k]);
    const joint = {
      part: full,
      parent: p.parent ? `${name}.${p.parent}` : null,
      pivot: round(p.pivot),
      attach: p.parent ? round(p.pivot.map((x, k) => x - info[p.parentIndex].pivot[k])) : null,
      ...(p.parent ? {} : { anchor: round(p.anchor) }),
      mass: round(p.mass, 4),
      volume: Number(p.volume.toPrecision(4)),
      com: round(p.com),
      comLocal: round(local(p.com)),
      bounds: { min: round(local(p.lo)), max: round(local(p.hi)) },
      collider: {
        capsule: { a: round(p.capsule.a), b: round(p.capsule.b), r: round(p.capsule.r) },
        sphere: { c: round(p.sphere.c), r: round(p.sphere.r) },
        spheres: p.spheresOut.map((s) => round(s)),
      },
      swing: { inPlane: p.swing?.inPlane ?? 75, outOfPlane: p.swing?.outOfPlane ?? 30 },
      triangles: m.idx.length / 3,
    };
    const node = out.createNode(full).setMesh(out.createMesh(full).addPrimitive(prim)).setTranslation(p.pivot).setExtras(joint);
    group.addChild(node);
    rec.push(joint);
  });
  const triangles = rec.reduce((a, r) => a + r.triangles, 0);
  const summary = {
    height: round(allHi[1] - allLo[1]),
    bounds: { min: round(allLo), max: round(allHi) },
    anchor: round(hook.anchor),
    triangles,
    parts: rec.map((r) => r.part),
  };
  group.setExtras({ earring: name, ...summary });
  manifest.earrings[name] = { node: name, ...summary, parts: rec };
  console.log(`  ${triangles} triangles after simplifying (${rec.map((r) => `${r.part.split('.')[1]} ${r.triangles}`).join(', ')})`);
}

// k-means on points: k spheres, each over its points (radius: the 90th percentile of their distances)
function kspheres(pts, k) {
  const step = Math.max(1, Math.floor(pts.length / 4000));
  const s = pts.filter((_, i) => i % step === 0);
  let cs = [s[0]];
  while (cs.length < k) { let far = s[0], fd = -1; for (const q of s) { const d = Math.min(...cs.map((c) => len(sub(q, c)))); if (d > fd) { fd = d; far = q; } } cs.push(far); }
  let groups;
  for (let it = 0; it < 12; it++) {
    groups = cs.map(() => []);
    for (const q of s) { let bi = 0, bd = Infinity; cs.forEach((c, i) => { const d = len(sub(q, c)); if (d < bd) { bd = d; bi = i; } }); groups[bi].push(q); }
    cs = groups.map((g, i) => (g.length ? [0, 1, 2].map((k2) => g.reduce((a, q) => a + q[k2], 0) / g.length) : cs[i]));
  }
  return cs.map((c, i) => { const d = groups[i].map((q) => len(sub(q, c))).sort((a, b) => a - b); return [...c, d.length ? d[Math.floor(d.length * 0.9)] : 0]; });
}

const [moonSrc, sunSrc] = sources;
if (!opts.only || opts.only === 'moon') await buildEarring(moonSrc, 'moon');
if (!opts.only || opts.only === 'sun') await buildEarring(sunSrc, 'sun');

const transforms = [];
if (TEXTURES) transforms.push(
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, resize: [TEX, TEX], quality: 90 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, resize: [TEX, TEX], quality: 92 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^metallicRoughnessTexture$/, resize: [TEX, TEX], quality: 90 }),
);
transforms.push(prune({ keepLeaves: true }), dedup(), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await out.transform(...transforms);
await io.write(OUT, out);

// what each earring weighs in the file: its Draco geometry and its images
const glb = readFileSync(OUT);
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
const viewBytes = (i) => (i === undefined ? 0 : json.bufferViews[i].byteLength);
for (const [name, e] of Object.entries(manifest.earrings)) {
  let bytes = 0;
  const group = json.nodes.find((n) => n.name === name);
  const mats = new Set();
  for (const c of group.children) for (const pr of json.meshes[json.nodes[c].mesh].primitives) {
    bytes += viewBytes(pr.extensions?.KHR_draco_mesh_compression?.bufferView); mats.add(pr.material);
  }
  for (const mi of mats) {
    const m = json.materials[mi];
    for (const ti of [m.pbrMetallicRoughness?.baseColorTexture, m.normalTexture, m.pbrMetallicRoughness?.metallicRoughnessTexture]) {
      if (!ti) continue; const tex = json.textures[ti.index]; const img = json.images[tex.extensions?.EXT_texture_webp?.source ?? tex.source]; bytes += viewBytes(img.bufferView);
    }
  }
  e.bytes = bytes;
  console.log(`${name}: ${(bytes / 1024).toFixed(0)} KB in the file`);
}
manifest.file = 'assets/models/earrings.glb';
// arrays of numbers on one line each, so the manifest reads part by part
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1).replace(/\[\s+(-?[\d.e-]+(?:,\s+-?[\d.e-]+)*)\s+\]/g, (m, a) => `[${a.split(/,\s+/).join(', ')}]`) + '\n');
console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024).toFixed(0)} KB) and ${MANIFEST}`);

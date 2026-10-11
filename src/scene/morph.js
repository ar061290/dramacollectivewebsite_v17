// The morph: the statue's own surface becomes the 3D logo.
//
// One mesh, two shapes, the same triangles. At the start every triangle is exactly one of the
// statue's triangles, posed as it is at the end of the pose phase (computed from the same skeleton
// the GPU skins with), so swapping the skinned statue for this mesh cannot be seen. At the end every
// triangle is exactly one triangle of the extruded logo. In between, each triangle travels on its own
// clock along a gentle swirl about the turning axis, and the marble turns to gold as it goes.
//
//   1. The logo is tessellated (longest-edge splits) to exactly the statue's triangle count.
//   2. Statue and logo triangles are paired by balanced recursive median splits of their centroids,
//      each set normalised to its own bounds: neighbours stay neighbours, and the figure's front
//      becomes the logo's front.
//   3. Each pair's corners are rotated to the best match, so triangles do not flip on the way.
//   4. Each triangle's start is staggered by distance from the mask plus smooth noise, so the change
//      spreads outward from the mask across the figure. The swirl turns everything the same way,
//      its strength varying smoothly, so neighbouring pieces travel together instead of shredding.
// Everything here runs once, in about a quarter of a second for 160k triangles.

import * as THREE from 'three';

export const MORPH = {
  delayMax: 0.6, // the last triangles set off at 60% of the morph
  swirl: 0.8, // radians of turn about the axis at mid-flight, all one way, its strength varying smoothly
  lift: 0.06, // rise at mid-flight, statue units (counted in the ring clearance)
  gold: 0xcaa752, // gold-600, a shade deeper: as a metal it reads lighter than its swatch
  goldRoughness: 0.34,
};

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

// ---- 1. tessellate the logo to exactly `target` triangles (split the longest edge first) ----
function tessellate(geo, target) {
  const P0 = geo.attributes.position.array, N0 = geo.attributes.normal.array;
  let count = P0.length / 9;
  if (count > target) throw new Error(`logo has ${count} triangles, more than the statue's ${target}`);
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
  attribute vec2 aParams; // x: start delay, y: swirl strength
  uniform float uMorph;
  uniform float uDelayMax;
  uniform vec3 uCenter;
  uniform float uSwirl;
  uniform float uLift;
  varying float vMorph;
  float morphS() {
    float s = clamp((uMorph - aParams.x) / (1.0 - uDelayMax), 0.0, 1.0);
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
  float bump = sin(3.14159265 * mS);
  float turn = uSwirl * bump * aParams.y;
  vec3 transformed = uCenter + swirl(mix(position, aPosB, mS) - uCenter, turn) + vec3(0.0, uLift * bump, 0.0);
`;
const BEGIN_NORMAL = /* glsl */`
  float nS = morphS();
  vec3 objectNormal = swirl(normalize(mix(normal, aNormB, nS)), uSwirl * sin(3.14159265 * nS) * aParams.y);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif
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
 * @param {THREE.BufferGeometry} o.logo     from buildLogoGeometry, in turntable space
 * @param {THREE.Vector3} o.center          the turning axis' centre (for the swirl)
 * @param {THREE.Vector3} o.origin          where the change starts (the mask), turntable space
 */
export function buildMorph({ skinned, space, logo, center, origin }) {
  const t0 = performance.now();
  const g = skinned.geometry;
  const index = g.index.array;
  const n = index.length / 3;
  const { pos, nor } = posedVertices(skinned, space);
  const uv = g.attributes.uv;
  const { P: LP, N: LN } = tessellate(logo, n);

  // centroids
  const ca = new Float32Array(n * 3), cb = new Float32Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let q = 0; q < 3; q++) {
      ca[t * 3 + q] = (pos[index[t * 3] * 3 + q] + pos[index[t * 3 + 1] * 3 + q] + pos[index[t * 3 + 2] * 3 + q]) / 3;
      cb[t * 3 + q] = (LP[t * 9 + q] + LP[t * 9 + 3 + q] + LP[t * 9 + 6 + q]) / 3;
    }
  }
  const pair = match(ca, cb, n);

  // stagger: distance from the mask, plus smooth noise; swirl strength: smooth noise too
  const delay = new Float32Array(n);
  const swirl = new Float32Array(n);
  let far = 0;
  for (let t = 0; t < n; t++) {
    const d = Math.hypot(ca[t * 3] - origin.x, ca[t * 3 + 1] - origin.y, ca[t * 3 + 2] - origin.z);
    delay[t] = d; if (d > far) far = d;
  }
  for (let t = 0; t < n; t++) {
    const nz = valueNoise(ca[t * 3] * 5, ca[t * 3 + 1] * 5, ca[t * 3 + 2] * 5);
    delay[t] = MORPH.delayMax * Math.min(1, Math.max(0, 0.78 * (delay[t] / far) + 0.32 * (nz - 0.5) + 0.06));
    swirl[t] = 0.55 + 0.9 * valueNoise(ca[t * 3] * 2.5 + 17.3, ca[t * 3 + 1] * 2.5, ca[t * 3 + 2] * 2.5 - 4.1);
  }

  // the soup
  const V = n * 3;
  const aPos = new Float32Array(V * 3), aNor = new Float32Array(V * 3), aUv = new Float32Array(V * 2);
  const aPosB = new Float32Array(V * 3), aNormB = new Float32Array(V * 3), aParams = new Float32Array(V * 2);
  for (let t = 0; t < n; t++) {
    const b = pair[t];
    // corner rotation: line the logo triangle's corners up with the statue triangle's
    let best = 0, bestErr = Infinity;
    for (let r = 0; r < 3; r++) {
      let err = 0;
      for (let k = 0; k < 3; k++) {
        const ia = index[t * 3 + k] * 3, ib = b * 9 + ((k + r) % 3) * 3;
        for (let q = 0; q < 3; q++) {
          const e = (pos[ia + q] - ca[t * 3 + q]) - (LP[ib + q] - cb[b * 3 + q]);
          err += e * e;
        }
      }
      if (err < bestErr) { bestErr = err; best = r; }
    }
    for (let k = 0; k < 3; k++) {
      const vtx = t * 3 + k, i = index[t * 3 + k], ib = b * 9 + ((k + best) % 3) * 3;
      for (let q = 0; q < 3; q++) {
        aPos[vtx * 3 + q] = pos[i * 3 + q];
        aNor[vtx * 3 + q] = nor[i * 3 + q];
        aPosB[vtx * 3 + q] = LP[ib + q];
        aNormB[vtx * 3 + q] = LN[ib + q];
      }
      aUv[vtx * 2] = uv.getX(i); aUv[vtx * 2 + 1] = uv.getY(i);
      aParams[vtx * 2] = delay[t]; aParams[vtx * 2 + 1] = swirl[t];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(aNor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(aUv, 2));
  geo.setAttribute('aPosB', new THREE.BufferAttribute(aPosB, 3));
  geo.setAttribute('aNormB', new THREE.BufferAttribute(aNormB, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 2));

  const uniforms = {
    uMorph: { value: 0 },
    uDelayMax: { value: MORPH.delayMax },
    uCenter: { value: center.clone() },
    uSwirl: { value: MORPH.swirl },
    uLift: { value: MORPH.lift },
    uGold: { value: new THREE.Color(MORPH.gold) },
    uGoldRough: { value: MORPH.goldRoughness },
    uEnvGold: { value: 1 }, // set by the stage: the reflection boost where the surface is gold
  };

  // colour pass: the statue's own material, turning to gold per triangle
  const material = skinned.material.clone();
  material.onBeforeCompile = (shader) => {
    injectVertex(shader, uniforms, { normals: true });
    shader.fragmentShader = 'uniform vec3 uGold;\nuniform float uGoldRough;\nuniform float uEnvGold;\nvarying float vMorph;\n' + shader.fragmentShader
      // marble keeps the stage's faint reflections; where it has turned to gold they are strong
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment
        .replaceAll('envMapIntensity', '(envMapIntensity * mix(1.0, uEnvGold, vMorph))'))
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uGold, vMorph);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 1.0, vMorph);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, uGoldRough, vMorph);')
      // the statue's normal map belongs to the statue; the logo is smooth gold
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(mix(normal, nonPerturbedNormal, vMorph));');
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

  return {
    mesh,
    uniforms,
    triangles: n,
    ms: Math.round(performance.now() - t0),
    dispose() {
      mesh.removeFromParent();
      geo.dispose(); material.dispose(); depth.dispose(); silhouette.dispose();
    },
  };
}

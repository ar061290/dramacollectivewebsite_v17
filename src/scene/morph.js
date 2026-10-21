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
//
// The arithmetic (src/scene/morphCore.js) runs once, in a worker (src/scene/morphWorker.js): about
// a second and a half of work for 183k triangles, which used to hold the page's own thread, and the
// visitor's scrolling, for that long. The page's thread only gathers the job (the rig's arrays and
// its bone matrices at the end pose: a few milliseconds) and, when the soup comes back, wraps it in
// a geometry and the materials below. Where the worker cannot start, the same arithmetic runs here.
//
// At the very end (the stage's vector track) the logo goes flat before its vector stand-in takes
// over (src/scene/flat.js): its relief sinks into the plane of its front face and its light settles
// into the vector's own two colours, sweeping down from the top, so that when the vector appears it
// is already exactly what is on screen and nothing fades over anything.

import * as THREE from 'three';
import { PARTS, logoShapes } from './logo.js';
import { FLAT_HEAD, FLAT_FRAGMENT, flatUniforms } from './flat.js';
import { MORPH, buildAll } from './morphCore.js';

export { MORPH };

const smooth = (t) => t * t * (3 - 2 * t);
const window01 = ({ from, to }, t) => smooth(Math.min(1, Math.max(0, (t - from) / (to - from))));

/** How far the logo has grown from its place at her head (0) to its place in the ring (1), at morph `t`. */
export function growAt(t) {
  return window01(MORPH.grow, t);
}

/**
 * The bone matrices of a skinned mesh in the space of `space` (an ancestor), as the GPU skins with
 * them: M_k = space⁻¹ · bone_k · boneInverse_k · bindMatrix, 16 floats each.
 */
export function boneMatrices(skinned, space) {
  space.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const { bones, boneInverses } = skinned.skeleton;
  const M = new Float32Array(bones.length * 16);
  const m = new THREE.Matrix4();
  bones.forEach((b, k) => {
    m.multiplyMatrices(inv, b.matrixWorld).multiply(boneInverses[k]).multiply(skinned.bindMatrix);
    M.set(m.elements, k * 16);
  });
  return M;
}

/**
 * The job for the worker: the rig's arrays as plain typed arrays (copies, so they can be handed
 * over), the bone matrices at the pose the statue is in now, and the logo's inputs.
 * @param {THREE.SkinnedMesh} skinned
 * @param {THREE.Object3D} space   the turntable
 * @param {{ svgText: string, regions: object|null, center: number[], radius: number, maxTriangles: number, origin: number[] }} o
 */
export function morphJob(skinned, space, { svgText, regions, center, radius, maxTriangles, origin }) {
  const g = skinned.geometry;
  const n = g.attributes.position.count;
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    position[i * 3] = P.getX(i); position[i * 3 + 1] = P.getY(i); position[i * 3 + 2] = P.getZ(i);
    normal[i * 3] = N.getX(i); normal[i * 3 + 1] = N.getY(i); normal[i * 3 + 2] = N.getZ(i);
    uv[i * 2] = UV.getX(i); uv[i * 2 + 1] = UV.getY(i);
    for (let j = 0; j < 4; j++) { skinIndex[i * 4 + j] = SI.getComponent(i, j); skinWeight[i * 4 + j] = SW.getComponent(i, j); }
  }
  const index = new Uint32Array(g.index.array);
  return {
    // the SVG is parsed here (it needs the DOM); its shapes travel as plain data
    shapes: logoShapes(svgText), regions, center, radius, maxTriangles, origin,
    statue: { position, normal, uv, skinIndex, skinWeight, index },
    M: boneMatrices(skinned, space),
    boneNames: skinned.skeleton.bones.map((b) => b.name),
  };
}

/** The job's buffers, to hand over to the worker rather than copy. */
const jobTransferables = (job) => [job.statue.position, job.statue.normal, job.statue.uv, job.statue.skinIndex, job.statue.skinWeight, job.statue.index, job.M].map((a) => a.buffer);

/**
 * Run the job in a worker. Rejects if the worker cannot start or fails (the caller then runs
 * buildAll on the page's thread, which is what used to happen anyway).
 * @returns {Promise<object>} the soup (morphCore.buildAll's result)
 */
export function buildInWorker(job) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./morphWorker.js', import.meta.url), { type: 'module' });
    } catch (err) { reject(err); return; }
    const done = (fn) => (v) => { worker.terminate(); fn(v); };
    worker.onerror = done((e) => reject(new Error(e?.message || 'morph worker failed')));
    worker.onmessageerror = done(() => reject(new Error('morph worker: message could not be read')));
    worker.onmessage = done((e) => (e.data?.ok ? resolve(e.data.result) : reject(new Error(e.data?.error || 'morph worker failed'))));
    worker.postMessage(job, jobTransferables(job));
  });
}

/** The job on the page's own thread: the fallback. */
export function buildHere(job) {
  return buildAll(job);
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
 * Wrap the soup in a geometry and the materials: the morph mesh and its API.
 * @param {object} r  morphCore.buildAll's result
 * @param {object} o
 * @param {THREE.Material} o.material  the statue's own material (cloned)
 * @param {THREE.Object3D} o.space     the turntable: the morph mesh is its child
 * @param {THREE.Vector3} o.center     the turning axis' centre (for the swirl)
 */
export function assembleMorph(r, { material: statueMaterial, space, center, release = false }) {
  const t0 = performance.now();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(r.aPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(r.aNor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(r.aUv, 2));
  geo.setAttribute('aPosB', new THREE.BufferAttribute(r.aPosB, 3));
  geo.setAttribute('aNormB', new THREE.BufferAttribute(r.aNormB, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(r.aParams, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(r.aPart, 1));
  // `release` (the phone tier): the vertices let go once they are on the GPU, 40 MB the page held twice
  // over; a context lost and given back needs them again (refill). Its bounds first, which three.js
  // would otherwise work out from them on the first frame drawn
  const SOURCE = { position: 'aPos', normal: 'aNor', uv: 'aUv', aPosB: 'aPosB', aNormB: 'aNormB', aParams: 'aParams', aPart: 'aPart' };
  if (release) {
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    for (const a of Object.values(geo.attributes)) a.onUpload(function () { this.array = null; });
  }

  const fit = { at: new THREE.Vector3().fromArray(r.fit.at), scale: r.fit.scale, shift: r.fit.shift.map((s) => new THREE.Vector3().fromArray(s)) };
  const closeUp = new THREE.Box3(new THREE.Vector3().fromArray(r.closeUp.min), new THREE.Vector3().fromArray(r.closeUp.max));

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
  const material = statueMaterial.clone();
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
    triangles: r.total,
    parts: r.report,
    fit: { at: fit.at.toArray().map((x) => +x.toFixed(3)), scale: +fit.scale.toFixed(3), shift: Object.fromEntries(PARTS.map((name, p) => [name, fit.shift[p].toArray().slice(0, 2).map((x) => +x.toFixed(3))])) },
    // for the stage's close-up: what it frames, turntable space
    closeUp: { centre: closeUp.getCenter(new THREE.Vector3()), width: size.x, height: size.y },
    ms: r.ms + Math.round(performance.now() - t0),
    logoMs: r.logoMs,
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
    /** True once its vertices have gone to the GPU and been let go here (`release`). */
    get empty() { return geo.attributes.position.array === null; },
    /** Its vertices again (buildAll's result for the very same job), for a context given back. */
    refill(again) {
      for (const [name, a] of Object.entries(geo.attributes)) { a.array = again[SOURCE[name]]; a.needsUpdate = true; }
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose(); material.dispose(); depth.dispose(); silhouette.dispose();
    },
  };
}

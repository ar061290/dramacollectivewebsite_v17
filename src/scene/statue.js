// Loading and preparing the statue: glTF/GLB (Draco or meshopt compressed, or plain; skinned or
// not), with an STL fallback that gets a procedural white-marble material.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createProceduralMarble } from './marble.js';

// the Draco decoder (WebAssembly) is served with the site, from public/draco/ (copied from three's
// examples/jsm/libs/draco/gltf; keep it in step with the three version): under Vite, public/ is
// the site's root; run without a build, it is the folder itself
const DRACO_PATH = import.meta.env ? new URL('draco/', document.baseURI).href : new URL('../../public/draco/', import.meta.url).href;

export const STATUE_LAYER = 1; // the statue alone, for the constellation's silhouette mask

/** Load a statue. Resolves { object, kind: 'gltf' | 'stl', animations }. */
export async function loadStatue(url, { manager, onBytes, dracoPath = DRACO_PATH } = {}) {
  const ext = url.split(/[?#]/)[0].split('.').pop().toLowerCase();
  if (ext === 'stl') {
    let geometry = await new STLLoader(manager).loadAsync(url, onBytes);
    geometry.deleteAttribute('normal');
    geometry = mergeVertices(geometry, 1e-4);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    // STL has no up-axis convention; a standing figure is tallest along its up axis
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    if (size.z > size.y && size.z > size.x) geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingBox();
    const h = geometry.boundingBox.getSize(new THREE.Vector3()).y;
    const mesh = new THREE.Mesh(geometry, createProceduralMarble({ height: h }));
    mesh.name = 'StatueSTL';
    return { object: mesh, kind: 'stl', animations: [] };
  }
  const draco = new DRACOLoader(manager).setDecoderPath(dracoPath).setDecoderConfig({ type: 'wasm' });
  draco.preload(); // fetch and compile the decoder while the model downloads, not after
  const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync(url, onBytes);
    return { object: gltf.scene, kind: 'gltf', animations: gltf.animations };
  } finally {
    draco.dispose();
  }
}

/**
 * Normalise the statue: turn it by `yaw`, scale it to `height`, stand its base on y = 0 centred on
 * the footprint, and make the stone read as stone (metalness 0, roughness ~0.45, Meshy maps kept).
 * Returns { root, center, radius, height, averageColor }. The footprint sits on the vertical axis
 * x = z = 0, which the stage turns the statue about. `center` and `radius` describe a sphere centred
 * on that axis that contains every vertex at any turn (used to keep the statue clear of the ring).
 */
export function prepareStatue(object, { kind, height = 2, yaw = Math.PI, roughness = 0.45 } = {}) {
  const spin = new THREE.Group();
  spin.rotation.y = yaw;
  spin.add(object);
  const root = new THREE.Group();
  root.name = 'Statue';
  root.add(spin);

  // Every measure below walks every vertex as drawn (skinned), pass after pass, exactly as three's
  // Box3.setFromObject(root, true) and getVertexPosition do; only each pass's skinning reads each
  // bone's matrix once instead of once per vertex and influence (vertexReader), which was most of the
  // longest stretch of the page's thread between the model's decode and its first frame. (Skinning
  // once and re-using the vertices across the passes gave the same measures mathematically but not
  // to the last bit, and moved the statue's framing by a fraction of a pixel.)
  root.updateMatrixWorld(true);
  const box = boxOf(root);
  root.scale.setScalar(height / (box.max.y - box.min.y));
  root.updateMatrixWorld(true);
  boxOf(root, box);

  // centre on the plinth's footprint (lowest 4% of the model), not on the whole box
  const cut = box.min.y + 0.04 * (box.max.y - box.min.y);
  const base = new THREE.Box3();
  const v = new THREE.Vector3();
  forEachVertex(root, (p) => { if (p.y <= cut) base.expandByPoint(p); }, v);
  const foot = (base.isEmpty() ? box : base).getCenter(new THREE.Vector3());
  root.position.set(-foot.x, -box.min.y, -foot.z);
  root.updateMatrixWorld(true);

  // bounding sphere on the turning axis, at mid-height: turning about y keeps x² + z² per vertex,
  // so this sphere contains every vertex at any turn
  boxOf(root, box);
  const center = new THREE.Vector3(0, box.getCenter(v).y, 0);
  let radius = 0;
  forEachVertex(root, (p) => { radius = Math.max(radius, p.distanceTo(center)); }, v);

  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) o.frustumCulled = false; // its bounds are the rest pose's
    o.castShadow = true;
    o.receiveShadow = true;
    o.layers.enable(STATUE_LAYER);
    for (const m of [].concat(o.material)) {
      if (kind === 'gltf' && m.isMeshStandardMaterial) {
        m.metalness = 0;
        m.roughness = roughness;
      }
      if (m.isMeshStandardMaterial) m.envMapIntensity = 0.45;
    }
  });

  return { root, center, radius, height, averageColor: averageStoneColor(root) };
}

/**
 * A reader of a mesh's vertices as drawn: three's SkinnedMesh.getVertexPosition, step for step, except
 * that each bone's matrix (bone.matrixWorld x boneInverse) is made once when the reader is made rather
 * than again for every vertex and every influence. The bones must not move while the reader is used
 * (both callers read all the vertices in one go, after updateMatrixWorld). With ?debug it checks itself
 * against three's own on every vertex and says so in the console.
 */
const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);

function vertexReader(o) {
  if (!o.isSkinnedMesh) return (i, v) => o.getVertexPosition(i, v);
  const { bones, boneInverses } = o.skeleton;
  const bone = bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, boneInverses[k]));
  const { skinIndex, skinWeight } = o.geometry.attributes;
  const si = new THREE.Vector4(), sw = new THREE.Vector4(), base = new THREE.Vector3(), t = new THREE.Vector3();
  const read = (i, v) => {
    THREE.Mesh.prototype.getVertexPosition.call(o, i, v); // the position, morphs included, as three does
    si.fromBufferAttribute(skinIndex, i);
    sw.fromBufferAttribute(skinWeight, i);
    base.copy(v).applyMatrix4(o.bindMatrix);
    v.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(k);
      if (w !== 0) v.addScaledVector(t.copy(base).applyMatrix4(bone[si.getComponent(k)]), w);
    }
    return v.applyMatrix4(o.bindMatrixInverse);
  };
  if (DEBUG) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let differ = 0;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { read(i, a); o.getVertexPosition(i, b); if (!Object.is(a.x, b.x) || !Object.is(a.y, b.y) || !Object.is(a.z, b.z)) differ++; }
    console[differ ? 'warn' : 'info'](`statue vertex reader: ${differ ? differ + ' of ' + n + ' vertices differ from three\u2019s' : 'all ' + n + ' vertices identical to three\u2019s'}`);
  }
  return read;
}

/** What Box3.setFromObject(root, true) measures, vertex for vertex (the world matrices must be up to
 *  date, as they are wherever it is called). ?debug checks it against three's own. */
function boxOf(root, box = new THREE.Box3()) {
  box.makeEmpty();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.geometry.attributes.position.count;
    const read = vertexReader(o);
    for (let i = 0; i < n; i++) box.expandByPoint(read(i, v).applyMatrix4(o.matrixWorld));
  });
  if (DEBUG) {
    const own = new THREE.Box3().setFromObject(root, true);
    const same = own.min.toArray().concat(own.max.toArray()).every((x, i) => Object.is(x, box.min.toArray().concat(box.max.toArray())[i]));
    console[same ? 'info' : 'warn'](`statue bounds: ${same ? 'identical to Box3.setFromObject' : 'DIFFER from Box3.setFromObject'}`);
  }
  return box;
}

/** Every vertex in world space, as drawn (skinning applied for a skinned mesh). */
export function forEachVertex(root, fn, v = new THREE.Vector3()) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.geometry.attributes.position.count;
    const read = vertexReader(o);
    for (let i = 0; i < n; i++) fn(read(i, v).applyMatrix4(o.matrixWorld));
  });
}

/** Average base colour of the statue (texture x colour) in sRGB, to tint the ring to match. */
function averageStoneColor(root) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let r = 0, g = 0, b = 0, n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      const tint = m.color ? m.color.clone().convertLinearToSRGB() : new THREE.Color(1, 1, 1);
      if (m.map?.image) {
        try { ctx.drawImage(m.map.image, 0, 0, 32, 32); } catch { continue; }
        const d = ctx.getImageData(0, 0, 32, 32).data;
        let sr = 0, sg = 0, sb = 0, k = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 8 || d[i] + d[i + 1] + d[i + 2] < 24) continue; // unused atlas space
          sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; k++;
        }
        if (k) { r += (sr / k / 255) * tint.r; g += (sg / k / 255) * tint.g; b += (sb / k / 255) * tint.b; n++; }
      } else if (m.color) {
        r += tint.r; g += tint.g; b += tint.b; n++;
      }
    }
  });
  return n ? new THREE.Color().setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace) : null;
}

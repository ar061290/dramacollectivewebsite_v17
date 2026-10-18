// Prepare the theatre masks for the reading pages: assets/models/masks.glb
//
//   node tools/masks/build-masks.mjs <source.glb> [ratio=0.32] [error=0.0004] [normal=1024]
//
// (glTF-Transform 4, meshoptimizer, draco3dgltf and sharp must be installed where it runs:
//  npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer draco3dgltf)
//
// The source is the publication's model of the pair (Meshy, textured marble: tools/masks/source/
// masks-pair.glb): tragedy and comedy side by side in one mesh, open behind. This
//   1. unpacks it (dequantize; the node's transform and the textures' uv transform baked in),
//   2. splits it at the gap between them into two meshes, "tragedy" (the left one) and "comedy",
//      each centred on its own middle and scaled to a height of 1,
//   3. welds and simplifies each (meshoptimizer: `ratio` of the triangles, within `error`),
//   4. keeps the marble's colour (2048 px) and its normal map (`normal` px), drops the roughness map
//      (the stone's finish is set in code), all WebP,
//   5. Draco-compresses the geometry (the site's decoder: public/draco/).
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune, dedup, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const [src, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map((a) => a.split('=')));
const RATIO = Number(opts.ratio ?? 0.32);
const ERROR = Number(opts.error ?? 0.0004);
const NORMAL = Number(opts.normal ?? 1024);
const OUT = opts.out ?? join(HERE, '../../assets/models/masks.glb');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(src);
await doc.transform(dequantize());

const root = doc.getRoot();
const scene = root.listScenes()[0];
const srcNode = root.listNodes().find((n) => n.getMesh());
const srcPrim = srcNode.getMesh().listPrimitives()[0];
const material = srcPrim.getMaterial();
const M = srcNode.getWorldMatrix();

// the uv transform the packer put on the textures (the same on each): baked into the uvs
let uvScale = [1, 1], uvOffset = [0, 0];
for (const info of [material.getBaseColorTextureInfo(), material.getNormalTextureInfo(), material.getMetallicRoughnessTextureInfo()]) {
  const t = info?.getExtension('KHR_texture_transform');
  if (t) { uvScale = t.getScale(); uvOffset = t.getOffset(); info.setExtension('KHR_texture_transform', null); }
}

const P = srcPrim.getAttribute('POSITION').getArray();
const N = srcPrim.getAttribute('NORMAL').getArray();
const T = srcPrim.getAttribute('TEXCOORD_0').getArray();
const I = srcPrim.getIndices().getArray();
const nv = P.length / 3;
// world positions (the node's matrix) and normals (its rotation and scale; uniform here)
const W = new Float32Array(P.length), WN = new Float32Array(N.length);
for (let v = 0; v < nv; v++) {
  const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
  W[3 * v] = M[0] * x + M[4] * y + M[8] * z + M[12];
  W[3 * v + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
  W[3 * v + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
  const a = N[3 * v], b = N[3 * v + 1], c = N[3 * v + 2];
  let nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c;
  const l = Math.hypot(nx, ny, nz) || 1;
  WN[3 * v] = nx / l; WN[3 * v + 1] = ny / l; WN[3 * v + 2] = nz / l;
}

// split at the gap: each triangle goes with the side its middle is on
let minX = Infinity, maxX = -Infinity;
for (let v = 0; v < nv; v++) { minX = Math.min(minX, W[3 * v]); maxX = Math.max(maxX, W[3 * v]); }
const mid = (minX + maxX) / 2;
const buffer = root.listBuffers()[0];
const out = new Document();
for (const [name, left] of [['tragedy', true], ['comedy', false]]) {
  const remap = new Int32Array(nv).fill(-1);
  const tri = [];
  for (let t = 0; t < I.length; t += 3) {
    const cx = (W[3 * I[t]] + W[3 * I[t + 1]] + W[3 * I[t + 2]]) / 3;
    if ((cx < mid) === left) tri.push(I[t], I[t + 1], I[t + 2]);
  }
  const used = [];
  for (const v of tri) if (remap[v] < 0) { remap[v] = used.length; used.push(v); }
  // its middle and height
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of used) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], W[3 * v + k]); hi[k] = Math.max(hi[k], W[3 * v + k]); }
  const c = lo.map((a, k) => (a + hi[k]) / 2);
  const s = 1 / (hi[1] - lo[1]);
  const pos = new Float32Array(used.length * 3), nrm = new Float32Array(used.length * 3), uv = new Float32Array(used.length * 2);
  used.forEach((v, i) => {
    for (let k = 0; k < 3; k++) { pos[3 * i + k] = (W[3 * v + k] - c[k]) * s; nrm[3 * i + k] = WN[3 * v + k]; }
    uv[2 * i] = T[2 * v] * uvScale[0] + uvOffset[0];
    uv[2 * i + 1] = T[2 * v + 1] * uvScale[1] + uvOffset[1];
  });
  const idx = new Uint32Array(tri.map((v) => remap[v]));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer))
    .setMaterial(material);
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  scene.addChild(node);
  console.log(`${name}: ${idx.length / 3} triangles, ${used.length} vertices, size ${(hi[0] - lo[0]) * s} x 1 x ${(hi[2] - lo[2]) * s}`);
}
out.dispose?.();
srcNode.dispose();

// the finish is set in code: no roughness map
material.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.6);
if (!root.listTextures().some((t) => t.listParents().some((p) => p !== root))) { /* (pruned below) */ }

await doc.transform(
  prune(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, resize: [NORMAL, NORMAL], quality: 88 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, quality: 86 }),
  prune(),
  dedup(),
  draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
);
for (const mesh of root.listMeshes()) {
  const p = mesh.listPrimitives()[0];
  console.log(`${mesh.getName()}: ${p.getIndices().getCount() / 3} triangles after simplifying`);
}
await io.write(OUT, doc);
const { statSync } = await import('node:fs');
console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024).toFixed(0)} KB)`);

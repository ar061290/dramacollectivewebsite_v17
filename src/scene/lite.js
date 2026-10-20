// The lite tier's textures (README: Tiers): on a device short of memory or cores, a picture larger than
// 1024 pixels a side is drawn from a copy half its size or less (a quarter of the GPU memory: a
// 2048-pixel map with its mipmaps is 21 MB, at 1024 5 MB), made in the browser before the picture is
// first uploaded. Elsewhere nothing changes.
import { liteTier } from '../util/env.js';

const MAX = 1024;
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap',
  'specularMap', 'specularColorMap', 'specularIntensityMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'anisotropyMap', 'lightMap', 'matcap', 'gradientMap'];

/** Shrink one texture's picture to at most MAX a side (lite tier only). Resolves when done (or left as it was). */
export async function liteTexture(texture, max = MAX) {
  if (!liteTier() || !texture?.isTexture || texture.isDataTexture || texture.isCompressedTexture || texture.isRenderTargetTexture) return;
  const img = texture.image;
  const w = img?.width, h = img?.height;
  if (!w || !h || Math.max(w, h) <= max || typeof createImageBitmap !== 'function') return;
  const s = max / Math.max(w, h);
  try {
    // an <img> is turned the way the upload would have turned it (an ImageBitmap is uploaded as it is,
    // whatever flipY says); a decoded ImageBitmap (glTF's) is kept the way it is
    const flip = !(img instanceof ImageBitmap) && texture.flipY;
    const small = await createImageBitmap(img, {
      resizeWidth: Math.max(1, Math.round(w * s)), resizeHeight: Math.max(1, Math.round(h * s)), resizeQuality: 'high',
      imageOrientation: flip ? 'flipY' : 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
    });
    if (img instanceof ImageBitmap) img.close();
    texture.image = small;
    texture.flipY = false;
    texture.needsUpdate = true;
  } catch {
    /* the browser could not: the full size stays */
  }
}

/** Shrink every texture an object's materials use (lite tier only). */
export async function liteTextures(root) {
  if (!liteTier() || !root) return;
  const seen = new Set();
  const jobs = [];
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) for (const k of MAPS) {
      const t = m[k];
      if (t && !seen.has(t)) { seen.add(t); jobs.push(liteTexture(t)); }
    }
  });
  await Promise.all(jobs);
}

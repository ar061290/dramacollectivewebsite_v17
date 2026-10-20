// The lite tier's textures (README: Tiers): on a device short of memory or cores, a picture larger than
// 1024 pixels a side is drawn from a copy half its size or less (a quarter of the GPU memory: a
// 2048-pixel map with its mipmaps is 21 MB, at 1024 5 MB), made in the browser before the picture is
// first uploaded. Elsewhere nothing changes.
// A copy of an ImageBitmap (glTF's pictures, in Chromium) is made by the browser on the thread that asks
// for it, in one piece: on the page's thread, about a third of a second for each of a statue's maps on a
// mid-range phone, the page frozen meanwhile. So it is asked for in a worker (lite.worker.js): the
// picture is handed over (transferred, not copied), the worker makes the same copy with the same options,
// and hands it back. Where a worker cannot start, or the picture is an <img>, it is made here, as before.
import { liteTier } from '../util/env.js';

const MAX = 1024;
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap',
  'specularMap', 'specularColorMap', 'specularIntensityMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'anisotropyMap', 'lightMap', 'matcap', 'gradientMap'];

// the worker, started for the first picture to shrink: a promise of it once it has said it is ready (of
// null if it cannot start: nothing has been handed to it then, so the copies are made here instead)
let ready = null;
let seq = 0;
const waiting = new Map(); // a picture's job -> what to do with what comes back

function worker() {
  ready ??= new Promise((resolve) => {
    let w;
    try {
      w = new Worker(new URL('./lite.worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(null);
      return;
    }
    w.onmessage = ({ data }) => {
      if (data.ready) { resolve(w); return; }
      const done = waiting.get(data.id);
      waiting.delete(data.id);
      done?.(data);
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      resolve(null);
      // (a picture handed over and not come back is lost: its texture is not used, its owner's load fails)
      for (const done of waiting.values()) done({ bitmap: null, small: false });
      waiting.clear();
    };
  });
  return ready;
}

/** The copy of `img` made with `options`: { image, small } (`image` the copy, or the picture as it is if none could be made; null if lost). */
async function copyOf(img, options) {
  const w = img instanceof ImageBitmap ? await worker() : null;
  if (w) {
    return new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, ({ bitmap, small }) => resolve({ image: bitmap, small }));
      w.postMessage({ id, bitmap: img, options }, [img]);
    });
  }
  try {
    const small = await createImageBitmap(img, options);
    if (img instanceof ImageBitmap) img.close();
    return { image: small, small: true };
  } catch {
    return { image: img, small: false }; // the browser could not: the full size stays
  }
}

/** Shrink one texture's picture to at most MAX a side (lite tier only); the others drawn from the same picture follow. Resolves when done (or left as it was). */
export async function liteTexture(texture, max = MAX, sharing = []) {
  if (!liteTier() || !texture?.isTexture || texture.isDataTexture || texture.isCompressedTexture || texture.isRenderTargetTexture) return;
  const img = texture.image;
  const w = img?.width, h = img?.height;
  if (!w || !h || Math.max(w, h) <= max || typeof createImageBitmap !== 'function') return;
  const s = max / Math.max(w, h);
  // an <img> is turned the way the upload would have turned it (an ImageBitmap is uploaded as it is,
  // whatever flipY says); a decoded ImageBitmap (glTF's) is kept the way it is
  const flip = !(img instanceof ImageBitmap) && texture.flipY;
  const { image, small } = await copyOf(img, {
    resizeWidth: Math.max(1, Math.round(w * s)), resizeHeight: Math.max(1, Math.round(h * s)), resizeQuality: 'high',
    imageOrientation: flip ? 'flipY' : 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  if (!image) throw new Error('A texture\'s picture was lost while it was being shrunk.');
  if (image === img) return;
  for (const t of [texture, ...sharing]) {
    t.image = image;
    if (small) t.flipY = false;
    t.needsUpdate = true;
  }
}

/** Shrink every texture an object's materials use (lite tier only). */
export async function liteTextures(root) {
  if (!liteTier() || !root) return;
  // one job a picture (two textures may be drawn from the same one: it is handed over once)
  const byPicture = new Map();
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) for (const k of MAPS) {
      const t = m[k];
      if (!t?.isTexture) continue;
      const key = t.image ?? t;
      const list = byPicture.get(key) ?? [];
      if (!list.includes(t)) list.push(t);
      byPicture.set(key, list);
    }
  });
  await Promise.all([...byPicture.values()].map(([first, ...rest]) => liteTexture(first, MAX, rest)));
}

// The home ring's stone matcaps (src/scene/ringStone.js): a lit grey sphere, worked out pixel by pixel. Pure (no
// three.js), so that a worker can make them (stoneMatcap.worker.js) by the very same arithmetic, off the page's
// thread while the statue downloads; the page makes them itself where a worker cannot start.

export const NIGHT = { ambient: 0.035, diffuse: 0.78, spec: 0.16 };
export const DAY = { ambient: 0.34, diffuse: 0.6, spec: 0.08 };

/** three's Vector3.normalize, step for step (its length, then a multiply by its reciprocal). */
function unit(x, y, z) {
  const s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
  return [x * s, y * s, z * s];
}

/** The matcap's pixels, RGBA, `size` square. */
export function stoneMatcapPixels(size = 256, { ambient = 0.035, diffuse = 0.78, spec = 0.16 } = {}) {
  const data = new Uint8ClampedArray(size * size * 4);
  const [Lx, Ly, Lz] = unit(-0.55, 0.6, 0.58);
  const [Hx, Hy, Hz] = unit(Lx + 0, Ly + 0, Lz + 1);
  const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = 1 - (y + 0.5) / size * 2;
      const r2 = nx * nx + ny * ny;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(r2, 1)));
      const ndl = Math.max(0, (nx * Lx + ny * Ly + nz * Lz + 0.12) / 1.12);
      const ndh = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
      const rim = Math.pow(1 - nz, 3) * 0.06;
      const v = Math.min(1, ambient + diffuse * ndl + spec * Math.pow(ndh, 36) + rim);
      const s = Math.round(toSRGB(v) * 255);
      const i = (y * size + x) * 4;
      data[i] = s; data[i + 1] = s; data[i + 2] = s; data[i + 3] = 255;
    }
  }
  return data;
}

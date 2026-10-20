// The About lexicon's distance fields (src/sections/lexicon.js): for each of the five words, the signed
// distance to its outlines on a grid of font units, and a softened copy, from which the morph between two
// words draws its contours. Built once a visit: in a worker where the browser has module workers
// (src/sections/lexiconFields.worker.js), the very same code on the very same data; else by the page in
// its idle moments, and on the spot if the scroll gets to a word first.
import TYPE from '../../assets/type/about-words.js';

export const BAND = 120; // distances kept either side of an outline (font units)
export const GRID = 8; // the fields' grid (font units)
const FLAT = 10; // curves are followed in straight steps about this long (font units)
const SOFT = 28; // and how far it softens there (a blurred copy of each field; a gaussian's sigma), so the melt is round, not ragged
export const WORDS = Object.keys(TYPE.words);

/** A glyph's outlines as closed polygons [x0, y0, x1, y1, ...] (the font's curves followed in short steps). */
function polygons(d) {
  const tok = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const out = [];
  let cur = null, x = 0, y = 0, cmd = '';
  for (let i = 0; i < tok.length;) {
    const t = tok[i];
    if (t === 'M' || t === 'L' || t === 'C' || t === 'Z') { cmd = t; i++; continue; }
    if (cmd === 'M') { x = +tok[i]; y = +tok[i + 1]; i += 2; cur = [x, y]; out.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { x = +tok[i]; y = +tok[i + 1]; i += 2; cur.push(x, y); }
    else if (cmd === 'C') {
      const x1 = +tok[i], y1 = +tok[i + 1], x2 = +tok[i + 2], y2 = +tok[i + 3], x3 = +tok[i + 4], y3 = +tok[i + 5];
      i += 6;
      const n = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)) / FLAT));
      for (let k = 1; k <= n; k++) {
        const s = k / n, u = 1 - s, a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, e = s * s * s;
        cur.push(a * x + b * x1 + c * x2 + e * x3, a * y + b * y1 + c * y2 + e * y3);
      }
      x = x3; y = y3;
    } else i++;
  }
  return out;
}

// every field has the same rows, so a row is found once for both words of a morph
export let TOP = Infinity, BOTTOM = -Infinity;
for (const w of WORDS) { const [, y, , h] = TYPE.words[w].box; TOP = Math.min(TOP, y); BOTTOM = Math.max(BOTTOM, y + h); }
export const Y0 = Math.floor(TOP - BAND - GRID), ROWS = Math.ceil((BOTTOM - TOP + 2 * (BAND + GRID)) / GRID) + 1;

// A word's field is built in small pieces against a deadline, so the work fits the page's idle
// moments however slow the machine is (or however cold the script engine is the first time).
export const fields = []; // per word, once built: { x0, nx, d (the field), b (its softened copy) }
const builds = [];
/** Work on word i's field until the clock (performance.now) passes `until` (Infinity: to the end). */
export function buildField(i, until) {
  if (fields[i]) return;
  let b = builds[i];
  if (!b) {
    const word = TYPE.words[WORDS[i]];
    const [bx, , bw] = word.box;
    const x0 = Math.floor(bx - BAND - GRID), nx = Math.ceil((bw + 2 * (BAND + GRID)) / GRID) + 1;
    b = builds[i] = { x0, nx, d: new Float32Array(nx * ROWS).fill(BAND * BAND), polys: word.glyphs.flatMap(polygons), p: 0, e: 0, row: 0, pass: 0 };
  }
  const { x0, nx, d, polys } = b;
  // first the squared distance to each edge, over the grid points near it (the rest stay at the band)
  for (; b.p < polys.length; b.p++, b.e = 0) {
    const p = polys[b.p], n = p.length;
    for (; b.e < n; b.e += 2) {
      const ax = p[b.e], ay = p[b.e + 1], ex = p[(b.e + 2) % n] - ax, ey = p[(b.e + 3) % n] - ay, l2 = ex * ex + ey * ey;
      if (l2) {
        const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - BAND - x0) / GRID)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, ax + ex) + BAND - x0) / GRID));
        const j0 = Math.max(0, Math.floor((Math.min(ay, ay + ey) - BAND - Y0) / GRID)), j1 = Math.min(ROWS - 1, Math.ceil((Math.max(ay, ay + ey) + BAND - Y0) / GRID));
        for (let j = j0; j <= j1; j++) {
          const py = Y0 + j * GRID - ay, row = j * nx;
          for (let k = i0; k <= i1; k++) {
            const px = x0 + k * GRID - ax;
            let t = (px * ex + py * ey) / l2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = t * ex - px, qy = t * ey - py, q = qx * qx + qy * qy;
            if (q < d[row + k]) d[row + k] = q;
          }
        }
      }
      if ((b.e & 14) === 14 && performance.now() > until) { b.e += 2; return; }
    }
  }
  // then, a row at a time, the distance itself, counted negative inside the ink (non-zero
  // winding, as the font is filled)
  const xs = [], order = [];
  for (; b.row < ROWS; b.row++) {
    const j = b.row, py = Y0 + j * GRID;
    for (let k = j * nx; k < (j + 1) * nx; k++) d[k] = Math.sqrt(d[k]);
    xs.length = 0; order.length = 0;
    for (const p of polys) {
      const n = p.length;
      for (let e = 0; e < n; e += 2) {
        const ay = p[e + 1], by = p[(e + 3) % n];
        if ((ay <= py) === (by <= py)) continue;
        const ax = p[e], bx = p[(e + 2) % n];
        order.push(xs.length);
        xs.push(ax + ((py - ay) * (bx - ax)) / (by - ay), by > ay ? 1 : -1);
      }
    }
    order.sort((p, q) => xs[p] - xs[q]);
    let wind = 0;
    for (let o = 0; o < order.length - 1; o++) {
      wind += xs[order[o] + 1];
      if (!wind) continue;
      const k0 = Math.max(0, Math.ceil((xs[order[o]] - x0) / GRID)), k1 = Math.min(nx - 1, Math.floor((xs[order[o + 1]] - x0) / GRID));
      for (let k = k0; k <= k1; k++) d[j * nx + k] = -d[j * nx + k];
    }
    if (performance.now() > until) { b.row++; return; }
  }
  // last the softened copy: three passes of a box blur each way (a row or a column at a time),
  // close to a gaussian of SOFT
  const r = Math.max(1, Math.round((Math.sqrt(4 * (SOFT / GRID) ** 2 + 1) - 1) / 2)), span = 2 * r + 1;
  if (!b.soft) { b.soft = Float32Array.from(d); b.tmp = new Float32Array(d.length); b.line = 0; }
  const { soft, tmp } = b;
  for (; b.pass < 6; b.pass++, b.line = 0) {
    const across = b.pass % 2 === 0;
    for (; b.line < (across ? ROWS : nx); b.line++) {
      if (across) {
        const row = b.line * nx;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += soft[row + Math.min(nx - 1, Math.max(0, k))];
        for (let k = 0; k < nx; k++) { tmp[row + k] = acc / span; acc += soft[row + Math.min(nx - 1, k + r + 1)] - soft[row + Math.max(0, k - r)]; }
      } else {
        const k = b.line;
        let acc = 0;
        for (let j = -r; j <= r; j++) acc += tmp[Math.min(ROWS - 1, Math.max(0, j)) * nx + k];
        for (let j = 0; j < ROWS; j++) { soft[j * nx + k] = acc / span; acc += tmp[Math.min(ROWS - 1, j + r + 1) * nx + k] - tmp[Math.max(0, j - r) * nx + k]; }
      }
      if ((b.line & 15) === 15 && performance.now() > until) { b.line++; return; }
    }
  }
  fields[i] = { x0, nx, d, b: soft };
  builds[i] = null;
}
export const fieldOf = (i) => { buildField(i, Infinity); return fields[i]; };

/** A field built elsewhere (the worker), taken unless the page has built it already. */
export function takeField(i, field) {
  if (fields[i]) return;
  fields[i] = field;
  builds[i] = null;
}

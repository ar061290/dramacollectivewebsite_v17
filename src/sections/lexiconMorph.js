// The About lexicon's morph (src/sections/lexicon.js): the shape between two words at a point of the
// wave, as SVG path data, from the words' distance fields (src/sections/lexiconFields.js). Pure: the
// page draws with it, and on the lite tier a worker does (src/sections/lexiconMorph.worker.js), the
// very same code on the very same data.
import TYPE from '../../assets/type/about-words.js';
import { BAND, GRID, Y0, ROWS, TOP, BOTTOM, WORDS, fieldOf } from './lexiconFields.js';

// ---- the morph ----
// Between two words the shape is drawn from distance fields: for each word, how far each point of
// a grid lies from its outline (counted negative inside the ink). A mix of two such fields is again
// one field, and where it crosses zero is always a set of closed outlines that never cross
// themselves or one another; so the shape between two words is one shape, and cannot tear into
// slivers, cancel into odd holes or show one glyph stacked on another, as point-by-point outline
// morphs do between unlike letters. The glyphs of one word are lined up with the next word's in
// runs (TYPE.morphs), so each letter only ever melts into the one that takes its place; a wave runs
// along the word, so only a letter or two is between shapes at once while the rest read as letters;
// and a letter swells as the wave reaches it, which holds its thin strokes together while it
// changes, then settles to the new letter's own weight.
export const SWELL = 10; // the whole word's swell while it changes, so Raung's hairlines (about 8 units) hold on the grid
export const MELT = 30; // a letter's further swell as the wave passes it
const FRONT = 0.35; // the wave's width, as a share of the word
const SLIDE = 1; // the letters' slide to their new places runs wider than the wave, so no glyph is stretched far
const BLEND = 0.4; // the share of the wave in which a letter's shape passes from one word to the next
export const EDGE = 0.08; // at each end of a morph the font's own outline swells (or settles) before the fields take over
const ISLAND = 9000; // a loose drop of ink smaller than this (square font units, a few pixels across) is left out

export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sweepAt = (s, u, width) => smooth((s * (1 + width) - u) / width);

// (the words' fields: src/sections/lexiconFields.js)

// The runs, as places along the two words that meet: the edges of each run's glyphs (half way
// between neighbouring glyphs), and how far along the first word each one is (0..1).
const CUTS = WORDS.map((w) => {
  const ink = TYPE.words[w].ink;
  const c = [ink[0][0]];
  for (let i = 0; i < ink.length - 1; i++) c.push((ink[i][1] + ink[i + 1][0]) / 2);
  c.push(ink[ink.length - 1][1]);
  return c;
});
const KNOTS = TYPE.morphs.map((runs, k) => {
  const xa = [], xb = [];
  let ia = 0, ib = 0;
  for (const [na, nb] of runs) { xa.push(CUTS[k][ia]); xb.push(CUTS[k + 1][ib]); ia += na; ib += nb; }
  xa.push(CUTS[k][ia]); xb.push(CUTS[k + 1][ib]);
  return { xa, xb, ua: xa.map((x) => (x - xa[0]) / (xa[xa.length - 1] - xa[0])) };
});
/**
 * Where the run edges stand at s (0..1) through the morph from word k: each slides as the wave
 * passes. The wave moves one end of the word before the other, so the whole shape also drifts by
 * half the difference: its middle stays between the two words' middles, centred in the ring as
 * the words at rest are (and no wider than they need the type to be).
 */
export const placed = (k, s) => {
  const { xa, xb, ua } = KNOTS[k], n = xa.length - 1;
  const shift = (-(sweepAt(s, 0, SLIDE) - sweepAt(s, 1, SLIDE)) * (xb[0] - xa[0] - (xb[n] - xa[n]))) / 4;
  const x = xa.map((a, i) => a + (xb[i] - a) * sweepAt(s, ua[i], SLIDE) + shift);
  // the edges keep their order (they do for these runs, by 330 units at the closest; a guard for
  // runs set differently in tools/type/words.mjs, where a fold would draw a glyph twice)
  for (let i = 1; i <= n; i++) x[i] = Math.max(x[i], x[i - 1] + 1);
  return x;
};

let grid = new Float32Array(0), la = new Int32Array(0), lb = new Int32Array(0), seen = new Uint8Array(0), touched = new Int32Array(0);
const rowAt = [], rowT = [], kept = new Float64Array(512);

/** The outline where the frame grid (nx by ny points, cs apart, from ox, oy) crosses zero, as path data. */
function contour(nx, ny, ox, oy, cs) {
  const f = grid, H = ny * (nx - 1), E = H + (ny - 1) * nx;
  if (la.length < E) { la = new Int32Array(E).fill(-1); lb = new Int32Array(E).fill(-1); seen = new Uint8Array(E); touched = new Int32Array(E); }
  // marching squares: each cell the outline crosses joins two of its edges (an edge is a number)
  let nt = 0;
  const link = (p, q) => {
    if (la[p] < 0) { la[p] = q; touched[nt++] = p; } else lb[p] = q;
    if (la[q] < 0) { la[q] = p; touched[nt++] = q; } else lb[q] = p;
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const a = f[k], b = f[k + 1], c = f[k + nx + 1], d = f[k + nx];
      const code = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const up = j * (nx - 1) + i, down = up + nx - 1, left = H + k, right = left + 1;
      switch (code) {
        case 1: case 14: link(left, down); break;
        case 2: case 13: link(down, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(up, right); break;
        case 6: case 9: link(up, down); break;
        case 7: case 8: link(left, up); break;
        // the two saddles: the middle of the cell decides which corners join
        case 5: if (a + b + c + d < 0) { link(left, up); link(down, right); } else { link(up, right); link(left, down); } break;
        default: if (a + b + c + d < 0) { link(up, right); link(left, down); } else { link(left, up); link(down, right); }
      }
    }
  }
  // walk each loop round, keeping a point only where the line from the last one kept would stray
  // from the points passed over (a long straight stem needs two points, not fifty)
  const tol = cs * 0.25, loops = [];
  for (let s0 = 0; s0 < nt; s0++) {
    const s = touched[s0];
    if (seen[s]) continue;
    let prev = -1, cur = s, n = 0, area = 0, fx = 0, fy = 0, px = 0, py = 0, lx = 0, ly = 0, nk = 0;
    const pts = [];
    do {
      seen[cur] = 1;
      let x, y;
      if (cur < H) { const j = (cur / (nx - 1)) | 0, i = cur - j * (nx - 1), p = j * nx + i; x = ox + (i + f[p] / (f[p] - f[p + 1])) * cs; y = oy + j * cs; }
      else { const p = cur - H, j = (p / nx) | 0, i = p - j * nx; x = ox + i * cs; y = oy + (j + f[p] / (f[p] - f[p + nx])) * cs; }
      if (!n) { fx = px = lx = x; fy = py = ly = y; pts.push(Math.round(x), Math.round(y)); }
      else {
        area += px * y - x * py; px = x; py = y;
        let keep = nk >= 255;
        if (!keep && nk) {
          const ux = x - lx, uy = y - ly, len = Math.hypot(ux, uy) || 1;
          for (let q = 0; q < 2 * nk; q += 2) if (Math.abs((kept[q] - lx) * uy - (kept[q + 1] - ly) * ux) > tol * len) { keep = true; break; }
        }
        if (keep) { lx = kept[2 * nk - 2]; ly = kept[2 * nk - 1]; pts.push(Math.round(lx), Math.round(ly)); nk = 0; }
        kept[2 * nk] = x; kept[2 * nk + 1] = y; nk++;
      }
      n++;
      const next = la[cur] !== prev ? la[cur] : lb[cur];
      prev = cur; cur = next;
    } while (cur !== s && cur >= 0 && !seen[cur]);
    if (nk) pts.push(Math.round(kept[2 * nk - 2]), Math.round(kept[2 * nk - 1]));
    area = Math.abs(area + px * fy - fx * py) / 2;
    // specks the grid itself makes, under a few pixels, go
    if (area >= (cs * 2.5) ** 2) loops.push({ pts, area });
  }
  for (let k = 0; k < nt; k++) { const e = touched[k]; la[e] = -1; lb[e] = -1; seen[e] = 0; }
  // a small loop inside an even number of others is a loose drop of ink (one inside an odd number
  // is a hole, which is the start or the end of a letter's counter, and stays)
  const inside = (p, x, y) => {
    let c = false;
    for (let k = 0, m = p.length; k < m; k += 2) {
      const ax = p[k], ay = p[k + 1], bx = p[(k + 2) % m], by = p[(k + 3) % m];
      if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) c = !c;
    }
    return c;
  };
  let d = '';
  for (const l of loops) {
    if (l.area < ISLAND && loops.reduce((n, o) => n + (o !== l && inside(o.pts, l.pts[0] + 0.25, l.pts[1] + 0.25) ? 1 : 0), 0) % 2 === 0) continue;
    d += `M${l.pts.join(' ')}Z`;
  }
  return d;
}

/** The shape between word k and word k + 1, s (0..1) along the wave, sampled every cs font units. */
export function between(k, s, cs) {
  const A = fieldOf(k), B = fieldOf(k + 1), { xa, xb, ua } = KNOTS[k];
  const n = xa.length, xt = placed(k, s);
  const pad = SWELL + MELT + 2 * cs;
  const ox = xt[0] - pad, oy = TOP - pad;
  const nx = Math.ceil((xt[n - 1] + pad - ox) / cs) + 1, ny = Math.ceil((BOTTOM + pad - oy) / cs) + 1;
  if (grid.length < nx * ny) grid = new Float32Array(Math.ceil(nx * ny * 1.25));
  for (let j = 0; j < ny; j++) { const g = (oy + j * cs - Y0) / GRID; rowAt[j] = Math.floor(g); rowT[j] = g - rowAt[j]; }
  const Ad = A.d, As = A.b, Bd = B.d, Bs = B.b, anx = A.nx, bnx = B.nx, f = grid;
  let seg = 0;
  for (let i = 0; i < nx; i++) {
    // this column's place in each word: between the same two run edges, the same share across
    const X = ox + i * cs;
    while (seg < n - 2 && X > xt[seg + 1]) seg++;
    let XA, XB, u;
    if (X <= xt[0]) { XA = xa[0] + X - xt[0]; XB = xb[0] + X - xt[0]; u = 0; }
    else if (X >= xt[n - 1]) { XA = xa[n - 1] + X - xt[n - 1]; XB = xb[n - 1] + X - xt[n - 1]; u = 1; }
    else {
      const t = (X - xt[seg]) / (xt[seg + 1] - xt[seg]);
      XA = xa[seg] + (xa[seg + 1] - xa[seg]) * t; XB = xb[seg] + (xb[seg + 1] - xb[seg]) * t; u = ua[seg] + (ua[seg + 1] - ua[seg]) * t;
    }
    // where the wave stands here: how far through (w), the shape's share of the next word (ws),
    // the swell, and the softening
    const w = sweepAt(s, u, FRONT);
    const ws = smooth((w - 0.5) / BLEND + 0.5);
    const swell = SWELL + MELT * Math.sqrt(4 * w * (1 - w));
    const sf = Math.sin(Math.PI * w);
    const ga = (XA - A.x0) / GRID, ia = Math.floor(ga), ta = ga - ia;
    const gb = (XB - B.x0) / GRID, ib = Math.floor(gb), tb = gb - ib;
    const useA = ws < 1 && ia >= 0 && ia < anx - 1, useB = ws > 0 && ib >= 0 && ib < bnx - 1;
    for (let j = 0; j < ny; j++) {
      const r = rowAt[j], t = rowT[j];
      let va = BAND, vb = BAND;
      if (r >= 0 && r < ROWS - 1) {
        if (useA) {
          const q = r * anx + ia;
          const a0 = Ad[q] + (Ad[q + 1] - Ad[q]) * ta, a1 = Ad[q + anx] + (Ad[q + anx + 1] - Ad[q + anx]) * ta;
          va = a0 + (a1 - a0) * t;
          if (sf > 0.01) {
            const s0 = As[q] + (As[q + 1] - As[q]) * ta, s1 = As[q + anx] + (As[q + anx + 1] - As[q + anx]) * ta;
            va += (s0 + (s1 - s0) * t - va) * sf;
          }
        }
        if (useB) {
          const q = r * bnx + ib;
          const b0 = Bd[q] + (Bd[q + 1] - Bd[q]) * tb, b1 = Bd[q + bnx] + (Bd[q + bnx + 1] - Bd[q + bnx]) * tb;
          vb = b0 + (b1 - b0) * t;
          if (sf > 0.01) {
            const s0 = Bs[q] + (Bs[q + 1] - Bs[q]) * tb, s1 = Bs[q + bnx] + (Bs[q + bnx + 1] - Bs[q + bnx]) * tb;
            vb += (s0 + (s1 - s0) * t - vb) * sf;
          }
        }
      }
      f[j * nx + i] = va + (vb - va) * ws - swell;
    }
  }
  return contour(nx, ny, ox, oy, cs);
}

// The vector word morph, as a module any page can use: words drawn in Raung as the font's own
// outlines (data made at build time by tools/type/*.mjs, e.g. assets/type/publication-heads.js),
// each turning into the next as one shape. A wave runs along the word, and as it passes, each letter
// swells, melts into the letter of the next word that takes its place and settles again. It is the
// About us page's morph (src/sections/lexicon.js, which keeps its own copy, untouched), taken out of
// that page's ring and scroll so a heading can play it in time.
//
// The data: { unitsPerEm, capHeight, align?, words: { [text]: { glyphs, ink, width, box } },
// morphs: [[[from, to], ...], ...], keep?: [[bool, ...], ...] }, as tools/type/words.mjs and
// tools/type/heads.mjs write it. `align: 'start'` (left-aligned words) keeps the left edge in place
// through a morph; otherwise the words are centred and the middle stays put.
//
// Between two words the shape is drawn from distance fields: for each word, how far each point of
// a grid lies from its outline (counted negative inside the ink). A mix of two such fields is again
// one field, and where it crosses zero is always a set of closed outlines that never cross
// themselves or one another; so the shape between two words is one shape, and cannot tear into
// slivers, cancel into odd holes or show one glyph stacked on another, as point-by-point outline
// morphs do between unlike letters. The glyphs of one word are lined up with the next word's in
// runs (morphs), so each letter only ever melts into the one that takes its place; a wave runs
// along the word, so only a letter or two is between shapes at once while the rest read as letters;
// and a letter swells as the wave reaches it, which holds its thin strokes together while it
// changes, then settles to the new letter's own weight. Where a run takes a glyph into the very
// same glyph (keep: a word the two share), the letter only slides, with a lighter swell.

const DEFAULTS = {
  band: 120, // distances kept either side of an outline (font units)
  grid: 8, // the fields' grid (font units)
  flat: 10, // curves are followed in straight steps about this long (font units)
  swell: 10, // the whole word's swell while it changes, so Raung's hairlines (about 8 units) hold on the grid
  melt: 30, // a letter's further swell as the wave passes it
  soft: 28, // and how far it softens there (a blurred copy of each field; a gaussian's sigma), so the melt is round, not ragged
  front: 0.35, // the wave's width, as a share of the word
  slide: 1, // the letters' slide to their new places runs wider than the wave, so no glyph is stretched far
  blend: 0.4, // the share of the wave in which a letter's shape passes from one word to the next
  edge: 0.08, // at each end of a morph the font's own outline swells (or settles) before the fields take over
  island: 9000, // a loose drop of ink smaller than this (square font units, a few pixels across) is left out
  keepMelt: 0.4, // how much of the melt and softening a kept run (a glyph meeting itself) takes
};

export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sweepAt = (s, u, width) => smooth((s * (1 + width) - u) / width);

// scratch for the contour, shared by every morph on the page (each contour is traced in one go)
let grid = new Float32Array(0), la = new Int32Array(0), lb = new Int32Array(0), seen = new Uint8Array(0), touched = new Int32Array(0);
const rowAt = [], rowT = [], kept = new Float64Array(512);

/**
 * The outline where the grid (nx by ny points, cs apart, from ox, oy; values in `grid`) crosses
 * zero, as path data.
 */
function contour(nx, ny, ox, oy, cs, island) {
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
    if (l.area < island && loops.reduce((n, o) => n + (o !== l && inside(o.pts, l.pts[0] + 0.25, l.pts[1] + 0.25) ? 1 : 0), 0) % 2 === 0) continue;
    d += `M${l.pts.join(' ')}Z`;
  }
  return d;
}

/**
 * Make a morph over a set of words.
 * @param {object} type  the generated data (see the top of this file)
 * @param {Partial<typeof DEFAULTS>} [options]  tuning, as in DEFAULTS
 * @returns {{
 *   words: string[],
 *   frame: { x: number, y: number, w: number, h: number },
 *   rest: (i: number) => string,
 *   shape: (k: number, m: number, cell: number) => { d: string, stroke: number },
 *   cellFor: (pxPerEm: number) => number,
 *   warm: (until?: number) => boolean,
 * }}
 */
export function createWordMorph(type, options = {}) {
  const { band: BAND, grid: GRID, flat: FLAT, swell: SWELL, melt: MELT, soft: SOFT, front: FRONT, slide: SLIDE,
    blend: BLEND, edge: EDGE, island: ISLAND, keepMelt: KEEP } = { ...DEFAULTS, ...options };
  const WORDS = Object.keys(type.words);
  const EM = type.unitsPerEm;
  const start = type.align === 'start';
  const keeps = type.keep ?? [];

  /** A glyph's outlines as closed polygons [x0, y0, x1, y1, ...] (the font's curves followed in short steps). */
  const polygons = (d) => {
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
  };

  // every field has the same rows, so a row is found once for both words of a morph; the frame
  // holds every word (a left-aligned set from its pen's start, x = 0)
  let TOP = Infinity, BOTTOM = -Infinity, LEFT = Infinity, RIGHT = -Infinity;
  for (const w of WORDS) {
    const [x, y, wd, h] = type.words[w].box;
    TOP = Math.min(TOP, y); BOTTOM = Math.max(BOTTOM, y + h); LEFT = Math.min(LEFT, x); RIGHT = Math.max(RIGHT, x + wd);
  }
  if (start) LEFT = Math.min(0, LEFT);
  else { const half = Math.max(-LEFT, RIGHT); LEFT = -half; RIGHT = half; }
  const frame = { x: LEFT, y: TOP, w: RIGHT - LEFT, h: BOTTOM - TOP };
  const Y0 = Math.floor(TOP - BAND - GRID), ROWS = Math.ceil((BOTTOM - TOP + 2 * (BAND + GRID)) / GRID) + 1;

  // A word's field is built in small pieces against a deadline, so the work fits the page's idle
  // moments however slow the machine is (or however cold the script engine is the first time).
  const fields = []; // per word, once built: { x0, nx, d (the field), b (its softened copy) }
  const builds = [];
  /** Work on word i's field until the clock (performance.now) passes `until` (Infinity: to the end). */
  function buildField(i, until) {
    if (fields[i]) return;
    let b = builds[i];
    if (!b) {
      const word = type.words[WORDS[i]];
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
  const fieldOf = (i) => { buildField(i, Infinity); return fields[i]; };

  // The runs, as places along the two words that meet: the edges of each run's glyphs (half way
  // between neighbouring glyphs), and how far along the first word each one is (0..1).
  const CUTS = WORDS.map((w) => {
    const ink = type.words[w].ink;
    const c = [ink[0][0]];
    for (let i = 0; i < ink.length - 1; i++) c.push((ink[i][1] + ink[i + 1][0]) / 2);
    c.push(ink[ink.length - 1][1]);
    return c;
  });
  const KNOTS = type.morphs.map((runs, k) => {
    const xa = [], xb = [];
    let ia = 0, ib = 0;
    for (const [na, nb] of runs) { xa.push(CUTS[k][ia]); xb.push(CUTS[k + 1][ib]); ia += na; ib += nb; }
    xa.push(CUTS[k][ia]); xb.push(CUTS[k + 1][ib]);
    const keep = keeps[k] ?? runs.map(() => false);
    const ua = xa.map((x) => (x - xa[0]) / (xa[xa.length - 1] - xa[0]));
    // when each edge slides: as the wave reaches it, except that the edges of kept runs side by
    // side (a word the two share) slide together, with the first of them, so that word moves along
    // as one piece instead of being squeezed while its two ends are at different points
    const us = ua.slice();
    for (let i = 1; i < us.length; i++) if (keep[i - 1]) us[i] = us[i - 1];
    return { xa, xb, ua, us, keep };
  });
  /**
   * Where the run edges stand at s (0..1) through the morph from word k: each slides as the wave
   * passes. Centred words: the wave moves one end of the word before the other, so the whole shape
   * also drifts by half the difference and its middle stays between the two words' middles.
   * Left-aligned words: the left edge stays where it is and only the end moves.
   */
  const placed = (k, s) => {
    const { xa, xb, us } = KNOTS[k], n = xa.length - 1;
    const shift = start ? 0 : (-(sweepAt(s, 0, SLIDE) - sweepAt(s, 1, SLIDE)) * (xb[0] - xa[0] - (xb[n] - xa[n]))) / 4;
    const x = xa.map((a, i) => a + (xb[i] - a) * sweepAt(s, us[i], SLIDE) + shift);
    // the edges keep their order (a guard for runs set so that a fold would draw a glyph twice)
    for (let i = 1; i <= n; i++) x[i] = Math.max(x[i], x[i - 1] + 1);
    return x;
  };

  /** The shape between word k and word k + 1, s (0..1) along the wave, sampled every cs font units. */
  function between(k, s, cs) {
    const A = fieldOf(k), B = fieldOf(k + 1), { xa, xb, ua, keep } = KNOTS[k];
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
      // the swell, and the softening (lighter where a glyph only meets itself)
      const km = keep[seg] ? KEEP : 1;
      const w = sweepAt(s, u, FRONT);
      const ws = smooth((w - 0.5) / BLEND + 0.5);
      const swell = SWELL + MELT * km * Math.sqrt(4 * w * (1 - w));
      const sf = Math.sin(Math.PI * w) * km;
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
    return contour(nx, ny, ox, oy, cs, ISLAND);
  }

  const restD = WORDS.map((w) => type.words[w].glyphs.join(''));
  /** How far (0..1) the wave has run at m through a morph (the ends are the outline's own swell). */
  const waveAt = (m) => Math.min(1, Math.max(0, (m - EDGE) / (1 - 2 * EDGE)));

  return {
    words: WORDS,
    frame,
    /** Word i at rest: the font's own outlines. */
    rest: (i) => restD[i],
    /**
     * The shape at m (0..1) through the morph from word k to word k + 1: the path data, and the
     * width of a stroke in the fill's own colour (font units; it swells the font's outline evenly,
     * with round corners, as the fields do, at the two ends where the outline itself is drawn).
     */
    shape(k, m, cell) {
      if (m <= 0) return { d: restD[k], stroke: 0 };
      if (m >= 1) return { d: restD[k + 1], stroke: 0 };
      if (m < EDGE || m > 1 - EDGE) {
        const into = m < EDGE;
        return { d: restD[into ? k : k + 1], stroke: 2 * SWELL * smooth(into ? m / EDGE : (1 - m) / EDGE) };
      }
      return { d: between(k, waveAt(m), cell), stroke: 0 };
    },
    /** The morph's grid (font units) for type drawn at pxPerEm: about a pixel and a quarter. */
    cellFor: (pxPerEm) => Math.min(16, Math.max(7, (1.25 * EM) / Math.max(1, pxPerEm))),
    /** Build the words' fields until the clock passes `until`; true once all are built. */
    warm(until = Infinity) {
      let i;
      while ((i = WORDS.findIndex((_, n) => !fields[n])) >= 0 && performance.now() < until) buildField(i, until);
      return WORDS.every((_, n) => fields[n]);
    },
  };
}

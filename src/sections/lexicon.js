// About us: LEARN · CREATE · COLLABORATE · PERFORM · GROW. A tall section with a stage that stays
// on screen while the page scrolls through it. In its middle each word is drawn in Raung, as the
// font's own outlines (assets/type/about-words.js, made by tools/type/words.mjs), and each word
// turns into the next with the scroll, as one shape: a wave runs along the word from left to right,
// and as it passes, each letter swells, melts into the letter of the next word that takes its place
// and settles again. The scroll rests on every word for part of the way, so each can be read.
// Around the words the home page's Penrose ring, in the statue's white marble
// (src/scene/aboutRing.js), turns half way round and draws back, and behind it gold line-work (an
// astrolabe's circles, ticks and construction lines, and a few constellations) draws itself in as
// the section arrives and turns slowly while it plays. A side scale names the five words and marks
// the one shown; tapping one scrolls to it.
//
// Without WebGL (or where it runs poorly) a drawn ring of the same size stands in for the marble
// one. With reduced motion the stage is shorter, the ring and the line-work hold still and the
// words change in place, without the morph.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin.js';
import TYPE from '../../assets/type/about-words.js';
import { probeWebGL, prefersStatic, readToken } from '../util/env.js';
import { currentTheme } from '../ui/theme.js';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

const RING_MAPS = {
  albedo: new URL('../../assets/textures/ring-albedo.webp', import.meta.url).href,
  normal: new URL('../../assets/textures/ring-normal.webp', import.meta.url).href,
};

// The ring's image as its eye sees it, in tan(angle) units with y up (measured from
// src/scene/ring/ring.js): its hole is close to an ellipse a wide and b tall (taken a little inside
// the measured 0.1032 and 0.1555), centred a little left of the axis, and the whole ring stands
// 0.36 tall. The ring turns about the middle of its hole, so the words stay centred in it.
const HOLE = { cx: -0.0123, cy: 0, a: 0.101, b: 0.152 };
const OUTER = { a: 0.1326, b: 0.18 }; // the ring's own half-width and half-height, from the same middle
// half a turn, clockwise like a clock hand, over the section, from a start a little anticlockwise
// of upright: so the ring lies widest a little before the middle, where the widest words are
const TURN = -Math.PI, TILT = Math.PI * 0.05;
// the ring draws back to 0.7 of its size, from 1.3 on a landscape stage (as the ledger's reticle
// does, from 1.35 to 0.6) and from 1.15 on a portrait one, where it has less room to start in
const SCALE = { landscape: 1.3, portrait: 1.15, end: 0.7 };
const FIT = 0.9; // the corners of a word's box keep this far inside the hole

// the timeline, in beats: the scroll rests on each word, then the shape turns into the next
const REST = 1, MORPH = 1.15;
const WORDS = Object.keys(TYPE.words);
const STEP = REST + MORPH;
const BEATS = WORDS.length * REST + (WORDS.length - 1) * MORPH;

// the words' frame (font units): every word is centred on x = 0 and sits on one baseline, so the
// middle of the capitals is the middle of the frame
const CAP_MID = -TYPE.capHeight / 2;
const FRAME = { x: -3000, y: CAP_MID - 520, w: 6000, h: 1040 };
const EM = TYPE.unitsPerEm;

// how far each word reaches from the middle of the capitals, in ems
const EXTENT = WORDS.map((w) => {
  const [x, y, width, height] = TYPE.words[w].box;
  return { half: Math.max(-x, x + width) / EM, up: (CAP_MID - y) / EM, down: (y + height - CAP_MID) / EM };
});

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
const BAND = 120; // distances kept either side of an outline (font units)
const GRID = 8; // the fields' grid (font units)
const FLAT = 10; // curves are followed in straight steps about this long (font units)
const SWELL = 10; // the whole word's swell while it changes, so Raung's hairlines (about 8 units) hold on the grid
const MELT = 30; // a letter's further swell as the wave passes it
const SOFT = 28; // and how far it softens there (a blurred copy of each field; a gaussian's sigma), so the melt is round, not ragged
const FRONT = 0.35; // the wave's width, as a share of the word
const SLIDE = 1; // the letters' slide to their new places runs wider than the wave, so no glyph is stretched far
const BLEND = 0.4; // the share of the wave in which a letter's shape passes from one word to the next
const EDGE = 0.08; // at each end of a morph the font's own outline swells (or settles) before the fields take over
const ISLAND = 9000; // a loose drop of ink smaller than this (square font units, a few pixels across) is left out

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sweepAt = (s, u, width) => smooth((s * (1 + width) - u) / width);

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
let TOP = Infinity, BOTTOM = -Infinity;
for (const w of WORDS) { const [, y, , h] = TYPE.words[w].box; TOP = Math.min(TOP, y); BOTTOM = Math.max(BOTTOM, y + h); }
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
const fieldOf = (i) => { buildField(i, Infinity); return fields[i]; };

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
const placed = (k, s) => {
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
function between(k, s, cs) {
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

/** Work for idle moments (a short timeout keeps it moving on a page that is never idle). */
const idle = (fn) => (window.requestIdleCallback
  ? requestIdleCallback(fn, { timeout: 1500 })
  : setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 0 }), 60));

/** Where the scroll is in the words (p 0..1): the word shown, at rest or how far (m) into the morph from word k. */
function wordAt(p) {
  const t = Math.min(Math.max(p, 0), 1) * BEATS;
  const i = Math.min(WORDS.length - 1, Math.floor(t / STEP));
  const into = t - i * STEP;
  if (into <= REST || i === WORDS.length - 1) return { word: i, rest: true };
  const m = (into - REST) / MORPH;
  return { word: m < 0.5 ? i : i + 1, rest: false, k: i, m };
}
/** The scroll position (0..1) of the middle of a word's rest. */
const restAt = (i) => (i * STEP + REST / 2) / BEATS;
/** How far (0..1) the wave has run at m through a morph (the ends are the outline's own swell). */
const waveAt = (m) => Math.min(1, Math.max(0, (m - EDGE) / (1 - 2 * EDGE)));

/** The ring's turn and size along the section (reduced motion: still, turned to lie wide). */
const schedule = (from, still) => (p) => (still
  ? { spin: TURN / 2, scale: 1 }
  : { spin: TILT + TURN * p, scale: from + (SCALE.end - from) * p });

/** The most room the ring's image takes across and down over the section (tan units). */
function reach(ringAt) {
  let wide = 0, tall = 0;
  for (let n = 0; n <= 60; n++) {
    const { spin, scale } = ringAt(n / 60);
    const c = Math.cos(spin), s = Math.sin(spin);
    wide = Math.max(wide, 2 * scale * Math.hypot(OUTER.a * c, OUTER.b * s));
    tall = Math.max(tall, 2 * scale * Math.hypot(OUTER.a * s, OUTER.b * c));
  }
  return { wide, tall };
}

/**
 * The largest type size (px per em) at which every word, and every shape between two words, stays
 * inside the ring's hole as it turns and draws back. A word is a box; the hole an ellipse turned
 * with the ring; each corner of the box must lie inside it. Between two words the box reaches to
 * the outer run edges where they stand at that point of the wave (placed), swollen as a letter is
 * when the wave passes it, and is as tall as the taller word.
 */
function fitEm(ppu, ringAt, still) {
  let em = Infinity;
  const fit = (e, p) => {
    const { spin, scale } = ringAt(p);
    const c = Math.cos(spin), s = Math.sin(spin), k = ppu * scale;
    for (const [x, y] of [[e.half, e.up], [-e.half, e.up], [e.half, -e.down], [-e.half, -e.down]]) {
      em = Math.min(em, k / Math.hypot((x * c + y * s) / HOLE.a, (-x * s + y * c) / HOLE.b));
    }
  };
  // held still (reduced motion), the ring stays put and the words change in place: each word alone
  if (still) EXTENT.forEach((e) => fit(e, 0));
  else {
    const grow = (SWELL + MELT) / EM;
    for (let n = 0; n <= 160; n++) {
      const p = n / 160;
      const at = wordAt(p);
      let e = EXTENT[at.word];
      if (!at.rest) {
        const x = placed(at.k, waveAt(at.m)), a = EXTENT[at.k], b = EXTENT[at.k + 1];
        e = { half: Math.max(-x[0], x[x.length - 1]) / EM + grow, up: Math.max(a.up, b.up) + grow, down: Math.max(a.down, b.down) + grow };
      }
      fit(e, p);
    }
  }
  return em * FIT;
}

// ---- the gold line-work (units: 1000 to half a tan unit of the ring's image) ----

const STAR = 'M0 -10C1 -2 2 -1 10 0 2 1 1 2 0 10 -1 2 -2 1 -10 0 -2 -1 -1 -2 0 -10Z'; // the site's star
const f1 = (v) => Math.round(v * 10) / 10;
const polar = (r, deg) => [f1(r * Math.cos((deg * Math.PI) / 180)), f1(r * Math.sin((deg * Math.PI) / 180))];
const star = (x, y, size, cls = 'ins-star') => `<path class="${cls}" d="${STAR}" transform="translate(${x} ${y}) scale(${size / 10})"/>`;
const arc = (r, a0, a1) => {
  const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

function lineWork() {
  // the outer dial: a ring of ticks, longer every 15° and every 45°, between two circles
  let ticks = '';
  for (let d = 0; d < 360; d += 3) {
    const [r0, r1] = d % 45 === 0 ? [526, 566] : d % 15 === 0 ? [538, 562] : [548, 560];
    const [x0, y0] = polar(r0, d), [x1, y1] = polar(r1, d);
    ticks += `M${x0} ${y0}L${x1} ${y1}`;
  }
  const outer = `
    <circle class="ins-draw" r="566"/>
    <path class="ins-draw" d="${ticks}"/>
    <circle class="ins-fine ins-fade" r="526" stroke-dasharray="1 6"/>
    <circle class="ins-faint ins-draw" r="600"/>
    ${[45, 135, 225, 315].map((d) => star(...polar(600, d), 9)).join('')}`;

  // the middle ring: arcs with small rounds at their ends, hour marks and a dashed circle
  const arcs = [12, 102, 192, 282];
  const middle = `
    <circle class="ins-draw" r="490"/>
    <circle class="ins-fine ins-fade" r="472" stroke-dasharray="2 8"/>
    ${arcs.map((d) => `<path class="ins-draw" d="${arc(512, d, d + 50)}"/>`).join('')}
    ${arcs.map((d) => [d, d + 50].map((e) => { const [x, y] = polar(512, e); return `<circle class="ins-dot" cx="${x}" cy="${y}" r="3.2"/>`; }).join('')).join('')}
    <path class="ins-draw" d="${Array.from({ length: 12 }, (_, i) => { const [x0, y0] = polar(482, i * 30 + 15), [x1, y1] = polar(498, i * 30 + 15); return `M${x0} ${y0}L${x1} ${y1}`; }).join('')}"/>`;

  // the construction: a crosshair out to the edges, the rete's diagonals, two eccentric circles,
  // wide circles and a triangle drawn through the dial
  const cross = [0, 90, 180, 270].map((d) => { const [x0, y0] = polar(612, d), [x1, y1] = polar(820, d); return `M${x0} ${y0}L${x1} ${y1}`; }).join('');
  const diag = [30, 150, 210, 330].map((d) => { const [x0, y0] = polar(430, d), [x1, y1] = polar(900, d); return `M${x0} ${y0}L${x1} ${y1}`; }).join('');
  const tri = [90, 210, 330].map((d) => polar(700, d));
  const construct = `
    <path class="ins-draw" d="${cross}"/>
    <path class="ins-fine ins-fade" d="${diag}" stroke-dasharray="3 9"/>
    <circle class="ins-faint ins-draw" cy="-150" r="440"/>
    <circle class="ins-faint ins-draw" cy="150" r="440"/>
    <circle class="ins-faint ins-draw" r="780"/>
    <circle class="ins-faint ins-fade" r="1000" stroke-dasharray="1 7"/>
    <path class="ins-faint ins-draw" d="M${tri.map((p) => p.join(' ')).join('L')}Z"/>
    ${tri.map(([x, y]) => `<circle class="ins-fine ins-draw" cx="${x}" cy="${y}" r="7"/>`).join('')}`;
  return { outer, middle, construct };
}

// three small constellations for the corners of the stage (each in its own little frame)
const CONSTELLATIONS = [
  { cls: 'is-a', box: '0 0 240 170', stars: [[22, 120, 9], [78, 64, 13], [140, 92, 8], [196, 30, 11], [214, 140, 6]], path: [0, 1, 2, 3, 1] },
  { cls: 'is-b', box: '0 0 220 150', stars: [[24, 30, 7], [92, 70, 12], [160, 44, 8], [196, 122, 10]], path: [0, 1, 2, 1, 3] },
  { cls: 'is-c', box: '0 0 170 120', stars: [[20, 96, 8], [86, 30, 11], [150, 80, 7]], path: [0, 1, 2] },
];
function constellations() {
  return CONSTELLATIONS.map(({ cls, box, stars, path }) => `
    <svg class="lexicon__stars ${cls}" viewBox="${box}" aria-hidden="true" focusable="false">
      <path class="ins-fine ins-draw" d="M${path.map((i) => stars[i].slice(0, 2).join(' ')).join('L')}"/>
      ${stars.map(([x, y, s]) => star(x, y, s)).join('')}
    </svg>`).join('');
}

/**
 * @param {HTMLElement} host  the [data-lexicon] section
 * @param {{ reduced: boolean, opened: Promise<void>, onTheme: (fn) => void }} ctx
 * @returns {() => void} dispose
 */
export function setupLexicon(host, { reduced, opened, onTheme }) {
  const run = host.querySelector('.lexicon__run');
  const stage = host.querySelector('.lexicon__stage');
  const wordSvg = host.querySelector('.lexicon__word');
  const ringHost = host.querySelector('.lexicon__ring');
  const still = host.querySelector('.lexicon__still');
  const steps = [...host.querySelectorAll('.lexicon__step')];
  const count = host.querySelector('[data-lexicon-count]');
  const lines = host.querySelector('.lexicon__lines');
  const side = host.querySelector('.lexicon__side');
  const cleanups = [];
  let gone = false;
  cleanups.push(() => { gone = true; });

  // the word: one path, the font's own outlines at rest, the fields' outline between words
  const NS = 'http://www.w3.org/2000/svg';
  wordSvg.setAttribute('viewBox', `${FRAME.x} ${FRAME.y} ${FRAME.w} ${FRAME.h}`);
  const ink = document.createElementNS(NS, 'path');
  ink.setAttribute('stroke-width', '0');
  wordSvg.append(ink);
  const restD = WORDS.map((w) => TYPE.words[w].glyphs.join(''));

  // the line-work, in three layers that turn at their own rates, and the corner constellations
  const art = lineWork();
  const layer = (name, body) => `<svg class="lexicon__layer lexicon__layer--${name}" viewBox="-640 -640 1280 1280" aria-hidden="true" focusable="false">${body}</svg>`;
  lines.innerHTML = layer('construct', art.construct) + layer('outer', art.outer) + layer('middle', art.middle) + constellations();
  const layers = {
    outer: lines.querySelector('.lexicon__layer--outer'),
    middle: lines.querySelector('.lexicon__layer--middle'),
    construct: lines.querySelector('.lexicon__layer--construct'),
  };
  const drawn = gsap.utils.toArray(lines.querySelectorAll('.ins-draw'));
  const faded = gsap.utils.toArray(lines.querySelectorAll('.ins-fade, .ins-star, .ins-dot'));

  // ---- sizes: the ring from the stage, the type from the ring ----
  let ring = null; // the marble ring, once loaded
  let ppu = 1000;
  let progress = 0;
  let cell = 8; // the morph's grid (font units): about a pixel and a quarter at the type's size
  let ringAt = schedule(SCALE.landscape, reduced);
  const layout = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    const from = h > w ? SCALE.portrait : SCALE.landscape;
    ringAt = schedule(from, reduced);
    // the ring as large as the stage holds at its largest along the way (held still, it keeps
    // that size): inside the height, less the bands kept for the sentence above and the scale
    // below where those are not beside it, and inside the width, clear of the scale where it is
    const beside = getComputedStyle(side).display !== 'contents';
    const bands = beside ? h * 0.08 : 2 * (parseFloat(readToken('--topbar-h')) + 40);
    const { wide, tall } = reach(schedule(from, false));
    const room = beside ? Math.min(w * 0.94, w - 2 * (side.getBoundingClientRect().right + 24)) : w * 0.94;
    ppu = Math.min((h - bands) / tall, room / wide);
    const em = Math.max(16, Math.min(fitEm(ppu, ringAt, reduced), (w * 0.92) / (2 * Math.max(...EXTENT.map((e) => e.half))), 150));
    const unit = (ppu * 0.5) / 1000; // px per line-work unit
    cell = Math.min(16, Math.max(7, 1250 / em));
    stage.style.setProperty('--word-em', `${em.toFixed(2)}px`);
    stage.style.setProperty('--ring-px', `${(ppu * 0.5).toFixed(1)}px`);
    stage.style.setProperty('--ins-px', `${(unit * 1280).toFixed(1)}px`);
    stage.style.setProperty('--hair', (1 / unit).toFixed(3)); // one CSS pixel, in line-work units
    ring?.set({ ppu, cx: HOLE.cx, cy: HOLE.cy });
    apply(progress, true);
  };

  // ---- the word at a point of the scroll ----
  let shownD = '', shownStroke = '';
  const draw = (at) => {
    let d, stroke = 0;
    if (reduced || at.rest) d = restD[at.word];
    else if (at.m < EDGE || at.m > 1 - EDGE) {
      // the font's own outline swells into the morph and settles out of it (a stroke the colour of
      // the fill swells it evenly, with round corners, as the fields do)
      const into = at.m < EDGE;
      d = restD[into ? at.k : at.k + 1];
      stroke = 2 * SWELL * smooth(into ? at.m / EDGE : (1 - at.m) / EDGE);
    } else d = between(at.k, waveAt(at.m), cell);
    if (d !== shownD) { ink.setAttribute('d', d); shownD = d; }
    const sw = stroke.toFixed(2);
    if (sw !== shownStroke) { ink.setAttribute('stroke-width', sw); shownStroke = sw; }
  };

  // ---- one place where the scroll position becomes the picture ----
  let shown = -1;
  const apply = (p, force = false) => {
    progress = p;
    const { spin, scale } = ringAt(p);
    ring?.set({ spin, scale });
    // the drawn stand-in ring turns and draws back the same way (CSS turns clockwise for a positive angle)
    gsap.set(still, { rotation: (-spin * 180) / Math.PI, scale });
    const at = wordAt(p);
    if (at.word !== shown || force) {
      shown = at.word;
      steps.forEach((s, i) => (i === at.word ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')));
      if (count) count.textContent = String(at.word + 1).padStart(2, '0');
    }
    draw(at);
  };

  // ---- the scroll ----
  let st;
  if (reduced) {
    st = ScrollTrigger.create({ trigger: run, start: 'top top', end: 'bottom bottom', onUpdate: (self) => apply(self.progress) });
  } else {
    // the line-work turns slowly while the words play, each layer at its own rate; the words
    // themselves are drawn from the timeline's progress (apply)
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    tl.to(layers.outer, { rotation: -24, duration: BEATS }, 0)
      .to(layers.middle, { rotation: 38, duration: BEATS }, 0)
      .to(layers.construct, { rotation: -9, duration: BEATS }, 0);
    tl.eventCallback('onUpdate', () => apply(tl.progress()));
    st = ScrollTrigger.create({ trigger: run, start: 'top top', end: 'bottom bottom', scrub: 0.7, animation: tl });
    cleanups.push(() => tl.kill());

    // the line-work draws itself in as the section arrives
    gsap.set(drawn, { drawSVG: '0%' });
    gsap.set(faded, { autoAlpha: 0 });
    const drawIn = gsap.timeline({
      scrollTrigger: { trigger: run, start: 'top 85%', end: 'top 10%', scrub: 0.6 },
      defaults: { ease: 'none' },
    });
    drawIn.to(drawn, { drawSVG: '100%', duration: 1, stagger: { each: 0.04, from: 'random' } }, 0)
      .to(faded, { autoAlpha: 1, duration: 0.5, stagger: { each: 0.02, from: 'random' } }, 0.4);
    // and it fades in and out with the stage's coming and going, so its lines never end on the
    // stage's edge (a fade, not a mask: a mask over the turning layers costs a repaint each frame)
    const come = gsap.fromTo(lines, { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: run, start: 'top 95%', end: 'top 30%', scrub: true } });
    const go = gsap.fromTo(lines, { opacity: 1 }, { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: { trigger: run, start: 'bottom 98%', end: 'bottom 45%', scrub: true } });
    cleanups.push(() => { [drawIn, come, go].forEach((t) => { t.scrollTrigger?.kill(); t.kill(); }); });
  }
  cleanups.push(() => st.kill());

  // tapping a word in the scale scrolls to it
  const onStep = (e) => {
    const i = steps.indexOf(e.currentTarget);
    const y = st.start + (st.end - st.start) * restAt(i);
    gsap.to(window, { scrollTo: y, duration: reduced ? 0 : 1.1, ease: 'power2.inOut' });
  };
  steps.forEach((s) => s.addEventListener('click', onStep));
  cleanups.push(() => steps.forEach((s) => s.removeEventListener('click', onStep)));

  const ro = new ResizeObserver(layout);
  ro.observe(stage);
  cleanups.push(() => ro.disconnect());
  layout();

  // ---- after the curtain, in the page's idle moments: the marble ring, then the words' fields ----
  // Nothing here runs while the page is busy, so the top of the page answers as soon as the
  // curtain parts. The ring is far down the page by then; the fields are only needed once the
  // first word starts to turn (and are built on the spot if the scroll gets there first).
  const prepare = () => {
    if (reduced) return;
    const work = (deadline) => {
      if (gone) return;
      // the time the browser offers, less a little; a few milliseconds when it had none to give
      const until = performance.now() + (deadline.didTimeout ? 6 : Math.max(2, deadline.timeRemaining() - 3));
      let i;
      while ((i = WORDS.findIndex((_, n) => !fields[n])) >= 0 && performance.now() < until) buildField(i, until);
      if (i >= 0) idle(work);
    };
    idle(work);
  };
  const gl = probeWebGL();
  if (gl.ok && !prefersStatic(gl.renderer)) {
    opened.then(() => new Promise((r) => idle(r))).then(() => (gone ? null : import('../scene/aboutRing.js'))).then(async (mod) => {
      if (!mod || gone) return;
      ring = new mod.AboutRing(ringHost, {
        theme: currentTheme(),
        colors: { warm: readToken('--gold-300'), rim: readToken('--slate-300') },
      });
      await ring.load(RING_MAPS);
      if (gone) return;
      ring.set({ ppu, cx: HOLE.cx, cy: HOLE.cy, ...ringAt(progress) });
      requestAnimationFrame(() => ringHost.classList.add('is-live'));
    }).catch((err) => console.warn('Marble ring unavailable; the drawn ring stays.', err)).finally(prepare);
    onTheme((theme) => ring?.setTheme(theme));
    cleanups.push(() => ring?.dispose());
  } else opened.then(prepare);

  return () => cleanups.forEach((c) => c());
}

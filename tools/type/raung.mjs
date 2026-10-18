// Raung's outlines, read straight from the site's own font file, as a small library for the
// generators beside it (tools/type/heads.mjs). It is the font reader of tools/type/words.mjs, the
// About us page's generator, taken out as functions so a generator can set any line of text:
// tools/type/words.mjs itself is left exactly as it is, so the About us page's words never change.
//
// It reads assets/fonts/Raung-400.woff2 (OpenType with CFF outlines, in WOFF2), undoes the Brotli
// compression with Node's own zlib, maps the letters to glyphs through the cmap, joins the
// ligatures through GSUB, kerns the pairs through GPOS and runs the Type 2 charstrings. Nothing is
// fetched and nothing outside Node is needed.
//
// Coordinates are font units with y pointing down (as SVG draws them): the baseline is y = 0 and
// capitals reach up to about -capHeight.

import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

// ---- WOFF2 -> the font's tables ----

// the 63 tags WOFF2 knows by number (WOFF2 specification, 5.1)
const KNOWN_TAGS = ('cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx ' +
  'BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort ' +
  'morx opbd prop trak Zapf Silf Glat Gloc Feat Sill').match(/.{4}\s?/g).map((t) => t.slice(0, 4));

function readWoff2(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 file.');
  const flavor = buf.toString('latin1', 4, 8);
  const numTables = buf.readUInt16BE(12);
  const compressedLength = buf.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[at++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('Bad UIntBase128.');
  };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at++];
    const tag = (flags & 0x3f) === 0x3f ? buf.toString('latin1', at, (at += 4)) : KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const length = base128();
    // glyf and loca are transformed unless their version is 3; every other table only if non-zero
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    const stored = transformed ? base128() : length;
    if (transformed) throw new Error(`Table ${tag} is transformed; this reader only handles CFF fonts.`);
    dir.push({ tag, length: stored });
  }
  // the tables follow one another, unpadded, in one Brotli stream
  const data = brotliDecompressSync(buf.subarray(at, at + compressedLength));
  const tables = {};
  let offset = 0;
  for (const t of dir) { tables[t.tag] = data.subarray(offset, offset + t.length); offset += t.length; }
  return { flavor, tables };
}

// ---- small readers ----

const u8 = (b, o) => b[o];
const u16 = (b, o) => b.readUInt16BE(o);
const i16 = (b, o) => b.readInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);

function readCmap(b) {
  const n = u16(b, 2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const platform = u16(b, 4 + i * 8), encoding = u16(b, 6 + i * 8), off = u32(b, 8 + i * 8);
    const format = u16(b, off);
    if (platform === 3 && (encoding === 1 || encoding === 10) && (format === 4 || format === 12)) {
      if (!best || format === 12) best = { off, format };
    } else if (platform === 0 && !best && (format === 4 || format === 12)) best = { off, format };
  }
  if (!best) throw new Error('No Unicode cmap.');
  const { off, format } = best;
  if (format === 12) {
    const groups = u32(b, off + 12);
    return (code) => {
      for (let g = 0; g < groups; g++) {
        const p = off + 16 + g * 12, start = u32(b, p), end = u32(b, p + 4);
        if (code >= start && code <= end) return u32(b, p + 8) + code - start;
      }
      return 0;
    };
  }
  const segX2 = u16(b, off + 6);
  const ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  return (code) => {
    for (let s = 0; s < segX2; s += 2) {
      if (code > u16(b, ends + s)) continue;
      const start = u16(b, starts + s);
      if (code < start) return 0;
      const delta = i16(b, deltas + s), range = u16(b, ranges + s);
      if (!range) return (code + delta) & 0xffff;
      const g = u16(b, ranges + s + range + (code - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
}

function readAdvances(hhea, hmtx) {
  const n = u16(hhea, 34);
  return (gid) => u16(hmtx, Math.min(gid, n - 1) * 4);
}

// ---- GSUB ligatures (the 'liga' feature, on by default in every browser) ----
// Raung joins some capitals (CR, LL, RA, RO among them): the words are set the way the browser
// sets the site's titles, so the outlines match the type everywhere else on the site.

function readLigatures(b) {
  if (!b) return (gids) => gids;
  const featureList = u16(b, 6), lookupList = u16(b, 8);
  const lookups = [];
  const nf = u16(b, featureList);
  for (let i = 0; i < nf; i++) {
    const rec = featureList + 2 + i * 6;
    if (b.toString('latin1', rec, rec + 4) !== 'liga') continue;
    const fo = featureList + u16(b, rec + 4);
    for (let k = 0; k < u16(b, fo + 2); k++) lookups.push(u16(b, fo + 4 + k * 2));
  }
  const coverage = (o) => {
    const fmt = u16(b, o), n = u16(b, o + 2), map = new Map();
    if (fmt === 1) for (let i = 0; i < n; i++) map.set(u16(b, o + 4 + i * 2), i);
    else for (let i = 0; i < n; i++) {
      const p = o + 4 + i * 6, s = u16(b, p), e = u16(b, p + 2), idx = u16(b, p + 4);
      for (let g = s; g <= e; g++) map.set(g, idx + g - s);
    }
    return map;
  };
  const subtables = [];
  for (const li of [...new Set(lookups)].sort((a, c) => a - c)) {
    const lo = lookupList + u16(b, lookupList + 2 + li * 2);
    let type = u16(b, lo);
    for (let s = 0; s < u16(b, lo + 4); s++) {
      let so = lo + u16(b, lo + 6 + s * 2);
      if (type === 7) { type = u16(b, so + 2); so += u32(b, so + 4); } // extension
      if (type === 4 && u16(b, so) === 1) subtables.push({ so, cov: coverage(so + u16(b, so + 2)) });
    }
  }
  return (gids) => {
    for (const { so, cov } of subtables) {
      const out = [];
      for (let i = 0; i < gids.length;) {
        const ci = cov.get(gids[i]);
        let hit = null;
        if (ci !== undefined) {
          const set = so + u16(b, so + 6 + ci * 2);
          for (let l = 0; l < u16(b, set) && !hit; l++) {
            const lig = set + u16(b, set + 2 + l * 2);
            const glyph = u16(b, lig), n = u16(b, lig + 2);
            let match = i + n <= gids.length;
            for (let k = 1; k < n && match; k++) match = gids[i + k] === u16(b, lig + 2 + k * 2);
            if (match) hit = { glyph, n };
          }
        }
        if (hit) { out.push(hit.glyph); i += hit.n; } else out.push(gids[i++]);
      }
      gids = out;
    }
    return gids;
  };
}

// ---- GPOS pair kerning (the 'kern' feature: pair adjustment, formats 1 and 2) ----

function readKerning(b) {
  if (!b) return () => 0;
  const coverage = (o) => {
    const fmt = u16(b, o), n = u16(b, o + 2), map = new Map();
    if (fmt === 1) for (let i = 0; i < n; i++) map.set(u16(b, o + 4 + i * 2), i);
    else for (let i = 0; i < n; i++) {
      const p = o + 4 + i * 6, s = u16(b, p), e = u16(b, p + 2), idx = u16(b, p + 4);
      for (let g = s; g <= e; g++) map.set(g, idx + g - s);
    }
    return map;
  };
  const classDef = (o) => {
    const fmt = u16(b, o), map = new Map();
    if (fmt === 1) {
      const start = u16(b, o + 2), n = u16(b, o + 4);
      for (let i = 0; i < n; i++) map.set(start + i, u16(b, o + 6 + i * 2));
    } else {
      const n = u16(b, o + 2);
      for (let i = 0; i < n; i++) {
        const p = o + 4 + i * 6, s = u16(b, p), e = u16(b, p + 2), c = u16(b, p + 4);
        for (let g = s; g <= e; g++) map.set(g, c);
      }
    }
    return (g) => map.get(g) ?? 0;
  };
  const valueSize = (f) => { let n = 0; for (let k = 0; k < 8; k++) if (f & (1 << k)) n++; return n * 2; };
  // the x advance is the third field of a value record, present when bit 2 is set
  const xAdvance = (o, f) => {
    if (!(f & 4)) return 0;
    let p = o;
    if (f & 1) p += 2;
    if (f & 2) p += 2;
    return i16(b, p);
  };

  const featureList = u16(b, 6), lookupList = u16(b, 8);
  const lookups = new Set();
  const nf = u16(b, featureList);
  for (let i = 0; i < nf; i++) {
    const rec = featureList + 2 + i * 6;
    if (b.toString('latin1', rec, rec + 4) !== 'kern') continue;
    const fo = featureList + u16(b, rec + 4);
    const n = u16(b, fo + 2);
    for (let k = 0; k < n; k++) lookups.add(u16(b, fo + 4 + k * 2));
  }
  const pairs = [];
  for (const li of lookups) {
    const lo = lookupList + u16(b, lookupList + 2 + li * 2);
    let type = u16(b, lo);
    const n = u16(b, lo + 4);
    for (let s = 0; s < n; s++) {
      let so = lo + u16(b, lo + 6 + s * 2);
      if (type === 9) { type = u16(b, so + 2); so += u32(b, so + 4); } // extension
      if (type !== 2) continue;
      pairs.push(so);
    }
  }
  return (left, right) => {
    for (const so of pairs) {
      const fmt = u16(b, so), cov = coverage(so + u16(b, so + 2));
      const f1 = u16(b, so + 4), f2 = u16(b, so + 6);
      const ci = cov.get(left);
      if (ci === undefined) continue;
      if (fmt === 1) {
        const set = so + u16(b, so + 10 + ci * 2);
        const n = u16(b, set), rec = 2 + valueSize(f1) + valueSize(f2);
        for (let i = 0; i < n; i++) {
          const p = set + 2 + i * rec;
          if (u16(b, p) === right) return xAdvance(p + 2, f1);
        }
      } else if (fmt === 2) {
        const c1 = classDef(so + u16(b, so + 8))(left), c2 = classDef(so + u16(b, so + 10))(right);
        const n2 = u16(b, so + 14), rec = valueSize(f1) + valueSize(f2);
        const v = xAdvance(so + 16 + (c1 * n2 + c2) * rec, f1);
        if (v) return v;
      }
    }
    return 0;
  };
}

// ---- CFF ----

function readIndex(b, o) {
  const count = u16(b, o);
  if (!count) return { items: [], end: o + 2 };
  const offSize = u8(b, o + 2);
  const off = (i) => { let v = 0; for (let k = 0; k < offSize; k++) v = v * 256 + b[o + 3 + i * offSize + k]; return v; };
  const data = o + 3 + (count + 1) * offSize - 1;
  const items = [];
  for (let i = 0; i < count; i++) items.push(b.subarray(data + off(i), data + off(i + 1)));
  return { items, end: data + off(count) };
}

function readDict(b) {
  const dict = {};
  let ops = [];
  for (let i = 0; i < b.length;) {
    const v = b[i];
    if (v <= 21) {
      let op = v; i++;
      if (v === 12) op = 1200 + b[i++];
      dict[op] = ops; ops = [];
    } else if (v === 28) { ops.push(b.readInt16BE(i + 1)); i += 3; }
    else if (v === 29) { ops.push(b.readInt32BE(i + 1)); i += 5; }
    else if (v === 30) { // real number, nibbles
      let s = ''; i++;
      for (;;) {
        const byte = b[i++], hi = byte >> 4, lo = byte & 15;
        const nib = (n) => (n <= 9 ? String(n) : n === 10 ? '.' : n === 11 ? 'E' : n === 12 ? 'E-' : n === 14 ? '-' : '');
        if (hi === 15) break; s += nib(hi);
        if (lo === 15) break; s += nib(lo);
      }
      ops.push(parseFloat(s));
    } else if (v >= 32 && v <= 246) { ops.push(v - 139); i++; }
    else if (v >= 247 && v <= 250) { ops.push((v - 247) * 256 + b[i + 1] + 108); i += 2; }
    else if (v >= 251 && v <= 254) { ops.push(-(v - 251) * 256 - b[i + 1] - 108); i += 2; }
    else i++;
  }
  return dict;
}

const bias = (n) => (n < 1240 ? 107 : n < 33900 ? 1131 : 32768);

function readCff(b) {
  const hdrSize = u8(b, 2);
  const names = readIndex(b, hdrSize);
  const tops = readIndex(b, names.end);
  const strings = readIndex(b, tops.end);
  const gsubrs = readIndex(b, strings.end).items;
  const top = readDict(tops.items[0]);
  if (top[1230]) throw new Error('CID-keyed CFF is not handled.');
  const charStrings = readIndex(b, top[17][0]).items;
  const [privSize, privOff] = top[18];
  const priv = readDict(b.subarray(privOff, privOff + privSize));
  const subrs = priv[19] ? readIndex(b, privOff + priv[19][0]).items : [];
  return { charStrings, gsubrs, subrs };
}

/** Run one Type 2 charstring; returns contours of absolute commands [['M',x,y],['L',x,y],['C',...]]. */
function outline(cff, gid) {
  const { gsubrs, subrs } = cff;
  const contours = [];
  let cur = null;
  let x = 0, y = 0, stack = [], nStems = 0, haveWidth = false, done = false;
  const moveTo = (dx, dy) => { x += dx; y += dy; cur = [['M', x, y]]; contours.push(cur); };
  const lineTo = (dx, dy) => { x += dx; y += dy; cur.push(['L', x, y]); };
  const curveTo = (a, b2, c, d, e, f) => {
    const x1 = x + a, y1 = y + b2, x2 = x1 + c, y2 = y1 + d;
    x = x2 + e; y = y2 + f;
    cur.push(['C', x1, y1, x2, y2, x, y]);
  };
  // the first stack-clearing operator may carry the advance width as an extra first argument
  const width = (even) => { if (!haveWidth) { if ((stack.length % 2 === 1) === even) stack.shift(); haveWidth = true; } };

  const run = (code) => {
    for (let i = 0; i < code.length && !done;) {
      const v = code[i];
      if (v >= 32) {
        if (v <= 246) { stack.push(v - 139); i++; }
        else if (v <= 250) { stack.push((v - 247) * 256 + code[i + 1] + 108); i += 2; }
        else if (v <= 254) { stack.push(-(v - 251) * 256 - code[i + 1] - 108); i += 2; }
        else { stack.push(code.readInt32BE(i + 1) / 65536); i += 5; }
        continue;
      }
      if (v === 28) { stack.push(code.readInt16BE(i + 1)); i += 3; continue; }
      i++;
      switch (v) {
        case 1: case 3: case 18: case 23: // stems
          width(true); nStems += stack.length >> 1; stack = []; break;
        case 19: case 20: // hintmask, cntrmask (implied vstems first)
          width(true); nStems += stack.length >> 1; stack = []; i += (nStems + 7) >> 3; break;
        case 21: width(true); moveTo(stack[0], stack[1]); stack = []; break;
        case 22: width(false); moveTo(stack[0], 0); stack = []; break;
        case 4: width(false); moveTo(0, stack[0]); stack = []; break;
        case 5: for (let k = 0; k + 1 < stack.length; k += 2) lineTo(stack[k], stack[k + 1]); stack = []; break;
        case 6: case 7: { // alternating horizontal / vertical lines
          let horiz = v === 6;
          for (const d of stack) { horiz ? lineTo(d, 0) : lineTo(0, d); horiz = !horiz; }
          stack = []; break;
        }
        case 8: for (let k = 0; k + 5 < stack.length; k += 6) curveTo(...stack.slice(k, k + 6)); stack = []; break;
        case 24: { // rcurveline
          let k = 0;
          for (; k + 7 < stack.length; k += 6) curveTo(...stack.slice(k, k + 6));
          lineTo(stack[k], stack[k + 1]); stack = []; break;
        }
        case 25: { // rlinecurve
          let k = 0;
          for (; k + 7 < stack.length; k += 2) lineTo(stack[k], stack[k + 1]);
          curveTo(...stack.slice(k, k + 6)); stack = []; break;
        }
        case 26: { // vvcurveto
          let k = 0, dx1 = 0;
          if (stack.length % 4) dx1 = stack[k++];
          for (; k + 3 < stack.length; k += 4) { curveTo(dx1, stack[k], stack[k + 1], stack[k + 2], 0, stack[k + 3]); dx1 = 0; }
          stack = []; break;
        }
        case 27: { // hhcurveto
          let k = 0, dy1 = 0;
          if (stack.length % 4) dy1 = stack[k++];
          for (; k + 3 < stack.length; k += 4) { curveTo(stack[k], dy1, stack[k + 1], stack[k + 2], stack[k + 3], 0); dy1 = 0; }
          stack = []; break;
        }
        case 30: case 31: { // vhcurveto, hvcurveto: alternating, the last may carry one extra value
          let horiz = v === 31;
          for (let k = 0; k + 3 < stack.length; k += 4) {
            const last = k + 5 === stack.length ? stack[k + 4] : 0;
            if (horiz) curveTo(stack[k], 0, stack[k + 1], stack[k + 2], last, stack[k + 3]);
            else curveTo(0, stack[k], stack[k + 1], stack[k + 2], stack[k + 3], last);
            horiz = !horiz;
          }
          stack = []; break;
        }
        case 10: { const n = stack.pop() + bias(subrs.length); run(subrs[n]); break; }
        case 29: { const n = stack.pop() + bias(gsubrs.length); run(gsubrs[n]); break; }
        case 11: return;
        case 14: width(true); done = true; stack = []; break;
        case 12: { // flex and friends
          const op = code[i++];
          const s = stack;
          if (op === 35) { curveTo(...s.slice(0, 6)); curveTo(...s.slice(6, 12)); }
          else if (op === 34) { const y0 = y; curveTo(s[0], 0, s[1], s[2], s[3], 0); curveTo(s[4], 0, s[5], y0 - y, s[6], 0); }
          else if (op === 36) { const y0 = y; curveTo(s[0], s[1], s[2], s[3], s[4], 0); curveTo(s[5], 0, s[6], s[7], s[8], y0 - y); }
          else if (op === 37) {
            const x0 = x, y0 = y;
            const dx = s[0] + s[2] + s[4] + s[6] + s[8], dy = s[1] + s[3] + s[5] + s[7] + s[9];
            curveTo(...s.slice(0, 6));
            if (Math.abs(dx) > Math.abs(dy)) curveTo(s[6], s[7], s[8], s[9], s[10], y0 - y);
            else curveTo(s[6], s[7], s[8], s[9], x0 - x, s[10]);
          }
          stack = []; break;
        }
        default: stack = [];
      }
    }
  };
  run(cff.charStrings[gid]);
  return contours;
}

// ---- lines of text ----

const r = (v) => Math.round(v * 10) / 10;

/**
 * Open a CFF font in WOFF2 and return a setter for lines of text in it.
 * @param {string} file  the .woff2 file
 */
export function openFont(file) {
  const { flavor, tables } = readWoff2(readFileSync(file));
  if (flavor !== 'OTTO') throw new Error('Expected CFF outlines (OTTO).');
  const unitsPerEm = u16(tables.head, 18);
  const glyphOf = readCmap(tables.cmap);
  const advance = readAdvances(tables.hhea, tables.hmtx);
  const kern = readKerning(tables.GPOS);
  const ligate = readLigatures(tables.GSUB);
  const cff = readCff(tables['CFF ']);
  const os2 = tables['OS/2'];
  const capHeight = u16(os2, 0) >= 2 ? i16(os2, 88) : 700;

  /**
   * Set one line as the browser sets it (ligatures, kerning, no tracking). Glyphs with no ink (the
   * space) keep their advance but are left out of `glyphs` and `ink`, so every glyph listed has
   * edges (an empty one would have none, and the morph's run edges would be lost).
   * @param {string} text
   * @param {{ align?: 'start'|'middle' }} [o]  start: the pen starts at x = 0 (a left-aligned
   *   heading); middle: the set line is centred on x = 0
   * @returns {{ glyphs: string[], ink: number[][], gids: number[], width: number, box: number[] }}
   */
  function setLine(text, { align = 'middle' } = {}) {
    const letters = [...text].map((ch) => glyphOf(ch.codePointAt(0)));
    if (letters.includes(0)) throw new Error(`The font has no glyph for a letter of "${text}".`);
    const all = ligate(letters);
    const xs = [];
    let pen = 0;
    all.forEach((g, i) => { xs.push(pen); pen += advance(g) + (i < all.length - 1 ? kern(g, all[i + 1]) : 0); });
    const shift = align === 'start' ? 0 : -pen / 2;
    let top = 0, bottom = 0, left = Infinity, right = -Infinity;
    const glyphs = [], ink = [], gids = [];
    all.forEach((g, i) => {
      const contours = outline(cff, g);
      if (!contours.length) return; // the space: its advance is in the pen, it draws nothing
      let glyph = '';
      // the glyph's own left and right, on the curves themselves (not their handles)
      let l = Infinity, rr = -Infinity, x0 = 0;
      for (const contour of contours) {
        let d = '';
        for (const [cmd, ...pts] of contour) {
          const out = [];
          for (let k = 0; k < pts.length; k += 2) {
            const px = pts[k] + xs[i] + shift, py = -pts[k + 1];
            top = Math.min(top, py); bottom = Math.max(bottom, py);
            left = Math.min(left, px); right = Math.max(right, px);
            out.push(r(px), r(py));
          }
          if (cmd === 'C') {
            const [x1, , x2, , x3] = pts.map((v, k) => (k % 2 ? v : v + xs[i] + shift));
            for (let s = 0; s <= 1; s += 1 / 32) {
              const u = 1 - s, x = u * u * u * x0 + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3;
              l = Math.min(l, x); rr = Math.max(rr, x);
            }
          }
          x0 = pts[pts.length - 2] + xs[i] + shift;
          l = Math.min(l, x0); rr = Math.max(rr, x0);
          d += cmd + out.join(' ');
        }
        glyph += d + 'Z';
      }
      glyphs.push(glyph);
      ink.push([r(l), r(rr)]);
      gids.push(g);
    });
    return { glyphs, ink, gids, width: r(pen), box: [r(left), r(top), r(right - left), r(bottom - top)] };
  }

  return { unitsPerEm, capHeight, setLine };
}

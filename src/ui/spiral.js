// The Gallery's spirals (gallery.html, written by tools/pages/build.mjs gallery()), after SpiralGallery:
// in each event's column a ribbon wound round as a spiral, a little narrower towards the top and seen a
// little from above, that stays where it is while the event's pictures flow along it, edge to edge,
// each as wide as its own shape (none cut to another's), on and on without end, in an order of their
// own for every appearance of the event.
// Drawn with WebGL 2 on one canvas over the columns, each column its own view of its own ribbon, and
// cheaply, as the reference draws its one: a column's ribbon is one instanced draw (each picture an
// instance of one strip of quads, which the vertex shader bends round the spiral from where along it
// the picture starts; its picture a layer of its event's texture array), solid, with the depth test
// (its inside dimmed in the same draw), and one more for the near side's soft shadow; so a frame is a
// couple of draws a column and a few numbers a picture, nothing rebuilt. The top's fade is a CSS mask
// on the canvas (gallery.css); a picture coming in fades in from the page's colour.
// Left alone, the pictures drift slowly on down the ribbons. The wheel, a swipe or a mouse dragged up
// or down on the columns, or the arrow keys up and down give every column's pictures a push along
// their ribbons (the drift stopping a moment), which runs on and slows, the spirals leaning a
// little with the speed; while the page is at its top the wheel is the spirals' alone ("Footer" goes on
// down). Across, the events go round and round either way (a trackpad's swipe, Shift and the wheel, a
// swipe or drag, the left and right keys, the arrow at the right, or an event's name), the row moved by
// this script in step with the drawing. A picture clicked opens whole in the lightbox
// (src/ui/gallery.js), through its link, which stays in its column, unseen: the keyboard's focus on one
// brings it to the front and rings its column.
// For a low-end device: only the pictures on a column's stretch of ribbon are drawn, their pictures
// fetched as they come near (a few at a time, nearest the front first, decoded and resized away from
// the page's own thread), as small as the screen draws them, the least lately drawn let go when an
// event's layers are full; only the columns on the screen, only while something moves. Without WebGL 2,
// or where the device would rather not (prefersStatic), the columns stay plain grids and the page
// scrolls as any other. With reduced motion the pictures move as far as the wheel says at once.
import { frameGate, liteTier, phoneTier, pixelRatio, probeWebGL, prefersStatic } from '../util/env.js';

const TAU = Math.PI * 2;
// the ribbon (world units; its radius 1)
const R = 1;
const H = 0.85;                 // its height: every picture this tall, as wide as its own shape makes it (a broad band)
const PITCH = H + 0.36;         // how far it rises a turn, going round to the right (its turns 0.36 apart, edge to edge)
const CONE = -0.04;             // a little narrower towards the top: its radius's share less a unit up
const GAP = 0.012;              // between pictures along it (all but edge to edge)
const INSIDE = 0.42;            // the inside's brightness (its far side, seen over and beside the turn in front:
                                // well dimmed, so it reads as behind and the front stands clear of it)
const TONE = { sat: 0.7, dim: 0.84, plum: 0.1 }; // the pictures toned down to sit with the page (see FRAG)
const SHADOW = 0.5;             // how dark the near side's shadow on the far side is, at most
const FOV = (38 * Math.PI) / 180; // the camera's lens (near and wide, as the reference's)
const ELEVATION = 0.2;          // the camera's angle above it (radians); with its wide lens the top turn is
                                // seen all but level and the lower ones from above, as the reference's are
const LEAN_Z = 0.12;            // aslant, its top to the left, as the reference's is (radians)
const ZOOM = 0.92;              // its width to its column's, at its middle
const MIN_TURNS = 1.25;         // and at least this many of its turns down a column (a wide, short one)
const MIN_D = 3.2;              // and the camera never nearer than this (in a short window, the near side not blown up)
const FADE_PICK = 40;           // pixels at a column's top where a click opens nothing (faded)
const MAX_INST = 160;           // pictures a column draws at most
// the motion: a push along the ribbon (ribbon a frame) that runs on, slowing by FRICTION a frame, and
// comes in eased (EASE); the spirals lean with the speed
const WHEEL = 0.0011;           // the push a pixel of wheel
const KEY = 0.12;               // the push an arrow key
const DRAG = 0.011;             // ribbon a pixel of a mouse or a finger dragged
const FRICTION = 0.9;
const EASE = 0.25;
const MAX_V = 0.5;
const LEAN = 0.8, MAX_LEAN = 0.18;
// left alone, the pictures drift on along the ribbon, slowly, the way the wheel turned down takes them
// (AUTO, ribbon a second); a push, a drag or a finger stops the drift, which comes back in over
// AUTO_BACK frames once the spirals have come to rest (not with reduced motion; not while the spirals
// are off the screen or the tab hidden)
const AUTO = 0.22, AUTO_BACK = 90;
// across: the row glides to rest on an event, easing out (ACROSS_EASE of the way left, a frame; no
// spring, nothing run past); a let-go swipe carries on by its speed times FLING before it settles
const ACROSS_EASE = 0.15, FLING = 10;

// ---- the shaders: a picture's strip bent round the spiral (the instance: where along the ribbon it
// starts from the front, its length, its layer, how far it has faded in) ----
const BEND = `
  float u = aInst.x + aUv.x * aInst.y;
  float ang = u / uRibbon.x;
  float y = ang / ${TAU.toFixed(8)} * uRibbon.y;
  float r = uRibbon.x * (1.0 + uRibbon.w * y);`;
const VERT = `#version 300 es
layout(location = 0) in vec2 aUv;
layout(location = 1) in vec4 aInst;
uniform mat4 uMVP;
uniform vec4 uRibbon; // the radius, the rise a turn, the height, the cone
out vec2 vUv;
flat out float vLayer;
out float vShow;
void main() {${BEND}
  vUv = aUv;
  vLayer = aInst.z;
  vShow = aInst.w;
  gl_Position = uMVP * vec4(sin(ang) * r, y + (aUv.y - 0.5) * uRibbon.z, cos(ang) * r, 1.0);
}`;
// (the pictures' colours toned down: a little less saturated, a little dimmer, a touch of the page's
// plum over them, so the brightest do not glare out of it; the inside dimmed; a picture coming in
// faded in from the page's colour; sRGB in and out)
const FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
in vec2 vUv;
flat in float vLayer;
in float vShow;
uniform sampler2DArray uTex;
uniform float uInside;
uniform vec3 uBg;
out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vec3(vUv, vLayer)).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, ${TONE.sat.toFixed(2)}) * ${TONE.dim.toFixed(2)};
  c = mix(c, vec3(0.25, 0.08, 0.16), ${TONE.plum.toFixed(2)});
  if (!gl_FrontFacing) c *= uInside;
  outColor = vec4(mix(uBg, c, vShow), 1.0);
}`;
// a picture's shadow: its strip on the near side (front faces only), a little taller, a little lower
// and a hair inside the ribbon, soft at its top and bottom, drawn after the ribbon with the depth test:
// hidden behind the near side, it darkens the far side under it (seamless from picture to picture)
const SHADOW_VERT = `#version 300 es
layout(location = 0) in vec2 aUv;
layout(location = 1) in vec4 aInst;
uniform mat4 uMVP;
uniform vec4 uRibbon;
out vec2 vUv;
out float vShow;
void main() {
  float u = aInst.x - ${(GAP / 2).toFixed(4)} + aUv.x * (aInst.y + ${GAP.toFixed(4)});
  float ang = u / uRibbon.x;
  float y = ang / ${TAU.toFixed(8)} * uRibbon.y;
  float r = uRibbon.x * (1.0 + uRibbon.w * y) * 0.993;
  vUv = aUv;
  vShow = aInst.w;
  gl_Position = uMVP * vec4(sin(ang) * r, y - 0.07 + (aUv.y - 0.5) * uRibbon.z * 1.32, cos(ang) * r, 1.0);
}`;
const SHADOW_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
in float vShow;
out vec4 outColor;
void main() {
  float soft = smoothstep(0.0, 0.26, vUv.y) * smoothstep(0.0, 0.26, 1.0 - vUv.y);
  outColor = vec4(0.03, 0.0, 0.02, ${SHADOW.toFixed(2)} * vShow * soft);
}`;

/** A point on the ribbon (as the vertex shader places it): `u` along it from the front, `v` up it (0-1). */
function ribbonAt(u, v, out) {
  const ang = u / R;
  const y = (ang / TAU) * PITCH;
  const r = R * (1 + CONE * y);
  out[0] = Math.sin(ang) * r;
  out[1] = y + (v - 0.5) * H;
  out[2] = Math.cos(ang) * r;
  return out;
}

// ---- 4x4 matrices, column-major, as WebGL takes them ----
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const perspective = (fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
};
// (a camera at e looking at the middle of the ribbon, upright)
const lookAtOrigin = (ex, ey, ez) => {
  let zl = Math.hypot(ex, ey, ez);
  const zx = ex / zl, zy = ey / zl, zz = ez / zl;
  let xx = zz, xy = 0, xz = -zx; // up (0,1,0) x z
  zl = Math.hypot(xx, xy, xz);
  xx /= zl; xz /= zl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1]);
};
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };

/** @param {{ reduced: boolean, onTheme?: (fn: () => void) => void }} ctx  bootPage's context @returns {() => void} cleanup */
export function setupSpirals(ctx) {
  const { reduced } = ctx;
  const track = document.querySelector('[data-gal-track]');
  const view = track?.querySelector('[data-gal-view]');
  const row = view?.querySelector('[data-gal-cols]');
  const originals = row ? [...row.querySelectorAll('[data-gal-col]')] : [];
  if (!track || !view || !row || !originals.length) return () => {};
  // (where the spirals do not run, the plain grids stay, their pictures shown: .is-static, gallery.css)
  const still = () => { track.classList.add('is-static'); return () => track.classList.remove('is-static'); };
  const probe = probeWebGL();
  if (!probe.ok || prefersStatic(probe.renderer)) return still();
  const lite = liteTier();
  // a picture's layer: as tall as the spirals draw their pictures on the screen (texH, grown to it in
  // draw), at most LAYER_MAX, and half as wide again (each picture stretched to it, and back by its
  // strip's own length); an event's layers, LAYERS at most (its pictures on the screen and near it)
  const LAYER_MAX = lite ? 200 : phoneTier() ? 320 : 400;
  const LAYERS = lite ? 40 : 48;
  let texH = lite ? 160 : 240;
  const SEG = lite ? 14 : 24;      // the quads a picture is bent in
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));
  const mod = (a, b) => ((a % b) + b) % b;

  // ---- WebGL 2: the canvas, the two programs, the strip, the instances ----
  const canvas = document.createElement('canvas');
  canvas.className = 'gal-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: !lite, depth: true, stencil: false, powerPreference: 'low-power' });
  if (!gl) return still();
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
    console.warn('Gallery spiral shader:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  };
  const program = (vsrc, fsrc) => {
    const vs = compile(gl.VERTEX_SHADER, vsrc), fs = compile(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
    gl.deleteProgram(p);
    return null;
  };
  const ribbonP = program(VERT, FRAG);
  const shadowP = lite ? null : program(SHADOW_VERT, SHADOW_FRAG);
  if (!ribbonP || (!lite && !shadowP)) return still();
  const loc = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
  const U = loc(ribbonP, ['uMVP', 'uRibbon', 'uTex', 'uInside', 'uBg']);
  const S = shadowP ? loc(shadowP, ['uMVP', 'uRibbon']) : null;
  // the strip: SEG quads, two vertices (bottom, top) at each step along it
  const uvs = new Float32Array((SEG + 1) * 4);
  for (let i = 0; i <= SEG; i++) uvs.set([i / SEG, 0, i / SEG, 1], i * 4);
  const tris = new Uint16Array(SEG * 6);
  for (let i = 0; i < SEG; i++) { const a = i * 2; tris.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6); }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, MAX_INST * 16, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tris, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const inst = new Float32Array(MAX_INST * 4);
  gl.useProgram(ribbonP);
  gl.uniform4f(U.uRibbon, R, PITCH, H, CONE);
  gl.uniform1i(U.uTex, 0);
  gl.uniform1f(U.uInside, INSIDE);
  if (S) { gl.useProgram(shadowP); gl.uniform4f(S.uRibbon, R, PITCH, H, CONE); }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.clearColor(0, 0, 0, 0);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  // the page's colour, which a picture coming in fades in from (and again when the theme changes)
  const readBg = () => {
    for (const el of [document.body, document.documentElement]) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && (m[3] === undefined || +m[3] > 0)) {
        gl.useProgram(ribbonP);
        gl.uniform3f(U.uBg, m[0] / 255, m[1] / 255, m[2] / 255);
        return;
      }
    }
  };
  readBg();

  view.append(canvas);
  track.classList.add('is-live');
  // (the columns' own small pictures are never shown or fetched while the spirals run, gallery.css: each
  // picture's link named by its picture's words instead)
  originals.forEach((col) => col.querySelectorAll('[data-gal-photo]').forEach((a) => {
    const img = a.querySelector('img');
    if (img?.alt) a.setAttribute('aria-label', img.alt);
  }));
  // (a lost context: the plain grids instead)
  let lost = false;
  on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); lost = true; track.classList.remove('is-live'); track.classList.add('is-static'); });

  // the events round and round, across: the columns twice more, a set before them and a set after
  // (copies without their pictures' links, hidden from screen readers and the keyboard), and the row
  // kept on the middle set (keepRound, below), so that going on either way they come round again
  const N = originals.length;
  // (made without the column's pictures at all: an image made, even out of the page, is fetched)
  const copy = (col) => {
    const c = col.cloneNode(false);
    for (const part of col.children) c.append(part.cloneNode(!part.querySelector('[data-gal-ribbon]')));
    c.removeAttribute('id');
    c.removeAttribute('aria-labelledby');
    c.setAttribute('aria-hidden', 'true');
    c.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    c.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
    return c;
  };
  const before = originals.map(copy), after = originals.map(copy);
  row.prepend(...before);
  row.append(...after);
  cleanups.push(() => [...before, ...after].forEach((c) => c.remove()));
  const cols = [...before, ...originals, ...after];

  // an event: its pictures (the links in its own column), each one's length along the ribbon (its own
  // shape at the ribbon's height); which of them are in (textures: picture -> its layer, null while
  // fetched), and its texture array (made when its first picture is fetched: ensureArray)
  const events = originals.map((col) => {
    const links = [...col.querySelectorAll('[data-gal-photo]')];
    return { links, n: links.length, lenOf: links.map((a) => H * ((+a.dataset.w || 3) / (+a.dataset.h || 2))), textures: new Map(), fails: new Map(), tex: null };
  });
  // a showing of an event: its pictures in an order of their own, by its place in the endless run of
  // events (j: the run's ... A B C D A B C D ..., the middle set's first column 0 + N), shuffled the
  // first time that place is shown and kept for it: `order`, the picture at each place in a round of
  // them (`posOf` the way back), each place's length and where it starts (T: a round's length). A
  // column takes the order of the place it shows (assign), and the columns are re-used as the row goes
  // round (keepRound counts the sets gone round, `loop`): every appearance, either way, its own order
  const shuffled = (n) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const orders = new Map();
  const orderFor = (j) => {
    let o = orders.get(j);
    if (!o) {
      const ev = events[mod(j, N)];
      const order = shuffled(ev.n);
      const posOf = [];
      order.forEach((idx, p) => { posOf[idx] = p; });
      const len = order.map((idx) => ev.lenOf[idx]);
      const start = [];
      let T = 0;
      len.forEach((l) => { start.push(T); T += l + GAP; });
      o = { order, posOf, len, start, T };
      orders.set(j, o);
    }
    return o;
  };
  let loop = 0;
  const columns = cols.map((col, i) => {
    const ev = events[i % N];
    return { ev, links: ev.links, n: ev.n, textures: ev.textures, i, j: null, col, box: col.querySelector('.gal-spiral'), active: new Map(), vp: null, mvp: null };
  });
  // (a column given the order of the place in the run it now shows; its pictures placed anew)
  const assign = (c) => {
    const j = c.i + loop * N;
    if (c.j === j) return;
    c.j = j;
    Object.assign(c, orderFor(j));
    c.active.clear();
  };
  columns.forEach(assign);

  // ---- an event's texture array: a layer a picture, the least lately drawn let go when it is full ----
  let frameNo = 0;
  const ensureArray = (ev) => {
    if (ev.tex) return;
    ev.lh = Math.max(64, Math.min(LAYER_MAX, Math.round(texH / 8) * 8));
    ev.lw = Math.round((ev.lh * 1.5) / 4) * 4;
    ev.depth = Math.max(1, Math.min(ev.n, LAYERS));
    ev.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, ev.tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, ev.lw, ev.lh, ev.depth);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ev.layerIdx = new Int32Array(ev.depth).fill(-1); // the picture in each layer
    ev.used = new Float64Array(ev.depth);            // the drawing it was last drawn in
    ev.shownAt = new Float64Array(ev.depth);         // when it came in (its fading in)
  };
  // (a free layer, or the one least lately drawn that this drawing did not draw; none: -1)
  const freeLayer = (ev) => {
    let best = -1, oldest = Infinity;
    for (let l = 0; l < ev.depth; l++) {
      if (ev.layerIdx[l] < 0) return l;
      if (ev.used[l] < frameNo && ev.used[l] < oldest) { best = l; oldest = ev.used[l]; }
    }
    return best;
  };

  // ---- a picture fetched: its file as a blob, which the browser decodes and resizes away from the
  // page's own thread to its layer's size, upside down and neither premultiplied nor colour-converted,
  // as the layer's upload wants it (where a browser will not, drawn on a canvas instead) ----
  let kick = () => {};
  const BITMAP = { resizeQuality: 'medium', imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  const viaCanvas = async (url, w, h) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.translate(0, h);
    g.scale(1, -1);
    g.drawImage(img, 0, 0, w, h);
    return cv;
  };
  const toImage = async (url, w, h) => {
    try {
      const blob = await (await fetch(url)).blob();
      return await createImageBitmap(blob, { ...BITMAP, resizeWidth: w, resizeHeight: h });
    } catch {
      return viaCanvas(url, w, h);
    }
  };
  // (pictures in, waiting to go to the GPU: a few a frame, so that no frame stalls on a crowd of them)
  const incoming = [];
  const UPLOADS = lite ? 1 : 2;
  const SHOW_MS = reduced ? 0 : 260; // a picture's fading in, once it is in
  let showUntil = 0;
  const upload = () => {
    for (let i = 0; i < UPLOADS && incoming.length; i++) {
      const { ev, idx, img } = incoming.shift();
      if (ev.textures.get(idx) !== null) { img.close?.(); continue; } // (let go meanwhile)
      const layer = freeLayer(ev);
      if (layer < 0) { img.close?.(); ev.textures.delete(idx); continue; } // (every layer drawn: asked for again later)
      const old = ev.layerIdx[layer];
      if (old >= 0) ev.textures.delete(old);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, ev.tex);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, ev.lw, ev.lh, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
      img.close?.();
      const at = performance.now();
      ev.layerIdx[layer] = idx;
      ev.shownAt[layer] = at;
      ev.used[layer] = frameNo;
      ev.textures.set(idx, layer);
      showUntil = Math.max(showUntil, at + SHOW_MS);
    }
    return incoming.length > 0;
  };
  // the pictures wanted, fetched a few at a time (LOADS) in the order asked, nearest the front first:
  // a column coming in does not fetch and decode its whole stretch of ribbon in one go
  const queue = [];
  let loading = 0;
  const LOADS = lite ? 6 : 16;
  const want = (ev, idx) => {
    if (ev.textures.has(idx)) return;
    ev.textures.set(idx, null);
    queue.push({ ev, idx });
  };
  const pump = () => {
    while (loading < LOADS && queue.length) {
      const { ev, idx } = queue.shift();
      if (ev.textures.get(idx) !== null) continue; // (let go before its turn)
      loading++;
      load(ev, idx).finally(() => { loading--; pump(); kick(); });
    }
  };
  const load = (ev, idx) => {
    ensureArray(ev);
    const src = ev.links[idx].querySelector('img');
    return toImage(src.currentSrc || src.src, ev.lw, ev.lh)
      .then((img) => {
        if (ev.textures.get(idx) !== null) { img.close?.(); return; } // (let go meanwhile)
        incoming.push({ ev, idx, img });
        kick();
      })
      .catch(() => {
        // (a picture that would not come: let go, so that it is asked for again, a few times at most,
        // rather than left out)
        const n = (ev.fails.get(idx) || 0) + 1;
        ev.fails.set(idx, n);
        if (n < 4 && ev.textures.get(idx) === null) ev.textures.delete(idx);
      });
  };

  // ---- the pictures at `off` (how far they have come along the ribbon, on and on) ----
  let off = 0.45, cur = 0, tgt = 0, seek = null, lean = 0;
  let drift = reduced ? 0 : 1; // (the drift's share of its speed: 0 just after the reader moved them)
  let inView = true;
  // the picture (its number in the endless run) at `s` along a column's run, and where one starts
  const pictureAt = (c, s) => {
    const round = Math.floor(s / c.T);
    const w = s - round * c.T;
    let lo = 0, hi = c.n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (c.start[m] <= w) lo = m; else hi = m - 1;
    }
    return round * c.n + lo;
  };
  const startOf = (c, k) => Math.floor(k / c.n) * c.T + c.start[mod(k, c.n)];
  let now = 0;
  // (the pictures a drawing lacks, by how far each is from its column's front: asked for nearest first
  // across all the columns, so every spiral's front fills in before any spiral's far turns)
  const asks = [];
  // the column's stretch of ribbon (`reach` along it either way from the front) filled with pictures
  const place = (c, reach) => {
    const kLo = pictureAt(c, off - reach);
    const kHi = Math.min(pictureAt(c, off + reach), kLo + MAX_INST - 1);
    for (const k of c.active.keys()) if (k < kLo || k > kHi) c.active.delete(k);
    const front = pictureAt(c, off);
    for (let k = kLo; k <= kHi; k++) {
      let s = c.active.get(k);
      if (!s) {
        const p = mod(k, c.n);
        s = { k, idx: c.order[p], len: c.len[p], start: 0, layer: -1 };
        c.active.set(k, s);
      }
      s.start = startOf(c, k) - off;
      const layer = c.textures.get(s.idx);
      s.layer = typeof layer === 'number' ? layer : -1;
      if (layer === undefined) asks.push([Math.abs(k - front), c.ev, s.idx]);
    }
  };

  // ---- drawing: each column on the screen, in its own part of the canvas ----
  let size = { w: 0, h: 0 }, ratio = 1, fadeAt = '';
  const resize = () => {
    const w = view.clientWidth, h = view.clientHeight;
    size = { w, h };
    ratio = pixelRatio(2, w, h);
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
  };
  const draw = () => {
    if (lost) return;
    now = performance.now();
    frameNo++;
    asks.length = 0;
    const vr = view.getBoundingClientRect();
    const pr = ratio;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.activeTexture(gl.TEXTURE0);
    const tilt = mul(rotX(lean), rotZ(LEAN_Z + lean * 0.4)); // (as the spirals lean with the speed)
    let top = Infinity, fadeH = 0;
    for (const c of columns) {
      assign(c);
      const r = c.box.getBoundingClientRect();
      // (each column's part reaches well past its sides: its ribbon is not cut there; neighbours' parts
      // overlap, drawn over one another as they come)
      const side = colGap / 2 + r.width * 0.3;
      const x = r.left - vr.left - side, y = r.top - vr.top, w = r.width + side * 2, h = r.height;
      c.vp = null;
      if (x + w <= 0 || x >= size.w || r.width < 2 || h < 2) continue;
      c.vp = { left: r.left - side, top: r.top, w, h };
      top = Math.min(top, y);
      fadeH = Math.max(fadeH, Math.min(110, h * 0.22));
      // the camera above the ribbon, near enough that the ribbon is the column's width at its middle,
      // but far enough that a turn and a quarter of it shows down the column
      const aspect = w / h;
      const tan = Math.tan(FOV / 2);
      const d = Math.max((w / 2) / (tan * aspect * ZOOM * (r.width / 2)), (MIN_TURNS * PITCH) / (2 * tan), MIN_D);
      // the layers as tall as the pictures come out at the front of the ribbon, on this screen
      texH = Math.max(texH, Math.min(LAYER_MAX, Math.ceil((H * ZOOM * (r.width / 2) * (d / (d - 1)) * pr) / 40) * 40));
      // as much ribbon as the column shows, and most of a turn more either way
      place(c, ((d * tan) / PITCH + 0.8) * TAU * R);
      c.mvp = mul(perspective(FOV, aspect, 0.1, 60), mul(lookAtOrigin(0, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION)), tilt));
      // the pictures that are in, as instances (where each starts, its length, its layer, its fading in)
      const ev = c.ev;
      let n = 0;
      for (const s of c.active.values()) {
        if (s.layer < 0 || n >= MAX_INST) continue;
        inst[n * 4] = s.start;
        inst[n * 4 + 1] = s.len;
        inst[n * 4 + 2] = s.layer;
        inst[n * 4 + 3] = SHOW_MS ? Math.min(1, (now - ev.shownAt[s.layer]) / SHOW_MS) : 1;
        ev.used[s.layer] = frameNo;
        n++;
      }
      if (!n) continue;
      const X = Math.round(x * pr), Y = Math.round((size.h - y - h) * pr), W = Math.round(w * pr), HH = Math.round(h * pr);
      gl.viewport(X, Y, W, HH);
      gl.scissor(X, Y, W, HH);
      gl.clear(gl.DEPTH_BUFFER_BIT); // (a column's depth its own: its part overlaps its neighbours')
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, n * 4);
      // the ribbon, solid, both its sides (the inside dimmed by the shader)
      gl.useProgram(ribbonP);
      gl.uniformMatrix4fv(U.uMVP, false, c.mvp);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, ev.tex);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.drawElementsInstanced(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0, n);
      // the near side's shadow over the far side
      if (shadowP) {
        gl.useProgram(shadowP);
        gl.uniformMatrix4fv(S.uMVP, false, c.mvp);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.drawElementsInstanced(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0, n);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
      }
    }
    gl.bindVertexArray(null);
    // the top's fade: a mask on the canvas, from the spirals' top down (gallery.css)
    if (top !== Infinity) {
      const at = `${Math.round(top)}px ${Math.round(top + fadeH)}px`;
      if (at !== fadeAt) {
        fadeAt = at;
        canvas.style.setProperty('--gal-fade-a', `${Math.round(top)}px`);
        canvas.style.setProperty('--gal-fade-b', `${Math.round(top + fadeH)}px`);
      }
    }
    asks.sort((a, b) => a[0] - b[0]).forEach(([, ev, idx]) => want(ev, idx));
    pump(); // (the pictures this drawing asked for fetched at once, not on a later frame)
  };

  // ---- across: the row moved by us, not by the browser's own sideways scroll (which the browser runs
  // ahead of the canvas, so the spirals would trail their names): the row's place and the spirals'
  // drawing change in the same frame. pos: how far the row has come (a column's step, spacing, a
  // column further on; at 0 the first column, a copy of the first event, in the first place, as
  // gallery.css lays it out), round and round: kept on the middle set (keepRound) ----
  let spacing = 1, setW = 1, colGap = 0, shown = NaN;
  const hx = { pos: 0, target: null, drag: null };
  const measure = () => {
    const a = cols[0].getBoundingClientRect().left;
    spacing = cols[1].getBoundingClientRect().left - a || 1;
    setW = cols[N].getBoundingClientRect().left - a || spacing * N;
    colGap = parseFloat(getComputedStyle(row).columnGap) || 0;
  };
  const keepRound = () => {
    const lo = N * spacing - spacing / 2;
    const by = hx.pos < lo ? setW : hx.pos >= lo + setW ? -setW : 0;
    if (!by) return;
    hx.pos += by;
    loop += by > 0 ? -1 : 1; // (the columns now show the run a set further on, or back)
    if (hx.target !== null) hx.target += by;
  };
  // a frame's move: easing out to where it comes to rest (or there at once with reduced motion)
  const across = (k) => {
    if (hx.target !== null && !hx.drag) {
      if (reduced) { hx.pos = hx.target; hx.target = null; }
      else {
        hx.pos += (hx.target - hx.pos) * (1 - Math.pow(1 - ACROSS_EASE, k));
        if (Math.abs(hx.target - hx.pos) < 0.25) { hx.pos = hx.target; hx.target = null; }
      }
    }
    keepRound();
    const t = Math.round(hx.pos * 100) / 100;
    if (t !== shown) { shown = t; row.style.transform = `translate3d(${-t}px, 0, 0)`; }
    return hx.target !== null;
  };
  const restOn = (place) => { hx.target = place * spacing; kick(); };
  const step = (n) => restOn(Math.round((hx.target ?? hx.pos) / spacing) + n);
  // (on a laptop's screen an event brought into view stands in the second place, whole, the one
  // before it cut at the left; on a phone, in the first)
  const lead = () => (matchMedia('(min-width: 768px)').matches ? 1 : 0);
  // a column's nearest showing brought into view
  const bring = (i) => {
    const at = (j) => (j - lead()) * spacing;
    const best = [i - N, i, i + N].filter((j) => j >= lead() && j < cols.length).reduce((a, b) => (Math.abs(at(b) - hx.pos) < Math.abs(at(a) - hx.pos) ? b : a));
    restOn(best - lead());
  };

  // ---- a frame, only while something moves: the push running on, a picture coming to the front, the
  // lean settling, the row coming to rest, pictures going in or fading in ----
  let raf = 0, last = 0;
  let drag = null; // a mouse or a finger dragging up or down: { y, moved, v, t }
  const gate = frameGate(30); // (on a tier-lite device, a steady 30 frames a second: the drift runs on)
  const drifting = () => !reduced && inView && document.visibilityState === 'visible';
  const frame = (t) => {
    raf = 0;
    if (!gate(t)) { raf = requestAnimationFrame(frame); return; }
    const k = last ? Math.min(3, (t - last) / (1000 / 60)) : 1;
    last = t;
    if (seek !== null) {
      off += reduced ? seek - off : (seek - off) * (1 - Math.pow(0.84, k));
      if (Math.abs(seek - off) < 0.001) { off = seek; seek = null; }
    } else if (!drag) {
      tgt *= Math.pow(FRICTION, k);
      cur += (tgt - cur) * (1 - Math.pow(1 - EASE, k));
      off += cur * k;
      if (Math.abs(cur) < 1e-4 && Math.abs(tgt) < 1e-4) cur = tgt = 0;
    }
    // the drift: on, slowly, down the ribbon's way as the wheel turned down goes (coming back in once
    // the reader's push has died away)
    if (drifting() && !drag && seek === null) {
      if (!cur && !tgt) drift = Math.min(1, drift + k / AUTO_BACK);
      off -= ((AUTO * drift) / 60) * k;
    }
    const goal = reduced ? 0 : clamp((drag ? drag.v : cur) * LEAN, MAX_LEAN);
    lean += (goal - lean) * (1 - Math.pow(0.88, k));
    if (Math.abs(goal - lean) < 1e-4) lean = goal;
    const moving = across(k);
    const uploading = upload();
    draw();
    const fading = performance.now() < showUntil;
    if (seek !== null || cur || tgt || lean || drag || moving || uploading || fading || drifting()) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  kick = () => { if (!lost) raf ||= requestAnimationFrame(frame); };
  cleanups.push(() => cancelAnimationFrame(raf));
  // a push along the ribbon (with reduced motion, as far as it would have run, at once)
  const push = (v) => {
    seek = null;
    drift = 0;
    if (reduced) off += v / (1 - FRICTION);
    else tgt = clamp(tgt + v, MAX_V);
    track.classList.add('is-moved');
    kick();
  };

  // the wheel, while the page is at its top: up and down, the spirals'; across (a trackpad's sideways
  // swipe, or Shift and the wheel), the row's, which comes to rest on an event once the wheel stops
  const atTop = () => scrollY < 4;
  let wheelRest = 0;
  cleanups.push(() => clearTimeout(wheelRest));
  on(window, 'wheel', (e) => {
    if (e.ctrlKey || !atTop()) return;
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) {
      const by = Math.abs(dx) > 0 ? dx : dy;
      if (!by) return;
      e.preventDefault();
      hx.target = null;
      hx.pos += by;
      clearTimeout(wheelRest);
      wheelRest = setTimeout(() => step(0), 120);
      kick();
      return;
    }
    if (!dy) return;
    e.preventDefault();
    push(-dy * WHEEL); // (down the page: the pictures up the ribbon)
  }, { passive: false });

  // a drag up or down: the pictures follow it, and run on from it when let go
  const dragTo = (y) => {
    drift = 0;
    const dy = y - drag.y;
    drag.y = y;
    const by = dy * DRAG; // (the pictures following the pointer)
    off += by;
    drag.v = drag.v * 0.6 + by * 0.4;
    drag.t = performance.now();
    seek = null;
    track.classList.add('is-moved');
    kick();
  };
  const letGo = () => {
    if (!drag) return;
    const fresh = performance.now() - drag.t < 90; // (held still before letting go: no running on)
    if (drag.moved && fresh && !reduced) { cur = tgt = clamp(drag.v, MAX_V); }
    drag = null;
    columns.forEach((c) => c.box.classList.remove('is-dragging'));
    kick();
  };
  // a drag across: the row follows it, and when let go glides to rest on the event its speed carries
  // it to
  const acrossFrom = (x) => { hx.drag = { x, v: 0, t: performance.now() }; hx.target = null; };
  const acrossTo = (x) => {
    const dx = x - hx.drag.x;
    hx.drag.x = x;
    hx.pos -= dx;
    hx.drag.v = hx.drag.v * 0.6 - dx * 0.4;
    hx.drag.t = performance.now();
    kick();
  };
  const acrossLetGo = () => {
    if (!hx.drag) return;
    const v = !reduced && performance.now() - hx.drag.t < 90 ? hx.drag.v : 0;
    hx.drag = null;
    columns.forEach((c) => c.box.classList.remove('is-dragging'));
    restOn(Math.round((hx.pos + v * FLING) / spacing));
  };
  // a finger: up or down, or across, whichever it starts with
  let touch = null;
  on(view, 'touchstart', (e) => {
    touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null } : null;
    if (touch) { cur = tgt = 0; }
  }, { passive: true });
  on(view, 'touchmove', (e) => {
    if (!touch || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!touch.dir) {
      const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
      if (Math.hypot(dx, dy) < 6) return;
      touch.dir = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (touch.dir === 'y') drag = { y: touch.y, moved: true, v: 0, t: performance.now() };
      else acrossFrom(touch.x);
    }
    if (touch.dir === 'y' && drag) dragTo(t.clientY);
    else if (touch.dir === 'x' && hx.drag) acrossTo(t.clientX);
  }, { passive: true });
  const touchEnd = () => {
    if (touch?.dir === 'y') letGo();
    else if (touch?.dir === 'x') acrossLetGo();
    touch = null;
  };
  on(view, 'touchend', touchEnd, { passive: true });
  on(view, 'touchcancel', touchEnd, { passive: true });
  // a mouse, on a column's ribbon: up or down, or across, whichever it starts with
  const columnAt = (e) => columns.find((c) => c.box.contains(e.target));
  let press = null;
  on(view, 'pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !columnAt(e)) return;
    e.preventDefault(); // (no text selected by the drag)
    cur = tgt = 0;
    press = { x: e.clientX, y: e.clientY };
  });
  let hoverFrame = 0, lastMove = null;
  on(window, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (press) {
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (Math.hypot(dx, dy) < 6) return;
      if (Math.abs(dy) >= Math.abs(dx)) drag = { y: press.y, moved: true, v: 0, t: performance.now() };
      else acrossFrom(press.x);
      press = null;
      columns.forEach((c) => c.box.classList.add('is-dragging'));
    }
    if (drag) { dragTo(e.clientY); return; }
    if (hx.drag) { acrossTo(e.clientX); return; }
    lastMove = e;
    hoverFrame ||= requestAnimationFrame(() => {
      hoverFrame = 0;
      const c = columnAt(lastMove);
      columns.forEach((x) => x.box.classList.toggle('is-pointing', x === c && pick(lastMove, x) >= 0));
    });
  }, { passive: true });
  cleanups.push(() => cancelAnimationFrame(hoverFrame));
  let dragged = false;
  on(window, 'pointerup', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (press) { press = null; return; } // (a click)
    if (drag) { dragged = true; letGo(); }
    else if (hx.drag) { dragged = true; acrossLetGo(); }
  });

  // ---- a click: the picture under it (the nearest surface, not in the faded top), found by putting
  // each drawn picture's strip on the screen as the shader does and seeing which quad holds it ----
  const P3 = [0, 0, 0];
  const pts = new Float32Array((SEG + 1) * 2 * 3);
  const ok = new Uint8Array((SEG + 1) * 2);
  const project = (m, o) => {
    const x = P3[0], y = P3[1], z = P3[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) return 0;
    pts[o * 3] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    pts[o * 3 + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    pts[o * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return 1;
  };
  // (the depth at (px, py) if it falls in the triangle a b c, else Infinity)
  const inTri = (px, py, a, b, c) => {
    const ax = pts[a * 3], ay = pts[a * 3 + 1], bx = pts[b * 3], by = pts[b * 3 + 1], cx = pts[c * 3], cy = pts[c * 3 + 1];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) return Infinity;
    const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
    const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) return Infinity;
    return l1 * pts[a * 3 + 2] + l2 * pts[b * 3 + 2] + l3 * pts[c * 3 + 2];
  };
  const pick = (e, c) => {
    const v = c.vp;
    if (!v || !c.mvp || e.clientY < v.top + FADE_PICK || e.clientY > v.top + v.h) return -1;
    const px = ((e.clientX - v.left) / v.w) * 2 - 1, py = -((e.clientY - v.top) / v.h) * 2 + 1;
    let best = -1, nearest = Infinity;
    for (const s of c.active.values()) {
      if (s.layer < 0) continue;
      for (let i = 0; i <= SEG; i++) for (let j = 0; j < 2; j++) {
        ribbonAt(s.start + (i / SEG) * s.len, j, P3);
        ok[i * 2 + j] = project(c.mvp, i * 2 + j);
      }
      for (let i = 0; i < SEG; i++) {
        const a = i * 2, b = i * 2 + 2, t = i * 2 + 1, q = i * 2 + 3;
        if (!(ok[a] && ok[b] && ok[t] && ok[q])) continue;
        const z = Math.min(inTri(px, py, a, b, t), inTri(px, py, t, b, q));
        if (z < nearest) { nearest = z; best = s.idx; }
      }
    }
    return best;
  };
  on(view, 'click', (e) => {
    if (dragged) { dragged = false; e.preventDefault(); e.stopPropagation(); return; }
    const c = columnAt(e);
    if (!c || c.links.includes(e.target.closest('a'))) return;
    const idx = pick(e, c);
    if (idx >= 0) c.links[idx].click();
  }, true);

  // the keys, while the page is at its top: up and down push the pictures along; left and right, the
  // event before or after
  on(window, 'keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !atTop()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
    const sideways = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (sideways) { e.preventDefault(); step(sideways); return; }
    const dir = { ArrowDown: 1, ArrowUp: -1, PageDown: 3, PageUp: -3 }[e.key];
    if (!dir) return;
    e.preventDefault();
    push(-dir * KEY);
  });
  // a picture's link with the keyboard's focus: its column brought into view, the picture to the front
  on(row, 'focusin', (e) => {
    const c = columns.find((x) => x.box.contains(e.target));
    const idx = c ? c.links.indexOf(e.target) : -1;
    columns.forEach((x) => x.box.classList.toggle('is-focus', x === c && idx >= 0));
    const i = cols.findIndex((col) => col.contains(e.target));
    if (i >= 0) bring(i);
    if (idx < 0) return;
    const round = Math.floor(off / c.T);
    const pl = c.posOf[idx];
    const mid = c.start[pl] + c.len[pl] / 2;
    seek = [round - 1, round, round + 1].map((n) => n * c.T + mid).reduce((a, b) => (Math.abs(b - off) < Math.abs(a - off) ? b : a));
    cur = tgt = 0;
    kick();
  });
  on(row, 'focusout', () => columns.forEach((x) => x.box.classList.remove('is-focus')));
  // (the view never scrolls by itself, as a focused link out of sight would have it)
  on(view, 'scroll', () => { view.scrollLeft = 0; view.scrollTop = 0; }, { passive: true });

  // an event's name: its nearest showing brought whole into view
  track.querySelectorAll('[data-gal-to]').forEach((a) => on(a, 'click', (e) => {
    const which = originals.findIndex((c) => c.id === a.dataset.galTo);
    if (which < 0 || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // ours, not the site's in-page glide (src/animations/nav.js)
    bring(N + which);
  }));
  // the arrow at the right: the next event; the one at the bottom: the spirals turned on, as a few turns
  // of the wheel would (their words for a mouse, or for a finger)
  const fine = matchMedia('(pointer: fine)').matches;
  const next = track.querySelector('[data-gal-next]');
  if (next) on(next, 'click', () => step(1));
  const cue = track.querySelector('[data-gal-cue]');
  if (cue && !fine) cue.textContent = 'Swipe to see more';
  const down = track.querySelector('[data-gal-down]');
  if (down) on(down, 'click', () => push(-KEY * 3));
  const downWord = track.querySelector('[data-gal-cue-down]');
  if (downWord && !fine) downWord.textContent = 'Swipe up to see more';
  // the drift stops while the spirals are off the screen (the page gone on down) or the tab hidden, and
  // goes on when they are back
  const io = new IntersectionObserver(([en]) => { inView = en.isIntersecting; if (inView) kick(); });
  io.observe(view);
  cleanups.push(() => io.disconnect());
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  // the theme's change: the page's colour the pictures fade in from
  ctx.onTheme?.(() => { readBg(); kick(); });

  // a change of the window's size: the same event kept in the same place
  let resizeFrame = 0;
  on(window, 'resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const place = Math.round((hx.target ?? hx.pos) / spacing);
      resize();
      measure();
      hx.pos = place * spacing;
      hx.target = null;
      across(1);
      draw();
      kick();
    });
  }, { passive: true });
  cleanups.push(() => cancelAnimationFrame(resizeFrame));

  resize();
  measure();
  // to begin with, the first event's own column in the first place (cut at the left on a laptop)
  hx.pos = N * spacing;
  across(1);
  draw();
  kick(); // (the frame loop fetches the pictures the first drawing asked for, and draws them as they come)
  return () => {
    cleanups.forEach((c) => c());
    row.style.transform = '';
    incoming.forEach(({ img }) => img.close?.());
    events.forEach((ev) => { if (ev.tex) gl.deleteTexture(ev.tex); });
    gl.deleteBuffer(uvBuf);
    gl.deleteBuffer(instBuf);
    gl.deleteBuffer(ibo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(ribbonP);
    if (shadowP) gl.deleteProgram(shadowP);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
    track.classList.remove('is-live');
  };
}

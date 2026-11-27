// The Gallery's spirals (gallery.html, written by tools/pages/build.mjs gallery()), after SpiralGallery:
// in each event's column a ribbon wound round as a spiral, a little narrower as it goes down and seen a
// little from above, that stays where it is while the event's pictures flow along it, edge to edge,
// each as wide as its own shape (none cut to another's), on and on without end (the pictures over and
// over). Drawn with WebGL on one canvas over the columns, each column its own view of its own ribbon:
// the ribbon is placed by the vertex shader (each picture a flat strip of a few dozen quads that the
// shader bends round the spiral from where along it the picture starts), so moving the pictures is a
// number a picture a frame, nothing rebuilt.
// The wheel, a swipe or a mouse dragged up or down on the columns, or the arrow keys up and down give
// every column's pictures a push along their ribbons, which runs on and slows, the spirals leaning a
// little with the speed; while the page is at its top the wheel is the spirals' alone ("Footer" under
// them goes on down). Across, the columns scroll as ever (a swipe, the trackpad, Shift and the wheel,
// the arrows under them, or an event's name). A picture clicked opens whole in the lightbox
// (src/ui/gallery.js), through its link, which stays in its column, unseen: the keyboard's focus on
// one brings it to the front and rings its column. The pictures fade in from the top of their column
// (under the event's name); down, they run to the bottom of the screen.
// For a low-end device: only the pictures on a column's stretch of ribbon are drawn, their pictures
// fetched as they come near, made small for the purpose (and let go as they leave), only the columns
// on the screen, and only while something moves. Without WebGL, or where the device would rather not
// (prefersStatic), the columns stay plain grids and the page scrolls as any other. With reduced motion
// the pictures move as far as the wheel says at once, without running on or leaning.
import * as THREE from 'three';
import { liteTier, phoneTier, pixelRatio, probeWebGL, prefersStatic } from '../util/env.js';

const TAU = Math.PI * 2;
// the ribbon (world units; its radius 1)
const R = 1;
const H = 0.85;                 // its height: every picture this tall, as wide as its own shape makes it (a broad band)
const PITCH = H + 0.36;         // how far it rises a turn, going round to the right (its turns 0.36 apart, edge to edge)
const CONE = -0.04;             // a little narrower towards the top: its radius's share less a unit up
const GAP = 0.012;              // between pictures along it (all but edge to edge)
const INSIDE = 0.42;            // the inside's brightness (its far side, seen over and beside the turn in front:
                                // well dimmed, so it reads as behind and the front stands clear of it)
const TONE = { sat: 0.7, dim: 0.84, plum: 0.1 }; // the pictures toned down (see FRAG)
const SHADOW = 0.5;             // how dark the near side's shadow on the far side is, at most
const ELEVATION = 0.2;          // the camera's angle above it (radians); with its wide lens the top turn is
                                // seen all but level and the lower ones from above, as the reference's are
const LEAN_Z = 0.12;            // aslant, its top to the left, as the reference's is (radians)
const ZOOM = 0.92;              // its width to its column's, at its middle
const MIN_TURNS = 1.25;         // and at least this many of its turns down a column (a wide, short one)
const MIN_D = 3.2;              // and the camera never nearer than this (in a short window, the near side not blown up)
const FADE_PICK = 40;           // pixels at a column's top where a click opens nothing (faded)
// the motion: a push along the ribbon (ribbon a frame) that runs on, slowing by FRICTION a frame, and
// comes in eased (EASE); the spirals lean with the speed
const WHEEL = 0.0011;           // the push a pixel of wheel
const KEY = 0.12;               // the push an arrow key
const DRAG = 0.011;             // ribbon a pixel of a mouse or a finger dragged
const FRICTION = 0.9;
const EASE = 0.25;
const MAX_V = 0.5;
const LEAN = 0.8, MAX_LEAN = 0.18;
// across: the row glides to rest on an event, easing out (ACROSS_EASE of the way left, a frame; no
// spring, nothing run past); a let-go swipe carries on by its speed times FLING before it settles
const ACROSS_EASE = 0.15, FLING = 10;

const VERT = `
uniform float uStart; // where along the ribbon the picture starts, from the front (world units)
uniform float uLen;   // its length along the ribbon
uniform vec4 uRibbon; // the radius, the drop a turn, the height, the cone
varying vec2 vUv;
void main() {
  float u = uStart + uv.x * uLen;
  float ang = u / uRibbon.x;
  float y = ang / ${TAU.toFixed(8)} * uRibbon.y;
  float r = uRibbon.x * (1.0 + uRibbon.w * y);
  vec3 p = vec3(sin(ang) * r, y + (uv.y - 0.5) * uRibbon.z, cos(ang) * r);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// (the pictures' colours toned down to sit with the page: a little less saturated (TONE.sat), a little
// dimmer (TONE.dim), and a touch of the page's plum over them (TONE.plum), so the brightest of them
// do not glare out of it; sRGB in and out. uBox: the column's part of the canvas, its corner and
// size, uFade: how far down from its top the pictures fade in; device pixels)
const FRAG = `
uniform sampler2D uMap;
uniform vec4 uBox;
uniform float uFade;
uniform float uInside;
uniform float uShow;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(vec3(l), c.rgb, ${TONE.sat.toFixed(2)}) * ${TONE.dim.toFixed(2)};
  c.rgb = mix(c.rgb, vec3(0.25, 0.08, 0.16), ${TONE.plum.toFixed(2)});
  if (!gl_FrontFacing) c.rgb *= uInside;
  float a = uShow * smoothstep(0.0, uFade, uBox.y + uBox.w - gl_FragCoord.y);
  gl_FragColor = vec4(c.rgb, a);
}`;
// a picture's shadow: its strip on the near side of the spiral, a little taller and a little lower,
// soft at its top and bottom, drawn dark over the far side before the picture is drawn over it, so
// the near side stands a little in front (seamless from one picture to the next)
const SHADOW_VERT = `
uniform float uStart;
uniform float uLen;
uniform vec4 uRibbon;
varying vec2 vUv;
void main() {
  float u = uStart - ${(GAP / 2).toFixed(4)} + uv.x * (uLen + ${GAP.toFixed(4)});
  float ang = u / uRibbon.x;
  float y = ang / ${TAU.toFixed(8)} * uRibbon.y;
  float r = uRibbon.x * (1.0 + uRibbon.w * y);
  vec3 p = vec3(sin(ang) * r, y - 0.07 + (uv.y - 0.5) * uRibbon.z * 1.32, cos(ang) * r);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const SHADOW_FRAG = `
uniform vec4 uBox;
uniform float uFade;
uniform float uShow;
varying vec2 vUv;
void main() {
  float soft = smoothstep(0.0, 0.26, vUv.y) * smoothstep(0.0, 0.26, 1.0 - vUv.y);
  float a = ${SHADOW.toFixed(2)} * uShow * soft * smoothstep(0.0, uFade, uBox.y + uBox.w - gl_FragCoord.y);
  gl_FragColor = vec4(0.03, 0.0, 0.02, a);
}`;

/** A point on the ribbon (as the vertex shader places it): `u` along it from the front, `v` up it (0-1). */
function ribbonAt(u, v, out) {
  const ang = u / R;
  const y = (ang / TAU) * PITCH;
  const r = R * (1 + CONE * y);
  return out.set(Math.sin(ang) * r, y + (v - 0.5) * H, Math.cos(ang) * r);
}

/** @param {{ reduced: boolean }} ctx  bootPage's context @returns {() => void} cleanup */
export function setupSpirals({ reduced }) {
  const track = document.querySelector('[data-gal-track]');
  const view = track?.querySelector('[data-gal-view]');
  const row = view?.querySelector('[data-gal-cols]');
  const originals = row ? [...row.querySelectorAll('[data-gal-col]')] : [];
  if (!track || !view || !row || !originals.length) return () => {};
  // (where the spirals do not run, the plain grids stay, their pictures shown: .is-static, gallery.css)
  const still = () => { track.classList.add('is-static'); return () => track.classList.remove('is-static'); };
  const gl = probeWebGL();
  if (!gl.ok || prefersStatic(gl.renderer)) return still();
  const lite = liteTier();
  // a picture's height on the ribbon, in texture pixels: as tall as the spirals draw their pictures on
  // the screen (grown to it in draw; at most TEX_MAX, the small pictures' own height on a laptop)
  const TEX_MAX = lite ? 200 : phoneTier() ? 320 : 440;
  let texH = lite ? 160 : 240;
  const SEG = lite ? 14 : 24;      // the quads a picture is bent in
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));
  const mod = (a, b) => ((a % b) + b) % b;

  let renderer;
  const canvas = document.createElement('canvas');
  canvas.className = 'gal-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lite, powerPreference: 'low-power' });
  } catch {
    return still();
  }
  view.append(canvas);
  renderer.setScissorTest(true);
  renderer.autoClear = false; // (cleared once a frame, in draw: the columns' parts overlap, so one must not clear another's)
  renderer.setClearColor(0x000000, 0);
  track.classList.add('is-live');
  // (the columns' own small pictures are never shown or fetched while the spirals run, gallery.css: each
  // picture's link named by its picture's words instead)
  originals.forEach((col) => col.querySelectorAll('[data-gal-photo]').forEach((a) => {
    const img = a.querySelector('img');
    if (img?.alt) a.setAttribute('aria-label', img.alt);
  }));

  // the events round and round, across: the columns twice more, a set before them and a set after
  // (copies without their pictures' links, hidden from screen readers and the keyboard), and the row
  // kept on the middle set (wrap, below), so that going on either way they come round again
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

  // ---- what every picture shares: its strip, the ribbon's shape, the column's part of the canvas ----
  const strip = new THREE.PlaneGeometry(1, 1, SEG, 1);
  const stripUv = strip.attributes.uv;
  const ribbonU = { value: new THREE.Vector4(R, PITCH, H, CONE) };
  const boxU = { value: new THREE.Vector4(0, 0, 1, 1) };
  const fadeU = { value: 1 };
  const insideU = { value: INSIDE };
  // a picture not yet in: drawn as nothing (uShow 0), this only in its place
  const blank = new THREE.DataTexture(new Uint8Array([64, 20, 42, 255]), 1, 1);
  blank.needsUpdate = true;
  const pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  // an event: its pictures (the links in its own column), each one's length along the ribbon (its own
  // shape at the ribbon's height), and their textures, shared by every column showing the event
  const events = originals.map((col) => {
    const links = [...col.querySelectorAll('[data-gal-photo]')];
    return { links, n: links.length, lenOf: links.map((a) => H * ((+a.dataset.w || 3) / (+a.dataset.h || 2))), textures: new Map(), fails: new Map() };
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
      const ev = events[((j % N) + N) % N];
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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60); // (near and wide, as the reference's)
    const group = new THREE.Group();
    scene.add(group);
    return { ...events[i % N], i, j: null, col, box: col.querySelector('.gal-spiral'), scene, camera, group, active: new Map(), pool: [], vp: null };
  });
  // (a column given the order of the place in the run it now shows; its pictures placed anew)
  const assign = (c) => {
    const j = c.i + loop * N;
    if (c.j === j) return;
    c.j = j;
    Object.assign(c, orderFor(j));
    for (const sl of c.active.values()) { sl.meshes.forEach((m) => { m.visible = false; }); c.pool.push(sl); }
    c.active.clear();
  };
  columns.forEach(assign);
  // every column showing an event (the event's own and its copies)
  const showing = (c) => columns.filter((x) => x.textures === c.textures);

  // a picture on the ribbon: its inside (drawn first), its shadow (where it is on the near side; not on
  // a tier-lite device), and its outside (drawn over them), none writing depth, so where the front
  // fades the far side shows through it; and, unseen, its shape for clicks
  const layers = [[THREE.BackSide, 0, VERT, FRAG], ...(lite ? [] : [[THREE.FrontSide, 1, SHADOW_VERT, SHADOW_FRAG]]), [THREE.FrontSide, 2, VERT, FRAG]];
  const makeSlot = (c) => {
    const u = { uStart: { value: 0 }, uLen: { value: 1 }, uMap: { value: blank }, uShow: { value: 0 } };
    const slot = { k: NaN, idx: -1, u, meshes: [], pick: null };
    for (const [side, order, vertexShader, fragmentShader] of layers) {
      const mesh = new THREE.Mesh(strip, new THREE.ShaderMaterial({
        uniforms: { ...u, uRibbon: ribbonU, uBox: boxU, uFade: fadeU, uInside: insideU },
        vertexShader,
        fragmentShader,
        side,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));
      mesh.renderOrder = order;
      mesh.frustumCulled = false; // (the shader moves it)
      c.group.add(mesh);
      slot.meshes.push(mesh);
    }
    const shape = strip.clone();
    slot.pick = new THREE.Mesh(shape, pickMaterial);
    slot.pick.visible = false;
    slot.pick.userData.slot = slot;
    c.group.add(slot.pick);
    return slot;
  };

  // ---- a picture's texture: its small picture, made smaller still ----
  let kick = () => {};
  // (textures in, waiting to go to the GPU: a few a frame, so that no frame stalls on a crowd of them)
  const incoming = [];
  const UPLOADS = lite ? 1 : 2;
  const SHOW_MS = reduced ? 0 : 260; // a picture's fading in, once its texture is in
  let showUntil = 0;
  const upload = () => {
    for (let i = 0; i < UPLOADS && incoming.length; i++) {
      const { c, idx, tex } = incoming.shift();
      if (c.textures.get(idx) !== null) { tex.image?.close?.(); tex.dispose(); continue; } // (let go meanwhile)
      renderer.initTexture(tex);
      tex.userData.at = performance.now();
      showUntil = Math.max(showUntil, tex.userData.at + SHOW_MS);
      c.textures.set(idx, tex);
      showing(c).forEach((x) => x.active.forEach((sl) => { if (sl.idx === idx) sl.u.uMap.value = tex; }));
    }
    return incoming.length > 0;
  };
  // (its file fetched as a blob, which the browser decodes and resizes away from the page's own thread,
  // upside down and neither premultiplied nor colour-converted, as the texture's upload wants it; where
  // a browser will not, the picture drawn on a canvas instead)
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
    return new THREE.CanvasTexture(cv);
  };
  const toTexture = async (url, w, h) => {
    try {
      const blob = await (await fetch(url)).blob();
      return new THREE.Texture(await createImageBitmap(blob, { ...BITMAP, resizeWidth: w, resizeHeight: h }));
    } catch {
      return viaCanvas(url, w, h);
    }
  };
  // the pictures wanted, fetched a few at a time (LOADS) in the order asked, nearest the front first:
  // a column coming in does not fetch and decode its whole stretch of ribbon in one go
  const queue = [];
  let loading = 0;
  const LOADS = lite ? 6 : 16;
  const want = (c, idx) => {
    if (c.textures.has(idx)) return;
    c.textures.set(idx, null);
    queue.push({ c, idx });
  };
  const pump = () => {
    while (loading < LOADS && queue.length) {
      const { c, idx } = queue.shift();
      if (c.textures.get(idx) !== null) continue; // (let go before its turn)
      loading++;
      load(c, idx).finally(() => { loading--; pump(); kick(); });
    }
  };
  const load = (c, idx) => {
    const src = c.links[idx].querySelector('img');
    // (its size: the small picture's, as written on it, at most as tall as the spirals want)
    const sw = +src.getAttribute('width') || 660, sh = +src.getAttribute('height') || 440;
    const h = Math.min(texH, sh), w = Math.max(1, Math.round((h * sw) / sh));
    return toTexture(src.currentSrc || src.src, w, h)
      .then((tex) => {
        if (c.textures.get(idx) !== null) { tex.image?.close?.(); tex.dispose(); return; } // (let go meanwhile)
        tex.flipY = false;
        tex.premultiplyAlpha = false;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        incoming.push({ c, idx, tex });
        kick();
      })
      .catch(() => {
        // (a picture that would not come: let go, so that it is asked for again, a few times at most,
        // rather than left blank)
        const n = (c.fails.get(idx) || 0) + 1;
        c.fails.set(idx, n);
        if (n < 4 && c.textures.get(idx) === null) c.textures.delete(idx);
      });
  };
  // pictures far from the front let go (a column keeps those on its ribbon, and a few more)
  const tidy = (c, mid) => {
    const keep = c.active.size + 16;
    if (c.textures.size <= keep) return;
    const far = [...c.textures.keys()]
      .map((idx) => [Math.min(mod(c.posOf[idx] - mid, c.n), mod(mid - c.posOf[idx], c.n)), idx])
      .sort((a, b) => b[0] - a[0]);
    for (const [, idx] of far.slice(0, c.textures.size - keep)) {
      const tex = c.textures.get(idx);
      c.textures.delete(idx);
      if (tex) {
        showing(c).forEach((x) => x.active.forEach((s) => { if (s.idx === idx) s.u.uMap.value = blank; }));
        tex.image?.close?.();
        tex.dispose();
      }
    }
  };

  // ---- the pictures at `off` (how far they have come along the ribbon, on and on) ----
  let off = 0.45, cur = 0, tgt = 0, seek = null, lean = 0;
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
  // the column's stretch of ribbon (`reach` along it either way from the front) filled with pictures
  let now = 0;
  // (the pictures a drawing lacks, by how far each is from its column's front: asked for nearest first
  // across all the columns, so every spiral's front fills in before any spiral's far turns)
  const asks = [];
  const place = (c, reach) => {
    const kLo = pictureAt(c, off - reach);
    const kHi = Math.min(pictureAt(c, off + reach), kLo + 120);
    for (const [k, s] of c.active) {
      if (k >= kLo && k <= kHi) continue;
      c.active.delete(k);
      s.meshes.forEach((m) => { m.visible = false; });
      c.pool.push(s);
    }
    const missing = [];
    for (let k = kLo; k <= kHi; k++) {
      let s = c.active.get(k);
      if (!s) {
        s = c.pool.pop() || makeSlot(c);
        s.k = k;
        s.idx = c.order[mod(k, c.n)];
        s.u.uLen.value = c.len[mod(k, c.n)];
        s.meshes.forEach((m) => { m.visible = true; });
        c.active.set(k, s);
      }
      // (its texture, asked for if it is not in: another column of the event may have let it go)
      const tex = c.textures.get(s.idx);
      if (tex === undefined) missing.push(k);
      s.u.uMap.value = tex || blank;
      s.u.uShow.value = !tex ? 0 : SHOW_MS ? Math.min(1, (now - (tex.userData.at || 0)) / SHOW_MS) : 1;
      s.u.uStart.value = startOf(c, k) - off;
    }
    if (missing.length) {
      const front = pictureAt(c, off);
      missing.forEach((k) => asks.push([Math.abs(k - front), c, c.order[mod(k, c.n)]]));
    }
    tidy(c, mod(pictureAt(c, off), c.n));
  };

  // ---- drawing: each column on the screen, in its own part of the canvas ----
  let size = { w: 0, h: 0 };
  const resize = () => {
    const w = view.clientWidth, h = view.clientHeight;
    size = { w, h };
    renderer.setPixelRatio(pixelRatio(2, w, h));
    renderer.setSize(w, h, false);
  };
  const draw = () => {
    now = performance.now();
    asks.length = 0;
    const vr = view.getBoundingClientRect();
    const pr = renderer.getPixelRatio();
    // each column's part reaches well past its sides (its ribbon is not cut there; neighbours' parts
    // overlap, drawn over one another as they come)
    const gap = colGap;
    renderer.setScissor(0, 0, size.w, size.h);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.clear();
    for (const c of columns) {
      assign(c);
      const r = c.box.getBoundingClientRect();
      const side = gap / 2 + r.width * 0.3;
      const x = r.left - vr.left - side, y = r.top - vr.top, w = r.width + side * 2, h = r.height;
      c.vp = null;
      if (x + w <= 0 || x >= size.w || r.width < 2 || h < 2) continue;
      c.vp = { left: r.left - side, top: r.top, w, h };
      // the camera above the ribbon, near enough that the ribbon is the column's width at its middle,
      // but far enough that a turn and a quarter of it shows down the column
      const cam = c.camera;
      cam.aspect = w / h;
      const tan = Math.tan((cam.fov * Math.PI) / 360);
      const d = Math.max((w / 2) / (tan * cam.aspect * ZOOM * (r.width / 2)), (MIN_TURNS * PITCH) / (2 * tan), MIN_D);
      cam.position.set(0, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      c.group.rotation.set(lean, 0, LEAN_Z + lean * 0.4);
      // the textures as tall as the pictures come out at the front of the ribbon, on this screen
      texH = Math.max(texH, Math.min(TEX_MAX, Math.ceil((H * ZOOM * (r.width / 2) * (d / (d - 1)) * pr) / 40) * 40));
      // as much ribbon as the column shows, and most of a turn more either way
      place(c, ((d * tan) / PITCH + 0.8) * TAU * R);
      const vy = size.h - (y + h);
      boxU.value.set(x * pr, vy * pr, w * pr, h * pr);
      fadeU.value = Math.min(110, h * 0.22) * pr;
      renderer.setViewport(x, vy, w, h);
      renderer.setScissor(x, vy, w, h);
      renderer.render(c.scene, cam);
    }
    asks.sort((a, b) => a[0] - b[0]).forEach(([, c, idx]) => want(c, idx));
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
  // lean settling, the row coming to rest, textures going in ----
  let raf = 0, last = 0;
  let drag = null; // a mouse or a finger dragging up or down: { y, moved, v, t }
  const frame = (now) => {
    raf = 0;
    const k = last ? Math.min(3, (now - last) / (1000 / 60)) : 1;
    last = now;
    if (seek !== null) {
      off += reduced ? seek - off : (seek - off) * (1 - Math.pow(0.84, k));
      if (Math.abs(seek - off) < 0.001) { off = seek; seek = null; }
    } else if (!drag) {
      tgt *= Math.pow(FRICTION, k);
      cur += (tgt - cur) * (1 - Math.pow(1 - EASE, k));
      off += cur * k;
      if (Math.abs(cur) < 1e-4 && Math.abs(tgt) < 1e-4) cur = tgt = 0;
    }
    const goal = reduced ? 0 : clamp((drag ? drag.v : cur) * LEAN, MAX_LEAN);
    lean += (goal - lean) * (1 - Math.pow(0.88, k));
    if (Math.abs(goal - lean) < 1e-4) lean = goal;
    const moving = across(k);
    const uploading = upload();
    draw();
    const fading = performance.now() < showUntil;
    if (seek !== null || cur || tgt || lean || drag || moving || uploading || fading) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  kick = () => { raf ||= requestAnimationFrame(frame); };
  cleanups.push(() => cancelAnimationFrame(raf));
  // a push along the ribbon (with reduced motion, as far as it would have run, at once)
  const push = (v) => {
    seek = null;
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
  // a drag across: the row follows it, and when let go glides to rest on the event its speed carries it
  // to
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

  // ---- a click: the picture under it (the nearest surface, not in the faded top) ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const p = new THREE.Vector3();
  const pick = (e, c) => {
    const v = c.vp;
    if (!v || e.clientY < v.top + FADE_PICK || e.clientY > v.top + v.h) return -1;
    // (the unseen shapes bent as the shader bends the pictures)
    const shapes = [];
    for (const sl of c.active.values()) {
      const pos = sl.pick.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        ribbonAt(sl.u.uStart.value + stripUv.getX(i) * sl.u.uLen.value, stripUv.getY(i), p);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      sl.pick.geometry.computeBoundingSphere();
      shapes.push(sl.pick);
    }
    c.group.updateMatrixWorld();
    c.camera.updateMatrixWorld();
    ndc.set(((e.clientX - v.left) / v.w) * 2 - 1, -((e.clientY - v.top) / v.h) * 2 + 1);
    ray.setFromCamera(ndc, c.camera);
    const hit = ray.intersectObjects(shapes, false)[0];
    return hit ? hit.object.userData.slot.idx : -1;
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
    const across = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (across) { e.preventDefault(); step(across); return; }
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
  // the arrow at the right: the next event (its words for a mouse or a finger)
  const next = track.querySelector('[data-gal-next]');
  if (next) on(next, 'click', () => step(1));
  const cue = track.querySelector('[data-gal-cue]');
  if (cue && !matchMedia('(pointer: fine)').matches) cue.textContent = 'Swipe to see more';
  // the one at the bottom: the spirals turned on, as a few turns of the wheel would
  const down = track.querySelector('[data-gal-down]');
  if (down) on(down, 'click', () => push(-KEY * 3));
  const downWord = track.querySelector('[data-gal-cue-down]');
  if (downWord && !matchMedia('(pointer: fine)').matches) downWord.textContent = 'Swipe up to see more';

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
    incoming.forEach(({ tex }) => { tex.image?.close?.(); tex.dispose(); });
    events.forEach((ev) => ev.textures.forEach((t) => { t?.image?.close?.(); t?.dispose(); }));
    columns.forEach((c) => {
      [...c.active.values(), ...c.pool].forEach((sl) => {
        sl.meshes.forEach((m) => m.material.dispose());
        sl.pick.geometry.dispose();
      });
    });
    strip.dispose();
    pickMaterial.dispose();
    blank.dispose();
    renderer.dispose();
    canvas.remove();
    track.classList.remove('is-live');
  };
}

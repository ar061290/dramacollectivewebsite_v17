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
// one brings it to the front and rings its column. Every picture fades out towards its column's top,
// bottom and sides rather than being cut off there.
// For a low-end device: only the pictures on a column's stretch of ribbon are drawn, their pictures
// fetched as they come near, made small for the purpose (and let go as they leave), only the columns
// on the screen, and only while something moves. Without WebGL, or where the device would rather not
// (prefersStatic), the columns stay plain grids and the page scrolls as any other. With reduced motion
// the pictures move as far as the wheel says at once, without running on or leaning.
import * as THREE from 'three';
import { liteTier, pixelRatio, probeWebGL, prefersStatic } from '../util/env.js';

const TAU = Math.PI * 2;
// the ribbon (world units; its radius 1)
const R = 1;
const H = 0.62;                 // its height: every picture this tall, as wide as its own shape makes it
const PITCH = H + 0.3;          // how far it drops a turn (its turns 0.3 apart, edge to edge)
const CONE = 0.05;              // a little wider towards the top: its radius's share more a unit up
const GAP = 0.025;              // between pictures along it
const INSIDE = 0.5;             // the inside's brightness (its far side, seen through the turn)
const ELEVATION = 0.3;          // the camera's angle above it (radians)
const LEAN_Z = -0.12;           // aslant, as the reference's is (radians)
const ZOOM = 1.06;              // its width to its column's, at its middle
const FADE_PICK = 36;           // pixels at a column's top and bottom where a click opens nothing (faded)
// the motion: a push along the ribbon (ribbon a frame) that runs on, slowing by FRICTION a frame, and
// comes in eased (EASE); the spirals lean with the speed
const WHEEL = 0.0011;           // the push a pixel of wheel
const KEY = 0.12;               // the push an arrow key
const DRAG = 0.011;             // ribbon a pixel of a mouse or a finger dragged
const FRICTION = 0.9;
const EASE = 0.25;
const MAX_V = 0.5;
const LEAN = 0.8, MAX_LEAN = 0.18;

const VERT = `
uniform float uStart; // where along the ribbon the picture starts, from the front (world units)
uniform float uLen;   // its length along the ribbon
uniform vec4 uRibbon; // the radius, the drop a turn, the height, the cone
varying vec2 vUv;
void main() {
  float u = uStart + uv.x * uLen;
  float ang = u / uRibbon.x;
  float y = -ang / ${TAU.toFixed(8)} * uRibbon.y;
  float r = uRibbon.x * (1.0 + uRibbon.w * y);
  vec3 p = vec3(sin(ang) * r, y + (uv.y - 0.5) * uRibbon.z, cos(ang) * r);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// (the pictures' colours as they are, sRGB in and out; uBox: the column's part of the canvas, its
// corner and size, uFade: how far the fade reaches up and down, and across; device pixels)
const FRAG = `
uniform sampler2D uMap;
uniform vec4 uBox;
uniform vec2 uFade;
uniform float uInside;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (!gl_FrontFacing) c.rgb *= uInside;
  vec2 q = gl_FragCoord.xy - uBox.xy;
  float a = smoothstep(0.0, uFade.x, q.y) * smoothstep(0.0, uFade.x, uBox.w - q.y)
          * smoothstep(0.0, uFade.y, q.x) * smoothstep(0.0, uFade.y, uBox.z - q.x);
  gl_FragColor = vec4(c.rgb, a);
}`;

/** A point on the ribbon (as the vertex shader places it): `u` along it from the front, `v` up it (0-1). */
function ribbonAt(u, v, out) {
  const ang = u / R;
  const y = (-ang / TAU) * PITCH;
  const r = R * (1 + CONE * y);
  return out.set(Math.sin(ang) * r, y + (v - 0.5) * H, Math.cos(ang) * r);
}

/** @param {{ reduced: boolean }} ctx  bootPage's context @returns {() => void} cleanup */
export function setupSpirals({ reduced }) {
  const track = document.querySelector('[data-gal-track]');
  const view = track?.querySelector('[data-gal-view]');
  const row = view?.querySelector('[data-gal-cols]');
  const cols = row ? [...row.querySelectorAll('[data-gal-col]')] : [];
  if (!track || !view || !row || !cols.length) return () => {};
  const gl = probeWebGL();
  if (!gl.ok || prefersStatic(gl.renderer)) return () => {}; // (the plain grids stay)
  const lite = liteTier();
  const TEX_H = lite ? 160 : 220;  // a picture's height on the ribbon, in texture pixels
  const SEG = lite ? 14 : 24;      // the quads a picture is bent in
  const foot = track.querySelector('[data-gal-foot]');
  const steps = track.querySelector('[data-gal-steps]');
  const across = track.querySelector('[data-gal-across]');
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
    return () => {};
  }
  view.append(canvas);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 0);
  track.classList.add('is-live');
  foot.hidden = false;

  // ---- what every picture shares: its strip, the ribbon's shape, the column's part of the canvas ----
  const strip = new THREE.PlaneGeometry(1, 1, SEG, 1);
  const stripUv = strip.attributes.uv;
  const ribbonU = { value: new THREE.Vector4(R, PITCH, H, CONE) };
  const boxU = { value: new THREE.Vector4(0, 0, 1, 1) };
  const fadeU = { value: new THREE.Vector2(1, 1) };
  const insideU = { value: INSIDE };
  // a picture not yet in: the card colour
  const blank = new THREE.DataTexture(new Uint8Array([64, 20, 42, 255]), 1, 1);
  blank.needsUpdate = true;
  const pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  const columns = cols.map((col) => {
    const links = [...col.querySelectorAll('[data-gal-photo]')];
    // each picture's length along the ribbon (its own shape at the ribbon's height), and where it
    // starts in a round of them; T: a round's length
    const len = links.map((a) => H * ((+a.dataset.w || 3) / (+a.dataset.h || 2)));
    const start = [];
    let T = 0;
    len.forEach((l) => { start.push(T); T += l + GAP; });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    const group = new THREE.Group();
    scene.add(group);
    return { col, box: col.querySelector('.gal-spiral'), links, n: links.length, len, start, T, scene, camera, group, active: new Map(), pool: [], textures: new Map(), vp: null };
  });

  // a picture on the ribbon: its inside (drawn first) and its outside (drawn over it), neither writing
  // depth, so where the front fades the far side shows through it; and, unseen, its shape for clicks
  const makeSlot = (c) => {
    const u = { uStart: { value: 0 }, uLen: { value: 1 }, uMap: { value: blank } };
    const slot = { k: NaN, idx: -1, u, meshes: [], pick: null };
    for (const [side, order] of [[THREE.BackSide, 0], [THREE.FrontSide, 1]]) {
      const mesh = new THREE.Mesh(strip, new THREE.ShaderMaterial({
        uniforms: { ...u, uRibbon: ribbonU, uBox: boxU, uFade: fadeU, uInside: insideU },
        vertexShader: VERT,
        fragmentShader: FRAG,
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
  const toTexture = async (img, w, h) => {
    try {
      const bitmap = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium', imageOrientation: 'flipY' });
      return new THREE.Texture(bitmap);
    } catch {
      // (where a browser will not make it so) drawn on a canvas, upside down as the texture wants it
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      g.translate(0, h);
      g.scale(1, -1);
      g.drawImage(img, 0, 0, w, h);
      return new THREE.CanvasTexture(cv);
    }
  };
  const load = (c, idx) => {
    if (c.textures.has(idx)) return;
    c.textures.set(idx, null);
    const src = c.links[idx].querySelector('img');
    const img = new Image();
    img.decoding = 'async';
    img.src = src.currentSrc || src.src;
    img.decode()
      .then(() => toTexture(img, Math.max(1, Math.round((TEX_H * img.naturalWidth) / img.naturalHeight)), TEX_H))
      .then((tex) => {
        if (!c.textures.has(idx)) { tex.image?.close?.(); tex.dispose(); return; }
        tex.flipY = false;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        c.textures.set(idx, tex);
        c.active.forEach((s) => { if (s.idx === idx) s.u.uMap.value = tex; });
        kick();
      })
      .catch(() => {});
  };
  // pictures far from the front let go (a column keeps those on its ribbon, and a few more)
  const tidy = (c, mid) => {
    const keep = c.active.size + 16;
    if (c.textures.size <= keep) return;
    const far = [...c.textures.keys()]
      .map((idx) => [Math.min(mod(idx - mid, c.n), mod(mid - idx, c.n)), idx])
      .sort((a, b) => b[0] - a[0]);
    for (const [, idx] of far.slice(0, c.textures.size - keep)) {
      const tex = c.textures.get(idx);
      c.textures.delete(idx);
      if (tex) {
        c.active.forEach((s) => { if (s.idx === idx) s.u.uMap.value = blank; });
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
  const place = (c, reach) => {
    const kLo = pictureAt(c, off - reach);
    const kHi = Math.min(pictureAt(c, off + reach), kLo + 120);
    for (const [k, s] of c.active) {
      if (k >= kLo && k <= kHi) continue;
      c.active.delete(k);
      s.meshes.forEach((m) => { m.visible = false; });
      c.pool.push(s);
    }
    for (let k = kLo; k <= kHi; k++) {
      let s = c.active.get(k);
      if (!s) {
        s = c.pool.pop() || makeSlot(c);
        s.k = k;
        s.idx = mod(k, c.n);
        s.u.uLen.value = c.len[s.idx];
        load(c, s.idx);
        s.u.uMap.value = c.textures.get(s.idx) || blank;
        s.meshes.forEach((m) => { m.visible = true; });
        c.active.set(k, s);
      }
      s.u.uStart.value = startOf(c, k) - off;
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
    const vr = view.getBoundingClientRect();
    const pr = renderer.getPixelRatio();
    // each column's part reaches halfway into the gaps beside it, where its ribbon's sides fade out
    const side = (parseFloat(getComputedStyle(row).columnGap) || 0) / 2;
    renderer.setScissor(0, 0, size.w, size.h);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.clear();
    for (const c of columns) {
      const r = c.box.getBoundingClientRect();
      const x = r.left - vr.left - side, y = r.top - vr.top, w = r.width + side * 2, h = r.height;
      c.vp = null;
      if (x + w <= 0 || x >= size.w || r.width < 2 || h < 2) continue;
      c.vp = { left: r.left - side, top: r.top, w, h };
      // the camera above the ribbon, near enough that the ribbon is the column's width at its middle
      // and its front comes out larger, as the reference's fills the screen
      const cam = c.camera;
      cam.aspect = w / h;
      const tan = Math.tan((cam.fov * Math.PI) / 360);
      const d = (w / 2) / (tan * cam.aspect * ZOOM * (r.width / 2));
      cam.position.set(0, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      c.group.rotation.set(lean, 0, LEAN_Z + lean * 0.4);
      // as much ribbon as the column shows, and most of a turn more either way
      place(c, ((d * tan) / PITCH + 0.8) * TAU * R);
      const vy = size.h - (y + h);
      boxU.value.set(x * pr, vy * pr, w * pr, h * pr);
      fadeU.value.set(Math.min(90, h * 0.2) * pr, side * 2.5 * pr);
      renderer.setViewport(x, vy, w, h);
      renderer.setScissor(x, vy, w, h);
      renderer.render(c.scene, cam);
    }
  };

  // ---- a frame, only while something moves: the push running on, a picture coming to the front, the
  // lean settling ----
  let raf = 0, last = 0;
  let drag = null; // a mouse or a finger dragging: { y, moved, v, t }
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
    draw();
    if (seek !== null || cur || tgt || lean || drag) raf = requestAnimationFrame(frame);
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

  // the wheel: the spirals', while the page is at its top (across, and with Shift, the columns')
  const atTop = () => scrollY < 4;
  on(window, 'wheel', (e) => {
    if (e.ctrlKey || !atTop()) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy) || e.shiftKey) return;
    e.preventDefault();
    push(dy * WHEEL);
  }, { passive: false });

  // a drag up or down: the pictures follow it, and run on from it when let go
  const dragTo = (y) => {
    const dy = y - drag.y;
    drag.y = y;
    const by = -dy * DRAG;
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
  // a finger (across is the columns' own scroll: touch-action pan-x)
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
    }
    if (touch.dir === 'y' && drag) dragTo(t.clientY);
  }, { passive: true });
  const touchEnd = () => { if (touch?.dir === 'y') letGo(); touch = null; };
  on(view, 'touchend', touchEnd, { passive: true });
  on(view, 'touchcancel', touchEnd, { passive: true });
  // a mouse, on a column's ribbon
  const columnAt = (e) => columns.find((c) => c.box.contains(e.target));
  on(view, 'pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !columnAt(e)) return;
    e.preventDefault(); // (no text selected by the drag)
    cur = tgt = 0;
    drag = { y: e.clientY, moved: false, v: 0, t: performance.now() };
  });
  let hoverFrame = 0, lastMove = null;
  on(window, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (drag) {
      if (!drag.moved) {
        if (Math.abs(e.clientY - drag.y) < 5) return;
        drag.moved = true;
        columns.forEach((c) => c.box.classList.add('is-dragging'));
      }
      dragTo(e.clientY);
      return;
    }
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
    if (e.pointerType !== 'mouse' || !drag) return;
    dragged = drag.moved;
    letGo();
  });

  // ---- a click: the picture under it (the nearest surface, not in the faded top or bottom) ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const p = new THREE.Vector3();
  const pick = (e, c) => {
    const v = c.vp;
    if (!v || e.clientY < v.top + FADE_PICK || e.clientY > v.top + v.h - FADE_PICK) return -1;
    // (the unseen shapes bent as the shader bends the pictures)
    const shapes = [];
    for (const s of c.active.values()) {
      const pos = s.pick.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        ribbonAt(s.u.uStart.value + stripUv.getX(i) * s.u.uLen.value, stripUv.getY(i), p);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      s.pick.geometry.computeBoundingSphere();
      shapes.push(s.pick);
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

  // the keys: up and down push the pictures along, while the page is at its top
  on(window, 'keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !atTop()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
    const dir = { ArrowDown: 1, ArrowUp: -1, PageDown: 3, PageUp: -3 }[e.key];
    if (!dir) return;
    e.preventDefault();
    push(dir * KEY);
  });
  // a picture's link with the keyboard's focus: brought to the front (its nearest showing)
  on(row, 'focusin', (e) => {
    const c = columns.find((x) => x.box.contains(e.target));
    const idx = c ? c.links.indexOf(e.target) : -1;
    columns.forEach((x) => x.box.classList.toggle('is-focus', x === c && idx >= 0));
    if (idx < 0) return;
    const round = Math.floor(off / c.T);
    const mid = c.start[idx] + c.len[idx] / 2;
    seek = [round - 1, round, round + 1].map((n) => n * c.T + mid).reduce((a, b) => (Math.abs(b - off) < Math.abs(a - off) ? b : a));
    cur = tgt = 0;
    kick();
  });
  on(row, 'focusout', () => columns.forEach((x) => x.box.classList.remove('is-focus')));

  // ---- across: the arrows under the columns, the events' names; and the columns' own scroll ----
  const width = () => cols[0].offsetWidth + (parseFloat(getComputedStyle(row).columnGap) || 0);
  const behavior = reduced ? 'instant' : 'smooth';
  steps.querySelectorAll('[data-gal-step]').forEach((b) => on(b, 'click', () => row.scrollBy({ left: Number(b.dataset.galStep) * width(), behavior })));
  track.querySelectorAll('[data-gal-to]').forEach((a) => on(a, 'click', (e) => {
    const col = cols.find((c) => c.id === a.dataset.galTo);
    if (!col || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // ours, not the site's in-page glide (src/animations/nav.js)
    const pad = parseFloat(getComputedStyle(row).scrollPaddingLeft) || 0;
    row.scrollTo({ left: row.scrollLeft + col.getBoundingClientRect().left - row.getBoundingClientRect().left - pad, behavior });
  }));
  on(row, 'scroll', kick, { passive: true });
  // the arrows and the word for across only where the columns are more than the width (the word for a
  // mouse or a trackpad, or for a finger)
  across.textContent = matchMedia('(pointer: fine)').matches ? ' · scroll sideways for more events' : ' · swipe across for more events';
  const fits = () => {
    const more = row.scrollWidth > row.clientWidth + 2;
    steps.hidden = !more;
    across.hidden = !more;
  };

  let resizeFrame = 0;
  on(window, 'resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { resize(); fits(); draw(); });
  }, { passive: true });
  cleanups.push(() => cancelAnimationFrame(resizeFrame));

  resize();
  fits();
  draw();
  return () => {
    cleanups.forEach((c) => c());
    columns.forEach((c) => {
      c.textures.forEach((t) => { t?.image?.close?.(); t?.dispose(); });
      [...c.active.values(), ...c.pool].forEach((s) => {
        s.meshes.forEach((m) => m.material.dispose());
        s.pick.geometry.dispose();
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

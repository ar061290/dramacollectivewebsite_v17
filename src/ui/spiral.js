// The Gallery's spirals (gallery.html, written by tools/pages/build.mjs gallery()), after SpiralGallery:
// each event's pictures bent round its column as a ribbon, winding on without end (its pictures over
// and over), drawn with WebGL on one canvas over the columns (each column its own view of its own
// ribbon). The wheel, a swipe up or down on the columns, a mouse dragged up or down, or the arrow keys
// up and down turn every ribbon at once, eased; across, the columns scroll as ever (a swipe, the
// trackpad, Shift and the wheel, the arrows under them, or an event's name). While the page is at its
// top the wheel is the ribbons' alone; "Footer" under them goes on down. A picture clicked opens whole
// in the lightbox (src/ui/gallery.js), through its link, which stays in its column, unseen: the
// keyboard's focus on one turns the ribbons to bring it to the front (and rings its column).
// Only the pictures near the front of each ribbon are drawn (their pictures fetched as they come near,
// made small for the purpose, and let go as they leave), only the columns on the screen, and only
// while something moves. Without WebGL, or where the device would rather not (prefersStatic), the
// columns stay plain grids and the page scrolls as any other. With reduced motion the ribbons follow
// the wheel without easing.
import * as THREE from 'three';
import { liteTier, pixelRatio, probeWebGL, prefersStatic } from '../util/env.js';

const PER_TURN = 7;                       // pictures to a turn of the ribbon
const ARC = (Math.PI * 2) / PER_TURN;     // a picture's share of a turn
const GAP = 0.04;                         // radians between pictures along the ribbon
const H = 0.6;                            // a picture's height, the ribbon's radius being 1
const RISE = (H + 0.36) / PER_TURN;       // the ribbon's rise a picture (its turns apart, so it reads as a spiral)
const WHEEL = 1.5 / 100;                  // pictures a pixel of wheel turns
const SWIPE = 1 / 30;                     // pictures a pixel of finger or mouse turns
const FOLLOW = 0.12;                      // how far the ribbons catch up with where they are going, a frame

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
  const NEAR = lite ? 13 : 19;            // pictures either side of the front drawn
  const TEX = lite ? 200 : 280;           // a picture's width on the ribbon, in texture pixels
  const foot = track.querySelector('[data-gal-foot]');
  const steps = track.querySelector('[data-gal-steps]');
  const across = track.querySelector('[data-gal-across]');
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

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

  // one bent picture: a slice of the ribbon's cylinder, centred on the front
  const geo = new THREE.CylinderGeometry(1, 1, H, 18, 1, true, -(ARC - GAP) / 2, ARC - GAP);
  const aspect = (ARC - GAP) / H; // a picture's width to its height on the ribbon
  const TEX_H = Math.round(TEX / aspect);
  // the ribbon's inside (its far side, seen through the turn): its pictures dimmed, so the front
  // stands out and the far side reads as depth, as the reference's does
  const shadeInside = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb *= 0.38;');
  };
  // a picture not yet in: the card colour
  const blank = new THREE.DataTexture(new Uint8Array([64, 20, 42, 255]), 1, 1);
  blank.colorSpace = THREE.SRGBColorSpace;
  blank.needsUpdate = true;

  const columns = cols.map((col) => {
    const box = col.querySelector('.gal-spiral');
    const links = [...col.querySelectorAll('[data-gal-photo]')];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    const group = new THREE.Group();
    group.rotation.z = -0.12; // (aslant, as the reference's is)
    scene.add(group);
    const slots = Array.from({ length: NEAR * 2 + 1 }, () => {
      const material = new THREE.MeshBasicMaterial({ map: blank, side: THREE.DoubleSide });
      material.onBeforeCompile = shadeInside;
      material.customProgramCacheKey = () => 'gal-ribbon';
      const mesh = new THREE.Mesh(geo, material);
      mesh.userData.k = NaN;
      group.add(mesh);
      return mesh;
    });
    return { col, box, links, n: links.length, scene, camera, group, slots, textures: new Map() };
  });

  // ---- a picture's texture: its small picture, cut to the ribbon's shape and made smaller ----
  let kick = () => {};
  const load = (c, idx) => {
    if (c.textures.has(idx)) return;
    c.textures.set(idx, null);
    const src = c.links[idx].querySelector('img');
    const img = new Image();
    img.decoding = 'async';
    img.src = src.currentSrc || src.src;
    img.decode().then(() => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const cut = w / h > aspect ? { sw: h * aspect, sh: h } : { sw: w, sh: w / aspect };
      return createImageBitmap(img, (w - cut.sw) / 2, (h - cut.sh) / 2, cut.sw, cut.sh, { resizeWidth: TEX, resizeHeight: TEX_H, resizeQuality: 'medium', imageOrientation: 'flipY' });
    }).then((bitmap) => {
      if (!c.textures.has(idx)) { bitmap.close(); return; }
      const tex = new THREE.Texture(bitmap);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      c.textures.set(idx, tex);
      c.slots.forEach((m) => { if (m.userData.idx === idx) m.material.map = tex; });
      kick();
    }).catch(() => {});
  };
  // pictures far from the front let go (a ribbon keeps those near it, and a few more)
  const KEEP = NEAR * 2 + 1 + 12;
  const mod = (a, b) => ((a % b) + b) % b;
  const tidy = (c, o) => {
    if (c.textures.size <= KEEP) return;
    const far = [...c.textures.keys()].map((idx) => {
      const d = Math.min(mod(idx - o, c.n), mod(o - idx, c.n)); // round the ribbon, either way
      return [d, idx];
    }).sort((a, b) => b[0] - a[0]);
    for (const [, idx] of far.slice(0, c.textures.size - KEEP)) {
      const tex = c.textures.get(idx);
      c.textures.delete(idx);
      if (tex) { c.slots.forEach((m) => { if (m.material.map === tex) m.material.map = blank; }); tex.image?.close?.(); tex.dispose(); }
    }
  };

  // ---- the ribbons at `pos` (in pictures, round and round): each column's picture at the front ----
  let pos = 0, target = 0;
  const place = (c) => {
    c.group.rotation.y = -pos * ARC;
    c.group.position.y = pos * RISE;
    const base = Math.round(pos);
    for (let k = base - NEAR; k <= base + NEAR; k++) {
      const m = c.slots[mod(k, c.slots.length)];
      if (m.userData.k === k) continue;
      const idx = mod(k, c.n);
      m.userData.k = k;
      m.userData.idx = idx;
      m.rotation.y = k * ARC;
      m.position.y = -k * RISE;
      load(c, idx);
      m.material.map = c.textures.get(idx) || blank;
    }
    tidy(c, mod(Math.round(pos), c.n));
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
    renderer.setScissor(0, 0, size.w, size.h);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.clear();
    for (const c of columns) {
      const r = c.box.getBoundingClientRect();
      const x = r.left - vr.left, y = r.top - vr.top;
      if (x + r.width <= 0 || x >= size.w || r.width < 2 || r.height < 2) continue;
      place(c);
      // the camera a little above the ribbon, near enough that the ribbon fills the column's width
      const cam = c.camera;
      cam.aspect = r.width / r.height;
      const half = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
      const d = 1.08 / half + 0.2;
      cam.position.set(0, d * 0.2, d);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      const vy = size.h - (y + r.height);
      renderer.setViewport(x, vy, r.width, r.height);
      renderer.setScissor(x, vy, r.width, r.height);
      renderer.render(c.scene, cam);
    }
  };

  // ---- a frame, only while the ribbons are still on their way ----
  let raf = 0;
  const frame = () => {
    raf = 0;
    pos = reduced ? target : pos + (target - pos) * FOLLOW;
    if (Math.abs(target - pos) < 0.002) pos = target;
    draw();
    if (pos !== target) raf = requestAnimationFrame(frame);
  };
  kick = () => { raf ||= requestAnimationFrame(frame); };
  const turn = (by) => { target += by; track.classList.add('is-moved'); kick(); };
  cleanups.push(() => cancelAnimationFrame(raf));

  // the wheel: the ribbons', while the page is at its top (across, and with Shift, the columns')
  const atTop = () => scrollY < 4;
  on(window, 'wheel', (e) => {
    if (e.ctrlKey || !atTop()) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy) || e.shiftKey) return;
    e.preventDefault();
    turn(dy * WHEEL);
  }, { passive: false });
  // a finger up or down on the columns (across is the columns' own scroll: touch-action pan-x)
  let touch = null;
  on(view, 'touchstart', (e) => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  on(view, 'touchmove', (e) => {
    if (!touch || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = { x: t.clientX, y: t.clientY };
    if (Math.abs(dy) > Math.abs(dx)) turn(-dy * SWIPE);
  }, { passive: true });
  on(view, 'touchend', () => { touch = null; }, { passive: true });
  // a mouse dragged up or down on a ribbon; a click on a picture opens it whole
  let drag = null;
  const ray = new THREE.Raycaster();
  const pick = (e, c) => {
    const r = c.box.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), c.camera);
    const hit = ray.intersectObjects(c.slots, false)[0];
    return hit ? hit.object.userData.idx : -1;
  };
  const columnAt = (e) => columns.find((c) => c.box.contains(e.target));
  on(view, 'pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { y: e.clientY, moved: false };
  });
  let hoverFrame = 0, last = null;
  on(window, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (drag) {
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) < 5) return;
      drag.moved = true;
      drag.y = e.clientY;
      turn(-dy * SWIPE);
      return;
    }
    last = e;
    hoverFrame ||= requestAnimationFrame(() => {
      hoverFrame = 0;
      const c = columnAt(last);
      columns.forEach((x) => x.box.classList.toggle('is-pointing', x === c && pick(last, x) >= 0));
    });
  }, { passive: true });
  cleanups.push(() => cancelAnimationFrame(hoverFrame));
  on(window, 'pointerup', () => { setTimeout(() => { drag = null; }, 0); });
  on(view, 'click', (e) => {
    if (drag?.moved) return;
    const c = columnAt(e);
    if (!c || c.links.includes(e.target.closest('a'))) return;
    const idx = pick(e, c);
    if (idx >= 0) c.links[idx].click();
  });
  // the keys: up and down turn the ribbons, while the page is at its top
  on(window, 'keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !atTop()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
    const dir = { ArrowDown: 1, ArrowUp: -1, PageDown: 3, PageUp: -3 }[e.key];
    if (!dir) return;
    e.preventDefault();
    turn(dir);
  });
  // a picture's link with the keyboard's focus: the ribbons turned to bring it to the front
  on(row, 'focusin', (e) => {
    const c = columns.find((x) => x.box.contains(e.target));
    const idx = c ? c.links.indexOf(e.target) : -1;
    columns.forEach((x) => x.box.classList.toggle('is-focus', x === c && idx >= 0));
    if (idx < 0) return;
    const here = Math.round(target);
    let d = mod(idx - mod(here, c.n), c.n);
    if (d > c.n / 2) d -= c.n;
    target = here + d;
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
    row.scrollTo({ left: col.offsetLeft - row.offsetLeft, behavior });
  }));
  on(row, 'scroll', kick, { passive: true });
  // the arrows and the word for across only where the columns are more than the width
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
      c.slots.forEach((m) => m.material.dispose());
    });
    geo.dispose();
    blank.dispose();
    renderer.dispose();
    canvas.remove();
    track.classList.remove('is-live');
  };
}

// Meet our writers' opening (writers.html's [data-writers-open]; its layout is writers-open.css).
// The marble statue (src/scene/writerStatue.js) stands among the stars, beside the heading and its
// line. Scrolling holds the opening on the screen (one pinned ScrollTrigger, scrubbed over HOLD
// screens) and plays it:
// 1. the words go, and the camera comes to the book in the statue's hand (src/writers/rig.js): it
//    moves and turns until the book stands upright in the middle of the screen;
// 2. the publication's real cover (the October issue) takes the book's place: it is laid exactly
//    over the book as drawn, its four corners on the cover's four corners (a CSS matrix3d that maps
//    its rectangle onto the projected quadrilateral, set as each frame of the statue is drawn), and
//    it fades in there, so the two cross over without a jump;
// 3. it comes forward to the middle of the screen, the statue fading behind it, and opens on its
//    spine (CSS 3D), the inside of the cover a plum paper;
// 4. its first page is the writers, issue by issue (a picture of the section below, as it will
//    stand: the real cards, inert, small on the page); the view goes into the page until the
//    picture is the size of the section itself, exactly where the section will be, and there the
//    section takes over, and the hold lets go: the months scroll on as the page.
// The scroll alone plays it, so it runs backwards as it runs forwards: scrolling back up closes the
// book and takes the camera back to the statue. Where the statue is a still picture (no WebGL, a
// weak device, or until the live one is drawn) the same story plays on the picture: it is enlarged
// toward the book, and the cover starts from the book in it.
// Reduced motion: no hold and no camera; the statue stands, the book is shown open as a still under
// it, and the writers follow. Without scripts: the statue's picture and the words, then the writers.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { probeWebGL, prefersStatic } from '../util/env.js';
import { rig, project } from './rig.js';

const MODEL = new URL('../../assets/models/writer-statue.glb', import.meta.url).href;
const MEASURES = new URL('../../assets/models/writer-statue.json', import.meta.url).href;
const debug = new URLSearchParams(location.search).has('debug');

const HOLD = 3; // screens of scroll the opening is held for while it plays
// the scene's parts, as stretches of that hold (0..1)
const WORDS = [0, 0.1]; // the words go
const VIEW = [0.03, 0.42]; // the camera comes to the book
const HAND = [0.36, 0.44]; // the cover fades in over the book
const LIFT = [0.46, 0.64]; // it comes forward to the middle (and the statue fades: FADE)
const FADE = [0.47, 0.6];
const OPEN = [0.66, 0.84]; // it opens on its spine
const DIVE = [0.86, 1]; // into its first page
const STACKED = '(max-width: 767px), (max-width: 1023px) and (orientation: portrait)';
const COVER_ASPECT = 1054 / 1492; // the cover picture's width to its height
const STILL_ZOOM = 2.4; // how far the still picture is enlarged at most (more, and it blurs)

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// a style written only when it changes (each write, even of the same value, can cost a frame its
// style and paint work)
const written = new WeakMap();
const put = (el, prop, value) => {
  let o = written.get(el);
  if (!o) written.set(el, (o = {}));
  if (o[prop] === value) return;
  o[prop] = value;
  if (prop.startsWith('--')) el.style.setProperty(prop, value); else el.style[prop] = value;
};
const span = (p, [a, b]) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = { inOut: gsap.parseEase('power2.inOut'), sine: gsap.parseEase('sine.inOut'), out: gsap.parseEase('power2.out') };

let gl = null;
const canLive = () => {
  gl ??= probeWebGL();
  return gl.ok && !prefersStatic(gl.renderer);
};
const pageTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/**
 * The CSS matrix3d that lays a w x h box (its transform-origin at its top left) onto the
 * quadrilateral q (its top-left, top-right, bottom-right and bottom-left corners, in px from the
 * same origin): the plane's projective map, a square's onto a quad (after Heckbert), scaled to the box.
 */
export function quadMatrix(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, d, e, g = 0, k = 0;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0;
  } else {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
    a = x1 - x0 + g * x1; b = x3 - x0 + k * x3;
    d = y1 - y0 + g * y1; e = y3 - y0 + k * y3;
  }
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(8)).join(',')})`;
}

/** A similarity (move, turn, scale) taking quad a onto quad b, by their centres and their spines. */
function similarity(a, b) {
  const centre = (q) => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
  const spine = (q) => [q[0][0] - q[3][0], q[0][1] - q[3][1]];
  const ca = centre(a), cb = centre(b), sa = spine(a), sb = spine(b);
  return {
    from: ca,
    to: cb,
    scale: Math.hypot(...sb) / Math.hypot(...sa),
    turn: Math.atan2(sb[1], sb[0]) - Math.atan2(sa[1], sa[0]),
  };
}

/**
 * @param {{ reduced: boolean, sky: any, onTheme: Function, opened: Promise }} ctx  bootPage's context
 * @param {{ onSwap?: (paged: boolean) => void }} [o]  told when the section below takes over from
 *   the book (true) or gives the screen back to it (false)
 */
export function setupOpening({ reduced, sky, onTheme, opened }, { onSwap = () => {} } = {}) {
  const open = document.querySelector('[data-writers-open]');
  const stage = open?.querySelector('.writers-open__stage');
  const slot = open?.querySelector('.writers-open__statue');
  const words = open?.querySelector('.writers-open__words');
  const book = open?.querySelector('.wbook');
  const section = document.querySelector('.writers');
  if (!open || !stage || !slot || !words || !book || !section) return undefined;
  const cover = book.querySelector('.wbook__cover');
  const front = book.querySelector('.wbook__front');
  const page = book.querySelector('.wbook__page');
  const leaf = book.querySelector('.wbook__leaf');
  const shadow = book.querySelector('.wbook__shadow');
  const paper = book.querySelector('.wbook__paper');
  const gutter = book.querySelector('.wbook__gutter');
  const stars = document.querySelector('.stage__stars');
  const cleanups = [];
  let statue = null; // the live statue, once drawn
  let gone = false;
  let measures = null;

  // ---- the statue: live where it can be (made at once: it is the first thing on the page) ----
  const live = canLive();
  let drawn = null; // the book's corners as the live statue last drew them (stage px)
  let render = () => {};
  // (the measures are fetched once: the still picture wants them too, for the book's place in it)
  const measured = fetch(MEASURES).then((r) => r.json());
  measured.catch(() => {}); // (reported where it is used)
  const ready = !live ? Promise.resolve(null) : Promise.all([opened, measured, import('../scene/writerStatue.js')])
    .then(async ([, m, mod]) => {
      if (gone) return null;
      measures = m;
      const s = new mod.WriterStatue(stage, {
        measures: m,
        reduced,
        theme: pageTheme(),
        onDraw: (corners) => { drawn = corners; if (statue) render(progress, true); },
      });
      if (debug) window.__writerStatue = s;
      try {
        s.setSlot(slotRect());
        await s.load(MODEL);
      } catch (err) {
        s.dispose();
        throw err;
      }
      if (gone) { s.dispose(); return null; }
      s.setTheme(pageTheme(), { instant: true });
      statue = s;
      slot.classList.add('is-live');
      render(progress);
      return s;
    })
    .catch((err) => {
      console.warn('The statue is unavailable; showing its still picture.', err);
      return null;
    });
  cleanups.push(() => { gone = true; statue?.dispose(); statue = null; slot.classList.remove('is-live'); });
  onTheme?.((theme, opts) => { if (!gone) statue?.setTheme(theme, opts); });

  /** The statue's box in the stage (its own place, without the still's enlargement). */
  function slotRect() {
    return { x: slot.offsetLeft, y: slot.offsetTop, w: slot.offsetWidth, h: slot.offsetHeight };
  }

  // the stars leave the statue's box alone (no constellation is caught behind it)
  if (sky) {
    const before = sky.covers;
    sky.covers = (x, y) => {
      // (its place while the opening is held at the top: the stage is the screen)
      const r = slotRect();
      if (progress < 0.3 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
      return before(x, y);
    };
    cleanups.push(() => { sky.covers = before; });
  }

  let progress = 0;

  if (reduced) {
    // ---- reduced motion: the statue stands, the book open under it as a still ----
    open.classList.add('is-still');
    book.classList.add('is-still');
    const ro = new ResizeObserver(() => statue?.setSlot(slotRect()));
    ro.observe(slot);
    cleanups.push(() => { ro.disconnect(); open.classList.remove('is-still'); book.classList.remove('is-still'); });
    return () => cleanups.splice(0).reverse().forEach((c) => c());
  }

  // ---- the scene ----
  open.classList.add('is-scene');
  section.classList.add('is-paged');
  cleanups.push(() => { open.classList.remove('is-scene'); section.classList.remove('is-paged', 'is-behind'); });

  // the sizes the scene is laid out in, taken again on each refresh
  const L = { w: 1, h: 1, W: 1, H: 1, bx: 0, by: 0, shift: 0, s0: 1, leafH: 1, Y0: 0, X0: 0, still: null, slot: null };
  const measure = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    const stacked = matchMedia(STACKED).matches;
    // the cover forward, in the middle: as tall as there is room for (and narrower on a phone)
    const H = Math.min(h * (stacked ? 0.62 : 0.74), (w * (stacked ? 0.78 : 0.42)) / COVER_ASPECT);
    const W = H * COVER_ASPECT;
    const gutter = parseFloat(getComputedStyle(open).getPropertyValue('--open-gutter')) || 16;
    Object.assign(L, {
      w, h, W, H,
      bx: (w - W) / 2,
      by: (h - H) / 2,
      // opened, the spread is centred where it fits; else the page stays in sight
      shift: Math.min(W / 2, Math.max(0, (w - W) / 2 - gutter)),
      s0: W / w,
      slot: slotRect(),
    });
    L.leafH = H / L.s0;
    book.style.setProperty('--book-w', `${W.toFixed(2)}px`);
    book.style.setProperty('--book-h', `${H.toFixed(2)}px`);
    book.style.left = `${L.bx.toFixed(2)}px`;
    book.style.top = `${L.by.toFixed(2)}px`;
    leaf.style.width = `${w}px`;
    leaf.style.transform = `scale(${L.s0})`;
    statue?.setSlot(L.slot);
    // where the section will stand when the hold lets go (it is pulled up under the opening, so its
    // top is then just below the top bar): the picture on the page is put there
    const r = section.getBoundingClientRect();
    L.X0 = r.left - stage.getBoundingClientRect().left;
    L.Y0 = pin ? r.top + window.scrollY - pin.end : 0;
    stillQuads();
  };

  // the book in the still picture (where it is in the statue's own view), and in the book's view
  function stillQuads() {
    if (!measures) return;
    const cover = measures.book.cover;
    const q0 = project(cover.corners, rig({ view: 0, w: L.w, h: L.h, slot: L.slot, book: cover }), L.w, L.h);
    const q1 = project(cover.corners, rig({ view: 1, w: L.w, h: L.h, slot: L.slot, book: cover }), L.w, L.h);
    const sim = similarity(q0, q1);
    // (only part of the way, where the full way would enlarge the picture past STILL_ZOOM)
    L.still = { q0, sim, reach: sim.scale > STILL_ZOOM ? Math.log(STILL_ZOOM) / Math.log(sim.scale) : 1 };
  }
  measured.then((m) => { measures = m; stillQuads(); render(progress); }).catch(() => {});

  // ---- the picture of the section on the book's first page: the real cards, inert (the book is
  // inert in writers.html: nothing in the picture takes focus or a click) ----
  let picture = null;
  const paint = () => {
    const copy = section.cloneNode(true);
    copy.className = 'wbook__section';
    copy.removeAttribute('aria-label');
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    copy.querySelectorAll('template, .spot-glow, dialog').forEach((el) => el.remove());
    copy.querySelectorAll('[data-mask], [data-spot], [data-writers], [data-flip-id], [data-reveal]').forEach((el) => {
      ['data-mask', 'data-spot', 'data-writers', 'data-flip-id', 'data-reveal'].forEach((a) => el.removeAttribute(a));
    });
    copy.querySelectorAll('.is-lit').forEach((el) => el.classList.remove('is-lit'));
    copy.querySelectorAll('.member__photo, .member__card').forEach((el) => el.removeAttribute('style'));
    copy.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; });
    copy.style.width = `${section.offsetWidth}px`;
    copy.style.left = `${L.X0}px`;
    copy.style.top = `${L.Y0}px`;
    picture?.remove();
    picture = copy;
    leaf.replaceChildren(copy);
  };

  // ---- playing it ----
  let paged = null; // the section has the screen (the hold has let go)
  let starsOn = true;
  const setStars = (on, a) => {
    if (stars) put(stars, 'opacity', a >= 1 ? '' : a.toFixed(3));
    if (!sky || on === starsOn) return;
    starsOn = on;
    if (on) sky.start(); else sky.stop();
  };
  const setPaged = (on) => {
    if (on === paged) return;
    paged = on;
    section.classList.toggle('is-behind', !on);
    book.classList.toggle('is-done', on);
    if (!on) paint(); // the section may have changed under its filter
    onSwap(on);
  };

  render = (p, fromDraw = false) => {
    progress = p;
    // past the end of the hold, the end, whatever the scrub's catching up says
    if (pin && pin.progress >= 1) p = 1;
    setPaged(p >= 1);
    // 1. the words go
    const wv = span(p, WORDS);
    put(words, 'opacity', wv ? (1 - ease.out(wv)).toFixed(3) : '');
    put(words, 'transform', wv ? `translate3d(0, ${(-24 * ease.out(wv)).toFixed(2)}px, 0)` : '');
    put(words, 'visibility', wv >= 1 ? 'hidden' : '');
    // the camera comes to the book
    const v = ease.inOut(span(p, VIEW));
    const fade = span(p, FADE);
    if (statue) {
      statue.setView(v);
      statue.setHidden(fade >= 1);
      put(stage, 'opacity', fade ? (1 - ease.sine(fade)).toFixed(3) : '');
      put(slot, 'transform', '');
    } else {
      // the still picture: enlarged and turned toward the book (as the camera would bring it)
      put(stage, 'opacity', fade ? (1 - ease.sine(fade)).toFixed(3) : '');
      const st = L.still;
      if (st && v > 0) {
        const { sim } = st;
        const vs = v * st.reach;
        const k = sim.scale ** vs;
        const ox = sim.from[0] - L.slot.x, oy = sim.from[1] - L.slot.y;
        put(slot, 'transformOrigin', `${ox.toFixed(2)}px ${oy.toFixed(2)}px`);
        put(slot, 'transform', `translate3d(${((sim.to[0] - sim.from[0]) * vs).toFixed(2)}px, ${((sim.to[1] - sim.from[1]) * vs).toFixed(2)}px, 0) rotate(${(sim.turn * vs).toFixed(5)}rad) scale(${k.toFixed(5)})`);
      } else put(slot, 'transform', '');
    }
    // where the book's cover is now: as drawn by the live statue, else in the enlarged still
    let quad = null;
    if (statue && drawn) quad = drawn;
    else if (L.still) {
      const { q0, sim, reach } = L.still;
      const vs = v * reach;
      const k = sim.scale ** vs, t = sim.turn * vs, c = Math.cos(t), s = Math.sin(t);
      const cx = lerp(sim.from[0], sim.to[0], vs), cy = lerp(sim.from[1], sim.to[1], vs);
      quad = q0.map(([x, y]) => {
        const dx = (x - sim.from[0]) * k, dy = (y - sim.from[1]) * k;
        return [cx + dx * c - dy * s, cy + dx * s + dy * c];
      });
    }
    // 2-3. the cover: over the book, then forward to the middle (its corners eased from the
    // book's onto the rectangle there), then open on its spine
    const hand = span(p, HAND);
    const lift = ease.inOut(span(p, LIFT));
    const op = ease.sine(span(p, OPEN));
    const dive = span(p, DIVE);
    put(book, 'visibility', hand > 0 && quad ? '' : 'hidden');
    put(front, 'opacity', hand < 1 ? ease.sine(hand).toFixed(3) : '');
    // (its shadow comes as it leaves the hand)
    put(shadow, 'opacity', lift.toFixed(3));
    let tf;
    if (lift < 1 && quad) {
      const q = quad.map(([x, y], i) => {
        const tx = (i === 1 || i === 2 ? L.W : 0), ty = (i >= 2 ? L.H : 0);
        return [lerp(x - L.bx, tx, lift), lerp(y - L.by, ty, lift)];
      });
      tf = quadMatrix(L.W, L.H, q);
    } else {
      tf = op > 0 ? `rotateY(${(-180 * op).toFixed(3)}deg)` : 'none';
    }
    put(cover, 'transform', tf);
    // the page under the cover shows once the cover is in its place
    put(page, 'visibility', lift >= 1 ? '' : 'hidden');
    // 4. into the first page: the book grows about the point that takes the page onto the screen
    // (the page's top left onto the screen's, the picture on it at its own size)
    const e = ease.inOut(dive);
    const k1 = 1 / L.s0;
    const k = k1 ** e;
    const P0x = L.bx + L.shift * op, P0y = L.by;
    const Fx = (k1 * P0x) / (k1 - 1), Fy = (k1 * P0y) / (k1 - 1);
    const tx = Fx + k * (P0x - Fx) - L.bx, ty = Fy + k * (P0y - Fy) - L.by;
    put(book, 'transform', `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${k.toFixed(5)})`);
    // (the paper and the shadow at the spine fade as the view goes in: the page is the page's own)
    put(paper, 'opacity', (1 - e).toFixed(3));
    put(gutter, 'opacity', (1 - e).toFixed(3));
    // (at the end the page reaches the screen's foot: its paper is the page's own by then)
    const need = Math.max(L.H, L.h * L.s0 + 2);
    put(page, 'height', `${(L.H + (need - L.H) * clamp((e - 0.3) / 0.7)).toFixed(1)}px`);
    // the stars go as the page fills the screen
    const sa = 1 - clamp(e * 1.4);
    setStars(sa > 0, sa);
    if (!fromDraw && statue) statue.boxMoved();
  };

  // the hold: the opening stays on the screen while the scroll plays it
  let pin = null;
  const proxy = { p: 0 };
  const tween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    onUpdate: () => render(proxy.p),
    scrollTrigger: {
      trigger: open,
      start: 'top top',
      end: () => `+=${Math.round(innerHeight * HOLD)}`,
      pin: true,
      scrub: 0.5,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      refreshPriority: 1,
      onRefresh: () => { measure(); paint(); render(proxy.p); },
      onLeave: () => render(1),
      onEnterBack: () => render(proxy.p),
    },
  });
  pin = tween.scrollTrigger;
  measure();
  paint();
  render(0);
  // the keyboard reaches the section while it is behind the book (it is only out of sight): a focus
  // inside it lets the hold go at once, so the section has the screen and the focus is seen (taken
  // again after the browser has brought the focus into view, which may have scrolled back into the hold)
  const release = () => {
    if (pin && window.scrollY < pin.end) window.scrollTo({ top: Math.ceil(pin.end), behavior: 'instant' });
  };
  const onFocus = () => { release(); requestAnimationFrame(release); };
  section.addEventListener('focusin', onFocus);
  cleanups.push(() => section.removeEventListener('focusin', onFocus));
  cleanups.push(() => {
    tween.scrollTrigger?.kill(true);
    tween.kill();
    picture?.remove();
    for (const el of [words, slot, book, cover, front, page, leaf, shadow, paper, gutter, stage]) { el.removeAttribute('style'); written.delete(el); }
    if (stars) { stars.style.removeProperty('opacity'); written.delete(stars); }
    if (!starsOn) sky?.start();
  });
  // the type may land late, or the window change: the places are taken again
  // (a filter's rearranging changes its height many times over: measured once it has settled)
  let refreshTimer = 0;
  const ro = new ResizeObserver(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 160); });
  ro.observe(section);
  cleanups.push(() => { ro.disconnect(); clearTimeout(refreshTimer); });

  if (debug) window.__writersOpen = { L, render: (p) => render(p), get progress() { return progress; }, quadMatrix, get drawn() { return drawn; }, pin };

  return () => cleanups.splice(0).reverse().forEach((c) => c());
}

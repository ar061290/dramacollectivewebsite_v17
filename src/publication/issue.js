// An issue's own page (issue-<month>-<year>.html, written by tools/pages/build.mjs issuePage), after
// Bureau Nine's front page (bureaunine.framer.website): the issue's pieces as small cards on a ring
// round a spotlight, and in the spotlight the piece at the ring's front, as its grid card (its writer
// and form, the issue, its reading time, Read now). The ring turns a piece at a time as the page
// scrolls: the stage stays on screen (sticky) while the section it stands in goes by, a stretch a
// piece. A notch of the wheel, a key (the arrows, Page Up and Down, Space) or an arrow by the count
// goes a whole piece, gliding; a swipe or a drag of the scrollbar settles on the nearest piece the way
// it was going. Past the first piece and the last the page scrolls on as ever. The ring leans with
// the mouse's height, as Bureau Nine's does: its back rises behind the spotlight as the pointer goes
// down. A card on the ring brings its piece round; #<slug> opens on that piece. The ring's cards are
// the pieces' pictures (each title on its colour), cloned from the cards and hidden from screen
// readers, which have the cards themselves, one at a time, and the arrows; the focus, on a card,
// goes on with the step.
// The way back goes back to the page the reader came from (named for it), where it was one of ours.
// The ring's cards are moved by the scroll itself, on the compositor (a scroll-driven animation each,
// over the section's stretch; where the browser has none, a frame each time the page scrolls), stand
// in depth by their place in it (no restacking), and lean as one; the page's own work as it scrolls
// is only which piece is in the spotlight. The wheel is taken only while the stage is on the screen.
// Reduced motion: the steps and the spotlight change at once, and the ring does not lean. On a slow
// device (tier-lite) the ring has each piece once.
import gsap from 'gsap';
import { liteTier } from '../util/env.js';

const RING_MIN = 12; // the ring's cards at least: an issue of fewer pieces has them round it again
const DEPTH = 240;   // px between the ring's front and its back (they stand in depth by it)
const SAMPLES = 8;   // a piece's turn, in places a card is set at (the browser eases between them)
const LEAN = 10;     // degrees the ring leans with the mouse at the top or the foot of the screen
const two = (i) => String(i).padStart(2, '0');

// the pages the way back may be named for (another of ours: "Back")
const BACK_TO = {
  'index.html': 'Home',
  'publication.html': 'The publication',
  'editors-note.html': 'The editor’s note',
  'pieces.html': 'All the pieces',
  'writers.html': 'Meet our writers',
};

/** @param {{ reduced: boolean }} ctx  bootPage's context (only `reduced` is used) */
export function setupIssue({ reduced }) {
  const root = document.querySelector('[data-iss]');
  const stage = root?.querySelector('.iss__stage');
  const ring = root?.querySelector('[data-iss-ring]');
  const pieces = root ? [...root.querySelectorAll('[data-iss-piece]')] : [];
  const n = pieces.length;
  if (!stage || !ring || !n) return () => {};
  const nav = root.querySelector('[data-iss-nav]');
  const steps = [...root.querySelectorAll('[data-iss-step]')];
  const at = root.querySelector('[data-iss-at]');
  const live = root.querySelector('[data-iss-live]');
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

  backToWhereFrom(root.querySelector('[data-iss-back]'), on);

  // ---- the ring's cards: each piece's picture, cloned from its card (the title a plain line here) ----
  const reps = liteTier() ? 1 : Math.max(1, Math.ceil(RING_MIN / n));
  const m = n * reps;
  const tiles = [];
  for (let r = 0; r < reps; r++) {
    pieces.forEach((li, i) => {
      const tile = document.createElement('span');
      tile.className = 'pub-piece iss__tile';
      tile.dataset.tone = li.dataset.tone;
      tile.dataset.piece = String(i);
      const media = li.querySelector('.pub-piece__media').cloneNode(true);
      const h = media.querySelector('.pub-piece__title');
      if (h) {
        const line = document.createElement('span');
        line.className = h.className;
        line.dataset.len = h.dataset.len;
        line.textContent = h.textContent;
        h.replaceWith(line);
      }
      tile.append(media);
      tiles.push(tile);
    });
  }
  ring.append(...tiles);
  nav.hidden = false;

  // ---- where things are: the section's stretch of scroll, a piece's share of it, the ring's size ----
  let top = 0, step = 1, rx = 0, ry = 0;
  const measure = () => {
    top = root.getBoundingClientRect().top + scrollY;
    step = n > 1 ? Math.max(1, (root.offsetHeight - stage.offsetHeight) / (n - 1)) : 1;
    // the ring: round the spotlight, its sides in the screen; its depth a quarter of its width (on a
    // phone, where the spotlight fills the width, taller than the spotlight, so the ring shows over
    // and under it, within the scene)
    const w = stage.clientWidth;
    const spot = pieces[0].parentElement;
    const tile = tiles[0];
    rx = Math.min(500, w / 2 - tile.offsetWidth * 0.45, Math.max(spot.offsetWidth / 2 + tile.offsetWidth * 0.55, w * 0.38));
    ry = w < 768 ? spot.offsetHeight / 2 + tile.offsetHeight * 0.45 : rx * 0.24;
    // (the front card stands nearer, so the scene's perspective draws it larger and further out)
    const near = 1 - DEPTH / 2 / (parseFloat(getComputedStyle(ring.parentElement).perspective) || 1200);
    ry = Math.max(0, Math.min(ry, (ring.clientHeight / 2) * near - tile.offsetHeight / 2));
  };
  const last = () => top + step * (n - 1);
  const progress = () => Math.min(n - 1, Math.max(0, (scrollY - top) / step));
  const inStage = () => scrollY >= top - 2 && scrollY <= last() + 2;

  // ---- a card's place with piece `pos` at the front: its back raised and smaller, standing in depth
  // by it (the ring's perspective gives the rest) ----
  const placeOf = (k, pos) => {
    const a = ((k - pos) / m) * Math.PI * 2;
    const sx = Math.sin(a), cz = Math.cos(a);
    const depth = (1 + cz) / 2; // 1 at the front, 0 at the back
    return `translate3d(${(rx * sx).toFixed(1)}px, ${(ry * cz).toFixed(1)}px, ${((depth - 0.5) * DEPTH).toFixed(1)}px) rotateY(${(sx * 48).toFixed(2)}deg) scale(${(0.55 + 0.45 * depth).toFixed(3)})`;
  };

  // the ring moved by the scroll: a scroll-driven animation each, over the section's stretch (its
  // places sampled along the turn); else placed each time the page scrolls
  const driven = typeof ViewTimeline === 'function' && n > 1;
  let runs = [];
  const drive = () => {
    runs.forEach((a) => a.cancel());
    runs = [];
    if (!driven) return;
    // (no inset: by default it would take the page's scroll-padding, and run ahead of the steps)
    const timeline = new ViewTimeline({ subject: root, axis: 'block', inset: '0px' });
    const count = (n - 1) * SAMPLES;
    tiles.forEach((tile, k) => {
      const frames = Array.from({ length: count + 1 }, (_, j) => ({ transform: placeOf(k, j / SAMPLES), offset: j / count }));
      runs.push(tile.animate(frames, { timeline, rangeStart: 'contain 0%', rangeEnd: 'contain 100%', fill: 'both', easing: 'linear' }));
    });
  };
  let placeFrame = 0;
  const place = () => {
    placeFrame = 0;
    const pos = progress();
    tiles.forEach((tile, k) => { tile.style.transform = placeOf(k, pos); });
  };
  const placeSoon = () => { if (!driven) placeFrame ||= requestAnimationFrame(place); };
  cleanups.push(() => { cancelAnimationFrame(placeFrame); runs.forEach((a) => a.cancel()); });

  // ---- the spotlight: the piece at the front, wiped in from the foot over the one going (which
  // stays whole under it until it has, so the ring never shows through); the focus goes with it ----
  let current = -1, wipe = null;
  const show = (i, { instant = false } = {}) => {
    if (i === current) return;
    const was = pieces[current];
    const hadFocus = !!was?.contains(document.activeElement);
    current = i;
    wipe?.cancel();
    pieces.forEach((p, j) => p.classList.toggle('is-current', j === i));
    if (hadFocus) pieces[i].querySelector('.pub-piece__link')?.focus({ preventScroll: true });
    at.textContent = two(i + 1);
    steps.forEach((s) => s.setAttribute('aria-disabled', String(Number(s.dataset.issStep) < 0 ? i === 0 : i === n - 1)));
    root.classList.toggle('is-moved', i > 0);
    if (instant || !was) return;
    if (live) live.textContent = `${i + 1} of ${n}: ${pieces[i].querySelector('.pub-piece__title')?.textContent ?? ''}`;
    if (reduced) return;
    was.classList.add('is-leaving');
    wipe = pieces[i].animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 380, easing: 'cubic-bezier(.22, .61, .36, 1)' });
    wipe.onfinish = wipe.oncancel = () => was.classList.remove('is-leaving');
  };

  // ---- going to a piece: a glide to its place in the section (at once with reduced motion) ----
  let glide = null, aim = 0;
  const go = (i, { smooth = true } = {}) => {
    aim = Math.max(0, Math.min(n - 1, i));
    glide?.kill();
    glide = null;
    const y = Math.round(top + aim * step);
    if (reduced || !smooth) { window.scrollTo({ top: y, behavior: 'instant' }); return; }
    glide = gsap.to(window, { scrollTo: { y, autoKill: true }, duration: 0.7, ease: 'power3.out', onComplete: () => { glide = null; }, onInterrupt: () => { glide = null; } });
  };
  const base = () => (glide ? aim : Math.round(progress()));
  // past either end, the page's own scroll
  const leaving = (dir) => (dir < 0 && base() === 0 && scrollY <= top + 2) || (dir > 0 && base() === n - 1 && scrollY >= last() - 2);
  cleanups.push(() => glide?.kill());

  // the wheel: a notch, a piece; a trackpad's flick (a run of small deltas) is one piece too. Taken
  // only while the stage is on the screen (elsewhere the page's wheel is the browser's alone)
  let lock = 0, acc = 0, wheelOn = false;
  const onWheel = (e) => {
    if (e.ctrlKey || !inStage()) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;
    const dir = Math.sign(dy);
    if (leaving(dir)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < lock) { lock = Math.max(lock, now + 160); return; }
    acc += dy;
    if (Math.abs(acc) < 24) return;
    acc = 0;
    lock = now + 420;
    go(base() + dir);
  };
  const takeWheel = () => {
    const want = inStage();
    if (want === wheelOn) return;
    wheelOn = want;
    if (want) window.addEventListener('wheel', onWheel, { passive: false });
    else window.removeEventListener('wheel', onWheel, { passive: false });
  };
  cleanups.push(() => window.removeEventListener('wheel', onWheel, { passive: false }));

  // the keys: a piece a press, where the page is on the stage (not in a field, nor Space on a button)
  const KEYS = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 };
  on(window, 'keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !inStage()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
    const dir = e.key === ' ' ? (e.target.closest?.('button, a') ? 0 : e.shiftKey ? -1 : 1) : KEYS[e.key];
    if (!dir || leaving(dir)) return;
    e.preventDefault();
    go(base() + dir);
  });

  // the arrows by the count, and a card on the ring
  steps.forEach((s) => on(s, 'click', () => go(base() + Number(s.dataset.issStep))));
  on(ring, 'click', (e) => {
    const tile = e.target.closest('.iss__tile');
    if (tile) go(Number(tile.dataset.piece));
  });

  // a swipe, or the scrollbar: once the scroll rests, on to the nearest piece the way it went (not
  // while a finger is still down)
  let idle = 0, held = false;
  const rest = () => {
    if (glide || held || !inStage()) return;
    const p = progress();
    const near = Math.round(p);
    if (Math.abs(p - near) < 0.01) { aim = near; return; }
    go(p > aim ? Math.ceil(p - 0.2) : Math.floor(p + 0.2));
  };
  const restSoon = () => { clearTimeout(idle); idle = setTimeout(rest, 140); };
  on(window, 'scroll', () => {
    show(Math.round(progress()));
    placeSoon();
    takeWheel();
    restSoon();
  }, { passive: true });
  on(window, 'touchstart', () => { held = true; }, { passive: true });
  const lift = (e) => { held = e.touches.length > 0; if (!held) restSoon(); };
  on(window, 'touchend', lift, { passive: true });
  on(window, 'touchcancel', lift, { passive: true });
  cleanups.push(() => clearTimeout(idle));

  // the lean: the mouse's height over the screen, the ring tilted as one (eased by its transition),
  // while the stage is on the screen
  let seen = true;
  const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; });
  io.observe(root);
  cleanups.push(() => io.disconnect());
  if (!reduced) {
    let leanFrame = 0, leanY = 0.5;
    on(window, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !seen) return;
      leanY = e.clientY / innerHeight;
      leanFrame ||= requestAnimationFrame(() => {
        leanFrame = 0;
        const t = Math.max(-1, Math.min(1, leanY * 2 - 1));
        ring.style.transform = `rotateX(${(-t * LEAN).toFixed(2)}deg)`;
      });
    }, { passive: true });
    cleanups.push(() => cancelAnimationFrame(leanFrame));
  }

  // a change of the window's size: placed again only where it moved the section, kept on the piece
  // it was on (or going to), and a finger still down left alone
  let resizeFrame = 0;
  on(window, 'resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const keep = glide ? aim : current, t0 = top, s0 = step, x0 = rx, y0 = ry;
      measure();
      if ((top !== t0 || step !== s0) && inStage() && !held) go(keep, { smooth: false });
      if (rx !== x0 || ry !== y0) drive();
      place();
      takeWheel();
    });
  }, { passive: true });
  cleanups.push(() => cancelAnimationFrame(resizeFrame));

  // ---- the start: the piece the address names (#slug), else the one the scroll is on (the cards
  // carry their slugs as data, not as ids: the browser's own jump to an id inside the held stage
  // landed past it, after this had placed the page) ----
  measure();
  drive();
  const hash = () => { try { return decodeURIComponent(location.hash); } catch { return location.hash; } };
  const named = () => pieces.findIndex((p) => `#${p.dataset.issPiece}` === hash());
  if (named() >= 0) go(named(), { smooth: false });
  on(window, 'hashchange', () => { if (named() >= 0) go(named()); });
  aim = Math.round(progress());
  if (!driven) place();
  show(aim, { instant: true });
  takeWheel();

  return () => cleanups.forEach((c) => c());
}

/** The way back: to the page the reader came from, where it was one of ours (and named for it), by
 * the browser's own Back, so that page opens where they left it; else the link's own (the publication). */
function backToWhereFrom(link, on) {
  if (!link) return;
  let from = null;
  try { from = document.referrer ? new URL(document.referrer) : null; } catch { from = null; }
  if (!from || from.origin !== location.origin || from.pathname === location.pathname) return;
  const file = from.pathname.split('/').pop() || 'index.html';
  const label = link.querySelector('[data-iss-back-label]');
  if (label) label.textContent = BACK_TO[file] ?? (file.startsWith('piece-') ? 'The piece' : 'Back');
  link.href = from.href;
  on(link, 'click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || history.length < 2) return;
    e.preventDefault();
    history.back();
  });
}

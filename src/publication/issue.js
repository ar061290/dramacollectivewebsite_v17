// An issue's own page (issue-<month>-<year>.html, written by tools/pages/build.mjs issuePage), after
// Bureau Nine's front page (bureaunine.framer.website): the issue's pieces as small cards on a ring
// round a spotlight, and in the spotlight the piece at the ring's front (a bar with its title and Read
// now, its picture, a line with its writer, form, issue and reading time). The ring stands in depth
// round the spotlight: its back behind the card, its front passing over the card's picture.
// The page does not scroll while the stage fills the screen: the wheel, a swipe on the stage or the
// keys (the arrows, Page Up and Down, Space) turn the ring, smoothly and round and round, easing to
// rest on a piece once they stop; the arrows by the count and a card on the ring go a piece. "Footer"
// under the stage glides down to the footer; from there the page scrolls as ever, and back at the top
// the wheel turns the ring again. The ring leans with the mouse's height, as Bureau Nine's does: its
// back rises behind the spotlight as the pointer goes down. #<slug> opens on that piece. The ring's
// cards are the pieces' pictures, cloned from the spotlight's cards and hidden from screen readers,
// which have the cards themselves, one at a time, and the arrows; the focus, on a card, goes on with
// it. The way back goes back to the page the reader came from (named for it), where it was one of ours.
// The ring's cards move by Web Animations of their whole lap, paused and set to each one's place, a
// frame at a time only while the ring is moving. Reduced motion: the ring and the spotlight change at
// once, and the ring does not lean. On a slow device (tier-lite) the ring has each piece once.
import { liteTier } from '../util/env.js';

const RING_MIN = 12;   // the ring's cards at least: an issue of fewer pieces has them round it again
const DEPTH = 240;     // px between the ring's front and its back (they stand in depth by it)
const LAP_FRAMES = 96; // places a card is set at round its lap (the browser eases between them)
const WHEEL = 100;     // px of wheel a piece (a mouse's notch)
const SWIPE = 140;     // px of swipe a piece
const FOLLOW = 0.13;   // how far the ring catches up with where it is going, a frame
const REST = 170;      // ms after the last turn of the wheel that the ring comes to rest on a piece
const LEAN = 10;       // degrees the ring leans with the mouse at the top or the foot of the screen
const two = (i) => String(i).padStart(2, '0');
const mod = (a, b) => ((a % b) + b) % b;

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

  // ---- the ring's cards: each piece's picture, cloned from its card ----
  const reps = liteTier() ? 1 : Math.max(1, Math.ceil(RING_MIN / n));
  const m = n * reps;
  const tiles = [];
  for (let r = 0; r < reps; r++) {
    pieces.forEach((li, i) => {
      const tile = document.createElement('span');
      tile.className = 'pub-piece iss__tile';
      tile.dataset.tone = li.dataset.tone;
      tile.dataset.piece = String(i);
      tile.append(li.querySelector('.pub-piece__media').cloneNode(true));
      tiles.push(tile);
    });
  }
  ring.append(...tiles);
  nav.hidden = false;

  // ---- the ring's size: round the spotlight, its sides in the screen; on a laptop its front over
  // the card's picture, on a phone (where the card fills the width) over and under the card ----
  let rx = 0, ry = 0, lift = 0;
  const measure = () => {
    const w = stage.clientWidth;
    const spot = pieces[0].parentElement;
    const tile = tiles[0];
    rx = Math.min(500, w / 2 - tile.offsetWidth * 0.45, Math.max(spot.offsetWidth / 2 + tile.offsetWidth * 0.55, w * 0.38));
    const near = 1 - DEPTH / 2 / (parseFloat(getComputedStyle(ring.parentElement).perspective) || 1200);
    if (w < 768) {
      ry = Math.min(spot.offsetHeight / 2 + tile.offsetHeight * 0.45, (ring.clientHeight / 2) * near - tile.offsetHeight / 2);
      lift = 0;
    } else {
      ry = rx * 0.24;
      lift = -ry * 0.35;
    }
    ry = Math.max(0, ry);
  };

  // a card's place at `u` of its lap (0 the front, going round to the right): its back raised and
  // smaller, standing in depth by it (the scene's perspective gives the rest)
  const placeAt = (u) => {
    const a = u * Math.PI * 2;
    const sx = Math.sin(a), cz = Math.cos(a);
    const depth = (1 + cz) / 2;
    return `translate3d(${(rx * sx).toFixed(1)}px, ${(ry * cz + lift).toFixed(1)}px, ${((depth - 0.5) * DEPTH).toFixed(1)}px) rotateY(${(sx * 48).toFixed(2)}deg) scale(${(0.55 + 0.45 * depth).toFixed(3)})`;
  };
  // each card's lap, as an animation held still and set to its place
  let laps = [];
  const makeLaps = () => {
    laps.forEach((a) => a.cancel());
    const frames = Array.from({ length: LAP_FRAMES + 1 }, (_, j) => ({ transform: placeAt(j / LAP_FRAMES) }));
    laps = tiles.map((tile) => {
      const a = tile.animate(frames, { duration: 1000, iterations: Infinity, easing: 'linear', fill: 'both' });
      a.pause();
      return a;
    });
  };
  let pos = 0, target = 0; // the ring's place, in pieces (round and round), and where it is going
  const place = () => { laps.forEach((a, k) => { a.currentTime = mod((k - pos) / m, 1) * 1000; }); };
  cleanups.push(() => laps.forEach((a) => a.cancel()));

  // ---- the spotlight: the piece at the front, wiped in from the foot over the one going (which
  // stays whole under it until it has); the focus goes with it ----
  let current = -1, wipe = null;
  const show = (i, { instant = false } = {}) => {
    if (i === current) return;
    const was = pieces[current];
    const hadFocus = !!was?.contains(document.activeElement);
    current = i;
    wipe?.cancel();
    pieces.forEach((p, j) => p.classList.toggle('is-current', j === i));
    if (hadFocus) pieces[i].querySelector('.iss__card')?.focus({ preventScroll: true });
    at.textContent = two(i + 1);
    if (instant || !was) return;
    root.classList.add('is-moved');
    if (live) live.textContent = `${i + 1} of ${n}: ${pieces[i].querySelector('.iss__name')?.textContent ?? ''}`;
    if (reduced) return;
    was.classList.add('is-leaving');
    wipe = pieces[i].animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 360, easing: 'cubic-bezier(.22, .61, .36, 1)' });
    wipe.onfinish = wipe.oncancel = () => was.classList.remove('is-leaving');
  };

  // ---- a frame, only while the ring is still on its way ----
  let raf = 0;
  const frame = () => {
    raf = 0;
    pos = reduced ? target : pos + (target - pos) * FOLLOW;
    if (Math.abs(target - pos) < 0.001) pos = target;
    place();
    show(mod(Math.round(pos), n));
    if (pos !== target) raf = requestAnimationFrame(frame);
  };
  const kick = () => { raf ||= requestAnimationFrame(frame); };
  cleanups.push(() => cancelAnimationFrame(raf));

  // where the ring is going: by so much, and (once the turning stops) to rest on a piece
  let restTimer = 0;
  const restSoon = (ms = REST) => { clearTimeout(restTimer); restTimer = setTimeout(() => { target = Math.round(target); kick(); }, ms); };
  const turn = (by) => { target += by; kick(); restSoon(); };
  // to a piece: the nearest way round
  const goTo = (i) => {
    const here = Math.round(target);
    let d = mod(i - here, n);
    if (d > n / 2) d -= n;
    target = here + d;
    kick();
  };
  cleanups.push(() => clearTimeout(restTimer));

  // the page at its top, the stage filling the screen: the wheel and the keys are the ring's
  const atTop = () => scrollY < 4;

  on(window, 'wheel', (e) => {
    if (e.ctrlKey || !atTop()) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    const dx = e.deltaX * (e.deltaMode === 1 ? 40 : 1);
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (!d) return;
    e.preventDefault();
    turn(d / WHEEL);
  }, { passive: false });

  const KEYS = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 };
  on(window, 'keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !atTop()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
    const dir = e.key === ' ' ? (e.target.closest?.('button, a') ? 0 : e.shiftKey ? -1 : 1) : KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    target = Math.round(target) + dir;
    kick();
  });

  // a swipe on the stage (the stage takes no scroll of its own: publication-issue.css): the ring
  // turns with the finger, carries on a little as it lifts, and comes to rest; below the top, the
  // swipe scrolls the page instead
  let touch = null;
  on(stage, 'touchstart', (e) => {
    if (e.touches.length !== 1) { touch = null; return; }
    const t = e.touches[0];
    touch = { y: t.clientY, x: t.clientX, last: t.clientY, time: e.timeStamp, v: 0 };
    clearTimeout(restTimer);
  }, { passive: true });
  on(stage, 'touchmove', (e) => {
    if (!touch || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dy = t.clientY - touch.last;
    const dt = Math.max(1, e.timeStamp - touch.time);
    touch.v = dy / dt;
    touch.last = t.clientY;
    touch.time = e.timeStamp;
    if (e.cancelable) e.preventDefault();
    if (!atTop()) { window.scrollBy(0, -dy); return; }
    target -= dy / SWIPE;
    kick();
  }, { passive: false });
  const lift_ = () => {
    if (!touch) return;
    if (atTop()) target -= (touch.v * 220) / SWIPE; // its fling
    touch = null;
    kick();
    restSoon(60);
  };
  on(stage, 'touchend', lift_, { passive: true });
  on(stage, 'touchcancel', lift_, { passive: true });

  // the arrows by the count, and a card on the ring
  steps.forEach((s) => on(s, 'click', () => { target = Math.round(target) + Number(s.dataset.issStep); kick(); }));
  on(ring, 'click', (e) => {
    const tile = e.target.closest('.iss__tile');
    if (tile) goTo(Number(tile.dataset.piece));
  });

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

  // a change of the window's size: the ring measured and laid round again
  let resizeFrame = 0;
  on(window, 'resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const x0 = rx, y0 = ry;
      measure();
      if (rx !== x0 || ry !== y0) { makeLaps(); place(); }
    });
  }, { passive: true });
  cleanups.push(() => cancelAnimationFrame(resizeFrame));

  // ---- the start: on the piece the address names (#slug), else the first ----
  measure();
  makeLaps();
  const hash = () => { try { return decodeURIComponent(location.hash); } catch { return location.hash; } };
  const named = () => pieces.findIndex((p) => `#${p.dataset.issPiece}` === hash());
  pos = target = Math.max(0, named());
  place();
  show(mod(pos, n), { instant: true });
  on(window, 'hashchange', () => { if (named() >= 0) goTo(named()); });

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

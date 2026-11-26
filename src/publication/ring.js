// All the pieces in a ring (pieces.html), after sebneil.com: every piece's picture (its title on its
// colour) standing round a circle seen from a little above, turning slowly, the pieces round it again
// as many times as fill it (the cards are in the page, written by tools/pages/build.mjs, so the ring
// stands from the first paint; a phone and a slow device show fewer of them). The circle leans with
// a mouse's height over the screen, as sebneil's does. The card pointed at slows the turn and shows
// large in the corner, with its writer and form; a click opens the piece. Each card has
// a face on either side, so it reads the right way round from the back too. The wheel turns the ring
// (the page does not scroll while the ring is up and the page at its top; "Footer" under it goes on
// down), and a drag either way turns it by hand. In its middle, "Open in grid view"; the switch over
// it (Ring / Grid) swaps the ring and the grid (with its filters).
// The ring is where the page opens; the grid is kept in the address (?view=grid, and a filter in it
// opens on the grid unless the address says ?view=circle), so the way back from a piece comes back
// to it.
// The cards are links: the first of each piece's in the tab order, the repeats out of it and hidden
// from screen readers. A card reached from the keyboard is turned round to stand at the front left,
// face on, and the ring holds there while it has the focus, the card shown large. The turn is the
// compositor's (one Web Animation of the ring), paused while the ring is off the screen or the grid is
// up. With reduced motion, and on a slow device (tier-lite: an endless turn draws every frame), it
// stands still; a drag still turns it. Without scripts the page is the grid alone
// (publication-issue.css).
import { liteTier } from '../util/env.js';

const LAP = 2600;    // ms a card takes to go one card's place round, at full speed
const DRAG = 0.22;   // degrees of turn a pixel of drag
const FRONT = 0.15;  // where a card reached from the keyboard is turned to: the front left, face on
const TILT = [-22, -12]; // the circle's lean, in degrees: the pointer at the top of the screen, at the foot
const WHEEL_CARDS = 1.5; // cards the ring turns by for a notch of the wheel (100px)

/** @param {{ reduced: boolean }} ctx  bootPage's context (only `reduced` is used) */
export function setupRing({ reduced }) {
  const page = document.querySelector('.read--index');
  const ring = document.querySelector('[data-ring]');
  const scene = ring?.querySelector('[data-ring-scene]');
  const tilt = ring?.querySelector('[data-ring-tilt]');
  const wheel = ring?.querySelector('[data-ring-wheel]');
  const peek = ring?.querySelector('[data-ring-peek]');
  const toggle = document.querySelector('[data-index-view]');
  const grid = document.querySelector('[data-index-grid]');
  const pieces = grid ? [...grid.querySelectorAll('.pub-piece')] : [];
  const cards = wheel ? [...wheel.querySelectorAll('.ring__card')] : [];
  if (!page || !scene || !tilt || !wheel || !peek || !toggle || !cards.length) return () => {};
  const sides = [...document.querySelectorAll('[data-view-side]')];
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };
  // the cards round the ring now (publication-issue.css: all of them, or a phone's share)
  const count = () => Number(getComputedStyle(wheel).getPropertyValue('--m')) || cards.length;
  let drag = null, draggedAt = -Infinity; // a drag under way; when the last one ended

  // ---- the turn: one Web Animation of the ring (the compositor's), a lap of its cards ----
  const spin = wheel.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-360deg)' }], { duration: count() * LAP, iterations: Infinity });
  const lap = () => spin.effect.getTiming().duration;
  let shown = true;   // the ring on the screen
  let held = 0;       // what holds it still: reduced motion or a slow device (1), a card with the keyboard's focus (2), the grid (4)
  if (reduced || liteTier()) held |= 1;
  const rate = (r) => { try { spin.updatePlaybackRate(r); } catch { spin.playbackRate = r; } };
  const play = () => { if (!held && shown) spin.play(); else spin.pause(); };
  cleanups.push(() => spin.cancel());
  const io = new IntersectionObserver(([e]) => { shown = e.isIntersecting; play(); });
  io.observe(ring);
  cleanups.push(() => io.disconnect());

  // ---- the lean: the mouse's height over the screen, a frame at a time (the tilt eases there) ----
  let leanFrame = 0, leanY = 0;
  if (!reduced) {
    on(window, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !shown || page.dataset.view === 'grid') return;
      leanY = e.clientY / innerHeight;
      leanFrame ||= requestAnimationFrame(() => {
        leanFrame = 0;
        const t = Math.max(0, Math.min(1, leanY));
        // (its transform itself: a property the cards inherit would restyle every one of them)
        tilt.style.transform = `rotateX(${(TILT[0] + (TILT[1] - TILT[0]) * t).toFixed(2)}deg)`;
      });
    }, { passive: true });
    cleanups.push(() => cancelAnimationFrame(leanFrame));
  }

  // ---- the one pointed at: large in the corner, with its writer and form ----
  const peekAt = (a) => {
    const c = pieces[Number(a.dataset.piece)];
    const by = c?.querySelector('.pub-piece__by')?.textContent ?? '';
    const form = c?.querySelector('.pub-piece__form')?.textContent ?? '';
    const tile = document.createElement('div');
    tile.className = 'pub-piece ring__peek-card';
    tile.dataset.tone = a.dataset.tone;
    tile.append(a.querySelector('.pub-piece__media').cloneNode(true));
    const cap = document.createElement('p');
    cap.className = 'ring__peek-cap';
    cap.textContent = [by, form].filter(Boolean).join(' · ');
    peek.replaceChildren(tile, cap);
    peek.classList.add('is-on');
  };
  const unpeek = () => peek.classList.remove('is-on', 'is-focus');
  // (the card with the keyboard's focus, if there is one, shows again once the pointer leaves another)
  on(wheel, 'pointerover', (e) => {
    const a = e.target.closest('.ring__card');
    if (!a || e.pointerType !== 'mouse' || drag?.moved) return;
    peekAt(a);
    peek.classList.toggle('is-focus', a.matches(':focus-visible'));
    rate(0.18);
  });
  on(wheel, 'pointerout', (e) => {
    const a = e.target.closest('.ring__card');
    if (!a || a.contains(e.relatedTarget)) return;
    const focused = wheel.querySelector('.ring__card:focus-visible');
    if (focused) { peekAt(focused); peek.classList.add('is-focus'); } else unpeek();
    rate(1);
  });
  // the keyboard's focus: the card turned round to the front left, face on, and held there
  on(wheel, 'focusin', (e) => {
    const a = e.target.closest('.ring__card');
    if (!a || !a.matches(':focus-visible')) return;
    const k = Number(a.style.getPropertyValue('--i'));
    spin.currentTime = (((k / count() + FRONT) % 1) + 1) % 1 * lap();
    held |= 2;
    play();
    peekAt(a);
    peek.classList.add('is-focus');
  });
  on(wheel, 'focusout', (e) => {
    if (wheel.contains(e.relatedTarget)) return;
    held &= ~2;
    play();
    unpeek();
  });

  // ---- the wheel: while the ring is up and the page at its top, it turns the ring (eased, a frame
  // at a time, and on as the turn was going), and the page does not scroll; Footer under the ring
  // goes on down ----
  let pending = 0, wheelFrame = 0;
  const ease = () => {
    wheelFrame = 0;
    const step = pending * 0.16;
    pending -= step;
    const l = lap();
    spin.currentTime = (((spin.currentTime ?? 0) + step) % l + l) % l;
    if (Math.abs(pending) > 2) wheelFrame = requestAnimationFrame(ease);
    else pending = 0;
  };
  on(window, 'wheel', (e) => {
    if (e.ctrlKey || page.dataset.view === 'grid' || scrollY > 4) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    const dx = e.deltaX * (e.deltaMode === 1 ? 40 : 1);
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (!d) return;
    e.preventDefault();
    unpeek();
    pending += d * (WHEEL_CARDS * LAP) / 100;
    wheelFrame ||= requestAnimationFrame(ease);
  }, { passive: false });
  cleanups.push(() => cancelAnimationFrame(wheelFrame));

  // ---- a drag: the ring turned by hand, either way across or up and down (the ring takes no scroll
  // of its own). The press takes no focus, starts no drag of the link and selects nothing ----
  on(scene, 'mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
  on(scene, 'pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: spin.currentTime ?? 0, moved: false };
  });
  on(window, 'pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    const d = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
    if (!drag.moved && Math.abs(d) < 6) return;
    if (!drag.moved) { drag.moved = true; scene.classList.add('is-dragging'); unpeek(); }
    const l = lap();
    spin.currentTime = ((drag.t - (d * DRAG / 360) * l) % l + l) % l;
  }, { passive: true });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) draggedAt = performance.now();
    drag = null;
    scene.classList.remove('is-dragging');
  };
  on(window, 'pointerup', drop);
  on(window, 'pointercancel', drop);
  // the click that ends a drag opens nothing (as the pillars' cards do, src/sections/pillars.js)
  on(ring, 'click', (e) => {
    if (performance.now() - draggedAt >= 400) return;
    draggedAt = -Infinity;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ---- the view: the ring, or the grid; kept in the address where it is not the ring by default ----
  const setView = (view, { keep = true } = {}) => {
    page.dataset.view = view;
    toggle.checked = view === 'grid';
    sides.forEach((s) => s.classList.toggle('is-on', s.dataset.viewSide === view));
    held = view === 'grid' ? held | 4 : held & ~4;
    play();
    if (!keep) return;
    const q = new URLSearchParams(location.search);
    if (view === 'grid' || q.has('form') || q.has('month')) q.set('view', view); else q.delete('view');
    const s = q.toString();
    history.replaceState(history.state, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
  };
  const asked = new URLSearchParams(location.search);
  const v = asked.get('view');
  setView(v === 'grid' || v === 'circle' ? v : asked.has('form') || asked.has('month') ? 'grid' : 'circle', { keep: false });
  on(toggle, 'change', () => setView(toggle.checked ? 'grid' : 'circle'));
  sides.forEach((s) => on(s, 'click', () => setView(s.dataset.viewSide)));
  on(ring.querySelector('[data-ring-grid]'), 'click', () => {
    setView('grid');
    toggle.focus({ preventScroll: true });
  });

  return () => cleanups.forEach((c) => c());
}

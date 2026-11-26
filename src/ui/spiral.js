// The Gallery's spirals (gallery.html, written by tools/pages/build.mjs gallery()), after SpiralGallery:
// each event's pictures wound round its column as a ribbon (their places are the stylesheet's,
// gallery.css: a picture's turn and height on the ribbon from its index), and the page's scroll turns
// every column's ribbon at once, as a screw turns: the pictures go round and up, each column from its
// first picture to its last over the same stretch of scroll (the section the columns stand in, held
// on the screen meanwhile). Only the pictures near the middle of a column are drawn (the ribbon's
// turns above and below the column's window are left out, and load only as they come near). Across,
// the columns scroll from event to event: a swipe, the trackpad, Shift and the wheel, the keys on the
// row, the arrows over it, or an event's name. The work a frame is a transform a column (for the
// columns on the screen), and only as the page scrolls. With reduced motion the ribbons still follow
// the scroll (it is the reader's own), and the change between events is at once.
import { liteTier } from '../util/env.js';

const NEAR = 24; // pictures either side of a column's middle that are drawn (fewer on a slow device)

/** @param {{ reduced: boolean }} ctx  bootPage's context @returns {() => void} cleanup */
export function setupSpirals({ reduced }) {
  const track = document.querySelector('[data-gal-track]');
  const row = track?.querySelector('[data-gal-cols]');
  const cols = row ? [...row.querySelectorAll('[data-gal-col]')] : [];
  if (!track || !row || !cols.length) return () => {};
  const stage = track.firstElementChild;
  const steps = track.querySelector('[data-gal-steps]');
  const near = liteTier() ? 14 : NEAR;
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

  const spirals = cols.map((col) => {
    const ribbon = col.querySelector('[data-gal-ribbon]');
    const tiles = [...ribbon.children];
    return { col, ribbon, tiles, lo: 0, hi: -1, on: true, dy: 16, dt: 48 };
  });
  track.classList.add('is-live');

  // ---- the scroll: how far through the section, 0 to 1 ----
  let top = 0, run = 1;
  const measure = () => {
    top = track.getBoundingClientRect().top + scrollY;
    run = Math.max(1, track.offsetHeight - stage.offsetHeight);
    // each column's ribbon: its rise and its turn a picture (gallery.css, by the screen's size)
    spirals.forEach((s) => {
      const cs = getComputedStyle(s.col);
      s.dy = parseFloat(cs.getPropertyValue('--dy')) || 16;
      s.dt = parseFloat(cs.getPropertyValue('--dt')) || 48;
    });
  };
  const progress = () => Math.min(1, Math.max(0, (scrollY - top) / run));

  // ---- a column's ribbon turned to `p`: its picture at `p` of the way through at the front ----
  const turn = (s, p) => {
    const o = p * (s.tiles.length - 1);
    s.ribbon.style.transform = `rotateX(-14deg) rotateZ(-4deg) translateY(${(-o * s.dy).toFixed(1)}px) rotateY(${(-o * s.dt).toFixed(2)}deg)`;
    // the pictures drawn: those near the front, by their place on the ribbon
    const lo = Math.max(0, Math.floor(o - near)), hi = Math.min(s.tiles.length - 1, Math.ceil(o + near));
    if (lo === s.lo && hi === s.hi) return;
    for (let j = Math.min(lo, s.lo); j <= Math.max(hi, s.hi); j++) {
      const t = s.tiles[j];
      if (t) t.classList.toggle('is-near', j >= lo && j <= hi);
    }
    s.lo = lo;
    s.hi = hi;
  };
  let frame = 0;
  const draw = () => {
    frame = 0;
    const p = progress();
    spirals.forEach((s) => { if (s.on) turn(s, p); });
  };
  const soon = () => { frame ||= requestAnimationFrame(draw); };
  on(window, 'scroll', soon, { passive: true });
  cleanups.push(() => cancelAnimationFrame(frame));

  // only the columns on the screen turn (a column coming in is turned to the page's place first)
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const s = spirals.find((x) => x.col === e.target);
      if (!s) return;
      s.on = e.isIntersecting;
      if (s.on) turn(s, progress());
    });
  }, { root: row, rootMargin: '0px 40%' });
  cols.forEach((c) => io.observe(c));
  cleanups.push(() => io.disconnect());

  // ---- across: the arrows over the row, the events' names ----
  const width = () => cols[0].offsetWidth + (parseFloat(getComputedStyle(row).columnGap) || 0);
  const behavior = reduced ? 'instant' : 'smooth';
  const toStage = () => { if (scrollY < top - 2) window.scrollTo({ top, behavior }); };
  steps.hidden = false;
  steps.querySelectorAll('[data-gal-step]').forEach((b) => on(b, 'click', () => {
    row.scrollBy({ left: Number(b.dataset.galStep) * width(), behavior });
  }));
  track.querySelectorAll('[data-gal-to]').forEach((a) => on(a, 'click', (e) => {
    const col = cols.find((c) => c.id === a.dataset.galTo);
    if (!col || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // ours, not the site's in-page glide (src/animations/nav.js)
    row.scrollTo({ left: col.offsetLeft - row.offsetLeft - (parseFloat(getComputedStyle(row).paddingLeft) || 0), behavior });
    toStage();
  }));

  // a change of the window's size
  on(window, 'resize', () => { measure(); spirals.forEach((s) => { s.lo = 0; s.hi = -1; }); soon(); }, { passive: true });

  measure();
  draw();
  return () => {
    cleanups.forEach((c) => c());
    track.classList.remove('is-live');
  };
}

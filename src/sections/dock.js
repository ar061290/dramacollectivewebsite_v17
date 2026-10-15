// The last act is the footer's columns (every page, who to write to), and they go to the footer as the
// logo does:
//   1. they scroll in with the act; once they are in the middle of the screen (or, where they do not
//      fit, just under the top bar) they hold there, as the fixed logo beside them does, while <main>
//      runs on past the act for the stage's sequence;
//   2. as the footer rises, each column travels from there to its own place in the footer
//      ([data-dock-col] to the [data-dock-slot] of the same name), on the same stretch of scroll and
//      the same ease as the logo travels to the mark (Stage._dock: from the footer's top at the foot of
//      the screen until it has risen as far as it will), so the logo and the columns arrive together.
// While they hold and travel the columns are position: fixed, so the browser keeps them still against
// the scroll itself; moving them against the scroll from script (a transform per scroll event) runs a
// frame behind a fast scroll and shakes. Before the hold they are in the act as laid out; once the
// footer has risen they sit in their slots and scroll with it (a transform by their offset).
// Where the footer's order differs from the act's (wide screens: who to write to moves up beside the
// others), the columns take shaped paths so none passes through another: a column going down moves
// across first and comes down later; one going up comes up late, once the others have moved clear.
// Everything is laid out normally, so each column's place and its slot's are measured once per layout
// (static, transforms off); the slots are given their columns' sizes, so nothing below them moves when
// they arrive, and the act's column block keeps its height while its columns are away.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t); // Stage._dock's
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function setupDock() {
  const block = document.querySelector('[data-dock]');
  const footer = document.querySelector('.curtain--home');
  if (!block || !footer) return () => {};
  const nav = block.querySelector('nav') ?? block;
  const cols = [...block.querySelectorAll('[data-dock-col]')]
    .map((el) => ({ el, slot: footer.querySelector(`[data-dock-slot="${el.dataset.dockCol}"]`), x: 0, y: 0, sx: 0, sy: 0, w: 0, up: false }))
    .filter((c) => c.slot);
  if (!cols.length) return () => {};

  // scroll positions (page px), measured with the layout: hold (the columns settle on screen), from
  // (the footer's top at the foot of the screen) and to (the footer risen as far as it will)
  const at = { hold: 0, from: 0, to: 1 };
  let shaped = false;
  let mode = 'static';
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  const setMode = (m) => {
    if (m === mode) return;
    mode = m;
    for (const c of cols) {
      const s = c.el.style;
      if (m === 'fixed') {
        // where the column is on screen at the hold, pinned there
        s.position = 'fixed';
        s.left = `${c.x}px`;
        s.top = `${c.y - at.hold}px`;
        s.width = `${c.w}px`;
        s.margin = '0';
      } else {
        s.position = s.left = s.top = s.width = s.margin = '';
      }
    }
  };

  const measure = () => {
    setMode('static');
    const vh = innerHeight;
    for (const c of cols) {
      gsap.set(c.el, { x: 0, y: 0 });
      const r = c.el.getBoundingClientRect(), s = c.slot.getBoundingClientRect();
      c.x = r.left; c.y = r.top + window.scrollY; c.w = r.width;
      c.sx = s.left; c.sy = s.top + window.scrollY;
    }
    const top = docTop(nav), h = nav.offsetHeight;
    const fTop = docTop(footer);
    at.from = fTop - vh;
    at.to = fTop - Math.max(0, vh - footer.offsetHeight);
    // centred on screen where they fit with room for the top bar, else with their top just under it;
    // never before the act has reached that point, never after the footer starts to rise
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
    at.hold = Math.min(at.from, top - (h + bar * 2 <= vh ? Math.max(bar, (vh - h) / 2) : bar + 8));
    // on screen a column drops from where it is held to its slot's place once the footer has risen; one
    // that drops less than another by more than its own height ends up beside or above it (who to write
    // to, on wide screens), so it must wait for the others to move clear: it goes late
    const drops = cols.map((c) => (c.sy - at.to) - (c.y - at.hold));
    cols.forEach((c, i) => {
      const most = Math.max(...drops.filter((_, j) => j !== i));
      c.up = drops[i] < most - c.el.offsetHeight;
    });
    shaped = cols.some((c) => c.up);
  };

  // a column's progress across (x) and down (y) at the move's progress t, both 0 at t = 0 and 1 at 1
  const path = (c, t) => {
    if (!shaped) { const k = ease(t); return [k, k]; }
    if (c.up) return [ease(t), ease(clamp01((t - 0.5) / 0.5))]; // up: late, once the way is clear
    return [ease(clamp01(t / 0.55)), ease(clamp01((t - 0.35) / 0.65))]; // down: across first
  };

  const apply = (y) => {
    const t = clamp01((y - at.from) / Math.max(1, at.to - at.from));
    if (y < at.hold) {
      setMode('static');
      for (const c of cols) gsap.set(c.el, { x: 0, y: 0 });
    } else if (y < at.to - 0.5) {
      // held, then on the way: from the held place to the slot as it now is on screen
      setMode('fixed');
      for (const c of cols) {
        const [kx, ky] = path(c, t);
        gsap.set(c.el, { x: (c.sx - c.x) * kx, y: (c.sy - y - (c.y - at.hold)) * ky, force3D: true });
      }
    } else {
      // arrived: in the slot, scrolling with the footer
      setMode('static');
      for (const c of cols) gsap.set(c.el, { x: c.sx - c.x, y: c.sy - c.y, force3D: true });
    }
    const f = footer.getBoundingClientRect().top;
    for (const c of cols) {
      c.el.style.setProperty('--dock', ease(t).toFixed(3));
      const r = c.el.getBoundingClientRect();
      c.el.style.setProperty('--over', clamp01((r.bottom - f) / Math.max(1, r.height)).toFixed(3));
    }
  };

  // before ScrollTrigger measures the page: static, transforms off, the act's column block at its own
  // height (its columns leave it while they are fixed), each slot as wide as its column (--w sizes the
  // wide footer's row) and all as tall as the tallest, so the columns land with their headings on one
  // line and the row is centred on the mark as one group
  const prepare = () => {
    setMode('static');
    nav.style.minHeight = '';
    for (const c of cols) gsap.set(c.el, { x: 0, y: 0 });
    nav.style.minHeight = `${nav.offsetHeight}px`;
    const tallest = Math.max(...cols.map((c) => c.el.offsetHeight));
    for (const c of cols) {
      c.slot.style.minHeight = `${tallest}px`;
      c.slot.style.setProperty('--w', `${c.el.offsetWidth}px`);
    }
  };

  prepare();
  ScrollTrigger.addEventListener('refreshInit', prepare);
  const trigger = ScrollTrigger.create({
    // from the hold to the footer risen as far as it will
    start: () => { measure(); return Math.min(at.hold, at.from); },
    end: () => at.to,
    onRefresh: (self) => apply(self.scroll()),
    onUpdate: (self) => apply(self.scroll()),
  });
  block.classList.add('is-docking');

  return () => {
    ScrollTrigger.removeEventListener('refreshInit', prepare);
    trigger.kill();
    setMode('static');
    block.classList.remove('is-docking');
    nav.style.minHeight = '';
    for (const c of cols) {
      c.el.style.removeProperty('--dock');
      c.el.style.removeProperty('--over');
      c.slot.style.removeProperty('min-height');
      c.slot.style.removeProperty('--w');
      gsap.set(c.el, { clearProps: 'transform' });
    }
  };
}

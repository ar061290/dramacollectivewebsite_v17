// The follow-spot: one warm pool of light over a [data-spot] block, following the pointer while it
// is over the block. On touch it follows the finger while it moves, and otherwise sits on the
// middle of the screen as the page scrolls past, so a phone sees the light walk down the block.
// It writes --spot-x / --spot-y (px, in the block's own space) and moves a .spot-glow element by
// transform; `onMove(x, y, a)` lets a page light what is near it (a: 0 off ... 1 on).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

export function followSpot(el, { glow = true, onMove, reduced = false } = {}) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const spot = { x: -999, y: -999, a: 0 };
  const halo = glow ? Object.assign(document.createElement('span'), { className: 'spot-glow' }) : null;
  if (halo) { halo.setAttribute('aria-hidden', 'true'); el.prepend(halo); }

  let dirty = true;
  let ticking = false;
  // --spot-x / --spot-y are read only by a lit copy of the text (.spot-text__lit, the About
  // statement); elsewhere writing them restyled every descendant of the block for nothing
  let reads = null;
  const mark = () => { dirty = true; if (!ticking) { ticking = true; gsap.ticker.add(tick); } };
  const dur = reduced ? 0 : 0.45;
  const qx = gsap.quickTo(spot, 'x', { duration: dur, ease: 'power3.out', onUpdate: mark });
  const qy = gsap.quickTo(spot, 'y', { duration: dur, ease: 'power3.out', onUpdate: mark });
  const qa = gsap.quickTo(spot, 'a', { duration: reduced ? 0 : 0.35, ease: 'power2.out', onUpdate: mark });

  const tick = () => {
    if (!dirty) { gsap.ticker.remove(tick); ticking = false; return; } // nothing moved: off the ticker until something does
    dirty = false;
    reads ??= !!el.querySelector('.spot-text__lit');
    if (reads) {
      el.style.setProperty('--spot-x', `${spot.x}px`);
      el.style.setProperty('--spot-y', `${spot.y}px`);
    }
    if (halo) gsap.set(halo, { x: spot.x, y: spot.y, opacity: spot.a });
    onMove?.(spot.x, spot.y, spot.a);
  };
  mark();

  let placed = false;
  const aim = (x, y, a = 1) => {
    if (!placed) { gsap.set(spot, { x, y }); placed = true; mark(); } // first time: appear where it is
    qx(x); qy(y); qa(a);
  };
  const local = (e) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onMoveEv = (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || e.buttons || e.type === 'pointerdown') aim(...local(e));
  };
  const onLeave = (e) => { if (e.pointerType === 'mouse') qa(0); };
  el.addEventListener('pointermove', onMoveEv, { passive: true });
  el.addEventListener('pointerdown', onMoveEv, { passive: true });
  el.addEventListener('pointerleave', onLeave);

  // touch: the light sits where the middle of the screen crosses the block
  let st = null;
  if (!fine) {
    st = ScrollTrigger.create({
      trigger: el,
      start: 'top 70%',
      end: 'bottom 30%',
      onUpdate: () => {
        const r = el.getBoundingClientRect();
        aim(spot.x > -999 && placed ? Math.min(Math.max(spot.x, 0), r.width) : r.width * 0.5, innerHeight * 0.5 - r.top);
      },
      onToggle: (self) => { if (!self.isActive) qa(0); },
    });
  }

  return {
    aim,
    dispose() {
      gsap.ticker.remove(tick);
      ticking = false;
      st?.kill();
      halo?.remove();
      el.removeEventListener('pointermove', onMoveEv);
      el.removeEventListener('pointerdown', onMoveEv);
      el.removeEventListener('pointerleave', onLeave);
    },
  };
}

/** Distance falloff for lighting things near the spot: 1 at the centre, 0 beyond `radius`. */
export const falloff = (dx, dy, radius) => {
  const d = Math.hypot(dx, dy) / radius;
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d);
};

/** A lit copy of a block's text, shown only inside the spot (.spot-text__lit). */
export function litCopy(base) {
  const lit = base.cloneNode(true);
  lit.classList.remove('spot-text__base');
  lit.classList.add('spot-text__lit');
  lit.removeAttribute('data-reveal');
  lit.setAttribute('aria-hidden', 'true');
  base.after(lit);
  return lit;
}

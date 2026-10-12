// The publication: the cover opens when the book comes into view; drag it (or tap it, or use the
// button) to close and open it again. Inside, the contents lines light as the spot passes.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { bootPage } from '../site/boot.js';
import { followSpot, falloff } from '../site/spotlight.js';

const OPEN = -164; // degrees: the cover laid back over the spine

bootPage(({ reduced }) => {
  const book = document.querySelector('[data-book]');
  if (!book) return undefined;
  const cover = book.querySelector('[data-book-cover]');
  const toggle = document.querySelector('[data-book-toggle]');
  const cleanups = [];
  const state = { angle: 0 };
  const apply = () => {
    gsap.set(cover, { rotationY: state.angle });
    book.style.setProperty('--open', (state.angle / OPEN).toFixed(3));
  };
  gsap.set(cover, { transformPerspective: 2000, transformOrigin: '0% 50%' });
  apply();

  let isOpen = false;
  let dragging = null; // { x, y, from, moved, id } while the cover is held
  const setOpen = (open, duration = 1) => {
    isOpen = open;
    toggle.setAttribute('aria-pressed', String(open));
    toggle.textContent = open ? 'Close the cover' : 'Open the cover';
    gsap.to(state, { angle: open ? OPEN : 0, duration: reduced ? 0 : duration, ease: open ? 'curtain' : 'power2.inOut', onUpdate: apply, overwrite: true });
  };
  const onToggle = () => setOpen(!isOpen, 0.9);
  toggle.addEventListener('click', onToggle);

  // the first time the book is in view, the cover swings open on its own
  const enter = ScrollTrigger.create({ trigger: book, start: 'top 70%', once: true, onEnter: () => { if (!isOpen && !dragging) setOpen(true, 1.3); } });

  // dragging the cover: its edge follows the pointer; let go past halfway and it falls that way
  const onDown = (e) => {
    if (e.button > 0) return;
    gsap.killTweensOf(state);
    dragging = { x: e.clientX, y: e.clientY, from: state.angle, moved: false, id: e.pointerId };
  };
  const onMove = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dx = e.clientX - dragging.x;
    if (!dragging.moved) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(e.clientY - dragging.y) > Math.abs(dx)) { dragging = null; return; } // a scroll, not a drag
      dragging.moved = true;
      cover.setPointerCapture?.(e.pointerId);
    }
    const w = book.getBoundingClientRect().width;
    state.angle = Math.max(OPEN, Math.min(0, dragging.from + (dx / w) * 180));
    apply();
  };
  const onUp = () => {
    if (!dragging) return;
    const { moved } = dragging;
    dragging = null;
    if (!moved) setOpen(!isOpen, 0.9);
    else setOpen(state.angle < OPEN / 2, 0.6);
  };
  cover.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // the contents page: each line takes light from the spot
  const list = book.querySelector('[data-contents]');
  if (list) {
    const items = [...list.querySelectorAll('li')];
    let ys = [];
    const measure = () => { const l = list.getBoundingClientRect(); ys = items.map((li) => { const r = li.getBoundingClientRect(); return r.top - l.top + r.height / 2; }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    const spot = followSpot(list, {
      reduced,
      glow: false,
      onMove: (x, y, a) => items.forEach((li, i) => li.style.setProperty('--lit', (falloff(0, y - ys[i], 70) * a).toFixed(3))),
    });
    cleanups.push(() => { ro.disconnect(); spot.dispose(); });
  }

  cleanups.push(() => {
    enter.kill();
    toggle.removeEventListener('click', onToggle);
    cover.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  });
  return () => cleanups.forEach((c) => c());
});

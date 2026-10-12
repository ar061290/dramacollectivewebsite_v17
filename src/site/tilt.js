// Tilt toward the pointer: a card (or the footer's mark) leans a few degrees toward where the
// pointer is over it, and settles back when it leaves. On touch it leans while pressed. Off with
// reduced motion.
import gsap from 'gsap';

export function tilt(el, { target = el, max = 8, lift = 0, reduced = false, perspective = 900 } = {}) {
  if (reduced) return () => {};
  gsap.set(target, { transformPerspective: perspective, transformOrigin: '50% 50%' });
  const rx = gsap.quickTo(target, 'rotationX', { duration: 0.5, ease: 'power3.out' });
  const ry = gsap.quickTo(target, 'rotationY', { duration: 0.5, ease: 'power3.out' });
  const z = lift ? gsap.quickTo(target, 'z', { duration: 0.5, ease: 'power3.out' }) : null;
  let pressed = false;

  const lean = (e) => {
    const r = el.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width - 0.5;
    const v = (e.clientY - r.top) / r.height - 0.5;
    ry(u * 2 * max);
    rx(-v * 2 * max);
    z?.(lift);
  };
  const settle = () => { rx(0); ry(0); z?.(0); };

  const onMove = (e) => { if (e.pointerType === 'mouse' || pressed) lean(e); };
  const onDown = (e) => { if (e.pointerType !== 'mouse') { pressed = true; lean(e); } };
  const onUp = () => { if (pressed) { pressed = false; settle(); } };
  const onLeave = (e) => { if (e.pointerType === 'mouse') settle(); };

  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerdown', onDown, { passive: true });
  el.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    gsap.set(target, { clearProps: 'transform' });
  };
}

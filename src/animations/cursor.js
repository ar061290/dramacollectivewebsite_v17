// The star cursor (and the constellation pen). Desktop, fine pointers only.
// The star itself is a native cursor image set in CSS (layout.css), so the system draws it with no
// lag and pixel-exact clicks. This module switches it on, keeps the "Drag" hint and the glow beside
// it, and tells the CSS two things about what is under the pointer:
//   is-over-text  selectable text: the star stretches into its tall text form
//   is-on-box     a text box (where the sky is cleared, so the small star is harder to see): a soft
//                 glow behind the star, clipped to the box so it shows only there

const BOXES = '[data-mask], .curtain, .topbar__sheet';
const NOT_TEXT = 'a, button, input, select, textarea, label, [role="button"], .cursor, .loader';

/** True when a character of real text is under (x, y), not just the nearest caret position. */
function overText(x, y, target) {
  if (!target || target.closest?.(NOT_TEXT)) return false;
  let node, offset;
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    node = p?.offsetNode; offset = p?.offset;
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    node = r?.startContainer; offset = r?.startOffset;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.data.trim()) return false;
  if (getComputedStyle(node.parentElement).userSelect === 'none') return false;
  const range = document.createRange();
  for (const o of [offset - 1, offset]) {
    if (o < 0 || o >= node.length) continue;
    range.setStart(node, o);
    range.setEnd(node, o + 1);
    for (const rc of range.getClientRects()) {
      if (x >= rc.left - 1 && x <= rc.right + 1 && y >= rc.top && y <= rc.bottom) return true;
    }
  }
  return false;
}

export function setupCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};
  const root = document.documentElement;
  const el = document.querySelector('.cursor');
  root.classList.add('has-cursor');
  if (!el) return () => root.classList.remove('has-cursor');
  const glow = el.querySelector('.cursor__glow');
  const R = 32; // half the glow's size (layout.css)

  let last = null, raf = 0;
  const update = () => {
    raf = 0;
    if (!last) return;
    const { x, y, target } = last;
    root.classList.toggle('is-over-text', overText(x, y, target));
    const box = target?.closest?.(BOXES);
    el.classList.toggle('is-on-box', !!box);
    if (box && glow) {
      // clip the glow to the box: how far each of the box's edges cuts into the glow's square
      const b = box.getBoundingClientRect();
      const t = Math.max(0, b.top - (y - R)), l = Math.max(0, b.left - (x - R));
      const btm = Math.max(0, y + R - b.bottom), rgt = Math.max(0, x + R - b.right);
      glow.style.clipPath = `inset(${t}px ${rgt}px ${btm}px ${l}px)`;
    }
  };
  const look = () => { if (last && !raf) raf = requestAnimationFrame(update); };
  const onMove = (e) => {
    if (e.pointerType === 'touch') return;
    el.classList.add('is-visible');
    el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    last = { x: e.clientX, y: e.clientY, target: e.target };
    look();
  };
  const onLeave = () => {
    el.classList.remove('is-visible', 'is-on-box');
    root.classList.remove('is-over-text');
    last = null;
  };
  // scrolling moves the page under a still pointer: look again at what is there now
  const onScroll = () => {
    if (!last) return;
    last.target = document.elementFromPoint(last.x, last.y);
    look();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('pointerleave', onLeave);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('scroll', onScroll);
    root.removeEventListener('pointerleave', onLeave);
    root.classList.remove('has-cursor', 'is-over-text');
  };
}

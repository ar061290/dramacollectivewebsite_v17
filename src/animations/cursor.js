// The star cursor (and the constellation pen). Desktop, fine pointers only.
// The star itself is a native cursor image set in CSS (layout.css), so the system draws it with no
// lag and pixel-exact clicks. This module switches it on, keeps the "Drag" hint beside it, and
// tells the CSS (classes on <html>) two things about what is under the pointer:
//   is-over-text  selectable text: the star stretches into its tall text form
//   is-on-box     a text box (where the sky is cleared, so the small star is harder to see): the
//                 cursor image with a soft glow drawn into it, so the glow cannot lag

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

  let last = null, raf = 0;
  const update = () => {
    raf = 0;
    if (!last) return;
    const { x, y, target } = last;
    root.classList.toggle('is-over-text', overText(x, y, target));
    root.classList.toggle('is-on-box', !!target?.closest?.(BOXES));
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
    el.classList.remove('is-visible');
    root.classList.remove('is-over-text', 'is-on-box');
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
    root.classList.remove('has-cursor', 'is-over-text', 'is-on-box');
  };
}

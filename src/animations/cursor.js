// The star cursor (and the constellation pen). Desktop, fine pointers only.
// Mostly the star is a native cursor image set in CSS (layout.css): the system draws it, with no
// lag and pixel-exact clicks. This module switches it on and tells the CSS (classes on <html>) what is under the pointer:
//   is-over-text  selectable text: the star stretches into its tall text form
//   is-over-link  a link or control: the star turns 45 degrees
//   is-on-box     a text box, where the sky is cleared and the small star is harder to see: the
//                 native cursor is hidden and the page draws the star itself, with a glow behind
//                 it, as one piece (so the glow cannot trail the star), clipped to the box.
//                 (A glow inside a native cursor image turns into a grey shadow on Windows, which
//                 darkens the image's see-through pixels.)
// The drawn cursor is placed on the earliest pointer event there is (pointerrawupdate, where the
// browser has it), straight away, with no easing and no frame batching.

const BOXES = '[data-mask], .curtain, .topbar__sheet, .spotlight, .event, .ticket__body, .book, .contact-card, .topbar__dropdown';
const LINKS = 'a, button, label, [role="button"]';
const NOT_TEXT = `${LINKS}, input, select, textarea, .cursor, .loader`;
const R = 32; // half the glow's size (layout.css)

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

  let last = null, raf = 0;
  let box = null, boxRect = null; // the text box under the pointer, and where it is

  // clip the glow to the box: how far each of the box's edges cuts into the glow's square
  const clip = (x, y) => {
    if (!glow || !boxRect) return;
    const b = boxRect;
    const t = Math.max(0, b.top - (y - R)), l = Math.max(0, b.left - (x - R));
    const btm = Math.max(0, y + R - b.bottom), rgt = Math.max(0, x + R - b.right);
    glow.style.clipPath = `inset(${t}px ${rgt}px ${btm}px ${l}px)`;
  };
  const place = (x, y) => {
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    clip(x, y);
  };

  // a modal dialog (the core team's spotlight) is drawn in the top layer, above every z-index on
  // the page: while one is open, the drawn cursor lives inside it, so it stays on top
  const home = el.parentElement;
  const rehome = (host) => { if (el.parentElement !== host) host.append(el); };
  const onDialogClose = () => rehome(home);

  // what is under the pointer: once a frame is plenty for this
  const update = () => {
    raf = 0;
    if (!last) return;
    const { x, y, target } = last;
    rehome(target?.closest?.('dialog[open]') ?? home);
    root.classList.toggle('is-over-text', overText(x, y, target));
    root.classList.toggle('is-over-link', !!target?.closest?.(LINKS));
    box = target?.closest?.(BOXES) ?? null;
    boxRect = box?.getBoundingClientRect() ?? null;
    root.classList.toggle('is-on-box', !!box);
    clip(x, y);
  };
  const look = () => { if (last && !raf) raf = requestAnimationFrame(update); };

  const onRaw = (e) => {
    if (e.pointerType === 'touch') return;
    place(e.clientX, e.clientY);
  };
  const onMove = (e) => {
    if (e.pointerType === 'touch') return;
    el.classList.add('is-visible');
    if (!rawEvents) place(e.clientX, e.clientY);
    last = { x: e.clientX, y: e.clientY, target: e.target };
    look();
  };
  const onLeave = () => {
    el.classList.remove('is-visible');
    root.classList.remove('is-over-text', 'is-over-link', 'is-on-box');
    last = null;
  };
  // scrolling moves the page under a still pointer: look again at what is there now
  const onScroll = () => {
    if (!last) return;
    last.target = document.elementFromPoint(last.x, last.y);
    look();
  };
  const rawEvents = 'onpointerrawupdate' in window;
  if (rawEvents) window.addEventListener('pointerrawupdate', onRaw, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('pointerleave', onLeave);
  document.addEventListener('close', onDialogClose, true); // 'close' does not bubble
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('close', onDialogClose, true);
    rehome(home);
    if (rawEvents) window.removeEventListener('pointerrawupdate', onRaw);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('scroll', onScroll);
    root.removeEventListener('pointerleave', onLeave);
    root.classList.remove('has-cursor', 'is-over-text', 'is-over-link', 'is-on-box');
  };
}

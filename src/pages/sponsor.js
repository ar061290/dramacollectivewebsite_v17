// Become a sponsor. The first panel: why sponsor and, beside it on wide screens, the sponsorship form
// (Fillout's, loaded once the curtain has parted: src/site/fillout.js), the words staying in sight as
// the long form scrolls by. Then three tiers as tickets (Standing ovation, Headliner, Spotlight), each
// stub struck in its metal (gold, silver, bronze) and catching the pointer's light; beside them, for
// questions, the President's and Executive President's cards, the same as on Contact us
// (src/sections/contactCards.js). Their "Copy address" buttons are struck in metal too, and follow the
// tickets: stone at rest, the metal of the ticket pointed at or focused, else the metal of the one
// chosen. Choosing one (click, tap, or the arrow keys: they are radio buttons) strikes the buttons in
// its metal with a streak of light sweeping across them once, and a spark goes off on the ticket.
// Below, what the support pays for lights up under the spot.
import { bootPage } from '../site/boot.js';
import { embedFillout } from '../site/fillout.js';
import { setupContactCards } from '../sections/contactCards.js';
import { followSpot, falloff } from '../site/spotlight.js';
import { loadLottie, freeze } from '../animations/lottie.js';

bootPage(({ reduced, opened }) => {
  const cleanups = [];
  const tickets = [...document.querySelectorAll('.ticket')];
  const contacts = document.querySelector('.sponsor-contacts');
  const buttons = [...(contacts?.querySelectorAll('.contact-card__copy') ?? [])];

  const metal = metalLight({ reduced });
  cleanups.push(metal.dispose);

  // the buttons' metal: the ticket the pointer is on, else the one the focus is on, else the one
  // chosen, else stone (sponsor-apply.css eases the gradient from one metal to the next)
  let chosen = null, pointed = null, focused = null;
  const show = () => { if (contacts) contacts.dataset.metal = pointed ?? focused ?? chosen ?? 'stone'; };

  // the tickets
  const sparks = new Map();
  for (const t of tickets) {
    loadLottie(t.querySelector('[data-spark]'), 'spark').then((a) => { if (a) sparks.set(t, a); });
  }
  const onChange = (e) => {
    const t = e.target.closest('.ticket');
    chosen = t.dataset.tier;
    show();
    metal.sweep(buttons);
    const s = sparks.get(t);
    if (reduced) freeze(s, 20); else s?.goToAndPlay(0, true);
  };
  // the whole ticket chooses, not only its stub (the stub is the radio's label)
  const onTicketClick = (e) => {
    const t = e.currentTarget;
    if (e.target.closest('label, input, a')) return;
    const input = t.querySelector('input');
    if (!input.checked) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
    input.focus({ preventScroll: true });
  };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onEnter = (e) => { if (fine) { pointed = e.currentTarget.dataset.tier; show(); } };
  const onLeave = () => { if (fine) { pointed = null; show(); } };
  const onFocusIn = (e) => { focused = e.currentTarget.dataset.tier; show(); };
  const onFocusOut = () => { focused = null; show(); };
  for (const t of tickets) {
    t.querySelector('input').addEventListener('change', onChange);
    t.addEventListener('click', onTicketClick);
    t.addEventListener('pointerenter', onEnter);
    t.addEventListener('pointerleave', onLeave);
    t.addEventListener('focusin', onFocusIn);
    t.addEventListener('focusout', onFocusOut);
  }
  cleanups.push(() => {
    for (const t of tickets) {
      t.querySelector('input').removeEventListener('change', onChange);
      t.removeEventListener('click', onTicketClick);
      t.removeEventListener('pointerenter', onEnter);
      t.removeEventListener('pointerleave', onLeave);
      t.removeEventListener('focusin', onFocusIn);
      t.removeEventListener('focusout', onFocusOut);
    }
    sparks.forEach((a) => a.destroy());
  });

  // the sticky columns (the words beside the form, the cards beside the tickets) stay whole in view:
  // the CSS reads each one's height, and one taller than the screen sticks by its foot instead
  const sticks = [...document.querySelectorAll('[data-stick]')];
  const heights = new ResizeObserver(() => sticks.forEach((el) => el.style.setProperty('--stick-h', `${el.offsetHeight}px`)));
  sticks.forEach((el) => heights.observe(el));
  cleanups.push(() => heights.disconnect());

  // what the support pays for: each line takes light from the spot
  const funds = document.querySelector('[data-funds]');
  if (funds) {
    const items = [...funds.querySelectorAll('li')];
    let boxes = [];
    const measure = () => {
      const f = funds.getBoundingClientRect();
      boxes = items.map((li) => { const r = li.getBoundingClientRect(); return { li, x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2, w: r.width / 2 }; });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(funds);
    const spot = followSpot(funds, {
      reduced,
      onMove: (x, y, a) => boxes.forEach((b) => b.li.style.setProperty('--lit', (falloff(Math.max(0, Math.abs(x - b.x) - b.w), y - b.y, 90) * a).toFixed(3))),
    });
    cleanups.push(() => { ro.disconnect(); spot.dispose(); });
  }

  // the keyboard reaches the cards after the tickets and their button, so on wide screens it comes
  // back up the page to them: the card it lands in comes whole into view, clear of the top bar
  // (sponsor-apply.css), the name with the address, not the address alone (a click or a tap scrolls
  // nothing)
  const onCardFocus = (e) => {
    const card = e.target.closest('.contact-card');
    if (card && e.target.matches(':focus-visible')) card.scrollIntoView({ block: 'nearest' });
  };
  contacts?.addEventListener('focusin', onCardFocus);
  cleanups.push(() => contacts?.removeEventListener('focusin', onCardFocus));

  // the sponsorship form, in the first panel, and the cards for questions, beside the tiers
  cleanups.push(
    embedFillout(document.querySelector('[data-fillout-id]'), { opened, title: 'Sponsorship form' }),
    setupContactCards({ reduced }),
  );

  return () => cleanups.forEach((c) => c());
});

/**
 * Struck metal catches the light of the pointer: the tickets' stubs and, beside them, the cards'
 * "Copy address" buttons. A hot spot where it points and a streak across the brushed grain that
 * slides with it, brighter the closer it is (the pointer is a lamp held over the page). On touch the
 * finger is the lamp while it is down; at rest a soft light falls from the top left.
 * `sweep(pieces)` draws a bright streak once across the given pieces, from their left edge to their
 * right, the lamp's light taking them back after it (with reduced motion it does nothing).
 * @returns {{ sweep: (pieces: HTMLElement[]) => void, dispose: () => void }}
 */
function metalLight({ reduced }) {
  const pieces = [...document.querySelectorAll('.ticket__stub, .sponsor-contacts .contact-card__copy')];
  if (!pieces.length) return { sweep() {}, dispose() {} };
  const REACH = 520; // px: how far the lamp's light carries
  const SWEEP = 900; // ms: a streak's way across
  const sweeps = new Map(); // piece -> when its streak set off
  let raf = 0, at = null;
  const set = (s, mx, my, spec, band) => {
    s.style.setProperty('--mx', mx);
    s.style.setProperty('--my', my);
    s.style.setProperty('--spec', spec);
    s.style.setProperty('--band', band);
  };
  // r, vw, vh: the piece's box and the viewport, read by paint before it writes anything (a read
  // after a write makes the browser bring its styles up to date first: five times a frame, once per
  // piece, when each piece read its own box between the writes)
  const lamp = (s, r, vw, vh) => {
    if (!at) return set(s, '18%', '12%', '.45', '30%');
    r ??= s.getBoundingClientRect();
    vw ||= innerWidth;
    vh ||= innerHeight;
    const x = (at.x - r.left) / r.width, y = (at.y - r.top) / r.height;
    const dx = Math.max(r.left - at.x, 0, at.x - r.right), dy = Math.max(r.top - at.y, 0, at.y - r.bottom);
    const near = Math.exp(-((dx * dx + dy * dy) / (REACH * REACH)) * 3);
    // the hot spot sits under the lamp, or at the piece's edge nearest to it
    const clamp = (v) => Math.min(1.12, Math.max(-0.12, v));
    // the streak lies across the grain and sweeps the other way to the lamp as it crosses the
    // screen, as a reflection does
    const off = (at.x - (r.left + r.width / 2)) / vw + (at.y - (r.top + r.height / 2)) / vh * 0.35;
    set(s, `${(clamp(x) * 100).toFixed(1)}%`, `${(clamp(y) * 100).toFixed(1)}%`, (0.35 + 0.65 * near).toFixed(3), `${(50 - off * 170).toFixed(1)}%`);
  };
  const paint = (now) => {
    raf = 0;
    // every read before any write: the pieces' boxes and the viewport
    const rects = at ? pieces.map((s) => s.getBoundingClientRect()) : null;
    const vw = at ? innerWidth : 0, vh = at ? innerHeight : 0;
    for (let i = 0; i < pieces.length; i++) {
      const s = pieces[i];
      const t0 = sweeps.get(s);
      if (at || t0 !== undefined) lamp(s, rects?.[i], vw, vh);
      if (t0 === undefined) continue;
      const p = Math.min(1, Math.max(0, (now - t0) / SWEEP));
      if (p >= 1) {
        // the streak has crossed: the lamp has the piece again
        sweeps.delete(s);
        s.style.removeProperty('--streak');
        continue;
      }
      // the sweeping streak, over the lamp's: eased in and out, from beyond the left edge to beyond
      // the right, brightest midway
      const e = 0.5 - Math.cos(Math.PI * p) / 2;
      s.style.setProperty('--band', `${(-30 + e * 160).toFixed(1)}%`);
      s.style.setProperty('--streak', (0.45 + 1.35 * Math.sin(Math.PI * p)).toFixed(3));
    }
    if (sweeps.size) raf = requestAnimationFrame(paint);
  };
  const frame = () => { if (!raf) raf = requestAnimationFrame(paint); };
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0 && e.type === 'pointermove') return;
    at = { x: e.clientX, y: e.clientY };
    frame();
  };
  const onUp = (e) => { if (e.pointerType !== 'mouse') { at = null; pieces.forEach((s) => { if (!sweeps.has(s)) lamp(s); }); } };
  const onScroll = () => { if (at) frame(); };
  pieces.forEach((s) => lamp(s));
  if (reduced) return { sweep() {}, dispose() {} };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  return {
    sweep(list) {
      const now = performance.now();
      list.forEach((s) => { if (pieces.includes(s)) sweeps.set(s, now); });
      frame();
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('scroll', onScroll);
    },
  };
}

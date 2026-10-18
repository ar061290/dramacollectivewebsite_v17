// The grids of people: Core team (team.html, src/pages/team.js) and Meet our writers (writers.html,
// src/pages/writers.js). Each card is a headshot over a name (.member, .member__card,
// .member__photo; src/styles/pages.css). The headshots are stone until the follow-spot finds them
// (on touch, the row in the middle of the screen); they lean toward the pointer; a filter
// rearranges what shows (Flip); choosing a card opens the spotlight panel (<dialog class=
// "spotlight">), the photo travelling from the card into it.
import gsap from 'gsap';
import { Flip } from 'gsap/Flip.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { followSpot } from './spotlight.js';
import { tilt } from './tilt.js';

gsap.registerPlugin(Flip);

/**
 * Lit by the spot: a card is lit while the spot over its grid is over its photo.
 * @param {HTMLElement} grid  the [data-spot] block the cards are in
 * @param {HTMLElement[]} members  its cards (.member)
 * @returns {{ measure: () => void, dispose: () => void }}  measure the photos again once the cards have moved
 */
export function spotCards(grid, members, { reduced }) {
  let boxes = [];
  const measure = () => {
    const g = grid.getBoundingClientRect();
    // (the cards on show: neither hidden themselves nor in a part of the grid that is)
    boxes = members.filter((m) => m.getClientRects().length).map((m) => {
      const r = m.querySelector('.member__photo').getBoundingClientRect();
      return { m, l: r.left - g.left, t: r.top - g.top, r: r.right - g.left, b: r.bottom - g.top };
    });
  };
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(grid);
  const pad = 40;
  const spot = followSpot(grid, {
    reduced,
    onMove: (x, y, a) => {
      for (const b of boxes) {
        const on = a > 0.3 && x > b.l - pad && x < b.r + pad && y > b.t - pad && y < b.b + pad;
        b.m.classList.toggle('is-lit', on);
      }
    },
  });
  return { measure, dispose: () => { ro.disconnect(); spot.dispose(); } };
}

/** Each card's photo leans toward the pointer. @returns {() => void} cleanup */
export function leanCards(members, { reduced }) {
  const undo = members.map((m) => tilt(m.querySelector('.member__card'), { target: m.querySelector('.member__photo'), max: 7, reduced }));
  return () => undo.forEach((u) => u());
}

/**
 * A filter: each of its buttons (aria-pressed, data-filter) shows the items `shows(item, key)`
 * accepts and hides the rest, and the items move to their new places (Flip). The container keeps
 * its height while they move, then eases to the new one, so what is below it never slides up over
 * them; the scroll positions below are measured again once it has settled.
 * @param {{ container: HTMLElement, items: HTMLElement[], buttons: HTMLElement[], shows: (item: HTMLElement, key: string) => boolean, reduced: boolean, onChange?: () => void }} o
 *   onChange: called once the items are in their new places (and again when they have arrived)
 * @returns {() => void} cleanup
 */
export function flipFilter({ container, items, buttons, shows, reduced, onChange = () => {} }) {
  let flip = null;
  const onFilter = (e) => {
    const key = e.currentTarget.dataset.filter;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    flip?.progress(1);
    const from = container.offsetHeight;
    const state = Flip.getState(items);
    items.forEach((m) => { m.hidden = !shows(m, key); });
    const to = container.offsetHeight;
    onChange();
    if (reduced) { ScrollTrigger.refresh(); return; }
    gsap.set(container, { height: from });
    flip = gsap.timeline({
      onComplete: () => { gsap.set(container, { clearProps: 'height' }); onChange(); ScrollTrigger.refresh(); },
    });
    flip.to(container, { height: to, duration: 0.55, ease: 'curtain' }, 0);
    flip.add(Flip.from(state, {
      duration: 0.55,
      ease: 'curtain',
      absolute: true,
      stagger: 0.02,
      onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'curtain', delay: 0.1 }),
      onLeave: (els) => gsap.to(els, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }),
    }), 0);
  };
  buttons.forEach((b) => b.addEventListener('click', onFilter));
  return () => { flip?.kill(); buttons.forEach((b) => b.removeEventListener('click', onFilter)); };
}

/**
 * The spotlight panel: choosing a card opens it with that person's own words, the photo travelling
 * from the card into it. A card may be a button, or a link (to the person's own page, for visitors
 * without scripts, and for a click that asks for a new tab): an ordinary click opens the panel.
 * @param {HTMLDialogElement} dialog  the <dialog class="spotlight">, with [data-spotlight-photo] and [data-spotlight-close]
 * @param {{ cards: HTMLElement[], reduced: boolean, fill: (card: HTMLElement) => Element[] }} o
 *   fill: puts the card's words into the panel, and returns what rises into place after the photo
 * @returns {() => void} cleanup
 */
export function spotlightPanel(dialog, { cards, reduced, fill }) {
  const photoSlot = dialog.querySelector('[data-spotlight-photo]');
  const body = dialog.querySelector('.spotlight__body');
  const closeBtn = dialog.querySelector('[data-spotlight-close]');
  let opener = null;

  const open = (card) => {
    opener = card;
    const photo = card.querySelector('.member__photo');
    const rise = fill(card);
    const img = photo.querySelector('img');
    // (without a picture, the card's own stand-in: its initials, or the mark on its tile)
    const copy = () => { const c = photo.cloneNode(true); c.removeAttribute('style'); return c; };
    photoSlot.replaceChildren(img ? Object.assign(document.createElement('img'), { src: img.currentSrc || img.src, alt: '' }) : copy());
    const from = photo.getBoundingClientRect();
    dialog.showModal();
    body.scrollTop = 0;
    if (reduced) return;
    // the photo travels from the card into the panel (a copy flies above both, since the panel's
    // photo frame clips), then the panel's words rise after it
    const target = photoSlot.firstElementChild;
    const to = photoSlot.getBoundingClientRect();
    const flyer = target.cloneNode(true);
    flyer.className = `${flyer.className} spotlight__flyer`.trim();
    Object.assign(flyer.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, margin: 0, zIndex: 3, objectFit: 'cover' });
    dialog.append(flyer);
    gsap.set(target, { autoAlpha: 0 });
    gsap.from(flyer, {
      x: from.left - to.left, y: from.top - to.top, scaleX: from.width / to.width, scaleY: from.height / to.height,
      transformOrigin: '0 0', duration: 0.6, ease: 'curtain',
      onComplete: () => { gsap.set(target, { autoAlpha: 1 }); flyer.remove(); },
    });
    gsap.from(dialog.querySelector('.spotlight__inner'), { autoAlpha: 0, duration: 0.25, ease: 'power1.out' });
    gsap.from(rise, { y: 14, autoAlpha: 0, duration: 0.5, ease: 'curtain', stagger: 0.05, delay: 0.2 });
  };
  const close = () => {
    if (!dialog.open) return;
    if (reduced) { dialog.close(); return; }
    gsap.to(dialog.querySelector('.spotlight__inner'), {
      autoAlpha: 0, y: 10, duration: 0.2, ease: 'power1.in',
      onComplete: () => { dialog.close(); gsap.set(dialog.querySelector('.spotlight__inner'), { clearProps: 'all' }); },
    });
  };
  const onCard = (e) => {
    const card = e.currentTarget;
    if (card.matches('a[href]')) {
      // a click for a new tab or window goes to the page itself
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); // (and so the curtain between pages leaves it alone: src/site/transition.js)
    }
    open(card);
  };
  cards.forEach((c) => c.addEventListener('click', onCard));
  closeBtn.addEventListener('click', close);
  // a click on the backdrop (outside the panel) closes it; Escape is the dialog's own
  const onBackdrop = (e) => { if (e.target === dialog) close(); };
  dialog.addEventListener('click', onBackdrop);
  const onCancel = (e) => { e.preventDefault(); close(); };
  dialog.addEventListener('cancel', onCancel);
  const onClosed = () => { opener?.focus({ preventScroll: true }); };
  dialog.addEventListener('close', onClosed);
  return () => {
    cards.forEach((c) => c.removeEventListener('click', onCard));
    closeBtn.removeEventListener('click', close);
    dialog.removeEventListener('click', onBackdrop);
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('close', onClosed);
  };
}

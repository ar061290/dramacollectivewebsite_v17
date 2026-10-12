// Core team: the headshots are stone until the follow-spot finds them (on touch, the row in the
// middle of the screen); they lean toward the pointer; a department filter rearranges the grid
// (Flip); choosing someone opens their introduction in the spotlight panel, the photo travelling
// from the card into it.
import gsap from 'gsap';
import { Flip } from 'gsap/Flip.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { bootPage } from '../site/boot.js';
import { followSpot } from '../site/spotlight.js';
import { tilt } from '../site/tilt.js';

gsap.registerPlugin(Flip);

bootPage(({ reduced }) => {
  const grid = document.querySelector('.team-grid');
  if (!grid) return undefined;
  const cleanups = [];
  const members = [...grid.querySelectorAll('.member')];

  // lit by the spot: a card is lit while the spot is over its photo
  let boxes = [];
  const measure = () => {
    const g = grid.getBoundingClientRect();
    boxes = members.filter((m) => !m.hidden).map((m) => {
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
  cleanups.push(() => { ro.disconnect(); spot.dispose(); });

  // lean toward the pointer
  for (const m of members) {
    cleanups.push(tilt(m.querySelector('.member__card'), { target: m.querySelector('.member__photo'), max: 7, reduced }));
  }

  // department filter: the cards move to their new places (Flip). The grid keeps its height while
  // they move, then eases to the new one, so what is below it never slides up over the cards; the
  // scroll positions below are measured again once it has settled.
  const buttons = [...document.querySelectorAll('.team-filter__btn')];
  let flip = null;
  const onFilter = (e) => {
    const key = e.currentTarget.dataset.filter;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    flip?.progress(1);
    const from = grid.offsetHeight;
    const state = Flip.getState(members);
    members.forEach((m) => { m.hidden = key !== 'all' && m.dataset.dept !== key; });
    const to = grid.offsetHeight;
    measure();
    if (reduced) { ScrollTrigger.refresh(); return; }
    gsap.set(grid, { height: from });
    flip = gsap.timeline({
      onComplete: () => { gsap.set(grid, { clearProps: 'height' }); measure(); ScrollTrigger.refresh(); },
    });
    flip.to(grid, { height: to, duration: 0.55, ease: 'curtain' }, 0);
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
  cleanups.push(() => { flip?.kill(); buttons.forEach((b) => b.removeEventListener('click', onFilter)); });

  // the spotlight panel
  const dialog = document.getElementById('spotlight');
  const photoSlot = dialog.querySelector('[data-spotlight-photo]');
  const nameEl = dialog.querySelector('[data-spotlight-name]');
  const roleEl = dialog.querySelector('[data-spotlight-role]');
  const introEl = dialog.querySelector('[data-spotlight-intro]');
  const closeBtn = dialog.querySelector('[data-spotlight-close]');
  let opener = null;

  const open = (card) => {
    const m = card.closest('.member');
    opener = card;
    const photo = card.querySelector('.member__photo');
    nameEl.textContent = card.querySelector('.member__name').textContent;
    roleEl.textContent = card.querySelector('.member__role')?.textContent ?? '';
    roleEl.hidden = !roleEl.textContent;
    introEl.replaceChildren(...[...m.querySelector('.member__intro').children].map((p) => p.cloneNode(true)));
    const img = photo.querySelector('img');
    const initials = () => { const c = photo.cloneNode(true); c.removeAttribute('style'); return c; };
    photoSlot.replaceChildren(img ? Object.assign(document.createElement('img'), { src: img.currentSrc || img.src, alt: '' }) : initials());
    const from = photo.getBoundingClientRect();
    dialog.showModal();
    introEl.parentElement.scrollTop = 0;
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
    gsap.from([roleEl, nameEl, ...introEl.children], { y: 14, autoAlpha: 0, duration: 0.5, ease: 'curtain', stagger: 0.05, delay: 0.2 });
  };
  const close = () => {
    if (!dialog.open) return;
    if (reduced) { dialog.close(); return; }
    gsap.to(dialog.querySelector('.spotlight__inner'), {
      autoAlpha: 0, y: 10, duration: 0.2, ease: 'power1.in',
      onComplete: () => { dialog.close(); gsap.set(dialog.querySelector('.spotlight__inner'), { clearProps: 'all' }); },
    });
  };
  const onCard = (e) => open(e.currentTarget);
  const cards = members.map((m) => m.querySelector('.member__card'));
  cards.forEach((c) => c.addEventListener('click', onCard));
  closeBtn.addEventListener('click', close);
  // a click on the backdrop (outside the panel) closes it; Escape is the dialog's own
  const onBackdrop = (e) => { if (e.target === dialog) close(); };
  dialog.addEventListener('click', onBackdrop);
  const onCancel = (e) => { e.preventDefault(); close(); };
  dialog.addEventListener('cancel', onCancel);
  const onClosed = () => { opener?.focus({ preventScroll: true }); };
  dialog.addEventListener('close', onClosed);
  cleanups.push(() => {
    cards.forEach((c) => c.removeEventListener('click', onCard));
    closeBtn.removeEventListener('click', close);
    dialog.removeEventListener('click', onBackdrop);
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('close', onClosed);
  });

  cleanups.push(setupReel({ reduced }));

  return () => cleanups.forEach((c) => c());
});

/**
 * Behind the curtain: a horizontal scroll in the manner of landonorris.com. The section is as tall
 * as the strip's sideways run (plus a screen); inside it, a frame the height of the screen sticks
 * to the top while the page scrolls through the section, and the strip slides with the scroll (a
 * little faster than it: SPEED). Nothing is pinned or moved in the page's flow, so it cannot jump: the strip
 * arrives with its first frame in view, and leaves with its last. The frame nearest the middle of
 * the screen comes into colour and the photos drift a little inside their frames. Reduced motion:
 * the strip scrolls sideways by itself, all in colour.
 */
function setupReel({ reduced }) {
  const reel = document.querySelector('.reel');
  const track = reel?.querySelector('.reel__track');
  if (!track || reduced) return () => {};
  const win = reel.querySelector('.reel__window');
  const frames = [...track.children];
  const SPEED = 1.5; // sideways pixels per pixel scrolled
  let run = 0;
  const light = () => {
    const mid = innerWidth / 2;
    for (const f of frames) {
      const r = f.getBoundingClientRect();
      const d = (r.left + r.width / 2 - mid) / (r.width * 0.9 + 1);
      f.style.setProperty('--lit', Math.max(0, 1 - Math.abs(d)).toFixed(3));
      f.style.setProperty('--shift', (Math.max(-1, Math.min(1, d)) * -4).toFixed(2));
    }
  };
  // the section's height: one screen for the sticky frame, plus the run
  const size = () => {
    run = Math.max(0, track.scrollWidth - win.clientWidth);
    reel.style.setProperty('--reel-run', `${run / SPEED}px`);
  };
  reel.classList.add('is-sticky');
  size();
  const x = gsap.quickTo(track, 'x', { duration: 0.5, ease: 'power3.out', onUpdate: light });
  const st = ScrollTrigger.create({
    trigger: reel,
    start: 'top top',
    end: () => `+=${run / SPEED}`,
    invalidateOnRefresh: true,
    onRefreshInit: size,
    onUpdate: (self) => x(-run * self.progress),
    onRefresh: (self) => { gsap.set(track, { x: -run * self.progress }); light(); },
  });
  light();
  return () => {
    st.kill();
    reel.classList.remove('is-sticky');
    reel.style.removeProperty('--reel-run');
    gsap.set(track, { clearProps: 'transform' });
  };
}

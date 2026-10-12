// Core team: the headshots are stone until the follow-spot finds them (on touch, the row in the
// middle of the screen); they lean toward the pointer; a department filter rearranges the grid
// (Flip); choosing someone opens their introduction in the spotlight panel, the photo travelling
// from the card into it.
import gsap from 'gsap';
import { Flip } from 'gsap/Flip.js';
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

  // department filter
  const buttons = [...document.querySelectorAll('.team-filter__btn')];
  const onFilter = (e) => {
    const key = e.currentTarget.dataset.filter;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    const state = Flip.getState(members);
    members.forEach((m) => { m.hidden = key !== 'all' && m.dataset.dept !== key; });
    measure();
    if (reduced) return;
    Flip.from(state, {
      duration: 0.55,
      ease: 'curtain',
      absolute: true,
      stagger: 0.02,
      onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'curtain', delay: 0.1 }),
      onLeave: (els) => gsap.to(els, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }),
      onComplete: measure,
    });
  };
  buttons.forEach((b) => b.addEventListener('click', onFilter));
  cleanups.push(() => buttons.forEach((b) => b.removeEventListener('click', onFilter)));

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
 * Behind the curtain: scrolling down runs the film strip sideways (the section is pinned while it
 * runs); the frame nearest the middle of the screen comes into colour and the photos drift a little
 * inside their frames. Reduced motion: the strip scrolls sideways by itself, all in colour.
 */
function setupReel({ reduced }) {
  const reel = document.querySelector('.reel');
  const track = reel?.querySelector('.reel__track');
  if (!track || reduced) return () => {};
  const win = reel.querySelector('.reel__window');
  const frames = [...track.children];
  const light = () => {
    const mid = innerWidth / 2;
    for (const f of frames) {
      const r = f.getBoundingClientRect();
      const d = (r.left + r.width / 2 - mid) / (r.width * 0.9 + 1);
      f.style.setProperty('--lit', Math.max(0, 1 - Math.abs(d)).toFixed(3));
      f.style.setProperty('--shift', Math.max(-1, Math.min(1, d)) * -4);
    }
  };
  reel.classList.add('is-pinned');
  const run = () => Math.max(0, track.scrollWidth - win.clientWidth);
  const tween = gsap.to(track, {
    x: () => -run(),
    ease: 'none',
    scrollTrigger: {
      trigger: win,
      start: 'center center',
      end: () => `+=${run()}`,
      pin: true,
      scrub: 0.8,
      invalidateOnRefresh: true,
      onRefresh: light,
    },
    onUpdate: light,
  });
  light();
  return () => { tween.scrollTrigger?.kill(); tween.kill(); reel.classList.remove('is-pinned'); gsap.set(track, { clearProps: 'transform' }); };
}

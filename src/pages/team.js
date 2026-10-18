// Core team: the headshots are stone until the follow-spot finds them (on touch, the row in the
// middle of the screen); they lean toward the pointer; a department filter rearranges the grid
// (Flip); choosing someone opens their introduction in the spotlight panel, the photo travelling
// from the card into it.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { bootPage } from '../site/boot.js';
import { spotCards, leanCards, flipFilter, spotlightPanel } from '../site/people.js';

bootPage(({ reduced }) => {
  const grid = document.querySelector('.team-grid');
  if (!grid) return undefined;
  const members = [...grid.querySelectorAll('.member')];

  // lit by the spot; leaning toward the pointer (src/site/people.js, shared with Meet our writers)
  const lit = spotCards(grid, members, { reduced });
  const cleanups = [lit.dispose, leanCards(members, { reduced })];

  // department filter: the cards move to their new places (Flip)
  cleanups.push(flipFilter({
    container: grid,
    items: members,
    buttons: [...document.querySelectorAll('.team-filter__btn')],
    shows: (m, key) => key === 'all' || m.dataset.dept === key,
    reduced,
    onChange: lit.measure,
  }));

  // the spotlight panel: the member's name, role and own introduction
  const dialog = document.getElementById('spotlight');
  const nameEl = dialog.querySelector('[data-spotlight-name]');
  const roleEl = dialog.querySelector('[data-spotlight-role]');
  const introEl = dialog.querySelector('[data-spotlight-intro]');
  cleanups.push(spotlightPanel(dialog, {
    cards: members.map((m) => m.querySelector('.member__card')),
    reduced,
    fill: (card) => {
      const m = card.closest('.member');
      nameEl.textContent = card.querySelector('.member__name').textContent;
      roleEl.textContent = card.querySelector('.member__role')?.textContent ?? '';
      roleEl.hidden = !roleEl.textContent;
      introEl.replaceChildren(...[...m.querySelector('.member__intro').children].map((p) => p.cloneNode(true)));
      return [roleEl, nameEl, ...introEl.children];
    },
  }));

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

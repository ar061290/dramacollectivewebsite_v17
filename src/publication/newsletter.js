// The monthly newsletter (publication.html, the @news region): the sign-up form itself, straight on
// the page, and the October cover tossed down beside it as onto a coffee table; nothing round them
// (the form brings its own heading). The form is the Collective's Fillout form (7CTfhGrq6cus),
// embedded the site's way (src/site/fillout.js): the script is loaded once the page curtain has
// parted, the box says it is loading until the form is in, and a link to the same form on Fillout's
// own site stays under it for anyone whose browser blocks the embed. Fillout sets the form's height
// as it grows (data-fillout-dynamic-resize); the box keeps a height of its own meanwhile, so the page
// below does not jump.
// As it comes up the screen the form rises into place, and the cover lands: it comes in from lower
// and further left, turning less, and settles into its tilt as a magazine slid across a table comes
// to rest (curtain ease, no overshoot). Reduced motion: a fade.
// "Remind me" on an upcoming piece comes here (#news): src/publication/pieces.js.
import gsap from 'gsap';
import { embedFillout } from '../site/fillout.js';

/** @param {{ reduced: boolean, sky: any, onTheme: Function, opened: Promise }} ctx  bootPage's context */
export function setupNews({ reduced, opened }) {
  const root = document.querySelector('[data-pub-news]');
  const panel = root?.querySelector('.pub-news__panel');
  if (!panel) return () => {};
  const cleanups = [embedFillout(panel.querySelector('[data-fillout-id]'), { opened, title: 'Newsletter sign-up form' })];

  // the band's height, for the cover to be sized by (publication-blocks.css, --band-h): it follows the
  // form as Fillout sizes it (on laptops the form's frame is wide enough that the cover's size does
  // not change the form's height, so this settles at once)
  const box = panel.querySelector('.pub-news__box');
  if (box) {
    let last = 0;
    const ro = new ResizeObserver(() => {
      const h = Math.round(box.getBoundingClientRect().height);
      if (h > 0 && Math.abs(h - last) > 1) { last = h; panel.style.setProperty('--band-h', `${h}px`); }
    });
    ro.observe(box);
    cleanups.push(() => { ro.disconnect(); panel.style.removeProperty('--band-h'); });
  }

  const parts = gsap.utils.toArray('.pub-news__form', panel);
  const table = panel.querySelector('.pub-news__table');
  const tl = gsap.timeline({ scrollTrigger: { trigger: panel, start: 'top 85%', once: true }, defaults: { ease: 'curtain' } });
  if (reduced) {
    tl.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.4 });
  } else {
    tl.fromTo(parts, { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 0.1);
    // the throw moves the table the cover lies on (its shadow goes with it); the cover's own tilt
    // stays the stylesheet's (publication-blocks.css), at every width
    if (table) {
      tl.fromTo(table, { x: -56, y: 64, rotation: 7, opacity: 0 }, {
        x: 0, y: 0, rotation: 0, opacity: 1, duration: 1.15, clearProps: 'transform,opacity',
      }, 0.45);
    }
  }
  cleanups.push(() => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set([panel, ...parts, table].filter(Boolean), { clearProps: 'transform,opacity' });
  });

  return () => cleanups.forEach((c) => c());
}

// The publication, laid out after houseofheat.co's format (re-skinned in the design system):
// 1. the opening: at first only the statue (after Rodin's The Thinker, studying a tragedy mask), on
//    the right, among the stars; scrolling moves him to the left as the words come out of the mask;
// 2. this month: the October issue, the editor's note and our writers;
// 3. the pieces: the latest as a grid, or the upcoming as a list beside the statue, switched by one
//    toggle (the heading morphs between "Latest pieces" and "Upcoming pieces");
// 4. the monthly newsletter, and 5. write for us (the statue again, in the box);
// and along the bottom, a rolling banner that docks on the footer at the end.
// Stars show only in the opening; below it the cursor's glow is everywhere.
// Each part lives in src/publication/; this file starts them and cleans them up.
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { bootPage } from '../site/boot.js';
import { setupHero } from '../publication/hero.js';
import { setupCollection } from '../publication/collection.js';
import { setupPieces } from '../publication/pieces.js';
import { setupNews } from '../publication/newsletter.js';
import { setupWriters } from '../publication/writers.js';
import { setupTicker } from '../publication/ticker.js';
import { setupPeekBar } from '../publication/peekbar.js';

// The opening holds the screen for a stretch of scroll (its pin adds that much page), which the
// browser cannot know about when it restores a reload's place or jumps to a #fragment at load: the
// page puts the visitor back itself, once the hold is in place (placeVisitor). (Through
// ScrollTrigger, which otherwise sets the browser's own restoring back to "auto" on every refresh.)
ScrollTrigger.clearScrollMemory('manual');
const PLACE = 'dc-publication-y';

bootPage((ctx) => {
  const cleanups = [setupHero, setupCollection, setupPieces, setupNews, setupWriters, setupTicker, setupPeekBar]
    .map((setup) => {
      try {
        return setup(ctx);
      } catch (err) {
        // one part failing never takes the rest of the page down
        console.error(err);
        return null;
      }
    })
    .filter((c) => typeof c === 'function');
  cleanups.push(placeVisitor());
  return () => cleanups.forEach((c) => c());
});

/**
 * Where the visitor should be: at the element a #fragment names (by the page's scroll-padding), or,
 * on a reload or a return through history, where they were; otherwise the top.
 * Where they were is kept as a place in a section (which section, and how far into it), not as a
 * bare distance from the top: the newsletter's form, above the pieces, settles to its own height a
 * moment after the page opens, which would move everything under it. Until the visitor scrolls
 * themselves (or a few seconds pass) the place is held through such changes. It is remembered from
 * the scroll events: by the time the page is hidden, the cleanups may already have taken the
 * opening's hold out and moved everything.
 */
const SECTIONS = '[data-pub-collection], [data-pub-news], [data-pub-pieces], [data-pub-writers]';
function placeVisitor() {
  const sections = [...document.querySelectorAll(SECTIONS)];
  // the last section whose top has passed the top of the screen, and how far past; none in the opening
  const where = () => {
    let at = null;
    sections.forEach((el, i) => { const top = el.getBoundingClientRect().top; if (top <= 0) at = { i, into: -top }; });
    return { y: Math.round(window.scrollY), ...at };
  };
  let place = where();
  let raf = 0;
  const keep = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place = where(); }); };
  const save = () => { try { sessionStorage.setItem(PLACE, JSON.stringify(place)); } catch { /* storage blocked */ } };
  window.addEventListener('scroll', keep, { passive: true });
  window.addEventListener('pagehide', save);
  const cleanups = [];

  ScrollTrigger.refresh(); // the hold's length is in the page now
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  const nav = performance.getEntriesByType?.('navigation')[0]?.type;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(PLACE) || 'null'); } catch { /* storage blocked, or old */ }
  const pad = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  let go = null; // where to put the visitor, worked out afresh each time the page settles
  if (target) go = () => target.getBoundingClientRect().top + window.scrollY - pad();
  else if ((nav === 'reload' || nav === 'back_forward') && saved && typeof saved === 'object') {
    const el = Number.isInteger(saved.i) ? sections[saved.i] : null;
    go = el ? () => el.getBoundingClientRect().top + window.scrollY + saved.into : () => saved.y;
  }
  if (go) {
    const put = () => window.scrollTo(0, Math.max(0, Math.round(go())));
    put();
    // held while the page below the opening settles, until the visitor moves it themselves
    const ro = new ResizeObserver(put);
    ro.observe(document.querySelector('main') ?? document.body);
    const letGo = () => {
      ro.disconnect();
      clearTimeout(timer);
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => window.removeEventListener(t, letGo));
    };
    const timer = setTimeout(letGo, 4000);
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => window.addEventListener(t, letGo, { passive: true }));
    cleanups.push(letGo);
  }
  place = where();

  return () => {
    // (bootPage runs the cleanups on pagehide, perhaps before the listener above: save here too)
    save();
    cancelAnimationFrame(raf);
    cleanups.forEach((c) => c());
    window.removeEventListener('scroll', keep);
    window.removeEventListener('pagehide', save);
  };
}

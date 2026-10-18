// Meet our writers: the opening (src/writers/opening.js: the marble statue among the stars; the
// scroll brings the view to the book in its hand, which opens on the writers), then the writers
// issue by issue, as Core team's grid (src/site/people.js): the photos are
// stone until the follow-spot finds them (on touch, the row in the middle of the screen); they lean
// toward the pointer; a filter by issue rearranges the months (Flip). Each card is a plain link to
// the writer's own page (writer-<slug>.html), where their introduction and pieces are; pointed at,
// its photo shows the short version of their introduction (src/styles/writers.css). The cards are
// written by tools/pages/build.mjs.
import { bootPage } from '../site/boot.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { spotCards, leanCards, flipFilter } from '../site/people.js';
import { setupOpening } from '../writers/opening.js';
import { setupTicker } from '../publication/ticker.js';

// The opening holds the screen for a stretch of scroll (its pin adds that much page), which the
// browser cannot know about when it restores a reload's place: the page puts the visitor back
// itself, once the hold is in place (as the publication does, src/pages/publication.js).
ScrollTrigger.clearScrollMemory('manual');
const PLACE = 'dc-writers-y';

bootPage((ctx) => {
  const { reduced } = ctx;
  const wrap = document.querySelector('[data-writers]');
  if (!wrap) return undefined;
  // the opening first: the section below is its book's page (one part failing never takes the
  // rest of the page down)
  let opening = null;
  try {
    opening = setupOpening(ctx);
  } catch (err) {
    console.error(err);
  }
  const months = [...wrap.querySelectorAll('.writers-month')];
  const members = [...wrap.querySelectorAll('.member')];

  // lit by the spot; leaning toward the pointer
  const lit = spotCards(wrap, members, { reduced });
  const cleanups = [lit.dispose, leanCards(members, { reduced })];

  // the filter by issue: the months move to their new places (Flip)
  cleanups.push(flipFilter({
    container: wrap,
    items: months,
    // (the section's own: the opening's book holds a picture of the section, its buttons too)
    buttons: [...(wrap.closest('.writers') ?? document).querySelectorAll('.writers-filter .team-filter__btn')],
    shows: (month, key) => key === 'all' || month.dataset.month === key,
    reduced,
    onChange: lit.measure,
  }));

  if (opening) cleanups.push(opening);
  // the publication's banner along the bottom, with Become a writer
  cleanups.push(setupTicker(ctx));
  cleanups.push(placeVisitor());
  return () => cleanups.forEach((c) => c());
});

/**
 * Where the visitor should be: at the element a #fragment names, or, on a reload or a return
 * through history, where they were (kept on the way out); otherwise the top. Taken once the
 * opening's hold is in the page.
 */
function placeVisitor() {
  let y = 0;
  const keep = () => { y = Math.round(window.scrollY); };
  const save = () => { try { sessionStorage.setItem(PLACE, String(y)); } catch { /* storage blocked */ } };
  window.addEventListener('scroll', keep, { passive: true });
  window.addEventListener('pagehide', save);
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  const nav = performance.getEntriesByType?.('navigation')[0]?.type;
  let saved = NaN;
  try { saved = parseFloat(sessionStorage.getItem(PLACE) ?? ''); } catch { /* storage blocked */ }
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  if (target) window.scrollTo(0, Math.max(0, Math.round(target.getBoundingClientRect().top + window.scrollY - pad)));
  else if ((nav === 'reload' || nav === 'back_forward') && saved > 0) window.scrollTo(0, saved);
  keep();
  return () => {
    save();
    window.removeEventListener('scroll', keep);
    window.removeEventListener('pagehide', save);
  };
}

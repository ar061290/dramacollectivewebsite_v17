// Meet our writers: the opening (src/writers/opening.js: the marble statue among the stars; the
// scroll brings the view to the book in its hand, which opens on the writers), then the writers
// issue by issue, as Core team's grid (src/site/people.js): the photos are
// stone until the follow-spot finds them (on touch, the row in the middle of the screen); they lean
// toward the pointer; a filter by issue rearranges the months (Flip); choosing a writer opens their
// introduction in the spotlight panel, the photo travelling from the card into it, with their
// pieces and the way to their own page. Each card is a link to that page (writer-<slug>.html),
// which is where it goes without scripts, or for a click that asks for a new tab. The cards, and
// what each panel holds (a <template> per writer), are written by tools/pages/build.mjs.
import { bootPage } from '../site/boot.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { spotCards, leanCards, flipFilter, spotlightPanel } from '../site/people.js';
import { setupOpening } from '../writers/opening.js';

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
  const cards = members.map((m) => m.querySelector('.member__card'));
  // (with scripts the card's link opens the panel first)
  cards.forEach((c) => { c.setAttribute('aria-haspopup', 'dialog'); c.setAttribute('aria-controls', 'spotlight'); });

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

  // the spotlight panel: the writer's name, their introduction, their pieces and their page
  const dialog = document.getElementById('spotlight');
  const nameEl = dialog.querySelector('[data-spotlight-name]');
  const roleEl = dialog.querySelector('[data-spotlight-role]');
  const introEl = dialog.querySelector('[data-spotlight-intro]');
  cleanups.push(spotlightPanel(dialog, {
    cards,
    reduced,
    fill: (card) => {
      const about = document.querySelector(`template[data-writer-panel="${card.dataset.writer}"]`);
      nameEl.textContent = card.querySelector('.member__name').textContent;
      roleEl.textContent = about?.dataset.role ?? 'Writer';
      introEl.replaceChildren(about ? about.content.cloneNode(true) : '');
      return [roleEl, nameEl, ...introEl.children];
    },
  }));

  // a link in the panel (a piece, the writer's page) leaves through the curtain between pages
  // (src/site/transition.js), which the panel, drawn above everything in the top layer, would hide:
  // the panel goes first
  const onLink = (e) => {
    if (!e.target.closest('a[href]') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    dialog.close();
  };
  dialog.addEventListener('click', onLink);
  cleanups.push(() => dialog.removeEventListener('click', onLink));

  if (opening) cleanups.push(opening);
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

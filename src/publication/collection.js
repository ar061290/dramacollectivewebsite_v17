// This month (publication.html, the @collection region): the October issue, the editor's note and
// our writers, after houseofheat.co's feature collection. The cards are plain links in the page
// (each is its title's link, stretched over the card: publication-blocks.css), so they work and
// read the same without this. All this adds is their entrance, once, as they come up the screen:
// each card rises a little and settles, and its picture is uncovered from the foot up, as a
// curtain goes up on a set. The issue leads; the two beside it follow. No bounce, no overshoot.
// Opacity, never visibility: a card not yet revealed still takes the keyboard's focus, and focusing
// it scrolls it into view, which reveals it. With reduced motion they only fade in.
// "Read the October issue" opens the issue at its first piece: the page's markup says which, and
// this keeps it in step with src/publication/pieces-data.js should the pieces change.
import gsap from 'gsap';
import { FIRST_OF_ISSUE, pieceHref } from './pieces-data.js';

/** @param {{ reduced: boolean, sky: any, onTheme: Function, opened: Promise }} ctx  bootPage's context */
export function setupCollection({ reduced }) {
  const root = document.querySelector('[data-pub-collection]');
  const grid = root?.querySelector('.pub-collection__grid');
  const cards = grid ? gsap.utils.toArray('.pub-card', grid) : [];
  if (!cards.length) return () => {};
  const media = cards.map((c) => c.querySelector('.pub-card__media')).filter(Boolean);

  // a picture still to come (a render not yet in assets/publication/) leaves its field bare rather
  // than show a broken image
  grid.querySelectorAll('.pub-card__media > img').forEach((img) => {
    const bare = () => img.classList.add('is-missing');
    if (img.complete && !img.naturalWidth) bare();
    else img.addEventListener('error', bare, { once: true });
  });

  // the issue's first piece, from the data
  grid.querySelectorAll('[data-first-of-issue]').forEach((a) => {
    const first = FIRST_OF_ISSUE(a.dataset.firstOfIssue);
    if (first) a.href = pieceHref(first);
  });

  const scrollTrigger = { trigger: grid, start: 'top 84%', once: true };
  const tl = gsap.timeline({ scrollTrigger, defaults: { ease: 'curtain' } });
  if (reduced) {
    tl.fromTo(cards, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.08 });
  } else {
    tl.fromTo(cards, { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.14 })
      .fromTo(media, { clipPath: 'inset(100% 0% 0% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: 1.1,
        stagger: 0.14,
        clearProps: 'clipPath',
      }, 0.1);
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set([...cards, ...media], { clearProps: 'transform,opacity,clipPath' });
  };
}

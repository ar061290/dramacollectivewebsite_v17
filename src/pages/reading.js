// The publication's reading pages: each piece (piece-<slug>.html), the editor's note
// (editors-note.html) and all the pieces (pieces.html), written by tools/pages/build.mjs. They are
// made to be read, so little moves: the curtain between pages, the title rising into place (the
// site's [data-reveal]), and the banner along the bottom (src/publication/ticker.js). As on the
// publication below its opening, there is no star sky and the cursor's glow is everywhere
// (html.is-glow-everywhere, set in the page's own markup so it holds from the first move); the top
// bar waits out of sight until it is wanted (src/publication/peekbar.js). Beside a piece stand two
// stone masks, lit by the cursor's glow (src/publication/masks.js).
import gsap from 'gsap';
import { bootPage } from '../site/boot.js';
import { setupTicker } from '../publication/ticker.js';
import { setupPeekBar } from '../publication/peekbar.js';
import { setupMasks } from '../publication/masks.js';

bootPage((ctx) => {
  document.documentElement.classList.add('is-glow-everywhere');
  const cleanups = [setupTicker(ctx), setupPeekBar(), setupMasks(ctx), footnotes(ctx)];
  return () => cleanups.forEach((c) => c());
});

/**
 * Footnotes: a number in the text and the way back from its note glide to each other, as the site's
 * other in-page links do (src/animations/nav.js), but they land a third of the way down the screen
 * (the place publication-reading.css gives them, scroll-margin 30vh), not under its top edge. Once
 * there, the address takes the note's #, so the browser marks it (:target), the reader's Back
 * returns to the text, and a reload or a shared link opens on it; the arrival takes the focus, so
 * the keyboard carries on from there. Reduced motion: the same, at once.
 */
function footnotes({ reduced }) {
  const onClick = (e) => {
    const a = e.target.closest?.('.read__ref a, .read__noteback');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const id = a.hash.slice(1);
    const to = id && document.getElementById(id);
    if (!to) return;
    e.preventDefault();
    e.stopPropagation(); // ours, not nav.js's glide (which lands at the very top)
    if (!to.matches('a[href], [tabindex]')) to.setAttribute('tabindex', '-1');
    // the history entry first, so the reader's Back returns to where they were reading: setting the
    // # saves this place on the entry being left (and jumps); the page is put back at once, before
    // anything is drawn, and glides from there
    const from = window.scrollY;
    location.hash = id;
    window.scrollTo(0, from);
    // (the glide lands where the browser's own jump to the # does: 30vh down, plus the page's
    // scroll-padding)
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    gsap.to(window, {
      duration: reduced ? 0 : 0.9,
      ease: 'curtain',
      overwrite: true,
      scrollTo: { y: to, offsetY: Math.round(window.innerHeight * 0.3) + pad, autoKill: true },
      onComplete: () => to.focus({ preventScroll: true }),
    });
  };
  // in the capture phase, so it runs before (and instead of) the site's handler for in-page links
  document.addEventListener('click', onClick, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    gsap.killTweensOf(window);
  };
}

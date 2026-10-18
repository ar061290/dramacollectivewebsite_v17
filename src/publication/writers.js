// Write for us (publication.html, the @writers region): a box with the invitation on the left, the
// way to apply (write.html) and the way to our writers (writers.html), and the statue standing in it
// on the right, live (src/publication/statue.js: made only as the box nears the screen; his still
// picture until then, and wherever WebGL runs poorly). He leans toward the pointer and his metal
// takes the gold lamp at the cursor, as in the opening; no other light moves.
// The box rises into place once as it comes up the screen, and its words follow (the heading is the
// site's own line reveal, [data-reveal]). Reduced motion: a fade, and he stands still.
import gsap from 'gsap';
import { mountStatue } from './statue.js';

/** @param {{ reduced: boolean, sky: any, onTheme: Function, opened: Promise }} ctx  bootPage's context */
export function setupWriters({ reduced, opened, onTheme }) {
  const root = document.querySelector('[data-pub-writers]');
  const box = root?.querySelector('.pub-writers__box');
  if (!box) return () => {};
  const statue = mountStatue(box.querySelector('.statue-slot'), { reduced, opened, onTheme, lazy: true });

  const parts = gsap.utils.toArray('.pub-writers__eyebrow, .pub-writers__text, .pub-writers__actions', box);
  const tl = gsap.timeline({ scrollTrigger: { trigger: box, start: 'top 85%', once: true }, defaults: { ease: 'curtain' } });
  if (reduced) {
    tl.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.4 });
  } else {
    tl.fromTo(box, { y: 48, opacity: 0 }, { y: 0, opacity: 1, duration: 1 })
      .fromTo(parts, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1 }, 0.3);
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set([box, ...parts], { clearProps: 'transform,opacity' });
    statue.dispose();
  };
}

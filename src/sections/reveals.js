// Text reveals: lines rise inside a mask and fade in, staggered, once per element.
// Groups ([data-stagger]) bring their children up 12 px with a fade. Reduced motion: opacity only.
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

export function setupReveals({ reduced }) {
  const splits = [];
  const triggers = [];
  // a re-split (a resize or a rotation: autoSplit re-wraps the lines) can change a block's height
  // after the page's ScrollTriggers were measured, so they are measured again once it has settled
  let refreshTimer = 0;
  const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 200); };

  for (const el of gsap.utils.toArray('[data-reveal]')) {
    if (el.closest('[data-intro]')) continue;
    const scrollTrigger = { trigger: el, start: 'top 88%', once: true };
    if (reduced) {
      triggers.push(gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, scrollTrigger }));
      continue;
    }
    let first = true;
    splits.push(SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) => {
        if (!first) refreshSoon();
        first = false;
        return gsap.from(self.lines, {
          yPercent: 105,
          autoAlpha: 0,
          duration: 0.7,
          ease: 'curtain',
          stagger: 0.08,
          scrollTrigger,
        });
      },
    }));
  }

  for (const group of gsap.utils.toArray('[data-stagger]')) {
    const items = group.children;
    const scrollTrigger = { trigger: group, start: 'top 85%', once: true };
    triggers.push(reduced
      ? gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, stagger: 0.05, scrollTrigger })
      : gsap.from(items, { y: 12, autoAlpha: 0, duration: 0.6, ease: 'curtain', stagger: 0.08, scrollTrigger }));
  }

  return () => {
    clearTimeout(refreshTimer);
    splits.forEach((s) => s.revert());
    triggers.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
  };
}

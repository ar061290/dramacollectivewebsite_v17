// About us: the statement lights up under the follow-spot; the light walks along the skills as the
// page scrolls (in a frame that stays put); the line about courage has its reason slide out from
// behind it; the values come in one by one; and the five words turn into one another inside the
// marble ring (src/sections/lexicon.js). Every scroll-driven piece is scrubbed: it goes back as the
// page goes back. With reduced motion everything is simply shown.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { bootPage } from '../site/boot.js';
import { followSpot, falloff, litCopy } from '../site/spotlight.js';
import { setupLexicon } from '../sections/lexicon.js';

bootPage(({ reduced, onTheme, opened }) => {
  const cleanups = [];

  // the statement: a warm copy of the text shows inside the spot
  for (const block of document.querySelectorAll('.spot-text')) {
    const base = block.querySelector('.spot-text__base');
    if (!base) continue;
    litCopy(base);
    cleanups.push(followSpot(block, { reduced }).dispose);
  }

  // the skills: the light walks from one to the next as the page scrolls, as it once did along the
  // five words, while the frame holding them stays on screen. With reduced motion there is no walk
  // and no light: all six are shown alike (about.css), none singled out
  const walk = document.querySelector('[data-skills-walk]');
  if (walk && !reduced) {
    const list = walk.querySelector('[data-skills]');
    const skills = [...list.querySelectorAll('.skill')];
    const glow = Object.assign(document.createElement('span'), { className: 'spot-glow' });
    glow.setAttribute('aria-hidden', 'true');
    list.prepend(glow);
    let active = -1;
    const at = (i) => {
      const l = list.getBoundingClientRect();
      const r = skills[i].getBoundingClientRect();
      return { x: r.left - l.left + r.width / 2, y: r.top - l.top + r.height / 2 };
    };
    const qx = gsap.quickTo(glow, 'x', { duration: 0.6, ease: 'power3.out' });
    const qy = gsap.quickTo(glow, 'y', { duration: 0.6, ease: 'power3.out' });
    const light = (i) => {
      if (i === active) return;
      active = i;
      skills.forEach((s, k) => s.classList.toggle('is-lit', k === i));
      const p = at(i);
      qx(p.x); qy(p.y);
    };
    gsap.set(glow, { ...at(0), opacity: 1 });
    light(0);
    // held on screen, the walk spans the frame's stay; on a screen too short to hold it (about.css)
    // the light walks while the list passes through the middle of the screen
    const held = () => getComputedStyle(walk.firstElementChild).position === 'sticky';
    const st = ScrollTrigger.create({
      trigger: walk,
      start: () => (held() ? 'top top' : 'top 70%'),
      end: () => (held() ? 'bottom bottom' : 'bottom 40%'),
      onUpdate: (self) => light(Math.min(skills.length - 1, Math.floor(self.progress * skills.length * 0.999))),
    });
    // the list re-wraps with the width: the light goes back over the lit skill
    const ro = new ResizeObserver(() => gsap.set(glow, at(Math.max(active, 0))));
    ro.observe(list);
    cleanups.push(() => { st.kill(); ro.disconnect(); });
  }

  // courage: the reason slides out from behind the line, scrubbed by the scroll (from its right on
  // a wide screen, where it stands to the line's left; from the left, under the line's gold rule,
  // where the two are stacked)
  const courage = document.querySelector('[data-courage]');
  if (courage && !reduced) {
    const text = courage.querySelector('.courage__text');
    const mm = gsap.matchMedia();
    mm.add({ wide: '(min-width: 1024px)', narrow: '(max-width: 1023px)' }, ({ conditions }) => {
      gsap.fromTo(text, { xPercent: conditions.wide ? 104 : -104, autoAlpha: 0.15 }, {
        xPercent: 0,
        autoAlpha: 1,
        ease: 'none',
        scrollTrigger: { trigger: courage, start: 'top 82%', end: conditions.wide ? 'bottom 55%' : 'bottom 62%', scrub: 0.6 },
      });
    });
    cleanups.push(() => mm.revert());
  }

  // the values: one after another as the page scrolls, each with its gold rule drawn out. Opacity
  // only (not autoAlpha, which hides with visibility): an item not yet scrolled in is still in the
  // page for a screen reader, which reads all six wherever the scroll is
  const values = document.querySelector('[data-values]');
  if (values) {
    const items = [...values.querySelectorAll('.value')];
    if (!reduced) {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: values, start: 'top 82%', end: 'bottom 58%', scrub: 0.6 },
      });
      items.forEach((item, i) => {
        tl.fromTo(item, { opacity: 0, y: 26, '--in': 0 }, { opacity: 1, y: 0, '--in': 1, duration: 1, ease: 'power1.out' }, i * 0.85);
      });
      cleanups.push(() => { tl.scrollTrigger?.kill(); tl.kill(); });
    }
    // each takes light from how near the follow-spot is (--lit 0..1)
    // (measured by layout, not by the screen, so the items' rise does not move where they light)
    let boxes = [];
    const measure = () => {
      boxes = items.map((el) => ({ el, x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth / 2 }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(values);
    const spot = followSpot(values, {
      reduced,
      onMove: (x, y, a) => {
        for (const b of boxes) {
          // distance to the item's nearest edge along x, so long items light from either end
          const dx = Math.max(0, Math.abs(x - b.x) - b.w * 0.6);
          b.el.style.setProperty('--lit', (falloff(dx, y - b.y, 180) * a).toFixed(3));
        }
      },
    });
    cleanups.push(() => { ro.disconnect(); spot.dispose(); });
  }

  // the five words in the marble ring
  const lexicon = document.querySelector('[data-lexicon]');
  if (lexicon) cleanups.push(setupLexicon(lexicon, { reduced, opened, onTheme }));

  return () => cleanups.forEach((c) => c());
});

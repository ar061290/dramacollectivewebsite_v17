// About us: the statement lights up under the follow-spot; the skills and the values light as the
// spot passes over them; the five verbs are lit one after another as the page scrolls (or tapped).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { bootPage } from '../site/boot.js';
import { followSpot, falloff, litCopy } from '../site/spotlight.js';

bootPage(({ reduced }) => {
  const cleanups = [];

  // the statement: a warm copy of the text shows inside the spot
  for (const block of document.querySelectorAll('.spot-text')) {
    const base = block.querySelector('.spot-text__base');
    if (!base) continue;
    litCopy(base);
    cleanups.push(followSpot(block, { reduced }).dispose);
  }

  // skills and values: each item takes light from how near the spot is (--lit 0..1)
  const lightItems = (host, items, radius) => {
    let boxes = [];
    const measure = () => {
      const h = host.getBoundingClientRect();
      boxes = items.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.left - h.left + r.width / 2, y: r.top - h.top + r.height / 2, w: r.width / 2 };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const spot = followSpot(host, {
      reduced,
      onMove: (x, y, a) => {
        for (const b of boxes) {
          // distance to the item's nearest edge along x, so long items light from either end
          const dx = Math.max(0, Math.abs(x - b.x) - b.w * 0.6);
          b.el.style.setProperty('--lit', (falloff(dx, y - b.y, radius) * a).toFixed(3));
        }
      },
    });
    return () => { ro.disconnect(); spot.dispose(); };
  };
  const skills = document.querySelector('[data-skills]');
  if (skills) cleanups.push(lightItems(skills, [...skills.querySelectorAll('.skill')], 200));
  const values = document.querySelector('[data-values]');
  if (values) cleanups.push(lightItems(values, [...values.querySelectorAll('.value')], 180));

  // the verbs: the light walks along them with the scroll, in a sticky frame
  const verbsHost = document.querySelector('[data-verbs]');
  if (verbsHost) {
    const list = verbsHost.querySelector('.verbs');
    const verbs = [...list.querySelectorAll('.verb')];
    const glow = Object.assign(document.createElement('span'), { className: 'spot-glow' });
    glow.setAttribute('aria-hidden', 'true');
    list.prepend(glow);
    let active = -1;
    const at = (i) => {
      const l = list.getBoundingClientRect();
      const r = verbs[i].getBoundingClientRect();
      return { x: r.left - l.left + r.width / 2, y: r.top - l.top + r.height / 2 };
    };
    const qx = gsap.quickTo(glow, 'x', { duration: reduced ? 0 : 0.6, ease: 'power3.out' });
    const qy = gsap.quickTo(glow, 'y', { duration: reduced ? 0 : 0.6, ease: 'power3.out' });
    const light = (i) => {
      if (i === active) return;
      active = i;
      verbs.forEach((v, k) => (k === i ? v.setAttribute('aria-current', 'step') : v.removeAttribute('aria-current')));
      const p = at(i);
      qx(p.x); qy(p.y);
    };
    gsap.set(glow, { ...at(0), opacity: 1 });
    light(0);

    let st = null;
    if (!reduced) {
      st = ScrollTrigger.create({
        trigger: verbsHost,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => light(Math.min(verbs.length - 1, Math.floor(self.progress * verbs.length * 0.999))),
      });
    }
    // tapping a verb lights it (and, with the walk on, scrolls to its place in it)
    const onTap = (e) => {
      const i = verbs.indexOf(e.currentTarget);
      if (!st) { light(i); return; }
      const y = st.start + (st.end - st.start) * ((i + 0.5) / verbs.length);
      gsap.to(window, { scrollTo: y, duration: 0.9, ease: 'power2.inOut' });
    };
    verbs.forEach((v) => v.addEventListener('click', onTap));
    const onResize = () => { const p = at(Math.max(active, 0)); gsap.set(glow, p); };
    window.addEventListener('resize', onResize);
    cleanups.push(() => {
      st?.kill();
      verbs.forEach((v) => v.removeEventListener('click', onTap));
      window.removeEventListener('resize', onResize);
    });
  }

  return () => cleanups.forEach((c) => c());
});

// Apply now: the three roles billed as in a programme's cast list, each coming up into its place as
// the page reaches it and taking light from the follow-spot (the role the pointer is over is lit;
// on touch, the one passing the middle of the screen); then the application form, Fillout's, loaded
// once the curtain has parted (src/site/fillout.js). With reduced motion the roles are simply shown.
import gsap from 'gsap';
import { bootPage } from '../site/boot.js';
import { followSpot, falloff } from '../site/spotlight.js';
import { embedFillout } from '../site/fillout.js';

bootPage(({ reduced, opened }) => {
  const cleanups = [];

  const list = document.querySelector('[data-roles]');
  if (list) {
    const roles = [...list.querySelectorAll('.role')];

    // up into place, once each. Opacity, never visibility: a role not yet reached is still read by a
    // screen reader, and its link can still take focus (which scrolls it in, and so brings it up)
    if (!reduced) {
      for (const role of roles) {
        const tw = gsap.fromTo(role, { opacity: 0, y: 28 }, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'curtain',
          clearProps: 'opacity,transform',
          scrollTrigger: { trigger: role, start: 'top 92%', once: true },
        });
        cleanups.push(() => { tw.scrollTrigger?.kill(); tw.kill(); });
      }
    }

    // the light: each role takes it (--lit 0..1) as the spot comes into its row, measured by layout
    // rather than by the screen, so a role still rising does not move where it lights
    let rows = [];
    const measure = () => {
      rows = roles.map((el) => ({ el, y: el.offsetTop + el.offsetHeight / 2, h: el.offsetHeight / 2 }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    const spot = followSpot(list, {
      reduced,
      onMove: (x, y, a) => {
        for (const r of rows) {
          const dy = Math.max(0, Math.abs(y - r.y) - r.h * 0.7);
          r.el.style.setProperty('--lit', (falloff(0, dy, 160) * a).toFixed(3));
        }
      },
    });
    cleanups.push(() => { ro.disconnect(); spot.dispose(); });
  }

  // the form
  const host = document.querySelector('[data-fillout-id]');
  cleanups.push(embedFillout(host, { opened, title: 'CHIREC Drama Collective Application' }));

  return () => cleanups.forEach((c) => c());
});

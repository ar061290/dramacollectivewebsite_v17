// Scroll choreography for the stage. Each [data-scene] section (five acts after the hero) declares its "scene":
//   data-frame  where the statue sits (fraction of the viewport width, + = right), so the text has
//               clear negative space beside it
//   data-light  0 warm ... 1 cool spotlight
//   data-key    key light level
// Across the whole page the ring turns four full revolutions about the viewing axis (scrub 1.2),
// the camera arcs 22 degrees round the statue and closes in slightly. The statue plays its
// sequence (`seq`, scrub 1.2; phases and curves in src/scene/sequence.js) over <main>, so it is
// complete, and the logo is on stage, before the curtain-call footer covers the stage.
// With reduced motion nothing is scrubbed: the hero pose holds, then the logo appears in one step
// when the morph section is reached.
// A held act ([data-hold], act four) stays on screen for a stretch of scroll while its cards turn;
// over that stretch the stage holds still: the sequence, the ring and the camera are laid out over the
// rest of the page, as if the stretch were not there.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { PHASES, retime } from '../scene/sequence.js';
import { HOLD_QUERY } from './pillars.js';

const DEG = Math.PI / 180;
const RING_TURNS = 4;

export function setupScenes({ stage }) {
  const state = stage.state;
  const sections = gsap.utils.toArray('[data-scene]');
  const holds = gsap.utils.toArray('[data-hold]');
  const mm = gsap.matchMedia();
  // the held stretches, in page scroll px: from a held act's top reaching the top of the screen to
  // its foot reaching the foot (it is sticky in between); held(y) is how much of them lies before y
  let ranges = [];
  let Lmain = 1, Lpage = 1, H = 0;
  const tall = matchMedia(HOLD_QUERY); // a held act is only held where the screen is tall enough
  const measure = () => {
    ranges = (tall.matches ? holds : []).map((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      return [top, top + Math.max(0, el.offsetHeight - innerHeight)];
    });
    H = ranges.reduce((sum, [a, b]) => sum + b - a, 0);
    Lmain = Math.max(1, document.querySelector('main').offsetHeight - innerHeight);
    Lpage = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  };
  const held = (y) => ranges.reduce((sum, [a, b]) => sum + Math.min(Math.max(y - a, 0), b - a), 0);
  // progress p (0..1) over a scroll of length L, with the held stretches taken out
  const still = (p, L) => { const y = p * L; return Math.min(1, Math.max(0, (y - held(y)) / Math.max(1, L - H))); };

  // a conditions handler only runs while at least one condition matches, so desktop is explicit
  mm.add({
    desktop: '(min-width: 768px)',
    mobile: '(max-width: 767px)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (ctx) => {
    const { mobile, reduce } = ctx.conditions;
    // the sequence is laid out in screens of scroll: fit it to this page's own scroll length (the
    // morph keeps its pace whatever the length; the turn takes up the difference)
    const fit = () => { measure(); retime((Lmain - H) / innerHeight); };
    fit();
    ScrollTrigger.addEventListener('refresh', fit); // after the others have laid out (the footer's slot)
    stage.setFill(mobile ? 0.46 : 0.68);
    // the vector logo meets the footer in front of it on wide screens; on phones the footer covers it
    // until it starts to dock
    if (stage.occluder) stage.setOccluder(stage.occluder, { logoInFront: !mobile });

    const hero = { frameX: 0, frameY: mobile ? 0.12 : 0, lightMix: 0, keyLevel: 1, ringLevel: 1 };
    Object.assign(state, hero);
    const scenes = sections.map((el) => ({
      el,
      look: {
        frameX: mobile ? 0 : parseFloat(el.dataset.frame) || 0,
        frameY: mobile ? 0.2 : 0,
        lightMix: parseFloat(el.dataset.light) || 0,
        keyLevel: parseFloat(el.dataset.key) || 1,
        ringLevel: 0.8, // the ring steps back a little while text is on stage
      },
    }));

    let prev = hero;
    for (const { el, look } of scenes) {
      const from = prev;
      if (reduce) {
        // no tweening: the stage changes in one step when the scene changes
        ScrollTrigger.create({
          trigger: el,
          start: 'top 55%',
          onEnter: () => Object.assign(state, look),
          onLeaveBack: () => Object.assign(state, from),
        });
      } else {
        gsap.fromTo(state, { ...from }, {
          ...look,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 30%', scrub: 1.2 },
        });
      }
      prev = look;
    }

    if (!reduce) {
      // the scroll is scrubbed as plain progress; the stage reads it with the held stretches taken out
      const raw = { page: 0, main: 0 };
      gsap.fromTo(raw, { page: 0 }, {
        page: 1,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 1.2 },
        onUpdate: () => {
          const f = still(raw.page, Lpage);
          state.spin = f * Math.PI * 2 * RING_TURNS;
          state.arc = f * -22 * DEG;
          state.dolly = 1 + f * (stage.dollyMin - 1);
        },
      });
      gsap.fromTo(raw, { main: 0 }, {
        main: 1,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: {
          trigger: 'main',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.2,
          // past the end of <main> the footer is rising: the sequence is finished at once, so the 3D
          // logo has gone flat and handed over to its vector (which docks with the footer's columns)
          // before any of it could be cut by the footer, however fast the page got there
          onLeave: (self) => self.getTween()?.progress(1),
        },
        onUpdate: () => { state.seq = still(raw.main, Lmain); },
      });
    } else {
      Object.assign(state, { spin: 0, arc: 0, dolly: 1, seq: 0 });
      ScrollTrigger.create({
        trigger: 'main',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => { state.seq = still(self.progress, Lmain) >= PHASES.morph[0] ? 1 : 0; },
      });
    }
    return () => ScrollTrigger.removeEventListener('refresh', fit);
  });

  return () => mm.revert();
}

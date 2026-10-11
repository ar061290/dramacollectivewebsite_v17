// Scroll choreography for the stage. Each [data-scene] section declares its "scene":
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
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { PHASES } from '../scene/sequence.js';

const DEG = Math.PI / 180;
const RING_TURNS = 4;

export function setupScenes({ stage }) {
  const state = stage.state;
  const sections = gsap.utils.toArray('[data-scene]');
  const mm = gsap.matchMedia();

  // a conditions handler only runs while at least one condition matches, so desktop is explicit
  mm.add({
    desktop: '(min-width: 768px)',
    mobile: '(max-width: 767px)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (ctx) => {
    const { mobile, reduce } = ctx.conditions;
    stage.setFill(mobile ? 0.46 : 0.68);
    // the logo stays in front of the footer on wide screens; on phones the footer covers it
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
      gsap.fromTo(state, { spin: 0, arc: 0, dolly: 1 }, {
        spin: Math.PI * 2 * RING_TURNS,
        arc: -22 * DEG,
        dolly: stage.dollyMin,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 1.2 },
      });
      gsap.fromTo(state, { seq: 0 }, {
        seq: 1,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: 'main', start: 'top top', end: 'bottom bottom', scrub: 1.2 },
      });
    } else {
      Object.assign(state, { spin: 0, arc: 0, dolly: 1, seq: 0 });
      ScrollTrigger.create({
        trigger: 'main',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => { state.seq = self.progress >= PHASES.morph[0] ? 1 : 0; },
      });
    }
  });

  return () => mm.revert();
}

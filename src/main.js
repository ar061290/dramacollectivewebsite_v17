// Boot: loader, stage (lazy), constellation sky, scroll scenes, reveals, nav, cursor, theme,
// music, intro.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { SplitText } from 'gsap/SplitText.js';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin.js';
import { CustomEase } from 'gsap/CustomEase.js';
import { reducedMotion, probeWebGL, prefersStatic, readToken } from './util/env.js';
import { ConstellationField } from './constellation/Constellation.js';
import { loadLottie, freeze } from './animations/lottie.js';
import { playIntro } from './animations/intro.js';
import { setupNav } from './animations/nav.js';
import { setupBrandMark } from './animations/brand.js';
import { setupTransitions } from './site/transition.js';
import { setupCursor } from './animations/cursor.js';
import { setupReveals } from './sections/reveals.js';
import { setupCounters } from './sections/counters.js';
import { setupScenes } from './sections/scenes.js';
import { setupCountdown } from './sections/countdown.js';
import { setupDock } from './sections/dock.js';
import { setupPillars } from './sections/pillars.js';
import { setupTheme, skyTheme, currentTheme } from './ui/theme.js';
import { setupMusic } from './ui/music.js';
import { tilt } from './site/tilt.js';
import { setupFlyIn } from './site/flyin.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrollToPlugin, CustomEase);
CustomEase.create('curtain', '.22,.61,.36,1'); // --ease-curtain from the design system

const ASSETS = {
  statue: new URL('../assets/models/statue-rig.glb', import.meta.url).href,
  logo: new URL('../assets/brand/mark.svg', import.meta.url).href,
  logoParts: new URL('../assets/brand/mark-regions.json', import.meta.url).href,
  albedo: new URL('../assets/textures/ring-albedo.webp', import.meta.url).href,
  normal: new URL('../assets/textures/ring-normal.webp', import.meta.url).href,
};

const reduced = reducedMotion();
const cleanups = [];
// ?debug: how long each step of the start takes (printed once the curtain is up)
const marks = [];
const mark = (name) => marks.push([name, Math.round(performance.now())]);
let stage = null;
let sky = null;

async function boot() {
  // arriving through the curtain from another page: part it now, onto the loader
  const transitions = setupTransitions({ reduced });
  cleanups.push(transitions.dispose);
  transitions.open();

  // the theme and music switches work from the first moment, before the stage has loaded
  cleanups.push(setupMusic({ reduced }));
  cleanups.push(setupTheme({
    reduced,
    onChange: (theme, { instant = false } = {}) => {
      sky?.setTheme(skyTheme());
      if (!stage) return;
      const daylight = theme === 'light' ? 1 : 0;
      // the new theme is being pictured for the circle that reveals it (src/ui/theme.js): the stage
      // takes its new light at once and draws it now, so the picture is already right
      if (instant) {
        gsap.killTweensOf(stage.state, 'daylight');
        stage.state.daylight = daylight;
        stage.renderOnce();
        return;
      }
      gsap.to(stage.state, { daylight, duration: reduced ? 0 : 0.7, ease: 'sine.inOut', overwrite: 'auto' });
    },
  }));

  // the loader is already running (index.html): the satin and the sunburst's rays
  const loader = document.querySelector('.loader');

  // the sky works everywhere, even without WebGL
  sky = new ConstellationField({
    canvas: document.querySelector('.stage__stars'),
    theme: skyTheme(),
    reducedMotion: reduced,
    covers: (x, y) => (stage ? stage.covers(x, y) : false),
  });

  // live scene or the still picture
  const gl = probeWebGL();
  if (gl.ok && !prefersStatic(gl.renderer)) {
    try {
      const [{ Stage }, { setupStatueInteraction }] = await Promise.all([
        import('./scene/Stage.js'),
        import('./scene/interaction.js'),
      ]);
      app.setupStatueInteraction = setupStatueInteraction;
      mark('stage code');
      stage = new Stage({
        container: document.querySelector('.stage__gl'),
        reducedMotion: reduced,
        colors: {
          warm: readToken('--gold-300'),
          cool: readToken('--slate-200'),
          rim: readToken('--slate-300'),
          floor: readToken('--plum-800'),
        },
      });
      stage.state.daylight = currentTheme() === 'light' ? 1 : 0;
      await stage.load({
        statueUrl: ASSETS.statue,
        textureUrls: { albedo: ASSETS.albedo, normal: ASSETS.normal },
      });
      mark('statue loaded');
    } catch (err) {
      console.error('Stage failed, showing the still picture instead.', err);
      stage?.dispose();
      stage = null;
    }
  }
  const still = document.querySelector('.stage__fallback');
  if (!stage) {
    // the still picture is fetched only when it is needed (it is most of a megabyte)
    still.src = new URL('../assets/fallback/hero.png', import.meta.url).href;
    still.hidden = false;
    // never let a stalled decode hold the curtain
    await Promise.race([still.decode().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  }

  // the type, and the stage's shaders, are ready before the curtain goes up
  await Promise.all([document.fonts.ready, stage?.warm()]);
  mark('fonts and shaders');

  // curtain: loader out
  await gsap.to(loader, { autoAlpha: 0, duration: reduced ? 0 : 0.45, ease: 'curtain' });
  loader.classList.add('is-done');
  window.dcLoader?.stop();
  // the page scrolls again (index.html held it at the top while the loader was up)
  document.documentElement.classList.remove('is-loading');
  window.scrollTo(0, 0);
  mark('curtain up');
  if (new URLSearchParams(location.search).has('debug')) console.info('start:', marks.map(([n, t]) => `${n} ${t} ms`).join(' · '));

  if (stage) {
    stage.renderOnce();
    stage.setOccluder(document.querySelector('.curtain'));
    document.querySelector('.curtain')?.classList.add('has-stage-logo');
    stage.start();
    cleanups.push(setupScenes({ stage }));
    cleanups.push(app.setupStatueInteraction({ stage, sky }));
    const onPointer = (e) => {
      if (e.pointerType !== 'mouse' || reduced) return;
      stage.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    cleanups.push(() => window.removeEventListener('pointermove', onPointer));
  }
  sky.start();

  cleanups.push(setupNav({ reduced }));
  // the bar's Apply now and Become a sponsor fly to their own spots on the page, if it has any
  cleanups.push(setupFlyIn({ reduced }));
  cleanups.push(setupCursor({ reduced }));
  cleanups.push(setupReveals({ reduced }));
  // act four: the five pillars, prompt cards on a ring, turned by the scroll (and touch, mouse, keys)
  cleanups.push(setupPillars({ reduced, sky }));
  cleanups.push(setupCounters({ reduced }));
  // act two counts down to the production; the last act's copy docks into the footer
  const countdown = document.querySelector('[data-countdown]');
  if (countdown) cleanups.push(setupCountdown(countdown, reduced));
  cleanups.push(setupDock());
  // the Lotties load alongside the intro, never ahead of it (the hero's words must not wait on them)
  const lotties = setupLotties();

  // what the intro animates: the live lights, or the still picture's opacity
  const light = stage
    ? {
        set: (s, r) => Object.assign(stage.state, { stageLight: s, ringReveal: r }),
        tween: (vars) => gsap.to(stage.state, vars),
      }
    : {
        set: () => gsap.set(still, { autoAlpha: 1 }),
        tween: (vars) => gsap.fromTo(still, { autoAlpha: 0 }, { autoAlpha: 1, duration: vars.duration, ease: vars.ease }),
      };
  if (!stage && !reduced) gsap.set(still, { autoAlpha: 0 });
  playIntro({
    hero: document.querySelector('.hero'),
    light,
    scrollCue: { play: () => lotties.then(() => app.scrollCue?.play()) },
    reduced,
    onComplete: () => ScrollTrigger.refresh(),
  });
  // the footer's mark leans toward the pointer, as on the other pages
  for (const el of document.querySelectorAll('[data-tilt]')) cleanups.push(tilt(el, { reduced, max: 10 }));

  watchVisibility();
  if (stage) prepareMorph();
  if (new URLSearchParams(location.search).has('debug') && stage) {
    const { setupDebug } = await import('./ui/debug.js');
    cleanups.push(setupDebug({ stage }));
  }
}

// The morph mesh is built once the hero is up, in a quiet moment (a few hundred milliseconds).
async function prepareMorph() {
  try {
    const [svg, parts] = await Promise.all([
      fetch(ASSETS.logo).then((r) => r.text()),
      fetch(ASSETS.logoParts).then((r) => r.json()).catch(() => null), // without it, the morph is whole-figure
    ]);
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 300)));
    const morph = stage?.prepareMorph(svg, parts);
    if (morph) console.info(`morph ready: ${morph.triangles} triangles in ${morph.ms} ms`, morph.parts);
  } catch (err) {
    console.warn('Morph unavailable; the statue holds its pose instead.', err);
  }
}

const app = { scrollCue: null, setupStatueInteraction: null };

async function setupLotties() {
  // nav mark: the curtain rises on the mark once, and again on hover
  cleanups.push(await setupBrandMark({ reduced }));

  // scroll cue: a slow descending dot (static frame with reduced motion)
  const cue = await loadLottie(document.querySelector('[data-lottie="scroll-cue"]'), 'scroll-cue', { loop: !reduced });
  if (cue) {
    if (reduced) freeze(cue, 60);
    app.scrollCue = reduced ? null : cue;
    cleanups.push(() => cue.destroy());
  }
}

// Pause both canvases when the tab is hidden or the stage is covered by the footer. Covered by the
// footer, the stage first plays out to where the scroll has got to (a fast scroll to the end leaves
// the scrubbed sequence behind it) and only then stops, so it never freezes mid-morph over the footer.
function watchVisibility() {
  let stageInView = true;
  const apply = () => {
    if (document.hidden) { stage?.stop(); sky?.stop(); return; }
    if (stageInView) { stage?.start(); sky?.start(); return; }
    sky?.stop();
    stage?.stopWhenSettled();
  };
  // a pixel off the top: at the end of the page <main>'s foot sits exactly on the screen's top edge,
  // which an observer still counts as in view
  const io = new IntersectionObserver(([entry]) => { stageInView = entry.isIntersecting; apply(); }, { rootMargin: '-1px 0px 0px 0px' });
  io.observe(document.querySelector('main'));
  document.addEventListener('visibilitychange', apply);
  cleanups.push(() => { io.disconnect(); document.removeEventListener('visibilitychange', apply); });
}

/** Tear everything down: GPU resources, listeners, ScrollTriggers, SplitTexts, Lotties. */
export function destroy() {
  while (cleanups.length) {
    try { cleanups.pop()?.(); } catch (err) { console.warn(err); }
  }
  ScrollTrigger.getAll().forEach((t) => t.kill());
  sky?.dispose();
  stage?.dispose();
  sky = null;
  stage = null;
}

window.addEventListener('pagehide', (e) => { if (!e.persisted) destroy(); });
window.dramaCollective = { destroy, get stage() { return stage; }, get sky() { return sky; } };

boot();

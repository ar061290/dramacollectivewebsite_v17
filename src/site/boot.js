// Boot for the inner pages (the home page has its own, src/main.js): the curtain between pages,
// theme, music, the star sky, the top bar, the cursor, text reveals, the nav mark and the footer's
// mark. A page passes `setup(ctx)` for its own pieces; the curtain parts once they are in place.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { SplitText } from 'gsap/SplitText.js';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin.js';
import { CustomEase } from 'gsap/CustomEase.js';
import { reducedMotion } from '../util/env.js';
import { ConstellationField } from '../constellation/Constellation.js';
import { setupTransitions } from './transition.js';
import { setupNav } from '../animations/nav.js';
import { setupCursor } from '../animations/cursor.js';
import { setupBrandMark } from '../animations/brand.js';
import { setupReveals } from '../sections/reveals.js';
import { setupTheme, skyTheme } from '../ui/theme.js';
import { setupMusic } from '../ui/music.js';
import { tilt } from './tilt.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrollToPlugin, CustomEase);
CustomEase.create('curtain', '.22,.61,.36,1'); // --ease-curtain from the design system

/**
 * @param {(ctx: { reduced: boolean, sky: ConstellationField|null, onTheme: (fn) => void }) => (void|(() => void))} [setup]
 */
export async function bootPage(setup) {
  const reduced = reducedMotion();
  const cleanups = [];
  const themeListeners = [];
  const transitions = setupTransitions({ reduced });
  cleanups.push(transitions.dispose);

  let sky = null;
  cleanups.push(setupMusic({ reduced }));
  cleanups.push(setupTheme({
    reduced,
    onChange: (theme) => {
      sky?.setTheme(skyTheme());
      themeListeners.forEach((fn) => fn(theme));
    },
  }));
  const canvas = document.querySelector('.stage__stars');
  if (canvas) {
    sky = new ConstellationField({ canvas, theme: skyTheme(), reducedMotion: reduced });
    sky.start();
    cleanups.push(() => sky.dispose());
  }
  cleanups.push(setupNav({ reduced }));
  cleanups.push(setupCursor({ reduced }));
  for (const el of document.querySelectorAll('[data-tilt]')) cleanups.push(tilt(el, { reduced, max: 10 }));

  // the type has to be in before lines are split (never wait on it for long)
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
  cleanups.push(setupReveals({ reduced }));
  const ctx = { reduced, sky, onTheme: (fn) => themeListeners.push(fn) };
  try {
    const own = setup?.(ctx);
    if (typeof own === 'function') cleanups.push(own);
  } catch (err) {
    console.error('Page setup failed.', err);
  }
  setupBrandMark({ reduced }).then((c) => cleanups.push(c));

  await transitions.open();
  ScrollTrigger.refresh();
  window.addEventListener('pagehide', (e) => { if (!e.persisted) cleanups.forEach((c) => c?.()); });
  return ctx;
}

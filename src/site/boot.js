// Boot for the inner pages (the home page has its own, src/main.js): the curtain between pages,
// theme, music, the star sky, the top bar, the cursor, text reveals, the nav mark, the footer's mark,
// the bar's two buttons flying to their spots on the page, and the earrings on the theme switch. A page passes `setup(ctx)` for its own
// pieces; the curtain parts once they are in place.
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
import { setupEarrings } from '../ui/earrings.js';
import { tilt } from './tilt.js';
import { setupFlyIn } from './flyin.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrollToPlugin, CustomEase);
CustomEase.create('curtain', '.22,.61,.36,1'); // --ease-curtain from the design system

/**
 * @param {(ctx: { reduced: boolean, sky: ConstellationField|null, onTheme: (fn: (theme: string, opts: { instant?: boolean }) => void) => void, opened: Promise<void> }) => (void|(() => void))} [setup]
 */
export async function bootPage(setup) {
  const reduced = reducedMotion();
  const cleanups = [];
  const themeListeners = [];
  const transitions = setupTransitions({ reduced });
  cleanups.push(transitions.dispose);

  let sky = null;
  cleanups.push(setupMusic({ reduced }));
  // pages hold their heavy work (three.js) until the curtain has parted, so it parts smoothly
  let parted;
  const opened = new Promise((r) => { parted = r; });
  // the earrings that come down from the theme switch (their model is fetched once the page is idle)
  const earrings = setupEarrings({ reduced, opened });
  cleanups.push(earrings.cleanup);
  cleanups.push(setupTheme({
    reduced,
    onSwitch: earrings.drop,
    // `instant`: the new theme is being captured for the circle that reveals it (src/ui/theme.js),
    // so every canvas must take its final look at once, in this frame, rather than ease into it. The
    // sky's colours change at once already (its running loop paints them before the capture); the
    // page's own canvases are told the same (onTheme listeners get it as their second argument).
    onChange: (theme, opts = {}) => {
      sky?.setTheme(skyTheme());
      themeListeners.forEach((fn) => fn(theme, opts));
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

  // the type has to be in before lines are split (never wait on it for long: the curtain is closed)
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 450))]);
  cleanups.push(setupReveals({ reduced }));
  const ctx = { reduced, sky, onTheme: (fn) => themeListeners.push(fn), opened };
  try {
    const own = setup?.(ctx);
    if (typeof own === 'function') cleanups.push(own);
  } catch (err) {
    console.error('Page setup failed.', err);
  }
  setupBrandMark({ reduced }).then((c) => cleanups.push(c));

  // one frame for the page to settle, then the curtain parts
  await new Promise((r) => requestAnimationFrame(r));
  await transitions.open();
  parted();
  ScrollTrigger.refresh();
  // only now, with the curtain open, may the bar's buttons fly to their spots on the page
  cleanups.push(setupFlyIn({ reduced }));
  window.addEventListener('pagehide', (e) => { if (!e.persisted) cleanups.forEach((c) => c?.()); });
  return ctx;
}

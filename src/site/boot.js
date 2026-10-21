// Boot for the inner pages (the home page has its own, src/main.js): the curtain between pages,
// theme, music, the star sky, the top bar, the cursor, text reveals, the nav mark, the footer's mark,
// the bar's two buttons flying to their spots on the page, and the earrings on the theme switch. A page passes `setup(ctx)` for its own
// pieces; the curtain parts once they are in place.
import gsap from 'gsap';
import { onLite } from '../util/governor.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { SplitText } from 'gsap/SplitText.js';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin.js';
import { CustomEase } from 'gsap/CustomEase.js';
import { reducedMotion, liteTier } from '../util/env.js';
import { mark } from '../util/perf.js';
import { setupField } from '../util/field.js';
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
// GSAP looks whether it can sleep (nothing left to animate) every autoSleep frames, 120 by default: after
// every scroll, tap or tween it ticked on with nothing to do for up to 2 s, and every frame loop that waits
// for it to stand still (the home stage's, src/scene/Stage.js) with it. It looks every 30 now; while
// anything is animating it does not sleep, and a new tween wakes it, so no motion changes.
gsap.config({ autoSleep: 30 });
// lite tier: ScrollTrigger looks for a scroll it may have missed every 2 s rather than every 250 ms (each
// look asks for a frame of its own on a still page; today's browsers do not miss scroll events)
if (liteTier()) ScrollTrigger.config({ syncInterval: 2000 });
else onLite(() => ScrollTrigger.config({ syncInterval: 2000 })); // (the frame governor's verdict, src/util/governor.js)

// ScrollTrigger measured the whole page again on the window's load, and boot() once more as the curtain
// parts: a long task each (on a phone 50-150 ms for Publication or the writers), which on most pages
// gave back the places they already had. Both now run only if something has moved since the last
// refresh: a trigger's box, the page's height or the window. (Across every page, on a phone and a
// laptop, no refresh that changed a place found these as the refresh before it left them.) Watched
// only until both have passed.
ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,DOMContentLoaded,resize' });
let placed = null;
const places = () => ScrollTrigger.getAll().map((st) => {
  const r = st.trigger?.getBoundingClientRect();
  return r ? `${r.top + scrollY},${r.height},${r.left},${r.width}` : '-';
}).join(';') + `|${document.documentElement.scrollHeight},${innerWidth},${innerHeight}`;
const onRefreshed = () => { placed = places(); };
ScrollTrigger.addEventListener('refresh', onRefreshed);
let unsettled = 2; // the parting and the window's load
const refreshIfMoved = () => {
  if (placed === null || places() !== placed) ScrollTrigger.refresh();
  if (--unsettled === 0) ScrollTrigger.removeEventListener('refresh', onRefreshed);
};
if (document.readyState === 'complete') unsettled--;
else window.addEventListener('load', refreshIfMoved, { once: true });
CustomEase.create('curtain', '.22,.61,.36,1'); // --ease-curtain from the design system

/**
 * @param {(ctx: { reduced: boolean, sky: ConstellationField|null, onTheme: (fn: (theme: string, opts: { instant?: boolean }) => void) => void, opened: Promise<void> }) => (void|(() => void))} [setup]
 */
export async function bootPage(setup) {
  try {
    return await start(setup);
  } catch (err) {
    // a start that throws before the curtain has parted would leave a closed curtain (arriving from
    // another page) or a half-made page: shown as it is without script instead (the failsafe, README)
    console.error('The page could not start.', err);
    if (!window.dcUp) window.dcFailsafe?.();
    return null;
  }
}

async function start(setup) {
  window.dcBooted = true; // for the failsafe in the head (tools/pages/build.mjs)
  mark('boot');
  const reduced = reducedMotion();
  const cleanups = [];
  cleanups.push(setupField());
  // the page's pieces are taken down in the reverse of the order they were made, each on its own
  // (one that fails must not keep a statue's WebGL context alive under the next page), and from the
  // first moment, so leaving during the boot frees what had been made by then
  const teardown = () => { while (cleanups.length) { try { cleanups.pop()?.(); } catch (err) { console.warn(err); } } };
  window.addEventListener('pagehide', (e) => { if (!e.persisted) teardown(); });
  const themeListeners = [];
  const transitions = setupTransitions({ reduced });
  cleanups.push(transitions.dispose);

  let sky = null;
  // pages hold their heavy work (three.js) until the curtain has parted, so it parts smoothly; the
  // music starts by itself only then too
  let parted;
  const opened = new Promise((r) => { parted = r; });
  cleanups.push(setupMusic({ reduced, opened }));
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
    // under the phone's Menu sheet (opaque, the whole screen) the sky rests
    const onMenu = (e) => { if (e.detail === 'covered') sky.hold('menu'); else sky.release('menu'); };
    document.addEventListener('dc:menu', onMenu);
    cleanups.push(() => document.removeEventListener('dc:menu', onMenu));
    // for the lab (tools/perf) and the console, as the home page does in src/main.js
    window.dramaCollective = Object.assign(window.dramaCollective || {}, { sky });
    cleanups.push(() => sky.dispose());
  }
  cleanups.push(setupNav({ reduced }));
  cleanups.push(setupCursor({ reduced }));
  for (const el of document.querySelectorAll('[data-tilt]')) cleanups.push(tilt(el, { reduced, max: 10 }));

  // the type has to be in before lines are split (never wait on it for long: the curtain is closed)
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 450))]);
  mark('fonts');
  cleanups.push(setupReveals({ reduced }));
  const ctx = { reduced, sky, onTheme: (fn) => themeListeners.push(fn), opened };
  try {
    const own = setup?.(ctx);
    if (typeof own === 'function') cleanups.push(own);
  } catch (err) {
    console.error('Page setup failed.', err);
  }
  setupBrandMark({ reduced, when: opened }).then((c) => cleanups.push(c));
  mark('setup');

  // one frame for the page to settle, then the curtain parts
  await new Promise((r) => requestAnimationFrame(r));
  await transitions.open();
  mark('parted');
  window.dcUp = true;
  parted();
  refreshIfMoved();
  // only now, with the curtain open, may the bar's buttons fly to their spots on the page
  cleanups.push(setupFlyIn({ reduced }));
  return ctx;
}

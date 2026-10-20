// The statue in a box on the publication page (src/scene/thinker.js): the opening, the upcoming
// pieces' panel and the writers' box each mount one. Each is its own small canvas inside its box,
// so it scrolls with the page exactly; the model is fetched and decoded once for all of them.
// Where WebGL runs poorly (src/util/env.js) the box keeps its still picture (.statue-slot__still).
// Markup: <figure class="statue-slot" role="img" aria-label="..."><span class="statue-slot__still"
// aria-hidden="true"></span></figure>; the CSS is in src/styles/publication.css.
import { probeWebGL, prefersStatic } from '../util/env.js';

const MODEL = new URL('../../assets/models/thinker.glb', import.meta.url).href;
const debug = new URLSearchParams(location.search).has('debug');

let gl = null; // probed once for the page
const canLive = () => {
  gl ??= probeWebGL();
  return gl.ok && !prefersStatic(gl.renderer);
};
const pageTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/**
 * Mount the live statue in `host` (a .statue-slot).
 * @param {HTMLElement} host
 * @param {object} o
 * @param {boolean} o.reduced          reduced motion: he stands still
 * @param {Promise} o.opened           the page curtain has opened (bootPage's ctx.opened)
 * @param {(fn: Function) => void} o.onTheme  bootPage's ctx.onTheme
 * @param {object|null} [o.sky]        the star sky (bootPage's ctx.sky): given only where stars show
 *                                     around him; it then leaves his box alone and makes no
 *                                     constellations while he is being turned
 * @param {number} [o.fit]             how much of the box he fills (1: the whole figure with room)
 * @param {boolean} [o.turnable]       whether a drag turns him a little (not with reduced motion)
 * @param {boolean} [o.lazy]           wait until the box is near the viewport before making him
 * @returns {{ ready: Promise<import('../scene/thinker.js').Thinker|null>, get thinker(): any, dispose(): void }}
 */
export function mountStatue(host, { reduced, opened, onTheme, sky = null, fit = 1, turnable = true, lazy = true } = {}) {
  let thinker = null;
  let gone = false;
  let box = null;
  const cleanups = [];
  if (!host || !canLive()) return { ready: Promise.resolve(null), get thinker() { return null; }, dispose() {} };

  const near = lazy
    ? new Promise((resolve) => {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { io.disconnect(); resolve(); }
        }, { rootMargin: '60% 0px 60% 0px' });
        io.observe(host);
        cleanups.push(() => io.disconnect());
      })
    : Promise.resolve();

  const ready = Promise.all([opened, near])
    .then(() => (gone ? null : import('../scene/thinker.js')))
    .then(async (mod) => {
      if (!mod || gone) return null;
      const t = new mod.Thinker(host, {
        reduced,
        theme: pageTheme(),
        fit,
        turnable,
        onTurn: (on) => { if (sky) sky.suspended = on; },
      });
      if (debug) (window.__thinkers ??= []).push(t);
      try {
        await t.load(MODEL);
      } catch (err) {
        t.dispose();
        throw err;
      }
      if (gone) { t.dispose(); return null; }
      // the theme may have changed while it loaded (if not, the frame it drew stands: no second draw)
      if (t.theme !== pageTheme()) t.setTheme(pageTheme(), { instant: true });
      thinker = t;
      host.classList.add('is-live');
      host.classList.toggle('is-turnable', turnable && !reduced);
      if (sky) {
        // the sky leaves his box alone: no stars caught there, and a swipe there turns him
        const measure = () => { box = host.getBoundingClientRect(); };
        const covers = (x, y) => !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
        const ro = new ResizeObserver(measure);
        measure();
        ro.observe(host);
        window.addEventListener('scroll', measure, { passive: true });
        window.addEventListener('resize', measure);
        const before = sky.covers;
        sky.covers = (x, y) => covers(x, y) || before(x, y);
        cleanups.push(() => {
          ro.disconnect();
          window.removeEventListener('scroll', measure);
          window.removeEventListener('resize', measure);
          sky.covers = before;
        });
      }
      return t;
    })
    .catch((err) => {
      console.warn('The statue is unavailable; showing its still picture.', err);
      return null;
    });

  onTheme?.((theme, opts) => { if (!gone) thinker?.setTheme(theme, opts); });

  return {
    ready,
    get thinker() { return thinker; },
    dispose() {
      gone = true;
      cleanups.forEach((c) => c());
      thinker?.dispose();
      thinker = null;
      host.classList.remove('is-live', 'is-turnable');
    },
  };
}

// The marble masks either side of a piece (src/scene/masks.js), on the piece pages only (body
// .page--piece-*), and only where there is room beside the text column (a wide screen) and WebGL
// runs well; elsewhere the page is as it was. Made once the page's curtain has opened.
import { probeWebGL, prefersStatic } from '../util/env.js';

const MODEL = new URL('../../assets/models/masks.glb', import.meta.url).href;
const WIDE = '(min-width: 1180px)';
const pageTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** @param {{ reduced: boolean, opened: Promise<void>, onTheme: Function }} ctx  @returns {() => void} */
export function setupMasks({ reduced, opened, onTheme }) {
  if (![...document.body.classList].some((c) => c.startsWith('page--piece-'))) return () => {};
  const gl = probeWebGL();
  if (!gl.ok || prefersStatic(gl.renderer)) return () => {};
  const wide = matchMedia(WIDE);
  let masks = null;
  let gone = false;
  let making = null;
  const host = document.createElement('div');
  host.className = 'read-masks';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);

  const make = () => {
    making ??= Promise.all([opened, import('../scene/masks.js')])
      .then(async ([, mod]) => {
        const textColumn = parseFloat(getComputedStyle(document.body).getPropertyValue('--read-w')) || 680;
        const made = await mod.Masks.create(host, MODEL, { theme: pageTheme(), reduced, textColumn });
        if (gone) { made.dispose(); return; }
        masks = made;
        if (new URLSearchParams(location.search).has('debug')) window.__masks = masks;
      })
      .catch((err) => console.warn('masks:', err));
  };
  const fit = () => {
    host.hidden = !wide.matches;
    if (wide.matches) make();
  };
  fit();
  wide.addEventListener('change', fit);
  onTheme((theme) => masks?.setTheme(theme));
  return () => {
    gone = true;
    wide.removeEventListener('change', fit);
    masks?.dispose();
    host.remove();
  };
}

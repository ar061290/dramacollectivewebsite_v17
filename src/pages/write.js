// Apply to be a writer: the heading and its line, the marble writer statue standing under them, and
// beside them on wide screens the writer application, Fillout's form, loaded once the curtain has
// parted (src/site/fillout.js), with the publication's October cover tucked behind its top corner.
// The words and the statue stay in sight as the form scrolls by (a column taller than the screen
// under the top bar sticks by its foot instead, as on Become a sponsor).
// The statue is Meet our writers' (src/scene/writerStatue.js), made from the model whose pen is as
// tall as she is (assets/models/writer-statue-pen.glb, built by tools/writers/build-statue.mjs), in
// the same marble, with the October cover on the book in her hand. It leans a little after the
// pointer, and the cursor's glow is a small lamp the polished stone reflects; with reduced motion it
// stands still. It is made as its box nears the screen, and only where WebGL runs well and there is
// room for it (on phones its box is not shown, and the form follows the words); otherwise, and until
// it has drawn, the box shows its still picture. Its canvas is a stage a little larger than the box
// (wider, and reaching below it), the statue standing in the box, so that the warm light and the
// shadow on the floor round it fade out before the canvas's edge (write.css fades that edge too).
import { bootPage } from '../site/boot.js';
import { embedFillout } from '../site/fillout.js';
import { setupTicker } from '../publication/ticker.js';
import { probeWebGL, prefersStatic } from '../util/env.js';

const MODEL = {
  glb: new URL('../../assets/models/writer-statue-pen.glb', import.meta.url).href,
  json: new URL('../../assets/models/writer-statue-pen.json', import.meta.url).href,
};
const debug = new URLSearchParams(location.search).has('debug');
const pageTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

bootPage(({ reduced, onTheme, opened }) => {
  const cleanups = [];

  // the publication's banner along the bottom (its Become a writer goes to the form)
  cleanups.push(setupTicker({ reduced }));

  // the form
  const host = document.querySelector('[data-fillout-id]');
  cleanups.push(embedFillout(host, { opened, title: 'Apply to be a writer' }));

  // the column of the words and the statue stays whole in view: the CSS reads its height
  const side = document.querySelector('[data-stick]');
  if (side) {
    const ro = new ResizeObserver(() => side.style.setProperty('--stick-h', `${side.offsetHeight}px`));
    ro.observe(side);
    cleanups.push(() => ro.disconnect());
  }

  // the statue
  const box = document.querySelector('[data-write-statue]');
  const stage = box?.querySelector('.write-statue__stage');
  if (stage) cleanups.push(mountStatue(box, stage, { reduced, onTheme, opened }));

  return () => cleanups.forEach((c) => c());
});

/**
 * The live statue in its box (a .statue-slot), on the stage round the box, once the curtain has
 * parted and the box is near the screen. A box that is not shown (phones) is never near it, so there
 * nothing is fetched; widened to a tablet's or a laptop's width, the box shows and the statue is
 * made then.
 * @param {HTMLElement} box    the statue's box, with its still picture
 * @param {HTMLElement} stage  the canvas's box, round it
 * @returns {() => void} cleanup
 */
function mountStatue(box, stage, { reduced, onTheme, opened }) {
  let statue = null;
  let gone = false;
  const cleanups = [];

  const near = new Promise((resolve) => {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); resolve(); }
    }, { rootMargin: '50% 0px 50% 0px' });
    io.observe(box);
    cleanups.push(() => io.disconnect());
  });

  Promise.all([opened, near])
    .then(() => {
      if (gone) return null;
      const gl = probeWebGL();
      return gl.ok && !prefersStatic(gl.renderer) ? import('../scene/writerStatue.js') : null;
    })
    .then(async (mod) => {
      if (!mod || gone) return;
      const s = new mod.WriterStatue(stage, { model: MODEL, reduced, theme: pageTheme() });
      if (debug) window.__writeStatue = s;
      // the canvas fills the stage, and the statue stands in the whole of the box
      const fit = () => s.setSlot({ x: -stage.offsetLeft, y: -stage.offsetTop, w: box.clientWidth, h: box.clientHeight });
      fit();
      try {
        await s.load();
      } catch (err) {
        s.dispose();
        throw err;
      }
      if (gone) { s.dispose(); return; }
      // (the theme may have changed while it loaded)
      if (s.theme !== pageTheme()) s.setTheme(pageTheme(), { instant: true }); // changed while loading: else its first frame stands
      statue = s;
      box.classList.add('is-live');
      const ro = new ResizeObserver(fit);
      ro.observe(box);
      ro.observe(stage);
      // the lamp keeps to a still pointer as the page scrolls under it
      const onScroll = () => s.boxMoved();
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => { ro.disconnect(); window.removeEventListener('scroll', onScroll); });
    })
    .catch((err) => console.warn('The statue is unavailable; showing its still picture.', err));

  onTheme((theme, opts) => { if (!gone) statue?.setTheme(theme, opts); });

  return () => {
    gone = true;
    cleanups.forEach((c) => c());
    statue?.dispose();
    statue = null;
    box.classList.remove('is-live');
  };
}

// Flash plays, Workshops, Social outreach: coming soon. The house curtain is down
// (src/scene/curtain/CurtainStage.js, loaded only where WebGL runs well); before it has loaded, and
// wherever it does not run, the same set drawn in CSS (soon.css): the velvet, the pelmet and the
// marquee board, in the same place and the same light, so the page looks finished from the start.
// The live curtain then fades in over that still and its lamps come up. Both follow the theme:
// dark velvet in the dark theatre, a pale rose velvet with the house lights up.
import { bootPage } from '../site/boot.js';
import { probeWebGL, prefersStatic } from '../util/env.js';
import { currentTheme } from '../ui/theme.js';

const MARK = new URL('../../assets/brand/mark-gold.png', import.meta.url).href;

/** The canvas's fade over the still, as soon.css times it (ms). */
function fadeTime(el) {
  const d = getComputedStyle(el).transitionDuration.split(',')[0].trim();
  return (parseFloat(d) || 0) * (d.endsWith('ms') ? 1 : 1000);
}

bootPage(({ reduced, onTheme, opened }) => {
  const host = document.querySelector('[data-curtain]');
  if (!host) return undefined;
  const hint = document.querySelector('[data-curtain-hint]');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hint) hint.textContent = fine ? 'Drag across the curtain' : 'Swipe across the curtain';

  let stage = null;
  let gone = false;
  let settle = 0;
  // the curtain follows the theme switch (house lights up: the pale velvet in a lit house)
  onTheme((theme, opts) => stage?.setTheme(theme, opts));
  const gl = probeWebGL();
  if (gl.ok && !prefersStatic(gl.renderer)) {
    // after the page curtain has parted: three.js loading would make it stutter
    opened.then(() => import('../scene/curtain/CurtainStage.js'))
      .then(async ({ CurtainStage }) => {
        if (gone) return;
        stage = new CurtainStage(host, { variant: host.dataset.curtain, markUrl: MARK, reduced, theme: currentTheme() });
        if (new URLSearchParams(location.search).has('debug')) window.__stage = stage;
        await stage.load();
        if (gone) return;
        // the live curtain fades in over the still at the still's light, then its lamps come up;
        // once it covers the still, the still's sign is put away (pages.css: .is-live)
        const show = () => {
          host.classList.add('is-on');
          if (hint) hint.hidden = false;
          clearTimeout(settle);
          settle = setTimeout(() => { if (!gone && !stage.lost) host.classList.add('is-live'); }, fadeTime(stage.renderer.domElement) + 60);
        };
        show();
        stage.reveal();
        // the browser may take the curtain's WebGL context away while the page is open (its GPU
        // process crashed): the still velvet and its sign come back until it is given back
        stage.onLost = () => {
          clearTimeout(settle);
          host.classList.remove('is-on', 'is-live');
          if (hint) hint.hidden = true;
        };
        stage.onRestored = () => { if (!gone) show(); };
      })
      .catch((err) => {
        console.warn('Curtain unavailable; showing the still velvet.', err);
        host.classList.remove('is-on', 'is-live');
        stage?.dispose();
        stage = null;
        if (hint) hint.hidden = true;
      });
  } else if (hint) {
    hint.hidden = true;
  }

  return () => { gone = true; clearTimeout(settle); stage?.dispose(); };
});

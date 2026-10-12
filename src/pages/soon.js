// Flash plays, Workshops, Social outreach: coming soon. The house curtain is down
// (src/scene/curtain/CurtainStage.js, loaded only where WebGL runs well); without it, the same
// velvet in CSS with the sign set in type. Both follow the theme: dark velvet in the dark theatre,
// a pale rose velvet with the house lights up.
import { bootPage } from '../site/boot.js';
import { probeWebGL, prefersStatic } from '../util/env.js';
import { currentTheme } from '../ui/theme.js';

const MARK = new URL('../../assets/brand/mark-gold.png', import.meta.url).href;

bootPage(({ reduced, onTheme, opened }) => {
  const host = document.querySelector('[data-curtain]');
  if (!host) return undefined;
  const hint = document.querySelector('[data-curtain-hint]');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hint) hint.textContent = fine ? 'Drag across the curtain' : 'Swipe across the curtain';

  let stage = null;
  let gone = false;
  // the curtain follows the theme switch (house lights up: the pale velvet in a lit house)
  onTheme((theme) => stage?.setTheme(theme));
  const gl = probeWebGL();
  if (gl.ok && !prefersStatic(gl.renderer)) {
    // after the page curtain has parted: three.js loading would make it stutter
    opened.then(() => import('../scene/curtain/CurtainStage.js'))
      .then(async ({ CurtainStage }) => {
        if (gone) return;
        stage = new CurtainStage(host, { variant: host.dataset.curtain, markUrl: MARK, reduced, theme: currentTheme() });
        if (new URLSearchParams(location.search).has('debug')) window.__stage = stage;
        await stage.load();
        if (!gone) host.classList.add('is-live');
      })
      .catch((err) => {
        console.warn('Curtain unavailable; showing the still velvet.', err);
        stage?.dispose();
        stage = null;
        if (hint) hint.hidden = true;
      });
  } else if (hint) {
    hint.hidden = true;
  }

  return () => { gone = true; stage?.dispose(); };
});

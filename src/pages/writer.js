// A writer's own page (writer-<slug>.html, written by tools/pages/build.mjs from
// content/writers.json): their round profile picture and their name, then their pieces, the ones to
// come as the publication's list and the ones out as its grid, side by side (all of it in the page's
// own markup: nothing here draws them). Their photo and their name open the spotlight panel, Core
// team's (src/site/people.js): the photo travels into it, with their whole introduction and their
// pieces from the page's .writer-about (which only visitors without scripts see on the page);
// Escape, the close button or a click outside closes it, and the focus goes back to the name. The
// page holds the two columns in a phone's order (stacked, the pieces out first unless there are
// none); on a wide screen, where the ones to come stand on the left, they are put first in the page,
// so the keyboard and a screen reader go through them in the order they are seen. The rest is as on
// the reading pages (src/pages/reading.js): the top bar out of sight until it is wanted, the cursor's
// glow everywhere, the banner along the bottom.
import { bootPage } from '../site/boot.js';
import { setupTicker } from '../publication/ticker.js';
import { setupPeekBar } from '../publication/peekbar.js';
import { spotlightPanel } from '../site/people.js';

const WIDE = '(min-width: 1024px)'; // the columns side by side (src/styles/writers.css)

bootPage((ctx) => {
  document.documentElement.classList.add('is-glow-everywhere');
  const cleanups = [setupTicker(ctx), setupPeekBar(), setupPanel(ctx), orderColumns()];
  return () => cleanups.forEach((c) => c?.());
});

/** The spotlight panel, opened by the name (a button) or a click on the photo. @returns {() => void} cleanup */
function setupPanel({ reduced }) {
  const dialog = document.getElementById('spotlight');
  const name = document.querySelector('[data-writer-open]');
  const photo = document.querySelector('[data-writer-photo]');
  const about = document.querySelector('[data-writer-panel]');
  if (!dialog || !name || !photo || !about) return () => {};
  const nameEl = dialog.querySelector('[data-spotlight-name]');
  const roleEl = dialog.querySelector('[data-spotlight-role]');
  const introEl = dialog.querySelector('[data-spotlight-intro]');
  const undo = spotlightPanel(dialog, {
    cards: [name],
    reduced,
    photoOf: () => photo,
    fill: () => {
      nameEl.textContent = name.textContent;
      roleEl.textContent = about.dataset.role ?? 'Writer';
      introEl.replaceChildren(...[...about.children].map((el) => el.cloneNode(true)));
      return [roleEl, nameEl, ...introEl.children];
    },
  });
  // the photo is the name's twin for the pointer (the keyboard has the name): the panel opens from
  // the name, so the focus comes back to it
  const onPhoto = () => name.click();
  photo.addEventListener('click', onPhoto);
  // a link in the panel (one of their pieces) leaves through the curtain between pages
  // (src/site/transition.js), which the panel, drawn above everything in the top layer, would hide:
  // the panel goes first
  const onLink = (e) => {
    if (!e.target.closest('a[href]') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    dialog.close();
  };
  dialog.addEventListener('click', onLink);
  return () => {
    undo();
    photo.removeEventListener('click', onPhoto);
    dialog.removeEventListener('click', onLink);
  };
}

/**
 * The columns in the page in the order they are seen: the ones to come first on a screen wide enough
 * for them to stand side by side (WIDE, as src/styles/writers.css has it), where they are on the
 * left; else as the page holds them.
 * @returns {() => void} cleanup
 */
function orderColumns() {
  const cols = document.querySelector('.writer-cols');
  const up = cols?.querySelector(':scope > .writer-col--upcoming');
  const out = cols?.querySelector(':scope > .writer-col--out');
  if (!up || !out) return () => {};
  const wide = matchMedia(WIDE);
  const place = () => {
    if (wide.matches || cols.classList.contains('writer-cols--none-out')) cols.prepend(up);
    else cols.prepend(out);
  };
  place();
  wide.addEventListener('change', place);
  return () => wide.removeEventListener('change', place);
}

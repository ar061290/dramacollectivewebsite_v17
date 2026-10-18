// The leads' contact cards, on Contact us and on Become a sponsor (the list is written into both
// pages by tools/pages/build.mjs, between <!-- site:contacts --> markers): the follow-spot lights
// them, each leans toward the pointer, and "Copy address" puts the email on the clipboard and a
// spark goes off on the card.
import { followSpot } from '../site/spotlight.js';
import { tilt } from '../site/tilt.js';
import { loadLottie, freeze } from '../animations/lottie.js';

const LABEL = 'Copy address';

/**
 * @param {object} o
 * @param {boolean} o.reduced   reduced motion: no tilt, and the spark shows as a still
 * @returns {() => void}        cleanup
 */
export function setupContactCards({ reduced }) {
  const list = document.querySelector('.contact-cards');
  if (!list) return () => {};
  const cleanups = [];
  cleanups.push(followSpot(list, { reduced }).dispose);
  for (const card of list.querySelectorAll('.contact-card')) {
    cleanups.push(tilt(card, { reduced, max: 5 }));
    const button = card.querySelector('[data-copy]');
    if (!button) continue;
    let spark = null, alive = true, t = 0;
    loadLottie(card.querySelector('[data-spark]'), 'spark').then((a) => {
      if (alive) spark = a; else a?.destroy();
    });
    const onCopy = async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(button.dataset.copy); ok = true; } catch { /* no clipboard: select the address instead */ }
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents(card.querySelector('.contact-card__email'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
      button.textContent = ok ? 'Copied' : 'Selected';
      if (reduced) freeze(spark, 20); else spark?.goToAndPlay(0, true);
      clearTimeout(t);
      t = setTimeout(() => { button.textContent = LABEL; }, 1800);
    };
    button.addEventListener('click', onCopy);
    cleanups.push(() => {
      alive = false;
      clearTimeout(t);
      button.removeEventListener('click', onCopy);
      spark?.destroy();
    });
  }
  return () => cleanups.forEach((c) => c());
}

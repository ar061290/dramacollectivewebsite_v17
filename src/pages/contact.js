// Contact us: a card for each of the Collective's leads, lit by the follow-spot; "Copy address"
// puts the email on the clipboard and a spark goes off on the card.
import { bootPage } from '../site/boot.js';
import { followSpot } from '../site/spotlight.js';
import { tilt } from '../site/tilt.js';
import { loadLottie, freeze } from '../animations/lottie.js';

bootPage(({ reduced }) => {
  const cleanups = [];
  const list = document.querySelector('.contact-cards');
  if (!list) return undefined;
  cleanups.push(followSpot(list, { reduced }).dispose);
  const cards = [...list.querySelectorAll('.contact-card')];
  for (const card of cards) {
    cleanups.push(tilt(card, { reduced, max: 5 }));
    const button = card.querySelector('[data-copy]');
    let spark = null;
    loadLottie(card.querySelector('[data-spark]'), 'spark').then((a) => { spark = a; });
    const onCopy = async () => {
      const text = button.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch { /* no clipboard: select the address instead */ }
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents(card.querySelector('.contact-card__email'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
      button.textContent = ok ? 'Copied' : 'Selected';
      if (reduced) freeze(spark, 20); else spark?.goToAndPlay(0, true);
      clearTimeout(button._t);
      button._t = setTimeout(() => { button.textContent = 'Copy address'; }, 1800);
    };
    button.addEventListener('click', onCopy);
    cleanups.push(() => button.removeEventListener('click', onCopy));
  }
  return () => cleanups.forEach((c) => c());
});

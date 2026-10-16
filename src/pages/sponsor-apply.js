// Apply to be a sponsor, reached from Become a sponsor's "Apply to be a sponsor" buttons: the way
// back to the tiers, the sponsorship form (Fillout's, loaded once the curtain has parted:
// src/site/fillout.js) and, for questions, the President's and Executive President's cards, the
// same as on Contact us (src/sections/contactCards.js).
import { bootPage } from '../site/boot.js';
import { embedFillout } from '../site/fillout.js';
import { setupContactCards } from '../sections/contactCards.js';

bootPage(({ reduced, opened }) => {
  const cleanups = [
    embedFillout(document.querySelector('[data-fillout-id]'), { opened, title: 'Sponsorship form' }),
    setupContactCards({ reduced }),
  ];
  return () => cleanups.forEach((c) => c());
});

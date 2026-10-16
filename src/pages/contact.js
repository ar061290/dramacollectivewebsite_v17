// Contact us: a card for each of the Collective's leads, lit by the follow-spot; "Copy address"
// puts the email on the clipboard and a spark goes off on the card (src/sections/contactCards.js,
// shared with Apply to be a sponsor).
import { bootPage } from '../site/boot.js';
import { setupContactCards } from '../sections/contactCards.js';

bootPage(({ reduced }) => setupContactCards({ reduced }));

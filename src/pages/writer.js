// A writer's own page (writer-<slug>.html, written by tools/pages/build.mjs from
// content/writers.json): their photo, name and introduction, then the publication's pieces section
// for their pieces only (src/publication/pieces.js): the toggle between the published pieces, every
// one in the grid, and those to come, in a list that runs its whole length beside their photo (their
// introduction over it on hover or focus, src/styles/writers.css); the heading morphing between the
// two, and the filter by form. It opens on the published pieces if they have any. "Remind me" goes
// to the newsletter on the publication. The rest is as on the reading pages (src/pages/reading.js):
// the top bar out of sight until it is wanted, the cursor's glow everywhere, the banner along the
// bottom.
import { bootPage } from '../site/boot.js';
import { setupTicker } from '../publication/ticker.js';
import { setupPeekBar } from '../publication/peekbar.js';
import { setupPieces } from '../publication/pieces.js';
import { PIECES } from '../publication/pieces-data.js';

bootPage((ctx) => {
  document.documentElement.classList.add('is-glow-everywhere');
  const root = document.querySelector('[data-pub-pieces]');
  // their pieces, found by the name printed on them
  const pieces = PIECES.filter((p) => p.author === root?.dataset.author);
  const cleanups = [
    setupTicker(ctx),
    setupPeekBar(),
    setupPieces(ctx, {
      root,
      pieces,
      cap: null,
      list: 'full',
      beside: null,
      start: pieces.some((p) => p.status === 'latest') ? 'latest' : 'upcoming',
      remind: './publication.html#news',
    }),
  ];
  return () => cleanups.forEach((c) => c?.());
});

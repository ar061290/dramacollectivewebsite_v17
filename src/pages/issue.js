// An issue's own page (issue-<month>-<year>.html, written by tools/pages/build.mjs): its pieces round
// a spotlight (src/publication/issue.js), with the publication's banner along the bottom and the top
// bar waiting out of sight until it is wanted, as on the reading pages (src/pages/reading.js). No
// star sky; the cursor's glow is everywhere.
import { bootPage } from '../site/boot.js';
import { setupTicker } from '../publication/ticker.js';
import { setupPeekBar } from '../publication/peekbar.js';
import { setupIssue } from '../publication/issue.js';

bootPage((ctx) => {
  document.documentElement.classList.add('is-glow-everywhere');
  const cleanups = [setupTicker(ctx), setupPeekBar(), setupIssue(ctx)];
  return () => cleanups.forEach((c) => c());
});

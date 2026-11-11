// An issue's own page (issue-<month>-<year>.html, written by tools/pages/build.mjs): its pieces round
// a spotlight (src/publication/issue.js), with the publication's banner along the bottom and the top
// bar waiting out of sight until it is wanted, as on the reading pages (src/pages/reading.js); on a
// touch screen it is not brought down by a scroll back up while the stage is held past its first
// piece (it would cover the stage's way back and arrows; at the first piece, and below the stage,
// it comes as anywhere). No star sky; the cursor's glow is everywhere.
import { bootPage } from '../site/boot.js';
import { setupTicker } from '../publication/ticker.js';
import { setupPeekBar } from '../publication/peekbar.js';
import { setupIssue } from '../publication/issue.js';

bootPage((ctx) => {
  document.documentElement.classList.add('is-glow-everywhere');
  const section = document.querySelector('[data-iss]');
  const held = () => {
    const r = section?.getBoundingClientRect();
    return !!r && r.top < -innerHeight * 0.3 && r.bottom >= innerHeight - 1;
  };
  const cleanups = [setupTicker(ctx), setupPeekBar({ calm: held }), setupIssue(ctx)];
  return () => cleanups.forEach((c) => c());
});

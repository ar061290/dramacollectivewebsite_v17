// The Gallery (gallery.html, the events side by side, each a spiral of its pictures turned by the
// scroll: src/ui/spiral.js) and each event's own page (gallery-<key>.html, every picture), both
// written by tools/pages/build.mjs from content/gallery.json: the pictures opened whole in the
// lightbox, the clips playing while on screen and the film played when asked (src/ui/gallery.js). A
// film of our own plays only when asked too (its controls; preload="none", so nothing of it loads
// before).
import { bootPage } from '../site/boot.js';
import { setupBox, setupClips, setupDriveFilms } from '../ui/gallery.js';
import { setupSpirals } from '../ui/spiral.js';

bootPage((ctx) => {
  const cleanups = [setupBox(), setupClips(ctx), setupDriveFilms(), setupSpirals(ctx)];
  return () => cleanups.forEach((c) => c?.());
});

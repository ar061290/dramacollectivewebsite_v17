// lottie-web, light build (SVG renderer only, no expressions). Each file is under 50 KB. The player
// (about 46 KB compressed) is fetched the first time a Lottie is asked for, which is always after
// the page's curtain: it used to sit on every page's boot path, the deepest module of the graph.
let player = null; // the promise of lottie-web
const files = new Map(); // each file's JSON, fetched once per page (the sponsor page asks for the spark five times)

const FILES = {
  'scroll-cue': new URL('../../assets/lottie/scroll-cue.json', import.meta.url),
  'mask-mark': new URL('../../assets/lottie/mask-mark.json', import.meta.url),
  'cta-flourish': new URL('../../assets/lottie/cta-flourish.json', import.meta.url),
  spark: new URL('../../assets/lottie/spark.json', import.meta.url),
};

/** Load a named animation into `container`. Resolves the lottie AnimationItem (or null). */
export async function loadLottie(container, name, { loop = false, autoplay = false } = {}) {
  if (!container || !FILES[name]) return null;
  try {
    player ??= import('lottie-web/build/player/lottie_light.js').then((m) => m.default ?? m);
    if (!files.has(name)) files.set(name, fetch(FILES[name]).then((r) => r.json()));
    const [lottie, data] = await Promise.all([player, files.get(name)]);
    return lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop,
      autoplay,
      animationData: data,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
  } catch (err) {
    console.warn(`lottie ${name} failed`, err);
    return null;
  }
}

/** Stop an animation on a representative frame (reduced motion). */
export function freeze(anim, frame) {
  anim?.goToAndStop(frame ?? Math.floor(anim.totalFrames / 2), true);
}

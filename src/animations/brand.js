// The nav mark: the curtain rises on the mark once, and again on hover (every page).
import { loadLottie, freeze } from './lottie.js';

export async function setupBrandMark({ reduced }) {
  const host = document.querySelector('[data-lottie="mask-mark"]');
  const mark = await loadLottie(host, 'mask-mark');
  if (!mark) return () => {};
  host.querySelector('img')?.remove();
  if (reduced) freeze(mark, mark.totalFrames - 1);
  else mark.play();
  const replay = () => { if (!reduced) mark.goToAndPlay(0, true); };
  const brand = host.closest('a');
  brand.addEventListener('mouseenter', replay);
  return () => { brand.removeEventListener('mouseenter', replay); mark.destroy(); };
}

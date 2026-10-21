// The nav mark: the curtain rises on the mark once, and again on hover (every page). Played by the page's
// own Web Animations on the mark's picture, with the very curves of the Lottie it was
// (assets/lottie/mask-mark.json: one second at 60 frames; the picture fades up over its first half and
// rises 4 of its 96 units while a mask uncovers it from its foot, both over 0.7 s, all on one ease), so
// lottie-web (about 57 KB, and its start-up on the page's thread) is no longer fetched for it. The picture
// is the page's own 144-pixel mark, which the Lottie's 96-pixel copy used to replace.
// `when`: the reveal waits for it (an inner page: its curtain parting).
const EASE = 'cubic-bezier(0.36, 0, 0.22, 1)'; // the Lottie's keyframe tangents: out (0.36, 0), in (0.22, 1)

export async function setupBrandMark({ reduced, when = null }) {
  const host = document.querySelector('[data-lottie="mask-mark"]');
  const img = host?.querySelector('img');
  if (!img || reduced) return () => {}; // (reduced motion: the Lottie's last frame, the whole mark: the picture as it is)
  let shown = [];
  const play = () => {
    for (const a of shown) a.cancel();
    shown = [
      img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: EASE }),
      // the mask moves with the picture (it was the layer's own): a clip on the picture, under its rise
      img.animate(
        [{ transform: 'translateY(4.1667%)', clipPath: 'inset(100% 0 0 0)' }, { transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)' }],
        { duration: 700, easing: EASE },
      ),
    ];
  };
  await when;
  if (!img.isConnected) return () => {};
  play();
  const brand = host.closest('a');
  brand?.addEventListener('mouseenter', play);
  return () => { brand?.removeEventListener('mouseenter', play); for (const a of shown) a.cancel(); };
}

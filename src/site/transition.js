// The curtain between pages. Following a link to another page of the site closes the two velvet
// halves (.veil, written into every page by tools/pages/build.mjs), then loads the page in the
// same tab; that page starts with the curtain closed (the head script reads the flag left here)
// and parts it once it is ready. Links that leave the site, open a new tab, or jump within the
// page are left alone. Reduced motion: plain navigation, no curtain.
import gsap from 'gsap';

const FLAG = 'dc-veil';

export function setupTransitions({ reduced }) {
  const root = document.documentElement;
  const halves = [...document.querySelectorAll('.veil__half')];
  if (halves.length !== 2) return { open: () => Promise.resolve(), dispose: () => {} };
  const away = (i) => (i === 0 ? -101 : 101);
  let leaving = false;

  // GSAP owns the transform from here on: closed (0) or open (±101%)
  const veiled = root.classList.contains('is-veiled');
  gsap.set(halves, { x: 0, xPercent: veiled ? 0 : away });
  root.classList.remove('is-veiled');
  if (veiled) gsap.set('.veil', { pointerEvents: 'auto' });

  /** Part the curtain (called by the page once it is ready to be seen). */
  const open = () => new Promise((resolve) => {
    if (!veiled || reduced) {
      gsap.set(halves, { xPercent: away });
      gsap.set('.veil', { pointerEvents: 'none' });
      resolve();
      return;
    }
    gsap.to(halves, {
      xPercent: away,
      duration: 0.7,
      ease: 'curtain',
      onComplete: () => { gsap.set('.veil', { pointerEvents: 'none' }); resolve(); },
    });
  });

  const internal = (a) => {
    if (!a || a.hasAttribute('download')) return null;
    if (a.target && a.target !== '_self') return null;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return null;
    if (url.pathname === location.pathname) return null; // the same page: its own anchors, or a reload
    if (!/(\.html|\/)$/.test(url.pathname)) return null;
    return url;
  };

  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = internal(e.target.closest?.('a[href]'));
    if (!url) return;
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    if (reduced) { location.href = url.href; return; }
    try { sessionStorage.setItem(FLAG, '1'); } catch { /* no storage: the next page simply appears */ }
    gsap.set('.veil', { pointerEvents: 'auto' });
    gsap.to(halves, {
      xPercent: 0,
      duration: 0.5,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => { location.href = url.href; },
    });
  };

  // back/forward from the cache brings the page back as it was left: curtain closed
  const onShow = (e) => {
    if (!e.persisted) return;
    leaving = false;
    try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
    gsap.to(halves, { xPercent: away, duration: reduced ? 0 : 0.6, ease: 'curtain', overwrite: true });
    gsap.set('.veil', { pointerEvents: 'none' });
  };

  document.addEventListener('click', onClick);
  window.addEventListener('pageshow', onShow);
  return {
    open,
    dispose: () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('pageshow', onShow);
    },
  };
}

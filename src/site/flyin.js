// Apply now and Become a sponsor live in the top bar; a page that has its own Apply now or Become a
// sponsor button marks it [data-fly="apply"] or [data-fly="sponsor"]. That button waits, unseen but
// keeping its place, until it comes into view; then the bar's own button flies down to it (a copy of
// it, travelling on a gentle arc and taking on the page's button's size and type on the way), the
// page's button comes up under it as it lands, and the bar's button stays away while it is there.
// When the spot leaves the view, the button flies back up into the bar.
// Where the bar does not show that button (Apply now below 761 px, both below 561 px), or with
// reduced motion, the page's button simply fades in.
import gsap from 'gsap';

const SOURCE = { apply: '.topbar__apply', sponsor: '.topbar__cta' };
const FLIGHT = 0.82; // seconds, each way

const box = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** A button's type and padding, which the copy takes on from one end of its flight to the other. */
const look = (el) => {
  const s = getComputedStyle(el);
  return {
    font: parseFloat(s.fontSize) || 12,
    tracking: parseFloat(s.letterSpacing) || 0,
    padX: parseFloat(s.paddingLeft) || 0,
  };
};

/** Whether the bar shows this button just now (not hidden at this width, nor faded at the page's end). */
const showing = (el) => {
  if (!el || !el.getClientRects().length) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.5;
};

const lerp = (a, b, p) => a + (b - a) * p;
const smooth = (e0, e1, x) => { const t = gsap.utils.clamp(0, 1, (x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
// the page's end of a flight: the copy and the page's button cross over there, over this stretch
const LAND = [0.8, 1], LIFT = [0, 0.2];

export function setupFlyIn({ reduced }) {
  const spots = [...document.querySelectorAll('[data-fly]')].filter((el) => SOURCE[el.dataset.fly]);
  const bar = document.querySelector('[data-topbar]');
  if (!spots.length) return () => {};

  // one record for each of the two buttons: the spot it has flown to (`owner`), and the copy in
  // flight with where it is now, if any
  const kinds = {};
  for (const key of Object.keys(SOURCE)) kinds[key] = { src: bar?.querySelector(SOURCE[key]) ?? null, owner: null, clone: null, tween: null, now: null };

  const show = (spot, on, fade = true) => {
    gsap.to(spot, { opacity: on ? 1 : 0, duration: fade ? (on ? 0.45 : 0.25) : 0, ease: 'power1.out', overwrite: 'auto' });
    spot.style.pointerEvents = on ? '' : 'none';
  };

  // the copy keeps the bar button's own classes, so its colours are the bar button's, in either theme
  const makeClone = (src) => {
    const c = src.cloneNode(true);
    for (const a of ['id', 'href', 'aria-current', 'data-topbar-keep']) c.removeAttribute(a);
    c.classList.remove('topbar__apply', 'topbar__cta', 'is-away');
    c.classList.add('fly-clone');
    c.setAttribute('aria-hidden', 'true');
    c.tabIndex = -1;
    document.body.append(c);
    return c;
  };

  /**
   * Fly the copy from `from` to `to` (each a function giving a box, read every frame so a page that
   * scrolls meanwhile is followed), its type and padding turning from one look into the other and
   * its opacity given by `fade(p)`.
   */
  const fly = (k, { from, fromLook, to, toLook, fade, onProgress, onDone }) => {
    k.tween?.kill();
    k.clone ??= makeClone(k.src);
    const c = k.clone;
    const state = { p: 0 };
    const draw = () => {
      const p = state.p;
      const a = from(), b = to();
      // centres, on a quadratic arc that falls first and then glides across into place (and rises
      // first on the way back): its bend sits over the start, at the height of the end
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const cx = lerp(ax, bx, 0.15), cy = lerp(ay, by, 0.85);
      const q = 1 - p;
      const x = q * q * ax + 2 * q * p * cx + p * p * bx;
      const y = q * q * ay + 2 * q * p * cy + p * p * by;
      const w = lerp(a.w, b.w, p), h = lerp(a.h, b.h, p);
      const lift = 1 + 0.05 * Math.sin(Math.PI * p); // held up a little in the air
      const now = {
        box: { x: x - w / 2, y: y - h / 2, w, h },
        look: { font: lerp(fromLook.font, toLook.font, p), tracking: lerp(fromLook.tracking, toLook.tracking, p), padX: lerp(fromLook.padX, toLook.padX, p) },
        opacity: fade(p),
      };
      k.now = now;
      Object.assign(c.style, {
        width: `${w}px`,
        height: `${h}px`,
        opacity: String(now.opacity),
        transform: `translate(${now.box.x}px, ${now.box.y}px) scale(${lift})`,
        fontSize: `${now.look.font}px`,
        letterSpacing: `${now.look.tracking}px`,
        paddingLeft: `${now.look.padX}px`,
        paddingRight: `${now.look.padX}px`,
      });
      onProgress?.(p);
    };
    draw();
    k.tween = gsap.to(state, {
      p: 1,
      duration: FLIGHT,
      ease: 'power2.inOut',
      onUpdate: draw,
      onComplete: () => {
        k.tween = null;
        k.clone?.remove();
        k.clone = null;
        k.now = null;
        onDone?.();
      },
    });
  };

  // where a flight starts: the copy where it is now (turned back mid-flight), or the button itself
  const startFrom = (k, el, opacity) => {
    if (k.clone && k.now) {
      const held = k.now;
      return { from: () => held.box, fromLook: held.look, opacity: held.opacity };
    }
    return { from: () => box(el), fromLook: look(el), opacity };
  };

  const arrive = (spot) => {
    const k = kinds[spot.dataset.fly];
    // (a copy already in flight, on its way back to the bar, can turn round and come here instead)
    if (reduced || k.owner || (!showing(k.src) && !k.clone)) {
      show(spot, true, true);
      return;
    }
    k.owner = spot;
    // a button the keyboard has already reached stays where it is, with no flight to it; the bar's
    // button steps away all the same (and a copy on its way home is dropped), so the two are never
    // seen together, and it flies back to the bar when the spot leaves the view
    if (spot === document.activeElement) {
      k.tween?.kill();
      k.tween = null;
      k.clone?.remove();
      k.clone = null;
      k.now = null;
      k.src.classList.add('is-away');
      show(spot, true, false);
      return;
    }
    const { opacity: o0, ...start } = startFrom(k, k.src, 1);
    k.src.classList.add('is-away');
    gsap.killTweensOf(spot);
    spot.style.pointerEvents = 'none';
    fly(k, {
      ...start,
      to: () => box(spot),
      toLook: look(spot),
      // the copy is whole on its way, and hands over to the page's button as it lands
      fade: (p) => lerp(o0, 1, smooth(...LIFT, p)) * (1 - smooth(...LAND, p)),
      onProgress: (p) => gsap.set(spot, { opacity: smooth(...LAND, p) }),
      onDone: () => show(spot, true, false),
    });
  };

  const leave = (spot) => {
    const k = kinds[spot.dataset.fly];
    if (k.owner !== spot) { show(spot, false, true); return; }
    k.owner = null;
    const home = () => k.src.classList.remove('is-away');
    // the bar no longer shows its button here (the window narrowed meanwhile): nothing to fly to
    if (reduced || !k.src || getComputedStyle(k.src).display === 'none') {
      k.tween?.kill();
      k.clone?.remove();
      k.clone = null;
      k.now = null;
      show(spot, false, true);
      home();
      return;
    }
    // the page's button hands over to the copy as it lifts off, and the copy flies home
    const { opacity: o0, ...start } = startFrom(k, spot, 0);
    const s0 = Number(gsap.getProperty(spot, 'opacity')) || 0;
    gsap.killTweensOf(spot);
    spot.style.pointerEvents = 'none';
    fly(k, {
      ...start,
      to: () => box(k.src),
      toLook: look(k.src),
      fade: (p) => lerp(o0, 1, smooth(...LIFT, p)),
      onProgress: (p) => gsap.set(spot, { opacity: s0 * (1 - smooth(...LIFT, p)) }),
      onDone: home,
    });
  };

  // in view: (all but a hair of it) inside the screen below the bar and a little above the bottom
  // edge; out of view: wholly outside it. Between the two nothing changes, so a button at the edge
  // does not flicker. (Not a ratio of exactly 1: with fractional pixels it may never quite get there.)
  const barH = bar?.offsetHeight ?? 64;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const spot = e.target;
      if (e.intersectionRatio >= 0.97 && !spot._flyIn) { spot._flyIn = true; spot._byFocus = false; arrive(spot); }
      else if (!e.isIntersecting && spot._flyIn) { spot._flyIn = false; leave(spot); }
    }
  }, { rootMargin: `-${barH}px 0px -8% 0px`, threshold: [0, 0.97] });

  // reached from the keyboard before it is in view (a button at the screen's edge, which the browser
  // need not scroll): show it at once, and the bar's button steps away as it would on arrival, so the
  // two are never seen together; if focus leaves before the spot has come into view, all goes back
  const onFocus = (e) => {
    const spot = e.currentTarget;
    if (spot._flyIn) return;
    const k = kinds[spot.dataset.fly];
    gsap.killTweensOf(spot);
    gsap.set(spot, { opacity: 1 });
    spot.style.pointerEvents = '';
    if (!reduced && k && !k.owner && showing(k.src)) {
      k.tween?.kill();
      k.tween = null;
      k.clone?.remove();
      k.clone = null;
      k.now = null;
      k.owner = spot;
      k.src.classList.add('is-away');
      spot._byFocus = true;
    }
  };
  const onBlur = (e) => {
    const spot = e.currentTarget;
    if (!spot._byFocus) return;
    spot._byFocus = false;
    if (spot._flyIn) return; // it has come into view meanwhile: it leaves the usual way
    const k = kinds[spot.dataset.fly];
    if (k?.owner === spot) { k.owner = null; k.src?.classList.remove('is-away'); }
    show(spot, false, true);
  };
  for (const spot of spots) {
    spot._flyIn = false;
    gsap.set(spot, { opacity: 0 });
    spot.style.pointerEvents = 'none';
    spot.addEventListener('focus', onFocus);
    spot.addEventListener('blur', onBlur);
    io.observe(spot);
  }

  return () => {
    io.disconnect();
    for (const k of Object.values(kinds)) {
      k.tween?.kill();
      k.clone?.remove();
      k.src?.classList.remove('is-away');
    }
    for (const spot of spots) {
      spot.removeEventListener('focus', onFocus);
      spot.removeEventListener('blur', onBlur);
      delete spot._byFocus;
      gsap.killTweensOf(spot);
      spot.style.opacity = '';
      spot.style.pointerEvents = '';
      delete spot._flyIn;
    }
  };
}

// Dark (the theatre, default) and light (house lights up) themes. The choice is set on <html> as
// data-theme before first paint by the inline script in index.html, and remembered per browser.
// Colours come from the theme roles in tokens.css; the canvases are told when the theme changes.
//
// The switch spreads from the button: the new theme is revealed inside a circle that widens from the
// button's centre until it reaches the farthest corner of the screen, a ring of gold with star glints
// on its edge and ripples trailing inside it, as from a drop in water (src/ui/themeRing.js). Where
// the browser has view transitions, the page is pictured as it was and as it now is, and the new
// picture is uncovered through the circle (CSS in components.css); elsewhere the colours cross-fade
// as before while the ring passes over. With reduced motion the theme simply changes.
//
// A switch made by the visitor (a click on the button, or a key on it) also brings the new theme's
// earring down out of the button (`onSwitch`: src/ui/earrings.js); the first sync of the page does
// not. Inside a view transition it is called as the new page is pictured, so the earring's canvas
// is part of the new picture.

import { readToken } from '../util/env.js';
import { themeRing } from './themeRing.js';

export const THEME_KEY = 'dc-theme';

export const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** The star field's colours for the current theme, read from the tokens. */
export const skyTheme = () => ({
  color: readToken('--star'),
  glow: readToken('--star-glow'),
  additive: currentTheme() === 'dark',
});

// the circle and its ring, as one: long enough to see the ripples, short enough not to wait on
const DURATION = 1000; // ms
const EASE = 'cubic-bezier(.4, .1, .25, 1)';

/** The current theme's colours for the ring. */
const ringColours = () => ({
  rule: readToken('--rule-color'),
  star: readToken('--star'),
  glow: readToken('--star-glow'),
  bg: readToken('--bg'),
  dark: currentTheme() === 'dark',
});

export function setupTheme({ reduced, onChange, onSwitch }) {
  const root = document.documentElement;
  const button = document.querySelector('[data-theme-toggle]');
  const meta = document.querySelector('meta[name="theme-color"]');
  let fadeTimer = 0;
  let ring = null;
  let latest = null; // the view transition under way, if any

  const sync = () => {
    const light = currentTheme() === 'light';
    button?.setAttribute('aria-pressed', String(light));
    if (meta) meta.content = readToken('--bg');
  };

  // `instant`: the canvases take the new look at once rather than easing into it (main.js, boot.js)
  const apply = (theme, instant) => {
    root.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: the choice lasts this visit */ }
    sync();
    onChange?.(theme, { instant });
  };

  // the circle's centre (the button's, wherever the bar has put it) and the radius that reaches the
  // farthest corner of the screen from there
  const circle = () => {
    const r = button?.getBoundingClientRect();
    const x = r?.width ? r.left + r.width / 2 : innerWidth - 40;
    const y = r?.width ? r.top + r.height / 2 : 32;
    return { x, y, radius: Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) };
  };

  // the visitor's switch, told on (never let it stop the switch itself)
  const switched = (theme) => {
    try { onSwitch?.(theme); } catch (err) { console.warn(err); }
  };

  const set = (theme) => {
    ring?.stop();
    ring = null;
    if (reduced) { apply(theme, true); switched(theme); return; }
    const { x, y, radius } = circle();
    const from = ringColours();

    if (typeof document.startViewTransition !== 'function') {
      // no view transitions: colours cross-fade for one beat, then normal transitions resume; the
      // ring still spreads over the page, timed by an animation of its own with the same curve
      root.classList.add('theme-fade');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 700);
      apply(theme, false);
      switched(theme);
      const made = themeRing({ x, y, radius, from, to: ringColours() });
      const clock = made.canvas.animate([{ opacity: 1 }, { opacity: 1 }], { duration: DURATION, easing: EASE });
      made.run(() => clock.effect?.getComputedTiming().progress ?? null);
      ring = made;
      return;
    }

    let made = null;
    root.classList.add('is-theming');
    const vt = document.startViewTransition(() => {
      // the new page must be pictured exactly as it will stay: no colour easing into it, and the
      // canvases already in their new look (the snap is lifted once the picture is taken)
      root.classList.add('theme-snap');
      apply(theme, true);
      switched(theme);
      made = themeRing({ x, y, radius, from, to: ringColours() });
      ring = made;
    });
    vt.ready.then(() => {
      root.classList.remove('theme-snap');
      const clip = root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: DURATION, easing: EASE, pseudoElement: '::view-transition-new(root)' },
      );
      made?.run(() => clip.effect?.getComputedTiming().progress ?? null);
    }).catch(() => { /* skipped (another switch began): its end below tidies up */ });
    latest = vt;
    const end = () => {
      made?.stop();
      if (ring === made) ring = null;
      // a switch made again mid-way (by key, or by a second click: onPictureClick below) skips this
      // one: the classes are the new one's to lift
      if (latest === vt) root.classList.remove('is-theming', 'theme-snap');
    };
    vt.finished.then(end, end);
  };

  const onClick = () => set(currentTheme() === 'light' ? 'dark' : 'light');

  // While the circle spreads, what shows is the view transition's pictures of the page, not the page,
  // and the browser gives every click on them to <html>, whatever lay under the pointer (in Chrome,
  // letting pointer events through the pictures does not help: the page under them is not
  // hit-tested). So such a click ends the reveal at once and is then passed on to what it was meant
  // for: a second click on the toggle switches back, and a link or a button works as ever, not dead
  // for a second.
  const onPictureClick = (e) => {
    const vt = latest;
    if (e.target !== root || !vt || !root.classList.contains('is-theming')) return;
    e.stopImmediatePropagation(); // it is passed on below, as itself, so is not to be handled as it is
    vt.skipTransition();
    const passOn = () => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === root) return;
      el.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, composed: true, view: window, detail: e.detail,
        screenX: e.screenX, screenY: e.screenY, clientX: e.clientX, clientY: e.clientY,
        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
        button: e.button, buttons: e.buttons,
      }));
    };
    vt.finished.then(passOn, passOn);
  };

  button?.addEventListener('click', onClick);
  document.addEventListener('click', onPictureClick, true);
  sync();

  return () => {
    clearTimeout(fadeTimer);
    ring?.stop();
    root.classList.remove('theme-fade', 'is-theming', 'theme-snap');
    button?.removeEventListener('click', onClick);
    document.removeEventListener('click', onPictureClick, true);
  };
}

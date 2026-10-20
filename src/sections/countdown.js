// The countdown to the production (the production page's event card and the home page's second
// act): days, hours, minutes and seconds to the date in data-countdown, each digit rolling up as it
// changes. Markup: <dl data-countdown="ISO date"> with <dd data-unit="days|hours|minutes|seconds">.
import gsap from 'gsap';

// The roll is a Web Animation of a registered custom property, the transform following it: on the
// page's thread, as GSAP's tween was (a Web Animation of the transform itself would run on the
// compositor, and while one runs Chrome gives the page fewer frames, so the scroll's own scenes would
// be drawn less often), but not a GSAP tween: GSAP's ticker woke for every roll and ticked on long
// after it, and every frame loop that waits for GSAP to stand still (the home stage's, in the act
// beside the countdown) never rested while the countdown was in sight. The same ease, GSAP's
// power2.inOut (the cubic: (2p)^3 / 2, then its mirror), as CSS linear() steps, 81 of them, within
// 0.03% of the roll. Where the browser cannot (no registered properties or no linear()), GSAP, as before.
const EASE = 'linear(' + Array.from({ length: 81 }, (_, i) => {
  const p = i / 80;
  const v = p < 0.5 ? (p * 2) ** 3 / 2 : 1 - ((1 - p) * 2) ** 3 / 2;
  return `${+v.toFixed(6)} ${+(p * 100).toFixed(4)}%`;
}).join(', ') + ')';
// as GSAP wrote it while its tween ran (yPercent, and its 3D nudge while moving)
const SHIFT = 'translate(0%, calc(var(--count-roll) * 1%)) translate3d(0px, 0px, 0px)';
const NATIVE = (() => {
  if (!window.CSS?.registerProperty || !CSS.supports('animation-timing-function', 'linear(0, 1)')) return false;
  try {
    CSS.registerProperty({ name: '--count-roll', syntax: '<number>', inherits: false, initialValue: '0' });
  } catch (err) {
    if (err?.name !== 'InvalidModificationError') return false; // (registered already: by another countdown)
  }
  return true;
})();

/** Roll one digit's span from `from` to `to` (% of its height), then `done`. */
const roll = (span, from, to, done) => {
  span.style.transform = SHIFT;
  span.animate([{ '--count-roll': String(from) }, { '--count-roll': String(to) }], { duration: 450, easing: EASE, fill: 'forwards' }).onfinish = done;
};

export function setupCountdown(el, reduced) {
  const target = new Date(el.dataset.countdown).getTime();
  const units = Object.fromEntries([...el.querySelectorAll('[data-unit]')].map((dd) => [dd.dataset.unit, dd]));
  const shown = {};
  let timer = 0;
  let seen = true; // the card on the screen: off it, the digits need no roll (and no timer)

  // one span per digit; a changed digit rolls up and the new one rises in under it
  const write = (unit, text) => {
    const dd = units[unit];
    if (!dd) return;
    const prev = shown[unit] ?? '';
    if (prev.length !== text.length) {
      dd.replaceChildren(...[...text].map((c) => {
        const d = document.createElement('span');
        d.className = 'count__digit';
        d.append(Object.assign(document.createElement('span'), { textContent: c }));
        return d;
      }));
    } else {
      [...text].forEach((c, i) => {
        if (c === prev[i]) return;
        const box = dd.children[i];
        // a roll still under way (or a tab that was in the background) is finished at once
        if (NATIVE) for (const s of box.children) for (const a of s.getAnimations()) a.cancel();
        else gsap.killTweensOf(box.children);
        while (box.children.length > 1) box.firstElementChild.remove();
        const old = box.firstElementChild;
        if (NATIVE) old.removeAttribute('style'); else gsap.set(old, { clearProps: 'all' });
        // while it rolls out, the old digit is not read: the unit reads as its new value only
        old.setAttribute('aria-hidden', 'true');
        const next = Object.assign(document.createElement('span'), { textContent: c });
        if (reduced || document.hidden || !seen) { box.replaceChildren(next); return; }
        if (NATIVE) {
          next.style.cssText = 'position: absolute; left: 0px; top: 0px;';
          box.append(next);
          roll(old, 0, -100, () => old.remove());
          roll(next, 100, 0, () => next.removeAttribute('style'));
          return;
        }
        gsap.set(next, { position: 'absolute', left: 0, top: 0, yPercent: 100 });
        box.append(next);
        gsap.to(old, { yPercent: -100, duration: 0.45, ease: 'power2.inOut', onComplete: () => old.remove() });
        gsap.to(next, { yPercent: 0, duration: 0.45, ease: 'power2.inOut', onComplete: () => gsap.set(next, { clearProps: 'all' }) });
      });
    }
    shown[unit] = text;
  };

  const tick = () => {
    const left = Math.max(0, target - Date.now());
    const s = Math.floor(left / 1000);
    write('days', String(Math.floor(s / 86400)).padStart(2, '0'));
    write('hours', String(Math.floor((s % 86400) / 3600)).padStart(2, '0'));
    write('minutes', String(Math.floor((s % 3600) / 60)).padStart(2, '0'));
    write('seconds', String(s % 60).padStart(2, '0'));
    if (left > 0 && seen) timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  };
  const io = new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    clearTimeout(timer);
    if (seen) tick(); // back on the screen: right at once, then the seconds again
  });
  io.observe(el);
  tick();
  return () => { clearTimeout(timer); io.disconnect(); };
}

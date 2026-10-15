// The countdown to the production (the production page's event card and the home page's second
// act): days, hours, minutes and seconds to the date in data-countdown, each digit rolling up as it
// changes. Markup: <dl data-countdown="ISO date"> with <dd data-unit="days|hours|minutes|seconds">.
import gsap from 'gsap';

export function setupCountdown(el, reduced) {
  const target = new Date(el.dataset.countdown).getTime();
  const units = Object.fromEntries([...el.querySelectorAll('[data-unit]')].map((dd) => [dd.dataset.unit, dd]));
  const shown = {};
  let timer = 0;

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
        gsap.killTweensOf(box.children);
        while (box.children.length > 1) box.firstElementChild.remove();
        const old = box.firstElementChild;
        gsap.set(old, { clearProps: 'all' });
        // while it rolls out, the old digit is not read: the unit reads as its new value only
        old.setAttribute('aria-hidden', 'true');
        const next = Object.assign(document.createElement('span'), { textContent: c });
        if (reduced || document.hidden) { box.replaceChildren(next); return; }
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
    if (left > 0) timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  };
  tick();
  return () => clearTimeout(timer);
}

// Become a sponsor: three tiers as tickets. Pointing at a ticket shows its metal on the medallion;
// choosing one (click, tap, or the arrow keys: they are radio buttons) turns the medallion to it
// with a full turn, and a spark goes off on the ticket. Below, what the support pays for lights up
// under the spot.
import { bootPage } from '../site/boot.js';
import { followSpot, falloff } from '../site/spotlight.js';
import { loadLottie, freeze } from '../animations/lottie.js';
import { probeWebGL, prefersStatic } from '../util/env.js';

const MARK_SVG = new URL('../../assets/brand/mark.svg', import.meta.url).href;
// the still medallion (no WebGL): the mark masked over a gradient in the tier's metal
const STILL = {
  stone: ['#a49f93', '#6d6759'],
  bronze: ['#e0a878', '#8a5634'],
  silver: ['#f1f3f5', '#9aa0a8'],
  gold: ['#f3e7b8', '#a98f38'],
};

bootPage(({ reduced }) => {
  const cleanups = [];
  const host = document.querySelector('[data-medallion]');
  const tickets = [...document.querySelectorAll('.ticket')];
  let medallion = null;
  let chosen = 'stone';

  const still = (name) => {
    const [hi, lo] = STILL[name] ?? STILL.stone;
    host?.style.setProperty('--metal-hi', hi);
    host?.style.setProperty('--metal-lo', lo);
  };
  const show = (name, opts) => { if (medallion) medallion.setFinish(name, opts); else still(name); };
  still('stone');

  const gl = probeWebGL();
  if (host && gl.ok && !prefersStatic(gl.renderer)) {
    import('../scene/medallion.js').then(async ({ Medallion }) => {
      const m = new Medallion(host, { reduced });
      if (new URLSearchParams(location.search).has('debug')) window.__stage = m;
      await m.load(MARK_SVG);
      medallion = m;
      host.classList.add('is-live');
      if (chosen !== 'stone') m.setFinish(chosen, { turn: false });
      cleanups.push(() => m.dispose());
    }).catch((err) => console.warn('Medallion unavailable; showing the still mark.', err));
  } else if (host) {
    host.querySelector('[data-medallion-caption]')?.setAttribute('hidden', '');
  }
  if (host) {
    const caption = host.querySelector('[data-medallion-caption]');
    if (caption && !matchMedia('(hover: hover) and (pointer: fine)').matches) caption.textContent = 'Swipe to turn';
  }

  // the tickets
  const sparks = new Map();
  for (const t of tickets) {
    loadLottie(t.querySelector('[data-spark]'), 'spark').then((a) => { if (a) sparks.set(t, a); });
  }
  const onChange = (e) => {
    const t = e.target.closest('.ticket');
    chosen = t.dataset.tier;
    show(chosen, { turn: true });
    const s = sparks.get(t);
    if (reduced) freeze(s, 20); else s?.goToAndPlay(0, true);
  };
  // the whole ticket chooses, not only its stub (the stub is the radio's label)
  const onTicketClick = (e) => {
    const t = e.currentTarget;
    if (e.target.closest('label, input, a')) return;
    const input = t.querySelector('input');
    if (!input.checked) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
    input.focus({ preventScroll: true });
  };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onEnter = (e) => { if (fine) show(e.currentTarget.dataset.tier, { turn: false }); };
  const onLeave = () => { if (fine) show(chosen, { turn: false }); };
  for (const t of tickets) {
    t.querySelector('input').addEventListener('change', onChange);
    t.addEventListener('click', onTicketClick);
    t.addEventListener('pointerenter', onEnter);
    t.addEventListener('pointerleave', onLeave);
  }
  cleanups.push(() => {
    for (const t of tickets) {
      t.querySelector('input').removeEventListener('change', onChange);
      t.removeEventListener('click', onTicketClick);
      t.removeEventListener('pointerenter', onEnter);
      t.removeEventListener('pointerleave', onLeave);
    }
    sparks.forEach((a) => a.destroy());
  });

  // what the support pays for: each line takes light from the spot
  const funds = document.querySelector('[data-funds]');
  if (funds) {
    const items = [...funds.querySelectorAll('li')];
    let boxes = [];
    const measure = () => {
      const f = funds.getBoundingClientRect();
      boxes = items.map((li) => { const r = li.getBoundingClientRect(); return { li, x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2, w: r.width / 2 }; });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(funds);
    const spot = followSpot(funds, {
      reduced,
      onMove: (x, y, a) => boxes.forEach((b) => b.li.style.setProperty('--lit', (falloff(Math.max(0, Math.abs(x - b.x) - b.w), y - b.y, 90) * a).toFixed(3))),
    });
    cleanups.push(() => { ro.disconnect(); spot.dispose(); });
  }

  return () => cleanups.forEach((c) => c());
});

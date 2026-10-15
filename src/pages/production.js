// The production: five stage lights, one for each part the students do. Tap (or click) to switch
// them on; the beams turn toward the pointer or the finger like moving heads; when all five are
// on, "Entirely by students." lights and a spark goes off. Below, the event card counts down to
// the date, and the stage planner's doorway lights up as the pointer nears it.
import gsap from 'gsap';
import { bootPage } from '../site/boot.js';
import { loadLottie, freeze } from '../animations/lottie.js';
import { setupCountdown } from '../sections/countdown.js';

bootPage(({ reduced }) => {
  const cleanups = [];
  const act = document.querySelector('[data-lamps]');
  if (act) cleanups.push(setupLamps(act, reduced));
  const count = document.querySelector('[data-countdown]');
  if (count) cleanups.push(setupCountdown(count, reduced));
  setupFlourish(reduced).then((c) => cleanups.push(c));
  const door = document.querySelector('[data-planner-door]');
  if (door) cleanups.push(setupDoor(door, reduced));
  return () => cleanups.forEach((c) => c());
});

/** The stage planner's doorway: the light inside follows the pointer and brightens as it nears. */
function setupDoor(door, reduced) {
  if (reduced) { door.style.setProperty('--near', '0.6'); return () => {}; }
  let raf = 0, at = null;
  const paint = () => {
    raf = 0;
    const r = door.getBoundingClientRect();
    const dx = Math.max(r.left - at.x, 0, at.x - r.right), dy = Math.max(r.top - at.y, 0, at.y - r.bottom);
    door.style.setProperty('--near', Math.exp(-(dx * dx + dy * dy) / (260 * 260)).toFixed(3));
    door.style.setProperty('--gx', `${at.x - r.left}px`);
    door.style.setProperty('--gy', `${at.y - r.top}px`);
  };
  const onMove = (e) => { at = { x: e.clientX, y: e.clientY }; if (!raf) raf = requestAnimationFrame(paint); };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
}

function setupLamps(act, reduced) {
  const lamps = [...act.querySelectorAll('.lamp')];
  const hint = act.querySelector('[data-lamps-hint]');
  let spark = null;
  loadLottie(act.querySelector('[data-lottie="spark"]'), 'spark').then((a) => { spark = a; });

  const onPress = (e) => {
    const lamp = e.currentTarget;
    const on = lamp.getAttribute('aria-pressed') !== 'true';
    lamp.setAttribute('aria-pressed', String(on));
    if (hint) gsap.to(hint, { autoAlpha: 0, duration: reduced ? 0 : 0.3 });
    const full = lamps.every((l) => l.getAttribute('aria-pressed') === 'true');
    if (full && !act.classList.contains('is-full')) {
      if (reduced) freeze(spark, 20); else spark?.goToAndPlay(0, true);
    }
    act.classList.toggle('is-full', full);
  };
  lamps.forEach((l) => l.addEventListener('click', onPress));

  // aim: each beam turns a little toward the pointer, the nearer lamps more
  const aims = lamps.map((l) => ({ l, v: 0, q: null }));
  if (!reduced) {
    for (const a of aims) {
      a.q = gsap.quickTo(a, 'v', { duration: 0.6, ease: 'power3.out', onUpdate: () => a.l.style.setProperty('--aim', `${a.v.toFixed(2)}deg`) });
    }
  }
  const aimAt = (x, y) => {
    for (const a of aims) {
      const r = a.l.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const dy = Math.max(80, y - r.top);
      a.q?.(Math.max(-16, Math.min(16, (Math.atan2(cx - x, dy) * 180) / Math.PI * 0.5)));
    }
  };
  const onMove = (e) => aimAt(e.clientX, e.clientY);
  const onLeave = () => aims.forEach((a) => a.q?.(0));
  act.addEventListener('pointermove', onMove, { passive: true });
  act.addEventListener('pointerdown', onMove, { passive: true });
  act.addEventListener('pointerleave', onLeave);

  return () => {
    lamps.forEach((l) => l.removeEventListener('click', onPress));
    act.removeEventListener('pointermove', onMove);
    act.removeEventListener('pointerdown', onMove);
    act.removeEventListener('pointerleave', onLeave);
    spark?.destroy();
  };
}

// the gold rule draws under the button, then a small star
async function setupFlourish(reduced) {
  const host = document.querySelector('[data-lottie="cta-flourish"]');
  const anim = await loadLottie(host, 'cta-flourish');
  const button = document.querySelector('[data-cta]');
  if (!anim || !button) return () => {};
  const on = () => { if (reduced) freeze(anim, anim.totalFrames - 1); else { anim.setDirection(1); anim.play(); } };
  const off = () => { if (reduced) freeze(anim, 0); else { anim.setDirection(-1); anim.play(); } };
  button.addEventListener('mouseenter', on);
  button.addEventListener('focus', on);
  button.addEventListener('mouseleave', off);
  button.addEventListener('blur', off);
  return () => {
    button.removeEventListener('mouseenter', on);
    button.removeEventListener('focus', on);
    button.removeEventListener('mouseleave', off);
    button.removeEventListener('blur', off);
    anim.destroy();
  };
}

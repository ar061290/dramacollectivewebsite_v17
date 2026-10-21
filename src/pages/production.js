// The production: five stage lights, one for each part the students do. Tap (or click) to switch
// them on; the beams turn toward the pointer or the finger like moving heads, and the lamp above
// it lights its word; as the page scrolls the lamps hold still for a while (where the screen has
// room for them) and the scroll does the same, walking from left to right; when all five are on,
// "Entirely by students." lights and a spark goes off. Below, the event card counts down to the date, and the stage planner's doorway
// lights up as the pointer nears it.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
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
  const frame = act.querySelector('[data-lamps-frame]') ?? act;
  const run = act.querySelector('[data-lamps-run]');
  const lamps = [...act.querySelectorAll('.lamp')];
  const hint = act.querySelector('[data-lamps-hint]');
  const isOn = (l) => l.getAttribute('aria-pressed') === 'true';

  // reduced motion: no hold and no walk; the five lamps are simply lit (and can still be switched)
  if (reduced) {
    lamps.forEach((l) => l.setAttribute('aria-pressed', 'true'));
    act.classList.add('is-full');
    if (hint) gsap.set(hint, { autoAlpha: 0 });
  }
  let spark = null;
  loadLottie(act.querySelector('[data-lottie="spark"]'), 'spark').then((a) => {
    spark = a;
    if (reduced && act.classList.contains('is-full')) freeze(spark, 20);
  });

  const onPress = (e) => {
    const lamp = e.currentTarget;
    lamp.setAttribute('aria-pressed', String(!isOn(lamp)));
    if (hint) gsap.to(hint, { autoAlpha: 0, duration: reduced ? 0 : 0.3 });
    const full = lamps.every(isOn);
    if (full && !act.classList.contains('is-full')) {
      if (reduced) freeze(spark, 20); else spark?.goToAndPlay(0, true);
    }
    act.classList.toggle('is-full', full);
  };
  lamps.forEach((l) => l.addEventListener('click', onPress));

  // aim: each beam turns a little toward the pointer, the nearer lamps more (the head 0.7 of the beam's
  // turn). Written on the two that turn: as a custom property on the lamp it restyled the whole lamp,
  // button, word and all, every frame of the scroll's walk (half the page's style work there)
  const aims = lamps.map((l) => ({ l, head: l.querySelector('.lamp__head'), beam: l.querySelector('.lamp__beam'), v: 0, s: '0.00', q: null }));
  if (!reduced) {
    for (const a of aims) {
      a.q = gsap.quickTo(a, 'v', {
        duration: 0.6,
        ease: 'power3.out',
        onUpdate: () => {
          const s = a.v.toFixed(2);
          if (s === a.s) return;
          a.s = s;
          if (a.head) a.head.style.rotate = `calc(${s}deg * .7)`;
          if (a.beam) a.beam.style.rotate = `${s}deg`;
        },
      });
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
  const rest = () => aims.forEach((a) => a.q?.(0));

  // The scroll's own pointer. Once the lamps reach the middle of the screen they hold there (CSS
  // sticky, over .lamps-run) and the scroll walks a point along them from left to right, aiming
  // the beams and lighting the lamp above it just as the real pointer does (.is-aimed stands in
  // for :hover). It sends no pointer events, so the cursor's star and the sky's constellations
  // stay with the real pointer. Touch screens get it too.
  let walk = null, aimed = -1;
  let moved = { x: NaN, y: NaN, at: -Infinity, touch: false }; // the real pointer's last move
  const light = (i) => {
    if (i === aimed) return;
    aimed = i;
    lamps.forEach((l, k) => l.classList.toggle('is-aimed', k === i));
  };
  // .is-swept: the scroll has the light, so a still mouse resting on a lamp does not light it too
  const unsweep = () => { act.classList.remove('is-swept'); light(-1); };
  const walkTo = (p) => {
    act.classList.add('is-swept');
    const first = lamps[0].getBoundingClientRect();
    const x = first.left + (lamps[lamps.length - 1].getBoundingClientRect().right - first.left) * p;
    const word = lamps[0].querySelector('.lamp__word')?.getBoundingClientRect() ?? first;
    aimAt(x, word.top + word.height / 2);
    let near = 0, best = Infinity;
    lamps.forEach((l, k) => {
      const r = l.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      if (d < best) { best = d; near = k; }
    });
    light(near);
  };
  // a mouse that moved in the last moment keeps the light; a finger gives it back as soon as the
  // page scrolls (its swipe is the scroll)
  const pointerLeads = () => !moved.touch && performance.now() - moved.at < 400;

  let ro = null, onRefreshInit = null;
  // the lamps are held and the scroll has the light to walk (not on a screen too short for the hold)
  const held = (t = walk) => !!t?.isActive && !act.classList.contains('no-hold');
  // (the hold itself is CSS: production.css gives the run its room, except with reduced motion)
  if (!reduced && run?.offsetHeight && lamps.length) {
    // The frame's height, so the CSS can hold it in the middle of the screen; and whether it fits
    // there at all. Where it sticks (its top, below the bar) plus its height must be on screen, or
    // there is no hold (.no-hold, production.css). Says whether that changed.
    const measure = () => {
      act.style.setProperty('--lamps-frame-h', `${frame.offsetHeight}px`);
      const was = act.classList.contains('no-hold');
      const top = parseFloat(getComputedStyle(frame).top) || 0;
      act.classList.toggle('no-hold', top + frame.offsetHeight > window.innerHeight);
      return act.classList.contains('no-hold') !== was;
    };
    measure();
    walk = ScrollTrigger.create({
      trigger: act,
      // where the frame sticks: the hold starts the moment it does
      start: () => `top ${parseFloat(getComputedStyle(frame).top) || 0}px`,
      end: () => `+=${run.offsetHeight}`,
      invalidateOnRefresh: true,
      onUpdate: (self) => { if (held(self) && !pointerLeads()) walkTo(self.progress); },
      onToggle: (self) => { if (!self.isActive && act.classList.contains('is-swept')) { unsweep(); rest(); } },
    });
    // a window made shorter or taller (or a phone turned) can make room for the hold or take it away:
    // decided again before every refresh, ahead of the measuring
    onRefreshInit = () => { measure(); };
    ScrollTrigger.addEventListener('refreshInit', onRefreshInit);
    // the run coming or going moves everything below it, so then every trigger is measured again
    ro = new ResizeObserver(() => { if (measure()) ScrollTrigger.refresh(); else walk.refresh(); });
    ro.observe(frame);
  }

  // the real pointer (or finger) over the lamps takes the light while it moves
  const onMove = (e) => {
    // a still pointer can be sent a move as the page scrolls under it: only a real move counts
    if (e.type === 'pointermove' && e.clientX === moved.x && e.clientY === moved.y) return;
    moved = { x: e.clientX, y: e.clientY, at: performance.now(), touch: e.pointerType === 'touch' };
    unsweep();
    aimAt(e.clientX, e.clientY);
  };
  // when it leaves, the light goes back to the scroll while the lamps are held, else to rest
  const onLeave = () => {
    moved.at = -Infinity;
    if (held()) walkTo(walk.progress); else rest();
  };
  frame.addEventListener('pointermove', onMove, { passive: true });
  frame.addEventListener('pointerdown', onMove, { passive: true });
  frame.addEventListener('pointerleave', onLeave);

  return () => {
    lamps.forEach((l) => l.removeEventListener('click', onPress));
    frame.removeEventListener('pointermove', onMove);
    frame.removeEventListener('pointerdown', onMove);
    frame.removeEventListener('pointerleave', onLeave);
    walk?.kill();
    ro?.disconnect();
    if (onRefreshInit) ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    act.classList.remove('is-swept', 'no-hold');
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

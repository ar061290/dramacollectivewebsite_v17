// Act four, what we do: the Collective's five pillars as prompt cards on two gold rings, the kind a
// stage manager keeps a running order on. The act is held on screen for a stretch of scroll
// ([data-hold], src/styles/layout.css) and the scroll turns the cards, one after another, resting on
// each; a tap, a name, a key or a drag turns them too, and moves the page to the same place, so the
// scroll and the cards always agree. Drag the stack sideways and the front card turns over
// the rings like a page, its edge travelling as far as the hand does; it goes edge-on, drops to the
// back, and the next card comes out of its shadow. A flick riffles through up to three; a tap on a
// card brings up the next; the running order under the stack (or the arrow keys) goes straight to
// any card.
//
// One number is the whole state: p, how far the deck has been turned. Card i sits mod(i - p, n)
// places from the front, so dragging, throwing, tapping and the keys all move p, and render() poses
// every card from it alone. A card swaps from the front of the stack to the back only when it is
// edge-on, where it cannot be seen, so the order never visibly pops.
//
// Vertical swipes always scroll the page: the stack is touch-action: pan-y, and a press only becomes
// a turn once it has gone further sideways than down (the statue's test, src/scene/interaction.js).
// Reduced motion: nothing follows the hand; a swipe or a tap turns one card, at once.
// Without JS the cards are a plain list. The stacked layout keys on html.has-js, which the head script
// sets before first paint, so nothing moves when this runs (src/styles/pillars.css).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin.js';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const DEG = 180 / Math.PI;
const PERSPECTIVE = 2600; // px: .pillars__slot's perspective in pillars.css (the swing's maths needs it)
const LEAN = 3; // degrees: the most the stack leans toward the mouse
const CARRY = 0.3; // s: a throw carries on for the release speed times this, then lands on a card
const REACH = 440; // px: the card width the carry is measured in (a desktop card)
const NUDGE = 0.16; // of a turn: how far the front card lifts on its first showing (about 30 degrees)
// tall enough to hold act four on screen while the scroll turns its cards (layout.css, scenes.js)
export const HOLD_QUERY = '(min-height: 600px)';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * The turning card's angle (degrees toward the viewer) when it has gone v of the way round
 * (0 flat on the stack ... 1 edge-on), chosen so that its free edge has moved v of the card's
 * width: the edge goes as far as the hand. q is the perspective over the card's width.
 * Seen flat that angle is acos(1 - v); in perspective the near edge looks further out, so the exact
 * angle is larger. The exact one starts at 2 atan(1/q) rather than 0, so the two are blended over the
 * first third of the turn: the edge then runs a few pixels wide at the very start (it lifts toward
 * you) and is exact from there on.
 */
function swing(v, q) {
  const flat = Math.acos(1 - v);
  const x = 1 - v;
  const exact = Math.atan2(x, q) + Math.acos((x * q) / Math.hypot(q, x));
  return (flat + (exact - flat) * smooth(0, 0.35, v)) * DEG;
}

export function setupPillars({ reduced = false, sky = null } = {}) {
  const root = document.querySelector('[data-pillars]');
  const hand = root?.querySelector('[data-pillars-hand]');
  const list = hand?.querySelector('ol');
  const slots = root ? [...root.querySelectorAll('.pillars__slot')] : [];
  if (!root || !hand || !list || slots.length < 2) return () => {};
  const n = slots.length;
  const cards = slots.map((s) => s.querySelector('.pillars__card'));
  const links = cards.map((c) => c.querySelector('.pillars__link'));
  const names = cards.map((c) => c.querySelector('.pillars__name')?.textContent.trim() ?? '');
  const order = root.querySelector('[data-pillars-order]');
  const buttons = order ? [...order.querySelectorAll('button')] : [];
  // each card's name in the running order (matched by aria-controls, so their order cannot drift)
  const named = cards.map((c, i) => buttons.find((b) => b.getAttribute('aria-controls') === c.id) ?? buttons[i] ?? null);
  const hint = root.querySelector('.pillars__hint');
  const html = document.documentElement;
  const wrap = (a) => ((a % n) + n) % n;
  // held on screen and turned by the scroll (where the screen is tall enough to hold the act: the
  // same query as the layout's and the stage's): the cards then run in order, first to last, no
  // wrapping. On a shorter screen the act scrolls by as the others do and the deck wraps.
  const holdEl = root.closest('[data-hold]');
  const tall = matchMedia(HOLD_QUERY);
  const heldIn = () => !!holdEl && tall.matches;
  const limit = (a) => (heldIn() ? clamp(Math.round(a), 0, n - 1) : wrap(a));
  // the sky is passed in where it exists; otherwise the home page's handle on it (main.js)
  const theSky = () => sky ?? window.dramaCollective?.sky ?? null;

  // ---- what this adds to the page, so the cleanup can take it all back ----
  const made = [];
  const add = (tag, className, parent, attrs = {}) => {
    const el = document.createElement(tag);
    el.className = className;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.append(el);
    made.push(el);
    return el;
  };
  const saved = [];
  const keep = (el, name) => { if (el) saved.push([el, name, el.getAttribute(name)]); };
  links.forEach((a) => keep(a, 'tabindex'));
  buttons.forEach((b) => { keep(b, 'tabindex'); keep(b, 'aria-current'); });
  keep(order, 'aria-describedby');

  // the two rings the cards turn on, and on each card the side light and the shade it turns into
  const rings = ['a', 'b'].map((k) => add('span', `pillars__ring pillars__ring--${k}`, hand, { 'aria-hidden': 'true' }));
  const lights = cards.map((c) => add('span', 'pillars__light', c, { 'aria-hidden': 'true' }));
  const shades = cards.map((c) => {
    const s = add('span', 'pillars__shade', c, { 'aria-hidden': 'true' });
    s.append(document.createElement('span'));
    return s;
  });
  const glint = order ? add('span', 'pillars__glint', order, { 'aria-hidden': 'true' }) : null;
  // what a screen reader hears about the stack, and what it is told when a card comes up
  const helpId = document.getElementById('pillars-help') ? `pillars-help-${Math.random().toString(36).slice(2, 7)}` : 'pillars-help';
  const help = add('p', 'sr-only', root, { id: helpId });
  help.textContent = `${n} cards held on rings, one in front. ${heldIn() ? 'Scrolling turns them in order; ' : ''}choose a name in the running order to bring its card to the front; the left and right arrow keys also turn them.`;
  // read before the cards and with the names it explains
  root.prepend(help);
  order?.setAttribute('aria-describedby', helpId);
  const status = add('p', 'sr-only', root, { 'aria-live': 'polite' });

  // ---- the pose of every card, from p ----
  const state = { p: 0 };
  let W = 1; // px: one card's width, which is also one card's worth of drag
  let q = PERSPECTIVE;
  let off = { x: 3, y: 4 }; // px: how far each card behind sits from the one in front of it
  gsap.set(cards, { transformOrigin: '0% 50%' });
  const set = {
    rot: cards.map((c) => gsap.quickSetter(c, 'rotationY', 'deg')),
    x: slots.map((s) => gsap.quickSetter(s, 'x', 'px')),
    y: slots.map((s) => gsap.quickSetter(s, 'y', 'px')),
    shade: shades.map((s) => gsap.quickSetter(s, 'opacity')),
    light: lights.map((l) => gsap.quickSetter(l, 'opacity')),
  };
  // a card's face: the cards are a little see-through (the sky shows through the one in front), so a
  // card behind shows only its edges, its face coming up as the card above it turns away (CSS --face)
  const faces = [], solids = [];
  const face = (i, v) => { const r = Math.round(v * 100) / 100; if (faces[i] !== r) { faces[i] = r; cards[i].style.setProperty('--face', r); } };
  // a card on its way over the rings turns solid at once (--solid), so the face coming up beneath it
  // is never read through it
  const solid = (i, v) => { const r = Math.round(v * 100) / 100; if (solids[i] !== r) { solids[i] = r; cards[i].style.setProperty('--solid', r); } };
  const zs = [];
  const z = (i, v) => { if (zs[i] !== v) { zs[i] = v; slots[i].style.zIndex = v; } };

  function render() {
    for (let i = 0; i < n; i++) {
      const t = wrap(i - state.p); // places from the front: 0 front ... n - 1 at the back
      if (t > n - 1) {
        // on the rings: the card going over (p rising) or the one coming back (p falling)
        const v = n - t;
        set.rot[i](-swing(v, q));
        set.x[i](0);
        set.y[i](0);
        z(i, 100);
        set.shade[i](0.8 * v ** 1.5); // it darkens as it turns away from the light
        set.light[i](1 - v);
        face(i, 1);
        solid(i, Math.min(1, v * 5));
      } else {
        set.rot[i](0);
        set.x[i](t * off.x);
        set.y[i](t * off.y);
        z(i, 50 - Math.round(t * 10));
        // the next card comes up out of shade (none at rest, so nothing dims as a turn starts); those
        // behind are only edges
        set.shade[i](t < 1 ? 0.45 * t * Math.min(1, (1 - t) / 0.2) : 0);
        set.light[i](Math.max(0, 1 - t)); // only the front card is in the light
        face(i, Math.max(0, 1 - t));
        solid(i, 0);
      }
    }
  }

  // ---- which card is in front: the running order and the tab stops change as a turn starts (so
  // the answer is immediate), the card's own marks once it has landed ----
  let front = 0; // the card that has landed in front
  let aim = 0; // the card the deck is turning to (the same as front at rest)
  const placeGlint = (i, instant) => {
    const b = named[i];
    if (!glint || !b) return;
    gsap.to(glint, {
      x: b.offsetLeft,
      y: b.offsetTop + b.offsetHeight - 7,
      scaleX: b.offsetWidth,
      duration: instant || reduced ? 0 : 0.42,
      ease: 'curtain',
      overwrite: true,
    });
  };
  const markOrder = (i, instant = false) => {
    // every name stays a tab stop (the arrow keys are an extra); only the current one is marked
    named.forEach((b, j) => {
      if (!b) return;
      if (j === i) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    links.forEach((a, j) => { if (a) a.tabIndex = j === i ? 0 : -1; });
    placeGlint(i, instant);
  };
  const markFront = (i, say) => {
    front = i;
    slots.forEach((s, j) => s.classList.toggle('is-front', j === i));
    if (say) status.textContent = names[i];
  };

  // will-change only while something moves, so the text is drawn sharp again at rest
  let moving = false;
  const busy = (on) => {
    if (moving === on) return;
    moving = on;
    root.classList.toggle('is-turning', on);
  };
  // while a hand is on the stack: no constellations drawn along the drag, and the cursor's star turns
  let holding = false;
  const hold = (on) => {
    if (holding === on) return;
    holding = on;
    html.classList.toggle('is-turning-deck', on);
    const s = theSky();
    if (s) s.suspended = on;
  };

  // the hint under the running order goes once a card has been turned; it keeps its room
  let hinted = false;
  const hideHint = () => {
    if (hinted || !hint) return;
    hinted = true;
    gsap.killTweensOf(hint);
    gsap.to(hint, { opacity: 0, duration: reduced ? 0 : 0.3, ease: 'curtain' });
  };

  let tween = null;
  const settle = (say) => {
    tween = null;
    state.p = wrap(Math.round(state.p));
    render();
    const i = state.p;
    const changed = i !== front;
    aim = i;
    markOrder(i);
    // a press on a card's link (a drag that started there) focused it: focus goes with the front card
    const f = document.activeElement;
    if (links.includes(f) && f !== links[i]) links[i]?.focus({ preventScroll: true });
    markFront(i, say && changed);
    busy(false);
    if (changed) {
      hideHint();
      // the link arrives a beat after its card, as if cued
      if (!reduced && links[i]) gsap.fromTo(links[i], { y: 6 }, { y: 0, duration: 0.3, ease: 'curtain', clearProps: 'transform' });
    }
  };

  // the first showing; any input before it has finished jumps it to its end
  let intro = null;
  let fade = null;
  const finishIntro = () => {
    for (const t of [intro, fade]) {
      if (!t) continue;
      t.scrollTrigger?.kill();
      t.progress(1);
    }
    intro = fade = null;
  };

  /** Bring card i to the front, the shortest way round (forward when it is two either way). */
  const turnTo = (i, { say = false } = {}) => {
    finishIntro();
    i = limit(i);
    let k = heldIn() ? i - state.p : wrap(i - state.p);
    if (!heldIn() && k > n / 2) k -= n;
    aim = i;
    markOrder(i);
    gsap.killTweensOf(state);
    // one card on the house curve; a riffle of two speeds up through the middle and settles
    const steps = Math.max(1, Math.round(Math.abs(k)));
    const duration = Math.min(0.7, 0.42 + 0.14 * (steps - 1));
    scrollToCard(i, duration);
    if (Math.abs(k) < 1e-3) { settle(say); return; }
    const to = state.p + k;
    if (reduced) { state.p = to; settle(say); return; }
    busy(true);
    tween = gsap.to(state, {
      p: to,
      duration,
      ease: steps > 1 ? 'power2.inOut' : 'curtain',
      onUpdate: render,
      onComplete: () => settle(say),
    });
  };

  // ---- the scroll: while the act is held, its progress turns the cards ----
  // Card i rests at progress i / (n - 1); between two, the turn takes the middle three-fifths of the
  // way and the cards rest for the rest. A turn made any other way scrolls the page to its card
  // (`steering`, while the scroll it starts is not the visitor's own).
  let drive = null;
  let steering = false;
  let steer = null; // the steering scroll now running: only its own end may clear `steering`
  const scrollToCard = (i, duration) => {
    if (!drive) return;
    const y = drive.start + (clamp(i, 0, n - 1) / (n - 1)) * (drive.end - drive.start);
    if (Math.abs(window.scrollY - y) < 1) return;
    // it ends however it ends: arriving, overwritten by another scroll (onInterrupt), or taken over
    // by the visitor's own scroll (autoKill, after which the cards follow wherever that scroll is)
    const end = (resync) => () => {
      if (steer !== t) return;
      steer = null;
      steering = false;
      if (resync && drive) follow(drive.progress);
    };
    const t = gsap.to(window, {
      scrollTo: { y, autoKill: true, onAutoKill: () => end(true)() },
      duration: reduced ? 0 : duration,
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: () => end(false)(),
      onInterrupt: () => end(false)(),
    });
    steer = t;
    steering = true;
  };
  const follow = (x) => {
    if (steering || press?.mode === 'turn') return;
    if (x > 0.001) finishIntro();
    const u = clamp(x, 0, 1) * (n - 1);
    const k = Math.min(n - 2, Math.floor(u));
    const to = reduced ? Math.round(u) : k + smooth(0.2, 0.8, u - k);
    const i = Math.round(to);
    if (i !== aim) { aim = i; markOrder(i); }
    if (Math.abs(to - state.p) < 1e-4) return;
    busy(true);
    tween = gsap.to(state, {
      p: to,
      duration: reduced ? 0 : 0.3,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: render,
      onComplete: () => {
        tween = null;
        if (Math.abs(to - i) < 1e-4) settle(i !== front);
        else busy(false);
      },
    });
  };

  // ---- the hand on the stack ----
  let press = null; // { id, x0, y0, x, mode, p0, base, samples }
  let lastTurn = -1e9; // when the last drag let go: the click that follows it is not a tap

  const speed = (samples) => {
    const last = samples[samples.length - 1];
    if (!last || performance.now() - last.t > 80) return 0; // the hand had stopped before letting go
    const first = samples.find((s) => last.t - s.t <= 100) ?? last;
    const dt = (last.t - first.t) / 1000;
    return dt > 0.008 ? (last.x - first.x) / dt : 0;
  };

  const begin = () => {
    finishIntro();
    gsap.killTweensOf(state); // a turn already going carries on from where it is, in the hand
    tween = null;
    press.mode = 'turn';
    press.p0 = state.p;
    press.base = Math.round(state.p);
    busy(true);
    hold(true);
    lean.rest();
  };

  const onMove = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.mode === 'pass') return;
    const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
    if (!press.mode) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) begin();
      else if (Math.abs(dy) > 8) { press.mode = 'pass'; return; } // a scroll, not a turn (and not a tap)
      else return;
    }
    const now = performance.now();
    press.x = e.clientX;
    press.samples.push({ x: e.clientX, t: now });
    while (press.samples.length > 2 && now - press.samples[0].t > 150) press.samples.shift();
    if (reduced) return;
    state.p = press.p0 - dx / W; // straight from the hand: no easing while it is held
    if (heldIn()) state.p = clamp(state.p, 0, n - 1); // held, the deck has a first card and a last
    render();
  };

  const release = () => {
    const p = press;
    press = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', release);
    if (!p?.mode) return;
    lastTurn = performance.now();
    if (p.mode !== 'turn') return;
    hold(false);
    if (reduced) {
      busy(false);
      const dx = p.x - p.x0;
      if (Math.abs(dx) > 40) turnTo(aim + (dx < 0 ? 1 : -1), { say: true });
      return;
    }
    // where the throw would carry it, landed on a whole card: a fifth of a card from where it was
    // picked up is enough to turn it; a hard flick turns up to three; less springs back
    const v = -speed(p.samples); // px per second, + toward the next card
    const vc = v / W; // the same in cards per second
    // the carry is measured against a desktop card, so a riffle takes the same flick of the hand on
    // a phone's narrower cards as on a wide screen
    const moved = state.p + (v * CARRY) / Math.max(W, REACH) - p.base;
    const step = Math.abs(moved) < 0.2 ? 0 : Math.sign(moved) * clamp(Math.round(Math.abs(moved)), 1, 3);
    const to = heldIn() ? clamp(p.base + step, 0, n - 1) : p.base + step;
    const d = to - state.p;
    if (Math.abs(d) < 1e-3) { settle(true); scrollToCard(to, 0.3); return; }
    aim = wrap(to);
    markOrder(aim); // the running order answers at once, as it does for a tap or a key
    // carried on by the throw: power3.out starts at 3d/duration, so the duration that matches the
    // hand's speed leaves no seam at the moment of letting go. Otherwise it settles on the house curve.
    const carried = Math.sign(d) === Math.sign(vc) && Math.abs(vc) > 0.4;
    const duration = carried ? clamp((3 * Math.abs(d)) / Math.abs(vc), 0.3, 0.8) : clamp(0.3 + 0.2 * Math.abs(d), 0.3, 0.5);
    scrollToCard(to, duration);
    tween = gsap.to(state, {
      p: to,
      duration,
      ease: carried ? 'power3.out' : 'curtain',
      onUpdate: render,
      onComplete: () => settle(true),
    });
  };
  const onUp = (e) => { if (press && e.pointerId === press.id) release(); };

  const onDown = (e) => {
    if (press || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, mode: null, p0: 0, base: 0, samples: [] };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('blur', release);
  };

  // a click that ends a drag is swallowed before anything else sees it (a link, or the page curtain
  // in src/site/transition.js); a tap on a card that is not on its link turns to the next card
  const onClickCapture = (e) => {
    if (press?.mode === 'turn' || performance.now() - lastTurn < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onClick = (e) => {
    if (e.defaultPrevented || e.target.closest('a') || !e.target.closest('.pillars__slot')) return;
    // held, the last card's tap carries on down the page, past the act
    if (drive && aim >= n - 1) {
      if (steering) return; // still on its way to the last card
      gsap.to(window, { scrollTo: { y: drive.end + innerHeight * 0.6, autoKill: true }, duration: reduced ? 0 : 0.8, ease: 'power2.inOut', overwrite: true });
      return;
    }
    turnTo(aim + 1, { say: true });
  };
  const onDragStart = (e) => e.preventDefault(); // never the browser's own drag of a link

  hand.addEventListener('pointerdown', onDown);
  hand.addEventListener('click', onClickCapture, true);
  hand.addEventListener('click', onClick);
  hand.addEventListener('dragstart', onDragStart);

  // ---- keys: on a name in the running order, or on the front card's link ----
  const onKey = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const onName = named.indexOf(e.target) > -1;
    const onLink = links.indexOf(e.target) > -1;
    if (!onName && !onLink) return;
    const keys = { ArrowRight: aim + 1, ArrowLeft: aim - 1 };
    if (onName) Object.assign(keys, { Home: 0, End: n - 1 });
    const to = keys[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const i = limit(to);
    turnTo(i);
    (onName ? named[i] : links[i])?.focus({ preventScroll: true });
  };
  // focus that reaches a card behind (a screen reader's, or a script's) brings that card forward first
  const onFocus = (e) => {
    finishIntro();
    const i = links.indexOf(e.target);
    if (i > -1 && i !== aim) turnTo(i);
  };
  const onPick = (e) => {
    const i = named.indexOf(e.currentTarget);
    if (i > -1) turnTo(i, { say: true });
  };
  root.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocus);
  buttons.forEach((b) => b.addEventListener('click', onPick));

  // ---- the stack leans a little toward the mouse (fine pointers only, never while it is held) ----
  const lean = (() => {
    if (reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return { rest() {}, dispose() {} };
    const rx = gsap.quickTo(hand, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(hand, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    const rest = () => { rx(0); ry(0); };
    const onLean = (e) => {
      if (e.pointerType !== 'mouse' || press?.mode) return;
      const r = hand.getBoundingClientRect();
      ry(clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2 * LEAN);
      rx(-clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2 * LEAN);
    };
    const onLeave = (e) => { if (e.pointerType === 'mouse') rest(); };
    hand.addEventListener('pointermove', onLean, { passive: true });
    hand.addEventListener('pointerleave', onLeave);
    return {
      rest,
      dispose() {
        hand.removeEventListener('pointermove', onLean);
        hand.removeEventListener('pointerleave', onLeave);
      },
    };
  })();

  // ---- sizes: a card's width is a turn's worth of drag; the glint follows its name ----
  const measure = () => {
    W = Math.max(1, cards[0].offsetWidth);
    q = PERSPECTIVE / W;
    off = W < 360 ? { x: 2, y: 3 } : { x: 3, y: 4 };
    render();
    placeGlint(aim, true);
  };
  const ro = new ResizeObserver(measure);
  ro.observe(root);
  if (order) ro.observe(order);

  root.classList.add('is-live');
  measure();
  markOrder(0, true);
  markFront(0, false);

  // ---- first showing, once, as the stack comes up the screen: the cards are dealt onto it from the
  // back, the rings and the running order come up, then the front card lifts its edge on the rings
  // and falls back, so it is plain that it turns. Opacity, not visibility, so nothing in it ever
  // drops out of the tab order. Reduced motion: a short fade (the reveals' reduced path). ----
  const reveal = { trigger: root, start: 'top 78%', once: true };
  if (reduced) {
    fade = gsap.fromTo([...slots, ...rings, order, hint].filter(Boolean), { opacity: 0 }, {
      opacity: 1,
      duration: 0.3,
      ease: 'none',
      scrollTrigger: reveal,
      onComplete: () => { fade = null; },
    });
  } else {
    intro = gsap.timeline({ scrollTrigger: reveal, onComplete: () => { intro = null; } })
      .from([...slots].reverse(), { yPercent: 14, opacity: 0, duration: 0.7, ease: 'curtain', stagger: 0.07 })
      .from(rings, { opacity: 0, duration: 0.4, ease: 'curtain' }, '<0.2')
      .from([...buttons, hint].filter(Boolean), { y: 12, opacity: 0, duration: 0.6, ease: 'curtain', stagger: 0.05 }, '<0.1')
      .to(state, { p: NUDGE, duration: 0.32, ease: 'power2.out', onUpdate: render }, '+=0.15')
      .to(state, { p: 0, duration: 0.5, ease: 'curtain', onUpdate: render });
  }

  // the drive exists while the act is held; a screen that grows or shrinks past the query (a phone
  // turned on its side) adds or removes it, and the deck goes back to its first card either way
  const setDrive = () => {
    drive?.kill();
    drive = null;
    if (heldIn()) {
      drive = ScrollTrigger.create({
        trigger: holdEl,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => follow(self.progress),
      });
    }
  };
  setDrive();
  const onTall = () => { setDrive(); if (drive) follow(drive.progress); };
  tall.addEventListener('change', onTall);

  return () => {
    tall.removeEventListener('change', onTall);
    drive?.kill();
    drive = null;
    gsap.killTweensOf(window);
    for (const t of [intro, fade]) { t?.scrollTrigger?.kill(); t?.kill(); }
    intro = fade = null;
    release();
    hold(false);
    busy(false);
    ro.disconnect();
    lean.dispose();
    hand.removeEventListener('pointerdown', onDown);
    hand.removeEventListener('click', onClickCapture, true);
    hand.removeEventListener('click', onClick);
    hand.removeEventListener('dragstart', onDragStart);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('focusin', onFocus);
    buttons.forEach((b) => b.removeEventListener('click', onPick));
    const moved = [state, hand, glint, hint, order, ...slots, ...cards, ...links, ...buttons, ...rings].filter(Boolean);
    gsap.killTweensOf(moved);
    gsap.set(moved.slice(1), { clearProps: 'transform,opacity,visibility,zIndex,transformOrigin' });
    made.forEach((el) => el.remove());
    for (const [el, name, value] of saved) {
      if (value === null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
    slots.forEach((s) => s.classList.remove('is-front'));
    cards.forEach((c) => { c.style.removeProperty('--face'); c.style.removeProperty('--solid'); });
    faces.length = solids.length = 0;
    root.classList.remove('is-live');
  };
}

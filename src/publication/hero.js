// The publication's opening (publication.html's @hero; its layout is publication-hero.css). At
// first only the statue (src/publication/statue.js), on the right of the screen, alone among the
// stars. Scrolling holds the opening in place (one pinned ScrollTrigger, scrubbed over HOLD
// screens) and plays it: he crosses to the left, and the words come out of the mask he holds. Each
// word is born at the mask's point on the screen (thinker.maskPoint(); where the mask is in the
// still picture until he is live), small and unseen, and travels on a low arc, growing, into its
// place: the first line word by word, the gold rule drawn under it, then the second line, as if
// spoken out of the mask. On a phone (and a tablet held upright) he starts in the middle of the
// screen and rises, smaller, and the words settle under him.
// It is played by the scroll alone, so it runs backwards exactly as it runs forwards; the words
// follow the mask wherever it is at that moment (it moves with him, and leans after the pointer).
// Reduced motion: no hold and no flight; the end stands, as it does without scripts.
// The stars belong to the opening only: as it leaves the screen the sky fades out, and stops once
// gone (it starts again on the way back). Past it the cursor's own glow shows everywhere on the
// page (html.is-glow-everywhere, src/animations/cursor.js), where before it showed over boxes only.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { mountStatue } from './statue.js';

const HOLD = 1.8; // screens of scroll the opening is held for while it plays
// the scene's parts, as stretches of that hold (0..1): his crossing; the span over which each
// line's words leave the mask, and how long each word is in the air; the rule under the first line
// (a word's flight is short against the gaps between words, so only two or three are in the air at
// once: they read one by one, as spoken, not as a swarm)
const MOVE = [0.03, 0.46];
const LINE1 = { from: 0.3, to: 0.76, flight: 0.13 };
const LINE2 = { from: 0.66, to: 0.95, flight: 0.1 };
const RULE = [0.68, 0.82];
const BORN = 0.12; // a word's size as it leaves the mask (never nothing)
const ARC = 0.08; // how high a word's path bows, against the length of its flight
// where the mask is in the still picture (fractions of the box), until the live statue says
const MASK = { x: 0.88, y: 0.35 };
const STACKED = '(max-width: 767px), (max-width: 1023px) and (orientation: portrait)';
const EVERYWHERE = 'is-glow-everywhere';

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Split a line into words (each its own box to move), keeping the sentence whole for screen readers. */
function splitWords(el) {
  const text = el.textContent.trim().replace(/\s+/g, ' ');
  const said = document.createElement('span');
  said.className = 'sr-only';
  said.textContent = text;
  const shown = document.createElement('span');
  shown.setAttribute('aria-hidden', 'true');
  text.split(' ').forEach((word, i) => {
    if (i) shown.append(' ');
    const w = document.createElement('span');
    w.className = 'pub-hero__w';
    w.textContent = word;
    shown.append(w);
  });
  el.replaceChildren(said, shown);
  return { el, text, words: [...shown.children] };
}

/** @param {{ reduced: boolean, sky: any, onTheme: Function, opened: Promise }} ctx  bootPage's context */
export function setupHero({ reduced, sky, onTheme, opened }) {
  const hero = document.querySelector('[data-pub-hero]');
  const stage = hero?.querySelector('.pub-hero__stage');
  const rail = hero?.querySelector('.pub-hero__rail');
  const box = hero?.querySelector('.pub-hero__statue');
  const wordsBox = hero?.querySelector('.pub-hero__words');
  if (!hero || !stage || !rail || !box || !wordsBox) return undefined;
  const root = document.documentElement;
  const rule = hero.querySelector('.pub-hero__rule');
  const stars = document.querySelector('.stage__stars');
  const cleanups = [];

  // the statue: here among the stars (the sky leaves his box alone), made at once (he is the
  // first thing on the page), whole in his box
  const statue = mountStatue(box, { reduced, opened, onTheme, sky, fit: 1, lazy: false });
  cleanups.push(() => statue.dispose());

  // ---- the sky: the opening's only; it fades as the opening leaves, and stops once gone ----
  let skyOn = true;
  const setSky = (on) => {
    if (!sky || on === skyOn) return;
    skyOn = on;
    if (on) sky.start(); else sky.stop();
  };
  let pin = null; // the opening's hold (none with reduced motion)
  // where the opening starts to leave: the end of its hold, or (held nowhere) where its foot
  // reaches the bottom of the screen
  const leaving = () => (pin ? pin.end : Math.max(0, hero.offsetTop + hero.offsetHeight - innerHeight));

  // ---- the scene ----
  if (!reduced) {
    const lines = [...hero.querySelectorAll('[data-hero-words]')].map(splitWords);
    cleanups.push(() => lines.forEach(({ el, text }) => { el.textContent = text; }));
    // each word's turn: when it leaves the mask, and how long it flies
    const flights = [];
    lines.forEach(({ words }, li) => {
      const L = li === 0 ? LINE1 : LINE2;
      const step = words.length > 1 ? (L.to - L.flight - L.from) / (words.length - 1) : 0;
      words.forEach((el, i) => flights.push({ el, at: L.from + i * step, span: L.flight, cx: 0, cy: 0, state: '' }));
    });
    const cross = gsap.parseEase('power2.inOut'); // his crossing: eased in and out, like a carried weight
    const fly = gsap.parseEase('curtain'); // a word's flight: fast from the mask, settling into place

    let stacked = false;
    let rise = 0; // stacked: how far below his final place he starts
    let shrink = 0.84; // stacked: his size at the end against his size at the start (--m-s)
    const measure = () => {
      stacked = matchMedia(STACKED).matches;
      // each word's place at the end, in the stage's frame (offsets ignore the words' transforms)
      const ox = wordsBox.offsetLeft, oy = wordsBox.offsetTop;
      for (const f of flights) {
        f.cx = ox + f.el.offsetLeft + f.el.offsetWidth / 2;
        f.cy = oy + f.el.offsetTop + f.el.offsetHeight * 0.55;
      }
      if (stacked) {
        const cs = getComputedStyle(hero);
        const top = parseFloat(cs.getPropertyValue('--hero-top')) || 64;
        const foot = parseFloat(cs.getPropertyValue('--hero-foot')) || 48;
        shrink = parseFloat(cs.getPropertyValue('--m-s')) || 0.84;
        rise = top + (hero.clientHeight - top - foot - box.offsetHeight) / 2 - (rail.offsetTop + box.offsetTop);
      }
    };

    // where the mask is on the screen now: the live statue's own point, else the still picture's
    const maskNow = () => {
      const p = statue.thinker?.maskPoint();
      if (p) return p;
      const r = box.getBoundingClientRect();
      return { x: r.left + MASK.x * r.width, y: r.top + MASK.y * r.height };
    };

    let progress = 0;
    let crossed = -1;
    const render = (p) => {
      progress = p;
      // he crosses (the rail carries him), or rises and grows smaller (stacked)
      const s = cross(clamp((p - MOVE[0]) / (MOVE[1] - MOVE[0])));
      const moved = s !== crossed;
      crossed = s;
      if (stacked) {
        rail.style.transform = 'none';
        box.style.transform = `translate3d(0, ${(rise * (1 - s)).toFixed(2)}px, 0) scale(${(1 + (shrink - 1) * s).toFixed(4)})`;
      } else {
        box.style.transform = 'none';
        rail.style.transform = `translate3d(${(100 * (1 - s)).toFixed(3)}%, 0, 0)`;
      }
      // the box moved under the pointer without a scroll (the scrub catches up): his lamp keeps to it
      if (moved) statue.thinker?.boxMoved();
      // the words: read where things are first, then move them all
      let m = null, st = null;
      for (const f of flights) {
        const t = clamp((p - f.at) / f.span);
        if (t <= 0 || t >= 1) {
          const state = t <= 0 ? 'unborn' : 'home';
          if (f.state === state) continue;
          f.state = state;
          f.el.style.transform = '';
          f.el.style.opacity = state === 'home' ? '' : '0';
          f.el.style.visibility = state === 'home' ? '' : 'hidden'; // no invisible text to find or select
          continue;
        }
        f.state = 'flying';
        m ??= maskNow();
        st ??= stage.getBoundingClientRect();
        const e = fly(t);
        const dx = m.x - (st.left + f.cx), dy = m.y - (st.top + f.cy);
        // from the mask to its place, the path bowed upward a little (it rises, then settles)
        const lift = Math.hypot(dx, dy) * ARC * Math.sin(Math.PI * e);
        const x = dx * (1 - e), y = dy * (1 - e) - lift;
        f.el.style.visibility = '';
        f.el.style.opacity = clamp(t / 0.45).toFixed(3);
        f.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${(BORN + (1 - BORN) * e).toFixed(4)})`;
      }
      if (rule) {
        const r = fly(clamp((p - RULE[0]) / (RULE[1] - RULE[0])));
        rule.style.transform = r >= 1 ? '' : `scaleX(${r.toFixed(4)})`;
        rule.style.opacity = r > 0 ? '' : '0';
      }
    };

    measure();
    render(0);
    hero.classList.add('is-scene'); // the script has the scene (publication-hero.css)

    // the hold: the opening stays on the screen while the scroll plays it (the scrub's catch-up
    // smooths a wheel's steps, and never overshoots)
    const proxy = { p: 0 };
    const tween = gsap.to(proxy, {
      p: 1,
      ease: 'none',
      onUpdate: () => render(proxy.p),
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: () => `+=${Math.round(innerHeight * HOLD)}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onRefresh: () => { measure(); render(proxy.p); },
      },
    });
    pin = tween.scrollTrigger;
    cleanups.push(() => {
      tween.scrollTrigger?.kill(true);
      tween.kill();
      for (const el of [rail, box, rule, ...flights.map((f) => f.el)]) el?.removeAttribute('style');
      hero.classList.remove('is-scene');
    });

    // the type may land late, or the column change size: the words' places are taken again
    const ro = new ResizeObserver(() => { measure(); crossed = -1; render(progress); });
    ro.observe(wordsBox);
    cleanups.push(() => ro.disconnect());
    // the live statue's mask is where the words come from: once he is drawn, use it
    statue.ready.then((t) => { if (t) render(progress); });
  } else {
    hero.classList.add('is-still');
    cleanups.push(() => hero.classList.remove('is-still'));
  }

  // ---- leaving the opening: the stars fade out (over about half a screen) and stop; the
  // cursor's glow takes over everywhere a little after the fade begins ----
  if (stars) {
    const fade = gsap.fromTo(stars, { opacity: 1 }, {
      opacity: 0,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: {
        trigger: hero,
        start: () => leaving(),
        end: () => leaving() + innerHeight * 0.55,
        scrub: true,
        onUpdate: (self) => setSky(self.progress < 1),
        onRefresh: (self) => setSky(self.progress < 1),
      },
    });
    cleanups.push(() => {
      fade.scrollTrigger?.kill();
      fade.kill();
      stars.style.removeProperty('opacity');
    });
  }
  const glow = ScrollTrigger.create({
    trigger: hero,
    start: () => leaving() + innerHeight * 0.12,
    end: 'max',
    onEnter: () => root.classList.add(EVERYWHERE),
    onLeaveBack: () => root.classList.remove(EVERYWHERE),
    onRefresh: (self) => root.classList.toggle(EVERYWHERE, self.scroll() > self.start),
  });
  cleanups.push(() => { glow.kill(); root.classList.remove(EVERYWHERE); });

  return () => cleanups.splice(0).reverse().forEach((c) => c());
}

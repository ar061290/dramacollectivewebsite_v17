// About us: LEARN · CREATE · COLLABORATE · PERFORM · GROW. A tall section with a stage that stays
// on screen while the page scrolls through it. In its middle each word is drawn in Raung, as the
// font's own outlines (assets/type/about-words.js, made by tools/type/words.mjs), and each word
// turns into the next with the scroll, as one shape: a wave runs along the word from left to right,
// and as it passes, each letter swells, melts into the letter of the next word that takes its place
// and settles again. The scroll rests on every word for part of the way, so each can be read.
// Around the words the home page's Penrose ring, in the statue's white marble
// (src/scene/aboutRing.js), turns half way round and draws back, and behind it gold line-work (an
// astrolabe's circles, ticks and construction lines, and a few constellations) draws itself in as
// the section arrives and turns slowly while it plays. A side scale names the five words and marks
// the one shown; tapping one scrolls to it.
//
// Without WebGL (or where it runs poorly) a drawn ring of the same size stands in for the marble
// one. With reduced motion the stage is shorter, the ring and the line-work hold still and the
// words change in place, without the morph.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin.js';
import TYPE from '../../assets/type/about-words.js';
import { fields, buildField, takeField } from './lexiconFields.js';
import { SWELL, MELT, EDGE, smooth, placed, between } from './lexiconMorph.js';
import { probeWebGL, prefersStatic, readToken, phoneTier, liteTier } from '../util/env.js';
import { currentTheme } from '../ui/theme.js';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

const RING_MAPS = {
  albedo: new URL('../../assets/textures/ring-albedo.webp', import.meta.url).href,
  normal: new URL('../../assets/textures/ring-normal.webp', import.meta.url).href,
};

// The ring's image as its eye sees it, in tan(angle) units with y up (measured from
// src/scene/ring/ring.js): its hole is close to an ellipse a wide and b tall (taken a little inside
// the measured 0.1032 and 0.1555), centred a little left of the axis, and the whole ring stands
// 0.36 tall. The ring turns about the middle of its hole, so the words stay centred in it.
const HOLE = { cx: -0.0123, cy: 0, a: 0.101, b: 0.152 };
const OUTER = { a: 0.1326, b: 0.18 }; // the ring's own half-width and half-height, from the same middle
// half a turn, clockwise like a clock hand, over the section, from a start a little anticlockwise
// of upright: so the ring lies widest a little before the middle, where the widest words are
const TURN = -Math.PI, TILT = Math.PI * 0.05;
// the ring draws back to 0.7 of its size, from 1.3 on a landscape stage (as the ledger's reticle
// does, from 1.35 to 0.6) and from 1.15 on a portrait one, where it has less room to start in
const SCALE = { landscape: 1.3, portrait: 1.15, end: 0.7 };
const FIT = 0.9; // the corners of a word's box keep this far inside the hole

// the timeline, in beats: the scroll rests on each word, then the shape turns into the next
const REST = 1, MORPH = 1.15;
const WORDS = Object.keys(TYPE.words);
const STEP = REST + MORPH;
const BEATS = WORDS.length * REST + (WORDS.length - 1) * MORPH;

// the words' frame (font units): every word is centred on x = 0 and sits on one baseline, so the
// middle of the capitals is the middle of the frame
const CAP_MID = -TYPE.capHeight / 2;
const FRAME = { x: -3000, y: CAP_MID - 520, w: 6000, h: 1040 };
const EM = TYPE.unitsPerEm;

// how far each word reaches from the middle of the capitals, in ems
const EXTENT = WORDS.map((w) => {
  const [x, y, width, height] = TYPE.words[w].box;
  return { half: Math.max(-x, x + width) / EM, up: (CAP_MID - y) / EM, down: (y + height - CAP_MID) / EM };
});

// (the morph between two words: src/sections/lexiconMorph.js)

/** Work for idle moments (a short timeout keeps it moving on a page that is never idle). */
const idle = (fn) => (window.requestIdleCallback
  ? requestIdleCallback(fn, { timeout: 1500 })
  : setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 0 }), 60));

/** Where the scroll is in the words (p 0..1): the word shown, at rest or how far (m) into the morph from word k. */
function wordAt(p) {
  const t = Math.min(Math.max(p, 0), 1) * BEATS;
  const i = Math.min(WORDS.length - 1, Math.floor(t / STEP));
  const into = t - i * STEP;
  if (into <= REST || i === WORDS.length - 1) return { word: i, rest: true };
  const m = (into - REST) / MORPH;
  return { word: m < 0.5 ? i : i + 1, rest: false, k: i, m };
}
/** The scroll position (0..1) of the middle of a word's rest. */
const restAt = (i) => (i * STEP + REST / 2) / BEATS;
/** How far (0..1) the wave has run at m through a morph (the ends are the outline's own swell). */
const waveAt = (m) => Math.min(1, Math.max(0, (m - EDGE) / (1 - 2 * EDGE)));

/** The ring's turn and size along the section (reduced motion: still, turned to lie wide). */
const schedule = (from, still) => (p) => (still
  ? { spin: TURN / 2, scale: 1 }
  : { spin: TILT + TURN * p, scale: from + (SCALE.end - from) * p });

/** The most room the ring's image takes across and down over the section (tan units). */
function reach(ringAt) {
  let wide = 0, tall = 0;
  for (let n = 0; n <= 60; n++) {
    const { spin, scale } = ringAt(n / 60);
    const c = Math.cos(spin), s = Math.sin(spin);
    wide = Math.max(wide, 2 * scale * Math.hypot(OUTER.a * c, OUTER.b * s));
    tall = Math.max(tall, 2 * scale * Math.hypot(OUTER.a * s, OUTER.b * c));
  }
  return { wide, tall };
}

/**
 * The largest type size (px per em) at which every word, and every shape between two words, stays
 * inside the ring's hole as it turns and draws back. A word is a box; the hole an ellipse turned
 * with the ring; each corner of the box must lie inside it. Between two words the box reaches to
 * the outer run edges where they stand at that point of the wave (placed), swollen as a letter is
 * when the wave passes it, and is as tall as the taller word.
 */
function fitEm(ppu, ringAt, still) {
  let em = Infinity;
  const fit = (e, p) => {
    const { spin, scale } = ringAt(p);
    const c = Math.cos(spin), s = Math.sin(spin), k = ppu * scale;
    for (const [x, y] of [[e.half, e.up], [-e.half, e.up], [e.half, -e.down], [-e.half, -e.down]]) {
      em = Math.min(em, k / Math.hypot((x * c + y * s) / HOLE.a, (-x * s + y * c) / HOLE.b));
    }
  };
  // held still (reduced motion), the ring stays put and the words change in place: each word alone
  if (still) EXTENT.forEach((e) => fit(e, 0));
  else {
    const grow = (SWELL + MELT) / EM;
    for (let n = 0; n <= 160; n++) {
      const p = n / 160;
      const at = wordAt(p);
      let e = EXTENT[at.word];
      if (!at.rest) {
        const x = placed(at.k, waveAt(at.m)), a = EXTENT[at.k], b = EXTENT[at.k + 1];
        e = { half: Math.max(-x[0], x[x.length - 1]) / EM + grow, up: Math.max(a.up, b.up) + grow, down: Math.max(a.down, b.down) + grow };
      }
      fit(e, p);
    }
  }
  return em * FIT;
}

// ---- the gold line-work (units: 1000 to half a tan unit of the ring's image) ----

const STAR = 'M0 -10C1 -2 2 -1 10 0 2 1 1 2 0 10 -1 2 -2 1 -10 0 -2 -1 -1 -2 0 -10Z'; // the site's star
const f1 = (v) => Math.round(v * 10) / 10;
const polar = (r, deg) => [f1(r * Math.cos((deg * Math.PI) / 180)), f1(r * Math.sin((deg * Math.PI) / 180))];
const star = (x, y, size, cls = 'ins-star') => `<path class="${cls}" d="${STAR}" transform="translate(${x} ${y}) scale(${size / 10})"/>`;
const arc = (r, a0, a1) => {
  const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

function lineWork() {
  // the outer dial: a ring of ticks, longer every 15° and every 45°, between two circles
  let ticks = '';
  for (let d = 0; d < 360; d += 3) {
    const [r0, r1] = d % 45 === 0 ? [526, 566] : d % 15 === 0 ? [538, 562] : [548, 560];
    const [x0, y0] = polar(r0, d), [x1, y1] = polar(r1, d);
    ticks += `M${x0} ${y0}L${x1} ${y1}`;
  }
  const outer = `
    <circle class="ins-draw" r="566"/>
    <path class="ins-draw" d="${ticks}"/>
    <circle class="ins-fine ins-fade" r="526" stroke-dasharray="1 6"/>
    <circle class="ins-faint ins-draw" r="600"/>
    ${[45, 135, 225, 315].map((d) => star(...polar(600, d), 9)).join('')}`;

  // the middle ring: arcs with small rounds at their ends, hour marks and a dashed circle
  const arcs = [12, 102, 192, 282];
  const middle = `
    <circle class="ins-draw" r="490"/>
    <circle class="ins-fine ins-fade" r="472" stroke-dasharray="2 8"/>
    ${arcs.map((d) => `<path class="ins-draw" d="${arc(512, d, d + 50)}"/>`).join('')}
    ${arcs.map((d) => [d, d + 50].map((e) => { const [x, y] = polar(512, e); return `<circle class="ins-dot" cx="${x}" cy="${y}" r="3.2"/>`; }).join('')).join('')}
    <path class="ins-draw" d="${Array.from({ length: 12 }, (_, i) => { const [x0, y0] = polar(482, i * 30 + 15), [x1, y1] = polar(498, i * 30 + 15); return `M${x0} ${y0}L${x1} ${y1}`; }).join('')}"/>`;

  // the construction: a crosshair out to the edges, the rete's diagonals, two eccentric circles,
  // wide circles and a triangle drawn through the dial
  const cross = [0, 90, 180, 270].map((d) => { const [x0, y0] = polar(612, d), [x1, y1] = polar(820, d); return `M${x0} ${y0}L${x1} ${y1}`; }).join('');
  const diag = [30, 150, 210, 330].map((d) => { const [x0, y0] = polar(430, d), [x1, y1] = polar(900, d); return `M${x0} ${y0}L${x1} ${y1}`; }).join('');
  const tri = [90, 210, 330].map((d) => polar(700, d));
  const construct = `
    <path class="ins-draw" d="${cross}"/>
    <path class="ins-fine ins-fade" d="${diag}" stroke-dasharray="3 9"/>
    <circle class="ins-faint ins-draw" cy="-150" r="440"/>
    <circle class="ins-faint ins-draw" cy="150" r="440"/>
    <circle class="ins-faint ins-draw" r="780"/>
    <circle class="ins-faint ins-fade" r="1000" stroke-dasharray="1 7"/>
    <path class="ins-faint ins-draw" d="M${tri.map((p) => p.join(' ')).join('L')}Z"/>
    ${tri.map(([x, y]) => `<circle class="ins-fine ins-draw" cx="${x}" cy="${y}" r="7"/>`).join('')}`;
  return { outer, middle, construct };
}

// three small constellations for the corners of the stage (each in its own little frame)
const CONSTELLATIONS = [
  { cls: 'is-a', box: '0 0 240 170', stars: [[22, 120, 9], [78, 64, 13], [140, 92, 8], [196, 30, 11], [214, 140, 6]], path: [0, 1, 2, 3, 1] },
  { cls: 'is-b', box: '0 0 220 150', stars: [[24, 30, 7], [92, 70, 12], [160, 44, 8], [196, 122, 10]], path: [0, 1, 2, 1, 3] },
  { cls: 'is-c', box: '0 0 170 120', stars: [[20, 96, 8], [86, 30, 11], [150, 80, 7]], path: [0, 1, 2] },
];
function constellations() {
  return CONSTELLATIONS.map(({ cls, box, stars, path }) => `
    <svg class="lexicon__stars ${cls}" viewBox="${box}" aria-hidden="true" focusable="false">
      <path class="ins-fine ins-draw" d="M${path.map((i) => stars[i].slice(0, 2).join(' ')).join('L')}"/>
      ${stars.map(([x, y, s]) => star(x, y, s)).join('')}
    </svg>`).join('');
}

/**
 * @param {HTMLElement} host  the [data-lexicon] section
 * @param {{ reduced: boolean, opened: Promise<void>, onTheme: (fn) => void }} ctx
 * @returns {() => void} dispose
 */
export function setupLexicon(host, { reduced, opened, onTheme }) {
  const run = host.querySelector('.lexicon__run');
  const stage = host.querySelector('.lexicon__stage');
  const wordSvg = host.querySelector('.lexicon__word');
  const ringHost = host.querySelector('.lexicon__ring');
  const still = host.querySelector('.lexicon__still');
  const steps = [...host.querySelectorAll('.lexicon__step')];
  const count = host.querySelector('[data-lexicon-count]');
  const lines = host.querySelector('.lexicon__lines');
  const side = host.querySelector('.lexicon__side');
  const cleanups = [];
  let gone = false;
  cleanups.push(() => { gone = true; });

  // the word: one path, the font's own outlines at rest, the fields' outline between words
  const NS = 'http://www.w3.org/2000/svg';
  wordSvg.setAttribute('viewBox', `${FRAME.x} ${FRAME.y} ${FRAME.w} ${FRAME.h}`);
  const ink = document.createElementNS(NS, 'path');
  ink.setAttribute('stroke-width', '0');
  wordSvg.append(ink);
  const restD = WORDS.map((w) => TYPE.words[w].glyphs.join(''));

  // the line-work, in three layers that turn at their own rates, and the corner constellations
  const art = lineWork();
  const layer = (name, body) => `<svg class="lexicon__layer lexicon__layer--${name}" viewBox="-640 -640 1280 1280" aria-hidden="true" focusable="false">${body}</svg>`;
  lines.innerHTML = layer('construct', art.construct) + layer('outer', art.outer) + layer('middle', art.middle) + constellations();
  const layers = {
    outer: lines.querySelector('.lexicon__layer--outer'),
    middle: lines.querySelector('.lexicon__layer--middle'),
    construct: lines.querySelector('.lexicon__layer--construct'),
  };
  const drawn = gsap.utils.toArray(lines.querySelectorAll('.ins-draw'));
  const faded = gsap.utils.toArray(lines.querySelectorAll('.ins-fade, .ins-star, .ins-dot'));

  // ---- sizes: the ring from the stage, the type from the ring ----
  let ring = null; // the marble ring, once loaded
  let ppu = 1000;
  let progress = 0;
  let cell = 8; // the morph's grid (font units): about a pixel and a quarter at the type's size
  let ringAt = schedule(SCALE.landscape, reduced);
  const layout = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    const from = h > w ? SCALE.portrait : SCALE.landscape;
    ringAt = schedule(from, reduced);
    // the ring as large as the stage holds at its largest along the way (held still, it keeps
    // that size): inside the height, less the bands kept for the sentence above and the scale
    // below where those are not beside it, and inside the width, clear of the scale where it is
    const beside = getComputedStyle(side).display !== 'contents';
    const bands = beside ? h * 0.08 : 2 * (parseFloat(readToken('--topbar-h')) + 40);
    const { wide, tall } = reach(schedule(from, false));
    const room = beside ? Math.min(w * 0.94, w - 2 * (side.getBoundingClientRect().right + 24)) : w * 0.94;
    ppu = Math.min((h - bands) / tall, room / wide);
    const em = Math.max(16, Math.min(fitEm(ppu, ringAt, reduced), (w * 0.92) / (2 * Math.max(...EXTENT.map((e) => e.half))), 150));
    const unit = (ppu * 0.5) / 1000; // px per line-work unit
    cell = Math.min(16, Math.max(7, 1250 / em));
    stage.style.setProperty('--word-em', `${em.toFixed(2)}px`);
    stage.style.setProperty('--ring-px', `${(ppu * 0.5).toFixed(1)}px`);
    stage.style.setProperty('--ins-px', `${(unit * 1280).toFixed(1)}px`);
    stage.style.setProperty('--hair', (1 / unit).toFixed(3)); // one CSS pixel, in line-work units
    ring?.set({ ppu, cx: HOLE.cx, cy: HOLE.cy });
    apply(progress, true);
  };

  // ---- the word at a point of the scroll ----
  let shownD = '', shownStroke = '';
  const show = (d, sw) => {
    if (d !== shownD) { ink.setAttribute('d', d); shownD = d; }
    if (sw !== shownStroke) { ink.setAttribute('stroke-width', sw); shownStroke = sw; }
  };
  // lite tier: the shape between two words comes from a worker (prepare, below), shown when it answers,
  // a frame after it was asked for: one question at a time, the latest kept while one is out, and an
  // answer the scroll has since left behind (the word at rest, or swelling) never shown
  let morph = null, asking = false, wanted = null, gen = 0;
  const ask = () => { asking = true; morph.postMessage({ gen, ...wanted }); wanted = null; };
  const answered = ({ data }) => {
    asking = false;
    if (data.gen === gen) show(data.d, '0.00'); // its stroke with it: the outline does not swell between
    if (wanted) ask();
  };
  const draw = (at) => {
    let d, stroke = 0;
    if (reduced || at.rest) d = restD[at.word];
    else if (at.m < EDGE || at.m > 1 - EDGE) {
      // the font's own outline swells into the morph and settles out of it (a stroke the colour of
      // the fill swells it evenly, with round corners, as the fields do)
      const into = at.m < EDGE;
      d = restD[into ? at.k : at.k + 1];
      stroke = 2 * SWELL * smooth(into ? at.m / EDGE : (1 - at.m) / EDGE);
    } else if (morph) {
      wanted = { k: at.k, s: waveAt(at.m), cs: cell };
      if (!asking) ask();
      return;
    } else d = between(at.k, waveAt(at.m), cell);
    gen++;
    wanted = null;
    show(d, stroke.toFixed(2));
  };

  // ---- one place where the scroll position becomes the picture ----
  let shown = -1;
  // the drawn ring is turned and sized by GSAP's own CSS renderer, as gsap.set would, without a new
  // tween in every frame of the scroll (gsap.set made, started and finished one each time)
  // (scaleX and scaleY: quickSetter does not take gsap.set's scale shorthand; the scale rounded to four
  // places, as gsap.set rounds it and quickSetter does not)
  const stillTo = still ? { rotation: gsap.quickSetter(still, 'rotation', 'deg'), scaleX: gsap.quickSetter(still, 'scaleX'), scaleY: gsap.quickSetter(still, 'scaleY') } : { rotation() {}, scaleX() {}, scaleY() {} };
  const apply = (p, force = false) => {
    progress = p;
    const { spin, scale } = ringAt(p);
    ring?.set({ spin, scale });
    // the drawn stand-in ring turns and draws back the same way (CSS turns clockwise for a positive angle)
    stillTo.rotation((-spin * 180) / Math.PI);
    const s4 = Math.round(scale * 10000) / 10000;
    stillTo.scaleX(s4);
    stillTo.scaleY(s4);
    const at = wordAt(p);
    if (at.word !== shown || force) {
      shown = at.word;
      steps.forEach((s, i) => (i === at.word ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')));
      if (count) count.textContent = String(at.word + 1).padStart(2, '0');
    }
    draw(at);
  };

  // ---- the scroll ----
  let st;
  if (reduced) {
    st = ScrollTrigger.create({ trigger: run, start: 'top top', end: 'bottom bottom', onUpdate: (self) => apply(self.progress) });
  } else {
    // the line-work turns slowly while the words play, each layer at its own rate; the words
    // themselves are drawn from the timeline's progress (apply)
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    tl.to(layers.outer, { rotation: -24, duration: BEATS }, 0)
      .to(layers.middle, { rotation: 38, duration: BEATS }, 0)
      .to(layers.construct, { rotation: -9, duration: BEATS }, 0);
    tl.eventCallback('onUpdate', () => apply(tl.progress()));
    st = ScrollTrigger.create({ trigger: run, start: 'top top', end: 'bottom bottom', scrub: 0.7, animation: tl });
    cleanups.push(() => tl.kill());

    // the line-work draws itself in as the section arrives
    gsap.set(drawn, { drawSVG: '0%' });
    gsap.set(faded, { autoAlpha: 0 });
    const drawIn = gsap.timeline({
      scrollTrigger: { trigger: run, start: 'top 85%', end: 'top 10%', scrub: 0.6 },
      defaults: { ease: 'none' },
    });
    drawIn.to(drawn, { drawSVG: '100%', duration: 1, stagger: { each: 0.04, from: 'random' } }, 0)
      .to(faded, { autoAlpha: 1, duration: 0.5, stagger: { each: 0.02, from: 'random' } }, 0.4);
    // and it fades in and out with the stage's coming and going, so its lines never end on the
    // stage's edge (a fade, not a mask: a mask over the turning layers costs a repaint each frame)
    const come = gsap.fromTo(lines, { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: run, start: 'top 95%', end: 'top 30%', scrub: true } });
    const go = gsap.fromTo(lines, { opacity: 1 }, { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: { trigger: run, start: 'bottom 98%', end: 'bottom 45%', scrub: true } });
    cleanups.push(() => { [drawIn, come, go].forEach((t) => { t.scrollTrigger?.kill(); t.kill(); }); });
  }
  cleanups.push(() => st.kill());

  // tapping a word in the scale scrolls to it
  const onStep = (e) => {
    const i = steps.indexOf(e.currentTarget);
    const y = st.start + (st.end - st.start) * restAt(i);
    gsap.to(window, { scrollTo: y, duration: reduced ? 0 : 1.1, ease: 'power2.inOut' });
  };
  steps.forEach((s) => s.addEventListener('click', onStep));
  cleanups.push(() => steps.forEach((s) => s.removeEventListener('click', onStep)));

  const ro = new ResizeObserver(layout);
  ro.observe(stage);
  cleanups.push(() => ro.disconnect());
  layout();

  // ---- after the curtain, in the page's idle moments: the marble ring, then the words' fields ----
  // Nothing here runs while the page is busy, so the top of the page answers as soon as the
  // curtain parts. The ring is far down the page by then; the fields are only needed once the
  // first word starts to turn (and are built on the spot if the scroll gets there first).
  const prepare = () => {
    if (reduced) return;
    const work = (deadline) => {
      if (gone) return;
      // the time the browser offers, less a little; a few milliseconds when it had none to give
      const until = performance.now() + (deadline.didTimeout ? 6 : Math.max(2, deadline.timeRemaining() - 3));
      let i;
      while ((i = WORDS.findIndex((_, n) => !fields[n])) >= 0 && performance.now() < until) buildField(i, until);
      if (i >= 0) idle(work);
    };
    // off the page's thread altogether where the browser can: a worker builds them, the same code on
    // the same data, so the very same numbers (on a slow phone they are a second's work, and slices of
    // it in the page's idle moments ran into the frames of a scroll); else in the idle moments, as before
    let worker = null;
    const instead = () => {
      const drew = !!morph; // (the lite worker that drew the morph: the page draws it from now on)
      worker?.terminate(); worker = morph = null; asking = false;
      if (gone) return;
      idle(work);
      if (drew) apply(progress, true);
    };
    // on the lite tier the worker also draws the morph, and keeps the fields (the page never needs them)
    if (liteTier()) {
      try {
        worker = morph = new Worker(new URL('./lexiconMorph.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = answered;
        worker.onerror = (e) => { e.preventDefault?.(); instead(); };
        cleanups.push(() => { worker?.terminate(); worker = morph = null; });
        return;
      } catch {
        morph = null;
      }
    }
    try {
      worker = new Worker(new URL('./lexiconFields.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.done) { worker?.terminate(); worker = null; return; }
        takeField(data.i, { x0: data.x0, nx: data.nx, d: data.d, b: data.b });
      };
      worker.onerror = (e) => { e.preventDefault?.(); instead(); };
      cleanups.push(() => { worker?.terminate(); worker = null; });
    } catch {
      instead();
    }
  };
  opened.then(prepare);
  const live = opened.then(() => { const gl = probeWebGL(); return gl.ok && !prefersStatic(gl.renderer); });
  {
    // on a touch screen the marble ring is made only once the lexicon is near (two screens ahead: a visit
    // that never gets there spends nothing on it; the drawn ring stands in until it comes); elsewhere at once
    const near = !phoneTier() ? Promise.resolve() : new Promise((resolve) => {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); resolve(); } }, { rootMargin: '200% 0px 200% 0px' });
      io.observe(host);
      cleanups.push(() => io.disconnect());
    });
    live.then((ok) => (ok ? near.then(() => new Promise((r) => idle(r))) : null)).then((go) => (go === null || gone ? null : import('../scene/aboutRing.js'))).then(async (mod) => {
      if (!mod || gone) return;
      ring = new mod.AboutRing(ringHost, {
        theme: currentTheme(),
        colors: { warm: readToken('--gold-300'), rim: readToken('--slate-300') },
      });
      await ring.load(RING_MAPS);
      if (gone) return;
      ring.set({ ppu, cx: HOLE.cx, cy: HOLE.cy, ...ringAt(progress) });
      requestAnimationFrame(() => ringHost.classList.add('is-live'));
    }).catch((err) => console.warn('Marble ring unavailable; the drawn ring stays.', err));
    onTheme((theme) => ring?.setTheme(theme));
    cleanups.push(() => ring?.dispose());
  }

  return () => cleanups.forEach((c) => c());
}

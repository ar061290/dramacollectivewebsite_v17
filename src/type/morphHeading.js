// A heading drawn as the font's own outlines that morphs from one wording to another in time
// (src/type/wordMorph.js), for a switch such as the publication's pieces toggle. The svg is only the
// picture: it is aria-hidden, and the page keeps the real heading text for screen readers (and for
// visitors without scripts, who see that text instead).
//
// Markup: <svg class="..." aria-hidden="true" focusable="false"></svg>, sized by CSS in ems of the
// heading's font size: width `frame.w / 1000` em, height `frame.h / 1000` em (both are set here as
// custom properties, --head-w and --head-h, for the CSS to use), with overflow visible for the
// swell. Colour it with `fill: currentColor; stroke: currentColor; fill-rule: evenodd;
// stroke-linejoin: round`.
import gsap from 'gsap';
import { createWordMorph } from './wordMorph.js';

const NS = 'http://www.w3.org/2000/svg';

/** Work for idle moments (a short timeout keeps it moving on a page that is never idle). */
const idle = (fn) => (window.requestIdleCallback
  ? requestIdleCallback(fn, { timeout: 1500 })
  : setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 0 }), 60));

/**
 * @param {SVGSVGElement} svg
 * @param {object} o
 * @param {object} o.type              the generated outlines (e.g. assets/type/publication-heads.js)
 * @param {boolean} o.reduced          reduced motion: the wording swaps at once, and the fields are never built
 * @param {Promise} [o.opened]         the fields are built in idle time once this resolves (bootPage's ctx.opened)
 * @param {number} [o.start]           the word shown first
 * @param {number} [o.duration]        seconds for one whole morph
 * @param {string|Function} [o.ease]   the morph's ease: even at both ends, so the wave reads as it runs (each letter's own easing comes from the wave)
 * @returns {{ show: (i: number) => void, readonly shown: number, dispose: () => void }}
 */
export function morphHeading(svg, { type, reduced, opened = Promise.resolve(), start = 0, duration = 0.9, ease = 'sine.inOut' }) {
  const morph = createWordMorph(type);
  const { frame } = morph;
  const last = morph.words.length - 1;
  let gone = false;

  svg.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.w} ${frame.h}`);
  svg.style.setProperty('--head-w', `${frame.w / type.unitsPerEm}em`);
  svg.style.setProperty('--head-h', `${frame.h / type.unitsPerEm}em`);
  svg.style.setProperty('--head-left', `${frame.x / type.unitsPerEm}em`);
  const ink = document.createElementNS(NS, 'path');
  svg.append(ink);

  // where the heading is: 0 is the first word, 1 the second, and in between, part way through the
  // morph from one to the next
  const state = { p: start };
  let target = start;
  let cell = 16;
  let shownD = '', shownStroke = '';
  const draw = () => {
    const k = Math.min(last - 1, Math.max(0, Math.floor(state.p)));
    const { d, stroke } = last < 1 ? { d: morph.rest(0), stroke: 0 } : morph.shape(k, state.p - k, cell);
    if (d !== shownD) { ink.setAttribute('d', d); shownD = d; }
    const sw = stroke.toFixed(2);
    if (sw !== shownStroke) { ink.setAttribute('stroke-width', sw); shownStroke = sw; }
  };
  draw();

  // the fields, after the curtain, in the page's idle moments (built on the spot if the switch
  // comes first)
  if (!reduced) {
    opened.then(() => {
      const work = (deadline) => {
        if (gone) return;
        // the time the browser offers, less a little; a few milliseconds when it had none to give
        const until = performance.now() + (deadline.didTimeout ? 6 : Math.max(2, deadline.timeRemaining() - 3));
        if (!morph.warm(until)) idle(work);
      };
      idle(work);
    });
  }

  let tween = null;
  return {
    /** Morph to word i (from wherever the heading is, even part way through a morph). */
    show(i) {
      i = Math.min(last, Math.max(0, i));
      if (i === target) return; // there already, or on the way
      target = i;
      tween?.kill();
      tween = null;
      if (reduced) { state.p = i; draw(); return; }
      // about a pixel and a quarter at the size the heading is drawn
      const px = svg.getBoundingClientRect().height / (frame.h / type.unitsPerEm);
      cell = morph.cellFor(px || 72);
      tween = gsap.to(state, {
        p: i,
        duration: duration * Math.abs(i - state.p),
        ease,
        onUpdate: draw,
        onComplete: () => { tween = null; draw(); },
      });
    },
    get shown() { return target; },
    dispose() {
      gone = true;
      tween?.kill();
      tween = null;
    },
  };
}

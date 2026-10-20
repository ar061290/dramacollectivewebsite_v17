// The banner along the bottom of the screen, after houseofheat.co's ticker: the mark, one line
// rolling right to left ("India’s first independent, student-run theatre publication"), and the
// ways to write for us and to sponsor us. tools/pages/build.mjs writes it into the publication and
// each of its reading pages (<!-- site:pubbanner -->); its place (sticky at the bottom until it docks
// on the footer) is all CSS (publication-banner.css); this rolls the line, on whichever page has it.
// The line is repeated after itself (the copies hidden from screen readers, which read it once)
// until the strip is covered with one to spare, and the row is moved left by one line's width,
// again and again, at a steady 40px a second: each time it comes round, the first copy stands
// exactly where the line stood, so there is no seam. Transforms only, one animation, and that one
// is the browser's own (a Web Animation of the transform): the compositor moves the row, and the
// page's thread does nothing for it from frame to frame. (Moving it from script, as before, cost
// a style recalculation and a layout on every frame of every page that has the banner.)
// It comes to rest while the pointer is on the bar or the keyboard is in it (easing down rather
// than stopping dead, and easing back up after), so the line can be read and a button pressed; on
// a touch screen a tap on the line holds it, and another lets it go. Reduced motion, or no script:
// it stands still, the line showing, faded at the edge. Where the strip is not shown (narrow
// phones: publication-banner.css) nothing rolls until it is.
import gsap from 'gsap';

const SPEED = 40; // px per second

/**
 * @param {{ reduced: boolean }} ctx  bootPage's context (only `reduced` is used)
 * @returns {() => void} cleanup
 */
export function setupTicker({ reduced }) {
  const bar = document.querySelector('[data-pub-ticker]');
  const strip = bar?.querySelector('.pub-ticker__strip');
  const track = strip?.querySelector('.pub-ticker__track');
  const line = track?.querySelector('.pub-ticker__item');
  const unshown = watchSponsor(bar);
  if (!line || reduced) return unshown;

  let loop = null; // the Web Animation rolling the row
  let duration = 0; // one line's travel, in ms
  let copies = [];
  let timer = 0;
  // what holds it still: the pointer on the bar, the keyboard in it, a tap
  const holds = new Set();
  // the loop's speed, 1 rolling and 0 at rest, eased between the two by GSAP (the only moments
  // the page's thread touches the animation)
  const rate = { value: 1 };

  const build = () => {
    // the row keeps its place: the same way through one line's travel as before the rebuild
    const progress = loop && duration ? ((loop.currentTime || 0) % duration) / duration : 0;
    loop?.cancel();
    loop = null;
    copies.forEach((c) => c.remove());
    copies = [];
    track.style.transform = '';
    if (!strip.clientWidth) return; // not shown (a narrow phone): nothing to roll
    // one line's width, to its copy's start: the distance the row travels before it repeats
    const first = line.cloneNode(true);
    first.setAttribute('aria-hidden', 'true');
    track.append(first);
    copies.push(first);
    const width = first.getBoundingClientRect().left - line.getBoundingClientRect().left;
    if (width < 1) return;
    for (let i = Math.ceil(strip.clientWidth / width); i > 0; i--) {
      const c = first.cloneNode(true);
      track.append(c);
      copies.push(c);
    }
    duration = (width / SPEED) * 1000;
    loop = track.animate(
      [{ transform: 'translateX(0px)' }, { transform: `translateX(${-width}px)` }],
      { duration, iterations: Infinity, easing: 'linear' },
    );
    loop.currentTime = progress * duration;
    loop.playbackRate = rate.value;
  };

  // the strip's width (a resize, or the strip shown again) or the line's (the type arriving late)
  // changes what is needed
  let seen = '';
  const ro = new ResizeObserver(() => {
    const key = `${Math.round(strip.clientWidth)}:${Math.round(line.getBoundingClientRect().width)}`;
    if (key === seen) return;
    seen = key;
    clearTimeout(timer);
    timer = setTimeout(build, loop ? 150 : 0);
  });
  ro.observe(strip);
  ro.observe(line);

  // easing to rest and back: down in .45s, up in .7s, never a jolt
  const settle = () => {
    if (!loop) return;
    const still = holds.size > 0;
    gsap.to(rate, {
      value: still ? 0 : 1,
      duration: still ? 0.45 : 0.7,
      ease: still ? 'power2.out' : 'power1.in',
      overwrite: true,
      onUpdate: () => { if (loop) loop.playbackRate = rate.value; },
    });
  };
  const hold = (why, on) => {
    if (on === holds.has(why)) return;
    if (on) holds.add(why); else holds.delete(why);
    settle();
  };

  const onEnter = (e) => { if (e.pointerType !== 'touch') hold('pointer', true); };
  const onLeave = (e) => { if (e.pointerType !== 'touch') hold('pointer', false); };
  const onFocusIn = () => hold('focus', true);
  const onFocusOut = (e) => { if (!bar.contains(e.relatedTarget)) hold('focus', false); };
  // a tap on the line (not a scroll that starts there) holds it, or lets it go
  let down = null;
  const onDown = (e) => { down = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null; };
  const onUp = (e) => {
    if (!down || e.pointerType !== 'touch') return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) hold('tap', !holds.has('tap'));
    down = null;
  };
  bar.addEventListener('pointerenter', onEnter);
  bar.addEventListener('pointerleave', onLeave);
  bar.addEventListener('focusin', onFocusIn);
  bar.addEventListener('focusout', onFocusOut);
  strip.addEventListener('pointerdown', onDown, { passive: true });
  strip.addEventListener('pointerup', onUp, { passive: true });

  return () => {
    clearTimeout(timer);
    ro.disconnect();
    bar.removeEventListener('pointerenter', onEnter);
    bar.removeEventListener('pointerleave', onLeave);
    bar.removeEventListener('focusin', onFocusIn);
    bar.removeEventListener('focusout', onFocusOut);
    strip.removeEventListener('pointerdown', onDown);
    strip.removeEventListener('pointerup', onUp);
    gsap.killTweensOf(rate);
    loop?.cancel();
    loop = null;
    copies.forEach((c) => c.remove());
    track.style.transform = '';
    unshown();
  };
}

/**
 * While the banner's own Become a sponsor is on the screen, the top bar's is put away (html
 * .has-banner-sponsor, components.css), so the page never shows the same button twice. Seen, not
 * merely there: on a narrow phone the banner's buttons may be hidden, and the bar's then stays.
 * @param {HTMLElement|null} bar  the banner
 * @returns {() => void} cleanup
 */
function watchSponsor(bar) {
  const button = bar?.querySelector('.pub-ticker__sponsor');
  const root = document.documentElement;
  if (!button) return () => {};
  const io = new IntersectionObserver(([e]) => {
    root.classList.toggle('has-banner-sponsor', e.isIntersecting && button.offsetWidth > 0);
  }, { threshold: 0.5 });
  io.observe(button);
  return () => { io.disconnect(); root.classList.remove('has-banner-sponsor'); };
}

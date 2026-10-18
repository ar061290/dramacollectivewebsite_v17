// The top bar on the publication and its reading pages: out of sight, and shown when it is wanted
// (publication.css, :is(.page--publication, .page--reading) .topbar). With a mouse or a pen it comes
// down as the pointer reaches the top of the screen, stays while the pointer is on it (or on its
// menus), and goes back up a moment after the pointer leaves. On a touch screen, where nothing
// hovers, it comes down as the page is scrolled back up and goes as it is scrolled on down. From the
// keyboard it comes down as the focus enters it, stays while the focus is in it and goes as the focus
// leaves it. While one of its menus is open (Our outputs, or the Menu sheet on narrow screens) it
// stays. A click or a tap on one of its buttons leaves the focus there, but only the keyboard's focus
// holds the bar or sends it away. With a mouse or a pen, the top edge is a strip of the page's own
// (publication.css, .peek-edge), so a frame under it cannot keep the pointer from calling the bar.
// Anything hanging from the bar that the pointer may go to holds it down too ([data-holds-bar]: the
// earring on the theme switch, src/ui/earrings.js), while the pointer is on it: on its own outline
// (the browser's hit test, which keeps to a clip-path), not anywhere in its box. During the theme's
// switch the page is only a picture and the browser finds nothing under the pointer, so then it is
// found by its box. When it goes away (it sends 'hanger:gone'), the bar looks again at where the
// pointer last was, and goes up if that is not on the bar.
const EDGE = 56; // px from the top of the screen that call the bar down
const LINGER = 450; // ms the bar stays after the pointer has left it

/** @returns {() => void} cleanup */
export function setupPeekBar() {
  const bar = document.querySelector('[data-topbar]');
  if (!bar) return () => {};
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const edge = document.createElement('div');
  edge.className = 'peek-edge';
  edge.setAttribute('aria-hidden', 'true');
  document.body.append(edge);
  let timer = 0; // the bar's going back up, while it waits
  let pointerIn = false;
  let keyFocus = false;
  const menuOpen = () => !!bar.querySelector('[aria-expanded="true"]');
  const keyed = () => !!bar.querySelector(':focus-visible');
  const show = () => { clearTimeout(timer); timer = 0; bar.classList.add('is-peek'); };
  const hideSoon = (ms = LINGER) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      if (pointerIn || menuOpen() || keyed()) return;
      bar.classList.remove('is-peek');
      // the button last pressed goes with the bar, so no key works it out of sight
      if (bar.contains(document.activeElement)) document.activeElement.blur();
    }, ms);
  };

  // a mouse or a pen: the top edge calls it; on it (or its open menus) it stays, and a frame in the
  // page (the newsletter's form) lets the pointer through meanwhile (publication.css, .is-held), so
  // the page sees it leave
  const hold = (on) => { pointerIn = on; bar.classList.toggle('is-held', on); };
  const onHanger = (x, y) => {
    const hangers = [...document.querySelectorAll('[data-holds-bar]:not([hidden])')];
    if (!hangers.length) return false;
    if (!document.documentElement.classList.contains('is-theming')) {
      const under = document.elementsFromPoint(x, y);
      return hangers.some((el) => under.includes(el));
    }
    return hangers.some((el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  };
  let last = null; // where a mouse or a pen last was: { x, y }
  const judge = (x, y, target) => {
    hold(y <= EDGE || !!target?.closest?.('[data-topbar], [data-holds-bar]') || onHanger(x, y));
    if (pointerIn) show();
    // once, as the pointer leaves it: moving on over the page does not keep it down
    else if (bar.classList.contains('is-peek') && !timer) hideSoon();
  };
  const onMove = (e) => {
    if (e.pointerType === 'touch') return;
    last = { x: e.clientX, y: e.clientY };
    judge(e.clientX, e.clientY, e.target);
  };
  // something hanging from the bar has gone: the pointer, where it was, may no longer hold the bar
  const onHangerGone = () => {
    if (!last || !bar.classList.contains('is-peek')) return;
    judge(last.x, last.y, document.elementFromPoint(last.x, last.y));
  };
  const onLeaveWindow = (e) => {
    if (e.pointerType === 'touch') return; // a finger leaves after every tap
    hold(false);
    hideSoon();
  };

  // a finger: back up the page brings it, on down sends it away
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    if (fine.matches) return;
    if (dy < -6) show();
    else if (dy > 6 && !menuOpen()) { pointerIn = false; hideSoon(0); }
  };

  const onFocusIn = (e) => {
    keyFocus = !!e.target.matches?.(':focus-visible');
    if (keyFocus) show();
  };
  const onFocusOut = (e) => {
    if (bar.contains(e.relatedTarget) || !keyFocus) return;
    keyFocus = false;
    hideSoon();
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('hanger:gone', onHangerGone);
  document.documentElement.addEventListener('pointerleave', onLeaveWindow);
  window.addEventListener('scroll', onScroll, { passive: true });
  bar.addEventListener('focusin', onFocusIn);
  bar.addEventListener('focusout', onFocusOut);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('hanger:gone', onHangerGone);
    document.documentElement.removeEventListener('pointerleave', onLeaveWindow);
    window.removeEventListener('scroll', onScroll);
    bar.removeEventListener('focusin', onFocusIn);
    bar.removeEventListener('focusout', onFocusOut);
    bar.classList.remove('is-peek', 'is-held');
    edge.remove();
  };
}

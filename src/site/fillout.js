// The Collective's forms are Fillout forms, embedded with Fillout's standard embed: a
// [data-fillout-id] element that Fillout's script (server.fillout.com/embed/v1/) turns into an
// iframe, resized to the form as it grows (data-fillout-dynamic-resize) and handed this page's
// address parameters (data-fillout-inherit-parameters).
// The script is loaded here, once, after the page curtain has opened, so the form's iframe does not
// load in the middle of the curtain's move. Until the form is there its box keeps a height and says
// it is loading; a link to the same form on Fillout's own site stays beside it for anyone whose
// browser blocks the embed. As the form changes height (a longer answer, the thank-you page), the
// page's scroll-linked effects are measured again.
// The pointer going into the form goes into Fillout's own page, and its moves reach that page from
// then on, not this one. This page is told only that it went in (a move over the iframe, or the
// element it was over handing it to the iframe), so it is then told the pointer has left it, as when
// it leaves the window: the star the page draws over a text box (src/animations/cursor.js) and the
// sky's light round the pointer go, rather than stay standing at the form's edge.
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

const SRC = 'https://server.fillout.com/embed/v1/';
let loading = null;

const loadScript = () => {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('The form could not be loaded.'));
    document.body.append(s);
  });
  return loading;
};

/**
 * @param {HTMLElement} host   the [data-fillout-id] element, inside its framing box
 * @param {object} o
 * @param {Promise} o.opened   resolves once the page curtain has opened (bootPage)
 * @param {string} o.title     the iframe's accessible name, e.g. 'Application form'
 * @returns {() => void}       cleanup
 */
export function embedFillout(host, { opened, title }) {
  if (!host) return () => {};
  const box = host.closest('[data-form]') ?? host.parentElement;
  box?.classList.add('is-loading');

  // name the iframe for screen readers (Fillout names it with the form's id, which says nothing to a
  // listener), and mark the box ready, once Fillout has put it in
  const mo = new MutationObserver(() => {
    const frame = host.querySelector('iframe');
    if (!frame) return;
    frame.title = title;
    // once it is there, the loading line goes from what a screen reader reads too, not only from view
    frame.addEventListener('load', () => {
      box?.classList.replace('is-loading', 'is-ready');
      const status = box?.querySelector('.form-box__status');
      if (status) status.textContent = '';
    }, { once: true });
    mo.disconnect();
  });
  mo.observe(host, { childList: true, subtree: true });

  // the page below the form moves as it grows: measure the scroll-linked effects again, once it
  // has settled
  let t = 0;
  let lastHeight = -1;
  const ro = new ResizeObserver(([entry]) => {
    const h = Math.round(entry.contentRect.height);
    if (Math.abs(h - lastHeight) < 2) return; // the first call, or a width-only change: nothing below has moved
    lastHeight = h;
    clearTimeout(t);
    t = setTimeout(() => ScrollTrigger.refresh(), 250);
  });
  ro.observe(host);

  // the pointer into the form: this page is left (a moment later, once that move's own handlers have
  // run, which would otherwise put the drawn star back)
  let lt = 0;
  const intoFrame = (el) => el?.tagName === 'IFRAME' && host.contains(el);
  const onPointer = (e) => {
    if (e.pointerType === 'touch') return;
    if (!intoFrame(e.type === 'pointerout' ? e.relatedTarget : e.target)) return;
    clearTimeout(lt);
    lt = setTimeout(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave', { pointerType: e.pointerType })));
  };
  for (const type of ['pointerover', 'pointermove', 'pointerout']) document.addEventListener(type, onPointer, { passive: true });

  let alive = true;
  Promise.resolve(opened).then(() => alive && loadScript()).catch(() => {
    box?.classList.replace('is-loading', 'is-failed');
    // said where it can be read (the line with the link to the form on Fillout's own site), and to a
    // screen reader through the status line
    const failed = 'The form could not be loaded here.';
    const status = box?.querySelector('.form-box__status');
    if (status) status.textContent = failed;
    const alt = box?.querySelector('.form-box__alt');
    if (alt?.firstChild?.nodeType === Node.TEXT_NODE) alt.firstChild.data = `${failed} `;
  });

  return () => {
    alive = false;
    mo.disconnect();
    ro.disconnect();
    clearTimeout(t);
    clearTimeout(lt);
    for (const type of ['pointerover', 'pointermove', 'pointerout']) document.removeEventListener(type, onPointer);
  };
}

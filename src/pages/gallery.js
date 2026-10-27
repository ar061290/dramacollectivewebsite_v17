// The Gallery (gallery.html, written by tools/pages/build.mjs from content/gallery.json): a section an
// event, each with its pictures as tiles. A tile is a link to the picture whole; here it opens in a
// lightbox instead (a native <dialog>: Escape or a click beside the picture closes it, and the focus
// goes back to the tile), which steps through that event's pictures with the arrows, the arrow keys
// or a swipe, fetching the next one ahead. Clips are short and silent: each plays while it is on
// screen and stops when it leaves (with reduced motion, not by itself: it has its controls instead).
// A film plays only when asked (its controls; preload="none", so nothing of it loads before).
import { bootPage } from '../site/boot.js';

bootPage((ctx) => {
  const cleanups = [setupBox(), setupClips(ctx), setupDriveFilms()];
  return () => cleanups.forEach((c) => c?.());
});

/** A film kept on Google Drive: its player is put in only once Play is pressed (until then the page
 * fetches nothing of it). @returns {() => void} cleanup */
function setupDriveFilms() {
  const onClick = (e) => {
    const play = e.target.closest?.('[data-gal-play]');
    const frame = play?.closest('[data-gal-drive]');
    if (!frame || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const player = document.createElement('iframe');
    player.className = 'gal-film__player';
    player.src = `https://drive.google.com/file/d/${encodeURIComponent(frame.dataset.galDrive)}/preview`;
    player.title = frame.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || 'The film';
    player.allow = 'autoplay; fullscreen';
    player.allowFullscreen = true;
    frame.replaceChildren(player);
    frame.classList.add('is-playing');
    player.focus();
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

/** The lightbox. @returns {() => void} cleanup */
function setupBox() {
  const box = document.querySelector('[data-gal-box]');
  const img = box?.querySelector('[data-gal-box-img]');
  const caption = box?.querySelector('[data-gal-box-caption]');
  if (!box || !img || !caption) return () => {};
  const prev = box.querySelector('[data-gal-prev]');
  const next = box.querySelector('[data-gal-next]');
  const close = box.querySelector('[data-gal-close]');
  let links = [];
  let at = 0;
  let opener = null;

  const show = (i) => {
    at = (i + links.length) % links.length;
    const a = links[at];
    const thumb = a.querySelector('img');
    // the tile's own small picture stands in at once (it is loaded), and the whole one replaces it
    img.src = thumb.currentSrc || thumb.src;
    img.width = +a.dataset.w;
    img.height = +a.dataset.h;
    img.alt = thumb.alt;
    const whole = new Image();
    whole.onload = () => { if (links[at] === a) img.src = a.href; };
    whole.src = a.href;
    caption.textContent = thumb.alt;
    const many = links.length > 1;
    prev.hidden = !many;
    next.hidden = !many;
    // the next picture, fetched ahead
    if (many) new Image().src = links[(at + 1) % links.length].href;
  };

  const onClick = (e) => {
    const a = e.target.closest?.('[data-gal-photo]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    links = [...a.closest('[data-gal-event]').querySelectorAll('[data-gal-photo]')];
    opener = a;
    show(links.indexOf(a));
    box.showModal();
    // the focus on the lightbox itself, not its first button (the arrow keys work from there)
    box.focus();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
  };
  // a click on the backdrop (the dialog itself, outside the picture and the buttons) closes it
  const onBoxClick = (e) => { if (e.target === box || e.target === box.querySelector('.gal-box__figure')) box.close(); };
  // a swipe across the picture: to the left for the next, to the right for the one before
  let x0 = null;
  const onDown = (e) => { x0 = e.isPrimary ? e.clientX : null; };
  const onUp = (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 48 && links.length > 1) show(at + (dx < 0 ? 1 : -1));
  };
  const onPrev = () => show(at - 1);
  const onNext = () => show(at + 1);
  const onClose = () => box.close();
  // closed, the focus goes back to the tile it was opened from
  const onClosed = () => { img.removeAttribute('src'); opener?.focus({ preventScroll: true }); };

  document.addEventListener('click', onClick);
  box.addEventListener('keydown', onKey);
  box.addEventListener('click', onBoxClick);
  img.addEventListener('pointerdown', onDown);
  img.addEventListener('pointerup', onUp);
  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  close.addEventListener('click', onClose);
  box.addEventListener('close', onClosed);
  return () => {
    document.removeEventListener('click', onClick);
    box.removeEventListener('keydown', onKey);
    box.removeEventListener('click', onBoxClick);
    img.removeEventListener('pointerdown', onDown);
    img.removeEventListener('pointerup', onUp);
    prev.removeEventListener('click', onPrev);
    next.removeEventListener('click', onNext);
    close.removeEventListener('click', onClose);
    box.removeEventListener('close', onClosed);
    if (box.open) box.close();
  };
}

/** The clips: each plays while on screen. @returns {() => void} cleanup */
function setupClips({ reduced }) {
  const clips = [...document.querySelectorAll('[data-gal-clip]')];
  if (!clips.length) return () => {};
  if (reduced || !('IntersectionObserver' in window)) {
    clips.forEach((v) => { v.controls = true; });
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      if (isIntersecting) v.play().catch(() => { v.controls = true; });
      else v.pause();
    }
  }, { threshold: 0.4 });
  clips.forEach((v) => io.observe(v));
  return () => { io.disconnect(); clips.forEach((v) => v.pause()); };
}

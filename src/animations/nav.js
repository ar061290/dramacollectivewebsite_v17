// Top bar: hides on scroll down, returns on scroll up, gains the blurred ground once scrolled.
// Each page link opens its own page (the curtain between pages is src/site/transition.js). On wide
// screens a gold rule slides under the link the pointer is on and rests under the current page;
// on narrow ones the Menu drops a full-screen sheet like a curtain and the pages rise into it.
// Same-page anchors (the home page's) still scroll smoothly and move focus to their target.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

export function setupNav({ reduced }) {
  const root = document.documentElement;
  const bar = document.querySelector('[data-topbar]');
  if (!bar) return () => {};
  const toggle = bar.querySelector('[data-menu-toggle]');
  const sheet = bar.querySelector('[data-menu-sheet]');
  const sheetLinks = [...sheet.querySelectorAll('a')];
  let menuOpen = false;
  let sheetTl = null;

  const setMenu = (open) => {
    if (open === menuOpen) return;
    menuOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Menu';
    root.classList.toggle('is-locked', open);
    if (open) bar.classList.remove('is-hidden');
    sheetTl?.kill();
    if (open) {
      sheet.classList.add('is-open');
      sheetTl = reduced
        ? gsap.timeline().set(sheet, { clipPath: 'none' }).set(sheetLinks, { yPercent: 0, autoAlpha: 1 })
        : gsap.timeline({ defaults: { ease: 'curtain' } })
          .fromTo(sheet, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.45 })
          .fromTo(sheetLinks, { yPercent: 110, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, stagger: 0.04 }, 0.12);
    } else {
      sheetTl = gsap.timeline({ onComplete: () => sheet.classList.remove('is-open') })
        .to(sheet, { clipPath: 'inset(0 0 100% 0)', duration: reduced ? 0 : 0.28, ease: 'power2.in' });
    }
  };
  const onToggle = () => setMenu(!menuOpen);
  const onKey = (e) => { if (e.key === 'Escape' && menuOpen) { setMenu(false); toggle.focus(); } };
  toggle.addEventListener('click', onToggle);
  window.addEventListener('keydown', onKey);
  // the sheet only exists below the wide layout: close it if the window grows past it
  const wide = matchMedia('(min-width: 1240px)');
  const onWide = () => { if (wide.matches) setMenu(false); };
  wide.addEventListener('change', onWide);

  const scrollWatch = ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      bar.classList.toggle('is-scrolled', y > 24);
      if (menuOpen) return;
      if (self.direction === 1 && y > 160) bar.classList.add('is-hidden');
      else if (self.direction === -1) bar.classList.remove('is-hidden');
    },
  });
  const onFocusIn = () => bar.classList.remove('is-hidden');
  bar.addEventListener('focusin', onFocusIn);

  // the sliding rule under the page links
  const nav = bar.querySelector('.topbar__nav');
  const glint = nav?.querySelector('.topbar__glint');
  const links = nav ? [...nav.querySelectorAll('.topbar__links a')] : [];
  const here = links.find((a) => a.getAttribute('aria-current') === 'page');
  let glintCleanup = () => {};
  if (glint && links.length) {
    root.classList.add('has-glint');
    const dur = reduced ? 0 : 0.42;
    const qx = gsap.quickTo(glint, 'x', { duration: dur, ease: 'power3.out' });
    const qw = gsap.quickTo(glint, 'scaleX', { duration: dur, ease: 'power3.out' });
    const navLeft = () => nav.getBoundingClientRect().left;
    const place = (a, instant) => {
      const r = a.getBoundingClientRect();
      if (instant) gsap.set(glint, { x: r.left - navLeft(), scaleX: r.width });
      else { qx(r.left - navLeft()); qw(r.width); }
      gsap.to(glint, { opacity: 1, duration: reduced ? 0 : 0.2, overwrite: 'auto' });
    };
    const rest = () => {
      if (here) place(here);
      else gsap.to(glint, { opacity: 0, duration: reduced ? 0 : 0.25, overwrite: 'auto' });
    };
    const onEnter = (e) => place(e.currentTarget);
    links.forEach((a) => { a.addEventListener('pointerenter', onEnter); a.addEventListener('focus', onEnter); });
    nav.addEventListener('pointerleave', rest);
    nav.addEventListener('focusout', rest);
    // wait for the fonts, so the widths are the real ones
    const settle = () => { if (here) place(here, true); };
    document.fonts.ready.then(settle);
    window.addEventListener('resize', settle);
    glintCleanup = () => {
      links.forEach((a) => { a.removeEventListener('pointerenter', onEnter); a.removeEventListener('focus', onEnter); });
      nav.removeEventListener('pointerleave', rest);
      nav.removeEventListener('focusout', rest);
      window.removeEventListener('resize', settle);
      root.classList.remove('has-glint');
    };
  }

  // same-page anchors: smooth scroll and focus (the home page's acts)
  const onClick = (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#' ? null : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    gsap.to(window, {
      duration: reduced ? 0 : 1.2,
      ease: 'power2.inOut',
      scrollTo: { y: target, autoKill: true },
      onComplete: () => {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        history.replaceState(null, '', id);
      },
    });
  };
  document.addEventListener('click', onClick);

  return () => {
    scrollWatch.kill();
    sheetTl?.kill();
    glintCleanup();
    toggle.removeEventListener('click', onToggle);
    window.removeEventListener('keydown', onKey);
    wide.removeEventListener('change', onWide);
    bar.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('click', onClick);
    root.classList.remove('is-locked');
  };
}

// Top bar: glides up out of view on scroll down (Apply now and Become a sponsor stay), comes back
// down on scroll up, gains the blurred ground once scrolled.
// Our outputs is a menu that drops from its button on hover (fine pointers), focus or click.
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
    // the page under the sheet is told when the sheet covers it and when it is about to lift (the
    // sky and the stage rest meanwhile: nothing of them can be seen)
    const tell = (what) => document.dispatchEvent(new CustomEvent('dc:menu', { detail: what }));
    if (!open) tell('uncovered');
    if (open) {
      sheet.classList.add('is-open');
      sheetTl = reduced
        ? gsap.timeline({ onComplete: () => tell('covered') }).set(sheet, { clipPath: 'none' }).set(sheetLinks, { yPercent: 0, autoAlpha: 1 })
        : gsap.timeline({ defaults: { ease: 'curtain' }, onComplete: () => tell('covered') })
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
  // the sheet only exists below the wide layout: close it if the window grows past it (the CSS's own
  // query, negated, so a window between 1149 and 1150 px, as at 125%, is on one side or the other)
  const wide = matchMedia('not all and (max-width: 1149px)');
  const onWide = () => { if (wide.matches) setMenu(false); };
  wide.addEventListener('change', onWide);

  // Scrolling down, the bar glides up out of view but for its two buttons, which stay where they
  // are (CSS)
  const hide = () => bar.classList.add('is-hidden');
  // Once the bar has gone, the two buttons fade out where they stand (CSS is-curtain) wherever
  // something must not lie under them: the home page's footer, which can be taller than the screen
  // (its columns would scroll up under them), and a form (src/site/fillout.js), whose fields would
  // otherwise pass under them, so that a tap meant for a field would take the visitor off the page
  // and lose what they had typed. They come back when it has gone by, or with the bar.
  const under = new Set();
  const covering = (el, on) => {
    if (on) under.add(el); else under.delete(el);
    bar.classList.toggle('is-curtain', under.size > 0);
  };
  const home = document.querySelector('.curtain--home');
  const curtainWatches = [
    ...(home ? [ScrollTrigger.create({
      trigger: home,
      start: () => `top ${bar.offsetHeight}px`,
      end: 'bottom top', // never reached (the page ends first), so it stays on to the very end
      onToggle: (self) => covering(home, self.isActive),
    })] : []),
    ...[...document.querySelectorAll('[data-form]')].map((form) => ScrollTrigger.create({
      trigger: form,
      start: () => `top ${bar.offsetHeight}px`,
      end: 'bottom top',
      onToggle: (self) => covering(form, self.isActive),
    })),
  ];
  const scrollWatch = ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      // a re-measure of the page (a resize, or a form growing: src/site/fillout.js) briefly scrolls it
      // to the top and back; that is not the visitor scrolling up, so the bar stays as it is
      if (ScrollTrigger.isRefreshing) return;
      const y = self.scroll();
      bar.classList.toggle('is-scrolled', y > 24);
      if (menuOpen) return;
      if (self.direction === 1 && y > 160) hide();
      else if (self.direction === -1) bar.classList.remove('is-hidden');
    },
  });
  const onFocusIn = () => bar.classList.remove('is-hidden');
  bar.addEventListener('focusin', onFocusIn);

  // the sliding rule under the page links
  const nav = bar.querySelector('.topbar__nav');
  const glint = nav?.querySelector('.topbar__glint');
  // the top-level items: the links and the Our outputs button (its pages are in its menu)
  const links = nav ? [...nav.querySelectorAll('.topbar__links > li > a, .topbar__group-toggle')] : [];
  const here = links.find((a) => a.getAttribute('aria-current') === 'page' || a.classList.contains('is-current'));
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

  const dropdownCleanup = setupDropdowns(bar, { reduced });

  // same-page anchors: smooth scroll and focus (the home page's acts)
  const onClick = (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented) return; // (a page's own handler has taken this one)
    const id = a.getAttribute('href');
    const target = id === '#' ? null : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    gsap.to(window, {
      duration: reduced ? 0 : 1.2,
      ease: 'power2.inOut',
      // (landing where the browser's own jump would: clear of the bar by the target's scroll-margin)
      scrollTo: { y: target, offsetY: parseFloat(getComputedStyle(target).scrollMarginTop) || 0, autoKill: true },
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
    curtainWatches.forEach((w) => w.kill());
    bar.classList.remove('is-hidden', 'is-curtain');
    sheetTl?.kill();
    glintCleanup();
    dropdownCleanup();
    toggle.removeEventListener('click', onToggle);
    window.removeEventListener('keydown', onKey);
    wide.removeEventListener('change', onWide);
    bar.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('click', onClick);
    root.classList.remove('is-locked');
  };
}

/**
 * The top bar's menus (Our outputs): open on hover with a fine pointer (after a short pause, so a
 * pointer passing over does not open it), on click or Enter, and from the keyboard; close on
 * leaving, on Escape (focus back on the button), on a click elsewhere, when focus leaves, or when
 * the page scrolls (the bar hides as it does).
 * The menu drops like the curtain: a clip from the top, its pages rising in after it.
 */
function setupDropdowns(bar, { reduced }) {
  const groups = [...bar.querySelectorAll('[data-dropdown]')];
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const offs = groups.map((group) => {
    const button = group.querySelector('.topbar__group-toggle');
    const menu = group.querySelector('[data-dropdown-menu]');
    const items = [...menu.querySelectorAll('a')];
    let open = false, tl = null, hoverTimer = 0;
    const set = (want, { focusButton = false } = {}) => {
      clearTimeout(hoverTimer);
      if (want === open) return;
      open = want;
      button.setAttribute('aria-expanded', String(open));
      tl?.kill();
      if (open) {
        group.classList.add('is-open');
        tl = reduced
          ? gsap.timeline().set(menu, { clipPath: 'none' }).set(items, { autoAlpha: 1, y: 0 })
          : gsap.timeline({ defaults: { ease: 'curtain' } })
            .fromTo(menu, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.32 })
            .fromTo(items, { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.03 }, 0.06);
      } else {
        tl = gsap.timeline({ onComplete: () => group.classList.remove('is-open') })
          .to(menu, { clipPath: 'inset(0 0 100% 0)', duration: reduced ? 0 : 0.2, ease: 'power2.in' });
        if (focusButton) button.focus();
      }
    };
    const onClick = () => set(!open);
    const onEnter = () => { if (!fine.matches) return; clearTimeout(hoverTimer); hoverTimer = setTimeout(() => set(true), 80); };
    const onLeave = () => { if (!fine.matches) return; clearTimeout(hoverTimer); hoverTimer = setTimeout(() => set(false), 180); };
    const onKey = (e) => {
      if (e.key === 'Escape' && open) { e.stopPropagation(); set(false, { focusButton: true }); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) set(true);
        const i = items.indexOf(document.activeElement);
        items[Math.min(items.length - 1, i + 1)].focus();
      }
      if (e.key === 'ArrowUp' && open) {
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        if (i <= 0) button.focus(); else items[i - 1].focus();
      }
    };
    const onFocusOut = (e) => { if (!group.contains(e.relatedTarget)) set(false); };
    const onDocClick = (e) => { if (open && !group.contains(e.target)) set(false); };
    // the bar hides as the page scrolls down: the menu goes with it
    const onScroll = () => { if (open) set(false); };
    window.addEventListener('scroll', onScroll, { passive: true });
    button.addEventListener('click', onClick);
    group.addEventListener('pointerenter', onEnter);
    group.addEventListener('pointerleave', onLeave);
    group.addEventListener('keydown', onKey);
    group.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onDocClick);
    return () => {
      clearTimeout(hoverTimer);
      tl?.kill();
      button.removeEventListener('click', onClick);
      group.removeEventListener('pointerenter', onEnter);
      group.removeEventListener('pointerleave', onLeave);
      group.removeEventListener('keydown', onKey);
      group.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onScroll);
    };
  });
  return () => offs.forEach((off) => off());
}

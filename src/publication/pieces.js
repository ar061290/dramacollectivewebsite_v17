// The pieces: houseofheat.co's Upcoming Releases and Latest News in one section, switched by one
// toggle. Dropped (the default, on every load) shows the latest pieces as a grid of cards (at most
// LATEST_SHOWN of them, then "All the pieces", pieces.html), each one link to its own page; Upcoming
// shows the pieces still to come as a list beside the live statue, standing on the page in a beam
// of the stage's light. The heading turns between "Latest pieces" and "Upcoming pieces" as the
// font's own outlines, the About us page's morph (src/type/morphHeading.js) played in time, while
// the old layout sinks away and the new one rises into place. A filter by form (essay, one-act
// play, ...) applies to both.
//
// The list stands still and fades away at its foot, so it reads as more than the screen holds (it
// never scrolls on its own: the page does); the rows cut off past its foot are taken out of the
// keyboard's way. "Remind me" goes to the newsletter on this page (#news): a glide there
// (at once with reduced motion), and the keyboard's focus to its heading.
//
// The pieces come from src/publication/pieces-data.js, and their markup from
// src/publication/cards.js (pieces.html uses the same cards). The page's own markup holds the
// latest pieces as cards too, so visitors without scripts still see them (this replaces it with the
// same thing, drawn from the data).
//
// With reduced motion the heading and the layout change at once.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import HEADS from '../../assets/type/publication-heads.js';
import { PIECES, PUBLISHED, LATEST_SHOWN } from './pieces-data.js';
const PHONE_SHOWN = 3; // the latest pieces a phone's grid shows before All the pieces
import { pieceCard, pieceRow, esc } from './cards.js';
import { morphHeading } from '../type/morphHeading.js';
import { mountStatue } from './statue.js';

// each mode: its heading (as in assets/type/publication-heads.js) and the word for the status line
const MODES = {
  latest: { head: 'Latest pieces', word: 'latest' },
  upcoming: { head: 'Upcoming pieces', word: 'upcoming' },
};
const HEAD_INDEX = Object.keys(HEADS.words);

// the latest pieces, newest issue first, each issue in its own order (PUBLISHED runs oldest first)
const issueRank = (issue) => PUBLISHED.findIndex((p) => p.issue === issue);
const LATEST = [...PUBLISHED].sort((a, b) => issueRank(b.issue) - issueRank(a.issue) || a.order - b.order);
const UPCOMING = PIECES.filter((p) => p.status === 'upcoming');
const ALL = { latest: LATEST, upcoming: UPCOMING };

const empty = (mode, form) => `<li class="pub-pieces__empty">No ${MODES[mode].word} pieces in “${esc(form)}” yet. <button type="button" class="pub-pieces__reset" data-pieces-reset>Show all forms</button></li>`;

/** @param {{ reduced: boolean, sky: any, onTheme: Function, opened: Promise }} ctx  bootPage's context */
export function setupPieces({ reduced, onTheme, opened }) {
  const root = document.querySelector('[data-pub-pieces]');
  if (!root) return undefined;
  const title = root.querySelector('.pub-pieces__title');
  const titleText = root.querySelector('[data-pieces-title]');
  const word = root.querySelector('.pub-pieces__word');
  const toggle = root.querySelector('[data-pieces-toggle]');
  const sides = [...root.querySelectorAll('[data-side]')];
  const filter = root.querySelector('[data-pieces-filter]');
  const filterBtn = filter.querySelector('.pub-pieces__filter-btn');
  const filterValue = filter.querySelector('[data-pieces-filter-value]');
  const panel = filter.querySelector('.pub-pieces__forms');
  const status = root.querySelector('[data-pieces-status]');
  const stage = root.querySelector('[data-pieces-stage]');
  const views = { latest: root.querySelector('[data-pieces-view="latest"]'), upcoming: root.querySelector('[data-pieces-view="upcoming"]') };
  const lists = { latest: root.querySelector('[data-pieces-grid]'), upcoming: root.querySelector('[data-pieces-list]') };
  const slot = root.querySelector('.pub-pieces__statue');
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

  let mode = 'latest';
  let form = null; // null: all forms
  let statue = null;
  let swap = null; // the running layout change
  let refreshCall = null;

  // ---- the filter's chips: All forms, then every form in the data ----
  const forms = [...new Set(PIECES.map((p) => p.form).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-IN'));
  panel.innerHTML = [null, ...forms].map((f) => `<button type="button" class="pub-pieces__chip" data-form="${f === null ? '' : esc(f)}" aria-pressed="${f === null}">${f === null ? 'All forms' : esc(f)}</button>`).join('');
  const chips = [...panel.querySelectorAll('.pub-pieces__chip')];

  // ---- the list's foot: faded when there is more than it holds; the rows past it out of reach ----
  const list = lists.upcoming;
  let fadeFrame = 0;
  const fade = () => {
    fadeFrame = 0;
    list.classList.toggle('is-fits', list.scrollHeight - list.clientHeight <= 1); // all of it shows: no fade
    const foot = list.getBoundingClientRect().bottom;
    for (const row of list.children) row.inert = row.getBoundingClientRect().top >= foot - 8;
  };
  const fadeSoon = () => { fadeFrame ||= requestAnimationFrame(fade); };
  on(window, 'resize', fadeSoon, { passive: true });
  cleanups.push(() => cancelAnimationFrame(fadeFrame));

  // ---- drawing the pieces ----
  const shownIn = (m) => ALL[m].filter((p) => !form || p.form === form);
  const draw = (m) => {
    const items = shownIn(m);
    lists[m].innerHTML = items.length
      ? (m === 'latest'
        ? items.slice(0, LATEST_SHOWN).map((p) => pieceCard(p)).join('')
        : items.map((p) => pieceRow(p, { next: p === items.find((q) => q.issue !== 'TBA') })).join(''))
      : empty(m, form);
    if (m === 'upcoming') fadeSoon();
    return items.length;
  };
  const say = () => {
    const n = shownIn(mode).length;
    // (on a phone the grid shows three: publication-pieces.css)
    const most = matchMedia('(max-width: 767px)').matches ? PHONE_SHOWN : LATEST_SHOWN;
    const shown = mode === 'latest' ? Math.min(n, most) : n;
    status.textContent = `Showing ${shown < n ? `${shown} of ${n}` : n} ${MODES[mode].word} ${n === 1 ? 'piece' : 'pieces'}${form ? `: ${form}` : ''}.`;
  };
  draw('latest');
  draw('upcoming');

  // ---- the heading: the font's outlines, morphing; the real text stays for screen readers ----
  const heading = morphHeading(word, { type: HEADS, reduced, opened, start: HEAD_INDEX.indexOf(MODES.latest.head) });
  title.classList.add('is-drawn');
  cleanups.push(() => heading.dispose());

  // ---- the layout change: the old view sinks and fades, the section eases to the new height and
  // the new view rises into place (curtain-like, no overshoot), its items a beat apart ----
  const refresh = () => {
    // what follows the section has moved: the page's scroll-linked parts measure again, once
    refreshCall?.kill();
    refreshCall = gsap.delayedCall(0.1, () => ScrollTrigger.refresh());
  };
  // what rises in, a beat apart: the cards and the way to all of them, or the statue and the rows
  const items = (el) => el.querySelectorAll('.pub-piece, .pub-row, .pub-pieces__empty, .pub-pieces__panel, .pub-pieces__more');
  // what a change of form redraws (the statue stays as he is)
  const redrawn = (el) => el.querySelectorAll('.pub-piece, .pub-row, .pub-pieces__empty');
  let settle = null; // brings the running change to its end at once (a second flip mid-change)
  /**
   * Show `to` in place of `from`: one view for the other, or (from === to, a list) the same list
   * with its pieces redrawn by `redraw`.
   */
  const change = (from, to, redraw) => {
    settle?.();
    let placed = false;
    const place = () => {
      placed = true;
      redraw?.();
      if (from !== to) { from.hidden = true; to.hidden = false; }
      fadeSoon();
    };
    if (reduced) { place(); refresh(); return; }
    settle = () => {
      settle = null;
      swap?.kill();
      swap = null;
      if (!placed) place();
      gsap.set([stage, from, to], { clearProps: 'height,overflow,opacity,visibility,transform' });
      gsap.set(items(to), { clearProps: 'opacity,visibility,transform' });
      refresh();
    };
    const h0 = stage.offsetHeight;
    swap = gsap.to(from === to ? redrawn(from) : from, {
      autoAlpha: 0, y: 10, duration: 0.22, ease: 'power2.in', stagger: from === to ? 0.015 : 0,
      onComplete: () => {
        // hold the section at its height while the views change places, then ease it to its new
        // height as the new view rises in (clipped, so it comes up as from behind a sill)
        place();
        gsap.set(from, { clearProps: 'opacity,visibility,transform' });
        gsap.set(to, { autoAlpha: 0 });
        stage.style.height = '';
        const h1 = stage.offsetHeight;
        gsap.set(stage, { height: h0, overflow: 'clip' });
        swap = gsap.timeline({ onComplete: () => settle?.() })
          .to(stage, { height: h1, duration: 0.6, ease: 'curtain' }, 0)
          .fromTo(to, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'curtain' }, 0)
          .fromTo(items(to), { y: 18 }, { y: 0, duration: 0.55, ease: 'curtain', stagger: 0.04 }, 0);
      },
    });
  };

  // ---- the toggle: Dropped (on) is the latest pieces as a grid; Upcoming (off), the list ----
  const setMode = (next, { instant = false } = {}) => {
    const was = mode;
    mode = next;
    toggle.checked = next === 'latest';
    sides.forEach((s) => s.classList.toggle('is-on', s.dataset.side === (next === 'latest' ? 'dropped' : 'upcoming')));
    titleText.textContent = MODES[next].head;
    if (instant) { views.latest.hidden = next !== 'latest'; views.upcoming.hidden = next !== 'upcoming'; return; }
    if (next === was) return;
    closeForms(false);
    heading.show(HEAD_INDEX.indexOf(MODES[next].head));
    // the statue is made the first time the list shows, and kept after that
    if (next === 'upcoming' && !statue && slot) statue = mountStatue(slot, { reduced, opened, onTheme, lazy: true });
    change(views[was], views[next]);
    say();
  };
  // the page always opens on the latest pieces, whatever the browser restored into the checkbox
  setMode('latest', { instant: true });
  on(toggle, 'change', () => setMode(toggle.checked ? 'latest' : 'upcoming'));
  sides.forEach((s) => on(s, 'click', () => setMode(s.dataset.side === 'dropped' ? 'latest' : 'upcoming')));

  // ---- the filter: a button that drops a panel of chips ----
  let openTween = null;
  const isOpen = () => filterBtn.getAttribute('aria-expanded') === 'true';
  function openForms() {
    filterBtn.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    openTween?.kill();
    // opacity, not autoAlpha: the chips must stay focusable while the panel fades in
    openTween = reduced ? null : gsap.fromTo(panel, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
    (chips.find((c) => c.getAttribute('aria-pressed') === 'true') ?? chips[0]).focus({ preventScroll: true });
    // the whole panel in view, clear of the bottom banner (scroll-padding in publication.css)
    panel.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  function closeForms(returnFocus) {
    if (!isOpen()) return;
    filterBtn.setAttribute('aria-expanded', 'false');
    openTween?.kill();
    openTween = null;
    if (reduced) panel.hidden = true;
    else openTween = gsap.to(panel, { opacity: 0, y: -4, duration: 0.15, ease: 'power2.in', onComplete: () => { panel.hidden = true; gsap.set(panel, { clearProps: 'all' }); } });
    if (returnFocus) filterBtn.focus();
  }
  const choose = (f) => {
    if (f === form) return;
    form = f;
    chips.forEach((c) => c.setAttribute('aria-pressed', String((c.dataset.form || null) === form)));
    filterValue.textContent = form ?? 'Form';
    filter.classList.toggle('is-set', !!form);
    // the view on show changes in place; the other is redrawn as it is, out of sight
    const other = mode === 'latest' ? 'upcoming' : 'latest';
    draw(other);
    change(lists[mode], lists[mode], () => draw(mode));
    say();
  };
  on(filterBtn, 'click', () => (isOpen() ? closeForms(false) : openForms()));
  on(panel, 'click', (e) => {
    const chip = e.target.closest('.pub-pieces__chip');
    if (!chip) return;
    choose(chip.dataset.form || null);
    closeForms(true);
  });
  on(root, 'click', (e) => { if (e.target.closest('[data-pieces-reset]')) { choose(null); filterBtn.focus(); } });
  on(filter, 'keydown', (e) => { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); closeForms(true); } });
  // a click anywhere else, or the focus leaving the filter, closes it
  on(document, 'pointerdown', (e) => { if (isOpen() && !filter.contains(e.target)) closeForms(false); });
  on(filter, 'focusout', (e) => { if (isOpen() && e.relatedTarget && !filter.contains(e.relatedTarget)) closeForms(false); });

  // ---- Remind me: to the newsletter on this page, not away from it ----
  // (a plain #news link without scripts; here a glide, eased at both ends and longer the further it
  // goes; then the focus to the sign-up's heading, so the keyboard carries on from there). The glide
  // aims at where the panel is at each frame, not where it was when it set off: the form above may
  // still be loading and growing (Fillout sizes it once in), and the browser then shifts the page
  // under the glide. The visitor's own wheel, touch or keys stop it.
  let glide = null;
  const stopGlide = () => { glide?.kill(); glide = null; };
  const STOPS = ['wheel', 'touchstart', 'keydown'];
  const stopOn = (add) => STOPS.forEach((t) => window[add ? 'addEventListener' : 'removeEventListener'](t, stopGlide, { passive: true }));
  on(root, 'click', (e) => {
    const link = e.target.closest('[data-to-news]');
    const news = document.getElementById('news');
    if (!link || !news || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // ours, not the site's in-page glide (nav.js)
    const to = news.querySelector('.pub-news__panel') ?? news;
    const head = document.getElementById('news-title');
    const land = () => head?.focus({ preventScroll: true });
    stopGlide();
    if (reduced) {
      to.scrollIntoView({ block: 'start' });
      land();
      return;
    }
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const dest = () => to.getBoundingClientRect().top + window.scrollY - pad;
    const from = window.scrollY;
    const far = Math.abs(dest() - from);
    const run = { p: 0 };
    stopOn(true);
    glide = gsap.to(run, {
      p: 1,
      duration: 0.6 + 0.5 * Math.min(far, 2400) / 2400,
      ease: 'power2.inOut',
      onUpdate: () => window.scrollTo(0, from + (dest() - from) * run.p),
      onComplete: () => { glide = null; stopOn(false); land(); },
      onInterrupt: () => stopOn(false),
    });
  });
  cleanups.push(() => { stopGlide(); stopOn(false); });

  say();

  return () => {
    cleanups.forEach((c) => c());
    settle = null;
    swap?.kill();
    openTween?.kill();
    refreshCall?.kill();
    statue?.dispose();
  };
}

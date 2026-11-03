// Flash plays (flash-plays.html, written by tools/pages/build.mjs from content/flash-plays.json):
// beside the opening, the year's calendar a month at a time, the countdown to a play and the latest
// pictures; under it, the bill. Here, from the school's own date (the plays are in Hyderabad: India's
// time, UTC+05:30 all year): today ringed on the calendar, the days gone by quieter and a play gone by
// marked Played (its bulb out, its ticket's tag); the desk calendar opening on today's month, its
// pages turned over the spiral by the arrows under it, a swipe or the arrow keys; the
// countdown to the file's countdown play on its next date (else to the next play), to the start of that
// day; and the next play marked on the bill. All of it set again at India's midnight, and when the page
// comes back from the back/forward cache on another day. Without scripts the page is whole, only
// without these (the calendar scrolls on its own, the countdown shows its play's date). A picture opens
// whole in the Gallery's lightbox (src/ui/gallery.js).
import { bootPage } from '../site/boot.js';
import { setupBox } from '../ui/gallery.js';
import { setupCountdown } from '../sections/countdown.js';

const IST = 5.5 * 3600e3;
const DAY = 86400e3;
const schoolDay = () => new Date(Date.now() + IST).toISOString().slice(0, 10);

bootPage(({ reduced }) => {
  const months = setupMonths(schoolDay(), reduced);
  let today = '', timer = 0, stopCount = () => {};
  const refresh = () => {
    clearTimeout(timer);
    const now = schoolDay();
    if (now !== today) {
      today = now;
      markToday(today);
      stopCount();
      stopCount = setupCount(today, reduced);
    }
    timer = setTimeout(refresh, DAY - ((Date.now() + IST) % DAY) + 50); // just after India's next midnight
  };
  const onShow = (e) => { if (e.persisted) refresh(); };
  refresh();
  addEventListener('pageshow', onShow);
  const box = setupBox();
  return () => {
    clearTimeout(timer);
    removeEventListener('pageshow', onShow);
    stopCount();
    months();
    box();
  };
});

/** Today, the days and plays gone by, and the next play (each set from scratch, so it can run again on a new day). */
function markToday(today) {
  for (const d of document.querySelectorAll('[data-day]')) {
    const day = d.dataset.day;
    d.classList.toggle('is-past', day < today);
    d.classList.toggle('is-today', day === today);
    if (day === today) d.setAttribute('aria-current', 'date'); else d.removeAttribute('aria-current');
    // a play gone by: its bulb out, and said so to a screen reader too
    const a = d.querySelector('.fp-day__link');
    if (a) {
      a.dataset.label ??= a.getAttribute('aria-label');
      a.setAttribute('aria-label', day < today ? `${a.dataset.label}, played` : a.dataset.label);
    }
  }
  const plays = [...document.querySelectorAll('.fp-play[data-date]')];
  const first = plays.find((p) => p.dataset.date >= today);
  for (const p of plays) {
    const past = p.dataset.date < today;
    const next = !!first && p.dataset.date === first.dataset.date;
    p.classList.toggle('is-past', past);
    p.classList.toggle('is-next', next);
    const state = p.querySelector('.fp-play__state');
    if (state) state.textContent = past ? 'Played' : 'Tentative';
    const tag = p.querySelector('.fp-play__next');
    if (tag) tag.hidden = !next;
  }
}

// a page turning over the spiral: lifted up toward the reader from its foot, fading as it goes over
// (backwards, the page before coming back down); a hair in front of the page under it. Its lift is a
// shallow one (scaleZ): at its full depth the calendar's angle swung it far out over the text beside it
const LIFT = [
  { transform: 'translateZ(1px) scaleZ(.3) rotateX(0deg)', opacity: 1 },
  { transform: 'translateZ(1px) scaleZ(.3) rotateX(58deg)', opacity: 1, offset: 0.55 },
  { transform: 'translateZ(1px) scaleZ(.3) rotateX(96deg)', opacity: 0 },
];

/** The desk calendar's pages, one at a time: today's month first (or the nearest of the season's); the arrows under it, a swipe or the arrow keys turn a page. */
function setupMonths(today, reduced) {
  const cal = document.querySelector('[data-fp-cal]');
  const book = cal?.querySelector('.fp-cal__months');
  const pages = book ? [...book.querySelectorAll('.fp-month')] : [];
  const nav = cal?.querySelector('[data-fp-nav]');
  const steps = nav ? [...nav.querySelectorAll('[data-fp-step]')] : [];
  const live = nav?.querySelector('[data-fp-cal-live]');
  if (pages.length < 2 || steps.length !== 2) return () => {};
  const month = today.slice(0, 7);
  let at = pages.findIndex((p) => p.dataset.month >= month);
  if (at < 0) at = pages.length - 1;
  // (the pages are stacked and the arrows' room kept from the first paint, src/styles/flash-plays.css)
  nav.hidden = false;
  // (aria-disabled, not disabled: a button that is pressed to the end keeps the focus)
  const mark = () => {
    pages.forEach((p, i) => p.classList.toggle('is-current', i === at));
    steps[0].setAttribute('aria-disabled', String(at === 0));
    steps[1].setAttribute('aria-disabled', String(at === pages.length - 1));
  };
  mark();
  // the page turning, if one is: ended at once by the next turn
  let turning = null;
  const settle = () => {
    if (!turning) return;
    const { anim, page, under } = turning;
    turning = null;
    anim.cancel();
    page.classList.remove('is-turning');
    under.classList.remove('is-under');
  };
  const turn = (by) => {
    const to = at + by;
    if (to < 0 || to >= pages.length) return;
    settle();
    const from = at;
    // a bulb with the focus goes with its page: the focus stays on the calendar, not lost to the page
    const lost = pages[from].contains(document.activeElement);
    at = to;
    mark();
    if (lost) book.focus({ preventScroll: true });
    if (live) live.textContent = pages[at].dataset.name ?? '';
    if (reduced) return;
    // forward, the page that was on top goes over; back, the one before comes down over it
    const page = pages[by > 0 ? from : to];
    const under = pages[by > 0 ? to : from];
    page.classList.add('is-turning');
    under.classList.add('is-under');
    const anim = page.animate(LIFT, { duration: 640, easing: 'cubic-bezier(.45, 0, .25, 1)', direction: by > 0 ? 'normal' : 'reverse', fill: 'forwards' });
    turning = { anim, page, under };
    anim.onfinish = settle;
  };
  const onStep = (e) => turn(Number(e.currentTarget.dataset.fpStep));
  const onKey = (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    turn(e.key === 'ArrowRight' ? 1 : -1);
  };
  // a swipe across a page with a finger or a pen: the one press followed from the page to wherever it
  // lifts (another finger ends it: two are a pinch, the browser's); the click that ends a swipe, if it
  // lands on a bulb, is not followed (as the pillars' cards do, src/sections/pillars.js)
  let press = null, swipedAt = -Infinity;
  const stop = () => {
    press = null;
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onCancel);
  };
  const onDown = (e) => {
    stop();
    swipedAt = -Infinity;
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
  };
  const onUp = (e) => {
    if (e.pointerId !== press?.id) return;
    const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
    stop();
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipedAt = performance.now();
    turn(dx < 0 ? 1 : -1);
  };
  const onCancel = (e) => { if (e.pointerId === press?.id) stop(); };
  const onClick = (e) => {
    if (performance.now() - swipedAt >= 400) return;
    swipedAt = -Infinity;
    e.preventDefault();
    e.stopPropagation();
  };
  for (const s of steps) s.addEventListener('click', onStep);
  book.addEventListener('keydown', onKey);
  book.addEventListener('pointerdown', onDown);
  book.addEventListener('click', onClick, true);
  return () => {
    settle();
    stop();
    for (const s of steps) s.removeEventListener('click', onStep);
    book.removeEventListener('keydown', onKey);
    book.removeEventListener('pointerdown', onDown);
    book.removeEventListener('click', onClick, true);
  };
}

/** The countdown: to the file's countdown play on its next date (data-fp-feature), else to the next play; on its day, "On stage today". */
function setupCount(today, reduced) {
  const box = document.querySelector('[data-fp-count]');
  const count = box?.querySelector('[data-countdown]');
  const onDay = box?.querySelector('[data-fp-count-today]');
  if (!count || !onDay) return () => {};
  box.hidden = false;
  count.hidden = false;
  onDay.hidden = true;
  const ahead = [...document.querySelectorAll('.fp-play[data-date]')].filter((p) => p.dataset.date >= today);
  const show = ahead.find((p) => p.dataset.play === box.dataset.fpFeature) || ahead[0];
  if (!show) { box.hidden = true; return () => {}; }
  const link = box.querySelector('[data-fp-count-play]');
  link.href = `#${show.id}`;
  link.textContent = show.querySelector('.fp-play__title')?.firstChild?.textContent?.trim() ?? '';
  box.querySelector('[data-fp-count-when]').textContent = [show.querySelector('.fp-play__at')?.textContent, show.dataset.when].filter(Boolean).join(', ');
  if (show.dataset.date === today) {
    count.hidden = true;
    onDay.hidden = false;
    return () => {};
  }
  count.dataset.countdown = `${show.dataset.date}T00:00:00+05:30`;
  count.setAttribute('aria-label', `Time until ${show.dataset.when}`);
  return setupCountdown(count, reduced);
}

// Flash plays (flash-plays.html, written by tools/pages/build.mjs from content/flash-plays.json):
// beside the opening, the year's calendar a month at a time, the countdown to a play and the latest
// pictures; under it, the bill. Here, from the school's own date (the plays are in Hyderabad: India's
// time, UTC+05:30 all year): today ringed on the calendar, the days gone by quieter and a play gone by
// marked Played (its bulb out, its ticket's tag); the calendar opening on today's month, with the
// arrows at the ends of the month's name to step a month (the month kept as the layout changes); the
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

/** The calendar a month at a time: today's month first (or the nearest of the season's), the arrows stepping a month. */
function setupMonths(today, reduced) {
  const cal = document.querySelector('[data-fp-cal]');
  const track = cal?.querySelector('.fp-cal__months');
  const months = track ? [...track.querySelectorAll('.fp-month')] : [];
  const steps = cal ? [...cal.querySelectorAll('[data-fp-step]')] : [];
  if (months.length < 2 || steps.length !== 2) return () => {};
  const at = () => Math.max(0, Math.min(months.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  const go = (i, smooth) => track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduced ? 'smooth' : 'auto' });
  // the month a step is gliding to (a quick second press steps on from there, not from mid-glide)
  let want = null, settle = 0;
  // (aria-disabled, not disabled: a button that is pressed to the end keeps the focus)
  const mark = () => {
    const i = want ?? at();
    steps[0].setAttribute('aria-disabled', String(i === 0));
    steps[1].setAttribute('aria-disabled', String(i === months.length - 1));
  };
  const month = today.slice(0, 7);
  const first = months.findIndex((m) => m.dataset.month >= month);
  cal.classList.add('is-paged');
  for (const s of steps) s.hidden = false;
  // the month shown, and the strip's width it was shown at: when the layout changes (the opening's two
  // columns from 1024 pixels), the browser would snap to whichever month is nearest; the same one, instead
  let shown = first < 0 ? months.length - 1 : first, width = track.clientWidth;
  go(shown, false);
  mark();
  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; mark(); }); };
  const onEnd = () => {
    clearTimeout(settle);
    want = null;
    if (track.clientWidth === width) shown = at();
    mark();
  };
  const onStep = (e) => {
    const i = (want ?? at()) + Number(e.currentTarget.dataset.fpStep);
    if (i < 0 || i >= months.length) return;
    want = i;
    clearTimeout(settle);
    settle = setTimeout(onEnd, 1000); // (where there is no scrollend)
    go(i, true);
    mark();
  };
  const resized = new ResizeObserver(() => {
    if (track.clientWidth === width) return;
    width = track.clientWidth;
    go(want ?? shown, false);
    mark();
  });
  resized.observe(track);
  track.addEventListener('scroll', onScroll, { passive: true });
  track.addEventListener('scrollend', onEnd);
  for (const s of steps) s.addEventListener('click', onStep);
  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(settle);
    resized.disconnect();
    track.removeEventListener('scroll', onScroll);
    track.removeEventListener('scrollend', onEnd);
    for (const s of steps) s.removeEventListener('click', onStep);
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

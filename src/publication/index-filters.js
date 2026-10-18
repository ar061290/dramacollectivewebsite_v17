// All the pieces (pieces.html): two filters over its grid, by form and by month, after the
// publication's own (src/publication/pieces.js): a pill reading FORM  ALL v (or MONTH  ALL v) that
// drops a panel of chips. The chips are made from the cards themselves (tools/pages/build.mjs gives
// each its data-form and data-month), so they always match what the page holds: every form, A to Z;
// every month, the newest first. The two work together (an essay from October); a card that fails
// either is hidden, and when none is left a line says so, with the way back to every piece. The
// choice is kept in the address (?form=Essay&month=2026-10), so a reload or a shared link keeps it.
// Without scripts the filters stay hidden and every piece shows.
import gsap from 'gsap';
import { esc } from './cards.js';

/** @param {{ reduced: boolean }} ctx  bootPage's context (only `reduced` is used) */
export function setupIndexFilters({ reduced }) {
  const box = document.querySelector('[data-index-filters]');
  const grid = document.querySelector('[data-index-grid]');
  if (!box || !grid) return () => {};
  const status = document.querySelector('[data-index-status]');
  const cards = [...grid.querySelectorAll('.pub-piece')];
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

  // what each filter offers: [value, label], in order
  const seen = (key, label) => {
    const m = new Map();
    cards.forEach((c) => { if (c.dataset[key]) m.set(c.dataset[key], label(c)); });
    return [...m];
  };
  const OPTIONS = {
    form: seen('form', (c) => c.dataset.form).sort((a, b) => a[1].localeCompare(b[1], 'en-IN')),
    month: seen('month', (c) => c.dataset.monthName).sort((a, b) => b[0].localeCompare(a[0])),
  };
  const ALL = { form: 'All forms', month: 'All months' };
  const chosen = { form: null, month: null };

  // what the address asks for, where the page has it
  const asked = new URLSearchParams(location.search);
  for (const key of ['form', 'month']) {
    const v = asked.get(key);
    if (v && OPTIONS[key].some(([o]) => o === v)) chosen[key] = v;
  }

  const filters = [...box.querySelectorAll('[data-index-filter]')].map((el) => {
    const key = el.dataset.indexFilter;
    const btn = el.querySelector('.pub-pieces__filter-btn');
    const value = el.querySelector('[data-index-value]');
    const panel = el.querySelector('.pub-pieces__forms');
    panel.innerHTML = [[null, ALL[key]], ...OPTIONS[key]].map(([v, label]) =>
      `<button type="button" class="pub-pieces__chip" data-value="${v === null ? '' : esc(v)}" aria-pressed="false">${esc(label)}</button>`).join('');
    return { key, el, btn, value, panel, chips: [...panel.querySelectorAll('.pub-pieces__chip')], tween: null };
  });

  const labelOf = (key) => OPTIONS[key].find(([v]) => v === chosen[key])?.[1];
  const matches = (c) => (!chosen.form || c.dataset.form === chosen.form) && (!chosen.month || c.dataset.month === chosen.month);

  // ---- the pills and their chips show the choice ----
  const mark = () => {
    for (const f of filters) {
      const v = chosen[f.key];
      f.chips.forEach((c) => c.setAttribute('aria-pressed', String((c.dataset.value || null) === v)));
      f.value.textContent = v ? labelOf(f.key) : 'All';
      f.el.classList.toggle('is-set', !!v);
    }
  };

  // ---- the grid: the cards that pass both, or a line when none does ----
  let empty = null;
  const place = () => {
    let n = 0;
    cards.forEach((c) => { const ok = matches(c); c.hidden = !ok; if (ok) n++; });
    empty?.remove();
    empty = null;
    if (!n) {
      const what = `${chosen.form ? `“${esc(labelOf('form'))}” pieces` : 'pieces'}${chosen.month ? ` from ${esc(labelOf('month'))}` : ''}`;
      grid.insertAdjacentHTML('beforeend', `<li class="pub-pieces__empty">No ${what} yet. <button type="button" class="pub-pieces__reset" data-index-reset>Show all the pieces</button></li>`);
      empty = grid.lastElementChild;
    }
    return n;
  };
  const say = (n) => {
    const which = [chosen.form && labelOf('form'), chosen.month && labelOf('month')].filter(Boolean).join(', ');
    status.textContent = `Showing ${n} ${n === 1 ? 'piece' : 'pieces'}${which ? `: ${which}` : ''}.`;
  };
  const remember = () => {
    const q = new URLSearchParams(location.search);
    for (const key of ['form', 'month']) { if (chosen[key]) q.set(key, chosen[key]); else q.delete(key); }
    const s = q.toString();
    history.replaceState(history.state, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
  };

  // a change: what goes sinks and fades, then what stays rises into place, a beat apart (no overshoot)
  let swap = null;
  const shown = () => grid.querySelectorAll('.pub-piece:not([hidden]), .pub-pieces__empty');
  const clear = () => gsap.set(cards, { clearProps: 'opacity,visibility,transform' });
  const redraw = () => {
    swap?.kill();
    swap = null;
    if (reduced) { say(place()); return; }
    swap = gsap.to(shown(), {
      autoAlpha: 0, y: 10, duration: 0.2, ease: 'power2.in', stagger: 0.012,
      onComplete: () => {
        clear();
        say(place());
        swap = gsap.fromTo(shown(), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'curtain', stagger: 0.04, clearProps: 'opacity,visibility,transform' });
      },
    });
  };
  const choose = (key, v) => {
    if (chosen[key] === v) return;
    chosen[key] = v;
    mark();
    remember();
    redraw();
  };

  // ---- the pills: each drops its panel of chips; one open at a time ----
  const isOpen = (f) => f.btn.getAttribute('aria-expanded') === 'true';
  const close = (f, returnFocus) => {
    if (!isOpen(f)) return;
    f.btn.setAttribute('aria-expanded', 'false');
    f.tween?.kill();
    f.tween = null;
    if (reduced) f.panel.hidden = true;
    else f.tween = gsap.to(f.panel, { opacity: 0, y: -4, duration: 0.15, ease: 'power2.in', onComplete: () => { f.panel.hidden = true; gsap.set(f.panel, { clearProps: 'all' }); } });
    if (returnFocus) f.btn.focus();
  };
  const open = (f) => {
    filters.forEach((g) => { if (g !== f) close(g, false); });
    f.btn.setAttribute('aria-expanded', 'true');
    f.tween?.kill();
    gsap.set(f.panel, { clearProps: 'all' });
    f.panel.hidden = false;
    // opacity, not autoAlpha: the chips must stay focusable while the panel fades in
    f.tween = reduced ? null : gsap.fromTo(f.panel, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
    (f.chips.find((c) => c.getAttribute('aria-pressed') === 'true') ?? f.chips[0]).focus({ preventScroll: true });
    f.panel.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };
  for (const f of filters) {
    on(f.btn, 'click', () => (isOpen(f) ? close(f, false) : open(f)));
    on(f.panel, 'click', (e) => {
      const chip = e.target.closest('.pub-pieces__chip');
      if (!chip) return;
      choose(f.key, chip.dataset.value || null);
      close(f, true);
    });
    on(f.el, 'keydown', (e) => { if (e.key === 'Escape' && isOpen(f)) { e.preventDefault(); close(f, true); } });
    on(f.el, 'focusout', (e) => { if (isOpen(f) && e.relatedTarget && !f.el.contains(e.relatedTarget)) close(f, false); });
  }
  // a click anywhere else closes whichever is open
  on(document, 'pointerdown', (e) => filters.forEach((f) => { if (isOpen(f) && !f.el.contains(e.target)) close(f, false); }));
  on(grid, 'click', (e) => {
    if (!e.target.closest('[data-index-reset]')) return;
    chosen.form = null;
    chosen.month = null;
    mark();
    remember();
    redraw();
    filters[0].btn.focus();
  });

  mark();
  const n = place();
  if (chosen.form || chosen.month) say(n);
  box.hidden = false;

  return () => {
    cleanups.forEach((c) => c());
    swap?.kill();
    filters.forEach((f) => f.tween?.kill());
  };
}

// To do (todo.html): the owner's own task list. No page links here and search engines are asked to
// leave it alone; the list lives in this browser (localStorage `dc-todo`), so each device keeps its own
// and nobody else who opens the address sees it.
// A task has its words, the time it must be finished by (hours and minutes, no am or pm) and how long
// it should take ("45 min", "1 h 30", "2 days": kept in minutes). Add one, tick it done (struck
// through), change its Finish by or Takes in place, remove it; show all, the open ones or the done
// ones, and clear the done ones at once. An open task whose time has passed today is marked late.
// Under the list: how many are open, and how long the open ones should take together. Another tab of
// the page follows along (the storage event).
// Times are on the 24-hour clock (17:30), which needs no am or pm.
// No top bar here but the logo and the light/dark switch, which stay where they are (todo.css); the
// music plays without its button, K and a three-finger tap turning it on and off (src/ui/music.js).
// The switch brings down a quick shower of cherry blossom rather than the earrings. On laptops a cherry blossom tree stands
// at the screen's right edge
// (assets/todo/cherry-tree.svg, fetched only there), petals drifting from it (none with reduced
// motion or on the lite tier).
import { bootPage } from '../site/boot.js';

const KEY = 'dc-todo';
const VIEW_KEY = 'dc-todo-view';
const TREE = new URL('../../assets/todo/cherry-tree.svg', import.meta.url).href;
const EMPTY = { all: 'Nothing on the list yet.', open: 'Nothing open: all done.', done: 'Nothing done yet.' };
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 8.4l3 3 6.2-6.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: the list lasts this visit */ } };
// a time is kept as "HH:MM" (24-hour); an older entry with a date keeps only its time
const TIME = /(?:^|T)(\d{2}:\d{2})$/;
const tidy = (t) => (t && typeof t.id === 'string' && typeof t.text === 'string' && typeof t.done === 'boolean'
  ? { id: t.id, text: t.text, done: t.done, due: typeof t.due === 'string' && TIME.test(t.due) ? TIME.exec(t.due)[1] : '', mins: Number.isFinite(t.mins) && t.mins > 0 ? t.mins : null }
  : null);
const load = () => (read(KEY, []) || []).map(tidy).filter(Boolean);

// ---- how long: "45", "45 min", "1.5 h", "1 h 30", "1h30m", "2 days", "1 week" -> minutes ----
const UNIT = { w: 10080, d: 1440, h: 60, m: 1 };
const PART = /(\d+(?:\.\d+)?)\s*(weeks?|wks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/g;
function parseTakes(s) {
  const t = String(s).trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t)) || NaN; // a bare number: minutes
  const hm = /^(\d+)\s*(?:h|hrs?|hours?)\s*(\d{1,2})$/.exec(t); // "1 h 30": hours and minutes
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]) || NaN;
  let total = 0;
  for (const m of t.matchAll(PART)) total += parseFloat(m[1]) * UNIT[m[2][0]];
  // anything left over that is not a unit, a separator or "and" means it was not understood
  if (t.replace(PART, '').replace(/\band\b|[\s,+&]/g, '')) return NaN;
  return total > 0 ? Math.round(total) : NaN;
}
function formatTakes(mins) {
  if (!mins) return '';
  const parts = [];
  let left = mins;
  for (const [n, one, many] of [[10080, 'week', 'weeks'], [1440, 'day', 'days'], [60, 'h', 'h'], [1, 'min', 'min']]) {
    const k = Math.floor(left / n);
    if (k) { parts.push(`${k} ${k === 1 ? one : many}`); left -= k * n; }
  }
  return parts.slice(0, 2).join(' '); // "1 day 3 h", never three parts
}

// ---- finish by, on the 24-hour clock: "5", "5:30", "530", "17.30" -> "05:00" ... "17:30" ----
const pad = (n) => String(n).padStart(2, '0');
const nowMinutes = (now = new Date()) => now.getHours() * 60 + now.getMinutes();
function parseClock(s) {
  const t = String(s).trim();
  if (!t) return '';
  const m = /^(\d{1,2})(?:\s*[:.\s]?\s*(\d{2}))?$/.exec(t);
  if (!m) return NaN;
  const h = Number(m[1]), min = m[2] ? Number(m[2]) : 0;
  return h > 23 || min > 59 ? NaN : `${pad(h)}:${pad(min)}`;
}
const formatClock = (due) => due || '';
const isLate = (t, now = new Date()) => {
  if (t.done || !t.due) return false;
  const [h, m] = t.due.split(':').map(Number);
  return h * 60 + m < nowMinutes(now);
};

bootPage(({ reduced }) => {
  const root = document.querySelector('[data-todo]');
  if (!root) return undefined;
  const form = root.querySelector('[data-todo-form]');
  const input = form.querySelector('#todo-new');
  const dueIn = form.querySelector('[data-todo-due]');
  const takes = form.querySelector('[data-todo-takes]');
  const list = root.querySelector('[data-todo-list]');
  const cols = root.querySelector('.todo__cols');
  const empty = root.querySelector('[data-todo-empty]');
  const count = root.querySelector('[data-todo-count]');
  const clear = root.querySelector('[data-todo-clear]');
  const filters = [...root.querySelectorAll('[data-filter]')];
  const cleanups = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

  let tasks = load();
  let view = read(VIEW_KEY, 'all');
  if (!['all', 'open', 'done'].includes(view)) view = 'all';
  const save = () => write(KEY, tasks);
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const find = (el) => tasks.find((x) => x.id === el.closest('.todo__item')?.dataset.id);

  // ---- a row: the box and the words, Finish by, Takes, Remove ----
  const metaButton = (t, kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'todo__meta';
    b.dataset.edit = kind;
    const label = kind === 'due' ? 'Finish by' : 'Takes';
    const value = kind === 'due' ? formatClock(t.due) : formatTakes(t.mins);
    const late = kind === 'due' && isLate(t);
    b.textContent = value || '—';
    b.classList.toggle('is-unset', !value);
    b.classList.toggle('is-late', late);
    b.setAttribute('aria-label', `${label}: ${value || 'not set'}${late ? ', late' : ''}. Change`);
    return b;
  };
  const row = (t) => {
    const li = document.createElement('li');
    li.className = 'todo__item';
    li.classList.toggle('is-done', t.done);
    li.dataset.id = t.id;
    li.innerHTML = `<label class="todo__check"><input class="todo__tick" type="checkbox"><span class="todo__box">${CHECK}</span><span class="todo__text"></span></label><div class="todo__cell todo__cell--due"></div><div class="todo__cell todo__cell--takes"></div><button class="todo__remove" type="button">Remove</button>`;
    li.querySelector('.todo__tick').checked = t.done;
    li.querySelector('.todo__text').textContent = t.text;
    li.querySelector('.todo__cell--due').append(metaButton(t, 'due'));
    li.querySelector('.todo__cell--takes').append(metaButton(t, 'takes'));
    li.querySelector('.todo__remove').setAttribute('aria-label', `Remove: ${t.text}`);
    return li;
  };

  const sayCount = () => {
    const open = tasks.filter((t) => !t.done);
    const mins = open.reduce((n, t) => n + (t.mins || 0), 0);
    count.textContent = `${open.length} ${open.length === 1 ? 'task' : 'tasks'} open${mins ? ` · about ${formatTakes(mins)} to do` : ''}`;
    clear.hidden = !tasks.some((t) => t.done);
  };
  const draw = () => {
    const shown = tasks.filter((t) => view === 'all' || (view === 'done' ? t.done : !t.done));
    list.replaceChildren(...shown.map(row));
    list.hidden = !shown.length;
    cols.hidden = !shown.length;
    empty.hidden = !!shown.length;
    empty.textContent = EMPTY[view];
    sayCount();
    for (const f of filters) f.setAttribute('aria-pressed', String(f.dataset.filter === view));
  };
  const redrawRow = (t) => {
    const old = list.querySelector(`[data-id="${t.id}"]`);
    if (old) old.replaceWith(row(t));
    sayCount();
  };

  // ---- adding ----
  const takesValid = (el) => {
    const v = parseTakes(el.value);
    el.setCustomValidity(Number.isNaN(v) ? 'Try “45 min”, “1 h 30” or “2 days”.' : '');
    return v;
  };
  const clockValid = (el) => {
    const v = parseClock(el.value);
    el.setCustomValidity(Number.isNaN(v) ? 'Hours and minutes on the 24-hour clock, 0:00 to 23:59: “17:30”.' : '');
    return v;
  };
  on(takes, 'input', () => takesValid(takes));
  on(dueIn, 'input', () => clockValid(dueIn));
  on(form, 'submit', (e) => {
    e.preventDefault();
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (!text) { input.value = ''; input.focus(); return; }
    const due = clockValid(dueIn);
    if (Number.isNaN(due)) { dueIn.reportValidity(); return; }
    const mins = takesValid(takes);
    if (Number.isNaN(mins)) { takes.reportValidity(); return; }
    tasks.push({ id: id(), text, done: false, due, mins });
    save();
    // a new task is open: from Done, show it where it went
    if (view === 'done') { view = 'all'; write(VIEW_KEY, view); }
    draw();
    input.value = ''; dueIn.value = ''; takes.value = '';
    input.focus();
    if (!reduced) list.querySelector(`[data-id="${tasks[tasks.length - 1].id}"]`)?.classList.add('is-new');
  });

  // ---- ticking ----
  on(list, 'change', (e) => {
    const box = e.target.closest('.todo__tick');
    if (!box) return;
    const t = find(box);
    if (!t) return;
    t.done = box.checked;
    save();
    // in All the row stays (struck through); in Open or Done it leaves the view
    if (view === 'all') {
      redrawRow(t);
      list.querySelector(`[data-id="${t.id}"] .todo__tick`)?.focus();
    } else draw();
  });

  // ---- changing Finish by or Takes in place: the value becomes a field; Enter or leaving it keeps
  // the change, Escape leaves it as it was ----
  const edit = (button) => {
    const t = find(button);
    if (!t) return;
    const kind = button.dataset.edit;
    const cell = button.parentElement;
    const box = document.createElement('div');
    box.className = 'todo__edit';
    const field = document.createElement('input');
    field.type = 'text';
    field.autocomplete = 'off';
    if (kind === 'due') {
      field.className = 'todo__mini todo__mini--time';
      field.inputMode = 'numeric';
      field.maxLength = 5;
      field.placeholder = 'e.g. 17:30';
      field.setAttribute('aria-label', 'Finish by');
      field.value = formatClock(t.due);
      field.addEventListener('input', () => clockValid(field));
    } else {
      field.className = 'todo__mini todo__mini--takes';
      field.maxLength = 40;
      field.placeholder = 'e.g. 45 min';
      field.setAttribute('aria-label', 'Takes');
      field.value = t.mins ? formatTakes(t.mins) : '';
      field.addEventListener('input', () => takesValid(field));
    }
    box.append(field);
    cell.replaceChildren(box);
    field.focus();
    field.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      if (keep) {
        const v = kind === 'due' ? clockValid(field) : takesValid(field);
        if (Number.isNaN(v)) { field.reportValidity(); field.focus(); return; }
        if (kind === 'due') t.due = v; else t.mins = v;
      }
      done = true;
      if (keep) save();
      redrawRow(t);
      list.querySelector(`[data-id="${t.id}"] [data-edit="${kind}"]`)?.focus();
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    field.addEventListener('blur', () => finish(true));
  };

  // ---- removing, and the value buttons ----
  on(list, 'click', (e) => {
    const meta = e.target.closest('.todo__meta');
    if (meta) { edit(meta); return; }
    const remove = e.target.closest('.todo__remove');
    if (!remove) return;
    const li = remove.closest('.todo__item');
    const at = [...list.children].indexOf(li);
    tasks = tasks.filter((x) => x.id !== li.dataset.id);
    save();
    draw();
    // the focus to the row that took its place, else the field
    const next = list.children[at] ?? list.children[at - 1];
    (next?.querySelector('.todo__remove') ?? input).focus();
  });

  for (const f of filters) on(f, 'click', () => { view = f.dataset.filter; write(VIEW_KEY, view); draw(); });
  on(clear, 'click', () => { tasks = tasks.filter((t) => !t.done); save(); draw(); input.focus(); });
  // another tab of this page changed the list
  on(window, 'storage', (e) => { if (e.key === KEY) { tasks = load(); draw(); } });
  // a task becomes late as its time passes: look again each minute (not while a value is being changed)
  const late = setInterval(() => { if (tasks.some((t) => t.due && !t.done) && !list.querySelector('.todo__edit')) draw(); }, 60000);
  cleanups.push(() => clearInterval(late));

  // on a narrow phone the example does not fit the field: the short form there
  const narrow = matchMedia('(max-width: 480px)');
  const fullHint = input.placeholder;
  const fitHint = () => { input.placeholder = narrow.matches ? 'Add a task' : fullHint; };
  on(narrow, 'change', fitHint);
  fitHint();

  draw();
  cleanups.push(setupTree({ reduced }), setupShower({ reduced }));
  return () => cleanups.forEach((c) => c());
});

/**
 * A shower of cherry blossom as the theme is switched, in place of the earrings (src/ui/earrings.js
 * stands down on this page, body[data-no-earrings]): whole flowers and loose petals let go above the
 * screen, tumble down across it and fade before they reach the foot, all gone in about two seconds.
 * Transforms and opacity only (the Web Animations API), over the page and under the top bar; their
 * colours are the tree's (todo.css), so they take the new theme's. Fewer on the lite tier; none with
 * reduced motion.
 */
const PETAL = '<svg viewBox="-4 -8.5 8 9" aria-hidden="true" focusable="false"><path d="M0 0C-2.6-1.8-3.6-5.4-1.4-7.6Q-.7-7-.1-7.9Q.6-7 1.4-7.6C3.6-5.4 2.6-1.8 0 0Z"/></svg>';
const FLOWER = `<svg viewBox="-9 -9 18 18" aria-hidden="true" focusable="false">${[0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r})" d="M0 0C-2.6-1.8-3.6-5.4-1.4-7.6Q-.7-7-.1-7.9Q.6-7 1.4-7.6C3.6-5.4 2.6-1.8 0 0Z"/>`).join('')}<circle r="1.6" class="todo-shower__heart"/></svg>`;
function setupShower({ reduced }) {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button || reduced) return () => {};
  let running = 0;
  const shower = () => {
    if (running > 1) return; // two at once at most, however fast the switch is pressed
    running++;
    const lite = document.documentElement.classList.contains('tier-lite');
    const n = lite ? 30 : innerWidth < 768 ? 48 : 90;
    const layer = document.createElement('div');
    layer.className = 'todo-shower';
    layer.setAttribute('aria-hidden', 'true');
    const W = innerWidth, H = innerHeight;
    const falls = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      const flower = Math.random() < 0.55; // more whole flowers than loose petals
      el.className = `todo-shower__bit todo-shower__bit--p${1 + Math.floor(Math.random() * 4)}`;
      el.innerHTML = flower ? FLOWER : PETAL;
      const size = flower ? 14 + Math.random() * 10 : 9 + Math.random() * 9;
      el.style.width = el.style.height = `${size.toFixed(1)}px`;
      layer.append(el);
      const x0 = Math.random() * W, y0 = -30 - Math.random() * 90;
      const drift = (Math.random() - 0.5) * 240;
      const fall = H * (0.65 + Math.random() * 0.45);
      const spin = (Math.random() < 0.5 ? -1 : 1) * (300 + Math.random() * 600);
      const sway = 20 + Math.random() * 40;
      falls.push([el, [
        { transform: `translate3d(${x0}px, ${y0}px, 0) rotate(0deg) scaleX(1)`, opacity: 0 },
        { transform: `translate3d(${x0 + drift * 0.3 + sway}px, ${y0 + fall * 0.3}px, 0) rotate(${spin * 0.3}deg) scaleX(.45)`, opacity: 1, offset: 0.3 },
        { transform: `translate3d(${x0 + drift * 0.7 - sway}px, ${y0 + fall * 0.7}px, 0) rotate(${spin * 0.7}deg) scaleX(1)`, opacity: 0.95, offset: 0.7 },
        { transform: `translate3d(${x0 + drift}px, ${y0 + fall}px, 0) rotate(${spin}deg) scaleX(.6)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 700, delay: Math.random() * 380, easing: 'cubic-bezier(.33, .08, .62, 1)', fill: 'both' }]);
    }
    document.body.append(layer);
    const done = falls.map(([el, frames, opts]) => el.animate(frames, opts).finished.catch(() => {}));
    Promise.all(done).then(() => { layer.remove(); running--; });
  };
  button.addEventListener('click', shower);
  return () => button.removeEventListener('click', shower);
}

/**
 * The cherry blossom tree at the right edge, on laptops only: fetched the first time the window is
 * wide enough (never on a touch screen), faded in, and given a few drifting petals.
 */
function setupTree({ reduced }) {
  const box = document.querySelector('[data-todo-tree]');
  const html = document.documentElement;
  if (!box || html.classList.contains('tier-phone')) return () => {};
  const wide = matchMedia('(min-width: 1100px)');
  let made = false;
  const make = async () => {
    if (made || !wide.matches) return;
    made = true;
    try {
      const res = await fetch(TREE);
      if (!res.ok) throw new Error(res.status);
      box.innerHTML = await res.text(); // the site's own drawing
    } catch { made = false; return; }
    if (!reduced && !html.classList.contains('tier-lite')) {
      // petals let go from the crown at different moments and drift down and to the left
      for (let i = 0; i < 9; i++) {
        const p = document.createElement('span');
        p.className = 'todo-tree__petal';
        const x = 18 + Math.random() * 62, y = 10 + Math.random() * 40;
        p.style.cssText = `--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--dx:${(-60 - Math.random() * 180).toFixed(0)}px;--dy:${(260 + Math.random() * 240).toFixed(0)}px;--r:${(240 + Math.random() * 360).toFixed(0)}deg;--t:${(9 + Math.random() * 8).toFixed(1)}s;--d:${(-Math.random() * 16).toFixed(1)}s;--s:${(0.75 + Math.random() * 0.5).toFixed(2)}`;
        box.append(p);
      }
    }
    box.classList.add('is-in');
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-shown')));
  };
  wide.addEventListener('change', make);
  make();
  return () => wide.removeEventListener('change', make);
}

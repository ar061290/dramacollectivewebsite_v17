// The shared parts of every page, written into each HTML file between marker comments:
//   <!-- site:head -->    icon, fonts, styles, import map, the theme and curtain check before paint
//   <!-- site:header -->  skip link, the curtain veil (page transitions) and the top bar
//   <!-- site:stage -->   the star sky and the drawn cursor (pages other than the home page,
//                         which has its own stage)
//   <!-- site:footer -->  the curtain-call footer
//   <!-- site:links -->   index.html only: the footer's columns, as the last act (they dock into the
//                         footer as it rises)
//   <!-- site:team -->    team.html only: the core team's cards, from content/team.json
//   <!-- site:contacts --> contact.html and sponsor-apply.html: who to write to (CONTACTS)
//   <!-- site:pubbanner --> the publication and its reading pages: the banner along the bottom
// It also writes the publication's reading pages whole (READING, below): each piece that is out
// (piece-<slug>.html, from src/publication/pieces-data.js and the piece's text in
// content/pieces/<slug>.html), the editor's note (editors-note.html, from content/editors-note.html)
// and all the pieces (pieces.html).
// Run after editing this file, content/team.json, content/pieces/, content/editors-note.html or the
// pieces' data:  npm run pages
// Each file keeps its own line endings.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { PUBLISHED, pieceHref, FIRST_OF_ISSUE } from '../../src/publication/pieces-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The pages. In the top bar: About us, Core team, Our outputs (a menu that drops on hover, focus or
// click) and Contact us. Apply now and Become a sponsor are the buttons; they stay on screen when the
// rest of the bar glides up out of view (src/animations/nav.js), and fly down to their own spot on a
// page that has one (src/site/flyin.js). The footer lists every page, the outputs under their own
// heading.
export const OUTPUTS = [
  { key: 'publication', href: './publication.html', label: 'The publication' },
  { key: 'production', href: './production.html', label: 'The production' },
  { key: 'flash-plays', href: './flash-plays.html', label: 'Flash plays' },
  { key: 'workshops', href: './workshops.html', label: 'Workshops' },
  { key: 'outreach', href: './outreach.html', label: 'Social outreach' },
];
const ABOUT = { key: 'about', href: './about.html', label: 'About us' };
const TEAM = { key: 'team', href: './team.html', label: 'Core team' };
const CONTACT = { key: 'contact', href: './contact.html', label: 'Contact us' };
const HOME = { key: 'home', href: './index.html', label: 'Home' };
const CTA = { key: 'sponsor', href: './sponsor.html', label: 'Become a sponsor' };
// Apply now: the roles and the Collective's application form (a Fillout form)
const APPLY = { key: 'apply', href: './apply.html', label: 'Apply now' };
// Apply to be a sponsor: the sponsorship application form, reached from Become a sponsor
export const SPONSOR_APPLY = { key: 'sponsor-apply', href: './sponsor-apply.html', label: 'Apply to be a sponsor' };
export const NAV = [ABOUT, TEAM, ...OUTPUTS, CONTACT];

// The Collective's Instagram. TODO: the handle (it was not given; this opens Instagram itself).
export const INSTAGRAM = { href: 'https://www.instagram.com/', label: 'Instagram' };
// Who to write to (Contact us and the footer)
export const CONTACTS = [
  { name: 'Aadi Ramnani', role: 'President', email: 'aadir6405@students.chirec.ac.in' },
  { name: 'Aripra Sharma', role: 'Executive President', email: 'aripras111460@students.chirec.ac.in' },
];

// The publication's reading pages, written whole by build() (readingPage, below): one per piece that
// is out, in reading order, then the editor's note and the page of all the pieces. Each key is the
// page's own (vite.config.js keys its inputs by them, so they must not repeat).
const READING = [
  ...PUBLISHED.map((p) => ({ file: pieceHref(p).slice(2), key: `piece-${p.slug}`, piece: p })),
  { file: 'editors-note.html', key: 'editors-note' },
  { file: 'pieces.html', key: 'pieces' },
];

export const PAGES = [
  { file: 'index.html', key: 'home' },
  ...NAV.map((n) => ({ file: n.href.slice(2), key: n.key })),
  { file: 'sponsor.html', key: 'sponsor' },
  { file: APPLY.href.slice(2), key: APPLY.key },
  { file: SPONSOR_APPLY.href.slice(2), key: SPONSOR_APPLY.key },
  // the publication's own pages, reached from it and not from the menu: its reading pages (each
  // piece, the editor's note, all the pieces; written whole by this file, READING below), and,
  // coming soon for now, our writers, the writer application and the newsletter
  ...READING.map(({ file, key }) => ({ file, key, reading: true })),
  { file: 'writers.html', key: 'writers' },
  { file: 'write.html', key: 'write' },
  { file: 'newsletter.html', key: 'newsletter' },
  // the stage planner, opened from The production: a full-screen app with its own top bar (no
  // shared parts are written into it; it is listed here so Vite builds it)
  { file: 'stage-planner.html', key: 'planner' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const current = (key, page) => (key === page ? ' aria-current="page"' : '');
const link = (n, page, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${n.href}"${current(n.key, page)}>${n.label}</a>`;
const ICON_INSTAGRAM = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.6" y="2.6" width="14.8" height="14.8" rx="4.3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="14.6" cy="5.4" r="1" fill="currentColor"/></svg>';

const head = () => `<link rel="icon" href="./assets/brand/mark-gold.png">
  <link rel="preload" href="./assets/fonts/Raung-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="./src/styles/main.css">
  <!-- Bare-module map for running without a build step (any static server). Vite resolves the same
       specifiers from node_modules and ignores this map. Keep the versions in step with package.json. -->
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
      "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.13.0/index.js",
      "gsap/": "https://cdn.jsdelivr.net/npm/gsap@3.13.0/",
      "lottie-web/build/player/lottie_light.js": "https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.js/+esm"
    }
  }
  </script>
  <script>
    // theme before first paint: the saved choice, else the dark theatre
    try { var t = localStorage.getItem('dc-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
    // arriving through the curtain (src/site/transition.js): it starts closed and opens on this page
    try { if (sessionStorage.getItem('dc-veil') === '1') { sessionStorage.removeItem('dc-veil'); document.documentElement.classList.add('is-veiled'); } } catch (e) {}
    document.documentElement.classList.add('has-js');
  </script>`;

const header = (page) => {
  const inOutputs = OUTPUTS.some((o) => o.key === page);
  return `<a class="skip-link" href="#main">Skip to content</a>

  <div class="veil" aria-hidden="true">
    <div class="veil__half veil__half--l"></div>
    <div class="veil__half veil__half--r"></div>
  </div>

  <header class="topbar" data-topbar>
    <span class="topbar__ground" aria-hidden="true"></span>
    <a class="topbar__brand" href="${page === 'home' ? '#top' : './index.html'}" aria-label="The Drama Collective, ${page === 'home' ? 'back to top' : 'home'}">
      <span class="topbar__mark" data-lottie="mask-mark"><img src="./assets/brand/mark-gold.png" alt=""></span>
      <span class="topbar__word"><span>The Drama</span> <span>Collective</span></span>
    </a>
    <a class="btn btn--inverse btn--sm topbar__apply" href="${APPLY.href}"${current(APPLY.key, page)} data-topbar-keep>${APPLY.label}</a>
    <nav class="topbar__nav" aria-label="Main">
      <ul class="topbar__links">
        <li>${link(ABOUT, page)}</li>
        <li>${link(TEAM, page)}</li>
        <li class="topbar__group" data-dropdown>
          <button class="topbar__group-toggle${inOutputs ? ' is-current' : ''}" type="button" aria-expanded="false" aria-controls="outputs-menu">Our outputs<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <ul class="topbar__dropdown" id="outputs-menu" data-dropdown-menu>
${OUTPUTS.map((o) => `            <li>${link(o, page)}</li>`).join('\n')}
          </ul>
        </li>
        <li>${link(CONTACT, page)}</li>
      </ul>
      <span class="topbar__glint" aria-hidden="true"></span>
    </nav>
    <div class="topbar__tools">
      <a class="icon-btn" href="${INSTAGRAM.href}" target="_blank" rel="noopener" aria-label="The Drama Collective on Instagram" title="Instagram">${ICON_INSTAGRAM}</a>
      <button class="icon-btn music-toggle" type="button" aria-pressed="false" aria-label="Music" aria-keyshortcuts="K" title="Play music (K)" data-music-toggle>
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect class="bar" x="2.5" y="8" width="2.2" height="9"/><rect class="bar" x="6.9" y="3" width="2.2" height="14"/><rect class="bar" x="11.3" y="6" width="2.2" height="11"/><rect class="bar" x="15.7" y="9" width="2.2" height="8"/></svg>
      </button>
      <button class="icon-btn theme-toggle" type="button" aria-pressed="false" aria-label="Light mode" title="House lights" data-theme-toggle>
        <svg class="theme-toggle__sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5"/></g></svg>
        <svg class="theme-toggle__moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M15.9 12.6A6.6 6.6 0 0 1 7.4 4.1a6.6 6.6 0 1 0 8.5 8.5Z" fill="currentColor"/></svg>
      </button>
    </div>
    <button class="topbar__menu" type="button" aria-expanded="false" aria-controls="menu-sheet" data-menu-toggle>Menu</button>
    <a class="btn btn--inverse btn--sm topbar__cta" href="${CTA.href}"${current(CTA.key, page)} data-topbar-keep>${CTA.label}</a>
    <div class="topbar__sheet" id="menu-sheet" data-menu-sheet>
      <ul>
${[HOME, ABOUT, TEAM].map((n) => `        <li>${link(n, page)}</li>`).join('\n')}
        <li class="topbar__sheet-group"><span class="eyebrow">Our outputs</span>
          <ul>
${OUTPUTS.map((o) => `            <li>${link(o, page)}</li>`).join('\n')}
          </ul>
        </li>
${[CONTACT, APPLY, CTA].map((n) => `        <li>${link(n, page)}</li>`).join('\n')}
        <li><a href="${INSTAGRAM.href}" target="_blank" rel="noopener"><span class="ig-word">${INSTAGRAM.label}</span></a></li>
      </ul>
    </div>
  </header>`;
};

// The star sky and the drawn cursor. The reading pages have no sky (nothing to keep it going on a
// page made to be read): only the cursor, with its glow everywhere (html.is-glow-everywhere).
const stage = (stars = true) => `${stars ? `<div class="stage" aria-hidden="true">
    <canvas class="stage__stars"></canvas>
  </div>

  ` : ''}<div class="cursor" aria-hidden="true">
    <span class="cursor__glow"></span>
    <svg class="cursor__star" viewBox="-12 -17 24 34" focusable="false"><path class="cursor__star-plain" d="M0 -10C1 -2 2 -1 10 0 2 1 1 2 0 10 -1 2 -2 1 -10 0 -2 -1 -1 -2 0 -10Z"/><path class="cursor__star-text" d="M0 -15C0.66 -3 1.32 -1.5 6.6 0 1.32 1.5 0.66 3 0 15 -0.66 3 -1.32 1.5 -6.6 0 -1.32 -1.5 -0.66 -3 0 -15Z"/></svg>
  </div>`;

// The footer's columns: every page in them, the outputs under their own heading, and who to write
// to. `pad` is the indent of the <nav> line; `cls` an extra class. `dock`: the home page's last act,
// whose columns each travel to their own place in the footer (data-dock-col, src/sections/dock.js)
// and each keep the sky clear of themselves on the way (data-mask).
const pageLinks = (page, pad = '      ', cls = '', dock = false) => {
  const i = (n) => pad + '  '.repeat(n);
  const col = (name) => (dock ? ` data-dock-col="${name}" data-mask` : '');
  return `<nav class="curtain__links${cls ? ` ${cls}` : ''}" aria-label="All pages">
${i(1)}<div class="curtain__col"${col('collective')}>
${i(2)}<p class="eyebrow">The Collective</p>
${i(2)}<ul>
${[HOME, ABOUT, TEAM, CONTACT, APPLY, CTA].map((n) => `${i(3)}<li>${link(n, page)}</li>`).join('\n')}
${i(2)}</ul>
${i(1)}</div>
${i(1)}<div class="curtain__col"${col('outputs')}>
${i(2)}<p class="eyebrow">Our outputs</p>
${i(2)}<ul>
${OUTPUTS.map((o) => `${i(3)}<li>${link(o, page)}</li>`).join('\n')}
${i(3)}<li><a href="./stage-planner.html">Stage planner</a></li>
${i(2)}</ul>
${i(1)}</div>
${i(1)}<div class="curtain__col curtain__col--contact"${col('contact')}>
${i(2)}<p class="eyebrow">Write to us</p>
${i(2)}<ul>
${CONTACTS.map((c) => `${i(3)}<li><span class="curtain__who">${esc(c.name)}, ${esc(c.role)}</span><a href="mailto:${c.email}">${c.email}</a></li>`).join('\n')}
${i(3)}<li><a class="curtain__social" href="${INSTAGRAM.href}" target="_blank" rel="noopener">${ICON_INSTAGRAM}<span class="ig-word">${INSTAGRAM.label}</span></a></li>
${i(2)}</ul>
${i(1)}</div>
${pad}</nav>`;
};

// Every page shows the mark; on the home page the stage's own logo flies down into it and hands over
// to it (Stage._placeVector), so the two are the same in the end. On the other pages the columns
// stand beside the mark. On the home page they are the last act (<!-- site:links --> in index.html):
// as the footer rises each is carried down into its own empty slot, in one row (who to write to, the
// Collective, its outputs, then the mark), in step with the logo (src/sections/dock.js), so the
// footer has no copy of its own there.
const footer = (page) => `<footer class="curtain${page === 'home' ? ' curtain--home' : ''}" id="contact" aria-label="${page === 'home' ? 'Credits' : 'Pages and contacts'}">
    <div class="curtain__grid">
${page === 'home'
    ? ['contact', 'collective', 'outputs'].map((k) => `      <div class="curtain__slot curtain__slot--${k}" data-dock-slot="${k}" aria-hidden="true"></div>`).join('\n')
      + '\n      <div class="curtain__mark" aria-hidden="true"><span class="curtain__emblem" data-tilt></span></div>'
    : `      <div class="curtain__mark" aria-hidden="true"><span class="curtain__emblem" data-tilt></span></div>\n      ${pageLinks(page)}`}
    </div>
    <div class="curtain__base">
      <div class="curtain__legal">
        <p class="legal">© 2026 The Drama Collective · CHIREC International School</p>
        <p class="credits">Music: “the smell of old books, reading, writing and studying (a dark academia playlist)”, <a href="https://www.youtube.com/@DarkEnigmatic68" rel="noopener">Dark Enigmatic</a>.</p>
      </div>
      <a class="endorsement" href="https://www.chirec.ac.in" rel="noopener">
        <img class="endorsement__logo" src="./assets/brand/chirec.webp" alt="CHIREC International School" width="475" height="140">
        <span>CHIREC International School: the No.&nbsp;1 school in Hyderabad and Telangana</span>
      </a>
    </div>
  </footer>`;

const DEPTS = [
  { key: 'leadership', label: 'Leadership' },
  { key: 'productions', label: 'Flash plays & production' },
  { key: 'finance', label: 'Finance' },
  { key: 'sponsorship', label: 'Sponsorship' },
  { key: 'design', label: 'Design' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'marketing', label: 'Marketing & outreach' },
  { key: 'photography', label: 'Photography' },
  { key: 'workshops', label: 'Workshops & publication' },
];

const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** A WebP picture's size, read from its header (VP8 / VP8L / VP8X); `path` from the site's root. */
function webpSize(path) {
  const b = readFileSync(join(ROOT, path));
  const kind = b.toString('ascii', 12, 16);
  let w, h;
  if (kind === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
  else if (kind === 'VP8L') { const v = b.readUInt32LE(21); w = (v & 0x3fff) + 1; h = ((v >> 14) & 0x3fff) + 1; }
  else { w = b.readUIntLE(24, 3) + 1; h = b.readUIntLE(27, 3) + 1; }
  return { w, h };
}

function team() {
  const { people } = JSON.parse(readFileSync(join(ROOT, 'content', 'team.json'), 'utf8'));
  const sizes = {}; // photo sizes, read once each
  const size = (photo) => sizes[photo] ?? (sizes[photo] = webpSize(join('assets', 'team', `${photo}.webp`)));
  const filters = `<div class="team-filter" role="group" aria-label="Show a department">
        <button class="team-filter__btn" type="button" aria-pressed="true" data-filter="all">Everyone</button>
${DEPTS.map((d) => `        <button class="team-filter__btn" type="button" aria-pressed="false" data-filter="${d.key}">${esc(d.label)}</button>`).join('\n')}
      </div>`;
  const cards = people.map((p) => {
    const title = p.name || p.role;
    const photo = p.photo
      ? (() => { const { w, h } = size(p.photo); return `<span class="member__photo"><img src="./assets/team/${p.photo}.webp" alt="" width="${w}" height="${h}" loading="lazy" decoding="async"></span>`; })()
      : `<span class="member__photo member__photo--initials"><span>${initials(p.name)}</span></span>`;
    const role = p.name && p.role ? `<span class="member__role">${esc(p.role)}</span>` : '';
    return `        <li class="member" data-dept="${p.dept}" data-flip-id="${p.id}">
          <button class="member__card" type="button" aria-haspopup="dialog" aria-controls="spotlight" data-member="${p.id}">
            ${photo}
            <span class="member__name">${esc(title)}</span>
            ${role}
          </button>
          <div class="member__intro" hidden>
${p.intro.map((t) => `            <p>${esc(t)}</p>`).join('\n')}
          </div>
        </li>`;
  }).join('\n');
  return `${filters}
      <ul class="team-grid" data-spot>
${cards}
      </ul>`;
}

function contacts() {
  return `<ul class="contact-cards" data-spot>
${CONTACTS.map((c) => `        <li class="contact-card">
          <p class="eyebrow">${esc(c.role)}</p>
          <p class="contact-card__name">${esc(c.name)}</p>
          <a class="contact-card__email" href="mailto:${c.email}">${c.email.replace('@', '@<wbr>')}</a>
          <button class="btn btn--secondary btn--sm contact-card__copy" type="button" data-copy="${c.email}">Copy address</button>
          <span class="contact-card__spark" data-spark aria-hidden="true"></span>
        </li>`).join('\n')}
      </ul>`;
}

// ---- The publication: its banner and its reading pages ----

// The banner along the bottom of the screen (houseofheat's ticker), on the publication and each of
// its reading pages: the whole <aside>, the last thing in <main>, sticky to the bottom of the screen
// until it docks on the footer (src/styles/publication-banner.css). The mark; one line, which
// src/publication/ticker.js rolls round and round (copies of it, hidden from screen readers); the
// way to write for us, and beside it the top bar's own "Become a sponsor" (the bar is hidden on
// these pages). [data-mask] keeps the stars from under it in the publication's opening; never
// [data-fly] (src/site/flyin.js: a button kept in the bottom of the screen never arrives).
const PUB_LINE = 'India’s first independent, student-run theatre publication';
const WRITE = { href: './write.html', label: 'Become a writer' };
const pubBanner = () => `<aside class="pub-ticker" data-pub-ticker aria-label="The publication">
      <div class="pub-ticker__bar" data-mask>
        <span class="pub-mark pub-ticker__mark" aria-hidden="true"></span>
        <div class="pub-ticker__strip">
          <p class="pub-ticker__track"><span class="pub-ticker__item">${PUB_LINE}</span></p>
        </div>
        <div class="pub-ticker__actions">
          <a class="pub-btn pub-ticker__cta" href="${WRITE.href}">${WRITE.label}</a>
          <a class="btn btn--inverse btn--sm pub-ticker__sponsor" href="${CTA.href}">${CTA.label}</a>
        </div>
      </div>
    </aside>`;

const MONTHS = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' };
/** "Oct 2026" as said in a sentence: "October 2026". */
const issueName = (issue) => issue.replace(/^([A-Z][a-z]{2})\b/, (m) => MONTHS[m] ?? m);
/** "Oct 2026" as a machine-readable month: "2026-10". */
const issueDate = (issue) => {
  const [m, y] = issue.split(' ');
  const i = Object.keys(MONTHS).indexOf(m);
  return i < 0 ? '' : `${y}-${String(i + 1).padStart(2, '0')}`;
};
/** A text of content/, set in at the given indent (blank lines stay blank). */
const content = (path, pad) => readFileSync(join(ROOT, 'content', path), 'utf8').replace(/\r\n/g, '\n').trimEnd()
  .split('\n').map((l) => (l ? pad + l : l)).join('\n');

const ARROW_L = '<svg class="read__arrow" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M13 5H1.5M5 1 1 5l4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_R = '<svg class="read__arrow" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11.5M9 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BACK = `<a class="read__back" href="./publication.html">${ARROW_L}<span>The publication</span></a>`;
const PUBLICATION = { href: './publication.html', label: 'The publication', sub: 'This month’s issue and what comes next', note: true };
const ALL = { href: './pieces.html', label: 'All the pieces', sub: 'Every piece we have published', note: true };

// The two large buttons at a reading page's end, each with where it goes under it: the previous
// piece on the left (or the publication), the next on the right (or all the pieces); and under them
// a small way to all the pieces, unless the right-hand button is that already.
const step = (side, to) => `<a class="read__step read__step--${side}" href="${to.href}"${to.rel ? ` rel="${to.rel}"` : ''}>
            <span class="pub-btn read__btn">${side === 'prev' ? ARROW_L : ''}<span>${esc(to.label)}</span>${side === 'next' ? ARROW_R : ''}</span>
            <span class="read__step-sub${to.note ? ' read__step-sub--note' : ''}">${esc(to.sub)}</span>
          </a>`;
const readEnd = (prev, next) => `<footer class="read__end">
        <nav class="read__nav" aria-label="More from the publication">
          ${step('prev', prev)}
          ${step('next', next)}
        </nav>${next === ALL ? '' : `
        <p class="read__all"><a href="${ALL.href}">${ALL.label}</a></p>`}
      </footer>`;

// The top of a reading page: the way back, the issue and form, the title (risen into place by the
// site's [data-reveal]), the piece's dek if it has one (a line under the title), who wrote it and
// the gold rule.
const readHead = ({ issue, kind, title, dek, author }) => `<header class="read__head">
        ${BACK}
        <p class="pub-label read__kicker"><time datetime="${issueDate(issue)}">${esc(issue)}</time><span class="read__dot" aria-hidden="true"></span><span>${esc(kind)}</span></p>
        <h1 class="read__title" id="read-title" data-reveal>${esc(title)}</h1>${dek ? `
        <p class="read__dek">${esc(dek)}</p>` : ''}
        <p class="read__by">By <span class="read__author">${esc(author)}</span></p>
        <span class="rule read__rule" aria-hidden="true"></span>
      </header>`;

const article = (head, figure, body, end) => `    <article class="read" aria-labelledby="read-title">
      ${head}${figure ? `\n      ${figure}` : ''}
      <div class="read__body">
${body}
      </div>
      ${end}
    </article>`;

/** A piece's page: its text (content/pieces/<slug>.html) in the reading layout. */
function piecePage(p) {
  const i = PUBLISHED.indexOf(p);
  const before = PUBLISHED[i - 1];
  const after = PUBLISHED[i + 1];
  const prev = before ? { href: pieceHref(before), label: 'Previous piece', sub: before.title, rel: 'prev' } : PUBLICATION;
  const next = after ? { href: pieceHref(after), label: 'Next piece', sub: after.title, rel: 'next' } : ALL;
  // a piece's picture, under its byline (its size from the file, so the page holds its place)
  const figure = p.photo
    ? (() => { const { w, h } = webpSize(p.photo.src); return `<figure class="read__figure"><img src="./${esc(p.photo.src)}" alt="${esc(p.photo.alt)}" width="${w}" height="${h}" decoding="async"></figure>`; })()
    : '';
  const kind = p.form.toLowerCase();
  return {
    title: p.title,
    // (the article by sound: "an essay", but "a one-act play", "a university ...")
    description: `${/^[aeiou]/i.test(kind) && !/^(one|uni|use|eu)/i.test(kind) ? 'An' : 'A'} ${kind} by ${p.author}, from the ${issueName(p.issue)} issue of The Drama Collective’s publication.`,
    source: `src/publication/pieces-data.js and content/pieces/${p.slug}.html`,
    main: article(readHead({ issue: p.issue, kind: p.form, title: p.title, dek: p.dek, author: p.author }), figure,
      content(`pieces/${p.slug}.html`, '        '), readEnd(prev, next)),
  };
}

/** The editor's note (content/editors-note.html), ending on the way into the issue. */
function editorsNotePage() {
  const first = FIRST_OF_ISSUE('Oct 2026');
  return {
    title: 'Editor’s note',
    description: 'The editor’s note for the October 2026 issue of The Drama Collective’s publication, by Kodela Gautam.',
    source: 'content/editors-note.html',
    main: article(readHead({ issue: 'Oct 2026', kind: 'Editorial', title: 'Editor’s note', author: 'Kodela Gautam' }), '',
      content('editors-note.html', '        '),
      readEnd(PUBLICATION, { href: pieceHref(first), label: 'Read the October issue', sub: first.title, rel: 'next' })),
  };
}

/** All the pieces: a heading and the grid of every piece that is out, the newest issue first. */
function piecesPage(pieceCard) {
  const issues = [...new Set(PUBLISHED.map((p) => p.issue))].reverse();
  const cards = issues.flatMap((issue) => PUBLISHED.filter((p) => p.issue === issue))
    .map((p) => pieceCard(p, { level: 2 }).split('\n').map((l) => `          ${l}`).join('\n'));
  return {
    title: 'All the pieces',
    description: 'Every piece published by The Drama Collective’s theatre publication, the newest issue first.',
    source: 'src/publication/pieces-data.js and src/publication/cards.js',
    main: `    <section class="read read--index" aria-labelledby="read-title">
      <div class="pub-wrap">
        <header class="read__head">
          ${BACK}
          <h1 class="read__title" id="read-title" data-reveal>All the pieces</h1>
          <span class="rule read__rule" aria-hidden="true"></span>
        </header>
        <ul class="pub-pieces__grid read__grid">
${cards.join('\n')}
        </ul>
      </div>
    </section>`,
  };
}

/** A reading page, whole, with its shared parts' markers empty (build() fills them like any page's). */
const readingPage = (key, { title, description, source, main }) => `<!doctype html>
<html lang="en-IN" class="is-glow-everywhere">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} · The Drama Collective</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#2a0d1c">
  <!-- site:head -->
  <!-- /site:head -->
</head>
<body class="page page--reading page--${key}">
  <!-- Written by tools/pages/build.mjs (npm run pages) from ${source}: edit those, not this file. -->
  <!-- site:header -->
  <!-- /site:header -->

  <!-- site:stage -->
  <!-- /site:stage -->

  <main id="main" class="page__main page__main--pub page__main--reading">
${main}

    <!-- site:pubbanner -->
    <!-- /site:pubbanner -->
  </main>

  <!-- site:footer -->
  <!-- /site:footer -->

  <script type="module" src="./src/pages/reading.js"></script>
</body>
</html>
`;

function fill(src, name, html, indent = '  ') {
  const re = new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`);
  if (!re.test(src)) return src;
  return src.replace(re, () => `<!-- site:${name} -->\n${indent}${html}\n${indent}<!-- /site:${name} -->`);
}

/** @param {string[]} [only]  page keys or files to write (none: every page) */
export async function build(only = []) {
  // the grid's card is the publication's own (src/publication/cards.js: plain strings, no DOM),
  // loaded here rather than at the top so that importing the page list (vite.config.js) needs it not
  const { pieceCard } = await import('../../src/publication/cards.js');
  for (const { file, key, reading } of PAGES) {
    if (only.length && !only.includes(key) && !only.includes(file)) continue;
    const path = join(ROOT, file);
    let src;
    try { src = readFileSync(path, 'utf8'); } catch { src = null; }
    // a reading page is written whole each time, from its text (the same text gives the same page)
    let out;
    if (reading) {
      const r = READING.find((p) => p.key === key);
      out = readingPage(key, r.piece ? piecePage(r.piece) : key === 'pieces' ? piecesPage(pieceCard) : editorsNotePage());
    } else if (src === null) { console.warn(`skip ${file}: not found`); continue; }
    else out = src;
    const crlf = !!src?.includes('\r\n');
    out = out.replace(/\r\n/g, '\n');
    out = fill(out, 'head', head());
    out = fill(out, 'header', header(key));
    if (key !== 'home') out = fill(out, 'stage', stage(!reading));
    out = fill(out, 'pubbanner', pubBanner(), '    ');
    out = fill(out, 'footer', footer(key));
    if (key === 'home') out = fill(out, 'links', pageLinks('home', '        ', 'curtain__links--dock', true), '        ');
    if (key === 'team') out = fill(out, 'team', team(), '      ');
    if (key === 'contact' || key === SPONSOR_APPLY.key) out = fill(out, 'contacts', contacts(), '      ');
    out = out.replace(/(<a [^>]*data-instagram[^>]*href=")[^"]*(")/g, `$1${INSTAGRAM.href}$2`);
    if (crlf) out = out.replace(/\n/g, '\r\n');
    if (out !== src) { writeFileSync(path, out); console.log(`wrote ${file}`); }
    else console.log(`unchanged ${file}`);
  }
}

// run as a script (npm run pages; or, for some pages only, with their keys or files after it);
// importing the page list (vite.config.js) writes nothing
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build(process.argv.slice(2));

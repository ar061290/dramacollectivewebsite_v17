// The shared parts of every page, written into each HTML file between marker comments:
//   <!-- site:head -->    icon, fonts, styles, import map, the theme and curtain check before paint
//   <!-- site:header -->  skip link, the curtain veil (page transitions) and the top bar
//   <!-- site:stage -->   the star sky and the drawn cursor (pages other than the home page,
//                         which has its own stage)
//   <!-- site:footer -->  the curtain-call footer
//   <!-- site:links -->   index.html only: the footer's columns, as the last act (they dock into the
//                         footer as it rises)
//   <!-- site:team -->    team.html only: the core team's cards, from content/team.json
//   <!-- site:contacts --> contact.html and sponsor.html (beside the tiers): who to write to (CONTACTS)
//   <!-- site:pubbanner --> the publication and its reading pages: the banner along the bottom
//   <!-- site:writers --> writers.html only: the writers' cards, issue by issue (writersMonths)
//   <!-- site:issue -->   index.html only: act three's pieces, the newest issue's (homeIssue)
// It also writes the publication's reading pages whole (READING, below): each piece that is out
// (piece-<slug>.html, from src/publication/pieces-data.js and the piece's text in
// content/pieces/<slug>.html), the editor's note (editors-note.html, from content/editors-note.html)
// and all the pieces (pieces.html); and each writer's own page (writer-<slug>.html, from
// content/writers.json, content/team.json and the pieces' data).
// Run after editing this file, content/team.json, content/writers.json, content/pieces/,
// content/editors-note.html or the pieces' data:  npm run pages
// Each file keeps its own line endings.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { PIECES, PUBLISHED, pieceHref, FIRST_OF_ISSUE, EDITORS_NOTE } from '../../src/publication/pieces-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJSON = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

// The publication's writers (content/writers.json), each with what their pages need: their photo
// and introduction (their own, or else the core team's, content/team.json, where they are on it),
// the name to call them by, their role on the team, their page and their pieces (found by the name
// printed on them), and the colour of their first piece, for the placeholder tile of a writer whose
// photo has not come in yet (the mark on a tile, as the upcoming list's: src/publication/cards.js).
const TEAM_PEOPLE = readJSON('content/team.json').people;
export const WRITERS = readJSON('content/writers.json').writers.map((w) => {
  const t = w.team ? TEAM_PEOPLE.find((p) => p.id === w.team) : null;
  if (w.team && !t) throw new Error(`content/writers.json: ${w.name}: no "${w.team}" in content/team.json`);
  // (the editor's note is one of its writer's pieces here, though not one of the issue's)
  const pieces = [...PIECES, EDITORS_NOTE].filter((p) => p.author === w.name);
  return {
    ...w,
    first: w.first ?? w.name.split(/\s+/)[0],
    role: t?.role ?? null,
    photo: w.photo ?? (t?.photo ? `assets/team/${t.photo}.webp` : null),
    intro: w.intro ?? t?.intro ?? null,
    href: `./writer-${w.slug}.html`,
    pieces,
    tone: pieces[0]?.tone ?? 1,
  };
});
const writerNamed = (name) => WRITERS.find((w) => w.name === name);

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
// the Gallery: the events in pictures (content/gallery.json); in the bar beside the light switch on a
// laptop, under Instagram in the Menu, and in the footer with the Collective's pages
const GALLERY = { key: 'gallery', href: './gallery.html', label: 'Gallery' };
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
  { file: GALLERY.href.slice(2), key: GALLERY.key },
  // the publication's own pages, reached from it and not from the menu: its reading pages (each
  // piece, the editor's note, all the pieces; written whole by this file, READING below), Meet our
  // writers and each writer's own page (written whole, writerPage below), Apply to be a writer (with
  // the site's top bar and stars, as a page of the site's own), and, coming soon for now, the
  // newsletter
  ...READING.map(({ file, key }) => ({ file, key, reading: true })),
  { file: 'writers.html', key: 'writers' },
  ...WRITERS.map((w) => ({ file: w.href.slice(2), key: `writer-${w.slug}`, writer: w })),
  { file: 'write.html', key: 'write' },
  { file: 'newsletter.html', key: 'newsletter' },
  // the stage planner, opened from The production: a full-screen app with its own top bar (no
  // shared parts are written into it; it is listed here so Vite builds it)
  { file: 'stage-planner.html', key: 'planner' },
  // the owner's own to-do list: built and given the shared parts like any page, but linked from
  // nowhere (no menu, footer or page points at it) and marked noindex; opened by its address alone
  { file: 'todo.html', key: 'todo' },
  // Aadi's IA tracker, for the team: unlisted and noindex in the same way, its ticks from content/ia.json
  { file: 'ia.html', key: 'ia' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const current = (key, page) => (key === page ? ' aria-current="page"' : '');
const link = (n, page, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${n.href}"${current(n.key, page)}>${n.label}</a>`;
const ICON_INSTAGRAM = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.6" y="2.6" width="14.8" height="14.8" rx="4.3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="14.6" cy="5.4" r="1" fill="currentColor"/></svg>';

// The four faces every page paints with are preloaded (the top bar and buttons in Lato, the
// headings in Raung, the body in Open Sans): they arrive with the page rather than after its
// first layout asks for them, and document.fonts.ready waits for them, so the text reveals split
// their lines on the real type (SplitText used to split on the fallback, then split again).
// Field measurements (src/util/field.js) go to FIELD_ENDPOINT when the pages are written with it set
// (FIELD_ENDPOINT=https://… node tools/pages/build.mjs); without it the pages carry no endpoint and
// nothing is sent. FIELD_SAMPLE (0-1) is the share of visits that report: one in ten unless set (the
// Pages workflow passes both from the repository's variables; tools/field/README.md).
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const FIELD = process.env.FIELD_ENDPOINT ? `<meta name="dc-field" content="${attr(process.env.FIELD_ENDPOINT)}">
  <meta name="dc-field-sample" content="${attr(process.env.FIELD_SAMPLE || '0.1')}">
  ` : '';
const head = () => `${FIELD}<link rel="icon" href="./assets/brand/mark-gold-144.png">
  <link rel="preload" href="./assets/fonts/Raung-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="./assets/fonts/Lato-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="./assets/fonts/Lato-700.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="./assets/fonts/OpenSans-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="./src/styles/main.css">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin data-dc-live>
  <!-- the page a link points at is fetched when the pointer settles on it or presses it (prefetch,
       never prerender: a prerendered page would miss the curtain's hand-off), so the velvet closes
       onto a page that is already here -->
  <script type="speculationrules">
  { "prefetch": [{ "source": "document", "where": { "and": [{ "href_matches": "/*" }, { "not": { "selector_matches": "[target], [download], [href^='#']" } }] }, "eagerness": "moderate" }] }
  </script>
  <!-- Bare-module map for running without a build step (any static server). Vite resolves the same
       specifiers from node_modules and ignores this map. Keep the versions in step with package.json. -->
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js",
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
    // the owner's trial switches for changes that would show (README: Trial switches): ?flags=a,b turns
    // them on in this browser, ?flags= turns them off; each is a class, flag-<name>, on <html>
    try { var fm = /[?&]flags=([^&#]*)/.exec(location.search), fl = fm ? decodeURIComponent(fm[1]) : (localStorage.getItem('dc-flags') || ''); if (fm) { if (fl) localStorage.setItem('dc-flags', fl); else localStorage.removeItem('dc-flags'); } fl.split(',').forEach(function (n) { if (/^[a-z0-9-]+$/.test(n)) document.documentElement.classList.add('flag-' + n); }); } catch (e) {}
    document.documentElement.classList.add('has-js');
    // the device's tier (README: Tiers), on <html> before the first paint so that styles can follow it too:
    // tier-phone on every touch screen (no hover, a coarse pointer); tier-lite as well on a device short of
    // memory or cores: a touch screen reading 4 GB or less (Chrome rounds down to a power of two: a 4-6 GB
    // phone reads 4) or 4 cores or fewer, or another device reading 4 GB and 4 cores or less, or 2 GB or
    // less. ?flags=full turns both off (the full experience anywhere), ?flags=lite forces lite.
    try {
      var hc = document.documentElement.classList, mm = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
      if (!hc.contains('flag-full')) {
        var touch = mm('(hover: none) and (pointer: coarse)'), mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
        if (touch) hc.add('tier-phone');
        if (hc.contains('flag-lite') || (touch ? (mem && mem <= 4) || (cores && cores <= 4) : (mem && mem <= 2) || (mem && mem <= 4 && cores && cores <= 4))) hc.add('tier-lite');
        // or the frame governor found this device's frames slow earlier in the visit (src/util/governor.js)
        try { if (sessionStorage.getItem('dc-lite') === '1') hc.add('tier-lite'); } catch (e) {}
      }
    } catch (e) {}
    // the failsafe (README): dcFailsafe() shows the page as it is without script (no loader, no closed
    // curtain, the intro's parts shown, the scroll free), for a page whose own script failed before it was
    // up; and if that script has not even started 8 s after the page has loaded (a browser without
    // modules or import maps, a script that did not arrive), it is called then
    // (the page's script sets window.dcBooted as it starts and window.dcUp once the page is up: flags, not
    // performance marks, which some privacy settings hide from scripts)
    window.dcFailsafe = function () {
      var c = document.documentElement.classList; if (c.contains('is-failsafe')) return;
      c.remove('has-js', 'is-loading', 'is-intro', 'is-veiled'); c.add('is-failsafe');
      try { if (window.dcLoader) window.dcLoader.stop(); } catch (e) {}
      // the curtain, taken over by the page's script with inline styles on arrival: back to its open place
      document.querySelectorAll('.veil, .veil__half').forEach(function (v) { v.style.transform = ''; v.style.pointerEvents = ''; });
    };
    addEventListener('load', function () { setTimeout(function () { if (!window.dcBooted) window.dcFailsafe(); }, 8000); });
  </script>`;

// the writers' own pages (Meet our writers, a writer's page, Apply to be a writer) have no Apply now in
// the bar: the way in there is Become a writer, in the publication's banner along the bottom
const WRITER_PAGES = (page) => page === 'writers' || page === 'write' || page.startsWith('writer-');

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
      <span class="topbar__mark" data-lottie="mask-mark"><img src="./assets/brand/mark-gold-144.png" alt="" width="48" height="48"></span>
      <span class="topbar__word"><span>The Drama</span> <span>Collective</span></span>
    </a>
${WRITER_PAGES(page) ? '' : `    <a class="btn btn--inverse btn--sm topbar__apply" href="${APPLY.href}"${current(APPLY.key, page)} data-topbar-keep>${APPLY.label}</a>
`}    <nav class="topbar__nav" aria-label="Main">
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
        <span class="music-bars" aria-hidden="true"><svg class="bar" viewBox="0 0 20 20"><rect x="2.5" y="8" width="2.2" height="9"/></svg><svg class="bar" viewBox="0 0 20 20"><rect x="6.9" y="3" width="2.2" height="14"/></svg><svg class="bar" viewBox="0 0 20 20"><rect x="11.3" y="6" width="2.2" height="11"/></svg><svg class="bar" viewBox="0 0 20 20"><rect x="15.7" y="9" width="2.2" height="8"/></svg></span>
      </button>
      <button class="icon-btn theme-toggle" type="button" aria-pressed="false" aria-label="Light mode" title="House lights" data-theme-toggle>
        <svg class="theme-toggle__sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5"/></g></svg>
        <svg class="theme-toggle__moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M15.9 12.6A6.6 6.6 0 0 1 7.4 4.1a6.6 6.6 0 1 0 8.5 8.5Z" fill="currentColor"/></svg>
      </button>
      <a class="btn btn--secondary btn--sm topbar__gallery" href="${GALLERY.href}"${current(GALLERY.key, page)}>${GALLERY.label}</a>
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
        <li>${link(GALLERY, page)}</li>
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
${[HOME, ABOUT, TEAM, GALLERY, CONTACT, APPLY, CTA].map((n) => `${i(3)}<li>${link(n, page)}</li>`).join('\n')}
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

// (`pad` is the indent of the markers the list is written between: its lines are indented under it)
function contacts(pad = '      ') {
  return `<ul class="contact-cards" data-spot>
${CONTACTS.map((c) => `${pad}  <li class="contact-card">
${pad}    <p class="eyebrow">${esc(c.role)}</p>
${pad}    <p class="contact-card__name">${esc(c.name)}</p>
${pad}    <a class="contact-card__email" href="mailto:${c.email}">${c.email.replace('@', '@<wbr>')}</a>
${pad}    <button class="btn btn--secondary btn--sm contact-card__copy" type="button" data-copy="${c.email}">Copy address</button>
${pad}    <span class="contact-card__spark" data-spark aria-hidden="true"></span>
${pad}  </li>`).join('\n')}
${pad}</ul>`;
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
// (on Apply to be a writer itself, Become a writer goes to the form on the page)
const pubBanner = (page) => `<aside class="pub-ticker" data-pub-ticker aria-label="The publication">
      <div class="pub-ticker__bar" data-mask>
        <span class="pub-mark pub-ticker__mark" aria-hidden="true"></span>
        <div class="pub-ticker__strip">
          <p class="pub-ticker__track"><span class="pub-ticker__item">${PUB_LINE}</span></p>
        </div>
        <div class="pub-ticker__actions">
          <a class="pub-btn pub-ticker__cta" href="${page === 'write' ? '#apply-form' : WRITE.href}">${WRITE.label}</a>
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

// ---- The home page's act three, this month's publication (<!-- site:issue --> in index.html) ----
// The newest issue's pieces in their order, each a link to its own page, laid out after a magazine's
// front page: the first is the lead, on the issue's stage photo; the next four are a list, each on
// the logo mark in its card's colours on the publication (.issue__tile in src/styles/layout.css);
// any more are named under them, beside the issue's cover, over the link to the publication. An
// issue's pictures go in ISSUE_ART; an issue without them has the mark on a tile for its lead, and
// no cover.
const ISSUE_ART = {
  'Oct 2026': { photo: 'assets/publication/stage-photo-october-2026.webp', cover: 'assets/publication/cover-october-2026.webp' },
};
const ISSUE_LISTED = 4; // the pieces in the list under the lead

/** @param {{ toneOf: Function, byline: Function }} cards  the card helpers (src/publication/cards.js) */
function homeIssue({ toneOf, byline }, pad = '          ') {
  const issue = PUBLISHED.at(-1).issue;
  const art = ISSUE_ART[issue] ?? {};
  // the lead is the piece the issue's photo belongs to (its `photo` in pieces-data.js), so the
  // picture is never under someone else's piece; without one, the issue's first piece
  const pieces = PUBLISHED.filter((p) => p.issue === issue);
  const own = art.photo && pieces.find((p) => (p.photo?.src ?? p.photo) === art.photo);
  const lead = own || pieces[0];
  const rest = pieces.filter((p) => p !== lead);
  const listed = rest.slice(0, ISSUE_LISTED);
  const more = rest.slice(ISSUE_LISTED);
  const indent = (ls) => ls.map((l) => `  ${l}`);
  const lang = (p) => (p.lang ? ` lang="${esc(p.lang)}"` : '');
  const img = (src) => { const { w, h } = webpSize(src); return `<img src="./${esc(src)}" alt="" width="${w}" height="${h}" loading="lazy" decoding="async">`; };
  const tile = (p, cls) => `<span class="issue__art ${cls} issue__tile" data-tone="${toneOf(p)}" aria-hidden="true"><span class="pub-mark"></span></span>`;
  const text = (p) => ['<span class="issue__text">', ...indent([
    ...(p.form ? [`<span class="issue__kicker">${esc(p.form)}</span>`] : []),
    `<span class="issue__title"${lang(p)}>${esc(p.title)}</span>`,
    `<span class="issue__by">${esc(byline(p))}</span>`,
  ]), '</span>'];
  const lines = [
    `<a class="issue__lead" href="${pieceHref(lead)}">`,
    ...indent([art.photo ? `<span class="issue__art issue__art--photo" aria-hidden="true">${img(art.photo)}</span>` : tile(lead, 'issue__art--lead'), ...text(lead)]),
    '</a>',
    '<ol class="issue__list" data-stagger>',
    ...listed.flatMap((p) => indent(['<li>', ...indent([`<a class="issue__item" href="${pieceHref(p)}">`, ...indent([tile(p, 'issue__art--sm'), ...text(p)]), '</a>']), '</li>'])),
    '</ol>',
    // (the cover repeats the link under it, so it is left out of the tab order and the reading)
    '<div class="issue__foot" data-stagger>',
    ...indent([
      ...(art.cover ? [`<a class="issue__cover" href="./publication.html" tabindex="-1" aria-hidden="true">${img(art.cover)}</a>`] : []),
      '<div class="issue__also">',
      ...indent([
        ...(more.length ? [`<p class="issue__kicker">Also in the ${issueName(issue)} issue</p>`, '<ul class="issue__also-list">',
          ...indent(more.map((p) => `<li><a href="${pieceHref(p)}"><span class="issue__title"${lang(p)}>${esc(p.title)}</span> <span class="issue__by">${esc(byline(p))}</span></a></li>`)),
          '</ul>'] : []),
        '<a class="issue__more" href="./publication.html">The publication</a>',
      ]),
      '</div>',
    ]),
    '</div>',
  ];
  return lines.map((l, i) => (i ? pad + l : l)).join('\n');
}

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
// site's [data-reveal]), the piece's dek if it has one (a line under the title), who wrote it (a
// link to the writer's own page, where they have one) and the gold rule.
const authorLink = (name) => {
  const w = writerNamed(name);
  return w ? `<a class="read__author" href="${w.href}">${esc(name)}</a>` : `<span class="read__author">${esc(name)}</span>`;
};
const readHead = ({ issue, kind, title, dek, author: by }) => `<header class="read__head">
        ${BACK}
        <p class="pub-label read__kicker"><time datetime="${issueDate(issue)}">${esc(issue)}</time><span class="read__dot" aria-hidden="true"></span><span>${esc(kind)}</span></p>
        <h1 class="read__title" id="read-title" data-reveal>${esc(title)}</h1>${dek ? `
        <p class="read__dek">${esc(dek)}</p>` : ''}
        <p class="read__by">By ${authorLink(by)}</p>
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
  // each card carries its form and its month (the issue, as "2026-10"), for the filters
  const cards = issues.flatMap((issue) => PUBLISHED.filter((p) => p.issue === issue))
    .map((p) => pieceCard(p, { level: 2 })
      .replace('<li class="pub-piece"', `<li class="pub-piece" data-form="${esc(p.form ?? '')}" data-month="${issueDate(p.issue)}" data-month-name="${esc(issueName(p.issue))}"`)
      .split('\n').map((l) => `          ${l}`).join('\n'));
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
          <!-- two filters, by form and by month (src/publication/index-filters.js fills their chips
               from the cards below); hidden without scripts, which show every piece -->
          <div class="read__filters" data-index-filters hidden>
            <div class="pub-pieces__filter" data-index-filter="form">
              <button class="pub-pieces__filter-btn" type="button" aria-expanded="false" aria-controls="index-forms">
                <span class="pub-label pub-pieces__filter-key">Form</span>
                <span class="pub-label pub-pieces__filter-value" data-index-value>All</span>
                <svg class="pub-pieces__caret" viewBox="0 0 10 6" aria-hidden="true" focusable="false"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="pub-pieces__forms" id="index-forms" role="group" aria-label="Filter the pieces by form" hidden></div>
            </div>
            <div class="pub-pieces__filter" data-index-filter="month">
              <button class="pub-pieces__filter-btn" type="button" aria-expanded="false" aria-controls="index-months">
                <span class="pub-label pub-pieces__filter-key">Month</span>
                <span class="pub-label pub-pieces__filter-value" data-index-value>All</span>
                <svg class="pub-pieces__caret" viewBox="0 0 10 6" aria-hidden="true" focusable="false"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="pub-pieces__forms" id="index-months" role="group" aria-label="Filter the pieces by month" hidden></div>
            </div>
          </div>
        </header>
        <p class="sr-only" aria-live="polite" data-index-status></p>
        <ul class="pub-pieces__grid read__grid" data-index-grid>
${cards.join('\n')}
        </ul>
      </div>
    </section>`,
  };
}

// ---- The publication's writers: Meet our writers (writers.html) and each writer's own page ----
// Five writers have neither photo nor introduction yet (content/writers.json: "awaiting"): Anika
// Megha Kruthiventi, Kathya Yaratapalli, Mehek Jain, Nisha Sriram and Venkatesh Kalasamudram. Until
// theirs come in, the mark on a tile in their colour stands in for the photo, and SOON for the words.
const SOON = 'Their introduction is on its way.';
/** Lines of markup set in at the given indent. */
const indented = (html, pad) => html.split('\n').map((l) => (l ? pad + l : l)).join('\n');

/**
 * A writer's photo in a frame of class `cls`; without one, the mark on a tile in their colour.
 * `attrs` go on the frame, and `inner` is markup laid inside it, over the picture.
 */
const portrait = (w, cls, { lazy = true, attrs = '', inner = '' } = {}) => {
  if (!w.photo) return `<span class="${cls} ${cls}--mark pub-tile" data-tone="${w.tone}"${attrs}><span class="pub-mark"></span>${inner}</span>`;
  const { w: width, h } = webpSize(w.photo);
  return `<span class="${cls}"${attrs}><img src="./${esc(w.photo)}" alt="" width="${width}" height="${h}"${lazy ? ' loading="lazy"' : ''} decoding="async">${inner}</span>`;
};
/** A writer's introduction as paragraphs (or the line that says it is on its way), at an indent. */
const introParas = (w, pad) => (w.intro
  ? w.intro.map((t) => `${pad}<p>${esc(t)}</p>`).join('\n')
  : `${pad}<p class="writer-soon">${SOON}</p>`);

/** The issues the writers are grouped by: the dated ones, oldest first, then those still to be dated. */
const writerIssues = () => [...new Set(PIECES.filter((p) => writerNamed(p.author)).map((p) => p.issue))]
  .sort((a, b) => (a === 'TBA') - (b === 'TBA') || issueDate(a).localeCompare(issueDate(b)))
  .map((issue) => ({ issue, key: issue === 'TBA' ? 'tba' : issueDate(issue), label: issue === 'TBA' ? 'Date to be announced' : issueName(issue) }));


/**
 * Meet our writers: the filter by issue, then a section per issue (October 2026, November 2026, ...,
 * then those still to be dated) of the writers with a piece in it, published or to come, as Core
 * team's cards (src/styles/pages.css .member): the photo, the name, and under it "Read all works". A
 * writer with pieces in two issues is in both. Each card is one link, to the writer's own page. Over
 * the photo lies the short version of their introduction (content/writers.json `short`), shown when
 * the photo is pointed at or the card has the keyboard's focus (src/styles/writers.css); to a screen
 * reader it is the link's description, so the link's name stays their name and "Read all works".
 */
function writersMonths() {
  const issues = writerIssues();
  const filters = `<div class="team-filter writers-filter" role="group" aria-label="Show an issue">
        <button class="team-filter__btn" type="button" aria-pressed="true" data-filter="all">Every issue</button>
${issues.map((m) => `        <button class="team-filter__btn" type="button" aria-pressed="false" data-filter="${m.key}">${esc(m.label)}</button>`).join('\n')}
      </div>`;
  const months = issues.map(({ issue, key, label }) => {
    const pieces = PIECES.filter((p) => p.issue === issue && writerNamed(p.author)).sort((a, b) => a.order - b.order);
    const note = pieces.every((p) => p.status === 'latest') ? 'Out now' : pieces.every((p) => p.status === 'upcoming') ? 'Coming' : '';
    const cards = [...new Set(pieces.map((p) => p.author))].map(writerNamed).map((w) => {
      const about = `about-${key}-${w.id}`;
      const words = w.short ? `<span class="member__about-text">${esc(w.short)}</span>` : `<span class="member__about-text writer-soon">${SOON}</span>`;
      return `            <li class="member">
              <a class="member__card" href="${w.href}" data-writer="${w.id}" aria-describedby="${about}">
                ${portrait(w, 'member__photo', { inner: `<span class="member__about" id="${about}" aria-hidden="true">${words}</span>` })}
                <span class="member__name">${esc(w.name)}</span>
                <span class="member__more">Read all works${ARROW_R}</span>
              </a>
            </li>`;
    }).join('\n');
    return `        <section class="writers-month" data-month="${key}" data-flip-id="${key}" aria-labelledby="month-${key}">
          <header class="writers-month__head" data-mask>
            <h2 class="writers-month__title" id="month-${key}">${issue === 'TBA' ? esc(label) : `<time datetime="${key}">${esc(label)}</time>`}</h2>${note ? `
            <p class="eyebrow writers-month__note">${note}</p>` : ''}
          </header>
          <ul class="team-grid writers-grid">
${cards}
          </ul>
        </section>`;
  }).join('\n');
  return `${filters}
      <div class="writers-months" data-spot data-writers>
${months}
      </div>`;
}

// the latest pieces, newest issue first, each issue in its own order (as src/publication/pieces.js)
const byNewest = (a, b) => issueDate(b.issue).localeCompare(issueDate(a.issue)) || a.order - b.order;

/**
 * A writer's own page. The head: a button back to Meet our writers, their photo as a round profile
 * picture, and their name; no introduction on the page itself. The photo and the name open the
 * spotlight panel (Core team's, src/site/people.js, through src/pages/writer.js), filled from the
 * page's .writer-about: their whole introduction, nothing else (their pieces are on the page
 * itself; for visitors without scripts, who have no panel, it is a section at the foot of the page). Below, their pieces in two
 * columns, each under a plain label: on the left the ones to come, as the publication's list
 * (cards.js pieceRow; "Remind me" goes to the newsletter on the publication), and on the right the
 * ones that are out, as its grid of cards (pieceCard), every one of them. A column with nothing in
 * it says so in a line. On a phone the columns stack: the pieces that are out first, or the ones to
 * come when nothing is out yet; the page holds them in that order, and src/styles/writers.css sets
 * them side by side on a wide screen (where src/pages/writer.js puts the ones to come first in the
 * page, so the keyboard and a screen reader take the columns in the order they are seen).
 */
function writerPage(w, { pieceCard, pieceRow }) {
  const out = w.pieces.filter((p) => p.status === 'latest').sort(byNewest);
  const coming = w.pieces.filter((p) => p.status === 'upcoming');
  const next = coming.find((p) => p.issue !== 'TBA');
  const role = ['Writer', w.role].filter(Boolean).join(' · ');
  const column = (kind, label, items, none) => `            <section class="writer-col writer-col--${kind}" aria-labelledby="${kind}-title">
              <h2 class="pub-label writer-col__title" id="${kind}-title">${label}</h2>
${items.length ? `              <ul class="writer-col__${kind === 'out' ? 'grid' : 'list'}">
${indented(items.join('\n'), '                ')}
              </ul>` : `              <p class="writer-col__none">${none}</p>`}
            </section>`;
  const outCol = column('out', 'Out now', out.map((p) => pieceCard(p)), 'Nothing out yet.');
  const upCol = column('upcoming', 'Upcoming', coming.map((p) => pieceRow(p, { next: p === next, remind: './publication.html#news' })), 'Nothing announced yet.');
  return {
    title: w.name,
    description: `${w.name} writes for The Drama Collective’s theatre publication: ${w.intro ? 'an introduction in their own words, and ' : ''}${out.length && coming.length ? 'their pieces, out now and to come' : out.length ? 'their published pieces' : 'their pieces to come'}.`,
    source: 'content/writers.json, content/team.json and src/publication/pieces-data.js',
    kind: 'writer',
    script: 'writer',
    main: `    <article class="writer" aria-labelledby="read-title">
      <header class="writer-head">
        <div class="pub-wrap">
          <a class="pub-btn back-btn" href="./writers.html">${ARROW_L}<span>Back to the writers</span></a>
          <div class="writer-head__who" data-stagger>
            ${portrait(w, 'writer-head__photo', { lazy: false, attrs: ' data-writer-photo' })}
            <div class="writer-head__text">
              <p class="pub-label read__kicker"><span>Writer</span>${w.role ? `<span class="read__dot" aria-hidden="true"></span><span>${esc(w.role)}</span>` : ''}</p>
              <h1 class="read__title writer-head__name" id="read-title"><button class="writer-head__open" type="button" aria-haspopup="dialog" aria-controls="spotlight" data-writer-open>${esc(w.name)}</button></h1>
            </div>
          </div>
        </div>
      </header>

      <div class="writer-pieces">
        <div class="pub-wrap">
          <div class="writer-cols${out.length ? '' : ' writer-cols--none-out'}">
${out.length ? `${outCol}\n${upCol}` : `${upCol}\n${outCol}`}
          </div>
        </div>
      </div>

      <!-- what the spotlight panel holds: their introduction (src/pages/writer.js);
           without scripts, where there is no panel, a part of the page -->
      <section class="writer-about" aria-labelledby="about-title">
        <div class="pub-wrap">
          <h2 class="pub-label writer-col__title" id="about-title">About ${esc(w.name)}</h2>
          <div class="writer-about__body" data-writer-panel data-role="${esc(role)}">
${introParas(w, '            ')}
          </div>
        </div>
      </section>

      <dialog class="spotlight spotlight--writer" id="spotlight" aria-labelledby="spotlight-name">
        <div class="spotlight__inner">
          <div class="spotlight__photo" data-spotlight-photo></div>
          <div class="spotlight__body">
            <p class="eyebrow" data-spotlight-role></p>
            <h2 class="spotlight__name" id="spotlight-name" data-spotlight-name></h2>
            <span class="rule" aria-hidden="true"></span>
            <div class="spotlight__intro" data-spotlight-intro></div>
          </div>
          <button class="icon-btn spotlight__close" type="button" aria-label="Close" data-spotlight-close>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>
      </dialog>
    </article>`,
  };
}

/** A reading page, whole, with its shared parts' markers empty (build() fills them like any page's).
 * `kind` adds a class to the page (page--writer), and `script` names the page's own script. */
const readingPage = (key, { title, description, source, main, kind = '', script = 'reading' }) => `<!doctype html>
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
<body class="page page--reading${kind ? ` page--${kind}` : ''} page--${key}">
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

  <script type="module" src="./src/pages/${script}.js"></script>
</body>
</html>
`;

function fill(src, name, html, indent = '  ') {
  const re = new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`);
  if (!re.test(src)) return src;
  return src.replace(re, () => `<!-- site:${name} -->\n${indent}${html}\n${indent}<!-- /site:${name} -->`);
}

// The Gallery (gallery.html): a section an event, newest first, from content/gallery.json: its date,
// its name, how many pictures, its film where it has one (played only when asked: preload="none"),
// then its pictures as tiles, each a link to the picture whole (src/pages/gallery.js opens it in a
// lightbox instead, and steps through the event's pictures), and its clips (short, silent, played
// while on screen). The pictures and films are made by tools/gallery/make.mjs, which also writes their
// sizes here. The file is checked first, as content/ia.json is.
function readGallery() {
  const g = readJSON('content/gallery.json');
  const bad = (why) => { throw new Error(`content/gallery.json: ${why}`); };
  if (!Array.isArray(g.events) || !g.events.length) bad('"events" is missing');
  const keys = new Set();
  for (const e of g.events) {
    if (!/^[a-z0-9-]+$/.test(e.key ?? '') || keys.has(e.key)) bad(`each event needs its own "key", in small letters, digits and - (${JSON.stringify(e.key)})`);
    keys.add(e.key);
    if (typeof e.title !== 'string' || !e.title.trim()) bad(`${e.key}: "title" is missing`);
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(e.date ?? '')) bad(`${e.key}: "date" should be written YYYY-MM-DD (or YYYY-MM), not ${JSON.stringify(e.date)}`);
    if (typeof e.when !== 'string' || !e.when.trim()) bad(`${e.key}: "when" (the date as shown, like "8 and 9 October 2026") is missing`);
    if (e.film?.drive != null && !/^[\w-]{20,}$/.test(e.film.drive)) bad(`${e.key}: "film.drive" should be the film's Google Drive file id`);
    for (const m of [...(e.photos ?? []), ...(e.clips ?? []), ...(e.film && !e.film.drive ? [e.film] : [])]) {
      if (typeof m.src !== 'string' || !(m.w > 0) || !(m.h > 0)) bad(`${e.key}: a picture or film needs "src", "w" and "h" (run tools/gallery/make.mjs)`);
    }
    if (!e.photos?.length && !e.film) bad(`${e.key}: no pictures yet (run tools/gallery/make.mjs)`);
  }
  return g;
}
function gallery(pad) {
  const { events } = readGallery();
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const section = (e) => {
    const photos = e.photos ?? [];
    const clips = e.clips ?? [];
    const count = [photos.length && plural(photos.length, 'picture'), clips.length && plural(clips.length, 'clip'), e.film && 'the film'].filter(Boolean).join(', ');
    const tile = (m, i) => `    <li class="gal-tile${i === 0 ? ' gal-tile--lead' : ''}"><a class="gal-tile__link" href="./${m.src}.webp" data-gal-photo data-w="${m.w}" data-h="${m.h}"><img src="./${m.src}-s.webp" alt="${esc(e.title)}: picture ${i + 1} of ${photos.length}${m.from === 'film' ? ', from the film' : ''}" width="${m.tw ?? m.w}" height="${m.th ?? m.h}" loading="lazy" decoding="async"></a></li>`;
    const clip = (m, i) => `    <li class="gal-tile gal-tile--clip"><video class="gal-tile__clip" src="./${m.src}.mp4" poster="./${m.src}.webp" width="${m.w}" height="${m.h}" muted loop playsinline preload="none" aria-label="${esc(e.title)}: clip ${i + 1} of ${clips.length}, without sound" data-gal-clip></video><span class="gal-tile__badge" aria-hidden="true">Clip</span></li>`;
    // the film: ours (made by make.mjs), or, too long to keep in the site, played from Google Drive in
    // its own player, which loads only once Play is pressed (src/pages/gallery.js; without scripts the
    // link opens it on Drive)
    const caption = e.film ? `<figcaption class="gal-film__caption">${esc(e.film.caption ?? `${e.title}: the film`)}${e.film.length ? ` <span class="gal-film__len">${esc(e.film.length)}</span>` : ''}</figcaption>` : '';
    const film = !e.film ? '' : e.film.drive ? `
  <figure class="gal-film">
    <div class="gal-film__frame" data-gal-drive="${esc(e.film.drive)}">
      ${e.film.poster ? `<img class="gal-film__poster" src="./${e.film.poster}.webp" alt="" loading="lazy" decoding="async">` : ''}
      <a class="gal-film__play" href="https://drive.google.com/file/d/${esc(e.film.drive)}/view" target="_blank" rel="noopener" data-gal-play><span class="gal-film__play-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z" fill="currentColor"/></svg></span><span>Play the film</span></a>
    </div>
    ${caption}
  </figure>` : `
  <figure class="gal-film">
    <video class="gal-film__video" src="./${e.film.src}.mp4" poster="./${e.film.src}.webp" width="${e.film.w}" height="${e.film.h}" controls playsinline preload="none"></video>
    ${caption}
  </figure>`;
    return `<section class="act gal-event" id="${e.key}" aria-labelledby="${e.key}-title" data-gal-event>
  <header class="gal-event__head ground" data-mask>
    <p class="eyebrow"><time datetime="${e.date}">${esc(e.when)}</time></p>
    <h2 class="act__title" id="${e.key}-title">${esc(e.title)}</h2>
    <p class="gal-event__count">${count}</p>
  </header>${film}
  <ul class="gal-grid">
${[...photos.map(tile), ...clips.map(clip)].join('\n')}
  </ul>
</section>`;
  };
  const html = `<nav class="gal-jump" aria-label="The events">
  <ul>
${events.map((e) => `    <li><a class="gal-jump__link" href="#${e.key}">${esc(e.title)}</a></li>`).join('\n')}
  </ul>
</nav>

${events.map(section).join('\n\n')}

<!-- a picture whole (src/pages/gallery.js) -->
<dialog class="gal-box" aria-label="Picture" tabindex="-1" data-gal-box>
  <figure class="gal-box__figure">
    <img class="gal-box__img" alt="" data-gal-box-img>
    <figcaption class="gal-box__caption" data-gal-box-caption></figcaption>
  </figure>
  <button class="icon-btn gal-box__btn gal-box__btn--prev" type="button" aria-label="Previous picture" data-gal-prev><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button class="icon-btn gal-box__btn gal-box__btn--next" type="button" aria-label="Next picture" data-gal-next><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button class="icon-btn gal-box__btn gal-box__close" type="button" aria-label="Close" data-gal-close><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
</dialog>`;
  return html.split('\n').map((l, i) => (i && l ? pad + l : l)).join('\n');
}

// Aadi's IA tracker (ia.html, unlisted like To do): one column a subject, its steps from
// content/ia.json, each ticked or not. The ticks are only ever set there (and the page written again);
// nothing on the page can change one. A step marked "scrapped" (Math's first idea) is a turn in the
// road: once it is ticked, the steps before it are shown as the idea left behind.
// The file is checked first, and the build stops with the reason if something in it would not show
// (a date not written YYYY-MM-DD, a "done" that is not true or false, no way to send a reminder).
function readIA() {
  const ia = readJSON('content/ia.json');
  const bad = (why) => { throw new Error(`content/ia.json: ${why}`); };
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ia.updated ?? ''));
  const day = ymd && new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]));
  if (!day || day.getUTCMonth() !== +ymd[2] - 1 || day.getUTCDate() !== +ymd[3]) bad(`"updated" should be a date written YYYY-MM-DD, not ${JSON.stringify(ia.updated)}`);
  if (typeof ia.person !== 'string' || !ia.person.trim()) bad('"person" is missing');
  if (!Array.isArray(ia.subjects) || !ia.subjects.length) bad('"subjects" is missing');
  for (const s of ia.subjects) {
    if (!s.key || !s.name || !Array.isArray(s.steps) || !s.steps.length) bad(`a subject needs a "key", a "name" and its "steps" (${JSON.stringify(s.name ?? s.key)})`);
    if (s.what != null && (typeof s.what !== 'string' || !s.what.trim())) bad(`${s.name}: "what" should be the words the reminder uses, like "Physics IA"`);
    for (const st of s.steps) {
      if (typeof st.label !== 'string' || !st.label.trim()) bad(`a step in ${s.name} has no "label"`);
      if (typeof st.done !== 'boolean') bad(`${s.name}, "${st.label}": "done" should be true or false (no quotes), not ${JSON.stringify(st.done)}`);
    }
  }
  const r = ia.remind ?? {};
  if (!/^[\w-]{1,64}$/.test(r.ntfyTopic ?? '')) bad('"remind.ntfyTopic" should be letters, digits, - and _ only');
  if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(r.email ?? '')) bad('"remind.email" should be the address the email copy goes to');
  return ia;
}
const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 8.4l3 3 6.2-6.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/></svg>';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function iaTracker(pad) {
  const ia = readIA();
  const count = (steps) => [steps.filter((s) => s.done).length, steps.length];
  const all = ia.subjects.flatMap((s) => s.steps);
  const [done, total] = count(all);
  const [y, m, d] = ia.updated.split('-').map(Number);
  const updated = `${d} ${MONTH_NAMES[m - 1]} ${y}`;
  const bar = (n, of, label, cls) => `<div class="${cls}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${of}" aria-valuenow="${n}" aria-valuetext="${n} of ${of} ${of === 1 ? 'step' : 'steps'} done"><span style="--p: ${of ? n / of : 0}"></span></div>`;
  const col = (s) => {
    const [n, of] = count(s.steps);
    const turn = s.steps.findIndex((st) => st.kind === 'scrapped' && st.done);
    const steps = s.steps.map((st, i) => {
      const cls = ['ia-step', st.done ? 'is-done' : '', st.kind === 'scrapped' ? 'ia-step--scrapped' : '', turn > i ? 'is-left-behind' : ''].filter(Boolean).join(' ');
      return `    <li class="${cls}"><span class="ia-tick">${st.done ? TICK : ''}</span><span class="ia-step__label">${esc(st.label)}</span><span class="sr-only">: ${st.done ? 'done' : 'not done yet'}</span></li>`;
    });
    // Remind him (src/pages/ia.js), until the subject is done; shown once scripts run
    const remind = n < of
      ? `\n      <button class="ia-col__remind" type="button" data-ia-remind data-what="${esc(s.what ?? `${s.name} IA`)}" data-done="${n}" data-total="${of}" aria-label="Remind ${esc(ia.person)} about ${esc(s.name)}" hidden>Remind him</button>`
      : '';
    return `<li class="ia-col${n === of ? ' is-complete' : ''}" data-subject="${esc(s.key)}">
  <header class="ia-col__head">
    <h2 class="ia-col__name">${esc(s.name)}</h2>
    <div class="ia-col__meta">
      <p class="ia-col__count"><span class="ia-col__done">${n}</span> / ${of}</p>${remind}
    </div>
  </header>
  ${bar(n, of, `${s.name}: steps done`, 'ia-bar ia-col__bar')}
  <ol class="ia-steps">
${steps.join('\n')}
  </ol>
</li>`;
  };
  const html = `<div class="ia-overall" data-ia-done="${done}" data-ia-total="${total}">
  <p class="ia-overall__count"><span class="ia-overall__n">${done}</span> of ${total} steps done</p>
  <p class="ia-overall__updated">Updated ${esc(updated)}</p>
</div>
${bar(done, total, 'All the IAs: steps done', 'ia-bar ia-overall__bar')}
<ul class="ia-grid">
${ia.subjects.map(col).join('\n')}
</ul>`;
  return html.split('\n').map((l, i) => (i && l ? pad + l : l)).join('\n');
}

// Remind him (ia.html): the popup that asks a visitor's name the first time (src/pages/ia.js then
// remembers it), and the note that says where the reminder went. Where it goes is set here, from
// content/ia.json: a push to Aadi's phone (ntfy.sh) and an email (FormSubmit).
function iaRemind(pad) {
  const { person, remind } = readIA();
  const p = esc(person);
  const html = `<dialog class="ia-ask" data-ia-ask data-person="${p}" data-ntfy-topic="${esc(remind.ntfyTopic)}" data-email="${esc(remind.email)}" aria-labelledby="ia-ask-title">
  <form class="ia-ask__inner" method="dialog" data-ia-ask-form>
    <h2 class="ia-ask__title" id="ia-ask-title" data-ia-ask-title>Remind ${p}</h2>
    <label class="sr-only" for="ia-ask-name">Your name</label>
    <input class="ia-ask__input" id="ia-ask-name" name="name" type="text" autocomplete="name" maxlength="40" placeholder="Your Name" required>
    <div class="ia-ask__actions">
      <button class="btn btn--inverse" type="submit" data-ia-ask-send>Send the reminder</button>
      <button class="btn btn--ghost" type="button" data-ia-ask-cancel>Cancel</button>
    </div>
  </form>
</dialog>
<div class="ia-toast" role="status" aria-live="polite" data-ia-toast></div>`;
  return html.split('\n').map((l, i) => (i && l ? pad + l : l)).join('\n');
}

/** @param {string[]} [only]  page keys or files to write (none: every page) */
export async function build(only = []) {
  // the grid's card is the publication's own (src/publication/cards.js: plain strings, no DOM),
  // loaded here rather than at the top so that importing the page list (vite.config.js) needs it not
  const { pieceCard, pieceRow } = await import('../../src/publication/cards.js');
  // (a piece's writer is found by the name printed on it: one missing from content/writers.json
  // has no page, and no card on Meet our writers)
  if (!only.length) {
    for (const name of new Set(PIECES.map((p) => p.author).filter(Boolean))) {
      if (!writerNamed(name)) console.warn(`${name} writes for the publication but is not in content/writers.json`);
    }
  }
  for (const { file, key, reading, writer } of PAGES) {
    if (only.length && !only.includes(key) && !only.includes(file)) continue;
    const path = join(ROOT, file);
    let src;
    try { src = readFileSync(path, 'utf8'); } catch { src = null; }
    // a reading page (or a writer's) is written whole each time, from its text (the same text gives
    // the same page)
    let out;
    if (reading) {
      const r = READING.find((p) => p.key === key);
      out = readingPage(key, r.piece ? piecePage(r.piece) : key === 'pieces' ? piecesPage(pieceCard) : editorsNotePage());
    } else if (writer) out = readingPage(key, writerPage(writer, { pieceCard, pieceRow }));
    else if (src === null) { console.warn(`skip ${file}: not found`); continue; }
    else out = src;
    const crlf = !!src?.includes('\r\n');
    out = out.replace(/\r\n/g, '\n');
    out = fill(out, 'head', head());
    out = fill(out, 'header', header(key));
    if (key !== 'home') out = fill(out, 'stage', stage(!reading && !writer));
    out = fill(out, 'pubbanner', pubBanner(key), '    ');
    out = fill(out, 'footer', footer(key));
    if (key === 'home') out = fill(out, 'links', pageLinks('home', '        ', 'curtain__links--dock', true), '        ');
    if (key === 'home') out = fill(out, 'issue', homeIssue(await import('../../src/publication/cards.js')), '          ');
    if (key === 'team') out = fill(out, 'team', team(), '      ');
    if (key === 'writers') out = fill(out, 'writers', writersMonths(), '      ');
    if (key === 'contact') out = fill(out, 'contacts', contacts('      '), '      ');
    if (key === 'sponsor') out = fill(out, 'contacts', contacts('        '), '        ');
    if (key === 'gallery') out = fill(out, 'gallery', gallery('    '), '    ');
    if (key === 'ia') out = fill(out, 'ia', iaTracker('      '), '      ');
    if (key === 'ia') out = fill(out, 'ia-remind', iaRemind('    '), '    ');
    out = out.replace(/(<a [^>]*data-instagram[^>]*href=")[^"]*(")/g, `$1${INSTAGRAM.href}$2`);
    if (crlf) out = out.replace(/\n/g, '\r\n');
    if (out !== src) { writeFileSync(path, out); console.log(`wrote ${file}`); }
    else console.log(`unchanged ${file}`);
  }
}

// run as a script (npm run pages; or, for some pages only, with their keys or files after it);
// importing the page list (vite.config.js) writes nothing
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build(process.argv.slice(2));

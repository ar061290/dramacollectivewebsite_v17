// The shared parts of every page, written into each HTML file between marker comments:
//   <!-- site:head -->    icon, fonts, styles, import map, the theme and curtain check before paint
//   <!-- site:header -->  skip link, the curtain veil (page transitions) and the top bar
//   <!-- site:stage -->   the star sky and the drawn cursor (pages other than the home page,
//                         which has its own stage)
//   <!-- site:footer -->  the curtain-call footer
//   <!-- site:team -->    team.html only: the core team's cards, from content/team.json
// Run after editing this file or content/team.json:  npm run pages
// Each file keeps its own line endings.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const NAV = [
  { key: 'about', href: './about.html', label: 'About us' },
  { key: 'team', href: './team.html', label: 'Core team' },
  { key: 'publication', href: './publication.html', label: 'The publication' },
  { key: 'production', href: './production.html', label: 'The production' },
  { key: 'flash-plays', href: './flash-plays.html', label: 'Flash plays' },
  { key: 'workshops', href: './workshops.html', label: 'Workshops' },
  { key: 'outreach', href: './outreach.html', label: 'Social outreach' },
];
const CTA = { key: 'sponsor', href: './sponsor.html', label: 'Become a sponsor' };

export const PAGES = [
  { file: 'index.html', key: 'home' },
  ...NAV.map((n) => ({ file: n.href.slice(2), key: n.key })),
  { file: 'sponsor.html', key: 'sponsor' },
  // the stage planner, opened from The production: a full-screen app with its own top bar (no
  // shared parts are written into it; it is listed here so Vite builds it)
  { file: 'stage-planner.html', key: 'planner' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const current = (key, page) => (key === page ? ' aria-current="page"' : '');

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

const header = (page) => `<a class="skip-link" href="#main">Skip to content</a>

  <div class="veil" aria-hidden="true">
    <div class="veil__half veil__half--l"></div>
    <div class="veil__half veil__half--r"></div>
  </div>

  <header class="topbar" data-topbar>
    <a class="topbar__brand" href="${page === 'home' ? '#top' : './index.html'}" aria-label="The Drama Collective, ${page === 'home' ? 'back to top' : 'home'}">
      <span class="topbar__mark" data-lottie="mask-mark"><img src="./assets/brand/mark-gold.png" alt=""></span>
      <span class="topbar__word"><span>The Drama</span> <span>Collective</span></span>
    </a>
    <nav class="topbar__nav" aria-label="Main">
      <ul class="topbar__links">
${NAV.map((n) => `        <li><a href="${n.href}"${current(n.key, page)}>${n.label}</a></li>`).join('\n')}
      </ul>
      <span class="topbar__glint" aria-hidden="true"></span>
    </nav>
    <div class="topbar__tools">
      <button class="icon-btn music-toggle" type="button" aria-pressed="false" aria-label="Music" title="Play music" data-music-toggle>
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect class="bar" x="2.5" y="8" width="2.2" height="9"/><rect class="bar" x="6.9" y="3" width="2.2" height="14"/><rect class="bar" x="11.3" y="6" width="2.2" height="11"/><rect class="bar" x="15.7" y="9" width="2.2" height="8"/></svg>
      </button>
      <button class="icon-btn theme-toggle" type="button" aria-pressed="false" aria-label="Light mode" title="House lights" data-theme-toggle>
        <svg class="theme-toggle__sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5"/></g></svg>
        <svg class="theme-toggle__moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M15.9 12.6A6.6 6.6 0 0 1 7.4 4.1a6.6 6.6 0 1 0 8.5 8.5Z" fill="currentColor"/></svg>
      </button>
    </div>
    <button class="topbar__menu" type="button" aria-expanded="false" aria-controls="menu-sheet" data-menu-toggle>Menu</button>
    <a class="btn btn--inverse btn--sm topbar__cta" href="${CTA.href}"${current(CTA.key, page)}>${CTA.label}</a>
    <div class="topbar__sheet" id="menu-sheet" data-menu-sheet>
      <ul>
        <li><a href="./index.html"${current('home', page)}>Home</a></li>
${[...NAV, CTA].map((n) => `        <li><a href="${n.href}"${current(n.key, page)}>${n.label}</a></li>`).join('\n')}
      </ul>
    </div>
  </header>`;

const stage = () => `<div class="stage" aria-hidden="true">
    <canvas class="stage__stars"></canvas>
  </div>

  <div class="cursor" aria-hidden="true">
    <span class="cursor__glow"></span>
    <svg class="cursor__star" viewBox="-12 -17 24 34" focusable="false"><path class="cursor__star-plain" d="M0 -10C1 -2 2 -1 10 0 2 1 1 2 0 10 -1 2 -2 1 -10 0 -2 -1 -1 -2 0 -10Z"/><path class="cursor__star-text" d="M0 -15C0.66 -3 1.32 -1.5 6.6 0 1.32 1.5 0.66 3 0 15 -0.66 3 -1.32 1.5 -6.6 0 -1.32 -1.5 -0.66 -3 0 -15Z"/></svg>
  </div>`;

// the home page docks the stage's vector logo into the empty slot; the other pages show the mark there
const footer = (page) => `<footer class="curtain" id="contact" aria-labelledby="contact-title">
    <div class="curtain__grid">
      <div class="curtain__intro">
        <p class="eyebrow">Curtain call · Placeholder</p>
        <h2 id="contact-title" class="curtain__title">Placeholder heading</h2>
        <span class="rule" aria-hidden="true"></span>
        <p>Placeholder text for the footer. Contacts and event details come later.</p>
      </div>
      <div class="curtain__mark" aria-hidden="true">${page === 'home' ? '' : '<span class="curtain__emblem" data-tilt></span>'}</div>
    </div>
    <div class="curtain__base">
      <div class="curtain__legal">
        <p class="legal">© 2026 The Drama Collective · CHIREC International School</p>
        <p class="credits">Music: <a href="https://www.youtube.com/watch?v=HCV-2-IoIXs" rel="noopener">the smell of old books, reading, writing and studying (a dark academia playlist)</a>, by <a href="https://www.youtube.com/@DarkEnigmatic68" rel="noopener">Dark Enigmatic</a>, played from YouTube.</p>
      </div>
      <a class="endorsement" href="https://www.chirec.ac.in" rel="noopener">
        <img class="endorsement__logo" src="./assets/brand/chirec.webp" alt="CHIREC International School" width="475" height="140">
        <span>Placeholder line</span>
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

function team() {
  const { people } = JSON.parse(readFileSync(join(ROOT, 'content', 'team.json'), 'utf8'));
  const sizes = {}; // photo sizes, read from the WebP headers (VP8 / VP8L / VP8X)
  const size = (photo) => {
    if (sizes[photo]) return sizes[photo];
    const b = readFileSync(join(ROOT, 'assets', 'team', `${photo}.webp`));
    const kind = b.toString('ascii', 12, 16);
    let w, h;
    if (kind === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
    else if (kind === 'VP8L') { const v = b.readUInt32LE(21); w = (v & 0x3fff) + 1; h = ((v >> 14) & 0x3fff) + 1; }
    else { w = b.readUIntLE(24, 3) + 1; h = b.readUIntLE(27, 3) + 1; }
    return (sizes[photo] = { w, h });
  };
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

function fill(src, name, html, indent = '  ') {
  const re = new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`);
  if (!re.test(src)) return src;
  return src.replace(re, () => `<!-- site:${name} -->\n${indent}${html}\n${indent}<!-- /site:${name} -->`);
}

export function build() {
  for (const { file, key } of PAGES) {
    const path = join(ROOT, file);
    let src;
    try { src = readFileSync(path, 'utf8'); } catch { console.warn(`skip ${file}: not found`); continue; }
    const crlf = src.includes('\r\n');
    let out = src.replace(/\r\n/g, '\n');
    out = fill(out, 'head', head());
    out = fill(out, 'header', header(key));
    if (key !== 'home') out = fill(out, 'stage', stage());
    out = fill(out, 'footer', footer(key));
    if (key === 'team') out = fill(out, 'team', team(), '      ');
    if (crlf) out = out.replace(/\n/g, '\r\n');
    if (out !== src) { writeFileSync(path, out); console.log(`wrote ${file}`); }
    else console.log(`unchanged ${file}`);
  }
}

// run as a script (npm run pages); importing the page list (vite.config.js) writes nothing
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();

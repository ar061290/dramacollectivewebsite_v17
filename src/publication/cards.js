// The pieces' card and row, as strings of markup: the grid's card (a piece that is out: one link,
// the whole card, to its own page) and the list's row (a piece still to come). One template for
// every place they show: the publication's pieces section (src/publication/pieces.js) and the page
// of all the pieces (pieces.html, written by tools/pages/build.mjs at build time). So this file is
// plain string work, safe to import in Node: nothing here touches the DOM.
//
//   pieceCard(p, { level })  an <li class="pub-piece"> for a <ul class="pub-pieces__grid">;
//                            `level` is its title's heading level (3 by default: under the
//                            section's h2; 2 on a page whose h1 is the grid's own heading)
//   pieceRow(p, { next, remind })  an <li class="pub-row"> for a <ul class="pub-pieces__list">;
//                            `next` marks the first one (its dot lit); `remind` is where
//                            "Remind me" goes (the newsletter on the same page, #news, by default;
//                            a writer's page sends it to the publication's)
//
// Their looks are in src/styles/publication-pieces.css.
import { pieceHref } from './pieces-data.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The piece's brand colour, 1 to 5 (publication.css --pub-tone-1..5), whatever the data holds. */
export const toneOf = (p) => Math.min(5, Math.max(1, Math.round(p.tone) || 1));

/** "By ..." under a title; a piece announced before its writer is, says so. */
export const byline = (p) => (p.author ? `By ${p.author}` : 'Writer to be announced');

const chevron = '<svg class="pub-pieces__chev" viewBox="0 0 6 10" aria-hidden="true" focusable="false"><path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * A piece that is out, as a card (houseofheat's Latest News card): the mark at the top left, the
 * title set large and at a tilt in the card's colours where the picture was, then the writer and the
 * form, and the row of issue and "Read now". The whole card is the one link (no link inside a link).
 */
export function pieceCard(p, { level = 3 } = {}) {
  const h = `h${Math.min(6, Math.max(2, level | 0 || 3))}`;
  // the title's size goes by its length (short, medium, long), so every card's title fills its
  // picture alike
  const n = [...p.title].length;
  const len = n <= 20 ? 's' : n <= 32 ? 'm' : 'l';
  return `<li class="pub-piece" data-tone="${toneOf(p)}">
  <a class="pub-piece__link" href="${esc(pieceHref(p))}">
    <div class="pub-piece__media"><span class="pub-mark pub-piece__brand" aria-hidden="true"></span><${h} class="pub-piece__title" data-len="${len}">${esc(p.title)}</${h}></div>
    <div class="pub-piece__body">
      <div class="pub-piece__head">
        <p class="pub-piece__by">${esc(byline(p))}</p>
        <p class="pub-label pub-piece__form">${esc(p.form)}</p>
      </div>
      <div class="pub-piece__meta">
        <span class="pub-label pub-piece__issue">${esc(p.issue)}</span>
        <span class="pub-btn pub-piece__read"><span class="pub-piece__dot" aria-hidden="true"></span>Read now${chevron}</span>
      </div>
    </div>
  </a>
</li>`;
}

/**
 * A piece still to come, as a row (houseofheat's Upcoming Releases row, with Latest News's
 * picture): the issue, the mark on a tile in the piece's colour, the form above the title, the
 * writer, and "Remind me", which goes down to the newsletter on the same page (or, from a page
 * without it, to the publication's).
 */
export function pieceRow(p, { next = false, remind = '#news' } = {}) {
  // a special piece: twice the height, larger, and stars that come out round it when pointed at
  const sparks = p.special ? `<span class="pub-row__sparks" aria-hidden="true">${'<i></i>'.repeat(7)}</span>` : '';
  const lang = p.lang ? ` lang="${esc(p.lang)}"` : '';
  const form = p.special ? 'Special' : p.form;
  return `<li class="pub-row${next ? ' is-next' : ''}${p.special ? ' is-special' : ''}" data-tone="${toneOf(p)}">
  <span class="pub-row__when"><span class="pub-row__dot" aria-hidden="true"></span><span class="pub-label">${esc(p.issue)}</span></span>
  <span class="pub-row__tile" aria-hidden="true"><span class="pub-mark"></span></span>
  <div class="pub-row__text">${form ? `
    <span class="pub-label pub-row__form">${esc(form)}</span>` : ''}
    <h3 class="pub-row__title"${lang}>${esc(p.title)}</h3>
    <p class="pub-row__by${p.author ? '' : ' is-tba'}">${esc(byline(p))}</p>
  </div>
  <a class="pub-btn pub-row__remind" href="${esc(remind)}"${remind === '#news' ? ' data-to-news' : ''}>Remind me<span class="sr-only">: ${esc(p.title)}</span></a>${sparks}
</li>`;
}

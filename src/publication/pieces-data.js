// The publication's pieces: one list for the pieces section on publication.html (src/publication/
// pieces.js: the latest as the grid, the upcoming as the list beside the statue), the page of all
// the pieces (pieces.html), and each piece's own page (piece-<slug>.html, written from this list
// and the piece's text in content/pieces/<slug>.html by `npm run pages`, tools/pages/build.mjs).
// Plain data, read in the browser and by Node alike.
//
// Each piece:
//   slug    its address: piece-<slug>.html
//   title   as printed
//   author  as printed under the title ("By ..."); null where not yet known
//   form    its form ("Essay", "One-act play", ...); the filter lists every form found here
//   issue   the issue it is in, as printed ("Oct 2026")
//   status  'latest' (out now: it has its own page) or 'upcoming' (announced: no page yet)
//   order   its place in its issue (pages run in this order: "Next piece", "Previous piece")
//   quote   a line from it (not shown at present: the grid's cards show the title large instead)
//   tone    1 to 5, one of the brand's five colours (publication.css --pub-tone-1..5): the card's
//           colour in the grid, the logo mark's in the list; fixed per piece so it never changes
//   dek     (optional) a line under the title on the piece's page ("A short story performed as a soliloquy")
//   photo   (optional) a picture shown in the piece's page, under its title

export const PIECES = [
  // ---- latest: the October 2026 issue, in its order ----
  {
    slug: 'drama-the-art-of-feeling',
    title: 'Drama: The Art of Feeling',
    author: 'Aripra Sharma',
    form: 'Essay',
    issue: 'Oct 2026',
    status: 'latest',
    order: 1,
    quote: 'Perhaps the real hamartia is something we all share…the desire to find meaning.',
    tone: 1,
  },
  {
    slug: 'the-story-i-probably-told-myself-about-you',
    title: 'The Story I Probably Told Myself About You',
    author: 'Aadi Ramnani',
    form: 'Reflection',
    issue: 'Oct 2026',
    status: 'latest',
    order: 2,
    quote: '…understanding and agreement are completely different things.',
    tone: 3,
    photo: { src: 'assets/publication/stage-photo-october-2026.webp', alt: 'Two students in suits and hats on stage, mid-scene, in front of a painted street backdrop.' },
  },
  {
    slug: 'everything-changes',
    title: 'Everything Changes',
    author: 'Anika Megha Kruthiventi',
    form: 'One-act play',
    issue: 'Oct 2026',
    status: 'latest',
    order: 3,
    quote: 'Sometimes change is beautiful.',
    tone: 2,
  },
  {
    slug: 'stars',
    title: 'Stars.',
    author: 'Kathya Yaratapalli',
    form: 'Contemporary monologue',
    issue: 'Oct 2026',
    status: 'latest',
    order: 4,
    quote: 'Stars, no matter where you are, are the one thing that will remain constant.',
    tone: 5,
  },
  {
    slug: 'beauty-in-imperfection',
    title: 'Beauty in Imperfection',
    author: 'Mehek Jain',
    form: 'Contemporary monologue',
    issue: 'Oct 2026',
    status: 'latest',
    order: 5,
    quote: 'Beauty in imperfection, a paradox untold,',
    tone: 4,
  },
  {
    slug: 'i-was-there-first',
    title: 'I Was There First',
    author: 'Kathya Yaratapalli',
    form: 'Contemporary monologue',
    issue: 'Oct 2026',
    status: 'latest',
    order: 6,
    quote: 'soon no one will care who was there first.',
    tone: 1,
  },
  {
    slug: 'i-love-nostalgia',
    title: 'I Love Nostalgia',
    author: 'Nisha Sriram',
    form: 'Soliloquy',
    dek: 'A short story performed as a soliloquy',
    issue: 'Oct 2026',
    status: 'latest',
    order: 7,
    quote: 'Change crept up on me, and I was not prepared for it.',
    tone: 3,
  },

  // ---- upcoming: the November issue. PLACEHOLDER: replace with the real pieces when announced ----
  { slug: 'the-understudy', title: 'The understudy', author: null, form: 'Monologue', issue: 'Nov 2026', status: 'upcoming', order: 1, tone: 2 },
  { slug: 'blackout', title: 'Blackout', author: null, form: 'One-act play', issue: 'Nov 2026', status: 'upcoming', order: 2, tone: 3 },
  { slug: 'why-we-still-need-the-stage', title: 'Why we still need the stage', author: null, form: 'Essay', issue: 'Nov 2026', status: 'upcoming', order: 3, tone: 1 },
  { slug: 'house-lights', title: 'House lights', author: null, form: 'Poem', issue: 'Nov 2026', status: 'upcoming', order: 4, tone: 5 },
  { slug: 'the-inter-school-festival', title: 'The inter-school festival, reviewed', author: null, form: 'Review', issue: 'Nov 2026', status: 'upcoming', order: 5, tone: 4 },
  { slug: 'a-letter-to-the-audience', title: 'A letter to the audience', author: null, form: 'Monologue', issue: 'Nov 2026', status: 'upcoming', order: 6, tone: 3 },
  { slug: 'the-costume-trunk', title: 'The costume trunk', author: null, form: 'Reflection', issue: 'Nov 2026', status: 'upcoming', order: 7, tone: 5 },
  { slug: 'notes-from-the-wings', title: 'Notes from the wings', author: null, form: 'Essay', issue: 'Nov 2026', status: 'upcoming', order: 8, tone: 2 },
];

/** The pieces that are out, in reading order: by issue (oldest first), then their place in it. */
const ISSUE_ORDER = ['Oct 2026', 'Nov 2026', 'Dec 2026'];
export const PUBLISHED = PIECES.filter((p) => p.status === 'latest').sort(
  (a, b) => ISSUE_ORDER.indexOf(a.issue) - ISSUE_ORDER.indexOf(b.issue) || a.order - b.order,
);

/** A piece's own page (relative to the site's root, where every page lives). */
export const pieceHref = (p) => `./piece-${p.slug}.html`;

/** How many of the latest pieces the publication's grid shows; the rest are on pieces.html. */
export const LATEST_SHOWN = 6;

/** The first piece of the newest issue: where "Read the October issue" goes. */
export const FIRST_OF_ISSUE = (issue) => PUBLISHED.find((p) => p.issue === issue) ?? PUBLISHED[0];
